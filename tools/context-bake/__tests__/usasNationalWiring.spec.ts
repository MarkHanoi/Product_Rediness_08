// §USAS-NATIONAL-HEIGHTS (2026-09-06, lane USA-HEIGHTS-NATIONAL) — the WIRING of the whole-country US
// measured-height stamp, pinned.
//
// WHY. The France (L-12910), Switzerland (L-12883) and Australia stamps were each BUILT and imported by
// nothing for a day — a measured-height channel one import away while the region baked honest 9 m
// defaults. This lane's own predecessor did it too: heights/usOpenHeightsStamp.mjs shipped on 2026-09-05
// "built and unit-tested, NOT yet wired". So the wiring is asserted, not assumed.
//
// bake.mjs runs a top-level `main()` and heightSources.mjs is rejected by vitest's transform with a bare
// SyntaxError, so — exactly as swissWiring / auOpenHeightsWiring / usOpenHeightsWiring do — both are read
// as TEXT, one assertion per place the join is wired.
//
// LAYERING: a build/inspection tool test — no OTel span (P8 binds exported package functions).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const bake = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
const hs = readFileSync(resolve(HERE, '../heightSources.mjs'), 'utf8');
const stamp = readFileSync(resolve(HERE, '../heights/usasNationalStamp.mjs'), 'utf8');
const pure = readFileSync(resolve(HERE, '../heights/usOpenHeights.mjs'), 'utf8');

/** Every bake REGION row, name → its full one-line object text. */
function rowText(name: string): string | null {
    const m = bake.match(new RegExp(`\\{\\s*name:\\s*'${name}'\\s*,[^\\n]*\\}`));
    return m ? m[0] : null;
}

// The three rows that were on `us_open` until this lane, i.e. the ones a regression would move back.
const WAS_US_OPEN = ['newyork', 'california', 'massachusetts'];
// The two rows that must NEVER declare the join: measured ZERO at the source.
const MEASURED_ZERO = ['alaskaaleutians', 'usvirginislands'];

