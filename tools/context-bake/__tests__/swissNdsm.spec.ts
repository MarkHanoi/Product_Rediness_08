// §SWISS-NDSM (2026-09-04, lane HEIGHTS-EVERYWHERE round 2) — the Swiss national measured-height stamp's
// DECISIONS, unit-tested. `heights/swissNdsm.mjs` is the pure half (STAC URL, LV95 tile keying, COG asset
// selection, the city working set); the raster/network half in heightSources.mjs cannot be imported by
// vitest (see mdsBboxCoversTerrainRegion.spec.ts), which is precisely why the decisions were pulled out.
//
// WHAT EACH TEST PINS, and why it earned a test rather than a comment:
//   • LV95 tile keying — swisstopo's item ids are `<product>_<year>_<E>-<N>` in km of EPSG:2056. A
//     footprint keyed to the wrong km² tile fetches the wrong COG, samples nodata/ground, and either
//     reports no height (honest) or — worse — a neighbour tile's ground under a real roof.
//   • pickCogAsset — a bbox STAC query returns EVERY tile touching the box and each item carries a .tif
//     AND a .xyz.zip asset at each resolution; picking by item order or by the first .tif would stamp
//     Zürich from the tile next door. The fixture is the LIVE response shape of 2026-09-04.
//   • parseStacCollection returns null (never an empty collection) on a non-STAC body — the
//     failure-vs-empty split (§CONTEXT-DATA-HONESTY) at the exact point where "the index refused us"
//     could become "there is no tile here" and silently void a covered km².
//   • the shared projector really is LV95 — the km² tile a Zürich HB point lands in must be the tile
//     whose WGS84 envelope the live STAC index reported for it (2683-1247). This is the seam the
//     2026-07-26 draft got wrong (it assumed 4326 rasters); a wrong Helmert or axis order shows here.
//   • city bboxes — zurich/geneva/bern must EQUAL the terrain.mjs `ch` rows, so the stamped heights and
//     the baked terrain cover the same ground (§MDS-BBOX-MUST-COVER-THE-REGION).
//
// LAYERING: a build/inspection tool test, like its siblings — no OTel span (P8 applies to exported
// package functions, not bake tooling).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    SWISS_NDSM, SWISS_CITY_BBOXES, lv95TileBbox, lv95TileKey, parseStacCollection, pickCogAsset,
    swissStacItemsUrl, swissTileToken,
} from '../heights/swissNdsm.mjs';
import { getProjector } from '../reproject.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
type Bbox = [number, number, number, number];

/** terrain.mjs REGIONS rows with source:'ch', read as TEXT (importing terrain.mjs runs main()). */
function terrainChRegions(): Map<string, Bbox> {
    const src = readFileSync(resolve(HERE, '../terrain.mjs'), 'utf8');
    const out = new Map<string, Bbox>();
    const re = /\{\s*name:\s*'([a-z0-9-]+)'\s*,\s*source:\s*'ch'\s*,\s*bbox:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g;
    for (const m of src.matchAll(re)) out.set(m[1]!, [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])]);
    return out;
}

// The LIVE STAC response shape for a Zürich-centre bbox query on 2026-09-04 (ids, hrefs, asset keys
// verbatim; bboxes rounded). Two tiles touch the box; each item carries .tif + .xyz.zip per resolution.
const LIVE_DSM_ITEMS = {
    type: 'FeatureCollection',
    features: [
        {
            id: 'swisssurface3d-raster_2018_2682-1247', bbox: [8.5242671, 47.3686138, 8.5376903, 47.3777324],
            assets: {
                'swisssurface3d-raster_2018_2682-1247_0.5_2056_5728.tif': { href: 'https://data.geo.admin.ch/ch.swisstopo.swisssurface3d-raster/swisssurface3d-raster_2018_2682-1247/swisssurface3d-raster_2018_2682-1247_0.5_2056_5728.tif', type: 'image/tiff; application=geotiff; profile=cloud-optimized' },
                'swisssurface3d-raster_2018_2682-1247_0.5_2056_5728.xyz.zip': { href: 'https://data.geo.admin.ch/ch.swisstopo.swisssurface3d-raster/swisssurface3d-raster_2018_2682-1247/swisssurface3d-raster_2018_2682-1247_0.5_2056_5728.xyz.zip', type: 'application/x.ascii-xyz+zip' },
            },
        },
        {
            id: 'swisssurface3d-raster_2018_2683-1247', bbox: [8.5375049, 47.3684871, 8.5509303, 47.3776072],
            assets: {
                'swisssurface3d-raster_2018_2683-1247_0.5_2056_5728.xyz.zip': { href: 'https://data.geo.admin.ch/ch.swisstopo.swisssurface3d-raster/swisssurface3d-raster_2018_2683-1247/swisssurface3d-raster_2018_2683-1247_0.5_2056_5728.xyz.zip', type: 'application/x.ascii-xyz+zip' },
                'swisssurface3d-raster_2018_2683-1247_0.5_2056_5728.tif': { href: 'https://data.geo.admin.ch/ch.swisstopo.swisssurface3d-raster/swisssurface3d-raster_2018_2683-1247/swisssurface3d-raster_2018_2683-1247_0.5_2056_5728.tif', type: 'image/tiff; application=geotiff; profile=cloud-optimized' },
            },
        },
    ],
};
const LIVE_DTM_ITEMS = {
    type: 'FeatureCollection',
    features: [{
        id: 'swissalti3d_2019_2683-1247', bbox: [8.5375049, 47.3684871, 8.5509303, 47.3776072],
        assets: {
            'swissalti3d_2019_2683-1247_0.5_2056_5728.tif': { href: 'https://data.geo.admin.ch/ch.swisstopo.swissalti3d/swissalti3d_2019_2683-1247/swissalti3d_2019_2683-1247_0.5_2056_5728.tif' },
            'swissalti3d_2019_2683-1247_0.5_2056_5728.xyz.zip': { href: 'https://data.geo.admin.ch/ch.swisstopo.swissalti3d/swissalti3d_2019_2683-1247/swissalti3d_2019_2683-1247_0.5_2056_5728.xyz.zip' },
            'swissalti3d_2019_2683-1247_2_2056_5728.tif': { href: 'https://data.geo.admin.ch/ch.swisstopo.swissalti3d/swissalti3d_2019_2683-1247/swissalti3d_2019_2683-1247_2_2056_5728.tif' },
            'swissalti3d_2019_2683-1247_2_2056_5728.xyz.zip': { href: 'https://data.geo.admin.ch/ch.swisstopo.swissalti3d/swissalti3d_2019_2683-1247/swissalti3d_2019_2683-1247_2_2056_5728.xyz.zip' },
        },
    }],
};

