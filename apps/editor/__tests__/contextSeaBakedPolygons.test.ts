// §SEA-BAKE-POLYGONS (lane SEA-BAKE, 2026-09-05) — the CLIENT half: reading the baked `sea` layer.
//
// THE DEFECT THIS RETIRES. `natural=coastline` rides in the baked `water` layer as LINE work.
// tippecanoe clips every line to each tile, so at a client bbox a coastline that is CLOSED in OSM
// arrives as FRAGMENTS with free ends strictly INSIDE the bbox. The §SEA-LEFT-HAND-WALK
// (contextWater.ts) honestly refuses those — "incomplete-coastline: 74 coastline end(s) inside the
// bbox across 65 chains" at Dubai, 29 at Sydney, 2 at the Marseille Vieux-Port fixture — and the sea
// then came from a LIVE Overpass supplement that is slow, capped and often unreachable
// (L-12921 Sydney · L-12909 cause 2 Marseille · L-807 Barcelona · Melbourne · Dubai).
//
// THE FIX IS BAKE-SIDE, so this file's subject is what the client does with the fix: when the baked
// `sea` layer holds polygons for the bbox, `waterFromTileFeatures` uses THEM and the walk never runs
// — including on the SAME fragmented water layer that refused a moment ago. That is the pin: the
// fragments are still there, and they no longer matter.
//
// FIXTURE — the sea polygon is not invented. It is the ring the walk itself derives from the REAL
// 19 OSM `natural=coastline` ways of `fixtures/marseille-vieux-port-coastline.json` (fetched
// 2026-09-05, 720 coordinates) over the Hôtel-de-Ville bbox: exactly the geometry osmcoastline
// pre-closes bake-side. So "baked" and "walked" are compared on ONE geometry, and the test cannot
// pass by agreeing with itself about a shape neither path would ever see.
//
// No network, no Cesium, no DOM.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The baked-tile reader is mocked PER LAYER: `water` answers with the fixture's coastline lines,
// `sea` with whatever the case under test stages. Hoisted, because `vi.mock` factories run above the
// imports. `reads` counts per layer so a test can prove the sea layer WAS asked (a silently skipped
// read would leave the walk in place and make a green test meaningless).
const tiles = vi.hoisted(() => ({
    water: [] as Array<{ rings: number[][][]; tags: Record<string, string>; syntheticId: number }>,
    sea: [] as Array<{ rings: number[][][]; holes?: number[][][][]; tags: Record<string, string>; syntheticId: number }>,
    seaStatus: 'ok' as 'ok' | 'unavailable' | 'disabled',
    reads: { water: 0, sea: 0 },
}));
vi.mock('../src/ui/geospatial/contextTiles', async (importOriginal) => {
    const real = await importOriginal<typeof import('../src/ui/geospatial/contextTiles')>();
    return {
        ...real,
        contextTilesEnabled: () => true,
        readContextTileFeatures: vi.fn(async (layer: string) => {
            if (layer === 'sea') {
                tiles.reads.sea++;
                if (tiles.seaStatus === 'unavailable') return { status: 'unavailable' as const, reason: 'Bad response code: 404' };
                if (tiles.seaStatus === 'disabled') return { status: 'disabled' as const };
                return { status: 'ok' as const, features: tiles.sea, tilesRead: 4, tilesFailed: 0, ms: 2 };
            }
            tiles.reads.water++;
            return { status: 'ok' as const, features: tiles.water, tilesRead: 1, tilesFailed: 0, ms: 1 };
        }),
    };
});

import {
    buildSeaMask,
    seaFromTilePolygons,
    fetchContextWater,
} from '../src/ui/geospatial/contextWater';
import { polygonPartsFor, type ContextTileFeature } from '../src/ui/geospatial/contextTiles';
import { contextBboxAround } from '../src/ui/geospatial/contextBuildings';
// The BAKE side's own constant, imported across the tree on purpose: the tag the baker writes and
// the tag `LAYER_DEFINING_TAGS.sea` demands are ONE fact, and a test that restates it by hand would
// go green while the two drifted (the §CTX-PROXY-ALLOWLIST class of defect, one layer up).
import { SEA_FEATURE_TAGS, SEA_SOURCE } from '../../../tools/context-bake/seaPolygons.mjs';

