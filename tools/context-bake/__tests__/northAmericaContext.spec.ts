// §BAKE-NORTHAMERICA / §NA-TERRAIN-ROWS (2026-09-06, lane MEXICO-CANADA) — Mexico and Canada pinned
// end to end across the three tables that must agree, plus the two wiring facts that are easy to get
// silently wrong.
//
// WHY EACH BLOCK EXISTS:
//
//   • THE THREE-TABLE PARITY. A region's bbox is written in bake.mjs (the OSM clip), terrain.mjs
//     (the DEM tileset) and terrainCoverage.ts (what the client asks for). `terrain.mjs
//     --check-client-coverage` already compares the last two; NOTHING compared the FIRST. A context
//     extent wider than the terrain extent is the "buildings floating off the edge of the DEM"
//     defect and narrower is a visible context cliff inside real terrain — the koln row's header
//     says so and then keeps its two numbers byte-identical by hand. Fourteen new rows is where
//     "by hand" stops being a plan.
//
//   • THE GEOFABRIK SLUGS. Each of the 14 pbfUrl values is a path this lane could NOT range-GET:
//     every *-latest.osm.pbf on download.geofabrik.de answered HTTP 502 through its own
//     download-proxy on 2026-09-06, including europe/spain-latest.osm.pbf, a URL the repo has baked
//     for months. What WAS verified is that each slug exists in the authoritative index-v1.json
//     (HTTP 200, 3,790,471 B) — so this block asserts the URLs against that index's own naming,
//     which is the strongest check available without the bytes.
//
//   • ⛔ THE PENDING FLAG. merge-tiles.mjs derives `expect=all` from bake.mjs's table. A new row
//     that is NOT staged and NOT flagged makes the next expect=all publish REFUSE BY NAME for a
//     region that was never live and therefore cannot have been lost. All 14 carry `pending: true`
//     and must, until each is staged and published.
//
//   • THE HEIGHT JOIN reaches exactly the two provinces whose channel was probed live, and no
//     other row may claim one — a declared join that produces nothing fails the
//     §MEASURED-HEIGHT-GATE, which is the correct outcome and a wasted bake.
//
// bake.mjs runs main() on import and cannot be loaded by vitest, so — like newzealandContext.spec.ts,
// swissWiring.spec.ts and mnhFr.spec.ts — the bake table is read from its `--regions-json` CLI or as
// TEXT, and terrain.mjs (which is importable) is imported.
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NATIONAL_GROUPS, NATIONAL_REGIONS } from '../terrain.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BAKE = resolve(HERE, '../bake.mjs');
const bakeSrc = readFileSync(BAKE, 'utf8');
const clientSrc = readFileSync(resolve(HERE, '../../../apps/editor/src/ui/geospatial/terrainCoverage.ts'), 'utf8');
const heightSources = readFileSync(resolve(HERE, '../heightSources.mjs'), 'utf8');
const NODE = process.execPath;

type Bbox = [number, number, number, number];
interface RegionRow { readonly name: string; readonly bbox: string; readonly heightJoin: string | null; readonly pending: boolean }

function bakeRows(): readonly RegionRow[] {
    const out = execFileSync(NODE, [BAKE, '--regions-json'], { encoding: 'utf8', timeout: 60_000 });
    return (JSON.parse(out) as { allRegions: RegionRow[] }).allRegions;
}

/** The client's TERRAIN_REGION_BBOXES rows, read as TEXT (the .ts file is not importable here). */
function clientRegionBboxes(): Map<string, Bbox> {
    const out = new Map<string, Bbox>();
    const re = /\{\s*region:\s*'([a-z]+)'\s*,\s*bbox:\s*\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\s*\}/g;
    for (const m of clientSrc.matchAll(re)) out.set(m[1]!, [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])]);
    return out;
}

/** The 13 Canadian province/territory rows + Mexico, and the Geofabrik slug each must use. */
const CANADA: ReadonlyArray<readonly [string, string]> = [
    ['ontario', 'ontario'],
    ['quebec', 'quebec'],
    ['britishcolumbia', 'british-columbia'],
    ['alberta', 'alberta'],
    ['saskatchewan', 'saskatchewan'],
    ['manitoba', 'manitoba'],
    ['newbrunswick', 'new-brunswick'],
    ['novascotia', 'nova-scotia'],
    ['princeedwardisland', 'prince-edward-island'],
    ['newfoundland', 'newfoundland-and-labrador'],
    ['yukon', 'yukon'],
    ['northwestterritories', 'northwest-territories'],
    ['nunavut', 'nunavut'],
];
const NA_REGIONS = ['mexico', ...CANADA.map(([slug]) => slug)];

