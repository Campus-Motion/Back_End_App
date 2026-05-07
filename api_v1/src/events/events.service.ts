import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { Sql } from 'postgres';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { QueryEventDto, QueryParticipantsDto } from './dto/query-event.dto';
import { JoinAsGuestDto } from './dto/join-as-guest.dto';

@Injectable()
export class EventsService {
  constructor(@Inject('API_DB') private readonly sql: Sql) {}

  // ─── helpers ────────────────────────────────────────────────────────────────

  /** Set RLS context so DB policies know who is acting. */
  private async setRlsContext(userId: number): Promise<void> {
    await this
      .sql`SELECT set_config('app.current_user_id', ${String(userId)}, true)`;
  }

  // ─── GET /events ─────────────────────────────────────────────────────────────

  async findAll(query: QueryEventDto) {
    const limit = Math.min(query.limit ?? 20, 100);
    const offset = query.offset ?? 0;
    const after = query.after ? new Date(query.after) : null;
    const before = query.before ? new Date(query.before) : null;

    // Build the WHERE clause dynamically using sql fragments
    const rows = await this.sql`
      SELECT
        e.id,
        e.title,
        e.body,
        e.user_id,
        e.start_location_id,
        e.end_location_id,
        e.start_time,
        e.strava_url,
        e.type,
        e.end_time,
        e.distance_m,
        e.created_at,
        COUNT(ep.user_id)::int AS participant_count
      FROM events e
      LEFT JOIN event_participants ep ON ep.event_id = e.id
      WHERE TRUE
        ${after ? this.sql`AND e.start_time > ${after}` : this.sql``}
        ${before ? this.sql`AND e.start_time < ${before}` : this.sql``}
      GROUP BY e.id
      ORDER BY e.start_time ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [{ total }] = await this.sql`
      SELECT COUNT(*)::int AS total
      FROM events e
      WHERE TRUE
        ${after ? this.sql`AND e.start_time > ${after}` : this.sql``}
        ${before ? this.sql`AND e.start_time < ${before}` : this.sql``}
    `;

    return {
      data: rows,
      meta: {
        total,
        limit,
        offset,
        has_more: offset + rows.length < total,
      },
    };
  }

  // ─── GET /events/:id ─────────────────────────────────────────────────────────

  async findOne(id: number) {
    const [event] = await this.sql`
      SELECT
        e.id,
        e.title,
        e.body,
        e.user_id,
        e.start_location_id,
        e.end_location_id,
        e.start_time,
        e.end_time,
        e.distance_m,
        e.type,
        e.strava_url,
        e.created_at,
        COUNT(ep.user_id)::int AS participant_count
      FROM events e
      LEFT JOIN event_participants ep ON ep.event_id = e.id
      WHERE e.id = ${id}
      GROUP BY e.id
    `;

    if (!event) throw new NotFoundException(`Event #${id} not found`);

    // Include the first page of participants inline
    const participants = await this.sql`
      SELECT u.id, u.username, u.photo_url, u.role, ep.joined_at
      FROM event_participants ep
      JOIN users u ON u.id = ep.user_id
      WHERE ep.event_id = ${id}
      ORDER BY ep.joined_at ASC
      LIMIT 20
    `;

    return { ...event, participants };
  }

  // ─── POST /events ─────────────────────────────────────────────────────────────

  async create(dto: CreateEventDto, userId: number) {
    const [event] = await this.sql`
      INSERT INTO events (
        title, body, user_id,
        start_time, end_time, type,
        distance_m, strava_url, start_location_id, end_location_id
      ) VALUES (
        ${dto.title},
        ${dto.body ?? null},
        ${userId},
        ${new Date(dto.start_time)},
        ${dto.end_time ? new Date(dto.end_time) : null},
        ${dto.type},
        ${dto.distance_m ?? null},
        ${dto.strava_url ?? null},
        ${dto.start_location_id ?? null},
        ${dto.end_location_id ?? null}
      )
      RETURNING *
    `;
    return event;
  }

