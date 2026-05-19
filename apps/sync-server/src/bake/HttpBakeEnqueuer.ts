// apps/sync-server/bake/HttpBakeEnqueuer.ts — POSTs to bake worker.
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S22 lines 955-961 — fire-and-forget bake-queue enqueue.
//   • S22 line 972 — bake failure MUST NOT cascade to the event log.
//
// Wire shape matches `apps/bake-worker/src/index.ts` POST /enqueue:
//   { projectId, levelId, events: [{ id, type, payload }, ...] }
//
// The HTTP call is dispatched on the next microtask so the AppendEvent
// handler can return the `event.ack` to the client immediately — the
// bake worker's response is never awaited by the WebSocket round-trip.

import type {
  BakeEnqueueRequest,
  BakeEnqueuer,
  BakeEnqueuerStats,
} from './types.js';

export interface HttpBakeEnqueuerOptions {
  /** Base URL of the bake worker — e.g. `http://localhost:4001`.
   *  The `/enqueue` suffix is appended automatically. */
  readonly baseUrl: string;
  /** AbortSignal timeout in ms.  Default 5000. */
  readonly timeoutMs?: number;
  /** Test injection — replaces global fetch. */
  readonly fetchImpl?: typeof fetch;
}

export class HttpBakeEnqueuer implements BakeEnqueuer {
  private _enqueued = 0;
  private _failed = 0;
  private _lastError: string | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly url: string;
  private _closed = false;

  constructor(opts: HttpBakeEnqueuerOptions) {
    this.url = opts.baseUrl.replace(/\/$/, '') + '/enqueue';
    this.timeoutMs = opts.timeoutMs ?? 5_000;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async enqueue(req: BakeEnqueueRequest): Promise<void> {
    if (this._closed) return;

    // The wire shape that bake-worker /enqueue expects.
    const body = JSON.stringify({
      projectId: req.projectId,
      levelId: req.levelId,
      events: req.events.map((e) => ({
        id: e.id,
        type: e.type,
        payload: e.payload,
      })),
    });

    // Fire-and-forget — schedule on a microtask so the WS round-trip is
    // not blocked.  Failures are caught and recorded; never re-thrown.
    queueMicrotask(() => {
      void this.dispatch(body);
    });
    this._enqueued++;
  }

  private async dispatch(body: string): Promise<void> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: ctrl.signal,
      });
      if (!res.ok) {
        this._failed++;
        this._lastError = `HTTP ${res.status}`;
        // eslint-disable-next-line no-console
        console.warn(`[sync-server] bake enqueue failed: HTTP ${res.status}`);
      }
    } catch (err) {
      this._failed++;
      this._lastError = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.warn(`[sync-server] bake enqueue failed: ${this._lastError}`);
    } finally {
      clearTimeout(t);
    }
  }

  stats(): BakeEnqueuerStats {
    return {
      enqueued: this._enqueued,
      failed: this._failed,
      lastError: this._lastError,
      target: this.url,
    };
  }

  async close(): Promise<void> {
    this._closed = true;
  }
}
