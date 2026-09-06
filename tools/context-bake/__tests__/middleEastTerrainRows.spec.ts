// §ME-NATIONAL (2026-09-06, lane ME-NATIONAL) — the Middle East is five WHOLE-COUNTRY rows, and the
// five metro rows that used to be here are gone. This spec is the rewrite of §ME-TERRAIN-ROWS
// (2026-09-05, lane ME-TERRAIN-PARCELS), whose subject — `riyadh / jeddah / dubai / abudhabi / doha` —
// no longer exists.
//
// WHY THE METRO ROWS WERE REMOVED RATHER THAN KEPT ALONGSIDE
// ---------------------------------------------------------
// Two independent measurements, both pinned below so neither can quietly stop being true:
//
//   1. THE CLIENT COULD NEVER HAVE PICKED THEM. `terrainCoverage.ts` resolves a region with
//      `mostInterior` (§MOST-INTERIOR-BBOX-WINS, L-12944), which scores a candidate by the ABSOLUTE
//      degrees from the point to the nearest bbox edge. A national box therefore BEATS a metro box at
//      every interior point: at Dubai centre `gccstates` scores 0.95° and `dubai` 0.15°. The metro row
//      would have been unreachable everywhere a user puts a site — a row that exists, costs a bake, and
//      answers nothing. That is the §NL-CITY-BBOX decoy (L-12942) exactly.
//   2. THEY DUPLICATED CONTEXT BUILDINGS. bake.mjs rows that share a Geofabrik extract must have
//      DISJOINT bboxes, because the publish is a tile-join of per-region PMTiles with no dedup: two
//      overlapping rectangles over the SAME extract publish every building inside the overlap twice.
//      riyadh/jeddah/dubai/abudhabi and `gccstates` all clip `asia/gcc-states-latest.osm.pbf`, and the
//      national rectangle contains all four metro ones.
//
// NOTHING WAS LOST IN RESOLUTION: the metro rows were baked by the SAME national pipeline at
// NATIONAL_BAKE_DEFAULTS (Mapterhorn, maxZoom 10, 257-grid). They were never finer, only smaller. The
// one thing they anchored that IS real — the Abu Dhabi measured-height stamp — moved with its working
// set intact, and arm §AD-STAMP-SURVIVES-THE-MOVE below is what stops that being a claim.
//
// ⚠ ALL FOUR TABLES ARE READ AS TEXT, exactly as the spec this replaces did and for the same reason:
// terrain.mjs and bake.mjs both run a top-level `main()` under their CLI guard, and terrainCoverage.ts
// pulls in the client tile stack. Reading the source keeps this a total function of the CURRENT rows
// rather than a second, drifting copy of them. The ONE piece of client LOGIC this spec re-implements —
// `interiorMarginDeg` — is pinned against the client's own source text (§RESOLVER-MIRROR), so the
// mirror cannot drift away from the thing it stands in for.
//
// LAYERING: a build/inspection tool test, like its siblings — no OTel span (P8 applies to exported
// package functions, not bake tooling).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AD_CITY_BBOXES } from '../heights/abudhabiNdsm.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

type Bbox = [number, number, number, number];
interface NationalRow { name: string; group: string; bbox: Bbox; geoidSepM: number; probe: [number, number] }
interface BakeRow { name: string; pbfUrl: string; bbox: Bbox; row: string }

const NUM = '(-?[\\d.]+)';
const BBOX = `\\[\\s*${NUM}\\s*,\\s*${NUM}\\s*,\\s*${NUM}\\s*,\\s*${NUM}\\s*\\]`;

const terrainSrc = () => readFileSync(resolve(HERE, '../terrain.mjs'), 'utf8');
const bakeSrc = () => readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
const clientSrc = () => readFileSync(resolve(HERE, '../../../apps/editor/src/ui/geospatial/terrainCoverage.ts'), 'utf8');

/** terrain.mjs NATIONAL_REGIONS rows (name, group, bbox, geoidSepM, probe). */
function nationalRegions(): NationalRow[] {
    const src = terrainSrc();
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
    const m = terrainSrc().match(/export const NATIONAL_GROUPS = \[([^\]]+)\]/);
    return m ? [...m[1]!.matchAll(/'([a-z]+)'/g)].map((x) => x[1]!) : [];
}

