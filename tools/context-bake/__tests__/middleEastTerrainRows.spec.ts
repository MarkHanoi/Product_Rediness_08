// §ME-TERRAIN-ROWS (2026-09-05, lane ME-TERRAIN-PARCELS) — the Middle-East terrain rows must cover the
// context that is actually baked, and the client must request exactly what the bake produces.
//
// WHY THIS TEST EXISTS
// --------------------
// The Gulf metros (riyadh / jeddah / dubai / abudhabi) have CONTEXT tiles (bake.mjs REGIONS) but their
// TERRAIN comes from a separate table — `terrain.mjs` NATIONAL_REGIONS, group 'middleeast' — mirrored by
// hand into `terrainCoverage.ts` TERRAIN_REGION_BBOXES. Three tables, three copies of one bbox. A
// terrain bbox SMALLER than the context bbox is a silent strip where buildings float over flat ground
// (the failure-vs-empty conflation this repo keeps re-learning: L-422 / L-457 / §MDS-BBOX-MUST-COVER-
// THE-REGION); a client row that drifts from the bake row is a tileset that is baked but never
// requested (or requested and 404s). `terrain.mjs --check-client-coverage` asserts the client half at
// CLI time only; nothing pinned the bake↔context half at all. This does both, for every ME row, as a
// vitest spec that runs in CI.
//
// `doha` is deliberately allowed to have NO context row (QA is the one Gulf state whose keyless
// cadastre is wired — parcel leg `qa` — so a Doha site is reachable today and gets a terrain drape
// before its gcc-states context clip exists). The assertion for doha is therefore presence + parity,
// not context coverage.
//
// LAYERING: a build/inspection tool test, like its siblings — no OTel span (P8 applies to exported
// package functions, not bake tooling).
// ⚠ All three tables are read as TEXT, exactly like mdsBboxCoversTerrainRegion.spec.ts: terrain.mjs
// and bake.mjs both run a top-level `main()` when imported by their CLI guard / import side effects,
// and heightSources.mjs cannot be transformed by vite at all (verified 2026-08-02). Reading the source
// keeps this a total function of the CURRENT rows rather than a second, drifting copy.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

type Bbox = [number, number, number, number];
interface NationalRow { name: string; group: string; bbox: Bbox; geoidSepM: number; probe: [number, number] }

const NUM = '(-?[\\d.]+)';
const BBOX = `\\[\\s*${NUM}\\s*,\\s*${NUM}\\s*,\\s*${NUM}\\s*,\\s*${NUM}\\s*\\]`;

/** terrain.mjs NATIONAL_REGIONS rows (name, group, bbox, geoidSepM, probe). */
function nationalRegions(): NationalRow[] {
    const src = readFileSync(resolve(HERE, '../terrain.mjs'), 'utf8');
    const block = src.slice(src.indexOf('export const NATIONAL_REGIONS'));
    const body = block.slice(0, block.indexOf('];') + 1);
    const re = new RegExp(
        `\\{\\s*name:\\s*'([a-z0-9]+)'\\s*,\\s*group:\\s*'([a-z]+)'\\s*,\\s*bbox:\\s*${BBOX}\\s*,\\s*geoidSepM:\\s*${NUM}\\s*,` +
        `\\s*probeCity:\\s*'[^']+'\\s*,\\s*probe:\\s*\\[\\s*${NUM}\\s*,\\s*${NUM}\\s*\\]`, 'g');
    return [...body.matchAll(re)].map((m) => ({
        name: m[1]!, group: m[2]!,
        bbox: [Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])] as Bbox,
        geoidSepM: Number(m[7]),
        probe: [Number(m[8]), Number(m[9])] as [number, number],
    }));
}

/** terrain.mjs NATIONAL_GROUPS literal. */
function nationalGroups(): string[] {
    const src = readFileSync(resolve(HERE, '../terrain.mjs'), 'utf8');
    const m = src.match(/export const NATIONAL_GROUPS = \[([^\]]+)\]/);
    return m ? [...m[1]!.matchAll(/'([a-z]+)'/g)].map((x) => x[1]!) : [];
}

/** bake.mjs REGIONS context rows: name → bbox (its bbox is the string form 'w,s,e,n'). */
function bakeContextRegions(): Map<string, Bbox> {
    const src = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
    const out = new Map<string, Bbox>();
    const re = /\{\s*name:\s*'([a-z0-9-]+)'\s*,\s*pbfUrl:[^}]*?bbox:\s*'(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)'/g;
    for (const m of src.matchAll(re)) out.set(m[1]!, [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])]);
    return out;
}

