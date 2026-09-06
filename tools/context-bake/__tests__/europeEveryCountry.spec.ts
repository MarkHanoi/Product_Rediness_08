// §EU-EVERY-COUNTRY (2026-09-06, lane EU-EVERY-COUNTRY) — "complete Europe, ALL VILLAGES, NO
// EXCEPTION", pinned at the three tables that decide whether a European site sees anything at all.
//
// WHAT THIS TEST EXISTS TO CATCH
// ------------------------------
// §BAKE-EUROPE-NATIONAL left Europe at 28 countries. Seventeen more had a Geofabrik extract, a
// jurisdiction and users, and NO bake row — so a site dropped in Reykjavík, Belgrade, Sarajevo,
// Kyiv, Valletta, Nicosia or Vaduz rendered the exact L-607 defect ("No surrounding building data
// for this area"). This file asserts the closure ROW BY ROW, and — the part a row list cannot do —
// asserts the three properties that make a row actually reach a user:
//
//   1. the country has a CONTEXT row at all;
//   2. its TERRAIN comes from a named region whose bbox really CONTAINS the context bbox (its own
//      row, or a neighbour's — six of the seventeen deliberately have no row of their own);
//   3. the CLIENT asks for exactly what the bake produces, bbox for bbox.
//
// …plus the two honesty guards this lane's evidence earns: no row exists for a micro-state that is
// already inside a neighbour's Geofabrik extract (that would double-bake the same OSM ways), and
// every new row is `pending` with no `heightJoin` (an unbaked row must not enter `expect=all`, and
// no height stamp is wired for any of these countries).
//
// ⚠ THE PARSERS ARE SHARED, NOT COPIED — `./terrainTableText`. `middleEastTerrainRows.spec.ts`
// still carries its own copy; that file was being rewritten by a concurrent lane when this landed,
// so consolidating it here would have swept up uncommitted work. That consolidation is four lines
// and is on the issue log. Read `terrainTableText.ts`'s header for why all three tables are read as
// TEXT rather than imported.
//
// LAYERING: a build/inspection tool test, like its siblings — no OTel span (P8 applies to exported
// package functions, not bake tooling).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bakeContextRegions, bakeRowText, clientRegions, covers, inBbox, nationalRegions } from './terrainTableText';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The 17 context rows §EU-EVERY-COUNTRY added, and WHERE each one's terrain comes from.
 *
 * `region === terrain` ⇒ the country has its own terrain row. `region !== terrain` ⇒ it deliberately
 * has none, because it loses §MOST-INTERIOR-BBOX-WINS (terrainCoverage.ts, L-12944) to a neighbour
 * that fully contains it, so a row of its own would be baked and never requested. The measured
 * margins are in terrain.mjs's own §EU-EVERY-COUNTRY block; what is asserted here is the part that
 * matters at runtime — that the named neighbour's bbox really covers the ground.
 */
const EU_NEW_CONTEXT: ReadonlyArray<{ readonly region: string; readonly terrain: string }> = [
    { region: 'iceland', terrain: 'iceland' },
    { region: 'faroeislands', terrain: 'faroeislands' },
    { region: 'cyprus', terrain: 'cyprus' },
    { region: 'serbia', terrain: 'serbia' },
    { region: 'bosniaherzegovina', terrain: 'bosniaherzegovina' },
    { region: 'montenegro', terrain: 'montenegro' },
    { region: 'northmacedonia', terrain: 'northmacedonia' },
    { region: 'albania', terrain: 'albania' },
    { region: 'kosovo', terrain: 'kosovo' },
    { region: 'ukraine', terrain: 'ukraine' },
    { region: 'belarus', terrain: 'belarus' },
    // …and the six served by a NEIGHBOUR's region tileset.
    { region: 'malta', terrain: 'italy' },
    { region: 'andorra', terrain: 'spain' },
    { region: 'liechtenstein', terrain: 'switzerland' },
    { region: 'channelislands', terrain: 'france' },
    { region: 'isleofman', terrain: 'greatbritain' },
    { region: 'moldova', terrain: 'ukraine' },
];

