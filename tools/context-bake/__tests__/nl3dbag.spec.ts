// §NL-3DBAG (2026-09-05, lane HEIGHTS-NL) — the Dutch national measured-height stamp's DECISIONS,
// unit-tested. `heights/nl3dbag.mjs` is the pure half (the WFS URL and its axis order, the attribute→
// height rule, the part builder, the city working set); the network/join half in heightSources.mjs
// cannot be imported by vitest (see mdsBboxCoversTerrainRegion.spec.ts), which is why the decisions
// were pulled out into a module that can.
//
// WHAT EACH TEST PINS, and why it earned a test rather than a comment:
//   • BBOX axis order — this GeoServer honours lon,lat for EPSG:4326. The textbook lat,lon order does
//     NOT error: it returns HTTP 200 and an EMPTY collection over the densest cell in the Netherlands
//     (numberMatched 0 vs 2,443, probed 2026-09-05), every cell reads as "no buildings", the join
//     reports 0 measured heights and the §MEASURED-HEIGHT-GATE fails for a reason nobody can see.
//   • parseNl3dbagCollection returns null (never an empty collection) on a non-GeoJSON body — the
//     failure-vs-empty split (§CONTEXT-DATA-HONESTY) at the exact point where "the service refused us"
//     could become "the cell is empty" and silently void a covered city.
//   • the height rule — 70p − maaiveld (3DBAG's own LoD1.2 extrusion, measured: roof z 22.771 m NAP vs
//     b3_h_dak_70p 22.777), 50p fallback, and the three refusals (no ground, insufficient point cloud,
//     roof ≤ ground). A NAP roof height stamped WITHOUT its ground is a fabricated building anywhere the
//     ground is above sea level.
//   • the fixture is the LIVE WFS response of 2026-09-05 (3 parts, Amsterdam Centraal cell), byte-for-byte.
//   • city bboxes — the five cities that have terrain.mjs `nl` rows must EQUAL them, so the stamped
//     heights and the baked terrain cover the same ground (§MDS-BBOX-MUST-COVER-THE-REGION).
//
// LAYERING: a build/inspection tool test, like its siblings — no OTel span (P8 applies to exported
// package functions, not bake tooling).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    NL_3DBAG, NL_3DBAG_CITY_BBOXES, nl3dbagGetFeatureUrl, nl3dbagHitsUrl, nl3dbagPartHeight,
    nl3dbagPartsFromCollection, parseNl3dbagCollection, ringAreaM2, pointInRing, interiorPoint, matchPartsToFootprint, partGrid, partInsideFraction, partSamplePoints,
} from '../heights/nl3dbag.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
type Bbox = [number, number, number, number];

/** The live GetFeature body (COUNT=3, trimmed PROPERTYNAME) over [4.89,52.37,4.90,52.38], 2026-09-05. */
const FIXTURE_PATH = resolve(HERE, 'fixtures/nl3dbag-lod12-amsterdam-2026-09-05.json');
const FIXTURE_TEXT = readFileSync(FIXTURE_PATH, 'utf8');

/** terrain.mjs REGIONS rows with source:'nl', read as TEXT (importing terrain.mjs runs main()). */
function terrainNlRegions(): Map<string, Bbox> {
    const src = readFileSync(resolve(HERE, '../terrain.mjs'), 'utf8');
    const out = new Map<string, Bbox>();
    const re = /\{\s*name:\s*'([a-z0-9-]+)'\s*,\s*source:\s*'nl'\s*,\s*bbox:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g;
    for (const m of src.matchAll(re)) out.set(m[1]!, [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])]);
    return out;
}

