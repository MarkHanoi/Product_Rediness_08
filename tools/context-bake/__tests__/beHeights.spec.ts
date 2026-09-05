// §BE-DHMV (2026-09-05, lane HEIGHTS-EE-PL-PT-BE) — the Belgian national measured-height stamp's DECISIONS,
// unit-tested. `heights/beHeights.mjs` is the pure half (the WCS URL and its axis labels, the tile keying, the
// multipart split, the nodata rule, the DescribeCoverage parser, the city working set); the network/raster
// half (heights/beHeightsStamp.mjs) imports heightSources.mjs, which vitest cannot load.
//
// WHAT EACH TEST PINS, and why it earned a test rather than a comment:
//   • the multipart split — the WCS answers multipart/related for EVERY FORMAT spelling (probed); a stamp that
//     handed the whole body to geotiff.js would fail on every tile and read as "the service is down".
//     The fixture is the LIVE 20 m Antwerp GetCoverage body of 2026-09-05, byte-for-byte (69,610 B).
//   • the split returns null (never an empty raster) for an exception document — failure ≠ empty.
//   • DescribeCoverage: EPSG:31370, axisLabels x y, nilValue −9999 — and specifically that the plural
//     `<swe:nilValues>` wrapper is NOT read as the value (Number('  ') === 0 would silently un-mask nodata).
//   • city bboxes — brussels must EQUAL terrain.mjs's `be` row (§MDS-BBOX-MUST-COVER-THE-REGION); every bbox
//     must sit inside the bake `belgium` row.
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    BE_DHMV, BE_CITY_BBOXES, beDhmvCoverageUrl, beDhmvDescribeUrl, beDhmvTileRequest, lambert72TileKey, lambert72TileBbox,
    isDhmvNodata, maskDhmvNodata, splitWcsMultipart, parseWcs2DescribeCoverage,
} from '../heights/beHeights.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
type Bbox = [number, number, number, number];

const MULTIPART = new Uint8Array(readFileSync(resolve(HERE, 'fixtures/be-dhmv-dsm-1m-antwerp-20m-wcs-multipart-2026-09-05.bin')));
const DESCRIBE = readFileSync(resolve(HERE, 'fixtures/be-dhmv-dsm-1m-describecoverage-2026-09-05.xml'), 'utf8');

function terrainBeRegions(): Map<string, Bbox> {
    const src = readFileSync(resolve(HERE, '../terrain.mjs'), 'utf8');
    const out = new Map<string, Bbox>();
    const re = /\{\s*name:\s*'([a-z0-9-]+)'\s*,\s*source:\s*'be'\s*,\s*bbox:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g;
    for (const m of src.matchAll(re)) out.set(m[1]!, [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])]);
    return out;
}

describe('§BE-DHMV — GetCoverage / DescribeCoverage URLs', () => {
    it('asks WCS 2.0.1 for one coverage with x/y SUBSETs in native metres and FORMAT=image/tiff', () => {
        const url = beDhmvCoverageUrl('dsm', [152400, 212200, 152600, 212400]);
        expect(url).toBe('https://geo.api.vlaanderen.be/DHMV/wcs?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=DHMVII_DSM_1m' +
            '&SUBSET=x(152400,152600)&SUBSET=y(212200,212400)&FORMAT=image/tiff');
        expect(beDhmvCoverageUrl('dtm', [152400.4, 212200.2, 152600.6, 212400.8])).toContain('COVERAGEID=DHMVII_DTM_1m&SUBSET=x(152400,152601)&SUBSET=y(212200,212401)');
        expect(beDhmvDescribeUrl('dsm')).toContain('REQUEST=DescribeCoverage&COVERAGEID=DHMVII_DSM_1m');
    });
    it('keys tiles on the 500 m Lambert-72 grid with a 20 m pad (Grote Markt → tile 304/424)', () => {
        expect(BE_DHMV.tileM).toBe(500);
        expect(lambert72TileKey(152161.8, 212373.3)).toEqual({ e: 304, n: 424 });
        expect(lambert72TileBbox({ e: 304, n: 424 })).toEqual([152000, 212000, 152500, 212500]);
        expect(beDhmvTileRequest({ e: 304, n: 424 })).toEqual({ box: [151980, 211980, 152520, 212520] });
        expect(BE_DHMV.crs).toBe('EPSG:31370');
    });
});

