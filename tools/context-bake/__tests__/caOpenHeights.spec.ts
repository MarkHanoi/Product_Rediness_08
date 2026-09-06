// §CA-OPEN-HEIGHTS (2026-09-06, lane MEXICO-CANADA) — the Canadian per-jurisdiction open-height
// stamp's DECISIONS, unit-tested against VERBATIM live fixtures. `heights/caOpenHeights.mjs` is the
// pure half (adapter table, request URL, element parser, the height rule, the truncation rule, the
// working set); the network/stream half in heights/caOpenHeightsStamp.mjs imports heightSources.mjs,
// which vitest cannot load (see mdsBboxCoversTerrainRegion.spec.ts) — which is precisely why the
// decisions were pulled out.
//
// WHAT EACH TEST PINS, and why it earned a test rather than a comment:
//   • BOTH axis orders in one file — ODSQL `in_bbox(field, lat1, lon1, lat2, lon2)` is LAT,LON while
//     ArcGIS `geometry={xmin,ymin,xmax,ymax}` is LON,LAT. This is the ONE join with both conventions
//     in the same module, so a copy-paste between its two builders is the single most likely defect.
//     Neither wrong order ERRORS: both return an empty collection over the wrong hemisphere, every
//     cell reads "empty", the join reports 0 measured heights, and the §MEASURED-HEIGHT-GATE fails a
//     bake for a reason nobody can see.
//   • ⛔ TRUNCATION — Toronto caps at maxRecordCount 2000 and a 0.04° downtown box really does return
//     2000 of 18,358 with `exceededTransferLimit: true`. If that read as a complete answer the join
//     would stamp 11% and leave the rest at a fabricated 9 m, silently, on an HTTP 200. This is the
//     defect §BDTOPO-CAP-TRUNCATE is named after, and it is the reason `caOpenIsTruncated` exists.
//   • THE PER-BUILDING AGGREGATE MUST NOT WIN — Vancouver's own record for bldgid 145738 carries
//     element hgt_agl 21.88 m under maxht_m 143.12 m (the tower attached to that podium). A rule that
//     reached for the convenient field would draw a 143 m podium on a real street.
//   • parseCaGeojson returns null (never an empty collection) for a non-GeoJSON body — the
//     failure-vs-empty split (§CONTEXT-DATA-HONESTY) at the exact point where "the portal refused us"
//     could become "nothing built here" and silently void a covered cell.
//   • non-building types — Toronto's "Miscellaneous Structure" is a canopy/shed in the SAME layer and
//     must never stamp its height onto a building whose footprint contains it.
//   • the working sets — each city bbox must lie INSIDE its bake.mjs province row and, for Vancouver,
//     CONTAIN the dataset's own probed extent, or the §HEIGHT-STAMP-BUDGET preflight holds ground the
//     portal cannot serve.
//
// LAYERING: a build/inspection tool test, like its siblings — no OTel span (P8 applies to exported
// package functions, not bake tooling).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    CA_OPEN_CITY_BBOXES, CA_OPEN_HEIGHTS, CA_OPEN_HEIGHTS_ASSESSED, caElements, caOpenHeightForFootprint,
    caOpenIsTruncated, caOpenJurisdictionForPoint, caOpenRequestUrl, parseCaGeojson, pointInRing,
} from '../heights/caOpenHeights.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
type Bbox = [number, number, number, number];
const VAN = CA_OPEN_HEIGHTS.vancouver_cov;
const TOR = CA_OPEN_HEIGHTS.toronto_cot;

/** bake.mjs ALL_REGIONS rows (the `name: … bbox: 'w,s,e,n'` shape), read as TEXT (bake.mjs runs main() on import). */
function bakeRegionBboxes(): Map<string, Bbox> {
    const src = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
    const out = new Map<string, Bbox>();
    const re = /\{\s*name:\s*'([a-z]+)'\s*,\s*pbfUrl:[^}]*?bbox:\s*'(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)'/g;
    for (const m of src.matchAll(re)) out.set(m[1]!, [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])]);
    return out;
}
const fixture = (name: string) => JSON.parse(readFileSync(resolve(HERE, 'fixtures', name), 'utf8'));

