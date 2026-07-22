// §CTX-PMTILES-READER (L-513b) — unit tests for the baked-context-tiles reader.
//
// The load-bearing assertion here is the HONESTY DISCRIMINATOR, not the tile maths: the entire
// reason this subsystem exists is that live Overpass reports failures IN BAND as an empty success
// (§CONTEXT-DATA-HONESTY, L-422/457/467/469), so a reader that collapsed `unavailable` into `[]`
// would have reintroduced the exact bug it replaces. No network in this file.

import { describe, it, expect, afterEach } from 'vitest';
import {
    tilesCovering,
    lonToTileX,
    latToTileY,
    contextTilesBaseUrl,
    contextTilesEnabled,
    contextTilesOrigin,
    readContextTileFeatures,
    __setContextTilesBaseUrl,
    MAX_TILES_PER_FETCH,
    CONTEXT_TILES_SAME_ORIGIN_BASE,
    type TileBbox,
    type ContextTileFeature,
} from '../src/ui/geospatial/contextTiles';
import {
    tilesToCollection,
    resolveFarRingCap,
    CONTEXT_FAR_MAX_BUILDINGS,
    CONTEXT_TOTAL_MAX_BUILDINGS,
} from '../src/ui/geospatial/contextBuildings';

afterEach(() => { __setContextTilesBaseUrl(null); });

/** A closed square ring of side ~2·d centred on (lon,lat). */
function square(lon: number, lat: number, d = 0.0001): number[][] {
    return [
        [lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d],
    ];
}

describe('tile addressing', () => {
    it('places Barcelona on the tile the live probe read', () => {
        // Cross-checked against the real archive: 16/33162/24477 covers 41.3874,2.1686.
        expect(lonToTileX(2.1686, 16)).toBe(33162);
        expect(latToTileY(41.3874, 16)).toBe(24477);
    });

    it('covers a bbox row-major with y increasing SOUTHWARD', () => {
        const bbox: TileBbox = [2.16, 41.38, 2.18, 41.40];
        const tiles = tilesCovering(bbox, 16);
        expect(tiles.length).toBeGreaterThan(1);
        // The north edge must map to the LOWEST y — the classic slippy-map sign error.
        const yNorth = latToTileY(41.40, 16);
        const ySouth = latToTileY(41.38, 16);
        expect(yNorth).toBeLessThanOrEqual(ySouth);
        expect(Math.min(...tiles.map((t) => t.y))).toBe(yNorth);
        expect(Math.max(...tiles.map((t) => t.y))).toBe(ySouth);
    });

    it('is insensitive to a bbox given with swapped corners', () => {
        const a = tilesCovering([2.16, 41.38, 2.18, 41.40], 15);
        const b = tilesCovering([2.18, 41.40, 2.16, 41.38], 15);
        expect(b).toEqual(a);
    });

    it('clamps beyond the Mercator limit instead of emitting Infinity', () => {
        expect(Number.isFinite(latToTileY(89.9, 16))).toBe(true);
        expect(Number.isFinite(latToTileY(-89.9, 16))).toBe(true);
    });

    it('covers the real far extent within the fan-out cap', () => {
        // CONTEXT_BBOX_FAR_HALF_DEG = 0.011 around Barcelona — the widest extent we ever ask for.
        const h = 0.011;
        const tiles = tilesCovering([2.1686 - h, 41.3874 - h, 2.1686 + h, 41.3874 + h], 16);
        expect(tiles.length).toBeLessThanOrEqual(MAX_TILES_PER_FETCH);
    });
});

describe('configuration', () => {
    it('is disabled — and says so distinctly — when tiles are explicitly turned off', async () => {
        __setContextTilesBaseUrl('');
        expect(contextTilesEnabled()).toBe(false);
        const r = await readContextTileFeatures('buildings', [2.16, 41.38, 2.17, 41.39]);
        // ⚠ NOT `ok` with []. "Not configured" must never look like "no buildings here".
        expect(r.status).toBe('disabled');
    });

    it('§CTX-TILES-PROXY falls back to the SAME-ORIGIN base when no direct URL is set', () => {
        // The R2 bucket sends no CORS headers, so a browser cannot read it directly. An unset
        // variable must therefore mean "proxy", not "go back to live Overpass" — Overpass is the
        // dependency L-513 proved cannot be made reliable.
        __setContextTilesBaseUrl(null);
        expect(contextTilesBaseUrl()).toBe(CONTEXT_TILES_SAME_ORIGIN_BASE);
        expect(contextTilesEnabled()).toBe(true);
    });

    it('prefers the DIRECT R2 URL when configured, so the proxy unwires itself', () => {
        __setContextTilesBaseUrl('https://cdn.example/tiles/');
        expect(contextTilesBaseUrl()).toBe('https://cdn.example/tiles/');
    });

    it('needs no CSP origin for the same-origin fallback', () => {
        __setContextTilesBaseUrl(null);
        // A relative base has no origin to allowlist — connect-src 'self' already covers it.
        expect(contextTilesOrigin()).toBeNull();
    });

    it('normalises a missing trailing slash so the archive URL is well formed', () => {
        __setContextTilesBaseUrl('https://cdn.example/tiles');
        expect(contextTilesBaseUrl()).toBe('https://cdn.example/tiles/');
    });

    it('exposes the ORIGIN the server CSP must allow (§L-570-CSP)', () => {
        __setContextTilesBaseUrl('https://cdn.example/tiles/');
        // A path in connect-src is meaningless; only the origin is asserted.
        expect(contextTilesOrigin()).toBe('https://cdn.example');
    });

    it('reports no origin — rather than throwing — for a malformed URL', () => {
        __setContextTilesBaseUrl('not a url');
        expect(contextTilesOrigin()).toBeNull();
    });
});

