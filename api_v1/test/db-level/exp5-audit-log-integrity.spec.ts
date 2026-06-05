/**
 * Experiment 5 — Audit Log Integrity
 * Proves: api_role cannot SELECT, DELETE, or UPDATE audit_log.
 * Type: Direct DB test (connects as api_role)
 */
import { Client } from 'pg';

const API_ROLE_URL =
  process.env.DB_API_ROLE_URL ??
  'postgres://api_role:api_password@localhost:5432/campus_motion';

describe('[EXP 5] Audit log — tamper resistance from api_role', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: API_ROLE_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it('SELECT on audit_log is denied', async () => {
    await expect(
      client.query('SELECT * FROM audit_log LIMIT 1'),
    ).rejects.toThrow(/permission denied/i);
  });

  it('DELETE on audit_log is denied', async () => {
    await expect(
      client.query('DELETE FROM audit_log'),
    ).rejects.toThrow(/permission denied/i);
  });

  it('UPDATE on audit_log is denied', async () => {
    await expect(
      client.query("UPDATE audit_log SET outcome = 'success'"),
    ).rejects.toThrow(/permission denied/i);
  });
});