/** terrainCoverage.ts TERRAIN_REGION_BBOXES: region → bbox. */
function clientRegions(): Map<string, Bbox> {
    const src = readFileSync(resolve(HERE, '../../../apps/editor/src/ui/geospatial/terrainCoverage.ts'), 'utf8');
    const block = src.slice(src.indexOf('export const TERRAIN_REGION_BBOXES'));
    const body = block.slice(0, block.indexOf('];') + 1);
    const out = new Map<string, Bbox>();
    const re = new RegExp(`\\{\\s*region:\\s*'([a-z0-9]+)'\\s*,\\s*bbox:\\s*${BBOX}`, 'g');
    for (const m of body.matchAll(re)) out.set(m[1]!, [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])]);
    return out;
}

const ME_ROWS = ['riyadh', 'jeddah', 'dubai', 'abudhabi', 'doha'] as const;
const inBbox = (p: [number, number], b: Bbox) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];

describe('§ME-TERRAIN-ROWS — Middle-East terrain rows cover their context and reach the client', () => {
    const national = nationalRegions();
    const me = national.filter((r) => r.group === 'middleeast');
    const bake = bakeContextRegions();
    const client = clientRegions();

    it('parses all three tables (guards against a silent regex miss)', () => {
        // A parser that matches NOTHING makes every assertion below vacuously pass — the defect the
        // scorecard's parseBakeRegions shipped. Fail loud instead.
        expect(national.length).toBeGreaterThan(40);
        expect(bake.size).toBeGreaterThan(20);
        expect(client.size).toBeGreaterThan(40);
        expect(bake.get('dubai')).toEqual([54.95, 24.85, 55.45, 25.35]);
    });

    it("'middleeast' is a NATIONAL_GROUP and carries exactly the five metro rows", () => {
        expect(nationalGroups()).toContain('middleeast');
        expect(me.map((r) => r.name).sort()).toEqual([...ME_ROWS].sort());
    });

    it('every ME terrain bbox COVERS its bake.mjs context bbox (no floating-building strip)', () => {
        const holes: string[] = [];
        for (const row of me) {
            const ctx = bake.get(row.name);
            if (!ctx) continue;   // doha: no context row yet (documented above) — nothing to cover.
            const [tw, ts, te, tn] = row.bbox;
            const [cw, cs, ce, cn] = ctx;
            const short: string[] = [];
            if (tw > cw) short.push(`west ${tw} > ${cw}`);
            if (ts > cs) short.push(`south ${ts} > ${cs}`);
            if (te < ce) short.push(`east ${te} < ${ce}`);
            if (tn < cn) short.push(`north ${tn} < ${cn}`);
            if (short.length) holes.push(`${row.name}: ${short.join(', ')}`);
        }
        expect(holes, `terrain bbox smaller than the baked context — buildings there float on flat ground:\n  ${holes.join('\n  ')}`).toEqual([]);
    });

    it('the four context-baked metros have a context row; doha is the documented exception', () => {
        for (const name of ['riyadh', 'jeddah', 'dubai', 'abudhabi']) {
            expect(bake.has(name), `${name} lost its bake.mjs context row`).toBe(true);
        }
        expect(bake.has('doha')).toBe(false);   // flip this assertion when the Doha context clip lands.
    });

    it('the client TERRAIN_REGION_BBOXES mirrors every ME row 1:1 (slug AND bbox)', () => {
        for (const row of me) {
            const c = client.get(row.name);
            expect(c, `client is missing region '${row.name}' → baked but never requested`).toBeDefined();
            expect(c).toEqual(row.bbox);
        }
    });

    it('each ME row has a finite EGM2008 lift and a probe point inside its own bbox', () => {
        for (const row of me) {
            expect(Number.isFinite(row.geoidSepM), `${row.name} geoidSepM`).toBe(true);
            // Gulf N is small-magnitude (−35 … +5 m); a Europe-sized +45 here is a copy-paste.
            expect(Math.abs(row.geoidSepM), `${row.name} geoidSepM magnitude`).toBeLessThan(40);
            expect(inBbox(row.probe, row.bbox), `${row.name} probe ${row.probe} outside ${row.bbox}`).toBe(true);
        }
    });
});
