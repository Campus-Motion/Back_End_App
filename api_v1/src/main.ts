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

  // CORS_ORIGINS: comma-separated sites allowed to call the API, set per
  // environment. Without it, the list below is used.
  const corsOrigins = process.env.CORS_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'https://feed.campusmotion.ch',
    'https://admin.campusmotion.ch',
    'https://api.campusmotion.ch',
  ];

  app.use(
    cors({
      origin: corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
