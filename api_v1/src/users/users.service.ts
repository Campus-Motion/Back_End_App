import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Sql } from 'postgres';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuditContext } from '../auth/auth.service';
import { UpdatePreferencesDto } from './dto/update-preference.dto';

@Injectable()
export class UsersService {
  constructor(
    @Inject('API_DB') private readonly apiDb: Sql,
    @Inject('ADMIN_DB') private readonly adminDb: Sql,
    @Inject('AUDIT_DB') private readonly auditDb: Sql,
  ) {}

  private async log({
    userId,
    username,
    action,
    targetTable,
    targetId,
    outcome,
    oldValue,
    newValue,
    ctx,
  }: {
    userId: number | null;
    username: string | null;
    action: string;
    targetTable: string | null;
    targetId: number | null;
    outcome: 'success' | 'failure';
    oldValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
    ctx?: AuditContext;
  }) {
    await this.auditDb`
      INSERT INTO audit_log (
        user_id, username, action,
        target_table, target_id,
        outcome,
        old_value, new_value,
        ip_address, user_agent,
        http_method, endpoint
      ) VALUES (
        ${userId},
        ${username},
        ${action}::audit_action,
        ${targetTable},
        ${targetId},
        ${outcome},
        ${oldValue ? JSON.stringify(oldValue) : null},
        ${newValue ? JSON.stringify(newValue) : null},
        ${ctx?.ip ?? null},
        ${ctx?.userAgent ?? null},
        ${ctx?.httpMethod ?? null},
        ${ctx?.endpoint ?? null}
      )
    `;
  }

  // ─── Own profile ───────────────────────────────────────────────────────────

