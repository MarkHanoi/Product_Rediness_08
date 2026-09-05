// §US-OPEN-HEIGHTS-OSM-JOIN (2026-09-05, lane HEIGHTS-US) — the WIRING of the first US measured-height
// stamp, pinned.
//
// The France (L-12910), Switzerland (L-12883) and Australia stamps were each BUILT and imported by nothing
// for a day: a measured-height channel one import away while the region baked honest 9 m defaults and
// rendered as ghosts. This spec exists so the US stamp cannot repeat that shape silently. bake.mjs runs
// main() on import and cannot be loaded by vitest, so — like swissWiring.spec.ts / auOpenHeightsWiring
// .spec.ts — the wiring is asserted on the TEXT, one assertion per place the join is wired, because
// "exactly like mds" is the design rule (bake.mjs §MDS-OSM-JOIN). heightSources.mjs is read the same way.
//
// The stamp lives in heights/usOpenHeightsStamp.mjs (NOT heightSources.mjs — §SHARED-FILE-COLLISION) and
// bake.mjs imports it DIRECTLY, so the pin is on that import line, not on the shared heightSources import.
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const bake = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
const hs = readFileSync(resolve(HERE, '../heightSources.mjs'), 'utf8');
const stamp = readFileSync(resolve(HERE, '../heights/usOpenHeightsStamp.mjs'), 'utf8');
const WIRED = ['newyork', 'sanfrancisco', 'boston'];
const NOT_WIRED = ['chicago', 'austin', 'houston'];

describe('§US-OPEN-HEIGHTS-OSM-JOIN — bake.mjs wires the us_open stamp for the newyork / sanfrancisco / boston rows', () => {
    it('imports the stamp from heights/usOpenHeightsStamp.mjs and the working set from heights/usOpenHeights.mjs', () => {
        expect(bake).toMatch(/^import \{ stampUsOpenHeightsOnGeojsonseq \} from '\.\/heights\/usOpenHeightsStamp\.mjs';/m);
        expect(bake).toMatch(/^import \{ US_OPEN_CITY_BBOXES \} from '\.\/heights\/usOpenHeights\.mjs';/m);
    });

    it("each wired metro row declares heightJoin:'us_open'", () => {
        for (const name of WIRED) {
            const row = bake.match(new RegExp(`\\{\\s*name:\\s*'${name}'\\s*,[^\\n]*\\}`));
            expect(row, `${name} row`).not.toBeNull();
            expect(row![0], name).toMatch(/heightJoin:\s*'us_open'/);
        }
    });

    it('no OTHER US metro row declares a heightJoin (chicago has stories, not a height — probed; austin/houston have no channel)', () => {
        for (const name of NOT_WIRED) {
            const row = bake.match(new RegExp(`\\{\\s*name:\\s*'${name}'\\s*,[^\\n]*\\}`));
            expect(row, `${name} row`).not.toBeNull();
            expect(row![0], `${name} must not declare a heightJoin`).not.toMatch(/heightJoin/);
        }
    });

    it('stampBboxesFor bounds each us_open region to ITS OWN US_OPEN_CITY_BBOXES row (§HEIGHT-STAMP-BUDGET preflight)', () => {
        const fn = bake.match(/function stampBboxesFor\(r\)\s*\{([\s\S]*?)\n\}/);
        expect(fn, 'stampBboxesFor').not.toBeNull();
        expect(fn![1]).toMatch(/r\.heightJoin === 'us_open'\)\s*return US_OPEN_CITY_BBOXES\.filter\(\(c\) => c\.region === r\.name\)\.map\(\(c\) => c\.bbox\)/);
    });

    it('dispatches us_open through NATIONAL_STAMP_TABLE (the pinned chain admits no new key — swissWiring.spec.ts pins its end), with the retained working set', () => {
        const table = bake.match(/const NATIONAL_STAMP_TABLE = \{([\s\S]*?)\n\};/);
        expect(table, 'NATIONAL_STAMP_TABLE').not.toBeNull();
        expect(table![1]).toMatch(/us_open:\s*\{\s*stamp:\s*stampUsOpenHeightsOnGeojsonseq,\s*bboxes:\s*US_OPEN_CITY_BBOXES\s*\}/);
        // The table path must reach the SAME gate bookkeeping as the chain, bounded by stampBboxesFor.
        expect(bake).toMatch(/const tableStamp = NATIONAL_STAMP_TABLE\[r\.heightJoin\];/);
        expect(bake).toMatch(/const retainBboxes = stampBboxesFor\(r\);[^\n]*\n[^\n]*\n[^\n]*tableStamp\.stamp\(baseGeo, stamped, wsen, \{ maxTiles: 20000, retainBboxes \}\)/);
        expect(bake).toMatch(/recordNationalStampOutcome\(r, res, stamped, baseGeo, geos\);/);
        // And the chain must NOT have been extended for it (that would break the sibling pins).
        expect(bake).not.toMatch(/r\.heightJoin === 'us_open'\) res = await/);
    });
});

