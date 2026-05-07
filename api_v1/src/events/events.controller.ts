import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  SetMetadata,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { QueryEventDto, QueryParticipantsDto } from './dto/query-event.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { FileInterceptor } from '@nestjs/platform-express/multer/interceptors/file.interceptor';
import { photoUploadConfig } from '../common/multer/multer.config';
import { JoinAsGuestDto } from './dto/join-as-guest.dto';
import { Throttle } from '@nestjs/throttler';

// Shorthand helper for role metadata
const Roles = (...roles: string[]) => SetMetadata('roles', roles);

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  // ── GET /events ─────────────────────────────────── Public ──────────────────
  @Get()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  findAll(@Query() query: QueryEventDto) {
    return this.eventsService.findAll(query);
  }

  // ── GET /events/:id ─────────────────────────────── Public ──────────────────
  @Get(':id')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.findOne(id);
  }

  // ── POST /events ─────────────────────── admin | moderator ──────────────────
  @Post()
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('admin', 'moderator')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateEventDto, @Req() req: any) {
    return this.eventsService.create(dto, req.user.id);
  }

  // ── PUT /events/:id ───────────── admin | moderator (creator only) ──────────
  @Put(':id')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('admin', 'moderator')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEventDto,
    @Req() req: any,
  ) {
    return this.eventsService.update(id, dto, req.user);
  }

  // ── DELETE /events/:id ──────────────────────────── admin only ───────────────
  @Delete(':id')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('admin')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.remove(id);
  }

  // ── GET /events/:id/participants ──────────────────── Public ─────────────────
  @Get(':id/participants')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  findParticipants(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: QueryParticipantsDto,
  ) {
    return this.eventsService.findParticipants(id, query);
  }

  // ── POST /events/:id/participants ──────────────── Authenticated ─────────────
  @Post(':id/participants')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.CREATED)
  joinEvent(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.eventsService.joinEvent(id, req.user.id);
  }

  // ── POST /events/:id/guest_participants ──────────────── Public ─────────────

  @Post(':id/guest_participants')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.CREATED)
  addGuestParticipant(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: JoinAsGuestDto,
  ) {
    return this.eventsService.addGuestParticipant(id, dto);
  }

  // DELETE /events/:id/guest_participants?token=... ──────────────── Public (with token) ─────────────
  @Delete(':id/guest_participants')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  removeGuestParticipant(
    @Param('id', ParseIntPipe) id: number,
    @Query('token') token: string,
  ) {
    return this.eventsService.removeGuestParticipant(id, token);
  }

  // ── DELETE /events/:id/participants ───────────── Authenticated ──────────────
  @Delete(':id/participants')
  @UseGuards(JwtGuard)
  leaveEvent(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.eventsService.leaveEvent(id, req.user.id);
  }
  // ── POST /events/:id/photos ─────────────── admin | moderator ──────────────────
  @Post(':id/photos')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('admin', 'moderator')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('photo', photoUploadConfig('events')))
  addPhoto(
    @Param('id', ParseIntPipe) eventId: number,
    @UploadedFile() file: Express.Multer.File,
    @Body('position') position: string,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('No photo file provided');
    return this.eventsService.addPhoto(
      eventId,
      `/uploads/events/${file.filename}`,
      req.user,
      position ? parseInt(position, 10) : 0,
    );
  }
  // ── GET /events/:id/photos ─────────────────────────── Public ─────────────────
  @Get(':id/photos')
  getPhotos(@Param('id', ParseIntPipe) eventId: number) {
    return this.eventsService.getPhotos(eventId);
  }
  // ── DELETE /events/:id/photos/:photoId ───────────── admin | moderator ──────────────────
  @Delete(':id/photos/:photoId')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('admin', 'moderator')
  removePhoto(
    @Param('id', ParseIntPipe) eventId: number,
    @Param('photoId', ParseIntPipe) photoId: number,
    @Req() req: any,
  ) {
    return this.eventsService.removePhoto(eventId, photoId, req.user);
  }
}
