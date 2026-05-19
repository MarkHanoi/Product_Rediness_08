// GeometryWorkerPool — ADR-047 · Task 4.2
//
// Pool of N `geometry.worker.ts` instances for curtain-wall geometry
// computation (fallback glass panels + mullion typed arrays).
//
// Design invariants:
//   P2 — THREE imported only from '@pryzm/renderer-three/three'; no bare 'three'.
//   P3 — No rAF usage; scheduling delegated to FrameScheduler.
//   P8 — Every exported method carries ≥1 OTel span.
//
// Worker pool mechanics:
//   • Default pool size: 2 workers (configurable via GEOMETRY_WORKER_POOL_SIZE
//     localStorage key or the constructor `size` parameter).
//   • Round-robin dispatch: each `dispatch()` call routes to the next worker
//     in the pool (index incremented modulo pool size).
//   • Back-pressure: if the same worker already has `MAX_INFLIGHT` pending
//     requests, dispatch falls back to the next available worker.
//   • Zero-copy: result ArrayBuffers are transferred from the worker and
//     must NOT be read after postMessage (per browser structured-clone spec).
//
// Resilience (§4.2-ROBUST-FALLBACK):
//   • Dead-worker detection: each PoolWorker carries a `dead` boolean that is
//     set to `true` when the worker's `error` event fires.  `_pickWorker()`
//     skips dead workers.  If ALL workers are dead `dispatch()` rejects
//     immediately so `CurtainWallBuilder._submitToWorker` can fall back to the
//     synchronous `build()` path within the current rAF frame.
//   • Per-request timeout: every `dispatch()` call arms a `DISPATCH_TIMEOUT_MS`
//     timer.  If the worker does not respond in time the pending promise is
//     rejected (and the inflight entry removed) so the caller can fall back.
//     This covers the "silent hang" failure mode where the worker module fails
//     to load (e.g. 404 in production) without firing an `error` event.
//   • Error result forwarding: if the worker posts back a result with `error`
//     set (i.e. processRequest() threw inside the worker), the pool rejects
//     the corresponding pending promise instead of resolving it.
//
// OTel:
//   Each `dispatch()` call opens a 'geo-worker.dispatch' span that ends when
//   the worker resolves the promise (i.e., spans track E2E worker latency).

import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { GeometryWorkerRequest, GeometryWorkerResult } from './GeometryWorkerTypes';

const TRACER = trace.getTracer('@pryzm/curtain-wall-builder', '0.1.0');

/** Maximum concurrent requests per individual worker before round-robin skips it. */
const MAX_INFLIGHT_PER_WORKER = 8;

/**
 * Per-request timeout in milliseconds.
 *
 * If a worker does not post its result within this window the pending promise
 * is rejected so `CurtainWallBuilder._submitToWorker` falls back to the
 * synchronous `build()` path.  10 s is deliberately generous — a healthy
 * worker should respond in <100 ms even for the largest walls.  The timeout
 * exists purely to handle the "silent hang" failure mode (worker module fails
 * to load without firing an error event).
 */
const DISPATCH_TIMEOUT_MS = 10_000;

interface PendingRequest {
    resolve: (result: GeometryWorkerResult) => void;
    reject:  (err: unknown) => void;
    /** setTimeout handle used to cancel the timeout on success. */
    timer:   ReturnType<typeof setTimeout>;
}

interface PoolWorker {
    worker:   Worker;
    inflight: Map<string, PendingRequest>;
    /**
     * Set to `true` when the worker's `error` event fires.
     * Dead workers are skipped by `_pickWorker()`.  If a request has already
     * been dispatched to a worker that subsequently dies, its pending promise
     * is rejected by the error handler.
     */
    dead: boolean;
}

// ---------------------------------------------------------------------------
// GeometryWorkerPool
// ---------------------------------------------------------------------------

/**
 * Manages a fixed pool of `geometry.worker.ts` instances.
 *
 * Usage:
 * ```ts
 * const pool = new GeometryWorkerPool();
 * const result = await pool.dispatch(request);
 * // reconstruct THREE.BufferGeometry from result.fallbackPanels, etc.
 * pool.terminate(); // on project close
 * ```
 */
export class GeometryWorkerPool {
    private readonly _pool: PoolWorker[];
    private _rrIndex = 0;
    private _terminated = false;