describe('§BAKE-NORTHAMERICA — the bake rows', () => {
    const rows = bakeRows();
    const byName = new Map(rows.map((r) => [r.name, r]));

    it('declares all 14 rows: one national Mexico row and 13 Canadian province/territory rows', () => {
        for (const name of NA_REGIONS) expect(byName.get(name), `bake.mjs '${name}' row`).toBeDefined();
    });

    it('Mexico is ONE national row on the national extract — Geofabrik publishes no Mexican sub-regions', () => {
        const row = bakeSrc.match(/\{\s*name:\s*'mexico'\s*,[^\n]*\}/);
        expect(row).not.toBeNull();
        expect(row![0]).toContain("pbfUrl: 'https://download.geofabrik.de/north-america/mexico-latest.osm.pbf'");
        expect(row![0]).not.toMatch(/heightJoin/); // nothing measured was found in MX — never a fabricated join
    });

    it('each Canadian row uses its OWN per-province extract under north-america/canada/, never the national one', () => {
        for (const [name, slug] of CANADA) {
            const row = bakeSrc.match(new RegExp(`\\{\\s*name:\\s*'${name}'\\s*,[^\\n]*\\}`));
            expect(row, `${name} row`).not.toBeNull();
            expect(row![0]).toContain(`pbfUrl: 'https://download.geofabrik.de/north-america/canada/${slug}-latest.osm.pbf'`);
            // The whole-Canada extract is the thing the province split exists to avoid downloading.
            expect(row![0]).not.toContain('canada-latest.osm.pbf');
        }
    });

    it('⛔ every one of the 14 is `pending: true` — an unstaged row must never join the expect=all set', () => {
        for (const name of NA_REGIONS) {
            expect(byName.get(name)!.pending, `${name}.pending`).toBe(true);
        }
    });

    it('declares heightJoin ca_open on EXACTLY the two provinces whose channel was probed live', () => {
        expect(byName.get('britishcolumbia')!.heightJoin).toBe('ca_open');
        expect(byName.get('ontario')!.heightJoin).toBe('ca_open');
        for (const name of NA_REGIONS) {
            if (name === 'britishcolumbia' || name === 'ontario') continue;
            expect(byName.get(name)!.heightJoin, `${name} must declare NO height join`).toBeNull();
        }
    });

    it('routes ca_open through NATIONAL_STAMP_TABLE and gives it a PROVINCE-filtered working set', () => {
        // The pinned dispatch chain admits no new key (its front/middle/end are each pinned by a
        // sibling spec), so a new join is a table row — and its bboxes must be filtered by region,
        // because its two jurisdictions live in DIFFERENT bake rows 3,300 km apart.
        expect(bakeSrc).toMatch(/ca_open:\s*\{\s*stamp:\s*stampCaOpenHeightsOnGeojsonseq,\s*bboxes:\s*CA_OPEN_CITY_BBOXES\s*\}/);
        expect(bakeSrc).toMatch(/r\.heightJoin === 'ca_open'\)\s*return CA_OPEN_CITY_BBOXES\.filter\(\(c\) => c\.region === r\.name\)/);
        expect(bakeSrc).toContain("from './heights/caOpenHeightsStamp.mjs'");
    });
});

