// ─────────────────────────────────────────────────────────────────────────────
// §NO-NATIONAL + §SPARSE-TILE-IS-NOT-A-BROKEN-FILE (lane HEIGHTS-WHOLE-COUNTRY-B, 2026-09-06)
//
// Two things are pinned here, and both were found by RUNNING the join against the live service rather
// than by reading it:
//   1. The Norwegian retain set is the WHOLE COUNTRY and is BYTE-IDENTICAL to the bake.mjs `norway`
//      region row. A retain set narrower than the baked region is a permanent, silent hole.
//   2. The sparse-TIFF reader. NHM windows over the COAST come back with all-nodata tiles written as
//      TileOffset 0 / TileByteCount 0 (legal GDAL sparse output), geotiff.js throws on them, and the
//      join used to lose the WHOLE cell — every footprint in it back to the assumed 9 m. In Norway
//      that is most of the coast, which is where Norway lives.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — .mjs toolchain module, no types
import {
    NO_NATIONAL_BBOX, NO_NATIONAL_BBOXES, NO_NDH, NO_NDH_CITY_BBOXES, NO_SWATHE_ROWS, NO_SWEEP_RES_M,
    NO_TILE_LAT_DEG, NO_TILE_LON_DEG, noNdhCellRequest, noNdhWindowUrl,
} from '../heights/noHeights.mjs';
// @ts-expect-error — .mjs toolchain module, no types
import { readSparseTiledFloat32, sparseTileCount } from '../heights/sparseTiff.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const bake = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');

describe('§NO-NATIONAL — the retain set is the whole country, and it MATCHES the baked region', () => {
    it('NO_NATIONAL_BBOX is byte-identical to the bake.mjs `norway` row bbox', () => {
        const row = bake.match(/\{\s*name:\s*'norway'\s*,[^\n]*\}/)![0];
        const declared = row.match(/bbox:\s*'([^']+)'/)![1].split(',').map(Number);
        expect(NO_NATIONAL_BBOX).toEqual(declared);
        expect(NO_NATIONAL_BBOXES).toEqual([NO_NATIONAL_BBOX]);
    });

    it('bake.mjs gives the `ndh_no` join the NATIONAL set, and keeps the city list as the priority set', () => {
        const fn = bake.match(/function stampBboxesFor\(r\)\s*\{([\s\S]*?)\n\}/)![1];
        expect(fn).toMatch(/r\.heightJoin === 'ndh_no'\)\s*return NO_NATIONAL_BBOXES;/);
        const table = bake.match(/const NATIONAL_STAMP_TABLE\s*=\s*\{([\s\S]*?)\n\};/)![1];
        expect(table).toMatch(/ndh_no:\s*\{\s*stamp:\s*stampNoNdhHeightsOnGeojsonseq,\s*bboxes:\s*NO_NATIONAL_BBOXES\s*\}/);
        // The three cities must still be IMPORTED — they are the §PRIORITY-OR-THE-CITIES-REGRESS set.
        expect(bake).toMatch(/import \{ stampNoNdhHeightsOnGeojsonseq, NO_NDH_CITY_BBOXES, NO_NATIONAL_BBOXES \}/);
    });

    it('every priority city bbox lies INSIDE the national retain set', () => {
        const [W, S, E, N] = NO_NATIONAL_BBOX;
        for (const c of NO_NDH_CITY_BBOXES) {
            const [w, s, e, n] = c.bbox;
            expect(w, c.city).toBeGreaterThanOrEqual(W); expect(e, c.city).toBeLessThanOrEqual(E);
            expect(s, c.city).toBeGreaterThanOrEqual(S); expect(n, c.city).toBeLessThanOrEqual(N);
        }
    });
});