describe('§USAS-NATIONAL-HEIGHTS — bake.mjs wires the national stamp for the whole United States', () => {
    it('imports the stamp, the national working set and the swathe constant DIRECTLY from heights/', () => {
        expect(bake).toMatch(/^import \{ stampUsasNationalHeightsOnGeojsonseq \} from '\.\/heights\/usasNationalStamp\.mjs';/m);
        expect(bake).toMatch(/^import \{ US_NATIONAL_BBOXES, US_OPEN_CITY_BBOXES, USAS_SWATHE_ROWS \} from '\.\/heights\/usOpenHeights\.mjs';/m);
    });

    it('⭐ 52 rows declare heightJoin:\'usas\' — the whole country, not a metro list', () => {
        // THE ASSERTION THE FOUNDER ASKED FOR ("all EEUU — I want complete country coverage"), reduced
        // to something a regression cannot argue with. 54 US rows minus the two measured-zero ones.
        const declared = [...bake.matchAll(/heightJoin: 'usas'/g)].length;
        expect(declared).toBe(52);
    });

    it('the three ex-`us_open` rows moved to \'usas\' — a strict SUPERSET, because city-first still wins', () => {
        for (const name of WAS_US_OPEN) {
            const row = rowText(name);
            expect(row, `${name} row`).not.toBeNull();
            expect(row!, name).toMatch(/heightJoin: 'usas'/);
            expect(row!, `${name} must not go back to the metro-only join`).not.toMatch(/heightJoin: 'us_open'/);
        }
    });

    it('⛔ NO row declares \'us_open\' any more, and its stamp is no longer imported', () => {
        // Not tidying: a row on that key reaches ONE metro box and leaves the rest of its state on the
        // fabricated 9 m carpet. The three CITY channels are still read — by the national stamp, per
        // footprint (usOpenChannelForPoint) — which is why removing the key loses no measurement.
        expect(bake).not.toMatch(/heightJoin: 'us_open'/);
        expect(bake).not.toMatch(/import \{ stampUsOpenHeightsOnGeojsonseq \}/);
        expect(bake).not.toMatch(/us_open: \{ stamp:/);
    });

    it('the two MEASURED-ZERO rows declare NO join (§MEASURED-HEIGHT-GATE would exit 4)', () => {
        for (const name of MEASURED_ZERO) {
            const row = rowText(name);
            expect(row, `${name} row`).not.toBeNull();
            expect(row!, `${name}: the source measures 0 there — declaring a join fails the bake`).not.toMatch(/heightJoin/);
        }
    });

    it('stampBboxesFor gives \'usas\' the NATIONAL boxes — not a city list, which is the whole point', () => {
        const fn = bake.match(/function stampBboxesFor\(r\)\s*\{([\s\S]*?)\n\}/);
        expect(fn, 'stampBboxesFor').not.toBeNull();
        expect(fn![1]).toMatch(/r\.heightJoin === 'usas'\) return US_NATIONAL_BBOXES\.map\(\(c\) => c\.bbox\)/);
        // …and the retired key must not creep back in beside it.
        expect(fn![1]).not.toMatch(/r\.heightJoin === 'us_open'\)\s*return/);
    });

    it('dispatches through NATIONAL_STAMP_TABLE with its own opts, and reaches the SAME gate bookkeeping', () => {
        const table = bake.match(/const NATIONAL_STAMP_TABLE = \{([\s\S]*?)\n\};/);
        expect(table, 'NATIONAL_STAMP_TABLE').not.toBeNull();
        expect(table![1]).toMatch(/usas:\s*\{\s*stamp:\s*stampUsasNationalHeightsOnGeojsonseq,\s*bboxes:\s*US_NATIONAL_BBOXES,\s*opts:\s*\{\s*swatheRows:\s*USAS_SWATHE_ROWS\s*\}\s*\}/);
        expect(bake).toMatch(/const tableStamp = NATIONAL_STAMP_TABLE\[r\.heightJoin\];/);
        // ⚠ THE `opts` SPREAD IS LOAD-BEARING. Without it the row's swatheRows never reaches the stamp,
        // the join retains a whole state in one pass, the heap watchdog trips, the join returns `error`
        // and assertMeasuredHeights EXITS 4 — i.e. the bake dies, loudly, on the biggest states.
        expect(bake).toMatch(/tableStamp\.stamp\(baseGeo, stamped, wsen, \{ maxTiles: 20000, retainBboxes, \.\.\.\(tableStamp\.opts \?\? \{\}\) \}\)/);
        expect(bake).toMatch(/recordNationalStampOutcome\(r, res, stamped, baseGeo, geos\);/);
        // The pinned dispatch chain must NOT have been extended (that breaks the sibling lanes' pins).
        expect(bake).not.toMatch(/r\.heightJoin === 'usas'\) res = await/);
    });
});

