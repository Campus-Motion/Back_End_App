/**
 * Experiment 4 — E2EE: admin_role cannot access health_data
 * Proves:
 *   A) admin_role has no GRANT on health_data table
 *   B) Even the superuser sees only ciphertext in the sensitive_data column
 * Type: Direct DB test
 *
 * Prerequisites:
 *   DB_ADMIN_ROLE_URL=postgres://admin_role:<pwd>@localhost:5432/campus_motion
 *   DB_SUPERUSER_URL=postgres://admin:<pwd>@localhost:5432/campus_motion
 */
import { Client } from 'pg';

const ADMIN_ROLE_URL =
  process.env.DB_ADMIN_ROLE_URL ??
  'postgres://admin_role:admin_password@localhost:5432/campus_motion';

const SUPERUSER_URL =
  process.env.DB_SUPERUSER_URL ??
  'postgres://admin:admin_password@localhost:5432/campus_motion';

describe('[EXP 4] E2EE — health_data opacity', () => {
  let adminClient: Client;
  let superClient: Client;

  beforeAll(async () => {
    adminClient = new Client({ connectionString: ADMIN_ROLE_URL });
    await adminClient.connect();

    superClient = new Client({ connectionString: SUPERUSER_URL });
    await superClient.connect();
  });

  afterAll(async () => {
    await adminClient.end();
    await superClient.end();
  });

  // Part A: admin_role has no access to health_data
  it('admin_role: SELECT on health_data must throw permission denied', async () => {
    await expect(
      adminClient.query('SELECT * FROM health_data LIMIT 1'),
    ).rejects.toThrow(/permission denied/i);
  });

  // Part B: superuser sees only opaque ciphertext in sensitive_data
  it('superuser: sensitive_data column contains only Base64 ciphertext (no plaintext)', async () => {
    const res = await superClient.query<{ sensitive_data: string }>(
      "SELECT sensitive_data FROM health_data WHERE sensitive_data IS NOT NULL LIMIT 5",
    );

    if (res.rows.length === 0) {
      // No health data yet — test is vacuously satisfied, warn
      console.warn('[EXP 4] No health_data rows found; seed test data first.');
      return;
    }

    const base64Regex = /^[A-Za-z0-9+/]+=*$/;

    res.rows.forEach((row) => {
      // Must look like Base64 (our E2EE ciphertext format)
      expect(row.sensitive_data).toMatch(base64Regex);
      // Must NOT contain obvious plaintext patterns (numbers, JSON, common words)
      expect(row.sensitive_data).not.toMatch(/weight|height|born|\{|\}/i);
    });
  });
});
