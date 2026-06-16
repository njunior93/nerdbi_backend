import * as dns from 'dns';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

dns.setDefaultResultOrder('ipv4first');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
  origin:[
      process.env.FRONTEND_URL,
      'http://localhost:5173',
  ],
  methods:'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  allowedHeaders:['Content-Type', 'Authorization'],
  credentials:true,
  })

  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
