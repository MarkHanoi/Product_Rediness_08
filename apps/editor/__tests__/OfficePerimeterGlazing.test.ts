// §OFFICE-PERIMETER-GLAZING (founder 2026-06-30) — unit tests for the PURE per-segment
// curtain-glazing placement math the office tower uses to host a near-full-width /
// near-full-height window in every perimeter wall segment.
//
// Pure (no DOM, no store) — `perimeterGlazingSpec` is I/O-free, so the default node env is
// fine. Verifies the corner jamb (almost full width), the sill-low / head-near-slab height
// (almost full height), centring, and the too-short → null degrade the deferred punch pass
// relies on to skip a segment that can't host a sensible pane.

import { describe, it, expect } from 'vitest';
import {
    perimeterGlazingSpec,
    ringPlanSegments,
    isFinitePlanPt,
    resampleRing,
    MAX_PERIMETER_SEGMENTS,
} from '../src/ui/office-building/officePerimeterGlazing';

describe('perimeterGlazingSpec — §OFFICE-PERIMETER-GLAZING', () => {
    it('fills almost the FULL WIDTH of a typical segment (small jamb each end, centred)', () => {
        // A 64-gon on a ~22 m radius → ~2.15 m segments. Use a clean 2.0 m segment.
        const g = perimeterGlazingSpec(2.0, 4.0);
        expect(g).not.toBeNull();
        // jamb = clamp(7.5% × 2.0 = 0.15, [0.15, 0.30]) = 0.15 m each end.
        expect(g!.offset).toBeCloseTo(0.15, 6);
        expect(g!.width).toBeCloseTo(2.0 - 2 * 0.15, 6);     // 1.70 m
        // Centred: equal jamb both ends ⇒ offset + width + offset === segment length.
        expect(g!.offset + g!.width + g!.offset).toBeCloseTo(2.0, 6);
        // "Almost full width" — the pane covers ≥ 80% of the segment.
        expect(g!.width / 2.0).toBeGreaterThanOrEqual(0.8);
    });

    it('fills almost the FULL HEIGHT — sill near the floor, head near the slab soffit', () => {
        const ftf = 4.0;
        const g = perimeterGlazingSpec(3.0, ftf);
        expect(g).not.toBeNull();
        // Sill low.
        expect(g!.sillHeight).toBeCloseTo(0.15, 6);
        // Head = sill + height = ftf − header(0.30). So height = ftf − 0.30 − 0.15.
        expect(g!.height).toBeCloseTo(ftf - 0.30 - 0.15, 6);
        const head = g!.sillHeight + g!.height;
        // Head is within a small header of the slab soffit.
        expect(ftf - head).toBeCloseTo(0.30, 6);
        // "Almost full height" — the glazed band covers ≥ 85% of the storey height.
        expect(g!.height / ftf).toBeGreaterThanOrEqual(0.85);
    });

    it('caps the corner jamb at 0.30 m on a long segment', () => {
        const g = perimeterGlazingSpec(8.0, 3.5);
        expect(g).not.toBeNull();
        // 7.5% × 8.0 = 0.60 → clamped to the 0.30 m cap.
        expect(g!.offset).toBeCloseTo(0.30, 6);
        expect(g!.width).toBeCloseTo(8.0 - 2 * 0.30, 6);
    });

    it('shrinks the jamb on a short segment so a minimal pane still fits', () => {
        // 0.7 m segment: max-affordable jamb = (0.7 − 0.4)/2 = 0.15 → width = 0.4 (the minimum).
        const g = perimeterGlazingSpec(0.7, 3.0);
        expect(g).not.toBeNull();
        expect(g!.width).toBeGreaterThanOrEqual(0.4 - 1e-9);
        expect(g!.offset + g!.width).toBeLessThanOrEqual(0.7 + 1e-9);
    });

    it('returns null for a segment too short to host a sensible pane', () => {
        expect(perimeterGlazingSpec(0.3, 4.0)).toBeNull();   // < min width even with no jamb
        expect(perimeterGlazingSpec(0, 4.0)).toBeNull();
    });

    it('degrades to null on non-finite inputs (never emits a NaN opening)', () => {
        expect(perimeterGlazingSpec(NaN, 4.0)).toBeNull();
        expect(perimeterGlazingSpec(2.0, 0)).toBeNull();
        expect(perimeterGlazingSpec(2.0, NaN)).toBeNull();
    });

    it('the punched span never overruns the segment (offset + width ≤ segLen)', () => {
        for (const len of [0.5, 1.0, 2.15, 3.7, 6.4, 12.0]) {
            const g = perimeterGlazingSpec(len, 3.6);
            if (!g) continue;
            expect(g.offset).toBeGreaterThanOrEqual(0);
            expect(g.offset + g.width).toBeLessThanOrEqual(len + 1e-9);
        }
    });
});

