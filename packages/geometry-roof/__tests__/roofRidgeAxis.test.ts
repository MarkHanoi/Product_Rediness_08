// A.21.D24 §RIDGE-PRINCIPAL-AXIS — unit tests for the pure (THREE-free) gable
// ridge-axis helpers. Validates Defect 1 fix: the gable ridge follows the
// footprint's principal axis on a skewed/rotated plate, and that non-quad /
// non-convex footprints are flagged for the hip fallback.

import { describe, it, expect } from 'vitest';
import { principalAxis, gableRidge, isGableFriendly, type Pt2 } from '../src/roofRidgeAxis';

const SLOPE = 0.5;

/** Rotate a point [x,z] by `deg` about the origin. */
function rot(p: Pt2, deg: number): Pt2 {
    const r = (deg * Math.PI) / 180;
    const c = Math.cos(r), s = Math.sin(r);
    return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
}

function angleBetween(a: Pt2, b: Pt2): number {
    // unsigned angle (deg) between two unit-ish vectors
    const dot = a[0] * b[0] + a[1] * b[1];
    const la = Math.hypot(a[0], a[1]) || 1;
    const lb = Math.hypot(b[0], b[1]) || 1;
    return (Math.acos(Math.max(-1, Math.min(1, dot / (la * lb)))) * 180) / Math.PI;
}

describe('principalAxis', () => {
    it('axis-aligned wide rectangle → principal axis along world X', () => {
        // 10 (X) × 4 (Z) rectangle centred at origin.
        const rect: Pt2[] = [[-5, -2], [5, -2], [5, 2], [-5, 2]];
        const { u } = principalAxis(rect);
        // longest edge is horizontal → |u.x| ≈ 1, u.z ≈ 0
        expect(Math.abs(u[0])).toBeCloseTo(1, 6);
        expect(Math.abs(u[1])).toBeCloseTo(0, 6);
    });

    it('rotated rectangle → principal axis follows the rotation', () => {
        const rect: Pt2[] = [[-5, -2], [5, -2], [5, 2], [-5, 2]];
        const skew = 16;
        const rotated = rect.map(p => rot(p, skew));
        const { u, v } = principalAxis(rotated);
        // u should point ~16° (or 180+16) off world X; perpendicular is orthogonal.
        const off = angleBetween(u, [1, 0]);
        expect(Math.min(off, 180 - off)).toBeCloseTo(skew, 4);
        expect(angleBetween(u, v)).toBeCloseTo(90, 4);
    });
});

describe('gableRidge', () => {
    it('axis-aligned rectangle: ridge runs along the long axis, centred', () => {
        const rect: Pt2[] = [[-5, -2], [5, -2], [5, 2], [-5, 2]];
        const { ridge, ridgeH } = gableRidge(rect, SLOPE);
        const [a, b] = ridge;
        // Ridge is horizontal (z constant ≈ 0 = centre), spanning the full 10 m.
        expect(a[1]).toBeCloseTo(0, 6);
        expect(b[1]).toBeCloseTo(0, 6);
        expect(Math.abs(b[0] - a[0])).toBeCloseTo(10, 6);
        // ridgeH = halfPerp(2) × slope(0.5) = 1.
        expect(ridgeH).toBeCloseTo(1, 6);
    });

    it('rotated rectangle: ridge stays parallel to the long façade (NOT world axis)', () => {
        const rect: Pt2[] = [[-5, -2], [5, -2], [5, 2], [-5, 2]];
        const skew = 16;
        const rotated = rect.map(p => rot(p, skew));
        const { ridge, ridgeH } = gableRidge(rotated, SLOPE);
        const [a, b] = ridge;
        const ridgeDir: Pt2 = [b[0] - a[0], b[1] - a[1]];
        // The ridge direction must be ~16° off world X (parallel to the long edge),
        // proving it is NOT axis-aligned to world X/Z (the old bbox bug).
        const off = angleBetween(ridgeDir, [1, 0]);
        expect(Math.min(off, 180 - off)).toBeCloseTo(skew, 3);
        // Length preserved (10 m long edge) and height unchanged by rotation.
        expect(Math.hypot(ridgeDir[0], ridgeDir[1])).toBeCloseTo(10, 4);
        expect(ridgeH).toBeCloseTo(1, 4);
    });

    it('parallelogram: ridge centred between the two long edges', () => {
        // Long edges along X, sheared in X by the Z offset.
        const par: Pt2[] = [[-5, -2], [5, -2], [7, 2], [-3, 2]];
        const { ridge } = gableRidge(par, SLOPE);
        const [a, b] = ridge;
        // Centroid z is 0; ridge sits at the perpendicular midline → endpoints' mean
        // z ≈ 0, and the ridge spans roughly the long-edge length.
        expect((a[1] + b[1]) / 2).toBeCloseTo(0, 6);
        expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeGreaterThan(8);
    });
});

describe('isGableFriendly', () => {
    const toXZ = (pts: Pt2[]) => pts.map(([x, z]) => ({ x, z }));

    it('axis-aligned rectangle → gable-friendly', () => {
        expect(isGableFriendly(toXZ([[-5, -2], [5, -2], [5, 2], [-5, 2]]))).toBe(true);
    });

    it('rotated parallelogram → gable-friendly (convex quad)', () => {
        const rotated = ([[-5, -2], [5, -2], [7, 2], [-3, 2]] as Pt2[]).map(p => rot(p, 16));
        expect(isGableFriendly(toXZ(rotated))).toBe(true);
    });

    it('L-shaped (non-convex, 6 corners) → NOT gable-friendly → hip fallback', () => {
        const lShape: Pt2[] = [[0, 0], [6, 0], [6, 3], [3, 3], [3, 6], [0, 6]];
        expect(isGableFriendly(toXZ(lShape))).toBe(false);
    });

    it('many-sided polygon (>5) → NOT gable-friendly', () => {
        const hex: Pt2[] = [[2, 0], [1, 2], [-1, 2], [-2, 0], [-1, -2], [1, -2]];
        expect(isGableFriendly(toXZ(hex))).toBe(false);
    });

    it('degenerate (<3 pts) → NOT gable-friendly', () => {
        expect(isGableFriendly(toXZ([[0, 0], [1, 1]]))).toBe(false);
    });
});
