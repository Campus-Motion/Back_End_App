import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class WaypointItemDto {
  // Option A — provide an existing location_id
  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;

  @IsOptional()
  @IsNumber()
  altitude_m?: number;

  @IsDateString()
  recorded_at!: string;

  @IsInt()
  @Min(1)
  sequence_order!: number;
}
export class CreateWaypointsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WaypointItemDto)
  waypoints!: WaypointItemDto[];
}
