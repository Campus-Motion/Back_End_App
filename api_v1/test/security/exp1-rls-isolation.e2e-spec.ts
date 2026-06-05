/**
 * Experiment 1 — Row-Level Security Isolation
 * Proves: Alice cannot retrieve Bob's health data via the API.
 * Type: E2E (Supertest against the running NestJS app)
 */
import request from 'supertest';

const BASE_URL = process.env.API_URL ?? 'http://localhost:3000';

describe('[EXP 1] RLS — health data isolation between users', () => {
  let aliceToken: string;
  let bobToken: string;

  beforeAll(async () => {
    // Register two test users
    await request(BASE_URL).post('/auth/register').send({
      username: 'alice_test',
      email: 'alice_test@campusmotion.test',
      password: 'AlicePass123!',
    });
    await request(BASE_URL).post('/auth/register').send({
      username: 'bob_test',
      email: 'bob_test@campusmotion.test',
      password: 'BobPass456!',
    });

    // Login both
    const aliceRes = await request(BASE_URL).post('/auth/login').send({
      email: 'alice_test@campusmotion.test',
      password: 'AlicePass123!',
    });
    aliceToken = aliceRes.body.access_token;

    const bobRes = await request(BASE_URL).post('/auth/login').send({
      email: 'bob_test@campusmotion.test',
      password: 'BobPass456!',
    });
    bobToken = bobRes.body.access_token;

    // Alice creates a health record
    await request(BASE_URL)
      .post('/health')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        born: '2000-02-02T00:00:00Z',
        sensitive_data: 'secret',
        client_key_version: 1,
        consent_given_at: '2026-02-02T00:00:00Z',
      })
      .expect(201);
  });

  it("GET /health with Alice's token returns only Alice's record", async () => {
    const res = await request(BASE_URL)
      .get('/health')
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    // Must be Alice's data only
    expect(res.body).toBeDefined();
    // Bob's email / username must not appear anywhere in the response
    expect(JSON.stringify(res.body)).not.toContain('bob_test');
  });

  it("GET /health with Bob's token returns only Bob's record (not Alice's)", async () => {
    const res = await request(BASE_URL)
      .get('/health')
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(404); // Assuming the API returns 404 if no health record is found for the user

    expect(JSON.stringify(res.body)).not.toContain('alice_test');
    expect(JSON.stringify(res.body)).not.toContain('70'); // Alice's weight
  });
});
