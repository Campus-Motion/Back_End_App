import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Sends validation errors with `message` as one string instead of an array,
 * e.g. "email must be an email. password must be at least 8 characters".
 *
 * Used on the auth routes: the mobile app reads `message` as a string, and
 * installed versions would otherwise show a generic error without the reason.
 */
@Catch(BadRequestException)
export class SingleMessageBadRequestFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const body = exception.getResponse();

    if (typeof body === 'string') {
      res.status(status).json({ statusCode: status, message: body });
      return;
    }
    const { message } = body as { message?: unknown };
    res.status(status).json({
      ...body,
      message: Array.isArray(message) ? message.join('. ') : message,
    });
  }
}
