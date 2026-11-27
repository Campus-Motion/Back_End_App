import type { Server } from 'node:http';
import postgres from 'postgres';
import { ConfigService } from '@nestjs/config';
import { FitImportsService } from '../../src/activities/fit-imports.service';
import { HeatmapsService } from '../../src/activities/heatmaps.service';
import { ActivitiesController } from '../../src/activities/activities.controller';
import { JwtStrategy } from '../../src/auth/jwt.strategy';
import { ActivitiesService } from '../../src/activities/activities.service';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';

const point = {
  activity_id: 10,
  latitude: '46.5',
  longitude: '6.5',
  recorded_at: new Date('2026-11-12T12:00:00Z'),
};
const result = {
  image: 'data:image/png;base64,AAAA',
  bounds: [
    [46, 6],
    [47, 7],
  ],
  runs: 1,
  points: 2,
  pixel_m: 0.5,
  saturation: 1,
};

describe('personal heatmap', () => {
  let service: HeatmapsService;
  let rows: (typeof point)[];
  let queries: { text: string; values: unknown[] }[];
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  beforeEach(() => {
    rows = [point, { ...point, longitude: '6.5001' }];
    queries = [];
    const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('?');
      queries.push({ text, values });
      return Promise.resolve(text.includes('WITH recent') ? rows : []);
    };
    service = new HeatmapsService(
      {
        begin: (fn: (query: typeof sql) => unknown) => fn(sql),
      } as unknown as postgres.Sql,
      new ConfigService({ HEATMAP_URL: 'http://heatmap:3041' }),
    );
    fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(result)));
  });
  afterEach(() => jest.restoreAllMocks());

  it('scopes the SQL to the authenticated owner, caps data and forwards only route fields', async () => {
    await expect(service.personal(42)).resolves.toEqual(result);
    expect(queries[0].values).toEqual(['42']);
    expect(queries[1].text).toContain('a.user_id = ?');
    expect(queries[1].values).toEqual([42]);
    expect(queries[1].text).toContain('LIMIT 20');
    expect(queries[1].text).toContain('LIMIT 100001');
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string) as {
      tracks: { points: Record<string, unknown>[] }[];
    };
    expect(Object.keys(body.tracks[0].points[0]).sort()).toEqual([
      'latitude',
      'longitude',
      'recorded_at',
    ]);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://heatmap:3041/heatmaps/waypoints',
    );
    expect(fetchMock.mock.calls[0][1]!.headers).not.toHaveProperty(
      'Authorization',
    );
  });
  it('returns empty without contacting the renderer when no routes exist', async () => {
    rows = [];
    await expect(service.personal(42)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects oversized routes before contacting the renderer', async () => {
    rows = Array.from({ length: 100001 }, () => point);
    await expect(service.personal(42)).rejects.toMatchObject({ status: 413 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('handles filtered-out routes, outages and invalid responses safely', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 422 }));
    await expect(service.personal(42)).resolves.toBeNull();
    for (const response of [
      new Response('', { status: 503 }),
      new Response('{}'),
    ]) {
      fetchMock.mockResolvedValueOnce(response);
      await expect(service.personal(42)).rejects.toMatchObject({
        status: 503,
        message: 'Heatmap temporarily unavailable',
      });
    }
    fetchMock.mockRejectedValueOnce(new Error('GPS data must not escape'));
    await expect(service.personal(42)).rejects.toMatchObject({
      status: 503,
      message: 'Heatmap temporarily unavailable',
    });
  });
});

describe('authenticated heatmap HTTP route', () => {
  let app: INestApplication;
  const personal = jest.fn();
  const previousSecret = process.env.JWT_SECRET;
  const testSecret = 'local-heatmap-test-signing-key';
  beforeAll(async () => {
    process.env.JWT_SECRET = testSecret;
    const module = await Test.createTestingModule({
      controllers: [ActivitiesController],
      providers: [
        { provide: HeatmapsService, useValue: { personal } },
        { provide: ActivitiesService, useValue: {} },
        { provide: FitImportsService, useValue: {} },
        JwtStrategy,
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    if (app) await app.close();
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  beforeEach(() => personal.mockReset());
  it('requires JWT authentication', async () => {
    await request(app.getHttpServer() as Server)
      .get('/activities/heatmap')
      .expect(401);
    expect(personal).not.toHaveBeenCalled();
  });
  it('uses JWT identity, ignores client owner IDs and disables caching', async () => {
    personal.mockResolvedValue(result);
    const token = new JwtService({ secret: testSecret }).sign({
      sub: 42,
      role: 'user',
    });
    const response = await request(app.getHttpServer() as Server)
      .get('/activities/heatmap?user_id=7')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(personal).toHaveBeenCalledWith(42);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual(result);
  });
  it('uses 204 for a signed-in user without GPS data', async () => {
    personal.mockResolvedValue(null);
    const token = new JwtService({ secret: testSecret }).sign({ sub: 43 });
    await request(app.getHttpServer() as Server)
      .get('/activities/heatmap')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
  });
});
