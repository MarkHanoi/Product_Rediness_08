// §FEAT-FORMA-SEA-CONTEXT (L-185) — unit tests for the PURE coastline→sea-mask build. OSM
// open water is `natural=coastline` line work (land LEFT, water RIGHT of the way direction),
// never a closed polygon, so a waterfront site rendered no sea. These cover the stitch,
// bbox-clip, and water-side closing. No network / Cesium / DOM here.

import { describe, it, expect } from 'vitest';
import {
    stitchCoastlineWays,
    clipPolylineToBbox,
    buildSeaMaskFromCoastline,
} from '../src/ui/geospatial/contextWater';

type Pt = readonly [number, number];
const BBOX = [0, 0, 10, 10] as const; // [w,s,e,n]

function ringBounds(ring: ReadonlyArray<Pt>): { minx: number; maxx: number; miny: number; maxy: number } {
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (const [x, y] of ring) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
    return { minx, maxx, miny, maxy };
}

describe('§FEAT-FORMA-SEA-CONTEXT stitchCoastlineWays', () => {
    it('chains ways that share an endpoint into one polyline', () => {
        const a: Pt[] = [[0, 0], [1, 1]];
        const b: Pt[] = [[1, 1], [2, 2]];
        const stitched = stitchCoastlineWays([a, b]);
        expect(stitched).toHaveLength(1);
        expect(stitched[0]).toHaveLength(3);
        expect(stitched[0]![2]).toEqual([2, 2]);
    });

    it('reverses a way when needed to match head/tail', () => {
        const a: Pt[] = [[0, 0], [1, 1]];
        const b: Pt[] = [[2, 2], [1, 1]]; // shares (1,1) at its TAIL
        const stitched = stitchCoastlineWays([a, b]);
        expect(stitched).toHaveLength(1);
        expect(stitched[0]![2]).toEqual([2, 2]);
    });
});

describe('§FEAT-FORMA-SEA-CONTEXT clipPolylineToBbox', () => {
    it('clips an out→in→out line to a single boundary-touching strand', () => {
        const line: Pt[] = [[5, -2], [5, 12]]; // vertical, crosses south + north edges
        const strands = clipPolylineToBbox(line, BBOX);
        expect(strands).toHaveLength(1);
        const s = strands[0]!;
        expect(s[0]).toEqual([5, 0]);
        expect(s[s.length - 1]).toEqual([5, 10]);
    });
});

describe('§FEAT-FORMA-SEA-CONTEXT buildSeaMaskFromCoastline', () => {
    it('puts the sea on the RIGHT (east) of a northbound coastline', () => {
        // Coastline running NORTH through the bbox at x=5: land LEFT (west), water RIGHT (east).
        const rings = buildSeaMaskFromCoastline([[[5, -2], [5, 12]]], BBOX);
        expect(rings.length).toBeGreaterThanOrEqual(1);
        const b = ringBounds(rings[0]!);
        // Water half is the eastern rectangle [5..10] × [0..10].
        expect(b.minx).toBeCloseTo(5, 5);
        expect(b.maxx).toBeCloseTo(10, 5);
        expect(b.miny).toBeCloseTo(0, 5);
        expect(b.maxy).toBeCloseTo(10, 5);
    });

    it('flips the sea to the WEST for a southbound coastline (opposite orientation)', () => {
        const rings = buildSeaMaskFromCoastline([[[5, 12], [5, -2]]], BBOX);
        expect(rings.length).toBeGreaterThanOrEqual(1);
        const b = ringBounds(rings[0]!);
        expect(b.minx).toBeCloseTo(0, 5);
        expect(b.maxx).toBeCloseTo(5, 5);
    });

    it('returns no rings for an empty coastline set or a degenerate bbox', () => {
        expect(buildSeaMaskFromCoastline([], BBOX)).toEqual([]);
        expect(buildSeaMaskFromCoastline([[[5, -2], [5, 12]]], [0, 0, 0, 0])).toEqual([]);
    });
});
