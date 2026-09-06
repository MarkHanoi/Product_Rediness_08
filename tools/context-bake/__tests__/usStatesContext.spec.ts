// §BAKE-US-STATES (2026-09-06, lane USA-ALL-STATES) — the whole United States, pinned end to end:
// the 54 bake rows, the 54 terrain rows that must COVER them, the client mirror, the antimeridian
// split, the named territory refusal, and the `pending` flags that keep 53 brand-new rows out of the
// next `expect=all` publish.
//
// WHY THIS SPEC EXISTS
// --------------------
// The US was SIX METRO CLIPS (newyork = Manhattan, sanfrancisco, chicago, austin, houston, boston),
// each downloading a whole state extract and then throwing all but a city out of it. The founder's
// instruction was "Also all EEUU — I want complete country coverage." Turning six clips into 54 whole
// states touches three tables that are three hand-copied views of one fact (bake.mjs REGIONS,
// terrain.mjs NATIONAL_REGIONS, terrainCoverage.ts TERRAIN_REGION_BBOXES), and the failure mode when
// they drift is silent: a terrain bbox SMALLER than the context bbox is a strip where buildings float
// over flat ground (L-422 / L-457 / §MDS-BBOX-MUST-COVER-THE-REGION), and a client row that does not
// match the bake row is a tileset that is baked but never requested. `middleEastTerrainRows.spec.ts`
// pins exactly this for the five Gulf rows and is the pattern followed here, US-scoped — a sibling,
// not a rival: it reads the same three tables the same way and asserts different rows.
// `terrain.mjs --check-client-coverage` remains the CLI half of the client parity check and is quoted
// in the lane report; this spec is the CI half, and it also covers the two things that check cannot
// see (bake↔terrain coverage, and the antimeridian).
//
// ⚠ ALL THREE TABLES ARE READ AS TEXT, exactly as middleEastTerrainRows.spec.ts and
// newzealandContext.spec.ts do: terrain.mjs and bake.mjs run a top-level `main()` under their CLI
// guard and cannot be imported by vitest. Reading the source keeps this a total function of the
// CURRENT rows rather than a second, drifting copy of them. The `pending` semantics are asserted on
// the REAL CLI (`bake.mjs --regions-json`, a child process), the newzealandContext.spec.ts precedent.
//
// LAYERING: a build/inspection tool test, like its siblings — no OTel span (P8 applies to exported
// package functions, not bake tooling).
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BAKE = resolve(HERE, '../bake.mjs');
const bakeSrc = readFileSync(BAKE, 'utf8');
const terrainSrc = readFileSync(resolve(HERE, '../terrain.mjs'), 'utf8');
const clientSrc = readFileSync(resolve(HERE, '../../../apps/editor/src/ui/geospatial/terrainCoverage.ts'), 'utf8');
const heightSrc = readFileSync(resolve(HERE, '../heightSources.mjs'), 'utf8');
/** heights/usOpenHeights.mjs — the US channel's own tables (US_NATIONAL_NO_HEIGHT_ROWS lives HERE,
 *  not in heightSources.mjs; asserting the wrong file is how a probed refusal becomes unpinned). */
const usHeightSrc = readFileSync(resolve(HERE, '../heights/usOpenHeights.mjs'), 'utf8');

type Bbox = [number, number, number, number];
const NUM = '(-?[\\d.]+)';
const BBOX = `\\[\\s*${NUM}\\s*,\\s*${NUM}\\s*,\\s*${NUM}\\s*,\\s*${NUM}\\s*\\]`;

