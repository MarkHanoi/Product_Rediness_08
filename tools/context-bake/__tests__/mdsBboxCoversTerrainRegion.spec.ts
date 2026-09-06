// §MDS-BBOX-MUST-COVER-THE-REGION (2026-08-02) — the join's working set must cover the baked region.
//
// WHY THIS TEST EXISTS
// --------------------
// ⚠ CORRECTED 2026-09-06 (L-12946, lane ES-WHOLE-COUNTRY-HEIGHTS) — the paragraph below describes
// the world as it was until this date, and its SECOND HALF IS NO LONGER TRUE. `MDS_CITY_BBOXES` is
// now the height join's PRIORITY ORDER ONLY; the `retainBboxes` working set is the WHOLE COUNTRY
// (bake.mjs `stampBboxesFor('mds')` → `MDS_NATIONAL_BBOXES`), and the heap is bounded by swathe
// passes instead. That change exists because the very defect described below — "a footprint outside
// every stamp bbox … can NEVER be stamped" — was not a Murcia-shaped omission but a national one:
// Ciudad Real, Toledo, Alicante, Granada, Vigo, Gijón and every Spanish town were unreachable by
// construction. The rest of the paragraph, and every assertion in this file, still stands: a stamp
// bbox smaller than the region it claims is a silent permanent hole, and the metro rows still have
// to cover their terrain regions because they are still where the sweep starts.
// ⇒ `mdsNational.spec.ts` is the authority on the retain set, the tiling and the priority order.
//    Do not re-assert those here from a copy — read that file.
//
// `MDS_CITY_BBOXES` WAS BOTH the height join's `priorityBboxes` (stamped first) AND its
// `retainBboxes` working set (L-659, §HEIGHT-STAMP-BUDGET). A footprint outside every stamp bbox is
// not merely de-prioritised: it streams through the join untouched and ships with its original OSM
// tags, i.e. an `assumed` 9 m default. On the map that is INDISTINGUISHABLE from "the national
// source genuinely has no data here" — the failure-vs-empty conflation this repo has been bitten by
// in L-422 / L-457 / L-467 / L-469, and the same shape as the §MURCIA-HEIGHT-STAMP-GAP omission.
//
// So a stamp bbox that is SMALLER than the region actually baked is a silent, permanent hole: no
// number of re-bakes can ever fill it, and nothing in the pipeline complains. Measured 2026-08-02,
// before the fix: córdoba was short 0,01° of north, madrid 0,02° of east, valència 0,01° of west and
// 0,02° of south. Three of the five Spanish cities under active close-out.
//
// `terrain.mjs` REGIONS is the CANONICAL extent for a city (the Murcia row already says so in
// heightSources.mjs: "bbox = the canonical terrain.mjs REGIONS row, NOT re-invented"). This test
// pins that relationship as an invariant rather than a convention, for every city that appears in
// both lists — so adding a city to one and forgetting the other fails here instead of shipping a
// fabricated-height strip.
//
// LAYERING: a build/inspection tool test, like its siblings — no OTel span (P8 applies to exported
// package functions, not bake tooling).
// ⚠ BOTH tables are read as TEXT, and that is deliberate, not laziness. `heightSources.mjs` cannot
// be IMPORTED from a vitest spec: vite's transform rejects it with a bare `SyntaxError: Invalid or
// unexpected token` (verified 2026-08-02 with a two-line probe spec that did nothing but import it,
// while `node -e "import(...)"` loads it happily). That is exactly why no test in this repo imports
// it — and why the join's working set had no test at all until now. Reading the source text is the
// established precedent here anyway: `computeScorecard.mjs` reads terrain.mjs/bake.mjs the same way
// so it stays a total function of the CURRENT source rather than a second, drifting copy.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

type Bbox = [number, number, number, number];

