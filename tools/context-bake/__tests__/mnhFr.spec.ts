// §MNH-FR (2026-09-04, lane HEIGHTS-EVERYWHERE) — the French national measured-height stamp's
// DECISIONS, unit-tested. `heights/mnhFr.mjs` is the pure half (URL builders, pixel budget, the
// hits parser, the nodata mask, the city working set); the raster/network half in heightSources.mjs
// cannot be imported by vitest (see mdsBboxCoversTerrainRegion.spec.ts), which is precisely why the
// decisions were pulled out into a module that can.
//
// WHAT EACH TEST PINS, and why it earned a test rather than a comment:
//   • GetMap axis order — WMS 1.3.0 + EPSG:4326 is LAT,LON. The swapped order does NOT error; it
//     returns a valid GeoTIFF of open ocean, every footprint samples nodata, the join reports 0
//     measured heights, and the §MEASURED-HEIGHT-GATE fails a bake for a reason nobody can see.
//   • parseWfsHits returns null (never 0) on a non-hits body — the failure-vs-empty split
//     (§CONTEXT-DATA-HONESTY) at the exact point where "the index refused us" could become "there
//     are no dalles here" and silently skip a covered city.
//   • maskNodata — an unmasked −9999 blended by the bilinear sampler reads as a plausible height.
//   • city bboxes — paris/lyon must COVER the terrain.mjs `fr` rows and EQUAL the bake.mjs city rows,
//     so folding those rows into the `france` national row loses no ground (the
//     §MDS-BBOX-MUST-COVER-THE-REGION invariant, applied to France before it can be violated).
//
// LAYERING: a build/inspection tool test, like its siblings — no OTel span (P8 applies to exported
// package functions, not bake tooling).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    MNH_FR, MNH_FR_CITY_BBOXES, classifyDalleCoverage, maskNodata, mnhFrDalleHitsUrl,
    mnhFrGetMapUrl, mnhFrPxDims, parseWfsHits,
} from '../heights/mnhFr.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
type Bbox = [number, number, number, number];

/** terrain.mjs REGIONS rows with source:'fr', read as TEXT (importing terrain.mjs runs main()). */
function terrainFrRegions(): Map<string, Bbox> {
    const src = readFileSync(resolve(HERE, '../terrain.mjs'), 'utf8');
    const out = new Map<string, Bbox>();
    const re = /\{\s*name:\s*'([a-z0-9-]+)'\s*,\s*source:\s*'fr'\s*,\s*bbox:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g;
    for (const m of src.matchAll(re)) out.set(m[1]!, [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])]);
    return out;
}

/** bake.mjs ALL_REGIONS city rows (the `name: … bbox: 'w,s,e,n'` shape), read as TEXT. */
function bakeRegionBboxes(): Map<string, Bbox> {
    const src = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
    const out = new Map<string, Bbox>();
    const re = /\{\s*name:\s*'([a-z]+)'\s*,\s*pbfUrl:[^}]*?bbox:\s*'(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)'/g;
    for (const m of src.matchAll(re)) out.set(m[1]!, [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])]);
    return out;
}

const covers = (outer: Bbox, inner: Bbox) =>
    outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];

describe('§MNH-FR — GetMap URL', () => {
    it('emits WMS 1.3.0 EPSG:4326 BBOX in LAT,LON order (the live-verified shape)', () => {
        // Île de la Cité, the bbox the 2026-09-04 probe used; the served GeoTIFF read back as
        // [2.346, 48.852, 2.352, 48.856] — i.e. this order is the one the service honours.
        const url = mnhFrGetMapUrl([2.346, 48.852, 2.352, 48.856], { width: 880, height: 890 });
        expect(url).toContain('BBOX=48.852,2.346,48.856,2.352');
        expect(url).toContain('CRS=EPSG:4326');
        expect(url).toContain('VERSION=1.3.0');
        expect(url).toContain(`LAYERS=${MNH_FR.layer}`);
        expect(url).toContain('FORMAT=image%2Fgeotiff');
        expect(url).toContain('WIDTH=880&HEIGHT=890');
        expect(url.startsWith('https://data.geopf.fr/wms-r/wms?')).toBe(true);
    });

    it('never emits the lon,lat order that silently returns open ocean', () => {
        const url = mnhFrGetMapUrl([2.346, 48.852, 2.352, 48.856], { width: 10, height: 10 });
        expect(url).not.toContain('BBOX=2.346,48.852');
    });
});

