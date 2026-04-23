import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Sql } from 'postgres';
import { UpdateRoleDto } from './dto/update-role.dto';
import { QueryAuditDto } from './dto/query-audit.dto';

// Must match the audit_action enum in your DB
type AuditAction =
  | 'auth.login_success'
  | 'auth.login_failure'
  | 'auth.logout'
  | 'auth.register'
  | 'user.update_role'
  | 'user.delete'
  | 'user.deletion_requested'
  | 'user.update_profile'
  | 'user.update_photo'
  | 'admin.list_users'
  | 'activity.delete'
  | 'comment.delete'
  | 'health.create'
  | 'health.update'
  | 'health.delete_requested';

// Passed from the controller on every request
interface AuditContext {
  userId: number;
  username: string;
  ip?: string;
  userAgent?: string;
  endpoint?: string;
  httpMethod?: string;
}

@Injectable()
export class AdminService {
  constructor(
    @Inject('ADMIN_DB') private readonly adminDb: Sql,
    @Inject('AUDIT_DB') private readonly auditDb: Sql,
  ) {}

  // ─── Audit helper ──────────────────────────────────────────────────────────

  private async log(
    ctx: AuditContext,
    action: AuditAction,
    targetTable: string | null,
    targetId: number | null,
    outcome: 'success' | 'failure' = 'success',
    oldValue?: Record<string, unknown> | null,
    newValue?: Record<string, unknown> | null,
  ) {
    await this.auditDb`
      INSERT INTO audit_log (
        user_id, username, action,
        target_table, target_id,
        outcome,
        old_value, new_value,
        ip_address, user_agent,
        http_method, endpoint
      ) VALUES (
        ${ctx.userId},
        ${ctx.username},
        ${action}::audit_action,
        ${targetTable},
        ${targetId},
        ${outcome},
        ${oldValue ? JSON.stringify(oldValue) : null},
        ${newValue ? JSON.stringify(newValue) : null},
        ${ctx.ip ?? null},
        ${ctx.userAgent ?? null},
        ${ctx.httpMethod ?? null},
        ${ctx.endpoint ?? null}
      )
    `;
  }

  // ─── Users ─────────────────────────────────────────────────────────────────

  async listUsers(limit = 20, offset = 0, role?: string, ctx?: AuditContext) {
    const rows = await this.adminDb`
      SELECT id, username, email, photo_url, section, role,
             created_at, updated_at, last_login_at, deletion_requested_at
      FROM users
      ${role ? this.adminDb`WHERE role = ${role}::user_role` : this.adminDb``}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [{ total }] = await this.adminDb`
      SELECT COUNT(*)::int AS total
      FROM users
      ${role ? this.adminDb`WHERE role = ${role}::user_role` : this.adminDb``}
    `;

    // Log bulk access of user data (sensitive read)
    if (ctx) {
      await this.log(ctx, 'admin.list_users', 'users', null, 'success', null, {
        filters: { role: role ?? null },
        limit,
        offset,
      });
    }

    return {
      data: rows,
      meta: { total, limit, offset, has_more: offset + rows.length < total },
    };
  }

  async updateRole(targetId: number, dto: UpdateRoleDto, ctx: AuditContext) {
    const [target] = await this.adminDb`
      SELECT id, username, role FROM users WHERE id = ${targetId}
    `;
    if (!target) throw new NotFoundException(`User #${targetId} not found`);

    if (
      target.role === 'admin' &&
      target.id !== ctx.userId &&
      dto.role !== 'admin'
    ) {
      throw new ForbiddenException('Cannot demote another admin');
    }

    const [updated] = await this.adminDb`
      UPDATE users
      SET role = ${dto.role}::user_role, updated_at = NOW()
      WHERE id = ${targetId}
      RETURNING id, username, role
    `;

    await this.log(
      ctx,
      'user.update_role',
      'users',
      targetId,
      'success',
      { role: target.role }, // old
      { role: dto.role }, // new
    );

    return updated;
  }

