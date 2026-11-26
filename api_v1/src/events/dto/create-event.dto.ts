import {
  IsString,
  IsOptional,
  IsDateString,
  IsNumber,
  IsInt,
  Min,
  MaxLength,
  IsEnum,
  IsUrl,
} from 'class-validator';
import { ACTIVITY_TYPES } from '../../common/activity-types';
import type { ActivityType } from '../../common/activity-types';

export class CreateEventDto {
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsEnum(ACTIVITY_TYPES)
  type!: ActivityType;

  @IsOptional()
  @IsString()
  body?: string;

  @IsDateString()
  start_time!: string;

  @IsOptional()
  @IsDateString()
  end_time?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @IsUrl()
  strava_url?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  distance_m?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  start_location_id?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  end_location_id?: number;

  @IsOptional()
  @IsEnum(['social', 'workout', 'competition', 'casual', 'adventure'])
  event_format?: string;
}
