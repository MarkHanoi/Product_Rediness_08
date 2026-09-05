// §BE-DHMV-OSM-JOIN (2026-09-05, lane HEIGHTS-EE-PL-PT-BE) — the WIRING of the Belgian national height stamp, pinned.
//
// Asserted on the TEXT of bake.mjs (which runs main() on import and cannot be loaded by vitest), one assertion per
// place the join is wired: the import, the row, the working-set bound, the NATIONAL_STAMP_TABLE entry, the shared
// projector def, the REGION_SOURCE note and the two CI gate rows — so the stamp can never sit "built, imported by
// nothing" (the FR/CH/NL/NO shape).
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const bake = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
const heightSources = readFileSync(resolve(HERE, '../heightSources.mjs'), 'utf8');
const stamp = readFileSync(resolve(HERE, '../heights/beHeightsStamp.mjs'), 'utf8');
const reproject = readFileSync(resolve(HERE, '../reproject.mjs'), 'utf8');

describe('§BE-DHMV-OSM-JOIN — bake.mjs wires the DHMV stamp for the `belgium` row', () => {
    it('imports the stamp AND its working set DIRECTLY from heights/beHeightsStamp.mjs', () => {
        expect(bake).toMatch(/^import \{ stampBeDhmvHeightsOnGeojsonseq, BE_CITY_BBOXES \} from '\.\/heights\/beHeightsStamp\.mjs';/m);
    });

    it("the `belgium` region row declares heightJoin:'be_dhmv'", () => {
        const row = bake.match(/\{\s*name:\s*'belgium'\s*,[^\n]*\}/);
        expect(row, 'belgium row').not.toBeNull();
        expect(row![0]).toMatch(/heightJoin:\s*'be_dhmv'/);
    });

    it('no BE city row exists, so the national join cannot double-bake a city', () => {
        for (const city of ['antwerp', 'ghent', 'brussels', 'leuven', 'bruges']) {
            expect(bake, `${city} must not be a bake region row`).not.toMatch(new RegExp(`\\{\\s*name:\\s*'${city}'`));
        }
    });

    it('stampBboxesFor bounds the national join to BE_CITY_BBOXES (§HEIGHT-STAMP-BUDGET preflight)', () => {
        const fn = bake.match(/function stampBboxesFor\(r\)\s*\{([\s\S]*?)\n\}/);
        expect(fn, 'stampBboxesFor').not.toBeNull();
        expect(fn![1]).toMatch(/r\.heightJoin === 'be_dhmv'\)\s*return BE_CITY_BBOXES\.map/);
    });

    it('dispatches be_dhmv through NATIONAL_STAMP_TABLE (the pinned chain admits no new key)', () => {
        const table = bake.match(/const NATIONAL_STAMP_TABLE = \{([\s\S]*?)\n\};/);
        expect(table, 'NATIONAL_STAMP_TABLE').not.toBeNull();
        expect(table![1]).toMatch(/be_dhmv:\s*\{\s*stamp:\s*stampBeDhmvHeightsOnGeojsonseq,\s*bboxes:\s*BE_CITY_BBOXES\s*\}/);
    });

    it('the stamp module exports the function, projects through the ONE shared reproject.mjs, and stamps the measured marker', () => {
        expect(stamp).toMatch(/^export async function stampBeDhmvHeightsOnGeojsonseq\(/m);
        expect(stamp).toMatch(/from '\.\/beHeights\.mjs';/);
        expect(stamp).toMatch(/import\('\.\.\/reproject\.mjs'\)/);
        expect(stamp).toMatch(/getProjector\(BE_DHMV\.crs\)/);
        expect(stamp).toMatch(/ndsmHeightForBuilding\(/);
        expect(stamp).toMatch(/heightSource: BE_DHMV\.heightSourceTag/);
        expect(stamp).toMatch(/\[MEASURED_HEIGHT_SRC_TAG\]: MEASURED_HEIGHT_SRC_VALUE/);
        expect(stamp).toMatch(/tileErrors\+\+/);
        expect(stamp).toMatch(/voidTiles\+\+/);
    });

    it('reproject.mjs registers EPSG:31370 (Belgian Lambert 72) — the stamp cannot project without it', () => {
        expect(reproject).toMatch(/^\s*'EPSG:31370':\s*'\+proj=lcc \+lat_0=90 \+lon_0=4\.36748666666667 /m);
    });

    it('heightSources.mjs REGION_SOURCE reads WIRED for belgium, grb_be is impl live, and brussels is no longer blocked', () => {
        expect(heightSources).toMatch(/^\s*belgium:\s*'grb_be',\s*\/\/.*WIRED 2026-09-05/m);
        expect(heightSources).toMatch(/grb_be:\s*\{\s*\n?\s*country:\s*'be'[^\n]*impl:\s*'live'/);
        expect(heightSources).toMatch(/source === 'grb_be'/);
        expect(heightSources).not.toMatch(/brussels:\s*\{\s*source:\s*'grb_be',\s*status:\s*'blocked'/);
    });

    it('both CI gates refuse a Belgian bake that ships no measured heights at Antwerp', () => {
        for (const wf of ['context-bake.yml', 'context-merge-publish.yml']) {
            const text = readFileSync(resolve(HERE, '../../../.github/workflows', wf), 'utf8');
            expect(text, wf).toMatch(/^\s*antwerp belgium 51\.2213,4\.3997 500$/m);
        }
    });
});
