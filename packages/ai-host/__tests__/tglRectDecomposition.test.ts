// TGL P1 — rectilinear decomposition tests.

import { describe, expect, it } from 'vitest';
import {
    decomposeToRects, mergeHorizontally, polygonBBox, rectArea, rectCenter,
    rectifyConvexQuad, principalAxisAngle, rotatePoly, subtractRectsFromRects,
    type Pt, type Rect,
} from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';

const sumArea = (rs: Rect[]): number => rs.reduce((s, r) => s + rectArea(r), 0);
const rotDeg = (deg: number, poly: Pt[]): Pt[] => rotatePoly(poly, (deg * Math.PI) / 180);
const shoelace = (poly: Pt[]): number => {
    let a = 0;
    for (let i = 0; i < poly.length; i++) { const p = poly[i]!, q = poly[(i + 1) % poly.length]!; a += p.x * q.z - q.x * p.z; }
    return Math.abs(a) / 2;
};

describe('decomposeToRects (TGL P1)', () => {
    it('a plain rectangle → one rectangle covering it', () => {
        const rect: Pt[] = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 8 }, { x: 0, z: 8 }];
        const rs = decomposeToRects(rect);
        expect(rs).toHaveLength(1);
        expect(rectArea(rs[0]!)).toBeCloseTo(80, 6);
    });

    it('an L-shape → rectangles whose total area equals the L area (no notch fill)', () => {
        // 10×10 square minus a 4×4 top-right notch → area 100 - 16 = 84.
        const L: Pt[] = [
            { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 6 },
            { x: 6, z: 6 }, { x: 6, z: 10 }, { x: 0, z: 10 },
        ];
        const rs = decomposeToRects(L);
        expect(rs.length).toBeGreaterThanOrEqual(2);
        expect(sumArea(rs)).toBeCloseTo(84, 4);
        // No rectangle pokes into the notch (x>6 AND z>6).
        for (const r of rs) {
            const c = rectCenter(r);
            expect(c.x > 6 && c.z > 6).toBe(false);
        }
    });

    it('stays within the polygon bounding box', () => {
        const L: Pt[] = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 6 }, { x: 6, z: 6 }, { x: 6, z: 10 }, { x: 0, z: 10 }];
        const bb = polygonBBox(L);
        for (const r of decomposeToRects(L)) {
            expect(r.x0).toBeGreaterThanOrEqual(bb.x0 - 1e-6);
            expect(r.x1).toBeLessThanOrEqual(bb.x1 + 1e-6);
            expect(r.z0).toBeGreaterThanOrEqual(bb.z0 - 1e-6);
            expect(r.z1).toBeLessThanOrEqual(bb.z1 + 1e-6);
        }
    });

    it('§STAIR-KEEPOUT: subtractRectsFromRects carves a central hole, no sub-rect overlaps it', () => {
        // 12×10 plate with a central 1×3 m stair core carved out.
        const plate: Rect[] = [{ x0: 0, z0: 0, x1: 12, z1: 10 }];
        const hole: Rect = { x0: 5.5, z0: 3.5, x1: 6.5, z1: 6.5 };
        const out = subtractRectsFromRects(plate, [hole]);
        // Area conservation: plate − hole = 120 − 3 = 117 m².
        expect(sumArea(out)).toBeCloseTo(120 - rectArea(hole), 4);
        // NO output rect overlaps the hole interior.
        for (const r of out) {
            const overlap = r.x0 < hole.x1 - 1e-6 && r.x1 > hole.x0 + 1e-6 &&
                            r.z0 < hole.z1 - 1e-6 && r.z1 > hole.z0 + 1e-6;
            expect(overlap).toBe(false);
        }
    });

    it('§STAIR-KEEPOUT: empty holes ⇒ rects unchanged (apartment no-op path)', () => {
        const plate: Rect[] = [{ x0: 0, z0: 0, x1: 12, z1: 10 }];
        expect(subtractRectsFromRects(plate, [])).toEqual(plate);
    });

    it('§STAIR-KEEPOUT: a hole touching an edge yields no slivers, area conserved', () => {
        const plate: Rect[] = [{ x0: 0, z0: 0, x1: 10, z1: 8 }];
        const hole: Rect = { x0: 0, z0: 0, x1: 2, z1: 3 };   // corner-anchored core
        const out = subtractRectsFromRects(plate, [hole]);
        expect(sumArea(out)).toBeCloseTo(80 - 6, 4);
        for (const r of out) {
            const overlap = r.x0 < hole.x1 - 1e-6 && r.x1 > hole.x0 + 1e-6 &&
                            r.z0 < hole.z1 - 1e-6 && r.z1 > hole.z0 + 1e-6;
            expect(overlap).toBe(false);
        }
    });

    it('§RECTIFY-QUAD: a convex trapezoid is rectified to its bbox (one clean rect)', () => {
        // A trapezoid is a convex QUADRILATERAL, so §RECTIFY-QUAD (2026-06-05) snaps
        // it to its bounding box BEFORE the slab sweep — giving subdivide one clean
        // room canvas instead of a midpoint-height stair-step. (Previously this raw
        // single-slab case returned the exact midpoint area, 60 m²; the rectified
        // behaviour — bbox 10×8 = 80 m² — is the intended skewed-plot fix, since a
        // trapezoidal plot would otherwise also sliver on multi-x-vertex slants.)
        const trap: Pt[] = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 8 }, { x: 0, z: 4 }];
        const rs = decomposeToRects(trap, 0.25);
        expect(rs).toHaveLength(1);
        expect(sumArea(rs)).toBeCloseTo(80, 4);          // bbox 10 × 8 (rectified)
    });

    it('a slant crossing intermediate x-vertices → stair-step rects inside the polygon', () => {
        // top: (10,2)→(5,6)→(0,4); x-coords {0,5,10} → 2 slabs at differing heights.
        const shape: Pt[] = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 2 }, { x: 5, z: 6 }, { x: 0, z: 4 }];
        const rs = decomposeToRects(shape, 0.25);
        expect(rs.length).toBe(2);
        expect(sumArea(rs)).toBeCloseTo(45, 4);          // [0,5]×5 + [5,10]×4 = 25 + 20
    });

    it('returns [] for a degenerate polygon', () => {
        expect(decomposeToRects([{ x: 0, z: 0 }, { x: 1, z: 1 }])).toEqual([]);
    });
});

