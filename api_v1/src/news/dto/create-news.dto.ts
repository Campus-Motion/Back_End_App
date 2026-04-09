import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateNewsDto {
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  photo_url?: string;

  @IsOptional()
  @IsBoolean()
  is_published?: boolean;
}
