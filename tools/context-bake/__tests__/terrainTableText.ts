// §TERRAIN-TABLE-TEXT (2026-09-06, lane EU-EVERY-COUNTRY) — read the THREE tables that must agree
// about a region's ground, as TEXT.
//
// THE THREE TABLES. `bake.mjs` ALL_REGIONS says which ground gets CONTEXT tiles; `terrain.mjs`
// NATIONAL_REGIONS says which ground gets a TERRAIN tileset; `apps/editor/.../terrainCoverage.ts`
// TERRAIN_REGION_BBOXES says which ground the CLIENT will ask for. A terrain bbox smaller than the
// context bbox is a strip where buildings float on flat ground; a client row that drifts from the
// bake row is a tileset that is baked and never requested, or requested and 404s. Three copies of
// one bbox, and only `terrain.mjs --check-client-coverage` ever compared two of them, at CLI time.
//
// WHY TEXT AND NOT IMPORTS. `terrain.mjs` and `bake.mjs` both run a top-level `main()` under their
// CLI guard and cannot be loaded by vitest; `heightSources.mjs` cannot be transformed by vite at all
// (verified 2026-08-02, and that is why no spec in this repo imports it). Reading the source keeps
// every assertion a total function of the CURRENT rows rather than a second, drifting copy of the
// numbers — the `mdsBboxCoversTerrainRegion.spec.ts` / `computeScorecard.mjs` precedent.
//
// ⚠ DUPLICATION, DECLARED RATHER THAN HIDDEN. `middleEastTerrainRows.spec.ts` carries its own copy
// of these four functions. This module exists so there is ONE place to consolidate to, not two
// places to keep in sync: that file was being rewritten by a concurrent lane at the moment this one
// landed (its ME_ROWS had already become gccstates/turkey/israel/jordan/lebanon in the working
// tree), so editing it here would have swept up another lane's uncommitted work. The follow-up is
// four lines — delete that file's local parsers and import these — and it is named in the issue log
// rather than left to be discovered as drift.
//
// LAYERING: a build/inspection tool helper, like its siblings — no OTel span (P8 applies to exported
// package functions, not bake tooling).
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export type Bbox = [number, number, number, number];
export interface NationalRow {
    readonly name: string;
    readonly group: string;
    readonly bbox: Bbox;
    readonly geoidSepM: number;
    readonly probe: readonly [number, number];
}

const NUM = '(-?[\\d.]+)';
const BBOX = `\\[\\s*${NUM}\\s*,\\s*${NUM}\\s*,\\s*${NUM}\\s*,\\s*${NUM}\\s*\\]`;

/** `terrain.mjs` NATIONAL_REGIONS rows (name, group, bbox, geoidSepM, probe). */
export function nationalRegions(): NationalRow[] {
    const src = readFileSync(resolve(HERE, '../terrain.mjs'), 'utf8');
    const block = src.slice(src.indexOf('export const NATIONAL_REGIONS'));
    const body = block.slice(0, block.indexOf('];') + 1);
    const re = new RegExp(
        `\\{\\s*name:\\s*'([a-z0-9]+)'\\s*,\\s*group:\\s*'([a-z]+)'\\s*,\\s*bbox:\\s*${BBOX}\\s*,\\s*geoidSepM:\\s*${NUM}\\s*,`
        + `\\s*probeCity:\\s*'[^']+'\\s*,\\s*probe:\\s*\\[\\s*${NUM}\\s*,\\s*${NUM}\\s*\\]`, 'g');
    return [...body.matchAll(re)].map((m) => ({
        name: m[1]!,
        group: m[2]!,
        bbox: [Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])] as Bbox,
        geoidSepM: Number(m[7]),
        probe: [Number(m[8]), Number(m[9])] as [number, number],
    }));
}

/** `bake.mjs` ALL_REGIONS context rows: name → bbox (its bbox is the string form 'w,s,e,n'). */
export function bakeContextRegions(): Map<string, Bbox> {
    const src = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
    const out = new Map<string, Bbox>();
    // ⚠ NOT anchored on the opening `{`. `middleEastTerrainRows.spec.ts`'s copy of this regex starts
    // `\{\s*name:` — and `\s*` cannot cross the COMMENT that sits between `{` and `name:` on the
    // `spain` row, so that parser SILENTLY DROPS SPAIN. Its covering invariant has therefore never
    // seen the largest European region. Measured 2026-09-06 by this file's first red run; the fix is
    // to key on the `name: '...', pbfUrl:` pair, which is unique to a region row and comment-proof.
    const re = /name:\s*'([a-z0-9-]+)'\s*,\s*pbfUrl:[^}]*?bbox:\s*'(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)'/g;
    for (const m of src.matchAll(re)) out.set(m[1]!, [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])]);
    return out;
}

/** The raw text of one bake.mjs region row (everything up to the end of its line). */
export function bakeRowText(name: string): string | null {
    const src = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
    const m = src.match(new RegExp(`\\{\\s*name:\\s*'${name}'\\s*,[^\\n]*`));
    return m ? m[0] : null;
}

/** `terrainCoverage.ts` TERRAIN_REGION_BBOXES: region → bbox. */
export function clientRegions(): Map<string, Bbox> {
    const src = readFileSync(resolve(HERE, '../../../apps/editor/src/ui/geospatial/terrainCoverage.ts'), 'utf8');
    const block = src.slice(src.indexOf('export const TERRAIN_REGION_BBOXES'));
    const body = block.slice(0, block.indexOf('];') + 1);
    const out = new Map<string, Bbox>();
    const re = new RegExp(`\\{\\s*region:\\s*'([a-z0-9]+)'\\s*,\\s*bbox:\\s*${BBOX}`, 'g');
    for (const m of body.matchAll(re)) out.set(m[1]!, [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])]);
    return out;
}

/** True when `p` (lon,lat) is inside `b` (inclusive). */
export const inBbox = (p: readonly [number, number], b: Bbox): boolean =>
    p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];

/** True when `outer` fully contains `inner`. */
export const covers = (outer: Bbox, inner: Bbox): boolean =>
    outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];
