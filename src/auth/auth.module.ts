import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User } from './Entity/user.entity';
import { JwtModule } from '@nestjs/jwt';
import jwtConfig from './Config/jwt.config';
import { ConfigModule } from '@nestjs/config';
import { JwtAuthGuard } from './Guard/jwt-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.registerAsync(jwtConfig.asProvider()),
    ConfigModule.forFeature(jwtConfig),
  ],
  exports: [AuthService, JwtAuthGuard, JwtModule],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