describe('§SWISS-NDSM — LV95 tile keying', () => {
    it('keys a Zürich HB easting/northing to swisstopo tile 2683-1247 (the live-probed COG bbox [2683000,1247000,2684000,1248000])', () => {
        expect(lv95TileKey(2683400, 1247900)).toEqual({ e: 2683, n: 1247 });
        expect(lv95TileKey(2683000, 1247000)).toEqual({ e: 2683, n: 1247 }); // lower-left corner is INCLUSIVE
        expect(lv95TileKey(2683999.9, 1247999.9)).toEqual({ e: 2683, n: 1247 });
        expect(lv95TileKey(2684000, 1248000)).toEqual({ e: 2684, n: 1248 });   // upper edge belongs to the next tile
    });
    it('round-trips a key to its native km² bbox and to the item-id token', () => {
        expect(lv95TileBbox({ e: 2683, n: 1247 })).toEqual([2683000, 1247000, 2684000, 1248000]);
        expect(swissTileToken({ e: 2683, n: 1247 })).toBe('_2683-1247_');
    });
});

describe('§SWISS-NDSM — the projector really is LV95', () => {
    const proj = getProjector(SWISS_NDSM.nativeCrs);
    it('lands a Zürich HB point in the km² tile the live STAC index reported for it', () => {
        // (8.544, 47.373) sits inside the STAC-reported WGS84 envelope of tile 2683-1247:
        // [8.5375049, 47.3684871, 8.5509303, 47.3776072] (measured 2026-09-04).
        const [X, Y] = proj.forward(8.544, 47.373);
        expect(lv95TileKey(X, Y)).toEqual({ e: 2683, n: 1247 });
    });
    it('inverse-projects the tile corners inside the STAC-reported envelope (axis order + Helmert sane)', () => {
        const [x0, y0, x1, y1] = lv95TileBbox({ e: 2683, n: 1247 });
        const env: Bbox = [8.5375049, 47.3684871, 8.5509303, 47.3776072];
        for (const [X, Y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as const) {
            const [lon, lat] = proj.inverse(X, Y);
            expect(lon).toBeGreaterThanOrEqual(env[0] - 1e-4);
            expect(lon).toBeLessThanOrEqual(env[2] + 1e-4);
            expect(lat).toBeGreaterThanOrEqual(env[1] - 1e-4);
            expect(lat).toBeLessThanOrEqual(env[3] + 1e-4);
        }
    });
    it('forward∘inverse is sub-centimetre (a bad def would not be)', () => {
        const [X, Y] = proj.forward(8.5417, 47.3769);
        const [lon, lat] = proj.inverse(X, Y);
        expect(Math.abs(lon - 8.5417)).toBeLessThan(1e-7);
        expect(Math.abs(lat - 47.3769)).toBeLessThan(1e-7);
    });
});

describe('§SWISS-NDSM — STAC URL + COG asset selection', () => {
    it('builds the /items?bbox= URL in lon,lat order', () => {
        const u = swissStacItemsUrl(SWISS_NDSM.stacDsm, [8.535, 47.372, 8.548, 47.382]);
        expect(u).toBe('https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swisssurface3d-raster/items?bbox=8.535,47.372,8.548,47.382&limit=10');
    });
    it('picks the .tif of THE requested tile at THE requested resolution — not the first .tif, not the neighbour', () => {
        const href = pickCogAsset(LIVE_DSM_ITEMS, { e: 2683, n: 1247 }, SWISS_NDSM.dsmResToken);
        expect(href).toBe('https://data.geo.admin.ch/ch.swisstopo.swisssurface3d-raster/swisssurface3d-raster_2018_2683-1247/swisssurface3d-raster_2018_2683-1247_0.5_2056_5728.tif');
        // The neighbour tile in the same response is reachable by ITS key, never by ours.
        expect(pickCogAsset(LIVE_DSM_ITEMS, { e: 2682, n: 1247 }, SWISS_NDSM.dsmResToken)).toContain('_2682-1247_');
    });
    it('separates the 2 m DTM from the 0.5 m DTM in one item, and never returns the .xyz.zip', () => {
        const h2 = pickCogAsset(LIVE_DTM_ITEMS, { e: 2683, n: 1247 }, SWISS_NDSM.dtmResToken);
        expect(h2).toContain('_2_2056_5728.tif');
        const h05 = pickCogAsset(LIVE_DTM_ITEMS, { e: 2683, n: 1247 }, '_0.5_2056_');
        expect(h05).toContain('_0.5_2056_5728.tif');
        expect(h2).not.toContain('.xyz.zip');
        expect(h05).not.toContain('.xyz.zip');
    });
    it('returns null for a tile the index did not name (the caller decides void vs error) — swissSURFACE3D has NO 2 m asset', () => {
        expect(pickCogAsset(LIVE_DSM_ITEMS, { e: 2600, n: 1200 }, SWISS_NDSM.dsmResToken)).toBeNull();
        expect(pickCogAsset(LIVE_DSM_ITEMS, { e: 2683, n: 1247 }, '_2_2056_')).toBeNull();
        expect(pickCogAsset(null, { e: 2683, n: 1247 }, SWISS_NDSM.dsmResToken)).toBeNull();
    });
});

describe('§SWISS-NDSM — parseStacCollection keeps failure ≠ empty', () => {
    it('returns null (never an empty collection) for an HTML error page, an exception, an empty body', () => {
        expect(parseStacCollection('<html><body>502 Bad Gateway</body></html>')).toBeNull();
        expect(parseStacCollection('{"code":"InternalServerError","description":"boom"}')).toBeNull();
        expect(parseStacCollection('')).toBeNull();
        expect(parseStacCollection(undefined as unknown as string)).toBeNull();
    });
    it('returns the collection — including a genuinely EMPTY one, which is a real answer', () => {
        const c = parseStacCollection(JSON.stringify({ type: 'FeatureCollection', features: [] }));
        expect(c).not.toBeNull();
        expect(c!.features).toHaveLength(0);
        expect(parseStacCollection(JSON.stringify(LIVE_DSM_ITEMS))!.features).toHaveLength(2);
    });
});

describe('§SWISS-NDSM — city working set', () => {
    it('lists distinct, well-formed WGS84 bboxes inside the swisstopo collection extent', () => {
        const seen = new Set<string>();
        for (const { city, bbox } of SWISS_CITY_BBOXES) {
            expect(seen.has(city)).toBe(false);
            seen.add(city);
            const [w, s, e, n] = bbox;
            expect(w).toBeLessThan(e);
            expect(s).toBeLessThan(n);
            // collection extent measured 2026-09-04: [5.9503666, 45.7213375, 10.4998461, 47.8216742]
            expect(w).toBeGreaterThan(5.95);
            expect(e).toBeLessThan(10.5);
            expect(s).toBeGreaterThan(45.72);
            expect(n).toBeLessThan(47.83);
        }
    });
    it('zurich / geneva / bern EQUAL the terrain.mjs `ch` rows (stamped heights and baked terrain cover the same ground)', () => {
        const terrain = terrainChRegions();
        expect(terrain.size).toBeGreaterThanOrEqual(3);
        for (const city of ['zurich', 'geneva', 'bern']) {
            const row = SWISS_CITY_BBOXES.find((c) => c.city === city);
            expect(row, `${city} missing from SWISS_CITY_BBOXES`).toBeTruthy();
            expect(row!.bbox, `${city} drifted from terrain.mjs`).toEqual(terrain.get(city));
        }
    });
    it('costs a bounded number of km² tiles (the §HEIGHT-STAMP-BUDGET arithmetic the row edit relies on)', () => {
        const proj = getProjector(SWISS_NDSM.nativeCrs);
        let tiles = 0;
        for (const { bbox } of SWISS_CITY_BBOXES) {
            const [x0, y0] = proj.forward(bbox[0], bbox[1]);
            const [x1, y1] = proj.forward(bbox[2], bbox[3]);
            tiles += (Math.ceil(x1 / 1000) - Math.floor(x0 / 1000)) * (Math.ceil(y1 / 1000) - Math.floor(y0 / 1000));
        }
        expect(tiles).toBeGreaterThan(200);
        expect(tiles).toBeLessThan(1000); // ≈ 3 s per tile → well inside one bake job
    });
});
