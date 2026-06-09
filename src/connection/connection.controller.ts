import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ConnectionService } from './connection.service';
import { SaveConnectionDto } from './Dto/save-connection.dto';
import { TestConnectionDto } from './Dto/test-connection.dto';
import { ConnectionStatusDto } from './Dto/connection-status.dto';
import { TestConnectionResponseDto } from './Dto/test-connection-response.dto';
import { JwtAuthGuard } from '../auth/Guard/jwt-auth.guard';
import { CurrentUser } from '../auth/Decorator/current-user.decorator';
import { ActiveUserData } from '../auth/Interface/active-user-data.interface';

@UseGuards(JwtAuthGuard)
@Controller('connection')
export class ConnectionController {
  constructor(private readonly connectionService: ConnectionService) {}

  @Put()
  save(
    @CurrentUser() user: ActiveUserData,
    @Body() dto: SaveConnectionDto,
  ): Promise<ConnectionStatusDto> {
    return this.connectionService.save(user.sub, dto);
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  test(@Body() dto: TestConnectionDto): Promise<TestConnectionResponseDto> {
    return this.connectionService.test(dto);
  }

  @Get('status')
  getStatus(@CurrentUser() user: ActiveUserData): Promise<ConnectionStatusDto> {
    return this.connectionService.getStatus(user.sub);
  }
}
