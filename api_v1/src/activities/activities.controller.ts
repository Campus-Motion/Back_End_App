import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  ParseBoolPipe,
} from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { JwtGuard } from '../auth/jwt.guard';

@Controller('activities')
@UseGuards(JwtGuard)
export class ActivitiesController {
  constructor(private activitiesService: ActivitiesService) {}

  // GET /activities?limit=20&offset=0&type=run&public=true
  @Get()
  findAll(
    @Request() req,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('type') type?: string,
    @Query('public', new DefaultValuePipe(undefined)) isPublic?: string,
  ) {
    // Parse boolean query param manually since ParseBoolPipe fails on undefined
    const parsedPublic =
      isPublic === 'true' ? true : isPublic === 'false' ? false : undefined;
    return this.activitiesService.findAll(
      req.user.id,
      limit,
      offset,
      type,
      parsedPublic,
    );
  }

  // GET /activities/:id
  @Get(':id')
  findOne(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.activitiesService.findOne(req.user.id, id);
  }

  // POST /activities
  @Post()
  create(
    @Request() req,
    @Body()
    body: {
      title: string;
      type: string;
      body?: string;
      is_public?: boolean;
      event_id?: number;
    },
  ) {
    return this.activitiesService.create(
      req.user.id,
      body.title,
      body.type,
      body.body,
      body.is_public ?? false,
      body.event_id,
    );
  }

  // PUT /activities/:id
  @Put(':id')
  update(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: { title?: string; type?: string; body?: string; is_public?: boolean },
  ) {
    return this.activitiesService.update(req.user.id, id, body);
  }

  // DELETE /activities/:id
  @Delete(':id')
  remove(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.activitiesService.remove(req.user.id, id);
  }
}
