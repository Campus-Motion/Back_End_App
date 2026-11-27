import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import postgres from 'postgres';

type GpsPoint = { latitude: number; longitude: number; recorded_at: string };
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_POINTS = 100000;
const MAX_DECODER_RESPONSE_BYTES = 16 * 1024 * 1024;

async function readJsonWithLimit(
  response: Response,
  maxBytes: number,
): Promise<unknown> {
  const contentLengthHeader = response.headers.get('content-length');
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      await response.body?.cancel();
      throw new PayloadTooLargeException('FIT activity exceeds import limits');
    }
  }
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new PayloadTooLargeException('FIT activity exceeds import limits');
    }
    return JSON.parse(text) as unknown;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new PayloadTooLargeException(
          'FIT activity exceeds import limits',
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function isPoint(value: unknown): value is GpsPoint {
  if (!value || typeof value !== 'object') return false;
  const point = value as Record<string, unknown>;
  return (
    typeof point.latitude === 'number' &&
    Number.isFinite(point.latitude) &&
    Math.abs(point.latitude) < 85 &&
    typeof point.longitude === 'number' &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.longitude) <= 180 &&
    typeof point.recorded_at === 'string' &&
    /(Z|[+-]\d{2}:\d{2})$/.test(point.recorded_at) &&
    Number.isFinite(Date.parse(point.recorded_at))
  );
}

@Injectable()
export class FitImportsService {
  constructor(
    @Inject('API_DB') private readonly db: postgres.Sql,
    private readonly config: ConfigService,
  ) {}

  async importActivity(userId: number, file?: Express.Multer.File) {
    if (
      !file ||
      !file.originalname.toLowerCase().endsWith('.fit') ||
      !file.buffer.length
    ) {
      throw new BadRequestException('Choose a nonempty FIT file');
    }
    if (file.buffer.length > MAX_BYTES)
      throw new PayloadTooLargeException('FIT file exceeds 10 MiB');
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(file.buffer)]),
      'activity.fit',
    );
    let points: GpsPoint[];
    try {
      const url =
        this.config.get<string>('HEATMAP_URL') ?? 'http://heatmap:3041';
      const response = await fetch(`${url.replace(/\/$/, '')}/fit/parse`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(30000),
        redirect: 'error',
      });
      if (response.status === 413)
        throw new PayloadTooLargeException(
          'FIT activity exceeds import limits',
        );
      if (response.status === 422)
        throw new UnprocessableEntityException(
          'Invalid FIT file or insufficient supported GPS data',
        );
      if (!response.ok) throw new Error('Decoder unavailable');
      const result = await readJsonWithLimit(
        response,
        MAX_DECODER_RESPONSE_BYTES,
      );
      if (
        !result ||
        typeof result !== 'object' ||
        !('waypoints' in result) ||
        !Array.isArray(result.waypoints) ||
        result.waypoints.length < 2 ||
        !result.waypoints.every(isPoint)
      )
        throw new Error('Invalid decoder response');
      if (result.waypoints.length > MAX_POINTS)
        throw new PayloadTooLargeException('Too many GPS points');
      points = result.waypoints.sort(
        (a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at),
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'FIT import temporarily unavailable',
      );
    }
    // Parse and validate before starting writes. A failed batch rolls back everything.
    return this.db.begin(async (transaction) => {
      const sql = transaction as unknown as postgres.Sql;
      await sql`SELECT set_config('app.current_user_id', ${String(userId)}, true)`;
      const [activity] = await sql<
        {
          id: number;
          user_id: number;
          title: string;
          type: string;
          is_public: boolean;
          created_at: Date;
        }[]
      >`
        INSERT INTO activities (user_id, title, type, is_public)
        VALUES (${userId}, 'Imported FIT activity', 'other', false) RETURNING *
      `;
      // Keep each INSERT below PostgreSQL's bound-parameter limit.
      for (let start = 0; start < points.length; start += 1000) {
        const batch = points.slice(start, start + 1000).map((point, index) => ({
          activity_id: activity.id,
          latitude: point.latitude,
          longitude: point.longitude,
          recorded_at: new Date(point.recorded_at),
          sequence_order: start + index + 1,
        }));
        await sql`INSERT INTO activity_waypoints ${sql(batch)}`;
      }
      return activity;
    });
  }

  async exportActivities(userId: number) {
    return this.db.begin(async (transaction) => {
      const sql = transaction as unknown as postgres.Sql;
      await sql`SELECT set_config('app.current_user_id', ${String(userId)}, true)`;
      // Export every owned activity and its routes; no other users' public routes.
      return sql`
        SELECT a.*, COALESCE((
          SELECT json_agg(json_build_object(
            'latitude', w.latitude, 'longitude', w.longitude,
            'recorded_at', w.recorded_at AT TIME ZONE 'UTC', 'sequence_order', w.sequence_order
          ) ORDER BY w.sequence_order)
          FROM activity_waypoints w WHERE w.activity_id = a.id
        ), '[]'::json) AS waypoints
        FROM activities a WHERE a.user_id = ${userId}
        ORDER BY a.created_at DESC, a.id DESC
      `;
    });
  }
}