/** bake.mjs REGIONS: name → bbox (its bbox is the string form 'w,s,e,n'). */
function bakeRegions(): Map<string, Bbox> {
    const out = new Map<string, Bbox>();
    const re = /\{\s*name:\s*'([a-z0-9-]+)'\s*,\s*pbfUrl:[^}]*?bbox:\s*'(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)'/g;
    for (const m of bakeSrc.matchAll(re)) out.set(m[1]!, [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])]);
    return out;
}
/** terrain.mjs NATIONAL_REGIONS rows of one group. */
function nationalRegions(): Array<{ name: string; group: string; bbox: Bbox; geoidSepM: number; probe: [number, number] }> {
    const block = terrainSrc.slice(terrainSrc.indexOf('export const NATIONAL_REGIONS'));
    const body = block.slice(0, block.indexOf('];') + 1);
    const re = new RegExp(
        `\\{\\s*name:\\s*'([a-z0-9]+)'\\s*,\\s*group:\\s*'([a-z]+)'\\s*,\\s*bbox:\\s*${BBOX}\\s*,\\s*geoidSepM:\\s*${NUM}\\s*,`
        + `\\s*probeCity:\\s*'[^']+'\\s*,\\s*probe:\\s*\\[\\s*${NUM}\\s*,\\s*${NUM}\\s*\\]`, 'g');
    return [...body.matchAll(re)].map((m) => ({
        name: m[1]!, group: m[2]!,
        bbox: [Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])] as Bbox,
        geoidSepM: Number(m[7]),
        probe: [Number(m[8]), Number(m[9])] as [number, number],
    }));
}
/** terrainCoverage.ts TERRAIN_REGION_BBOXES: region → bbox. */
function clientRegions(): Map<string, Bbox> {
    const block = clientSrc.slice(clientSrc.indexOf('export const TERRAIN_REGION_BBOXES'));
    const body = block.slice(0, block.indexOf('];') + 1);
    const out = new Map<string, Bbox>();
    const re = new RegExp(`\\{\\s*region:\\s*'([a-z0-9]+)'\\s*,\\s*bbox:\\s*${BBOX}`, 'g');
    for (const m of body.matchAll(re)) out.set(m[1]!, [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])]);
    return out;
}

/** The 50 states + DC + PR + USVI + the Aleutian antimeridian row. `puertoricousa`, NOT `puertorico`:
 *  that slug is a LIVE §1b terrain city (Puerto Rico de Gran Canaria, source 'es'). */
const US_ROWS = [
    'alabama', 'alaska', 'alaskaaleutians', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut',
    'delaware', 'districtofcolumbia', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa',
    'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota',
    'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'newhampshire', 'newjersey', 'newmexico',
    'newyork', 'northcarolina', 'northdakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'puertoricousa',
    'rhodeisland', 'southcarolina', 'southdakota', 'tennessee', 'texas', 'usvirginislands', 'utah', 'vermont',
    'virginia', 'washington', 'westvirginia', 'wisconsin', 'wyoming',
] as const;

/** The six metro rows this lane retired. `newyork` is NOT here — it kept its slug and widened. */
const RETIRED_METROS = ['sanfrancisco', 'chicago', 'austin', 'houston', 'boston'] as const;

const inBbox = (p: readonly [number, number], b: Bbox) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];

/** The single source line of one bake row, by slug. Shared by every block below — three separate
 *  copies of this regex drifted apart once already and two of them silently matched nothing. */
const usRowText = (name: string): string => {
    const m = bakeSrc.match(new RegExp(`\\{\\s*name:\\s*'${name}'\\s*,[^\\n]*\\}`));
    if (!m) throw new Error(`bake.mjs has no row named '${name}'`);
    return m[0];
};

