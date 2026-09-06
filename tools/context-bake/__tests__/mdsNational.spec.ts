// §MDS-NATIONAL-SWEEP (L-12946, 2026-09-06, lane ES-WHOLE-COUNTRY-HEIGHTS)
//
// WHY THIS TEST EXISTS
// --------------------
// `MDS_CITY_BBOXES` was BOTH the height join's priority order AND its retain set, and the second
// half made every Spanish town outside nine metros PERMANENTLY unmeasurable. The failure was
// silent: an unstamped footprint reports an honest `assumed` 9 m, which on the map is
// indistinguishable from "the national source has no data here" — the failure-vs-empty family
// (L-422 / L-457 / L-467 / L-469), and the same shape as §MURCIA-HEIGHT-STAMP-GAP one level up.
// Founder, 2026-09-06, standing in Ciudad Real: "still a big Spanish city, but the buildings don't
// have real baked heights."
//
// The fix is not "add Ciudad Real to the list" — that reproduces the defect for the next town. The
// retain set is now the WHOLE COUNTRY, the list is a PRIORITY ORDER, and the heap is bounded by
// swathe passes. This spec pins all three, plus the two things that would silently undo them:
//   • the national bbox drifting away from the bake.mjs `spain` row (a hole nothing would report);
//   • the tile spans drifting past the service's MEASURED MAXSIZE=4096 ceiling (every tile would
//     answer HTTP 400 and the whole country would report an honest-looking zero).
//
// ⚠ `heightSources.mjs` cannot be imported by vitest — vite's transform rejects it with a bare
// `SyntaxError: Invalid or unexpected token` (recorded in mdsBboxCoversTerrainRegion.spec.ts, still
// true 2026-09-06). So its half is read as TEXT, exactly like its siblings, while the PURE half
// (heights/mdsNational.mjs) is imported for real. The one thing text cannot check — that the
// multi-pass file plumbing conserves every record — is checked by RUNNING it, through the spawned
// harness at the bottom.
//
// LAYERING: a build-tooling test, like its siblings — no OTel span (P8 applies to exported package
// functions, not bake tooling).
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    MDS_MAXSIZE_PX, MDS_DEG_PER_PX_LAT, MDS_DEG_PER_PX_LON,
    MDS_MAX_SPAN_LAT_DEG, MDS_MAX_SPAN_LON_DEG,
    MDS_TILE_LAT_DEG, MDS_TILE_LON_DEG, MDS_NATIONAL_BBOX, MDS_NATIONAL_BBOXES, MDS_SWATHE_ROWS,
    mdsTileGrid, mdsCellBbox, mdsCellKm2, mdsNationalSwathes, sweepOrder, sweepBatches, formatSweepSummary,
    // @ts-expect-error — plain .mjs bake tooling, no type declarations (mnhFr.spec.ts does the same).
} from '../heights/mdsNational.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const bake = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
const heightSources = readFileSync(resolve(HERE, '../heightSources.mjs'), 'utf8');
const workflow = readFileSync(resolve(HERE, '../../../.github/workflows/context-bake.yml'), 'utf8');

type Bbox = [number, number, number, number];

/** The `spain` row's bbox, read from bake.mjs — the SOURCE of truth for what gets baked. */
function spainRegionBbox(): Bbox {
    const m = /name:\s*'spain',[\s\S]*?bbox:\s*'([-\d.,]+)'/.exec(bake);
    expect(m, 'the bake.mjs `spain` region row').not.toBeNull();
    return m![1]!.split(',').map(Number) as Bbox;
}

/** Rows of an exported `[{ city, bbox: [...] }]` table in heightSources.mjs, IN SOURCE ORDER. */
function cityRows(constName: string): Array<{ city: string; bbox: Bbox }> {
    const i = heightSources.indexOf(`export const ${constName}`);
    expect(i, `${constName} declaration`).toBeGreaterThan(-1);
    const body = heightSources.slice(i, heightSources.indexOf('];', i) + 1);
    const re = /\{\s*city:\s*'([a-z0-9-]+)'[^}]*?bbox:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g;
    return [...body.matchAll(re)].map((m) => ({
        city: m[1]!,
        bbox: [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])] as Bbox,
    }));
}

const inside = (b: Bbox, lon: number, lat: number) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];

