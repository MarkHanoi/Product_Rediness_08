// §AU-OPEN-HEIGHTS-OSM-JOIN (2026-09-05, lane HEIGHTS-AU) — the WIRING of the first Australian
// measured-height stamp, pinned.
//
// The France (L-12910) and Switzerland (L-12883) stamps were each BUILT and imported by nothing for a
// day: a measured-height channel one import away while the country baked honest 9 m defaults and
// rendered as ghosts. This spec exists so the AU stamp cannot repeat that shape silently. bake.mjs
// runs main() on import and cannot be loaded by vitest, so — like swissWiring.spec.ts — the wiring is
// asserted on the TEXT, one assertion per place the join is wired, because "exactly like mds" is the
// design rule (bake.mjs §MDS-OSM-JOIN). heightSources.mjs is read the same way (it cannot be imported
// by vite's transform either — mdsBboxCoversTerrainRegion.spec.ts).
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const bake = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
const hs = readFileSync(resolve(HERE, '../heightSources.mjs'), 'utf8');

describe('§AU-OPEN-HEIGHTS-OSM-JOIN — bake.mjs wires the au_open stamp for the `victoria` row', () => {
    it('imports the stamp AND its working set from heightSources.mjs', () => {
        const imp = bake.match(/^import\s*\{([^}]*)\}\s*from\s*'\.\/heightSources\.mjs';/m);
        expect(imp, 'heightSources.mjs import statement').not.toBeNull();
        expect(imp![1]).toContain('stampAuOpenHeightsOnGeojsonseq');
        expect(imp![1]).toContain('AU_OPEN_CITY_BBOXES');
    });

    it("the `victoria` region row declares heightJoin:'au_open'", () => {
        const row = bake.match(/\{\s*name:\s*'victoria'\s*,[^\n]*\}/);
        expect(row, 'victoria row').not.toBeNull();
        expect(row![0]).toMatch(/heightJoin:\s*'au_open'/);
    });

    it('no OTHER AU state row declares a heightJoin (their channels were probed and found unreal — never armed on a blank)', () => {
        for (const state of ['newsouthwales', 'queensland', 'westernaustralia', 'southaustralia', 'tasmania', 'act', 'northernterritory']) {
            const row = bake.match(new RegExp(`\\{\\s*name:\\s*'${state}'\\s*,[^\\n]*\\}`));
            expect(row, `${state} row`).not.toBeNull();
            expect(row![0], `${state} must not declare a heightJoin`).not.toMatch(/heightJoin/);
        }
    });

    it('no melbourne city row exists, so the national join cannot double-bake the capital', () => {
        expect(bake).not.toMatch(/\{\s*name:\s*'melbourne'/);
    });

    it('stampBboxesFor bounds the national join to AU_OPEN_CITY_BBOXES (§HEIGHT-STAMP-BUDGET preflight)', () => {
        const fn = bake.match(/function stampBboxesFor\(r\)\s*\{([\s\S]*?)\n\}/);
        expect(fn, 'stampBboxesFor').not.toBeNull();
        expect(fn![1]).toMatch(/r\.heightJoin === 'au_open'\)\s*return AU_OPEN_CITY_BBOXES\.map/);
    });

    it('dispatches au_open to stampAuOpenHeightsOnGeojsonseq with the retained working set', () => {
        // au_open is the FIRST term of the dispatch condition — the only insertion point that keeps both sibling pins
        // (mnhFr.spec.ts `'mds' || 'dhm' || 'lod2nrw' || 'mnh_fr'`, swissWiring.spec.ts `'mnh_fr' || 'swiss')`) contiguous.
        expect(bake).toMatch(/if \(r\.heightJoin === 'au_open' \|\| r\.heightJoin === 'mds' \|\| r\.heightJoin === 'dhm'/);
        expect(bake).toMatch(/if \(r\.heightJoin === 'au_open'\) res = await stampAuOpenHeightsOnGeojsonseq\(baseGeo, stamped, wsen, \{ maxTiles, retainBboxes \}\)/);
    });
});

describe('§AU-OPEN-HEIGHTS — heightSources.mjs routes victoria to the live source and the rest stay documented', () => {
    it('exports the stamp and re-exports the working set', () => {
        expect(hs).toMatch(/^export async function stampAuOpenHeightsOnGeojsonseq\(/m);
        expect(hs).toMatch(/^export \{[^}]*AU_OPEN_CITY_BBOXES[^}]*\};/m);
    });
    it("REGION_SOURCE maps victoria → 'au_open_lod1' (impl:'live') and every other AU state → 'elvis_au' (impl:'documented')", () => {
        expect(hs).toMatch(/^\s*victoria:\s*'au_open_lod1',/m);
        for (const state of ['newsouthwales', 'queensland', 'westernaustralia', 'southaustralia', 'tasmania', 'act', 'northernterritory']) {
            expect(hs, state).toMatch(new RegExp(`^\\s*${state}:\\s*'elvis_au',`, 'm'));
        }
        expect(hs).toMatch(/au_open_lod1:\s*\{\s*\n?\s*country:\s*'au'[^\n]*impl:\s*'live'/);
        expect(hs).toMatch(/elvis_au:\s*\{\s*\n?\s*country:\s*'au'[^\n]*impl:\s*'documented'/);
    });
    it('resolveHeights names the exact row edit for a region on au_open_lod1 without a heightJoin', () => {
        expect(hs).toMatch(/source === 'au_open_lod1'/);
        expect(hs).toMatch(/declares heightJoin:'au_open' in bake\.mjs \(with stampBboxesFor → AU_OPEN_CITY_BBOXES\)/);
    });
    it('the stamp keeps export FAILURE (tileErrors) and export EMPTY (voidTiles) as different counters', () => {
        // The function body runs from its `export` line to the NEXT top-level export — a lazy `\n}` would stop at
        // the column-0 `}` that closes the destructured options parameter (`} = {}) {`), three lines in.
        const start = hs.indexOf('export async function stampAuOpenHeightsOnGeojsonseq(');
        expect(start, 'stampAuOpenHeightsOnGeojsonseq').toBeGreaterThan(-1);
        const next = hs.indexOf('\nexport ', start + 1);
        const fn = hs.slice(start, next === -1 ? undefined : next);
        expect(fn).toMatch(/if \(!rr\.ok\) \{ tileErrors\+\+; continue; \}/);
        expect(fn).toMatch(/if \(!fc\) \{ tileErrors\+\+; continue; \}/);
        expect(fn).toMatch(/if \(comps\.length === 0\) \{ voidTiles\+\+; continue; \}/);
        expect(fn).toMatch(/\[MEASURED_HEIGHT_SRC_TAG\]: MEASURED_HEIGHT_SRC_VALUE/);
    });
});

describe('§AU-OPEN-HEIGHTS — both CI gates refuse a Victoria bake that ships no measured heights at Melbourne', () => {
    it('context-bake.yml and context-merge-publish.yml carry the melbourne row', () => {
        for (const wf of ['context-bake.yml', 'context-merge-publish.yml']) {
            const text = readFileSync(resolve(HERE, '../../../.github/workflows', wf), 'utf8');
            expect(text, wf).toMatch(/^\s*melbourne victoria -37\.8136,144\.9631 500$/m);
        }
    });
});
