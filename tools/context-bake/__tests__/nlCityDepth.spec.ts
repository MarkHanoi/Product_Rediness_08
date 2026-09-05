// §NL-CITY-DEPTH (L-12943) — a city tileset is baked to the depth its RASTER supports, not to the
// level at which its bbox happens to fit one tile. Measured on R2 2026-09-05: the re-baked amsterdam
// tileset had the right bounds but declared only z0..z10 (~47 m posts) from a 4.68 m source, i.e. no
// more detail than the national tileset it was supposed to improve on.
import { describe, it, expect } from 'vitest';
import {
    tmsZoomForPostSpacing, tmsMaxZoomForBbox, tmsTileRangeForBbox, nlCityWcsRequest, BAKEABLE_REGIONS,
} from '../terrain.mjs';

const AMS = (BAKEABLE_REGIONS as Array<{ name: string; bbox: number[] }>).find((r) => r.name === 'amsterdam')!.bbox;
const postSpacingM = (z: number, gridSize = 257) => (180 / 2 ** z) / (gridSize - 1) * 111320;

describe('§NL-CITY-DEPTH (L-12943)', () => {
    it('THE BUG: the bbox rule stops four levels short of what the source holds', () => {
        const { metresPerPx } = nlCityWcsRequest(AMS);
        const byBbox = tmsMaxZoomForBbox(AMS);
        const bySource = tmsZoomForPostSpacing(metresPerPx, 257);
        expect(byBbox).toBe(10);
        expect(bySource).toBe(14);
        expect(postSpacingM(byBbox)).toBeGreaterThan(40);     // what we were shipping
        expect(postSpacingM(bySource)).toBeLessThan(6);       // what the raster actually holds
    });

    it('never invents detail: the emitted post spacing is no finer than the source', () => {
        for (const mpp of [0.5, 2, 4.68, 12, 30, 90]) {
            const z = tmsZoomForPostSpacing(mpp, 257);
            expect(postSpacingM(z)).toBeGreaterThanOrEqual(mpp * 0.98);
        }
    });

    it('a finer source earns a deeper chain, monotonically, and the cap holds', () => {
        const zs = [90, 30, 12, 4.68, 2, 0.5].map((m) => tmsZoomForPostSpacing(m, 257));
        for (let i = 1; i < zs.length; i++) expect(zs[i]).toBeGreaterThanOrEqual(zs[i - 1]!);
        expect(tmsZoomForPostSpacing(0.01, 257, 16)).toBeLessThanOrEqual(16);
        expect(tmsZoomForPostSpacing(0, 257)).toBe(0);
        expect(tmsZoomForPostSpacing(Number.NaN, 257)).toBe(0);
    });

    it('the finest level stays a sane number of tiles for a city (bounded bake)', () => {
        const z = tmsZoomForPostSpacing(nlCityWcsRequest(AMS).metresPerPx, 257);
        const r = tmsTileRangeForBbox(AMS, z);
        const n = (r.xMax - r.xMin + 1) * (r.yMax - r.yMin + 1);
        expect(n).toBeGreaterThan(20);     // genuinely a grid, not one tile
        expect(n).toBeLessThan(400);       // and not a national-scale bake
    });
});
