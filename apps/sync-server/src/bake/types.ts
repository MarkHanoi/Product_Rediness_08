// apps/sync-server/bake/types.ts — bake-enqueuer contract.
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S22 lines 955-961 — fire-and-forget bake-queue enqueue.
//   • S22 line 972 — bake failure MUST NOT cascade to the event log.
//
// The sync server depends on a small interface rather than the bake
// worker's concrete `BakeQueue` because the two services typically run
// in different processes (bake worker on :4001, sync server on :4000).
// Three implementations satisfy the contract:
//
//   • NoopBakeEnqueuer        — default; logs the call and returns.
//                               Used in dev / Replit when no bake worker
//                               is running.
//
//   • HttpBakeEnqueuer        — production; POSTs `/enqueue` to the bake
//                               worker.  Selected when `BAKE_URL` is set.
//
//   • InProcessBakeEnqueuer   — test / bench fixture; calls the bake
//                               worker's CoalesceWindow directly without
//                               an HTTP hop.  Used by sync-roundtrip
//                               bench to remove network noise.

import type { LinearisedEvent } from '../protocol/messages.js';

export interface BakeEnqueueRequest {
  readonly projectId: string;
  readonly levelId: string;
  readonly events: readonly LinearisedEvent[];
}

export interface BakeEnqueuer {
  /** Fire-and-forget — the returned promise resolves once the request
   *  is *accepted* by the bake worker, NOT once the bake completes.
   *  Failures are logged + swallowed; they MUST NOT propagate to the
   *  caller (spec line 972). */
  enqueue(req: BakeEnqueueRequest): Promise<void>;

  /** Snapshot of enqueue counters — used by `/stats` and tests. */
  stats(): BakeEnqueuerStats;

  /** Release any held resources. */
  close(): Promise<void>;
}

export interface BakeEnqueuerStats {
  readonly enqueued: number;
  readonly failed: number;
  readonly lastError: string | null;
  readonly target: string;
}
