// §ADSDI-NDSM-OVERTURE-JOIN (2026-09-05, lane ME-ABUDHABI-I3S) — the WIRING of the Abu Dhabi measured-height stamp,
// pinned on TEXT (the atCzSiWiring.spec.ts shape, one country).
//
// The stamp was BUILT in heights/abudhabiNdsm{,Stamp}.mjs and would sit imported by nothing — the L-12883 / L-12910
// shape (a measured-height channel one import away while the row baked honest 9 m defaults and rendered as ghosts)
// — unless bake.mjs imports it, the `gccstates` row declares the join key (it was `abudhabi` until §ME-NATIONAL,
// 2026-09-06; the working set AD_CITY_BBOXES is unchanged), stampBboxesFor bounds the join to the
// city list, NATIONAL_STAMP_TABLE dispatches it, and both CI gates refuse a bake that stamps nothing at
// Al Markaziyah. bake.mjs runs main() on import and cannot be loaded by vitest, so each wiring point is asserted on
// the TEXT, one assertion per place. The `gccstates` row is OVERTURE-sourced (buildingsSource:'overture') — the
// stamp runs on that GeoJSONSeq exactly as it would on an OSM clip; the row must KEEP that source (the Gulf is an
// OSM building desert), which is pinned too.
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AD_CITY_BBOXES } from '../heights/abudhabiNdsm.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const bake = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
const heightSources = readFileSync(resolve(HERE, '../heightSources.mjs'), 'utf8');
const workflows = ['context-bake.yml', 'context-merge-publish.yml'].map((wf) => [wf, readFileSync(resolve(HERE, '../../../.github/workflows', wf), 'utf8')] as const);

const C = {
    region: 'gccstates', key: 'ad_ndsm', stamp: 'stampAdNdsmHeightsOnGeojsonseq', bboxes: 'AD_CITY_BBOXES',
    module: './heights/abudhabiNdsmStamp.mjs', city: 'abudhabi',
    gate: /^\s*abudhabi gccstates 24\.4539,54\.3773 500$/m,
    gateParked: /^\s*#\s*abudhabi gccstates 24\.4539,54\.3773 500$/m,
    source: /^\s*gccstates:\s*'adsdi_ndsm_ae',.*WIRED 2026-09-05/m,
};

