// apps/sync-server/eventLog/PgEventLog.ts — Postgres backend (opt-in).
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S22 lines 920-970 — Postgres advisory lock + INSERT pattern.
//   • S22 line 968 — alternative considered: per-project SERIAL.  We
//     follow the spec's BIGSERIAL + advisory-lock approach: sequence
//     numbers are globally unique but per-project monotonic (filter by
//     `project_id`).
//
// Schema (idempotent — `ensureSchema()` runs on first append):
//
//   CREATE TABLE IF NOT EXISTS sync_event_log (
//     id            BIGSERIAL PRIMARY KEY,
//     project_id    TEXT NOT NULL,
//     event_id      TEXT NOT NULL,
//     event_type    TEXT NOT NULL,
//     actor_id      TEXT NOT NULL,
//     event_payload JSONB NOT NULL,
//     created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
//     UNIQUE (project_id, event_id)
//   );
//   CREATE INDEX IF NOT EXISTS sync_event_log_project_seq_idx
//     ON sync_event_log (project_id, id);
//
// The `UNIQUE (project_id, event_id)` constraint provides server-side
// dedup — a duplicate `event.append` returns the existing row instead
// of inserting a second copy.
//
// NOTE: `id` is the BIGSERIAL primary key — the per-project sequence
// number is NOT `id` directly (that would be globally monotonic, which
// works in spec terms because we always filter by project_id; but
// a per-project local counter is friendlier for clients).  We compute
// the per-project sequence number with `(SELECT count(*) FROM ... WHERE
// project_id = $1) + 1` *inside* the advisory lock — guaranteeing
// monotonicity and gap-freedom.
//
// Implementation note: `pg` is loaded dynamically so the sync server can
// boot without `pg` installed when `SYNC_EVENT_LOG !== 'pg'`.

import type { CommandEvent, LinearisedEvent } from '../protocol/messages.js';
import type { AppendResult, EventLog, LoadResult } from './types.js';

/** Minimal Pool surface this file uses — keeps the source file `pg`-free
 *  at type-check time so tests / dev don't drag the runtime dep. */
export interface PgPoolLike {
  query<T = unknown>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
  end(): Promise<void>;
}

export interface PgEventLogOptions {
  readonly pool: PgPoolLike;
  /** Optional table name override.  Default `sync_event_log`. */
  readonly tableName?: string;
}

export class PgEventLog implements EventLog {
  private readonly pool: PgPoolLike;
  private readonly tableName: string;
  private schemaReady: Promise<void> | null = null;
  private _closed = false;

  constructor(opts: PgEventLogOptions) {
    this.pool = opts.pool;
    this.tableName = opts.tableName ?? 'sync_event_log';
  }