describe('§BAKE-US-STATES — the bake table is the whole country, and the metro clips are gone', () => {
    const bake = bakeRegions();

    it('parses the tables (a regex that matches nothing makes every assertion below vacuously pass)', () => {
        expect(bake.size).toBeGreaterThan(100);
        expect(nationalRegions().length).toBeGreaterThan(100);
        expect(clientRegions().size).toBeGreaterThan(100);
    });

    it('declares all 54 US rows — 50 states + District of Columbia + Puerto Rico + US Virgin Islands + the Aleutian antimeridian row', () => {
        const missing = US_ROWS.filter((r) => !bake.has(r));
        expect(missing, `bake.mjs is missing US rows: ${missing.join(', ')}`).toEqual([]);
        expect(US_ROWS.length).toBe(54);
    });

    it('every US row takes a WHOLE Geofabrik north-america/us extract — no metro clip survives', () => {
        for (const name of US_ROWS) {
            const row = bakeSrc.match(new RegExp(`\\{\\s*name:\\s*'${name}'\\s*,[^\\n]*\\}`));
            expect(row, `${name} row`).not.toBeNull();
            expect(row![0], name).toMatch(/pbfUrl: 'https:\/\/download\.geofabrik\.de\/north-america\/us\/[a-z-]+-latest\.osm\.pbf'/);
        }
    });

    it('the five retired metro slugs are GONE from every table (keeping one would double-bake its state)', () => {
        const client = clientRegions();
        const terrain = new Set(nationalRegions().map((r) => r.name));
        for (const m of RETIRED_METROS) {
            expect(bake.has(m), `bake.mjs still has the ${m} metro row`).toBe(false);
            expect(terrain.has(m), `terrain.mjs still has the ${m} metro row`).toBe(false);
            expect(client.has(m), `terrainCoverage.ts still has the ${m} metro row`).toBe(false);
        }
    });

    it('`newyork` KEPT its slug and widened Manhattan → the whole state, so the live R2 prefix is replaced, not lost', () => {
        const ny = bake.get('newyork')!;
        expect(ny).toEqual([-79.77, 40.43, -71.66, 45.02]);
        // The Manhattan box it replaces, and three New York State cities the metro clip never reached.
        expect(inBbox([-73.9855, 40.758], ny)).toBe(true);   // Midtown, the old clip
        for (const p of [[-78.8784, 42.8864], [-73.7562, 42.6526], [-76.1474, 43.0481]] as const) {
            expect(inBbox(p, ny), `${p} (Buffalo / Albany / Syracuse) must be inside the state row`).toBe(true);
        }
    });

    it('`puertoricousa`, never `puertorico` — that slug is a LIVE terrain CITY in the Canary Islands', () => {
        expect(bake.has('puertorico'), 'the US Commonwealth must not take the Canarian city slug').toBe(false);
        // The city row that owns it, still where it was.
        expect(terrainSrc).toMatch(/\{\s*name:\s*'puertorico',\s*source:\s*'es',\s*bbox:\s*\[-15\.7804, 27\.7294, -15\.6404, 27\.8494\]\s*\}/);
        expect(bake.get('puertoricousa')).toEqual([-68.32, 17.51, -65.09, 18.82]);
    });
});

describe('§BAKE-US-STATES — the antimeridian is handled explicitly, never wrapped', () => {
    const bake = bakeRegions();

    it('alaska is TWO rows off ONE extract: the mainland west of 180, the Near Islands east of it', () => {
        const main = bake.get('alaska')!;
        const near = bake.get('alaskaaleutians')!;
        expect(main).toEqual([-180.0, 49.8, -129.79, 72.99]);
        expect(near).toEqual([171.76, 51.11, 180.0, 54.2]);
        // Both are ordinary w < e boxes — nothing wraps, so nothing swallows the Pacific.
        for (const b of [main, near]) {
            expect(b[0]).toBeLessThan(b[2]);
            expect(b[1]).toBeLessThan(b[3]);
            expect(Math.abs(b[0])).toBeLessThanOrEqual(180);
            expect(Math.abs(b[2])).toBeLessThanOrEqual(180);
        }
        // ONE download for the two rows (the austin/houston-share-texas rule), so the split is free.
        const rowOf = (n: string) => bakeSrc.match(new RegExp(`\\{\\s*name:\\s*'${n}'\\s*,[^\\n]*\\}`))![0];
        expect(rowOf('alaska')).toContain("pbf: resolve(OUT, 'us-alaska-latest.osm.pbf')");
        expect(rowOf('alaskaaleutians')).toContain("pbf: resolve(OUT, 'us-alaska-latest.osm.pbf')");
        expect(rowOf('alaskaaleutians')).toContain("clipped: resolve(OUT, 'clip-alaskaaleutians.osm.pbf')");
    });

    it('real Alaskan places land in the right half — Anchorage/Barrow/Ketchikan/Adak west, Attu/Shemya east', () => {
        const main = bake.get('alaska')!;
        const near = bake.get('alaskaaleutians')!;
        for (const p of [[-149.9003, 61.2181], [-156.7886, 71.2906], [-131.6461, 55.3422], [-176.6360, 51.8800]] as const) {
            expect(inBbox(p, main), `${p} must be in the mainland row`).toBe(true);
            expect(inBbox(p, near), `${p} must NOT be in the Near Islands row`).toBe(false);
        }
        for (const p of [[173.1806, 52.8306], [174.1136, 52.7228]] as const) {   // Attu Station, Shemya
            expect(inBbox(p, near), `${p} must be in the Near Islands row`).toBe(true);
            expect(inBbox(p, main), `${p} must NOT be in the mainland row`).toBe(false);
        }
    });

    it('HAWAII needs no split: its extent stops short of 180 and one bbox holds the whole chain', () => {
        const hi = bake.get('hawaii')!;
        expect(hi).toEqual([-179.6, 15.92, -142.65, 29.03]);
        expect(hi[0]).toBeGreaterThan(-180);           // never touches the seam
        for (const p of [[-157.8583, 21.3069], [-155.5828, 19.6390], [-159.5261, 21.9788], [-177.3761, 28.2072]] as const) {
            expect(inBbox(p, hi), `${p} (Honolulu / Kona / Lihue / Midway) must be inside`).toBe(true);
        }
    });
});