    constructor(size?: number) {
        const resolvedSize = size
            ?? GeometryWorkerPool._resolvePoolSize();
        this._pool = Array.from({ length: resolvedSize }, () =>
            this._createWorker()
        );
    }

    // ── Factory helpers ────────────────────────────────────────────────────

    private static _resolvePoolSize(): number {
        try {
            const stored = localStorage.getItem('GEOMETRY_WORKER_POOL_SIZE');
            if (stored) {
                const n = parseInt(stored, 10);
                if (n >= 1 && n <= 8) return n;
            }
        } catch {
            // localStorage not available (SSR / test environments)
        }
        return 2;
    }

    private _createWorker(): PoolWorker {
        // Stored in a variable so Vite skips static URL resolution analysis.
        // The worker is intentionally resolved at runtime via the dev/prod server.
        const workerPath = '../../../../apps/editor/src/workers/geometry.worker.ts';
        const worker = new Worker(
            new URL(workerPath, import.meta.url),
            { type: 'module' },
        );

        const pw: PoolWorker = { worker, inflight: new Map(), dead: false };

        worker.addEventListener('message', (ev: MessageEvent<GeometryWorkerResult>) => {
            const result = ev.data;
            const pending = pw.inflight.get(result.requestId);
            if (pending) {
                clearTimeout(pending.timer);
                pw.inflight.delete(result.requestId);
                // §4.2-ROBUST-FALLBACK: if the worker posted an error result,
                // reject so CurtainWallBuilder falls back to synchronous build().
                if (result.error) {
                    pending.reject(new Error(
                        `[GeometryWorkerPool] worker returned error for ${result.wallId}: ${result.error}`
                    ));
                } else {
                    pending.resolve(result);
                }
            }
        });

        worker.addEventListener('error', (ev: ErrorEvent) => {
            console.error('[GeometryWorkerPool] worker error:', ev.message, ev);
            // §4.2-ROBUST-FALLBACK: mark dead so _pickWorker() skips this worker
            // for all future dispatches.
            pw.dead = true;
            // Reject all currently-inflight requests for this worker.
            for (const [, pending] of pw.inflight) {
                clearTimeout(pending.timer);
                pending.reject(new Error(`Geometry worker error: ${ev.message}`));
            }
            pw.inflight.clear();
        });

        worker.addEventListener('messageerror', (ev: MessageEvent) => {
            console.error('[GeometryWorkerPool] worker messageerror (deserialization failed):', ev);
            // messageerror means the structured-clone of a RECEIVED message
            // failed — i.e. the worker sent something we cannot clone back.
            // This is a fatal worker-level fault; mark dead and reject inflight.
            pw.dead = true;
            for (const [, pending] of pw.inflight) {
                clearTimeout(pending.timer);
                pending.reject(new Error('Geometry worker: messageerror (deserialization)'));
            }
            pw.inflight.clear();
        });

        return pw;
    }

    // ── Public API ─────────────────────────────────────────────────────────

