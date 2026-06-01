import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @IsNotEmpty()
  body!: string;

  @ValidateIf((o) => o.activity_id == null)
  @IsInt()
  @IsOptional()
  news_id?: number;

  @ValidateIf((o) => o.news_id == null)
  @IsInt()
  @IsOptional()
  activity_id?: number;
}
