import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Sql } from 'postgres';
import { QueryNotificationsDto } from './dto/query-notifications.dto';

@Injectable()
export class NotificationsService {
  constructor(@Inject('API_DB') private readonly apiDb: Sql) {}

  async findAll(userId: number, query: QueryNotificationsDto) {
    const limit = query.limit ?? 20;
    const cursor = query.cursor;
    const isRead = query.is_read;

    return this.apiDb.begin(async (tx: any) => {
      await tx`SELECT set_config('app.current_user_id', ${String(userId)}, true)`;

      const rows = await tx`
        SELECT
          n.id,
          n.user_id,
          n.type,
          n.message,
          n.is_read,
          n.ref_id,
          n.ref_table,
          n.created_at
        FROM notifications n
        WHERE n.user_id = ${userId}
        ${cursor ? tx`AND n.id < ${cursor}` : tx``}
        ${isRead !== undefined ? tx`AND n.is_read = ${isRead}` : tx``}
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT ${limit}
      `;

      const totalRows = await tx`
        SELECT COUNT(*)::int AS total
        FROM notifications n
        WHERE n.user_id = ${userId}
        ${isRead !== undefined ? tx`AND n.is_read = ${isRead}` : tx``}
      `;

      const total = totalRows[0]?.total ?? 0;

      return {
        data: rows,
        meta: {
          total,
          limit,
          has_more: rows.length === limit,
          next_cursor: rows.length ? rows[rows.length - 1].id : null,
        },
      };
    });
  }

  async markOneRead(userId: number, id: number) {
    return this.apiDb.begin(async (tx: any) => {
      await tx`SELECT set_config('app.current_user_id', ${String(userId)}, true)`;

      const rows = await tx`
        UPDATE notifications n
        SET is_read = TRUE
        WHERE n.id = ${id}
          AND n.user_id = ${userId}
        RETURNING
          n.id,
          n.user_id,
          n.type,
          n.message,
          n.is_read,
          n.ref_id,
          n.ref_table,
          n.created_at
      `;

      if (!rows.length) {
        throw new NotFoundException(`Notification #${id} not found`);
      }

      return rows[0];
    });
  }

  async markAllRead(userId: number) {
    return this.apiDb.begin(async (tx: any) => {
      await tx`SELECT set_config('app.current_user_id', ${String(userId)}, true)`;

      const result = await tx`
        UPDATE notifications n
        SET is_read = TRUE
        WHERE n.user_id = ${userId}
          AND n.is_read = FALSE
      `;

      return {
        message: 'All notifications marked as read',
        updated_count: result.count ?? 0,
      };
    });
  }
}
