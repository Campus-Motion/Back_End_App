import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strips fields NOT in the DTO (mass assignment protection)
      forbidNonWhitelisted: false, // or true to throw on extra fields
      transform: true, // auto-converts query params to their declared types (e.g. "20" → 20)
    }),
  );

  await app.listen(3000);
}

bootstrap();
