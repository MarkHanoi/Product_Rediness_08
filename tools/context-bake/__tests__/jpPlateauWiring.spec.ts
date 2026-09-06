// §PLATEAU-JP-OSM-JOIN / §BAKE-JAPAN (2026-09-06, lane JAPAN-FULL) — the WIRING of Japan, pinned.
//
// France (L-12910), Switzerland (L-12883), the Netherlands and Norway each shipped a height stamp that
// was BUILT and imported by NOTHING for a day, while the country baked fabricated defaults one import
// away from a real answer. This spec exists so the Japanese stamp cannot sit in that state, and so the
// context/terrain/client legs cannot drift apart — one assertion per place Japan is wired.
//
// It asserts on the TEXT of bake.mjs (which runs `main()` on import and cannot be loaded by vitest) and
// on the TEXT of the two workflow YAMLs; terrain.mjs and the pure height module are imported normally.
// That split is the established precedent here (eeWiring.spec.ts, heightJoinCoverage.spec.ts headers).
//
// LAYERING: a build-tooling spec — no OTel span (P8 binds exported package functions, not bake tooling).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { JP_CITY_BBOXES } from '../heights/jpPlateau.mjs';
import { NATIONAL_REGIONS, NATIONAL_GROUPS } from '../terrain.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(HERE, p), 'utf8');
const bake = read('../bake.mjs');
const stamp = read('../heights/jpPlateauStamp.mjs');
const pure = read('../heights/jpPlateau.mjs');
const heightSources = read('../heightSources.mjs');
const client = read('../../../apps/editor/src/ui/geospatial/terrainCoverage.ts');
const ctxYml = read('../../../.github/workflows/context-bake.yml');
const terrainYml = read('../../../.github/workflows/terrain-bake-regions.yml');

const JAPAN_BBOX = [122.9, 24.0, 153.99, 45.6] as const;

describe('§BAKE-JAPAN — bake.mjs has a whole-country `japan` context row', () => {
    it('the row exists, is national, and names the Geofabrik japan extract', () => {
        const row = bake.match(/\{\s*name:\s*'japan'\s*,[^\n]*\}/);
        expect(row, 'japan region row').not.toBeNull();
        expect(row![0]).toMatch(/pbfUrl: 'https:\/\/download\.geofabrik\.de\/asia\/japan-latest\.osm\.pbf'/);
        expect(row![0]).toMatch(/bbox: '122\.9,24\.0,153\.99,45\.6'/);
    });

    it('is flagged `pending: true` — §PENDING-REGION, or the next expect=all publish refuses by name', () => {
        const row = bake.match(/\{\s*name:\s*'japan'\s*,[^\n]*\}/)![0];
        expect(row).toMatch(/pending:\s*true/);
    });

    it('⚠ the pbf SIZE is NOT quoted — Geofabrik answered 502 three times, and the header says so', () => {
        // [[context-data-honesty-family]]: an unreachable file is not a measurement. The comment must
        // carry the exact HTTP answer AND the md5 sibling that DID answer, never an invented byte count.
        expect(bake).toMatch(/502 Bad Gateway/);
        expect(bake).toMatch(/squid\/6\.14/);
        expect(bake).toMatch(/a9e4110c7aceb1e33634845536203ae5/);
        expect(bake).toMatch(/BYTE COUNT IS NOT MEASURED AND IS NOT QUOTED/);
    });

    it('states the split plan (BY ISLAND, on the SAME extract) rather than leaving the risk unowned', () => {
        expect(bake).toMatch(/hokkaido \/ honshu \/ shikoku-kyushu \/ okinawa/);
    });

    it('no Japanese CITY row exists, so the national row cannot double-bake a city', () => {
        for (const city of ['tokyo', 'osaka', 'nagoya', 'sapporo', 'kyoto', 'yokohama']) {
            expect(bake, `${city} must not be a bake region row`).not.toMatch(new RegExp(`\\{\\s*name:\\s*'${city}'`));
        }
    });
});

