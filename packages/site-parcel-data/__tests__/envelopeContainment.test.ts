// §L-428 — envelope containment validator tests.
//
// This validator's whole purpose is to catch a breach that the UI would otherwise report as
// compliant, so the tests target the ways it could FALSELY PASS — a validator that misses a
// violation is worse than none, because it converts an open question into a false assurance.

import { describe, it, expect } from 'vitest';
import {
    checkEnvelopeContainment,
    CONTAINMENT_TOLERANCE_M,
    type FootprintToCheck,
} from '../src/envelopeContainment';

/** 40 × 20 m envelope. */
const env = [
    { x: 0, z: 0 }, { x: 40, z: 0 }, { x: 40, z: -20 }, { x: 0, z: -20 },
];

/**
 * A CONCAVE envelope — an L, exactly the shape a setback inset on an irregular parcel
 * produces (the founder's case was a 12-vertex inset). The notch is the interesting part.
 */
const concave = [
    { x: 0, z: 0 }, { x: 40, z: 0 }, { x: 40, z: -10 },
    { x: 20, z: -10 }, { x: 20, z: -30 }, { x: 0, z: -30 },
];

const fp = (id: string, kind: string, ring: Array<{ x: number; z: number }>): FootprintToCheck =>
    ({ id, kind, ring });

describe('§L-428 checkEnvelopeContainment', () => {
    it('passes a footprint fully inside', () => {
        const r = checkEnvelopeContainment(env, [
            fp('s1', 'slab', [{ x: 5, z: -5 }, { x: 30, z: -5 }, { x: 30, z: -15 }, { x: 5, z: -15 }]),
        ]);
        expect(r.ok).toBe(true);
        expect(r.violations).toHaveLength(0);
        expect(r.checked).toBe(1);
    });

    it('catches the reported defect: a slab overflowing the envelope', () => {
        // The founder's case — shell walls obey the envelope, the slab does not.
        const r = checkEnvelopeContainment(env, [
            fp('w1', 'wall', [{ x: 2, z: -2 }, { x: 38, z: -2 }, { x: 38, z: -18 }, { x: 2, z: -18 }]),
            fp('s1', 'slab', [{ x: -5, z: -2 }, { x: 45, z: -2 }, { x: 45, z: -18 }, { x: -5, z: -18 }]),
        ]);
        expect(r.ok).toBe(false);
        expect(r.violations).toHaveLength(1);
        expect(r.violations[0]!.id).toBe('s1');
        expect(r.violations[0]!.kind).toBe('slab');
        expect(r.violations[0]!.maxExcursionM).toBeCloseTo(5, 6);
        expect(r.summary).toMatch(/FAILED/);
    });

    it('BUILDING EXACTLY TO THE SETBACK LINE IS NOT A VIOLATION', () => {
        // The intended design move. If this reported a breach, every compliant maximal
        // building would be flagged and the check would be trained away as noise.
        const r = checkEnvelopeContainment(env, [
            fp('w1', 'wall', [{ x: 0, z: 0 }, { x: 40, z: 0 }, { x: 40, z: -20 }, { x: 0, z: -20 }]),
        ]);
        expect(r.ok).toBe(true);
    });

    it('tolerates sub-centimetre noise but not a real breach', () => {
        const noise = CONTAINMENT_TOLERANCE_M / 2;
        expect(checkEnvelopeContainment(env, [
            fp('w', 'wall', [{ x: -noise, z: -1 }, { x: 10, z: -1 }, { x: 10, z: -5 }, { x: -noise, z: -5 }]),
        ]).ok).toBe(true);

        expect(checkEnvelopeContainment(env, [
            fp('w', 'wall', [{ x: -0.5, z: -1 }, { x: 10, z: -1 }, { x: 10, z: -5 }, { x: -0.5, z: -5 }]),
        ]).ok).toBe(false);
    });

    it('THE CONCAVE-NOTCH CASE: all vertices inside but an EDGE crosses the boundary', () => {
        // The reason a vertex-only test is insufficient. Both endpoints sit in the L's two
        // arms — inside the ring — while the edge between them bridges straight across the
        // notch, outside the envelope. A naive validator passes this and reports a building
        // that visibly pokes out as compliant.
        const bridging = fp('r1', 'room', [
            { x: 5, z: -5 },    // inside, upper arm
            { x: 35, z: -5 },   // inside, upper arm
            { x: 10, z: -25 },  // inside, lower arm — the edge back up crosses the notch
        ]);
        const r = checkEnvelopeContainment(concave, [bridging]);
        expect(r.ok).toBe(false);
        expect(r.violations[0]!.edgeCrosses).toBe(true);
        expect(r.violations[0]!.explanation).toMatch(/concave notch/i);
    });

    it('does not false-positive on a footprint sitting entirely in one arm of the concave L', () => {
        const r = checkEnvelopeContainment(concave, [
            fp('ok', 'slab', [{ x: 2, z: -12 }, { x: 18, z: -12 }, { x: 18, z: -28 }, { x: 2, z: -28 }]),
        ]);
        expect(r.ok).toBe(true);
    });

    it('reports the WORST excursion across many elements', () => {
        const r = checkEnvelopeContainment(env, [
            fp('a', 'slab', [{ x: -1, z: -2 }, { x: 5, z: -2 }, { x: 5, z: -5 }, { x: -1, z: -5 }]),
            fp('b', 'slab', [{ x: -9, z: -8 }, { x: 5, z: -8 }, { x: 5, z: -12 }, { x: -9, z: -12 }]),
        ]);
        expect(r.violations).toHaveLength(2);
        expect(r.worstExcursionM).toBeCloseTo(9, 6);
    });

    it('a MISSING envelope is reported as NOT CHECKED, never as a pass', () => {
        // The honesty rule. Returning a green ok:true here would let the UI claim "compliant"
        // about a site where nothing was verified — exactly the false assurance this exists
        // to prevent.
        for (const bad of [null, undefined, [], [{ x: 0, z: 0 }, { x: 1, z: 1 }]]) {
            const r = checkEnvelopeContainment(bad as never, [
                fp('s', 'slab', [{ x: 999, z: 999 }, { x: 1000, z: 999 }, { x: 1000, z: 1000 }]),
            ]);
            expect(r.checked).toBe(0);
            expect(r.summary).toMatch(/NOT checked/i);
            expect(r.summary).not.toMatch(/\bOK\b/);
        }
    });

    it('skips degenerate footprints without crashing or counting them', () => {
        const r = checkEnvelopeContainment(env, [
            fp('empty', 'slab', []),
            fp('point', 'slab', [{ x: 5, z: -5 }]),
            fp('good', 'slab', [{ x: 5, z: -5 }, { x: 10, z: -5 }, { x: 10, z: -8 }]),
        ]);
        expect(r.checked).toBe(1);
        expect(r.ok).toBe(true);
    });
});
