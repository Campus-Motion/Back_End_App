import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Sql } from 'postgres';
import { UpdateUserDto } from './dto/update-user.dto';
import { AdminUserRoleDto } from './dto/admin-user-role.dto';

@Injectable()
export class UsersService {
  constructor(
    @Inject('API_DB') private readonly apiDb: Sql,
    @Inject('ADMIN_DB') private readonly adminDb: Sql,
  ) {}

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

  async requestDeletion(userId: number) {
    await this.adminDb`
      UPDATE users
      SET deletion_requested_at = NOW(), updated_at = NOW()
      WHERE id = ${userId}
    `;
    return { message: 'Deletion request registered' };
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

  // ─── Admin ─────────────────────────────────────────────────────────────────

  async adminListUsers(limit = 20, offset = 0, role?: string) {
    const rows = await this.adminDb`
      SELECT id, username, email, photo_url, section, role, created_at, updated_at, last_login_at
      FROM users
      ${role ? this.adminDb`WHERE role = ${role}::user_role` : this.adminDb``}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [{ total }] = await this.adminDb`
      SELECT COUNT(*)::int AS total FROM users
      ${role ? this.adminDb`WHERE role = ${role}::user_role` : this.adminDb``}
    `;

    return {
      data: rows,
      meta: { total, limit, offset, has_more: offset + rows.length < total },
    };
  }

  async adminUpdateRole(
    targetId: number,
    dto: AdminUserRoleDto,
    requestingUser: { id: number; role: string },
  ) {
    const [target] = await this.adminDb`
      SELECT id, role FROM users WHERE id = ${targetId}
    `;
    if (!target) throw new NotFoundException(`User #${targetId} not found`);

    // Safety guard: cannot demote another admin
    if (
      target.role === 'admin' &&
      target.id !== requestingUser.id &&
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
    return updated;
  }

  async adminDeleteUser(targetId: number) {
    const [target] = await this
      .adminDb`SELECT id FROM users WHERE id = ${targetId}`;
    if (!target) throw new NotFoundException(`User #${targetId} not found`);

    await this.adminDb`DELETE FROM users WHERE id = ${targetId}`;
    return { message: 'User deleted' };
  }
}
