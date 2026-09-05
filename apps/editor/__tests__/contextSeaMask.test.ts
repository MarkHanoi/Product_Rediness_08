// §FEAT-FORMA-SEA-CONTEXT (L-185) · §SEA-LEFT-HAND-WALK (L-12911) — unit tests for the PURE
// coastline→sea-mask build. OSM open water is `natural=coastline` line work (land LEFT, water RIGHT
// of the way direction), never a closed polygon, so a waterfront site rendered no sea. These cover
// the stitch, bbox-clip, and the water-side walk. No network / Cesium / DOM here.
//
// ⚠ HISTORY. Until L-12911 the stitch REVERSED a way to make a tail↔tail join, and the closing
// picked the water side per strand against the bbox centre. Both were removed on purpose (see the
// §SEA-LEFT-HAND-WALK header in contextWater.ts): at Sète — the Mediterranean and the Étang de
// Thau are both `natural=coastline`, town on the spit between them — the flooded side flipped with
// the click. The two tests that pinned the old behaviour were rewritten below to pin the new rule;
// they did not "break", the rule changed.

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    stitchCoastlineWays,
    clipPolylineToBbox,
    buildSeaMask,
    buildSeaMaskFromCoastline,
} from '../src/ui/geospatial/contextWater';

type Pt = readonly [number, number];
type Bbox = readonly [number, number, number, number];
const BBOX = [0, 0, 10, 10] as const; // [w,s,e,n]

function ringBounds(ring: ReadonlyArray<Pt>): { minx: number; maxx: number; miny: number; maxy: number } {
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (const [x, y] of ring) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
    return { minx, maxx, miny, maxy };
}

/** Even-odd point-in-ring, local to the test so the assertion does not trust the subject's own. */
function inside(p: Pt, ring: ReadonlyArray<Pt>): boolean {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
        if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
}

function absArea(ring: ReadonlyArray<Pt>): number {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j]![0] * ring[i]![1] - ring[i]![0] * ring[j]![1];
    return Math.abs(a / 2);
}

