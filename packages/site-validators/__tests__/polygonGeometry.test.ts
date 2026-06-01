// A.7.d (Phase A · Sprint 2) — Pure polygon geometry tests.

import { describe, expect, it } from 'vitest';
import {
    polygonArea,
    polygonSignedArea,
    pointInPolygon,
    pointSegmentDistance,
    pointPolygonEdgeDistance,
    polygonContains,
    polygonFingerprint,
} from '../src/polygonGeometry.js';

// ─────────────────────────────────────────────────────────────────────────────
// polygonArea / polygonSignedArea
// ─────────────────────────────────────────────────────────────────────────────

describe('polygonArea / polygonSignedArea', () => {
    it('returns 0 for empty / degenerate polygons', () => {
        expect(polygonArea([])).toBe(0);
        expect(polygonArea([{ x: 0, z: 0 }])).toBe(0);
        expect(
            polygonArea([
                { x: 0, z: 0 },
                { x: 1, z: 0 },
            ]),
        ).toBe(0);
    });

    it('computes 80 m² for a 10×8 rectangle', () => {
        expect(
            polygonArea([
                { x: 0, z: 0 },
                { x: 10, z: 0 },
                { x: 10, z: 8 },
                { x: 0, z: 8 },
            ]),
        ).toBe(80);
    });

    it('is winding-invariant', () => {
        const ccw = polygonArea([
            { x: 0, z: 0 },
            { x: 10, z: 0 },
            { x: 10, z: 8 },
            { x: 0, z: 8 },
        ]);
        const cw = polygonArea([
            { x: 0, z: 0 },
            { x: 0, z: 8 },
            { x: 10, z: 8 },
            { x: 10, z: 0 },
        ]);
        expect(ccw).toBe(cw);
    });

    it('handles triangles', () => {
        expect(
            polygonArea([
                { x: 0, z: 0 },
                { x: 4, z: 0 },
                { x: 0, z: 3 },
            ]),
        ).toBe(6);
    });

    it('signed area is positive for CCW and negative for CW (right-handed XZ)', () => {
        const ccw = polygonSignedArea([
            { x: 0, z: 0 },
            { x: 10, z: 0 },
            { x: 10, z: 8 },
            { x: 0, z: 8 },
        ]);
        const cw = polygonSignedArea([
            { x: 0, z: 0 },
            { x: 0, z: 8 },
            { x: 10, z: 8 },
            { x: 10, z: 0 },
        ]);
        expect(ccw).toBeGreaterThan(0);
        expect(cw).toBeLessThan(0);
        expect(Math.abs(ccw)).toBe(Math.abs(cw));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// pointInPolygon
// ─────────────────────────────────────────────────────────────────────────────

describe('pointInPolygon', () => {
    const rect = [
        { x: 0, z: 0 },
        { x: 10, z: 0 },
        { x: 10, z: 8 },
        { x: 0, z: 8 },
    ];

    it('accepts an interior point', () => {
        expect(pointInPolygon({ x: 5, z: 4 }, rect)).toBe(true);
    });

    it('rejects a clearly-outside point', () => {
        expect(pointInPolygon({ x: 15, z: 4 }, rect)).toBe(false);
        expect(pointInPolygon({ x: -1, z: 4 }, rect)).toBe(false);
    });

    it('returns false for degenerate polygon', () => {
        expect(pointInPolygon({ x: 5, z: 4 }, [])).toBe(false);
        expect(pointInPolygon({ x: 5, z: 4 }, [{ x: 0, z: 0 }])).toBe(false);
    });

    it('works on a concave (L-shape) polygon', () => {
        const lShape = [
            { x: 0, z: 0 },
            { x: 10, z: 0 },
            { x: 10, z: 5 },
            { x: 6, z: 5 },
            { x: 6, z: 8 },
            { x: 0, z: 8 },
        ];
        expect(pointInPolygon({ x: 3, z: 6 }, lShape)).toBe(true);
        expect(pointInPolygon({ x: 8, z: 6 }, lShape)).toBe(false);  // notch
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// pointSegmentDistance + pointPolygonEdgeDistance
// ─────────────────────────────────────────────────────────────────────────────

describe('pointSegmentDistance', () => {
    it('distance to segment endpoint', () => {
        expect(
            pointSegmentDistance(
                { x: -1, z: 0 },
                { x: 0, z: 0 },
                { x: 10, z: 0 },
            ),
        ).toBe(1);
    });

    it('perpendicular distance to segment midpoint', () => {
        expect(
            pointSegmentDistance(
                { x: 5, z: 3 },
                { x: 0, z: 0 },
                { x: 10, z: 0 },
            ),
        ).toBe(3);
    });

    it('returns 0 for point exactly on segment', () => {
        expect(
            pointSegmentDistance(
                { x: 5, z: 0 },
                { x: 0, z: 0 },
                { x: 10, z: 0 },
            ),
        ).toBe(0);
    });

    it('handles degenerate (zero-length) segments', () => {
        expect(
            pointSegmentDistance(
                { x: 3, z: 4 },
                { x: 0, z: 0 },
                { x: 0, z: 0 },
            ),
        ).toBe(5);
    });
});

describe('pointPolygonEdgeDistance', () => {
    const rect = [
        { x: 0, z: 0 },
        { x: 10, z: 0 },
        { x: 10, z: 8 },
        { x: 0, z: 8 },
    ];

    it('returns the distance to the nearest edge for an interior point', () => {
        expect(pointPolygonEdgeDistance({ x: 5, z: 1 }, rect)).toBe(1);
        expect(pointPolygonEdgeDistance({ x: 1, z: 4 }, rect)).toBe(1);
    });

    it('returns Infinity for degenerate polygons', () => {
        expect(pointPolygonEdgeDistance({ x: 0, z: 0 }, [])).toBe(
            Number.POSITIVE_INFINITY,
        );
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// polygonContains
// ─────────────────────────────────────────────────────────────────────────────

describe('polygonContains', () => {
    const outerRect = [
        { x: 0, z: 0 },
        { x: 10, z: 0 },
        { x: 10, z: 8 },
        { x: 0, z: 8 },
    ];

    it('returns true when every inner vertex is inside outer', () => {
        const inner = [
            { x: 2, z: 2 },
            { x: 8, z: 2 },
            { x: 8, z: 6 },
            { x: 2, z: 6 },
        ];
        expect(polygonContains(outerRect, inner)).toBe(true);
    });

    it('returns false when even one inner vertex is outside', () => {
        const partlyOutside = [
            { x: 2, z: 2 },
            { x: 12, z: 2 },        // X = 12 > 10 → outside
            { x: 12, z: 6 },
            { x: 2, z: 6 },
        ];
        expect(polygonContains(outerRect, partlyOutside)).toBe(false);
    });

    it('returns true for empty inner polygon (trivial)', () => {
        expect(polygonContains(outerRect, [])).toBe(true);
    });

    it('returns false for degenerate outer polygon', () => {
        expect(polygonContains([], [{ x: 1, z: 1 }])).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// polygonFingerprint (C19 §1.4 polygon-immutability)
// ─────────────────────────────────────────────────────────────────────────────

describe('polygonFingerprint', () => {
    it('returns empty string for empty polygon', () => {
        expect(polygonFingerprint([])).toBe('');
    });

    it('is deterministic for the same polygon', () => {
        const poly = [
            { x: 0, z: 0 },
            { x: 10, z: 0 },
            { x: 10, z: 8 },
        ];
        expect(polygonFingerprint(poly)).toBe(polygonFingerprint(poly));
    });

    it('changes when any vertex is mutated', () => {
        const a = polygonFingerprint([
            { x: 0, z: 0 },
            { x: 10, z: 0 },
            { x: 10, z: 8 },
        ]);
        const b = polygonFingerprint([
            { x: 0, z: 0 },
            { x: 10, z: 0 },
            { x: 10, z: 9 }, // z mutated
        ]);
        expect(a).not.toBe(b);
    });

    it('is order-sensitive (rotated polygon → different fingerprint per C19 §1.4 semantics)', () => {
        const a = polygonFingerprint([
            { x: 0, z: 0 },
            { x: 10, z: 0 },
            { x: 10, z: 8 },
        ]);
        const b = polygonFingerprint([
            { x: 10, z: 0 },
            { x: 10, z: 8 },
            { x: 0, z: 0 },
        ]);
        expect(a).not.toBe(b);
    });

    it('uses lossless number rendering (sub-millimetre precision preserved)', () => {
        const a = polygonFingerprint([{ x: 0.123456789, z: 0 }]);
        expect(a).toContain('0.123456789');
    });
});
