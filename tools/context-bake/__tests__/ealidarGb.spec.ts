// §EA-LIDAR-GB (2026-09-05, lane HEIGHTS-GB-IE) — the England measured-height stamp's DECISIONS, unit-tested.
// `heights/ealidarGb.mjs` is the pure half (WCS URL shape, BNG 1 km-square keying, the served envelope,
// the raster verdict, the city working set); the raster/network half (heights/ealidarGbStamp.mjs) reads
// heightSources.mjs, which vitest cannot import (see mdsBboxCoversTerrainRegion.spec.ts) — which is
// precisely why the decisions were pulled out.
//
// WHAT EACH TEST PINS, and why it earned a test rather than a comment:
//   • BNG keying — a footprint keyed to the wrong km square fetches the wrong rasters and either reports
//     no height (honest) or a neighbour square's ground under a real roof.
//   • the GetCoverage URL — SUBSET on the `E`/`N` axis LABELS with SUBSETTINGCRS 27700 is the shape that
//     answered HTTP 200 image/tiff on 2026-09-05; `x`/`y` (the NRW shape) is not this server's dialect.
//   • the projector really is BNG — St Martin-in-the-Fields must land in square 530-180, the square whose
//     live 500 m GetCoverage window (E 529800–530300 / N 180200–180700) the fixture was cut from.
//   • eaRasterVerdict — the Cardiff response is HTTP 200 with EVERY cell 0.0 on both coverages (fixture
//     `cardiffZeroFill`): DSM − DTM = 0 would silently read as "nothing measurable" and hide a coverage
//     hole inside an honest-looking empty count. The verdict must call it a VOID, distinct from nodata,
//     distinct from a real London window (fixture `window`), distinct from an empty decode.
//   • the fixture itself — St Martin's nave is 24.8 m above its pavement in the live rasters; a fixture
//     that stopped saying so would be a fixture of something else.
//   • city bboxes — london must EQUAL the terrain.mjs `gb` row so the stamped heights and the baked terrain
//     cover the same ground (§MDS-BBOX-MUST-COVER-THE-REGION); every working-set city must be inside the
//     served envelope; Edinburgh and Cardiff must be ASSESSED (no-source, with a probe), never in the set.
//
// LAYERING: a build/inspection tool test, like its siblings — no OTel span (P8 applies to exported
// package functions, not bake tooling).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    EA_LIDAR_GB, EA_LIDAR_GB_CITY_BBOXES, EA_LIDAR_GB_ASSESSED, bngTileBbox, bngTileKey, eaDsmUrl, eaDtmUrl,
    eaGetCoverageUrl, eaRasterVerdict, inEaEnvelope,
} from '../heights/ealidarGb.mjs';
import { getProjector } from '../reproject.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
type Bbox = [number, number, number, number];
const FIXTURE = JSON.parse(readFileSync(resolve(HERE, 'fixtures/gb-ealidar-london-stmartin-2026-09-05.json'), 'utf8'));

/** terrain.mjs REGIONS rows with source:'gb', read as TEXT (importing terrain.mjs runs main()). */
function terrainGbRegions(): Map<string, Bbox> {
    const src = readFileSync(resolve(HERE, '../terrain.mjs'), 'utf8');
    const out = new Map<string, Bbox>();
    const re = /\{\s*name:\s*'([a-z0-9-]+)'\s*,\s*source:\s*'gb'\s*,\s*bbox:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g;
    for (const m of src.matchAll(re)) out.set(m[1]!, [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])]);
    return out;
}

describe('§EA-LIDAR-GB — OS 1 km-square keying', () => {
    it('keys St Martin-in-the-Fields (E 530120, N 180500) to square 530-180 (the live-probed window)', () => {
        expect(bngTileKey(530120, 180500)).toEqual({ e: 530, n: 180 });
        expect(bngTileKey(530000, 180000)).toEqual({ e: 530, n: 180 }); // lower-left corner is INCLUSIVE
        expect(bngTileKey(530999.9, 180999.9)).toEqual({ e: 530, n: 180 });
        expect(bngTileKey(531000, 181000)).toEqual({ e: 531, n: 181 });  // upper edge belongs to the next square
    });
    it('round-trips a key to its native km² bbox', () => {
        expect(bngTileBbox({ e: 530, n: 180 })).toEqual([530000, 180000, 531000, 181000]);
    });
});

describe('§EA-LIDAR-GB — the projector really is BNG', () => {
    const proj = getProjector(EA_LIDAR_GB.nativeCrs);
    it('lands the OSM centroid of St Martin-in-the-Fields (way 30734422: −0.12683, 51.50884) in square 530-180', () => {
        // An INDEPENDENT source (Overpass, 2026-09-05), not the probe's own inverse: the church's OSM ring
        // centroid must fall in the square whose live 500 m window the fixture was cut from, within a
        // church-length of the probed roof cell (E 530120 / N 180500).
        const [X, Y] = proj.forward(-0.12683, 51.50884);
        expect(bngTileKey(X, Y)).toEqual({ e: 530, n: 180 });
        expect(Math.abs(X - 530120)).toBeLessThan(80);
        expect(Math.abs(Y - 180500)).toBeLessThan(80);
        expect(inEaEnvelope([X, Y, X, Y])).toBe(true);
    });
    it('forward∘inverse is sub-centimetre (a bad Helmert would not be)', () => {
        const [X, Y] = proj.forward(-0.1278, 51.5074);
        const [lon, lat] = proj.inverse(X, Y);
        expect(Math.abs(lon + 0.1278)).toBeLessThan(1e-7);
        expect(Math.abs(lat - 51.5074)).toBeLessThan(1e-7);
    });
});

