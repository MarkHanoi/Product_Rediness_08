// §RECT-BOUNDARY — pure two-corner → axis-aligned CCW rectangle tests.
//
// Asserts the pure helper (`rectCornersFromOpposite`) AND its composition with the
// real boundary projection (`buildBoundaryFromLatLonRing`): two opposite corners
// must yield a clean 4-vertex polygon that is axis-aligned (no rotation) and
// counter-clockwise in scene XZ, with the expected area — regardless of which
// diagonal the two clicks describe.

import { describe, it, expect } from 'vitest';
import { rectCornersFromOpposite } from '../src/ui/geospatial/rectBoundary';
import { buildBoundaryFromLatLonRing, type LatLon } from '../src/ui/site/boundaryProjection';

/** Signed shoelace area of an XZ ring (the project's convention: >0 ⇒ CCW). */
function signedAreaXZ(ring: ReadonlyArray<{ x: number; z: number }>): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return a / 2;
}

/** Distinct, sorted values of an array, rounded to a tolerance. */
function distinct(vals: number[], tol = 1e-6): number[] {
    const out: number[] = [];
    for (const v of [...vals].sort((a, b) => a - b)) {
        if (out.length === 0 || Math.abs(v - out[out.length - 1]!) > tol) out.push(v);
    }
    return out;
}

describe('rectCornersFromOpposite (§RECT-BOUNDARY)', () => {
    it('returns exactly 4 corners drawn from the two distinct lat/lon values', () => {
        const a: LatLon = { lat: -33.8000, lon: 151.2000 };
        const b: LatLon = { lat: -33.8010, lon: 151.2015 };
        const corners = rectCornersFromOpposite(a, b);
        expect(corners).not.toBeNull();
        expect(corners).toHaveLength(4);
        // Only the two source lat/lon values appear.
        expect(distinct(corners!.map((c) => c.lat))).toEqual([-33.8010, -33.8000]);
        expect(distinct(corners!.map((c) => c.lon))).toEqual([151.2000, 151.2015]);
    });

    it('rejects a degenerate (zero-area) rectangle — same lat OR same lon', () => {
        const base: LatLon = { lat: 10, lon: 20 };
        expect(rectCornersFromOpposite(base, { lat: 10, lon: 21 })).toBeNull();   // same lat
        expect(rectCornersFromOpposite(base, { lat: 11, lon: 20 })).toBeNull();   // same lon
        expect(rectCornersFromOpposite(base, { lat: 10, lon: 20 })).toBeNull();   // identical
    });

    it('rejects non-finite input', () => {
        expect(rectCornersFromOpposite({ lat: NaN, lon: 0 }, { lat: 1, lon: 1 })).toBeNull();
        expect(rectCornersFromOpposite({ lat: 0, lon: 0 }, { lat: 1, lon: Infinity })).toBeNull();
    });

    // The full contract: two clicks → an AXIS-ALIGNED, CCW, correct-area XZ polygon
    // once run through the same projection the commit path uses.
    for (const [name, a, b] of [
        ['top-left ↔ bottom-right', { lat: 0.0010, lon: 0.0000 }, { lat: 0.0000, lon: 0.0020 }],
        ['bottom-left ↔ top-right', { lat: 0.0000, lon: 0.0000 }, { lat: 0.0010, lon: 0.0020 }],
        ['clicks reversed (B first)', { lat: 0.0010, lon: 0.0020 }, { lat: 0.0000, lon: 0.0000 }],
    ] as Array<[string, LatLon, LatLon]>) {
        it(`projects to an axis-aligned CCW rectangle — ${name}`, () => {
            const corners = rectCornersFromOpposite(a, b)!;
            expect(corners).toHaveLength(4);
            // Project about the origin = corner A (matches the commit's first-vertex origin).
            const origin = corners[3]!; // (minLat, minLon)
            const built = buildBoundaryFromLatLonRing(corners, origin.lat, origin.lon);
            // Exactly 4 vertices survive (no closing-duplicate drop, none collinear).
            expect(built.polygon).toHaveLength(4);
            // AXIS-ALIGNED: only two distinct x and two distinct z values.
            expect(distinct(built.polygon.map((p) => p.x))).toHaveLength(2);
            expect(distinct(built.polygon.map((p) => p.z))).toHaveLength(2);
            // Every edge is purely horizontal or vertical in XZ (no rotation).
            for (let i = 0; i < 4; i++) {
                const p = built.polygon[i]!;
                const q = built.polygon[(i + 1) % 4]!;
                const dx = Math.abs(q.x - p.x);
                const dz = Math.abs(q.z - p.z);
                expect(Math.min(dx, dz)).toBeLessThan(1e-6); // one of dx/dz is ~0
            }
            // COUNTER-CLOCKWISE in scene XZ (positive signed area).
            const area = signedAreaXZ(built.polygon);
            expect(area).toBeGreaterThan(0);
            // AREA matches width × depth in metres (~1 part in 1e-3).
            const xs = distinct(built.polygon.map((p) => p.x));
            const zs = distinct(built.polygon.map((p) => p.z));
            const expected = (xs[1]! - xs[0]!) * (zs[1]! - zs[0]!);
            expect(Math.abs(area)).toBeCloseTo(expected, 3);
            // C19 §2.7 invariant: one classification per edge.
            expect(built.edgeClassifications).toHaveLength(built.polygon.length);
        });
    }
});
