// §GURS-KN-STAVBE (2026-09-05, lane HEIGHTS-AT-CZ-SI) — the Slovenian national height stamp's DECISIONS,
// unit-tested against the VERBATIM live body of 2026-09-05. `heights/siHeights.mjs` is the pure half
// (host + GetFeature URL + axis order, the collection parser, the H2−H3 rule, the point-in-footprint
// match, the working set); the network half in heights/siHeightsStamp.mjs imports heightSources.mjs,
// which vitest cannot load — which is why the decisions were pulled out.
//
// WHAT EACH TEST PINS, and why it earned a test rather than a comment:
//   • the HOST — the KN WFS lives on ipi.eprostor.gov.si; the storitve host answers 404 for every KN
//     path (probed the same minute). A stamp pointed at the wrong host reports 0 buildings, not an error.
//   • BBOX axis order — urn:ogc:def:crs:EPSG::4326 is LAT,LON; the swapped order returns an EMPTY
//     collection over the Indian Ocean, not an error.
//   • the height rule — H2 − H3 (the floor-ladder statistic), H2 − H1 only as the fallback; no H2 → null;
//     a register that contradicts itself (≤ 0) → null. Pinned on the six live buildings.
//   • parseGursCollection returns null (never an empty collection) on a non-collection body.
//   • the match — a centroid in a hole is NOT owned; a footprint with no centroid keeps its OSM tags.
//   • city bboxes — inside the bake.mjs `slovenia` row; the CI spot-check point inside `ljubljana`.
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    GURS_KN, SI_CITY_BBOXES, gursStavbeUrl, gursStavbaHeight, gursStavbeFromCollection, matchStavbeToFootprint,
    ownedP90, parseGursCollection, pointGrid,
} from '../heights/siHeights.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
type Bbox = [number, number, number, number];
const LIVE = readFileSync(resolve(HERE, 'fixtures', 'si-gurs-kn-stavbe-ljubljana-2026-09-05.json'), 'utf8');

describe('§GURS-KN-STAVBE — host + GetFeature URL', () => {
    it('targets the ipi host (the storitve host 404s every KN path) and the STAVBE type', () => {
        expect(GURS_KN.wfs).toBe('https://ipi.eprostor.gov.si/wfs-si-gurs-kn/ows');
        expect(GURS_KN.typeName).toBe('SI.GURS.KN:STAVBE');
    });
    it('emits the BBOX in LAT,LON with the urn CRS, srsName=EPSG:4326, JSON output and the probed count', () => {
        const url = gursStavbeUrl([14.503, 46.050, 14.508, 46.053], { count: 20 });
        expect(url).toContain('bbox=46.05,14.503,46.053,14.508,urn:ogc:def:crs:EPSG::4326');
        expect(url).toContain('typeNames=SI.GURS.KN:STAVBE');
        expect(url).toContain('srsName=EPSG:4326');
        expect(url).toContain('outputFormat=application%2Fjson');
        expect(url).toContain('count=20');
        expect(url).not.toContain('bbox=14.503,46.05');
    });
    it('defaults to the GetCapabilities CountDefault (20000)', () => {
        expect(gursStavbeUrl([14.5, 46.0, 14.51, 46.01])).toContain('count=20000');
    });
});

describe('§GURS-KN-STAVBE — the live body (6 Ljubljana buildings, verbatim 2026-09-05)', () => {
    const fc = parseGursCollection(LIVE)!;
    it('parses as a FeatureCollection of 6 Points with [lon, lat] coordinates', () => {
        expect(fc).not.toBeNull();
        expect(fc.features.length).toBe(6);
        expect(fc.numberMatched).toBe(38);
        for (const f of fc.features) {
            expect(f.geometry.type).toBe('Point');
            const [lon, lat] = f.geometry.coordinates;
            expect(lon).toBeGreaterThan(14.50); expect(lon).toBeLessThan(14.51);   // Ljubljana, lon FIRST
            expect(lat).toBeGreaterThan(46.05); expect(lat).toBeLessThan(46.06);
        }
    });
    it('applies H2 − H3 to every building (all six carry H3), falling back to H1 for none of them', () => {
        const { points, skipped } = gursStavbeFromCollection(fc);
        expect(points.length).toBe(6);
        expect(skipped).toEqual({ noGeometry: 0, noHeight: 0 });
        expect(points.every((p) => p.rule === 'h2-h3')).toBe(true);
        // STAVBE.100200000214388098: 7 floors, H1 289.7 · H2 309.6 · H3 292.2 → 17.4 m (H2−H1 would say 19.9)
        const seven = points.find((p) => p.eid === '100200000214388098')!;
        expect(seven.floors).toBe(7);
        expect(seven.height).toBeCloseTo(17.4, 5);
        expect(seven.accuracy).toBe(0);
        // STAVBE.100200000214384287: 8 floors, H2 322.5 · H3 296.7 → 25.8 m
        const eight = points.find((p) => p.eid === '100200000214384287')!;
        expect(eight.floors).toBe(8);
        expect(eight.height).toBeCloseTo(25.8, 5);
        // a one-floor annexe: H2 297.1 · H3 295.3 → 1.8 m (real, small; the stamp clamps to its 2.5 m floor)
        const one = points.find((p) => p.eid === '100200000214387900')!;
        expect(one.floors).toBe(1);
        expect(one.height).toBeCloseTo(1.8, 5);
    });
});