describe('§NL-3DBAG — GetFeature URL', () => {
    it('asks the lod12 layer for GeoJSON in EPSG:4326 with the BBOX in LON,LAT order (the live-verified shape)', () => {
        const url = nl3dbagGetFeatureUrl([4.89, 52.37, 4.90, 52.38]);
        expect(url.startsWith('https://data.3dbag.nl/api/BAG3D/wfs?')).toBe(true);
        expect(url).toContain('SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature');
        expect(url).toContain('TYPENAMES=BAG3D:lod12');
        expect(url).toContain('OUTPUTFORMAT=application%2Fjson');
        expect(url).toContain('SRSNAME=EPSG:4326');
        expect(url).toContain('BBOX=4.89,52.37,4.9,52.38,EPSG:4326');
    });

    it('never emits the lat,lon order that silently returns an empty collection', () => {
        const url = nl3dbagGetFeatureUrl([4.89, 52.37, 4.90, 52.38]);
        expect(url).not.toContain('BBOX=52.37,4.89');
    });

    it('trims PROPERTYNAME to the fields the join reads (5.7 MB → 1.9 MB per cell), geometry included', () => {
        const url = nl3dbagGetFeatureUrl([4.89, 52.37, 4.90, 52.38]);
        const m = url.match(/PROPERTYNAME=([^&]+)/);
        expect(m, 'PROPERTYNAME').not.toBeNull();
        const names = m![1]!.split(',');
        for (const need of ['identificatie', 'b3_h_70p', 'b3_h_50p', 'b3_h_maaiveld', 'b3_pw_onvoldoende', 'b3_dak_type', 'geom']) {
            expect(names, need).toContain(need);
        }
        expect(names).toEqual(NL_3DBAG.propertyNames);
        expect(nl3dbagGetFeatureUrl([4.89, 52.37, 4.90, 52.38], { trim: false })).not.toContain('PROPERTYNAME');
    });

    it('adds COUNT only when asked (a cell answers whole — CountDefault is 1,000,000)', () => {
        expect(nl3dbagGetFeatureUrl([4.89, 52.37, 4.90, 52.38])).not.toContain('COUNT=');
        expect(nl3dbagGetFeatureUrl([4.89, 52.37, 4.90, 52.38], { count: 3 })).toContain('&COUNT=3');
    });

    it('builds a hits-only query in the same lon,lat order', () => {
        const url = nl3dbagHitsUrl([4.89, 52.37, 4.90, 52.38]);
        expect(url).toContain('TYPENAMES=BAG3D:lod12');
        expect(url).toContain('BBOX=4.89,52.37,4.9,52.38,EPSG:4326');
        expect(url).toContain('RESULTTYPE=hits');
        expect(url).not.toContain('OUTPUTFORMAT');
    });
});

describe('§NL-3DBAG — response parsing keeps failure and empty apart', () => {
    it('parses the live fixture as a FeatureCollection of 3 lod12 parts (numberMatched 2,443 in the cell)', () => {
        const fc = parseNl3dbagCollection(FIXTURE_TEXT)!;
        expect(fc).not.toBeNull();
        expect(fc.features).toHaveLength(3);
        expect(fc.numberMatched).toBe(2443);
        expect(fc.numberReturned).toBe(3);
        expect(fc.crs?.properties?.name).toBe('urn:ogc:def:crs:EPSG::4326');
        expect(fc.features[0].id).toBe('lod12.6463311');
        expect(fc.features[0].geometry_name).toBe('geom');
        // Output coordinates are lon,lat (Amsterdam: lon ≈ 4.9, lat ≈ 52.38).
        const [lon, lat] = fc.features[0].geometry.coordinates[0][0];
        expect(lon).toBeCloseTo(4.90226816, 8);
        expect(lat).toBeCloseTo(52.37893797, 8);
    });

    it('a genuine empty cell is a collection with zero features — NOT null', () => {
        const fc = parseNl3dbagCollection('{"type":"FeatureCollection","features":[],"totalFeatures":0,"numberMatched":0,"numberReturned":0}');
        expect(fc).not.toBeNull();
        expect(fc!.features).toHaveLength(0);
    });

    it('returns null — never an empty collection — for an ows:ExceptionReport, an HTML page, an empty body, or no body', () => {
        expect(parseNl3dbagCollection('<?xml version="1.0"?><ows:ExceptionReport><ows:Exception exceptionCode="InvalidParameterValue" locator="typeName"><ows:ExceptionText>Feature type BAG3D:lod13_2d unknown</ows:ExceptionText></ows:Exception></ows:ExceptionReport>')).toBeNull();
        expect(parseNl3dbagCollection('<!DOCTYPE html><html><body>502 Bad Gateway</body></html>')).toBeNull();
        expect(parseNl3dbagCollection('')).toBeNull();
        expect(parseNl3dbagCollection(undefined)).toBeNull();
        expect(parseNl3dbagCollection(null)).toBeNull();
        expect(parseNl3dbagCollection('{"type":"Feature","geometry":null}')).toBeNull();
    });
});

