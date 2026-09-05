// §AU-OPEN-HEIGHTS (2026-09-05, lane HEIGHTS-AU) — the Australian per-jurisdiction open-footprint
// height stamp's DECISIONS, unit-tested against VERBATIM live fixtures. `heights/auOpenHeights.mjs`
// is the pure half (adapter table, export URL, component parser, the height rule, the working set);
// the network/stream half in heightSources.mjs cannot be imported by vitest (see
// mdsBboxCoversTerrainRegion.spec.ts), which is precisely why the decisions were pulled out.
//
// WHAT EACH TEST PINS, and why it earned a test rather than a comment:
//   • in_bbox axis order — ODSQL `in_bbox(field, lat1, lon1, lat2, lon2)` is LAT,LON. The swapped
//     order does NOT error; it returns an empty collection over the Indian Ocean, every cell reads
//     "empty", the join reports 0 measured heights, and the §MEASURED-HEIGHT-GATE fails a bake for a
//     reason nobody can see.
//   • parseOdsGeojson returns null (never an empty collection) for a non-GeoJSON body — the
//     failure-vs-empty split (§CONTEXT-DATA-HONESTY) at the exact point where "the portal refused
//     us" could become "nothing built here" and silently void a covered cell.
//   • the component stack → ONE metre — Eureka Tower is published as 8 stacked components sharing
//     structure_min 2.0; the rule must read 297.5 m (the real tower), and a footprint covering only
//     the podium must NOT inherit the tower's height.
//   • non-building types — bridges/jetties/tram stops are `footprint_type`s in the same dataset and
//     must never stamp a height onto a building whose footprint happens to contain them.
//   • the working set — melbourne must lie INSIDE the bake.mjs `victoria` row bbox and CONTAIN the
//     dataset extent, or the §HEIGHT-STAMP-BUDGET preflight holds ground the portal cannot serve.
//
// LAYERING: a build/inspection tool test, like its siblings — no OTel span (P8 applies to exported
// package functions, not bake tooling).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    AU_OPEN_CITY_BBOXES, AU_OPEN_HEIGHTS, AU_OPEN_HEIGHTS_ASSESSED, auOpenExportUrl, auOpenHeightForFootprint,
    auOpenJurisdictionForPoint, odsComponents, parseOdsGeojson, pointInRing,
} from '../heights/auOpenHeights.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
type Bbox = [number, number, number, number];
const J = AU_OPEN_HEIGHTS.melbourne_cc;

/** bake.mjs ALL_REGIONS rows (the `name: … bbox: 'w,s,e,n'` shape), read as TEXT (bake.mjs runs main() on import). */
function bakeRegionBboxes(): Map<string, Bbox> {
    const src = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
    const out = new Map<string, Bbox>();
    const re = /\{\s*name:\s*'([a-z]+)'\s*,\s*pbfUrl:[^}]*?bbox:\s*'(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)'/g;
    for (const m of src.matchAll(re)) out.set(m[1]!, [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])]);
    return out;
}
const covers = (outer: Bbox, inner: Bbox) =>
    outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];

// VERBATIM live export features, 2026-09-05, exports/geojson over the Eureka block
// in_bbox(geo_point_2d,-37.8222,144.9638,-37.8210,144.9654) (25 features; the 815210 stack + 802800 + 803606
// reproduced with their real properties; rings shortened to their bounding rectangles so the fixture stays
// readable — every elevation, id and centroid is the served value).
const rect = (w: number, s: number, e: number, n: number) => [[w, s], [e, s], [e, n], [w, n], [w, s]];
const feat = (props: Record<string, unknown>, ring: number[][]) =>
    ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: props });
