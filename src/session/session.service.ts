import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session } from './Entity/session.entity';
import { Message } from './Entity/message.entity';
import { CreateSessionDto } from './Dto/create-session.dto';
import { SessionResponseDto } from './Dto/session-response.dto';
import { SessionWithMessagesResponseDto } from './Dto/session-with-messages-response.dto';
import { MessageResponseDto } from './Dto/message-response.dto';

@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
  ) {}

  async create(
    userId: string,
    dto: CreateSessionDto,
  ): Promise<SessionResponseDto> {
    const session = this.sessionRepository.create({
      title: dto.title,
      user: { id: userId },
    });
    const saved = await this.sessionRepository.save(session);
    return this.toSessionResponse(saved);
  }

  async findAll(userId: string): Promise<SessionResponseDto[]> {
    const sessions = await this.sessionRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
    return sessions.map((s) => this.toSessionResponse(s));
  }

  async findOneWithMessages(
    userId: string,
    sessionId: string,
  ): Promise<SessionWithMessagesResponseDto> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
      relations: { user: true, messages: true },
      order: { messages: { createdAt: 'ASC' } },
    });

    if (!session) {
      throw new NotFoundException('Sessão não encontrada');
    }

    if (session.user.id !== userId) {
      throw new ForbiddenException('Acesso negado');
    }

    return {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      messages: session.messages.map((m) => this.toMessageResponse(m)),
    };
  }

  async saveMessage(
    sessionId: string,
    data: {
      role: string;
      content: string;
      sql?: string;
      chartConfig?: object;
      isRateLimited?: boolean;
    },
  ): Promise<Message> {
    const message = new Message();
    message.session = { id: sessionId } as Session;
    message.role = data.role;
    message.content = data.content;
    if (data.sql !== undefined) message.sql = data.sql;
    if (data.chartConfig !== undefined) message.chartConfig = data.chartConfig;
    if (data.isRateLimited !== undefined) message.isRateLimited = data.isRateLimited;
    return (await this.messageRepository.save(message)) as Message;
  }

  async getMessagesForAgent(
    userId: string,
    sessionId: string,
  ): Promise<Message[]> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
      relations: { user: true, messages: true },
      order: { messages: { createdAt: 'ASC' } },
    });

    if (!session) {
      throw new NotFoundException('Sessão não encontrada');
    }

    if (session.user.id !== userId) {
      throw new ForbiddenException('Acesso negado');
    }

    return session.messages;
  }

  toMessageResponse(message: Message): MessageResponseDto {
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      sql: message.sql ?? null,
      chartConfig: message.chartConfig ?? null,
      isRateLimited: message.isRateLimited ?? false,
      createdAt: message.createdAt,
    };
  }

  private toSessionResponse(session: Session): SessionResponseDto {
    return {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
    };
  }

}