describe('§NL-3DBAG — the attribute → height rule (70p − maaiveld, measured against 3DBAG\'s own LoD1.2)', () => {
    const fixture = JSON.parse(FIXTURE_TEXT);
    const p0 = fixture.features[0].properties; // NL.IMBAG.Pand.0363100012242112: 70p 22.121, 50p 20.822, maaiveld 0.900

    it('uses b3_h_70p − b3_h_maaiveld on the live part', () => {
        const h = nl3dbagPartHeight(p0)!;
        expect(h).not.toBeNull();
        expect(h.height).toBeCloseTo(22.1212139129639 - 0.899999976158142, 6);
        expect(h.percentile).toBe('70p');
        expect(h.roofType).toBe('slanted');
    });

    it('falls back to b3_h_50p when 70p is null, and says so', () => {
        const h = nl3dbagPartHeight({ ...p0, b3_h_70p: null })!;
        expect(h.height).toBeCloseTo(20.8224678039551 - 0.899999976158142, 6);
        expect(h.percentile).toBe('50p');
    });

    it('refuses a part with no ground height — a NAP roof without its maaiveld is a fabricated building', () => {
        expect(nl3dbagPartHeight({ ...p0, b3_h_maaiveld: null })).toBeNull();
        expect(nl3dbagPartHeight({ ...p0, b3_h_maaiveld: undefined })).toBeNull();
    });

    it('refuses a part 3DBAG itself flags as insufficient point cloud (b3_pw_onvoldoende)', () => {
        expect(nl3dbagPartHeight({ ...p0, b3_pw_onvoldoende: true })).toBeNull();
    });

    it('refuses roof ≤ ground, both heights missing, and non-objects', () => {
        expect(nl3dbagPartHeight({ ...p0, b3_h_70p: 0.5, b3_h_50p: 0.4 })).toBeNull();
        expect(nl3dbagPartHeight({ ...p0, b3_h_70p: null, b3_h_50p: null })).toBeNull();
        expect(nl3dbagPartHeight(null)).toBeNull();
        expect(nl3dbagPartHeight('x')).toBeNull();
    });

    it('does not treat b3_kwaliteitsindicator=false as a refusal (all three live parts carry it with sound heights)', () => {
        for (const f of fixture.features) {
            expect(f.properties.b3_kwaliteitsindicator).toBe(false);
            expect(nl3dbagPartHeight(f.properties)).not.toBeNull();
        }
    });

    it('drops the "unknown" roof type rather than forwarding it as a shape (part 3, Centraal: 50p = 70p = max)', () => {
        const p2 = fixture.features[2].properties;
        expect(p2.b3_dak_type).toBe('unknown');
        expect(nl3dbagPartHeight(p2)!.roofType).toBeNull();
        expect(nl3dbagPartHeight(p2)!.height).toBeCloseTo(25.4740009307861 - 2.53099989891052, 6);
    });
});

