import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtGuard } from '../auth/jwt.guard';
import { QueryNotificationsDto } from './dto/query-notifications.dto';

@Controller('notifications')
@UseGuards(JwtGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findAll(@Req() req: any, @Query() query: QueryNotificationsDto) {
    return this.notificationsService.findAll(req.user.id, query);
  }

  @Put('read-all')
  markAllRead(@Req() req: any) {
    return this.notificationsService.markAllRead(req.user.id);
  }

  @Put(':id/read')
  markOneRead(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.notificationsService.markOneRead(req.user.id, id);
  }
}
