/**
 * Experiment 2 — Role Separation: api_role cannot read user_secret
 * Proves: The database GRANT system blocks api_role from user_secret.
 * Type: Direct DB test (connects as api_role via postgres.js / pg)
 *
 * Prerequisites:
 *   DB_API_ROLE_URL=postgres://api_role:<pwd>@localhost:5432/campus_motion
 */
import { Client } from 'pg';

const API_ROLE_URL =
  process.env.DB_API_ROLE_URL ??
  'postgres://api_role:api_password@localhost:5432/campus_motion';

describe('[EXP 2] Role separation — api_role cannot access user_secret', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: API_ROLE_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it('SELECT on user_secret must throw a permission denied error', async () => {
    await expect(
      client.query('SELECT * FROM user_secret LIMIT 1'),
    ).rejects.toThrow(/permission denied/i);
  });

  it('INSERT into user_secret must throw a permission denied error', async () => {
    await expect(
      client.query(
        "INSERT INTO user_secret (id, password_hash) VALUES (99999, 'fakehash')",
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
