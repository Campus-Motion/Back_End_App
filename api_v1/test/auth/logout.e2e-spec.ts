/**
 * POST /auth/logout: records an auth.logout audit event for the caller.
 * Type: E2E (Supertest), needs the API and database running.
 * Reads audit_log as admin_role, since api_role cannot SELECT it.
 */
import request from 'supertest';
import { Client } from 'pg';

const BASE_URL = process.env.API_URL ?? 'http://localhost:3000';
const ADMIN_ROLE_URL =
  process.env.ADMIN_DB_URL ??
  'postgres://admin_role:admin_password@localhost:5432/campus_motion';

const USERNAME = 'logout_tester';
const EMAIL = 'logout_tester@campusmotion.test';
const PASSWORD = 'LogoutTest111!';

describe('POST /auth/logout', () => {
  let db: Client;
  let token: string;
  let userId: number;

  async function logoutRows(): Promise<any[]> {
    const { rows } = await db.query(
      `SELECT * FROM audit_log
       WHERE user_id = $1 AND action = 'auth.logout'
       ORDER BY id`,
      [userId],
    );
    return rows;
  }

  beforeAll(async () => {
    db = new Client({ connectionString: ADMIN_ROLE_URL });
    await db.connect();

    await request(BASE_URL)
      .post('/auth/register')
      .send({ username: USERNAME, email: EMAIL, password: PASSWORD });
    const login = await request(BASE_URL)
      .post('/auth/login')
      .send({ email: EMAIL, password: PASSWORD });
    token = login.body.access_token;

    const me = await request(BASE_URL)
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`);
    userId = me.body.id;
  });

  afterAll(async () => {
    await db.end();
  });

  it('returns 401 without a valid token and writes no audit row', async () => {
    const before = (await logoutRows()).length;

    await request(BASE_URL).post('/auth/logout').expect(401);
    await request(BASE_URL)
      .post('/auth/logout')
      .set('Authorization', 'Bearer invalid')
      .expect(401);

    expect((await logoutRows()).length).toBe(before);
  });

  it('returns 200 and writes one auth.logout audit row', async () => {
    const before = (await logoutRows()).length;

    const res = await request(BASE_URL)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .set('User-Agent', 'logout-e2e')
      .expect(200);

    expect(res.body).toEqual({ message: 'Logged out successfully' });

    const rows = await logoutRows();
    expect(rows.length).toBe(before + 1);
    expect(rows[rows.length - 1]).toMatchObject({
      user_id: userId,
      username: USERNAME,
      outcome: 'success',
      target_table: 'users',
      target_id: userId,
      http_method: 'POST',
      endpoint: '/auth/logout',
      user_agent: 'logout-e2e',
    });
  });
});
