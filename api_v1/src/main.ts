import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import cors from 'cors';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const uploadsRoot = join(__dirname, '..', 'uploads');
  const newsUploadsDir = join(uploadsRoot, 'news');
  const profileUploadsDir = join(uploadsRoot, 'profiles');
  const activityUploadsDir = join(uploadsRoot, 'activities');
  mkdirSync(newsUploadsDir, { recursive: true });
  mkdirSync(profileUploadsDir, { recursive: true });
  mkdirSync(activityUploadsDir, { recursive: true });

  app.useStaticAssets(uploadsRoot, {
    prefix: '/uploads/',
  });
  app.set('trust proxy', 1); // trust first proxy hop

  app.use(
    cors({
      origin: ['http://localhost:5173', 'https://api.campusmotion.ch'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
