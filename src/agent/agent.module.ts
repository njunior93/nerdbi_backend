import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConnectionModule } from '../connection/connection.module';
import { SessionModule } from '../session/session.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [AuthModule, ConnectionModule, SessionModule],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}