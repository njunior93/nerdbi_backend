import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import Groq from 'groq-sdk';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'groq-sdk/resources/chat/completions';
import { DataSource } from 'typeorm';
import { ConnectionService } from '../connection/connection.service';
import { SessionService } from '../session/session.service';
import { ChatResponseDto } from './Dto/chat-response.dto';

const MODEL = 'llama-3.3-70b-versatile';

@Injectable()
export class AgentService implements OnModuleInit {
  private groq: Groq;
  private readonly MAX_ITERATIONS = 6;

  private readonly tools: ChatCompletionTool[] = [
    {
      type: 'function',
      function: {
        name: 'get_schema',
        description:
          'Lê tabelas e colunas do banco do usuário. Use no início da conversa ou quando precisar da estrutura.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'execute_query',
        description:
          'Executa uma query SQL SELECT no banco do usuário. Apenas SELECT é permitido. Inclua LIMIT para tabelas grandes.',
        parameters: {
          type: 'object',
          properties: {
            sql: { type: 'string', description: 'A query SQL SELECT a executar' },
          },
          required: ['sql'],
        },
      },
    },
  ];

  private readonly systemPrompt = `Você é um assistente de análise de dados em português brasileiro.
Você tem acesso ao banco PostgreSQL do usuário. Fluxo de trabalho:
1. SEMPRE use get_schema antes de gerar qualquer SQL, mesmo que você acredite já conhecer a estrutura do banco a partir de mensagens anteriores na conversa. A estrutura real do banco é a única fonte confiável de nomes de tabelas, colunas e tipos de dados.
2. Use execute_query para obter os dados (somente SELECT; inclua LIMIT para tabelas grandes)

REGRAS PARA GERAÇÃO DE SQL (muito importantes):
- Use SEMPRE e EXATAMENTE os nomes de tabelas e colunas retornados por get_schema, sem alterar capitalização, sem traduzir para snake_case e sem assumir convenções.
- Se um nome de coluna ou tabela contiver letras maiúsculas (camelCase, ex: nomeDaColuna), você DEVE envolvê-lo em aspas duplas no SQL, reproduzindo exatamente a grafia retornada por get_schema. Exemplo correto: SELECT * FROM tabela WHERE coluna < "nomeDaColuna". Exemplo incorreto: SELECT * FROM tabela WHERE coluna < nomeDaColuna (sem aspas). Exemplo incorreto: SELECT * FROM tabela WHERE coluna < nome_da_coluna (nome inventado, alterando a capitalização original).
- Nomes totalmente em minúsculas com underscore (ex: nome_da_coluna) NÃO precisam de aspas.
- Nunca invente, normalize ou "adivinhe" nomes de coluna. Sempre confira em get_schema antes de gerar o SQL.
- NUNCA decida se um nome precisa de aspas duplas baseado em suposições sobre padrões de nomenclatura (ex: "nomes terminados em Id geralmente são camelCase"). A única forma confiável é olhar o nome EXATO retornado por get_schema: se ele contiver qualquer letra maiúscula, use aspas duplas reproduzindo exatamente essa grafia; se estiver inteiramente em minúsculas, não use aspas. Colunas com função semelhante (ex: chaves estrangeiras) podem ter convenções de nomenclatura diferentes dentro do mesmo banco — verifique cada uma individualmente, nunca por analogia com outra.

REGRAS PARA VALORES DE FILTROS (muito importantes):
- Para colunas que armazenem categorias, status, tipos ou enums (qualquer coluna onde o valor representa um estado fixo, ex: status de pedido, tipo de movimento, tipo de produto), NUNCA assuma ou invente o valor literal usado em um filtro WHERE.
- Antes de usar esse valor em um filtro, execute uma query exploratória, como SELECT DISTINCT <coluna> FROM <tabela> LIMIT 20, para descobrir os valores reais armazenados no banco.
- Só monte o filtro final depois de confirmar o valor exato (incluindo grafia, ordem das palavras e separadores) através dessa consulta.
- Essa regra se aplica a qualquer banco de dados, independentemente dos nomes de tabelas, colunas ou dos valores específicos.

REGRAS PARA APRESENTAÇÃO DE RESULTADOS (muito importantes):
- Após execute_query retornar dados, você DEVE descrever esses dados em texto na sua resposta final. Nunca deixe o texto da resposta vazio.
- Se a query retornar uma lista de itens (ex: produtos, pedidos, fornecedores), liste-os de forma clara em texto (nomes, valores, quantidades), não apenas um título.
- Se a query não retornar nenhuma linha, informe explicitamente ao usuário que não há resultados para a pergunta feita (ex: "Não encontrei produtos com estoque abaixo do mínimo.").
- NUNCA sugira ferramentas externas, bibliotecas, softwares ou linguagens (ex: matplotlib, Python, Excel) para o usuário visualizar dados.
- O texto da resposta deve ser autossuficiente: o usuário deve entender o resultado completo lendo apenas o texto, mesmo sem olhar o SQL.

REGRAS PARA DATAS E HORÁRIOS (muito importantes):
- Ao reportar datas e horários ao usuário, use exatamente a data e hora que aparecem no valor retornado pela query, sem fazer conversões de fuso horário, arredondamentos ou ajustes manuais.
- Para um timestamp no formato ISO (ex: "2026-06-12T22:27:02.371Z"), a data é a parte antes do "T" (12/06/2026) e a hora é a parte logo após o "T" (22:27). Nunca some ou subtraia horas/dias ao interpretar esse valor.
- Essa regra se aplica a qualquer valor de data/hora retornado pelo banco, independentemente do nome da coluna ou da tabela.

Explique os resultados em linguagem simples. Nunca execute queries de modificação de dados.
Ao decidir utilizar qualquer ferramenta (como 'execute_query'), você NÃO deve incluir nenhuma explicação em texto, tags XML, ou marcações como '<function=...>' no corpo da mensagem. Gere estritamente a chamada de função estruturada nativa. Nunca combine texto explicativo com chamada de função na mesma resposta.`;

