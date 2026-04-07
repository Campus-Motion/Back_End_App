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

@Injectable()
export class EventsService {
  constructor(@Inject('API_DB') private readonly sql: Sql) {}

  // ─── helpers ────────────────────────────────────────────────────────────────

  /** Set RLS context so DB policies know who is acting. */
  private async setRlsContext(userId: number): Promise<void> {
    await this.sql`SELECT set_config('app.current_user_id', ${String(userId)}, true)`;
  }

  // ─── GET /events ─────────────────────────────────────────────────────────────

  async findAll(query: QueryEventDto) {
    const limit  = Math.min(query.limit  ?? 20, 100);
    const offset = query.offset ?? 0;
    const after  = query.after  ? new Date(query.after)  : null;
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
        e.end_time,
        e.distance_m,
        e.created_at,
        COUNT(ep.user_id)::int AS participant_count
      FROM events e
      LEFT JOIN event_participants ep ON ep.event_id = e.id
      WHERE TRUE
        ${after  ? this.sql`AND e.start_time > ${after}`  : this.sql``}
        ${before ? this.sql`AND e.start_time < ${before}` : this.sql``}
      GROUP BY e.id
      ORDER BY e.start_time ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [{ total }] = await this.sql`
      SELECT COUNT(*)::int AS total
      FROM events e
      WHERE TRUE
        ${after  ? this.sql`AND e.start_time > ${after}`  : this.sql``}
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
        start_time, end_time,
        distance_m, start_location_id, end_location_id
      ) VALUES (
        ${dto.title},
        ${dto.body       ?? null},
        ${userId},
        ${new Date(dto.start_time)},
        ${dto.end_time   ? new Date(dto.end_time) : null},
        ${dto.distance_m ?? null},
        ${dto.start_location_id ?? null},
        ${dto.end_location_id   ?? null}
      )
      RETURNING *
    `;
    return event;
  }

  // ─── PUT /events/:id ─────────────────────────────────────────────────────────

  async update(id: number, dto: UpdateEventDto, requestingUser: { id: number; role: string }) {
    const [existing] = await this.sql`SELECT * FROM events WHERE id = ${id}`;
    if (!existing) throw new NotFoundException(`Event #${id} not found`);

    // Only the creator or an admin can edit
    const isAdmin = requestingUser.role === 'admin';
    if (!isAdmin && existing.user_id !== requestingUser.id) {
      throw new ForbiddenException('You can only edit events you created');
    }

    const [updated] = await this.sql`
      UPDATE events SET
        title             = COALESCE(${dto.title             ?? null}, title),
        body              = COALESCE(${dto.body              ?? null}, body),
        start_time        = COALESCE(${dto.start_time        ? new Date(dto.start_time) : null}, start_time),
        end_time          = COALESCE(${dto.end_time          ? new Date(dto.end_time)   : null}, end_time),
        distance_m        = COALESCE(${dto.distance_m        ?? null}, distance_m),
        start_location_id = COALESCE(${dto.start_location_id ?? null}, start_location_id),
        end_location_id   = COALESCE(${dto.end_location_id   ?? null}, end_location_id)
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

  // ─── GET /events/:id/participants ─────────────────────────────────────────────

  async findParticipants(eventId: number, query: QueryParticipantsDto) {
    const [event] = await this.sql`SELECT id FROM events WHERE id = ${eventId}`;
    if (!event) throw new NotFoundException(`Event #${eventId} not found`);

    const limit  = Math.min(query.limit  ?? 20, 100);
    const offset = query.offset ?? 0;

    const participants = await this.sql`
      SELECT u.id, u.username, u.photo_url, u.role, ep.joined_at
      FROM event_participants ep
      JOIN users u ON u.id = ep.user_id
      WHERE ep.event_id = ${eventId}
      ORDER BY ep.joined_at ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [{ total }] = await this.sql`
      SELECT COUNT(*)::int AS total
      FROM event_participants
      WHERE event_id = ${eventId}
    `;

    return {
      data: participants,
      meta: {
        total,
        limit,
        offset,
        has_more: offset + participants.length < total,
      },
    };
  }
}