describe('§BAKE-US-STATES — bboxes are the extract\'s own extent, and terrain COVERS context 1:1', () => {
    const bake = bakeRegions();
    const usa = nationalRegions().filter((r) => r.group === 'usa');
    const client = clientRegions();

    it("the 'usa' group is exactly the 54 rows — nothing extra, nothing missing", () => {
        expect([...usa.map((r) => r.name)].sort()).toEqual([...US_ROWS].sort());
    });

    it('every terrain bbox EQUALS its bake context bbox (equal is the strongest form of "covers")', () => {
        const drift: string[] = [];
        for (const row of usa) {
            const ctx = bake.get(row.name);
            if (!ctx) { drift.push(`${row.name}: no bake row`); continue; }
            if (JSON.stringify(ctx) !== JSON.stringify(row.bbox)) drift.push(`${row.name}: bake ${ctx} vs terrain ${row.bbox}`);
        }
        expect(drift, `terrain/bake bbox drift — a terrain bbox smaller than the baked context is a strip of floating buildings:\n  ${drift.join('\n  ')}`).toEqual([]);
    });

    it('the client mirrors every US row 1:1 (slug AND bbox) — baked but never requested is the other failure', () => {
        for (const row of usa) {
            const c = client.get(row.name);
            expect(c, `client is missing region '${row.name}'`).toBeDefined();
            expect(c, row.name).toEqual(row.bbox);
        }
    });

    it('each row carries a finite EGM2008 lift and a probe point INSIDE its own bbox', () => {
        for (const row of usa) {
            expect(Number.isFinite(row.geoidSepM), `${row.name} geoidSepM`).toBe(true);
            expect(Math.abs(row.geoidSepM), `${row.name} geoidSepM magnitude`).toBeLessThan(60);
            expect(inBbox(row.probe, row.bbox), `${row.name} probe ${row.probe} outside ${row.bbox}`).toBe(true);
        }
    });

    it('N is NOT uniformly negative in the US — Alaska and Hawaii are POSITIVE, and the table says so', () => {
        const by = new Map(usa.map((r) => [r.name, r.geoidSepM]));
        expect(by.get('alaska')).toBeGreaterThan(0);            // +8.04 Anchorage (GeoidEval, probed 2026-09-06)
        expect(by.get('alaskaaleutians')).toBeGreaterThan(0);   // +9.70 Attu
        expect(by.get('hawaii')).toBeGreaterThan(0);            // +15.81 Honolulu
        expect(by.get('newyork')).toBeLessThan(0);              // -32.72 NYC — CONUS stays negative
        expect(by.get('puertoricousa')).toBeLessThan(-40);      // -45.34 San Juan
    });

    it('every US bbox contains its own state capital — the cheapest proof a box is not a typo', () => {
        const CAPITALS: ReadonlyArray<readonly [string, number, number]> = [
            ['alabama', -86.3000, 32.3770], ['alaska', -134.4197, 58.3019], ['arizona', -112.0740, 33.4484],
            ['arkansas', -92.2896, 34.7465], ['california', -121.4944, 38.5816], ['colorado', -104.9903, 39.7392],
            ['connecticut', -72.6851, 41.7658], ['delaware', -75.5244, 39.1582], ['districtofcolumbia', -77.0369, 38.9072],
            ['florida', -84.2807, 30.4383], ['georgia', -84.3880, 33.7490], ['hawaii', -157.8583, 21.3069],
            ['idaho', -116.2023, 43.6150], ['illinois', -89.6501, 39.7817], ['indiana', -86.1581, 39.7684],
            ['iowa', -93.6091, 41.5912], ['kansas', -95.6890, 39.0473], ['kentucky', -84.8733, 38.2009],
            ['louisiana', -91.1871, 30.4515], ['maine', -69.7795, 44.3106], ['maryland', -76.4922, 38.9784],
            ['massachusetts', -71.0589, 42.3601], ['michigan', -84.5555, 42.7325], ['minnesota', -93.0900, 44.9537],
            ['mississippi', -90.1848, 32.2988], ['missouri', -92.1735, 38.5767], ['montana', -112.0361, 46.5891],
            ['nebraska', -96.6852, 40.8136], ['nevada', -119.7674, 39.1638], ['newhampshire', -71.5376, 43.2081],
            ['newjersey', -74.7699, 40.2206], ['newmexico', -105.9378, 35.6870], ['newyork', -73.7562, 42.6526],
            ['northcarolina', -78.6382, 35.7796], ['northdakota', -100.7837, 46.8083], ['ohio', -82.9988, 39.9612],
            ['oklahoma', -97.5164, 35.4676], ['oregon', -123.0351, 44.9429], ['pennsylvania', -76.8867, 40.2732],
            ['puertoricousa', -66.1057, 18.4655], ['rhodeisland', -71.4128, 41.8240], ['southcarolina', -81.0348, 34.0007],
            ['southdakota', -100.3364, 44.3683], ['tennessee', -86.7816, 36.1627], ['texas', -97.7431, 30.2672],
            ['usvirginislands', -64.9307, 18.3419], ['utah', -111.8910, 40.7608], ['vermont', -72.5754, 44.2601],
            ['virginia', -77.4360, 37.5407], ['washington', -122.9007, 47.0379], ['westvirginia', -81.6326, 38.3498],
            ['wisconsin', -89.3838, 43.0731], ['wyoming', -104.8202, 41.1400],
        ];
        expect(CAPITALS.length).toBe(53);   // every US row but alaskaaleutians, which has no settlement of its own
        const outside = CAPITALS.filter(([slug, lon, lat]) => !inBbox([lon, lat], bake.get(slug)!))
            .map(([slug, lon, lat]) => `${slug} (${lon}, ${lat})`);
        expect(outside, `capital outside its own state bbox: ${outside.join(', ')}`).toEqual([]);
    });
});