describe(`§${C.key.toUpperCase()} — bake.mjs wires the ${C.region} stamp`, () => {
    it(`imports the stamp AND its working set from ${C.module} (never built-and-orphaned)`, () => {
        const re = new RegExp(`^import\\s*\\{([^}]*)\\}\\s*from\\s*'${C.module.replace(/[.]/g, '\\.')}';`, 'm');
        const imp = bake.match(re);
        expect(imp, `${C.module} import statement`).not.toBeNull();
        expect(imp![1]).toContain(C.stamp);
        expect(imp![1]).toContain(C.bboxes);
    });

    it(`the \`${C.region}\` region row declares heightJoin:'${C.key}' AND keeps buildingsSource:'overture'`, () => {
        const row = bake.match(new RegExp(`\\{\\s*name:\\s*'${C.region}'\\s*,[^\\n]*\\}`));
        expect(row, `${C.region} row`).not.toBeNull();
        expect(row![0]).toMatch(new RegExp(`heightJoin:\\s*'${C.key}'`));
        expect(row![0]).toMatch(/buildingsSource:\s*'overture'/);
    });

    // §ME-NATIONAL (2026-09-06) — the row this join rides MOVED (abudhabi -> gccstates: the six GCC states are ONE
    // Geofabrik extract, and six country rectangles cut from it cannot be disjoint). The assertion that MATTERS is
    // unchanged and is now stated directly instead of as a literal metro bbox: the row must CONTAIN the working set
    // the stamp was measured against, or the declared join runs nowhere.
    it('the row bbox contains every AD_CITY_BBOXES cell the stamp was measured against', () => {
        const row = bake.match(new RegExp(`\\{\\s*name:\\s*'${C.region}'\\s*,[^\\n]*\\}`))![0];
        const m = row.match(/bbox: '(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)'/)!;
        const [w, s, e, n] = m.slice(1).map(Number);
        for (const cell of AD_CITY_BBOXES) {
            const [cw, cs, ce, cn] = cell.bbox;
            expect(w <= cw && s <= cs && e >= ce && n >= cn, `${cell.city} outside the ${C.region} row`).toBe(true);
        }
    });

    it(`stampBboxesFor bounds the join to ${C.bboxes} (§HEIGHT-STAMP-BUDGET preflight)`, () => {
        const fn = bake.match(/function stampBboxesFor\(r\)\s*\{([\s\S]*?)\n\}/);
        expect(fn, 'stampBboxesFor').not.toBeNull();
        expect(fn![1]).toMatch(new RegExp(`r\\.heightJoin === '${C.key}'\\)\\s*return ${C.bboxes}\\.map`));
    });

    it(`NATIONAL_STAMP_TABLE dispatches '${C.key}' to ${C.stamp} with the ${C.bboxes} working set`, () => {
        const table = bake.match(/const NATIONAL_STAMP_TABLE\s*=\s*\{([\s\S]*?)\n\};/);
        expect(table, 'NATIONAL_STAMP_TABLE').not.toBeNull();
        expect(table![1]).toMatch(new RegExp(`${C.key}:\\s*\\{\\s*stamp:\\s*${C.stamp}\\s*,\\s*bboxes:\\s*${C.bboxes}\\s*\\}`));
    });

    // §PENDING-HEIGHTS round 2 (b153332d, 2026-09-05) — the TWO gates are in DIFFERENT states on purpose, and this
    // spec pins the difference rather than asserting the tidier thing that is not true:
    //   • context-bake.yml's gate runs INSIDE the bake that produces the heights, so an ACTIVE `gccstates` row is
    //     exactly right: a declared join that stamps nothing at Al Markaziyah must fail THERE.
    //   • context-merge-publish.yml's gate runs over the MERGED set, which today still carries the pre-stamp
    //     `abudhabi`/`gccstates` bytes. An active row there refused the WHOLE merge and stranded twelve other regions'
    //     measured heights (run 33980124792), so the orchestrator PARKED it. It is parked, not deleted, with the
    //     un-park condition written beside it — un-parking must stay a deliberate edit, and deleting the parked
    //     line must break this spec.
    it(`context-bake.yml's gate ACTIVELY refuses an ${C.region} bake that ships no measured heights at Al Markaziyah`, () => {
        const [, bakeWf] = workflows.find(([wf]) => wf === 'context-bake.yml')!;
        expect(bakeWf).toMatch(C.gate);
    });

    it(`context-merge-publish.yml's ${C.region} row is PARKED under §PENDING-HEIGHTS, not silently dropped`, () => {
        const [, pubWf] = workflows.find(([wf]) => wf === 'context-merge-publish.yml')!;
        expect(pubWf, 'the row must NOT be active while the merged set predates the stamp').not.toMatch(C.gate);
        expect(pubWf, 'the row must still be present, commented, so re-adding it is a deliberate edit').toMatch(C.gateParked);
        expect(pubWf).toMatch(/§PENDING-HEIGHTS/);
    });

    it(`heightSources.mjs REGION_SOURCE \`${C.region}\` records the join as WIRED, and the I3S refusal stays on the record`, () => {
        expect(heightSources).toMatch(C.source);
        const line = heightSources.split('\n').find((l) => C.source.test(l))!;   // the WHOLE row, not the regex's prefix
        expect(line).toMatch(/I3S/);
        expect(line).toMatch(/REFUSED|refused/);
    });

    it('the SOURCES table carries the adsdi_ndsm_ae entry as a documented STAMP (resolveHeights must not fetch footprints for it)', () => {
        const entry = heightSources.match(/^\s*adsdi_ndsm_ae:\s*\{([\s\S]*?)\n\s*\},/m);
        expect(entry, 'adsdi_ndsm_ae SOURCES entry').not.toBeNull();
        expect(entry![1]).toMatch(/impl:\s*'documented'/);
        expect(entry![1]).toMatch(/country:\s*'ae'/);
    });
});
