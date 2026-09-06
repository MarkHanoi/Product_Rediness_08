// §VEG-REAL-CANOPY-BAKE (L-12935) — the PURE half of tools/context-bake/canopy.mjs, pinned.
//
// Nothing here touches the network. The three live sources were probed from the lane machine and the
// exact HTTP answers are recorded in canopy.mjs's header; what this file pins is the maths that turns
// a raster into points, because THAT is what silently produces a wrong answer:
//   • the chunk seam (a cell must be owned by exactly ONE chunk — never duplicated, never dropped),
//   • the threshold + the THREE separate counters (kept / below-threshold / nodata),
//   • the honesty bit (`sampled: true`, and never `synthetic`),
//   • determinism (a re-bake reproduces byte-identical points),
//   • the scope refusal (a region too large REFUSES BY NAME rather than baking a fraction).

import { describe, it, expect } from 'vitest';
// @ts-expect-error — .mjs bake tool, no .d.ts; this spec is the contract for its exported surface.
import * as canopy from '../canopy.mjs';

const {
    CANOPY_SOURCES, CANOPY_CELL_M, CANOPY_THRESHOLD_PCT, CANOPY_MAX_AREA_KM2,
    resolveCanopySource, candidateCanopySources, canopyChunkPlan,
    cellLatIndex, cellBandLat, cellLonStep, cellLonIndex, cellCentre,
    hashCell, jitteredCellPoint, sampleRasterAt, sampleCanopyCells,
    bboxAreaKm2, canopyAreasFor, hansenTileName, eeaExportImageUrl, mrlcWcsUrl,
} = canopy as any;

/** A raster over `bbox` at `width`×`height`, filled by evaluating `f(lon, lat)` at each pixel centre. */
function rasterFrom(
    bbox: readonly number[], width: number, height: number, f: (lon: number, lat: number) => number,
): number[] {
    const [w, s, e, n] = bbox as [number, number, number, number];
    const out: number[] = new Array(width * height);
    for (let py = 0; py < height; py++) {
        const lat = n - ((py + 0.5) * (n - s)) / height;
        for (let px = 0; px < width; px++) {
            const lon = w + ((px + 0.5) * (e - w)) / width;
            out[py * width + px] = f(lon, lat);
        }
    }
    return out;
}

const key = (f: any) => f.geometry.coordinates.join(',');

describe('canopy source resolution', () => {
    it('picks the EEA HRL raster for a European bbox', () => {
        const s = resolveCanopySource([2.15, 48.76, 2.19, 48.79]);
        expect(s.id).toBe('eea-hrl-tcd-2018');
        expect(s.nativeM).toBe(10);
    });

    it('picks NLCD for a CONUS bbox and Hansen for Sydney', () => {
        expect(resolveCanopySource([-73.99, 40.76, -73.94, 40.8]).id).toBe('nlcd-tcc-2021-conus');
        expect(resolveCanopySource([151.15, -33.68, 151.2, -33.63]).id).toBe('hansen-gfc-2023v1.11-tc2000');
    });

    it('falls to the global raster for the Middle East and New Zealand — the founder\'s stated scope', () => {
        expect(resolveCanopySource([55.2, 25.1, 55.35, 25.3]).id).toBe('hansen-gfc-2023v1.11-tc2000'); // Dubai
        expect(resolveCanopySource([174.7, -41.32, 174.85, -41.24]).id).toBe('hansen-gfc-2023v1.11-tc2000'); // Wellington
        expect(resolveCanopySource([144.9, -37.85, 145.0, -37.78]).id).toBe('hansen-gfc-2023v1.11-tc2000'); // Melbourne
    });

    it('returns NULL above 80 N rather than silently mis-attributing a source', () => {
        // Hansen's own coverage stops at 80 N. "No canopy source here" is a value; a fallback that
        // pretended otherwise would report 0 canopies as if measured.
        expect(resolveCanopySource([15, 81.0, 16, 82.0])).toBeNull();
    });

    it('only chooses a national raster that covers the bbox ENTIRELY', () => {
        // A bbox straddling the CONUS coverage edge must NOT take NLCD for half of itself.
        const straddle = [-66.0, 44.0, -60.0, 46.0]; // Maine → New Brunswick
        expect(candidateCanopySources(straddle).map((s: any) => s.id)).toContain('nlcd-tcc-2021-conus');
        expect(resolveCanopySource(straddle).id).toBe('hansen-gfc-2023v1.11-tc2000');
    });

    it('labels the Hansen vintage honestly — treecover2000, loss NOT subtracted', () => {
        const h = CANOPY_SOURCES.find((s: any) => s.id === 'hansen-gfc-2023v1.11-tc2000');
        expect(h.vintage).toBe(2000);
        expect(h.lossAdjusted).toBe(false);
        // Every source carries the probe string that records the HTTP answer actually received.
        for (const s of CANOPY_SOURCES) expect(String(s.probe).length).toBeGreaterThan(20);
    });
});

