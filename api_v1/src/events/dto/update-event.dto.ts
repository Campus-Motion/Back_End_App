import {
  IsString,
  IsOptional,
  IsDateString,
  IsNumber,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsDateString()
  start_time?: string;

  @IsOptional()
  @IsDateString()
  end_time?: string;

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
}
