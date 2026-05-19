// apps/sync-server/locks/createSoftLockStore.ts — env-gated factory.
//
// Mirrors the eventLog factory pattern (apps/sync-server/eventLog/
// createEventLog.ts) so production toggles are uniform:
//
//   ┌──────────────────────────────────────────┬─────────────────────────┐
//   │ env                                      │ Selected store          │
//   ├──────────────────────────────────────────┼─────────────────────────┤
//   │ SYNC_SOFT_LOCKS=pg + DATABASE_URL set    │ PgSoftLockStore         │
//   │ default                                  │ InMemorySoftLockStore   │
//   │ SYNC_SOFT_LOCKS=pg, DATABASE_URL unset   │ InMemorySoftLockStore + warn │
//   │ SYNC_SOFT_LOCKS=pg, `pg` not installed   │ InMemorySoftLockStore + warn │
//   └──────────────────────────────────────────┴─────────────────────────┘

import { InMemorySoftLockStore } from './InMemorySoftLockStore.js';
import { PgSoftLockStore, type PgPoolLike } from './PgSoftLockStore.js';
import type { SoftLockStore } from './types.js';

export interface CreateSoftLockStoreOptions {
  readonly env?: Record<string, string | undefined>;
  readonly store?: SoftLockStore;
  readonly pgPool?: PgPoolLike;
}

export interface SoftLockStoreFactoryResult {
  readonly store: SoftLockStore;
  readonly selection: 'memory' | 'pg';
  readonly reason: string;
}

export async function createSoftLockStore(
  opts: CreateSoftLockStoreOptions = {},
): Promise<SoftLockStoreFactoryResult> {
  if (opts.store) {
    return { store: opts.store, selection: opts.store.stats().selection, reason: 'injected by caller' };
  }
  const env = opts.env ?? process.env;
  const requested = (env.SYNC_SOFT_LOCKS ?? 'memory').toLowerCase();

  if (requested === 'pg') {
    if (opts.pgPool) {
      return {
        store: new PgSoftLockStore({ pool: opts.pgPool }),
        selection: 'pg',
        reason: 'pg pool injected by caller',
      };
    }
    const url = env.DATABASE_URL;
    if (!url) {
      // eslint-disable-next-line no-console
      console.warn(
        '[sync-server] SYNC_SOFT_LOCKS=pg requested but DATABASE_URL is unset — falling back to in-memory',
      );
      return {
        store: new InMemorySoftLockStore(),
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
      if (!PoolCtor) throw new Error('pg module exported neither `Pool` nor `default.Pool`');
      const pool = new PoolCtor({ connectionString: url });
      return {
        store: new PgSoftLockStore({ pool }),
        selection: 'pg',
        reason: 'Postgres-backed soft-locks (DATABASE_URL set)',
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.warn(
        `[sync-server] SYNC_SOFT_LOCKS=pg requested but \`pg\` failed to load (${msg}) — falling back to in-memory`,
      );
      return {
        store: new InMemorySoftLockStore(),
        selection: 'memory',
        reason: `pg load failure: ${msg}`,
      };
    }
  }

  return {
    store: new InMemorySoftLockStore(),
    selection: 'memory',
    reason: 'default (SYNC_SOFT_LOCKS unset or "memory")',
  };
}