// The tower + podium block: encloses every 815210 centroid (lon 144.96450–144.96461, lat −37.82156…−37.82167) and
// NOTHING else — 802800 (144.96500) and 803606 (144.96419, −37.82200) sit outside, the Bridge (144.9648) too.
const EUREKA_RING = rect(144.9644, -37.8218, 144.96475, -37.8215);
const PODIUM_ONLY = rect(144.9645, -37.8217, 144.9647, -37.8216);   // encloses ONLY the 7.5 m / 28 m podium components
const LIVE_EXPORT = {
    type: 'FeatureCollection',
    features: [
        feat({ geo_point_2d: { lon: 144.9645439945465, lat: -37.821582189196754 }, structure_id: '815210', footprint_type: 'Structure', roof_type: 'Flat', footprint_max_elevation: 299.5, footprint_min_elevation: 293.5, structure_max_elevation: 299.5, structure_min_elevation: 2, footprint_extrusion: 6, structure_extrusion: 297.5, date_captured: '20180528' }, rect(144.96450, -37.82160, 144.96458, -37.82156)),
        feat({ geo_point_2d: { lon: 144.96454409552072, lat: -37.82158054399819 }, structure_id: '815210', footprint_type: 'Structure', roof_type: 'Flat', footprint_max_elevation: 293.5, footprint_min_elevation: 209, structure_max_elevation: 299.5, structure_min_elevation: 2, footprint_extrusion: 84.5, structure_extrusion: 291.5, date_captured: '20180528' }, rect(144.96450, -37.82160, 144.96458, -37.82156)),
        feat({ geo_point_2d: { lon: 144.96460348221405, lat: -37.82156556133318 }, structure_id: '815210', footprint_type: 'Structure', roof_type: 'Flat', footprint_max_elevation: 209, footprint_min_elevation: 180.5, structure_max_elevation: 299.5, structure_min_elevation: 2, footprint_extrusion: 28.5, structure_extrusion: 207, date_captured: '20180528' }, rect(144.96455, -37.82159, 144.96465, -37.82154)),
        feat({ geo_point_2d: { lon: 144.9645453625207, lat: -37.82158050864467 }, structure_id: '815210', footprint_type: 'Structure', roof_type: 'Flat', footprint_max_elevation: 180.5, footprint_min_elevation: 33.5, structure_max_elevation: 299.5, structure_min_elevation: 2, footprint_extrusion: 147, structure_extrusion: 178.5, date_captured: '20180528' }, rect(144.96450, -37.82160, 144.96458, -37.82156)),
        feat({ geo_point_2d: { lon: 144.96455284442777, lat: -37.82159163909156 }, structure_id: '815210', footprint_type: 'Structure', roof_type: 'Flat', footprint_max_elevation: 33.5, footprint_min_elevation: 28, structure_max_elevation: 299.5, structure_min_elevation: 2, footprint_extrusion: 5.5, structure_extrusion: 31.5, date_captured: '20180528' }, rect(144.96450, -37.82162, 144.96460, -37.82156)),
        feat({ geo_point_2d: { lon: 144.9645425766314, lat: -37.82164630686978 }, structure_id: '815210', footprint_type: 'Structure', roof_type: 'Flat', footprint_max_elevation: 28, footprint_min_elevation: 25, structure_max_elevation: 299.5, structure_min_elevation: 2, footprint_extrusion: 3, structure_extrusion: 26, date_captured: '20180528' }, rect(144.96448, -37.82170, 144.96462, -37.82160)),
        feat({ geo_point_2d: { lon: 144.96455317842998, lat: -37.82167483657514 }, structure_id: '815210', footprint_type: 'Structure', roof_type: 'Flat', footprint_max_elevation: 7.5, footprint_min_elevation: 2, structure_max_elevation: 299.5, structure_min_elevation: 2, footprint_extrusion: 5.5, structure_extrusion: 5.5, date_captured: '20180528' }, rect(144.96448, -37.82172, 144.96462, -37.82162)),
        feat({ geo_point_2d: { lon: 144.96499951283505, lat: -37.82172532165373 }, structure_id: '802800', footprint_type: 'Structure', roof_type: 'Flat', footprint_max_elevation: 36.5, footprint_min_elevation: 33.5, structure_max_elevation: 36.5, structure_min_elevation: 3, footprint_extrusion: 3, structure_extrusion: 33.5, date_captured: '20180528' }, rect(144.96495, -37.82176, 144.96505, -37.82169)),
        feat({ geo_point_2d: { lon: 144.9641925830122, lat: -37.821999611652885 }, structure_id: '803606', footprint_type: 'Structure', roof_type: 'Flat', footprint_max_elevation: 22.5, footprint_min_elevation: 17.5, structure_max_elevation: 25, structure_min_elevation: 2.5, footprint_extrusion: 5, structure_extrusion: 20, date_captured: '20180528' }, rect(144.96415, -37.82203, 144.96424, -37.82197)),
        // a Bridge feature planted INSIDE the Eureka block — a `footprint_type` the dataset really serves (214 of them)
        feat({ geo_point_2d: { lon: 144.9648, lat: -37.8215 }, structure_id: '999001', footprint_type: 'Bridge', roof_type: null, footprint_max_elevation: 12, footprint_min_elevation: 2, structure_max_elevation: 12, structure_min_elevation: 2, footprint_extrusion: 10, structure_extrusion: 10, date_captured: '20180528' }, rect(144.9647, -37.8216, 144.9649, -37.8214)),
    ],
};

