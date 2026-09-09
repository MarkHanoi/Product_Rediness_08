// §SWISS-OSM-JOIN (L-12883, wired 2026-09-05) — the WIRING of the Swiss national height stamp, pinned.
//
// `stampSwissHeightsOnGeojsonseq` + `SWISS_CITY_BBOXES` were BUILT on 2026-09-04 and imported by
// nothing — the identical shape France had until L-12910 the following morning: a measured-height
// channel one import away while the country baked honest 9 m defaults and rendered as ghosts.
// bake.mjs runs main() on import and cannot be loaded by vitest, so — like mnhFr.spec.ts and
// mdsBboxCoversTerrainRegion.spec.ts — the wiring is asserted on the TEXT, one assertion per place
// the join is wired, because "exactly like mds" is the design rule (bake.mjs §MDS-OSM-JOIN).
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const bake = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');

describe('§SWISS-OSM-JOIN — bake.mjs wires the swiss stamp for the `switzerland` row', () => {
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
    // For CH BOTH names moved: bake.mjs dispatches to the NATIONAL wrapper (pinned by
    // the "dispatches swiss to the NATIONAL wrapper" arm below), and the wrapper is
    // what holds the band stamp and the nine-city priority set.
    it('the national wrapper imports the band stamp AND its working set from heightSources.mjs', () => {
        const wrapper = readFileSync(resolve(HERE, '../heights/swissNationalStamp.mjs'), 'utf8');
        const imp = wrapper.match(/^import\s*\{([^}]*)\}\s*from\s*'\.\.\/heightSources\.mjs';/m);
        expect(imp, 'heightSources.mjs import statement in swissNationalStamp.mjs').not.toBeNull();
        expect(imp![1]).toContain('stampSwissHeightsOnGeojsonseq');
        expect(imp![1]).toContain('SWISS_CITY_BBOXES');
    });

    it("the `switzerland` region row declares heightJoin:'swiss' (the key heightSources.mjs REGION_SOURCE names)", () => {
        const row = bake.match(/\{\s*name:\s*'switzerland'\s*,[^\n]*\}/);
        expect(row, 'switzerland row').not.toBeNull();
        expect(row![0]).toMatch(/heightJoin:\s*'swiss'/);
    });

    it('no CH city row exists, so the national join cannot double-bake a capital', () => {
        for (const city of ['zurich', 'geneva', 'bern']) {
            expect(bake, `${city} must not be a bake region row`).not.toMatch(new RegExp(`\\{\\s*name:\\s*'${city}'`));
        }
    });

    // ⭐ REWRITTEN 2026-09-06 (lane HEIGHTS-LAST-NINE, §SWISS-NATIONAL-SWEEP). These two arms used to
    // pin `return SWISS_CITY_BBOXES.map` and a direct `stampSwissHeightsOnGeojsonseq` dispatch — i.e.
    // they pinned the NINE-CITY retain set as the correct state. It is no longer: `switzerland` retains
    // the WHOLE COUNTRY, on the previous lane's own assessment (`nationalHeightsAssessed.mjs` filed CH
    // as `'not-done-shape'` — "NOT REFUSED — NOT DONE … the blocker is shape, not data") plus a fresh
    // five-for-five reach probe outside the nine cities. The arms are REPLACED rather than deleted, so
    // a regression back to a city list still fails here by name.
    it('stampBboxesFor gives the swiss join the WHOLE COUNTRY, not the nine cities', () => {
        const fn = bake.match(/function stampBboxesFor\(r\)\s*\{([\s\S]*?)\n\}/);
        expect(fn, 'stampBboxesFor').not.toBeNull();
        expect(fn![1]).toMatch(/r\.heightJoin === 'swiss'\)\s*return SWISS_NATIONAL_BBOXES/);
        // ⛔ and NOT the old city-list form — a silent revert is what this line refuses.
        expect(fn![1]).not.toMatch(/r\.heightJoin === 'swiss'\)\s*return SWISS_CITY_BBOXES/);
    });

    it('dispatches swiss to the NATIONAL wrapper, which still drives the same band stamp', () => {
        expect(bake).toMatch(/r\.heightJoin === 'mnh_fr' \|\| r\.heightJoin === 'swiss'\)/);
        expect(bake).toMatch(/if \(r\.heightJoin === 'swiss'\) res = await stampSwissNationalHeightsOnGeojsonseq\(baseGeo, stamped, wsen, \{ maxTiles, retainBboxes \}\)/);
        expect(bake).toMatch(/import \{ stampSwissNationalHeightsOnGeojsonseq \} from '\.\/heights\/swissNationalStamp\.mjs';/);
    });

    it('the nine cities survive as the UNCAPPED PRIORITY pass — a national retain set must not cost them what they had', () => {
        const wrapper = readFileSync(resolve(HERE, '../heights/swissNationalStamp.mjs'), 'utf8');
        expect(wrapper).toMatch(/priorityBboxes = SWISS_CITY_BBOXES\.map\(\(c\) => c\.bbox\)/);
        // The stamp must be told the priority boxes are WGS84 while the retain set is LV95 — conflating
        // the two would silently point the nine cities at a patch of ground near LV95 (6.6, 46.9) m.
        expect(wrapper).toMatch(/areaCrs: 'lv95', priorityCrs: 'wgs84'/);
    });

    it('the wrapper imports NO projector — proj4 does not resolve from the repo root', () => {
        // The trap dcef4524 records: a static import of a tools-local dep makes the module's own spec
        // stop LOADING, silently. The LV95 box is a pinned constant instead.
        // ⚠ Matched at LINE START on a real `import` statement, never anywhere in the text: the module's
        // own header NAMES `'../reproject.mjs'` in the prose that explains why it must not import it, and
        // a loose regex would fail on the explanation rather than on the defect.
        const wrapper = readFileSync(resolve(HERE, '../heights/swissNationalStamp.mjs'), 'utf8');
        expect(wrapper).not.toMatch(/^import[^\n]*from '\.\.\/reproject\.mjs'/m);
        expect(wrapper).not.toMatch(/^import[^\n]*from 'proj4'/m);
    });

    it('both CI gates refuse a Swiss bake that ships no measured heights at Zürich', () => {
        for (const wf of ['context-bake.yml', 'context-merge-publish.yml']) {
            const text = readFileSync(resolve(HERE, '../../../.github/workflows', wf), 'utf8');
            expect(text, wf).toMatch(/^\s*zurich switzerland 47\.3769,8\.5417 500$/m);
        }
    });
});