  // ─── PUT /events/:id ─────────────────────────────────────────────────────────

  async update(
    id: number,
    dto: UpdateEventDto,
    requestingUser: { id: number; role: string },
  ) {
    const [existing] = await this.sql`SELECT * FROM events WHERE id = ${id}`;
    if (!existing) throw new NotFoundException(`Event #${id} not found`);

    // Only the creator or an admin can edit
    const isAdmin = requestingUser.role === 'admin';
    if (!isAdmin && existing.user_id !== requestingUser.id) {
      throw new ForbiddenException('You can only edit events you created');
    }

    const [updated] = await this.sql`
      UPDATE events SET
        title             = COALESCE(${dto.title ?? null}, title),
        body              = COALESCE(${dto.body ?? null}, body),
        start_time        = COALESCE(${dto.start_time ? new Date(dto.start_time) : null}, start_time),
        end_time          = COALESCE(${dto.end_time ? new Date(dto.end_time) : null}, end_time),
        distance_m        = COALESCE(${dto.distance_m ?? null}, distance_m),
        type              = COALESCE(${dto.type ?? null}, type),
        strava_url       = COALESCE(${dto.strava_url ?? null}, strava_url),
        start_location_id = COALESCE(${dto.start_location_id ?? null}, start_location_id),
        end_location_id   = COALESCE(${dto.end_location_id ?? null}, end_location_id)
      WHERE id = ${id}
      RETURNING *
    `;
    return updated;
  }

  // ─── DELETE /events/:id ───────────────────────────────────────────────────────

  async remove(id: number) {
    const [existing] = await this.sql`SELECT id FROM events WHERE id = ${id}`;
    if (!existing) throw new NotFoundException(`Event #${id} not found`);

    await this.sql`DELETE FROM events WHERE id = ${id}`;
    return { message: 'Event deleted' };
  }

  // ─── POST /events/:id/participants ────────────────────────────────────────────

  async joinEvent(eventId: number, userId: number) {
    const [event] = await this.sql`SELECT id FROM events WHERE id = ${eventId}`;
    if (!event) throw new NotFoundException(`Event #${eventId} not found`);

    try {
      const [row] = await this.sql`
        INSERT INTO event_participants (user_id, event_id)
        VALUES (${userId}, ${eventId})
        RETURNING joined_at
      `;
      return { message: 'Joined event successfully', joined_at: row.joined_at };
    } catch (err: any) {
      // Postgres unique violation → already joined
      if (err.code === '23505') {
        throw new ConflictException('You have already joined this event');
      }
      throw err;
    }
  }

  // ─── DELETE /events/:id/participants ─────────────────────────────────────────

  async leaveEvent(eventId: number, userId: number) {
    const [event] = await this.sql`SELECT id FROM events WHERE id = ${eventId}`;
    if (!event) throw new NotFoundException(`Event #${eventId} not found`);

    const result = await this.sql`
      DELETE FROM event_participants
      WHERE event_id = ${eventId} AND user_id = ${userId}
    `;

    if (result.count === 0) {
      throw new NotFoundException('You are not a participant of this event');
    }
    return { message: 'Left event successfully' };
  }

  // ─── POST /events/:id/guest_participants ──────────────────────────────────────

  async addGuestParticipant(eventId: number, dto: JoinAsGuestDto) {
    const [event] = await this.sql`SELECT id FROM events WHERE id = ${eventId}`;
    if (!event) throw new NotFoundException(`Event #${eventId} not found`);

    const token = await this.sql`
      INSERT INTO event_guest_participants (event_id, display_name, telegram)
      VALUES (${eventId}, ${dto.display_name}, ${dto.telegram ?? null})
      RETURNING token
    `;
    return token;
  }

  // ─── DELETE /events/:id/guest_participants ──────────────────────────────────────