describe('§AU-OPEN-HEIGHTS — export URL', () => {
    it('emits ODSQL in_bbox in LAT,LON order over the uncapped /exports/geojson endpoint (the live-verified shape)', () => {
        // Verified 2026-09-05: in_bbox(geo_point_2d,-37.8160,144.9600,-37.8110,144.9680) → 1,097 features.
        const url = auOpenExportUrl(J, [144.96, -37.816, 144.968, -37.811]);
        expect(url.startsWith(`${J.dataset}/exports/geojson?where=`)).toBe(true);
        expect(decodeURIComponent(url)).toContain('in_bbox(geo_point_2d,-37.816000,144.960000,-37.811000,144.968000)');
        expect(decodeURIComponent(url)).toContain('select=geo_point_2d,structure_id,footprint_type');
        expect(url).not.toMatch(/\/records\?/); // the paged endpoint refuses offset+limit > 10,000 — never the stamp's channel
    });
    it('never emits the lon,lat order that silently returns an empty ocean', () => {
        expect(decodeURIComponent(auOpenExportUrl(J, [144.96, -37.816, 144.968, -37.811]))).not.toContain('in_bbox(geo_point_2d,144.96');
    });
    it('pads the cell symmetrically so an edge component is still seen', () => {
        const url = decodeURIComponent(auOpenExportUrl(J, [144.96, -37.82, 144.97, -37.81], { padDeg: 0.0005 }));
        expect(url).toContain('in_bbox(geo_point_2d,-37.820500,144.959500,-37.809500,144.970500)');
    });
});

describe('§AU-OPEN-HEIGHTS — parseOdsGeojson keeps failure ≠ empty', () => {
    it('returns null (never an empty collection) for an error JSON, an HTML page, an empty body, no body', () => {
        expect(parseOdsGeojson('{"error_code":"InvalidRESTParameterError","message":"..."}')).toBeNull();
        expect(parseOdsGeojson('<html><body>502</body></html>')).toBeNull();
        expect(parseOdsGeojson('')).toBeNull();
        expect(parseOdsGeojson(undefined as unknown as string)).toBeNull();
    });
    it('returns the collection — including a genuinely EMPTY one, which is a real answer', () => {
        const fc = parseOdsGeojson('{"type":"FeatureCollection","features":[]}');
        expect(fc).not.toBeNull();
        expect(fc!.features).toHaveLength(0);
    });
});

