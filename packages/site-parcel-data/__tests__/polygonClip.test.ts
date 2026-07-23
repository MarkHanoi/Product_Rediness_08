// C58 §2.2 (KG-4) — unit tests for the generic convex-clip polygon intersection.
//
// Synthetic rings only — zero jurisdiction fixtures. This proves the primitive is a plain
// geometry op (`polygonClip.ts`) with no knowledge of any city.

import { describe, it, expect } from 'vitest';
import type { Pt } from '@pryzm/schemas';
import { polygonArea } from '@pryzm/site-validators';
import { isConvexRing, clipPolygonToConvex } from '../src/geometry/polygonClip.js';

/** 10×10 square, CCW. */
const SQUARE: Pt[] = [
    { x: 0, z: 0 },
    { x: 10, z: 0 },
    { x: 10, z: 10 },
    { x: 0, z: 10 },
];

/** The same square wound CW. */
const SQUARE_CW: Pt[] = [...SQUARE].reverse();

/** A concave L-shape (6 vertices). */
const L_SHAPE: Pt[] = [
    { x: 0, z: 0 },
    { x: 10, z: 0 },
    { x: 10, z: 4 },
    { x: 4, z: 4 },
    { x: 4, z: 10 },
    { x: 0, z: 10 },
];

describe('isConvexRing', () => {
    it('is true for a square (either winding)', () => {
        expect(isConvexRing(SQUARE)).toBe(true);
        expect(isConvexRing(SQUARE_CW)).toBe(true);
    });

    it('is true for a triangle', () => {
        expect(isConvexRing([{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 3, z: 5 }])).toBe(true);
    });

    it('is false for a concave L-shape', () => {
        expect(isConvexRing(L_SHAPE)).toBe(false);
    });

    it('is false for fewer than three vertices', () => {
        expect(isConvexRing([])).toBe(false);
        expect(isConvexRing([{ x: 0, z: 0 }])).toBe(false);
        expect(isConvexRing([{ x: 0, z: 0 }, { x: 1, z: 1 }])).toBe(false);
    });

    it('is false for a fully-collinear (zero-area) ring', () => {
        expect(isConvexRing([{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }])).toBe(false);
    });

    it('ignores collinear vertices on an otherwise convex ring', () => {
        // A square with an extra midpoint vertex on one edge is still convex.
        const withMidpoint: Pt[] = [
            { x: 0, z: 0 }, { x: 5, z: 0 }, { x: 10, z: 0 },
            { x: 10, z: 10 }, { x: 0, z: 10 },
        ];
        expect(isConvexRing(withMidpoint)).toBe(true);
    });
});

describe('clipPolygonToConvex', () => {
    it('returns the subject when it lies wholly inside the clip', () => {
        const subject: Pt[] = [
            { x: 2, z: 2 }, { x: 6, z: 2 }, { x: 6, z: 6 }, { x: 2, z: 6 },
        ];
        const out = clipPolygonToConvex(subject, SQUARE);
        expect(polygonArea(out)).toBeCloseTo(16, 6); // 4×4
    });

    it('returns the clip when the clip lies wholly inside the subject', () => {
        const smallClip: Pt[] = [
            { x: 3, z: 3 }, { x: 7, z: 3 }, { x: 7, z: 7 }, { x: 3, z: 7 },
        ];
        const out = clipPolygonToConvex(SQUARE, smallClip);
        expect(polygonArea(out)).toBeCloseTo(16, 6); // the 4×4 clip
    });

    it('computes a partial overlap exactly', () => {
        // Subject offset +5,+5: overlap with the 10×10 square is a 5×5 corner.
        const subject: Pt[] = [
            { x: 5, z: 5 }, { x: 15, z: 5 }, { x: 15, z: 15 }, { x: 5, z: 15 },
        ];
        const out = clipPolygonToConvex(subject, SQUARE);
        expect(polygonArea(out)).toBeCloseTo(25, 6);
    });

    it('returns [] for no overlap', () => {
        const far: Pt[] = [
            { x: 100, z: 100 }, { x: 110, z: 100 }, { x: 110, z: 110 }, { x: 100, z: 110 },
        ];
        expect(clipPolygonToConvex(far, SQUARE)).toEqual([]);
    });

    it('clips a CONCAVE subject against a convex clip exactly', () => {
        // The L-shape (area = 100 − 36 = 64) clipped by a 5×5 square from the origin: the part of
        // the L inside x∈[0,5], z∈[0,5]. The L covers all of [0,4]×[0,10] and [4,10]×[0,4], so in
        // the 5×5 box it covers the full [0,4]×[0,5] (=20) plus [4,5]×[0,4] (=4) = 24.
        const clip: Pt[] = [
            { x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 5 }, { x: 0, z: 5 },
        ];
        const out = clipPolygonToConvex(L_SHAPE, clip);
        expect(polygonArea(out)).toBeCloseTo(24, 6);
    });

    it('is winding-agnostic — a CW clip gives the same region as CCW', () => {
        const subject: Pt[] = [
            { x: 5, z: 5 }, { x: 15, z: 5 }, { x: 15, z: 15 }, { x: 5, z: 15 },
        ];
        const ccw = clipPolygonToConvex(subject, SQUARE);
        const cw = clipPolygonToConvex(subject, SQUARE_CW);
        expect(polygonArea(cw)).toBeCloseTo(polygonArea(ccw), 6);
        expect(polygonArea(cw)).toBeCloseTo(25, 6);
    });

    it('handles a subject that shares a full edge with the clip (the alineación case)', () => {
        // Footprint shares the z=0 street edge with the parcel — the exact degeneracy a general
        // clipper chokes on. A 30×20 front band inside a 30×40 parcel keeps its 600 m².
        const parcel: Pt[] = [
            { x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 40 }, { x: 0, z: 40 },
        ];
        const band: Pt[] = [
            { x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 20 }, { x: 0, z: 20 },
        ];
        const out = clipPolygonToConvex(band, parcel);
        expect(polygonArea(out)).toBeCloseTo(600, 6);
    });

    it('returns [] on degenerate inputs', () => {
        expect(clipPolygonToConvex([], SQUARE)).toEqual([]);
        expect(clipPolygonToConvex(SQUARE, [])).toEqual([]);
    });

    it('is deterministic', () => {
        const subject: Pt[] = [
            { x: 5, z: 5 }, { x: 15, z: 5 }, { x: 15, z: 15 }, { x: 5, z: 15 },
        ];
        expect(JSON.stringify(clipPolygonToConvex(subject, SQUARE)))
            .toBe(JSON.stringify(clipPolygonToConvex(subject, SQUARE)));
    });
});
