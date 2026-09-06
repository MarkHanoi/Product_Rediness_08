// §US-OPEN-HEIGHTS (2026-09-05, lane HEIGHTS-US) — the US per-metro open-footprint height stamp's
// DECISIONS, unit-tested against VERBATIM live fixtures (fetched 2026-09-05, saved byte-for-byte):
//   fixtures/us-nyc-building-esb-2026-09-05.json                 NYC 5zhs-2jue, within_box over the Empire State block (9 rows)
//   fixtures/us-sf-building-footprints-transamerica-2026-09-05.json  SF ynuv-fyni, within_box over the Transamerica block (11 rows)
//   fixtures/us-boston-bpda-buildings-hancock-2026-09-05.json    BPDA FeatureServer/9, envelope in Back Bay (25 features)
// `heights/usOpenHeights.mjs` is the pure half; the stream half (heights/usOpenHeightsStamp.mjs)
// imports heightSources.mjs, which vitest cannot load (mdsBboxCoversTerrainRegion.spec.ts) — which is
// precisely why the decisions were pulled out.
//
// WHAT EACH TEST PINS, and why it earned a test rather than a comment:
//   • UNITS — NYC height_roof and Boston BLDG_HGT_2010 are FEET, SF hgt_maxcm is CENTIMETRES. A unit
//     slip does not error: it ships a 380 m Empire State Building or a 2.6 m Transamerica, both rendered
//     as opaque LOD200 solids with the measured marker. The fixture numbers make the conversion visible.
//   • AXIS ORDER — Socrata within_box is (N,W,S,E) lat-first; ArcGIS envelope is (W,S,E,N) lon-first.
//     Both live-verified; a swap returns an EMPTY page, not an error, and the join reads "nothing here".
//   • parseUsOpenPage returns null (never an empty page) for an error document — the failure-vs-empty
//     split (§CONTEXT-DATA-HONESTY) at the exact point where "the portal refused us" could void a cell.
//   • the type filter — NYC placeholders/canopies/skybridges and Boston walkways/ruins/mobile homes are
//     records in the same datasets and must never stamp a height onto a building whose footprint contains them.
//   • NULL / 0 heights → NO height (736 NYC rows, 23,487 Boston rows) — never a neighbour's, never a default.
//   • the tallest-part rule — a footprint over a Boston roof-break stack gets the tallest part it contains;
//     one over a lower part only gets that part.
//   • the working set — each metro bbox must be BYTE-IDENTICAL to its bake.mjs row bbox.
//   • Chicago / MassGIS stay ASSESSED (no height attribute) — a future row must overwrite a probed verdict.
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    FT_TO_M, US_OPEN_CITY_BBOXES, US_OPEN_HEIGHTS, US_OPEN_HEIGHTS_ASSESSED,
    parseUsOpenPage, pointInRing, usOpenComponents, usOpenHeightForFootprint, usOpenHeightM, usOpenIsBuilding,
    usOpenMetroForPoint, usOpenPageUrl,
} from '../heights/usOpenHeights.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
type Bbox = [number, number, number, number];
const NYC = US_OPEN_HEIGHTS.newyork;
const SF = US_OPEN_HEIGHTS.sanfrancisco;
const BOS = US_OPEN_HEIGHTS.boston;
const fixture = (name: string) => readFileSync(resolve(HERE, 'fixtures', name), 'utf8');
const NYC_TEXT = fixture('us-nyc-building-esb-2026-09-05.json');
const SF_TEXT = fixture('us-sf-building-footprints-transamerica-2026-09-05.json');
const BOS_TEXT = fixture('us-boston-bpda-buildings-hancock-2026-09-05.json');

/** bake.mjs ALL_REGIONS rows (the `name: … bbox: 'w,s,e,n'` shape), read as TEXT (bake.mjs runs main() on import). */
function bakeRegionBboxes(): Map<string, Bbox> {
    const src = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
    const out = new Map<string, Bbox>();
    const re = /\{\s*name:\s*'([a-z]+)'\s*,\s*pbfUrl:[^}]*?bbox:\s*'(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)'/g;
    for (const m of src.matchAll(re)) out.set(m[1]!, [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])]);
    return out;
}
const rect = (w: number, s: number, e: number, n: number) => [[w, s], [e, s], [e, n], [w, n], [w, s]];
type Comp = { id: string | null; ring: number[][]; cx: number; cy: number; h: number; rule: string };
const ringBbox = (ring: number[][]): Bbox => {
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const [x, y] of ring) { w = Math.min(w, x!); s = Math.min(s, y!); e = Math.max(e, x!); n = Math.max(n, y!); }
    return [w, s, e, n];
};

