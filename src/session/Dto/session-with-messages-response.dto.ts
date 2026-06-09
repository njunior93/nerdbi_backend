import { MessageResponseDto } from './message-response.dto';

export class SessionWithMessagesResponseDto {
  id: string;
  title: string;
  createdAt: Date;
  messages: MessageResponseDto[];
}
