import { NotFoundException } from '@nestjs/common';
import type postgres from 'postgres';
import {
  ActivitiesService,
  ActivityRow,
} from '../../src/activities/activities.service';

interface RecordedQuery {
  text: string;
  values: unknown[];
}

function createMockDb(responses: unknown[][]) {
  const queries: RecordedQuery[] = [];
  let responseIndex = 0;

  const sqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim();
    // Nested fragments (e.g. sql`AND type = ${type}` or sql``) don't execute standalone.
    if (text === '' || text.startsWith('AND ') || text.startsWith('OR ')) {
      return { __fragment: text, values };
    }
    queries.push({ text, values });
    const next = responses[responseIndex++] ?? [];
    return Promise.resolve(next);
  };

  const apiDb = {
    begin: jest.fn((cb: (sql: typeof sqlTag) => Promise<unknown>) =>
      cb(sqlTag),
    ),
  };

  return {
    apiDb: apiDb as unknown as postgres.Sql,
    adminDb: {} as unknown as postgres.Sql,
    queries,
  };
}

function makeRow(overrides: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: 10,
    title: 'Morning Cycle',
    body: null,
    type: 'cycle',
    user_id: 5,
    event_id: null,
    is_public: false,
    created_at: '2026-11-26T08:00:00Z',
    updated_at: null,
    duration: null,
    distance_km: null,
    ...overrides,
  };
}

describe('ActivitiesService', () => {
  it('creates an activity with duration and distance_km and returns numeric values', async () => {
    const { apiDb, adminDb, queries } = createMockDb([
      [], // set_config
      [makeRow({ duration: '42.5', distance_km: '15.250' })], // INSERT RETURNING
    ]);
    const service = new ActivitiesService(apiDb, adminDb);

    const created = await service.create(
      {
        title: 'Morning Cycle',
        type: 'cycle',
        duration: 42.5,
        distance_km: 15.25,
        is_public: false,
      },
      5,
    );

    expect(created.duration).toBe(42.5);
    expect(created.distance_km).toBe(15.25);
    expect(created.type).toBe('cycle');

    const insertQuery = queries[1];
    expect(insertQuery.text).toContain('INSERT INTO activities');
    expect(insertQuery.text).toContain('duration');
    expect(insertQuery.text).toContain('distance_km');
    expect(insertQuery.values).toEqual([
      'Morning Cycle',
      'cycle',
      5,
      null,
      false,
      null,
      42.5,
      15.25,
    ]);
  });

  it('creates an activity with null duration and distance_km when omitted', async () => {
    const { apiDb, adminDb, queries } = createMockDb([
      [],
      [makeRow({ type: 'run', duration: null, distance_km: null })],
    ]);
    const service = new ActivitiesService(apiDb, adminDb);

    const created = await service.create(
      { title: 'Legacy Run', type: 'run' },
      5,
    );

    expect(created.duration).toBeNull();
    expect(created.distance_km).toBeNull();
    expect(queries[1].values).toEqual([
      'Legacy Run',
      'run',
      5,
      null,
      false,
      null,
      null,
      null,
    ]);
  });

  it('preserves explicit zero values for duration and distance_km on create and update', async () => {
    const { apiDb, adminDb, queries } = createMockDb([
      [],
      [makeRow({ duration: 0, distance_km: 0 })],
      [],
      [{ user_id: 5 }],
      [makeRow({ duration: 0, distance_km: 0 })],
    ]);
    const service = new ActivitiesService(apiDb, adminDb);

    const created = await service.create(
      { title: 'Zero Workout', type: 'run', duration: 0, distance_km: 0 },
      5,
    );
    expect(created.duration).toBe(0);
    expect(created.distance_km).toBe(0);
    expect(queries[1].values.slice(-2)).toEqual([0, 0]);

    const updated = await service.update(5, 10, {
      duration: 0,
      distance_km: 0,
    });
    expect(updated.duration).toBe(0);
    expect(updated.distance_km).toBe(0);
    expect(queries[4].values).toEqual([null, null, null, null, 0, 0, 10]);
  });

  it('updates duration, distance_km and type with partial payload', async () => {
    const { apiDb, adminDb, queries } = createMockDb([
      [], // set_config
      [{ user_id: 5 }], // ownership check
      [makeRow({ duration: '55', distance_km: '20.5' })], // UPDATE RETURNING
    ]);
    const service = new ActivitiesService(apiDb, adminDb);

    const updated = await service.update(5, 10, {
      type: 'cycle',
      duration: 55,
      distance_km: 20.5,
    });

    expect(updated.duration).toBe(55);
    expect(updated.distance_km).toBe(20.5);
    expect(queries[2].text).toContain('UPDATE activities SET');
    expect(queries[2].values).toEqual([
      null,
      'cycle',
      null,
      null,
      55,
      20.5,
      10,
    ]);
  });

  it('returns numeric duration and distance_km on findAll and findOne', async () => {
    const { apiDb, adminDb } = createMockDb([
      [], // findAll set_config
      [
        makeRow({ id: 1, duration: '30.5', distance_km: '10.000' }),
        makeRow({ id: 2, duration: null, distance_km: null }),
      ], // findAll SELECT
      [{ count: 2 }], // findAll COUNT
      [], // findOne set_config
      [makeRow({ id: 1, duration: '30.5', distance_km: '10.000' })], // findOne SELECT
    ]);
    const service = new ActivitiesService(apiDb, adminDb);

    const list = await service.findAll(5, 20, 0, 'cycle');
    expect(list.data).toHaveLength(2);
    expect(list.data[0].duration).toBe(30.5);
    expect(list.data[0].distance_km).toBe(10);
    expect(list.data[1].duration).toBeNull();
    expect(list.data[1].distance_km).toBeNull();

    const single = await service.findOne(5, 1);
    expect(single.duration).toBe(30.5);
    expect(single.distance_km).toBe(10);
  });

  it('throws NotFoundException when findOne does not find an activity', async () => {
    const { apiDb, adminDb } = createMockDb([[], []]);
    const service = new ActivitiesService(apiDb, adminDb);

    await expect(service.findOne(5, 999)).rejects.toThrow(NotFoundException);
  });
});
