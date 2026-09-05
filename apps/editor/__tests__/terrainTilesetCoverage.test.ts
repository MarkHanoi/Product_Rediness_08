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
