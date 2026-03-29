import {
  Controller,
  Get,
  Post,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { JwtGuard } from '../auth/jwt.guard';

@Controller('activities')
@UseGuards(JwtGuard) // ALL routes in this controller require a valid JWT
export class ActivitiesController {
  constructor(private activitiesService: ActivitiesService) {}

  // GET /activities
  @Get()
  findAll(@Request() req) {
    return this.activitiesService.findAll(req.user.id);
    //                                     ↑
    //                  injected by JwtStrategy.validate()
  }

  // POST /activities
  @Post()
  create(
    @Request() req,
    @Body() body: { title: string; type: string; body?: string },
  ) {
    return this.activitiesService.create(
      req.user.id,
      body.title,
      body.type,
      body.body,
    );
  }
}