// The founder's city, and the second CI gate city beside it.
const CIUDAD_REAL: [number, number] = [-3.9271, 38.9861];
const TOLEDO: [number, number] = [-4.0273, 39.8628];

describe('§MDS-NATIONAL-BBOX — the retain set is the WHOLE COUNTRY, and it is the baked country', () => {
    it('is BYTE-IDENTICAL to the bake.mjs `spain` region row', () => {
        // A retain bbox smaller than the baked region is a silent, permanent hole that no number of
        // re-bakes can fill — §MDS-BBOX-MUST-COVER-THE-REGION, now at national scale.
        expect(MDS_NATIONAL_BBOX).toEqual(spainRegionBbox());
        expect(MDS_NATIONAL_BBOXES).toEqual([MDS_NATIONAL_BBOX]);
    });

    it('contains Ciudad Real and Toledo — the two cities the OLD nine-bbox working set could NEVER stamp', () => {
        expect(inside(MDS_NATIONAL_BBOX, ...CIUDAD_REAL)).toBe(true);
        expect(inside(MDS_NATIONAL_BBOX, ...TOLEDO)).toBe(true);
        // …and the defect itself, pinned so the fix cannot be quietly reverted to "add a city".
        const old = cityRows('MDS_CITY_BBOXES').map((r) => r.bbox);
        expect(old.some((b) => inside(b, ...CIUDAD_REAL)), 'ciudad real was in NO metro bbox').toBe(false);
        expect(old.some((b) => inside(b, ...TOLEDO)), 'toledo was in NO metro bbox').toBe(false);
    });

    it('contains every metro bbox, so widening the retain set lost no city', () => {
        for (const row of cityRows('MDS_CITY_BBOXES')) {
            const [w, s, e, n] = row.bbox;
            expect(inside(MDS_NATIONAL_BBOX, w, s) && inside(MDS_NATIONAL_BBOX, e, n), `${row.city} outside the national bbox`).toBe(true);
        }
    });
});

describe('§MDS-PRIORITY-ORDER — the list survives as an ORDER, and the nine metros stay first', () => {
    it('MDS_PRIORITY_BBOXES = the nine metros in their existing order, then the gate cities', () => {
        const metros = cityRows('MDS_CITY_BBOXES').map((r) => r.city);
        const extra = cityRows('MDS_PRIORITY_EXTRA').map((r) => r.city);
        expect(metros).toEqual(['barcelona', 'cordoba', 'madrid', 'valencia', 'sevilla', 'malaga', 'zaragoza', 'bilbao', 'murcia']);
        expect(extra).toEqual(['ciudadreal', 'toledo']);
        expect(heightSources).toMatch(/export const MDS_PRIORITY_BBOXES = \[\.\.\.MDS_CITY_BBOXES, \.\.\.MDS_PRIORITY_EXTRA\]/);
    });

    it('bake.mjs passes the PRIORITY list as priorityBboxes and the NATIONAL list as retainBboxes', () => {
        expect(bake).toMatch(/r\.heightJoin === 'mds' \? MDS_PRIORITY_BBOXES\.map\(\(c\) => c\.bbox\)/);
        expect(bake).toMatch(/if \(r\.heightJoin === 'mds'\) return MDS_NATIONAL_BBOXES;/);
        // The old line is the defect. If it comes back, so does Ciudad Real's fabricated 9 m.
        expect(bake).not.toMatch(/if \(r\.heightJoin === 'mds'\) return MDS_CITY_BBOXES\.map/);
    });

    it('the OFFICIAL-FOOTPRINT working set still reads MDS_CITY_BBOXES, NOT the priority list', () => {
        // §FOOTPRINT-BUDGET (L-12939): one Catastro municipality is ~250 s of GML. Routing the
        // priority list here would silently add ~8 min of parsing to every `--footprints official`
        // run for two cities that need HEIGHTS, not official footprints. Heights are a SUPERSET of
        // the footprint set — never a subset — which is the only direction that is safe.
        const row = /es_catastro:\s*\{[\s\S]*?\n\s{2}\},/.exec(bake);
        expect(row, 'FOOTPRINT_SOURCES.es_catastro').not.toBeNull();
        expect(row![0]).toContain('defaultBboxes: () => MDS_CITY_BBOXES.map((c) => c.bbox)');
        expect(row![0]).not.toContain('MDS_PRIORITY_BBOXES');
    });
});

