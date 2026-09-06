// §NATIONAL-SWEEP (2026-09-06, lane HEIGHTS-WHOLE-COUNTRY-A) — the shared whole-country kernel, and the
// four countries this lane moved from a CITY LIST to a WHOLE-COUNTRY retain set.
//
// WHAT THIS FILE IS DEFENDING. `stampBboxesFor(r)` is the single most load-bearing line in the bake:
// it is the difference between "the Netherlands has measured heights" and "six Dutch cities have
// measured heights and everywhere else silently ships the assumed 9 m". An unstamped footprint reports
// an honest `assumed` default, and on the map that is INDISTINGUISHABLE from "the source has no data
// here" (L-422/457/467/469) — which is exactly how Ciudad Real shipped without measured heights
// (L-12946) and how, until this lane, Maastricht, Liberec, Klagenfurt and Toulon did too.
//
// Three different things are pinned here, and they fail for three different reasons:
//   1. THE KERNEL's arithmetic — grid, swathes, order, cursor, km², truncation sentence. Pure, imported.
//   2. THE RETAIN SET IS THE COUNTRY — each `*_NATIONAL_BBOX` is BYTE-EQUAL to its bake.mjs region row.
//      A retain set smaller than the baked region is a permanent, silent hole
//      (§MDS-BBOX-MUST-COVER-THE-REGION); this reads BOTH files and compares, so it cannot drift.
//   3. THE WIRING — bake.mjs actually hands each join the national set, and the stamps actually accept
//      the band options. bake.mjs runs main() on import and cannot be loaded by vitest, so it is
//      asserted on TEXT, one assertion per place (the swissWiring / noWiring device).
// Plus the one thing text CANNOT check — that the multi-pass file plumbing conserves every record —
// which is spawned as a real Node run (nationalSweepConservation.harness.mjs).
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    nationalTileGrid, nationalCellBbox, nationalCellKm2, nationalSwathes, nationalSweepOrder,
    intersectAreas, resolveSweepCursor, resolveSwatheRows, makeSweepBudget,
    sweepPopulatedCells, formatNationalSweepSummary,
    NL_3DBAG_NATIONAL_BBOX, CZ_CUZK_NATIONAL_BBOX, AT_BEV_NATIONAL_BBOX, MNH_FR_NATIONAL_BBOX,
} from '../heights/nationalSweep.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const bake = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
const ledger = readFileSync(resolve(HERE, '../../coverage-ledger/build.mjs'), 'utf8');

