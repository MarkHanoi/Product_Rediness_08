// §TERRAIN-TILESET-BOUNDS-CHECK (L-12923) — a city tileset whose own layer.json bounds do not
// contain the site is skipped by name so the national tileset serves it. The Amsterdam numbers are
// the measured ones (2026-09-05): a 250 m AHN patch, and a canal 1 km outside it.
import { describe, it, expect } from 'vitest';
import {
    layerJsonUrl, tilesetBoundsCoverSite, terrainTilesetCoversSite, TILESET_BOUNDS_MARGIN_DEG,
} from '../src/ui/geospatial/terrainTilesetCoverage';

const AMSTERDAM_PATCH = { bounds: [4.886441667672049, 52.368923379596666, 4.890175168641127, 52.371239961968385] };
const CANAL = { lon: 4.8985, lat: 52.3735 };           // Oudezijds Voorburgwal — outside the patch
const INSIDE = { lon: 4.8883, lat: 52.3700 };          // inside the patch

describe('§TERRAIN-TILESET-BOUNDS-CHECK (L-12923)', () => {
    it('THE BUG: the Amsterdam patch tileset does NOT cover the canal 1 km away → skipped by name', () => {
        const v = tilesetBoundsCoverSite(AMSTERDAM_PATCH, CANAL.lon, CANAL.lat);
        expect(v.covers).toBe(false);
        if (!v.covers) expect(v.reason).toBe('outside-bounds');
    });

    it('a site inside the declared bounds is served by that tileset', () => {
        expect(tilesetBoundsCoverSite(AMSTERDAM_PATCH, INSIDE.lon, INSIDE.lat).covers).toBe(true);
    });

    it('the margin admits a site just over the edge (the tile grid overhangs the declared box)', () => {
        const edgeLon = AMSTERDAM_PATCH.bounds[2]! + TILESET_BOUNDS_MARGIN_DEG * 0.5;
        expect(tilesetBoundsCoverSite(AMSTERDAM_PATCH, edgeLon, INSIDE.lat).covers).toBe(true);
        const farLon = AMSTERDAM_PATCH.bounds[2]! + TILESET_BOUNDS_MARGIN_DEG * 2;
        expect(tilesetBoundsCoverSite(AMSTERDAM_PATCH, farLon, INSIDE.lat).covers).toBe(false);
    });

    it('a layer.json without usable bounds cannot refuse (older bakes): the candidate stands', () => {
        expect(tilesetBoundsCoverSite({}, CANAL.lon, CANAL.lat).covers).toBe(true);
        expect(tilesetBoundsCoverSite({ bounds: [1, 2] }, CANAL.lon, CANAL.lat).covers).toBe(true);
        expect(tilesetBoundsCoverSite(null, CANAL.lon, CANAL.lat).covers).toBe(true);
    });

    it('layerJsonUrl keeps the ?v= stamp AFTER the path', () => {
        expect(layerJsonUrl('/api/context-tiles/terrain/amsterdam?v=L639i')).toBe('/api/context-tiles/terrain/amsterdam/layer.json?v=L639i');
        expect(layerJsonUrl('https://x/tiles/terrain/spain')).toBe('https://x/tiles/terrain/spain/layer.json');
        expect(layerJsonUrl('https://x/tiles/terrain/spain/')).toBe('https://x/tiles/terrain/spain/layer.json');
    });

    it('the async check reads the declared bounds through the injected fetch, and a failed fetch never refuses', async () => {
        const ok = await terrainTilesetCoversSite('/t/amsterdam?v=1', CANAL.lon, CANAL.lat, async (u) => {
            expect(u).toBe('/t/amsterdam/layer.json?v=1');
            return { ok: true, json: async () => AMSTERDAM_PATCH };
        });
        expect(ok.covers).toBe(false);
        const failed = await terrainTilesetCoversSite('/t/amsterdam?v=1', CANAL.lon, CANAL.lat, async () => { throw new Error('offline'); });
        expect(failed.covers).toBe(true);
        const notOk = await terrainTilesetCoversSite('/t/amsterdam?v=1', CANAL.lon, CANAL.lat, async () => ({ ok: false, json: async () => ({}) }));
        expect(notOk.covers).toBe(true);
    });
});

// §TERRAIN-ABSENT-IS-NOT-UNREADABLE (L-12973) — a tileset that DOES NOT EXIST must be refused, so a
// candidate that IS published gets its turn. The founder's Dubai session, 2026-09-06: the resolver
// chose `gccstates`, whose layer.json 404s (never baked), and the old code read every non-ok answer
// as "unreadable, do not refuse". Cesium then attached a provider that 404'd every tile and reported
//   relief=off … seatBase=0.0m(ellipsoid-flat-ground) … seat[finite=0 fallback=152]
// i.e. all 152 buildings on flat ground — while `dubai` and `abudhabi` answered 200 on R2 throughout.
describe('§TERRAIN-ABSENT-IS-NOT-UNREADABLE (L-12973)', () => {
    const res = (status: number, body?: unknown) => ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body ?? {},
    });

    it('THE BUG: a 404 layer.json is REFUSED, not accepted as "no bounds declared"', async () => {
        const v = await terrainTilesetCoversSite('https://x/terrain/gccstates', 55.26851, 25.1956, async () => res(404));
        expect(v.covers).toBe(false);
        expect((v as { reason: string }).reason).toBe('tileset-absent');
        expect((v as { status: number }).status).toBe(404);
    });

    it('403 (uploaded but not public) and 410 are refusals too — both mean "no tileset here"', async () => {
        for (const s of [403, 410]) {
            const v = await terrainTilesetCoversSite('https://x/terrain/gccstates', 55.2, 25.1, async () => res(s));
            expect(v.covers).toBe(false);
            expect((v as { reason: string }).reason).toBe('tileset-absent');
        }
    });

    // The other half of the honesty: a TRANSIENT is not an absence. Refusing on a 5xx or a network
    // blip would strip real terrain from a live site, which is a worse failure than the one above.
    it('a 5xx or a network error still stands down — unreadable is NOT absent', async () => {
        for (const s of [500, 502, 503]) {
            const v = await terrainTilesetCoversSite('https://x/terrain/spain', -3.7, 40.4, async () => res(s));
            expect(v.covers).toBe(true);
            expect((v as { reason: string }).reason).toBe('no-bounds-declared');
        }
        const thrown = await terrainTilesetCoversSite('https://x/terrain/spain', -3.7, 40.4, async () => {
            throw new Error('network down');
        });
        expect(thrown.covers).toBe(true);
    });

    it('a published tileset is unaffected: 200 with bounds still decides on the bounds', async () => {
        const inside = await terrainTilesetCoversSite('https://x/terrain/dubai', 55.2685, 25.1956, async () =>
            res(200, { bounds: [54.8, 24.8, 55.6, 25.4] }));
        expect(inside.covers).toBe(true);
        const outside = await terrainTilesetCoversSite('https://x/terrain/dubai', -3.7, 40.4, async () =>
            res(200, { bounds: [54.8, 24.8, 55.6, 25.4] }));
        expect(outside.covers).toBe(false);
        expect((outside as { reason: string }).reason).toBe('outside-bounds');
    });
});