describe('§CA-OPEN-HEIGHTS — the adapter table', () => {
    it('declares exactly the two jurisdictions that were PROBED live, each pointing at its own bake province', () => {
        expect(Object.keys(CA_OPEN_HEIGHTS).sort()).toEqual(['toronto_cot', 'vancouver_cov']);
        expect(VAN.region).toBe('britishcolumbia');
        expect(TOR.region).toBe('ontario');
        // Keyless: neither endpoint may carry a key/token placeholder.
        expect(VAN.dataset).not.toMatch(/key|token|apikey/i);
        expect(TOR.layer).not.toMatch(/key|token|apikey/i);
    });

    it('records the Canadian sources it did NOT wire, with evidence — a probed verdict, never a blank', () => {
        const ids = CA_OPEN_HEIGHTS_ASSESSED.map((a: { jurisdiction: string }) => a.jurisdiction);
        // Montréal is the one that hurts: real 1 m LiDAR MNS, CC BY 4.0, but bulk-only.
        expect(ids).toContain('montreal_vdm');
        for (const a of CA_OPEN_HEIGHTS_ASSESSED as { status: string; evidence: string }[]) {
            expect(a.status).toBeTruthy();
            expect(a.evidence.length).toBeGreaterThan(40);
        }
    });
});

describe('§CA-OPEN-HEIGHTS — request URLs, the two axis orders', () => {
    it('Vancouver (ODSQL) writes in_bbox as LAT,LON — the swapped order silently returns an empty ocean', () => {
        const url = caOpenRequestUrl(VAN, [-123.1220, 49.2810, -123.1190, 49.2830]);
        const where = decodeURIComponent(new URL(url).searchParams.get('where')!);
        expect(where).toBe('in_bbox(geo_point_2d,49.281000,-123.122000,49.283000,-123.119000)');
        expect(url).toContain('/exports/geojson'); // the UNCAPPED endpoint, not /records
    });

    it('Toronto (ArcGIS) writes geometry as LON,LAT in an envelope with an explicit WGS84 wkid', () => {
        const url = caOpenRequestUrl(TOR, [-79.3870, 43.6440, -79.3850, 43.6460]);
        const geom = JSON.parse(decodeURIComponent(new URL(url).searchParams.get('geometry')!));
        expect(geom).toEqual({ xmin: -79.387, ymin: 43.644, xmax: -79.385, ymax: 43.646, spatialReference: { wkid: 4326 } });
        expect(url).toContain('f=geojson');
        expect(url).toContain('returnGeometry=true'); // without rings nothing can be matched to a footprint
    });

    it('pads both builders outward by padDeg, so an element just across a cell edge is still seen', () => {
        const w = decodeURIComponent(new URL(caOpenRequestUrl(VAN, [-123.12, 49.28, -123.11, 49.29], { padDeg: 0.001 })).searchParams.get('where')!);
        expect(w).toBe('in_bbox(geo_point_2d,49.279000,-123.121000,49.291000,-123.109000)');
        const g = JSON.parse(decodeURIComponent(new URL(caOpenRequestUrl(TOR, [-79.40, 43.64, -79.39, 43.65], { padDeg: 0.001 })).searchParams.get('geometry')!));
        expect(g.xmin).toBeCloseTo(-79.401, 6);
        expect(g.ymax).toBeCloseTo(43.651, 6);
    });

    it('refuses an unknown kind loudly rather than building a URL nobody can debug', () => {
        expect(() => caOpenRequestUrl({ ...VAN, kind: 'not-a-kind' }, [0, 0, 1, 1])).toThrow(/unknown kind/);
    });
});

