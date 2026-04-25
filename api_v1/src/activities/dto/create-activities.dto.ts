import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateActivityDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

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
  type!: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsBoolean()
  is_public?: boolean;

  @IsOptional()
  @IsNumber()
  event_id?: number;
}
