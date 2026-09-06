// §NDH-NO-OSM-JOIN (2026-09-05, lane HEIGHTS-NORDICS) — the WIRING of the Norwegian national height stamp, pinned.
//
// France (L-12910) and Switzerland (L-12883) both shipped a stamp BUILT and imported by nothing — a
// measured-height channel one import away while the country baked honest 9 m defaults. This spec exists
// so the NO stamp cannot sit in that state. bake.mjs runs main() on import and cannot be loaded by vitest,
// so — like swissWiring.spec.ts / nl3dbagWiring.spec.ts — the wiring is asserted on the TEXT, one assertion
// per place the join is wired.
//
// WHAT IS DIFFERENT HERE, and why it is pinned: the dispatch chain `if (r.heightJoin === 'au_open' || … ||
// 'swiss')` has NO free insertion point (its front, middle and end are each pinned by a sibling spec), so
// ndh_no dispatches through NATIONAL_STAMP_TABLE — a table consulted BEFORE the chain that feeds the SAME
// gate bookkeeping (recordNationalStampOutcome). Both halves of that mechanism are asserted, because a
// table row without the table lookup, or a lookup that skips the outcome record, would each let a bake
// pass the §MEASURED-HEIGHT-GATE with zero Norwegian heights.
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const bake = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
const heightSources = readFileSync(resolve(HERE, '../heightSources.mjs'), 'utf8');
const stampModule = readFileSync(resolve(HERE, '../heights/noHeightsStamp.mjs'), 'utf8');

