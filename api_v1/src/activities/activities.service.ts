import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import postgres from 'postgres';
import { CreateActivityDto } from './dto/create-activities.dto';

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

  async create(dto: CreateActivityDto, userId: number) {
    {
      return this.sql.begin(async (sql: any) => {
        await sql`SELECT set_config('app.current_user_id', ${userId.toString()}, true)`;
        const [activity] = await sql`
        INSERT INTO activities (title, type, user_id, body, is_public, event_id)
        VALUES (${dto.title}, ${dto.type}, ${userId}, ${dto.body ?? null}, ${dto.is_public}, ${dto.event_id ?? null})
        RETURNING *
      `;
        return activity;
      });
    }
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

  // ─── WAYPOINTS ───────────────────────────────────────────────────────────────

  async addWaypoints(
    userId: number,
    activityId: number,
    waypoints: {
      latitude: number;
      longitude: number;
      altitude_m?: number;
      recorded_at: string;
      sequence_order: number;
    }[],
  ) {
    return this.sql.begin(async (sql: any) => {
      await sql`SELECT set_config('app.current_user_id', ${userId.toString()}, true)`;

      const [activity] = await sql`
      SELECT id, user_id FROM activities WHERE id = ${activityId}
    `;
      if (!activity)
        throw new NotFoundException(
          `Activity #${activityId} not found or access denied`,
        );
      if (activity.user_id !== userId)
        throw new ForbiddenException(
          'You can only add waypoints to your own activities',
        );

      const rows = waypoints.map((wp) => ({
        activity_id: activityId,
        latitude: wp.latitude,
        longitude: wp.longitude,
        altitude_m: wp.altitude_m ?? null,
        recorded_at: wp.recorded_at,
        sequence_order: wp.sequence_order,
      }));

      const inserted = await sql`
      INSERT INTO activity_waypoints ${sql(rows)}
      RETURNING *
    `;

      return { inserted: inserted.length, waypoints: inserted };
    });
  }

  async getWaypoints(userId: number, activityId: number) {
    return this.sql.begin(async (sql: any) => {
      await sql`SELECT set_config('app.current_user_id', ${userId.toString()}, true)`;

      const [activity] =
        await sql`SELECT id FROM activities WHERE id = ${activityId}`;
      if (!activity)
        throw new NotFoundException(
          `Activity #${activityId} not found or access denied`,
        );

      return sql`
      SELECT id, sequence_order, recorded_at, latitude, longitude, altitude_m
      FROM activity_waypoints
      WHERE activity_id = ${activityId}
      ORDER BY sequence_order ASC
    `;
    });
  }

  // ─── PHOTOS ────────────────────────────────────────────────────────────────

  async addPhoto(
    userId: number,
    activityId: number,
    photoUrl: string,
    position: number = 0,
  ) {
    return this.sql.begin(async (sql: any) => {
      await sql`SELECT set_config('app.current_user_id', ${userId.toString()}, true)`;

      // RLS will block SELECT if private + not owner — use it to gate access
      const [activity] = await sql`
      SELECT id, user_id FROM activities WHERE id = ${activityId}
    `;
      if (!activity)
        throw new NotFoundException(
          `Activity #${activityId} not found or access denied`,
        );
      if (activity.user_id !== userId)
        throw new ForbiddenException(
          'You can only add photos to your own activities',
        );

      const [photo] = await sql`
      INSERT INTO activity_photos (activity_id, photo_url, position)
      VALUES (${activityId}, ${photoUrl}, ${position})
      RETURNING *
    `;
      return photo;
    });
  }

  async getPhotos(userId: number, activityId: number) {
    return this.sql.begin(async (sql: any) => {
      await sql`SELECT set_config('app.current_user_id', ${userId.toString()}, true)`;

      // This SELECT goes through RLS — 404s if private + not owner
      const [activity] =
        await sql`SELECT id FROM activities WHERE id = ${activityId}`;
      if (!activity)
        throw new NotFoundException(
          `Activity #${activityId} not found or access denied`,
        );

      return sql`
      SELECT * FROM activity_photos
      WHERE activity_id = ${activityId}
      ORDER BY position ASC, created_at ASC
    `;
    });
  }

  async removePhoto(userId: number, activityId: number, photoId: number) {
    return this.sql.begin(async (sql: any) => {
      await sql`SELECT set_config('app.current_user_id', ${userId.toString()}, true)`;

      // Verify ownership — RLS on activities guarantees the user can see it
      const [activity] = await sql`
      SELECT user_id FROM activities WHERE id = ${activityId}
    `;
      if (!activity)
        throw new NotFoundException(
          `Activity #${activityId} not found or access denied`,
        );
      if (activity.user_id !== userId)
        throw new ForbiddenException(
          'You can only delete photos from your own activities',
        );

      const result = await sql`
      DELETE FROM activity_photos
      WHERE id = ${photoId} AND activity_id = ${activityId}
      RETURNING id
    `;
      if (result.length === 0)
        throw new NotFoundException(`Photo #${photoId} not found`);

      return { message: 'Photo deleted' };
    });
  }
}