describe('§EA-LIDAR-GB — GetCoverage URL shape (the one that answered HTTP 200 image/tiff)', () => {
    it('subsets on the E/N axis labels in EPSG:27700 with no SCALESIZE', () => {
        const url = eaGetCoverageUrl(EA_LIDAR_GB.dsmEndpoint, EA_LIDAR_GB.dsmCoverageId, [529800, 180200, 530300, 180700]);
        expect(url).toBe(`${FIXTURE.dsm.endpoint}?${FIXTURE.dsm.request.replace('&FORMAT=image/tiff', `&COVERAGEID=${FIXTURE.dsm.coverageId}&FORMAT=image/tiff`)}`);
        expect(url).toContain('SUBSET=E(529800,530300)&SUBSET=N(180200,180700)');
        expect(url).toContain('SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/27700');
        expect(url).not.toContain('SCALESIZE');
        expect(url).not.toMatch(/SUBSET=[xy]\(/);
    });
    it('DSM and DTM are DIFFERENT coverages on DIFFERENT endpoints — the differencing is ours', () => {
        const box = bngTileBbox({ e: 530, n: 180 });
        expect(eaDsmUrl(box)).toContain('digital-surface-model-first-return-dsm-1m/wcs');
        expect(eaDsmUrl(box)).toContain(FIXTURE.dsm.coverageId);
        expect(eaDtmUrl(box)).toContain('digital-terrain-model-dtm-1m/wcs');
        expect(eaDtmUrl(box)).toContain(FIXTURE.dtm.coverageId);
        expect(eaDsmUrl(box)).not.toBe(eaDtmUrl(box));
    });
    it('the DTM coverage is the one terrain.mjs already drapes (one DTM, two consumers)', () => {
        const terrain = readFileSync(resolve(HERE, '../terrain.mjs'), 'utf8');
        expect(terrain).toContain(EA_LIDAR_GB.dtmCoverageId);
        expect(terrain).toContain(EA_LIDAR_GB.dtmEndpoint);
    });
});

describe('§EA-LIDAR-GB — the served envelope', () => {
    it('is the INTERSECTION of the two DescribeCoverage envelopes', () => {
        const d = FIXTURE.dsm.describeCoverageEnvelope, t = FIXTURE.dtm.describeCoverageEnvelope;
        expect(EA_LIDAR_GB.envelope).toEqual([
            Math.max(d.lowerCorner[0], t.lowerCorner[0]), Math.max(d.lowerCorner[1], t.lowerCorner[1]),
            Math.min(d.upperCorner[0], t.upperCorner[0]), Math.min(d.upperCorner[1], t.upperCorner[1]),
        ]);
    });
    it('London is inside; Edinburgh (the live HTTP 500 probe) is outside and is refused before any request', () => {
        expect(inEaEnvelope(bngTileBbox({ e: 530, n: 180 }))).toBe(true);
        expect(inEaEnvelope([325500, 673500, 325800, 673800])).toBe(false); // FIXTURE.outsideEnvelope
        expect(FIXTURE.outsideEnvelope.http).toBe(500);
    });
});

describe('§EA-LIDAR-GB — eaRasterVerdict keeps served-empty, zero-filled, failed and real apart', () => {
    it('the live London window (wholly inside the OSM ring of St Martin-in-the-Fields) is "ok" and reads as a church roof', () => {
        const dsm: number[] = FIXTURE.window.dsm.flat(), dtm: number[] = FIXTURE.window.dtm.flat();
        expect(dsm).toHaveLength(480); // 24 × 20 m
        expect(FIXTURE.windowCornersInsideOsmRing).toEqual([true, true, true, true]);
        expect(eaRasterVerdict(dsm)).toBe('ok');
        expect(eaRasterVerdict(dtm)).toBe('ok');
        const nd = dsm.map((v, i) => v - dtm[i]!).sort((a, b) => a - b);
        const p50 = nd[Math.round(0.5 * (nd.length - 1))]!, p90 = nd[Math.round(0.9 * (nd.length - 1))]!;
        expect(p50).toBeGreaterThan(10);  // a church roof, not a pavement
        expect(p90).toBeLessThan(40);     // and the P90 is not the spire
        const roof = FIXTURE.landmarks.find((l: { name: string }) => l.name.startsWith('St Martin'));
        expect(roof.insideOsmRing).toBe(true);
        expect(roof.dsm - roof.dtm).toBeCloseTo(18.1, 1); // 32.465 − 14.347 at the OSM centroid; the stamp's P90 for the whole church read 17.8 m
        // The cell first mislabelled "nave" (E 530120 / N 180500) is OUTSIDE every OSM footprint: 24.8 m of canopy, kept as a warning.
        const notABuilding = FIXTURE.landmarks.find((l: { E: number; N: number }) => l.E === 530120 && l.N === 180500);
        expect(notABuilding.insideOsmRing).toBe(false);
        const pavement = FIXTURE.landmarks.find((l: { name: string }) => l.name.startsWith('Trafalgar Square pavement'));
        expect(Math.abs(pavement.dsm - pavement.dtm)).toBeLessThan(0.01);
    });
    it('the live Cardiff response (HTTP 200, every cell 0.0 on BOTH coverages) is "void-zero", never ground', () => {
        expect(FIXTURE.cardiffZeroFill.http).toBe(200);
        expect(FIXTURE.cardiffZeroFill.dsmZeros).toBe(FIXTURE.cardiffZeroFill.total);
        expect(FIXTURE.cardiffZeroFill.dtmZeros).toBe(FIXTURE.cardiffZeroFill.total);
        expect(eaRasterVerdict(FIXTURE.cardiffZeroFill.dsmPatch.flat())).toBe('void-zero');
        expect(eaRasterVerdict(FIXTURE.cardiffZeroFill.dtmPatch.flat())).toBe('void-zero');
    });
    it('all-nodata is "void-nodata"; a raster with a few zero cells (sea-level marsh) is still "ok"; empty is "empty"', () => {
        expect(eaRasterVerdict(new Float32Array(16).fill(EA_LIDAR_GB.nodata))).toBe('void-nodata');
        expect(eaRasterVerdict([NaN, NaN, -3.4028234663852886e38])).toBe('void-nodata');
        const marsh = [0, 0, 0.12, 0.4, 1.1, 0, 2.3, 0.05, 0, 0.9];
        expect(eaRasterVerdict(marsh)).toBe('ok');
        expect(eaRasterVerdict([])).toBe('empty');
        expect(eaRasterVerdict(undefined as unknown as number[])).toBe('empty');
    });
    it('the fixture records the decode facts the stamp relies on (Float32, one IFD, uncompressed, EPSG:27700, 1 m)', () => {
        for (const c of [FIXTURE.dsm, FIXTURE.dtm]) {
            expect(c.http).toBe(200);
            expect(c.contentType).toBe('image/tiff');
            expect(c.bitsPerSample).toBe(32);
            expect(c.sampleFormat).toBe(3);
            expect(c.compression).toBe(1);
            expect(c.epsg).toBe(27700);
            expect(c.width).toBe(500);
            expect(c.gdalNodata).toBe('-3.4028234663852886E38');
        }
    });
});

describe('§EA-LIDAR-GB-CITY-BBOXES — the working set', () => {
    it('london EQUALS the terrain.mjs gb row (§MDS-BBOX-MUST-COVER-THE-REGION)', () => {
        const t = terrainGbRegions();
        expect(t.get('london'), 'terrain.mjs london gb row').toBeDefined();
        const london = EA_LIDAR_GB_CITY_BBOXES.find((c) => c.city === 'london');
        expect(london?.bbox).toEqual(t.get('london'));
    });
    it('every working-set city is English and inside the served envelope (all four corners)', () => {
        const proj = getProjector(EA_LIDAR_GB.nativeCrs);
        expect(EA_LIDAR_GB_CITY_BBOXES.map((c) => c.city)).toEqual(['london', 'manchester', 'birmingham', 'leeds', 'bristol']);
        for (const { city, bbox: [w, s, e, n] } of EA_LIDAR_GB_CITY_BBOXES) {
            expect(w, city).toBeLessThan(e);
            expect(s, city).toBeLessThan(n);
            for (const [lon, lat] of [[w, s], [e, s], [w, n], [e, n]]) {
                const [X, Y] = proj.forward(lon, lat);
                expect(inEaEnvelope([X, Y, X, Y]), `${city} corner ${lon},${lat}`).toBe(true);
            }
        }
    });
    it('Edinburgh and Cardiff are ASSESSED no-source with a dated probe — never silently in the set', () => {
        const names = EA_LIDAR_GB_ASSESSED.map((a) => a.city);
        expect(names).toEqual(['edinburgh', 'cardiff']);
        for (const a of EA_LIDAR_GB_ASSESSED) {
            expect(a.status).toBe('no-source');
            expect(a.probedAt).toBe('2026-09-05');
            expect(a.reason.length).toBeGreaterThan(80);
            expect(EA_LIDAR_GB_CITY_BBOXES.some((c) => c.city === a.city)).toBe(false);
        }
        const [X, Y] = getProjector(EA_LIDAR_GB.nativeCrs).forward(-3.19, 55.95); // Edinburgh
        expect(inEaEnvelope([X, Y, X, Y])).toBe(false);
    });
});