describe('§BAKE-US-STATES — every row has a SERVABLE height join (which join is the sibling lane call)', () => {
    // ⚠ REWRITTEN TWICE ON 2026-09-06, THE DAY IT WAS WRITTEN, AND THE TWO REWRITES ARE THE POINT.
    //
    // DRAFT 1 asserted: "newyork / california / massachusetts declare heightJoin:'us_open'; NO OTHER
    // US ROW DECLARES ANY JOIN", under a heading that called the other 51 rows "honestly unstamped".
    // A sibling lane (USA-HEIGHTS-NATIONAL) then landed §USAS-NATIONAL-HEIGHTS and wired
    // `heightJoin:'usas'` — FEMA/ORNL "USA Structures", one keyless CC-BY-4.0 federal FeatureServer —
    // onto 49 of those 51. The assertion did not catch a defect; it caught A NEIGHBOUR DOING ITS JOB.
    //
    // DRAFT 2 then pinned the leftover as OWED: "the three `us_open` rows still reach only their CITY
    // bbox". Within the hour that was false too — the same sibling moved all three to 'usas' and
    // DELETED the `us_open` key from NATIONAL_STAMP_TABLE. Draft 2 was red for the best possible
    // reason: the thing it recorded as owed had been paid.
    //
    // THE LESSON, and why this comment is longer than the tests. Both drafts failed the same way: they
    // asserted a NEIGHBOUR'S table rather than this lane's own. northAmericaContext.spec.ts already
    // wrote the rule down — "a lane-local test must not go red because another lane added a row it has
    // no opinion about" — and this file broke it twice in one day. What survives below is only what
    // THIS lane owns: that every US row's declared join is SERVABLE, that the two measured-zero rows
    // declare nothing, and that no row is left silently unstamped. WHICH join is the sibling's call.
    //
    // MEASURED ON THIS TREE, 2026-09-06, after the sibling's second edit:
    //   52 of 54 rows declare 'usas' · 0 rows declare 'us_open' (the key is gone) · 2 rows declare none.
    // Those two are alaskaaleutians and usvirginislands, and that is a MEASUREMENT, not an oversight:
    // US_NATIONAL_NO_HEIGHT_ROWS in heights/usOpenHeights.mjs records groupBy-SOURCE probes over each
    // row's exact bbox — 87 structures ALL 'ORNL' with 0 heights, and 40,726 ALL 'ORNL' with 0 heights.
    // A row that declares a join and stamps zero exits 4 on §MEASURED-HEIGHT-GATE.
    const NO_JOIN_ROWS = new Set(['alaskaaleutians', 'usvirginislands']);
    const joinOf = (name: string) => usRowText(name).match(/heightJoin:\s*'([a-z_0-9]+)'/)?.[1] ?? null;

    it('EXACTLY the two MEASURED-ZERO rows declare no join, and every other US row declares one', () => {
        // Both directions. A missing join on a state with data is a silent 9 m carpet; a declared join
        // on a source-empty row exits 4. Nothing here says WHICH join — that is the sibling's table.
        const unjoined = US_ROWS.filter((n) => joinOf(n) === null);
        expect([...unjoined].sort(), 'the set of US rows with no height join has moved').toEqual([...NO_JOIN_ROWS].sort());
        expect(usHeightSrc).toMatch(/US_NATIONAL_NO_HEIGHT_ROWS\s*=\s*\['alaskaaleutians',\s*'usvirginislands'\]/);
        // …and the refusal must still carry the probed evidence, not just the two names.
        expect(usHeightSrc, 'the Near Islands groupBy-SOURCE count').toContain('87 structures');
        expect(usHeightSrc, 'the USVI groupBy-SOURCE count').toContain('40,726 structures');
    });

    it('every join any US row declares is a key NATIONAL_STAMP_TABLE actually serves (a mistyped key stamps nothing, silently)', () => {
        // THIS is the assertion that should have been written first: it survives any sibling retable,
        // and it is the one that would actually have caught a defect. When `us_open` was deleted from
        // the stamp table, a row still declaring it would have been caught HERE, by name.
        const table = bakeSrc.slice(bakeSrc.indexOf('NATIONAL_STAMP_TABLE'));
        const body = table.slice(0, table.indexOf('\n};'));
        const served = new Set([...body.matchAll(/^\s{2}([a-z_0-9]+):\s*\{\s*stamp:/gm)].map((m) => m[1]!));
        expect(served.size, 'NATIONAL_STAMP_TABLE parsed to nothing — every assertion here would pass vacuously').toBeGreaterThan(5);
        const unserved = US_ROWS.map((n) => [n, joinOf(n)] as const)
            .filter(([, j]) => j !== null && !served.has(j))
            .map(([n, j]) => `${n} -> '${j}'`);
        expect(unserved, `US rows declaring a join no stamp table serves: ${unserved.join(', ')}`).toEqual([]);
    });

    it('the retired `us_open` key is gone from the ROWS and from the TABLE together — a half-retirement is the silent case', () => {
        // Removing the key from NATIONAL_STAMP_TABLE while a row still names it, or vice versa, is the
        // failure mode that produces no error and no heights. Assert the pair, not either half.
        expect(US_ROWS.filter((n) => joinOf(n) === 'us_open'), 'no row may name a key the table no longer serves').toEqual([]);
        const table = bakeSrc.slice(bakeSrc.indexOf('NATIONAL_STAMP_TABLE'));
        expect(table.slice(0, table.indexOf('\n};'))).not.toMatch(/^\s{2}us_open:\s*\{\s*stamp:/m);
    });

    it('REGION_SOURCE names every one of the 54 rows — a state with no entry would resolve to nothing at all', () => {
        const missing = US_ROWS.filter((r) => !new RegExp(`(^|[\\s,])${r}:\\s*('|\\{)`, 'm').test(heightSrc));
        expect(missing, `heightSources.mjs REGION_SOURCE is missing: ${missing.join(', ')}`).toEqual([]);
    });
});

describe('§PENDING-REGION — 53 brand-new US rows must not make the next `expect=all` publish refuse', () => {
    const tables = JSON.parse(
        execFileSync(process.execPath, [BAKE, '--regions-json'], { encoding: 'utf8', timeout: 60_000 }),
    ) as { schema: string; allRegions: Array<{ name: string; pending: boolean; heightJoin: string | null }> };

    it('every US row except `newyork` carries pending:true — newyork is already LIVE and must never carry it', () => {
        const by = new Map(tables.allRegions.map((r) => [r.name, r]));
        expect(by.get('newyork')!.pending, 'newyork is live on R2 — a pending flag would let a publish drop it').toBe(false);
        const notPending = US_ROWS.filter((r) => r !== 'newyork' && by.get(r)?.pending !== true);
        expect(notPending, `these new rows would be EXPECTED by the next expect=all merge and refuse it: ${notPending.join(', ')}`).toEqual([]);
    }, 60_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// §BAKE-US-STATES-BBOX-PROVENANCE (2026-09-06) — the bboxes are not hand-drawn, and this proves it
// OFFLINE, every run, instead of asking a reader to trust a comment.
//
// The block comment above the US rows in bake.mjs claims each bbox is "the bbox of Geofabrik's own
// us/<state>.kml polygon … rounded OUTWARD to 2 dp so the clip can never be smaller than the data".
// That claim is exactly the kind that rots silently: nudge one edge to make a border test pass and the
// comment still reads true while the clip has started dropping real ground. §L-12944's own spec
// records the rule — "if the rule cannot separate a case, say so out loud as a named limitation rather
// than tuning a box until one test passes" — and THIS is the assertion that makes tuning detectable.
//
// THE SOURCE, probed live 2026-09-06 and frozen as a fixture:
//   GET https://download.geofabrik.de/index-v1.json → HTTP 200 · 3,790,471 B · application/json.
//   It carries the authoritative per-extract POLYGON for every Geofabrik region. Its `north-america`
//   children include exactly 53 `us/*` ids, and that set equals the 53 distinct extracts these 54 rows
//   download — verified both directions, 0 missing either way.
//   Each extract's Content-Length was read the same day (the `-latest` URL 302s to the `-260905`
//   snapshot; every one answered HTTP 200 · application/octet-stream) and is carried in the fixture as
//   provenance only. ⚠ SIZES ARE NOT ASSERTED: Geofabrik re-cuts nightly, so a byte count is a
//   measurement with a date, not an invariant. The EXTENTS are asserted, because a state's polygon
//   does not move.
//
// WHY CONTAINMENT AND A SLACK CEILING, not equality: the rows are 2-dp, the polygons are 5-dp, so
// equality is impossible by construction. A bbox that does not CONTAIN the polygon clips real ground
// away; a bbox far LARGER than the polygon silently steals a neighbour's ground under
// §MOST-INTERIOR-BBOX-WINS. Both directions are bounded here.
const EXTENTS = JSON.parse(
    readFileSync(resolve(HERE, 'fixtures/geofabrik-us-extents-2026-09-06.json'), 'utf8'),
) as {
    readonly extracts: Record<string, {
        readonly west: [number, number, number, number] | null;
        readonly east: [number, number, number, number] | null;
        readonly bytes: number | null;
    }>;
};

/** The Geofabrik extract slug each bake row downloads, derived from the row's own pbfUrl. */
function extractSlugOf(name: string): string {
    const m = usRowText(name).match(/north-america\/us\/([a-z-]+)-latest\.osm\.pbf/);
    if (!m) throw new Error(`bake row '${name}' does not download a north-america/us extract`);
    return m[1]!;
}

describe('§BAKE-US-STATES-BBOX-PROVENANCE — every bbox contains its Geofabrik polygon and overshoots it by ≤ 0.02°', () => {
    const bake = bakeRegions();

    it('the fixture holds all 53 extracts (a fixture that parsed to nothing would pass everything below)', () => {
        expect(Object.keys(EXTENTS.extracts).length).toBe(53);
    });

    it('the 53 extracts the 54 rows download are exactly the 53 the index publishes under north-america/us', () => {
        const downloaded = new Set(US_ROWS.map(extractSlugOf));
        expect([...downloaded].sort()).toEqual(Object.keys(EXTENTS.extracts).sort());
        expect(downloaded.size, 'alaska is downloaded once and clipped twice, so 54 rows use 53 extracts').toBe(53);
    });

    it('NO ROW CLIPS REAL GROUND AWAY: each bbox contains its extract\'s own polygon extent', () => {
        const short: string[] = [];
        for (const name of US_ROWS) {
            const e = EXTENTS.extracts[extractSlugOf(name)]!;
            // alaskaaleutians takes the EAST-of-Greenwich cluster; alaska takes the WEST one; every
            // other row's polygon has no east cluster at all, so `west` is its whole extent.
            const want = name === 'alaskaaleutians' ? e.east! : e.west!;
            const b = bake.get(name)!;
            if (!(b[0] <= want[0] && b[1] <= want[1] && b[2] >= want[2] && b[3] >= want[3])) {
                short.push(`${name}: row ${JSON.stringify(b)} does not contain polygon ${JSON.stringify(want)}`);
            }
        }
        expect(short, `a bbox smaller than its extract clips real ground away:\n  ${short.join('\n  ')}`).toEqual([]);
    });

    it('NO ROW IS A HAND-DRAWN GUESS: no edge overshoots the polygon by more than 0.02° (2-dp outward rounding)', () => {
        const loose: string[] = [];
        for (const name of US_ROWS) {
            const e = EXTENTS.extracts[extractSlugOf(name)]!;
            const want = name === 'alaskaaleutians' ? e.east! : e.west!;
            const b = bake.get(name)!;
            const slack = Math.max(want[0] - b[0], want[1] - b[1], b[2] - want[2], b[3] - want[3]);
            // 0.0201 not 0.02: outward rounding of a 5-dp number to 2 dp can reach 0.00999…, and the
            // fixture itself is rounded to 5 dp, so the ceiling carries one unit of slop and no more.
            if (slack > 0.0201) loose.push(`${name}: overshoots by ${slack.toFixed(4)}° — ${JSON.stringify(b)} vs ${JSON.stringify(want)}`);
        }
        expect(loose, `a bbox much larger than its extract steals a neighbour's ground under §MOST-INTERIOR-BBOX-WINS:\n  ${loose.join('\n  ')}`).toEqual([]);
    });

    it('THE ANTIMERIDIAN IS THE INDEX\'S OWN SHAPE, not this lane\'s invention: only `alaska` has a second cluster', () => {
        const withEast = Object.entries(EXTENTS.extracts).filter(([, v]) => v.east !== null).map(([k]) => k);
        expect(withEast, 'if a second US extract ever crosses ±180 it needs its own split row').toEqual(['alaska']);
        // Hawaii is the case that LOOKS like it needs a split and measurably does not.
        expect(EXTENTS.extracts.hawaii!.east).toBeNull();
        expect(EXTENTS.extracts.hawaii!.west![0]).toBeGreaterThan(-180);
        // …and the two Alaska rows really do take the two clusters, not one box over both.
        expect(bake.get('alaska')![2]).toBeLessThan(0);
        expect(bake.get('alaskaaleutians')![0]).toBeGreaterThan(0);
    });
});
