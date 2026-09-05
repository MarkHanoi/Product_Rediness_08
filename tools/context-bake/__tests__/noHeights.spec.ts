// §NDH-NO-NDSM (2026-09-05, lane HEIGHTS-NORDICS) — the Norwegian national measured-height stamp's
// DECISIONS, unit-tested against VERBATIM live fixtures. `heights/noHeights.mjs` is the pure half
// (endpoints + coverage ids, WCS 1.0.0 URL shape, UTM33 tile keying, request sizing, nodata rule,
// capabilities/describe parsers, the city working set); the raster/network half in
// heights/noHeightsStamp.mjs imports heightSources.mjs, which vitest cannot load (see
// mdsBboxCoversTerrainRegion.spec.ts) — which is precisely why the decisions were pulled out.
//
// WHAT EACH TEST PINS, and why it earned a test rather than a comment:
//   • the URL — COVERAGE / CRS / BBOX / WIDTH / HEIGHT / FORMAT=GeoTIFF in the ArcGIS WCS 1.0.0 dialect
//     Geonorge serves. DK's Datafordeler spells the format `GTiff`; copying that here would 4xx every tile.
//   • tile keying + request sizing — a footprint keyed to the wrong km² tile samples the tile next door;
//     a request over the probed 1,100 px ceiling is refused; 1 km + 2×20 m pad at 1 m must be 1,040 px.
//   • the nodata rule — the service publishes NO GDAL_NODATA tag (probed), so the ArcGIS float sentinel
//     must be treated as void, or a 3.4e38 blends into a roof height.
//   • the parsers return null (never an empty list) on a non-WCS body — the failure-vs-empty split
//     (§CONTEXT-DATA-HONESTY) at the exact point where "the service refused us" could become "no coverage".
//   • the VERBATIM 2026-09-05 fixtures — the DOM coverage id, native CRS, GeoTIFF format, fees=free and
//     accessConstraints=None are what the wiring relies on; if Kartverket renames the coverage the
//     fixture-backed assertion is where the rename is noticed, not a silent 0-measured bake.
//   • the shared projector really is UTM 33N — the Oslo control point must land in tile 262/6649.
//   • city bboxes — oslo must EQUAL the terrain.mjs `no` row (§MDS-BBOX-MUST-COVER-THE-REGION) and every
//     bbox must lie inside the bake.mjs `norway` region bbox, or the join holds nothing.
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    NO_NDH, NO_NDH_CITY_BBOXES, isNdhNodata, noNdhCoverageUrl, noNdhTileRequest, parseWcs1Capabilities,
    parseWcs1DescribeCoverage, utm33TileBbox, utm33TileKey,
} from '../heights/noHeights.mjs';
import { getProjector } from '../reproject.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
type Bbox = [number, number, number, number];

