// §FILLET-BOUNDARY — pure tangent-arc corner fillet tests.
//
// Asserts the pure helper in a TRUE metric frame (via the boundary projection): a
// rounded corner must (1) produce an arc whose points all sit at the requested
// radius from a single arc centre, (2) be TANGENT to the two adjacent edges (the end
// points lie ON the edges, within the clamp), (3) CLAMP a too-big radius so the arc
// fits without overrunning the edges, and (4) degrade to an empty arc on collinear /
// degenerate input so the caller keeps the original corner.

import { describe, it, expect } from 'vitest';
import {
    filletCornerArc,
    maxFilletRadiusMetres,
    fmtFilletRadiusMetres,
    DEFAULT_FILLET_SEGMENTS,
} from '../src/ui/geospatial/filletBoundary';
import { latLonToSceneXZ, type LatLon } from '../src/ui/site/boundaryProjection';

// A right-angle corner near the equator (so 1° lon ≈ 1° lat in metres). The corner
// C is at the origin; prev P is due North, next Q is due East — a clean 90° corner of
// a large rectangle, with long edges so the fillet has room.
// ~111 m per 0.001° at the equator — make each edge ~100 m long.
const M_PER_DEG = 111_320; // ≈ R·π/180
const d100 = 100 / M_PER_DEG;
const corner: LatLon = { lat: 0, lon: 0 };
const prev: LatLon = { lat: d100, lon: 0 };   // 100 m North
const next: LatLon = { lat: 0, lon: d100 };   // 100 m East

/** Project a lat/lon to metric XZ about the corner (the helper's frame). */
function xz(p: LatLon): { x: number; z: number } {
    return latLonToSceneXZ(p, corner.lat, corner.lon);
}