describe('§MNH-FR — pixel budget', () => {
    it('sizes a ~1 m request from the box in metres (Paris latitudes)', () => {
        const d = mnhFrPxDims([2.346, 48.852, 2.352, 48.856], 1.0);
        // 0.006° lon × ~73.3 km/° ≈ 440 m; 0.004° lat × 111.32 km/° ≈ 445 m.
        expect(d.width).toBeGreaterThanOrEqual(435);
        expect(d.width).toBeLessThanOrEqual(445);
        expect(d.height).toBeGreaterThanOrEqual(440);
        expect(d.height).toBeLessThanOrEqual(450);
    });
    it('caps both axes at the service maximum and floors at 2 px', () => {
        expect(mnhFrPxDims([2.0, 48.0, 2.5, 48.5], 0.1)).toEqual({ width: MNH_FR.maxPx, height: MNH_FR.maxPx });
        expect(mnhFrPxDims([2.0, 48.0, 2.0, 48.0], 1.0)).toEqual({ width: 2, height: 2 });
        expect(MNH_FR.maxPx).toBe(5010); // GetCapabilities MaxWidth/MaxHeight, 2026-09-04
    });
    it('halving the resolution halves the pixel count per axis', () => {
        const a = mnhFrPxDims([2.22, 48.80, 2.23, 48.81], 1.0);
        const b = mnhFrPxDims([2.22, 48.80, 2.23, 48.81], 2.0);
        expect(Math.abs(a.width / 2 - b.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(a.height / 2 - b.height)).toBeLessThanOrEqual(1);
    });
});

describe('§MNH-FR — dalle index (coverage pre-check)', () => {
    it('builds a hits-only WFS 2.0 query over the dalle layer in lon,lat order', () => {
        const url = mnhFrDalleHitsUrl([2.22, 48.80, 2.47, 48.91]);
        expect(url).toContain('TYPENAMES=IGNF_MNH-LIDAR-HD:dalle');
        expect(url).toContain('BBOX=2.22,48.8,2.47,48.91,EPSG:4326');
        expect(url).toContain('RESULTTYPE=hits');
        expect(url.startsWith('https://data.geopf.fr/wfs/ows?')).toBe(true);
    });
    it('parses numberMatched from a hits document, including a genuine zero', () => {
        expect(parseWfsHits('<wfs:FeatureCollection numberMatched="268" numberReturned="0" />')).toBe(268);
        expect(parseWfsHits('<wfs:FeatureCollection numberMatched="0" numberReturned="0" />')).toBe(0);
    });
    it('returns null — NOT 0 — for an exception report, an HTML page, an empty body, or no body', () => {
        expect(parseWfsHits('<ows:ExceptionReport><ows:ExceptionText>Unknown namespace</ows:ExceptionText></ows:ExceptionReport>')).toBeNull();
        expect(parseWfsHits('<!DOCTYPE html><html><body>502 Bad Gateway</body></html>')).toBeNull();
        expect(parseWfsHits('')).toBeNull();
        expect(parseWfsHits(undefined)).toBeNull();
        expect(parseWfsHits(null)).toBeNull();
    });
    it('keeps failure and empty as different verdicts', () => {
        expect(classifyDalleCoverage(268)).toBe('covered');
        expect(classifyDalleCoverage(0)).toBe('none');
        expect(classifyDalleCoverage(null)).toBe('unknown');
        expect(classifyDalleCoverage(undefined)).toBe('unknown');
        expect(classifyDalleCoverage(Number.NaN)).toBe('unknown');
    });
});

describe('§MNH-FR — nodata mask', () => {
    it('masks the −9999 sentinel and non-finite values to NaN in place, keeps 0 (bare ground) as data', () => {
        const v = new Float32Array([-9999, 3.5, Number.NaN, 0, 23.6, Number.POSITIVE_INFINITY]);
        const masked = maskNodata(v, MNH_FR.nodata);
        expect(masked).toBe(3);
        expect(Number.isNaN(v[0])).toBe(true);
        expect(v[1]).toBeCloseTo(3.5, 5);
        expect(Number.isNaN(v[2])).toBe(true);
        expect(v[3]).toBe(0);
        expect(v[4]).toBeCloseTo(23.6, 5);
        expect(Number.isNaN(v[5])).toBe(true);
    });
    it('defaults to the IGN sentinel', () => {
        const v = new Float32Array([-9999, 1]);
        expect(maskNodata(v)).toBe(1);
        expect(MNH_FR.nodata).toBe(-9999);
    });
});

describe('§MNH-FR-CITY-BBOXES — the france row working set', () => {
    const rows = MNH_FR_CITY_BBOXES as Array<{ city: string; bbox: Bbox }>;

    it('has unique cities and well-formed, city-sized bboxes', () => {
        const names = rows.map((r) => r.city);
        expect(new Set(names).size).toBe(names.length);
        for (const r of rows) {
            const [w, s, e, n] = r.bbox;
            expect(w).toBeLessThan(e);
            expect(s).toBeLessThan(n);
            // A national join's working set is CITY bboxes (§HEIGHT-STAMP-BUDGET); anything wider is
            // a country slipping in through the back door.
            expect(e - w).toBeLessThanOrEqual(0.3);
            expect(n - s).toBeLessThanOrEqual(0.3);
            // Metropolitan France only — the WGS84G layer is worldwide but the dalle index and the
            // Lambert-93 source grid are the Hexagon + Corsica.
            expect(w).toBeGreaterThan(-5.5);
            expect(e).toBeLessThan(10);
            expect(s).toBeGreaterThan(41);
            expect(n).toBeLessThan(52);
        }
    });

    it('covers every terrain.mjs `fr` region (guards the parser against a silent miss)', () => {
        const terrain = terrainFrRegions();
        expect(terrain.size).toBeGreaterThanOrEqual(2); // paris + lyon today; a 0 here is a regex rot, not a pass
        for (const [name, tb] of terrain) {
            const row = rows.find((r) => r.city === name);
            expect(row, `terrain.mjs fr region "${name}" has no MNH stamp bbox — its baked terrain would carry 9 m defaults forever`).toBeDefined();
            expect(covers(row!.bbox, tb), `${name}: MNH bbox ${row!.bbox} does not cover terrain ${tb}`).toBe(true);
        }
    });

    it('equals the bake.mjs paris/lyon city rows, so folding them into `france` loses no ground', () => {
        const bake = bakeRegionBboxes();
        expect(bake.get('paris')).toBeDefined();
        expect(bake.get('lyon')).toBeDefined();
        for (const name of ['paris', 'lyon']) {
            const row = rows.find((r) => r.city === name)!;
            expect(row.bbox).toEqual(bake.get(name));
        }
    });

    it('lists the founder\'s French test sites — marseille AND sète (L-12910)', () => {
        // Sète is where the ghosts were reported beside Marseille. A covered town absent from this list
        // streams through the join unstamped, so its absence would be a permanent silent hole.
        for (const city of ['marseille', 'sete']) expect(rows.find((r) => r.city === city), city).toBeDefined();
    });
});

// §HEIGHTS-FR-SOLID (L-12910, 2026-09-05) — the WIRING, pinned. The stamp was authored on 2026-09-04
// and imported by nothing; France baked honest 9 m defaults while its measured-height channel sat one
// import away (the L-12883 shape). bake.mjs cannot be imported (it runs main()), so — like
// mdsBboxCoversTerrainRegion.spec.ts — the wiring is asserted on the TEXT. Each assertion is one of the
// four places `mds` is wired, because "exactly like mds" is the design rule (bake.mjs §MDS-OSM-JOIN).
describe('§HEIGHTS-FR-SOLID — bake.mjs wires the mnh_fr stamp for the `france` row', () => {
    const bake = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');

    // ⭐ §MNH-FR-NATIONAL-SWEEP (2026-09-06, lane HEIGHTS-WHOLE-COUNTRY-A) — bake.mjs now imports the
    // NATIONAL wrapper from its own module (heights/mnhFrNationalStamp.mjs — the nl3dbagStamp
    // shared-file rule), and the city list from heightSources.mjs, where it is the PRIORITY order.
    // `stampMnhFrHeightsOnGeojsonseq` is NOT orphaned: it is what each bounded-heap band runs, and the
    // wrapper imports it. bake.mjs simply no longer needs to name it.
    it('imports the NATIONAL wrapper, and the city list it uses as the priority order', () => {
        expect(bake).toMatch(/^import\s*\{[^}]*\bstampMnhFrNationalHeightsOnGeojsonseq\b[^}]*\}\s*from\s*'\.\/heights\/mnhFrNationalStamp\.mjs';/m);
        expect(bake).toMatch(/^import\s*\{[^}]*\bMNH_FR_NATIONAL_BBOXES\b[^}]*\}\s*from\s*'\.\/heights\/mnhFrNationalStamp\.mjs';/m);
        const imp = bake.match(/^import\s*\{([^}]*)\}\s*from\s*'\.\/heightSources\.mjs';/m);
        expect(imp, 'heightSources.mjs import statement').not.toBeNull();
        expect(imp![1]).toContain('MNH_FR_CITY_BBOXES');
    });

    it('the `france` region row declares heightJoin:\'mnh_fr\' (the key heightSources.mjs REGION_SOURCE names)', () => {
        // ⚠ BRACE-MATCHED, not `/\{\s*name:\s*'france'\s*,[^\n]*\}/` — that one-line regex was here
        // until 2026-09-06 and went RED the moment §FR-BDTOPO-FOOTPRINTS (L-12940) added a
        // `footprintSource` to this row and made it multi-line. It failed with "expected null not to
        // be null", which reads as "france has no heightJoin" — the WRONG alarm, about a fact that
        // had not changed. A row-shape assumption in a test that has nothing to do with row shape is
        // a tripwire pointed at its own foot; depth counting is indifferent to formatting.
        const start = bake.indexOf("{ name: 'france',");
        expect(start, 'france row').toBeGreaterThan(-1);
        let depth = 0;
        let row = '';
        for (let i = start; i < bake.length; i++) {
            if (bake[i] === '{') depth++;
            else if (bake[i] === '}' && --depth === 0) { row = bake.slice(start, i + 1); break; }
        }
        expect(row, 'france row is brace-balanced').not.toBe('');
        expect(row).toMatch(/heightJoin:\s*'mnh_fr'/);
    });

    // ⭐ §MNH-FR-NATIONAL-SWEEP (2026-09-06) — this pin used to REQUIRE MNH_FR_CITY_BBOXES, which means
    // it pinned the DEFECT: thirteen metro boxes (~200 km² of a 551,695 km² country) were BOTH the
    // priority order AND the retain set, so Toulon, Perpignan, Nîmes, Reims, Le Havre, Brest, Metz,
    // Caen, Limoges, Ajaccio and every village were STRUCTURALLY unmeasurable and shipped the labelled
    // `assumed` 9 m — on the map indistinguishable from "IGN has published nothing here". The file's own
    // header had already said so ("the binding limit … is THIS FILE'S CITY LIST, not IGN's publication")
    // and answered it by measuring 27 more cities BY HAND. The retain set is the country now; the list
    // keeps its second job, the PRIORITY order, which the next assertion still pins.
    it('stampBboxesFor gives the join the WHOLE-COUNTRY retain set (§HEIGHT-STAMP-BUDGET preflight)', () => {
        const fn = bake.match(/function stampBboxesFor\(r\)\s*\{([\s\S]*?)\n\}/);
        expect(fn, 'stampBboxesFor').not.toBeNull();
        expect(fn![1]).toMatch(/r\.heightJoin === 'mnh_fr'\)\s*return MNH_FR_NATIONAL_BBOXES/);
    });

    it('dispatches mnh_fr to the NATIONAL stamp, IN THE PINNED CHAIN, with the city list as priority', () => {
        // ⛔ The key stays in the chain rather than moving to NATIONAL_STAMP_TABLE: this assertion and
        // swissWiring.spec.ts's `'mnh_fr' || 'swiss')` pin the chain as CONTIGUOUS TEXT, so lifting it
        // out would break two sibling pins for no behavioural gain.
        expect(bake).toMatch(/r\.heightJoin === 'mds' \|\| r\.heightJoin === 'dhm' \|\| r\.heightJoin === 'lod2nrw' \|\| r\.heightJoin === 'mnh_fr'/);
        expect(bake).toMatch(/r\.heightJoin === 'mnh_fr' \? MNH_FR_CITY_BBOXES\.map\(\(c\) => c\.bbox\)/);
        expect(bake).toMatch(/if \(r\.heightJoin === 'mnh_fr'\) res = await stampMnhFrNationalHeightsOnGeojsonseq\(baseGeo, stamped, wsen, \{ maxTiles, priorityBboxes, retainBboxes \}\)/);
    });
});
