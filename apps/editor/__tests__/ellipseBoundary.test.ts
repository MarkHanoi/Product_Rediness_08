// §ELLIPSE-BOUNDARY — pure centre+two-radii → closed CCW N-gon ellipse tests.
//
// Asserts the pure helpers AND their composition with the real boundary projection
// (`buildBoundaryFromLatLonRing`): a centre + two metric radii must yield a closed
// N-vertex ring that projects to a true AXIS-TRUE ellipse in scene XZ (semi-axes rx
// East / ry North, no longitude-stretch), counter-clockwise, with area ≈ π·rx·ry —
// and the per-axis radius readbacks + round-number snap + readout format exactly as
// the draw tool consumes them. A circle (rx === ry) is the degenerate special case.

import { describe, it, expect } from 'vitest';
import {
    ellipseCornersFromCentreRadii,
    ellipseAxisRadiusMetres,
    fmtRadiiMetres,
    snapRadiusToRound,
    DEFAULT_ELLIPSE_SEGMENTS,
} from '../src/ui/geospatial/ellipseBoundary';
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

describe('ellipseCornersFromCentreRadii (§ELLIPSE-BOUNDARY)', () => {
    const centre: LatLon = { lat: -33.8000, lon: 151.2000 };

    it('returns exactly N (default 64) open ring corners', () => {
        const corners = ellipseCornersFromCentreRadii(centre, 30, 18);
        expect(corners).not.toBeNull();
        expect(corners).toHaveLength(DEFAULT_ELLIPSE_SEGMENTS);
        // OPEN ring — the last vertex must NOT duplicate the first.
        const first = corners![0]!;
        const last = corners![corners!.length - 1]!;
        expect(first.lat === last.lat && first.lon === last.lon).toBe(false);
    });

    it('honours a custom segment count, clamped to ≥ 3', () => {
        expect(ellipseCornersFromCentreRadii(centre, 20, 10, 8)).toHaveLength(8);
        expect(ellipseCornersFromCentreRadii(centre, 20, 10, 2)).toHaveLength(3); // clamped up
        expect(ellipseCornersFromCentreRadii(centre, 20, 10, 3)).toHaveLength(3);
    });

    it('rejects degenerate input (non-finite centre, non-positive / non-finite radius, pole)', () => {
        expect(ellipseCornersFromCentreRadii({ lat: NaN, lon: 0 }, 10, 5)).toBeNull();
        expect(ellipseCornersFromCentreRadii(centre, 0, 5)).toBeNull();
        expect(ellipseCornersFromCentreRadii(centre, 10, 0)).toBeNull();
        expect(ellipseCornersFromCentreRadii(centre, -5, 5)).toBeNull();
        expect(ellipseCornersFromCentreRadii(centre, 5, -5)).toBeNull();
        expect(ellipseCornersFromCentreRadii(centre, Infinity, 5)).toBeNull();
        // Geographic pole (cos(lat0) → 0) has no finite longitude delta.
        expect(ellipseCornersFromCentreRadii({ lat: 90, lon: 0 }, 10, 5)).toBeNull();
    });

    // The full contract: centre + two radii → a CCW ring that projects to a TRUE
    // axis-true ellipse — semi-major rx along East/X, semi-minor ry along North/Z —
    // of area ≈ π·rx·ry. The XZ EXTENT must be 2·rx wide and 2·ry tall.
    for (const [rx, ry] of [[30, 18], [50, 50], [100, 25]] as const) {
        it(`projects to a true CCW ellipse with semi-axes ${rx}×${ry} m`, () => {
            const corners = ellipseCornersFromCentreRadii(centre, rx, ry, 64)!;
            expect(corners).toHaveLength(64);
            const built = buildBoundaryFromLatLonRing(corners, centre.lat, centre.lon);
            // No closing-duplicate drop (open ring); a true ellipse has no 3 collinear
            // adjacent vertices → all 64 survive.
            expect(built.polygon).toHaveLength(64);

            const c = latLonToSceneXZ(centre, centre.lat, centre.lon); // → {0,0}
            // Every projected vertex satisfies the ellipse equation (x/rx)²+(z/ry)²≈1.
            for (const p of built.polygon) {
                const ex = (p.x - c.x) / rx;
                const ez = (p.z - c.z) / ry;
                expect(Math.abs(ex * ex + ez * ez - 1)).toBeLessThan(0.01);
            }
            // EXTENT — half-width along X ≈ rx, half-height along Z ≈ ry (within 0.5 %).
            let maxX = -Infinity, maxZ = -Infinity;
            for (const p of built.polygon) {
                maxX = Math.max(maxX, Math.abs(p.x - c.x));
                maxZ = Math.max(maxZ, Math.abs(p.z - c.z));
            }
            expect(Math.abs(maxX - rx)).toBeLessThan(rx * 0.005);
            expect(Math.abs(maxZ - ry)).toBeLessThan(ry * 0.005);

            // COUNTER-CLOCKWISE in scene XZ (positive signed area).
            const area = signedAreaXZ(built.polygon);
            expect(area).toBeGreaterThan(0);
            // AREA approaches π·rx·ry as the polygon → an ellipse (64-gon ~99.8 % of it).
            const ideal = Math.PI * rx * ry;
            expect(area).toBeGreaterThan(ideal * 0.99);
            expect(area).toBeLessThanOrEqual(ideal);
            // C19 §2.7 invariant: one classification per edge.
            expect(built.edgeClassifications).toHaveLength(built.polygon.length);
        });
    }

    it('reduces to a true circle when rx === ry', () => {
        const r = 40;
        const corners = ellipseCornersFromCentreRadii(centre, r, r, 64)!;
        const built = buildBoundaryFromLatLonRing(corners, centre.lat, centre.lon);
        const c = latLonToSceneXZ(centre, centre.lat, centre.lon);
        for (const p of built.polygon) {
            const d = Math.hypot(p.x - c.x, p.z - c.z);
            expect(Math.abs(d - r)).toBeLessThan(r * 0.005);
        }
    });
});