/** bake.mjs REGIONS context rows: name → bbox. ⚠ SIGNATURE HELD DELIBERATELY at Map<string, Bbox> —
 *  sibling lanes append describe blocks to this file and consume it (§EU-EVERY-COUNTRY does); the richer
 *  per-row view lives in bakeContextRows() below rather than changing what this one returns. */
function bakeContextRegions(): Map<string, Bbox> {
    return new Map([...bakeContextRows()].map(([n, r]) => [n, r.bbox] as const));
}

/** bake.mjs REGIONS context rows: name → { pbfUrl, bbox, the whole row text }. */
function bakeContextRows(): Map<string, BakeRow> {
    const src = bakeSrc();
    const out = new Map<string, BakeRow>();
    const re = /\{\s*name:\s*'([a-z0-9-]+)'\s*,\s*pbfUrl:\s*'([^']+)'[^}\n]*?bbox:\s*'(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)'[^}\n]*\}/g;
    for (const m of src.matchAll(re)) {
        out.set(m[1]!, {
            name: m[1]!, pbfUrl: m[2]!,
            bbox: [Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])] as Bbox,
            row: m[0]!,
        });
    }
    return out;
}

/** terrainCoverage.ts TERRAIN_REGION_BBOXES: region → bbox. */
function clientRegions(): Map<string, Bbox> {
    const src = clientSrc();
    const block = src.slice(src.indexOf('export const TERRAIN_REGION_BBOXES'));
    const body = block.slice(0, block.indexOf('];') + 1);
    const out = new Map<string, Bbox>();
    const re = new RegExp(`\\{\\s*region:\\s*'([a-z0-9]+)'\\s*,\\s*bbox:\\s*${BBOX}`, 'g');
    for (const m of body.matchAll(re)) out.set(m[1]!, [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])]);
    return out;
}

const ME_ROWS = ['gccstates', 'turkey', 'israel', 'jordan', 'lebanon'] as const;
/** The five rows this lane RETIRED. They must not come back in any of the three tables. */
const RETIRED = ['riyadh', 'jeddah', 'dubai', 'abudhabi', 'doha'] as const;

const inBbox = (p: [number, number], b: Bbox) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
const contains = (outer: Bbox, inner: Bbox) =>
    outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];
const overlaps = (a: Bbox, b: Bbox) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/** §RESOLVER-MIRROR — terrainCoverage.ts `interiorMarginDeg`, VERBATIM. Pinned against the client's own
 *  source below so this mirror can never quietly stop being the thing it stands in for. */
function interiorMarginDeg(lon: number, lat: number, bbox: Bbox): number {
    const [w, s, e, n] = bbox;
    const cosLat = Math.cos((lat * Math.PI) / 180) || 1e-6;
    return Math.min((lon - w) * cosLat, (e - lon) * cosLat, lat - s, n - lat);
}
function regionFor(lon: number, lat: number, rows: Map<string, Bbox>): string | null {
    let best: string | null = null; let bestMargin = -Infinity;
    for (const [region, bbox] of rows) {
        if (!inBbox([lon, lat], bbox)) continue;
        const m = interiorMarginDeg(lon, lat, bbox);
        if (m > bestMargin) { bestMargin = m; best = region; }
    }
    return best;
}

