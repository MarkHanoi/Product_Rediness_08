// SolarWorkerPool — §PERF-SUNHOURS-WORKER (L-143 / L-160c, ADR-0110)
//
// Main-thread handle to a single `solar.worker.ts` instance that runs the sun-hours
// direct-beam raycast (ground grid + real-geometry façade study) off the render thread.
// Mirrors the `CompressWorkerPool` substrate (lazy construction, startup handshake,
// pending-promise map keyed by requestId, dead detection, per-request timeout, OTel span
// per dispatch) but adds MONOTONIC-SEQ CANCELLATION: a fresh `computeIntensities` call
// supersedes any in-flight one — the pool posts a `cancel` for the older seq (so the
// worker abandons it) and rejects the older promise with a `superseded` error, so a rapid
// re-toggle / camera settle never leaves stale work blocking the newest field.
//
// SAFETY / REVERTIBILITY (identical philosophy to CompressWorkerPool):
//   • Lazy construction; construction failure (SSR / test env / 404) flips the pool to a
//     permanent "not ready" state so the caller uses the synchronous fallback. Behaviour
//     is therefore never worse than the pre-worker chunked main-thread path.
//   • `isReady()` is SYNCHRONOUS and only true AFTER the worker handshakes, so a caller
//     decides worker-vs-fallback up front and a never-loading worker can never hang.
//
// P8: `computeIntensities()` opens an OTel span covering the full worker round-trip.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { MetricFootprint, SunProbe, SunProbeParams } from '../ui/climate/siteMetricGrids';
import {
    packProbes,
    SOLAR_WORKER_READY_ID,
    type SolarWorkerCancel,
    type SolarWorkerRequest,
    type SolarWorkerResult,
} from './solarCodec';

const TRACER = trace.getTracer('@pryzm/editor-solar-worker', '0.1.0');

/** Per-request timeout. A healthy worker finishes even a large grid in a second or two;
 *  the timeout covers the "silent hang" mode so the pending promise rejects and the
 *  caller falls back to the synchronous chunked path. */
const DISPATCH_TIMEOUT_MS = 60_000;

/** Rejection reason when a newer compute superseded an in-flight one (caller ignores it). */
export const SOLAR_SUPERSEDED = 'superseded';

interface Pending {
    resolve: (intensities: Float64Array) => void;
    reject: (err: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
    seq: number;
}

/**
 * Single-worker pool for off-main-thread sun-hours raycasting.
 *
 * Usage:
 * ```ts
 * const pool = getSolarWorkerPool();
 * if (pool.isReady()) {
 *   try { const f = await pool.computeIntensities(probes, occluders, params); paint(f); }
 *   catch (e) { if (!isSuperseded(e)) chunkFallback(); }
 * } else { chunkFallback(); }
 * ```
 */
export class SolarWorkerPool {
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
        if (typeof Worker === 'undefined') { this._die(); return; }
        try {
            // Vite recognises this exact `new Worker(new URL(...), { type: 'module' })`
            // form and bundles solar.worker.ts (+ its pure deps) as a chunk.
            const worker = new Worker(new URL('./solar.worker.ts', import.meta.url), { type: 'module' });
            worker.addEventListener('message', (ev: MessageEvent<SolarWorkerResult>) => this._onMessage(ev.data));
            worker.addEventListener('error', (ev: ErrorEvent) => {
                console.warn('[SolarWorkerPool] worker error — falling back to synchronous raycast:', ev.message);
                this._die();
            });
            worker.addEventListener('messageerror', () => this._die());
            this._worker = worker;
        } catch (err) {
            console.warn('[SolarWorkerPool] construction failed — using synchronous raycast:', err);
            this._die();
        }
    }

