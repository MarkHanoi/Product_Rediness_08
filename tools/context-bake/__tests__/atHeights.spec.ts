// §BEV-ALS-NDSM (2026-09-05, lane HEIGHTS-AT-CZ-SI) — the Austrian national measured-height stamp's
// DECISIONS, unit-tested against VERBATIM slices of the live ATOM feeds. `heights/atHeights.mjs` is the
// pure half (feed parsing, LAEA tile keying, newest-Stichtag choice, the COG window arithmetic, the
// nodata mask, the city working set); the raster/network half in heights/atHeightsStamp.mjs imports
// heightSources.mjs, which vitest cannot load — which is why the decisions were pulled out.
//
// WHAT EACH TEST PINS, and why it earned a test rather than a comment:
//   • feed parsing — the tile token, product and Stichtag come from the `rel="alternate"` link TITLE;
//     a parser that read the first <title> would return the feed's own name for every entry.
//   • newest Stichtag — every tile is published six times (2019…2025 issue dates); picking by feed order
//     stamps 2019 data onto 2026 buildings and calls it current.
//   • the dataset feed → the ONE image/tiff href, never a constructed URL (the date folder is the feed's).
//   • LAEA tile keying + the projector — a Stephansdom point must land in tile N2800000E4750000, the tile
//     the live feed and the probed COG bbox [4749999.5, 2799999.5, 4800000.5, 2850000.5] name.
//   • window arithmetic — the pixel window's own bbox must be the ground it covers (top-left origin,
//     y flipped); an off-by-one here samples the neighbour's roof one metre over.
//   • maskBevNodata — an unmasked −9999 blended by the bilinear sampler reads as a plausible height.
//   • city bboxes — inside the bake.mjs `austria` row; the CI spot-check point inside `vienna`.
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    BEV_ALS, AT_CITY_BBOXES, bevTileToken, laeaTileBbox, laeaTileKey, laeaWindow, maskBevNodata,
    parseBevDatasetFeed, parseBevServiceFeed, pickBevDataset,
} from '../heights/atHeights.mjs';
import { getProjector } from '../reproject.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
type Bbox = [number, number, number, number];
const SERVICE_FEED = readFileSync(resolve(HERE, 'fixtures', 'at-bev-als-atom-service-feed-vienna-tile-2026-09-05.xml'), 'utf8');
const DATASET_FEED = readFileSync(resolve(HERE, 'fixtures', 'at-bev-als-dsm-dataset-feed-N2800000E4750000-2026-09-05.xml'), 'utf8');
const VIENNA = 'CRS3035RES50000mN2800000E4750000';

describe('§BEV-ALS-NDSM — the ATOM service feed (4 verbatim Vienna-tile entries)', () => {
    const entries = parseBevServiceFeed(SERVICE_FEED)!;
    it('parses product, tile token and ISO Stichtag from the alternate-link title of every entry', () => {
        expect(entries).not.toBeNull();
        expect(entries.length).toBe(4);
        expect(entries.map((e) => `${e.product} ${e.stichtag}`).sort()).toEqual(['DSM 2019-09-15', 'DSM 2025-09-15', 'DTM 2019-09-15', 'DTM 2025-09-15']);
        for (const e of entries) {
            expect(e.token).toBe(VIENNA);
            expect(e.datasetFeed.startsWith('https://data.bev.gv.at/geonetwork/srv/atom/describe/dataset?spatial_dataset_identifier_code=https://doi.org/10.48677/')).toBe(true);
            expect(e.datasetFeed).not.toContain('&amp;');   // XML-decoded, ready to fetch
        }
    });
    it('picks the NEWEST Stichtag per product and tile (2025 over 2019), and null for an unlisted tile', () => {
        const dsm = pickBevDataset(entries, 'DSM', VIENNA)!;
        expect(dsm.stichtag).toBe('2025-09-15');
        expect(dsm.datasetFeed).toContain('8a18093f-07a2-408c-8f59-aa1cc1e87935');   // the 2025 DSM record id (live)
        const dtm = pickBevDataset(entries, 'DTM', VIENNA)!;
        expect(dtm.stichtag).toBe('2025-09-15');
        expect(dtm.datasetFeed).toContain('17e0f9fe-86d9-43b1-aaa6-5cf9538f8cf0');   // the 2025 DTM record id (live)
        expect(pickBevDataset(entries, 'DSM', 'CRS3035RES50000mN2850000E4800000')).toBeNull();
    });
    it('returns null (never an empty list) for a body that is not a feed', () => {
        expect(parseBevServiceFeed('<html>502 Bad Gateway</html>')).toBeNull();
        expect(parseBevServiceFeed('')).toBeNull();
        expect(parseBevServiceFeed(undefined as unknown as string)).toBeNull();
    });
});

describe('§BEV-ALS-NDSM — the ATOM dataset feed (verbatim, 2025 DSM Vienna tile)', () => {
    it('yields the ONE image/tiff href, with the date folder the feed names', () => {
        expect(parseBevDatasetFeed(DATASET_FEED)).toBe('https://data.bev.gv.at/download/ALS/DSM/20250915/ALS_DSM_CRS3035RES50000mN2800000E4750000.tif');
    });
    it('returns null when no tiff link is present, or for a non-feed body', () => {
        expect(parseBevDatasetFeed(DATASET_FEED.replace(/type="image\/tiff"/g, 'type="application/zip"'))).toBeNull();
        expect(parseBevDatasetFeed('<html/>')).toBeNull();
    });
});