describe('§AU-OPEN-HEIGHTS — components from the live export', () => {
    const comps = odsComponents(LIVE_EXPORT, J);
    it('keeps Structure features only (the Bridge is dropped), with the portal centroid and numeric elevations', () => {
        expect(comps).toHaveLength(9);
        expect(comps.every((c) => c.type === 'Structure')).toBe(true);
        const top = comps.find((c) => c.structureId === '815210' && c.footprintMax === 299.5)!;
        expect(top.cx).toBeCloseTo(144.9645439945465, 9);
        expect(top.structureMin).toBe(2);
        expect(top.structureExtrusion).toBe(297.5);
    });
    it('never coerces a null elevation to 0', () => {
        const c = odsComponents({ type: 'FeatureCollection', features: [feat({ structure_id: 'x', footprint_type: 'Structure', footprint_max_elevation: null, structure_min_elevation: null, structure_extrusion: 12.5 }, EUREKA_RING)] }, J);
        expect(c[0]!.footprintMax).toBeNull();
        expect(c[0]!.structureMin).toBeNull();
        expect(c[0]!.structureExtrusion).toBe(12.5);
    });
});

describe('§AU-OPEN-HEIGHTS — the height rule (component stack → ONE metre)', () => {
    const comps = odsComponents(LIVE_EXPORT, J);
    it('Eureka Tower: a footprint containing the component stack (7 of the live 11 reproduced here) reads 297.5 m = max(footprint_max) − min(structure_min)', () => {
        const h = auOpenHeightForFootprint(EUREKA_RING, [], 144.9646, -37.8216, comps, J);
        expect(h).not.toBeNull();
        expect(h!.height).toBe(297.5);
        expect(h!.matched).toBe(7);                      // the 7 Eureka components; 802800/803606 sit outside the ring
        expect(h!.rule).toBe('centroid-in · max(footprint_max)−min(structure_min)');
    });
    it('a footprint enclosing ONLY the podium components gets the podium top (28 − 2 = 26 m), never the tower', () => {
        const h = auOpenHeightForFootprint(PODIUM_ONLY, [], 144.9646, -37.82165, comps, J);
        expect(h).not.toBeNull();
        expect(h!.height).toBe(26);
        expect(h!.matched).toBe(2);
    });
    it('a Bridge inside the footprint contributes nothing (it was never a component)', () => {
        // encloses the Bridge centroid (144.9648, −37.8215) and no Structure centroid; its own centroid lies in no Structure ring
        const onlyBridgeRing = rect(144.96470, -37.82160, 144.96490, -37.82140);
        expect(auOpenHeightForFootprint(onlyBridgeRing, [], 144.9648, -37.8215, comps, J)).toBeNull();
    });
    it('falls back to the component that CONTAINS the OSM centroid when no component centroid is inside', () => {
        // inside 802800's ring (144.96495–144.96505 × −37.82176…−37.82169) but its centroid (144.96500, −37.82173) is NOT inside `tiny`
        const tiny = rect(144.96497, -37.82174, 144.96499, -37.82172);
        const h = auOpenHeightForFootprint(tiny, [], 144.96498, -37.82173, comps, J);
        expect(h).not.toBeNull();
        expect(h!.height).toBe(33.5);
        expect(h!.rule).toBe('contains-centroid · max(footprint_max)−min(structure_min)');
    });
    it('a hole excludes the components under it', () => {
        const hole = rect(144.9644, -37.8218, 144.9647, -37.8215);           // covers every 815210 centroid
        const h = auOpenHeightForFootprint(EUREKA_RING, [hole], 144.9641, -37.8220, comps, J);
        expect(h).toBeNull();                                                // nothing left inside; centroid is outside every ring
    });
    it('uses max(structure_extrusion) when elevations are null, and refuses implausible values', () => {
        const nullElev = odsComponents({ type: 'FeatureCollection', features: [
            feat({ geo_point_2d: { lon: 144.9646, lat: -37.8216 }, structure_id: 'a', footprint_type: 'Structure', footprint_max_elevation: null, structure_min_elevation: null, structure_extrusion: 41 }, rect(144.9645, -37.8217, 144.9647, -37.8215)),
        ] }, J);
        expect(auOpenHeightForFootprint(EUREKA_RING, [], 144.9646, -37.8216, nullElev, J)!.rule).toBe('centroid-in · max(structure_extrusion)');
        expect(auOpenHeightForFootprint(EUREKA_RING, [], 144.9646, -37.8216, nullElev, J)!.height).toBe(41);
        const slab = odsComponents({ type: 'FeatureCollection', features: [
            feat({ geo_point_2d: { lon: 144.9646, lat: -37.8216 }, structure_id: 'b', footprint_type: 'Structure', footprint_max_elevation: 2.4, structure_min_elevation: 2.0, structure_extrusion: 0.4 }, rect(144.9645, -37.8217, 144.9647, -37.8215)),
        ] }, J);
        expect(auOpenHeightForFootprint(EUREKA_RING, [], 144.9646, -37.8216, slab, J)).toBeNull();          // 0.4 m < minPlausibleM
        const absurd = odsComponents({ type: 'FeatureCollection', features: [
            feat({ geo_point_2d: { lon: 144.9646, lat: -37.8216 }, structure_id: 'c', footprint_type: 'Structure', footprint_max_elevation: 9999, structure_min_elevation: 2.0, structure_extrusion: 9997 }, rect(144.9645, -37.8217, 144.9647, -37.8215)),
        ] }, J);
        expect(auOpenHeightForFootprint(EUREKA_RING, [], 144.9646, -37.8216, absurd, J)).toBeNull();        // > maxPlausibleM
    });
    it('pointInRing: inside, outside, and on the boundary', () => {
        const r = rect(0, 0, 2, 2);
        expect(pointInRing(1, 1, r)).toBe(true);
        expect(pointInRing(3, 1, r)).toBe(false);
        expect(pointInRing(0, 1, r)).toBe(true);
    });
});

