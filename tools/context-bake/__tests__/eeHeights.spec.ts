// §EE-ETAK (2026-09-05, lane HEIGHTS-EE-PL-PT-BE) — the Estonian national measured-height stamp's DECISIONS,
// unit-tested. `heights/eeHeights.mjs` is the pure half (the WFS URL and its axis order, the attribute→height
// rule, the 5,000-cap truncation rule, the part builder, the match rule, the city working set); the network/
// join half (heights/eeHeightsStamp.mjs) imports heightSources.mjs, which vitest cannot load (see
// mdsBboxCoversTerrainRegion.spec.ts), which is why the decisions were pulled out into a module that can.
//
// WHAT EACH TEST PINS, and why it earned a test rather than a comment:
//   • BBOX axis order — this GeoServer honours lon,lat for EPSG:4326. The textbook lat,lon order does NOT
//     error: it returns HTTP 200 and an EMPTY collection over Tallinn's Old Town (numberMatched 0 vs 646,
//     probed 2026-09-05); every cell reads as "no buildings" and the §MEASURED-HEIGHT-GATE fails for a reason
//     nobody can see.
//   • parseEtakCollection returns null (never an empty collection) on a non-GeoJSON body — the failure-vs-
//     empty split (§CONTEXT-DATA-HONESTY) at the exact point where "the service refused us" could become
//     "the cell is empty" and silently void a covered city.
//   • the 5,000 cap — the server truncates EVERY request at 5,000 objects, hits included (probed: hits 5000,
//     GetFeature numberReturned 5000 / numberMatched 0 over a box that holds far more). A collection at the
//     cap is TRUNCATED, and a stamp that trusted it would leave the missing buildings at OSM defaults while
//     reporting the cell "read".
//   • the height rule — korgus_m as-is (integer metres, measured per ETAK_juhend2016 §3.5.3), null / 0 /
//     negative refused, tyyp 40 "Vare" (ruin) refused by name.
//   • the fixture is the LIVE WFS response of 2026-09-05 (count=3, Tallinn Old Town cell), byte-for-byte.
//   • city bboxes — tallinn must EQUAL terrain.mjs's `ee` row (§MDS-BBOX-MUST-COVER-THE-REGION) so the baked
//     terrain and the stamped heights cover the same ground; every bbox must sit inside the bake `estonia` row.
//
// LAYERING: a build/inspection tool test, like its siblings — no OTel span (P8 applies to exported package
// functions, not bake tooling).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    EE_ETAK, EE_CITY_BBOXES, etakGetFeatureUrl, etakHitsUrl, parseEtakCollection, etakIsTruncated, etakBuildingHeight,
    etakPartsFromCollection, matchPartsToFootprint, partGrid, areaWeightedP90, pointInRing, interiorPoint, ringAreaM2,
} from '../heights/eeHeights.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
type Bbox = [number, number, number, number];

/** The live GetFeature body (count=3, trimmed propertyName) over [24.74,59.43,24.75,59.44], 2026-09-05. */
const FIXTURE_TEXT = readFileSync(resolve(HERE, 'fixtures/ee-etak-hoone-tallinn-2026-09-05.json'), 'utf8');

/** terrain.mjs REGIONS rows with source:'ee', read as TEXT (importing terrain.mjs runs main()). */
function terrainEeRegions(): Map<string, Bbox> {
    const src = readFileSync(resolve(HERE, '../terrain.mjs'), 'utf8');
    const out = new Map<string, Bbox>();
    const re = /\{\s*name:\s*'([a-z0-9-]+)'\s*,\s*source:\s*'ee'\s*,\s*bbox:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g;
    for (const m of src.matchAll(re)) out.set(m[1]!, [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])]);
    return out;
}

describe('§EE-ETAK — GetFeature URL', () => {
    it('asks the ETAK buildings layer for GeoJSON in EPSG:4326 with the BBOX in LON,LAT order (the live-verified shape)', () => {
        const url = etakGetFeatureUrl([24.74, 59.43, 24.75, 59.44]);
        expect(url.startsWith('https://gsavalik.envir.ee/geoserver/etak/ows?')).toBe(true);
        expect(url).toContain('service=WFS&version=2.0.0&request=GetFeature');
        expect(url).toContain('typeNames=etak:e_401_hoone_ka');
        expect(url).toContain('outputFormat=application%2Fjson');
        expect(url).toContain('srsName=EPSG:4326');
        expect(url).toContain('bbox=24.74,59.43,24.75,59.44,EPSG:4326');
        // the lat,lon order silently returns 0 features over the Old Town — never emit it
        expect(url).not.toContain('bbox=59.43,24.74');
        expect(url).toContain('propertyName=etak_id,tyyp,tyyp_tekst,ehr_gid,korgus_m,korgusallika_id');
        expect(url).not.toContain('count=');
        expect(etakGetFeatureUrl([24.74, 59.43, 24.75, 59.44], { count: 3 })).toContain('&count=3');
    });

    it('hits URL is the same BBOX order and RESULTTYPE=hits — and the constant says the cap applies to it too', () => {
        const url = etakHitsUrl([24.74, 59.43, 24.75, 59.44]);
        expect(url).toContain('resultType=hits');
        expect(url).toContain('bbox=24.74,59.43,24.75,59.44,EPSG:4326');
        expect(EE_ETAK.serverCap).toBe(5000);
    });
});