describe('§CONTEXT-DATA-HONESTY — failure, empty and TRUNCATED are three different values', () => {
    it('parseCaGeojson returns null for a non-GeoJSON body (a FAILURE), and the collection for a real EMPTY', () => {
        expect(parseCaGeojson('<html>502</html>')).toBeNull();
        expect(parseCaGeojson('{"error":{"code":400}}')).toBeNull();
        expect(parseCaGeojson('')).toBeNull();
        expect(parseCaGeojson('{"type":"FeatureCollection","features":[]}')).toEqual({ type: 'FeatureCollection', features: [] });
    });

    it('⛔ calls an ArcGIS answer TRUNCATED when the server says so — the 2000-of-18,358 case', () => {
        // The LIVE shape, measured 2026-09-06: HTTP 200, 2000 features, exceededTransferLimit true,
        // while returnCountOnly on the same box answered {"count":18358}.
        const truncated = { type: 'FeatureCollection', features: new Array(2000).fill({}), exceededTransferLimit: true };
        expect(caOpenIsTruncated(truncated, TOR)).toBe(true);
    });

    it('⛔ also calls it TRUNCATED when the count lands exactly on the declared cap and the flag is absent', () => {
        // An older/other ArcGIS build truncates without the flag; landing exactly on maxRecordCount is
        // the tell. Treating that as complete is how the join would stamp a fraction and say nothing.
        expect(caOpenIsTruncated({ type: 'FeatureCollection', features: new Array(TOR.maxRecordCount).fill({}) }, TOR)).toBe(true);
        expect(caOpenIsTruncated({ type: 'FeatureCollection', features: new Array(TOR.maxRecordCount - 1).fill({}) }, TOR)).toBe(false);
    });

    it('never calls the UNCAPPED Vancouver export truncated — it declares no maxRecordCount', () => {
        expect(VAN.maxRecordCount).toBeUndefined();
        expect(caOpenIsTruncated({ type: 'FeatureCollection', features: new Array(9999).fill({}) }, VAN)).toBe(false);
    });
});

describe('§CA-OPEN-HEIGHTS — Vancouver, the 2026-09-06 verbatim export fixture', () => {
    const fc = fixture('ca-vancouver-lidar2009-2026-09-06.json');

    it('is the export this adapter asks for: a FeatureCollection of LiDAR elements with the fields the rule reads', () => {
        expect(fc.type).toBe('FeatureCollection');
        expect(fc.features.length).toBe(41);
        const p = fc.features[0].properties;
        for (const f of ['bldgid', 'topelev_m', 'baseelev_m', 'hgt_agl', 'maxht_m']) expect(p).toHaveProperty(f);
    });

    it('parses every element with its OWN top/base — and hgt_agl really is top − base, as the portal states', () => {
        const els = caElements(fc, VAN);
        expect(els.length).toBe(41);
        for (const e of els.slice(0, 10)) {
            expect(e.top).not.toBeNull();
            expect(e.base).not.toBeNull();
            expect(e.top! - e.base!).toBeCloseTo(e.agl!, 2);
        }
    });

    it('⭐ takes the ELEMENT stack, never the per-building aggregate: bldgid 145738 is 21.9 m, not maxht_m 143.12 m', () => {
        const els = caElements(fc, VAN);
        const podium = els.find((e) => e.id === '145738')!;
        expect(podium).toBeDefined();
        // The fixture's own numbers: element hgt_agl 21.88 under a maxht_m of 143.12 for the same bldgid.
        expect(podium.agl).toBeCloseTo(21.88, 2);
        // A footprint drawn tightly around that element must get the ELEMENT height.
        const ring = ringAround(podium.cx, podium.cy, 0.00012);
        const h = caOpenHeightForFootprint(ring, [], podium.cx, podium.cy, els, VAN)!;
        expect(h).not.toBeNull();
        expect(h.height).toBeGreaterThan(15);
        expect(h.height).toBeLessThan(40); // ⛔ 143.12 would land here if the aggregate ever won
    });

    it('collapses a multi-element building to max(top) − min(base) — bldgid 146765 has three elements', () => {
        const els = caElements(fc, VAN);
        const stack = els.filter((e) => e.id === '146765');
        expect(stack.length).toBeGreaterThanOrEqual(3);
        // A footprint covering the whole stack: the union box of its element centroids.
        const xs = stack.map((e) => e.cx), ys = stack.map((e) => e.cy);
        const ring = boxRing(Math.min(...xs) - 1e-4, Math.min(...ys) - 1e-4, Math.max(...xs) + 1e-4, Math.max(...ys) + 1e-4);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        const h = caOpenHeightForFootprint(ring, [], cx, cy, els, VAN)!;
        expect(h.rule).toContain('max(top)−min(base)');
        const expected = Math.max(...stack.map((e) => e.top!)) - Math.min(...stack.map((e) => e.base!));
        expect(h.height).toBeCloseTo(Number(expected.toFixed(1)), 1);
    });
});