describe('§NO-NATIONAL — the cell never asks for more than the service serves', () => {
    // A stub projector: metres-ish, so the test is about the SIZING RULE, not about proj4.
    const project = (lon: number, lat: number): [number, number] => [
        (lon - 15) * 111_320 * Math.cos((lat * Math.PI) / 180) + 500_000, lat * 111_320,
    ];

    it('a cell at the SOUTHERNMOST (widest) latitude still fits under maxPx at the declared resolution', () => {
        const south = NO_NATIONAL_BBOX[1];
        const req = noNdhCellRequest([10, south, 10 + NO_TILE_LON_DEG, south + NO_TILE_LAT_DEG], project, { resM: NO_SWEEP_RES_M });
        expect(req).not.toBeNull();
        expect(req.width).toBeLessThanOrEqual(NO_NDH.maxPx);
        expect(req.height).toBeLessThanOrEqual(NO_NDH.maxPx);
        // …and it is not accidentally tiny: this is a ~4 km cell, not a 400 m one.
        expect(req.width).toBeGreaterThan(1500);
    });

    it('projects all FOUR corners — a lon/lat rectangle is not a rectangle in UTM', () => {
        const skew = (lon: number, lat: number): [number, number] => [lon * 1000 + lat * 50, lat * 1000];
        const req = noNdhCellRequest([10, 60, 10.1, 60.1], skew, { resM: 2, padM: 0 });
        // With the skew, the east edge's X depends on latitude; a two-corner box would be 100 m narrower.
        expect(req.box[2] - req.box[0]).toBeCloseTo(105, 0);
    });

    it('an unprojectable cell is null (a FAILURE the caller counts), never a silent box at 0,0', () => {
        expect(noNdhCellRequest([10, 60, 10.1, 60.1], () => [NaN, NaN], {})).toBeNull();
    });

    it('the window URL carries the WCS 1.0.0 shape and non-square pixel dimensions', () => {
        const url = noNdhWindowUrl('dom', [1, 2, 3, 4], 1970, 2000);
        expect(url).toContain('REQUEST=GetCoverage');
        expect(url).toContain(`COVERAGE=${NO_NDH.dom}`);
        expect(url).toContain('WIDTH=1970&HEIGHT=2000');
        expect(url).toContain(`CRS=${NO_NDH.crs}`);
    });

    it('the swathe plan is a real heap bound, not a token one', () => {
        expect(NO_SWATHE_ROWS).toBeGreaterThan(1);
        const rowsInCountry = Math.ceil((NO_NATIONAL_BBOX[3] - NO_NATIONAL_BBOX[1]) / NO_TILE_LAT_DEG);
        expect(rowsInCountry / NO_SWATHE_ROWS).toBeGreaterThan(2);   // more than a couple of bands
    });
});

// ── §SPARSE-TILE-IS-NOT-A-BROKEN-FILE ────────────────────────────────────────────────────────────
/**
 * Build the smallest TIFF that reproduces the live defect: uncompressed, tiled, single-band float32,
 * with ONE tile written and one declared SPARSE (offset 0, byteCount 0) — exactly what the Kartverket
 * WCS returns over water (measured: 2 of 64 tiles on the failing Stavanger quadrant).
 */