describe('§NDH-NO-OSM-JOIN — bake.mjs wires the ndh_no stamp for the `norway` row', () => {
    it('imports the stamp AND its working set DIRECTLY from heights/noHeightsStamp.mjs (own module, not heightSources.mjs)', () => {
        const imp = bake.match(/^import\s*\{([^}]*)\}\s*from\s*'\.\/heights\/noHeightsStamp\.mjs';/m);
        expect(imp, 'noHeightsStamp.mjs import statement').not.toBeNull();
        expect(imp![1]).toContain('stampNoNdhHeightsOnGeojsonseq');
        expect(imp![1]).toContain('NO_NDH_CITY_BBOXES');
    });

    it("the `norway` region row declares heightJoin:'ndh_no' (the key heightSources.mjs REGION_SOURCE names)", () => {
        const row = bake.match(/\{\s*name:\s*'norway'\s*,[^\n]*\}/);
        expect(row, 'norway row').not.toBeNull();
        expect(row![0]).toMatch(/heightJoin:\s*'ndh_no'/);
    });

    it('no NO city row exists, so the national join cannot double-bake a working-set city', () => {
        for (const city of ['oslo', 'bergen', 'trondheim']) {
            expect(bake, `${city} must not be a bake region row`).not.toMatch(new RegExp(`\\{\\s*name:\\s*'${city}'`));
        }
    });

    it('stampBboxesFor bounds the national join to NO_NDH_CITY_BBOXES (§HEIGHT-STAMP-BUDGET preflight)', () => {
        const fn = bake.match(/function stampBboxesFor\(r\)\s*\{([\s\S]*?)\n\}/);
        expect(fn, 'stampBboxesFor').not.toBeNull();
        expect(fn![1]).toMatch(/r\.heightJoin === 'ndh_no'\)\s*return NO_NDH_CITY_BBOXES\.map/);
    });

    it('NATIONAL_STAMP_TABLE carries the ndh_no row, and the table is consulted BEFORE the pinned chain', () => {
        const table = bake.match(/const NATIONAL_STAMP_TABLE = \{([\s\S]*?)\n\};/);
        expect(table, 'NATIONAL_STAMP_TABLE').not.toBeNull();
        expect(table![1]).toMatch(/ndh_no:\s*\{\s*stamp:\s*stampNoNdhHeightsOnGeojsonseq,\s*bboxes:\s*NO_NDH_CITY_BBOXES\s*\}/);
        const lookup = bake.indexOf('const tableStamp = NATIONAL_STAMP_TABLE[r.heightJoin];');
        // Locate the chain by its MIDDLE (the mnhFr.spec.ts pin) — sibling lanes prepend/append keys at
        // either end, and this spec must not re-assert THEIR pins, only that the table precedes the chain.
        const chain = bake.indexOf("r.heightJoin === 'mds' || r.heightJoin === 'dhm' || r.heightJoin === 'lod2nrw' || r.heightJoin === 'mnh_fr'");
        expect(lookup, 'table lookup present').toBeGreaterThan(0);
        expect(chain, 'pinned chain present').toBeGreaterThan(0);
        expect(lookup, 'table lookup precedes the pinned chain').toBeLessThan(chain);
        // ndh_no is NOT in the chain — it dispatches through the table, so the chain stays a sibling-owned text.
        expect(bake).not.toMatch(/r\.heightJoin === 'ndh_no' \|\|/);
    });

    it('the table path calls the stamp with the retained working set and records the outcome for the §MEASURED-HEIGHT-GATE', () => {
        // ⚠ WIDENED 2026-09-06 (lane USA-HEIGHTS-NATIONAL): the shared call gained `...(tableStamp.opts ?? {})`
        // so a table row can declare its own options — `usas` passes the swathe HEAP BOUND its whole-state rows
        // need. `ndh_no` declares none, so the spread is a no-op for it; what this pin asserts, the retained
        // working set reaching the stamp, is unchanged.
        expect(bake).toMatch(/res = await tableStamp\.stamp\(baseGeo, stamped, wsen, \{ maxTiles: 20000, retainBboxes,/);
        // BOTH dispatch paths feed the gate through the ONE shared recorder — count the call sites.
        const calls = bake.match(/recordNationalStampOutcome\(r, res, stamped, baseGeo, geos\);/g) ?? [];
        expect(calls.length, 'two call sites: table path + pinned chain').toBe(2);
        const fn = bake.match(/function recordNationalStampOutcome\(r, res, stamped, baseGeo, geos\)\s*\{([\s\S]*?)\n\}/);
        expect(fn, 'recordNationalStampOutcome').not.toBeNull();
        expect(fn![1]).toContain('heightJoinOutcomes.push({');
        expect(fn![1]).toMatch(/sweepAborted: res\.sweepAborted === true/);   // §ABORT-IS-NOT-A-CAP survives the extraction
        expect(fn![1]).toMatch(/tilesProcessed: res\.tilesProcessed \?\? 0, tileErrors: res\.tileErrors \?\? 0/); // §SOURCE-OUTAGE-VS-PIPELINE-DEFECT
        expect(fn![1]).toMatch(/geos\.push\(stamped\)/);
        expect(fn![1]).toMatch(/geos\.push\(baseGeo\)/);
    });

    it('heightSources.mjs REGION_SOURCE `norway` reads WIRED and the source is impl:live + keyless', () => {
        expect(heightSources).toMatch(/^\s*norway:\s*'ndh_no',\s*\/\/.*WIRED 2026-09-05/m);
        // `{2}` not two literal spaces: eslint `no-regex-spaces` is an ERROR and the lint CI job
        // is hard-fail. Identical match, counted rather than eyeballed (lane CI-GREEN, 2026-09-05).
        const src = heightSources.match(/\n {2}ndh_no: \{([\s\S]*?)\n {2}\},/);
        expect(src, 'SOURCES.ndh_no').not.toBeNull();
        expect(src![1]).toMatch(/impl: 'live'/);
        expect(src![1]).toMatch(/keyless: true/);
    });

    it('the stamp writes the marker the client ranks above OSM `tagged`, and its own heightSource tag', () => {
        expect(stampModule).toMatch(/\[MEASURED_HEIGHT_SRC_TAG\]: MEASURED_HEIGHT_SRC_VALUE/);
        expect(stampModule).toMatch(/heightSource: NO_NDH\.heightSourceTag/);
        // and it degrades by NAME, never by fabrication
        expect(stampModule).toMatch(/status: 'documented', reason: 'NO NHM nDSM join: geotiff dep unavailable/);
        expect(stampModule).toMatch(/tileErrors\+\+/);
        expect(stampModule).toMatch(/voidTiles\+\+/);
    });

    it('both CI gates refuse a Norwegian bake that ships no measured heights at Oslo S', () => {
        for (const wf of ['context-bake.yml', 'context-merge-publish.yml']) {
            const text = readFileSync(resolve(HERE, '../../../.github/workflows', wf), 'utf8');
            expect(text, wf).toMatch(/^\s*oslo norway 59\.9139,10\.7522 500$/m);
        }
    });
});
