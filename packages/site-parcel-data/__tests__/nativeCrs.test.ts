// §NATIVE-CRS-MEASUREMENT — the shared capability that decides WHICH coordinates may be measured.
//
// ⚠⚠ WHY THIS FILE CARRIES ITS OWN PROJECTION TESTS. `geometry/nativeCrs.ts` implements Krüger's
// transverse-Mercator series rather than pulling in proj4, so that `@pryzm/site-parcel-data` stays
// L2-pure (C58 §1.9) and byte-deterministic. A projection nobody checks is a fabricated datum with
// extra steps, so it is checked THREE independent ways:
//
//   1. AGAINST THE PUBLISHER. Vertices captured from `Murcia:pgou_alineaciones` in BOTH EPSG:4326
//      and EPSG:25830 in the same request pair — GeoServer's own reprojection of its own geometry.
//      Our transform must land where GeoServer said, to within the 4326 wire quantisation that is
//      the entire reason this module exists.
//   2. AGAINST ITSELF. Forward∘inverse must be the identity to well under a millimetre.
//   3. AGAINST A PUBLISHED CONSTANT. The zone's central meridian projects to exactly the false
//      easting, which is EPSG:25830's definition and not something our series can fudge.

import { describe, it, expect } from 'vitest';
import {
    NATIVE_METRIC_CRS,
    normaliseCrs,
    isNativeMetricCrs,
    nativeMetricCrsDef,
    projectToNative,
    nativeToWgs84,
    makeMeasurementFrame,
    degreeQuantisation_m,
} from '../src/geometry/nativeCrs.js';

const NATIVE = 'EPSG:25830';

/**
 * Six vertices of `pgou_alineaciones.1347527`, captured live 2026-08-02 in BOTH CRS from the same
 * bbox — GeoServer reprojecting its own geometry. The 4326 column is quantised to 4 decimals, which
 * is the defect; the 25830 column is the truth it was quantised from.
 */
const PUBLISHER_PAIRS: ReadonlyArray<{ lon: number; lat: number; e: number; n: number }> = [
    { lon: -1.1301, lat: 37.9874, e: 664206.785, n: 4206065.745 },
    { lon: -1.1302, lat: 37.9874, e: 664200.785, n: 4206063.915 },
    { lon: -1.1302, lat: 37.9877, e: 664199.655, n: 4206100.505 },
    { lon: -1.1301, lat: 37.9877, e: 664211.075, n: 4206102.315 },
    { lon: -1.1298, lat: 37.9878, e: 664236.505, n: 4206107.865 },
    { lon: -1.1297, lat: 37.9875, e: 664244.845, n: 4206076.505 },
];

describe('§NATIVE-CRS-MEASUREMENT — the projection agrees with the publisher that produced both', () => {
    it('lands within the 4326 wire quantisation of GeoServer\'s own 25830 coordinates', () => {
        // The 4326 input is rounded to 4 decimals, so the most our transform can possibly agree to
        // is half a grid step: ~4.4 m of easting, ~5.6 m of northing at 38 °N. Anything inside that
        // band means the disagreement is entirely the wire's, and none of it is ours.
        const q = degreeQuantisation_m(37.987)!;
        for (const p of PUBLISHER_PAIRS) {
            const ours = projectToNative(NATIVE, p.lat, p.lon)!;
            expect(Math.abs(ours.e - p.e), `easting @ ${p.lon},${p.lat}`).toBeLessThan(q.lon_m / 2 + 0.01);
            expect(Math.abs(ours.n - p.n), `northing @ ${p.lon},${p.lat}`).toBeLessThan(q.lat_m / 2 + 0.01);
        }
    });

    it('round-trips 25830 → degrees → 25830 to well under a millimetre', () => {
        for (const p of PUBLISHER_PAIRS) {
            const deg = nativeToWgs84(NATIVE, p.e, p.n)!;
            const back = projectToNative(NATIVE, deg.lat, deg.lon)!;
            expect(Math.hypot(back.e - p.e, back.n - p.n)).toBeLessThan(1e-4);
        }
    });

    it('puts the zone-30 central meridian on the false easting exactly — the CRS definition', () => {
        // EPSG:25830's central meridian is 3 °W and its false easting is 500 000 m. This is a
        // published fact about the CRS, not a property of our series, so it pins the zone maths.
        const p = projectToNative(NATIVE, 40, -3)!;
        expect(p.e).toBeCloseTo(500_000, 6);
        // …and zone 31 (Catalunya) sits on 3 °E, one zone over.
        expect(projectToNative('EPSG:25831', 41.4, 3)!.e).toBeCloseTo(500_000, 6);
    });

    it('is deterministic — the same input yields a bit-identical answer every time', () => {
        const runs = Array.from({ length: 6 }, () => projectToNative(NATIVE, 37.991617, -1.132142)!);
        for (const r of runs) expect(r).toEqual(runs[0]);
    });
});

