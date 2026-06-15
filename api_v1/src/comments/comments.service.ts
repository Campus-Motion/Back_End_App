import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import type { Sql } from 'postgres';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { QueryCommentsDto } from './dto/query-comments.dto';
import postgres from 'postgres';

@Injectable()
export class CommentsService {
  constructor(
    @Inject('API_DB') private sql: postgres.Sql<{}>,
    @Inject('ADMIN_DB') private admin_db: postgres.Sql<{}>,
  ) {}

  private async setRlsContext(userId: number) {
    await this
      .sql`SELECT set_config('app.current_user_id', ${String(userId)}, true)`;
  }

  async findAll(query: QueryCommentsDto, userId?: number) {
    const limit = Math.min(query.limit ?? 20, 100);
    const offset = query.offset ?? 0;

    console.log('Querying comments with:', { ...query, userId });

    if (!query.news_id && !query.activity_id) {
      throw new BadRequestException(
        'Either news_id or activity_id must be provided',
      );
    }
    if (query.news_id && query.activity_id) {
      throw new BadRequestException(
        'Provide only one of news_id or activity_id',
      );
    }

    if (query.activity_id) {
      if (!userId) {
        throw new ForbiddenException(
          'Authentication is required for activity comments',
        );
      }

      return this.sql.begin(async (sql: any) => {
        await sql`SELECT set_config('app.current_user_id', ${String(userId)}, true)`;

        const [activity] = await sql`
          SELECT id FROM activities WHERE id = ${query.activity_id}
        `;
        if (!activity) {
          throw new NotFoundException(
            `Activity #${query.activity_id} not found or access denied`,
          );
        }

        const comments = await sql`
          SELECT
            c.id,
            c.author_id,
            c.body,
            c.news_id,
            c.activity_id,
            c.created_at,
            c.updated_at,
            u.username,
            u.photo_url,
            u.role
          FROM comments c
          JOIN users u ON u.id = c.author_id
          WHERE c.activity_id = ${query.activity_id}
          ORDER BY c.created_at ASC
          LIMIT ${limit} OFFSET ${offset}
        `;

        const [{ total }] = await sql`
          SELECT COUNT(*)::int AS total
          FROM comments c
          WHERE c.activity_id = ${query.activity_id}
        `;

        return {
          data: comments,
          meta: {
            total,
            limit,
            offset,
            has_more: offset + comments.length < total,
          },
        };
      });
    } else if (query.news_id) {
      const [news] = await this.sql`
      SELECT id FROM news WHERE id = ${query.news_id}
    `;
      if (!news) {
        throw new NotFoundException(`News #${query.news_id} not found`);
      }

      const comments = await this.sql`
      SELECT
        c.id,
        c.author_id,
        c.body,
        c.news_id,
        c.activity_id,
        c.created_at,
        c.updated_at,
        u.username,
        u.photo_url,
        u.role
      FROM comments c
      JOIN users u ON u.id = c.author_id
      WHERE c.news_id = ${query.news_id}
      ORDER BY c.created_at ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

      const [{ total }] = await this.sql`
      SELECT COUNT(*)::int AS total
      FROM comments c
      WHERE c.news_id = ${query.news_id}
    `;

      return {
        data: comments,
        meta: {
          total,
          limit,
          offset,
          has_more: offset + comments.length < total,
        },
      };
    }
  }

  async create(dto: CreateCommentDto, userId: number) {
    if (!Number.isInteger(userId)) {
      throw new BadRequestException('Invalid authenticated user id');
    }

    if (!dto.news_id && !dto.activity_id) {
      throw new BadRequestException(
        'Either news_id or activity_id must be provided',
      );
    }
    if (dto.news_id && dto.activity_id) {
      throw new BadRequestException(
        'Provide only one of news_id or activity_id',
      );
    }

    const [created] = await this.sql`
    WITH set_ctx AS (
      SELECT set_config('app.current_user_id', ${String(userId)}, true)
    ),
    parent_check AS (
      SELECT 1
      FROM set_ctx
      WHERE
        (
          ${dto.news_id ?? null}::int IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM news WHERE id = ${dto.news_id ?? null}
          )
        )
        OR
        (
          ${dto.activity_id ?? null}::int IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM activities WHERE id = ${dto.activity_id ?? null}
          )
        )
    )
    INSERT INTO comments (author_id, body, news_id, activity_id)
    SELECT
      ${userId},
      ${dto.body},
      ${dto.news_id ?? null},
      ${dto.activity_id ?? null}
    FROM parent_check
    RETURNING *
  `;

    if (!created) {
      throw new NotFoundException(
        dto.activity_id
          ? `Activity #${dto.activity_id} not found or access denied`
          : `News #${dto.news_id} not found`,
      );
    }

    return created;
  }

  async update(id: number, dto: UpdateCommentDto, userId: number) {
    if (!Number.isInteger(userId)) {
      throw new BadRequestException('Invalid authenticated user id');
    }

    return this.sql.begin(async (sql: any) => {
      await sql`SELECT set_config('app.current_user_id', ${String(userId)}, true)`;

      const [existing] = await sql`
      SELECT * FROM comments WHERE id = ${id}
    `;
      if (!existing) {
        throw new NotFoundException(`Comment #${id} not found`);
      }

      if (existing.author_id !== userId) {
        throw new ForbiddenException('You can only edit your own comments');
      }

      const [updated] = await sql`
      UPDATE comments
      SET
        body = ${dto.body},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

      const [hydrated] = await sql`
      SELECT
        c.id,
        c.author_id,
        c.body,
        c.news_id,
        c.activity_id,
        c.created_at,
        c.updated_at,
        u.username,
        u.photo_url,
        u.role
      FROM comments c
      JOIN users u ON u.id = c.author_id
      WHERE c.id = ${updated.id}
    `;

      return hydrated;
    });
  }
  async remove(id: number, user: { id: number; role: string }) {
    const isModerator = user.role === 'moderator' || user.role === 'admin';

    // Moderator / Admin path: use admin DB connection (bypasses RLS)
    if (isModerator) {
      const [existing] = await this.admin_db`
      SELECT id, authorid FROM comments WHERE id = ${id}
    `;

      if (!existing) {
        throw new NotFoundException(`Comment #${id} not found`);
      }

      await this.admin_db`
      DELETE FROM comments WHERE id = ${id}
    `;

      return { message: 'Comment deleted' };
    }

    // Owner path: use API DB connection (RLS enforces ownership)
    return this.sql.begin(async (sql: any) => {
      await sql`SELECT set_config('app.current_user_id', ${String(user.id)}, true)`;

      const [existing] = await sql`
      SELECT id, authorid FROM comments WHERE id = ${id}
    `;

      if (!existing) {
        throw new NotFoundException(`Comment #${id} not found`);
      }

      if (existing.authorid !== user.id) {
        throw new ForbiddenException('You can only delete your own comments');
      }

      const deleted = await sql`
      DELETE FROM comments WHERE id = ${id}
      RETURNING id
    `;

      if (deleted.length === 0) {
        throw new NotFoundException(
          `Comment #${id} not found or access denied`,
        );
      }

      return { message: 'Comment deleted' };
    });
  }
}
