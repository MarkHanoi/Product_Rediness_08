// §BEV-ALS-OSM-JOIN · §CUZK-NDSM-OSM-JOIN · §GURS-KN-OSM-JOIN (2026-09-05, lane HEIGHTS-AT-CZ-SI) — the WIRING
// of the Austrian, Czech and Slovenian national height stamps, pinned on TEXT.
//
// The three stamps were BUILT in their own modules (heights/{at,cz,si}Heights*.mjs) and would sit imported by
// nothing — the L-12883 / L-12910 shape (a measured-height channel one import away while the country baked
// honest 9 m defaults and rendered as ghosts) — unless bake.mjs imports them, the region rows declare the
// join key, stampBboxesFor bounds each join to its city list, NATIONAL_STAMP_TABLE dispatches it, and both
// CI gates refuse a bake that stamps nothing at the capital. bake.mjs runs main() on import and cannot be
// loaded by vitest, so — like swissWiring.spec.ts / noWiring.spec.ts — each wiring point is asserted on the
// TEXT, one assertion per place. One file for the three countries because they were wired in one commit
// and share every shape; a per-country describe keeps a failure readable.
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const bake = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
const heightSources = readFileSync(resolve(HERE, '../heightSources.mjs'), 'utf8');
const workflows = ['context-bake.yml', 'context-merge-publish.yml'].map((wf) => [wf, readFileSync(resolve(HERE, '../../../.github/workflows', wf), 'utf8')] as const);

const COUNTRIES = [
    { region: 'austria',  key: 'bev_at',  stamp: 'stampAtHeightsOnGeojsonseq', bboxes: 'AT_CITY_BBOXES', module: './heights/atHeightsStamp.mjs', city: 'vienna',    gate: /^\s*vienna austria 48\.2086,16\.3725 500$/m,    source: /^\s*austria:\s*'geoland_at',.*WIRED 2026-09-05/m },
    { region: 'czechia',  key: 'cuzk_cz', stamp: 'stampCzHeightsOnGeojsonseq', bboxes: 'CZ_CITY_BBOXES', module: './heights/czHeightsStamp.mjs', city: 'prague',    gate: /^\s*prague czechia 50\.0875,14\.4213 500$/m,    source: /^\s*czechia:\s*'ruian_cz',.*WIRED 2026-09-05/m },
    { region: 'slovenia', key: 'gurs_si', stamp: 'stampSiHeightsOnGeojsonseq', bboxes: 'SI_CITY_BBOXES', module: './heights/siHeightsStamp.mjs', city: 'ljubljana', gate: /^\s*ljubljana slovenia 46\.0511,14\.5051 500$/m, source: /^\s*slovenia:\s*'gurs_si',.*WIRED 2026-09-05/m },
];

for (const c of COUNTRIES) {
    describe(`§${c.key.toUpperCase()} — bake.mjs wires the ${c.region} stamp`, () => {
        it(`imports the stamp AND its working set from ${c.module} (never built-and-orphaned)`, () => {
            const re = new RegExp(`^import\\s*\\{([^}]*)\\}\\s*from\\s*'${c.module.replace(/[.]/g, '\\.')}';`, 'm');
            const imp = bake.match(re);
            expect(imp, `${c.module} import statement`).not.toBeNull();
            expect(imp![1]).toContain(c.stamp);
            expect(imp![1]).toContain(c.bboxes);
        });

        it(`the \`${c.region}\` region row declares heightJoin:'${c.key}'`, () => {
            const row = bake.match(new RegExp(`\\{\\s*name:\\s*'${c.region}'\\s*,[^\\n]*\\}`));
            expect(row, `${c.region} row`).not.toBeNull();
            expect(row![0]).toMatch(new RegExp(`heightJoin:\\s*'${c.key}'`));
        });

        it(`no ${c.region} city row exists, so the national join cannot double-bake the capital`, () => {
            expect(bake, `${c.city} must not be a bake region row`).not.toMatch(new RegExp(`\\{\\s*name:\\s*'${c.city}'`));
        });

        it(`stampBboxesFor bounds the national join to ${c.bboxes} (§HEIGHT-STAMP-BUDGET preflight)`, () => {
            const fn = bake.match(/function stampBboxesFor\(r\)\s*\{([\s\S]*?)\n\}/);
            expect(fn, 'stampBboxesFor').not.toBeNull();
            expect(fn![1]).toMatch(new RegExp(`r\\.heightJoin === '${c.key}'\\)\\s*return ${c.bboxes}\\.map`));
        });

        it(`NATIONAL_STAMP_TABLE dispatches '${c.key}' to ${c.stamp} with the ${c.bboxes} working set`, () => {
            const table = bake.match(/const NATIONAL_STAMP_TABLE\s*=\s*\{([\s\S]*?)\n\};/);
            expect(table, 'NATIONAL_STAMP_TABLE').not.toBeNull();
            expect(table![1]).toMatch(new RegExp(`${c.key}:\\s*\\{\\s*stamp:\\s*${c.stamp}\\s*,\\s*bboxes:\\s*${c.bboxes}\\s*\\}`));
        });

        it(`both CI gates refuse a ${c.region} bake that ships no measured heights at ${c.city}`, () => {
            for (const [wf, text] of workflows) expect(text, wf).toMatch(c.gate);
        });

        it(`heightSources.mjs REGION_SOURCE \`${c.region}\` records the join as WIRED (the note is not the wiring — this file's other pins are)`, () => {
            expect(heightSources).toMatch(c.source);
        });
    });
}
