import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { ActivitiesModule } from './activities/activities.module'; // ← correct path
import { ConfigModule } from '@nestjs/config';
import { EventsModule } from './events/events.module';
import { NewsModule } from './news/news.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    UsersModule,
    EventsModule,
    NewsModule,
    ActivitiesModule,
    ConfigModule.forRoot({ isGlobal: true }),
  ],
})
export class AppModule {}
