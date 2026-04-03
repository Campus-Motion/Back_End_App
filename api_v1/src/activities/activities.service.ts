import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import postgres from 'postgres';

@Injectable()
export class ActivitiesService {
  constructor(@Inject('API_DB') private sql: postgres.Sql<{}>) {}

  async findAll(
    userId: number,
    limit: number,
    offset: number,
    type?: string,
    isPublic?: boolean,
  ) {
    return this.sql.begin(async (sql: any) => {
      await sql`SELECT set_config('app.current_user_id', ${userId.toString()}, true)`;

      // Dynamic query building for filters
      const activities = await sql`
        SELECT * FROM activities
        WHERE 1=1
        ${type ? sql`AND type = ${type}` : sql``}
        ${isPublic !== undefined ? sql`AND is_public = ${isPublic}` : sql``}
        ORDER BY created_at DESC
        LIMIT ${Math.min(limit, 100)} OFFSET ${offset}
      `;

      // Get total count for pagination meta
      const [{ count }] = await sql`
        SELECT count(*)::int FROM activities
        WHERE 1=1
        ${type ? sql`AND type = ${type}` : sql``}
        ${isPublic !== undefined ? sql`AND is_public = ${isPublic}` : sql``}
      `;

      return {
        data: activities,
        meta: {
          total: count,
          limit,
          offset,
          has_more: offset + activities.length < count,
        },
      };
    });
  }

  async findOne(userId: number, id: number) {
    return this.sql.begin(async (sql: any) => {
      await sql`SELECT set_config('app.current_user_id', ${userId.toString()}, true)`;
      const [activity] = await sql`SELECT * FROM activities WHERE id = ${id}`;

      if (!activity) {
        throw new NotFoundException(
          `Activity #${id} not found or access denied`,
        );
      }
      return activity;
    });
  }

  async create(
    userId: number,
    title: string,
    type: string,
    body?: string,
    isPublic: boolean = false,
    eventId?: number,
  ) {
    return this.sql.begin(async (sql: any) => {
      await sql`SELECT set_config('app.current_user_id', ${userId.toString()}, true)`;
      const [activity] = await sql`
        INSERT INTO activities (title, type, user_id, body, is_public, event_id)
        VALUES (${title}, ${type}, ${userId}, ${body ?? null}, ${isPublic}, ${eventId ?? null})
        RETURNING *
      `;
      return activity;
    });
  }

  async update(
    userId: number,
    id: number,
    updates: {
      title?: string;
      type?: string;
      body?: string;
      is_public?: boolean;
    },
  ) {
    return this.sql.begin(async (sql: any) => {
      await sql`SELECT set_config('app.current_user_id', ${userId.toString()}, true)`;

      // First check if it exists and belongs to user
      const [existing] =
        await sql`SELECT user_id FROM activities WHERE id = ${id}`;
      if (!existing) throw new NotFoundException(`Activity #${id} not found`);
      if (existing.user_id !== userId)
        throw new ForbiddenException('You can only edit your own activities');

      // Build dynamic update
      const [updatedActivity] = await sql`
        UPDATE activities SET
          title = COALESCE(${updates.title ?? null}, title),
          type = COALESCE(${updates.type ?? null}, type),
          body = COALESCE(${updates.body ?? null}, body),
          is_public = COALESCE(${updates.is_public ?? null}, is_public),
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      return updatedActivity;
    });
  }

  async remove(userId: number, id: number) {
    return this.sql.begin(async (sql: any) => {
      await sql`SELECT set_config('app.current_user_id', ${userId.toString()}, true)`;

      // postgres.js tagged templates let us delete and check in one step
      const result =
        await sql`DELETE FROM activities WHERE id = ${id} RETURNING id`;

      if (result.length === 0) {
        // If nothing was deleted, it either doesn't exist or RLS blocked it (not owner)
        throw new NotFoundException(
          `Activity #${id} not found or access denied`,
        );
      }

      return { message: 'Activity deleted successfully' };
    });
  }
}
