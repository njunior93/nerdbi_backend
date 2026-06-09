import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as NestConfig from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { User } from './Entity/user.entity';
import { LoginAuthDto } from './Dto/login-auth.dto';
import { RegisterAuthDto } from './Dto/register-auth.dto';
import { AuthResponseDto } from './Dto/auth-response.dto';
import jwtConfig from './Config/jwt.config';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: NestConfig.ConfigType<typeof jwtConfig>,
    private readonly jwtService: JwtService,
  ) {}

  async register(registerAuthDto: RegisterAuthDto): Promise<AuthResponseDto> {
    const existing = await this.userRepository.findOneBy({
      email: registerAuthDto.email,
    });

    if (existing) {
      throw new ConflictException('E-mail já está em uso');
    }

    const hashedPassword = await bcrypt.hash(registerAuthDto.password, 10);

    const user = this.userRepository.create({
      email: registerAuthDto.email,
      password: hashedPassword,
    });

    await this.userRepository.save(user);

    return this.generateToken(user);
  }

  async login(loginAuthDto: LoginAuthDto): Promise<AuthResponseDto> {
    const user = await this.userRepository.findOneBy({
      email: loginAuthDto.email,
    });

    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const isPasswordValid = await bcrypt.compare(
      loginAuthDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    return this.generateToken(user);
  }

  private async generateToken(user: User): Promise<AuthResponseDto> {
    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email },
      {
        secret: this.jwtConfiguration.secret,
        expiresIn: this.jwtConfiguration.jwtTtl,
        audience: this.jwtConfiguration.audience,
        issuer: this.jwtConfiguration.issuer,
      },
    );

    return { accessToken };
  }
}