describe('chunk planning', () => {
    it('never exceeds the pixel cap on either edge', () => {
        const src = CANOPY_SOURCES.find((s: any) => s.id === 'eea-hrl-tcd-2018');
        const plan = canopyChunkPlan([2.0, 48.5, 2.9, 49.1], src, { maxPx: 2048 });
        expect(plan.length).toBeGreaterThan(1);
        for (const c of plan) {
            expect(c.width).toBeLessThanOrEqual(2048);
            expect(c.height).toBeLessThanOrEqual(2048);
        }
    });

    it('tiles the bbox exactly — the union is the bbox, with no overlap and no gap', () => {
        const src = CANOPY_SOURCES.find((s: any) => s.id === 'eea-hrl-tcd-2018');
        const bbox = [2.0, 48.5, 2.9, 49.1];
        const plan = canopyChunkPlan(bbox, src, { maxPx: 2048 });
        expect(Math.min(...plan.map((c: any) => c.bbox[0]))).toBeCloseTo(bbox[0], 10);
        expect(Math.min(...plan.map((c: any) => c.bbox[1]))).toBeCloseTo(bbox[1], 10);
        expect(Math.max(...plan.map((c: any) => c.bbox[2]))).toBeCloseTo(bbox[2], 10);
        expect(Math.max(...plan.map((c: any) => c.bbox[3]))).toBeCloseTo(bbox[3], 10);
        const area = plan.reduce((a: number, c: any) => a + (c.bbox[2] - c.bbox[0]) * (c.bbox[3] - c.bbox[1]), 0);
        expect(area).toBeCloseTo((bbox[2] - bbox[0]) * (bbox[3] - bbox[1]), 10);
    });

    it('a small bbox is ONE chunk', () => {
        const src = CANOPY_SOURCES.find((s: any) => s.id === 'eea-hrl-tcd-2018');
        expect(canopyChunkPlan([2.15, 48.76, 2.19, 48.79], src).length).toBe(1);
    });
});

describe('the global ~12 m cell grid', () => {
    it('is anchored globally, not at any chunk — indices round-trip through the centre', () => {
        for (const lat of [0.0, 48.771, -33.65, 59.91]) {
            const iy = cellLatIndex(lat);
            expect(cellLatIndex(cellBandLat(iy))).toBe(iy);
            for (const lon of [0.0, 2.17, -73.96, 151.17]) {
                const ix = cellLonIndex(lon, iy);
                const [clon] = cellCentre(ix, iy);
                expect(cellLonIndex(clon, iy)).toBe(ix);
            }
        }
    });

    it('measures ~12 m on the ground at the equator AND at 49 N', () => {
        const M_LAT = 110_574;
        const M_LON = 111_320;
        expect((CANOPY_CELL_M / M_LAT) * M_LAT).toBeCloseTo(CANOPY_CELL_M, 6);
        for (const lat of [0, 48.77, -33.65]) {
            const iy = cellLatIndex(lat);
            const widthM = cellLonStep(iy) * M_LON * Math.cos((cellBandLat(iy) * Math.PI) / 180);
            expect(widthM).toBeCloseTo(CANOPY_CELL_M, 3);
        }
    });

    it('jitter is deterministic and stays inside ±30 % of the cell', () => {
        const iy = cellLatIndex(48.77);
        const ix = cellLonIndex(2.17, iy);
        const a = jitteredCellPoint(ix, iy);
        const b = jitteredCellPoint(ix, iy);
        expect(a).toEqual(b); // byte-identical on a re-bake — no clock, no Math.random.
        const [clon, clat] = cellCentre(ix, iy);
        expect(Math.abs(a[0] - clon)).toBeLessThanOrEqual(0.3 * cellLonStep(iy) + 1e-7);
        expect(Math.abs(a[1] - clat)).toBeLessThanOrEqual(0.3 * (CANOPY_CELL_M / 110_574) + 1e-7);
    });

    it('hashCell is a stable 32-bit unsigned integer and varies with each argument', () => {
        const h = hashCell(12, 34, 1);
        expect(h).toBe(hashCell(12, 34, 1));
        expect(Number.isInteger(h)).toBe(true);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(2 ** 32);
        expect(hashCell(13, 34, 1)).not.toBe(h);
        expect(hashCell(12, 35, 1)).not.toBe(h);
        expect(hashCell(12, 34, 2)).not.toBe(h);
    });
});