describe('§AU-OPEN-HEIGHTS — the VERBATIM live export (fixtures/au-melbourne-lod1-eureka-2026-09-05.json, untouched bytes)', () => {
    // curl 2026-09-05 12:56 UTC+1 — HTTP 200, 29,945 B, application/json, 1.75 s:
    //   …/2023-building-footprints/exports/geojson?where=in_bbox(geo_point_2d,-37.8222,144.9638,-37.8210,144.9654)&select=<the adapter's selectFields>
    // Five structures in the block; every number below was computed from the served rings/centroids, not typed from memory.
    const live = parseOdsGeojson(readFileSync(resolve(HERE, 'fixtures/au-melbourne-lod1-eureka-2026-09-05.json'), 'utf8'));
    const comps = odsComponents(live!, J);
    const bboxRingOf = (cs: ReturnType<typeof odsComponents>) => {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const c of cs) for (const [x, y] of c.ring) { x0 = Math.min(x0, x!); y0 = Math.min(y0, y!); x1 = Math.max(x1, x!); y1 = Math.max(y1, y!); }
        return { ring: rect(x0, y0, x1, y1), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
    };
    it('decodes: 25 features, all `Structure`, five structure_ids, the adapter select fields verbatim', () => {
        expect(live).not.toBeNull();
        expect(live!.features).toHaveLength(25);
        expect(comps).toHaveLength(25);
        expect(new Set(comps.map((c) => c.structureId))).toEqual(new Set(['815210', '802800', '808676', '803606', '800312']));
        expect(Object.keys(live!.features[0]!.properties)).toEqual(J.selectFields);
    });
    it('Eureka Tower 815210 is served as ELEVEN components sharing structure_min 2.0, and collapses to 297.5 m', () => {
        const e = comps.filter((c) => c.structureId === '815210');
        expect(e).toHaveLength(11);
        expect(e.every((c) => c.structureMin === 2)).toBe(true);
        expect(e.map((c) => c.footprintMax).sort((a, b) => a! - b!)).toEqual([7.5, 11.5, 15, 25, 26.5, 28, 33.5, 180.5, 209, 293.5, 299.5]);
        const { ring, cx, cy } = bboxRingOf(e);
        const own = auOpenHeightForFootprint(ring, [], cx, cy, e, J);
        expect(own).toEqual({ height: 297.5, matched: 11, rule: 'centroid-in · max(footprint_max)−min(structure_min)' });
        // the same footprint against the WHOLE block still reads 297.5 — the bbox ring also encloses 6 neighbour
        // centroids (17 matched) whose tops are lower; max() is unaffected, min(structure_min) stays 2.0
        const all = auOpenHeightForFootprint(ring, [], cx, cy, comps, J);
        expect(all!.height).toBe(297.5);
        expect(all!.matched).toBe(17);
    });
    it('each neighbour structure reads its own stack height (802800 → 33.5 · 808676 → 42.5 · 803606 → 22.5 · 800312 → 13.5)', () => {
        for (const [id, height, n] of [['802800', 33.5, 6], ['808676', 42.5, 3], ['803606', 22.5, 4], ['800312', 13.5, 1]] as const) {
            const cs = comps.filter((c) => c.structureId === id);
            expect(cs, id).toHaveLength(n);
            const { ring, cx, cy } = bboxRingOf(cs);
            expect(auOpenHeightForFootprint(ring, [], cx, cy, cs, J)?.height, id).toBe(height);
        }
    });
});

