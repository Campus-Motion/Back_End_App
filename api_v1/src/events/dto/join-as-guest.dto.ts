import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class JoinAsGuestDto {
  @Transform(({ value }) => value?.trim())
  @IsString()
  @MaxLength(64)
  // Reject HTML tags and control characters
  @Matches(/^[^\x00-\x1F\x7F<>"'`]*$/, {
    message: 'display_name contains invalid characters',
  })
  display_name!: string;

  @Transform(({ value }) => value?.trim())
  @IsOptional()
  @IsString()
  @MaxLength(64)
  // Telegram usernames: letters, digits, underscores and @ only
  @Matches(/^[a-zA-Z0-9_@]{1,64}$/, {
    message: 'telegram must be a valid username',
  })
  telegram?: string;
}
