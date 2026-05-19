import { IsString, IsNumber, IsOptional, Min, Max } from 'class-validator';

export class CreateLocationDto {
  @IsString()
  label!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;
}