describe('§BE-DHMV — the multipart split (live 20 m Antwerp body, 2026-09-05)', () => {
    it('cuts the GeoTIFF part out of multipart/related; boundary="wcs" — starts at the II* magic, ends before --wcs--', () => {
        expect(MULTIPART.length).toBe(69610);
        const tiff = splitWcsMultipart(MULTIPART)!;
        expect(tiff).not.toBeNull();
        expect(Array.from(tiff.subarray(0, 4))).toEqual([0x49, 0x49, 0x2a, 0x00]);
        expect(tiff.length).toBe(66796);
        expect(Buffer.from(tiff).includes('--wcs--')).toBe(false);
        expect(Buffer.from(MULTIPART.subarray(0, 200)).toString('latin1')).toContain('Content-Type: text/xml');
    });
    it('passes a bare TIFF through unchanged and returns null (never an empty raster) for an exception document', () => {
        const bare = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0, 0, 0]);
        expect(splitWcsMultipart(bare)).toBe(bare);
        const exc = new TextEncoder().encode('<?xml version="1.0"?><ServiceExceptionReport><ServiceException>bad</ServiceException></ServiceExceptionReport>');
        expect(splitWcsMultipart(exc)).toBeNull();
        expect(splitWcsMultipart(new Uint8Array(0))).toBeNull();
        expect(splitWcsMultipart('not bytes' as unknown as Uint8Array)).toBeNull();
    });
    it('the nodata rule masks −9999 and non-finite values to NaN and counts them', () => {
        expect(isDhmvNodata(-9999)).toBe(true);
        expect(isDhmvNodata(NaN)).toBe(true);
        expect(isDhmvNodata(7.6)).toBe(false);
        const v = new Float32Array([7.6, -9999, 18.4, Infinity]);
        expect(maskDhmvNodata(v)).toBe(2);
        expect(Number.isNaN(v[1])).toBe(true); expect(Number.isNaN(v[3])).toBe(true); expect(v[0]).toBeCloseTo(7.6, 5);
    });
});

describe('§BE-DHMV — DescribeCoverage (live DHMVII_DSM_1m document, 2026-09-05)', () => {
    it('reads EPSG:31370, axisLabels x y, the national envelope, nilValue −9999 (the SINGULAR element) and image/tiff', () => {
        const d = parseWcs2DescribeCoverage(DESCRIBE)!;
        expect(d).not.toBeNull();
        expect(d.coverageId).toBe('DHMVII_DSM_1m');
        expect(d.crs).toBe('EPSG:31370');
        expect(d.axisLabels).toEqual(['x', 'y']);
        expect(d.lowerCorner).toEqual([17000, 148000]);
        expect(d.upperCorner).toEqual([264000, 250000]);
        expect(d.nilValue).toBe(-9999);
        expect(d.nativeFormat).toBe('image/tiff');
        expect(DESCRIBE).toContain('<swe:nilValues>'); // the plural wrapper IS in the document — it must not be read as the value
    });
    it('returns null for a body that is not a CoverageDescriptions document', () => {
        expect(parseWcs2DescribeCoverage('<ows:ExceptionReport/>')).toBeNull();
        expect(parseWcs2DescribeCoverage('')).toBeNull();
    });
});

describe('§BE-CITY-BBOXES — the working set', () => {
    it('brussels is BYTE-IDENTICAL to terrain.mjs\'s `be` row (§MDS-BBOX-MUST-COVER-THE-REGION)', () => {
        const terrain = terrainBeRegions();
        expect(terrain.get('brussels'), 'terrain.mjs brussels row').toBeDefined();
        expect(BE_CITY_BBOXES.find((c) => c.city === 'brussels')!.bbox).toEqual(terrain.get('brussels'));
    });
    it('lists antwerp / ghent / brussels / leuven / bruges, each inside the bake `belgium` row bbox (2.50,49.50,6.40,51.60)', () => {
        expect(BE_CITY_BBOXES.map((c) => c.city)).toEqual(['antwerp', 'ghent', 'brussels', 'leuven', 'bruges']);
        for (const { city, bbox: [w, s, e, n] } of BE_CITY_BBOXES) {
            expect(w, city).toBeGreaterThanOrEqual(2.50); expect(e, city).toBeLessThanOrEqual(6.40);
            expect(s, city).toBeGreaterThanOrEqual(49.50); expect(n, city).toBeLessThanOrEqual(51.60);
            expect(e - w, city).toBeLessThanOrEqual(0.15); expect(n - s, city).toBeLessThanOrEqual(0.12);
        }
    });
});