  constructor(
    private readonly connectionService: ConnectionService,
    private readonly sessionService: SessionService,
  ) {}

  onModuleInit() {
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  async chat(sessionId: string, userId: string, question: string): Promise<ChatResponseDto> {
    await this.sessionService.saveMessage(sessionId, { role: 'user', content: question });

    const history = await this.sessionService.getMessagesForAgent(userId, sessionId);
    const connectionString = await this.connectionService.getDecryptedConnectionString(userId);

    // history.slice(0, -1) exclui a mensagem atual (já salva acima) para não duplicar
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: this.systemPrompt },
      ...history.slice(0, -1).map(
        (m): ChatCompletionMessageParam => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }),
      ),
      { role: 'user', content: question },
    ];

    let finalText = '';
    let capturedSql: string | undefined;

    for (let i = 0; i < this.MAX_ITERATIONS; i++) {
      let completion: Awaited<ReturnType<typeof this.groq.chat.completions.create>>;
      try {
        completion = await this.groq.chat.completions.create({
          model: MODEL,
          messages,
          tools: this.tools,
          tool_choice: 'auto',
          temperature: 0,
        });
      } catch (err) {
        console.error('[AgentService] Erro na chamada principal à Groq:', err);
        // Primeira tentativa falhou — retry imediato único
        try {
          completion = await this.groq.chat.completions.create({
            model: MODEL,
            messages,
            tools: this.tools,
            tool_choice: 'auto',
            temperature: 0,
          });
        } catch (err) {
          console.error('[AgentService] Erro no retry à Groq:', err);
          finalText =
            'Não consegui processar essa solicitação. Tente reformular a pergunta de outra forma.';
          break;
        }
      }

      const choice = completion.choices[0];
      const assistantMessage = choice.message;

      if (choice.finish_reason === 'stop' || !assistantMessage.tool_calls?.length) {
        finalText = assistantMessage.content ?? '';
        break;
      }

      // Injeta a mensagem do assistente (com tool_calls) no histórico em memória
      messages.push({
        role: 'assistant',
        content: assistantMessage.content ?? null,
        tool_calls: assistantMessage.tool_calls,
      });

      // Processa cada tool call e injeta a resposta no histórico
      for (const toolCall of assistantMessage.tool_calls) {
        let output: string;
        try {
          const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;

          if (toolCall.function.name === 'get_schema') {
            output = await this.getSchema(connectionString);
          } else if (toolCall.function.name === 'execute_query') {
            const sql = args['sql'] as string;
            capturedSql = sql;
            output = await this.executeQuery(connectionString, sql);
          } else {
            output = JSON.stringify({ error: 'Tool desconhecida' });
          }
        } catch (err) {
          // Erro injetado de volta para a IA tentar corrigir na próxima iteração
          output = JSON.stringify({
            error: err instanceof Error ? err.message : 'Erro ao executar tool',
          });
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: output,
        });
      }
    }

    if (!finalText) {
      finalText = 'Não foi possível gerar uma resposta. Tente novamente.';
    }

    const saved = await this.sessionService.saveMessage(sessionId, {
      role: 'assistant',
      content: finalText,
      sql: capturedSql,
    });

    return this.sessionService.toMessageResponse(saved);
  }

  private async getSchema(connectionString: string): Promise<string> {
    const ds = new DataSource({
      type: 'postgres',
      url: connectionString,
      ssl: { rejectUnauthorized: false },
      extra: { family: 4, connectionTimeoutMillis: 5000 },
    });
    try {
      await ds.initialize();
      const rows: { table_name: string; column_name: string; data_type: string }[] =
        await ds.query(`
          SELECT table_name, column_name, data_type
          FROM information_schema.columns
          WHERE table_schema = 'public'
          ORDER BY table_name, ordinal_position
        `);

      const grouped = new Map<string, string[]>();
      for (const { table_name, column_name, data_type } of rows) {
        if (!grouped.has(table_name)) grouped.set(table_name, []);
        grouped.get(table_name)!.push(`${column_name}:${data_type}`);
      }
      return [...grouped.entries()]
        .map(([table, cols]) => `${table}(${cols.join(', ')})`)
        .join('\n');
    } catch (err) {
      console.error('[AgentService] Erro em getSchema:', err);
      throw err;
    } finally {
      if (ds.isInitialized) await ds.destroy();
    }
  }

  private async executeQuery(connectionString: string, sql: string): Promise<string> {
    const forbidden = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|EXEC)\b/i;
    if (forbidden.test(sql) || !/^\s*SELECT/i.test(sql)) {
      throw new BadRequestException('Apenas queries SELECT são permitidas.');
    }

    const ds = new DataSource({
      type: 'postgres',
      url: connectionString,
      ssl: { rejectUnauthorized: false },
      extra: { family: 4, connectionTimeoutMillis: 5000 },
    });
    try {
      await ds.initialize();
      const clean = sql.trim().replace(/;+$/, '');
      const rows = await ds.query(`SELECT * FROM (\n${clean}\n) AS _q LIMIT 500`);
      return JSON.stringify(rows);
    } catch (err) {
      console.error('[AgentService] Erro em executeQuery:', err);
      throw err;
    } finally {
      if (ds.isInitialized) await ds.destroy();
    }
  }
}
