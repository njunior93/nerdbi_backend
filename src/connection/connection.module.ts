import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ConnectionController } from './connection.controller';
import { ConnectionService } from './connection.service';
import { User } from '../auth/Entity/user.entity';
import { AuthModule } from '../auth/auth.module';
import encryptionConfig from './Config/encryption.config';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    ConfigModule.forFeature(encryptionConfig),
    AuthModule,
  ],
  controllers: [ConnectionController],
  providers: [ConnectionService],
  exports: [ConnectionService],
})
export class ConnectionModule {}
