// WorkerPool — hard cap of 4 browser Web Workers (S03-T2a).
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S03-T2a (added 2026-04-27):
//   "the frame scheduler must enforce a **hard cap of 4** browser Web Workers
//    per [strategic ADR-005] (worker pool policy). The scheduler refuses to
//    spawn a 5th and surfaces a structured error (`worker.pool.exhausted`)."
//
// The pool is intentionally separate from `FrameScheduler` so unit tests
// can import it without a DOM/rAF shim.  `FrameScheduler` holds an optional
// `WorkerPool` instance and exposes `scheduler.workers` as a typed getter.
//
// Usage:
//   ```ts
//   const pool = new WorkerPool();
//   const w = pool.spawn(() => new Worker(new URL('./my.worker.js', import.meta.url)));
//   pool.release(w); // terminates + deregisters
//   pool.dispose();  // terminates all + clears
//   ```

/** Hard cap mandated by `[strategic ADR-005]`. */
export const WORKER_POOL_CAP = 4;

/**
 * Thrown by `WorkerPool.spawn()` when the pool is at capacity.
 * The `code` field is the structured error key `worker.pool.exhausted`
 * as specified in the S03-T2a sub-phase contract.
 */
export class WorkerPoolExhaustedError extends Error {
  /** Machine-readable structured-error code. */
  readonly code = 'worker.pool.exhausted' as const;
  /** Current cap at the time the error was thrown. */
  readonly cap: number;

  constructor(cap: number) {
    super(
      `[WorkerPool] Refused to spawn worker: hard cap of ${cap} browser Web Workers reached. ` +
      `See [strategic ADR-005] — worker pool policy.`,
    );
    this.name = 'WorkerPoolExhaustedError';
    this.cap = cap;
  }
}

/**
 * A reference-counted pool of browser Web Workers with a hard size cap.
 *
 * Workers are tracked by identity (object reference).  The caller is
 * responsible for obtaining the `Worker` from `spawn()` and returning it
 * via `release()` when done; the pool calls `worker.terminate()` on
 * `release()` and `dispose()`.
 */
export class WorkerPool {
  private readonly workers = new Set<Worker>();
  private readonly _cap: number;

  /** @param cap Maximum number of live workers.  Defaults to `WORKER_POOL_CAP` (4). */
  constructor(cap: number = WORKER_POOL_CAP) {
    if (cap < 1) throw new RangeError(`[WorkerPool] cap must be ≥ 1, got ${cap}`);
    this._cap = cap;
  }

  /**
   * Spawn a new worker using the provided factory.
   * Throws `WorkerPoolExhaustedError` (code `worker.pool.exhausted`) if the
   * pool is at capacity (`count >= cap`).
   *
   * The factory is invoked *inside* the cap check, so the worker is never
   * created if the pool is full — no resource is wasted.
   */
  spawn(factory: () => Worker): Worker {
    if (this.workers.size >= this._cap) {
      throw new WorkerPoolExhaustedError(this._cap);
    }
    const worker = factory();
    this.workers.add(worker);
    return worker;
  }

  /**
   * Terminate and deregister a worker previously obtained from `spawn()`.
   * No-op if the worker is not in the pool (e.g. already released).
   */
  release(worker: Worker): void {
    if (this.workers.has(worker)) {
      worker.terminate();
      this.workers.delete(worker);
    }
  }

  /** Number of currently live workers. */
  get count(): number { return this.workers.size; }

  /** Number of workers that can still be spawned before the pool is full. */
  get available(): number { return this._cap - this.workers.size; }

  /** `true` when `count >= cap` — `spawn()` will throw on the next call. */
  get exhausted(): boolean { return this.workers.size >= this._cap; }

  /** The hard cap this pool was initialised with. */
  get cap(): number { return this._cap; }

  /**
   * Terminate all live workers and clear the pool.
   * Safe to call multiple times.
   */
  dispose(): void {
    for (const w of this.workers) {
      w.terminate();
    }
    this.workers.clear();
  }
}
