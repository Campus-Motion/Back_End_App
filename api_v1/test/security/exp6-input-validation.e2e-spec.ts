/**
 * Experiment 6 — Input Validation: Malformed Health Data
 * Proves: Invalid DTOs are rejected with HTTP 400 before reaching the DB.
 * Type: E2E (Supertest)
 */
import request from 'supertest';

const BASE_URL = process.env.API_URL ?? 'http://localhost:3000';

describe('[EXP 6] Input validation — malformed health data DTOs', () => {
  let token: string;

  beforeAll(async () => {
    await request(BASE_URL).post('/auth/register').send({
      username: 'dto_test_user',
      email: 'dto_test@campusmotion.test',
      password: 'DtoPass000!',
    });
    const res = await request(BASE_URL).post('/auth/login').send({
      email: 'dto_test@campusmotion.test',
      password: 'DtoPass000!',
    });
    token = res.body.access_token;
  });

  it('returns 400 when born is not a valid date string', async () => {
    const res = await request(BASE_URL)
      .post('/health')
      .set('Authorization', `Bearer ${token}`)
      .send({
        born: 'not-a-date',
        consent_given_at: new Date().toISOString(),
      })
      .expect(400);

    expect(res.body.message).toBeDefined();
    // NestJS class-validator typically returns an array of messages
    const messages: string[] = Array.isArray(res.body.message)
      ? res.body.message
      : [res.body.message];
    expect(messages.some((m) => /born/i.test(m))).toBe(true);
  });

  it('returns 400 when weight_kg is a string instead of a number', async () => {
    const res = await request(BASE_URL)
      .post('/health')
      .set('Authorization', `Bearer ${token}`)
      .send({
        born: '1998-05-12',
        weight_kg: 'heavy',
        consent_given_at: new Date().toISOString(),
      })
      .expect(400);

    const messages: string[] = Array.isArray(res.body.message)
      ? res.body.message
      : [res.body.message];
    expect(messages.some((m) => /weight/i.test(m))).toBe(true);
  });

  it('returns 400 when consent_given_at is missing entirely', async () => {
    await request(BASE_URL)
      .post('/health')
      .set('Authorization', `Bearer ${token}`)
      .send({ born: '1998-05-12', weight_kg: 70 })
      .expect(400);
  });

  it('returns 400 when posting an entirely empty body', async () => {
    await request(BASE_URL)
      .post('/health')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);
  });
});
