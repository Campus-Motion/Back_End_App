import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
  SetMetadata,
  Req,
  Delete,
} from '@nestjs/common';
import { LocationService } from './location.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';

const Roles = (...roles: string[]) => SetMetadata('roles', roles);

@Controller('locations')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  // ── GET /locations ─────────────────────────────────── Public ──
  @Get()
  findAll() {
    return this.locationService.findAll();
  }

  // ── GET /locations/:id ─────────────────────────────── Public ──
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.locationService.findOne(id);
  }

  // ── POST /locations ─────────────────────── admin | moderator ──
  @Post()
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('admin', 'moderator')
  create(@Body() dto: CreateLocationDto, @Req() req: any) {
    return this.locationService.create(dto, req.user.id);
  }

  @Delete(':id')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('admin', 'moderator')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.locationService.delete(id);
  }
}
