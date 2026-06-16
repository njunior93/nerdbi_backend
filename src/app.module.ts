import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { ConnectionModule } from './connection/connection.module';
import { SessionModule } from './session/session.module';
import { AgentModule } from './agent/agent.module';
import { ConfigModule } from '@nestjs/config';
import jwtConfig from './auth/Config/jwt.config';
import encryptionConfig from './connection/Config/encryption.config';
import { UserThrottlerGuard } from './common/Guard/user-throttler.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [jwtConfig, encryptionConfig],
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
      },
      extra: {
        family: 4,
      },
      autoLoadEntities: true,
      synchronize: false,
    }),
    AuthModule,
    ConnectionModule,
    SessionModule,
    AgentModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: UserThrottlerGuard }],
})
export class AppModule {}
