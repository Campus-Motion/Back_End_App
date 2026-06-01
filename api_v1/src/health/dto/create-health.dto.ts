import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateHealthDto {
  @IsDateString()
  born!: string; // YYYY-MM-DD

  @IsString()
  @IsNotEmpty()
  sensitive_data!: string; // Base64 E2EE ciphertext — server never decrypts

  @IsInt()
  @Min(1)
  client_key_version!: number;

  @IsDateString()
  consent_given_at!: string;

  @IsDateString()
  @IsOptional()
  retain_until?: string;
}
