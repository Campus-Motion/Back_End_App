import type { Server } from 'node:http';
import postgres from 'postgres';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { FitImportsService } from '../../src/activities/fit-imports.service';
import { ActivitiesController } from '../../src/activities/activities.controller';
import { ActivitiesService } from '../../src/activities/activities.service';
import { HeatmapsService } from '../../src/activities/heatmaps.service';
import { JwtStrategy } from '../../src/auth/jwt.strategy';

const point = {
  latitude: 46.5,
  longitude: 6.5,
  recorded_at: '2026-11-12T12:00:00Z',
};
const file = {
  originalname: 'route.fit',
  buffer: Buffer.from('parser-fixture'),
} as Express.Multer.File;
const activity = {
  id: 9,
  user_id: 42,
  title: 'Imported FIT activity',
  type: 'other',
  is_public: false,
};

describe('FIT imports service', () => {
  let service: FitImportsService;
  let queries: { text: string; values: unknown[] }[];
  let batches: {
    activity_id: number;
    sequence_order: number;
    recorded_at: Date;
  }[][];
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  beforeEach(() => {
    queries = [];
    batches = [];
    const sql = (
      first: TemplateStringsArray | object[],
      ...values: unknown[]
    ) => {
      if (!('raw' in first)) {
        batches.push(first as (typeof batches)[number]);
        return first;
      }
      const text = first.join('?');
      queries.push({ text, values });
      return Promise.resolve(
        text.includes('INSERT INTO activities') ? [activity] : [],
      );
    };
    const db = {
      begin: (fn: (query: typeof sql) => unknown) => fn(sql),
    } as unknown as postgres.Sql;
    service = new FitImportsService(
      db,
      new ConfigService({ HEATMAP_URL: 'http://heatmap:3041' }),
    );
    fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          waypoints: [
            point,
            {
              ...point,
              longitude: 6.5001,
              recorded_at: '2026-11-12T12:00:05Z',
            },
          ],
        }),
      ),
    );
  });
  afterEach(() => jest.restoreAllMocks());

  it('creates a private owned activity and GPS-only waypoints in one transaction', async () => {
    await expect(service.importActivity(42, file)).resolves.toEqual(activity);
    expect(queries[0].values).toEqual(['42']);
    expect(queries[1].text).toContain("'other', false");
    expect(queries[1].values).toEqual([42]);
    expect(batches[0][0]).toMatchObject({ activity_id: 9, sequence_order: 1 });
    expect(Object.keys(batches[0][0]).sort()).toEqual([
      'activity_id',
      'latitude',
      'longitude',
      'recorded_at',
      'sequence_order',
    ]);
    const [, options] = fetchMock.mock.calls[0];
    expect(options?.body).toBeInstanceOf(FormData);
    expect(options?.headers).toBeUndefined();
    expect((options?.body as FormData).get('file')).not.toBeNull();
  });
  it('batches large imports below PostgreSQL parameter limits', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          waypoints: Array.from({ length: 1001 }, () => point),
        }),
      ),
    );
    await service.importActivity(42, file);
    expect(batches.map((batch) => batch.length)).toEqual([1000, 1]);
    expect(batches[1][0].sequence_order).toBe(1001);
  });
  it('does not write invalid files, coordinates or decoder responses', async () => {
    for (const value of [
      undefined,
      { ...file, buffer: Buffer.alloc(0) },
      { ...file, originalname: 'route.txt' },
    ]) {
      await expect(service.importActivity(42, value)).rejects.toMatchObject({
        status: 400,
      });
    }
    for (const value of [
      {},
      { waypoints: [point] },
      { waypoints: [point, { ...point, latitude: 89 }] },
    ]) {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(value)));
      await expect(service.importActivity(42, file)).rejects.toMatchObject({
        status: 503,
      });
    }
    expect(queries).toEqual([]);
  });
  it('maps parse failures and outages without writing or exposing server text', async () => {
    for (const status of [413, 422, 503]) {
      fetchMock.mockResolvedValueOnce(
        new Response('sensitive decoder diagnostic', { status }),
      );
      await expect(service.importActivity(42, file)).rejects.toMatchObject({
        status,
      });
    }
    expect(queries).toEqual([]);
  });
  it('rejects oversized files and decoded point counts', async () => {
    await expect(
      service.importActivity(42, {
        ...file,
        buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
      }),
    ).rejects.toMatchObject({ status: 413 });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          waypoints: Array.from({ length: 100001 }, () => point),
        }),
      ),
    );
    await expect(service.importActivity(42, file)).rejects.toMatchObject({
      status: 413,
    });
    fetchMock.mockResolvedValueOnce(
      new Response('{}', {
        headers: { 'content-length': String(16 * 1024 * 1024 + 1) },
      }),
    );
    await expect(service.importActivity(42, file)).rejects.toMatchObject({
      status: 413,
    });
    const oversizedChunk = new Uint8Array(1024 * 1024);
    let sentChunks = 0;
    const oversizedStream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sentChunks < 17) {
          sentChunks++;
          controller.enqueue(oversizedChunk);
        } else {
          controller.close();
        }
      },
    });
    fetchMock.mockResolvedValueOnce(new Response(oversizedStream));
    await expect(service.importActivity(42, file)).rejects.toMatchObject({
      status: 413,
    });
    expect(queries).toEqual([]);
  });
  it('exports all and only the authenticated owner activities including their GPS points', async () => {
    await service.exportActivities(42);
    expect(queries[0].values).toEqual(['42']);
    expect(queries[1].text).toContain('WHERE a.user_id = ?');
    expect(queries[1].values).toEqual([42]);
    expect(queries[1].text).toContain('AS waypoints');
    expect(queries[1].text).not.toContain('LIMIT');
  });
});

