import { Type } from 'class-transformer';
import {
  IsDateString,
  IsDecimal,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateHealthDto {
  // Non-sensitive fields — stored as plain values
  @IsDateString()
  @IsOptional()
  born?: string;

  @IsDecimal()
  @IsOptional()
  weight_kg?: number;

  @IsDecimal()
  @IsOptional()
  height_cm?: number;

  @IsInt()
  @IsOptional()
  heart_rate_bpm?: number;

  // E2EE fields — always arrive as Base64 ciphertext
  @IsString()
  @IsOptional()
  sensitive_data?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  client_key_version?: number;

  @IsDateString()
  @IsOptional()
  retain_until?: string;
}