describe('§NATIONAL-SWEEP — the shared kernel', () => {
    const bbox: [number, number, number, number] = [0, 0, 1, 0.5];
    const grid = nationalTileGrid(bbox, { lonDeg: 0.1, latDeg: 0.1 });

    it('tiles the region, and ord is row-major south→north / west→east', () => {
        expect([grid.nx, grid.ny]).toEqual([10, 5]);
        expect(grid.ordOf(0, 0)).toBe(0);
        expect(grid.ordOf(3, 2)).toBe(23);
        expect([grid.ixOf(23), grid.iyOf(23)]).toEqual([3, 2]);
    });

    it('clips the last row and column to the region bbox instead of overhanging it', () => {
        const g = nationalTileGrid([0, 0, 0.25, 0.25], { lonDeg: 0.1, latDeg: 0.1 });
        expect(g.nx).toBe(3);
        expect(nationalCellBbox(g, 2, 2)).toEqual([0.2, 0.2, 0.25, 0.25]);
        expect(nationalCellKm2(g, 0, 0)).toBeGreaterThan(0);
    });

    it('sweeps on the NUMERIC ord, never lexicographically — "2,3" before "10,3"', () => {
        // ⛔ THE SCAR THIS PINS (mdsNational's): `[...buckets.keys()].sort()` is a STRING sort, so it
        // put "10,3" before "2,3" and a capped run's stopping point was not a line across the country
        // — which made the resume cursor meaningless.
        const order = nationalSweepOrder(['10,3', '2,3', '0,4'], grid).map((c) => c.key);
        expect(order).toEqual(['2,3', '10,3', '0,4']);
    });

    it('the resume cursor drops exactly the cells a previous run already covered', () => {
        const all = nationalSweepOrder(['0,0', '5,0', '0,1'], grid);
        expect(all.map((c) => c.ord)).toEqual([0, 5, 10]);
        expect(nationalSweepOrder(['0,0', '5,0', '0,1'], grid, 5).map((c) => c.ord)).toEqual([5, 10]);
        expect(nationalSweepOrder(['0,0', '5,0', '0,1'], grid, 6).map((c) => c.ord)).toEqual([10]);
    });

    it('swathes PARTITION the rows — every row in exactly one band, no gap and no overlap', () => {
        // This is what makes the band chain safe: bands partition LATITUDE, so a footprint is retained
        // by exactly one band and nothing is stamped twice or dropped.
        const sw = nationalSwathes(grid, { swatheRows: 2 });
        expect(sw.map((b) => [b.iy0, b.iy1])).toEqual([[0, 2], [2, 4], [4, 5]]);
        const covered: number[] = [];
        for (const b of sw) for (let iy = b.iy0; iy < b.iy1; iy++) covered.push(iy);
        expect(covered).toEqual([0, 1, 2, 3, 4]);
        // and the ord ranges are contiguous and non-overlapping
        expect(sw.map((b) => [b.ordFrom, b.ordTo])).toEqual([[0, 20], [20, 40], [40, 50]]);
    });

    it('a band may NARROW the working set but never widen it', () => {
        // §JOIN-BOUNDED-WORKING-SET — an empty intersection means "this band holds none of the declared
        // working set", which is a SKIP. Falling back to the whole band would silently widen where the
        // join is allowed to measure.
        expect(intersectAreas([[0, 0, 1, 1]], [0.2, 0.2, 0.4, 0.4])).toEqual([[0.2, 0.2, 0.4, 0.4]]);
        expect(intersectAreas([[0, 0, 0.1, 0.1]], [0.5, 0.5, 0.6, 0.6])).toEqual([]);
        expect(intersectAreas([], [0, 0, 1, 1])).toEqual([]);
    });

    it('a cursor / swathe-rows value that is not a positive number falls back safely, never throws', () => {
        expect(resolveSweepCursor(null, undefined)).toBe(0);
        expect(resolveSweepCursor(null, '')).toBe(0);
        expect(resolveSweepCursor(null, 'banana')).toBe(0);
        expect(resolveSweepCursor(null, '-4')).toBe(0);
        expect(resolveSweepCursor(null, '1234')).toBe(1234);
        // 0 rows is a MEANINGFUL value: single pass, which is what a city-sized caller wants.
        expect(resolveSwatheRows(0, null, 6)).toBe(0);
        expect(resolveSwatheRows(null, null, 6)).toBe(6);
        expect(resolveSwatheRows(null, '3', 6)).toBe(3);
    });

    it('maxTiles: 0 means ZERO cells — it is a real budget, not an unset default', () => {
        // ⛔ This was a real bug for exactly one harness run: `Number(maxTiles) > 0 ? … : 4000` turned
        // "open no cell" into "open 4000 cells", i.e. into a live network sweep.
        expect(makeSweepBudget({ maxTiles: 0 }).maxTiles).toBe(0);
        expect(makeSweepBudget({}).maxTiles).toBe(4000);
        expect(makeSweepBudget({ maxTiles: 'banana' as unknown as number }).maxTiles).toBe(4000);
    });

    it('the sweep stops at a cell BOUNDARY and reports the exact ord it did not run', async () => {
        const buckets = new Map<string, number[]>([['0,0', [1]], ['1,0', [1]], ['2,0', [1]]]);
        const budget = makeSweepBudget({ maxTiles: 2 });
        const seen: string[] = [];
        await sweepPopulatedCells({ buckets, grid, budget, onCell: async (c: { key: string }) => { seen.push(c.key); return true; } });
        expect(seen).toEqual(['0,0', '1,0']);
        expect(budget.stopReason).toBe('maxTiles 2');
        expect(budget.nextCursor).toBe(grid.ordOf(2, 0));   // the FIRST cell that did not run
        expect(budget.cellsStamped).toBe(2);
        expect(budget.cellsSkipped).toBe(1);
        expect(budget.km2Skipped).toBeGreaterThan(0);
    });

    it('a truncated run says WHY it stopped, how much it skipped, and how to resume', () => {
        // §ABORT-IS-NOT-A-CAP / §LOUD-AND-ORDERED-TRUNCATION — a sweep that stopped early and said
        // nothing is a LIE about coverage, because the footprints it never reached look exactly like
        // footprints the source has no data for.
        const note = formatNationalSweepSummary(
            { stopReason: 'time budget 5400 s', cellsStamped: 12, km2Stamped: 1200, cellsSkipped: 900, km2Skipped: 88000, swathesTotal: 10, swathesScanned: 3, nextCursor: 4711, nextCursorLat: 47.5, nextCursorLon: 12.25 },
            { label: 'ČÚZK national sweep', cursorEnv: 'CZ_SWEEP_CURSOR' },
        );
        expect(note).toContain('TRUNCATED (time budget 5400 s)');
        expect(note).toContain('88,000 km² SKIPPED');
        expect(note).toContain('7 swathe(s) never opened');
        expect(note).toContain('RESUME with CZ_SWEEP_CURSOR=4711');
        expect(note).toContain('lat 47.500');
        // …and a complete run says so plainly, with no resume noise.
        const done = formatNationalSweepSummary({ stopReason: 'complete', cellsStamped: 4, km2Stamped: 40, swathesTotal: 2, swathesScanned: 2 }, { label: 'x' });
        expect(done).toContain('COMPLETE');
        expect(done).not.toContain('RESUME');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §NATIONAL-RETAIN-SETS — the invariant that makes "whole-country" true rather than merely named.
// ─────────────────────────────────────────────────────────────────────────────
const NATIONAL = [
    { region: 'netherlands', key: '3dbag', constant: 'NL_3DBAG_NATIONAL_BBOXES', bbox: NL_3DBAG_NATIONAL_BBOX, stamp: 'stampNl3dbagNationalHeightsOnGeojsonseq', cityList: 'NL_3DBAG_CITY_BBOXES' },
    { region: 'czechia', key: 'cuzk_cz', constant: 'CZ_CUZK_NATIONAL_BBOXES', bbox: CZ_CUZK_NATIONAL_BBOX, stamp: 'stampCzNationalHeightsOnGeojsonseq', cityList: 'CZ_CITY_BBOXES' },
    { region: 'austria', key: 'bev_at', constant: 'AT_BEV_NATIONAL_BBOXES', bbox: AT_BEV_NATIONAL_BBOX, stamp: 'stampAtNationalHeightsOnGeojsonseq', cityList: 'AT_CITY_BBOXES' },
    { region: 'france', key: 'mnh_fr', constant: 'MNH_FR_NATIONAL_BBOXES', bbox: MNH_FR_NATIONAL_BBOX, stamp: 'stampMnhFrNationalHeightsOnGeojsonseq', cityList: 'MNH_FR_CITY_BBOXES' },
];

describe('§NATIONAL-RETAIN-SETS — the retain set IS the baked region, read from both files', () => {
    for (const c of NATIONAL) {
        it(`${c.constant} is BYTE-EQUAL to the bake.mjs \`${c.region}\` row bbox`, () => {
            // ⛔ A retain set SMALLER than the baked region is a permanent, silent hole: the footprints
            // outside it can never be measured by any number of re-bakes, and they ship the labelled
            // `assumed` default. Reading BOTH sides here is what stops the two drifting apart.
            const row = bake.match(new RegExp(`\\{\\s*name:\\s*'${c.region}'[\\s\\S]{0,600}?bbox:\\s*'([-0-9.,]+)'`));
            expect(row, `${c.region} row bbox`).not.toBeNull();
            const fromBake = row![1].split(',').map(Number);
            expect(fromBake).toEqual(c.bbox);
        });

        it(`stampBboxesFor('${c.key}') returns ${c.constant} — the whole country, not a city list`, () => {
            const fn = bake.match(/function stampBboxesFor\(r\)\s*\{([\s\S]*?)\n\}/);
            expect(fn, 'stampBboxesFor').not.toBeNull();
            expect(fn![1]).toMatch(new RegExp(`r\\.heightJoin === '${c.key}'\\)\\s*return ${c.constant}`));
        });

        it(`bake.mjs dispatches '${c.key}' to ${c.stamp}`, () => {
            expect(bake).toContain(c.stamp);
        });

        it(`the city list ${c.cityList} SURVIVES as the priority order — it is demoted, not deleted`, () => {
            // §MDS-LIST-IS-PRIORITY-ONLY. Dropping the metros' guaranteed uncapped pass would make a
            // truncated national run strictly worse for the most users than the city-list join was.
            expect(bake).toContain(c.cityList);
        });
    }

    it('the coverage ledger reads these as WHOLE-COUNTRY (its own regex, run here against bake.mjs)', () => {
        // ⭐ THE LEDGER IS THE SCOREBOARD, and it decides scope from the CONSTANT'S NAME. If this ever
        // stops matching, the ledger silently prints "city list" for a national join — the same class of
        // defect as a stale hand-copied count. So the ledger's own extraction is re-run here.
        expect(ledger).toContain("/heightJoin === '([a-z0-9_]+)'\\)\\s*return\\s+([A-Z0-9_]+)/g");
        const body = bake.slice(bake.indexOf('function stampBboxesFor(r)'));
        const fn = body.slice(0, body.indexOf('\n}\n'));
        const dispatch: Record<string, string> = {};
        for (const m of fn.matchAll(/heightJoin === '([a-z0-9_]+)'\)\s*return\s+([A-Z0-9_]+)/g)) dispatch[m[1]] = m[2];
        for (const c of NATIONAL) {
            expect(dispatch[c.key], `${c.key} dispatch`).toBe(c.constant);
            expect(/NATIONAL/.test(dispatch[c.key]), `${c.key} scope`).toBe(true);
        }
    });
});

describe('§NATIONAL-SWEEP — the stamps accept the band options (a whole-country retain set needs a heap bound)', () => {
    const STAMPS = [
        ['../heights/nl3dbagStamp.mjs', 'stampNl3dbagHeightsOnGeojsonseq'],
        ['../heights/czHeightsStamp.mjs', 'stampCzHeightsOnGeojsonseq'],
        ['../heights/atHeightsStamp.mjs', 'stampAtHeightsOnGeojsonseq'],
        ['../heightSources.mjs', 'stampMnhFrHeightsOnGeojsonseq'],
    ] as const;
    for (const [path, fn] of STAMPS) {
        it(`${fn} takes passThroughPath / retainedOutPath / sweepBudget / sweepGrid`, () => {
            // Without these four a "whole-country retain set" is just the 4.04 GB abort of run
            // 30693132326 with a bigger input: one pass would hold every footprint in the country.
            const src = readFileSync(resolve(HERE, path), 'utf8');
            const sig = src.slice(src.indexOf(`export async function ${fn}(`));
            const head = sig.slice(0, sig.indexOf('} = {}) {'));
            for (const opt of ['passThroughPath', 'retainedOutPath', 'sweepBudget', 'sweepGrid']) {
                expect(head, `${fn} ${opt}`).toContain(`${opt} = null`);
            }
            // and the pass-through must actually be routed, not merely accepted
            expect(src).toContain('loadJoinFootprintsBounded(inPath, passThroughPath ?? outPath');
            expect(src).toContain('retainedOutPath ?? outPath');
        });
    }
});

describe('§NATIONAL-SWEEP — the band chain conserves every record (spawned, real files, no network)', () => {
    it('a maximally-truncated national run drops, duplicates and fabricates NOTHING', () => {
        // Spawned because these modules import heightSources.mjs, which vitest cannot transform.
        const out = execFileSync(process.execPath, [resolve(HERE, 'nationalSweepConservation.harness.mjs')], {
            encoding: 'utf8', timeout: 120_000,
        });
        const res = JSON.parse(out.slice(out.indexOf('{')));
        for (const mode of ['national', 'single-pass'] as const) {
            const r = res[mode];
            expect(r.status, `${mode} status`).toBe('ok');
            expect(r.outCount, `${mode} record count`).toBe(r.inCount);
            expect(r.distinctIds, `${mode} distinct ids`).toBe(r.inCount);
            expect(r.unchanged, `${mode} properties byte-identical`).toBe(true);
            // ⛔ NOTHING FABRICATED: the sweep opened zero cells, so no footprint may carry the measured
            // marker. A stamp that guessed here would be worse than the hole this lane closed.
            expect(r.markerCount, `${mode} measured markers`).toBe(0);
            expect(r.measuredCount, `${mode} measuredCount`).toBe(0);
            // …and it must SAY it was truncated, with a resume cursor. Silence is the defect.
            expect(r.stopReason, `${mode} stopReason`).toBe('maxTiles 0');
            expect(r.noteMentionsTruncated, `${mode} note says TRUNCATED`).toBe(true);
            expect(r.noteMentionsResume, `${mode} note carries the resume cursor`).toBe(true);
            expect(r.cellsSkipped, `${mode} skipped cells counted`).toBeGreaterThan(0);
            expect(r.km2SkippedPositive, `${mode} skipped km² counted`).toBe(true);
        }
        // The banded run really did band: ten passes over the Netherlands at 8 rows of 0.04°.
        expect(res.national.swathesTotal).toBeGreaterThan(1);
        expect(res['single-pass'].swathesTotal).toBe(1);
    });
});
