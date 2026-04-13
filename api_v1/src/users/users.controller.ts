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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtGuard } from '../auth/jwt.guard';

const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
const uploadsRoot = join(__dirname, '..', '..', 'uploads');

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ─── Own profile (must come before :id routes!) ───────────────────────────

  @Get('me')
  @UseGuards(JwtGuard)
  getMe(@Req() req: any) {
    return this.usersService.getMe(req.user.id);
  }

  @Put('me')
  @UseGuards(JwtGuard)
  updateMe(@Body() dto: UpdateUserDto, @Req() req: any) {
    return this.usersService.updateMe(req.user.id, dto);
  }

  @Post('me/photo')
  @UseGuards(JwtGuard)
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: diskStorage({
        destination: join(uploadsRoot, 'profiles'),
        filename: (_req, file, cb) => {
          const extension = extname(file.originalname).toLowerCase();
          cb(null, `${randomUUID()}${extension}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
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
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('photo file is required');
    const photoUrl = `/uploads/profiles/${file.filename}`;
    return this.usersService.updatePhoto(req.user.id, photoUrl);
  }

  @Delete('me')
  @UseGuards(JwtGuard)
  requestDeletion(@Req() req: any) {
    return this.usersService.requestDeletion(req.user.id);
  }

  // ─── Public profiles ──────────────────────────────────────────────────────

  @Get(':id')
  @UseGuards(JwtGuard)
  getPublicProfile(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.getPublicProfile(id);
  }

  // ─── Social ───────────────────────────────────────────────────────────────

  @Get(':id/followers')
  @UseGuards(JwtGuard)
  getFollowers(
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.usersService.getFollowers(
      id,
      limit ? Number(limit) : 20,
      cursor ? Number(cursor) : undefined,
    );
  }

  @Get(':id/following')
  @UseGuards(JwtGuard)
  getFollowing(
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.usersService.getFollowing(
      id,
      limit ? Number(limit) : 20,
      cursor ? Number(cursor) : undefined,
    );
  }

  @Post(':id/follow')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.CREATED)
  follow(@Param('id', ParseIntPipe) targetId: number, @Req() req: any) {
    return this.usersService.follow(req.user.id, targetId);
  }

  @Delete(':id/follow')
  @UseGuards(JwtGuard)
  unfollow(@Param('id', ParseIntPipe) targetId: number, @Req() req: any) {
    return this.usersService.unfollow(req.user.id, targetId);
  }
}
