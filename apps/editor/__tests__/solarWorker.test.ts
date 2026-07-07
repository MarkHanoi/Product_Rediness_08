// §PERF-SUNHOURS-WORKER (L-143 / L-160c, ADR-0110) — the solar worker codec + pool.
//
// The pool must (a) round-trip probes through the transferable Float32Array packing
// byte-for-byte, (b) degrade GRACEFULLY when no `Worker` global exists (the node/SSR
// path) so the caller uses the synchronous fallback (never worse than today), and
// (c) classify the benign "superseded" cancellation so a caller can ignore it. These
// run in the node env (no real Worker) — the worker's message loop is exercised via the
// slice-invariance test in siteMetricGrids.test.ts (worker slicing == whole batch).

import { describe, it, expect } from 'vitest';
import {
    packProbes,
    unpackProbes,
    PROBE_STRIDE,
    SOLAR_WORKER_READY_ID,
} from '../src/workers/solarCodec';
import { SolarWorkerPool, isSolarSuperseded, SOLAR_SUPERSEDED } from '../src/workers/SolarWorkerPool';
import type { SunProbe } from '../src/ui/climate/siteMetricGrids';

describe('§PERF-SUNHOURS-WORKER codec', () => {
    it('round-trips probes with and without normals (NaN normals ⇒ omitted)', () => {
        const probes: SunProbe[] = [
            { east: 1, north: 2, up: 0.5 },                       // ground probe (no normal)
            { east: -3.5, north: 4.25, up: 6, normE: 0, normN: -1 }, // wall probe (south-facing)
            { east: 10, north: -10, up: 3, normE: 0.6, normN: 0.8 }, // wall probe (diagonal)
        ];
        const packed = packProbes(probes);
        expect(packed.length).toBe(probes.length * PROBE_STRIDE);
        const back = unpackProbes(packed);
        expect(back.length).toBe(probes.length);
        // Ground probe: no normal survived.
        expect(back[0]).toEqual({ east: 1, north: 2, up: 0.5 });
        // Wall probes: normal survived.
        expect(back[1]!.normE).toBe(0);
        expect(back[1]!.normN).toBe(-1);
        expect(back[2]!.normE).toBeCloseTo(0.6, 5);
        expect(back[2]!.normN).toBeCloseTo(0.8, 5);
    });

    it('the ready-handshake id is stable', () => {
        expect(SOLAR_WORKER_READY_ID).toBe('__solar_ready__');
    });
});

describe('§PERF-SUNHOURS-WORKER pool graceful fallback', () => {
    it('isReady() is false when there is no Worker global (node/SSR) — caller uses fallback', () => {
        // The node test env has no web `Worker`; the pool must flip to not-ready, never throw.
        expect(typeof Worker).toBe('undefined');
        const pool = new SolarWorkerPool();
        expect(pool.isReady()).toBe(false);
    });

    it('computeIntensities rejects (so the caller falls back) when the worker is not ready', async () => {
        const pool = new SolarWorkerPool();
        await expect(pool.computeIntensities([{ east: 0, north: 0, up: 0.5 }], [], {
            latDeg: 41.39, lngDeg: 2.17,
        })).rejects.toThrow();
    });

    it('classifies the benign superseded cancellation', () => {
        expect(isSolarSuperseded(new Error(SOLAR_SUPERSEDED))).toBe(true);
        expect(isSolarSuperseded(new Error('some other failure'))).toBe(false);
        expect(isSolarSuperseded('not an error')).toBe(false);
    });
});