describe('§MDS-NATIONAL-TILING — the tile is the MEASURED service ceiling, never a guess', () => {
    it('records the ceiling the service itself stated (MAXSIZE=4096) and the grid it serves', () => {
        expect(MDS_MAXSIZE_PX).toBe(4096);
        // Derived from the 0.08° answer: 2615 × 3367 px, byte-identical at 36.0 / 39.0 / 43.5 N.
        expect(MDS_DEG_PER_PX_LAT).toBeCloseTo(0.08 / 3367, 12);
        expect(MDS_DEG_PER_PX_LON).toBeCloseTo(0.08 / 2615, 12);
        expect(MDS_MAX_SPAN_LAT_DEG).toBeCloseTo(0.09732, 4);
        expect(MDS_MAX_SPAN_LON_DEG).toBeCloseTo(0.12531, 4);
    });

    it('the REQUESTED box (span + 2×padDeg) stays under 4096 px on BOTH axes', () => {
        // The join adds `padDeg` on every side before asking. A span chosen against the bare
        // ceiling would be refused at EVERY tile, and a whole-country run of HTTP 400s reports a
        // perfectly honest-looking zero measured heights.
        const PAD = 0.0015; // heightSources.mjs stampMdsHeightsOnGeojsonseq default
        expect(heightSources).toMatch(/padDeg = 0\.0015/);
        const pxLat = (MDS_TILE_LAT_DEG + 2 * PAD) / MDS_DEG_PER_PX_LAT;
        const pxLon = (MDS_TILE_LON_DEG + 2 * PAD) / MDS_DEG_PER_PX_LON;
        expect(pxLat).toBeLessThan(MDS_MAXSIZE_PX);
        expect(pxLon).toBeLessThan(MDS_MAXSIZE_PX);
        // …with real margin, not one rounding away from a national outage.
        expect(pxLat).toBeLessThan(MDS_MAXSIZE_PX * 0.98);
    });

    it('reproduces the REFUSED case: a 0.10° span exceeds the ceiling on latitude', () => {
        // Probed 2026-09-06: 0.095° → HTTP 200 image/tiff 24,868,075 B; 0.100° → HTTP 400
        // "…must be no more than MAXSIZE=4096." at 36.0 N, 39.0 N and 43.5 N alike.
        expect(0.095 / MDS_DEG_PER_PX_LAT).toBeLessThan(MDS_MAXSIZE_PX);
        expect(0.100 / MDS_DEG_PER_PX_LAT).toBeGreaterThan(MDS_MAXSIZE_PX);
    });

    it('bake.mjs actually passes the measured spans to the join (a constant nothing reads is not wiring)', () => {
        expect(bake).toMatch(/tileSpanLonDeg: MDS_TILE_LON_DEG, tileSpanLatDeg: MDS_TILE_LAT_DEG/);
        expect(bake).toMatch(/swatheRows: MDS_SWATHE_ROWS, concurrency: MDS_SWEEP_CONCURRENCY/);
        expect(bake).toMatch(/startCursor: Number\(process\.env\.MDS_SWEEP_CURSOR \?\? 0\) \|\| 0/);
    });

    it('the national grid covers Spain and both gate cities land in a real cell', () => {
        const grid = mdsTileGrid(MDS_NATIONAL_BBOX, { lonDeg: MDS_TILE_LON_DEG, latDeg: MDS_TILE_LAT_DEG });
        expect(grid.nx * grid.lonDeg).toBeGreaterThanOrEqual(MDS_NATIONAL_BBOX[2] - MDS_NATIONAL_BBOX[0]);
        expect(grid.ny * grid.latDeg).toBeGreaterThanOrEqual(MDS_NATIONAL_BBOX[3] - MDS_NATIONAL_BBOX[1]);
        for (const [lon, lat] of [CIUDAD_REAL, TOLEDO]) {
            const [w, s, e, n] = mdsCellBbox(grid, grid.cellIx(lon), grid.cellIy(lat));
            expect(lon).toBeGreaterThanOrEqual(w); expect(lon).toBeLessThanOrEqual(e);
            expect(lat).toBeGreaterThanOrEqual(s); expect(lat).toBeLessThanOrEqual(n);
        }
        // ~100 km² per cell at Spanish latitudes — the number the "km² stamped vs skipped" log uses.
        const km2 = mdsCellKm2(grid, grid.cellIx(CIUDAD_REAL[0]), grid.cellIy(CIUDAD_REAL[1]));
        expect(km2).toBeGreaterThan(90);
        expect(km2).toBeLessThan(115);
    });
});

