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
} from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { QueryEventDto, QueryParticipantsDto } from './dto/query-event.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';

// Shorthand helper for role metadata
const Roles = (...roles: string[]) => SetMetadata('roles', roles);

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  // ── GET /events ─────────────────────────────────── Public ──────────────────
  @Get()
  findAll(@Query() query: QueryEventDto) {
    return this.eventsService.findAll(query);
  }

  // ── GET /events/:id ─────────────────────────────── Public ──────────────────
  @Get(':id')
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

  // ── DELETE /events/:id/participants ───────────── Authenticated ──────────────
  @Delete(':id/participants')
  @UseGuards(JwtGuard)
  leaveEvent(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.eventsService.leaveEvent(id, req.user.id);
  }
}