  async append(projectId: string, event: CommandEvent): Promise<AppendResult> {
    if (this._closed) throw new Error('PgEventLog: log is closed');
    await this.ensureSchema();

    const lockKey = hashProjectId(projectId);
    await this.pool.query('SELECT pg_advisory_lock($1)', [lockKey]);
    try {
      // Dedup-aware insert — `ON CONFLICT (project_id, event_id) DO NOTHING`
      // returns no rows if the event is a replay; we then SELECT the
      // existing row to keep the client's ack semantics consistent.
      const insert = await this.pool.query<{ created_at: string }>(
        `INSERT INTO ${this.tableName}
           (project_id, event_id, event_type, actor_id, event_payload)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (project_id, event_id) DO NOTHING
         RETURNING created_at`,
        [projectId, event.id, event.type, event.actorId, JSON.stringify(event.payload)],
      );

      let persistedAt: string;
      if (insert.rows.length === 0) {
        // Replay — fetch the existing row.
        const existing = await this.pool.query<{ created_at: string }>(
          `SELECT created_at FROM ${this.tableName}
           WHERE project_id = $1 AND event_id = $2`,
          [projectId, event.id],
        );
        if (existing.rows.length === 0) {
          throw new Error(
            `PgEventLog: invariant violated — duplicate insert for ${event.id} but no row found`,
          );
        }
        persistedAt = toIsoString(existing.rows[0]!.created_at);
      } else {
        persistedAt = toIsoString(insert.rows[0]!.created_at);
      }

      // Per-project sequence number = COUNT inside the lock.  Cheap
      // because the index covers it.
      const count = await this.pool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM ${this.tableName} WHERE project_id = $1`,
        [projectId],
      );
      const sequenceNumber = parseInt(count.rows[0]!.n, 10);
      return { sequenceNumber, persistedAt };
    } finally {
      await this.pool.query('SELECT pg_advisory_unlock($1)', [lockKey]);
    }
  }

  async load(projectId: string, fromSeq: number, limit: number): Promise<LoadResult> {
    if (this._closed) throw new Error('PgEventLog: log is closed');
    await this.ensureSchema();

    // Per-project ROW_NUMBER() reproduces the same sequence we assign
    // in append() — cheap with the (project_id, id) index.
    const { rows } = await this.pool.query<{
      seq: string;
      event_id: string;
      event_type: string;
      actor_id: string;
      event_payload: unknown;
      created_at: string;
    }>(
      `SELECT seq::text, event_id, event_type, actor_id, event_payload, created_at
       FROM (
         SELECT ROW_NUMBER() OVER (ORDER BY id) AS seq,
                event_id, event_type, actor_id, event_payload, created_at
         FROM ${this.tableName}
         WHERE project_id = $1
       ) sub
       WHERE seq > $2
       ORDER BY seq
       LIMIT $3`,
      [projectId, fromSeq, limit],
    );

    const events: LinearisedEvent[] = rows.map((r) => ({
      id: r.event_id,
      type: r.event_type,
      actorId: r.actor_id,
      payload: r.event_payload,
      projectId,
      sequenceNumber: parseInt(r.seq, 10),
      persistedAt: toIsoString(r.created_at),
    }));
    const nextSeq = events.length === 0 ? fromSeq : events[events.length - 1]!.sequenceNumber;
    const done = events.length < limit;
    return { events, nextSeq, done };
  }

  async latestSeq(projectId: string): Promise<number> {
    if (this._closed) throw new Error('PgEventLog: log is closed');
    await this.ensureSchema();
    const { rows } = await this.pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM ${this.tableName} WHERE project_id = $1`,
      [projectId],
    );
    return parseInt(rows[0]?.n ?? '0', 10);
  }

  async close(): Promise<void> {
    this._closed = true;
    await this.pool.end();
  }

  private async ensureSchema(): Promise<void> {
    if (this.schemaReady) return this.schemaReady;
    this.schemaReady = (async () => {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          id            BIGSERIAL PRIMARY KEY,
          project_id    TEXT NOT NULL,
          event_id      TEXT NOT NULL,
          event_type    TEXT NOT NULL,
          actor_id      TEXT NOT NULL,
          event_payload JSONB NOT NULL,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (project_id, event_id)
        );
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS ${this.tableName}_project_seq_idx
          ON ${this.tableName} (project_id, id);
      `);
    })();
    return this.schemaReady;
  }
}

/** Stable 32-bit hash → bigint-safe number for `pg_advisory_lock`.
 *  FNV-1a (32-bit) keeps the lock key inside JS's safe-int range and
 *  matches the spec's `hashProjectId(projectId)` reference (line 931). */
export function hashProjectId(projectId: string): number {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < projectId.length; i++) {
    h ^= projectId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Force into signed-32 range so the value fits a Postgres `bigint`
  // and never exceeds JS Number.MAX_SAFE_INTEGER.
  return h | 0;
}

function toIsoString(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  // pg returns TIMESTAMPTZ as Date by default; the string branch covers
  // configurations that disable type parsing.
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}
