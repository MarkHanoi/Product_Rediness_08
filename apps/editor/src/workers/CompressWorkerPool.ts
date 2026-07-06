// CompressWorkerPool — §PERF-COMPRESS-WORKER (L-131 P4a)
//
// Main-thread handle to a single `compress.worker.ts` instance that performs
// snapshot DEFLATE off the render thread. Mirrors the `GeometryWorkerPool`
// substrate (pending-promise map keyed by requestId, per-request timeout, dead
// detection, OTel span per dispatch) but is deliberately a SINGLE worker: version
// saves are serialised (one auto-save at a time) so a pool of 1 is sufficient and
// stays well under the WORKER_POOL_CAP of 4 mandated by [strategic ADR-005].
//
// SAFETY / REVERTIBILITY:
//   • Lazy construction — the worker is only spawned the first time compression is
//     attempted, and construction failure (SSR / test env / 404) is swallowed and
//     flips the pool to a permanent "not ready" state so the caller uses the
//     synchronous fallback. Behaviour is therefore never worse than today.
//   • `isReady()` is SYNCHRONOUS and only returns true AFTER the worker posts its
//     startup handshake. The caller uses it to decide sync-vs-async up front, so a
//     never-loading worker can never hang a save (no promise is ever created for a
//     not-ready worker).
//
// P8: `compress()` opens an OTel span covering the full worker round-trip.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
    COMPRESS_WORKER_READY_ID,
    type CompressItem,
    type CompressWorkerRequest,
    type CompressWorkerResult,
} from './compressCodec';

const TRACER = trace.getTracer('@pryzm/editor-compress-worker', '0.1.0');

/**
 * Per-request timeout. A healthy worker compresses even a large snapshot in tens
 * of ms; the timeout exists purely to cover the "silent hang" mode (worker module
 * failed to load without an error event) so the pending promise rejects and the
 * caller falls back to synchronous compression.
 */
const DISPATCH_TIMEOUT_MS = 30_000;

interface Pending {
    resolve: (results: { key: string; blob: string }[]) => void;
    reject: (err: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
}

/**
 * Single-worker pool for off-main-thread snapshot compression.
 *
 * Usage:
 * ```ts
 * const pool = getCompressWorkerPool();
 * if (pool.isReady()) {
 *   const results = await pool.compress([{ key: id, json }]);
 * } else {
 *   // synchronous fallback
 * }
 * ```
 */
export class CompressWorkerPool {
    private _worker: Worker | null = null;
    private _constructed = false;
    private _ready = false;
    private _dead = false;
    private _seq = 0;
    private readonly _pending = new Map<string, Pending>();

    /** Lazily construct the worker on first use. Never throws. */
    private _ensure(): void {
        if (this._constructed) return;
        this._constructed = true;
        // Guard environments without Worker (SSR / some test runners).
        if (typeof Worker === 'undefined') { this._die(); return; }
        try {
            // Vite recognises this exact `new Worker(new URL(...), { type: 'module' })`
            // form and bundles compress.worker.ts (and its fflate dep) as a chunk.
            const worker = new Worker(new URL('./compress.worker.ts', import.meta.url), { type: 'module' });
            worker.addEventListener('message', (ev: MessageEvent<CompressWorkerResult>) => this._onMessage(ev.data));
            worker.addEventListener('error', (ev: ErrorEvent) => {
                console.warn('[CompressWorkerPool] worker error — falling back to synchronous compression:', ev.message);
                this._die();
            });
            worker.addEventListener('messageerror', () => this._die());
            this._worker = worker;
        } catch (err) {
            console.warn('[CompressWorkerPool] construction failed — using synchronous compression:', err);
            this._die();
        }
    }

    /** Route an incoming worker message to its pending promise (or record readiness). */
    private _onMessage(msg: CompressWorkerResult): void {
        if (msg.ready && msg.requestId === COMPRESS_WORKER_READY_ID) { this._ready = true; return; }
        const pending = this._pending.get(msg.requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this._pending.delete(msg.requestId);
        if (msg.error) pending.reject(new Error(`[CompressWorkerPool] worker error: ${msg.error}`));
        else pending.resolve(msg.results ?? []);
    }

    /** Permanently disable the worker path and reject any inflight work. */
    private _die(): void {
        this._dead = true;
        this._ready = false;
        for (const [, p] of this._pending) {
            clearTimeout(p.timer);
            p.reject(new Error('[CompressWorkerPool] worker unavailable'));
        }
        this._pending.clear();
        if (this._worker) { try { this._worker.terminate(); } catch { /* ignore */ } this._worker = null; }
    }

    /**
     * True only once the worker has been constructed AND handshaked. Synchronous,
     * so a caller can decide sync-vs-async without awaiting. Constructs the worker
     * lazily on the first call (which therefore returns false — the worker becomes
     * ready shortly after, so subsequent saves route through it).
     */
    isReady(): boolean {
        this._ensure();
        return this._ready && !this._dead && this._worker !== null;
    }

    /**
     * Compress a batch of JSON strings off the main thread. Rejects (so the caller
     * falls back to synchronous compression) if the worker is not ready, times out,
     * or posts an error. P8: opens a 'compress-worker.dispatch' span.
     */
    compress(items: CompressItem[]): Promise<{ key: string; blob: string }[]> {
        if (!this.isReady() || !this._worker) {
            return Promise.reject(new Error('[CompressWorkerPool] worker not ready'));
        }
        const requestId = `cmp-${++this._seq}-${Date.now()}`;
        const span = TRACER.startSpan('compress-worker.dispatch', {
            attributes: { 'compress.item_count': items.length, 'compress.request_id': requestId },
        });
        const worker = this._worker;
        return new Promise<{ key: string; blob: string }[]>((resolve, reject) => {
            const timer = setTimeout(() => {
                if (!this._pending.has(requestId)) return;
                this._pending.delete(requestId);
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'timeout' });
                span.end();
                reject(new Error(`[CompressWorkerPool] timeout after ${DISPATCH_TIMEOUT_MS}ms`));
            }, DISPATCH_TIMEOUT_MS);
            this._pending.set(requestId, {
                resolve: (results) => { span.setStatus({ code: SpanStatusCode.OK }); span.end(); resolve(results); },
                reject: (err) => {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
                    span.end();
                    reject(err);
                },
                timer,
            });
            try {
                worker.postMessage({ requestId, items } satisfies CompressWorkerRequest);
            } catch (err) {
                clearTimeout(timer);
                this._pending.delete(requestId);
                span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
                span.end();
                reject(err);
            }
        });
    }

    /** Terminate the worker (test teardown / project close). */
    dispose(): void {
        this._die();
        // Allow a fresh worker on a later use after an explicit dispose.
        this._constructed = false;
        this._dead = false;
    }
}

let _singleton: CompressWorkerPool | null = null;

/** Process-wide singleton compression worker pool. */
export function getCompressWorkerPool(): CompressWorkerPool {
    if (!_singleton) _singleton = new CompressWorkerPool();
    return _singleton;
}