  async deleteUser(targetId: number, ctx: AuditContext) {
    const [target] = await this.adminDb`
      SELECT id, username, email, role, created_at FROM users WHERE id = ${targetId}
    `;
    if (!target) throw new NotFoundException(`User #${targetId} not found`);

    await this.adminDb`DELETE FROM users WHERE id = ${targetId}`;

    await this.log(
      ctx,
      'user.delete',
      'users',
      targetId,
      'success',
      {
        username: target.username,
        email: target.email,
        role: target.role,
        created_at: target.created_at,
      },
      null,
    );

    return { message: 'User deleted' };
  }

  // ─── Comments ──────────────────────────────────────────────────────────────

  async deleteComment(commentId: number, ctx: AuditContext) {
    const [comment] = await this.adminDb`
      SELECT id, author_id, body, news_id, activity_id, created_at
      FROM comments WHERE id = ${commentId}
    `;
    if (!comment)
      throw new NotFoundException(`Comment #${commentId} not found`);

    await this.adminDb`DELETE FROM comments WHERE id = ${commentId}`;

    await this.log(
      ctx,
      'comment.delete',
      'comments',
      commentId,
      'success',
      {
        author_id: comment.author_id,
        news_id: comment.news_id,
        activity_id: comment.activity_id,
        created_at: comment.created_at,
        // body intentionally omitted — may contain PII
      },
      null,
    );

    return { message: 'Comment deleted' };
  }

  // ─── Activities ────────────────────────────────────────────────────────────

  async deleteActivity(activityId: number, ctx: AuditContext) {
    const [activity] = await this.adminDb`
      SELECT id, title, type, user_id, is_public, created_at
      FROM activities WHERE id = ${activityId}
    `;
    if (!activity)
      throw new NotFoundException(`Activity #${activityId} not found`);

    await this.adminDb`DELETE FROM activities WHERE id = ${activityId}`;

    await this.log(
      ctx,
      'activity.delete',
      'activities',
      activityId,
      'success',
      {
        title: activity.title,
        type: activity.type,
        user_id: activity.user_id,
        is_public: activity.is_public,
        created_at: activity.created_at,
      },
      null,
    );

    return { message: 'Activity deleted' };
  }

  // ─── Audit log ─────────────────────────────────────────────────────────────

  async getAuditLog(query: QueryAuditDto) {
    const limit = Math.min(query.limit ?? 20, 100);
    const offset = query.offset ?? 0;
    const after = query.after ? new Date(query.after) : null;
    const before = query.before ? new Date(query.before) : null;
    const userId = query.user_id ?? null;

    const rows = await this.adminDb`
      SELECT
        al.id,
        al.user_id,
        al.username,
        al.action,
        al.target_table,
        al.target_id,
        al.outcome,
        al.old_value,
        al.new_value,
        al.ip_address,
        al.user_agent,
        al.http_method,
        al.endpoint,
        al.performed_at
      FROM audit_log al
      WHERE TRUE
        ${userId ? this.adminDb`AND al.user_id = ${userId}` : this.adminDb``}
        ${after ? this.adminDb`AND al.performed_at > ${after}` : this.adminDb``}
        ${before ? this.adminDb`AND al.performed_at < ${before}` : this.adminDb``}
      ORDER BY al.performed_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [{ total }] = await this.adminDb`
      SELECT COUNT(*)::int AS total
      FROM audit_log al
      WHERE TRUE
        ${userId ? this.adminDb`AND al.user_id = ${userId}` : this.adminDb``}
        ${after ? this.adminDb`AND al.performed_at > ${after}` : this.adminDb``}
        ${before ? this.adminDb`AND al.performed_at < ${before}` : this.adminDb``}
    `;

    return {
      data: rows,
      meta: { total, limit, offset, has_more: offset + rows.length < total },
    };
  }
}
