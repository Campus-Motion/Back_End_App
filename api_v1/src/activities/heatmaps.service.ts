import {
  Inject,
  Injectable,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import postgres from 'postgres';

type Waypoint = {
  activity_id: number;
  latitude: string;
  longitude: string;
  recorded_at: Date;
};

type HeatmapResult = {
  image: string;
  bounds: number[][];
  runs: number;
  points: number;
  pixel_m: number;
  saturation: number;
};

function isHeatmapResult(result: unknown): result is HeatmapResult {
  if (!result || typeof result !== 'object') return false;
  const value = result as Record<string, unknown>;
  return (
    typeof value.image === 'string' &&
    value.image.startsWith('data:image/png;base64,') &&
    Array.isArray(value.bounds) &&
    value.bounds.length === 2 &&
    value.bounds.every(
      (pair: unknown) =>
        Array.isArray(pair) &&
        pair.length === 2 &&
        pair.every((n: unknown) => typeof n === 'number' && Number.isFinite(n)),
    ) &&
    ['runs', 'points', 'pixel_m', 'saturation'].every(
      (key) =>
        typeof value[key] === 'number' &&
        Number.isFinite(value[key]) &&
        value[key] > 0,
    )
  );
}

@Injectable()
export class HeatmapsService {
  constructor(
    @Inject('API_DB') private readonly db: postgres.Sql,
    private readonly config: ConfigService,
  ) {}

  async personal(userId: number) {
    const points = await this.db.begin(async (transaction) => {
      // postgres 3.x TransactionSql omits its callable signature in its types.
      const sql = transaction as unknown as postgres.Sql;
      await sql`SELECT set_config('app.current_user_id', ${String(userId)}, true)`;
      // RLS alone also allows public activities: restrict ownership explicitly.
      return sql<Waypoint[]>`
        WITH recent AS (
          SELECT a.id, a.created_at FROM activities a
          WHERE a.user_id = ${userId}
            AND (SELECT count(*) FROM activity_waypoints w
                 WHERE w.activity_id = a.id) >= 2
          ORDER BY a.created_at DESC, a.id DESC LIMIT 20
        )
        SELECT w.activity_id, w.latitude, w.longitude, w.recorded_at
        FROM activity_waypoints w JOIN recent a ON a.id = w.activity_id
        ORDER BY a.created_at DESC, a.id DESC, w.recorded_at, w.sequence_order
        LIMIT 100001
      `;
    });
    if (!points.length) return null;
    if (points.length > 100000) {
      throw new PayloadTooLargeException('Too many GPS points to render');
    }
    const tracks = new Map<number, { points: object[] }>();
    for (const point of points) {
      if (!tracks.has(point.activity_id))
        tracks.set(point.activity_id, { points: [] });
      tracks.get(point.activity_id)!.points.push({
        latitude: Number(point.latitude),
        longitude: Number(point.longitude),
        recorded_at: new Date(point.recorded_at).toISOString(),
      });
    }
    const url = this.config.get<string>('HEATMAP_URL') ?? 'http://heatmap:3041';
    try {
      const response = await fetch(
        `${url.replace(/\/$/, '')}/heatmaps/waypoints`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tracks: [...tracks.values()] }),
          signal: AbortSignal.timeout(30000),
          redirect: 'error',
        },
      );
      // Valid GPS records may all be excluded by motion filters.
      if (response.status === 422) return null;
      if (!response.ok) throw new Error('Renderer unavailable');
      const result: unknown = await response.json();
      if (!isHeatmapResult(result)) {
        throw new Error('Invalid renderer response');
      }
      // No cache or persistence: deletions are reflected on the next request.
      return result;
    } catch {
      // Never expose renderer errors or GPS payloads to clients or logs.
      throw new ServiceUnavailableException('Heatmap temporarily unavailable');
    }
  }
}
