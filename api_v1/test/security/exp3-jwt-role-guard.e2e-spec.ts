/**
 * Experiment 3 — JWT RoleGuard Enforcement
 * Proves: A standard user token gets HTTP 403 on admin-only routes.
 * Type: E2E (Supertest)
 */
import request from 'supertest';

const BASE_URL = process.env.API_URL ?? 'http://localhost:3000';

describe('[EXP 3] JWT RoleGuard — standard user blocked from admin routes', () => {
  let userToken: string;

  beforeAll(async () => {
    await request(BASE_URL).post('/auth/register').send({
      username: 'user_guard_test',
      email: 'user_guard@campusmotion.test',
      password: 'UserPass789!',
    });

    const res = await request(BASE_URL).post('/auth/login').send({
      email: 'user_guard@campusmotion.test',
      password: 'UserPass789!',
    });
    userToken = res.body.access_token;
  });

  const adminRoutes = [
    { method: 'get', path: '/admin/users' },
    { method: 'get', path: '/admin/audit' },
    { method: 'patch', path: '/admin/users/1/role' },
  ];

  adminRoutes.forEach(({ method, path }) => {
    it(`${method.toUpperCase()} ${path} returns 403 for a standard user token`, async () => {
      await (request(BASE_URL) as any)
        [method](path)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });

  it('Unauthenticated request to admin route returns 401', async () => {
    await request(BASE_URL).get('/admin/users').expect(401);
  });
});
