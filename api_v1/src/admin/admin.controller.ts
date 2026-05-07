import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Req,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { UpdateRoleDto } from './dto/update-role.dto';
import { QueryAuditDto } from './dto/query-audit.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';

const Roles = (...roles: string[]) => SetMetadata('roles', roles);

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

@Controller('admin')
@UseGuards(JwtGuard, RolesGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── Users (admin only) ───────────────────────────────────────────────────

  @Get('users')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  listUsers(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('role') role?: string,
  ) {
    return this.adminService.listUsers(
      limit ? Number(limit) : 20,
      offset ? Number(offset) : 0,
      role,
      auditCtx(req, 'GET', 'admin/users'),
    );
  }

  @Patch('users/:id/role')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  updateRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoleDto,
    @Req() req: any,
  ) {
    return this.adminService.updateRole(
      id,
      dto,
      auditCtx(req, 'PATCH', 'users/:id/role'),
    );
  }

  @Delete('users/:id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  deleteUser(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.adminService.deleteUser(
      id,
      auditCtx(req, 'DELETE', 'users/:id'),
    );
  }

  // ─── Comments (admin or moderator) ────────────────────────────────────────

  @Delete('comments/:id')
  @Roles('admin', 'moderator')
  @HttpCode(HttpStatus.OK)
  deleteComment(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.adminService.deleteComment(
      id,
      auditCtx(req, 'DELETE', 'comments/:id'),
    );
  }

  // ─── Activities (admin only) ──────────────────────────────────────────────

  @Delete('activities/:id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  deleteActivity(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.adminService.deleteActivity(
      id,
      auditCtx(req, 'DELETE', 'activities/:id'),
    );
  }

  // ─── Audit log (admin only) ───────────────────────────────────────────────

  @Get('audit')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  getAuditLog(
    @Query()
    query: QueryAuditDto,
  ) {
    return this.adminService.getAuditLog(query);
  }
}