describe('§NA-TERRAIN-ROWS — the terrain rows and their groups', () => {
    const byName = new Map(NATIONAL_REGIONS.map((r: { name: string }) => [r.name, r]));

    // ⚠ THIS ASSERTION IS DELIBERATELY NOT `toEqual(<the whole array>)`. It was, for about an hour,
    // and a sibling lane adding a legitimate `asia` group (japan) failed it — a lane-local test must
    // not go red because another lane added a row it has no opinion about. What THIS lane owns is:
    // its two groups exist, they carry the right rows, they sit immediately after `usa`, and no live
    // group was reorganised to make room for them.
    it('adds two groups without touching the live ones — canada (13 rows) and mexico (1 row)', () => {
        expect(NATIONAL_GROUPS).toContain('canada');
        expect(NATIONAL_GROUPS).toContain('mexico');
        const i = NATIONAL_GROUPS.indexOf('usa');
        expect(NATIONAL_GROUPS.slice(i, i + 3)).toEqual(['usa', 'canada', 'mexico']);
        expect(NATIONAL_REGIONS.filter((r: { group: string }) => r.group === 'canada')).toHaveLength(13);
        expect(NATIONAL_REGIONS.filter((r: { group: string }) => r.group === 'mexico')).toHaveLength(1);
        // ⚠ THERE IS DELIBERATELY NO ASSERTION ABOUT THE `usa` GROUP'S CONTENTS HERE, and the reason
        // is a measurement, not a preference. Two drafts tried: first that `usa` held exactly the six
        // metro rows, then that it at least still CONTAINED them. Both went red inside the hour,
        // because a sibling lane is mid-flight REPLACING those metro rows with 52 whole-STATE rows
        // (measured on this tree: usa = 54 rows; `newyork` survives, sanfrancisco/chicago/austin/
        // houston/boston are gone). That is their change to make and their spec to write. What this
        // lane owes is that it did not MOVE anything to make room for canada/mexico — which the row
        // counts above and the group ordering already establish — and pinning a neighbour's table
        // from here is cross-lane coupling that fails for reasons this file cannot explain.
        // Every declared group must actually hold rows — a group named in NATIONAL_GROUPS with no
        // row is a `--group X` dispatch that silently bakes nothing.
        for (const g of NATIONAL_GROUPS) {
            expect(NATIONAL_REGIONS.some((r: { group: string }) => r.group === g), `group '${g}' has no rows`).toBe(true);
        }
    });

    it('gives every new row a probe point INSIDE its own bbox (the sparse-pyramid land check needs one)', () => {
        for (const name of NA_REGIONS) {
            const r = byName.get(name) as { bbox: Bbox; probe: [number, number]; probeCity: string } | undefined;
            expect(r, `terrain.mjs '${name}' row`).toBeDefined();
            const [w, s, e, n] = r!.bbox;
            const [lon, lat] = r!.probe;
            expect(lon, `${name} probe lon`).toBeGreaterThan(w);
            expect(lon, `${name} probe lon`).toBeLessThan(e);
            expect(lat, `${name} probe lat`).toBeGreaterThan(s);
            expect(lat, `${name} probe lat`).toBeLessThan(n);
            expect(r!.probeCity.length).toBeGreaterThan(2);
        }
    });

    it('carries a MEASURED geoidSepM for each — negative across almost all of both countries', () => {
        // Read 2026-09-06 from the SAME NGA EGM2008 COG the bake reads per post, not transcribed from
        // a web calculator. Toronto is the extreme at −37.14 m; St John's is the only strongly
        // positive one (+9.68), which is exactly why a single continental constant is impossible.
        for (const name of NA_REGIONS) {
            const r = byName.get(name) as { geoidSepM: number };
            expect(Number.isFinite(r.geoidSepM), `${name}.geoidSepM`).toBe(true);
            expect(Math.abs(r.geoidSepM), `${name}.geoidSepM must not be a placeholder 0`).toBeGreaterThan(1);
        }
        expect((byName.get('ontario') as { geoidSepM: number }).geoidSepM).toBeCloseTo(-37.14, 2);
        expect((byName.get('newfoundland') as { geoidSepM: number }).geoidSepM).toBeCloseTo(9.68, 2);
        expect((byName.get('mexico') as { geoidSepM: number }).geoidSepM).toBeCloseTo(-5.47, 2);
    });
});

