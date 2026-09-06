// §NATIVE-TILE-GRID / §SWISS-NATIONAL-SWEEP / §DHM-NATIONAL-SWEEP (2026-09-06, lane HEIGHTS-LAST-NINE).
//
// WHAT THIS FILE IS DEFENDING. Two of the nine remaining city-list height joins fetch on their
// PUBLISHER'S OWN metric grid, not on a degree grid: swisstopo publishes swissSURFACE3D / swissALTI3D
// as 1 km LV95 tiles and the join MATCHES an asset href on the tile token (`_2683-1248_`), and the
// Danish DHM WCS is asked in EPSG:25832 metres. The previous lane recorded CH as `'not-done-shape'`
// for exactly that reason — *"the shared kernel's cell `ord` (and therefore its resume cursor) does
// not apply unmodified"*. This spec pins the ordinal that closes it, and the three ways it can be got
// silently wrong:
//
//   1. THE UNIT. `nationalCellKm2` multiplies by `cos(lat)` and by 111,320 m/deg. Handed a native
//      grid it reads an EASTING as a LONGITUDE and reports a 1 km² tile as ~10^10 km². That number is
//      the §LOUD-AND-ORDERED-TRUNCATION sentence — the figure a reader uses to judge how much of a
//      country still ships the labelled `assumed` default — so a wrong one is worse than none.
//   2. THE CONTAINMENT. A native retain box SMALLER than the WGS84 region is the permanent, silent
//      hole §MDS-BBOX-MUST-COVER-THE-REGION forbids, expressed in a different unit. Both pinned boxes
//      are checked to CONTAIN the perimeter-sampled envelope of their bake row, computed here.
//   3. THE MONOTONICITY. The resume cursor filters cells by `ord >= nextCursor`, so bands must be
//      strictly increasing in ord. That holds when the bands and the ords live in the SAME space, and
//      fails quietly when a WGS84 band is laid over a native ord space. Pinned as arithmetic.
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    DHM_NATIONAL_BBOX, DHM_UTM32_NATIVE_BOX, SWISS_NATIONAL_BBOX, SWISS_LV95_NATIVE_BOX,
    cellKm2Of, makeSweepBudget, nationalCellKm2, nationalSwathes, nationalTileGrid, nativeTileGrid,
    sweepPopulatedCells,
} from '../heights/nationalSweep.mjs';
import { SWISS_NDSM, lv95TileBbox } from '../heights/swissNdsm.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const bake = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');

