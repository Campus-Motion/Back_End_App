import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { QueryCommentsDto } from './dto/query-comments.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';

const Roles = (...roles: string[]) => SetMetadata('roles', roles);

@Controller('comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  findAll(@Query() query: QueryCommentsDto, @Req() req?: any) {
    return this.commentsService.findAll(query, req?.user?.id);
  }

  @Post()
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCommentDto, @Req() req: any) {
    return this.commentsService.create(dto, req.user.id);
  }

  @Put(':id')
  @UseGuards(JwtGuard)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCommentDto,
    @Req() req: any,
  ) {
    return this.commentsService.update(id, dto, req.user.id);
  }

  @Delete(':id')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.commentsService.remove(id, req.user);
  }
}