describe('§ME-NATIONAL — the Middle East is whole countries, and the metro decoys are gone', () => {
    const national = nationalRegions();
    const me = national.filter((r) => r.group === 'middleeast');
    const bake = bakeContextRows();
    const client = clientRegions();

    it('parses all three tables (guards against a silent regex miss)', () => {
        // A parser that matches NOTHING makes every assertion below vacuously pass — the defect the
        // scorecard's parseBakeRegions shipped. Fail loud instead.
        expect(national.length).toBeGreaterThan(40);
        expect(bake.size).toBeGreaterThan(20);
        expect(client.size).toBeGreaterThan(40);
        expect(bake.get('gccstates')?.bbox).toEqual([34.43, 15.24, 60.95, 32.20]);
    });

    it("'middleeast' is a NATIONAL_GROUP and carries exactly the five whole-country rows", () => {
        expect(nationalGroups()).toContain('middleeast');
        expect(me.map((r) => r.name).sort()).toEqual([...ME_ROWS].sort());
    });

    it('every ME terrain row has a context row and the two bboxes are IDENTICAL (1:1, not merely covering)', () => {
        const drift: string[] = [];
        for (const row of me) {
            const ctx = bake.get(row.name);
            if (!ctx) { drift.push(`${row.name}: NO bake.mjs context row`); continue; }
            if (JSON.stringify(ctx.bbox) !== JSON.stringify(row.bbox)) {
                drift.push(`${row.name}: terrain ${JSON.stringify(row.bbox)} !== context ${JSON.stringify(ctx.bbox)}`);
            }
        }
        expect(drift, `a terrain bbox smaller than the baked context is a strip where buildings float on flat ground:\n  ${drift.join('\n  ')}`).toEqual([]);
    });

    it('the client TERRAIN_REGION_BBOXES mirrors every ME row 1:1 (slug AND bbox)', () => {
        for (const row of me) {
            const c = client.get(row.name);
            expect(c, `client is missing region '${row.name}' → baked but never requested`).toBeDefined();
            expect(c).toEqual(row.bbox);
        }
    });

    it('NO retired metro row survives in any of the three tables (the decoy guard)', () => {
        for (const dead of RETIRED) {
            expect(national.some((r) => r.name === dead), `terrain.mjs NATIONAL_REGIONS still has '${dead}'`).toBe(false);
            expect(bake.has(dead), `bake.mjs still has a '${dead}' context row`).toBe(false);
            expect(client.has(dead), `terrainCoverage.ts still requests '${dead}'`).toBe(false);
        }
    });

    it('each ME row has a finite EGM2008 lift and a probe point inside its own bbox', () => {
        for (const row of me) {
            expect(Number.isFinite(row.geoidSepM), `${row.name} geoidSepM`).toBe(true);
            // Probed 2026-09-06: Riyadh −7.62 · Ankara 37.20 · Tel Aviv 18.80 · Amman 20.85 · Beirut 22.75.
            // A Europe-sized +45 here would be a copy-paste.
            expect(Math.abs(row.geoidSepM), `${row.name} geoidSepM magnitude`).toBeLessThan(40);
            expect(inBbox(row.probe, row.bbox), `${row.name} probe ${row.probe} outside ${row.bbox}`).toBe(true);
        }
    });

    it('all five carry `pending: true` (§PENDING-REGION — an unstaged new row must never refuse a publish)', () => {
        for (const name of ME_ROWS) {
            expect(bake.get(name)!.row, `${name} must be pending until its first publish`).toMatch(/pending:\s*true/);
        }
    });
});

describe('§AD-STAMP-SURVIVES-THE-MOVE — the one measured Gulf height channel moved with the row', () => {
    const bake = bakeContextRows();

    it("`gccstates` inherits heightJoin:'ad_ndsm' AND buildingsSource:'overture' from the retired abudhabi row", () => {
        const row = bake.get('gccstates');
        expect(row, 'gccstates context row').toBeDefined();
        expect(row!.row).toMatch(/heightJoin:\s*'ad_ndsm'/);
        // The Gulf is an OSM building desert (riyadh 5.3× / jeddah 7.2× Overture-vs-OSM, VERIFIED
        // 2026-07-24) — losing this flag would silently thin the whole peninsula.
        expect(row!.row).toMatch(/buildingsSource:\s*'overture'/);
    });

    it('every AD_CITY_BBOXES working-set cell is inside the gccstates row (the stamp still has a region to run in)', () => {
        const region = bake.get('gccstates')!.bbox;
        for (const { city, bbox } of AD_CITY_BBOXES) {
            expect(contains(region, bbox as Bbox), `${city} ${JSON.stringify(bbox)} outside gccstates ${JSON.stringify(region)}`).toBe(true);
        }
    });
});