// ── §RECTIFY-QUAD (D2 non-orthogonal, 2026-06-05) ────────────────────────────
describe('rectifyConvexQuad', () => {
    it('rectifies a convex quadrilateral (parallelogram) to its bounding box', () => {
        // A sheared parallelogram (top edge offset by 3 m).
        const para: Pt[] = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 13, z: 7 }, { x: 3, z: 7 }];
        const out = rectifyConvexQuad(para);
        const bb = polygonBBox(para);
        expect(out).toHaveLength(4);
        // Output is exactly the bbox ring.
        expect(shoelace(out)).toBeCloseTo(rectArea(bb), 6);
        for (const p of out) {
            expect(p.x === bb.x0 || p.x === bb.x1).toBe(true);
            expect(p.z === bb.z0 || p.z === bb.z1).toBe(true);
        }
    });

    it('is a no-op for an axis-aligned rectangle (bbox === self)', () => {
        const rect: Pt[] = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 8 }, { x: 0, z: 8 }];
        expect(shoelace(rectifyConvexQuad(rect))).toBeCloseTo(80, 6);
    });

    it('does NOT rectify a concave L-shape (6 vertices) — notch preserved', () => {
        const L: Pt[] = [
            { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 6 },
            { x: 6, z: 6 }, { x: 6, z: 10 }, { x: 0, z: 10 },
        ];
        const out = rectifyConvexQuad(L);
        // Unchanged → still the L area (84), not the bbox (100).
        expect(shoelace(out)).toBeCloseTo(84, 6);
    });

    it('does NOT rectify a pathologically thin/sheared quad below the fill floor', () => {
        // A heavily sheared quad whose area is < 50% of its bbox.
        const thin: Pt[] = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 14, z: 6 }, { x: 10, z: 6 }];
        // bbox = 14×6 = 84; quad area = 4×6 = 24 → fill 0.286 < 0.5 → unchanged.
        const out = rectifyConvexQuad(thin);
        expect(shoelace(out)).toBeCloseTo(24, 6);
    });

    it('treats a rectangle with a redundant collinear mid-edge point as a quad', () => {
        const rectWithMid: Pt[] = [
            { x: 0, z: 0 }, { x: 5, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 8 }, { x: 0, z: 8 },
        ];
        expect(shoelace(rectifyConvexQuad(rectWithMid))).toBeCloseTo(80, 6);
    });
});

