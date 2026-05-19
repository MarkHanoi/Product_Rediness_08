// apps/sync-server/bake/InProcessBakeEnqueuer.ts — in-proc test fixture.
//
// Used by the `sync-roundtrip` bench and by integration tests that want
// to assert "the sync server enqueued a bake job for this batch" without
// the cost of an HTTP round-trip.  The dispatch fn is invoked on a
// microtask, mirroring HttpBakeEnqueuer's fire-and-forget semantics.

import type {
  BakeEnqueueRequest,
  BakeEnqueuer,
  BakeEnqueuerStats,
} from './types.js';

export type InProcessBakeDispatch = (req: BakeEnqueueRequest) => Promise<void> | void;

export class InProcessBakeEnqueuer implements BakeEnqueuer {
  private _enqueued = 0;
  private _failed = 0;
  private _lastError: string | null = null;

  constructor(private readonly dispatch: InProcessBakeDispatch) {}

  async enqueue(req: BakeEnqueueRequest): Promise<void> {
    this._enqueued++;
    queueMicrotask(() => {
      Promise.resolve()
        .then(() => this.dispatch(req))
        .catch((err: unknown) => {
          this._failed++;
          this._lastError = err instanceof Error ? err.message : String(err);
        });
    });
  }

  stats(): BakeEnqueuerStats {
    return {
      enqueued: this._enqueued,
      failed: this._failed,
      lastError: this._lastError,
      target: 'in-process',
    };
  }

  async close(): Promise<void> {
    // Nothing to release.
  }
}