describe('§US-OPEN-HEIGHTS — page URLs and their axis order', () => {
    it('Socrata within_box is (N, W, S, E) — lat first, the live-verified Midtown shape', () => {
        // Verified 2026-09-05: within_box(the_geom,40.7650,-73.9900,40.7550,-73.9800) → 732 rows.
        const url = usOpenPageUrl(NYC, [-73.99, 40.755, -73.98, 40.765]);
        expect(url.startsWith(`${NYC.dataset}?$select=`)).toBe(true);
        const q = decodeURIComponent(url);
        expect(q).toContain('within_box(the_geom,40.765000,-73.990000,40.755000,-73.980000)');
        expect(q).toContain('$order=:id');
        expect(q).toContain('$limit=50000&$offset=0');
        expect(q).toContain('$select=bin,height_roof,ground_elevation,feature_code,construction_year,geom_source,the_geom');
    });
    it('Socrata paging moves $offset and padDeg widens the box symmetrically', () => {
        const q = decodeURIComponent(usOpenPageUrl(SF, [-122.405, 37.785, -122.395, 37.795], { offset: 50_000, padDeg: 0.001 }));
        expect(q).toContain('within_box(shape,37.796000,-122.406000,37.784000,-122.394000)');
        expect(q).toContain('$offset=50000');
    });
    it('ArcGIS envelope is (W, S, E, N) lon first, inSR=4326, outSR=4326, f=geojson, pages at 2000', () => {
        // Verified 2026-09-05: geometry=-71.08,42.35,-71.07,42.36 → 1,225 features.
        const url = usOpenPageUrl(BOS, [-71.08, 42.35, -71.07, 42.36], { offset: 2000 });
        expect(url.startsWith(`${BOS.layer}/query?f=geojson`)).toBe(true);
        expect(url).toContain('geometry=-71.080000,42.350000,-71.070000,42.360000&geometryType=esriGeometryEnvelope&inSR=4326');
        expect(url).toContain('outSR=4326');
        expect(url).toContain('resultRecordCount=2000&resultOffset=2000');
        expect(decodeURIComponent(url)).toContain('outFields=OBJECTID,BLDG_HGT_2010,GRND_ELEV_2010,ROOF_ELEV_2010,IEL_TYPE');
    });
    it('refuses an unknown adapter kind loudly rather than building a URL for nothing', () => {
        expect(() => usOpenPageUrl({ ...NYC, kind: 'wfs' } as never, [0, 0, 1, 1])).toThrow(/unknown adapter kind/);
    });
});

describe('§US-OPEN-HEIGHTS — parseUsOpenPage keeps FAILURE and EMPTY apart', () => {
    it('a Socrata error document (the live no-such-column body shape) is null, not an empty page', () => {
        const body = '{"message":"Query coordinator error: query.soql.no-such-column; No such column: heightroof","errorCode":"query.soql.no-such-column","data":{}}';
        expect(parseUsOpenPage(body, NYC)).toBeNull();
    });
    it('an ArcGIS error document is null, not an empty page', () => {
        expect(parseUsOpenPage('{"error":{"code":400,"message":"Invalid query parameters","details":[]}}', BOS)).toBeNull();
    });
    it('HTML, empty and non-string bodies are null', () => {
        expect(parseUsOpenPage('<html>503</html>', NYC)).toBeNull();
        expect(parseUsOpenPage('', SF)).toBeNull();
        expect(parseUsOpenPage(undefined as never, BOS)).toBeNull();
    });
    it('a genuine empty Socrata page is an EMPTY page with more=false', () => {
        expect(parseUsOpenPage('[]', NYC)).toEqual({ features: [], more: false });
    });
    it('a full Socrata page reports more=true; ArcGIS reports the server flag', () => {
        const tiny = { ...SF, pageLimit: 2 };
        const p = parseUsOpenPage('[{"sf16_bldgid":"a","hgt_maxcm":"100","shape":null},{"sf16_bldgid":"b","hgt_maxcm":"100","shape":null}]', tiny);
        expect(p?.more).toBe(true);
        expect(p?.features.length).toBe(2);
        expect(parseUsOpenPage('{"type":"FeatureCollection","features":[],"exceededTransferLimit":true}', BOS)?.more).toBe(true);
        expect(parseUsOpenPage('{"type":"FeatureCollection","features":[]}', BOS)?.more).toBe(false);
    });
    it('Socrata rows are lifted into Features with the geometry column removed from properties', () => {
        const p = parseUsOpenPage(NYC_TEXT, NYC)!;
        expect(p.features.length).toBe(9);
        expect(p.features[0]!.geometry?.type).toBe('MultiPolygon');
        expect((p.features[0]!.properties as Record<string, unknown>).the_geom).toBeUndefined();
    });
});

