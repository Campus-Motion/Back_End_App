import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';
import { JwtGuard } from '../../src/auth/jwt.guard';

// Requests go through the real controller, the same global pipe as main.ts and
// the controller's filter. The service is a stub: only the error shape matters.
describe('auth validation errors', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  const authService = {
    register: jest.fn().mockResolvedValue({ message: 'ok', userId: 1 }),
    login: jest.fn().mockResolvedValue({ access_token: 't', role: 'user' }),
    changePassword: jest
      .fn()
      .mockResolvedValue({ message: 'Password updated successfully' }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    })
      // Stands in for a valid token on PUT /auth/password.
      .overrideGuard(JwtGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => { getRequest: () => { user?: unknown } };
        }) => {
          ctx.switchToHttp().getRequest().user = { id: 1 };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
  });

  afterAll(() => app.close());

  type ErrorBody = { statusCode: number; message: unknown; error?: string };

  it.each([
    [
      '/auth/register',
      { username: 'alice', email: 'alice@epfl.ch', password: 'short' },
      'password must be at least 8 characters',
    ],
    [
      '/auth/register',
      { username: 'alice', email: 'nope', password: 'longenough' },
      'email must be an email',
    ],
    ['/auth/login', { email: 'alice@epfl.ch' }, 'password should not be empty'],
    [
      '/auth/password',
      { current_password: 'old', new_password: '' },
      'new_password must be at least 8 characters',
    ],
    [
      '/auth/password',
      { new_password: 'newPassword2' },
      'current_password should not be empty',
    ],
  ])(
    '%s sends one string message with the reason',
    async (path, body, reason) => {
      const method = path === '/auth/password' ? 'put' : 'post';
      const res = await request(server)[method](path).send(body).expect(400);
      const err = res.body as ErrorBody;
      // The mobile app reads it with `data['message'] as String?`.
      expect(typeof err.message).toBe('string');
      expect(err.message).toContain(reason);
      expect(err.error).toBe('Bad Request');
    },
  );

  it('joins several problems into one message', async () => {
    const res = await request(server)
      .post('/auth/register')
      .send({})
      .expect(400);
    const message = (res.body as ErrorBody).message as string;
    for (const field of ['username', 'email', 'password']) {
      expect(message).toContain(field);
    }
    expect(message).toContain('. ');
  });

  it('leaves valid requests unchanged', async () => {
    await request(server)
      .post('/auth/register')
      .send({
        username: 'alice',
        email: 'alice@epfl.ch',
        password: 'longenough',
      })
      .expect(201, { message: 'ok', userId: 1 });
    await request(server)
      .post('/auth/login')
      .send({ email: 'alice@epfl.ch', password: 'x' })
      .expect(200, { access_token: 't', role: 'user' });
    await request(server)
      .put('/auth/password')
      .send({ current_password: 'old', new_password: 'newPassword2' })
      .expect(200, { message: 'Password updated successfully' });
  });

  it('never reaches the service with an invalid password change', () => {
    // The 400 cases above ran before any valid change.
    const calls = authService.changePassword.mock.calls as unknown[][];
    expect(
      calls.every(
        (c) => (c[1] as { new_password: string }).new_password.length >= 8,
      ),
    ).toBe(true);
  });
});