describe('§NL-3DBAG — part builder (the shape areaWeightedP90 / dominantRoof consume)', () => {
    const fc = parseNl3dbagCollection(FIXTURE_TEXT)!;
    const { parts, skipped } = nl3dbagPartsFromCollection(fc);

    it('builds one part per feature from the live fixture, none skipped', () => {
        expect(parts).toHaveLength(3);
        expect(skipped).toEqual({ noHeight: 0, noGeometry: 0 });
        expect(parts.map((p) => p.pandId)).toEqual([
            'NL.IMBAG.Pand.0363100012242112', 'NL.IMBAG.Pand.0363100012240311', 'NL.IMBAG.Pand.0363100012185598',
        ]);
    });

    it('rings are closed WGS84 [lon,lat] and centroids sit inside the probed cell', () => {
        for (const p of parts) {
            const f = p.ring[0], l = p.ring[p.ring.length - 1];
            expect(f).toEqual(l);
            expect(p.cx).toBeGreaterThan(4.89); expect(p.cx).toBeLessThan(4.91);
            expect(p.cy).toBeGreaterThan(52.37); expect(p.cy).toBeLessThan(52.39);
        }
    });

    it('areas are building-sized metres² (a canal house block, not a country and not a point)', () => {
        for (const p of parts) {
            expect(p.areaM2).toBeGreaterThan(50);
            expect(p.areaM2).toBeLessThan(200_000);
        }
        // Amsterdam Centraal (part 3) is by far the largest of the three.
        expect(parts[2].areaM2).toBeGreaterThan(parts[0].areaM2);
        expect(parts[2].areaM2).toBeGreaterThan(parts[1].areaM2);
    });

    it('counts a part with no honest height as skipped instead of inventing one', () => {
        const broken = JSON.parse(FIXTURE_TEXT);
        broken.features[1].properties.b3_h_maaiveld = null;
        broken.features[2].geometry = { type: 'Point', coordinates: [4.9, 52.38] };
        const r = nl3dbagPartsFromCollection(broken);
        expect(r.parts).toHaveLength(1);
        expect(r.skipped).toEqual({ noHeight: 1, noGeometry: 1 });
    });

    it('ringAreaM2 — a ~100 m × ~100 m square at Amsterdam latitude is ~10,000 m²', () => {
        const dLat = 100 / 111320, dLon = 100 / (111320 * Math.cos((52.37 * Math.PI) / 180));
        const a = ringAreaM2([[4.9, 52.37], [4.9 + dLon, 52.37], [4.9 + dLon, 52.37 + dLat], [4.9, 52.37 + dLat], [4.9, 52.37]]);
        expect(a).toBeGreaterThan(9_800);
        expect(a).toBeLessThan(10_200);
        expect(ringAreaM2([])).toBe(0);
    });
});

describe('§NL-3DBAG-CITY-BBOXES — the netherlands row working set', () => {
    const rows = NL_3DBAG_CITY_BBOXES as Array<{ city: string; bbox: Bbox }>;

    it('has unique cities and well-formed, city-sized bboxes inside the Netherlands', () => {
        const names = rows.map((r) => r.city);
        expect(new Set(names).size).toBe(names.length);
        for (const r of rows) {
            const [w, s, e, n] = r.bbox;
            expect(w).toBeLessThan(e);
            expect(s).toBeLessThan(n);
            // A national join's working set is CITY bboxes (§HEIGHT-STAMP-BUDGET).
            expect(e - w).toBeLessThanOrEqual(0.3);
            expect(n - s).toBeLessThanOrEqual(0.3);
            // Inside the bake.mjs `netherlands` row bbox 3.30,50.75,7.30,53.70.
            expect(w).toBeGreaterThanOrEqual(3.30);
            expect(e).toBeLessThanOrEqual(7.30);
            expect(s).toBeGreaterThanOrEqual(50.75);
            expect(n).toBeLessThanOrEqual(53.70);
        }
    });

    it('EQUALS every terrain.mjs `nl` region (guards the parser against a silent miss)', () => {
        const terrain = terrainNlRegions();
        expect(terrain.size).toBeGreaterThanOrEqual(5); // amsterdam/rotterdam/utrecht/thehague/eindhoven today; 0 = regex rot
        for (const [name, tb] of terrain) {
            const row = rows.find((r) => r.city === name);
            expect(row, `terrain.mjs nl region "${name}" has no 3DBAG stamp bbox — its baked terrain would carry 9 m defaults forever`).toBeDefined();
            expect(row!.bbox).toEqual(tb);
        }
    });

    it('lists the six ready cities the REGION_SOURCE note carried as free text since 2026-07-26', () => {
        for (const city of ['amsterdam', 'rotterdam', 'utrecht', 'thehague', 'eindhoven', 'groningen']) {
            expect(rows.find((r) => r.city === city), city).toBeDefined();
        }
    });

    it('the CI spot-check point (Amsterdam Dam, 52.3730,4.8924) is inside the amsterdam stamp bbox', () => {
        const [w, s, e, n] = rows.find((r) => r.city === 'amsterdam')!.bbox;
        expect(4.8924).toBeGreaterThan(w); expect(4.8924).toBeLessThan(e);
        expect(52.3730).toBeGreaterThan(s); expect(52.3730).toBeLessThan(n);
    });
});