/** Parse `MDS_CITY_BBOXES` rows out of heightSources.mjs source text. */
function mdsCityBboxes(): Array<{ city: string; bbox: Bbox }> {
    const src = readFileSync(resolve(HERE, '../heightSources.mjs'), 'utf8');
    const block = src.slice(src.indexOf('export const MDS_CITY_BBOXES'));
    const body = block.slice(0, block.indexOf('];') + 1);
    const re = /\{\s*city:\s*'([a-z0-9-]+)'[^}]*?bbox:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g;
    return [...body.matchAll(re)].map((m) => ({
        city: m[1]!,
        bbox: [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])] as Bbox,
    }));
}

/** Parse `terrain.mjs` REGIONS as TEXT — importing it pulls in proj4 and runs a top-level `main()`,
 *  exactly as computeScorecard.mjs reads it. Reading the real source keeps this a total function of
 *  current state rather than a second, drifting copy of the numbers. */
function terrainRegions(): Map<string, Bbox> {
    const src = readFileSync(resolve(HERE, '../terrain.mjs'), 'utf8');
    const out = new Map<string, Bbox>();
    const re = /\{\s*name:\s*'([a-z0-9-]+)'\s*,\s*source:\s*'[a-z]{2}'\s*,\s*bbox:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g;
    for (const m of src.matchAll(re)) {
        out.set(m[1]!, [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])]);
    }
    return out;
}

describe('§MDS-BBOX-MUST-COVER-THE-REGION', () => {
    const regions = terrainRegions();
    const rows = mdsCityBboxes();

    it('parses the terrain REGIONS table (guards against a silent regex miss)', () => {
        // A parser that matches NOTHING would make every assertion below vacuously pass — precisely
        // the defect the scorecard's `parseBakeRegions` shipped (it matched a renamed constant and
        // published `{}` as a measured absence). Fail loud instead.
        expect(regions.size).toBeGreaterThan(20);
        expect(regions.get('murcia')).toEqual([-1.2007, 37.9322, -1.0607, 38.0522]);
    });

    it('every MDS stamp bbox covers its canonical terrain region', () => {
        const holes: string[] = [];
        for (const row of mdsCityBboxes()) {
            const region = regions.get(row.city);
            if (!region) continue;   // city not baked as its own terrain region — nothing to cover.
            const [mw, ms, me, mn] = row.bbox;
            const [rw, rs, re_, rn] = region;
            const short: string[] = [];
            if (mw > rw) short.push(`west ${mw} > ${rw}`);
            if (ms > rs) short.push(`south ${ms} > ${rs}`);
            if (me < re_) short.push(`east ${me} < ${re_}`);
            if (mn < rn) short.push(`north ${mn} < ${rn}`);
            if (short.length) holes.push(`${row.city}: ${short.join(', ')}`);
        }
        expect(holes, `stamp bbox smaller than the baked region — those footprints can NEVER be ` +
            `stamped and will ship a fabricated 9 m default:\n  ${holes.join('\n  ')}`).toEqual([]);
    });

    it('the five Spanish close-out cities are all present in the working set', () => {
        // §MURCIA-HEIGHT-STAMP-GAP was exactly this: a city under active close-out simply absent
        // from the list, which made its zero-measured result look like a data verdict.
        const cities = new Set(mdsCityBboxes().map((r) => r.city));
        for (const c of ['barcelona', 'madrid', 'cordoba', 'murcia', 'valencia']) {
            expect(cities.has(c), `${c} is missing from MDS_CITY_BBOXES`).toBe(true);
        }
    });

    it('this list is NO LONGER the retain set — bake.mjs retains the whole country (L-12946)', () => {
        // The single assertion that stops this file's own opening paragraph from being re-enacted.
        // Everything else about the national sweep is pinned in mdsNational.spec.ts; this row exists
        // so a revert of the fix fails HERE too, in the file that documents the old model.
        const bake = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
        expect(bake).toMatch(/if \(r\.heightJoin === 'mds'\) return MDS_NATIONAL_BBOXES;/);
        expect(bake).not.toMatch(/if \(r\.heightJoin === 'mds'\) return MDS_CITY_BBOXES\.map/);
    });
});
