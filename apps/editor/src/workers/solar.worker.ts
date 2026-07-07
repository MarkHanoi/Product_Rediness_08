// solar.worker.ts — §PERF-SUNHOURS-WORKER (L-143 / L-160c, ADR-0110)
//
// Dedicated Web Worker that runs the direct-beam sun-hours RAYCAST off the main thread.
//
// WHY: the Forma site sun-hours grid + real-geometry façade study raycast thousands of
// probe points against thousands of occluder prisms — a documented multi-second (up to
// ~1 min) MAIN-THREAD stall that froze the 3D site view. This worker moves that CPU off
// the render thread; the main thread merely awaits the per-probe intensities and paints
// the smooth texture (one draw call).
//
// CONTRACT INVARIANTS:
//   P2 — Does NOT import 'three' / renderer-three (pure prism raycast + NOAA sun math).
//   P3 — Does NOT call requestAnimationFrame.
//   WORKER — Runs in a DedicatedWorkerGlobalScope; `self` is the worker global.
//
// RESULT IDENTITY: the compute is delegated to `computeSunIntensitiesForProbes` — the
// SAME pure function the main-thread fallback calls — so a batch computed here is
// byte-for-byte what the main thread would produce. This is the guarantee that makes the
// worker transparently revertible (unavailable / errored → main thread computes the same).
//
// CANCELLATION: work is sliced so the message queue drains between slices; a `cancel`
// message (or a newer request with a higher `seq`) supersedes an in-flight batch, which
// then posts `{ cancelled: true }` instead of a now-stale result — mirroring the
// monotonic-requestId cancellation of the geometry / compress workers.

import { computeSunIntensitiesForProbes } from '../ui/climate/siteMetricGrids';
import {
    unpackProbes,
    SOLAR_WORKER_READY_ID,
    type SolarWorkerRequest,
    type SolarWorkerCancel,
    type SolarWorkerResult,
} from './solarCodec';

/** Probe slice per yield — large enough that the sample/prism setup is amortised, small
 *  enough that cancellation is responsive within a few tens of ms. */
const SLICE = 3000;

/** The highest seq we have been told to cancel (≤ this ⇒ superseded). */
let cancelledUpToSeq = -1;

// Startup handshake — the pool only routes work to a worker that has handshaked, so a
// worker that fails to load never receives a job and the caller stays on the fallback.
self.postMessage({ requestId: SOLAR_WORKER_READY_ID, ready: true } satisfies SolarWorkerResult);

self.addEventListener('message', (event: MessageEvent<SolarWorkerRequest | SolarWorkerCancel>) => {
    const data = event.data;
    if ('cancel' in data && data.cancel) {
        if (data.seq > cancelledUpToSeq) cancelledUpToSeq = data.seq;
        return;
    }
    const req = data;
    // A newer request already superseded this one before we even started.
    if (req.seq <= cancelledUpToSeq) {
        self.postMessage({ requestId: req.requestId, cancelled: true } satisfies SolarWorkerResult);
        return;
    }

    const probes = unpackProbes(req.probes);
    const total = probes.length;
    const result = new Float64Array(total);

    const runSlice = (start: number): void => {
        // Superseded mid-flight → abandon and report cancelled (result discarded).
        if (req.seq <= cancelledUpToSeq) {
            self.postMessage({ requestId: req.requestId, cancelled: true } satisfies SolarWorkerResult);
            return;
        }
        const end = Math.min(total, start + SLICE);
        try {
            // Per-probe independent ⇒ slicing then concatenating is byte-identical to the
            // whole-batch call. `computeSunIntensitiesForProbes` rebuilds the (cheap for a
            // few slices) sun samples + BVH per slice; the heavy per-probe raycast is the
            // dominant cost and runs exactly once per probe.
            const slice = computeSunIntensitiesForProbes(probes.slice(start, end), req.occluders, req.params);
            result.set(slice, start);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[solar.worker] compute failed:', message, err);
            self.postMessage({ requestId: req.requestId, error: message } satisfies SolarWorkerResult);
            return;
        }
        if (end < total) {
            // Yield as a MACROTASK so a pending cancel / newer request is delivered before
            // the next slice (microtasks would starve the message queue).
            setTimeout(() => runSlice(end), 0);
        } else {
            self.postMessage(
                { requestId: req.requestId, intensities: result } satisfies SolarWorkerResult,
                { transfer: [result.buffer] },
            );
        }
    };

    if (total <= 0) {
        self.postMessage(
            { requestId: req.requestId, intensities: result } satisfies SolarWorkerResult,
            { transfer: [result.buffer] },
        );
        return;
    }
    runSlice(0);
});