/** terrain.mjs REGIONS rows with source:'no', read as TEXT (importing terrain.mjs runs main()). */
function terrainNoRegions(): Map<string, Bbox> {
    const src = readFileSync(resolve(HERE, '../terrain.mjs'), 'utf8');
    const out = new Map<string, Bbox>();
    const re = /\{\s*name:\s*'([a-z0-9-]+)'\s*,\s*source:\s*'no'\s*,\s*bbox:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g;
    for (const m of src.matchAll(re)) out.set(m[1]!, [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])]);
    return out;
}
/** bake.mjs `norway` region bbox, read as TEXT (bake.mjs runs main() on import). */
function bakeNorwayBbox(): Bbox {
    const src = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
    const m = src.match(/\{\s*name:\s*'norway'\s*,[^\n]*bbox:\s*'(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)'/);
    expect(m, 'bake.mjs norway row').not.toBeNull();
    return [Number(m![1]), Number(m![2]), Number(m![3]), Number(m![4])];
}

describe('§NDH-NO — GetCoverage URL (ArcGIS WCS 1.0.0 dialect, native EPSG:25833)', () => {
    it('builds the exact probed DOM request shape (FORMAT=GeoTIFF, not GTiff)', () => {
        const u = noNdhCoverageUrl('dom', [262000, 6649000, 262500, 6649500], 500);
        expect(u).toBe('https://wcs.geonorge.no/skwms1/wcs.hoyde-dom-nhm-25833?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage' +
            '&COVERAGE=nhm_dom_topo_25833&CRS=EPSG:25833&BBOX=262000,6649000,262500,6649500&WIDTH=500&HEIGHT=500&FORMAT=GeoTIFF');
    });
    it('the DTM request rides the terrain.mjs `no` adapter endpoint + coverage', () => {
        const u = noNdhCoverageUrl('dtm', [262000, 6649000, 262500, 6649500], 500);
        expect(u.startsWith('https://wcs.geonorge.no/skwms1/wcs.hoyde-dtm-nhm-25833?')).toBe(true);
        expect(u).toContain('COVERAGE=nhm_dtm_topo_25833');
        const terrain = readFileSync(resolve(HERE, '../terrain.mjs'), 'utf8');
        expect(terrain).toContain(`endpoint: '${NO_NDH.dtmEndpoint}'`);
        expect(terrain).toContain(`coverageId: '${NO_NDH.dtm}'`);
    });
    it('rounds fractional native coordinates to whole metres in BBOX', () => {
        expect(noNdhCoverageUrl('dtm', [261979.6, 6648979.4, 263020.4, 6650020.6], 1040)).toContain('BBOX=261980,6648979,263020,6650021');
    });
});

describe('§NDH-NO — UTM33 tile keying + request sizing', () => {
    it('keys Oslo S (262410, 6649018) to tile 262/6649 and inverts to its native km² box', () => {
        const k = utm33TileKey(262410, 6649018);
        expect(k).toEqual({ e: 262, n: 6649 });
        expect(utm33TileBbox(k)).toEqual([262000, 6649000, 263000, 6650000]);
    });
    it('the shared projector really is UTM 33N: the Oslo control point lands in tile 262/6649', () => {
        const p = getProjector('EPSG:25833');
        const [X, Y] = p.forward(10.75, 59.91);
        expect(Math.abs(X - 262410)).toBeLessThan(5);
        expect(Math.abs(Y - 6649018)).toBeLessThan(5);
        expect(utm33TileKey(X, Y)).toEqual({ e: 262, n: 6649 });
    });
    it('a 1 km tile + 20 m pad at 1 m is a 1,040 px request — under the probed 1,100 px ceiling', () => {
        const { box, dim } = noNdhTileRequest({ e: 262, n: 6649 });
        expect(box).toEqual([261980, 6648980, 263020, 6650020]);
        expect(dim).toBe(1040);
        expect(dim).toBeLessThanOrEqual(NO_NDH.maxPx);
    });
    it('caps the request at maxPx instead of asking for more than the service honours', () => {
        expect(noNdhTileRequest({ e: 1, n: 1 }, { resM: 0.25 }).dim).toBe(NO_NDH.maxPx);
        expect(noNdhTileRequest({ e: 1, n: 1 }, { resM: 2 }).dim).toBe(520);
    });
});

describe('§NDH-NO — nodata rule (no GDAL_NODATA tag is published)', () => {
    it('treats the ArcGIS float sentinel, NaN and ±Infinity as void; real terrain/surface values are kept', () => {
        expect(isNdhNodata(-3.4028234663852886e38)).toBe(true);
        expect(isNdhNodata(3.4028234663852886e38)).toBe(true);
        expect(isNdhNodata(NaN)).toBe(true);
        expect(isNdhNodata(Infinity)).toBe(true);
        expect(isNdhNodata(-3.5)).toBe(false);   // Oslo DTM min (probed) — the fjord shore is BELOW zero and is real
        expect(isNdhNodata(104.1)).toBe(false);  // Oslo DOM max (probed)
        expect(isNdhNodata(0)).toBe(false);
    });
});

describe('§NDH-NO — the VERBATIM 2026-09-05 service documents (fixtures/, untouched bytes)', () => {
    const caps = readFileSync(resolve(HERE, 'fixtures/no-nhm-dom-wcs-capabilities-2026-09-05.xml'), 'utf8');
    const desc = readFileSync(resolve(HERE, 'fixtures/no-nhm-dom-describecoverage-2026-09-05.xml'), 'utf8');

    it('GetCapabilities lists the DOM coverage, WCS 1.0.0, fees free, accessConstraints None', () => {
        const c = parseWcs1Capabilities(caps)!;
        expect(c).not.toBeNull();
        expect(c.version).toBe('1.0.0');
        expect(c.coverages).toContain(NO_NDH.dom);
        expect(c.coverages).toEqual(['nhm_dom_topo_25833', 'nhm_dom_topo_25833_skyggerelieff']);
        expect(c.fees).toBe('free');
        expect(c.accessConstraints).toBe('None');
    });
    it('DescribeCoverage confirms the native CRS the stamp projects into and the format it asks for', () => {
        const d = parseWcs1DescribeCoverage(desc)!;
        expect(d).not.toBeNull();
        expect(d.name).toBe(NO_NDH.dom);
        expect(d.nativeCrs).toBe(NO_NDH.crs);
        expect(d.formats).toContain(NO_NDH.format);
        // a NATIONAL 1 m grid: 1,250,529 × 1,600,549 cells (≈ 1,250 × 1,600 km)
        expect(d.gridHigh).toEqual([1250529, 1600549]);
    });
    it('returns null — never an empty list — for a body that is not a WCS document', () => {
        expect(parseWcs1Capabilities('')).toBeNull();
        expect(parseWcs1Capabilities('<html><body>502 Bad Gateway</body></html>')).toBeNull();
        expect(parseWcs1Capabilities('<ServiceExceptionReport><ServiceException>oops</ServiceException></ServiceExceptionReport>')).toBeNull();
        expect(parseWcs1DescribeCoverage('')).toBeNull();
        expect(parseWcs1DescribeCoverage('{"error":"not xml"}')).toBeNull();
    });
});

describe('§NO-NDH-CITY-BBOXES — the `norway` row\'s stamp working set', () => {
    it('is the capital + the two largest cities, each [w,s,e,n] with w<e and s<n', () => {
        expect(NO_NDH_CITY_BBOXES.map((c) => c.city)).toEqual(['oslo', 'bergen', 'trondheim']);
        for (const { city, bbox } of NO_NDH_CITY_BBOXES) {
            expect(bbox, city).toHaveLength(4);
            expect(bbox[0], `${city} w<e`).toBeLessThan(bbox[2]);
            expect(bbox[1], `${city} s<n`).toBeLessThan(bbox[3]);
        }
    });
    it('oslo EQUALS the terrain.mjs `no` row, so stamped heights and baked terrain cover the same ground', () => {
        const terrain = terrainNoRegions();
        expect(terrain.get('oslo'), 'terrain.mjs oslo row').toBeDefined();
        expect(NO_NDH_CITY_BBOXES.find((c) => c.city === 'oslo')!.bbox).toEqual(terrain.get('oslo'));
    });
    it('every bbox lies INSIDE the bake.mjs `norway` region bbox (or the join would hold nothing)', () => {
        const [W, S, E, N] = bakeNorwayBbox();
        for (const { city, bbox } of NO_NDH_CITY_BBOXES) {
            expect(bbox[0], `${city} w`).toBeGreaterThanOrEqual(W);
            expect(bbox[1], `${city} s`).toBeGreaterThanOrEqual(S);
            expect(bbox[2], `${city} e`).toBeLessThanOrEqual(E);
            expect(bbox[3], `${city} n`).toBeLessThanOrEqual(N);
        }
    });
    it('the CI gate probe point (Oslo Sentralstasjon 59.9139,10.7522) falls inside the oslo stamp bbox', () => {
        const [w, s, e, n] = NO_NDH_CITY_BBOXES.find((c) => c.city === 'oslo')!.bbox;
        expect(10.7522).toBeGreaterThan(w); expect(10.7522).toBeLessThan(e);
        expect(59.9139).toBeGreaterThan(s); expect(59.9139).toBeLessThan(n);
    });
});