    /** Route an incoming worker message to its pending promise (or record readiness). */
    private _onMessage(msg: SolarWorkerResult): void {
        if (msg.ready && msg.requestId === SOLAR_WORKER_READY_ID) { this._ready = true; return; }
        const pending = this._pending.get(msg.requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this._pending.delete(msg.requestId);
        if (msg.cancelled) pending.reject(new Error(SOLAR_SUPERSEDED));
        else if (msg.error) pending.reject(new Error(`[SolarWorkerPool] worker error: ${msg.error}`));
        else if (msg.intensities) pending.resolve(msg.intensities);
        else pending.reject(new Error('[SolarWorkerPool] empty worker result'));
    }

    /** Permanently disable the worker path and reject any inflight work. */
    private _die(): void {
        this._dead = true;
        this._ready = false;
        for (const [, p] of this._pending) {
            clearTimeout(p.timer);
            p.reject(new Error('[SolarWorkerPool] worker unavailable'));
        }
        this._pending.clear();
        if (this._worker) { try { this._worker.terminate(); } catch { /* ignore */ } this._worker = null; }
    }

    /** True only once the worker has been constructed AND handshaked. Synchronous. */
    isReady(): boolean {
        this._ensure();
        return this._ready && !this._dead && this._worker !== null;
    }

    /**
     * Compute per-probe sun-hours intensities off the main thread. Assigns a monotonic
     * seq and SUPERSEDES any in-flight batch (posts a cancel for the older seq + rejects
     * its promise with {@link SOLAR_SUPERSEDED}), so only the newest field ever paints.
     * Rejects (so the caller falls back to the synchronous chunked path) if the worker is
     * not ready, times out, or errors. P8: opens a 'solar-worker.dispatch' span.
     */
    computeIntensities(
        probes: readonly SunProbe[],
        occluders: readonly MetricFootprint[],
        params: SunProbeParams,
    ): Promise<Float64Array> {
        if (!this.isReady() || !this._worker) {
            return Promise.reject(new Error('[SolarWorkerPool] worker not ready'));
        }
        const seq = ++this._seq;
        const requestId = `sun-${seq}-${Date.now()}`;
        const worker = this._worker;

        // Supersede every older in-flight request: tell the worker to abandon them and
        // reject their promises so their callers stop waiting (the seq guard in the caller
        // also drops any that slipped through).
        for (const [id, p] of this._pending) {
            if (p.seq < seq) {
                clearTimeout(p.timer);
                this._pending.delete(id);
                p.reject(new Error(SOLAR_SUPERSEDED));
            }
        }
        try { worker.postMessage({ cancel: true, seq: seq - 1 } satisfies SolarWorkerCancel); } catch { /* ignore */ }

        const span = TRACER.startSpan('solar-worker.dispatch', {
            attributes: {
                'solar.probe_count': probes.length,
                'solar.occluder_count': occluders.length,
                'solar.request_id': requestId,
            },
        });
        const packed = packProbes(probes);
        return new Promise<Float64Array>((resolve, reject) => {
            const timer = setTimeout(() => {
                if (!this._pending.has(requestId)) return;
                this._pending.delete(requestId);
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'timeout' });
                span.end();
                reject(new Error(`[SolarWorkerPool] timeout after ${DISPATCH_TIMEOUT_MS}ms`));
            }, DISPATCH_TIMEOUT_MS);
            this._pending.set(requestId, {
                resolve: (intensities) => { span.setStatus({ code: SpanStatusCode.OK }); span.end(); resolve(intensities); },
                reject: (err) => {
                    const message = err instanceof Error ? err.message : String(err);
                    span.setStatus({ code: message === SOLAR_SUPERSEDED ? SpanStatusCode.OK : SpanStatusCode.ERROR, message });
                    span.end();
                    reject(err);
                },
                timer,
                seq,
            });
            try {
                worker.postMessage(
                    { requestId, seq, probes: packed, occluders, params } satisfies SolarWorkerRequest,
                    { transfer: [packed.buffer] },
                );
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
        this._constructed = false;
        this._dead = false;
    }
}

/** True when an error is the benign "a newer compute superseded this one" rejection. */
export function isSolarSuperseded(err: unknown): boolean {
    return err instanceof Error && err.message === SOLAR_SUPERSEDED;
}

let _singleton: SolarWorkerPool | null = null;

/** Process-wide singleton solar worker pool. */
export function getSolarWorkerPool(): SolarWorkerPool {
    if (!_singleton) _singleton = new SolarWorkerPool();
    return _singleton;
}
