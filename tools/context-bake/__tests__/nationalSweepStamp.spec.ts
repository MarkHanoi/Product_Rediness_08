// ─────────────────────────────────────────────────────────────────────────────
// §NATIONAL-SWEEP-DRIVER (lane HEIGHTS-WHOLE-COUNTRY-B, 2026-09-06) — the invariants that make a
// whole-country retain set SAFE to declare. No network: `stampCell` is a stub, so what is under test
// is the driver's own bookkeeping — which is exactly where a national sweep can silently lose data.
//
// The four things pinned here, and the defect each one forbids:
//   1. CONSERVATION — every input record leaves in the output EXACTLY ONCE, in every mode (single pass,
//      priority + bands, truncated). A band-based sweep writes through two files; dropping or doubling a
//      record there would show on the map as a missing or double-drawn building.
//   2. PRIORITY — the declared city list is stamped even when the national budget is spent BEFORE the
//      first band. Widening the retain set to a nation must never cost the cities that work today.
//   3. CURSOR — a truncated run names the ord of the first cell it did NOT open, and a resumed run
//      starting there stamps exactly the remainder: no cell is skipped, none is stamped twice.
//   4. FAILURE ≠ EMPTY — `ok:false` counts a tileError and `ok:true,empty:true` counts a voidTile, and
//      an unstamped footprint keeps its ORIGINAL tags either way (L-422/457/467/469).
// ─────────────────────────────────────────────────────────────────────────────
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error — .mjs toolchain module, no types
import { runNationalSweep } from '../heights/nationalSweepStamp.mjs';
// @ts-expect-error — .mjs toolchain module, no types
import { nationalTileGrid } from '../heights/nationalSweep.mjs';
// @ts-expect-error — .mjs toolchain module, no types
import { loadJoinFootprintsBounded } from '../geojsonseqRead.mjs';

// The driver's join helpers live in heightSources.mjs, which VITEST CANNOT IMPORT (the long-standing
// limitation every pure-half module header names). The driver therefore resolves them at call time and
// accepts an override — so this spec runs the REAL streaming partitioner (loadJoinFootprintsBounded,
// imported straight from geojsonseqRead.mjs, which is importable) and supplies the three trivial
// predicates itself. What is under test is the DRIVER'S BOOKKEEPING; the fixtures are unit squares, so
// a five-line `footprintFromFeature` is the same function for them as the production one.
const DEPS = {
    loadJoinFootprintsBounded,
    footprintFromFeature: (feat: any) => {
        const ext = feat?.geometry?.coordinates?.[0];
        if (!Array.isArray(ext) || ext.length < 4) return null;
        let cx = 0, cy = 0;
        for (const [x, y] of ext) { cx += x; cy += y; }
        return { ext, interiors: [], clon: cx / ext.length, clat: cy / ext.length };
    },
    inAnyArea: (x: number, y: number, areas: number[][]) =>
        areas.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1),
    bucketRecords: (records: any[], cellOf: (r: any) => [number, number]) => {
        const b = new Map<string, any[]>();
        for (const r of records) { const k = cellOf(r).join(','); const c = b.get(k); if (c) c.push(r); else b.set(k, [r]); }
        return b;
    },
    appendFileInto: (src: string, dest: string) => {
        const fs = require('node:fs');
        if (!fs.existsSync(src)) return 0;
        fs.appendFileSync(dest, fs.readFileSync(src));
        return 1;
    },
};

type Cell = { cellBbox: number[]; records: any[]; ix: number; iy: number; key: string; priority: boolean };

const REGION: [number, number, number, number] = [10, 50, 11, 51];  // 1° × 1°
const TILE = 0.1;                                                    // → a 10 × 10 grid

/** A clip of `n` unit-square footprints spread across the region, one per 0.1° cell diagonal. */
function makeClip(path: string, cells: Array<[number, number]>) {
    const feats = cells.map(([ix, iy], i) => {
        const lon = REGION[0] + (ix + 0.5) * TILE;
        const lat = REGION[1] + (iy + 0.5) * TILE;
        const d = 0.0005;
        return {
            type: 'Feature',
            properties: { id: `f${i}`, ix, iy, building: 'yes' },
            geometry: { type: 'Polygon', coordinates: [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]] },
        };
    });
    writeFileSync(path, feats.map((f) => JSON.stringify(f)).join('\n') + '\n');
    return feats.length;
}

