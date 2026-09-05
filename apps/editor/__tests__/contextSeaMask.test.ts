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
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// §SEA-MARSEILLE-BASIN — the baked-tile reader is mocked so `fetchContextWater` can be driven with the
// Marseille fixture AS IF it were baked coastline: the test below pins what VALUE the viewport receives
// when the bake is fragmented. Hoisted, because `vi.mock` factories run above the imports.
const tileMock = vi.hoisted(() => ({ features: [] as Array<{ rings: number[][][]; tags: Record<string, string>; syntheticId: number }>, reads: 0, seaReads: 0 }));
vi.mock('../src/ui/geospatial/contextTiles', async (importOriginal) => {
    const real = await importOriginal<typeof import('../src/ui/geospatial/contextTiles')>();
    return {
        ...real,
        contextTilesEnabled: () => true,
        // §SEA-BAKE-POLYGONS (lane SEA-BAKE, 2026-09-05) — `fetchContextWater` now reads TWO layers per
        // bbox: `water` (this fixture's `natural=coastline` line work) and the baked `sea` polygon layer.
        // The Marseille cases below pin the FALLBACK, so `sea` answers `ok` with ZERO features — "the
        // layer read fine and holds nothing here", which is exactly the value that drives the coastline
        // walk. `tileMock.reads` stays the count of WATER reads, so every assertion below keeps its
        // meaning; `seaReads` proves the second read HAPPENED (a silently skipped sea read would leave
        // the walk in place and this test green for the wrong reason).
        readContextTileFeatures: vi.fn(async (layer: string) => {
            if (layer === 'sea') {
                tileMock.seaReads++;
                return { status: 'ok' as const, features: [], tilesRead: 0, tilesFailed: 0, ms: 0 };
            }
            tileMock.reads++;
            return { status: 'ok' as const, features: tileMock.features, tilesRead: 1, tilesFailed: 0, ms: 1 };
        }),
    };
});

import {
    stitchCoastlineWays,
    clipPolylineToBbox,
    buildSeaMask,
    buildSeaMaskFromCoastline,
    fetchContextWater,
} from '../src/ui/geospatial/contextWater';
import { contextBboxAround } from '../src/ui/geospatial/contextBuildings';
import type { ContextTileFeature } from '../src/ui/geospatial/contextTiles';

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

// ─────────────────────────────────────────────────────────────────────────────
// §SEA-MARSEILLE-BASIN (L-12909 cause 2) — Marseille Vieux-Port on the REAL OSM coastline.
// ─────────────────────────────────────────────────────────────────────────────
//
// The founder's screenshot (2026-09-05, prod ee5d00a2) showed the Vieux-Port basin as tan land. Cause
// 2 of L-12909 was the OLD closure (§SEA-DOMINANT-COAST) shutting the sea at the outer harbour line.
// §SEA-LEFT-HAND-WALK (L-12911) replaced that closure; the acceptance still owed was a fixture on the
// real coastline proving the basin is inside a kept water ring — synthetic squares cannot prove that.
//
// FIXTURE — `fixtures/marseille-vieux-port-coastline.json`: the 19 `natural=coastline` ways Overpass
// returns for bbox (43.290, 5.355, 43.300, 5.380), full `out geom` geometry, fetched 2026-09-05
// (HTTP 200, 50,712 raw bytes → 720 points). The query and date are in the file's `_meta`. Ways are
// stored in OSM orientation (land LEFT, water RIGHT) and are NEVER reversed here — orientation is the
// data the walk decides on. Because every way carries its full geometry, any bbox INSIDE the query
// bbox sees a complete coastline network.
//
// THE BBOX UNDER TEST is built exactly as production builds it: `contextBboxAround(site, halfDeg)`
// with the site on land at the Hôtel de Ville (43.2967, 5.3697) — the bbox centre is the site, and the
// `land-centre` guard keys on it. Test points (lon, lat):
//   basin centre (5.3690, 43.2951) · basin west (5.3665, 43.2945) · basin east (5.3725, 43.2952)
//   Hôtel de Ville (5.3697, 43.2967) · north quay behind (5.3660, 43.2965) · République (5.3735, 43.2975)
//
// PRODUCTION-SCALE PROBE (recorded, NOT pinned — the payload is 1.27 MB): the live supplement runs
// over `contextBboxAround(site, CONTEXT_SEA_HALF_DEG = 0.10)` = (43.1967, 5.2323, 43.3967, 5.5071).
// Overpass 2026-09-05 → HTTP 200, 218 ways, 19,837 points; `buildSeaMask` → 76 chains, 2 perimeter
// strands, 74 closed islands, ONE 10,813-vertex ring, NO refusal; the basin centre and the Bassin de
// la Grande Joliette centre (5.3613, 43.3050) are INSIDE it, all six town points and the Hôtel de
// Ville are outside. So the live path the fragment refusal hands over to does close Marseille's
// harbour basins as water.

