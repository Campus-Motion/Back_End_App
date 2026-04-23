import { IsISO8601, IsInt, IsOptional, IsPositive, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class QueryAuditDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @IsPositive()
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsISO8601()
  after?: string;

  @IsOptional()
  @IsISO8601()
  before?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @IsPositive()
  user_id?: number;
}