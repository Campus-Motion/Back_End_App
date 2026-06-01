import { Type } from 'class-transformer';
import { IsInt, IsOptional, ValidateIf } from 'class-validator';

export class QueryLikesDto {
  @ValidateIf((o) => o.activity_id == null)
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  news_id?: number;

  @ValidateIf((o) => o.activity_id == null)
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  activity_id?: number;
}
