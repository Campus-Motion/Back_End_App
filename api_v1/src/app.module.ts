import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { ActivitiesModule } from './activities/activities.module'; // ← correct path
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    ActivitiesModule,
    ConfigModule.forRoot({ isGlobal: true }),
  ],
})
export class AppModule {}
