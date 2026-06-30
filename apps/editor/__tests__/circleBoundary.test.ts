// §CIRCLE-BOUNDARY — pure centre+radius → closed CCW N-gon circle tests.
//
// Asserts the pure helpers AND their composition with the real boundary projection
// (`buildBoundaryFromLatLonRing`): a centre + metric radius must yield a closed
// N-vertex ring that projects to a true circle in scene XZ (constant radius, no
// longitude-stretch ellipse), counter-clockwise, with the expected area — and the
// radius readout + round-number snap format exactly as the draw tool consumes them.

import { describe, it, expect } from 'vitest';
import {
    circleCornersFromCentreRadius,
    circleRadiusMetres,
    fmtRadiusMetres,
    snapRadiusToRound,
    DEFAULT_CIRCLE_SEGMENTS,
} from '../src/ui/geospatial/circleBoundary';
import { buildBoundaryFromLatLonRing, latLonToSceneXZ, type LatLon } from '../src/ui/site/boundaryProjection';

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

describe('circleCornersFromCentreRadius (§CIRCLE-BOUNDARY)', () => {
    const centre: LatLon = { lat: -33.8000, lon: 151.2000 };

    it('returns exactly N (default 64) open ring corners', () => {
        const corners = circleCornersFromCentreRadius(centre, 20);
        expect(corners).not.toBeNull();
        expect(corners).toHaveLength(DEFAULT_CIRCLE_SEGMENTS);
        // OPEN ring — the last vertex must NOT duplicate the first.
        const first = corners![0]!;
        const last = corners![corners!.length - 1]!;
        expect(first.lat === last.lat && first.lon === last.lon).toBe(false);
    });

    it('honours a custom segment count, clamped to ≥ 3', () => {
        expect(circleCornersFromCentreRadius(centre, 10, 8)).toHaveLength(8);
        expect(circleCornersFromCentreRadius(centre, 10, 2)).toHaveLength(3); // clamped up
        expect(circleCornersFromCentreRadius(centre, 10, 3)).toHaveLength(3);
    });

    it('rejects degenerate input (non-finite centre, non-positive / non-finite radius)', () => {
        expect(circleCornersFromCentreRadius({ lat: NaN, lon: 0 }, 10)).toBeNull();
        expect(circleCornersFromCentreRadius(centre, 0)).toBeNull();
        expect(circleCornersFromCentreRadius(centre, -5)).toBeNull();
        expect(circleCornersFromCentreRadius(centre, Infinity)).toBeNull();
        // Geographic pole (cos(lat0) → 0) has no finite longitude delta.
        expect(circleCornersFromCentreRadius({ lat: 90, lon: 0 }, 10)).toBeNull();
    });

    // The full contract: centre + radius → a CCW ring that projects to a TRUE circle
    // (every vertex at the same metric distance from the centre) of the right area.
    for (const radius of [5, 25, 100]) {
        it(`projects to a true CCW circle of radius ${radius} m`, () => {
            const corners = circleCornersFromCentreRadius(centre, radius, 64)!;
            expect(corners).toHaveLength(64);
            const built = buildBoundaryFromLatLonRing(corners, centre.lat, centre.lon);
            // No closing-duplicate drop (open ring) and none collinear → all 64 survive.
            expect(built.polygon).toHaveLength(64);
            // TRUE CIRCLE: every projected vertex is `radius` m from the projected
            // centre (within 0.5 % — the equirectangular approximation tolerance).
            const c = latLonToSceneXZ(centre, centre.lat, centre.lon); // → {0,0}
            for (const p of built.polygon) {
                const d = Math.hypot(p.x - c.x, p.z - c.z);
                expect(Math.abs(d - radius)).toBeLessThan(radius * 0.005);
            }
            // COUNTER-CLOCKWISE in scene XZ (positive signed area).
            const area = signedAreaXZ(built.polygon);
            expect(area).toBeGreaterThan(0);
            // AREA approaches π·r² as the polygon → a circle (64-gon is ~99.8 % of it).
            const ideal = Math.PI * radius * radius;
            expect(area).toBeGreaterThan(ideal * 0.99);
            expect(area).toBeLessThanOrEqual(ideal);
            // C19 §2.7 invariant: one classification per edge.
            expect(built.edgeClassifications).toHaveLength(built.polygon.length);
        });
    }
});

describe('circleRadiusMetres (§CIRCLE-BOUNDARY)', () => {
    const centre: LatLon = { lat: 0, lon: 0 };

    it('measures the metric distance centre→edge via the boundary projection', () => {
        // A circumference point built at exactly 30 m must read back ~30 m.
        const corners = circleCornersFromCentreRadius(centre, 30, 4)!;
        for (const c of corners) {
            expect(circleRadiusMetres(centre, c)).toBeCloseTo(30, 1);
        }
    });

    it('returns 0 for non-finite input', () => {
        expect(circleRadiusMetres(centre, { lat: NaN, lon: 0 })).toBe(0);
        expect(circleRadiusMetres({ lat: 0, lon: Infinity }, { lat: 1, lon: 1 })).toBe(0);
    });
});

describe('fmtRadiusMetres (§CIRCLE-BOUNDARY)', () => {
    it('formats to one decimal with an R prefix, matching the line tool', () => {
        expect(fmtRadiusMetres(12.34)).toBe('R 12.3 m');
        expect(fmtRadiusMetres(0)).toBe('R 0.0 m');
        // Defensive: non-finite / negative read as 0.0.
        expect(fmtRadiusMetres(-3)).toBe('R 0.0 m');
        expect(fmtRadiusMetres(NaN)).toBe('R 0.0 m');
    });
});

describe('snapRadiusToRound (§CIRCLE-BOUNDARY)', () => {
    it('snaps to the nearest 0.5 m when within tolerance', () => {
        expect(snapRadiusToRound(10.1)).toBe(10);
        expect(snapRadiusToRound(10.4)).toBe(10.5);
        expect(snapRadiusToRound(9.75)).toBe(10); // 0.25 off the nearest 0.5-step → within 0.5 tol
    });

    it('leaves a deliberately odd radius free when outside the (default) tolerance window', () => {
        // tol defaults to 0.5 m, so within ±0.5 of a 0.5-step everything snaps;
        // tighten the tolerance to verify the free-draw fallback.
        expect(snapRadiusToRound(10.3, 0.5, 0.1)).toBe(10.3); // 0.3 off the nearest step > 0.1 tol
        expect(snapRadiusToRound(10.05, 0.5, 0.1)).toBe(10);  // 0.05 off → snaps
    });

    it('passes through non-finite / non-positive radii unchanged', () => {
        expect(snapRadiusToRound(0)).toBe(0);
        expect(snapRadiusToRound(-2)).toBe(-2);
        expect(Number.isNaN(snapRadiusToRound(NaN))).toBe(true);
    });
});
