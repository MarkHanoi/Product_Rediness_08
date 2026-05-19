// apps/sync-server/bake/NoopBakeEnqueuer.ts — default fire-and-forget.
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S22 line 972 — bake failure MUST NOT cascade to the event log.
//
// Used when no bake worker URL is configured.  Counts calls + records
// the most recent payload size so `/stats` shows enqueue activity even
// when no real bake worker is wired up — useful for the alpha demo
// where the editor + sync server run together without a separate bake
// worker process.

import type {
  BakeEnqueueRequest,
  BakeEnqueuer,
  BakeEnqueuerStats,
} from './types.js';

export class NoopBakeEnqueuer implements BakeEnqueuer {
  private _enqueued = 0;
  private _lastSize = 0;

  async enqueue(req: BakeEnqueueRequest): Promise<void> {
    this._enqueued++;
    this._lastSize = req.events.length;
  }

  stats(): BakeEnqueuerStats {
    return {
      enqueued: this._enqueued,
      failed: 0,
      lastError: null,
      target: `noop (last batch: ${this._lastSize} events)`,
    };
  }

  async close(): Promise<void> {
    // Nothing to release.
  }
}