describe('cell sampling', () => {
    const bbox = [2.15, 48.76, 2.16, 48.765];
    const W = 120;
    const H = 60;

    it('keeps only cells at or above the threshold, and labels them `sampled`', () => {
        const raster = rasterFrom(bbox, W, H, (lon) => (lon < 2.155 ? 80 : 10));
        const got = sampleCanopyCells({ bbox, width: W, height: H }, raster, { src: 'test-src', nativeM: 10, vintage: 2018, lossAdjusted: true });
        expect(got.kept).toBeGreaterThan(0);
        expect(got.belowThreshold).toBeGreaterThan(0);
        expect(got.nodata).toBe(0);
        expect(got.features.length).toBe(got.kept);
        for (const f of got.features) {
            expect(f.properties.sampled).toBe(true);
            expect(f.properties.cover).toBe(80);
            expect(f.properties.src).toBe('test-src');
            expect(f.properties.canopy).toBe(1);
            // ⚠ THE HONESTY LINE. This layer is `sampled`, NEVER `synthetic` — the woods-fill lane
            // (contextCanopySynth) owns that word and the two must stay countable apart.
            expect('synthetic' in f.properties).toBe(false);
            expect(f.geometry.coordinates[0]).toBeLessThan(2.155 + 0.0002);
        }
    });

    it('counts NODATA apart from a measured 0 % — failure and empty are different values', () => {
        const nodataRaster = rasterFrom(bbox, W, H, () => 255);
        const zeroRaster = rasterFrom(bbox, W, H, () => 0);
        const nd = sampleCanopyCells({ bbox, width: W, height: H }, nodataRaster, { src: 'x' });
        const zr = sampleCanopyCells({ bbox, width: W, height: H }, zeroRaster, { src: 'x' });
        expect(nd.nodata).toBeGreaterThan(0);
        expect(nd.belowThreshold).toBe(0);
        expect(zr.nodata).toBe(0);
        expect(zr.belowThreshold).toBeGreaterThan(0);
        expect(nd.kept).toBe(0);
        expect(zr.kept).toBe(0);
        // A source outage and a treeless place BOTH emit nothing — the counters are the only thing
        // that tells them apart, which is why they are never summed into one "skipped".
        expect(nd.nodata).not.toBe(nd.belowThreshold);
    });

    it('honours a threshold exactly at the boundary', () => {
        const at30 = rasterFrom(bbox, W, H, () => CANOPY_THRESHOLD_PCT);
        const at29 = rasterFrom(bbox, W, H, () => CANOPY_THRESHOLD_PCT - 1);
        expect(sampleCanopyCells({ bbox, width: W, height: H }, at30, { src: 'x' }).kept).toBeGreaterThan(0);
        expect(sampleCanopyCells({ bbox, width: W, height: H }, at29, { src: 'x' }).kept).toBe(0);
    });

    it('reads outside the raster as NULL, not as 0 % cover', () => {
        const raster = rasterFrom(bbox, W, H, () => 90);
        expect(sampleRasterAt(raster, bbox, W, H, 2.155, 48.762)).toBe(90);
        expect(sampleRasterAt(raster, bbox, W, H, 2.20, 48.762)).toBeNull();
        expect(sampleRasterAt(raster, bbox, W, H, 2.155, 48.90)).toBeNull();
    });

    // ── THE SEAM. This is the property that would otherwise fail silently in production. ──────────
    //
    // Chunking must be INVISIBLE: reading a bbox as one chunk and as a 2×2 split must yield the
    // identical point set. That is a claim about which chunk OWNS a cell, so the test isolates
    // ownership from everything else — the quad rasters are SLICED out of the whole raster (the same
    // pixel values, exactly as a real service window is a window on one continuous field), and the
    // geometry is binary-exact (spans 1/16° and 1/32°, split at their exact midpoints) so the pixel
    // index a cell centre resolves to is bit-identical in both readings.
    //
    // ⚠ The first draft of this test RE-EVALUATED a discontinuous field per quad on non-binary
    // geometry and reported 1681 vs 1682. That was a float artefact of the FIXTURE, not a seam
    // defect — but it is exactly the kind of one-cell drift that a weaker test would have let
    // through as noise, so the fixture was made exact rather than the assertion made loose.
    const exactBbox = [2.0, 48.0, 2.0625, 48.03125]; // 1/16° × 1/32° — exactly representable
    const EW = 128;
    const EH = 64;

    function slice(raster: number[], sx: number, sy: number, sw: number, sh: number): number[] {
        const out: number[] = new Array(sw * sh);
        for (let y = 0; y < sh; y++) {
            for (let x = 0; x < sw; x++) out[y * sw + x] = raster[(sy + y) * EW + (sx + x)]!;
        }
        return out;
    }

    it('produces the SAME point set whether the bbox is read as one chunk or as a 2×2 split', () => {
        // A coarse checkerboard: high cover in some bands, below threshold in others, so the test
        // exercises both branches on every seam rather than a uniform field that could hide a drop.
        const raster = rasterFrom(exactBbox, EW, EH, (lon, lat) =>
            (Math.floor((lon - 2) * 256) + Math.floor((lat - 48) * 512)) % 3 === 0 ? 75 : 4);
        const whole = sampleCanopyCells({ bbox: exactBbox, width: EW, height: EH }, raster, { src: 'x' });
        expect(whole.kept).toBeGreaterThan(100);
        expect(whole.belowThreshold).toBeGreaterThan(100);

        const [w, s, e, n] = exactBbox;
        const mx = w + (e - w) / 2;
        const my = s + (n - s) / 2;
        const quads = [
            { bbox: [w, s, mx, my], sx: 0, sy: EH / 2 },
            { bbox: [mx, s, e, my], sx: EW / 2, sy: EH / 2 },
            { bbox: [w, my, mx, n], sx: 0, sy: 0 },
            { bbox: [mx, my, e, n], sx: EW / 2, sy: 0 },
        ];
        const parts: any[] = [];
        let kept = 0;
        for (const q of quads) {
            const got = sampleCanopyCells(
                { bbox: q.bbox, width: EW / 2, height: EH / 2 },
                slice(raster, q.sx, q.sy, EW / 2, EH / 2),
                { src: 'x' },
            );
            kept += got.kept;
            for (const f of got.features) parts.push(f);
        }
        // Same COUNT (no cell dropped at a seam, none double-emitted) …
        expect(kept).toBe(whole.kept);
        // … and the same COORDINATES, because the grid is anchored globally rather than per chunk.
        expect(new Set(parts.map(key))).toEqual(new Set(whole.features.map(key)));
        // And no duplicates within either set.
        expect(new Set(parts.map(key)).size).toBe(parts.length);
    });

    it('splits into 1×4 horizontal strips with the same result — the seam is not axis-specific', () => {
        const raster = rasterFrom(exactBbox, EW, EH, (lon) => (Math.floor((lon - 2) * 512) % 2 === 0 ? 66 : 3));
        const whole = sampleCanopyCells({ bbox: exactBbox, width: EW, height: EH }, raster, { src: 'x' });
        const [w, s, e, n] = exactBbox;
        const parts: any[] = [];
        for (let i = 0; i < 4; i++) {
            const cs = s + ((n - s) * i) / 4;
            const cn = s + ((n - s) * (i + 1)) / 4;
            const got = sampleCanopyCells(
                { bbox: [w, cs, e, cn], width: EW, height: EH / 4 },
                slice(raster, 0, EH - (EH / 4) * (i + 1), EW, EH / 4),
                { src: 'x' },
            );
            for (const f of got.features) parts.push(f);
        }
        expect(new Set(parts.map(key))).toEqual(new Set(whole.features.map(key)));
    });

    it('emits at most one point per cell', () => {
        const raster = rasterFrom(bbox, W, H, () => 90);
        const got = sampleCanopyCells({ bbox, width: W, height: H }, raster, { src: 'x' });
        expect(new Set(got.features.map(key)).size).toBe(got.features.length);
    });
});