describe('FIT import HTTP authentication and upload limits', () => {
  let app: INestApplication;
  const importActivity = jest.fn<
    Promise<typeof activity>,
    [number, Express.Multer.File?]
  >();
  const exportActivities = jest.fn();
  const previousSecret = process.env.JWT_SECRET;
  const secret = 'local-fit-import-test-key';
  let token: string;
  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    token = new JwtService({ secret }).sign({ sub: 42 });
    const module = await Test.createTestingModule({
      controllers: [ActivitiesController],
      providers: [
        { provide: ActivitiesService, useValue: {} },
        { provide: HeatmapsService, useValue: {} },
        {
          provide: FitImportsService,
          useValue: { importActivity, exportActivities },
        },
        JwtStrategy,
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  beforeEach(() => {
    importActivity.mockReset();
    exportActivities.mockReset();
  });
  afterAll(async () => {
    await app.close();
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  it('requires a JWT before accepting file uploads or exports', async () => {
    await request(app.getHttpServer() as Server)
      .post('/activities/import-fit')
      .attach('file', file.buffer, 'route.fit')
      .expect(401);
    await request(app.getHttpServer() as Server)
      .get('/activities/export')
      .expect(401);
    expect(importActivity).not.toHaveBeenCalled();
    expect(exportActivities).not.toHaveBeenCalled();
  });
  it('assigns owner from JWT and does not cache the response', async () => {
    importActivity.mockResolvedValue(activity);
    const response = await request(app.getHttpServer() as Server)
      .post('/activities/import-fit')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', file.buffer, 'route.fit')
      .expect(201);
    expect(importActivity.mock.calls[0][0]).toBe(42);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body as { is_public: boolean }).toMatchObject({
      is_public: false,
    });
  });
  it('rejects oversized multipart uploads and client-supplied owner fields', async () => {
    await request(app.getHttpServer() as Server)
      .post('/activities/import-fit')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), 'route.fit')
      .expect(413);
    await request(app.getHttpServer() as Server)
      .post('/activities/import-fit')
      .set('Authorization', `Bearer ${token}`)
      .field('user_id', '7')
      .attach('file', file.buffer, 'route.fit')
      .expect(400);
    expect(importActivity).not.toHaveBeenCalled();
  });
});
