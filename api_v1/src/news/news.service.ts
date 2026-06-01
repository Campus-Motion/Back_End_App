import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Sql, TransactionSql } from 'postgres';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { QueryNewsDto } from './dto/query-news.dto';

@Injectable()
export class NewsService {
  constructor(
    @Inject('API_DB') private readonly apiDb: Sql,
    @Inject('ADMIN_DB') private readonly adminDb: Sql,
  ) {}

  private dbForUser(user: { id: number; role: string }): Sql {
    return user.role === 'admin' ? this.adminDb : this.apiDb;
  }

  async findAll(query: QueryNewsDto, includeDrafts = false) {
    const limit = Math.min(query.limit ?? 20, 100);
    const offset = query.offset ?? 0;
    const cursor = query.cursor ?? null;
    const before = query.before ? new Date(query.before) : null;

    const db = includeDrafts ? this.adminDb : this.apiDb;
    const publishedFilter = includeDrafts
      ? this.apiDb`TRUE`
      : this.apiDb`n.is_published = TRUE`;

    const rows = await db`
      SELECT
        n.id, n.title, n.body, n.photo_url, n.author_id,
        n.is_published, n.published_at, n.created_at, n.updated_at
      FROM news n
      WHERE ${publishedFilter}
        ${cursor ? this.apiDb`AND n.id < ${cursor}` : this.apiDb``}
        ${before ? this.apiDb`AND COALESCE(n.published_at, n.created_at) < ${before}` : this.apiDb``}
      ORDER BY COALESCE(n.published_at, n.created_at) DESC, n.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [{ total }] = await this.apiDb`
      SELECT COUNT(*)::int AS total
      FROM news n
      WHERE ${publishedFilter}
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
        n.id, n.title, n.body, n.photo_url, n.author_id,
        n.is_published, n.published_at, n.created_at, n.updated_at,
        u.username AS author_username,
        u.photo_url AS author_photo_url
      FROM news n
      LEFT JOIN users u ON u.id = n.author_id
      WHERE n.id = ${id} AND n.is_published = TRUE
    `;

    if (!article) throw new NotFoundException(`News #${id} not found`);

    const comments = await this.apiDb`
      SELECT c.id, c.body, c.author_id, c.created_at, c.updated_at,
             u.username, u.photo_url
      FROM comments c
      JOIN users u ON u.id = c.author_id
      WHERE c.news_id = ${id}
      ORDER BY c.created_at ASC
    `;

    return { ...article, comments };
  }

  async create(dto: CreateNewsDto, user: { id: number; role: string }) {
    const db = this.dbForUser(user);

    const [created] = await db`
      WITH set_ctx AS (
        SELECT set_config('app.current_user_id', ${String(user.id)}, true)
      )
      INSERT INTO news (title, body, photo_url, author_id, is_published)
      SELECT ${dto.title}, ${dto.body}, ${dto.photo_url ?? null},
             ${user.id}, ${dto.is_published ?? false}
      FROM set_ctx
      RETURNING *
    `;

    return created;
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

  async update(
    id: number,
    dto: UpdateNewsDto,
    user: { id: number; role: string },
  ) {
    const [existing] = await this.adminDb`SELECT * FROM news WHERE id = ${id}`;
    if (!existing) throw new NotFoundException(`News #${id} not found`);

    if (user.role !== 'admin' && existing.author_id !== user.id) {
      throw new ForbiddenException('You can only edit news you authored');
    }

    console.log('update news', { id, dto, user });

    if (user.role === 'admin') {
      const [updated] = await this.adminDb`
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
    } else {
      const updated = await this.apiDb.begin(async (tx: TransactionSql) => {
        await (tx as unknown as Sql)`SELECT set_config('app.current_user_id', ${String(user.id)}, true)`;

        const rows = await (tx as unknown as Sql)`
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

        return rows[0];
      });

      if (!updated)
        throw new NotFoundException(`News #${id} not found or not editable`);
      return updated;
    }
  }

  async updatePhoto(
    id: number,
    photoUrl: string,
    user: { id: number; role: string },
  ) {
    const [existing] = await this.adminDb`SELECT * FROM news WHERE id = ${id}`;
    if (!existing) throw new NotFoundException(`News #${id} not found`);

    if (user.role !== 'admin' && existing.author_id !== user.id) {
      throw new ForbiddenException(
        'You can only update photos on news you authored',
      );
    }

    if (user.role === 'admin') {
      const [updated] = await this.adminDb`
      UPDATE news
      SET photo_url = ${photoUrl}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING photo_url
    `;
      return updated;
    }

    const updated = await this.apiDb.begin(async (tx: TransactionSql) => {
      await (tx as unknown as Sql)`SELECT set_config('app.current_user_id', ${String(user.id)}, true)`;

      const rows = await (tx as unknown as Sql)`
      UPDATE news
      SET photo_url = ${photoUrl}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING photo_url
    `;

      return rows[0];
    });

    if (!updated)
      throw new NotFoundException(`News #${id} not found or not editable`);
    return updated;
  }
}