describe('§US-OPEN-HEIGHTS — the unit rule (feet / centimetres → metres) on the verbatim fixtures', () => {
    it('NYC: Empire State Building bin 1015862 height_roof 1238.79 ft → 377.6 m (not 1238.8)', () => {
        const p = parseUsOpenPage(NYC_TEXT, NYC)!;
        const esb = p.features.find((f) => (f.properties as Record<string, string>).bin === '1015862')!;
        expect((esb.properties as Record<string, string>).name).toBe('Empire State Building');
        const h = usOpenHeightM(esb.properties, NYC)!;
        expect(h.height).toBeCloseTo(1238.79032716 * FT_TO_M, 1);
        expect(h.height).toBe(377.6);
        expect(h.rule).toBe('height_roof×ft→m');
    });
    it('SF: Transamerica 201006.0000687 hgt_maxcm 25849 → 258.5 m; the median (67.8 m) is NOT used', () => {
        const p = parseUsOpenPage(SF_TEXT, SF)!;
        const ta = p.features.find((f) => (f.properties as Record<string, string>).sf16_bldgid === '201006.0000687')!;
        expect((ta.properties as Record<string, string>).hgt_mediancm).toBe('6778');
        expect(usOpenHeightM(ta.properties, SF)).toEqual({ height: 258.5, rule: 'hgt_maxcm×cm→m' });
    });
    it('SF: numeric columns are TEXT — a lexical sort would rank "999" above "24123"; Number() does not', () => {
        expect(usOpenHeightM({ hgt_maxcm: '999' }, SF)?.height).toBe(10);
        expect(usOpenHeightM({ hgt_maxcm: '24123' }, SF)?.height).toBe(241.2);
        expect(['999', '24123'].sort()[0]).toBe('24123'); // the trap, pinned so nobody "optimises" the cast away
    });
    it('Boston: BLDG_HGT_2010 334 ft → 101.8 m; the tallest fixture part 363 ft → 110.6 m', () => {
        const p = parseUsOpenPage(BOS_TEXT, BOS)!;
        const f334 = p.features.find((f) => (f.properties as Record<string, number>).OBJECTID === 671472)!;
        expect(usOpenHeightM(f334.properties, BOS)).toEqual({ height: 101.8, rule: 'BLDG_HGT_2010×ft→m' });
        const f363 = p.features.find((f) => (f.properties as Record<string, number>).OBJECTID === 763401)!;
        expect(usOpenHeightM(f363.properties, BOS)?.height).toBe(110.6);
    });
    it('NULL, empty, zero, negative and implausible heights are null — never 0, never a default', () => {
        expect(usOpenHeightM({ height_roof: null }, NYC)).toBeNull();
        expect(usOpenHeightM({ height_roof: '' }, NYC)).toBeNull();
        expect(usOpenHeightM({ height_roof: '0' }, NYC)).toBeNull();       // "zero or NULL mean … not available"
        expect(usOpenHeightM({ BLDG_HGT_2010: -3 }, BOS)).toBeNull();
        expect(usOpenHeightM({}, SF)).toBeNull();
        expect(usOpenHeightM({ hgt_maxcm: '5' }, SF)).toBeNull();           // 0.05 m — a slab (fixture row 201006.0006173)
        expect(usOpenHeightM({ height_roof: '2000' }, NYC)).toBeNull();     // 610 m > Central Park Tower's 472 m
        expect(usOpenHeightM({ hgt_maxcm: 'abc' }, SF)).toBeNull();
    });
});