describe('§MDS-SWATHE — the heap bound is a pass plan, and it partitions the country exactly once', () => {
    const grid = mdsTileGrid(MDS_NATIONAL_BBOX, { lonDeg: MDS_TILE_LON_DEG, latDeg: MDS_TILE_LAT_DEG });
    const swathes = mdsNationalSwathes(grid, { swatheRows: MDS_SWATHE_ROWS });

    it('bands are whole tile rows, contiguous, south→north, and cover the region', () => {
        expect(swathes.length).toBeGreaterThan(1);
        expect(swathes[0].iy0).toBe(0);
        expect(swathes.at(-1)!.iy1).toBe(grid.ny);
        for (let i = 1; i < swathes.length; i++) {
            expect(swathes[i].iy0, 'no gap and no overlap between bands').toBe(swathes[i - 1].iy1);
            expect(swathes[i].bbox[1]).toBeGreaterThan(swathes[i - 1].bbox[1]);
        }
        // Whole ROWS matter: a band boundary inside a cell would fetch that cell's raster twice.
        for (const sw of swathes) expect((sw.iy1 - sw.iy0) <= MDS_SWATHE_ROWS).toBe(true);
    });

    it('every point in Spain — Ciudad Real and Toledo included — lands in EXACTLY ONE band', () => {
        for (const [lon, lat] of [CIUDAD_REAL, TOLEDO, [2.16, 41.39] as [number, number], [-8.41, 43.36] as [number, number]]) {
            const hits = swathes.filter((sw) => lat >= sw.bbox[1] && lat < sw.bbox[3] && lon >= sw.bbox[0] && lon <= sw.bbox[2]);
            expect(hits.length, `lat ${lat} lon ${lon}`).toBe(1);
        }
    });

    it('band ord ranges are contiguous, so ONE monotonic cursor resumes across bands', () => {
        expect(swathes[0].ordFrom).toBe(0);
        for (let i = 1; i < swathes.length; i++) expect(swathes[i].ordFrom).toBe(swathes[i - 1].ordTo);
        expect(swathes.at(-1)!.ordTo).toBe(grid.nx * grid.ny);
    });
});

describe('§SWEEP-ORDER — deterministic, numeric, and resumable', () => {
    const grid = mdsTileGrid(MDS_NATIONAL_BBOX, { lonDeg: MDS_TILE_LON_DEG, latDeg: MDS_TILE_LAT_DEG });

    it('orders by cell ord, NOT lexicographically ("10,3" must not sort before "2,3")', () => {
        const order = sweepOrder(['10,3', '2,3', '2,4'], grid).map((c: { key: string }) => c.key);
        expect(order).toEqual(['2,3', '10,3', '2,4']);
    });

    it('the cursor drops everything already swept and keeps the rest in order', () => {
        const all = sweepOrder(['2,3', '10,3', '2,4'], grid);
        const resumed = sweepOrder(['2,3', '10,3', '2,4'], grid, all[1].ord);
        expect(resumed.map((c: { key: string }) => c.key)).toEqual(['10,3', '2,4']);
    });

    it('batches preserve order, so "the first cell of the first incomplete batch" is exact', () => {
        const cells = sweepOrder(['0,0', '1,0', '2,0', '3,0', '4,0'], grid);
        const batches = sweepBatches(cells, 2);
        expect(batches.map((b: Array<{ key: string }>) => b.map((c) => c.key))).toEqual([['0,0', '1,0'], ['2,0', '3,0'], ['4,0']]);
    });
});

