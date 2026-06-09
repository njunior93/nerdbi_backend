import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import type { Tool, Content, Part } from '@google/generative-ai';
import { DataSource } from 'typeorm';
import { ConnectionService } from '../connection/connection.service';
import { SessionService } from '../session/session.service';
import { ChatResponseDto } from './Dto/chat-response.dto';

@Injectable()
export class AgentService implements OnModuleInit {
  private genAI: GoogleGenerativeAI;

  private readonly tools: Tool[] = [
    {
      functionDeclarations: [
        {
          name: 'get_schema',
          description:
            'Lê tabelas e colunas do banco do usuário. Use no início da conversa ou quando precisar da estrutura.',
          parameters: {
            type: SchemaType.OBJECT,
            properties: {},
          },
        },
        {
          name: 'execute_query',
          description:
            'Executa uma query SQL SELECT no banco do usuário. Apenas SELECT é permitido. Inclua LIMIT para tabelas grandes.',
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              sql: {
                type: SchemaType.STRING,
                description: 'A query SQL SELECT a executar',
              },
            },
            required: ['sql'],
          },
        },
        {
          name: 'generate_chart',
          description:
            'Registra a configuração do gráfico para visualizar os dados. Chame após execute_query quando a resposta puder ser visualizada graficamente.',
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              chartType: {
                type: SchemaType.STRING,
                description: 'Tipo do gráfico: bar, line ou pie',
              },
              title: {
                type: SchemaType.STRING,
                description: 'Título do gráfico',
              },
              xKey: {
                type: SchemaType.STRING,
                description: 'Campo para o eixo X',
              },
              yKey: {
                type: SchemaType.STRING,
                description: 'Campo numérico para o eixo Y',
              },
              data: {
                type: SchemaType.ARRAY,
                items: { type: SchemaType.OBJECT, properties: {} },
                description: 'Dados do gráfico',
              },
            },
            required: ['chartType', 'title', 'xKey', 'yKey', 'data'],
          },
        },
      ],
    },
  ];

  private readonly systemPrompt = `Você é um assistente de análise de dados em português brasileiro.
Você tem acesso ao banco PostgreSQL do usuário. Fluxo de trabalho:
1. Use get_schema para entender a estrutura do banco (no início ou quando necessário)
2. Use execute_query para obter os dados (somente SELECT; inclua LIMIT para tabelas grandes)
3. Use generate_chart quando os dados puderem ser visualizados graficamente
Explique os resultados em linguagem simples. Nunca execute queries de modificação de dados.`;

  constructor(
    private readonly connectionService: ConnectionService,
    private readonly sessionService: SessionService,
  ) {}

  onModuleInit() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  }

  async chat(sessionId: string, userId: string, question: string): Promise<ChatResponseDto> {
    await this.sessionService.saveMessage(sessionId, { role: 'user', content: question });

    const history = await this.sessionService.getMessagesForAgent(userId, sessionId);
    const connectionString = await this.connectionService.getDecryptedConnectionString(userId);

    const geminiHistory: Content[] = history.slice(0, -1).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const model = this.genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: this.systemPrompt,
      tools: this.tools,
    });

    const chat = model.startChat({ history: geminiHistory });

    let finalText = '';
    let capturedSql: string | undefined;
    let capturedChartConfig: object | undefined;

    let result = await chat.sendMessage(question);

    const MAX_ITERATIONS = 5;
    let iterations = 0;

    while (iterations < MAX_ITERATIONS) {
      iterations++;
      const response = result.response;
      const candidate = response.candidates?.[0];


      const finishReason = candidate?.finishReason;
      const functionCalls = response.functionCalls?.() ?? [];

      if (functionCalls.length === 0) {
        try {
          finalText = response.text();
        } catch {
          finalText = candidate?.content?.parts?.map((p) => ('text' in p ? p.text : '')).join('') ?? '';
        }
        break;
      }

      if (finishReason === 'STOP' && functionCalls.length === 0) break;

      const functionResponseParts: Part[] = [];

      for (const fc of functionCalls) {
        let output: string;
        try {
          if (fc.name === 'get_schema') {
            output = await this.getSchema(connectionString);
          } else if (fc.name === 'execute_query') {
            const input = fc.args as { sql: string };
            capturedSql = input.sql;
            output = await this.executeQuery(connectionString, input.sql);
          } else if (fc.name === 'generate_chart') {
            capturedChartConfig = fc.args as object;
            output = JSON.stringify({ success: true });
          } else {
            output = JSON.stringify({ error: 'Tool desconhecida' });
          }
        } catch (err) {
          output = JSON.stringify({ error: err instanceof Error ? err.message : 'Erro ao executar tool' });
        }

        let responseObj: object;
        try {
          responseObj = JSON.parse(output) as object;
        } catch {
          responseObj = { result: output };
        }

        functionResponseParts.push({
          functionResponse: { name: fc.name, response: responseObj },
        } as Part);
      }

      result = await chat.sendMessage(functionResponseParts);
    }

    if (!finalText) {
      finalText = 'Não foi possível gerar uma resposta. Tente novamente.';
    }

    const saved = await this.sessionService.saveMessage(sessionId, {
      role: 'assistant',
      content: finalText,
      sql: capturedSql,
      chartConfig: capturedChartConfig,
    });

    return this.sessionService.toMessageResponse(saved);
  }

    private async getSchema(connectionString: string): Promise<string> {
      const ds = new DataSource({
        type: 'postgres',
        url: connectionString,
        ssl: { rejectUnauthorized: false },
        connectTimeoutMS: 5000,
      });
      try {
        await ds.initialize();
        const rows = await ds.query(`
          SELECT table_name, column_name, data_type
          FROM information_schema.columns
          WHERE table_schema = 'public'
          ORDER BY table_name, column_name
        `);
        return JSON.stringify(rows);
      } finally {
        if (ds.isInitialized) await ds.destroy();
      }
    }

    private async executeQuery(
      connectionString: string,
      sql: string,
    ): Promise<string> {
      const forbidden =
        /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|EXEC)\b/i;
      if (forbidden.test(sql) || !/^\s*SELECT/i.test(sql)) {
        throw new BadRequestException('Apenas queries SELECT são permitidas.');
      }

      const ds = new DataSource({
        type: 'postgres',
        url: connectionString,
        ssl: { rejectUnauthorized: false },
        connectTimeoutMS: 5000,
      });
      try {
        await ds.initialize();
        const clean = sql.trim().replace(/;+$/, '');
        const rows = await ds.query(
          `SELECT * FROM (\n${clean}\n) AS _q LIMIT 500`,
        );
        return JSON.stringify(rows);
      } finally {
        if (ds.isInitialized) await ds.destroy();
      }
    }
}
