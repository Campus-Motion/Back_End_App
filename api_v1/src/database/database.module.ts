import postgres from 'postgres';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Global()
@Module({
  providers: [
    {
      provide: 'API_DB',
      useFactory: (config: ConfigService) =>
        postgres(config.getOrThrow<string>('API_DB_URL')),
      inject: [ConfigService], // ← NestJS injects this before calling the factory
    },
    {
      provide: 'AUTH_DB',
      useFactory: (config: ConfigService) =>
        postgres(config.getOrThrow<string>('AUTH_DB_URL')),
      inject: [ConfigService],
    },
  ],
  exports: ['API_DB', 'AUTH_DB'],
})
export class DatabaseModule {}
