// TGL P1 — rectilinear decomposition tests.

import { describe, expect, it } from 'vitest';
import {
    decomposeToRects, mergeHorizontally, polygonBBox, rectArea, rectCenter,
    type Pt, type Rect,
} from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';

const sumArea = (rs: Rect[]): number => rs.reduce((s, r) => s + rectArea(r), 0);

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

    it('a single slanted edge → one rect at the midpoint height (exact area for a linear slant)', () => {
        // trapezoid, x-coords only {0,10} → one slab; midpoint height = exact trapezoid area.
        const trap: Pt[] = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 8 }, { x: 0, z: 4 }];
        const rs = decomposeToRects(trap, 0.25);
        expect(rs).toHaveLength(1);
        expect(sumArea(rs)).toBeCloseTo(60, 4);          // 10 wide × midheight 6
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
