/**
 * GET /users/me/events — events the signed-in user joined.
 * Type: E2E (Supertest), against a running API with the seed data of
 * initdb/02_schema.sql (events 1, 2 and 3).
 */
import request from 'supertest';

const BASE_URL = process.env.API_URL ?? 'http://localhost:3000';

// Fresh users on every run, so joins left by an earlier run don't count.
const run = Date.now();

async function signUpAndIn(name: string): Promise<string> {
  const email = `${name}_${run}@campusmotion.test`;
  const password = 'MyEvents123!';
  await request(BASE_URL)
    .post('/auth/register')
    .send({ username: `${name}_${run}`, email, password })
    .expect(201);
  const res = await request(BASE_URL)
    .post('/auth/login')
    .send({ email, password })
    .expect(200);
  return (res.body as { access_token: string }).access_token;
}

type MyEventsBody = {
  data: { id: number; joined_at: string; participant_count: number }[];
  meta: { total: number; has_more: boolean };
};

function myEvents(token: string, query = '') {
  return request(BASE_URL)
    .get(`/users/me/events${query}`)
    .set('Authorization', `Bearer ${token}`);
}

describe('GET /users/me/events', () => {
  let alice: string;
  let bob: string;

  beforeAll(async () => {
    alice = await signUpAndIn('alice_my_events');
    bob = await signUpAndIn('bob_my_events');
    for (const id of [1, 2]) {
      await request(BASE_URL)
        .post(`/events/${id}/participants`)
        .set('Authorization', `Bearer ${alice}`)
        .expect(201);
    }
  });

  it('returns 401 without a token', async () => {
    await request(BASE_URL).get('/users/me/events').expect(401);
  });

  it('lists only the events the user joined, with joined_at', async () => {
    const res = await myEvents(alice).expect(200);
    const body = res.body as MyEventsBody;
    expect(body.data.map((e) => e.id).sort()).toEqual([1, 2]);
    expect(body.meta.total).toBe(2);
    for (const event of body.data) {
      expect(event.joined_at).toBeDefined();
      expect(event.participant_count).toBeGreaterThanOrEqual(1);
    }
  });

  it("doesn't show another user's events", async () => {
    const res = await myEvents(bob).expect(200);
    expect((res.body as MyEventsBody).data).toEqual([]);
  });

  it('paginates with limit and offset', async () => {
    const res = await myEvents(alice, '?limit=1&offset=1').expect(200);
    const body = res.body as MyEventsBody;
    expect(body.data).toHaveLength(1);
    expect(body.meta.has_more).toBe(false);
  });

  it('rejects an invalid query with 400', async () => {
    await myEvents(alice, '?limit=0').expect(400);
  });

  it('drops an event once the user leaves it', async () => {
    await request(BASE_URL)
      .delete('/events/2/participants')
      .set('Authorization', `Bearer ${alice}`)
      .expect(200);
    const res = await myEvents(alice).expect(200);
    expect((res.body as MyEventsBody).data.map((e) => e.id)).toEqual([1]);
  });
});