function readOut(path: string) {
    return readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'natl-sweep-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

/** A stamp that writes `height: 42` on every record it is given, and records which cells it saw. */
function stubStamp(seen: Array<{ key: string; priority: boolean }>, behaviour: (c: Cell) => any = () => ({ ok: true, empty: false })) {
    return async (c: Cell) => {
        seen.push({ key: c.key, priority: c.priority });
        const res = behaviour(c);
        if (res.ok && !res.empty) for (const r of c.records) r.feat.properties = { ...r.feat.properties, height: 42 };
        return { requests: 1, bytes: 100, ...res };
    };
}

describe('§NATIONAL-SWEEP-DRIVER — conservation: every record leaves exactly once', () => {
    const cells: Array<[number, number]> = [[0, 0], [3, 2], [5, 5], [9, 9], [1, 8]];

    it('single pass (no priority, no bands)', async () => {
        const inP = join(dir, 'in.seq'), outP = join(dir, 'out.seq');
        const n = makeClip(inP, cells);
        const grid = nationalTileGrid(REGION, { lonDeg: TILE });
        const seen: any[] = [];
        const run = await runNationalSweep({ deps: DEPS, inPath: inP, outPath: outP, grid, stampAreas: [REGION], recordOf: (feat: any, fp: any) => ({ feat, ...fp }), stampCell: stubStamp(seen) });
        expect(run.status).toBe('ok');
        const out = readOut(outP);
        expect(out.length).toBe(n);
        expect(new Set(out.map((f) => f.properties.id)).size).toBe(n);
        expect(out.every((f) => f.properties.height === 42)).toBe(true);
    });

    it('priority + bounded-heap bands, with a working set NARROWER than the region', async () => {
        const inP = join(dir, 'in.seq'), outP = join(dir, 'out.seq');
        const n = makeClip(inP, cells);
        const grid = nationalTileGrid(REGION, { lonDeg: TILE });
        const seen: Array<{ key: string; priority: boolean }> = [];
        // The working set excludes the top two rows of cells (centres 50.85 / 50.95), so [1,8] and [9,9]
        // pass through untouched. (50.8, not 50.85: `inAnyArea` includes the upper edge, so a centroid
        // exactly ON the boundary is INSIDE — a real property of the filter, pinned by this choice.)
        const working: [number, number, number, number] = [10, 50, 11, 50.8];
        const run = await runNationalSweep({
            deps: DEPS, inPath: inP, outPath: outP, grid, stampAreas: [working], priorityAreas: [[10.5, 50.5, 10.6, 50.6]],
            recordOf: (feat: any, fp: any) => ({ feat, ...fp }), stampCell: stubStamp(seen), swatheRows: 3,
        });
        expect(run.status).toBe('ok');
        const out = readOut(outP);
        expect(out.length).toBe(n);                                  // nothing dropped
        expect(new Set(out.map((f) => f.properties.id)).size).toBe(n); // nothing duplicated
        // [5,5] is inside the priority box AND the working set → stamped in the PRIORITY pass, first.
        expect(seen[0]).toEqual({ key: '5,5', priority: true });
        // The two cells outside the working set keep their original tags — never a fabricated height.
        const outside = out.filter((f) => f.properties.iy >= 8);
        expect(outside.length).toBe(2);
        expect(outside.every((f) => f.properties.height === undefined)).toBe(true);
    });
});

describe('§PRIORITY-OR-THE-CITIES-REGRESS', () => {
    it('stamps the priority areas even when the national budget is ALREADY spent', async () => {
        const inP = join(dir, 'in.seq'), outP = join(dir, 'out.seq');
        const n = makeClip(inP, [[0, 0], [5, 5], [9, 9]]);
        const grid = nationalTileGrid(REGION, { lonDeg: TILE });
        const seen: Array<{ key: string; priority: boolean }> = [];
        const run = await runNationalSweep({
            deps: DEPS, inPath: inP, outPath: outP, grid, stampAreas: [REGION], priorityAreas: [[10.5, 50.5, 10.6, 50.6]],
            recordOf: (feat: any, fp: any) => ({ feat, ...fp }), stampCell: stubStamp(seen),
            swatheRows: 3, budgetMs: 1,   // the national phase is out of time before it starts
        });
        expect(run.status).toBe('ok');
        expect(run.sweep.stopReason).toMatch(/time budget/);
        // The priority cell WAS stamped; the two others were not, and say so in km².
        expect(seen).toEqual([{ key: '5,5', priority: true }]);
        expect(run.sweep.priorityCells).toBe(1);
        expect(run.sweep.km2Skipped).toBeGreaterThan(0);
        const out = readOut(outP);
        expect(out.length).toBe(n);
        expect(out.filter((f) => f.properties.height === 42).length).toBe(1);
    });
});

describe('§CURSOR — a truncated run names an EXACT resume point', () => {
    it('resuming at nextCursor stamps the remainder, skipping nothing and repeating nothing', async () => {
        const cells: Array<[number, number]> = [[0, 0], [2, 1], [4, 3], [6, 6], [8, 9]];
        const inP = join(dir, 'in.seq');
        makeClip(inP, cells);
        const grid = nationalTileGrid(REGION, { lonDeg: TILE });

        // Pass 1 — one cell only (concurrency 1 so the batch boundary is the cell boundary).
        const seen1: any[] = [];
        const out1 = join(dir, 'out1.seq');
        const r1 = await runNationalSweep({
            deps: DEPS, inPath: inP, outPath: out1, grid, stampAreas: [REGION], recordOf: (feat: any, fp: any) => ({ feat, ...fp }),
            stampCell: stubStamp(seen1), concurrency: 1, maxTiles: 1,
        });
        expect(r1.sweep.stopReason).toBe('maxTiles 1');
        expect(seen1.map((s) => s.key)).toEqual(['0,0']);
        expect(r1.sweep.nextCursor).toBe(grid.ordOf(2, 1));

        // Pass 2 — resume at that cursor.
        const seen2: any[] = [];
        const out2 = join(dir, 'out2.seq');
        const r2 = await runNationalSweep({
            deps: DEPS, inPath: inP, outPath: out2, grid, stampAreas: [REGION], recordOf: (feat: any, fp: any) => ({ feat, ...fp }),
            stampCell: stubStamp(seen2), concurrency: 1, cursor: r1.sweep.nextCursor,
        });
        expect(r2.sweep.stopReason).toBe('complete');
        expect(seen2.map((s) => s.key)).toEqual(['2,1', '4,3', '6,6', '8,9']);   // the exact remainder
        expect(readOut(out2).length).toBe(cells.length);                          // still conserved
    });
});

describe('§CONTEXT-DATA-HONESTY — the driver keeps failure and empty apart', () => {
    it('ok:false is a tileError, ok:true+empty is a voidTile, and neither invents a height', async () => {
        const inP = join(dir, 'in.seq'), outP = join(dir, 'out.seq');
        makeClip(inP, [[0, 0], [1, 1], [2, 2]]);
        const grid = nationalTileGrid(REGION, { lonDeg: TILE });
        const seen: any[] = [];
        const run = await runNationalSweep({
            deps: DEPS, inPath: inP, outPath: outP, grid, stampAreas: [REGION], recordOf: (feat: any, fp: any) => ({ feat, ...fp }),
            stampCell: stubStamp(seen, (c) => (c.key === '0,0' ? { ok: false, error: 'HTTP 500' }
                : c.key === '1,1' ? { ok: true, empty: true } : { ok: true, empty: false })),
        });
        expect(run.agg.tileErrors).toBe(1);
        expect(run.agg.voidTiles).toBe(1);
        expect(run.agg.cellsStamped).toBe(2);              // the failed cell is NOT counted as ground read
        expect(run.agg.errorSamples[0]).toContain('HTTP 500');
        const out = readOut(outP);
        expect(out.length).toBe(3);
        expect(out.filter((f) => f.properties.height === 42).length).toBe(1);   // only the real cell
    });
});
