// §USAS-NATIONAL-HEIGHTS (2026-09-06, lane USA-HEIGHTS-NATIONAL) — the DECISIONS of the whole-country
// US measured-height join, pinned against VERBATIM live answers.
//
// WHY THIS FILE EXISTS, and why it is separate from usOpenHeights.spec.ts. That spec pins the three
// per-CITY adapters. This one pins the NATIONAL half: the FEMA/ORNL "USA Structures" adapter, the
// country-wide retain set, the 0.02° grid, the bounded-heap swathe plan, the ordered/resumable sweep,
// and — the arm that matters most — that EVERY bake row declaring `heightJoin:'usas'` is actually
// inside the join's reach. Spain's nine-city retain set is why the founder found Ciudad Real on a
// fabricated 9 m carpet (§MDS-NATIONAL-SWEEP, L-12946); a US "six metros" retain set is the same
// defect with 9.8 M km² behind it, and the assertions below are what make it unshippable.
//
// The stamp itself (heights/usasNationalStamp.mjs) imports heightSources.mjs, which vitest's transform
// rejects with a bare SyntaxError — so, exactly as every sibling lane does, the stamp is pinned by TEXT
// in usasNationalWiring.spec.ts and every DECISION it makes lives here as a total function.
//
// FIXTURES are the LIVE bodies of 2026-09-06, recorded with their exact HTTP answers:
//   • us-usas-oakpark-il-page-2026-09-06.json — the FIRST 12 features, untouched, of
//     `.../USA_Structures_View/FeatureServer/0/query?f=geojson&where=HEIGHT IS NOT NULL` over the Oak
//     Park gate cell padded to [-87.7895, 41.8795, -87.7785, 41.8905] → HTTP 200, 297,097 B,
//     application/json, 2.48 s, 887 features, SOURCE {"NGA":887}, VAL_METHOD {"Unverified":887},
//     HEIGHT min 2.4 · p10 3.56 · p50 7.53 · p90 9.53 · max 37.21, `exceededTransferLimit` ABSENT.
//   • us-usas-chicago-loop-tallest10-2026-09-06.json — the TEN TALLEST features, untouched, of the
//     same query over the Chicago Loop cell [-87.635, 41.875, -87.625, 41.885] → HTTP 200, 92,401 B,
//     1.12 s, 155 features, SOURCE {"NGA":155}, max 177.85 · p50 49.34 · min 2.79. Chicago has NO city
//     channel (its own footprint dataset carries `stories`, not a height — US_OPEN_HEIGHTS_ASSESSED),
//     so this fixture IS the proof that the national layer fills a hole the city could not.
//   • us-usas-pflugerville-tx-empty-2026-09-06.json — the WHOLE body of the same query over
//     [-97.6305, 30.4395, -97.6195, 30.4505] → HTTP 200, 98 B, 0.82 s:
//     {"type":"FeatureCollection","crs":{…},"features":[]}. ORNL-only ground: a REAL empty, and the
//     one value that must never be confused with a failure.
//
// LAYERING: a build/inspection tool test — no OTel span (P8 binds exported package functions).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    US_NATIONAL_HEIGHTS, US_NATIONAL_BBOXES, US_NATIONAL_NO_HEIGHT_ROWS, US_NATIONAL_ASSESSED,
    US_NATIONAL_MEASURED_ZERO_CELLS, US_OPEN_CITY_BBOXES, USAS_SWATHE_ROWS, USAS_SWEEP_CONCURRENCY,
    USAS_TILE_DEG, formatUsasSweepSummary, parseUsOpenPage, usasCellBbox, usasCellKm2,
    usasNationalSwathes, usasSweepBatches, usasSweepOrder, usasTileGrid, usNationalCovers,
    usOpenChannelForPoint, usOpenComponents, usOpenHeightM, usOpenPageUrl,
} from '../heights/usOpenHeights.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (n: string) => readFileSync(resolve(HERE, 'fixtures', n), 'utf8');
const OAKPARK = fixture('us-usas-oakpark-il-page-2026-09-06.json');
const LOOP = fixture('us-usas-chicago-loop-tallest10-2026-09-06.json');
const EMPTY = fixture('us-usas-pflugerville-tx-empty-2026-09-06.json');

