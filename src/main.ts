import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
  origin: [
      process.env.JWT_TOKEN_ISSUER,
      process.env.JWT_TOKEN_AUDIENCE
  ],
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE, OPTIONS',
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  })

  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