describe('§LOUD-AND-ORDERED-TRUNCATION — a truncated run says what it did NOT do', () => {
    it('a complete sweep says so plainly', () => {
        const s = formatSweepSummary({ stopReason: 'complete', cellsStamped: 12, km2Stamped: 1200, swathesScanned: 15, swathesTotal: 15 });
        expect(s).toContain('COMPLETE');
        expect(s).not.toContain('RESUME');
    });

    it('a truncated sweep carries the reason, the km² SKIPPED, the unopened bands and a cursor', () => {
        // §ABORT-IS-NOT-A-CAP and the failure-vs-empty family: a run that stops early and reports
        // only what it DID is indistinguishable from a run that found nothing.
        const s = formatSweepSummary({
            stopReason: 'time-budget', cellsStamped: 900, cellsSkipped: 4100,
            km2Stamped: 89_000, km2Skipped: 410_000, swathesScanned: 4, swathesTotal: 15,
            nextCursor: 4321, nextCursorLat: 39.5, nextCursorLon: -3.9,
        });
        expect(s).toContain('TRUNCATED (time-budget)');
        expect(s).toContain('89,000 km² stamped');
        expect(s).toContain('410,000 km² SKIPPED');
        expect(s).toContain('11 swathe(s) never opened');
        expect(s).toContain('MDS_SWEEP_CURSOR=4321');
        expect(s).toContain('never fabricated');
    });
});

describe('§MEASURED-HEIGHT-GATE — the CI rows that make the old defect unshippable', () => {
    it('context-bake.yml spot-checks a NON-priority Spanish city, in the `spain` region', () => {
        // A Spanish bake that stamps only the nine capitals must FAIL. Before these rows it passed:
        // barcelona was the only Spanish row, so Ciudad Real's fabricated 9 m carpet shipped green.
        expect(workflow).toMatch(/^\s*ciudadreal spain 38\.9861,-3\.9271 200$/m);
        expect(workflow).toMatch(/^\s*toledo spain 39\.8628,-4\.0273 200$/m);
    });

    it('both gate cities are in the PRIORITY list, so the gate does not depend on the sweep budget', () => {
        const extra = cityRows('MDS_PRIORITY_EXTRA');
        for (const [city, lon, lat] of [['ciudadreal', ...CIUDAD_REAL], ['toledo', ...TOLEDO]] as Array<[string, number, number]>) {
            const row = extra.find((r) => r.city === city);
            expect(row, `${city} in MDS_PRIORITY_EXTRA`).toBeDefined();
            expect(inside(row!.bbox, lon, lat), `${city} gate coordinate inside its own priority bbox`).toBe(true);
        }
    });
});

describe('§RECORD-CONSERVATION — the multi-pass driver loses, duplicates and fabricates nothing', () => {
    // Run for real (see mdsSwatheConservation.harness.mjs for why it is spawned, not imported).
    // `maxTiles: 0` means ZERO network requests — this is the maximally-truncated national run, and
    // every footprint in the country must still come out exactly as it went in.
    const raw = execFileSync(process.execPath, [resolve(HERE, 'mdsSwatheConservation.harness.mjs')], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    // The join PRINTS its progress on stdout — that loudness is the feature, not noise — so the
    // machine-readable half is fenced rather than assumed to be the whole stream.
    const fenced = raw.split('===MDS-HARNESS-JSON===');
    expect(fenced.length, `harness produced no JSON block:\n${raw}`).toBe(2);
    const got = JSON.parse(fenced[1]!) as Record<string, {
        status: string; inCount: number; outCount: number; uniqueIds: number; tagsPreserved: boolean;
        fabricated: number; measuredCount: number; cellsSkipped: number; km2Skipped: number; nextCursor: number;
        stopReason: string | null; note: string;
    }>;

    for (const mode of ['national', 'single-pass']) {
        it(`${mode}: every input footprint appears exactly once, with its ORIGINAL tags`, () => {
            const r = got[mode]!;
            expect(r.status).toBe('ok');
            expect(r.outCount).toBe(r.inCount);
            expect(r.uniqueIds).toBe(r.inCount);
            expect(r.tagsPreserved, 'an untouched footprint must keep its OSM tags byte for byte').toBe(true);
        });

        it(`${mode}: an unsampled footprint is NEVER given a height, and is counted separately`, () => {
            const r = got[mode]!;
            expect(r.fabricated).toBe(0);
            expect(r.measuredCount).toBe(0);
            expect(r.cellsSkipped).toBeGreaterThan(0);
            expect(r.km2Skipped).toBeGreaterThan(0);
        });
    }

    it('the national run reports the truncation loudly, with a resume cursor', () => {
        const r = got.national!;
        expect(r.stopReason).toBe('tile-cap');
        expect(r.note).toContain('TRUNCATED');
        expect(r.note).toContain('MDS_SWEEP_CURSOR=');
        expect(r.nextCursor).toBeGreaterThan(0);
    });
});