describe('§GURS-KN-STAVBE — the height rule on edge shapes', () => {
    it('falls back to H2 − H1 only when H3 is absent, and records which pair produced the number', () => {
        const a = gursStavbaHeight({ VISINA_H1: 289.7, VISINA_H2: 309.6, VISINA_H3: 292.2 })!;
        expect(a.rule).toBe('h2-h3'); expect(a.height).toBeCloseTo(17.4, 5);
        const b = gursStavbaHeight({ VISINA_H1: 289.7, VISINA_H2: 309.6, VISINA_H3: null })!;
        expect(b.rule).toBe('h2-h1'); expect(b.height).toBeCloseTo(19.9, 5);
    });
    it('returns null — never a number — without H2, without both grounds, or when the register contradicts itself', () => {
        expect(gursStavbaHeight({ VISINA_H1: 289.7, VISINA_H3: 292.2 })).toBeNull();
        expect(gursStavbaHeight({ VISINA_H2: 309.6 })).toBeNull();
        expect(gursStavbaHeight({ VISINA_H2: 290.0, VISINA_H3: 292.2 })).toBeNull();   // roof below ground
        expect(gursStavbaHeight({ VISINA_H2: 'n/a', VISINA_H3: 292.2 })).toBeNull();
        expect(gursStavbaHeight(null)).toBeNull();
    });
    it('parseGursCollection returns null (not an empty collection) for an exception report, HTML, or nothing', () => {
        expect(parseGursCollection('<ows:ExceptionReport/>')).toBeNull();
        expect(parseGursCollection('<html>502</html>')).toBeNull();
        expect(parseGursCollection('')).toBeNull();
        expect(parseGursCollection('{"type":"Feature"}')).toBeNull();
    });
});

describe('§GURS-KN-STAVBE — point-in-footprint match', () => {
    const square = (cx: number, cy: number, half: number) => [[cx - half, cy - half], [cx + half, cy - half], [cx + half, cy + half], [cx - half, cy + half], [cx - half, cy - half]];
    const pts = [
        { lon: 14.5050, lat: 46.0510, height: 17.4, rule: 'h2-h3', floors: 7, accuracy: 0, eid: 'a' },
        { lon: 14.5052, lat: 46.0512, height: 25.8, rule: 'h2-h3', floors: 8, accuracy: 0, eid: 'b' },
        { lon: 14.5100, lat: 46.0600, height: 9.0, rule: 'h2-h3', floors: 3, accuracy: 0, eid: 'far' },
    ];
    it('a footprint owns the centroids inside its exterior and outside its holes; P90 of ≤5 is the max', () => {
        const fp = { ext: square(14.5051, 46.0511, 0.0005), interiors: [] as number[][][] };
        const { owned, via } = matchStavbeToFootprint(fp, pts);
        expect(via).toBe('forward');
        expect(owned.map((p) => p.eid).sort()).toEqual(['a', 'b']);
        expect(ownedP90(owned)).toBe(25.8);
        const holed = { ext: fp.ext, interiors: [square(14.5052, 46.0512, 0.00005)] };
        expect(matchStavbeToFootprint(holed, pts).owned.map((p) => p.eid)).toEqual(['a']);
    });
    it('a footprint with no centroid inside it keeps its OSM tags (via null, nothing owned)', () => {
        const fp = { ext: square(14.5200, 46.0700, 0.0005), interiors: [] };
        expect(matchStavbeToFootprint(fp, pts)).toEqual({ owned: [], via: null });
        expect(ownedP90([])).toBeNull();
    });
    it('the grid returns the candidates near a query box and not the far one', () => {
        const g = pointGrid(pts);
        const near = g.get([14.5045, 46.0505, 14.5057, 46.0517]).map((p) => p.eid).sort();
        expect(near).toEqual(['a', 'b']);
    });
});

describe('§SI-CITY-BBOXES — the slovenia row working set', () => {
    const bake = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
    const row = bake.match(/\{\s*name:\s*'slovenia'\s*,[^\n]*bbox:\s*'(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)'/);
    const national: Bbox = [Number(row![1]), Number(row![2]), Number(row![3]), Number(row![4])];
    it('has unique cities and well-formed, city-sized bboxes inside the bake.mjs slovenia row', () => {
        const names = SI_CITY_BBOXES.map((c) => c.city);
        expect(new Set(names).size).toBe(names.length);
        for (const { city, bbox } of SI_CITY_BBOXES) {
            const [w, s, e, n] = bbox;
            expect(e - w, `${city} lon span`).toBeGreaterThan(0.03); expect(e - w, `${city} lon span`).toBeLessThan(0.3);
            expect(n - s, `${city} lat span`).toBeGreaterThan(0.02); expect(n - s, `${city} lat span`).toBeLessThan(0.2);
            expect(w >= national[0] && s >= national[1] && e <= national[2] && n <= national[3], `${city} inside slovenia`).toBe(true);
        }
    });
    it('lists ljubljana and maribor, and the CI spot-check point (Prešeren Square) is inside `ljubljana`', () => {
        for (const c of ['ljubljana', 'maribor']) expect(SI_CITY_BBOXES.some((x) => x.city === c), c).toBe(true);
        const [w, s, e, n] = SI_CITY_BBOXES.find((x) => x.city === 'ljubljana')!.bbox;
        expect(14.5051 > w && 14.5051 < e && 46.0511 > s && 46.0511 < n).toBe(true);
    });
});
