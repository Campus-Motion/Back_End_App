import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';

export class QueryCommentsDto {
  @ValidateIf((o) => o.activity_id == null)
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  news_id?: number;

  @ValidateIf((o) => o.news_id == null)
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  activity_id?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
