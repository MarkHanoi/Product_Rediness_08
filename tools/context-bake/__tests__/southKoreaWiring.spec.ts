// §BAKE-SOUTHKOREA (2026-09-06, lane KOREA-FROM-NOTHING) — the WIRING of South Korea, pinned.
//
// South Korea was the ONE country the founder named on 2026-09-06 that did not exist ANYWHERE in this
// codebase: no `bake.mjs` row, no `terrain.mjs` row, no `terrainCoverage.ts` row, no jurisdiction leg.
// This spec is the artefact that stops it half-existing again — one assertion per place Korea is
// wired, plus the arms that make its two HONEST GAPS impossible to mistake for coverage.
//
// ⭐ THE TWO ARMS THAT MATTER MOST ARE THE NEGATIVE ONES, and they are the reason this file is not
// just a copy of jpPlateauWiring.spec.ts:
//   §KR-NESTED-IN-JAPAN — `japan`'s rectangle CONTAINS Korea's, and `mostInterior` gives the win to
//     the BIGGER box. This spec re-implements the client's own margin formula and asserts the
//     SHADOWING as a measured fact, so the day somebody splits `japan` the numbers move here first.
//     [[unsatisfiable-gate-decomposition-is-the-fix]] in reverse: a row that can never be selected is
//     a row that answers nothing, and the honest response is to MEASURE it, not to hope.
//   §KR-NO-HEIGHT-JOIN — Korea bakes OSM tags only, and the OSM height density in central Seoul is
//     MEASURED from a saved real Overpass response. A `heightJoin` must NOT appear on this row until
//     a real source is wired, because a heightJoin key with no measured source behind it is exactly
//     the "authored-but-unwired" failure this repo keeps re-learning.
//
// It asserts on the TEXT of bake.mjs (which runs `main()` under its CLI guard and cannot be imported
// by vitest) and on the TEXT of the workflow YAML; terrain.mjs and the pure modules are imported
// normally. That split is the established precedent (jpPlateauWiring / eeWiring headers).
//
// LAYERING: a build-tooling spec — no OTel span (P8 binds exported package functions, not bake tooling).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NATIONAL_REGIONS, NATIONAL_GROUPS } from '../terrain.mjs';
import { NATIONAL_HEIGHTS_ASSESSED } from '../heights/nationalHeightsAssessed.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(HERE, p), 'utf8');
const bake = read('../bake.mjs');
const client = read('../../../apps/editor/src/ui/geospatial/terrainCoverage.ts');
const terrainYml = read('../../../.github/workflows/terrain-bake-regions.yml');
const osmCensus = JSON.parse(read('./fixtures/kr-osm-seoul-jongno-building-tag-census-2026-09-06.json'));
const geofabrikMd5 = read('./fixtures/kr-geofabrik-south-korea-md5-2026-09-06.txt');

const KR_BBOX = [124.5, 32.9, 131.95, 38.65] as const;
const JP_BBOX = [122.9, 24.0, 153.99, 45.6] as const;
const krRow = () => bake.match(/\{\s*name:\s*'southkorea'\s*,[^\n]*\}/);

interface Region { name: string; group: string; bbox: number[]; geoidSepM: number; probeCity: string; probe: number[] }
const kr = () => (NATIONAL_REGIONS as Region[]).find((r) => r.name === 'southkorea')!;

