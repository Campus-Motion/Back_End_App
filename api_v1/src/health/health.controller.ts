import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { HealthService } from './health.service';
import { CreateHealthDto } from './dto/create-health.dto';
import { UpdateHealthDto } from './dto/update-health.dto';
import { JwtGuard } from '../auth/jwt.guard';

function auditCtx(req: any, method: string, endpoint: string) {
  return {
    userId: req.user.id,
    username: req.user.username,
    ip: req.ip,
    userAgent: req.headers['user-agent'] ?? null,
    httpMethod: req.method,
    endpoint: req.path,
  };
}

@Controller('health')
@UseGuards(JwtGuard)
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  findOwn(@Req() req: any) {
    return this.healthService.findOwn(req.user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateHealthDto, @Req() req: any) {
    return this.healthService.create(
      dto,
      req.user,
      auditCtx(req, 'create', '/health'),
    );
  }

  @Put()
  update(@Body() dto: UpdateHealthDto, @Req() req: any) {
    return this.healthService.update(
      dto,
      req.user,
      auditCtx(req, 'update', '/health'),
    );
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  requestDeletion(@Req() req: any) {
    return this.healthService.requestDeletion(
      req.user,
      auditCtx(req, 'delete', '/health'),
    );
  }
}