describe('§US-OPEN-HEIGHTS — heightSources.mjs routes the three metros to the live source; chicago/austin/houston stay documented', () => {
    it("REGION_SOURCE maps newyork / sanfrancisco / boston → 'us_open_heights' and chicago / austin / houston → 'overture_us'", () => {
        // Several regions share one REGION_SOURCE line (`newyork: …, sanfrancisco: …,`), so anchor on a
        // preceding line start / whitespace, not on the line start alone.
        for (const name of WIRED) expect(hs, name).toMatch(new RegExp(`(^|[\\s,])${name}:\\s*'us_open_heights'`, 'm'));
        for (const name of NOT_WIRED) expect(hs, name).toMatch(new RegExp(`(^|[\\s,])${name}:\\s*'overture_us'`, 'm'));
    });
    it("SOURCES has us_open_heights (impl:'live') and overture_us stays impl:'documented'", () => {
        expect(hs).toMatch(/us_open_heights:\s*\{\s*\n?\s*country:\s*'us'[^\n]*impl:\s*'live'/);
        expect(hs).toMatch(/overture_us:\s*\{\s*\n?\s*country:\s*'us'[^\n]*impl:\s*'documented'/);
    });
    it('resolveHeights names the exact row edit for a region on us_open_heights without a heightJoin', () => {
        expect(hs).toMatch(/source === 'us_open_heights'/);
        expect(hs).toMatch(/declares heightJoin:'us_open' in bake\.mjs \(with stampBboxesFor → US_OPEN_CITY_BBOXES\)/);
    });
    it('heightSources.mjs EXPORTS the join helpers the stamp module borrows (so the retained-working-set code is shared, not copied)', () => {
        const exp = hs.match(/^export \{([^}]*)\};/gm) ?? [];
        const names = exp.join(' ');
        for (const h of ['footprintFromFeature', 'stampAreasFor', 'inAnyArea', 'bucketRecords', 'httpGetSafe', 'statsOf']) {
            expect(names, `heightSources.mjs must export ${h}`).toMatch(new RegExp(`\\b${h}\\b`));
        }
        expect(hs).toMatch(/^export const MEASURED_HEIGHT_SRC_TAG = 'pryzm:height_src';/m);
        expect(hs).toMatch(/loadJoinFootprintsBounded \} from '\.\/geojsonseqRead\.mjs';/);
    });
});

describe('§US-OPEN-HEIGHTS — the stamp module keeps FAILURE and EMPTY apart and stamps the measured marker', () => {
    it('imports the shared helpers from heightSources.mjs and the decisions from usOpenHeights.mjs', () => {
        expect(stamp).toMatch(/from '\.\.\/heightSources\.mjs';/);
        expect(stamp).toMatch(/from '\.\/usOpenHeights\.mjs';/);
        expect(stamp).toMatch(/^export async function stampUsOpenHeightsOnGeojsonseq\(/m);
    });
    it('a refused / undecodable page FAILS the cell (tileErrors), an answered-but-empty cell is voidTiles, and a partial page never stamps', () => {
        expect(stamp).toMatch(/if \(!rr\.ok\) \{ failed = true; break; \}/);
        expect(stamp).toMatch(/if \(!page\) \{ failed = true; break; \}/);
        expect(stamp).toMatch(/if \(failed\) \{ tileErrors\+\+; continue; \}/);
        expect(stamp).toMatch(/if \(comps\.length === 0\) \{ voidTiles\+\+; continue; \}/);
        expect(stamp).toMatch(/\[MEASURED_HEIGHT_SRC_TAG\]: MEASURED_HEIGHT_SRC_VALUE/);
        expect(stamp).toMatch(/heightSource: m\.heightSourceTag/);
    });
});

describe('§US-OPEN-HEIGHTS — both CI gates refuse a US metro bake that ships no measured heights', () => {
    it('context-bake.yml and context-merge-publish.yml carry the manhattan / sanfrancisco / boston rows', () => {
        for (const wf of ['context-bake.yml', 'context-merge-publish.yml']) {
            const text = readFileSync(resolve(HERE, '../../../.github/workflows', wf), 'utf8');
            expect(text, wf).toMatch(/^\s*manhattan newyork 40\.7580,-73\.9855 500$/m);
            expect(text, wf).toMatch(/^\s*sanfrancisco sanfrancisco 37\.7900,-122\.4000 500$/m);
            expect(text, wf).toMatch(/^\s*boston boston 42\.3510,-71\.0750 500$/m);
        }
    });
});
