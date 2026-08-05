// §CTX-RING-SANITIZE (L-663, 2026-08-05) — regression + repair tests for the context-building ring
// sanitizer. See `../contextRingGeometry.ts` header for the full defect trace (founder-reported
// triangular void, Córdoba, Calle de la Previsión).

import { describe, it, expect } from 'vitest';
import { sanitizeRing } from '../contextRingGeometry';

// Reference point near the founder's Córdoba site (Calle de la Previsión, ~37.879°N).
const REF_LAT = 37.879;
const REF_LON = -4.79;
const METRES_PER_DEG_LAT = 111_320;
const LON_SCALE = Math.cos((REF_LAT * Math.PI) / 180) * METRES_PER_DEG_LAT;

/** Local ENU metre offset (east, north) from the reference point → [lon, lat]. Keeps every test
 *  ring at REAL building scale (metres), matching how sanitizeRing's own epsilons are derived. */
function ll(eastM: number, northM: number): [number, number] {
    return [REF_LON + eastM / LON_SCALE, REF_LAT + northM / METRES_PER_DEG_LAT];
}

/** A clean 10 m × 6 m rectangle, closed GeoJSON-style. */
const CLEAN_RECT: number[][] = [
    ll(0, 0),
    ll(10, 0),
    ll(10, 6),
    ll(0, 6),
    ll(0, 0), // closing point
];

describe('sanitizeRing — regression: a clean simple ring is left alone', () => {
    it('does not alter a well-formed rectangular footprint', () => {
        const out = sanitizeRing(CLEAN_RECT);
        expect(out).toEqual(CLEAN_RECT);
    });

    it('does not alter a well-formed L-shaped (concave) footprint', () => {
        // A real concave building outline (10 m × 10 m with a 5 m × 5 m corner notch) — must survive
        // collinearity-pruning unchanged, since none of its interior angles are actually straight.
        const lShape: number[][] = [
            ll(0, 0),
            ll(10, 0),
            ll(10, 5),
            ll(5, 5),
            ll(5, 10),
            ll(0, 10),
            ll(0, 0),
        ];
        expect(sanitizeRing(lShape)).toEqual(lShape);
    });
});

describe('sanitizeRing — repair: near-duplicate consecutive vertices', () => {
    it('collapses a vertex sitting a couple of millimetres from its neighbour (quantisation noise)', () => {
        // Insert a near-duplicate point ~2 mm from the second corner — smaller than any real
        // building-corner spacing, the exact scale of MVT dequantisation float noise.
        const c1 = CLEAN_RECT[1]!;
        const withNoise: number[][] = [
            CLEAN_RECT[0]!,
            c1,
            [c1[0]! + 0.002 / LON_SCALE, c1[1]! + 0.002 / METRES_PER_DEG_LAT], // ~2 mm away
            CLEAN_RECT[2]!,
            CLEAN_RECT[3]!,
            CLEAN_RECT[4]!,
        ];
        const out = sanitizeRing(withNoise);
        // The near-duplicate must be gone; the ring must still close and stay a valid quadrilateral.
        expect(out.length).toBe(5); // 4 distinct corners + closing point
        expect(out[out.length - 1]).toEqual(out[0]);
    });

    it('never collapses a ring below a valid triangle — bails out to the original on pathological input', () => {
        // Every vertex is a near-duplicate of the first — sanitizing "correctly" would destroy the
        // ring entirely, so the function must return the ORIGINAL input unchanged instead.
        const p = ll(0, 0);
        const degenerate: number[][] = [
            p,
            [p[0]! + 0.001 / LON_SCALE, p[1]!],
            [p[0]! + 0.002 / LON_SCALE, p[1]!],
            p,
        ];
        const out = sanitizeRing(degenerate);
        expect(out).toEqual(degenerate);
    });
});

describe('sanitizeRing — repair: near-collinear vertices (the earcut "lost ear" defect class)', () => {
    it('removes an interior vertex sitting ~1 cm off the line between its neighbours', () => {
        // A vertex on the top edge nudged 1 cm off the straight line — exactly the near-zero-area
        // collinearity that earcut's own exact-zero `filterPoints` check does NOT catch, and which
        // can produce a spurious "ear" triangle removed from the render (a visible notch).
        const nearCollinear: number[][] = [
            ll(0, 0),
            ll(5, 0.01), // 1 cm north of the straight 0→10 m top edge
            ll(10, 0),
            ll(10, 10),
            ll(0, 10),
            ll(0, 0),
        ];
        const out = sanitizeRing(nearCollinear);
        // The nudged vertex should be pruned — back down to a clean rectangle (4 corners + close).
        expect(out.length).toBe(5);
        expect(out.some((p) => Math.abs(p[0]! - ll(5, 0.01)[0]!) < 1e-12)).toBe(false);
    });

    it('keeps a vertex that is a REAL (non-trivial) corner, even a shallow one', () => {
        // A genuine shallow-angle corner — 0.5 m off the line over a 10 m span is a real building
        // feature, not noise (twice-area ≈ 5 m², far above the ~0.02 m² noise floor), and must
        // survive.
        const shallowCornerX = ll(5, 0.5)[0]!;
        const shallowCorner: number[][] = [
            ll(0, 0),
            ll(5, 0.5),
            ll(10, 0),
            ll(10, 10),
            ll(0, 10),
            ll(0, 0),
        ];
        const out = sanitizeRing(shallowCorner);
        expect(out.some((p) => Math.abs(p[0]! - shallowCornerX) < 1e-12)).toBe(true);
    });
});

describe('sanitizeRing — never throws, never returns an invalid ring', () => {
    it('passes through short/empty input untouched', () => {
        expect(sanitizeRing([])).toEqual([]);
        const tiny = [ll(0, 0), ll(1, 1), ll(0, 0)];
        expect(sanitizeRing(tiny)).toEqual(tiny);
    });

    it('always returns a closed ring (first === last) when it repairs anything', () => {
        const c1 = ll(10, 0);
        const withNoise: number[][] = [
            ll(0, 0),
            c1,
            [c1[0]! + 0.003 / LON_SCALE, c1[1]! + 0.003 / METRES_PER_DEG_LAT],
            ll(10, 10),
            ll(0, 10),
            ll(0, 0),
        ];
        const out = sanitizeRing(withNoise);
        expect(out[0]).toEqual(out[out.length - 1]);
        expect(out.length).toBeGreaterThanOrEqual(4);
    });
});
