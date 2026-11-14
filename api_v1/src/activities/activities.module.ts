// activities/activities.module.ts
import { Module } from '@nestjs/common';
import { ActivitiesController } from './activities.controller';
import { FitImportsService } from './fit-imports.service';
import { HeatmapsService } from './heatmaps.service';
import { ActivitiesService } from './activities.service';

@Module({
  controllers: [ActivitiesController],
  providers: [ActivitiesService, HeatmapsService, FitImportsService],
})
export class ActivitiesModule {}
