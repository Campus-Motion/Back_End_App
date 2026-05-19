import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { ActivitiesModule } from './activities/activities.module'; // ← correct path
import { ConfigModule } from '@nestjs/config';
import { EventsModule } from './events/events.module';
import { NewsModule } from './news/news.module';
import { UsersModule } from './users/users.module';
import { AdminModule } from './admin/admin.module';
import { APP_FILTER } from '@nestjs/core';
import { ForbiddenExceptionFilter } from './common/filters/forbidden_exception.filter';
import { LocationModule } from './location/location.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    UsersModule,
    EventsModule,
    NewsModule,
    LocationModule,
    ActivitiesModule,
    AdminModule,
    ConfigModule.forRoot({ isGlobal: true }),
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ForbiddenExceptionFilter,
    },
  ],
})
export class AppModule {}