describe('§BAKE-SOUTHKOREA — bake.mjs has a whole-country `southkorea` context row', () => {
    it('the row exists, is national, and names the Geofabrik south-korea extract', () => {
        expect(krRow(), 'southkorea region row').not.toBeNull();
        expect(krRow()![0]).toMatch(/pbfUrl: 'https:\/\/download\.geofabrik\.de\/asia\/south-korea-latest\.osm\.pbf'/);
        expect(krRow()![0]).toMatch(/bbox: '124\.5,32\.9,131\.95,38\.65'/);
        expect(krRow()![0]).toMatch(/clipped:.*clip-southkorea\.osm\.pbf/);
    });

    it('is flagged `pending: true` — §PENDING-REGION, or the next expect=all publish refuses by name', () => {
        expect(krRow()![0]).toMatch(/pending:\s*true/);
    });

    it('⚠ the pbf SIZE is NOT quoted — Geofabrik served 502/504, and the header records both answers', () => {
        // [[context-data-honesty-family]]: an unreachable file is UNKNOWN, never an invented number.
        // The comment must carry the refusal AND the md5 sibling that DID answer.
        expect(bake).toMatch(/THE PBF SIZE IS NOT MEASURED AND IS NOT QUOTED/);
        expect(bake).toMatch(/HTTP 504 once and/);
        expect(bake).toMatch(/squid\/6\.14/);
        expect(bake).toMatch(/b5b789b1e7a403fb6b6f54ebeba5aa99/);
    });

    it('⭐ and that md5 is the one the SAVED REAL RESPONSE carries — not a hand-typed hash', () => {
        // The fixture is the actual HTTP 200 text/plain body, 61 bytes. If Geofabrik rebuilds the
        // extract this test still passes (the doc quotes what we saved); if somebody edits the hash in
        // the comment without re-probing, it fails. That is the direction that matters.
        expect(geofabrikMd5.trim()).toBe('b5b789b1e7a403fb6b6f54ebeba5aa99  south-korea-latest.osm.pbf');
        expect(bake).toContain(geofabrikMd5.trim().split(/\s+/)[0]);
    });

    it('no Korean CITY row exists, so the national row cannot double-bake a metro', () => {
        // §ME-NATIONAL / §NL-CITY-BBOX: a metro row inside its own national row is unreachable AND
        // duplicates every building in the overlap when rows share an extract.
        for (const city of ['seoul', 'busan', 'incheon', 'daegu', 'daejeon', 'gwangju', 'jeju']) {
            expect(bake, `${city} must not be a bake region row`).not.toMatch(new RegExp(`\\{\\s*name:\\s*'${city}'`));
        }
    });

    it('states WHY sharing a bbox with japan is safe for CONTEXT — different extracts, not luck', () => {
        expect(bake).toMatch(/asia\/japan-latest.*asia\/south-korea-latest|different Geofabrik extracts/is);
        expect(bake).toMatch(/no building is published\s*\n?\s*\/\/\s*twice|no building is published/);
    });
});

describe('§KR-NO-HEIGHT-JOIN — Korea bakes OSM tags only, and that gap is MEASURED', () => {
    it('⛔ the row declares NO heightJoin — an unwired key would be a claim with nothing behind it', () => {
        expect(krRow()![0]).not.toMatch(/heightJoin/);
    });

    it('nationalHeightsAssessed carries a `southkorea` row with a probe date and a status', () => {
        const row = NATIONAL_HEIGHTS_ASSESSED.find((r: { region: string }) => r.region === 'southkorea');
        expect(row, 'southkorea assessed row').toBeDefined();
        expect(row.country).toBe('KR');
        expect(row.status).toBe('unreachable');   // UNKNOWN, never "Korea has no height data"
        expect(row.join).toBeNull();
        expect(row.probedAt).toBe('2026-09-06');
    });

    it('⭐ the refusal is OVERTURNABLE — it names the door and quotes HTTP answers, not a verdict', () => {
        // The whole value of an assessed row is that the next reader can disprove it in one command.
        const row = NATIONAL_HEIGHTS_ASSESSED.find((r: { region: string }) => r.region === 'southkorea');
        expect(row.door).toMatch(/vworld\.kr/);
        expect(row.reason).toMatch(/HTTP 502/);
        expect(row.reason).toMatch(/curl exit 52/);
        expect(row.reason).toMatch(/HTTP 401/);            // the KEYED gateway that IS up
        expect(row.reason).toMatch(/Non-existent domain/); // nsdi.go.kr is gone, not shut
        expect(row.reason).toMatch(/RE-PROBE BEFORE BELIEVING THIS ROW/);
        // and it must distinguish the origin refusal from a network block, or it is not actionable
        expect(row.reason).toMatch(/TCP AND TLS SUCCEEDED/);
    });

    it('the OSM height density is read from a SAVED REAL Overpass response, not asserted', () => {
        expect(osmCensus.buildingWays).toBe(2038);
        expect(osmCensus.withHeightTag).toBe(104);
        expect(osmCensus.withBuildingLevels).toBe(138);
        // ⭐ THE POINT OF THE NUMBER: ~95 % of central-Seoul buildings have no height tag at all.
        expect(osmCensus.withHeightTag / osmCensus.buildingWays).toBeLessThan(0.06);
        // and the sample values are real strings off real ways, so the census cannot be a fabricated shape
        expect(osmCensus.sampleHeights.length).toBeGreaterThan(0);
        expect(Number(osmCensus.sampleHeights[0])).toBeGreaterThan(0);
    });

    it('and bake.mjs quotes that SAME measurement rather than a second, drifting copy', () => {
        // The comment wraps across lines and thousands-separates, so compare on a normalised view:
        // strip `//` continuations, collapse whitespace, drop the separators. What is being pinned is
        // that ONE measurement has ONE reading in the repo (C84 EI-9), not the prose around it.
        const flat = bake.replace(/\n\s*\/\/\s*/g, ' ').replace(/(\d),(?=\d{3}\b)/g, '$1');
        expect(flat).toContain(`${osmCensus.buildingWays} OSM building ways`);
        expect(flat).toContain(`${osmCensus.withHeightTag} carry \`height\``);
        expect(flat).toContain(`${osmCensus.withBuildingLevels} carry \`building:levels\``);
    });
});