describe('filletCornerArc (§FILLET-BOUNDARY)', () => {
    it('rounds a 90° corner into an arc of constant radius from a single centre', () => {
        const r = 20;
        const { arc, radiusUsed } = filletCornerArc(prev, corner, next, r);
        expect(arc.length).toBe(DEFAULT_FILLET_SEGMENTS + 1); // segs+1 points
        expect(radiusUsed).toBeCloseTo(r, 5); // 20 m fits within 100 m edges → no clamp.

        // For a 90° corner with edges N and E, the fillet centre sits at (r, -r) in XZ
        // (East = +x, North = -z), i.e. inside the rectangle. Every arc point is r away.
        const C = xz(corner);
        const cx = C.x + r;   // East by r
        const cz = C.z - r;   // North by r (North = -z)
        for (const p of arc) {
            const q = xz(p);
            const dist = Math.hypot(q.x - cx, q.z - cz);
            expect(Math.abs(dist - r)).toBeLessThan(0.05); // within 5 cm.
        }
    });

    it('is tangent to both edges — the arc endpoints lie ON the two edges', () => {
        const r = 20;
        const { arc } = filletCornerArc(prev, corner, next, r);
        const first = xz(arc[0]!);
        const last = xz(arc[arc.length - 1]!);
        // Edges from the corner: toward prev (North, -z axis) and toward next (East,
        // +x axis). One endpoint is on the North edge (x ≈ 0), the other on the East
        // edge (z ≈ 0); the tangent length is r for a 90° corner.
        const onNorth = (p: { x: number; z: number }) => Math.abs(p.x) < 0.05 && p.z <= 0.01;
        const onEast = (p: { x: number; z: number }) => Math.abs(p.z) < 0.05 && p.x >= -0.01;
        expect((onNorth(first) && onEast(last)) || (onEast(first) && onNorth(last))).toBe(true);
        // Tangent length = r for a 90° corner.
        const tangent = onNorth(first) ? Math.abs(first.z) : Math.abs(first.x);
        expect(tangent).toBeCloseTo(r, 1);
    });

    it('clamps a too-big radius so the arc fits within the edges (no self-intersection)', () => {
        // Edges are 100 m; EDGE_FRACTION 0.5 → tangent capped at 50 m. For a 90° corner
        // tangent t = r (tan45°=1), so rMax = 50 m. Ask for 500 m → clamp to ~50 m.
        const rMax = maxFilletRadiusMetres(prev, corner, next);
        expect(rMax).toBeCloseTo(50, 0);
        const { arc, radiusUsed } = filletCornerArc(prev, corner, next, 500);
        expect(radiusUsed).toBeCloseTo(50, 0);
        expect(radiusUsed).toBeLessThan(500);
        // Tangent points must not overrun the 100 m edges (t = 50 ≤ 100). Check every
        // arc point stays within the corner's edge box.
        for (const p of arc) {
            const q = xz(p);
            expect(q.x).toBeGreaterThanOrEqual(-0.01); // not past the corner on East
            expect(q.x).toBeLessThanOrEqual(100 + 0.5); // not past prev/next extent
            expect(q.z).toBeLessThanOrEqual(0.01);      // North side (z ≤ 0)
            expect(q.z).toBeGreaterThanOrEqual(-(100 + 0.5));
        }
    });

    it('returns an empty arc for collinear edges (no real corner to round)', () => {
        // prev North, next South → 180° straight line through the corner.
        const south: LatLon = { lat: -d100, lon: 0 };
        const { arc, radiusUsed } = filletCornerArc(prev, corner, south, 10);
        expect(arc).toHaveLength(0);
        expect(radiusUsed).toBe(0);
    });

    it('returns an empty arc for degenerate / non-positive / non-finite input', () => {
        expect(filletCornerArc(prev, corner, next, 0).arc).toHaveLength(0);
        expect(filletCornerArc(prev, corner, next, -5).arc).toHaveLength(0);
        expect(filletCornerArc(prev, corner, next, NaN).arc).toHaveLength(0);
        expect(filletCornerArc({ lat: NaN, lon: 0 }, corner, next, 10).arc).toHaveLength(0);
        // Zero-length edge (prev === corner).
        expect(filletCornerArc(corner, corner, next, 10).arc).toHaveLength(0);
    });

    it('honours a custom segment count (≥ 1 segment → ≥ 2 points)', () => {
        expect(filletCornerArc(prev, corner, next, 10, 4).arc).toHaveLength(5);
        expect(filletCornerArc(prev, corner, next, 10, 1).arc).toHaveLength(2);
        expect(filletCornerArc(prev, corner, next, 10, 0).arc).toHaveLength(2); // clamped to ≥1
    });
});

describe('maxFilletRadiusMetres (§FILLET-BOUNDARY)', () => {
    it('is 0 for a collinear / degenerate corner', () => {
        const south: LatLon = { lat: -d100, lon: 0 };
        expect(maxFilletRadiusMetres(prev, corner, south)).toBe(0);
        expect(maxFilletRadiusMetres(corner, corner, next)).toBe(0); // zero edge
        expect(maxFilletRadiusMetres({ lat: NaN, lon: 0 }, corner, next)).toBe(0);
    });
    it('scales with the shorter adjacent edge', () => {
        // Shorten the East edge to 40 m → tangent cap 20 m → rMax 20 m (90° corner).
        const shortNext: LatLon = { lat: 0, lon: 40 / M_PER_DEG };
        expect(maxFilletRadiusMetres(prev, corner, shortNext)).toBeCloseTo(20, 0);
    });
});

describe('fmtFilletRadiusMetres (§FILLET-BOUNDARY)', () => {
    it('formats with a Fillet prefix to one decimal', () => {
        expect(fmtFilletRadiusMetres(2.5)).toBe('Fillet 2.5 m');
        expect(fmtFilletRadiusMetres(0)).toBe('Fillet 0.0 m');
        expect(fmtFilletRadiusMetres(-1)).toBe('Fillet 0.0 m');
        expect(fmtFilletRadiusMetres(NaN)).toBe('Fillet 0.0 m');
    });
});