describe('§NATIVE-CRS-MEASUREMENT — the allow-list is closed and never guesses', () => {
    it('reads every EPSG spelling a WFS answers with', () => {
        for (const s of [
            'EPSG:25830', 'epsg:25830', ' EPSG:25830 ',
            'urn:ogc:def:crs:EPSG::25830', 'http://www.opengis.net/def/crs/EPSG/0/25830',
        ]) {
            expect(normaliseCrs(s), s).toBe('EPSG:25830');
        }
    });

    it('refuses a GEOGRAPHIC CRS — that is the whole point of the module', () => {
        for (const s of ['EPSG:4326', 'EPSG:4258', 'urn:ogc:def:crs:EPSG::4326']) {
            expect(isNativeMetricCrs(s), s).toBe(false);
            expect(makeMeasurementFrame(s, 37.99, -1.13), s).toBeNull();
        }
        // CRS:84 carries no EPSG code at all, so it does not even normalise.
        expect(normaliseCrs('CRS:84')).toBeNull();
        expect(isNativeMetricCrs('CRS:84')).toBe(false);
    });

    it('refuses a metre CRS that is real but NOT registered — absence is not permission', () => {
        // 31370 (Belgian Lambert 72) and 2056 (CH LV95) are genuine metric CRS this module cannot
        // yet project. It must say so, not approximate them with a UTM zone.
        for (const s of ['EPSG:31370', 'EPSG:2056', 'EPSG:3763', 'EPSG:27700']) {
            expect(nativeMetricCrsDef(s), s).toBeNull();
            expect(makeMeasurementFrame(s, 37.99, -1.13), s).toBeNull();
        }
    });

    it('refuses junk, absence and non-strings without throwing', () => {
        for (const s of [undefined, null, '', 'metres', 42, {}, []]) {
            expect(isNativeMetricCrs(s)).toBe(false);
            expect(makeMeasurementFrame(s, 37.99, -1.13)).toBeNull();
            expect(projectToNative(s, 37.99, -1.13)).toBeNull();
        }
    });

    it('every registered CRS actually projects — no dead entries in the allow-list', () => {
        for (const [code, def] of NATIVE_METRIC_CRS) {
            expect(def.epsg).toBe(code);
            // Project a point on the zone's own central meridian, where every zone is valid.
            const lon = (def.zone - 1) * 6 - 180 + 3;
            const p = projectToNative(code, 45, lon);
            expect(p, code).not.toBeNull();
            expect(p!.e, code).toBeCloseTo(500_000, 5);
        }
    });
});

describe('§NATIVE-CRS-MEASUREMENT — the frame is RIGID, so a measurement cannot be distorted', () => {
    const frame = makeMeasurementFrame(NATIVE, 37.991617, -1.132142)!;

    it('reports the CRS it measures in, and that it is native', () => {
        expect(frame.crs).toBe(NATIVE);
        expect(frame.fidelity).toBe('native-metric');
    });

    it('preserves distance EXACTLY — `fromNative` is a translation, nothing more', () => {
        // Two arbitrary native points 137.4 m apart by construction.
        const a = frame.fromNative(frame.originE + 40, frame.originN + 30);
        const b = frame.fromNative(frame.originE - 70.4, frame.originN + 105);
        const inFrame = Math.hypot(a.x - b.x, a.z - b.z);
        const inNative = Math.hypot(40 - -70.4, 30 - 105);
        // 6 dp = a micrometre. The residual is float subtraction on ~4.2e6 m northings, not distortion.
        expect(inFrame).toBeCloseTo(inNative, 6);
    });

    it('puts the query point at the frame origin', () => {
        const o = frame.fromNative(frame.originE, frame.originN);
        expect(o.x).toBeCloseTo(0, 9);
        expect(o.z).toBeCloseTo(0, 9);
    });

    it('negates northing — the scene-XZ convention every geometry module here shares', () => {
        expect(frame.fromNative(frame.originE, frame.originN + 100).z).toBeCloseTo(-100, 9);
    });

    it('round-trips through the DISPLAY boundary and back', () => {
        const p = frame.fromNative(frame.originE + 250, frame.originN - 175);
        const deg = frame.toLonLat(p)!;
        const back = frame.fromLonLat(deg.lon, deg.lat);
        expect(back.x).toBeCloseTo(p.x, 4);
        expect(back.z).toBeCloseTo(p.z, 4);
    });

    it('`toNative` inverts `fromNative`', () => {
        const en = frame.toNative(frame.fromNative(664_100.5, 4_206_500.25));
        expect(en.e).toBeCloseTo(664_100.5, 9);
        expect(en.n).toBeCloseTo(4_206_500.25, 9);
    });

    it('an unprojectable lon/lat becomes NaN, never a silent origin', () => {
        // Placing an unprojectable vertex at 0,0 would drop a foreign ring on top of our own block
        // and delete a real opposing frontage. NaN is filtered by the caller; 0 would not be.
        const p = frame.fromLonLat(-1.13, 95);
        expect(Number.isNaN(p.x) || Number.isNaN(p.z)).toBe(true);
    });
});

describe('§NATIVE-CRS-MEASUREMENT — the harm is computed, not quoted', () => {
    it('states the 4-decimal degree quantisation at Murcia, and it is metres, not millimetres', () => {
        const q = degreeQuantisation_m(37.99)!;
        expect(q.lat_m).toBeCloseTo(11.132, 3);
        expect(q.lon_m).toBeCloseTo(8.774, 2);
        // The legal bands of PGOU Arts. 5.3.3 / 5.5.3 / 5.7.3 step at 4 m, 8 m and 12 m. The
        // quantisation is the SIZE OF A BAND — which is why this is a correctness defect and not a
        // precision preference.
        expect(q.lon_m).toBeGreaterThan(8);
    });

    it('scales with latitude and with the serialiser\'s decimal count', () => {
        // At the equator a degree of longitude is longest, so the harm is greatest there.
        expect(degreeQuantisation_m(0)!.lon_m).toBeGreaterThan(degreeQuantisation_m(60)!.lon_m);
        // …and every extra decimal divides it by ten. Six decimals (Catastro's grid) is decimetric,
        // which is why the Barcelona width path is not exposed to this defect.
        expect(degreeQuantisation_m(37.99, 6)!.lon_m).toBeCloseTo(0.0877, 3);
    });

    it('refuses to state a harm it cannot compute', () => {
        expect(degreeQuantisation_m(Number.NaN)).toBeNull();
        expect(degreeQuantisation_m(37.99, -1)).toBeNull();
    });
});