describe('§NATIVE-TILE-GRID — the projected-metre sweep grid', () => {
    it('indexes cells so that ix/iy ARE the publisher tile key, minus the origin', () => {
        const g = nativeTileGrid(SWISS_LV95_NATIVE_BOX, SWISS_NDSM.tileM);
        expect(g.native).toBe(true);
        expect(g.tileM).toBe(1000);
        expect([g.nx, g.ny]).toEqual([358, 233]);
        // Zürich Hauptbahnhof, LV95 2683189 / 1248069 — projected 2026-09-06 with the repo's own
        // reproject.mjs (proj4). swisstopo's tile for that point is 2683-1248, and that string is what
        // `pickCogAsset` matches inside an asset href. If this drifts, the sweep asks the STAC index for
        // one tile and reads the COG of another — which would stamp a NEIGHBOUR's roof, silently.
        const ix = g.cellIx(2683189);
        const iy = g.cellIy(1248069);
        expect(g.keyOf(ix, iy)).toEqual({ x: 2683, y: 1248 });
        // …and the tile's own native box is the km square that key names.
        expect(lv95TileBbox({ e: 2683, n: 1248 })).toEqual([2683000, 1248000, 2684000, 1249000]);
    });

    it('ord is row-major and round-trips through ixOf/iyOf (the resume cursor is this integer)', () => {
        const g = nativeTileGrid(SWISS_LV95_NATIVE_BOX, 1000);
        for (const [ix, iy] of [[0, 0], [1, 0], [0, 1], [203, 176], [g.nx - 1, g.ny - 1]] as Array<[number, number]>) {
            const ord = g.ordOf(ix, iy);
            expect([g.ixOf(ord), g.iyOf(ord)]).toEqual([ix, iy]);
        }
        expect(g.ordOf(0, 1)).toBe(g.nx);          // one whole row on
        expect(g.ordOf(1, 0)).toBe(1);
    });

    it('cellKm2 is EXACT, and cellKm2Of prefers it — the degree formula would be off by ~10^10', () => {
        const g = nativeTileGrid(SWISS_LV95_NATIVE_BOX, 1000);
        expect(g.cellKm2()).toBe(1);
        expect(cellKm2Of(g, 5, 5)).toBe(1);
        // The failure mode, made visible rather than described: the degree formula on the same grid.
        expect(nationalCellKm2(g, 5, 5)).toBeGreaterThan(1e6);
        const dk = nativeTileGrid(DHM_UTM32_NATIVE_BOX, 2000);
        expect(dk.cellKm2()).toBe(4);
        expect(cellKm2Of(dk, 0, 0)).toBe(4);
    });

    it('cellKm2Of is byte-identical to the old call on a DEGREE grid (the hook changed nothing)', () => {
        const g = nationalTileGrid([-5.15, 41.30, 9.60, 51.10], { lonDeg: 0.08, latDeg: 0.06 });
        expect(g.cellKm2).toBeUndefined();
        for (const [ix, iy] of [[0, 0], [10, 20], [g.nx - 1, g.ny - 1]] as Array<[number, number]>) {
            expect(cellKm2Of(g, ix, iy)).toBe(nationalCellKm2(g, ix, iy));
        }
    });

    it('a truncated native sweep accounts km² in REAL km² and leaves an exact cursor', async () => {
        const g = nativeTileGrid(SWISS_LV95_NATIVE_BOX, 1000);
        // Six populated cells in one row; a budget of two. The other four are SKIPPED, and the km²
        // reported must be 2 stamped / 4 skipped — not 2e10 / 4e10.
        const buckets = new Map<string, number[]>();
        for (let i = 0; i < 6; i++) buckets.set(`${100 + i},50`, [i]);
        const budget = makeSweepBudget({ maxTiles: 2 });
        await sweepPopulatedCells({ buckets, grid: g, budget, onCell: async () => true });
        expect(budget.cellsStamped).toBe(2);
        expect(budget.km2Stamped).toBe(2);
        expect(budget.cellsSkipped).toBe(4);
        expect(budget.km2Skipped).toBe(4);
        expect(budget.stopReason).toBe('maxTiles 2');
        expect(budget.nextCursor).toBe(g.ordOf(102, 50));   // the first cell that did NOT run
    });

    it('bands over a native grid are strictly increasing in ord — the cursor can never step over a cell', () => {
        const g = nativeTileGrid(SWISS_LV95_NATIVE_BOX, 1000);
        const sw = nationalSwathes(g, { swatheRows: 40 });
        expect(sw.length).toBe(Math.ceil(233 / 40));
        for (let i = 1; i < sw.length; i++) {
            expect(sw[i]!.ordFrom).toBe(sw[i - 1]!.ordTo);   // contiguous
            expect(sw[i]!.ordFrom).toBeGreaterThan(sw[i - 1]!.ordFrom);
        }
        // Band boxes are in the SAME unit as the retain set (metres), which is what makes
        // `intersectAreas(nativeRetainSet, band)` a real intersection rather than a unit mix-up.
        expect(sw[0]!.bbox[1]).toBe(SWISS_LV95_NATIVE_BOX[1]);
        expect(sw[sw.length - 1]!.bbox[3]).toBeGreaterThanOrEqual(SWISS_LV95_NATIVE_BOX[3]);
    });
});

describe('§NATIVE-RETAIN-SETS — the native box CONTAINS the region it must cover', () => {
    it('DK: the pinned EPSG:25832 box contains the perimeter-sampled envelope of the bake row', async () => {
        // Computed here with the SAME closed-form helper the join uses, from the SAME WGS84 constant —
        // so this is a containment proof, not a re-typing of a number from a comment.
        const hs = await import('../heightSources.mjs');
        const env = hs.utm32EnvelopeOfWgs84Bbox(DHM_NATIONAL_BBOX) as [number, number, number, number];
        expect(env[0]).toBeGreaterThanOrEqual(DHM_UTM32_NATIVE_BOX[0]);
        expect(env[1]).toBeGreaterThanOrEqual(DHM_UTM32_NATIVE_BOX[1]);
        expect(env[2]).toBeLessThanOrEqual(DHM_UTM32_NATIVE_BOX[2]);
        expect(env[3]).toBeLessThanOrEqual(DHM_UTM32_NATIVE_BOX[3]);
        // ⛔ And the perimeter sampling is not decoration: the CORNER-only envelope is strictly inside
        // the perimeter one, i.e. a corner-only box would under-cover the region.
        const corners = [
            hs.wgs84ToUtm32(DHM_NATIONAL_BBOX[1], DHM_NATIONAL_BBOX[0]),
            hs.wgs84ToUtm32(DHM_NATIONAL_BBOX[1], DHM_NATIONAL_BBOX[2]),
            hs.wgs84ToUtm32(DHM_NATIONAL_BBOX[3], DHM_NATIONAL_BBOX[0]),
            hs.wgs84ToUtm32(DHM_NATIONAL_BBOX[3], DHM_NATIONAL_BBOX[2]),
        ] as Array<[number, number]>;
        const cornerMinY = Math.min(...corners.map((c) => c[1]));
        expect(cornerMinY).toBeGreaterThan(env[1]);
    });

    it('CH: the pinned LV95 box is the outward rounding of the documented envelope', () => {
        // proj4 does NOT resolve from the repo root (it is a standalone dep of tools/context-bake), so
        // the LV95 numbers cannot be recomputed here — which is precisely why the constant carries its
        // provenance in prose. What IS checkable without proj4: the pinned box is a whole-kilometre
        // OUTWARD rounding of the measured envelope [2480365, 1072037, 2837984, 1304416], and its grid
        // is the 358 × 233 the module header states.
        expect(SWISS_LV95_NATIVE_BOX[0]).toBeLessThanOrEqual(2480365);
        expect(SWISS_LV95_NATIVE_BOX[1]).toBeLessThanOrEqual(1072037);
        expect(SWISS_LV95_NATIVE_BOX[2]).toBeGreaterThanOrEqual(2837984);
        expect(SWISS_LV95_NATIVE_BOX[3]).toBeGreaterThanOrEqual(1304416);
        for (const v of SWISS_LV95_NATIVE_BOX) expect(v % 1000).toBe(0);
    });

    it('both WGS84 declarations are BYTE-EQUAL to their bake.mjs region row', () => {
        for (const [name, box] of [['switzerland', SWISS_NATIONAL_BBOX], ['denmark', DHM_NATIONAL_BBOX]] as Array<[string, number[]]>) {
            const row = bake.match(new RegExp(`name: '${name}'[\\s\\S]{0,900}?bbox: '([^']+)'`));
            expect(row, `${name} row bbox`).not.toBeNull();
            expect(row![1]!.split(',').map(Number), name).toEqual(box);
        }
    });
});