  async removeGuestParticipant(eventId: number, token: string) {
    const [event] = await this.sql`SELECT id FROM events WHERE id = ${eventId}`;
    if (!event) throw new NotFoundException(`Event #${eventId} not found`);

    const result = await this.sql`
      DELETE FROM event_guest_participants
      WHERE event_id = ${eventId} AND token = ${token}
    `;

    if (result.count === 0) {
      throw new NotFoundException('Guest participant not found');
    }
    return { message: 'Guest participant removed successfully' };
  }

  // ─── GET /events/:id/participants ─────────────────────────────────────────────

  async findParticipants(eventId: number, query: QueryParticipantsDto) {
    const [event] = await this.sql`SELECT id FROM events WHERE id = ${eventId}`;
    if (!event) throw new NotFoundException(`Event #${eventId} not found`);

    const limit = Math.min(query.limit ?? 20, 100);
    const offset = query.offset ?? 0;

    const participants = await this.sql`
      SELECT u.id, u.username, u.photo_url, u.role, ep.joined_at
      FROM event_participants ep
      JOIN users u ON u.id = ep.user_id
      WHERE ep.event_id = ${eventId}
      ORDER BY ep.joined_at ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const guest_participants = await this.sql`
      SELECT display_name, telegram, created_at
      FROM event_guest_participants
      WHERE event_id = ${eventId}
      ORDER BY created_at ASC
    `;

    const [{ total }] = await this.sql`
      SELECT COUNT(*)::int AS total
      FROM event_participants 
      WHERE event_id = ${eventId}
    `;

    const guest_total = await this.sql`
      SELECT COUNT(*)::int AS total
      FROM event_guest_participants
      WHERE event_id = ${eventId}
    `;

    const totalCount = total + guest_total[0].total;

    return {
      data: [...participants, ...guest_participants],
      meta: {
        total: totalCount,
        limit,
        offset,
        has_more: offset + participants.length < total,
      },
    };
  }
  // ─── PHOTOS ──────────────────────────────────────────────────────────────────

  async addPhoto(
    eventId: number,
    photoUrl: string,
    requestingUser: { id: number; role: string },
    position: number = 0,
  ) {
    const [event] = await this
      .sql`SELECT id, user_id FROM events WHERE id = ${eventId}`;
    if (!event) throw new NotFoundException(`Event #${eventId} not found`);

    const isAdmin = requestingUser.role === 'admin';
    if (!isAdmin && event.user_id !== requestingUser.id) {
      throw new ForbiddenException(
        'You can only add photos to events you created',
      );
    }

    const [photo] = await this.sql`
    INSERT INTO event_photos (event_id, photo_url, position)
    VALUES (${eventId}, ${photoUrl}, ${position})
    RETURNING *
  `;
    return photo;
  }

  async getPhotos(eventId: number) {
    const [event] = await this.sql`SELECT id FROM events WHERE id = ${eventId}`;
    if (!event) throw new NotFoundException(`Event #${eventId} not found`);

    return this.sql`
    SELECT * FROM event_photos
    WHERE event_id = ${eventId}
    ORDER BY position ASC, created_at ASC
  `;
  }

  async removePhoto(
    eventId: number,
    photoId: number,
    requestingUser: { id: number; role: string },
  ) {
    const [event] = await this
      .sql`SELECT id, user_id FROM events WHERE id = ${eventId}`;
    if (!event) throw new NotFoundException(`Event #${eventId} not found`);

    const isAdmin = requestingUser.role === 'admin';
    if (!isAdmin && event.user_id !== requestingUser.id) {
      throw new ForbiddenException(
        'You can only delete photos from events you created',
      );
    }

    const result = await this.sql`
    DELETE FROM event_photos
    WHERE id = ${photoId} AND event_id = ${eventId}
    RETURNING id
  `;
    if (result.length === 0)
      throw new NotFoundException(`Photo #${photoId} not found`);

    return { message: 'Photo deleted' };
  }
}