  async getMe(userId: number) {
    const [user] = await this.apiDb`
      SELECT id, username, email, photo_url, section, role, created_at, updated_at, last_login_at
      FROM users
      WHERE id = ${userId}
    `;
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateMe(userId: number, dto: UpdateUserDto) {
    if (dto.username) {
      const [conflict] = await this.apiDb`
        SELECT id FROM users WHERE username = ${dto.username} AND id <> ${userId}
      `;
      if (conflict) throw new ConflictException('Username already taken');
    }

    if (dto.email) {
      const [conflict] = await this.apiDb`
        SELECT id FROM users WHERE email = ${dto.email} AND id <> ${userId}
      `;
      if (conflict) throw new ConflictException('Email already in use');
    }

    const [updated] = await this.apiDb`
      UPDATE users
      SET
        username   = COALESCE(${dto.username ?? null}, username),
        email      = COALESCE(${dto.email ?? null}, email),
        section    = COALESCE(${dto.section ?? null}, section),
        updated_at = NOW()
      WHERE id = ${userId}
      RETURNING id, username, email, photo_url, section, role, created_at, updated_at
    `;
    return updated;
  }

  async updatePhoto(userId: number, photoUrl: string) {
    const [updated] = await this.apiDb`
      UPDATE users
      SET photo_url = ${photoUrl}, updated_at = NOW()
      WHERE id = ${userId}
      RETURNING photo_url
    `;
    return updated;
  }

  async requestDeletion(userId: number, ctx?: AuditContext) {
    const [user] = await this.apiDb`
    SELECT username FROM users WHERE id = ${userId}
  `;
    if (!user) throw new NotFoundException('User not found');

    await this.apiDb`
    UPDATE users
    SET deletion_requested_at = NOW(), updated_at = NOW()
    WHERE id = ${userId}
  `;

    await this.log({
      userId,
      username: user.username,
      action: 'user.deletion_requested',
      targetTable: 'users',
      targetId: userId,
      outcome: 'success',
      ctx,
    });

    return { message: 'Deletion request registered' };
  }

  // ─── PREFERENCES ─────────────────────────────────────────────────────────────

  async getPreferences(userId: number) {
    const [prefs] = await this.apiDb`
    SELECT * FROM user_preferences WHERE user_id = ${userId}
  `;
    // Return empty defaults if the user hasn't set preferences yet
    return (
      prefs ?? {
        user_id: userId,
        preferred_sports: [],
        intensity: null,
        goal: null,
        level: null,
        open_to_groups: true,
        open_to_new_sports: true,
        max_distance_km: null,
        updated_at: null,
      }
    );
  }

  async upsertPreferences(userId: number, dto: UpdatePreferencesDto) {
    const [prefs] = await this.apiDb`
    INSERT INTO user_preferences (
      user_id,
      preferred_sports,
      intensity,
      goal,
      level,
      open_to_groups,
      open_to_new_sports,
      max_distance_km,
      updated_at
    ) VALUES (
      ${userId},
      ${dto.preferred_sports ?? []},
      ${dto.intensity ?? null},
      ${dto.goal ?? null},
      ${dto.level ?? null},
      ${dto.open_to_groups ?? true},
      ${dto.open_to_new_sports ?? true},
      ${dto.max_distance_km ?? null},
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      preferred_sports   = EXCLUDED.preferred_sports,
      intensity          = EXCLUDED.intensity,
      goal               = EXCLUDED.goal,
      level              = EXCLUDED.level,
      open_to_groups     = EXCLUDED.open_to_groups,
      open_to_new_sports = EXCLUDED.open_to_new_sports,
      max_distance_km    = EXCLUDED.max_distance_km,
      updated_at         = NOW()
    RETURNING *
  `;
    return prefs;
  }

  // ─── Public profiles ───────────────────────────────────────────────────────

  async getPublicProfile(id: number) {
    const [user] = await this.apiDb`
      SELECT id, username, photo_url, section, role, created_at
      FROM users
      WHERE id = ${id}
    `;
    if (!user) throw new NotFoundException(`User #${id} not found`);
    return user;
  }

  // ─── Social ────────────────────────────────────────────────────────────────

  async getFollowers(targetId: number, limit = 20, cursor?: number) {
    const [target] = await this
      .apiDb`SELECT id FROM users WHERE id = ${targetId}`;
    if (!target) throw new NotFoundException(`User #${targetId} not found`);

    const rows = await this.apiDb`
      SELECT u.id, u.username, u.photo_url, u.role, uf.created_at AS followed_at
      FROM user_follows uf
      JOIN users u ON u.id = uf.follower_id
      WHERE uf.following_id = ${targetId}
        ${cursor ? this.apiDb`AND u.id < ${cursor}` : this.apiDb``}
      ORDER BY uf.created_at DESC
      LIMIT ${limit}
    `;

    const [{ total }] = await this.apiDb`
      SELECT COUNT(*)::int AS total FROM user_follows WHERE following_id = ${targetId}
    `;

    return {
      data: rows,
      meta: {
        total,
        limit,
        has_more: rows.length === limit,
        next_cursor: rows.length ? rows[rows.length - 1].id : null,
      },
    };
  }

  async getFollowing(userId: number, limit = 20, cursor?: number) {
    const [user] = await this.apiDb`SELECT id FROM users WHERE id = ${userId}`;
    if (!user) throw new NotFoundException(`User #${userId} not found`);

    const rows = await this.apiDb`
      SELECT u.id, u.username, u.photo_url, u.role, uf.created_at AS followed_at
      FROM user_follows uf
      JOIN users u ON u.id = uf.following_id
      WHERE uf.follower_id = ${userId}
        ${cursor ? this.apiDb`AND u.id < ${cursor}` : this.apiDb``}
      ORDER BY uf.created_at DESC
      LIMIT ${limit}
    `;

    const [{ total }] = await this.apiDb`
      SELECT COUNT(*)::int AS total FROM user_follows WHERE follower_id = ${userId}
    `;

    return {
      data: rows,
      meta: {
        total,
        limit,
        has_more: rows.length === limit,
        next_cursor: rows.length ? rows[rows.length - 1].id : null,
      },
    };
  }

  async follow(followerId: number, followingId: number) {
    const [target] = await this
      .apiDb`SELECT id FROM users WHERE id = ${followingId}`;
    if (!target) throw new NotFoundException(`User #${followingId} not found`);

    try {
      const [row] = await this.apiDb`
        INSERT INTO user_follows (follower_id, following_id)
        VALUES (${followerId}, ${followingId})
        RETURNING created_at
      `;
      return { message: 'Followed successfully', followed_at: row.created_at };
    } catch (err: any) {
      if (err.code === '23505')
        throw new ConflictException('Already following this user');
      if (err.code === '23514')
        throw new ConflictException('You cannot follow yourself');
      throw err;
    }
  }

  async unfollow(followerId: number, followingId: number) {
    const result = await this.apiDb`
      DELETE FROM user_follows
      WHERE follower_id = ${followerId} AND following_id = ${followingId}
    `;
    if (result.count === 0)
      throw new NotFoundException('You are not following this user');
    return { message: 'Unfollowed successfully' };
  }
}