describe('decomposeToRects — skewed plot (the founder defect)', () => {
    it('a principal-axis-rotated parallelogram tiles as ONE clean rect, not stair-step slivers', () => {
        // A parallelogram drawn off-axis on the GIS map (Córdoba / Notting Hill case).
        const W = 12, H = 9, shear = 2;
        const para0: Pt[] = [
            { x: 0, z: 0 }, { x: W, z: 0 }, { x: W + shear, z: H }, { x: shear, z: H },
        ];
        const para = rotDeg(16, para0);
        // Mirror the engine: rotate to the principal axis first.
        const ang = principalAxisAngle(para);
        const rotated = rotatePoly(para, -ang);

        const rs = decomposeToRects(rotated);
        // BEFORE the fix this produced 3 rects (a big central rect + 2 slivers);
        // AFTER rectification it is exactly ONE rect (the bounding box).
        expect(rs).toHaveLength(1);
        // The single rect is the bbox of the rotated quad (a clean room canvas).
        const bb = polygonBBox(rotated);
        expect(rectArea(rs[0]!)).toBeCloseTo(rectArea(bb), 4);
    });

    it('an off-axis true rectangle is unaffected (still one rect, no regression)', () => {
        const rect0: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 9 }, { x: 0, z: 9 }];
        const r = rotDeg(16, rect0);
        const ang = principalAxisAngle(r);
        const rs = decomposeToRects(rotatePoly(r, -ang));
        expect(rs).toHaveLength(1);
        expect(rectArea(rs[0]!)).toBeCloseTo(108, 3);
    });

    it('a rotated L-shape is NOT rectified — still multi-rect, notch avoided', () => {
        const L: Pt[] = [
            { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 6 },
            { x: 6, z: 6 }, { x: 6, z: 10 }, { x: 0, z: 10 },
        ];
        const r = rotDeg(16, L);
        const ang = principalAxisAngle(r);
        const rs = decomposeToRects(rotatePoly(r, -ang));
        // L total area is 84; rectified bbox would be 100. Stay near 84 (notch kept).
        expect(sumArea(rs)).toBeLessThan(92);
        expect(rs.length).toBeGreaterThanOrEqual(2);
    });
});

describe('mergeHorizontally', () => {
    it('merges two rects sharing a vertical seam + band', () => {
        const merged = mergeHorizontally([
            { x0: 0, z0: 0, x1: 5, z1: 8 },
            { x0: 5, z0: 0, x1: 10, z1: 8 },
        ]);
        expect(merged).toHaveLength(1);
        expect(merged[0]).toEqual({ x0: 0, z0: 0, x1: 10, z1: 8 });
    });

    it('does NOT merge rects with different bands', () => {
        const merged = mergeHorizontally([
            { x0: 0, z0: 0, x1: 5, z1: 8 },
            { x0: 5, z0: 0, x1: 10, z1: 4 },
        ]);
        expect(merged).toHaveLength(2);
    });
});
