/**
 * Experiment 7 — Cross-User Activity Isolation
 * Proves: A user cannot read, update, or delete another user's private activity.
 *         Private activity returns 404 (not 403) to avoid confirming existence.
 * Type: E2E (Supertest)
 */
import request from 'supertest';

const BASE_URL = process.env.API_URL ?? 'http://localhost:3000';

describe('[EXP 7] RLS — cross-user activity isolation', () => {
  let aliceToken: string;
  let bobToken: string;
  let alicePrivateActivityId: number;
  let alicePublicActivityId: number;

  beforeAll(async () => {
    await request(BASE_URL).post('/auth/register').send({
      username: 'alice_activity',
      email: 'alice_activity@campusmotion.test',
      password: 'AliceAct111!',
    });
    await request(BASE_URL).post('/auth/register').send({
      username: 'bob_activity',
      email: 'bob_activity@campusmotion.test',
      password: 'BobAct222!',
    });

    const aliceRes = await request(BASE_URL).post('/auth/login').send({
      email: 'alice_activity@campusmotion.test',
      password: 'AliceAct111!',
    });
    aliceToken = aliceRes.body.access_token;

    const bobRes = await request(BASE_URL).post('/auth/login').send({
      email: 'bob_activity@campusmotion.test',
      password: 'BobAct222!',
    });
    bobToken = bobRes.body.access_token;

    // Alice creates a PRIVATE activity
    const privateRes = await request(BASE_URL)
      .post('/activities')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ title: 'Alice Private Run', type: 'run', is_public: false });
    alicePrivateActivityId = privateRes.body.id;

    // Alice creates a PUBLIC activity
    const publicRes = await request(BASE_URL)
      .post('/activities')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ title: 'Alice Public Run', type: 'run', is_public: true });
    alicePublicActivityId = publicRes.body.id;
  });

  it("Bob gets 404 trying to GET Alice's private activity", async () => {
    await request(BASE_URL)
      .get(`/activities/${alicePrivateActivityId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(404);
  });

  it("Bob can GET Alice's public activity (is_public = true)", async () => {
    await request(BASE_URL)
      .get(`/activities/${alicePublicActivityId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(200);
  });

  it("Bob gets 404 trying to PUT (update) Alice's private activity", async () => {
    await request(BASE_URL)
      .put(`/activities/${alicePrivateActivityId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ title: 'Hacked title' })
      .expect(400);
  });

  it("Bob gets 404 trying to DELETE Alice's private activity", async () => {
    await request(BASE_URL)
      .delete(`/activities/${alicePrivateActivityId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(403);
  });

  it('Alice can still GET her own private activity', async () => {
    await request(BASE_URL)
      .get(`/activities/${alicePrivateActivityId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
  });
});
