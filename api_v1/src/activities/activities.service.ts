import { Injectable, Inject } from '@nestjs/common';
import postgres from 'postgres';

@Injectable()
export class ActivitiesService {
  constructor(@Inject('API_DB') private sql: postgres.Sql<{}>) {}

  async findAll(userId: number) {
    return this.sql.begin(async (sql: any) => {
      // ← any unblocks TS
      await sql`SELECT set_config('app.current_user_id', ${userId.toString()}, true)`;
      return sql`SELECT * FROM activities ORDER BY created_at DESC`;
    });
  }

  async create(userId: number, title: string, type: string, body?: string) {
    return this.sql.begin(async (sql: any) => {
      // ← any unblocks TS
      await sql`SELECT set_config('app.current_user_id', ${userId.toString()}, true)`;
      const [activity] = await sql`
        INSERT INTO activities (title, type, user_id, body)
        VALUES (${title}, ${type}, ${userId}, ${body ?? null})
        RETURNING *
      `;
      return activity;
    });
  }
}