interface CoastlineFixture {
    readonly _meta: { readonly query: string; readonly fetched: string; readonly ways: number; readonly points: number };
    readonly ways: ReadonlyArray<{ readonly id: number; readonly name?: string; readonly coords: ReadonlyArray<[number, number]> }>;
}
const MARSEILLE: CoastlineFixture = JSON.parse(
    readFileSync(resolve(__dirname, 'fixtures/marseille-vieux-port-coastline.json'), 'utf8'),
) as CoastlineFixture;
const MARSEILLE_WAYS: ReadonlyArray<ReadonlyArray<Pt>> = MARSEILLE.ways.map((w) => w.coords);
const HDV = { lat: 43.2967, lon: 5.3697 } as const;
const HDV_HALF_DEG = 0.0033;
const BASIN: Record<string, Pt> = { centre: [5.3690, 43.2951], west: [5.3665, 43.2945], east: [5.3725, 43.2952] };
const TOWN: Record<string, Pt> = { hotelDeVille: [5.3697, 43.2967], northQuayBehind: [5.3660, 43.2965], republique: [5.3735, 43.2975] };
/** Ways whose BOTH ends (or one end) lie strictly inside the HdV bbox — dropping one is a tile clip. */
const INTERIOR_WAYS: ReadonlyArray<readonly [number, number]> = [
    [517022456, 2],  // Quai des Belges east end — both ends inside
    [30951664, 2],   // south-east quay — both ends inside
    [232805381, 1],  // north quay (Quai du Port) — its head at lon 5.3628 is outside the bbox
];