describe('§US-OPEN-HEIGHTS — which records are buildings', () => {
    it('NYC: 2100/5100/5110/1000/1004/1006 are buildings; canopy 1001, tank 1002, placeholder 1003, temporary 1005, skybridge 2110 are not', () => {
        for (const c of ['2100', '5100', '5110', '1000', '1004', '1006']) expect(usOpenIsBuilding({ feature_code: c }, NYC), c).toBe(true);
        for (const c of ['1001', '1002', '1003', '1005', '2110']) expect(usOpenIsBuilding({ feature_code: c }, NYC), c).toBe(false);
        expect(usOpenIsBuilding({ feature_code: 2100 }, NYC)).toBe(true); // served as text OR number
    });
    it('Boston: BLDG/OUTBLDG/CONSTRUCT/"Buidling"/null are buildings; MOBILE, OVHD-WALKWAY, RUIN, FOUNDATION, Tank, "" are not', () => {
        for (const c of ['BLDG', 'OUTBLDG', 'CONSTRUCT', 'Buidling', null]) expect(usOpenIsBuilding({ IEL_TYPE: c }, BOS), String(c)).toBe(true);
        for (const c of ['MOBILE', 'OVHD-WALKWAY', 'RUIN', 'FOUNDATION', 'Tank', '', '120', '1500']) expect(usOpenIsBuilding({ IEL_TYPE: c }, BOS), String(c)).toBe(false);
    });
    it('SF has no type rule: every row is a building mass', () => {
        expect(usOpenIsBuilding({}, SF)).toBe(true);
    });
});

describe('§US-OPEN-HEIGHTS — components from the verbatim fixtures', () => {
    it('NYC ESB block: 9 rows → 9 components, all 2100, ESB the tallest', () => {
        const { components, skipped } = usOpenComponents(parseUsOpenPage(NYC_TEXT, NYC)!, NYC);
        expect(components.length).toBe(9);
        expect(skipped).toEqual({ notBuilding: 0, noHeight: 0, noGeometry: 0 });
        const tallest = components.reduce((a, b) => (b.h > a.h ? b : a));
        expect(tallest.id).toBe('1015862');
        expect(tallest.h).toBe(377.6);
        expect(tallest.rule).toBe('height_roof×ft→m');
        for (const c of components) expect(c.ring.length).toBeGreaterThanOrEqual(4);
    });
    it('SF Transamerica block: 11 rows → 11 components; the max-not-median cost is VISIBLE on 201006.0006173 (median 5 cm, max 32.8 m)', () => {
        const { components, skipped } = usOpenComponents(parseUsOpenPage(SF_TEXT, SF)!, SF);
        expect(components.length).toBe(11);
        expect(skipped).toEqual({ notBuilding: 0, noHeight: 0, noGeometry: 0 });
        expect(components.find((c) => c.id === '201006.0000687')?.h).toBe(258.5);
        // The documented trade-off (header of usOpenHeights.mjs): a footprint whose LiDAR MEDIAN is 5 cm but
        // whose MAX is 32.8 m gets 32.8 m — a neighbour's wall or a crown overhangs it. The median rule would
        // have dropped it (0.05 m < minPlausibleM) but would also have read the Transamerica as 67.8 m.
        const edge = components.find((c) => c.id === '201006.0006173')!;
        expect(edge.h).toBe(32.8);
        expect(usOpenHeightM({ hgt_maxcm: '5' }, SF)).toBeNull(); // what the median rule would have seen
    });
    it('Boston Back Bay block: 25 features → the walkway (notBuilding) and the 3 NULL-height BLDG rows (noHeight) are skipped', () => {
        const { components, skipped } = usOpenComponents(parseUsOpenPage(BOS_TEXT, BOS)!, BOS);
        expect(skipped.notBuilding).toBe(1);   // 675299 OVHD-WALKWAY
        expect(skipped.noHeight).toBe(3);      // 675393 / 675426 / 675438 BLDG with BLDG_HGT_2010 null
        expect(skipped.noGeometry).toBe(0);
        expect(components.length).toBe(21);
        expect(components.find((c) => c.id === '763401')?.h).toBe(110.6); // IEL_TYPE null, height real → kept
        expect(components.find((c) => c.id === '675299')).toBeUndefined();
    });
});