type Pt = readonly [number, number];
interface CoastlineFixture { readonly _meta: { fetched: string }; readonly ways: ReadonlyArray<{ id: number; coords: Pt[] }> }
const MARSEILLE: CoastlineFixture = JSON.parse(
    readFileSync(resolve(__dirname, 'fixtures/marseille-vieux-port-coastline.json'), 'utf8'),
) as CoastlineFixture;
const HDV = { lat: 43.2967, lon: 5.3697 } as const;
const HDV_HALF_DEG = 0.0033;
/** A point in the Vieux-Port basin — water on the ground, and the founder's own check. */
const BASIN: Pt = [5.3690, 43.2951];
/** Hôtel de Ville itself — LAND, and the bbox centre; a sea polygon covering it is refused by name. */
const TOWN: Pt = [5.3697, 43.2967];
/** The way whose removal reproduces tile clipping: 2 free coastline ends strictly inside the bbox. */
const CLIPPED_AWAY = 517022456;

const bbox = contextBboxAround(HDV.lat, HDV.lon, HDV_HALF_DEG);

/** The TRUE sea ring for this bbox, derived by the walk from the COMPLETE fixture — the geometry
 *  osmcoastline pre-closes bake-side, used here as the baked polygon. */
const TRUE_SEA_RING: Pt[] = (() => {
    const r = buildSeaMask(MARSEILLE.ways.map((w) => w.coords), bbox);
    if (r.rings.length !== 1) throw new Error(`fixture invariant broken: the complete Marseille coastline must yield exactly 1 sea ring, got ${r.rings.length}`);
    return r.rings[0]!.map((p) => [p[0], p[1]] as const);
})();

const asLineTiles = (ways: ReadonlyArray<ReadonlyArray<Pt>>) =>
    ways.map((coords, i) => ({ rings: [coords.map(([x, y]) => [x, y])], tags: { natural: 'coastline' }, syntheticId: 1000 + i }));
const asSeaTile = (outer: ReadonlyArray<Pt>, holes: ReadonlyArray<ReadonlyArray<Pt>> = [], id = 7) => ({
    rings: [outer.map(([x, y]) => [x, y])],
    ...(holes.length ? { holes: [holes.map((h) => h.map(([x, y]) => [x, y]))] } : {}),
    tags: { ...SEA_FEATURE_TAGS } as Record<string, string>,
    syntheticId: id,
});

/** Even-odd point-in-ring, independent of anything under test. */
function inside(pt: Pt, ring: ReadonlyArray<Pt>): boolean {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]!; const [xj, yj] = ring[j]!;
        if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
}

beforeEach(() => {
    tiles.water = []; tiles.sea = []; tiles.seaStatus = 'ok';
    tiles.reads.water = 0; tiles.reads.sea = 0;
});
afterEach(() => { vi.restoreAllMocks(); });

// ─────────────────────────────────────────────────────────────────────────────
describe('§SEA-BAKE-POLYGONS — the bake↔client join', () => {
    it('the tag the baker writes is the tag the reader keys on (ONE fact, imported from both sides)', () => {
        expect(SEA_FEATURE_TAGS.sea).toBe('1');
        expect(SEA_FEATURE_TAGS.source).toBe(SEA_SOURCE.id);
        // contextTiles keeps a feature when a DEFINING tag is present; for `sea` that tag is `sea`.
        const src = readFileSync(resolve(__dirname, '../src/ui/geospatial/contextTiles.ts'), 'utf8');
        expect(src).toMatch(/sea: \['sea'\]/);
        expect(src).toMatch(/sea: true,[\s\S]{0,80}?\n\};/); // LAYER_KEEPS_HOLES ends with sea: true
    });

    it('the source is the ODbL osmdata water-polygons product, with the probe it was verified against', () => {
        expect(SEA_SOURCE.url).toBe('https://osmdata.openstreetmap.de/download/water-polygons-split-4326.zip');
        expect(SEA_SOURCE.licence).toMatch(/ODbL/);
        expect(SEA_SOURCE.crs).toBe('EPSG:4326');
        expect(SEA_SOURCE.probe.http).toBe(200);
        expect(SEA_SOURCE.probe.bytes).toBeGreaterThan(500e6);
    });
});

