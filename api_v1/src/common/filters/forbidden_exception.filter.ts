// src/common/filters/forbidden-exception.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Sql } from 'postgres';

@Catch(ForbiddenException)
export class ForbiddenExceptionFilter implements ExceptionFilter {
  constructor(@Inject('AUDIT_DB') private readonly auditDb: Sql) {}

  async catch(exception: ForbiddenException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const status = exception.getStatus(); // always 403

    // req.user is attached by JwtGuard — may be undefined if JWT itself was invalid
    const user = (req as any).user as
      | { id: number; username: string; role: string }
      | undefined;

    try {
      await this.auditDb`
        INSERT INTO audit_log (
          user_id, username, action,
          target_table, target_id,
          outcome,
          ip_address, user_agent,
          http_method, endpoint
        ) VALUES (
          ${user?.id ?? null},
          ${user?.username ?? null},
          ${'auth.forbidden'}::audit_action,
          ${null},
          ${null},
          'failure',
          ${req.ip ?? null},
          ${req.headers['user-agent'] ?? null},
          ${req.method},
          ${req.originalUrl}
        )
      `;
    } catch (err) {
      // Never block the response if audit write fails
      console.error('[AuditLog] Failed to write 403 entry:', err);
    }

    res.status(status).json({
      statusCode: status,
      message: exception.message,
      error: 'Forbidden',
    });
  }
}