describe('§USAS-NATIONAL-HEIGHTS — heightSources.mjs routes the country to the live source', () => {
    it('REGION_SOURCE maps 52 US rows to \'usas_national\', including the three that used to be metro-only', () => {
        expect([...hs.matchAll(/'usas_national'/g)].length).toBeGreaterThanOrEqual(52);
        for (const name of [...WAS_US_OPEN, 'texas', 'illinois', 'kansas', 'hawaii', 'puertoricousa']) {
            expect(hs, name).toMatch(new RegExp(`(^|[\\s,])${name}:\\s*'usas_national'`, 'm'));
        }
        // …and the two measured-zero rows stay on the documented placeholder, PROBED not unprobed.
        for (const name of MEASURED_ZERO) expect(hs, name).toMatch(new RegExp(`(^|[\\s,])${name}:\\s*'overture_us'`, 'm'));
    });

    it('SOURCES.usas_national is impl:\'live\' and keyless, and names the licence', () => {
        expect(hs).toMatch(/usas_national:\s*\{\s*\n?\s*country:\s*'us'[^\n]*impl:\s*'live'/);
        expect(hs).toMatch(/135,321,228/);           // the layer's own returnCountOnly answer
        expect(hs).toMatch(/CC BY 4\.0/);
    });

    it('resolveHeights names the exact row edit — and no longer offers the retired one', () => {
        expect(hs).toMatch(/source === 'usas_national'/);
        expect(hs).toMatch(/declares heightJoin:'usas' in bake\.mjs \(with stampBboxesFor → US_NATIONAL_BBOXES\)/);
        // ⛔ The `us_open_heights` branch used to END with "declares heightJoin:'us_open' in bake.mjs
        // (with stampBboxesFor → US_OPEN_CITY_BBOXES)" as its INSTRUCTION to the reader. Following that
        // today re-creates the hole this lane closed. A `not.toMatch` on the sentence would be the wrong
        // assertion — the string is still in the file, quoted inside the comment that records the change —
        // so what is pinned is that the LIVE reason now says the opposite, by name.
        expect(hs).toMatch(/NOT heightJoin:'us_open', which is retired because it could only ever reach one metro box per state/);
    });

    it('exports the shared join helpers the stamp borrows — including the 8 MB-buffer concatenation', () => {
        const names = (hs.match(/^export \{([^}]*)\};/gm) ?? []).join(' ');
        for (const h of ['footprintFromFeature', 'stampAreasFor', 'inAnyArea', 'bucketRecords', 'httpGetSafe', 'statsOf', 'appendFileInto']) {
            expect(names, `heightSources.mjs must export ${h}`).toMatch(new RegExp(`\\b${h}\\b`));
        }
    });
});