describe('§CA-OPEN-HEIGHTS — Toronto, the 2026-09-06 verbatim query fixture', () => {
    const fc = fixture('ca-toronto-derivedheight-2026-09-06.json');

    it('is a complete (NOT truncated) answer carrying real metres and real rings', () => {
        expect(fc.type).toBe('FeatureCollection');
        expect(fc.features.length).toBe(49);
        expect(caOpenIsTruncated(fc, TOR)).toBe(false);
        expect(fc.features.every((f: { geometry: { type: string } }) => f.geometry?.type === 'Polygon')).toBe(true);
    });

    it('derives each element base/top from ELEVATION + DERIVED_HEIGHT (the layer publishes no top field)', () => {
        const els = caElements(fc, TOR);
        expect(els.length).toBeGreaterThan(0);
        for (const e of els.slice(0, 10)) {
            expect(e.agl).not.toBeNull();
            expect(e.top! - e.base!).toBeCloseTo(e.agl!, 3);
        }
    });

    // ⚠ THE EXCLUSION RULE GETS ITS OWN FIXTURE, and the reason is a defect this file already caught
    // once: the first draft asserted "Miscellaneous Structure" against THIS fixture because a WIDER
    // earlier probe (144 features) had contained some. The saved 0.002° financial-district cell has
    // 49 features and every one is a Building Outline, so the assertion failed — a test written from
    // a remembered response instead of the bytes on disk. The mixed fixture below was captured for it.
    it('collapses the BUILDINGID 461080 element stack (9 elements, 32.31 → 178.49 m) to ONE metre', () => {
        const els = caElements(fc, TOR);
        const stack = els.filter((e) => e.id === '461080');
        expect(stack.length).toBe(9);
        const xs = stack.map((e) => e.cx), ys = stack.map((e) => e.cy);
        const ring = boxRing(Math.min(...xs) - 1e-4, Math.min(...ys) - 1e-4, Math.max(...xs) + 1e-4, Math.max(...ys) + 1e-4);
        const h = caOpenHeightForFootprint(ring, [], (Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, els, TOR)!;
        expect(h).not.toBeNull();
        expect(h.rule).toContain('max(top)−min(base)');
        const matched = els.filter((e) => pointInRing(e.cx, e.cy, ring));
        const expected = Math.max(...matched.map((e) => e.top!)) - Math.min(...matched.map((e) => e.base!));
        expect(h.height).toBeCloseTo(Number(expected.toFixed(1)), 1);
        expect(h.height).toBeGreaterThan(150); // a real Bay Street tower, not the 32 m podium alone
    });

    it('EXCLUDES "Miscellaneous Structure" — a canopy in the SAME layer must never become a building height', () => {
        // Verbatim 2026-09-06 capture over -79.3805,43.6440,-79.3785,43.6458 (HTTP 200, 48,217 B,
        // 43 features): 41 Building Outline + 2 Miscellaneous Structure, one of which carries
        // DERIVED_HEIGHT null — both an excluded TYPE and an absent value, in real bytes.
        const mixed = fixture('ca-toronto-mixedsubtype-2026-09-06.json');
        const misc = mixed.features.filter((f: { properties: Record<string, unknown> }) => f.properties.SUBTYPE_DESC === 'Miscellaneous Structure');
        expect(misc.length).toBe(2);
        expect(misc.some((f: { properties: { DERIVED_HEIGHT: number | null } }) => f.properties.DERIVED_HEIGHT === null)).toBe(true);
        const els = caElements(mixed, TOR);
        expect(els.every((e) => e.type === 'Building Outline')).toBe(true);
        expect(els.length).toBe(mixed.features.length - misc.length);
        // ⚠ AND THE ASSERTION THAT MATTERS IS ABOUT THE ELEMENT, NOT ABOUT A HEIGHT. A first draft
        // asserted that a footprint drawn around the canopy gets NO height, and it FAILED — correctly:
        // canopy 461051 shares its BUILDINGID with 16 real Building Outline elements of the same
        // building, so that footprint legitimately reads 48.0 m from THEM. The canopy did not
        // contribute; the test was measuring the wrong thing. What must hold is that the excluded
        // features never enter the element set at all, so their 21.03 m (and their null) can never be
        // the value a footprint inherits.
        const key = (r: number[][]) => `${r[0]![0]},${r[0]![1]}`;
        const excluded = new Set(misc.map((f: { geometry: { coordinates: number[][][] } }) => key(f.geometry.coordinates[0]!)));
        expect(els.some((e) => excluded.has(key(e.ring)))).toBe(false);
    });

    it('returns null — never a neighbour height and never a default — for a footprint nothing matches', () => {
        const els = caElements(fc, TOR);
        const far = boxRing(-79.20, 43.80, -79.199, 43.801); // Scarborough, far outside the fixture cell
        expect(caOpenHeightForFootprint(far, [], -79.1995, 43.8005, els, TOR)).toBeNull();
    });

    it('rejects an implausible height rather than shipping it (the plausibility band is per jurisdiction)', () => {
        const tall = [{ id: 'x', type: 'Building Outline', ring: boxRing(0, 0, 1, 1), cx: 0.5, cy: 0.5, top: 900, base: 0, agl: 900 }];
        expect(caOpenHeightForFootprint(boxRing(0, 0, 1, 1), [], 0.5, 0.5, tall, TOR)).toBeNull();
        const flat = [{ id: 'y', type: 'Building Outline', ring: boxRing(0, 0, 1, 1), cx: 0.5, cy: 0.5, top: 0.4, base: 0, agl: 0.4 }];
        expect(caOpenHeightForFootprint(boxRing(0, 0, 1, 1), [], 0.5, 0.5, flat, TOR)).toBeNull();
    });
});

describe('§HEIGHT-STAMP-BUDGET — the working sets', () => {
    const bake = bakeRegionBboxes();

    it('each city bbox lies INSIDE its own bake province row (a stamp bbox outside the clip holds nothing)', () => {
        for (const c of CA_OPEN_CITY_BBOXES as { city: string; region: string; bbox: Bbox }[]) {
            const region = bake.get(c.region);
            expect(region, `bake.mjs has no '${c.region}' row`).toBeDefined();
            const [rw, rs, re_, rn] = region!;
            const [w, s, e, n] = c.bbox;
            expect(w, c.city).toBeGreaterThanOrEqual(rw);
            expect(s, c.city).toBeGreaterThanOrEqual(rs);
            expect(e, c.city).toBeLessThanOrEqual(re_);
            expect(n, c.city).toBeLessThanOrEqual(rn);
        }
    });

    it('Vancouver CONTAINS the dataset extent the portal reported (−123.26147…−123.02368, 49.19976…49.31284)', () => {
        const van = CA_OPEN_CITY_BBOXES.find((c: { city: string }) => c.city === 'vancouver')!;
        const [w, s, e, n] = van.bbox as Bbox;
        expect(w).toBeLessThanOrEqual(-123.26147);
        expect(s).toBeLessThanOrEqual(49.19976);
        expect(e).toBeGreaterThanOrEqual(-123.02368);
        expect(n).toBeGreaterThanOrEqual(49.31284);
    });

    it('resolves a point to its jurisdiction, and to null outside every working set', () => {
        expect(caOpenJurisdictionForPoint(-123.1207, 49.2827)?.jurisdiction).toBe('vancouver_cov');
        expect(caOpenJurisdictionForPoint(-79.3832, 43.6532)?.jurisdiction).toBe('toronto_cot');
        expect(caOpenJurisdictionForPoint(-73.5674, 45.5019)).toBeNull();  // Montréal — real data, no keyless door
        expect(caOpenJurisdictionForPoint(-99.1332, 19.4326)).toBeNull();  // Mexico City — nothing wired at all
    });

    it('gives Toronto a cell small enough for its own measured density to stay under its own cap', () => {
        // 18,358 features in a 0.04°×0.04° box ⇒ ~287 in a 0.005° cell, against maxRecordCount 2000.
        const perCell = 18358 * (TOR.tileSpanDeg / 0.04) ** 2;
        expect(perCell).toBeLessThan(TOR.maxRecordCount / 2);
    });
});

describe('pointInRing — the primitive both match rules stand on', () => {
    it('counts a boundary point as inside and an outside point as outside', () => {
        const sq = boxRing(0, 0, 1, 1);
        expect(pointInRing(0.5, 0.5, sq)).toBe(true);
        expect(pointInRing(1.5, 0.5, sq)).toBe(false);
    });
});

/** A closed axis-aligned ring [[x,y],…]. */
function boxRing(w: number, s: number, e: number, n: number): number[][] {
    return [[w, s], [e, s], [e, n], [w, n], [w, s]];
}
/** A closed square ring of half-width `r` about (x, y). */
function ringAround(x: number, y: number, r: number): number[][] {
    return boxRing(x - r, y - r, x + r, y + r);
}