describe('§US-OPEN-HEIGHTS — one height per OSM footprint', () => {
    it('centroid-in: the ESB footprint (its own ring) gets the ESB height; a neighbour ring does not inherit it', () => {
        const { components } = usOpenComponents(parseUsOpenPage(NYC_TEXT, NYC)!, NYC) as { components: Comp[] };
        const esb = components.find((c) => c.id === '1015862')!;
        const got = usOpenHeightForFootprint(esb.ring, [], esb.cx, esb.cy, components)!;
        expect(got.height).toBe(377.6);
        expect(got.id).toBe('1015862');
        expect(got.rule).toBe('centroid-in · max(height_roof×ft→m)');
        const other = components.find((c) => c.id === '1015849')!; // La Quinta Manhattan Hotel, 150.95 ft
        const got2 = usOpenHeightForFootprint(other.ring, [], other.cx, other.cy, components)!;
        expect(got2.height).toBe(46);
        expect(got2.id).toBe('1015849');
    });
    it('tallest-part rule: a footprint over a Boston roof-break stack takes the TALLEST part it contains; one over a lower part only gets that part', () => {
        const { components } = usOpenComponents(parseUsOpenPage(BOS_TEXT, BOS)!, BOS) as { components: Comp[] };
        const tallest = components.reduce((a, b) => (b.h > a.h ? b : a));
        const lower = components.filter((c) => c.h < tallest.h).reduce((a, b) => (b.h > a.h ? b : a));
        // A footprint = the union bbox of both parts contains both centroids → the tallest wins.
        const [w1, s1, e1, n1] = ringBbox(tallest.ring), [w2, s2, e2, n2] = ringBbox(lower.ring);
        const union = rect(Math.min(w1, w2), Math.min(s1, s2), Math.max(e1, e2), Math.max(n1, n2));
        const both = usOpenHeightForFootprint(union, [], (w1 + e2) / 2, (s1 + n2) / 2, [tallest, lower])!;
        expect(both.height).toBe(tallest.h);
        expect(both.matched).toBe(2);
        // A tiny footprint around ONLY the lower part's centroid gets the lower part.
        const d = 1e-6;
        const tiny = rect(lower.cx - d, lower.cy - d, lower.cx + d, lower.cy + d);
        const one = usOpenHeightForFootprint(tiny, [], lower.cx, lower.cy, [tallest, lower])!;
        expect(one.height).toBe(lower.h);
        expect(one.matched).toBe(1);
    });
    it('contains-centroid fallback: an OSM footprint smaller than the source polygon is matched by the polygon containing its centroid', () => {
        const { components } = usOpenComponents(parseUsOpenPage(SF_TEXT, SF)!, SF) as { components: Comp[] };
        const ta = components.find((c) => c.id === '201006.0000687')!;
        expect(pointInRing(ta.cx, ta.cy, ta.ring)).toBe(true);
        const d = 1e-6;
        const tiny = rect(ta.cx - d, ta.cy - d, ta.cx + d, ta.cy + d); // contains NO component centroid… except its own? no: the ring is 2 µdeg wide
        const others = components.filter((c) => c.id !== ta.id);
        // Offset the OSM centroid slightly so the tiny ring holds no component centroid at all.
        const shifted = rect(ta.cx + 2e-5, ta.cy + 2e-5, ta.cx + 2e-5 + d, ta.cy + 2e-5 + d);
        const got = usOpenHeightForFootprint(shifted, [], ta.cx + 2e-5, ta.cy + 2e-5, [...others, ta])!;
        expect(got.rule.startsWith('contains-centroid')).toBe(true);
        expect(got.height).toBe(258.5);
        expect(usOpenHeightForFootprint(tiny, [], ta.cx, ta.cy, [ta])!.rule.startsWith('centroid-in')).toBe(true);
    });
    it('no match → null (never a neighbour, never a default); a courtyard hole excludes a component inside it', () => {
        const { components } = usOpenComponents(parseUsOpenPage(NYC_TEXT, NYC)!, NYC) as { components: Comp[] };
        expect(usOpenHeightForFootprint(rect(0, 0, 0.001, 0.001), [], 0.0005, 0.0005, components)).toBeNull();
        const esb = components.find((c) => c.id === '1015862')!;
        const [w, s, e, n] = ringBbox(esb.ring);
        const outer = rect(w - 0.001, s - 0.001, e + 0.001, n + 0.001);
        const hole = rect(w - 1e-5, s - 1e-5, e + 1e-5, n + 1e-5);
        const got = usOpenHeightForFootprint(outer, [hole], w - 0.0005, s - 0.0005, [esb]);
        expect(got).toBeNull();
    });
});

