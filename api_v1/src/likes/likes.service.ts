import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import postgres from 'postgres';
import { CreateLikeDto } from './dto/create-like.dto';
import { DeleteLikeDto } from './dto/delete-like.dto';
import { QueryLikesDto } from './dto/query-likes.dto';

@Injectable()
export class LikesService {
  constructor(@Inject('API_DB') private sql: postgres.Sql<{}>) {}

  // ─── GET /likes ───────────────────────────────────────────────────────────────

  async getCount(query: QueryLikesDto, userId?: number) {
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
          'Authentication is required to view activity likes',
        );
      }

      const [row] = await this.sql`
        WITH set_ctx AS (
          SELECT set_config('app.current_user_id', ${String(userId)}, true)
        ),
        activity_check AS (
          SELECT id FROM activities, set_ctx
          WHERE id = ${query.activity_id}
        ),
        like_count AS (
          SELECT COUNT(*)::int AS total
          FROM likes
          WHERE activity_id = ${query.activity_id}
        ),
        my_like AS (
          SELECT 1 AS found
          FROM likes
          WHERE activity_id = ${query.activity_id} AND user_id = ${userId}
        )
        SELECT
          (SELECT total FROM like_count)          AS count,
          (SELECT found IS NOT NULL FROM my_like) AS liked_by_me,
          (SELECT id FROM activity_check)         AS activity_id
        FROM set_ctx
      `;

      if (!row.activity_id) {
        throw new NotFoundException(
          `Activity #${query.activity_id} not found or access denied`,
        );
      }

      return { count: row.count, liked_by_me: !!row.liked_by_me };
    } else if (query.news_id) {
      console.log(userId); // news — public, userId optional for liked_by_me
      const [row] = await this.sql`
      WITH news_check AS (
        SELECT id FROM news
        WHERE id = ${query.news_id} AND is_published = TRUE
      ),
      like_count AS (
        SELECT COUNT(*)::int AS total FROM likes WHERE news_id = ${query.news_id}
      ),
      my_like AS (
        SELECT 1 AS found FROM likes
        WHERE news_id = ${query.news_id}
          AND user_id = ${userId ?? null}
          AND ${userId ?? null}::int IS NOT NULL
      )
      SELECT
        (SELECT total FROM like_count)          AS count,
        (SELECT found IS NOT NULL FROM my_like) AS liked_by_me,
        (SELECT id FROM news_check)             AS news_id
    `;

      if (!row.news_id) {
        throw new NotFoundException(`News #${query.news_id} not found`);
      }

      return { count: row.count, liked_by_me: !!row.liked_by_me };
    }
  }

  // ─── POST /likes ──────────────────────────────────────────────────────────────

  async create(dto: CreateLikeDto, user: { id: number; username: string }) {
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

    if (dto.activity_id) {
      let like: any;
      try {
        // 1. Set RLS as liker → insert like (RLS: user_id must match current_user_id)
        // 2. Switch RLS to owner → insert notification (RLS: user_id must match current_user_id)
        [like] = await this.sql`
          WITH set_ctx AS (
            SELECT set_config('app.current_user_id', ${String(user.id)}, true)
          ),
          parent AS (
            SELECT id, user_id, title FROM activities, set_ctx
            WHERE id = ${dto.activity_id}
          ),
          new_like AS (
            INSERT INTO likes (user_id, activity_id)
            SELECT ${user.id}, id FROM parent
            RETURNING *
          ),
          set_ctx_owner AS (
            SELECT set_config(
              'app.current_user_id',
              (SELECT user_id::text FROM parent),
              true
            )
            FROM parent
            WHERE user_id <> ${user.id}
          ),
          notif AS (
            INSERT INTO notifications (user_id, type, message, ref_id, ref_table)
            SELECT
              parent.user_id,
              'like',
              ${user.username} || ' liked your activity "' || parent.title || '"',
              parent.id,
              'activities'
            FROM parent, set_ctx_owner
            WHERE parent.user_id <> ${user.id}
          )
          SELECT * FROM new_like
        `;
      } catch (err: any) {
        if (err.code === '23505')
          throw new ConflictException('You already liked this');
        throw err;
      }

      if (!like) {
        throw new NotFoundException(
          `Activity #${dto.activity_id} not found or access denied`,
        );
      }

      return like;
    } else if (dto.news_id) {
      // news like
      let like: any;
      try {
        [like] = await this.sql`
        WITH parent AS (
          SELECT id, author_id, title FROM news
          WHERE id = ${dto.news_id} AND is_published = TRUE
        ),
        new_like AS (
          INSERT INTO likes (user_id, news_id)
          SELECT ${user.id}, id FROM parent
          RETURNING *
        ),
        set_ctx_owner AS (
          SELECT set_config(
            'app.current_user_id',
            (SELECT author_id::text FROM parent),
            true
          )
          FROM parent
          WHERE author_id <> ${user.id}
        ),
        notif AS (
          INSERT INTO notifications (user_id, type, message, ref_id, ref_table)
          SELECT
            parent.author_id,
            'like',
            ${user.username} || ' liked the news article "' || parent.title || '"',
            parent.id,
            'news'
          FROM parent, set_ctx_owner
          WHERE parent.author_id <> ${user.id}
        )
        SELECT * FROM new_like
      `;
      } catch (err: any) {
        if (err.code === '23505')
          throw new ConflictException('You already liked this');
        throw err;
      }

      if (!like) {
        throw new NotFoundException(`News #${dto.news_id} not found`);
      }

      return like;
    }
  }

  // ─── DELETE /likes ────────────────────────────────────────────────────────────

  async remove(dto: DeleteLikeDto, user: { id: number }) {
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

    if (dto.activity_id) {
      const [deleted] = await this.sql`
        WITH set_ctx AS (
          SELECT set_config('app.current_user_id', ${String(user.id)}, true)
        )
        DELETE FROM likes
        USING set_ctx
        WHERE activity_id = ${dto.activity_id} AND user_id = ${user.id}
        RETURNING id
      `;

      if (!deleted) throw new NotFoundException('Like not found');
      return { message: 'Like removed' };
    } else if (dto.news_id) {
      const [deleted] = await this.sql`
      DELETE FROM likes
      WHERE news_id = ${dto.news_id} AND user_id = ${user.id}
      RETURNING id
    `;

      if (!deleted) throw new NotFoundException('Like not found');
      return { message: 'Like removed' };
    }
  }
}
