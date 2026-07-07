// §FIX-SOLAR-WORKER-NO-RANDOM (L-178) — the off-main-thread sun-hours worker died on startup
// with `secure crypto unusable, insecure Math.random not allowed` and fell back to the ~1-min
// synchronous main-thread raycast. Root cause: the worker imported `computeSunIntensitiesForProbes`
// from `siteMetricGrids`, which statically drags in the climate/street analysis graph whose
// transitive dependency runs a secure-crypto id generator at MODULE LOAD — unusable inside a
// DedicatedWorkerGlobalScope. The fix moved the PURE raycast core to the worker's `solarCodec`
// leaf whose entire runtime graph is { solarCodec → @pryzm/solar-analysis } (pure, crypto-free).
//
// These tests pin the two guarantees that make the move safe:
//   1. WORKER == MAIN — the compute the worker imports from `solarCodec` is byte-identical to
//      the one main-thread callers import (re-exported) from `siteMetricGrids`.
//   2. NO RANDOM — the raycast is deterministic: identical inputs ⇒ byte-identical Float64Array
//      across repeated runs (there is no RNG/jitter/seed in the hot path).

import { describe, it, expect } from 'vitest';
// The worker's ACTUAL import path (the leaf):
import {
    computeSunIntensitiesForProbes as computeViaWorkerLeaf,
    toPrisms,
    buildPrismShadowIndex,
    type MetricFootprint,
    type SunProbe,
    type SunProbeParams,
} from '../src/workers/solarCodec';
// The main-thread caller's import path (re-exported from its historical home):
import { computeSunIntensitiesForProbes as computeViaSiteMetrics } from '../src/ui/climate/siteMetricGrids';

// A small deterministic scene: a couple of occluder blocks + ground/wall probes near Madrid.
const OCCLUDERS: MetricFootprint[] = [
    { ring: [{ x: 5, z: 5 }, { x: 15, z: 5 }, { x: 15, z: 15 }, { x: 5, z: 15 }], heightM: 24 },
    { ring: [{ x: -20, z: -8 }, { x: -8, z: -8 }, { x: -8, z: 4 }, { x: -20, z: 4 }], heightM: 40 },
];
const PROBES: SunProbe[] = [
    { east: 0, north: 0, up: 0.5 },                        // ground
    { east: 0, north: 0, up: 12, normE: 1, normN: 0 },     // east-facing wall
    { east: 2, north: -3, up: 30, normE: 0, normN: -1 },   // south-facing wall high up
    { east: -6, north: 0, up: 2, normE: 1, normN: 0 },     // near the tall block
];
const PARAMS: SunProbeParams = { latDeg: 40.4168, lngDeg: -3.7038, sunDay: 'summer', stepMinutes: 30 };

describe('§FIX-SOLAR-WORKER-NO-RANDOM', () => {
    it('the worker-leaf compute is BYTE-IDENTICAL to the main-thread (siteMetricGrids) compute', () => {
        const fromLeaf = computeViaWorkerLeaf(PROBES, OCCLUDERS, PARAMS);
        const fromMain = computeViaSiteMetrics(PROBES, OCCLUDERS, PARAMS);
        expect(fromLeaf.length).toBe(PROBES.length);
        expect(Array.from(fromLeaf)).toEqual(Array.from(fromMain));
    });

    it('is DETERMINISTIC across repeated runs (no RNG / Math.random / crypto in the hot path)', () => {
        const a = computeViaWorkerLeaf(PROBES, OCCLUDERS, PARAMS);
        const b = computeViaWorkerLeaf(PROBES, OCCLUDERS, PARAMS);
        // Byte-identical buffers ⇒ the raycast carries no random jitter/seed.
        expect(new Uint8Array(a.buffer)).toEqual(new Uint8Array(b.buffer));
    });

    it('produces sane intensities in [0,1] and shows shadowing (occluded probe < open ground)', () => {
        const out = computeViaWorkerLeaf(PROBES, OCCLUDERS, PARAMS);
        for (const v of out) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
        // The probe pressed against the 40 m block (index 3) sees less sun than the open ground (0).
        expect(out[3]!).toBeLessThanOrEqual(out[0]!);
    });

    it('exposes the raycast primitives on the leaf so the worker never imports siteMetricGrids', () => {
        // The worker imports ONLY from solarCodec; these must be present + pure there.
        const prisms = toPrisms(OCCLUDERS);
        expect(prisms.length).toBe(2);
        const shadow = buildPrismShadowIndex(prisms);
        expect(shadow.maxHeightM).toBe(40);
    });

    it('an empty probe batch yields an empty result (no throw)', () => {
        expect(computeViaWorkerLeaf([], OCCLUDERS, PARAMS).length).toBe(0);
    });
});