describe('§US-OPEN-HEIGHTS — the working set and the assessed metros', () => {
    // ⚠ CORRECTED 2026-09-06 (§BAKE-US-STATES, lane USA-ALL-STATES). This assertion used to read
    // BYTE-IDENTICAL, and that identity was the metro era's COINCIDENCE, not the contract: the join's
    // working set happened to equal the bake row because the bake row WAS the metro clip. The rows are
    // whole STATES now (sanfrancisco → `california`, boston → `massachusetts`, newyork widened), so the
    // real invariant — the one that was always doing the work — is CONTAINMENT: a working-set box
    // outside its own bake row would ask the stamp to hold footprints the clip never produced, and a
    // stamp bbox not covered by the row is the §MDS-BBOX-MUST-COVER-THE-REGION hole with the arrow
    // reversed. Identical-or-inside is asserted, never merely "defined".
    it('every US_OPEN_CITY_BBOXES row sits INSIDE its bake.mjs region row bbox and names a real adapter', () => {
        const rows = bakeRegionBboxes();
        for (const c of US_OPEN_CITY_BBOXES) {
            const row = rows.get(c.region);
            expect(row, `bake.mjs row ${c.region} (the working set names it)`).toBeDefined();
            const [rw, rs, re_, rn] = row!;
            const [w, s, e, n] = c.bbox;
            expect(rw, `${c.city}: bake row west edge`).toBeLessThanOrEqual(w);
            expect(rs, `${c.city}: bake row south edge`).toBeLessThanOrEqual(s);
            expect(re_, `${c.city}: bake row east edge`).toBeGreaterThanOrEqual(e);
            expect(rn, `${c.city}: bake row north edge`).toBeGreaterThanOrEqual(n);
            expect(US_OPEN_HEIGHTS[c.metro as keyof typeof US_OPEN_HEIGHTS], `adapter ${c.metro}`).toBeDefined();
            expect(US_OPEN_HEIGHTS[c.metro as keyof typeof US_OPEN_HEIGHTS].region).toBe(c.region);
        }
    });

    it('the three working-set boxes are UNCHANGED by the metro→state move (no number was re-derived)', () => {
        expect(US_OPEN_CITY_BBOXES.map((c) => [c.city, c.region, c.bbox])).toEqual([
            ['newyork', 'newyork', [-74.03, 40.70, -73.91, 40.82]],
            ['sanfrancisco', 'california', [-122.52, 37.70, -122.36, 37.83]],
            ['boston', 'massachusetts', [-71.20, 42.22, -70.98, 42.40]],
        ]);
    });
    it('usOpenMetroForPoint routes Midtown → newyork, the Financial District → sanfrancisco, Back Bay → boston, the Loop → null', () => {
        expect(usOpenMetroForPoint(-73.9855, 40.758)?.metro).toBe('newyork');
        expect(usOpenMetroForPoint(-122.4, 37.79)?.metro).toBe('sanfrancisco');
        expect(usOpenMetroForPoint(-71.075, 42.351)?.metro).toBe('boston');
        expect(usOpenMetroForPoint(-87.63, 41.88)).toBeNull();
    });
    it('every adapter names its unit, licence, measurement method and a distinct heightSource tag; only SF claims LiDAR', () => {
        const tags = new Set<string>();
        for (const m of Object.values(US_OPEN_HEIGHTS)) {
            expect(['ft', 'cm', 'm']).toContain(m.unit);
            expect(m.licence.length).toBeGreaterThan(10);
            expect(m.measurement.length).toBeGreaterThan(10);
            expect(m.minPlausibleM).toBeGreaterThan(0);
            expect(m.maxPlausibleM).toBeGreaterThan(m.minPlausibleM);
            tags.add(m.heightSourceTag);
        }
        expect(tags.size).toBe(Object.keys(US_OPEN_HEIGHTS).length);
        expect(NYC.measurement).toMatch(/NOT LiDAR/);
        expect(BOS.measurement).toMatch(/not LiDAR/);
        expect(SF.measurement).toMatch(/^LiDAR/);
    });
    it('chicago and MassGIS are ASSESSED as no-height-attribute with probe evidence, and chicago has no adapter row', () => {
        const chi = US_OPEN_HEIGHTS_ASSESSED.find((a) => a.metro === 'chicago')!;
        expect(chi.status).toBe('no-height-attribute');
        expect(chi.evidence).toMatch(/syp8-uezg/);
        expect(chi.evidence).toMatch(/stories/);
        expect((US_OPEN_HEIGHTS as Record<string, unknown>).chicago).toBeUndefined();
        const mg = US_OPEN_HEIGHTS_ASSESSED.find((a) => a.metro === 'massgis')!;
        expect(mg.status).toBe('no-height-attribute');
        expect(mg.evidence).toMatch(/STRUCTURES_POLY/);
    });
});