function makeTiledFloatTiff({ width, height, tile, sparseTiles }: { width: number; height: number; tile: number; sparseTiles: number[] }) {
    const across = Math.ceil(width / tile), down = Math.ceil(height / tile);
    const nTiles = across * down;
    const tileBytes = tile * tile * 4;
    const entries = 12;                                    // IFD entry count
    const headerLen = 8;
    const ifdLen = 2 + entries * 12 + 4;
    // Long arrays for TileOffsets / TileByteCounts live after the IFD.
    const arraysAt = headerLen + ifdLen;
    const arraysLen = nTiles * 4 * 2;
    const dataAt = arraysAt + arraysLen;
    const written = nTiles - sparseTiles.length;
    const buf = new ArrayBuffer(dataAt + written * tileBytes);
    const dv = new DataView(buf);
    dv.setUint16(0, 0x4949, true); dv.setUint16(2, 42, true); dv.setUint32(4, headerLen, true);
    dv.setUint16(headerLen, entries, true);
    let p = headerLen + 2;
    const entry = (tag: number, type: number, count: number, value: number) => {
        dv.setUint16(p, tag, true); dv.setUint16(p + 2, type, true); dv.setUint32(p + 4, count, true);
        dv.setUint32(p + 8, value, true); p += 12;
    };
    entry(256, 3, 1, width);                 // ImageWidth
    entry(257, 3, 1, height);                // ImageLength
    entry(258, 3, 1, 32);                    // BitsPerSample
    entry(259, 3, 1, 1);                     // Compression = none
    entry(262, 3, 1, 1);                     // PhotometricInterpretation
    entry(277, 3, 1, 1);                     // SamplesPerPixel
    entry(284, 3, 1, 1);                     // PlanarConfiguration
    entry(322, 3, 1, tile);                  // TileWidth
    entry(323, 3, 1, tile);                  // TileLength
    entry(324, 4, nTiles, arraysAt);         // TileOffsets
    entry(325, 4, nTiles, arraysAt + nTiles * 4); // TileByteCounts
    entry(339, 3, 1, 3);                     // SampleFormat = IEEE float
    dv.setUint32(p, 0, true);                // next IFD = none
    let dataP = dataAt;
    for (let t = 0; t < nTiles; t++) {
        const sparse = sparseTiles.includes(t);
        dv.setUint32(arraysAt + t * 4, sparse ? 0 : dataP, true);
        dv.setUint32(arraysAt + nTiles * 4 + t * 4, sparse ? 0 : tileBytes, true);
        if (!sparse) {
            for (let i = 0; i < tile * tile; i++) dv.setFloat32(dataP + i * 4, t * 100 + (i % 10), true);
            dataP += tileBytes;
        }
    }
    const fileDirectory = {
        ImageWidth: width, ImageLength: height, BitsPerSample: [32], Compression: 1, SamplesPerPixel: 1,
        PlanarConfiguration: 1, TileWidth: tile, TileLength: tile, SampleFormat: [3],
        TileOffsets: Array.from({ length: nTiles }, (_, t) => (sparseTiles.includes(t) ? 0 : dv.getUint32(arraysAt + t * 4, true))),
        TileByteCounts: Array.from({ length: nTiles }, (_, t) => (sparseTiles.includes(t) ? 0 : tileBytes)),
    };
    return { buf, fileDirectory };
}

describe('§SPARSE-TILE-IS-NOT-A-BROKEN-FILE — an unwritten tile is NODATA, not an error and not zero', () => {
    it('reads a dense tiled float32 TIFF exactly', () => {
        const { buf, fileDirectory } = makeTiledFloatTiff({ width: 4, height: 4, tile: 2, sparseTiles: [] });
        const out = readSparseTiledFloat32(buf, fileDirectory, 4, 4);
        expect(out).not.toBeNull();
        expect(out.length).toBe(16);
        expect(out[0]).toBe(0);          // tile 0, sample 0 → 0*100 + 0
        expect(out[2]).toBe(100);        // tile 1 starts at x=2 → 1*100 + 0
        expect([...out].some(Number.isNaN)).toBe(false);
    });

    it('fills a SPARSE tile with NaN — never 0, which would be a 0 m surface the sampler would average in', () => {
        const { buf, fileDirectory } = makeTiledFloatTiff({ width: 4, height: 4, tile: 2, sparseTiles: [1] });
        expect(sparseTileCount(fileDirectory)).toBe(1);
        const out = readSparseTiledFloat32(buf, fileDirectory, 4, 4);
        // Tile 1 covers x∈[2,4), y∈[0,2) → indices 2,3,6,7 are NaN and NOTHING else is.
        const nan = [...out].map((v, i) => (Number.isNaN(v) ? i : -1)).filter((i) => i >= 0);
        expect(nan).toEqual([2, 3, 6, 7]);
        expect(out[0]).toBe(0);
        expect(out[8]).toBe(200);        // tile 2 still read correctly AFTER the sparse one
    });

    it('refuses a layout it is not allowed to claim (compressed / multi-band / not float32) instead of guessing', () => {
        const { buf, fileDirectory } = makeTiledFloatTiff({ width: 4, height: 4, tile: 2, sparseTiles: [] });
        expect(readSparseTiledFloat32(buf, { ...fileDirectory, Compression: 5 }, 4, 4)).toBeNull();      // LZW
        expect(readSparseTiledFloat32(buf, { ...fileDirectory, SamplesPerPixel: 3 }, 4, 4)).toBeNull();  // RGB
        expect(readSparseTiledFloat32(buf, { ...fileDirectory, BitsPerSample: [16] }, 4, 4)).toBeNull(); // int16
        expect(readSparseTiledFloat32(buf, { ...fileDirectory, SampleFormat: [1] }, 4, 4)).toBeNull();   // uint
    });
});
