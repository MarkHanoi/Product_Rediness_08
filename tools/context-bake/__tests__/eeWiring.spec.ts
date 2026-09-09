// §EE-ETAK-OSM-JOIN (2026-09-05, lane HEIGHTS-EE-PL-PT-BE) — the WIRING of the Estonian national height stamp, pinned.
//
// France (L-12910), Switzerland (L-12883), the Netherlands and Norway all showed the same shape: a stamp BUILT and
// imported by nothing for a day. This spec exists so the EE stamp cannot sit in that state — it is asserted on the
// TEXT of bake.mjs (which runs main() on import and cannot be loaded by vitest), one assertion per place the join
// is wired: the import, the row, the working-set bound, the NATIONAL_STAMP_TABLE entry, the REGION_SOURCE note and
// the two CI gate rows.
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const bake = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
const heightSources = readFileSync(resolve(HERE, '../heightSources.mjs'), 'utf8');
const stamp = readFileSync(resolve(HERE, '../heights/eeHeightsStamp.mjs'), 'utf8');

describe('§EE-ETAK-OSM-JOIN — bake.mjs wires the ETAK stamp for the `estonia` row', () => {
    // ⭐ RE-ANCHORED 2026-09-10 (lane CI-SIX-RED). This arm asserted that BAKE.MJS
    // imported the working set. It stopped being true on 2026-09-09, when the lint
    // job's `no-unused-vars` errors were fixed: bake.mjs had kept the import lines
    // and stopped USING them, because the priority pass moved INSIDE the wrapper.
    // The arm's PURPOSE survives untouched — "built and imported by nothing" is the
    // France ghost-town shape this file exists to refuse (L-12910) — so the
    // assertion moves to where the set is now actually READ, rather than being
    // deleted or relaxed. Asserting an import in a file that no longer uses it was
    // measuring the wrong copy: bake.mjs could import it and never call it, which is
    // precisely the orphan this arm is for.
    it('imports the stamp AND the retain set DIRECTLY from heights/eeHeightsStamp.mjs', () => {
        expect(bake).toMatch(/^import \{ stampEeEtakHeightsOnGeojsonseq, EE_NATIONAL_BBOXES \} from '\.\/heights\/eeHeightsStamp\.mjs';/m);
    });

    it('EE_CITY_BBOXES is READ as the uncapped priority pass inside that module', () => {
        const wrapper = readFileSync(resolve(HERE, '../heights/eeHeightsStamp.mjs'), 'utf8');
        expect(wrapper).toMatch(/priorityAreas: EE_CITY_BBOXES\.map\(\(c\) => c\.bbox\)/);
    });

    it("the `estonia` region row declares heightJoin:'ee_etak'", () => {
        const row = bake.match(/\{\s*name:\s*'estonia'\s*,[^\n]*\}/);
        expect(row, 'estonia row').not.toBeNull();
        expect(row![0]).toMatch(/heightJoin:\s*'ee_etak'/);
    });

    it('no EE city row exists, so the national join cannot double-bake a city', () => {
        for (const city of ['tallinn', 'tartu', 'parnu', 'narva']) {
            expect(bake, `${city} must not be a bake region row`).not.toMatch(new RegExp(`\\{\\s*name:\\s*'${city}'`));
        }
    });

    // ⭐ §EE-NATIONAL (2026-09-06, lane HEIGHTS-WHOLE-COUNTRY-B) — this test read `return
    // EE_CITY_BBOXES.map`, and that pin WAS the defect: the four cities were both the priority order and
    // the RETAIN set, so no Estonian town outside them could ever be measured by any number of re-bakes.
    // The pin moves with the decision, in the same commit — a stale pin that keeps passing is how a
    // corrected fact rots (the count/range shape in CLAUDE.md, six recurrences).
    it('stampBboxesFor gives the join the WHOLE COUNTRY (§EE-NATIONAL), not the city list', () => {
        const fn = bake.match(/function stampBboxesFor\(r\)\s*\{([\s\S]*?)\n\}/);
        expect(fn, 'stampBboxesFor').not.toBeNull();
        expect(fn![1]).toMatch(/r\.heightJoin === 'ee_etak'\)\s*return EE_NATIONAL_BBOXES;/);
        expect(fn![1]).not.toMatch(/r\.heightJoin === 'ee_etak'\)\s*return EE_CITY_BBOXES/);
    });

    it('dispatches ee_etak through NATIONAL_STAMP_TABLE (the pinned chain admits no new key)', () => {
        const table = bake.match(/const NATIONAL_STAMP_TABLE = \{([\s\S]*?)\n\};/);
        expect(table, 'NATIONAL_STAMP_TABLE').not.toBeNull();
        expect(table![1]).toMatch(/ee_etak:\s*\{\s*stamp:\s*stampEeEtakHeightsOnGeojsonseq,\s*bboxes:\s*EE_NATIONAL_BBOXES\s*\}/);
        expect(bake).toMatch(/const tableStamp = NATIONAL_STAMP_TABLE\[r\.heightJoin\];/);
    });

    it('the stamp module exports the function, imports the pure half, and stamps the measured marker', () => {
        expect(stamp).toMatch(/^export async function stampEeEtakHeightsOnGeojsonseq\(/m);
        expect(stamp).toMatch(/from '\.\/eeHeights\.mjs';/);
        expect(stamp).toMatch(/heightSource: EE_ETAK\.heightSourceTag/);
        expect(stamp).toMatch(/\[MEASURED_HEIGHT_SRC_TAG\]: MEASURED_HEIGHT_SRC_VALUE/);
        // failure ≠ empty ≠ truncated, each kept a DIFFERENT value. Since §EE-NATIONAL the counting
        // itself lives in the shared driver (heights/nationalSweepStamp.mjs, pinned by
        // nationalSweepStamp.spec.ts); what this stamp must still do is RETURN the two apart —
        // `{ ok:false, error }` for a refusal and `{ ok:true, empty:true }` for a real empty.
        expect(stamp).toMatch(/return \{ ok: false, error: got\.reason/);
        expect(stamp).toMatch(/return \{ ok: true, empty: true/);
        expect(stamp).toMatch(/runNationalSweep/);
        expect(stamp).toMatch(/truncated at the server's \$\{EE_ETAK\.serverCap\}-object cap/);
    });

    it('heightSources.mjs REGION_SOURCE reads WIRED for estonia and eesti3d_ee is impl live', () => {
        expect(heightSources).toMatch(/^\s*estonia:\s*'eesti3d_ee',\s*\/\/.*WIRED 2026-09-05/m);
        expect(heightSources).toMatch(/eesti3d_ee:\s*\{\s*\n?\s*country:\s*'ee'[^\n]*impl:\s*'live'/);
        expect(heightSources).toMatch(/source === 'eesti3d_ee'/);
    });

    it('both CI gates refuse an Estonian bake that ships no measured heights at Tallinn', () => {
        for (const wf of ['context-bake.yml', 'context-merge-publish.yml']) {
            const text = readFileSync(resolve(HERE, '../../../.github/workflows', wf), 'utf8');
            expect(text, wf).toMatch(/^\s*tallinn estonia 59\.4370,24\.7536 500$/m);
        }
    });
});
