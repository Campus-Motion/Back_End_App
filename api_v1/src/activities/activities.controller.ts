import {
  Controller,
  Header,
  Res,
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
  UploadedFile,
  SetMetadata,
  HttpCode,
  HttpStatus,
  Req,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { FitImportsService } from './fit-imports.service';
import { memoryStorage } from 'multer';
import { HeatmapsService } from './heatmaps.service';
import { ActivitiesService } from './activities.service';
import { JwtGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { photoUploadConfig } from '../common/multer/multer.config';
import { CreateWaypointsDto } from './dto/create-waypoint.dto';
import { CreateActivityDto } from './dto/create-activities.dto';

@Controller('activities')
@UseGuards(JwtGuard)
export class ActivitiesController {
  constructor(
    private activitiesService: ActivitiesService,
    private heatmapsService: HeatmapsService,
    private fitImportsService: FitImportsService,
  ) {}

  @Post('import-fit')
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0, parts: 2 },
    }),
  )
  importFit(
    @Req() req: { user: { id: number } },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.fitImportsService.importActivity(req.user.id, file);
  }

  @Get('export')
  @Header('Cache-Control', 'no-store')
  exportActivities(@Req() req: { user: { id: number } }) {
    return this.fitImportsService.exportActivities(req.user.id);
  }

  @Get('heatmap')
  @Header('Cache-Control', 'no-store')
  async heatmap(@Request() req, @Res({ passthrough: true }) res: Response) {
    const result = await this.heatmapsService.personal(req.user.id);
    if (result === null) res.status(HttpStatus.NO_CONTENT);
    return result;
  }

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
  create(@Request() req, @Body() dto: CreateActivityDto) {
    return this.activitiesService.create(dto, req.user.id);
  }

  // PUT /activities/:id
  @Put(':id')
  update(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateActivityDto,
  ) {
    return this.activitiesService.update(req.user.id, id, dto);
  }

  // DELETE /activities/:id
  @Delete(':id') // Only admins and user that created the activity can delete it
  remove(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.activitiesService.remove(id, req.user);
  }

  // POST /activities/:id/waypoints
  @Post(':id/waypoints')
  @HttpCode(HttpStatus.CREATED)
  addWaypoints(
    @Param('id', ParseIntPipe) activityId: number,
    @Body() dto: CreateWaypointsDto,
    @Req() req: any,
  ) {
    return this.activitiesService.addWaypoints(
      req.user.id,
      activityId,
      dto.waypoints,
    );
  }

  // GET /activities/:id/waypoints
  @Get(':id/waypoints')
  getWaypoints(@Param('id', ParseIntPipe) activityId: number, @Req() req: any) {
    return this.activitiesService.getWaypoints(req.user.id, activityId);
  }
  // POST /activities/:id/photos
  @Post(':id/photos')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('photo', photoUploadConfig('activities')))
  addPhoto(
    @Param('id', ParseIntPipe) activityId: number,
    @UploadedFile() file: Express.Multer.File,
    @Body('position') position: string,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('No photo file provided');
    const photoUrl = `/uploads/activities/${file.filename}`;
    return this.activitiesService.addPhoto(
      req.user.id,
      activityId,
      photoUrl,
      position ? parseInt(position, 10) : 0,
    );
  }

  // GET /activities/:id/photos
  @Get(':id/photos')
  getPhotos(@Param('id', ParseIntPipe) activityId: number, @Req() req: any) {
    return this.activitiesService.getPhotos(req.user.id, activityId);
  }

  // DELETE /activities/:id/photos/:photoId
  @Delete(':id/photos/:photoId')
  @HttpCode(HttpStatus.OK)
  removePhoto(
    @Param('id', ParseIntPipe) activityId: number,
    @Param('photoId', ParseIntPipe) photoId: number,
    @Req() req: any,
  ) {
    return this.activitiesService.removePhoto(req.user.id, activityId, photoId);
  }
}
