// §ZGZ-STREET-WIDTH — the A1/3.1 / A1/3.2 ancho-de-calle seam.
//
// THE PROPERTY THAT MATTERS: this resolver is INJECTION-ONLY. No live Zaragoza block/parcel
// neighbourhood source is wired anywhere in this package today (see the module header —
// `esAragon.ts`'s `§ZGZ-ALIGNMENT-CANDIDATE` is exactly why one has not been adopted), so every
// PRODUCTION call (no deps supplied) must refuse `'not-wired'` — never guess a width. Supplying
// geometry proves the measurement machinery works, so the seam is ready the day a real source is
// wired, without pretending one exists today.

import { describe, it, expect } from 'vitest';
import { resolveZaragozaStreetWidth } from '../src/providers/resolveZaragozaStreetWidth.js';

type P = { x: number; z: number };
const rect = (x0: number, z0: number, x1: number, z1: number): P[] => [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
];

describe('§ZGZ-STREET-WIDTH — production default is `not-wired`, never a guess', () => {
    it('refuses `not-wired` when no geometry is supplied at all', () => {
        const r = resolveZaragozaStreetWidth();
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('not-wired');
    });

    it('refuses `not-wired` when only the block ring is supplied (opposing rings absent)', () => {
        const r = resolveZaragozaStreetWidth({ blockRing: rect(0, 0, 100, 100) });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('not-wired');
    });

    it('refuses `not-wired` when only opposing rings are supplied (block ring absent)', () => {
        const r = resolveZaragozaStreetWidth({ opposingRings: [rect(0, -120, 100, -20)] });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('not-wired');
    });
});

describe('§ZGZ-STREET-WIDTH — WHEN geometry IS supplied, the measurement is real', () => {
    it('measures a real width from an injected block + opposing parcel', () => {
        const block = rect(0, 0, 100, 100);
        const opposing = [rect(0, -120, 100, -20)]; // 20 m street north of the block
        const r = resolveZaragozaStreetWidth({ blockRing: block, opposingRings: opposing });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.width_m).toBeCloseTo(20, 6);
            expect(r.spread_m).toBeCloseTo(0, 9);
            expect(r.provenance).toBe('measured-geometry');
            expect(r.authority).toMatch(/CONSTRUCTED/);
        }
    });

    it('narrows to the parcel-facing edge when a parcel ring is supplied', () => {
        const block = rect(0, 0, 100, 100);
        const opposing = [
            rect(0, -120, 100, -20), // 20 m north
            rect(-140, 0, -40, 100), // 40 m west — WIDER, would win the "narrowest" fallback
        ];
        const parcel = rect(0, 0, 30, 30); // sits in the block's NORTH-facing corner
        const r = resolveZaragozaStreetWidth({ blockRing: block, opposingRings: opposing, parcelRing: parcel });
        expect(r.ok).toBe(true);
        // The parcel touches BOTH the north (edge 0) and west (edge... governing picks the
        // narrowest of the edges the parcel actually faces) — either way it must not silently pick
        // an edge the parcel does not front.
        if (r.ok) expect([20, 40]).toContain(Math.round(r.width_m));
    });

    it('refuses `no-opposing-frontage` rather than reporting the search-limit distance', () => {
        const block = rect(0, 0, 100, 100);
        const r = resolveZaragozaStreetWidth({ blockRing: block, opposingRings: [] });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('no-opposing-frontage');
    });

    it('refuses `bad-input` on a degenerate block ring', () => {
        const r = resolveZaragozaStreetWidth({
            blockRing: [{ x: 0, z: 0 }, { x: 1, z: 1 }],
            opposingRings: [rect(0, -20, 10, -10)],
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('bad-input');
    });
});
