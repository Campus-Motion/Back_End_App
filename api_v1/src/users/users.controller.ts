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
import { photoUploadConfig } from '../common/multer/multer.config';
import { UpdatePreferencesDto } from './dto/update-preference.dto';
import { QueryEventDto } from '../events/dto/query-event.dto';
import { SearchUsersDto } from './dto/search-users.dto';

const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
const uploadsRoot = join(__dirname, '..', '..', 'uploads');

function auditCtx(req: any, method: string, endpoint: string) {
  return {
    userId: req.user.id,
    username: req.user.username,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    httpMethod: method,
    endpoint,
  };
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ─── Own profile (must come before :id routes!) ───────────────────────────

  // GET /users/me
  @Get('me')
  @UseGuards(JwtGuard)
  getMe(@Req() req: any) {
    return this.usersService.getMe(req.user.id);
  }

  // GET /users/me/events — events the user joined with their account
  @Get('me/events')
  @UseGuards(JwtGuard)
  getMyEvents(
    @Query() query: QueryEventDto,
    @Req() req: { user: { id: number } },
  ) {
    return this.usersService.getMyEvents(req.user.id, query);
  }

  // PUT /users/me
  @Put('me')
  @UseGuards(JwtGuard)
  updateMe(@Body() dto: UpdateUserDto, @Req() req: any) {
    return this.usersService.updateMe(req.user.id, dto);
  }

  // POST /users/me/photo
  @Post('me/photo')
  @UseGuards(JwtGuard)
  @UseInterceptors(FileInterceptor('photo', photoUploadConfig('profiles')))
  async uploadPhoto(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('photo file is required');
    const photoUrl = `/uploads/profiles/${file.filename}`;
    return this.usersService.updatePhoto(req.user.id, photoUrl);
  }

  // DELETE /users/me
  @Delete('me')
  @UseGuards(JwtGuard)
  requestDeletion(@Req() req: any) {
    return this.usersService.requestDeletion(
      req.user.id,
      auditCtx(req, 'DELETE', 'users/me'),
    );
  }

  // ─── Preferences ─────────────────────────────────────────────────────────────

  @Get('me/preferences')
  @UseGuards(JwtGuard)
  getPreferences(@Req() req: any) {
    return this.usersService.getPreferences(req.user.id);
  }

  @Put('me/preferences')
  @UseGuards(JwtGuard)
  upsertPreferences(@Body() dto: UpdatePreferencesDto, @Req() req: any) {
    return this.usersService.upsertPreferences(req.user.id, dto);
  }

  // ─── Public profiles ──────────────────────────────────────────────────────

  // GET /users/search?q= (must come before :id, or "search" is parsed as an id)
  @Get('search')
  @UseGuards(JwtGuard)
  searchUsers(@Query() query: SearchUsersDto, @Req() req: any) {
    return this.usersService.searchUsers(req.user.id, query.q, query.limit);
  }

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