describe('§USAS-NATIONAL-HEIGHTS — the stamp keeps FAILURE, EMPTY and TRUNCATION apart', () => {
    it('imports the shared helpers and every DECISION from the pure module', () => {
        expect(stamp).toMatch(/from '\.\.\/heightSources\.mjs';/);
        expect(stamp).toMatch(/from '\.\/usOpenHeights\.mjs';/);
        expect(stamp).toMatch(/^export async function stampUsasNationalHeightsOnGeojsonseq\(/m);
    });

    it('a refused / undecodable page FAILS the cell; an answered-but-empty cell is a VOID, not an error', () => {
        expect(stamp).toMatch(/if \(!rr\.ok\) \{ failed = true; break; \}/);
        expect(stamp).toMatch(/if \(!page\) \{ failed = true; break; \}/);
        expect(stamp).toMatch(/if \(res\.failed\) \{ agg\.tileErrors\+\+; continue; \}/);
        expect(stamp).toMatch(/if \(res\.components\.length === 0\) \{ agg\.voidTiles\+\+; continue; \}/);
    });

    it('stamps the measured marker and the per-channel source tag, and NEVER an estimate counter', () => {
        expect(stamp).toMatch(/\[MEASURED_HEIGHT_SRC_TAG\]: MEASURED_HEIGHT_SRC_VALUE/);
        expect(stamp).toMatch(/heightSource: ch\.heightSourceTag/);
        expect(stamp).toMatch(/estimatedCount: 0/);
        // Overture / Microsoft heights are MODELLED and must never be written under the measured marker.
        // ⚠ `not.toMatch(/overture/i)` was the first draft of this assertion and it FAILED — on the
        // module's own header, which names Overture precisely in order to refuse it. A test that punishes
        // the file for documenting its refusal is measuring the wrong thing. What is pinned instead: the
        // ONLY estimate counter in the whole module is the literal zero.
        expect([...stamp.matchAll(/estimatedCount: \d/g)].map((m) => m[0])).toEqual(['estimatedCount: 0']);
        expect(stamp).toMatch(/⛔ NOT WRITTEN HERE, ON PURPOSE/);
    });

    it('resolves the channel PER FOOTPRINT (city first), never per cell', () => {
        expect(stamp).toMatch(/const ch = usOpenChannelForPoint\(fp\.clon, fp\.clat\);/);
        expect(stamp).toMatch(/if \(!ch\) return null;/);
    });

    it('⭐ §USAS-SWATHE — the heap is bounded by BANDS, and the leftover is concatenated as raw bytes', () => {
        expect(stamp).toMatch(/usasNationalSwathes\(grid, \{ swatheRows: rows \}\)/);
        expect(stamp).toMatch(/writeFileSync\(outPath, ''\);/);            // multi-pass truncates first
        expect(stamp).toMatch(/appendFileInto\(/);                          // …and never re-reads via the heap
        expect(stamp).toMatch(/function resolveSwatheRows\(/);              // the USAS_SWATHE_ROWS env knob
        expect(stamp).toMatch(/intersectAreas\(stampAreas, sw\.bbox\)/);    // a band NARROWS, never widens
        // A band that retained nothing must not be treated as a failed join.
        expect(stamp).toMatch(/§EMPTY-IS-NOT-A-FAILURE/);
    });

    it('the sweep is ordered and resumable, and the cursor is read from the environment', () => {
        expect(stamp).toMatch(/process\.env\.USAS_SWEEP_CURSOR/);
        expect(stamp).toMatch(/process\.env\.USAS_SWEEP_BUDGET_MS/);
        expect(stamp).toMatch(/usasSweepOrder\(buckets\.keys\(\), grid, budget\.cursor\)/);
        expect(stamp).toMatch(/formatUsasSweepSummary\(sweep\)/);
    });

    it('the pure module no longer claims the swathe pass is OWED — it is here', () => {
        // The constant `USAS_SWATHE_IS_OWED = true` shipped in the same hour the US rows became whole
        // STATES, i.e. it deferred a bound on a condition that already held. Its absence is asserted so
        // nobody re-adds the note instead of the pass.
        expect(pure).not.toMatch(/^export const USAS_SWATHE_IS_OWED/m);   // the name survives, QUOTED in the note that replaced it
        expect(pure).toMatch(/^export const USAS_SWATHE_ROWS = 40;$/m);
        expect(pure).toMatch(/^export function usasNationalSwathes\(/m);
    });
});

describe('§USAS-NATIONAL-HEIGHTS — both CI gates refuse a US bake that only stamps the big cities', () => {
    it('context-bake.yml and context-merge-publish.yml BOTH carry the two non-metro gate rows', () => {
        // ⚠ THIS ARM CAUGHT A REAL GAP: the merge-publish workflow carried the §USAS paragraph
        // describing `oakpark` and `pasadenatx` while its CITIES list contained neither — a comment
        // describing enforcement that did not exist, inside the file whose job is enforcement (L-809's
        // shape). Both rows are in both lists now, and this test is what keeps them there.
        for (const wf of ['context-bake.yml', 'context-merge-publish.yml']) {
            const text = readFileSync(resolve(HERE, '../../../.github/workflows', wf), 'utf8');
            expect(text, wf).toMatch(/^\s*oakpark illinois 41\.8850,-87\.7840 200$/m);
            expect(text, wf).toMatch(/^\s*pasadenatx texas 29\.6910,-95\.2090 200$/m);
        }
    });

    it('the three CITY-channel rows are still gated too — the national join must not cost them', () => {
        const text = readFileSync(resolve(HERE, '../../../.github/workflows/context-bake.yml'), 'utf8');
        expect(text).toMatch(/^\s*manhattan newyork 40\.7580,-73\.9855 500$/m);
        expect(text).toMatch(/^\s*sanfrancisco california 37\.7900,-122\.4000 500$/m);
        expect(text).toMatch(/^\s*boston massachusetts 42\.3510,-71\.0750 500$/m);
    });
});