describe('§BAKE-SOUTHKOREA — terrain: the `southkorea` row joins the existing `asia` group', () => {
    it('terrain.mjs has a `southkorea` row in the `asia` group', () => {
        expect(kr(), 'terrain southkorea row').toBeDefined();
        expect(kr().group).toBe('asia');
        expect(NATIONAL_GROUPS).toContain('asia');
    });

    it('its bbox is bake.mjs`s southkorea bbox 1:1 — a drift bakes terrain the context never covers', () => {
        expect(kr().bbox).toEqual([...KR_BBOX]);
        // literal, not KR_BBOX.join(','): 32.9 and 38.65 stringify fine but 124.5 → "124.5" only by
        // luck of the value, and the japan spec already learned this lesson the hard way.
        expect(krRow()![0]).toContain("'124.5,32.9,131.95,38.65'");
    });

    it('carries a PROBED geoid separation, on land, and says it is documentation-only', () => {
        // ⛔ L-12975: ONE geoid constant per region is wrong away from its anchor. The value below is
        // the `--geoid constant` fallback; the default bake reads N per post from EGM08_COG_URL.
        expect(kr().geoidSepM).toBeCloseTo(23.05, 2);   // EGM2008 at Seoul, read from the bake's own COG
        expect(kr().probeCity).toBe('Seoul');
        expect(kr().probe[0]).toBeGreaterThan(KR_BBOX[0]);
        expect(kr().probe[0]).toBeLessThan(KR_BBOX[2]);
        expect(kr().probe[1]).toBeGreaterThan(KR_BBOX[1]);
        expect(kr().probe[1]).toBeLessThan(KR_BBOX[3]);
    });

    it('⭐ records the MEASURED geoid SWING across the box — the reason a constant is refused', () => {
        const terrain = read('../terrain.mjs');
        expect(terrain).toMatch(/SWING 12\.47 m/);
        expect(terrain).toMatch(/Baengnyeongdo 17\.0151/);
        expect(terrain).toMatch(/Dokdo 29\.4844/);
        expect(terrain).toMatch(/Do not add a hand-picked constant for Korea/);
    });

    it('the Mapterhorn land check names EIGHT probed points, including the honest near-empty one', () => {
        const terrain = read('../terrain.mjs');
        for (const t of ['10/873/396', '10/879/404', '10/871/410', '10/884/396', '10/866/395', '10/871/412']) {
            expect(terrain, `land-check tile ${t}`).toContain(t);
        }
        // §CONTEXT-DATA-HONESTY: Marado's 400 B tile is a 200 with almost no relief — an honest EMPTY.
        // Dropping it to make the list look uniform is the defect; naming it is the fix.
        expect(terrain).toMatch(/MARADO'S 400 B IS NAMED, NOT SMOOTHED/);
    });

    it('the CLIENT lists the region — terrain.mjs --check-client-coverage fails without it', () => {
        expect(client).toMatch(/\{ region: 'southkorea', bbox: \[124\.5, 32\.9, 131\.95, 38\.65\] \}/);
    });

    it('the terrain workflow carries the asia cost RE-READ from the planner, japan`s figures kept', () => {
        expect(terrainYml).toMatch(/southkorea 1,419 finest \/ 1,941 tiles/);
        expect(terrainYml).toMatch(/asia TOTAL 23,491 finest \/ 31,552 tiles/);
        expect(terrainYml).toMatch(/9 shards \(japan 8 \+ southkorea 1\)/);
        // japan's own numbers must SURVIVE, so the delta stays visible rather than being overwritten
        expect(terrainYml).toMatch(/japan 22,072 finest \/ 29,611 tiles/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §KR-NESTED-IN-JAPAN — the shadowing, measured with the CLIENT'S OWN formula.
//
// `interiorMarginDeg` is re-implemented here rather than imported, because terrainCoverage.ts pulls
// in the client tile stack. That mirror is DANGEROUS on its own (it can drift away from the thing it
// stands in for), so — exactly as middleEastTerrainRows.spec.ts does — the mirror is PINNED against
// the client's own source text below. [[fake-more-capable-than-real]]: a re-implementation that
// cannot be checked against the original is a fake that always agrees with itself.
// ─────────────────────────────────────────────────────────────────────────────
function interiorMarginDeg(lon: number, lat: number, b: readonly number[]): number {
    const [w, s, e, n] = b;
    const cosLat = Math.cos((lat * Math.PI) / 180) || 1e-6;
    return Math.min((lon - w) * cosLat, (e - lon) * cosLat, lat - s, n - lat);
}
const inBbox = (lon: number, lat: number, b: readonly number[]) =>
    lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];

describe('§KR-NESTED-IN-JAPAN — the row is SHADOWED, and the numbers are pinned so the fix is visible', () => {
    it('§RESOLVER-MIRROR — the margin formula above is the client`s, character for character', () => {
        expect(client).toContain('const cosLat = Math.cos((lat * Math.PI) / 180) || 1e-6;');
        expect(client).toContain('return Math.min((lon - w) * cosLat, (e - lon) * cosLat, lat - s, n - lat);');
    });

    it('japan`s rectangle CONTAINS Korea`s entirely — the precondition for the whole problem', () => {
        expect(JP_BBOX[0]).toBeLessThan(KR_BBOX[0]);
        expect(JP_BBOX[1]).toBeLessThan(KR_BBOX[1]);
        expect(JP_BBOX[2]).toBeGreaterThan(KR_BBOX[2]);
        expect(JP_BBOX[3]).toBeGreaterThan(KR_BBOX[3]);
    });

    it('⛔ and therefore japan OUT-SCORES southkorea at every Korean point, by measurement', () => {
        const pts: ReadonlyArray<readonly [string, number, number]> = [
            ['Seoul', 126.978, 37.5665], ['Busan', 129.0756, 35.1796], ['Jeju', 126.5312, 33.4996],
            ['Ulleungdo', 130.9057, 37.4844], ['Marado', 126.2683, 33.1163], ['Baengnyeongdo', 124.6303, 37.9656],
        ];
        for (const [name, lon, lat] of pts) {
            expect(inBbox(lon, lat, KR_BBOX), `${name} inside southkorea`).toBe(true);
            expect(inBbox(lon, lat, JP_BBOX), `${name} also inside japan`).toBe(true);
            expect(
                interiorMarginDeg(lon, lat, JP_BBOX),
                `${name}: japan must currently out-score southkorea — if this FAILS, japan was split and §KR-NESTED-IN-JAPAN (L-12996) is FIXED. Delete this arm and flip the one below.`,
            ).toBeGreaterThan(interiorMarginDeg(lon, lat, KR_BBOX));
        }
    });

    it('the two headline margins in the docs match this computation to 3 dp', () => {
        // The comment blocks in bake.mjs and terrainCoverage.ts quote these. A hand-edited number
        // here is exactly the "count that rots" failure CLAUDE.md documents six times over.
        expect(interiorMarginDeg(126.978, 37.5665, JP_BBOX)).toBeCloseTo(3.232, 3);
        expect(interiorMarginDeg(126.978, 37.5665, KR_BBOX)).toBeCloseTo(1.084, 3);
        expect(interiorMarginDeg(129.0756, 35.1796, JP_BBOX)).toBeCloseTo(5.048, 3);
        expect(interiorMarginDeg(129.0756, 35.1796, KR_BBOX)).toBeCloseTo(2.280, 3);
        expect(bake).toContain('= 3.232');
        expect(client).toContain('japan 3.232  southkorea 1.084');
        expect(client).toContain('japan 5.048  southkorea 2.280');
    });

    it('⭐ what makes the row reachable TODAY is stated, and it is a mechanism, not a hope', () => {
        // §PENDING-REGION-FALLS-THROUGH: regionsForLonLat returns EVERY containing region and the
        // viewport attaches the first whose layer.json LOADS. japan is `pending` and unbaked → 404 →
        // Seoul falls through to southkorea. This arm asserts BOTH halves are true at once.
        expect(client).toMatch(/PENDING-REGION-FALLS-THROUGH/);
        expect(bake.match(/\{\s*name:\s*'japan'\s*,[^\n]*\}/)![0]).toMatch(/pending:\s*true/);
        expect(client).toMatch(/THE DAY `japan` IS PUBLISHED, KOREA'S TILESET STOPS BEING SELECTED/);
    });

    it('and the FIX is named as shrinking japan, never as growing Korea', () => {
        // Growing Korea to win would mean a rectangle reaching into North Korea and over Kyushu —
        // it would trade this decoy for the reverse one. The client comment must say so.
        expect(client).toMatch(/THE FIX IS TO SHRINK `japan`, NOT to grow\s*\n?\s*\/\/\s*Korea|THE FIX IS TO SHRINK `japan`/);
        expect(client).toMatch(/L-12996/);
        // Tsushima/Busan interleave is the trap in that fix and must be recorded with it.
        expect(client).toMatch(/Tsushima \(129\.17 E, Japanese\) sits 0\.09. EAST of Busan/);
    });

    it('the terrain workflow tells the dispatcher to bake Korea BEFORE japan, and why', () => {
        expect(terrainYml).toMatch(/§KR-NESTED-IN-JAPAN/);
        expect(terrainYml).toMatch(/IT SHOULD BE FIRST/);
        expect(terrainYml).toMatch(/L-12996/);
    });
});
