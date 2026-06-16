export class MessageResponseDto {
  id: string;
  role: string;
  content: string;
  sql: string | null;
  chartConfig: object | null;
  isRateLimited: boolean;
  createdAt: Date;
}