describe('§BEV-ALS-NDSM — LAEA tile keying and the projector', () => {
    it('keys the probed Stephansdom LAEA point (4794180.6, 2808775.4) to tile N2800000E4750000', () => {
        expect(laeaTileKey(4794180.6, 2808775.4)).toEqual({ e: 4750000, n: 2800000 });
        expect(bevTileToken({ e: 4750000, n: 2800000 })).toBe(VIENNA);
        expect(laeaTileBbox({ e: 4750000, n: 2800000 })).toEqual([4750000, 2800000, 4800000, 2850000]);
        expect(laeaTileKey(4800000, 2850000)).toEqual({ e: 4800000, n: 2850000 });   // upper edge belongs to the next tile
    });
    it('the shared projector really is LAEA: Stephansdom (16.3725, 48.2086) lands inside the probed COG bbox', () => {
        const proj = getProjector(BEV_ALS.nativeCrs);
        const [X, Y] = proj.forward(16.3725, 48.2086);
        expect(Math.abs(X - 4794180.6)).toBeLessThan(1.0);
        expect(Math.abs(Y - 2808775.4)).toBeLessThan(1.0);
        expect(laeaTileKey(X, Y)).toEqual({ e: 4750000, n: 2800000 });
        const [lon, lat] = proj.inverse(X, Y);
        expect(Math.abs(lon - 16.3725)).toBeLessThan(1e-7);
        expect(Math.abs(lat - 48.2086)).toBeLessThan(1e-7);
    });
});

describe('§BEV-ALS-NDSM — COG window arithmetic', () => {
    // The probed IFD-0 georeference of the Vienna tile (half-pixel registered, 50001 px, 1 m).
    const tile = { bboxNative: [4749999.5, 2799999.5, 4800000.5, 2850000.5] as Bbox, width: 50001, height: 50001 };
    it('maps a native box to a top-left-origin pixel window whose own bbox is the ground it covers', () => {
        const w = laeaWindow(tile.bboxNative, [4794030, 2808625, 4794331, 2808926], tile)!;
        expect(w.window).toEqual([44030, 41074, 44332, 41376]);   // ceil on the far edges → 302 px
        expect(w.width).toBe(302); expect(w.height).toBe(302);
        expect(w.bboxNative[0]).toBeCloseTo(4794029.5, 6);
        expect(w.bboxNative[2]).toBeCloseTo(4794331.5, 6);
        expect(w.bboxNative[3]).toBeCloseTo(2808926.5, 6);      // top row 41074 → maxY − 41074
        expect(w.bboxNative[1]).toBeCloseTo(2808624.5, 6);
    });
    it('clamps to the image and returns null for a box entirely off the tile', () => {
        const w = laeaWindow(tile.bboxNative, [4749000, 2799000, 4750010, 2800010], tile)!;
        expect(w.window[0]).toBe(0); expect(w.window[3]).toBe(50001);
        expect(laeaWindow(tile.bboxNative, [4800100, 2850100, 4800200, 2850200], tile)).toBeNull();
    });
    it('masks −9999 and non-finite values to NaN in place, keeps 0 (bare ground) as data', () => {
        const v = Float32Array.from([12.5, -9999, 0, NaN, 3.25]);
        expect(maskBevNodata(v)).toBe(2);
        expect(v[0]).toBe(12.5); expect(Number.isNaN(v[1])).toBe(true); expect(v[2]).toBe(0); expect(Number.isNaN(v[3])).toBe(true);
    });
});

describe('§AT-CITY-BBOXES — the austria row working set', () => {
    const bake = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
    const row = bake.match(/\{\s*name:\s*'austria'\s*,[^\n]*bbox:\s*'(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)'/);
    const national: Bbox = [Number(row![1]), Number(row![2]), Number(row![3]), Number(row![4])];
    it('has unique cities and well-formed, city-sized bboxes inside the bake.mjs austria row', () => {
        const names = AT_CITY_BBOXES.map((c) => c.city);
        expect(new Set(names).size).toBe(names.length);
        for (const { city, bbox } of AT_CITY_BBOXES) {
            const [w, s, e, n] = bbox;
            expect(e - w, `${city} lon span`).toBeGreaterThan(0.03); expect(e - w, `${city} lon span`).toBeLessThan(0.3);
            expect(n - s, `${city} lat span`).toBeGreaterThan(0.03); expect(n - s, `${city} lat span`).toBeLessThan(0.2);
            expect(w >= national[0] && s >= national[1] && e <= national[2] && n <= national[3], `${city} inside austria`).toBe(true);
        }
    });
    it('lists vienna, graz and linz, and the CI spot-check point (Stephansplatz) is inside `vienna`', () => {
        for (const c of ['vienna', 'graz', 'linz']) expect(AT_CITY_BBOXES.some((x) => x.city === c), c).toBe(true);
        const [w, s, e, n] = AT_CITY_BBOXES.find((x) => x.city === 'vienna')!.bbox;
        expect(16.3725 > w && 16.3725 < e && 48.2086 > s && 48.2086 < n).toBe(true);
    });
});
