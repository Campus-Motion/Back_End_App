import { IsInt, IsString, Length, Max, Min } from 'class-validator';

export class UpdateXpDto {
  // signed delta, bounded so a stolen moderator token can't do huge damage
  @IsInt()
  @Min(-500)
  @Max(500)
  delta!: number;

  // mandatory justification, stored in the audit log
  @IsString()
  @Length(3, 200)
  reason!: string;
}