describe('§DHM-NATIONAL-SWEEP — bake.mjs hands the DK join the whole country', () => {
    it("stampBboxesFor returns DHM_NATIONAL_BBOXES, not the four cities", () => {
        const fn = bake.match(/function stampBboxesFor\(r\)\s*\{([\s\S]*?)\n\}/);
        expect(fn, 'stampBboxesFor').not.toBeNull();
        expect(fn![1]).toMatch(/r\.heightJoin === 'dhm'\)\s*return DHM_NATIONAL_BBOXES/);
        expect(fn![1]).not.toMatch(/r\.heightJoin === 'dhm'\)\s*return DHM_CITY_BBOXES/);
    });

    it('dispatches dhm to the NATIONAL wrapper while the band stamp stays imported', () => {
        expect(bake).toMatch(/import \{ stampDhmNationalHeightsOnGeojsonseq \} from '\.\/heights\/dhmNationalStamp\.mjs';/);
        expect(bake).toMatch(/if \(r\.heightJoin === 'dhm'\) res = await stampDhmNationalHeightsOnGeojsonseq\(baseGeo, stamped, wsen, \{ maxTiles, retainBboxes \}\)/);
        // mnhFr.spec.ts pins `'mds' || 'dhm' || 'lod2nrw' || 'mnh_fr'` as CONTIGUOUS TEXT — the band
        // stamp must therefore still be imported by name, and it is what each band actually runs.
        expect(bake).toMatch(/stampDhmHeightsOnGeojsonseq/);
    });

    it('the four cities survive as the UNCAPPED PRIORITY pass, and `blocked` still surfaces unchanged', () => {
        const wrapper = readFileSync(resolve(HERE, '../heights/dhmNationalStamp.mjs'), 'utf8');
        expect(wrapper).toMatch(/priorityBboxes = DHM_CITY_BBOXES\.map\(\(c\) => c\.bbox\)/);
        expect(wrapper).toMatch(/areaCrs: 'utm32', priorityCrs: 'wgs84'/);
        // ⛔ THE ONE THING A NATIONAL RETAIN SET MUST NOT DO: quieten a missing secret. Without
        // DATAFORDELER_API_KEY the join is `blocked` today, and the wrapper must return that verbatim.
        expect(wrapper).toMatch(/const blocked = run\.results\.find\(\(r\) => r\.status === 'blocked'\);\s*\n\s*if \(blocked\) return blocked;/);
    });

    it('the DK header records the KEYLESS capabilities probe that proves the reach, and the 403 that bounds the claim', () => {
        const wrapper = readFileSync(resolve(HERE, '../heights/dhmNationalStamp.mjs'), 'utf8');
        expect(wrapper).toContain('api.dataforsyningen.dk/dhm_wcs_DAF');
        expect(wrapper).toContain('8.00830949937517 54.4354651516217');
        expect(wrapper).toContain('15.5979112056959 57.7690657013977');
        expect(wrapper).toContain('User not authorized');
        // …and it must say, in the file itself, that this does not put heights on Danish buildings today.
        expect(wrapper).toMatch(/apikey-GATED/);
    });
});
