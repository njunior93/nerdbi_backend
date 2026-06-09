import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/Guard/jwt-auth.guard';
import { CurrentUser } from '../auth/Decorator/current-user.decorator';
import { ActiveUserData } from '../auth/Interface/active-user-data.interface';
import { AgentService } from './agent.service';
import { ChatRequestDto } from './Dto/chat-request.dto';
import { ChatResponseDto } from './Dto/chat-response.dto';

@Controller('session')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post(':id/chat')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async chat(
    @Param('id') sessionId: string,
    @CurrentUser() user: ActiveUserData,
    @Body() dto: ChatRequestDto,
  ): Promise<ChatResponseDto> {
    return this.agentService.chat(sessionId, user.sub, dto.question);
  }
}