describe('ringPlanSegments — §RBL-PLACEMENT-AT-SOURCE', () => {
    const square = [
        { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 },
    ];

    it('every emitted segment has DEFINED, finite start AND end (the guard never skips)', () => {
        const segs = ringPlanSegments(square);
        expect(segs.length).toBe(4);    // closed ring → 4 edges
        for (const s of segs) {
            expect(isFinitePlanPt(s.start)).toBe(true);
            expect(isFinitePlanPt(s.end)).toBe(true);
            expect(Number.isFinite(s.start.x)).toBe(true);
            expect(Number.isFinite(s.start.z)).toBe(true);
            expect(Number.isFinite(s.end.x)).toBe(true);
            expect(Number.isFinite(s.end.z)).toBe(true);
        }
    });

    it('DROPS an edge with an undefined / NaN vertex (never emits a placement.start undefined)', () => {
        const bad = [
            { x: 0, z: 0 }, undefined as unknown as { x: number; z: number },
            { x: 10, z: 10 }, { x: NaN, z: 5 },
        ];
        const segs = ringPlanSegments(bad);
        // Only the 10,10 → ... edges with two finite endpoints survive; none carries a bad point.
        for (const s of segs) {
            expect(isFinitePlanPt(s.start)).toBe(true);
            expect(isFinitePlanPt(s.end)).toBe(true);
        }
    });

    it('DROPS a degenerate (< 10 mm) edge', () => {
        const withDup = [
            { x: 0, z: 0 }, { x: 0, z: 0.005 }, { x: 10, z: 0 }, { x: 10, z: 10 },
        ];
        const segs = ringPlanSegments(withDup);
        for (const s of segs) {
            expect(Math.hypot(s.end.x - s.start.x, s.end.z - s.start.z)).toBeGreaterThanOrEqual(0.01);
        }
    });
});

describe('resampleRing — §OFFICE-PERIMETER-COARSEN', () => {
    const circle = (n: number, r = 22) =>
        Array.from({ length: n }, (_, i) => {
            const a = (2 * Math.PI * i) / n;
            return { x: r * Math.cos(a), z: r * Math.sin(a) };
        });

    it('decimates a fine 64-gon down to ≤ MAX_PERIMETER_SEGMENTS (the element-count fix)', () => {
        const fine = circle(64);
        const coarse = resampleRing(fine);
        expect(coarse.length).toBeLessThanOrEqual(MAX_PERIMETER_SEGMENTS);
        expect(coarse.length).toBeGreaterThanOrEqual(3);
        // Far fewer perimeter walls/windows than the original — the headline reduction.
        expect(coarse.length).toBeLessThan(fine.length / 2);
    });

    it('leaves a ring already at/under the cap unchanged', () => {
        const small = circle(8);
        expect(resampleRing(small).length).toBe(8);
    });

    it('keeps a real polygon (≥ 3 vertices) and drops non-finite vertices', () => {
        const bad = [{ x: 0, z: 0 }, undefined as unknown as { x: number; z: number }, { x: 10, z: 0 }, { x: 5, z: 9 }];
        const out = resampleRing(bad);
        expect(out.length).toBeGreaterThanOrEqual(3);
        for (const p of out) expect(isFinitePlanPt(p)).toBe(true);
    });
});
