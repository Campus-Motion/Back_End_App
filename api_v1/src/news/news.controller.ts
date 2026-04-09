import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { NewsService } from './news.service';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { QueryNewsDto } from './dto/query-news.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { join } from 'path';

const Roles = (...roles: string[]) => SetMetadata('roles', roles);

const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

const uploadsRoot = join(__dirname, '..', '..', 'uploads');

@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  findAll(@Query() query: QueryNewsDto) {
    return this.newsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.newsService.findOne(id);
  }

  @Post()
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('admin', 'moderator')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateNewsDto, @Req() req: any) {
    return this.newsService.create(dto, req.user);
  }

  @Put(':id')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('admin', 'moderator')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNewsDto,
    @Req() req: any,
  ) {
    return this.newsService.update(id, dto, req.user);
  }

  @Post(':id/photo')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('admin', 'moderator')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: diskStorage({
        destination: join(uploadsRoot, 'news'),
        filename: (_req, file, cb) => {
          const extension = extname(file.originalname).toLowerCase();
          cb(null, `${randomUUID()}${extension}`);
        },
      }),
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
      fileFilter: (_req, file, cb) => {
        if (!allowedMimeTypes.includes(file.mimetype)) {
          return cb(
            new BadRequestException(
              'Only JPEG, PNG, and WebP files are allowed',
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadPhoto(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('photo file is required');
    }

    const photoUrl = `/uploads/news/${file.filename}`;
    return this.newsService.updatePhoto(id, photoUrl, req.user);
  }

  @Delete(':id')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('admin')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.newsService.remove(id, req.user);
  }
}
