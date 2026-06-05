import {
  Injectable,
  Inject,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import postgres from 'postgres';

const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB in KiB
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
};

// Shared type — move to src/common/audit.types.ts if used across modules
export interface AuditContext {
  ip?: string;
  userAgent?: string;
  endpoint?: string;
  httpMethod?: string;
  // userId & username are resolved internally for auth actions
}

@Injectable()
export class AuthService {
  constructor(
    @Inject('AUTH_DB') private sql: postgres.Sql<{}>,
    @Inject('AUDIT_DB') private readonly auditDb: postgres.Sql<{}>,
    private jwtService: JwtService,
  ) {}

  // ─── Audit helper ──────────────────────────────────────────────────────────

  private async log({
    userId,
    username,
    action,
    targetTable,
    targetId,
    outcome,
    oldValue,
    newValue,
    ctx,
  }: {
    userId: number | null;
    username: string | null;
    action: string;
    targetTable: string | null;
    targetId: number | null;
    outcome: 'success' | 'failure';
    oldValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
    ctx?: AuditContext;
  }) {
    await this.auditDb`
      INSERT INTO audit_log (
        user_id, username, action,
        target_table, target_id,
        outcome,
        old_value, new_value,
        ip_address, user_agent,
        http_method, endpoint
      ) VALUES (
        ${userId},
        ${username},
        ${action}::audit_action,
        ${targetTable},
        ${targetId},
        ${outcome},
        ${oldValue ? JSON.stringify(oldValue) : null},
        ${newValue ? JSON.stringify(newValue) : null},
        ${ctx?.ip ?? null},
        ${ctx?.userAgent ?? null},
        ${ctx?.httpMethod ?? null},
        ${ctx?.endpoint ?? null}
      )
    `;
  }

  // ─── REGISTER ─────────────────────────────────────────────────────────────

  async register(
    username: string,
    email: string,
    password: string,
    ctx?: AuditContext,
  ) {
    // 1. Check if email already exists
    const [existing] = await this.sql`
      SELECT id FROM users WHERE email = ${email}
    `;
    if (existing) throw new ConflictException('Email already in use');

    // 2. Check if username already exists
    const [existingUsername] = await this.sql`
      SELECT id FROM users WHERE username = ${username}
    `;
    if (existingUsername)
      throw new ConflictException('Username already in use');

    // 3. Hash the password with Argon2
    const hash = await argon2.hash(password, ARGON2_OPTIONS);

    // 4. Insert into users
    const [user] = await this.sql`
      INSERT INTO users (username, email)
      VALUES (${username}, ${email})
      RETURNING id, username, email
    `;

    // 5. Insert the hash into user_secret
    await this.sql`
      INSERT INTO user_secret (id, password_hash)
      VALUES (${user.id}, ${hash})
    `;

    await this.log({
      userId: user.id,
      username: user.username,
      action: 'auth.register',
      targetTable: 'users',
      targetId: user.id,
      outcome: 'success',
      newValue: { username: user.username }, // email intentionally omitted — PII
      ctx,
    });

    return { message: 'User registered successfully', userId: user.id };
  }

  // ─── LOGIN ────────────────────────────────────────────────────────────────

  async login(email: string, password: string, ctx?: AuditContext) {
    // 1. Find user
    const [user] = await this.sql`
      SELECT id, username, role FROM users WHERE email = ${email}
    `;

    if (!user) {
      // Log failure — user_id is NULL because we don't know who this is.
      // username stores the attempted email for attack detection.
      await this.log({
        userId: null,
        username: email, // ← attempted identifier, not a real username
        action: 'auth.login_failure',
        targetTable: 'users',
        targetId: null,
        outcome: 'failure',
        ctx,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    // 2. Get password hash
    const [secret] = await this.sql`
      SELECT password_hash FROM user_secret WHERE id = ${user.id}
    `;

    // 3. Verify with Argon2
    const isValid = await argon2.verify(secret.password_hash, password);

    if (!isValid) {
      // Log failure — this time we know the user_id
      await this.log({
        userId: user.id,
        username: user.username,
        action: 'auth.login_failure',
        targetTable: 'users',
        targetId: user.id,
        outcome: 'failure',
        ctx,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    // 4. Log success
    await this.log({
      userId: user.id,
      username: user.username,
      action: 'auth.login_success',
      targetTable: 'users',
      targetId: user.id,
      outcome: 'success',
      ctx,
    });

    // 5. Sign and return JWT
    const payload = { sub: user.id, username: user.username, role: user.role };
    return {
      access_token:
        user.role === 'admin'
          ? this.jwtService.sign(payload, { expiresIn: '2h' })
          : this.jwtService.sign(payload, { expiresIn: '24h' }),
      role: user.role,
    };
  }

  async changePassword(
    userId: number,
    dto: { current_password: string; new_password: string },
    ctx?: AuditContext,
  ) {
    // 1. Get current hash
    const [secret] = await this.sql`
    SELECT password_hash FROM user_secret WHERE id = ${userId}
  `;
    if (!secret) throw new UnauthorizedException('User not found');

    // 2. Verify current password
    const isValid = await argon2.verify(
      secret.password_hash,
      dto.current_password,
    );
    if (!isValid) {
      await this.log({
        userId,
        username: null,
        action: 'auth.login_failure', // reuse — it's a failed credential check
        targetTable: 'user_secret',
        targetId: userId,
        outcome: 'failure',
        ctx,
      });
      throw new UnauthorizedException('Current password is incorrect');
    }

    // 3. Hash and update
    const newHash = await argon2.hash(dto.new_password);
    await this.sql`
    UPDATE user_secret SET password_hash = ${newHash} WHERE id = ${userId}
  `;

    await this.log({
      userId,
      username: null,
      action: 'auth.password_change',
      targetTable: 'user_secret',
      targetId: userId,
      outcome: 'success',
      ctx,
    });

    return { message: 'Password updated successfully' };
  }
}