describe('§SEA-BAKE-POLYGONS — polygonPartsFor keeps holes (islands), ringsFor never did', () => {
    it('a Polygon yields one part: outer + its interior rings, each closed', () => {
        const parts = polygonPartsFor({
            type: 'Polygon',
            coordinates: [
                [[0, 0], [4, 0], [4, 4], [0, 4]],          // outer, NOT closed by the source
                [[1, 1], [2, 1], [2, 2], [1, 2]],          // island
            ],
        });
        expect(parts).toHaveLength(1);
        expect(parts[0]!.outer).toHaveLength(5);
        expect(parts[0]!.outer[0]).toEqual(parts[0]!.outer[4]);
        expect(parts[0]!.holes).toHaveLength(1);
        expect(parts[0]!.holes[0]).toHaveLength(5);
    });

    it('a MultiPolygon yields one part per polygon, holes index-aligned with their own outer', () => {
        const parts = polygonPartsFor({
            type: 'MultiPolygon',
            coordinates: [
                [[[0, 0], [4, 0], [4, 4], [0, 4]], [[1, 1], [2, 1], [2, 2], [1, 2]]],
                [[[10, 10], [12, 10], [12, 12], [10, 12]]],
            ],
        });
        expect(parts.map((p) => p.holes.length)).toEqual([1, 0]);
    });

    it('drops a degenerate hole and a degenerate part instead of emitting a 2-vertex ring', () => {
        const parts = polygonPartsFor({
            type: 'MultiPolygon',
            coordinates: [
                [[[0, 0], [4, 0], [4, 4], [0, 4]], [[1, 1], [2, 1]]],   // hole too small
                [[[9, 9], [9, 9]]],                                       // whole part degenerate
            ],
        });
        expect(parts).toHaveLength(1);
        expect(parts[0]!.holes).toEqual([]);
    });

    it('yields nothing for line geometry — a stray LineString in the sea layer is not sea', () => {
        expect(polygonPartsFor({ type: 'LineString', coordinates: [[0, 0], [1, 1]] })).toEqual([]);
    });
});