    /**
     * Dispatch a geometry computation request to the next available worker.
     * The caller MUST supply a unique `requestId` (echoed back in the result).
     * Returns a Promise that resolves with the typed-array result.
     *
     * §4.2-ROBUST-FALLBACK:
     *   • If all workers are dead the promise rejects immediately.
     *   • If the chosen worker does not respond within DISPATCH_TIMEOUT_MS the
     *     promise rejects (timeout) so the caller can fall back to sync build().
     *   • If the worker posts an error result the promise rejects.
     *
     * P8: opens an OTel 'geo-worker.dispatch' span covering full round-trip.
     */
    dispatch(request: GeometryWorkerRequest): Promise<GeometryWorkerResult> {
        if (this._terminated) {
            return Promise.reject(new Error('[GeometryWorkerPool] pool terminated'));
        }

        // §4.2-ROBUST-FALLBACK: if every worker has died, reject immediately so
        // CurtainWallBuilder can fall back to synchronous build() without waiting
        // for a per-request timeout.
        const allDead = this._pool.every(pw => pw.dead);
        if (allDead) {
            return Promise.reject(new Error('[GeometryWorkerPool] all workers dead — falling back to sync build'));
        }

        const span = TRACER.startSpan('geo-worker.dispatch', {
            attributes: {
                'geo.wall_id':    request.wallId,
                'geo.cell_count': request.cells.length,
                'geo.u_lines':    request.uLinesT.length,
                'geo.v_lines':    request.vLinesT.length,
                'geo.request_id': request.requestId,
            },
        });

        const { requestId } = request;

        // Round-robin: pick the least-loaded available (non-dead) worker
        const pw = this._pickWorker();

        // §4.2-ROBUST-FALLBACK: if the picked worker is dead (all non-dead
        // workers were saturated and we fell back to the primary), reject.
        if (pw.dead) {
            span.setStatus({ code: SpanStatusCode.ERROR, message: 'picked worker is dead' });
            span.end();
            return Promise.reject(new Error('[GeometryWorkerPool] picked worker is dead'));
        }

        return new Promise<GeometryWorkerResult>((resolve, reject) => {
            let settled = false;

            // §4.2-ROBUST-FALLBACK: per-request timeout.
            // If the worker does not post a result within DISPATCH_TIMEOUT_MS we
            // reject.  This handles the "silent hang" case (worker module 404'd
            // in production, or worker loaded but never set up a message handler).
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                pw.inflight.delete(requestId);
                const msg = `[GeometryWorkerPool] timeout after ${DISPATCH_TIMEOUT_MS}ms for request ${requestId} (wall ${request.wallId})`;
                console.warn(msg);
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'timeout' });
                span.end();
                reject(new Error(msg));
            }, DISPATCH_TIMEOUT_MS);

            pw.inflight.set(requestId, {
                resolve: (result) => {
                    if (settled) return;
                    settled = true;
                    span.setStatus({ code: SpanStatusCode.OK });
                    span.end();
                    resolve(result);
                },
                reject: (err) => {
                    if (settled) return;
                    settled = true;
                    span.setStatus({
                        code: SpanStatusCode.ERROR,
                        message: err instanceof Error ? err.message : String(err),
                    });
                    span.end();
                    reject(err);
                },
                timer,
            });
            pw.worker.postMessage(request);
        });
    }

    /**
     * Terminate all workers in the pool.
     * Call on project close / builder dispose to free OS thread resources.
     *
     * P8: synchronous span for OTel coverage.
     */
    terminate(): void {
        const span = TRACER.startSpan('geo-worker.terminate', {
            attributes: { 'geo.pool_size': this._pool.length },
        });
        try {
            this._terminated = true;
            for (const pw of this._pool) {
                // Cancel all pending timeouts and reject pending requests before terminating.
                for (const [, pending] of pw.inflight) {
                    clearTimeout(pending.timer);
                    pending.reject(new Error('[GeometryWorkerPool] pool terminated'));
                }
                pw.inflight.clear();
                pw.worker.terminate();
            }
            this._pool.length = 0;
            span.setStatus({ code: SpanStatusCode.OK });
        } catch (err) {
            span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
            span.recordException(err as Error);
            throw err;
        } finally {
            span.end();
        }
    }

    /** True after `terminate()` has been called. */
    get isTerminated(): boolean {
        return this._terminated;
    }

    // ── Internal ───────────────────────────────────────────────────────────

    /**
     * Round-robin worker selection with back-pressure fallback.
     *
     * §4.2-ROBUST-FALLBACK: dead workers are skipped.
     *   Pass 1 — find a live, non-saturated worker.
     *   Pass 2 — find any live worker (accept saturation over a dead one).
     *   Fallback — all workers dead; caller checks `pw.dead` and rejects.
     */
    private _pickWorker(): PoolWorker {
        const n = this._pool.length;

        // Pass 1: live + not saturated
        for (let attempt = 0; attempt < n; attempt++) {
            const idx = (this._rrIndex + attempt) % n;
            const pw = this._pool[idx];
            if (!pw.dead && pw.inflight.size < MAX_INFLIGHT_PER_WORKER) {
                this._rrIndex = (idx + 1) % n;
                return pw;
            }
        }

        // Pass 2: live (accept saturation)
        for (let attempt = 0; attempt < n; attempt++) {
            const idx = (this._rrIndex + attempt) % n;
            const pw = this._pool[idx];
            if (!pw.dead) {
                this._rrIndex = (idx + 1) % n;
                return pw;
            }
        }

        // All dead — return primary; dispatch() will detect pw.dead and reject.
        const idx = this._rrIndex % n;
        this._rrIndex = (idx + 1) % n;
        return this._pool[idx];
    }
}
