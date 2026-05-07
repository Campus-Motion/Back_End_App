import {
  IsString,
  IsOptional,
  IsDateString,
  IsNumber,
  IsInt,
  Min,
  MaxLength,
  IsEnum,
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
  @IsEnum([
    'run',
    'walk',
    'bike',
    'hike',
    'swim',
    'triathlon',
    'fitness_trail',
    'climbing',
    'volleyball',
    'basketball',
    'soccer',
    'badminton',
    'tennis',
    'golf',
    'other',
  ])
  type?: string;

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
  @IsDateString()
  strava_url?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  start_location_id?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  end_location_id?: number;
}
