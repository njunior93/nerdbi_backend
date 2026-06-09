import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SessionService } from './session.service';
import { CreateSessionDto } from './Dto/create-session.dto';
import { SessionResponseDto } from './Dto/session-response.dto';
import { SessionWithMessagesResponseDto } from './Dto/session-with-messages-response.dto';
import { JwtAuthGuard } from '../auth/Guard/jwt-auth.guard';
import { CurrentUser } from '../auth/Decorator/current-user.decorator';
import { ActiveUserData } from '../auth/Interface/active-user-data.interface';

@UseGuards(JwtAuthGuard)
@Controller('session')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post()
  create(
    @CurrentUser() user: ActiveUserData,
    @Body() dto: CreateSessionDto,
  ): Promise<SessionResponseDto> {
    return this.sessionService.create(user.sub, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: ActiveUserData,
  ): Promise<SessionResponseDto[]> {
    return this.sessionService.findAll(user.sub);
  }

  @Get(':id/messages')
  findOneWithMessages(
    @CurrentUser() user: ActiveUserData,
    @Param('id') sessionId: string,
  ): Promise<SessionWithMessagesResponseDto> {
    return this.sessionService.findOneWithMessages(user.sub, sessionId);
  }
}