describe('tilesToCollection', () => {
    const tf = (over: Partial<ContextTileFeature> = {}): ContextTileFeature => ({
        rings: [square(2.17, 41.39)],
        tags: { building: 'apartments' },
        syntheticId: 1,
        ...over,
    });

    it('carries the OSM tags through the SAME height/provenance resolver as Overpass', () => {
        const c = tilesToCollection([
            tf({ tags: { building: 'yes', height: '34' }, syntheticId: 1 }),
            tf({ tags: { building: 'yes', 'building:levels': '6' }, syntheticId: 2 }),
            tf({ tags: { building: 'yes' }, syntheticId: 3 }),
        ]);
        expect(c.features.map((f) => f.properties.heightProvenance))
            .toEqual(['tagged', 'derived-levels', 'assumed']);
        expect(c.features[0]!.properties.heightM).toBe(34);
        // A tile footprint is NOT more trustworthy than an Overpass one — the untagged case is
        // still the fabricated 9 m default, and must still be badged `assumed`.
        expect(c.features[2]!.properties.heightM).toBe(9);
        expect(c.features[1]!.properties.floors).toBe(6);
    });

    it('gives every multipolygon PART a distinct id so a Set<osmId> cannot swallow one', () => {
        const c = tilesToCollection([
            tf({ rings: [square(2.17, 41.39), square(2.18, 41.39)], syntheticId: 7 }),
        ]);
        expect(c.features).toHaveLength(2);
        expect(new Set(c.features.map((f) => f.properties.osmId)).size).toBe(2);
    });

    it('keeps ids distinct ACROSS features too', () => {
        const c = tilesToCollection([
            tf({ rings: [square(2.17, 41.39), square(2.18, 41.39)], syntheticId: 7 }),
            tf({ rings: [square(2.19, 41.39)], syntheticId: 8 }),
        ]);
        expect(new Set(c.features.map((f) => f.properties.osmId)).size).toBe(3);
    });

    it('drops degenerate rings rather than emitting a zero-area footprint', () => {
        const c = tilesToCollection([tf({ rings: [[[2.17, 41.39], [2.18, 41.39]]] })]);
        expect(c.features).toHaveLength(0);
    });

    it('returns an empty collection for no input without throwing', () => {
        expect(tilesToCollection([]).features).toHaveLength(0);
    });
});

describe('§L-579 far-ring budget', () => {
    it('spends the whole-scene budget the near ring left over', () => {
        // Eixample, measured live: 3,101 near ⇒ the far ring may draw 2,899, not a flat 900.
        // Under the old fixed cap that site rendered 54% of the buildings OSM actually has.
        expect(resolveFarRingCap(3101, 6000)).toBe(2899);
    });

    it('⚠ is MONOTONE — it can never allow FEWER than the historic cap', () => {
        // The load-bearing property: this change must be INCAPABLE of drawing less than before.
        // A near ring that alone exceeds the budget must still leave the far floor intact rather
        // than fall to zero and blank the surrounding fabric.
        expect(resolveFarRingCap(5900, 6000)).toBe(CONTEXT_FAR_MAX_BUILDINGS);
        expect(resolveFarRingCap(99999, 6000)).toBe(CONTEXT_FAR_MAX_BUILDINGS);
        for (const near of [0, 1, 900, 1600, 3101, 5999, 6000, 12000]) {
            expect(resolveFarRingCap(near, 6000)).toBeGreaterThanOrEqual(CONTEXT_FAR_MAX_BUILDINGS);
        }
    });

    it('lets a SPARSE site keep everything — no invented limit where none is needed', () => {
        // Vila Olímpica, measured: 1,157 near and only 882 far candidates. The allowance must sit
        // comfortably above 882 so a site that costs nothing to draw in full is never truncated.
        expect(resolveFarRingCap(1157, 6000)).toBeGreaterThan(882);
    });

    it('never returns a negative, fractional or zero allowance', () => {
        for (const near of [-5, 0, 7000]) {
            const cap = resolveFarRingCap(near, 6000);
            expect(Number.isInteger(cap)).toBe(true);
            expect(cap).toBeGreaterThan(0);
        }
    });

    it('defaults to the shipped total budget when the near ring is empty', () => {
        expect(resolveFarRingCap(0)).toBe(CONTEXT_TOTAL_MAX_BUILDINGS);
    });
});