describe('§EE-ETAK — the body parser keeps failure and empty apart', () => {
    it('a live collection parses; an ows:ExceptionReport / HTML / empty body is null, NOT an empty collection', () => {
        const fc = parseEtakCollection(FIXTURE_TEXT);
        expect(fc).not.toBeNull();
        expect(fc!.features).toHaveLength(3);
        expect(parseEtakCollection('<?xml version="1.0"?><ows:ExceptionReport/>')).toBeNull();
        expect(parseEtakCollection('<html>502</html>')).toBeNull();
        expect(parseEtakCollection('')).toBeNull();
        expect(parseEtakCollection('{"type":"FeatureCollection","features":[]}')!.features).toHaveLength(0);
    });

    it('a collection AT the 5,000 cap is truncated; one below it is not', () => {
        expect(etakIsTruncated({ features: [], numberReturned: 5000 })).toBe(true);
        expect(etakIsTruncated({ features: new Array(5000).fill({}) })).toBe(true);
        expect(etakIsTruncated({ features: new Array(646).fill({}), numberReturned: 646 })).toBe(false);
        expect(etakIsTruncated(parseEtakCollection(FIXTURE_TEXT))).toBe(false);
        expect(etakIsTruncated(null)).toBe(false);
    });
});

describe('§EE-ETAK — the height rule', () => {
    it('korgus_m is the height, integer metres, as-is', () => {
        expect(etakBuildingHeight({ korgus_m: 15, tyyp: 10, korgusallika_id: 225 })).toEqual({ height: 15, sourceId: 225 });
        expect(etakBuildingHeight({ korgus_m: '12', tyyp: 20 })).toEqual({ height: 12, sourceId: null });
    });
    it('refuses null / zero / negative heights and ruins (tyyp 40) by name — never a neighbour\'s number', () => {
        expect(etakBuildingHeight({ korgus_m: null, tyyp: 10 })).toBeNull();
        expect(etakBuildingHeight({ korgus_m: 0, tyyp: 10 })).toBeNull();
        expect(etakBuildingHeight({ korgus_m: -3, tyyp: 10 })).toBeNull();
        expect(etakBuildingHeight({ korgus_m: 4, tyyp: 40 })).toBeNull();
        expect(etakBuildingHeight({ korgus_m: 4, tyyp: EE_ETAK.ruinType })).toBeNull();
        expect(etakBuildingHeight(null)).toBeNull();
    });
});