describe('§EU-EVERY-COUNTRY — every European country has context, and terrain that covers it', () => {
    const national = nationalRegions();
    const europe = national.filter((r) => r.group === 'europe');
    const bake = bakeContextRegions();
    const client = clientRegions();

    it('parses all three tables and Europe is no longer 28 countries (guards a silent regex miss)', () => {
        // A parser that matches NOTHING makes every assertion below vacuously pass — the defect the
        // scorecard's parseBakeRegions shipped. Fail loud instead.
        expect(europe.length, 'europe NATIONAL_REGIONS rows').toBeGreaterThanOrEqual(39);
        expect(bake.size, 'bake.mjs context rows').toBeGreaterThanOrEqual(60);
        expect(client.size, 'client TERRAIN_REGION_BBOXES rows').toBeGreaterThanOrEqual(70);
        expect(bake.get('ukraine')).toEqual([22.10, 44.00, 40.25, 52.40]);
        expect(bake.get('spain')).toEqual([-9.55, 35.90, 4.60, 43.90]);   // an OLD row still parses
    });

    it('every one of the 17 new countries has a bake.mjs CONTEXT row (the L-607 defect, closed by name)', () => {
        const missing = EU_NEW_CONTEXT.filter((r) => !bake.has(r.region)).map((r) => r.region);
        expect(missing, 'a country with no context row renders "No surrounding building data"').toEqual([]);
    });

    it('every europe terrain row EQUALS its bake context bbox — one number, one place to change it', () => {
        const drift: string[] = [];
        for (const row of europe) {
            const ctx = bake.get(row.name);
            if (!ctx) { drift.push(`${row.name}: terrain row with NO context row`); continue; }
            if (!row.bbox.every((v, i) => Math.abs(v - ctx[i]!) < 1e-9)) drift.push(`${row.name}: terrain ${row.bbox} != context ${ctx}`);
        }
        expect(drift, 'bake and terrain must clip the SAME ground').toEqual([]);
    });

    it('every new context row is covered by a NAMED terrain region — its own, or a neighbour that really contains it', () => {
        const holes: string[] = [];
        for (const { region, terrain } of EU_NEW_CONTEXT) {
            const ctx = bake.get(region);
            const t = national.find((r) => r.name === terrain);
            if (!ctx) { holes.push(`${region}: no context row`); continue; }
            if (!t) { holes.push(`${region}: named terrain region '${terrain}' does not exist`); continue; }
            if (!covers(t.bbox, ctx)) holes.push(`${region}: terrain '${terrain}' ${t.bbox} does NOT cover context ${ctx} — buildings there would float on flat ground`);
        }
        expect(holes).toEqual([]);
    });

    it('the six terrain-less countries are EXACTLY the borrowers (no silent third case)', () => {
        const own = EU_NEW_CONTEXT.filter((r) => r.region === r.terrain).map((r) => r.region);
        const borrowed = EU_NEW_CONTEXT.filter((r) => r.region !== r.terrain).map((r) => r.region);
        expect([...borrowed].sort()).toEqual(['andorra', 'channelislands', 'isleofman', 'liechtenstein', 'malta', 'moldova']);
        for (const n of own) expect(national.some((r) => r.name === n), `${n} must have its own terrain row`).toBe(true);
        for (const n of borrowed) expect(national.some((r) => r.name === n), `${n} must NOT have a terrain row — it would be baked and never requested`).toBe(false);
    });

    it('the client TERRAIN_REGION_BBOXES mirrors every europe row 1:1 (slug AND bbox)', () => {
        for (const row of europe) {
            const c = client.get(row.name);
            expect(c, `client is missing region '${row.name}' → baked but never requested`).toBeDefined();
            expect(c).toEqual(row.bbox);
        }
    });

    it('each NEW europe terrain row has a plausible EGM2008 lift and a probe point inside its own bbox', () => {
        for (const { region, terrain } of EU_NEW_CONTEXT) {
            if (region !== terrain) continue;
            const row = national.find((r) => r.name === region)!;
            expect(Number.isFinite(row.geoidSepM), `${region} geoidSepM`).toBe(true);
            // European N is POSITIVE and runs ~23 m (Minsk) to ~67 m (Reykjavík). A negative value
            // here is a copy-paste from the usa block, where CONUS N is negative.
            expect(row.geoidSepM, `${region} geoidSepM`).toBeGreaterThan(15);
            expect(row.geoidSepM, `${region} geoidSepM`).toBeLessThan(75);
            expect(inBbox(row.probe, row.bbox), `${region} probe ${row.probe} outside ${row.bbox}`).toBe(true);
        }
    });

    it('every new context row is PENDING and declares NO heightJoin (an unbaked row must not enter expect=all)', () => {
        for (const { region } of EU_NEW_CONTEXT) {
            const row = bakeRowText(region);
            expect(row, `${region} bake row`).not.toBeNull();
            expect(row!, `${region} must be pending until its first bake publishes`).toMatch(/pending:\s*true/);
            expect(row!, `${region} must not declare a heightJoin — no stamp is wired for it`).not.toMatch(/heightJoin/);
        }
    });

    it('every new region has an HONEST heightSources.mjs REGION_SOURCE row that says UNPROBED, not "no source"', () => {
        // The difference is the whole point: this lane probed EXTRACTS, not height services. Writing
        // "no open height product exists" would be a claim nobody measured — the failure-vs-empty
        // conflation of L-422/L-457, and the reason the Latvia row says "UNKNOWN stays UNKNOWN".
        const src = readFileSync(resolve(HERE, '../heightSources.mjs'), 'utf8');
        for (const { region } of EU_NEW_CONTEXT) {
            const m = src.match(new RegExp(`^\\s*${region}:\\s*\\{([^\\n]*)\\}`, 'm'));
            expect(m, `${region} REGION_SOURCE row`).not.toBeNull();
            expect(m![1]!).toMatch(/source:\s*null/);
            expect(m![1]!).toMatch(/status:\s*'no-source'/);
            expect(m![1]!, `${region} must say UNPROBED, not invent a refusal`).toContain('UNPROBED');
        }
    });

    it('NO row exists for a micro-state already inside a neighbour\'s extract (the double-bake refusal)', () => {
        // MEASURED 2026-09-06 against Geofabrik's own .poly clip polygons, with controls in the same
        // run (Barcelona/Madrid/Málaga ∈ spain.poly, Paris/Nice/Bordeaux ∈ france.poly, Rome ∈
        // italy.poly): Monaco ∈ france.poly · San Marino ∈ italy.poly · Vatican City ∈ italy.poly ·
        // Gibraltar ∈ spain.poly. A row for any of them would tile the same OSM ways twice into
        // buildings.pmtiles — the Copenhagen dedup rule. Assert BOTH halves: no row of its own, AND
        // the covering row's bbox really contains the point, so the omission is coverage not a hole.
        const inside: ReadonlyArray<readonly [string, string, number, number]> = [
            ['monaco', 'france', 7.4246, 43.7396],
            ['sanmarino', 'italy', 12.4470, 43.9356],
            ['vaticancity', 'italy', 12.4534, 41.9029],
            ['gibraltar', 'spain', -5.3536, 36.1408],
        ];
        for (const [slug, host, lon, lat] of inside) {
            expect(bake.has(slug), `${slug} must NOT be a bake region — it is already in the ${host} extract`).toBe(false);
            const b = bake.get(host)!;
            expect(inBbox([lon, lat], b), `${slug} ${lon},${lat} must fall inside the ${host} bbox ${b}`).toBe(true);
        }
    });

    it('VILLAGES: no layer filter, minzoom or per-region cap can drop a hamlet at the zoom the client reads', () => {
        // The founder's actual test, answered from the SOURCE of both halves rather than from hope.
        const bakeSrc = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
        const clientSrc = readFileSync(resolve(HERE, '../../../apps/editor/src/ui/geospatial/contextTiles.ts'), 'utf8');
        const layer = (id: string) => {
            const m = bakeSrc.match(new RegExp(`\\{\\s*id:\\s*'${id}'[^\\n]*`));
            expect(m, `${id} LAYERS row`).not.toBeNull();
            const z = m![0].match(/minz:\s*(\d+),\s*maxz:\s*(\d+)/);
            expect(z, `${id} zoom range`).not.toBeNull();
            return { row: m![0], minz: Number(z![1]), maxz: Number(z![2]) };
        };
        const readZoom = (id: string) => {
            const m = clientSrc.match(new RegExp(`\\n\\s*${id}:\\s*(\\d+)`));
            expect(m, `${id} LAYER_ZOOM`).not.toBeNull();
            return Number(m![1]);
        };
        // Every land layer a village needs is baked to z16 and READ at z16 — no gap between them.
        for (const id of ['buildings', 'roads', 'water', 'parks', 'landuse', 'rail', 'trees']) {
            const l = layer(id);
            const z = readZoom(id);
            expect(l.maxz, `${id} must be baked to the zoom the client reads`).toBe(16);
            expect(z, `${id} client read zoom`).toBe(16);
            expect(z).toBeLessThanOrEqual(l.maxz);
            expect(z).toBeGreaterThanOrEqual(l.minz);
        }
        // The filters are TAG filters over the whole extract — no settlement or population predicate.
        expect(layer('buildings').row).toContain("filter: ['wr/building']");
        expect(layer('roads').row).toContain("filter: ['w/highway']");
        expect(layer('trees').row).toContain("filter: ['n/natural=tree']");
        // …and nothing in the LAYERS table thins by feature COUNT. `--drop-densest-as-needed` drops
        // from the DENSEST tiles (city cores); a rural z16 tile is a few KB and is never its target.
        expect(bakeSrc).not.toMatch(/--drop-rate|--maximum-tile-features|--drop-fraction-as-needed/);
        // NAMED EXCEPTIONS, so "villages render" is not read wider than it is: canopy is OPT-IN, so a
        // new country has none until that workflow runs for it; furniture is optional and z15+.
        expect(layer('canopy').row).toMatch(/optIn:\s*true/);
        expect(layer('furniture').row).toMatch(/optional:\s*true/);
        expect(layer('furniture').minz).toBe(15);
    });
});