const USAS = US_NATIONAL_HEIGHTS.usas;
type Bbox = [number, number, number, number];

/** bake.mjs REGION rows, read from the real source as TEXT (bake.mjs runs a top-level main() and
 *  cannot be imported). Split on `name: '` so each chunk is exactly ONE region object — a sliding
 *  window would let a row with no bbox borrow the next row's, which is the silent-wrongness shape
 *  heightJoinCoverage.spec.ts's own header warns about. */
function bakeRows(): Array<{ name: string; bbox: Bbox; join: string | null }> {
    const src = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
    const out: Array<{ name: string; bbox: Bbox; join: string | null }> = [];
    for (const chunk of src.split(/\bname: '/).slice(1)) {
        const name = chunk.slice(0, chunk.indexOf("'"));
        const bb = chunk.match(/bbox: '(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)'/);
        if (!bb) continue;
        const join = chunk.match(/heightJoin: '([a-z0-9_]+)'/);
        out.push({ name, join: join ? join[1]! : null, bbox: [Number(bb[1]), Number(bb[2]), Number(bb[3]), Number(bb[4])] });
    }
    return out;
}

describe('§USAS-NATIONAL-HEIGHTS — the adapter is the FEMA/ORNL layer, in metres, filtered server-side', () => {
    it('names the one keyless CC-BY-4.0 FeatureServer, HEIGHT in METRES, and a distinct source tag', () => {
        expect(USAS.kind).toBe('arcgis');
        expect(USAS.layer).toBe('https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/USA_Structures_View/FeatureServer/0');
        expect(USAS.heightField).toBe('HEIGHT');
        expect(USAS.unit).toBe('m');                       // ⚠ NOT feet — NYC and Boston are feet, this one is not
        expect(USAS.heightSourceTag).toBe('usas-fema-ornl-nga-height');
        expect(USAS.licence).toMatch(/CC BY 4\.0/);
        expect(USAS.attribution).toMatch(/Oak Ridge National Laboratory/);
        expect(USAS.pageLimit).toBe(2000);                 // the service's own maxRecordCount
        expect(USAS.tileSpanDeg).toBe(USAS_TILE_DEG);
    });

    it('quotes the layer\'s OWN metadata for provenance and never claims LiDAR for every row', () => {
        // The FGDC attrdef, verbatim: "determined from LiDAR or other source data" + "LiDAR-derived
        // footprints where available". "measured-lidar" is the repo's marker NAME, not a claim this
        // adapter makes about every structure, and the distinction has to survive a careless edit.
        expect(USAS.measurement).toMatch(/LiDAR or other source data/);
        expect(USAS.measurement).toMatch(/where available/);
        expect(USAS.measurement).toMatch(/never a modelled\/estimated height/);
    });

    it('pushes HEIGHT IS NOT NULL SERVER-SIDE — the ORNL half is 55–90 % of the layer outside the cities', () => {
        expect(USAS.where).toBe('HEIGHT IS NOT NULL');
        const url = usOpenPageUrl(USAS, [-87.79, 41.88, -87.78, 41.89], { offset: 0, padDeg: 0.0005 });
        expect(url).toContain('where=HEIGHT%20IS%20NOT%20NULL');
        // ArcGIS envelope is (W, S, E, N) — lon FIRST. Socrata's within_box is (N, W, S, E). Two
        // conventions in one module is exactly the kind of thing that silently stamps the wrong county.
        expect(url).toContain('geometry=-87.790500,41.879500,-87.779500,41.890500');
        expect(url).toContain('inSR=4326');
        expect(url).toContain('outSR=4326');
        expect(url).toContain('f=geojson');
        expect(url).toContain('resultRecordCount=2000');
        expect(url).toContain('resultOffset=0');
        expect(usOpenPageUrl(USAS, [-87.79, 41.88, -87.78, 41.89], { offset: 2000 })).toContain('resultOffset=2000');
    });
});

describe('§USAS-NATIONAL-HEIGHTS — the live fixtures decode, and FAILURE ≠ EMPTY', () => {
    it('the Oak Park page decodes to 12 features with `more` false (no exceededTransferLimit flag)', () => {
        const page = parseUsOpenPage(OAKPARK, USAS)!;
        expect(page).not.toBeNull();
        expect(page.features).toHaveLength(12);
        expect(page.more).toBe(false);
        expect(page.features[0].properties.SOURCE).toBe('NGA');
    });

    it('the Pflugerville body is an EMPTY PAGE, not null — ORNL-only ground is a REAL empty', () => {
        const page = parseUsOpenPage(EMPTY, USAS)!;
        expect(page).not.toBeNull();          // null would make the stamp count it as a tileError
        expect(page.features).toEqual([]);
        expect(page.more).toBe(false);
    });

    it('an ArcGIS error document, HTML and an empty body are null (UNKNOWN), never an empty page', () => {
        // This is the exact body the server returns for a whole-state groupBy: a 400 wearing an HTTP 200.
        expect(parseUsOpenPage('{"error":{"code":400,"message":"","details":["Unable to perform query. Please check your parameters."]}}', USAS)).toBeNull();
        expect(parseUsOpenPage('<html><body>502</body></html>', USAS)).toBeNull();
        expect(parseUsOpenPage('', USAS)).toBeNull();
    });

    it('components carry METRES unchanged — 3.51 stays 3.51, not 1.07 (a foot conversion would be silent)', () => {
        const { components, skipped } = usOpenComponents(parseUsOpenPage(OAKPARK, USAS)!, USAS);
        expect(components).toHaveLength(12);
        expect(skipped).toEqual({ notBuilding: 0, noHeight: 0, noGeometry: 0 });
        expect(components.map((c) => c.h)).toEqual([3.5, 7.6, 6.7, 7.1, 4, 4.2, 6.7, 4.8, 8.6, 5, 6.7, 3.8]);
        expect(components[0].rule).toBe('HEIGHT×m→m');
        expect(components[0].id).toBe('34144769');
    });

    it('the Chicago Loop fixture reaches 177.8 m — the ground the CITY dataset cannot serve at all', () => {
        const { components } = usOpenComponents(parseUsOpenPage(LOOP, USAS)!, USAS);
        expect(components).toHaveLength(10);
        // ⚠ The live value is 177.85 and the rounded one is 177.8, NOT 177.9: 177.85 is
        // 177.84999999999999432 in IEEE-754, so `toFixed(1)` rounds DOWN. Pinned at the value the
        // code actually produces — a spec written to the value you expected is a spec that will one
        // day be "fixed" by changing the code (§TOLERANCE-FROM-MEASURED-ERROR-NOT-THE-TEST).
        expect(Math.max(...components.map((c) => c.h))).toBe(177.8);
        // …and every one of them is inside the plausible band, i.e. the band is not silently eating data.
        for (const c of components) expect(c.h).toBeGreaterThan(USAS.minPlausibleM);
    });

    it('null / 0 / negative / absurd heights are NULL, never 0 and never a default', () => {
        expect(usOpenHeightM({ HEIGHT: null }, USAS)).toBeNull();
        expect(usOpenHeightM({ HEIGHT: 0 }, USAS)).toBeNull();
        expect(usOpenHeightM({ HEIGHT: -3 }, USAS)).toBeNull();
        expect(usOpenHeightM({ HEIGHT: 1.2 }, USAS)).toBeNull();     // below minPlausibleM 2.0
        expect(usOpenHeightM({ HEIGHT: 900 }, USAS)).toBeNull();     // above maxPlausibleM 550
        expect(usOpenHeightM({ HEIGHT: 283.86 }, USAS)).toEqual({ height: 283.9, rule: 'HEIGHT×m→m' });
    });
});

describe('§USAS-NATIONAL-HEIGHTS — CITY FIRST, NATION SECOND, NOTHING THIRD', () => {
    it('the three city working sets win inside their own boxes (NYC reads 270.6 m where USAS reads 170.5 m)', () => {
        expect(usOpenChannelForPoint(-73.9855, 40.7580)!.metro).toBe('newyork');       // Midtown
        expect(usOpenChannelForPoint(-122.4000, 37.7900)!.metro).toBe('sanfrancisco'); // Financial District
        expect(usOpenChannelForPoint(-71.0750, 42.3510)!.metro).toBe('boston');        // Back Bay
    });

    it('everywhere else in the country resolves to the NATIONAL adapter — including the two gate rows', () => {
        for (const [name, lon, lat] of [
            ['oakpark IL', -87.7840, 41.8850], ['pasadena TX', -95.2090, 29.6910],
            ['chicago Loop', -87.6300, 41.8800], ['wichita KS', -97.3375, 37.6872],
            ['buffalo NY', -78.8784, 42.8864], ['fresno CA', -119.7871, 36.7378],
            ['worcester MA', -71.8023, 42.2626], ['anchorage AK', -149.9003, 61.2181],
            ['honolulu HI', -157.8583, 21.3069], ['san juan PR', -66.1057, 18.4655],
        ] as Array<[string, number, number]>) {
            expect(usOpenChannelForPoint(lon, lat)?.metro, name).toBe('usas');
        }
    });

    it('outside the BOXES is NULL — the footprint keeps its OSM tags, never a fabricated height', () => {
        expect(usOpenChannelForPoint(-99.1332, 19.4326)).toBeNull();   // Mexico City
        expect(usOpenChannelForPoint(-0.1278, 51.5074)).toBeNull();    // London
        expect(usOpenChannelForPoint(-64.9307, 18.3358)).toBeNull();   // USVI — measured ZERO, so out
        expect(usOpenChannelForPoint(174.1000, 52.9000)).toBeNull();   // Near Islands — measured ZERO, so out
    });

    it('⚠ A RECTANGLE IS NOT A COUNTRY — Toronto and Tijuana resolve to `usas`, and here is why that is safe', () => {
        // This test was written expecting `null` for Toronto and FAILED, which is the useful kind of
        // failure. The CONUS box is [-126.80, 24.15, -66.85, 49.45]; no rectangle containing the lower
        // 48 can exclude southern Ontario or northern Baja. Rather than pretend otherwise, the overlap
        // is pinned WITH THE MEASUREMENTS THAT MAKE IT HARMLESS (live, 2026-09-06, HTTP 200 each):
        //   • Toronto  -79.40,43.63,-79.36,43.67  where=1=1 → {"count":0}   — the layer holds NOTHING
        //   • Tijuana -117.05,32.51,-117.01,32.54 where=1=1 → {"count":0}   — likewise
        //   • Windsor  -83.05,42.30,-83.01,42.33  where=1=1 → {"count":30}, of which 27 carry a HEIGHT
        // So the source itself is the first guard, and the bake row's own clip is the second: the
        // `ontario` / `quebec` / `mexico` rows declare NO 'usas' join, and a US state row's footprints
        // come from that state's Geofabrik extract. A cell with no components is an honest `voidTiles`,
        // never a fabricated height. ⛔ The Windsor 27 are the one place where a Canadian footprint
        // COULD take a US federal height if it ever entered a US clip — named here, not smoothed over.
        expect(usOpenChannelForPoint(-79.3832, 43.6532)?.metro).toBe('usas');   // Toronto, ON
        expect(usOpenChannelForPoint(-117.0382, 32.5149)?.metro).toBe('usas');  // Tijuana, BC (MX)
        expect(usOpenChannelForPoint(-83.0364, 42.3149)?.metro).toBe('usas');   // Windsor, ON
    });
});

describe('§USAS-NATIONAL-BBOX — the retain set is the COUNTRY, and it COVERS every wired row', () => {
    const rows = bakeRows();

    it('parses the bake table (guards against a vacuous pass) and finds the US rows', () => {
        expect(rows.length).toBeGreaterThanOrEqual(100);
        expect(rows.find((r) => r.name === 'texas')?.bbox).toEqual([-106.65, 25.69, -93.01, 36.53]);
        expect(rows.filter((r) => r.join === 'usas').length).toBeGreaterThanOrEqual(52);
    });

    it('⭐ EVERY row that declares the join has ALL FOUR CORNERS inside the national working set', () => {
        // THE ARM THIS WHOLE FILE EXISTS FOR (§MDS-BBOX-MUST-COVER-THE-REGION). A row whose bbox pokes
        // outside US_NATIONAL_BBOXES has ground that can NEVER be stamped however long the sweep runs —
        // and it would look exactly like ground the source has no data for.
        const outside: string[] = [];
        for (const r of rows.filter((x) => x.join === 'usas')) {
            const [w, s, e, n] = r.bbox;
            for (const [lon, lat] of [[w, s], [e, s], [w, n], [e, n], [(w + e) / 2, (s + n) / 2]]) {
                if (!usNationalCovers(lon, lat)) outside.push(`${r.name} @ ${lon},${lat}`);
            }
        }
        expect(outside, 'these wired rows have ground outside the join\'s reach').toEqual([]);
    });

    it('the two MEASURED-ZERO rows are OUTSIDE the working set AND declare no join (else the gate exits 4)', () => {
        expect(US_NATIONAL_NO_HEIGHT_ROWS).toEqual(['alaskaaleutians', 'usvirginislands']);
        for (const name of US_NATIONAL_NO_HEIGHT_ROWS) {
            const row = rows.find((r) => r.name === name);
            expect(row, `${name} row`).toBeTruthy();
            expect(row!.join, `${name} must not declare a height join — the source measures 0 there`).toBeNull();
        }
    });

    it('the four boxes are CONUS + Alaska + Hawaii + Puerto Rico, and none of them crosses ±180°', () => {
        expect(US_NATIONAL_BBOXES.map((b: { city: string }) => b.city)).toEqual(['conus', 'alaska', 'hawaii', 'puertoricousa']);
        for (const b of US_NATIONAL_BBOXES as Array<{ city: string; bbox: Bbox }>) {
            const [w, s, e, n] = b.bbox;
            expect(w, b.city).toBeLessThan(e);   // a w>e "wrapped" box silently swallows the Pacific
            expect(s, b.city).toBeLessThan(n);
            expect(w, b.city).toBeGreaterThanOrEqual(-180);
            expect(e, b.city).toBeLessThanOrEqual(180);
        }
    });

    it('the three CITY boxes sit inside the national set, so city-first can never point outside the country', () => {
        for (const c of US_OPEN_CITY_BBOXES as Array<{ city: string; bbox: Bbox }>) {
            const [w, s, e, n] = c.bbox;
            expect(usNationalCovers(w, s), c.city).toBe(true);
            expect(usNationalCovers(e, n), c.city).toBe(true);
        }
    });
});

describe('§USAS-NATIONAL-SWEEP — ordered, resumable, bounded-heap, loudly truncating', () => {
    const grid = usasTileGrid([-87.80, 41.80, -87.60, 41.90]);   // Oak Park → the Loop, 10×5 cells

    it('the grid is 0.02° and its ord ↔ (ix, iy) mapping round-trips', () => {
        expect(grid.deg).toBe(0.02);
        // ⚠ 11×6, not 10×5, and that is FLOATING POINT, not a bug worth "fixing": (87.80 − 87.60) / 0.02
        // is 10.000000000000002 in IEEE-754, so `Math.ceil` yields one extra row and column. The cost is
        // an empty last row/column — `bucketRecords` only ever visits POPULATED cells, so it costs zero
        // requests — and `cellIx`/`cellIy` clamp to nx−1 / ny−1 so no point can address it. Pinned at the
        // real value: a spec written to the arithmetic you did in your head is a spec that gets "fixed"
        // by changing working code. (mdsTileGrid has the identical shape.)
        expect([grid.nx, grid.ny]).toEqual([11, 6]);
        expect(grid.cellIx(-87.60)).toBe(10);
        expect(grid.cellIy(41.90)).toBe(5);
        for (const [ix, iy] of [[0, 0], [9, 0], [0, 4], [9, 4], [4, 2]]) {
            const ord = grid.ordOf(ix, iy);
            expect([grid.ixOf(ord), grid.iyOf(ord)]).toEqual([ix, iy]);
        }
        // South→north, then west→east: the whole first row precedes the second.
        expect(grid.ordOf(9, 0)).toBeLessThan(grid.ordOf(0, 1));
    });

    it('a cell bbox is clipped to the region (the last row/column is short) and its km² is finite', () => {
        expect(usasCellBbox(grid, 0, 0)).toEqual([-87.8, 41.8, -87.78, 41.82]);
        const last = usasCellBbox(grid, grid.nx - 1, grid.ny - 1);
        expect(last[2]).toBeLessThanOrEqual(-87.60 + 1e-9);
        expect(last[3]).toBeLessThanOrEqual(41.90 + 1e-9);
        expect(usasCellKm2(grid, 0, 0)).toBeGreaterThan(2);
        expect(usasCellKm2(grid, 0, 0)).toBeLessThan(5);
    });

    it('the sweep order is NUMERIC, never lexicographic — "10,3" must not sort before "2,3"', () => {
        // mdsNational's own scar, inherited deliberately: a lexicographic sort made a capped run
        // un-resumable, because the cursor no longer described a line across the country.
        const ords = usasSweepOrder(['10,3', '2,3', '0,0', '9,4'], grid).map((c) => c.ord);
        expect(ords).toEqual([...ords].sort((a, b) => a - b));
        expect(usasSweepOrder(['10,3', '2,3'], grid)[0].key).toBe('2,3');
    });

    it('the cursor is INCLUSIVE and drops only what a previous run covered', () => {
        const all = usasSweepOrder(['0,0', '5,0', '0,1'], grid);
        expect(all).toHaveLength(3);
        const resumed = usasSweepOrder(['0,0', '5,0', '0,1'], grid, grid.ordOf(5, 0));
        expect(resumed.map((c) => c.key)).toEqual(['5,0', '0,1']);
    });

    it('batches are fixed-size and ordered, so the first cell of the first incomplete batch is an EXACT cursor', () => {
        const cells = usasSweepOrder(['0,0', '1,0', '2,0', '3,0', '4,0'], grid);
        const batches = usasSweepBatches(cells, USAS_SWEEP_CONCURRENCY);
        expect(USAS_SWEEP_CONCURRENCY).toBe(4);
        expect(batches.map((b) => b.length)).toEqual([4, 1]);
        expect(batches[1][0].key).toBe('4,0');
    });

    it('⭐ swathes PARTITION the grid rows exactly once — no cell fetched twice, no cell missed', () => {
        const ca = usasTileGrid([-125.90, 32.48, -114.12, 42.02]);   // the real `california` bake row
        const sw = usasNationalSwathes(ca);
        expect(USAS_SWATHE_ROWS).toBe(40);
        expect(sw).toHaveLength(Math.ceil(ca.ny / USAS_SWATHE_ROWS));
        expect(sw[0].iy0).toBe(0);
        expect(sw[sw.length - 1].iy1).toBe(ca.ny);
        for (let i = 1; i < sw.length; i++) {
            expect(sw[i].iy0, `band ${i} must start where band ${i - 1} ended`).toBe(sw[i - 1].iy1);
            expect(sw[i].ordFrom).toBe(sw[i - 1].ordTo);
        }
        // Every row index belongs to exactly one band…
        const seen = new Set<number>();
        for (const b of sw) for (let iy = b.iy0; iy < b.iy1; iy++) { expect(seen.has(iy)).toBe(false); seen.add(iy); }
        expect(seen.size).toBe(ca.ny);
        // …and the band bboxes cover the region's latitude span with no gap and no overhang.
        expect(sw[0].bbox[1]).toBe(ca.s);
        expect(sw[sw.length - 1].bbox[3]).toBeCloseTo(ca.n, 9);
        for (const b of sw) { expect(b.bbox[0]).toBe(ca.w); expect(b.bbox[2]).toBe(ca.e); }
    });

    it('a smaller swatheRows makes MORE bands (the heap knob), and 1 row is still a valid partition', () => {
        const ca = usasTileGrid([-125.90, 32.48, -114.12, 42.02]);
        expect(usasNationalSwathes(ca, { swatheRows: 20 }).length).toBeGreaterThan(usasNationalSwathes(ca).length);
        expect(usasNationalSwathes(ca, { swatheRows: 1 })).toHaveLength(ca.ny);
        expect(usasNationalSwathes(ca, { swatheRows: 0 })).toHaveLength(ca.ny);   // clamped to ≥ 1
    });

    it('a COMPLETE sweep says so and names the bands it scanned', () => {
        const s = formatUsasSweepSummary({ stopReason: 'complete', cellsStamped: 812, km2Stamped: 3412, cellsSkipped: 0, km2Skipped: 0, swathesTotal: 12, swathesScanned: 12, nextCursor: null });
        expect(s).toMatch(/COMPLETE/);
        expect(s).toContain('12/12 bounded-heap swathe(s)');
        expect(s).toContain('0 skipped');
        expect(s).not.toMatch(/RESUME/);
    });

    it('⭐ a TRUNCATED sweep names WHY, the km² skipped, the bands NEVER OPENED, and the resume cursor', () => {
        // §ABORT-IS-NOT-A-CAP. A skipped BAND is not a skipped cell: the later bands were never
        // partitioned, so their cells cannot appear in `cellsSkipped` at all. Reporting only the cell
        // count would under-state a truncation by whole bands of the country while looking precise.
        const s = formatUsasSweepSummary({
            stopReason: 'time budget 5400 s', cellsStamped: 400, km2Stamped: 1680,
            cellsSkipped: 120, km2Skipped: 504, swathesTotal: 12, swathesScanned: 3,
            nextCursor: 51234, nextCursorLat: 35.62, nextCursorLon: -119.44,
        });
        expect(s).toMatch(/TRUNCATED \(time budget 5400 s\)/);
        expect(s).toContain('3/12 bounded-heap swathe(s)');
        expect(s).toContain('9 further swathe(s) were NEVER OPENED');
        expect(s).toContain('504 km² SKIPPED');
        expect(s).toContain('USAS_SWEEP_CURSOR=51234');
        expect(s).toContain('lat 35.620');
        expect(s).toContain('lon -119.440');
        expect(s).toMatch(/ORIGINAL OSM tags/);   // the skipped ground is honest, not fabricated
    });
});

describe('§USAS-NATIONAL-HEIGHTS — an ESTIMATE is never presented as a measurement', () => {
    const by = (s: string) => US_NATIONAL_ASSESSED.find((r: { source: string }) => r.source === s);

    it('Overture and Microsoft US heights are recorded as ESTIMATES and are NOT wired', () => {
        expect(by('overture-buildings-height')!.status).toBe('estimate-not-wired');
        expect(by('microsoft-globalml-us')!.status).toBe('estimate-wrong-shape');
        // The evidence has to carry the number that makes the verdict checkable, not just the verdict:
        // a MAX of 34.73 m over 79,096 urban Wichita buildings, in a city whose tallest is 98 m.
        expect(by('overture-buildings-height')!.evidence).toMatch(/MAX 34\.73 m/);
        expect(by('microsoft-globalml-us')!.evidence).toMatch(/MAX 34\.6 m/);
        // …and neither may appear as an adapter anywhere in the national table.
        expect(Object.keys(US_NATIONAL_HEIGHTS)).toEqual(['usas']);
    });

    it('3DEP is recorded as DTM-ONLY over CONUS, with the identify value that proves it', () => {
        const dep = by('usgs-3dep-dsm')!;
        expect(dep.status).toBe('dtm-only-conus');
        expect(dep.evidence).toMatch(/"value":"15\.09"/);          // the GROUND under a 443 m tower
        expect(dep.evidence).toMatch(/\{"total": 0, "items": \[\]\}/); // no CONUS DSM to subtract
    });

    it('Philadelphia is recorded as a LIVE measured channel that is deliberately not wired yet', () => {
        const phl = by('philadelphia-li-building-footprints')!;
        expect(phl.status).toBe('live-measured-not-wired');
        expect(phl.evidence).toMatch(/\{"count":546459\}/);
        expect(phl.evidence).toMatch(/MAX 1127\.54/);
        expect(phl.evidence).toMatch(/UNIT IS FEET/);
        expect(phl.evidence).toMatch(/minPlausibleM rule is REQUIRED/);
    });

    it('every assessed row carries a STATUS and EVIDENCE — a blank verdict is the thing being prevented', () => {
        expect(US_NATIONAL_ASSESSED.length).toBeGreaterThanOrEqual(8);
        for (const r of US_NATIONAL_ASSESSED as Array<{ source: string; status: string; evidence: string }>) {
            expect(r.status, r.source).toMatch(/\S/);
            expect(r.evidence.length, r.source).toBeGreaterThan(80);
        }
    });
});

describe('§USAS-NATIONAL-HEIGHTS — measured-zero holes are named, and may never be gate rows', () => {
    it('records Rochester NY at count 0 — a source hole INSIDE a wired state', () => {
        const roc = US_NATIONAL_MEASURED_ZERO_CELLS.find((c: { place: string }) => c.place === 'rochester-ny')!;
        expect(roc.heightCount).toBe(0);
        expect(roc.region).toBe('newyork');
        expect(usNationalCovers(-77.61, 43.16)).toBe(true);   // in reach, and still empty: a SOURCE gap
    });

    it('⛔ no CI gate row sits inside a measured-zero cell (that would fail every bake for nothing)', () => {
        const wf = readFileSync(resolve(HERE, '../../../.github/workflows/context-bake.yml'), 'utf8');
        const rows = [...wf.matchAll(/^\s{10}([a-z-]+) ([a-z]+) (-?[\d.]+),(-?[\d.]+) (\d+)$/gm)]
            .map((m) => ({ name: m[1]!, lat: Number(m[3]), lon: Number(m[4]) }));
        expect(rows.length).toBeGreaterThanOrEqual(30);       // the parser is not vacuous
        for (const r of rows) {
            for (const z of US_NATIONAL_MEASURED_ZERO_CELLS as Array<{ place: string; bbox: Bbox }>) {
                const [w, s, e, n] = z.bbox;
                expect(r.lon >= w && r.lon <= e && r.lat >= s && r.lat <= n, `${r.name} is inside ${z.place}`).toBe(false);
            }
        }
    });

    it('the two US gate rows ARE served by the national adapter and ARE inside their own state row', () => {
        const rows = bakeRows();
        for (const [name, region, lat, lon] of [
            ['oakpark', 'illinois', 41.8850, -87.7840],
            ['pasadenatx', 'texas', 29.6910, -95.2090],
        ] as Array<[string, string, number, number]>) {
            expect(usOpenChannelForPoint(lon, lat)?.metro, name).toBe('usas');
            const row = rows.find((r) => r.name === region)!;
            expect(row.join, `${region} must declare the join the gate row depends on`).toBe('usas');
            const [w, s, e, n] = row.bbox;
            expect(lon >= w && lon <= e && lat >= s && lat <= n, `${name} inside ${region}`).toBe(true);
        }
    });
});