describe('scope — a region too large REFUSES BY NAME', () => {
    it('accepts a city-scale region bbox', () => {
        const r = canopyAreasFor({ name: 'paris', bbox: '2.22,48.80,2.47,48.91' });
        expect(r.refused).toBe(false);
        expect(r.areas.length).toBe(1);
        expect(bboxAreaKm2(r.areas[0])).toBeLessThan(CANOPY_MAX_AREA_KM2);
    });

    it('refuses a national region and names BOTH numbers and BOTH escape hatches', () => {
        const r = canopyAreasFor({ name: 'france', bbox: '-5.15,41.30,9.60,51.10' });
        expect(r.refused).toBe(true);
        expect(r.areas).toEqual([]);
        // §REFUSING-HALF-NEEDS-ITS-ESCAPE-HATCH — a refusal that does not say how to proceed is a
        // regression with a citation attached.
        expect(r.reason).toMatch(/km²/);
        expect(r.reason).toMatch(/canopyBboxes/);
        expect(r.reason).toMatch(/--canopy-bbox/);
    });

    it('uses declared canopyBboxes when the region has them', () => {
        const r = canopyAreasFor({
            name: 'france',
            bbox: '-5.15,41.30,9.60,51.10',
            canopyBboxes: ['2.22,48.80,2.47,48.91', '4.78,45.70,4.92,45.80'],
        });
        expect(r.refused).toBe(false);
        expect(r.areas.length).toBe(2);
    });

    it('refuses declared canopyBboxes that are themselves over budget', () => {
        const r = canopyAreasFor({ name: 'x', bbox: '0,0,1,1', canopyBboxes: ['-5.15,41.30,9.60,51.10'] });
        expect(r.refused).toBe(true);
        expect(r.reason).toMatch(/split them/);
    });

    it('bboxAreaKm2 is sane against a known extent', () => {
        // Jouy dry-run bbox: 0.04° lon × 0.03° lat at 48.8 N ≈ 2.94 km × 3.32 km ≈ 9.7 km².
        expect(bboxAreaKm2([2.15, 48.76, 2.19, 48.79])).toBeGreaterThan(9);
        expect(bboxAreaKm2([2.15, 48.76, 2.19, 48.79])).toBeLessThan(11);
    });
});