describe('§FEAT-FORMA-SEA-CONTEXT stitchCoastlineWays', () => {
    it('chains ways that share an endpoint (tail → head) into one polyline', () => {
        const a: Pt[] = [[0, 0], [1, 1]];
        const b: Pt[] = [[1, 1], [2, 2]];
        const stitched = stitchCoastlineWays([a, b]);
        expect(stitched).toHaveLength(1);
        expect(stitched[0]).toHaveLength(3);
        expect(stitched[0]![2]).toEqual([2, 2]);
    });

    it('§SEA-LEFT-HAND-WALK — does NOT reverse a way to force a tail↔tail join; orientation is data', () => {
        // Before L-12911 this test asserted ONE chain. Reversing `b` would hand the walk a 50 % chance
        // of painting the land blue with nothing in the data to say so; the two stay separate and
        // their free ends are refused downstream as `incomplete-coastline`.
        const a: Pt[] = [[0, 0], [1, 1]];
        const b: Pt[] = [[2, 2], [1, 1]]; // shares (1,1) at its TAIL — a broken orientation
        const stitched = stitchCoastlineWays([a, b]);
        expect(stitched).toHaveLength(2);
        expect(stitched.map((c) => c.length)).toEqual([2, 2]);
    });

    it('starts chains at true heads, so one coastline never splits because the scan began mid-way', () => {
        const mid: Pt[] = [[1, 1], [2, 2]];
        const first: Pt[] = [[0, 0], [1, 1]];
        const last: Pt[] = [[2, 2], [3, 3]];
        const stitched = stitchCoastlineWays([mid, last, first]); // deliberately not in order
        expect(stitched).toHaveLength(1);
        expect(stitched[0]![0]).toEqual([0, 0]);
        expect(stitched[0]![stitched[0]!.length - 1]).toEqual([3, 3]);
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

describe('§FEAT-FORMA-SEA-CONTEXT buildSeaMaskFromCoastline — one coast', () => {
    afterEach(() => vi.restoreAllMocks());

    it('puts the sea on the RIGHT (east) of a northbound coastline', () => {
        // Coastline running NORTH through the bbox at x=6: land LEFT (west, where the site at the
        // bbox centre (5,5) is), water RIGHT (east).
        const rings = buildSeaMaskFromCoastline([[[6, -2], [6, 12]]], BBOX);
        expect(rings).toHaveLength(1);
        const b = ringBounds(rings[0]!);
        expect(b.minx).toBeCloseTo(6, 5);
        expect(b.maxx).toBeCloseTo(10, 5);
        expect(b.miny).toBeCloseTo(0, 5);
        expect(b.maxy).toBeCloseTo(10, 5);
        expect(inside([5, 5], rings[0]!)).toBe(false);
    });

    it('flips the sea to the WEST for a southbound coastline (opposite orientation)', () => {
        const rings = buildSeaMaskFromCoastline([[[4, 12], [4, -2]]], BBOX);
        expect(rings).toHaveLength(1);
        const b = ringBounds(rings[0]!);
        expect(b.minx).toBeCloseTo(0, 5);
        expect(b.maxx).toBeCloseTo(4, 5);
        expect(inside([5, 5], rings[0]!)).toBe(false);
    });

    it('a site exactly ON the shoreline is not "in the water": the ring is kept, not refused as land-centre', () => {
        // The bbox centre (5,5) lies on the coast at x=5. Even-odd on a boundary point is arbitrary;
        // the guard exempts it (the pre-L-12911 `dCentre > eps` arm), so the honest east half draws.
        const r = buildSeaMask([[[5, -2], [5, 12]]], BBOX);
        expect(r.refused).toEqual([]);
        expect(r.rings).toHaveLength(1);
        expect(ringBounds(r.rings[0]!).minx).toBeCloseTo(5, 5);
    });

    it('returns no rings for an empty coastline set or a degenerate bbox', () => {
        expect(buildSeaMaskFromCoastline([], BBOX)).toEqual([]);
        expect(buildSeaMaskFromCoastline([[[5, -2], [5, 12]]], [0, 0, 0, 0])).toEqual([]);
    });
});

describe('§SEA-LEFT-HAND-WALK (L-12911) — Sète: two coastlines, town on the spit between them', () => {
    afterEach(() => vi.restoreAllMocks());

    // The Mediterranean shore runs NORTH at x=8 (water east of it); the Étang de Thau shore runs
    // SOUTH at x=2 (water on its right = WEST of it). The town — and the click — sit at x∈(2,8).
    const SEA: Pt[] = [[8, -2], [8, 12]];
    const LAGOON: Pt[] = [[2, 12], [2, -2]];
    // Three bboxes around the town, so the flooded side cannot "depend where you select".
    const BBOXES: Bbox[] = [[0, 0, 10, 10], [0, 2, 10, 8], [1, 1, 9, 9]];

    it('the town centre is inside NO water ring, for every bbox, and each ring lies on its own coast\'s water side', () => {
        for (const bbox of BBOXES) {
            const centre: Pt = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
            const r = buildSeaMask([SEA, LAGOON], bbox);
            expect(r.refused, JSON.stringify(bbox)).toEqual([]);
            expect(r.rings, JSON.stringify(bbox)).toHaveLength(2);
            for (const ring of r.rings) {
                expect(inside(centre, ring), `bbox ${JSON.stringify(bbox)} — the town is under water`).toBe(false);
                const b = ringBounds(ring);
                const onSeaSide = b.minx >= 8 - 1e-9;
                const onLagoonSide = b.maxx <= 2 + 1e-9;
                expect(onSeaSide || onLagoonSide, `ring spans the spit: ${JSON.stringify(b)}`).toBe(true);
            }
            // Both water bodies are drawn: exactly (2 + 2) units wide × the bbox height.
            const width = (bbox[2] - bbox[0]);
            const height = (bbox[3] - bbox[1]);
            const water = r.rings.reduce((a, ring) => a + absArea(ring), 0);
            const expected = ((8 - Math.max(8, bbox[0]) + (bbox[2] - 8)) + (Math.min(2, bbox[2]) - bbox[0])) * height;
            expect(water, `water area for ${JSON.stringify(bbox)}`).toBeCloseTo(expected, 6);
            expect(water / (width * height)).toBeLessThan(0.5);
        }
    });

    it('two coastlines that DISAGREE about the water side are refused as orientation-conflict, not drawn', () => {
        // Both northbound → both claim water to their EAST; the strip between them is claimed as
        // water by one and land by the other. A reversed way in the data, and nothing is drawn.
        const r = buildSeaMask([[[2, -2], [2, 12]], [[8, -2], [8, 12]]], BBOX);
        expect(r.rings).toEqual([]);
        expect(r.refused.map((x) => x.reason)).toContain('orientation-conflict');
    });

    it('a coastline that ENDS inside the bbox is refused as incomplete-coastline — the water side of a missing piece is unknowable', () => {
        const r = buildSeaMask([[[5, -2], [5, 5]]], BBOX);
        expect(r.rings).toEqual([]);
        expect(r.refused).toHaveLength(1);
        expect(r.refused[0]!.reason).toBe('incomplete-coastline');
        expect(r.refused[0]!.detail).toMatch(/1 coastline end\(s\) lie strictly inside the bbox/);
    });

    it('the production wrapper logs ONE console line per refusal reason and returns the kept rings', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const rings = buildSeaMaskFromCoastline([[[5, -2], [5, 5]]], BBOX);
        expect(rings).toEqual([]);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]![0])).toMatch(/§SEA-LEFT-HAND-WALK \(L-12911\) sea mask REFUSED \(incomplete-coastline\)/);
    });

    it('a closed coastline loop entirely inside the bbox is decided by its winding: CW = enclosed water, CCW = island', () => {
        const cw: Pt[] = [[4, 4], [4, 6], [6, 6], [6, 4], [4, 4]];    // clockwise in (x east, y north) → water inside
        const ccw: Pt[] = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];   // counter-clockwise → land (an island)
        const lake = buildSeaMask([cw], [0, 0, 10, 10]);
        expect(lake.rings).toHaveLength(1);
        expect(lake.islands).toBe(0);
        const island = buildSeaMask([ccw], [0, 0, 10, 10]);
        expect(island.rings).toHaveLength(0);
        expect(island.islands).toBe(1);
    });
});
