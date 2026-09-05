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
    it('imports the stamp AND its working set from heightSources.mjs', () => {
        const imp = bake.match(/^import\s*\{([^}]*)\}\s*from\s*'\.\/heightSources\.mjs';/m);
        expect(imp, 'heightSources.mjs import statement').not.toBeNull();
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

    it('stampBboxesFor bounds the national join to SWISS_CITY_BBOXES (§HEIGHT-STAMP-BUDGET preflight)', () => {
        const fn = bake.match(/function stampBboxesFor\(r\)\s*\{([\s\S]*?)\n\}/);
        expect(fn, 'stampBboxesFor').not.toBeNull();
        expect(fn![1]).toMatch(/r\.heightJoin === 'swiss'\)\s*return SWISS_CITY_BBOXES\.map/);
    });

    it('dispatches swiss to stampSwissHeightsOnGeojsonseq with the retained working set', () => {
        expect(bake).toMatch(/r\.heightJoin === 'mnh_fr' \|\| r\.heightJoin === 'swiss'\)/);
        expect(bake).toMatch(/if \(r\.heightJoin === 'swiss'\) res = await stampSwissHeightsOnGeojsonseq\(baseGeo, stamped, wsen, \{ maxTiles, retainBboxes \}\)/);
    });

    it('both CI gates refuse a Swiss bake that ships no measured heights at Zürich', () => {
        for (const wf of ['context-bake.yml', 'context-merge-publish.yml']) {
            const text = readFileSync(resolve(HERE, '../../../.github/workflows', wf), 'utf8');
            expect(text, wf).toMatch(/^\s*zurich switzerland 47\.3769,8\.5417 500$/m);
        }
    });
});
