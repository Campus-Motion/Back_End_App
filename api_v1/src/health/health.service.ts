import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Sql } from 'postgres';
import { CreateHealthDto } from './dto/create-health.dto';
import { UpdateHealthDto } from './dto/update-health.dto';
import { AuditContext } from '../auth/auth.service';

const SENSITIVE_FIELDS: (keyof UpdateHealthDto)[] = [
  'sensitive_data',
  'client_key_version',
  'born',
];

@Injectable()
export class HealthService {
  constructor(
    @Inject('API_DB') private readonly apiDb: Sql,
    @Inject('AUDIT_DB') private readonly auditDb: Sql,
  ) {}

  // ─── Audit helper ─────────────────────────────────────────────────────────

  private async log({
    user_id,
    username,
    action,
    target_id,
    outcome = 'success',
    newValue,
    ctx,
  }: {
    user_id: number;
    username: string;
    action: string;
    target_id: number | null;
    outcome?: 'success' | 'failure';
    newValue?: Record<string, unknown>;
    ctx?: AuditContext;
  }) {
    await this.auditDb`
      INSERT INTO audit_log (
        user_id, username, action,
        target_table, target_id,
        outcome,
        new_value,
        ip_address, user_agent,
        http_method, endpoint
      ) VALUES (
        ${user_id},
        ${username},
        ${action}::audit_action,
        'health_data',
        ${target_id},
        ${outcome},
        ${newValue ? JSON.stringify(newValue) : null},
        ${ctx?.ip ?? null},
        ${ctx?.userAgent ?? null},
        ${ctx?.httpMethod ?? null},
        ${ctx?.endpoint ?? null}
      )
    `;
  }

  // ─── GET /health ───────────────────────────────────────────────────────────

  async findOwn(user: { id: number }) {
    console.log('findOwn user.id =', user.id);

    return this.apiDb.begin(async (tx: any) => {
      await tx`SELECT set_config('app.current_user_id', ${String(user.id)}, true)`;

      const row = await tx`
      SELECT id, user_id, born, weight_kg, height_cm, heart_rate_bpm,
             sensitive_data, client_key_version, consent_given_at,
             retain_until, deletion_requested_at, measured_at
      FROM health_data
      WHERE user_id = ${user.id}
    `;

      console.log('RLS-aware health_data row =', row);

      if (!row.length) {
        throw new NotFoundException('No health data found for this user');
      }

      return row[0];
    });
  }

  // ─── POST /health ──────────────────────────────────────────────────────────

  async create(
    dto: CreateHealthDto,
    user: { id: number; username: string },
    ctx?: AuditContext,
  ) {
    let record: any;
    console.log(
      'Creating health record with DTO:',
      dto,
      'for user ID:',
      user.id,
    );
    try {
      [record] = await this.apiDb`
        WITH set_ctx AS (
          SELECT set_config('app.current_user_id', ${String(user.id)}, true)
        )
        INSERT INTO health_data (
          user_id, born, sensitive_data,
          client_key_version, consent_given_at, retain_until
        )
        SELECT
          ${user.id},
          ${dto.born}::date,
          ${dto.sensitive_data},
          ${dto.client_key_version},
          ${dto.consent_given_at}::timestamp,
          ${dto.retain_until ?? null}::date
        FROM set_ctx
        RETURNING id, user_id, born, client_key_version, consent_given_at, retain_until, measured_at
      `;
    } catch (err: any) {
      if (err.code === '23505') {
        throw new ConflictException(
          'Health data record already exists for this user',
        );
      }
      throw err;
    }

    await this.log({
      user_id: user.id,
      username: user.username,
      action: 'health.create',
      target_id: record.id,
      newValue: {
        fields_written: [
          'born',
          'sensitive_data',
          'client_key_version',
          'consent_given_at',
        ],
        client_key_version: dto.client_key_version,
        note: 'Sensitive data stored as E2EE ciphertext — values not logged',
      },
      ctx,
    });

    return record;
  }

  // ─── PUT /health ───────────────────────────────────────────────────────────

  async update(
    dto: UpdateHealthDto,
    user: { id: number; username: string },
    ctx?: AuditContext,
  ) {
    if (Object.keys(dto).length === 0) {
      throw new UnprocessableEntityException('No fields provided to update');
    }

    const changedSensitiveFields = SENSITIVE_FIELDS.filter(
      (f) => dto[f] !== undefined,
    );

    const updated = await this.apiDb.begin(async (tx: any) => {
      await tx`SELECT set_config('app.current_user_id', ${String(user.id)}, true)`;

      const rows = await tx`
      UPDATE health_data SET
        born                 = COALESCE(${dto.born ?? null}::date,         born),
        weight_kg            = COALESCE(${dto.weight_kg ?? null},          weight_kg),
        height_cm            = COALESCE(${dto.height_cm ?? null},          height_cm),
        heart_rate_bpm       = COALESCE(${dto.heart_rate_bpm ?? null},     heart_rate_bpm),
        sensitive_data       = COALESCE(${dto.sensitive_data ?? null},     sensitive_data),
        client_key_version   = COALESCE(${dto.client_key_version ?? null}, client_key_version),
        retain_until         = COALESCE(${dto.retain_until ?? null}::date, retain_until),
        measured_at          = NOW()
      WHERE health_data.user_id = ${user.id}
      RETURNING
        health_data.id,
        health_data.user_id,
        health_data.born,
        health_data.weight_kg,
        health_data.height_cm,
        health_data.heart_rate_bpm,
        health_data.sensitive_data,
        health_data.client_key_version,
        health_data.consent_given_at,
        health_data.retain_until,
        health_data.deletion_requested_at,
        health_data.measured_at
    `;

      if (!rows.length) {
        throw new NotFoundException(
          'No health data found — create it first with POST /health',
        );
      }

      return rows[0];
    });

    await this.log({
      user_id: user.id,
      username: user.username,
      action: 'health.update',
      target_id: updated.id,
      newValue: {
        fields_updated: Object.keys(dto),
        sensitive_fields_touched: changedSensitiveFields,
        client_key_version: dto.client_key_version ?? null,
        note: 'Sensitive data stored as E2EE ciphertext — values not logged',
      },
      ctx,
    });

    return updated;
  }

  // ─── DELETE /health — GDPR soft-delete ────────────────────────────────────

  async requestDeletion(
    user: { id: number; username: string },
    ctx?: AuditContext,
  ) {
    const updated = await this.apiDb.begin(async (tx: any) => {
      await tx`SELECT set_config('app.current_user_id', ${String(user.id)}, true)`;

      const rows = await tx`
      UPDATE health_data SET
        deletion_requested_at = NOW()
      WHERE health_data.user_id = ${user.id}
        AND health_data.deletion_requested_at IS NULL
      RETURNING health_data.id
    `;

      if (!rows.length) {
        throw new NotFoundException(
          'No health data found, or deletion already requested',
        );
      }

      return rows[0];
    });

    await this.log({
      user_id: user.id,
      username: user.username,
      action: 'health.delete_requested',
      target_id: updated.id,
      newValue: {
        note: 'GDPR deletion request registered — data not yet hard-deleted',
      },
      ctx,
    });

    return { message: 'Health data deletion request registered' };
  }
}