describe('§AU-OPEN-CITY-BBOXES — the victoria row working set', () => {
    it('routes a Melbourne point to melbourne_cc and a Sydney / Canberra point to nothing', () => {
        expect(auOpenJurisdictionForPoint(144.9631, -37.8136)?.jurisdiction).toBe('melbourne_cc');
        expect(auOpenJurisdictionForPoint(151.2093, -33.8688)).toBeNull();
        expect(auOpenJurisdictionForPoint(149.1300, -35.2809)).toBeNull();
    });
    it('every working-set row names a jurisdiction in the adapter table and lies inside the bake.mjs `victoria` row', () => {
        const bake = bakeRegionBboxes();
        const victoria = bake.get('victoria');
        expect(victoria, 'bake.mjs victoria row').toBeDefined();
        for (const c of AU_OPEN_CITY_BBOXES) {
            expect(AU_OPEN_HEIGHTS[c.jurisdiction as keyof typeof AU_OPEN_HEIGHTS], c.city).toBeDefined();
            expect(covers(victoria!, c.bbox as Bbox), `${c.city} inside victoria`).toBe(true);
        }
    });
    it('melbourne CONTAINS the dataset extent the portal reported (144.898–144.991 E, −37.851–−37.776 S)', () => {
        const m = AU_OPEN_CITY_BBOXES.find((c) => c.city === 'melbourne')!;
        expect(covers(m.bbox as Bbox, [144.8983391560614, -37.85053993575275, 144.9909464456141, -37.77566783130169])).toBe(true);
    });
    it('the states with NO real channel are recorded as PROBED verdicts, never blanks', () => {
        const byJ = new Map(AU_OPEN_HEIGHTS_ASSESSED.map((a) => [a.jurisdiction, a]));
        expect(byJ.get('act')?.status).toBe('no-height-attribute');
        expect(byJ.get('act')?.evidence).toMatch(/ACTGOV_BUILDING_FOOTPRINTS/);
        expect(byJ.get('elvis')?.status).toBe('bulk-portal-not-raster-api');
        for (const a of AU_OPEN_HEIGHTS_ASSESSED) expect(a.evidence.length, a.jurisdiction).toBeGreaterThan(40);
    });
});