describe('§EE-ETAK — the live fixture (Tallinn Old Town, count=3, 2026-09-05)', () => {
    it('is the verbatim live response: 3 Polygons in lon,lat with korgus_m 15 / 12 / 19 and korgusallika_id 225', () => {
        const fc = parseEtakCollection(FIXTURE_TEXT)!;
        expect(fc.features.map((f: any) => f.geometry.type)).toEqual(['Polygon', 'Polygon', 'Polygon']);
        expect(fc.features.map((f: any) => f.properties.korgus_m)).toEqual([15, 12, 19]);
        expect(fc.features.every((f: any) => f.properties.korgusallika_id === 225)).toBe(true);
        expect(fc.features[0].properties.ehr_gid).toBe('101013606');
        const [lon, lat] = fc.features[0].geometry.coordinates[0][0];
        expect(lon).toBeGreaterThan(24.7); expect(lon).toBeLessThan(24.8);
        expect(lat).toBeGreaterThan(59.4); expect(lat).toBeLessThan(59.5);
    });

    it('builds 3 parts with interior points inside their own rings, closed rings, positive areas', () => {
        const { parts, skipped, sourceIds } = etakPartsFromCollection(parseEtakCollection(FIXTURE_TEXT));
        expect(parts).toHaveLength(3);
        expect(skipped).toEqual({ noHeight: 0, ruin: 0, noGeometry: 0 });
        expect(sourceIds).toEqual({ '225': 3 });
        for (const p of parts) {
            expect(pointInRing(p.cx, p.cy, p.ring)).toBe(true);
            expect(p.ring[0]).toEqual(p.ring[p.ring.length - 1]);
            expect(p.areaM2).toBeGreaterThan(20);
            expect(ringAreaM2(p.ring)).toBe(p.areaM2);
        }
        expect(parts.map((p) => p.h)).toEqual([15, 12, 19]);
    });

    it('skips a ruin and a heightless building by name instead of dropping them silently', () => {
        const fc = parseEtakCollection(FIXTURE_TEXT)!;
        const mutated = { features: [
            { ...fc.features[0], properties: { ...fc.features[0].properties, tyyp: 40 } },
            { ...fc.features[1], properties: { ...fc.features[1].properties, korgus_m: null } },
            fc.features[2],
        ] };
        const { parts, skipped } = etakPartsFromCollection(mutated);
        expect(parts).toHaveLength(1);
        expect(skipped).toEqual({ noHeight: 1, ruin: 1, noGeometry: 0 });
    });

    it('each ring, offered as an OSM footprint, owns exactly itself (forward) and takes its own korgus_m', () => {
        const { parts } = etakPartsFromCollection(parseEtakCollection(FIXTURE_TEXT));
        const grid = partGrid(parts);
        for (const p of parts) {
            const fp = { ext: p.ring, interiors: [] as number[][][], clon: p.cx, clat: p.cy };
            const { owned, via } = matchPartsToFootprint(fp, grid.get([p.bx0!, p.by0!, p.bx1!, p.by1!]));
            expect(via).toBe('forward');
            expect(owned).toEqual([p]);
            expect(areaWeightedP90(owned)).toBe(p.h);
        }
    });

    it('a footprint far from every building owns nothing (via null) — it keeps its OSM tags', () => {
        const { parts } = etakPartsFromCollection(parseEtakCollection(FIXTURE_TEXT));
        const grid = partGrid(parts);
        const fp = { ext: [[26.72, 58.37], [26.721, 58.37], [26.721, 58.371], [26.72, 58.371], [26.72, 58.37]], interiors: [], clon: 26.7205, clat: 58.3705 };
        expect(matchPartsToFootprint(fp, grid.get([26.72, 58.37, 26.721, 58.371]))).toEqual({ owned: [], via: null });
    });
});

describe('§EE-ETAK — small geometry helpers', () => {
    it('area-weighted P90 picks the height at 90 % of the cumulative area, and null for nothing', () => {
        expect(areaWeightedP90([{ h: 10, areaM2: 100 }, { h: 30, areaM2: 5 }])).toBe(10);
        expect(areaWeightedP90([{ h: 10, areaM2: 5 }, { h: 30, areaM2: 100 }])).toBe(30);
        expect(areaWeightedP90([])).toBeNull();
    });
    it('interiorPoint lands inside a C-shaped ring where the vertex mean would not', () => {
        const c = [[0, 0], [3, 0], [3, 1], [1, 1], [1, 2], [3, 2], [3, 3], [0, 3], [0, 0]];
        const [x, y] = interiorPoint(c);
        expect(pointInRing(x, y, c)).toBe(true);
    });
});

describe('§EE-CITY-BBOXES — the working set', () => {
    it('tallinn is BYTE-IDENTICAL to terrain.mjs\'s `ee` row (§MDS-BBOX-MUST-COVER-THE-REGION)', () => {
        const terrain = terrainEeRegions();
        expect(terrain.get('tallinn'), 'terrain.mjs tallinn row').toBeDefined();
        expect(EE_CITY_BBOXES.find((c) => c.city === 'tallinn')!.bbox).toEqual(terrain.get('tallinn'));
    });
    it('lists tallinn / tartu / parnu / narva, each inside the bake `estonia` row bbox (21.60,57.50,28.30,59.80)', () => {
        expect(EE_CITY_BBOXES.map((c) => c.city)).toEqual(['tallinn', 'tartu', 'parnu', 'narva']);
        for (const { city, bbox: [w, s, e, n] } of EE_CITY_BBOXES) {
            expect(w, city).toBeGreaterThanOrEqual(21.60); expect(e, city).toBeLessThanOrEqual(28.30);
            expect(s, city).toBeGreaterThanOrEqual(57.50); expect(n, city).toBeLessThanOrEqual(59.80);
            expect(e - w, city).toBeLessThanOrEqual(0.3); expect(n - s, city).toBeLessThanOrEqual(0.12);
        }
    });
});