describe('§SEA-BAKE-POLYGONS — seaFromTilePolygons (pure)', () => {
    it('turns the real Marseille sea ring into one area, no refusal, basin wet and town dry', () => {
        const { sea, refused } = seaFromTilePolygons([asSeaTile(TRUE_SEA_RING) as unknown as ContextTileFeature], bbox);
        expect(refused).toEqual([]);
        expect(sea).toHaveLength(1);
        expect(inside(BASIN, sea[0]!.ring)).toBe(true);
        expect(inside(TOWN, sea[0]!.ring)).toBe(false);
        expect(sea[0]!.holes).toBeUndefined();
    });

    it('carries island holes through — a sea polygon drawn without them paints land blue', () => {
        const island: Pt[] = [[5.3600, 43.2900], [5.3610, 43.2900], [5.3610, 43.2910], [5.3600, 43.2910], [5.3600, 43.2900]];
        const { sea, refused } = seaFromTilePolygons([asSeaTile(TRUE_SEA_RING, [island]) as unknown as ContextTileFeature], bbox);
        expect(refused).toEqual([]);
        expect(sea[0]!.holes).toHaveLength(1);
        expect(sea[0]!.holes![0]).toHaveLength(5);
    });

    it('REFUSES BY NAME a piece containing the bbox centre — the site would sit in the water', () => {
        const swallowsEverything: Pt[] = [
            [bbox[0] - 0.01, bbox[1] - 0.01], [bbox[2] + 0.01, bbox[1] - 0.01],
            [bbox[2] + 0.01, bbox[3] + 0.01], [bbox[0] - 0.01, bbox[3] + 0.01], [bbox[0] - 0.01, bbox[1] - 0.01],
        ];
        const { sea, refused } = seaFromTilePolygons([asSeaTile(swallowsEverything) as unknown as ContextTileFeature], bbox);
        expect(sea).toEqual([]);
        expect(refused).toHaveLength(1);
        expect(refused[0]!.reason).toBe('land-centre');
        expect(refused[0]!.detail).toMatch(/contains the bbox centre 43\.29670, 5\.36970/);
    });

    it('does NOT refuse when the centre falls inside one of the polygon\'s own island holes', () => {
        const swallowsEverything: Pt[] = [
            [bbox[0] - 0.01, bbox[1] - 0.01], [bbox[2] + 0.01, bbox[1] - 0.01],
            [bbox[2] + 0.01, bbox[3] + 0.01], [bbox[0] - 0.01, bbox[3] + 0.01], [bbox[0] - 0.01, bbox[1] - 0.01],
        ];
        const islandUnderTheTown: Pt[] = [
            [TOWN[0] - 0.001, TOWN[1] - 0.001], [TOWN[0] + 0.001, TOWN[1] - 0.001],
            [TOWN[0] + 0.001, TOWN[1] + 0.001], [TOWN[0] - 0.001, TOWN[1] + 0.001], [TOWN[0] - 0.001, TOWN[1] - 0.001],
        ];
        const { sea, refused } = seaFromTilePolygons(
            [asSeaTile(swallowsEverything, [islandUnderTheTown]) as unknown as ContextTileFeature], bbox,
        );
        expect(refused).toEqual([]);
        expect(sea).toHaveLength(1);
    });

    it('ONE refused piece does not empty the bay — the sea arrives as many per-tile pieces', () => {
        const swallowsEverything: Pt[] = [
            [bbox[0] - 0.01, bbox[1] - 0.01], [bbox[2] + 0.01, bbox[1] - 0.01],
            [bbox[2] + 0.01, bbox[3] + 0.01], [bbox[0] - 0.01, bbox[3] + 0.01], [bbox[0] - 0.01, bbox[1] - 0.01],
        ];
        const { sea, refused } = seaFromTilePolygons([
            asSeaTile(TRUE_SEA_RING, [], 7) as unknown as ContextTileFeature,
            asSeaTile(swallowsEverything, [], 8) as unknown as ContextTileFeature,
        ], bbox);
        expect(refused).toHaveLength(1);
        expect(sea).toHaveLength(1);
        expect(inside(BASIN, sea[0]!.ring)).toBe(true);
    });

    it('gives every emitted piece its own id, so two pieces of one tile are never one area', () => {
        const other: Pt[] = [[5.360, 43.290], [5.361, 43.290], [5.361, 43.291], [5.360, 43.291], [5.360, 43.290]];
        const twoRings = {
            rings: [TRUE_SEA_RING.map(([x, y]) => [x, y]), other.map(([x, y]) => [x, y])],
            tags: { ...SEA_FEATURE_TAGS } as Record<string, string>,
            syntheticId: 9,
        };
        const { sea } = seaFromTilePolygons([twoRings as unknown as ContextTileFeature], bbox);
        expect(sea).toHaveLength(2);
        expect(new Set(sea.map((s) => s.osmId)).size).toBe(2);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE POINT OF THE WHOLE LANE, at the value the viewport receives.
describe('§SEA-BAKE-POLYGONS — fetchContextWater prefers the baked layer over the walk', () => {
    it('fragmented coastline + baked sea polygons ⇒ the SEA RENDERS, no walk, no refusal', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        // The water layer carries exactly the fragments that made the walk refuse (2 free ends).
        tiles.water = asLineTiles(MARSEILLE.ways.filter((w) => w.id !== CLIPPED_AWAY).map((w) => w.coords));
        tiles.sea = [asSeaTile(TRUE_SEA_RING) as never];

        const c = await fetchContextWater(HDV.lat, HDV.lon, undefined, HDV_HALF_DEG + 0.0002);

        expect(tiles.reads.water).toBe(1);
        expect(tiles.reads.sea).toBe(1);
        expect(c.seaProvenance).toBe('baked-polygons');
        expect(c.sea).toHaveLength(1);
        expect(inside(BASIN, c.sea[0]!.ring)).toBe(true);
        // The walk never ran: its refusal is the ONLY thing that warns on this path.
        expect(warn).not.toHaveBeenCalled();
    });

    it('sea layer read OK but EMPTY ⇒ the walk runs exactly as before (a region with no baked sea)', async () => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        tiles.water = asLineTiles(MARSEILLE.ways.map((w) => w.coords));
        tiles.sea = [];

        const c = await fetchContextWater(HDV.lat, HDV.lon, undefined, HDV_HALF_DEG + 0.0003);

        expect(tiles.reads.sea).toBe(1);
        expect(c.seaProvenance).toBe('coastline-walk');
        expect(c.sea).toHaveLength(1);
        expect(inside(BASIN, c.sea[0]!.ring)).toBe(true);
    });

    it('sea layer UNAVAILABLE (404 — never baked) ⇒ the walk runs; the failure is NOT read as an empty sea', async () => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        tiles.water = asLineTiles(MARSEILLE.ways.map((w) => w.coords));
        tiles.seaStatus = 'unavailable';

        const c = await fetchContextWater(HDV.lat, HDV.lon, undefined, HDV_HALF_DEG + 0.0004);

        expect(c.seaProvenance).toBe('coastline-walk');
        expect(c.sea).toHaveLength(1);
    });

    it('a baked sea polygon covering the site is refused BY NAME and the collection stays honest', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        tiles.water = [];
        tiles.sea = [asSeaTile([
            [bbox[0] - 0.01, bbox[1] - 0.01], [bbox[2] + 0.01, bbox[1] - 0.01],
            [bbox[2] + 0.01, bbox[3] + 0.01], [bbox[0] - 0.01, bbox[3] + 0.01], [bbox[0] - 0.01, bbox[1] - 0.01],
        ]) as never];

        const c = await fetchContextWater(HDV.lat, HDV.lon, undefined, HDV_HALF_DEG + 0.0005);

        expect(c.seaProvenance).toBe('baked-polygons');
        expect(c.sea).toEqual([]);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]![0])).toMatch(/baked sea polygon REFUSED \(land-centre\)/);
    });
});