describe('§SHARED-EXTRACT-DISJOINT — rows cut from ONE Geofabrik extract may not overlap', () => {
    // The publish is a tile-join of per-region PMTiles with NO dedup. Two rows whose rectangles overlap
    // over the SAME extract therefore publish every building in the overlap TWICE — coincident geometry
    // at two different heights where a stamped row meets an unstamped one. This is the invariant that
    // forced the six GCC countries into ONE `gccstates` row: Geofabrik serves no per-country Gulf file,
    // and six country rectangles cut from `asia/gcc-states` cannot be disjoint (Saudi's contains Qatar,
    // Bahrain, Kuwait and half the UAE — a rectangle cannot exclude a peninsula).
    it('no two bake.mjs rows sharing a pbfUrl have overlapping bboxes', () => {
        const byPbf = new Map<string, BakeRow[]>();
        for (const row of bakeContextRows().values()) {
            const list = byPbf.get(row.pbfUrl) ?? [];
            list.push(row);
            byPbf.set(row.pbfUrl, list);
        }
        const clashes: string[] = [];
        for (const [pbf, rows] of byPbf) {
            for (let i = 0; i < rows.length; i++) {
                for (let j = i + 1; j < rows.length; j++) {
                    if (overlaps(rows[i]!.bbox, rows[j]!.bbox)) {
                        clashes.push(`${rows[i]!.name} × ${rows[j]!.name} (both clip ${pbf.split('/').pop()})`);
                    }
                }
            }
        }
        expect(clashes, `duplicate buildings in the merged tileset:\n  ${clashes.join('\n  ')}`).toEqual([]);
    });
});

describe('§RESOLVER-MIRROR — the region a real site actually resolves to', () => {
    // The mirror is only worth anything while it IS the client's rule; this pins it on the source text.
    it("terrainCoverage.ts's interiorMarginDeg is still the absolute-edge-distance rule mirrored here", () => {
        const src = clientSrc();
        expect(src).toContain('const cosLat = Math.cos((lat * Math.PI) / 180) || 1e-6;');
        expect(src).toContain('return Math.min((lon - w) * cosLat, (e - lon) * cosLat, lat - s, n - lat);');
    });

    // Real places, spread to the corners — not just the capitals. Each is a site a user could drop today.
    const WITNESSES: ReadonlyArray<readonly [string, number, number, string]> = [
        ['Dubai Marina', 55.14, 25.08, 'gccstates'],
        ['Al Ain', 55.76, 24.21, 'gccstates'],
        ['Riyadh', 46.72, 24.69, 'gccstates'],
        ['Jeddah', 39.19, 21.54, 'gccstates'],
        ['Doha', 51.53, 25.29, 'gccstates'],
        ['Muscat', 58.41, 23.59, 'gccstates'],
        ['Salalah', 54.09, 17.02, 'gccstates'],
        ['Kuwait City', 47.98, 29.38, 'gccstates'],
        ['Manama', 50.59, 26.23, 'gccstates'],
        ['Tabuk', 36.56, 28.38, 'gccstates'],
        ['Ankara', 32.86, 39.90, 'turkey'],
        ['Istanbul', 28.98, 41.01, 'turkey'],
        ['Diyarbakir', 40.23, 37.91, 'turkey'],
        ['Tel Aviv', 34.78, 32.09, 'israel'],
        ['Jerusalem', 35.21, 31.78, 'israel'],
        ['Ramallah', 35.21, 31.90, 'israel'],
        ['Gaza City', 34.47, 31.50, 'israel'],
        ['Amman', 35.91, 31.95, 'jordan'],
        ['Irbid', 35.85, 32.56, 'jordan'],
        ['Beirut', 35.50, 33.89, 'lebanon'],
    ];

    it('every witness resolves to the region whose extract actually holds its buildings', () => {
        const rows = new Map([...clientRegions()].map(([r, b]) => [r, b] as const));
        const wrong: string[] = [];
        for (const [name, lon, lat, want] of WITNESSES) {
            const got = regionFor(lon, lat, rows);
            if (got !== want) wrong.push(`${name} (${lon},${lat}) → ${got ?? 'null'}, want ${want}`);
        }
        expect(wrong, `the client would request the wrong tileset:\n  ${wrong.join('\n  ')}`).toEqual([]);
    });

    // ⚠ NAMED RESIDUAL, not a hidden one. `gccstates`'s west edge (34.43, Saudi's Red-Sea coast at the
    // Gulf of Aqaba) sits further west than `jordan`'s (34.86), so at Aqaba itself the absolute-margin
    // rule prefers gccstates. TERRAIN is unaffected — both rows are Mapterhorn at the same zoom over the
    // same ground — and CONTEXT is unaffected too, because the client reads ONE merged buildings.pmtiles
    // and does not resolve context per region. It is recorded here so it is a known fact rather than a
    // surprise, and so that a future nested-bbox preference rule has a test to flip.
    it('records the Aqaba edge case as a KNOWN gccstates win (terrain-identical, context-unaffected)', () => {
        expect(regionFor(35.00, 29.53, clientRegions())).toBe('gccstates');
    });
});