describe('ellipseAxisRadiusMetres (§ELLIPSE-BOUNDARY)', () => {
    const centre: LatLon = { lat: 0, lon: 0 };

    it('reads back the per-axis (X East / Z North) metric radius via the projection', () => {
        // A perimeter built at rx=40 / ry=12: the θ=0 point is the +X extreme (rx
        // East, 0 North); θ=π/2 (corner index 16 of 64) is the +Z extreme (ry North).
        const corners = ellipseCornersFromCentreRadii(centre, 40, 12, 64)!;
        // θ=0 → max East offset, ~0 North.
        expect(ellipseAxisRadiusMetres(centre, corners[0]!, 'x')).toBeCloseTo(40, 0);
        expect(ellipseAxisRadiusMetres(centre, corners[0]!, 'z')).toBeCloseTo(0, 1);
        // θ=π/2 (i=16) → ~0 East, max North offset.
        expect(ellipseAxisRadiusMetres(centre, corners[16]!, 'z')).toBeCloseTo(12, 0);
        expect(ellipseAxisRadiusMetres(centre, corners[16]!, 'x')).toBeCloseTo(0, 1);
    });

    it('returns 0 for non-finite input', () => {
        expect(ellipseAxisRadiusMetres(centre, { lat: NaN, lon: 0 }, 'x')).toBe(0);
        expect(ellipseAxisRadiusMetres({ lat: 0, lon: Infinity }, { lat: 1, lon: 1 }, 'z')).toBe(0);
    });
});

describe('fmtRadiiMetres (§ELLIPSE-BOUNDARY)', () => {
    it('formats both semi-axes with an Rx × Ry prefix', () => {
        expect(fmtRadiiMetres(20, 12.34)).toBe('Rx 20.0 × Ry 12.3 m');
        expect(fmtRadiiMetres(0, 0)).toBe('Rx 0.0 × Ry 0.0 m');
        // Defensive: non-finite / negative read as 0.0.
        expect(fmtRadiiMetres(-3, NaN)).toBe('Rx 0.0 × Ry 0.0 m');
    });
});

describe('snapRadiusToRound (§ELLIPSE-BOUNDARY)', () => {
    it('snaps to the nearest 0.5 m when within tolerance (matches the circle tool)', () => {
        expect(snapRadiusToRound(10.1)).toBe(10);
        expect(snapRadiusToRound(10.4)).toBe(10.5);
    });
    it('passes through non-finite / non-positive radii unchanged', () => {
        expect(snapRadiusToRound(0)).toBe(0);
        expect(snapRadiusToRound(-2)).toBe(-2);
        expect(Number.isNaN(snapRadiusToRound(NaN))).toBe(true);
    });
});