describe('request builders', () => {
    it('builds the EEA exportImage URL the live probe used', () => {
        const src = CANOPY_SOURCES.find((s: any) => s.id === 'eea-hrl-tcd-2018');
        const u = eeaExportImageUrl(src, { bbox: [2.15, 48.76, 2.19, 48.79], width: 400, height: 300 });
        expect(u).toContain('/exportImage?');
        expect(u).toContain('bbox=2.15%2C48.76%2C2.19%2C48.79');
        expect(u).toContain('bboxSR=4326');
        expect(u).toContain('size=400%2C300');
        expect(u).toContain('format=tiff');
        expect(u).toContain('f=image');
    });

    it('builds the MRLC WCS 1.0.0 URL — NOT 2.0.1, which answers InvalidAxisLabel', () => {
        const src = CANOPY_SOURCES.find((s: any) => s.id === 'nlcd-tcc-2021-conus');
        const u = mrlcWcsUrl(src, { bbox: [-73.99, 40.76, -73.94, 40.8], width: 400, height: 320 });
        expect(u).toContain('version=1.0.0');
        expect(u).toContain('request=GetCoverage');
        expect(u).toContain('crs=EPSG%3A4326');
        expect(u).toContain('format=GeoTIFF');
        expect(u).toContain('nlcd_tcc_conus_2021_v2021-4');
    });

    it('names the Hansen 10° tile by its TOP-LEFT corner, in all four quadrants', () => {
        expect(hansenTileName(151.17, -33.65)).toBe('30S_150E'); // Sydney — live-verified bbox 150,-40,160,-30
        expect(hansenTileName(2.17, 48.77)).toBe('50N_000E');    // Paris
        expect(hansenTileName(-73.96, 40.78)).toBe('50N_080W');  // New York
        expect(hansenTileName(-58.4, -34.6)).toBe('30S_060W');   // Buenos Aires
        expect(hansenTileName(174.78, -41.29)).toBe('40S_170E'); // Wellington
    });
});
