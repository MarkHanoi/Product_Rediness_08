// Postgres-backed soft-lock store.  Schema lives in soft-locks.sql.
//
// Concurrency model:
//   • acquire/extend/release run inside a single transaction.
//   • A per-row pg_advisory_xact_lock keyed on `hash(projectId, elementId)`
//     guards the (read-existing → maybe-insert → maybe-overwrite) sequence
//     against torn writes from concurrent gateways.
//   • UNIQUE(element_id) enforces single-row-per-element at the storage
//     layer as a belt-and-braces backstop.
//
// Per spec §S45 line 440 the sweeper runs every 5 s.  Sweeper.ts owns the
// scheduling; this file only provides the SQL primitive.

import type { LockRow } from '@pryzm/sync-client';
import {
  LeaseMismatchError,
  NoSuchLockError,
  type AcquireInput,
  type AcquireResult,
  type ExtendInput,
  type ReleaseInput,
  type SoftLockStats,
  type SoftLockStore,
} from './types.js';

export interface PgPoolLike {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end?(): Promise<void>;
}

export interface PgSoftLockStoreOptions {
  readonly pool: PgPoolLike;
}

interface PgRow {
  element_id: string;
  project_id: string;
  holder_id: string;
  holder_display_name: string;
  lease_id: string;
  acquired_at: string | Date;
  expires_at: string | Date;
}

const toMs = (v: string | Date): number => (v instanceof Date ? v.getTime() : new Date(v).getTime());

const toLockRow = (r: PgRow): LockRow => ({
  elementId: r.element_id,
  holderId: r.holder_id,
  holderDisplayName: r.holder_display_name,
  leaseId: r.lease_id,
  acquiredAtMs: toMs(r.acquired_at),
  expiresAtMs: toMs(r.expires_at),
});

export class PgSoftLockStore implements SoftLockStore {
  private readonly pool: PgPoolLike;

  constructor(opts: PgSoftLockStoreOptions) {
    this.pool = opts.pool;
  }

  async acquire(input: AcquireInput): Promise<AcquireResult> {
    // SELECT-then-INSERT-or-UPDATE under advisory lock to keep the
    // read-existing-row check race-free across multiple sync-server processes.
    const sql = `
      WITH lock_key AS (SELECT hashtextextended($1 || $2, 0) AS k),
           _adv AS (SELECT pg_advisory_xact_lock((SELECT k FROM lock_key))),
           existing AS (
             SELECT * FROM soft_locks WHERE element_id = $2 AND project_id = $1
           ),
           upserted AS (
             INSERT INTO soft_locks (
               element_id, project_id, holder_id, holder_display_name,
               lease_id, acquired_at, expires_at
             )
             SELECT $2, $1, $3, $4, $5, now(), now() + ($6 || ' milliseconds')::interval
             WHERE NOT EXISTS (
               SELECT 1 FROM existing
                WHERE expires_at > now() AND holder_id <> $3
             )
             ON CONFLICT (element_id) DO UPDATE
               SET holder_id           = EXCLUDED.holder_id,
                   holder_display_name = EXCLUDED.holder_display_name,
                   lease_id            = EXCLUDED.lease_id,
                   acquired_at         = CASE WHEN soft_locks.holder_id = EXCLUDED.holder_id
                                              THEN soft_locks.acquired_at ELSE now() END,
                   expires_at          = EXCLUDED.expires_at
               WHERE soft_locks.expires_at <= now()
                  OR soft_locks.holder_id = EXCLUDED.holder_id
             RETURNING *
           )
      SELECT * FROM upserted
      UNION ALL
      SELECT * FROM existing WHERE NOT EXISTS (SELECT 1 FROM upserted);
    `;
    const { rows } = await this.pool.query(sql, [
      input.projectId,
      input.elementId,
      input.holderId,
      input.holderDisplayName,
      input.leaseId,
      String(Math.max(1, input.ttlMs)),
    ]);
    if (rows.length === 0) {
      // Should not happen — at minimum the existing row would be returned.
      throw new Error('PgSoftLockStore.acquire: no row returned');
    }
    const row = rows[0] as unknown as PgRow;
    if (row.holder_id !== input.holderId) {
      return {
        ok: false,
        holder: {
          userId: row.holder_id,
          displayName: row.holder_display_name,
          expiresAtMs: toMs(row.expires_at),
        },
      };
    }
    return { ok: true, row: toLockRow(row) };
  }

  async extend(input: ExtendInput): Promise<LockRow> {
    const { rows } = await this.pool.query(
      `UPDATE soft_locks
          SET expires_at = now() + ($4 || ' milliseconds')::interval
        WHERE element_id = $1
          AND project_id = $2
          AND lease_id = $3
          AND holder_id = $5
        RETURNING *`,
      [input.elementId, input.projectId, input.leaseId, String(Math.max(1, input.ttlMs)), input.holderId],
    );
    if (rows.length === 0) {
      // Determine whether the row exists at all — for the right error class.
      const probe = await this.pool.query(
        `SELECT 1 FROM soft_locks WHERE element_id = $1 AND project_id = $2`,
        [input.elementId, input.projectId],
      );
      if (probe.rows.length === 0) throw new NoSuchLockError(input.elementId);
      throw new LeaseMismatchError(input.elementId);
    }
    return toLockRow(rows[0] as unknown as PgRow);
  }

  async release(input: ReleaseInput): Promise<boolean> {
    const { rows } = await this.pool.query(
      `DELETE FROM soft_locks
        WHERE element_id = $1
          AND project_id = $2
          AND lease_id = $3
        RETURNING element_id`,
      [input.elementId, input.projectId, input.leaseId],
    );
    if (rows.length > 0) return true;
    const probe = await this.pool.query(
      `SELECT 1 FROM soft_locks WHERE element_id = $1 AND project_id = $2`,
      [input.elementId, input.projectId],
    );
    if (probe.rows.length === 0) return false;
    throw new LeaseMismatchError(input.elementId);
  }

  async list(projectId: string): Promise<readonly LockRow[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM soft_locks
        WHERE project_id = $1
          AND expires_at > now()
        ORDER BY element_id`,
      [projectId],
    );
    return rows.map((r) => toLockRow(r as unknown as PgRow));
  }

  async sweepExpired(): Promise<readonly LockRow[]> {
    const { rows } = await this.pool.query(
      `DELETE FROM soft_locks WHERE expires_at <= now() RETURNING *`,
    );
    return rows.map((r) => toLockRow(r as unknown as PgRow));
  }

  async releaseAllForProject(projectId: string): Promise<number> {
    const { rows } = await this.pool.query(
      `DELETE FROM soft_locks WHERE project_id = $1 RETURNING element_id`,
      [projectId],
    );
    return rows.length;
  }

  stats(): SoftLockStats {
    return { heldCount: -1, selection: 'pg' };
  }

  async close(): Promise<void> {
    if (this.pool.end) await this.pool.end();
  }
}