describe('§SEA-MARSEILLE-BASIN (L-12909 cause 2) — Vieux-Port on the real OSM coastline', () => {
    afterEach(() => vi.restoreAllMocks());

    it('the fixture is the recorded Overpass answer (19 ways, 720 points, dated), not a hand-drawn shape', () => {
        expect(MARSEILLE._meta.fetched).toBe('2026-09-05');
        expect(MARSEILLE._meta.query).toContain('"natural"="coastline"');
        expect(MARSEILLE.ways).toHaveLength(19);
        expect(MARSEILLE.ways.reduce((a, w) => a + w.coords.length, 0)).toBe(720);
        expect(MARSEILLE.ways.map((w) => w.id)).toEqual(expect.arrayContaining(INTERIOR_WAYS.map(([id]) => id)));
    });

    it('the COMPLETE coastline closes ONE water ring: the basin is inside it, the town is not, nothing is refused', () => {
        const bbox = contextBboxAround(HDV.lat, HDV.lon, HDV_HALF_DEG);
        const r = buildSeaMask(MARSEILLE_WAYS, bbox);
        expect(r.refused).toEqual([]);
        expect(r.rings).toHaveLength(1);
        const ring = r.rings[0]!;
        const b = ringBounds(ring);
        expect(b.minx).toBeGreaterThanOrEqual(bbox[0] - 1e-9);
        expect(b.maxx).toBeLessThanOrEqual(bbox[2] + 1e-9);
        for (const [name, p] of Object.entries(BASIN)) expect(inside(p, ring), `basin ${name} must be water`).toBe(true);
        for (const [name, p] of Object.entries(TOWN)) expect(inside(p, ring), `town ${name} must be land`).toBe(false);
    });

    it('a site clicked IN the basin refuses the basin ring BY NAME (land-centre) — never a silent empty, never water over the site', () => {
        // The raw query bbox: its centre (5.3675, 43.2950) is in the basin water.
        const bbox: Bbox = [5.355, 43.290, 5.380, 43.300];
        const r = buildSeaMask(MARSEILLE_WAYS, bbox);
        expect(r.refused.map((x) => x.reason)).toEqual(['land-centre']);
        expect(r.refused[0]!.detail).toMatch(/contains the bbox centre \(the site, 43\.29500, 5\.36750\)/);
        for (const ring of r.rings) {
            expect(inside(BASIN.centre!, ring)).toBe(false);
            for (const p of Object.values(TOWN)) expect(inside(p, ring)).toBe(false);
        }
    });

    it.each(INTERIOR_WAYS)('a tile-clipped fragment set (way %i dropped) is refused as incomplete-coastline with %i free end(s) counted', (dropId, ends) => {
        const bbox = contextBboxAround(HDV.lat, HDV.lon, HDV_HALF_DEG);
        const fragments = MARSEILLE.ways.filter((w) => w.id !== dropId).map((w) => w.coords);
        const r = buildSeaMask(fragments, bbox);
        expect(r.rings).toEqual([]);
        expect(r.refused).toHaveLength(1);
        expect(r.refused[0]!.reason).toBe('incomplete-coastline');
        expect(r.refused[0]!.detail).toMatch(new RegExp(`^${ends} coastline end\\(s\\) lie strictly inside the bbox`));
    });

    // ── The refusal REACHES the §FIX-SEA-COVERAGE-GATE — by VALUE, not by reason ──
    //
    // `CesiumViewport.loadContextSea` cannot see a `SeaMaskRefusal`: `fetchContextWater` returns a
    // `ContextWaterCollection`, whose `sea` is whatever `buildSeaMaskFromCoastline` KEPT. A refused
    // build keeps nothing, so the viewport receives `sea: []`, `seaFractionOfBbox([]) = 0 < 0.02`,
    // and the gate fetches the live coastline. At the gate a refusal and an honest inland empty are
    // therefore the SAME VALUE (§CONTEXT-DATA-HONESTY says they should not be) — tolerable only
    // because the gate's answer to both is the same live fetch, which inland resolves to `[]`. The
    // console line is the only place the refusal survives; this test pins BOTH halves.
    it('baked tiles carrying the fragments hand the viewport an EMPTY sea VALUE plus a NAMED console refusal; the complete bake hands it the ring', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const asTile = (ways: ReadonlyArray<ReadonlyArray<Pt>>): ContextTileFeature[] =>
            ways.map((coords, i) => ({ rings: [coords.map(([x, y]) => [x, y])], tags: { natural: 'coastline' }, syntheticId: 1000 + i }));

        // Fragmented bake (one interior way missing, as tippecanoe/tile clipping leaves it).
        tileMock.features = asTile(MARSEILLE.ways.filter((w) => w.id !== 517022456).map((w) => w.coords));
        const fragmented = await fetchContextWater(HDV.lat, HDV.lon, undefined, HDV_HALF_DEG);
        expect(tileMock.reads).toBe(1);
        // §SEA-BAKE-POLYGONS — the baked sea layer WAS asked, and answered ok+empty here, so the walk ran.
        expect(tileMock.seaReads).toBe(1);
        expect(fragmented.seaProvenance).toBe('coastline-walk');
        expect(fragmented.sea).toEqual([]);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]![0])).toMatch(/sea mask REFUSED \(incomplete-coastline\): 2 coastline end\(s\)/);

        // Complete bake, a distinct bbox key so the per-bbox cache cannot serve the refusal.
        tileMock.features = asTile(MARSEILLE_WAYS);
        const complete = await fetchContextWater(HDV.lat, HDV.lon, undefined, HDV_HALF_DEG + 0.0001);
        expect(tileMock.reads).toBe(2);
        expect(complete.sea).toHaveLength(1);
        expect(inside(BASIN.centre!, complete.sea[0]!.ring)).toBe(true);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('TEXT PIN — CesiumViewport.loadContextSea gates the live supplement on COVERAGE (a quality test), so an empty/refused baked sea triggers fetchSeaMaskViaOverpass', () => {
        const src = readFileSync(resolve(__dirname, '../src/ui/geospatial/CesiumViewport.ts'), 'utf8');
        const load = src.indexOf('public async loadContextSea(');
        expect(load).toBeGreaterThan(0);
        const body = src.slice(load, src.indexOf('private renderContextSeaRings(', load));
        const gate = body.indexOf('if (seaCoverage < SEA_COVERAGE_MIN && contextTilesEnabled())');
        const measure = body.indexOf('const seaCoverage = seaFractionOfBbox(collection.sea.map((a) => a.ring), lat, lon)');
        const supplement = body.indexOf('supplementalSea = await this.fetchSeaMaskViaOverpass(lat, lon, signal)');
        const draw = body.indexOf('this.clearContextSea();');
        expect(measure).toBeGreaterThan(0);
        expect(gate).toBeGreaterThan(measure);
        expect(supplement).toBeGreaterThan(gate);
        expect(draw).toBeGreaterThan(supplement);
        // The L-807 regression: a QUANTITY gate would let one sliver ring suppress the supplement.
        expect(body).not.toMatch(/if \(collection\.sea\.length === 0\)/);
        // Both halves are drawn together, so the supplement is additive, never a replacement.
        expect(body).toContain('[...collection.sea.map((a) => a.ring), ...supplementalSea]');
        // The live path closes with the SAME pure walk — no second sea-side rule.
        const live = src.slice(src.indexOf('private async fetchSeaMaskViaOverpass('), src.indexOf('public clearContextWater('));
        expect(live).toContain('buildSeaMaskFromCoastline(coastlines, bbox)');
        expect(live).toContain('way["natural"="coastline"]');
    });
});
