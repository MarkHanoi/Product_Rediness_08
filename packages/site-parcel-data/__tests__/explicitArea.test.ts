// C58 §2.2 (KG-4) / ADR-0270 — unit tests for the explicit-area SOLVER PRIMITIVE.
//
// THE PROOF OF REUSABILITY: every fixture below is a synthetic `ExplicitAreaRule` + a plain ring
// and ratio. There is NO Madrid data, no `COEF_Z`, no `sigma.madrid.es`. If this primitive were
// coupled to Madrid it could not be tested this way.

import { describe, it, expect } from 'vitest';
import type { Pt, ExplicitAreaRule } from '@pryzm/schemas';
import { polygonArea } from '@pryzm/site-validators';
import {
    resolveExplicitAreaRing,
    solveExplicitArea,
    type ExplicitAreaSource,
} from '../src/geometry/explicitArea.js';

const RULE: ExplicitAreaRule = { kind: 'explicit-area', ringRef: 'generic:footprint/v1' };

/** A 30×40 parcel, street edge at z=0. */
const PARCEL: Pt[] = [
    { x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 40 }, { x: 0, z: 40 },
];
/** A 30×20 front band (a published fondo of depth 20 from the street). */
const BAND: Pt[] = [
    { x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 20 }, { x: 0, z: 20 },
];

function source(over: Partial<ExplicitAreaSource> = {}): ExplicitAreaSource {
    return {
        ringRef: RULE.ringRef,
        footprintRing: BAND,
        edificabilidad: 3.2,
        ...over,
    };
}

describe('resolveExplicitAreaRing — the ringRef resolver', () => {
    it('resolves a matching source to its footprint + edificabilidad', () => {
        const res = resolveExplicitAreaRing(RULE, source());
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.footprintParts).toHaveLength(1);
            expect(polygonArea(res.footprintParts[0]!.outer)).toBeCloseTo(600, 6);
            expect(res.edificabilidad).toBe(3.2);
        }
    });

    it('passes edificabilidad through as null when the source publishes none', () => {
        const res = resolveExplicitAreaRing(RULE, source({ edificabilidad: null }));
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.edificabilidad).toBeNull();
    });

    it('refuses `ringref-mismatch` when the source answers a different handle', () => {
        const res = resolveExplicitAreaRing(RULE, source({ ringRef: 'other:v9' }));
        expect(res).toEqual({ ok: false, reason: 'ringref-mismatch' });
    });

    it('refuses `parcel-override` (a Ficha-Específica-style per-parcel override)', () => {
        const res = resolveExplicitAreaRing(RULE, source({ hasParcelOverride: true }));
        expect(res).toEqual({ ok: false, reason: 'parcel-override' });
    });

    it('refuses `no-footprint` for an empty/too-small ring', () => {
        expect(resolveExplicitAreaRing(RULE, source({ footprintRing: [] })).ok).toBe(false);
        const r1 = resolveExplicitAreaRing(RULE, source({ footprintRing: [] }));
        expect(r1.ok === false && r1.reason).toBe('no-footprint');
        const r2 = resolveExplicitAreaRing(RULE, source({ footprintRing: [{ x: 0, z: 0 }, { x: 1, z: 1 }] }));
        expect(r2.ok === false && r2.reason).toBe('no-footprint');
    });

    it('refuses `degenerate-footprint` for a zero-area (collinear) ring', () => {
        const collinear: Pt[] = [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 10, z: 0 }];
        const res = resolveExplicitAreaRing(RULE, source({ footprintRing: collinear }));
        expect(res.ok === false && res.reason).toBe('degenerate-footprint');
    });

    it('returns a fresh ring copy (no aliasing of the source geometry)', () => {
        const src = source();
        const res = resolveExplicitAreaRing(RULE, src);
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.footprintParts[0]!.outer).not.toBe(src.footprintRing);
    });
});

describe('solveExplicitArea — the geometric solve (parcel ∩ footprint)', () => {
    it('clips the parcel to a smaller published footprint', () => {
        const out = solveExplicitArea({ parcelRing: PARCEL, footprintRing: BAND });
        expect(out.ok).toBe(true);
        if (out.ok) {
            expect(out.areaM2).toBeCloseTo(600, 6); // the 30×20 band
            expect(out.footprintCoversParcel).toBe(false);
        }
    });

    it('flags footprintCoversParcel when the footprint contains the whole plot', () => {
        const big: Pt[] = [
            { x: -5, z: -5 }, { x: 35, z: -5 }, { x: 35, z: 45 }, { x: -5, z: 45 },
        ];
        const out = solveExplicitArea({ parcelRing: PARCEL, footprintRing: big });
        expect(out.ok).toBe(true);
        if (out.ok) {
            expect(out.areaM2).toBeCloseTo(polygonArea(PARCEL), 6); // whole plot buildable
            expect(out.footprintCoversParcel).toBe(true);
        }
    });

    it('computes a partial overlap exactly', () => {
        // Footprint x∈[15,45], z∈[10,30]: overlap with the parcel is x∈[15,30], z∈[10,30] = 300.
        const partial: Pt[] = [
            { x: 15, z: 10 }, { x: 45, z: 10 }, { x: 45, z: 30 }, { x: 15, z: 30 },
        ];
        const out = solveExplicitArea({ parcelRing: PARCEL, footprintRing: partial });
        expect(out.ok).toBe(true);
        if (out.ok) expect(out.areaM2).toBeCloseTo(300, 6);
    });

    it('refuses `no-overlap` when the footprint misses the parcel', () => {
        const far: Pt[] = [
            { x: 100, z: 100 }, { x: 110, z: 100 }, { x: 110, z: 110 }, { x: 100, z: 110 },
        ];
        expect(solveExplicitArea({ parcelRing: PARCEL, footprintRing: far }))
            .toEqual({ ok: false, reason: 'no-overlap' });
    });

    it('refuses `degenerate-input` when a ring is < 3 vertices', () => {
        expect(solveExplicitArea({ parcelRing: [{ x: 0, z: 0 }], footprintRing: BAND }))
            .toEqual({ ok: false, reason: 'degenerate-input' });
    });

    it('handles a CONCAVE footprint against a convex parcel', () => {
        // An L-shaped footprint fully inside the parcel keeps its own area (64 for a 10-unit L).
        const lFootprint: Pt[] = [
            { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 4 },
            { x: 4, z: 4 }, { x: 4, z: 10 }, { x: 0, z: 10 },
        ];
        const out = solveExplicitArea({ parcelRing: PARCEL, footprintRing: lFootprint });
        expect(out.ok).toBe(true);
        if (out.ok) expect(out.areaM2).toBeCloseTo(64, 6);
    });

    it('refuses `non-convex-both` when NEITHER ring is convex — never a fabricated region', () => {
        const concaveParcel: Pt[] = [
            { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 4 },
            { x: 4, z: 4 }, { x: 4, z: 10 }, { x: 0, z: 10 },
        ];
        const concaveFootprint: Pt[] = [
            { x: 0, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 3 },
            { x: 3, z: 3 }, { x: 3, z: 8 }, { x: 0, z: 8 },
        ];
        const res = solveExplicitArea({ parcelRing: concaveParcel, footprintRing: concaveFootprint });
        expect(res.ok).toBe(false);
        expect(res.ok === false && res.reason).toBe('non-convex-both');
    });

    it('is deterministic', () => {
        const a = solveExplicitArea({ parcelRing: PARCEL, footprintRing: BAND });
        const b = solveExplicitArea({ parcelRing: PARCEL, footprintRing: BAND });
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
});