describe('§PLATEAU-JP-OSM-JOIN — the stamp is WIRED, not merely built', () => {
    it('bake.mjs imports the stamp AND its working set DIRECTLY', () => {
        expect(bake).toMatch(/^import \{ stampJpPlateauHeightsOnGeojsonseq \} from '\.\/heights\/jpPlateauStamp\.mjs';/m);
        expect(bake).toMatch(/^import \{ JP_CITY_BBOXES \} from '\.\/heights\/jpPlateau\.mjs';/m);
    });

    it("the `japan` row declares heightJoin:'plateau_jp'", () => {
        expect(bake.match(/\{\s*name:\s*'japan'\s*,[^\n]*\}/)![0]).toMatch(/heightJoin:\s*'plateau_jp'/);
    });

    it('stampBboxesFor bounds the national join to JP_CITY_BBOXES (§HEIGHT-STAMP-BUDGET preflight)', () => {
        const fn = bake.match(/function stampBboxesFor\(r\)\s*\{([\s\S]*?)\n\}/);
        expect(fn, 'stampBboxesFor').not.toBeNull();
        expect(fn![1]).toMatch(/r\.heightJoin === 'plateau_jp'\)\s*return JP_CITY_BBOXES\.map/);
    });

    it('dispatches plateau_jp through NATIONAL_STAMP_TABLE (the pinned chain admits no new key)', () => {
        const table = bake.match(/const NATIONAL_STAMP_TABLE = \{([\s\S]*?)\n\};/);
        expect(table, 'NATIONAL_STAMP_TABLE').not.toBeNull();
        expect(table![1]).toMatch(/plateau_jp:\s*\{\s*stamp:\s*stampJpPlateauHeightsOnGeojsonseq,\s*bboxes:\s*JP_CITY_BBOXES\s*\}/);
    });

    it('heightSources declares the source AND maps the region to it', () => {
        expect(heightSources).toMatch(/^\s{2}plateau_jp: \{/m);
        expect(heightSources).toMatch(/^\s{2}japan: 'plateau_jp',/m);
    });

    it('the stamp module exports the function, imports the pure half, and stamps the MEASURED marker', () => {
        expect(stamp).toMatch(/^export async function stampJpPlateauHeightsOnGeojsonseq\(/m);
        expect(stamp).toMatch(/from '\.\/jpPlateau\.mjs';/);
        expect(stamp).toMatch(/heightSource: JP_PLATEAU\.heightSourceTag/);
        expect(stamp).toMatch(/\[MEASURED_HEIGHT_SRC_TAG\]: MEASURED_HEIGHT_SRC_VALUE/);
    });

    it('⭐ keeps failure, empty, refusal and cap APART — each counted by its own name', () => {
        // §CONTEXT-DATA-HONESTY. Collapsing any two of these is the L-422/L-457/L-467/L-469 family.
        expect(stamp).toMatch(/tileErrors\+\+/);        // the server, or us — a FAILURE
        expect(stamp).toMatch(/voidTiles\+\+/);         // decoded, nothing measurable — an honest EMPTY
        expect(stamp).toMatch(/glbTiles\+\+/);          // a format we cannot read — a NAMED REFUSAL
        expect(stamp).toMatch(/tileCapHit = true/);     // a budget, not a data verdict
        expect(stamp).toMatch(/byteCapHit = true/);
        expect(stamp).toMatch(/sweepAborted = true/);   // §ABORT-IS-NOT-A-CAP
        // and a source outage answers `documented` with the reason, never a green zero
        expect(stamp).toMatch(/status: 'documented'/);
        expect(stamp).toMatch(/NOT ONE of the/);
    });

    it('reads the b3dm ATTRIBUTE PREFIX by range, never the CityGML zip', () => {
        expect(stamp).toMatch(/Range: 'bytes=0-27'/);
        expect(stamp).toMatch(/Range: `bytes=0-\$\{h\.prefixBytes - 1\}`/);
        expect(stamp).not.toMatch(/citygml_1_op\.zip/);
    });

    it('records the ONE gated Japanese door by name so nobody re-discovers it', () => {
        expect(stamp).toMatch(/reinfolib\.mlit\.go\.jp/);
        expect(stamp).toMatch(/HTTP 401/);
        expect(stamp).toMatch(/missing subscription key/);
    });
});

describe('§BAKE-JAPAN — terrain: the `japan` row and the NEW `asia` group', () => {
    it('terrain.mjs has a `japan` row in a new `asia` group', () => {
        const jp = NATIONAL_REGIONS.find((r: { name: string }) => r.name === 'japan');
        expect(jp, 'terrain japan row').toBeDefined();
        expect(jp.group).toBe('asia');
        expect(NATIONAL_GROUPS).toContain('asia');
    });

    it('its bbox is bake.mjs`s japan bbox 1:1 — a drift here bakes terrain the context never covers', () => {
        const jp = NATIONAL_REGIONS.find((r: { name: string }) => r.name === 'japan');
        expect(jp.bbox).toEqual([...JAPAN_BBOX]);
        // literal, not JAPAN_BBOX.join(',') — 24.0 stringifies to "24", which would compare a bbox
        // string that is NOT the one in the file and pass or fail for the wrong reason.
        expect(bake.match(/\{\s*name:\s*'japan'\s*,[^\n]*\}/)![0]).toContain("'122.9,24.0,153.99,45.6'");
    });

    it('carries a PROBED geoid separation and a probe point on land', () => {
        const jp = NATIONAL_REGIONS.find((r: { name: string }) => r.name === 'japan');
        expect(jp.geoidSepM).toBeCloseTo(36.39, 2);      // GeoidEval EGM2008 at Tokyo, probed 2026-09-06
        expect(jp.probeCity).toBe('Tokyo');
        expect(jp.probe[0]).toBeGreaterThan(JAPAN_BBOX[0]);
        expect(jp.probe[0]).toBeLessThan(JAPAN_BBOX[2]);
    });

    it('the CLIENT lists the region — terrain.mjs --check-client-coverage fails without it', () => {
        expect(client).toMatch(/\{ region: 'japan', bbox: \[122\.9, 24\.0, 153\.99, 45\.6\] \}/);
    });

    it('and the client needs NO group change, because the client has no group concept — said explicitly', () => {
        expect(client).toMatch(/THE CLIENT HAS NO `group` CONCEPT/);
        expect(client).not.toMatch(/'asia'/);
    });

    it('the terrain workflow offers the new group, with its cost READ from the planner not estimated', () => {
        expect(terrainYml).toMatch(/options: \[europe, usa, canada, mexico, australia, middleeast, oceania, asia, all\]/);
        expect(terrainYml).toMatch(/22,072 finest \/ 29,611 tiles/);
        expect(terrainYml).toMatch(/8 shards/);
    });
});

describe('§BAKE-JAPAN — the CI measured-height gate has a Japanese row', () => {
    it('the CITIES heredoc carries a japan row with a real floor', () => {
        const block = ctxYml.match(/done <<'CITIES'\n([\s\S]*?)\n\s*CITIES/);
        expect(block, 'CITIES heredoc').not.toBeNull();
        const rows = block![1].split('\n').map((l) => l.trim()).filter(Boolean);
        const jp = rows.filter((r) => r.split(/\s+/)[1] === 'japan');
        expect(jp, 'a japan CITIES row').toHaveLength(1);
        const [name, region, at, min] = jp[0].split(/\s+/);
        expect(name).toBe('tokyo-kanda');
        expect(region).toBe('japan');
        expect(Number(min)).toBe(500);
        // the point is the CENTRE OF THE RECTANGLE THE JOIN WAS MEASURED ON, and must be inside a stamp bbox
        const [lat, lon] = at.split(',').map(Number);
        const tokyo = JP_CITY_BBOXES.find((c: { city: string }) => c.city === 'tokyo')!;
        expect(lon).toBeGreaterThan(tokyo.bbox[0]);
        expect(lon).toBeLessThan(tokyo.bbox[2]);
        expect(lat).toBeGreaterThan(tokyo.bbox[1]);
        expect(lat).toBeLessThan(tokyo.bbox[3]);
    });

    it('the gate row says where its floor came from, and why there is only ONE Japanese row', () => {
        expect(ctxYml).toMatch(/§PLATEAU-JP-OSM-JOIN/);
        expect(ctxYml).toMatch(/1,711 of 4,178/);
        expect(ctxYml).toMatch(/ONE city only, deliberately/);
    });
});

describe('§PLATEAU-JP — the module carries its probes, its licence and its refusals', () => {
    it('names the licence, the attribution requirement and the 測量法 constraint', () => {
        expect(pure).toMatch(/PDL 1\.0/);
        expect(pure).toMatch(/CC BY/);
        expect(pure).toMatch(/出典：国土交通省/);
        expect(pure).toMatch(/測量法/);
    });

    it('records the MEASURED match rate on a real sample, not an estimate', () => {
        expect(pure).toMatch(/1,693 \/ 1,804 = 93\.8 %/);
        expect(pure).toMatch(/1,596 \/ 4,285 = 37\.2 %/);
    });

    it('states what it does NOT read — LoD2 roof form, and the glb municipality', () => {
        expect(pure).toMatch(/tilesets \(206 municipalities\) carry roof FORM/);
        expect(pure).toMatch(/13106.*台東区|台東区.*13106/s);
    });
});
