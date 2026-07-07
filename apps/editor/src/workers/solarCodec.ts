// solarCodec.ts — §PERF-SUNHOURS-WORKER (L-143 / L-160c, ADR-0110)
//
// Single source of truth for the message contract shared by the MAIN-THREAD
// `SolarWorkerPool` and the OFF-MAIN-THREAD `solar.worker.ts`, plus the pure
// pack/unpack helpers for the probe payload.
//
// The heavy sun-hours raycast (ground grid + façade study) reduces to ONE batch:
// "given occluder footprints + sun params + a list of probe points, return the
// per-probe lit fraction". The compute itself lives in the pure, THREE-free
// `computeSunIntensitiesForProbes` (apps/editor/src/ui/climate/siteMetricGrids) — the
// SAME function the main-thread fallback calls — so a worker result is byte-identical
// to the synchronous result: the worker changes ONLY where the CPU runs, never the math.
//
// TRANSFER: probes + the result travel as `Float64Array` typed arrays (transferable, so
// the buffers move rather than copy). DOUBLE precision keeps a worker result BYTE-IDENTICAL
// to the synchronous main-thread compute (single precision would diverge in the LSBs of
// both the probe coords and the intensity). Occluder footprints are small plain objects
// (structured-clone). No DOM, no THREE, no rAF here — safe from both a
// DedicatedWorkerGlobalScope and the main thread.

import type { MetricFootprint, SunProbe, SunProbeParams } from '../ui/climate/siteMetricGrids';

/** Doubles per packed probe: east, north, up, normE, normN. A ground/roof probe stores
 *  NaN for the two normal slots (⇒ no back-face cull). */
export const PROBE_STRIDE = 5;

/** Pack probes into a flat `Float64Array` (transferable). NaN normals ⇒ ground/roof. */
export function packProbes(probes: readonly SunProbe[]): Float64Array {
    const arr = new Float64Array(probes.length * PROBE_STRIDE);
    for (let i = 0; i < probes.length; i++) {
        const p = probes[i]!;
        const o = i * PROBE_STRIDE;
        arr[o] = p.east;
        arr[o + 1] = p.north;
        arr[o + 2] = p.up;
        arr[o + 3] = p.normE ?? Number.NaN;
        arr[o + 4] = p.normN ?? Number.NaN;
    }
    return arr;
}

/** Unpack a flat probe `Float64Array` back into `SunProbe[]`. NaN normals ⇒ omitted. */
export function unpackProbes(packed: Float64Array): SunProbe[] {
    const n = Math.floor(packed.length / PROBE_STRIDE);
    const out: SunProbe[] = new Array(n);
    for (let i = 0; i < n; i++) {
        const o = i * PROBE_STRIDE;
        const normE = packed[o + 3]!;
        const normN = packed[o + 4]!;
        out[i] = Number.isNaN(normE) || Number.isNaN(normN)
            ? { east: packed[o]!, north: packed[o + 1]!, up: packed[o + 2]! }
            : { east: packed[o]!, north: packed[o + 1]!, up: packed[o + 2]!, normE, normN };
    }
    return out;
}

/** The requestId used by the worker's startup handshake message. */
export const SOLAR_WORKER_READY_ID = '__solar_ready__';

/** Request posted to the solar worker: a probe batch + occluders + sun params. */
export interface SolarWorkerRequest {
    readonly requestId: string;
    /** Monotonic sequence — a HIGHER seq supersedes (cancels) any in-flight lower one. */
    readonly seq: number;
    /** Packed probes (`PROBE_STRIDE` doubles each). Transferred, not copied. */
    readonly probes: Float64Array;
    readonly occluders: readonly MetricFootprint[];
    readonly params: SunProbeParams;
}

/** A one-shot cancel for an in-flight request (posted when a newer build supersedes). */
export interface SolarWorkerCancel {
    readonly cancel: true;
    /** Cancel every request whose seq is ≤ this. */
    readonly seq: number;
}

/** Result posted back by the solar worker. */
export interface SolarWorkerResult {
    readonly requestId: string;
    /** Present on success: per-probe lit fraction (0..1), same order as the input. */
    readonly intensities?: Float64Array;
    /** Present when the worker threw — the pool rejects and the caller falls back. */
    readonly error?: string;
    /** Present when the request was cancelled (superseded) before completing. */
    readonly cancelled?: boolean;
    /** One-time handshake posted at worker startup so the pool knows it is live. */
    readonly ready?: boolean;
}
