import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Sql } from 'postgres';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { QueryNewsDto } from './dto/query-news.dto';

@Injectable()
export class NewsService {
  constructor(
    @Inject('API_DB') private readonly apiDb: Sql,
    @Inject('ADMIN_DB') private readonly adminDb: Sql,
  ) {}

  private async setRlsContext(db: Sql, userId: number): Promise<void> {
    await db`SELECT set_config('app.current_user_id', ${String(userId)}, true)`;
  }

  private dbForUser(user: { id: number; role: string }): Sql {
    return user.role === 'admin' ? this.adminDb : this.apiDb;
  }

  async findAll(query: QueryNewsDto) {
    const limit = Math.min(query.limit ?? 20, 100);
    const offset = query.offset ?? 0;
    const cursor = query.cursor ?? null;
    const before = query.before ? new Date(query.before) : null;

    const rows = await this.apiDb`
      SELECT
        n.id,
        n.title,
        n.body,
        n.photo_url,
        n.author_id,
        n.is_published,
        n.published_at,
        n.created_at,
        n.updated_at
      FROM news n
      WHERE n.is_published = TRUE
        ${cursor ? this.apiDb`AND n.id < ${cursor}` : this.apiDb``}
        ${before ? this.apiDb`AND COALESCE(n.published_at, n.created_at) < ${before}` : this.apiDb``}
      ORDER BY COALESCE(n.published_at, n.created_at) DESC, n.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [{ total }] = await this.apiDb`
      SELECT COUNT(*)::int AS total
      FROM news n
      WHERE n.is_published = TRUE
        ${cursor ? this.apiDb`AND n.id < ${cursor}` : this.apiDb``}
        ${before ? this.apiDb`AND COALESCE(n.published_at, n.created_at) < ${before}` : this.apiDb``}
    `;

    return {
      data: rows,
      meta: {
        total,
        limit,
        offset,
        has_more: offset + rows.length < total,
        next_cursor: rows.length ? rows[rows.length - 1].id : null,
      },
    };
  }

  async findOne(id: number) {
    const [article] = await this.apiDb`
      SELECT
        n.id,
        n.title,
        n.body,
        n.photo_url,
        n.author_id,
        n.is_published,
        n.published_at,
        n.created_at,
        n.updated_at,
        u.username AS author_username,
        u.photo_url AS author_photo_url
      FROM news n
      LEFT JOIN users u ON u.id = n.author_id
      WHERE n.id = ${id} AND n.is_published = TRUE
    `;

    if (!article) throw new NotFoundException(`News #${id} not found`);

    const comments = await this.apiDb`
      SELECT
        c.id,
        c.body,
        c.author_id,
        c.created_at,
        c.updated_at,
        u.username,
        u.photo_url
      FROM comments c
      JOIN users u ON u.id = c.author_id
      WHERE c.news_id = ${id}
      ORDER BY c.created_at ASC
    `;

    return { ...article, comments };
  }

  async create(dto: CreateNewsDto, user: { id: number; role: string }) {
    const db = this.dbForUser(user);

    if (user.role !== 'admin') {
      await this.setRlsContext(db, user.id);
    }

    const [created] = await db`
      INSERT INTO news (title, body, photo_url, author_id, is_published)
      VALUES (
        ${dto.title},
        ${dto.body},
        ${dto.photo_url ?? null},
        ${user.id},
        ${dto.is_published ?? false}
      )
      RETURNING *
    `;

    return created;
  }

  async update(
    id: number,
    dto: UpdateNewsDto,
    user: { id: number; role: string },
  ) {
    const db = this.dbForUser(user);

    const [existing] = await db`
      SELECT *
      FROM news
      WHERE id = ${id}
    `;

    if (!existing) throw new NotFoundException(`News #${id} not found`);

    const isAdmin = user.role === 'admin';
    if (!isAdmin && existing.author_id !== user.id) {
      throw new ForbiddenException('You can only edit news you authored');
    }

    if (!isAdmin) {
      await this.setRlsContext(db, user.id);
    }

    const [updated] = await db`
      UPDATE news
      SET
        title        = COALESCE(${dto.title ?? null}, title),
        body         = COALESCE(${dto.body ?? null}, body),
        photo_url    = COALESCE(${dto.photo_url ?? null}, photo_url),
        is_published = COALESCE(${dto.is_published ?? null}, is_published),
        updated_at   = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    return updated;
  }

  async remove(id: number, user: { id: number; role: string }) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Only admins can delete news');
    }

    const [existing] = await this.adminDb`SELECT id FROM news WHERE id = ${id}`;
    if (!existing) throw new NotFoundException(`News #${id} not found`);

    await this.adminDb`DELETE FROM news WHERE id = ${id}`;
    return { message: 'News article deleted' };
  }

  async updatePhoto(
    id: number,
    photoUrl: string,
    user: { id: number; role: string },
  ) {
    const db = this.dbForUser(user);

    const [existing] = await db`SELECT * FROM news WHERE id = ${id}`;
    if (!existing) throw new NotFoundException(`News #${id} not found`);

    const isAdmin = user.role === 'admin';
    if (!isAdmin && existing.author_id !== user.id) {
      throw new ForbiddenException(
        'You can only update photos on news you authored',
      );
    }

    if (!isAdmin) {
      await this.setRlsContext(db, user.id);
    }

    const [updated] = await db`
      UPDATE news
      SET photo_url = ${photoUrl}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING photo_url
    `;

    return updated;
  }
}