describe('§NL-3DBAG-MATCH — which parts an OSM footprint owns (the NRW two-direction rule, no proximity guessing)', () => {
    const fc = parseNl3dbagCollection(FIXTURE_TEXT)!;
    const { parts } = nl3dbagPartsFromCollection(fc);
    /** An OSM-style footprint record from a closed ring (what heightSources.mjs footprintFromFeature yields). */
    const fpFromRing = (ext: number[][], interiors: number[][][] = []) => {
        let clon = 0, clat = 0;
        for (const [x, y] of ext) { clon += x!; clat += y!; }
        return { ext, interiors, clon: clon / ext.length, clat: clat / ext.length };
    };

    it('pointInRing — even-odd on a closed ring, edge cases outside', () => {
        const sq = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
        expect(pointInRing(0.5, 0.5, sq)).toBe(true);
        expect(pointInRing(1.5, 0.5, sq)).toBe(false);
        expect(pointInRing(-0.1, 0.5, sq)).toBe(false);
    });

    it('interiorPoint is INSIDE its own ring for every live part, and for a U-shape where the vertex mean is not', () => {
        for (const p of parts) expect(pointInRing(p.cx, p.cy, p.ring), p.pandId ?? '').toBe(true);
        // A "U": the vertex mean (and the area centroid) sit in the open notch — outside the building.
        const u = [[0, 0], [3, 0], [3, 3], [2, 3], [2, 1], [1, 1], [1, 3], [0, 3], [0, 0]];
        let mx = 0, my = 0;
        for (const [x, y] of u) { mx += x!; my += y!; }
        expect(pointInRing(mx / u.length, my / u.length, u)).toBe(false); // the naive centroid fails here
        const [ix, iy] = interiorPoint(u);
        expect(pointInRing(ix, iy, u)).toBe(true);                        // the rule does not
        // Degenerate (zero-area) ring → falls back to the vertex mean rather than NaN.
        const [dx, dy] = interiorPoint([[1, 1], [2, 2], [3, 3], [1, 1]]);
        expect(Number.isFinite(dx) && Number.isFinite(dy)).toBe(true);
    });

    it('FORWARD — an OSM footprint drawn ON a BAG pand owns that part (wholly inside: fraction 1, samples OFF the edge)', () => {
        for (const p of parts) {
            // 1 for the two convex-ish rings; 0.79 for the CONCAVE 28-vertex 240311 (a midpoint pulled toward the interior
            // point can leave a concave ring) — well above the ½ the rule needs, which is what this pins.
            expect(partInsideFraction(fpFromRing(p.ring), p), p.pandId ?? '').toBeGreaterThanOrEqual(0.75);
            const { owned, via } = matchPartsToFootprint(fpFromRing(p.ring), parts);
            expect(via).toBe('forward');
            expect(owned.map((o) => o.pandId), p.pandId ?? '').toContain(p.pandId);
        }
        // Parts 2 (240311) and 3 (Centraal) do not own each other: 3's interior point lies INSIDE 2's ring
        // (they overlap), yet only 2 % of 3's body does — a bare interior-point rule would have stamped
        // Centraal's height on 240311; the majority rule refuses it.
        const p1 = parts[1]!, p2 = parts[2]!;
        expect(pointInRing(p2.cx, p2.cy, p1.ring)).toBe(true);
        expect(partInsideFraction(fpFromRing(p1.ring), p2)).toBeLessThan(0.05);
        expect(matchPartsToFootprint(fpFromRing(p1.ring), parts).owned.map((o) => o.pandId)).toEqual([p1.pandId]);
        expect(matchPartsToFootprint(fpFromRing(p2.ring), parts).owned.map((o) => o.pandId)).toEqual([p2.pandId]);
    });

    it('FORWARD — a GENUINE overlap survives on purpose: pand 242112 holds 72 % of 240311, so a footprint on it owns both (the NRW reduction applies)', () => {
        const p0 = parts[0]!, p1 = parts[1]!;
        expect(partInsideFraction(fpFromRing(p0.ring), p1)).toBeCloseTo(0.72, 1); // 3DBAG draws 240311 inside 242112
        expect(partInsideFraction(fpFromRing(p1.ring), p0)).toBe(0);             // and not the other way round
        const { owned, via } = matchPartsToFootprint(fpFromRing(p0.ring), parts);
        expect(via).toBe('forward');
        expect(owned.map((o) => o.pandId)).toEqual([p0.pandId, p1.pandId]);
        expect(p0.areaM2).toBeGreaterThan(p1.areaM2);                            // the outer pand IS the larger one
    });

    it('FORWARD — one OSM way over a whole block owns every part inside it; a part inside a HOLE is not owned', () => {
        const block = [[4.896, 52.376], [4.906, 52.376], [4.906, 52.382], [4.896, 52.382], [4.896, 52.376]];
        const { owned, via } = matchPartsToFootprint(fpFromRing(block), parts);
        expect(via).toBe('forward');
        expect(owned).toHaveLength(3);
        // Punch pand 242112's own outline out as a HOLE → it is no longer owned, and neither is 240311
        // (72 % of its body sits in that hole, so its inside-not-in-hole fraction drops to 0.28); Centraal stays.
        const p0 = parts[0]!;
        const r2 = matchPartsToFootprint(fpFromRing(block, [p0.ring]), parts);
        expect(r2.owned.map((o) => o.pandId)).toEqual([parts[2]!.pandId]);
    });

    it('REVERSE — an OSM footprint drawn SMALLER than the pand (its centroid inside the part ring) still matches, and says so', () => {
        const p0 = parts[0]!, p1 = parts[1]!;
        const box = ([x, y]: number[], d = 0.00003) => [[x! - d, y! - d], [x! + d, y! - d], [x! + d, y! + d], [x! - d, y! + d], [x! - d, y! - d]];
        // (a) a point inside 242112 but NOT inside the overlapping 240311 → exactly 242112, via reverse.
        const only0 = partSamplePoints(p0).find(([x, y]) => pointInRing(x!, y!, p0.ring) && !pointInRing(x!, y!, p1.ring))!;
        expect(only0, 'a point of 242112 outside 240311').toBeDefined();
        expect(partInsideFraction(fpFromRing(box(only0)), p0)).toBeLessThan(0.5); // no forward claim (the box holds 1 of its 14 samples — its centre)
        const a = matchPartsToFootprint(fpFromRing(box(only0)), parts);
        expect(a.via).toBe('reverse');
        expect(a.owned.map((o) => o.pandId)).toEqual([p0.pandId]);
        // (b) a point inside BOTH overlapping panden → the SMALLER (240311, 5,140 m² < 11,529 m²) — the most specific claim.
        const both = partSamplePoints(p1).find(([x, y]) => pointInRing(x!, y!, p0.ring) && pointInRing(x!, y!, p1.ring))!;
        expect(both, 'a point inside both panden').toBeDefined();
        const b = matchPartsToFootprint(fpFromRing(box(both)), parts);
        expect(b.via).toBe('reverse');
        expect(b.owned.map((o) => o.pandId)).toEqual([p1.pandId]);
    });

    it('NEITHER — a footprint on open water owns nothing: via null, owned empty (the footprint keeps its OSM tags)', () => {
        const ij = [[4.9050, 52.3835], [4.9053, 52.3835], [4.9053, 52.3837], [4.9050, 52.3837], [4.9050, 52.3835]];
        const { owned, via } = matchPartsToFootprint(fpFromRing(ij), parts);
        expect(via).toBeNull();
        expect(owned).toEqual([]);
    });

    it('partGrid returns the same candidates a full scan would (a cell that misses a part would silently un-stamp it)', () => {
        const grid = partGrid(parts);
        expect(grid.size).toBeGreaterThan(0);
        for (const p of parts) {
            const got = grid.get([p.bx0!, p.by0!, p.bx1!, p.by1!]);
            expect(got, p.pandId ?? '').toContain(p);
            expect(new Set(got).size).toBe(got.length); // de-duplicated across cells
        }
        expect(grid.get([6.89, 52.22, 6.90, 52.23])).toEqual([]); // Enschede: nothing here
    });
});
