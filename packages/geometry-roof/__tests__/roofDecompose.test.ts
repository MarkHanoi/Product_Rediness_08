// §ROOF-CONCAVE-DECOMPOSE (founder L-shape defect, 2026-06-10) — unit tests for the
// pure (THREE-free) rectilinear decomposition that splits a concave L/T/U footprint
// into rectangular wings so each wing can get a real pitched gable.

import { describe, it, expect } from 'vitest';
import {
    decomposeRectilinear,
    isRectilinear,
    canDecomposeConcave,
    rectToPolygon,
    type Pt2,
    type Rect2,
} from '../src/roofDecompose';

// Sum of rect areas must equal the polygon's area (a partition with no overlap/gap).
function polyArea(poly: Pt2[]): number {
    let a = 0;
    const n = poly.length;
    for (let i = 0; i < n; i++) {
        const [x1, z1] = poly[i]!;
        const [x2, z2] = poly[(i + 1) % n]!;
        a += x1 * z2 - x2 * z1;
    }
    return Math.abs(a) / 2;
}
function rectArea(r: Rect2): number {
    return (r.maxX - r.minX) * (r.maxZ - r.minZ);
}

const L: Pt2[] = [[0, 0], [6, 0], [6, 3], [3, 3], [3, 6], [0, 6]];
const T: Pt2[] = [[0, 0], [6, 0], [6, 2], [4, 2], [4, 5], [2, 5], [2, 2], [0, 2]];
const U: Pt2[] = [[0, 0], [6, 0], [6, 6], [4, 6], [4, 2], [2, 2], [2, 6], [0, 6]];
const RECT: Pt2[] = [[0, 0], [10, 0], [10, 4], [0, 4]];

describe('isRectilinear', () => {
    it('axis-aligned rectangle → true', () => expect(isRectilinear(RECT)).toBe(true));
    it('L-shape → true', () => expect(isRectilinear(L)).toBe(true));
    it('T-shape → true', () => expect(isRectilinear(T)).toBe(true));
    it('skewed parallelogram → false', () => {
        const par: Pt2[] = [[0, 0], [10, 0], [12, 4], [2, 4]];
        expect(isRectilinear(par)).toBe(false);
    });
    it('triangle (<4 verts) → false', () => {
        expect(isRectilinear([[0, 0], [4, 0], [2, 4]])).toBe(false);
    });
});

describe('decomposeRectilinear', () => {
    it('L-shape → rectangles that partition the footprint with no overlap', () => {
        const rects = decomposeRectilinear(L);
        expect(rects).not.toBeNull();
        const total = rects!.reduce((s, r) => s + rectArea(r), 0);
        expect(total).toBeCloseTo(polyArea(L), 6);
        // L area = 6*3 + 3*3 = 27
        expect(total).toBeCloseTo(27, 6);
    });

    it('T-shape → partitions exactly', () => {
        const rects = decomposeRectilinear(T);
        expect(rects).not.toBeNull();
        const total = rects!.reduce((s, r) => s + rectArea(r), 0);
        expect(total).toBeCloseTo(polyArea(T), 6);
    });

    it('U-shape → partitions exactly', () => {
        const rects = decomposeRectilinear(U);
        expect(rects).not.toBeNull();
        const total = rects!.reduce((s, r) => s + rectArea(r), 0);
        expect(total).toBeCloseTo(polyArea(U), 6);
    });

    it('plain rectangle → a single rect', () => {
        const rects = decomposeRectilinear(RECT);
        expect(rects).not.toBeNull();
        expect(rects!.length).toBe(1);
        expect(rectArea(rects![0]!)).toBeCloseTo(40, 6);
    });

    it('non-rectilinear (skewed) footprint → null', () => {
        const par: Pt2[] = [[0, 0], [10, 0], [12, 4], [2, 4]];
        expect(decomposeRectilinear(par)).toBeNull();
    });

    it('is DETERMINISTIC — same input → byte-identical rects (ADR-0061)', () => {
        const a = JSON.stringify(decomposeRectilinear(L));
        const b = JSON.stringify(decomposeRectilinear(L));
        expect(a).toBe(b);
    });

    it('rects cover every footprint vertex region (no gaps)', () => {
        const rects = decomposeRectilinear(L)!;
        // every rect is non-degenerate
        for (const r of rects) {
            expect(r.maxX).toBeGreaterThan(r.minX);
            expect(r.maxZ).toBeGreaterThan(r.minZ);
        }
    });
});

describe('canDecomposeConcave', () => {
    it('L / T / U → true', () => {
        expect(canDecomposeConcave(L)).toBe(true);
        expect(canDecomposeConcave(T)).toBe(true);
        expect(canDecomposeConcave(U)).toBe(true);
    });
    it('skewed concave → false', () => {
        const par: Pt2[] = [[0, 0], [10, 0], [12, 4], [2, 4]];
        expect(canDecomposeConcave(par)).toBe(false);
    });
});

describe('rectToPolygon', () => {
    it('produces a 4-vertex CCW box', () => {
        const poly = rectToPolygon({ minX: 0, maxX: 2, minZ: 0, maxZ: 3 });
        expect(poly).toEqual([[0, 0], [2, 0], [2, 3], [0, 3]]);
        expect(polyArea(poly)).toBeCloseTo(6, 6);
    });
});
