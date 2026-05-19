// apps/sync-server/eventLog/createEventLog.ts — env-gated factory.
//
// Decision matrix:
//   ┌────────────────────────────────────────┬────────────────────────┐
//   │ env                                    │ Selected log           │
//   ├────────────────────────────────────────┼────────────────────────┤
//   │ SYNC_EVENT_LOG=pg + DATABASE_URL set   │ PgEventLog             │
//   │ default                                │ InMemoryEventLog       │
//   │ SYNC_EVENT_LOG=pg, DATABASE_URL unset  │ InMemoryEventLog + warn│
//   │ SYNC_EVENT_LOG=pg, `pg` not installed  │ InMemoryEventLog + warn│
//   └────────────────────────────────────────┴────────────────────────┘

import { InMemoryEventLog } from './InMemoryEventLog.js';
import { PgEventLog, type PgPoolLike } from './PgEventLog.js';
import type { EventLog } from './types.js';

export interface CreateEventLogOptions {
  readonly env?: Record<string, string | undefined>;
  /** Test injection — bypasses the env-gated factory entirely. */
  readonly log?: EventLog;
  /** Test injection — wires PgEventLog onto a custom pool. */
  readonly pgPool?: PgPoolLike;
}

export interface EventLogFactoryResult {
  readonly log: EventLog;
  readonly selection: 'memory' | 'pg';
  readonly reason: string;
}

export async function createEventLog(
  opts: CreateEventLogOptions = {},
): Promise<EventLogFactoryResult> {
  if (opts.log) {
    return { log: opts.log, selection: 'memory', reason: 'injected by caller' };
  }

  const env = opts.env ?? process.env;
  const requested = (env.SYNC_EVENT_LOG ?? 'memory').toLowerCase();

  if (requested === 'pg') {
    if (opts.pgPool) {
      return {
        log: new PgEventLog({ pool: opts.pgPool }),
        selection: 'pg',
        reason: 'pg pool injected by caller',
      };
    }
    const url = env.DATABASE_URL;
    if (!url) {
      // eslint-disable-next-line no-console
      console.warn(
        '[sync-server] SYNC_EVENT_LOG=pg requested but DATABASE_URL is unset — falling back to in-memory',
      );
      return {
        log: new InMemoryEventLog(),
        selection: 'memory',
        reason: 'pg requested but DATABASE_URL unset',
      };
    }
    try {
      const pgMod = (await import('pg')) as unknown as {
        default?: { Pool: new (cfg: { connectionString: string }) => PgPoolLike };
        Pool?: new (cfg: { connectionString: string }) => PgPoolLike;
      };
      const PoolCtor = pgMod.Pool ?? pgMod.default?.Pool;
      if (!PoolCtor) {
        throw new Error('pg module exported neither `Pool` nor `default.Pool`');
      }
      const pool = new PoolCtor({ connectionString: url });
      return {
        log: new PgEventLog({ pool }),
        selection: 'pg',
        reason: `Postgres @ ${redactUrl(url)}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.warn(
        `[sync-server] SYNC_EVENT_LOG=pg requested but \`pg\` failed to load (${msg}) — falling back to in-memory`,
      );
      return {
        log: new InMemoryEventLog(),
        selection: 'memory',
        reason: `pg load failure: ${msg}`,
      };
    }
  }

  return {
    log: new InMemoryEventLog(),
    selection: 'memory',
    reason: 'default (SYNC_EVENT_LOG unset or "memory")',
  };
}

function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return '<invalid-url>';
  }
}