describe('§THREE-TABLE-PARITY — bake.mjs == terrain.mjs == terrainCoverage.ts, byte for byte', () => {
    const rows = bakeRows();
    const bakeBbox = new Map(rows.map((r) => [r.name, r.bbox.split(',').map(Number) as Bbox]));
    const terrainBbox = new Map(NATIONAL_REGIONS.map((r: { name: string; bbox: Bbox }) => [r.name, r.bbox]));
    const clientBbox = clientRegionBboxes();

    it('every new region has the SAME bbox in all three tables', () => {
        for (const name of NA_REGIONS) {
            const b = bakeBbox.get(name), t = terrainBbox.get(name), c = clientBbox.get(name);
            expect(b, `bake.mjs '${name}'`).toBeDefined();
            expect(t, `terrain.mjs '${name}'`).toBeDefined();
            expect(c, `terrainCoverage.ts '${name}'`).toBeDefined();
            expect(t, `${name}: terrain.mjs ≠ bake.mjs`).toEqual(b);
            expect(c, `${name}: client ≠ terrain.mjs`).toEqual(t);
        }
    });

    it('each bbox is well-formed and lands where the country actually is', () => {
        for (const name of NA_REGIONS) {
            const [w, s, e, n] = terrainBbox.get(name)!;
            expect(w, `${name} w<e`).toBeLessThan(e);
            expect(s, `${name} s<n`).toBeLessThan(n);
            expect(w, `${name} is in the western hemisphere`).toBeLessThan(0);
            expect(e).toBeLessThan(0);
        }
        // A handful of real cities must fall inside their own province/country row.
        const inside = (name: string, lon: number, lat: number) => {
            const [w, s, e, n] = terrainBbox.get(name)!;
            return lon > w && lon < e && lat > s && lat < n;
        };
        expect(inside('mexico', -99.1332, 19.4326)).toBe(true);      // Mexico City
        expect(inside('mexico', -117.0382, 32.5149)).toBe(true);     // Tijuana
        expect(inside('mexico', -86.8475, 21.1619)).toBe(true);      // Cancún
        expect(inside('ontario', -79.3832, 43.6532)).toBe(true);     // Toronto
        expect(inside('quebec', -71.2080, 46.8139)).toBe(true);      // Québec City
        expect(inside('britishcolumbia', -123.1207, 49.2827)).toBe(true); // Vancouver
        expect(inside('nunavut', -68.5170, 63.7467)).toBe(true);     // Iqaluit
        expect(inside('yukon', -135.0568, 60.7212)).toBe(true);      // Whitehorse
    });
});

describe('§NA-HEIGHTS — the honest mapping for every row that has no measured channel', () => {
    it('maps britishcolumbia + ontario to the live ca_open_elem source', () => {
        expect(heightSources).toMatch(/^\s*britishcolumbia:\s*'ca_open_elem',/m);
        expect(heightSources).toMatch(/^\s*ontario:\s*'ca_open_elem',/m);
    });

    it('gives every other new region a NO-SOURCE object whose reason names what was probed', () => {
        for (const name of NA_REGIONS) {
            if (name === 'britishcolumbia' || name === 'ontario') continue;
            const m = heightSources.match(new RegExp(`^\\s*${name}:\\s*\\{([^\\n]*)\\}`, 'm'));
            expect(m, `${name} REGION_SOURCE row`).not.toBeNull();
            expect(m![1]).toMatch(/source:\s*null/);
            expect(m![1]).toMatch(/status:\s*'no-source'/);
            expect(m![1]).toMatch(/2026-09-06/);   // the date the refusal was probed
        }
    });

    it('⛔ Mexico refuses BY NAME with the exact HTTP answers, and says why the one open channel cannot work', () => {
        const m = heightSources.match(/^\s*mexico:\s*\{([^\n]*)\}/m)!;
        expect(m[1]).toContain('404');   // every INEGI service path
        expect(m[1]).toContain('403');   // datos.gob.mx
        expect(m[1]).toContain('CDMX');  // the channel that IS open
        expect(m[1]).toMatch(/coded level RANGE|CODED level RANGE/i); // …and why it still cannot yield metres
        expect(m[1]).toMatch(/PARTIAL not national/);                 // the owed INEGI LiDAR build, honestly bounded
    });

    it('Québec is recorded as WIRABLE-BUT-UNWIRED, not as absent — the MNS is real, the door is not', () => {
        const m = heightSources.match(/^\s*quebec:\s*\{([^\n]*)\}/m)!;
        expect(m[1]).toMatch(/MNS/);
        expect(m[1]).toMatch(/CC BY 4\.0/);
        expect(m[1]).toMatch(/no keyless WCS\/COG/);
    });
});
