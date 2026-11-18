/**
 * GET /users/search: username prefix search for signed-in members.
 * Type: E2E (Supertest), needs the API and database running.
 */
import request from 'supertest';

const BASE_URL = process.env.API_URL ?? 'http://localhost:3000';
const PASSWORD = 'SearchTest111!';

async function signUpAndLogin(username: string): Promise<string> {
  const email = `${username}@campusmotion.test`;
  await request(BASE_URL)
    .post('/auth/register')
    .send({ username, email, password: PASSWORD });
  const res = await request(BASE_URL)
    .post('/auth/login')
    .send({ email, password: PASSWORD });
  return res.body.access_token;
}

describe('GET /users/search', () => {
  let bobToken: string;
  let aliceToken: string;
  let aliceId: number;

  beforeAll(async () => {
    aliceToken = await signUpAndLogin('srch_alice');
    await signUpAndLogin('srch_alicia');
    bobToken = await signUpAndLogin('srch_bob');

    const me = await request(BASE_URL)
      .get('/users/me')
      .set('Authorization', `Bearer ${aliceToken}`);
    aliceId = me.body.id;

    // An account pending deletion must not be searchable.
    const goneToken = await signUpAndLogin('srch_alice_gone');
    await request(BASE_URL)
      .delete('/users/me')
      .set('Authorization', `Bearer ${goneToken}`);
  });

  function search(token: string, query: Record<string, string>) {
    return request(BASE_URL)
      .get('/users/search')
      .query(query)
      .set('Authorization', `Bearer ${token}`);
  }

  function usernames(res: request.Response): string[] {
    return res.body.data.map((u: { username: string }) => u.username);
  }

  it('matches the username prefix in any case', async () => {
    for (const q of ['srch_ali', 'SRCH_ALI', 'Srch_Ali']) {
      const res = await search(bobToken, { q }).expect(200);
      expect(usernames(res)).toEqual(
        expect.arrayContaining(['srch_alice', 'srch_alicia']),
      );
    }
  });

  it('puts the exact match first', async () => {
    const res = await search(bobToken, { q: 'srch_alice' }).expect(200);
    expect(usernames(res)[0]).toBe('srch_alice');
  });

  it('excludes the caller and accounts pending deletion', async () => {
    const res = await search(aliceToken, { q: 'srch_ali' }).expect(200);
    expect(usernames(res)).toContain('srch_alicia');
    expect(usernames(res)).not.toContain('srch_alice');
    expect(usernames(res)).not.toContain('srch_alice_gone');
  });

  it('returns public fields only', async () => {
    const res = await search(bobToken, { q: 'srch_ali' }).expect(200);
    for (const user of res.body.data) {
      expect(Object.keys(user).sort()).toEqual([
        'created_at',
        'id',
        'photo_url',
        'role',
        'section',
        'username',
      ]);
    }
  });

  it('treats % and _ literally', async () => {
    const percent = await search(bobToken, { q: '%%' }).expect(200);
    for (const name of usernames(percent)) {
      expect(name.startsWith('%%')).toBe(true);
    }

    // "s_ch" would match "srch_..." if "_" were a wildcard.
    const underscore = await search(bobToken, { q: 's_ch' }).expect(200);
    expect(usernames(underscore)).not.toContain('srch_alicia');
  });

  it('caps limit at 20', async () => {
    const res = await search(bobToken, { q: 'srch', limit: '100' }).expect(
      200,
    );
    expect(res.body.meta.limit).toBe(20);
    expect(res.body.data.length).toBeLessThanOrEqual(20);
  });

  it('rejects a short or missing q (400) and no token (401)', async () => {
    await search(bobToken, { q: 'a' }).expect(400);
    await search(bobToken, {}).expect(400);
    await request(BASE_URL).get('/users/search?q=srch').expect(401);
  });

  it('keeps GET /users/:id working', async () => {
    const res = await request(BASE_URL)
      .get(`/users/${aliceId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(200);
    expect(res.body.username).toBe('srch_alice');
  });
});
