// apps/bake-worker/queue/createQueue.ts — env-gated queue factory.
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S21 line 656 — `REDIS_URL` env var configures BullMQ connection.
//
// Decision matrix:
//   ┌────────────────────────────┬────────────────────────────────────┐
//   │ REDIS_URL set?             │ Selected queue                     │
//   ├────────────────────────────┼────────────────────────────────────┤
//   │ Yes (and bullmq installed) │ BullMQBakeQueue                    │
//   │ No                         │ InMemoryBakeQueue                  │
//   │ Yes but bullmq missing     │ InMemoryBakeQueue + warning log    │
//   └────────────────────────────┴────────────────────────────────────┘
//
// `BAKE_QUEUE=memory` overrides to in-memory regardless of env.

import os from 'node:os';
import { InMemoryBakeQueue } from './InMemoryBakeQueue.js';
import type { BakeQueue } from './types.js';

export interface CreateQueueOptions {
  readonly env?: Record<string, string | undefined>;
  /** Override worker concurrency.  Default: `os.cpus().length - 1`
   *  (clamped to ≥ 1) — spec `[strategic ADR-005]`. */
  readonly concurrency?: number;
}

export interface QueueFactoryResult {
  readonly queue: BakeQueue;
  readonly selection: 'memory' | 'bullmq';
  readonly concurrency: number;
  readonly reason: string;
}

/** Spec `[strategic ADR-005]` — canonical pool sizing. */
export function defaultConcurrency(): number {
  return Math.max(1, os.cpus().length - 1);
}

export async function createQueue(opts: CreateQueueOptions = {}): Promise<QueueFactoryResult> {
  const env = opts.env ?? process.env;
  const concurrency = opts.concurrency ?? defaultConcurrency();

  if (env.BAKE_QUEUE === 'memory' || !env.REDIS_URL) {
    return {
      queue: new InMemoryBakeQueue({ concurrency }),
      selection: 'memory',
      concurrency,
      reason: env.BAKE_QUEUE === 'memory'
        ? 'BAKE_QUEUE=memory env var'
        : 'no REDIS_URL set; defaulting to in-process queue',
    };
  }

  // REDIS_URL set — try to load BullMQ.  If unavailable, fall back to
  // in-memory with a warning so the bake worker still boots in a
  // half-configured environment (e.g. Replit container with stale env).
  try {
    // Dynamic import keeps `bullmq` out of the dev/test import graph.
    // The S22 sprint adds the dep + the `BullMQBakeQueue` adapter.
    await import('bullmq');
    // Until the BullMQ adapter ships in S22 D2, prefer the in-memory
    // queue (with warning) so dev / CI behaviour stays predictable.
    console.warn(
      '[bake-worker] REDIS_URL is set but the BullMQ adapter is not yet ' +
      'wired (S22 D2 deliverable).  Falling back to InMemoryBakeQueue.',
    );
  } catch {
    console.warn(
      '[bake-worker] REDIS_URL is set but `bullmq` is not installed.  ' +
      'Falling back to InMemoryBakeQueue.',
    );
  }

  return {
    queue: new InMemoryBakeQueue({ concurrency }),
    selection: 'memory',
    concurrency,
    reason: 'BullMQ adapter pending S22 D2 — using in-memory fallback',
  };
}
