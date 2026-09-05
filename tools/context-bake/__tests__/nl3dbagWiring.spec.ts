// §NL-3DBAG-OSM-JOIN (2026-09-05, lane HEIGHTS-NL) — the WIRING of the Dutch national height stamp, pinned.
//
// The `netherlands` national row shipped on 2026-07-26 with honest OSM defaults and a REGION_SOURCE note
// naming the path (stamp 3DBAG heights onto bake's own OSM clip per city bbox) as "the named follow-up".
// France (L-12910) and Switzerland (L-12883) then both showed the same shape one step further along: a
// stamp BUILT and imported by nothing. This spec exists so the NL stamp cannot sit in that state — it is
// asserted on the TEXT of bake.mjs (which runs main() on import and cannot be loaded by vitest), one
// assertion per place the join is wired, because "exactly like mds" is the design rule (§MDS-OSM-JOIN).
//
// LAYOUT (differs from mnh_fr/swiss on purpose — the shared-file collision rule of the 2026-09-05 fleet):
// the stamp's network half lives in heights/nl3dbagStamp.mjs, NOT in heightSources.mjs, and bake.mjs
// imports it from there directly; heightSources.mjs contributes one export line of shared join helpers
// and the REGION_SOURCE note. The pure half (URL, height rule, match rule, working set) is heights/nl3dbag.mjs.
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const bake = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
const heightSources = readFileSync(resolve(HERE, '../heightSources.mjs'), 'utf8');
const stamp = readFileSync(resolve(HERE, '../heights/nl3dbagStamp.mjs'), 'utf8');

describe('§NL-3DBAG-OSM-JOIN — bake.mjs wires the 3dbag stamp for the `netherlands` row', () => {
    it('imports the stamp from heights/nl3dbagStamp.mjs AND its working set from heights/nl3dbag.mjs', () => {
        expect(bake).toMatch(/^import\s*\{[^}]*\bstampNl3dbagHeightsOnGeojsonseq\b[^}]*\}\s*from\s*'\.\/heights\/nl3dbagStamp\.mjs';/m);
        expect(bake).toMatch(/^import\s*\{[^}]*\bNL_3DBAG_CITY_BBOXES\b[^}]*\}\s*from\s*'\.\/heights\/nl3dbag\.mjs';/m);
    });

    it("the `netherlands` region row declares heightJoin:'3dbag' (the key heightSources.mjs REGION_SOURCE names)", () => {
        const row = bake.match(/\{\s*name:\s*'netherlands'\s*,[^\n]*\}/);
        expect(row, 'netherlands row').not.toBeNull();
        expect(row![0]).toMatch(/heightJoin:\s*'3dbag'/);
    });

    it('no NL city row exists, so the national join cannot double-bake a city', () => {
        for (const city of ['amsterdam', 'rotterdam', 'utrecht', 'thehague', 'eindhoven', 'groningen']) {
            expect(bake, `${city} must not be a bake region row`).not.toMatch(new RegExp(`\\{\\s*name:\\s*'${city}'`));
        }
    });

    it('stampBboxesFor bounds the national join to NL_3DBAG_CITY_BBOXES (§HEIGHT-STAMP-BUDGET preflight)', () => {
        const fn = bake.match(/function stampBboxesFor\(r\)\s*\{([\s\S]*?)\n\}/);
        expect(fn, 'stampBboxesFor').not.toBeNull();
        expect(fn![1]).toMatch(/r\.heightJoin === '3dbag'\)\s*return NL_3DBAG_CITY_BBOXES\.map/);
    });

    it('dispatches 3dbag to stampNl3dbagHeightsOnGeojsonseq with priority = retained = the city list', () => {
        expect(bake).toMatch(/if \(r\.heightJoin === '3dbag' \|\| r\.heightJoin === 'au_open' \|\| r\.heightJoin === 'mds'/);
        expect(bake).toMatch(/r\.heightJoin === '3dbag' \? NL_3DBAG_CITY_BBOXES\.map\(\(c\) => c\.bbox\)/);
        expect(bake).toMatch(/if \(r\.heightJoin === '3dbag'\) res = await stampNl3dbagHeightsOnGeojsonseq\(baseGeo, stamped, wsen, \{ maxTiles, priorityBboxes, retainBboxes \}\)/);
    });

    it('the stamp module exports the stamp, imports the pure half, and marks provenance exactly as the other stamps do', () => {
        expect(stamp).toMatch(/^export async function stampNl3dbagHeightsOnGeojsonseq\(/m);
        expect(stamp).toMatch(/from '\.\/nl3dbag\.mjs';/);
        expect(stamp).toMatch(/from '\.\.\/heightSources\.mjs';/);
        // The marker the client ranks above OSM `tagged` must ride on every stamped footprint.
        expect(stamp).toMatch(/heightSource: NL_3DBAG\.heightSourceTag/);
        expect(stamp).toMatch(/\[MEASURED_HEIGHT_SRC_TAG\]: MEASURED_HEIGHT_SRC_VALUE/);
    });

    it('heightSources.mjs exports the shared join helpers the stamp reuses, and its REGION_SOURCE note reads WIRED', () => {
        const helpers = heightSources.match(/^export \{([^}]*)\};\s*$/mg) ?? [];
        const joined = helpers.join(' ');
        for (const h of ['footprintFromFeature', 'stampAreasFor', 'inAnyArea', 'bucketRecords', 'httpGetSafe', 'statsOf', 'areaWeightedP90', 'dominantRoof', 'clampHeight']) {
            expect(joined, h).toContain(h);
        }
        expect(heightSources).toMatch(/^\s*netherlands:\s*'3dbag',\s*\/\/.*WIRED 2026-09-05/m);
    });

    it('both CI gates refuse a Dutch bake that ships no measured heights at Amsterdam', () => {
        for (const wf of ['context-bake.yml', 'context-merge-publish.yml']) {
            const text = readFileSync(resolve(HERE, '../../../.github/workflows', wf), 'utf8');
            expect(text, wf).toMatch(/^\s*amsterdam netherlands 52\.3730,4\.8924 500$/m);
        }
    });
});
