// A.8.f — pure Site Inspector read-model helper tests.
//
// Covers the shoelace area (incl. winding-independence + store-area
// preference), the display summary derivation, and the thumbnail path math.

import { describe, it, expect } from 'vitest';
import {
    polygonAreaXZ,
    summarizeSite,
    boundaryThumbnailPath,
} from '../src/ui/site/siteInspectorData';

// A 20m × 10m rectangle in scene-XZ metres → 200 m².
const RECT = [
    { x: 0, z: 0 },
    { x: 20, z: 0 },
    { x: 20, z: 10 },
    { x: 0, z: 10 },
];

describe('polygonAreaXZ (shoelace)', () => {
    it('computes a rectangle area', () => {
        expect(polygonAreaXZ(RECT)).toBeCloseTo(200, 6);
    });

    it('is winding-independent (CW gives the same absolute area)', () => {
        const cw = [...RECT].reverse();
        expect(polygonAreaXZ(cw)).toBeCloseTo(200, 6);
    });

    it('returns 0 for degenerate rings (< 3 vertices)', () => {
        expect(polygonAreaXZ([])).toBe(0);
        expect(polygonAreaXZ([{ x: 1, z: 1 }])).toBe(0);
        expect(polygonAreaXZ([{ x: 0, z: 0 }, { x: 1, z: 1 }])).toBe(0);
    });

    it('tolerates a closing duplicate vertex (zero-length term)', () => {
        expect(polygonAreaXZ([...RECT, { x: 0, z: 0 }])).toBeCloseTo(200, 6);
    });
});

describe('summarizeSite', () => {
    it('reports no site when both location and boundary are null', () => {
        const s = summarizeSite(null, null);
        expect(s.hasSite).toBe(false);
        expect(s.vertexCount).toBe(0);
        expect(s.areaM2).toBe(0);
        expect(s.address).toBeNull();
    });

    it('extracts address + lat/lon from the location', () => {
        const s = summarizeSite(
            { latitude: 51.5, longitude: -0.13, siteAddress: '10 Downing St' },
            null,
        );
        expect(s.hasSite).toBe(true);
        expect(s.address).toBe('10 Downing St');
        expect(s.latitude).toBe(51.5);
        expect(s.longitude).toBe(-0.13);
    });

    it('prefers the store-computed area over the shoelace fallback', () => {
        const s = summarizeSite(null, { polygon: RECT }, 999);
        expect(s.areaM2).toBe(999);
    });

    it('falls back to shoelace area when the store area is absent or zero', () => {
        expect(summarizeSite(null, { polygon: RECT }).areaM2).toBeCloseTo(200, 6);
        expect(summarizeSite(null, { polygon: RECT }, 0).areaM2).toBeCloseTo(200, 6);
    });

    it('counts boundary vertices and frontage edges', () => {
        const s = summarizeSite(null, {
            polygon: RECT,
            edgeClassifications: ['front', 'side', 'rear', 'side'],
        });
        expect(s.vertexCount).toBe(4);
        expect(s.frontageEdges).toBe(1);
    });

    it('converts trueNorth radians to degrees', () => {
        const s = summarizeSite({ trueNorth: Math.PI / 2 }, null);
        expect(s.trueNorthDeg).toBeCloseTo(90, 6);
    });

    it('treats an empty address string as null', () => {
        const s = summarizeSite({ siteAddress: '' }, null);
        expect(s.address).toBeNull();
    });
});

describe('boundaryThumbnailPath', () => {
    it('returns null for degenerate rings', () => {
        expect(boundaryThumbnailPath([])).toBeNull();
        expect(boundaryThumbnailPath([{ x: 0, z: 0 }, { x: 1, z: 1 }])).toBeNull();
    });

    it('builds a closed path within the unit box', () => {
        const d = boundaryThumbnailPath(RECT, 1);
        expect(d).not.toBeNull();
        expect(d!.startsWith('M')).toBe(true);
        expect(d!.endsWith('Z')).toBe(true);
        // Every coordinate is inside [0,1].
        const nums = d!.match(/-?\d+\.\d+/g)!.map(Number);
        for (const n of nums) {
            expect(n).toBeGreaterThanOrEqual(0);
            expect(n).toBeLessThanOrEqual(1);
        }
    });
});
