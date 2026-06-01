import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { LikesService } from './likes.service';
import { CreateLikeDto } from './dto/create-like.dto';
import { DeleteLikeDto } from './dto/delete-like.dto';
import { QueryLikesDto } from './dto/query-likes.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { JwtOptionalGuard } from '../auth/jwt-optional.guard';

@Controller('likes')
export class LikesController {
  constructor(private readonly likesService: LikesService) {}

  @Get()
  @UseGuards(JwtOptionalGuard)
  getCount(@Query() query: QueryLikesDto, @Req() req?: any) {
    return this.likesService.getCount(query, req?.user?.id);
  }

  @Post()
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateLikeDto, @Req() req: any) {
    return this.likesService.create(dto, req.user);
  }

  @Delete()
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  remove(@Body() dto: DeleteLikeDto, @Req() req: any) {
    return this.likesService.remove(dto, req.user);
  }
}
