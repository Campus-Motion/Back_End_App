import { Module } from '@nestjs/common';
import { LocationController } from './location.controller';
import { LocationService } from './location.service';

@Module({
  controllers: [LocationController],
  providers: [LocationService],
  // DatabaseModule is @Global() so API_DB is already available everywhere
})
export class LocationModule {}
