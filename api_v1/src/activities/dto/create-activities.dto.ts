import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ACTIVITY_TYPES } from '../../common/activity-types';
import type { ActivityType } from '../../common/activity-types';

export class CreateActivityDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsEnum(ACTIVITY_TYPES)
  type!: ActivityType;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsBoolean()
  is_public?: boolean;

  @IsOptional()
  @IsNumber()
  event_id?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  duration?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  distance_km?: number;
}
