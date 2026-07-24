// L-613 (Denmark slice) — /api/parcel/dk Matrikel proxy: EPSG:25832 → WGS84 normalisation +
// credential gate. NO live network (the Matrikel is credential-gated); a captured-shape Matrikel
// GML Jordstykke fixture in native UTM32N exercises the parse + reprojection, and a forward
// transform in-test round-trip-validates the inverse UTM math.

import { describe, expect, it, beforeEach } from 'vitest';
import {
    fetchDkParcelAtPoint,
    parseMatrikelGml,
    utm32nToWgs84,
    __resetDkMatrikelCache,
} from '../dkMatrikelProxy.js';

// ── Snyder forward TM (ETRS89/UTM32N) — TEST ONLY, to round-trip-validate the proxy's inverse. ──
const A = 6378137.0, F = 1 / 298.257223563, K0 = 0.9996, E2 = F * (2 - F), LON0 = 9, FE = 500000;
const d2r = Math.PI / 180;
function wgs84ToUtm32n(lat: number, lon: number): { E: number; N: number } {
    const ep2 = E2 / (1 - E2);
    const phi = lat * d2r, lam = lon * d2r, lam0 = LON0 * d2r;
    const sinP = Math.sin(phi), cosP = Math.cos(phi), tanP = Math.tan(phi);
    const N = A / Math.sqrt(1 - E2 * sinP * sinP);
    const T = tanP * tanP;
    const C = ep2 * cosP * cosP;
    const Aa = (lam - lam0) * cosP;
    const M = A * ((1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256) * phi -
        (3 * E2 / 8 + 3 * E2 ** 2 / 32 + 45 * E2 ** 3 / 1024) * Math.sin(2 * phi) +
        (15 * E2 ** 2 / 256 + 45 * E2 ** 3 / 1024) * Math.sin(4 * phi) -
        (35 * E2 ** 3 / 3072) * Math.sin(6 * phi));
    const E = FE + K0 * N * (Aa + (1 - T + C) * Aa ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * Aa ** 5 / 120);
    const Nn = K0 * (M + N * tanP * (Aa ** 2 / 2 + (5 - T + 9 * C + 4 * C * C) * Aa ** 4 / 24 +
        (61 - 58 * T + T * T + 600 * C - 330 * ep2) * Aa ** 6 / 720));
    return { E, N: Nn };
}

beforeEach(() => __resetDkMatrikelCache());

describe('utm32nToWgs84 — inverse UTM (round-trips the forward)', () => {
    for (const [lat, lon] of [[55.6761, 12.5683], [56.15, 10.2], [57.05, 9.92]] as const) {
        it(`round-trips ${lat},${lon} within ~1e-6°`, () => {
            const { E, N } = wgs84ToUtm32n(lat, lon);
            const back = utm32nToWgs84(E, N);
            expect(back.lat).toBeCloseTo(lat, 5);
            expect(back.lon).toBeCloseTo(lon, 5);
        });
    }
});

// A Matrikel Jordstykke as native EPSG:25832 (posList = E N pairs) — a ~20 m square near Copenhagen.
function matrikelGmlSquareNearCopenhagen(): { gml: string; centreLat: number; centreLon: number } {
    const c = wgs84ToUtm32n(55.6761, 12.5683);
    const E0 = Math.round(c.E), N0 = Math.round(c.N);
    const pts = [[E0, N0], [E0 + 20, N0], [E0 + 20, N0 + 20], [E0, N0 + 20], [E0, N0]];
    const posList = pts.map(([e, n]) => `${e} ${n}`).join(' ');
    const centre = utm32nToWgs84(E0 + 10, N0 + 10);
    const gml = `<?xml version="1.0"?>
<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:mat="http://data.gov.dk/schemas/matrikel/1">
 <wfs:member><mat:Jordstykke gml:id="jordstykke.100">
  <mat:matrikelnummer>7000a</mat:matrikelnummer>
  <mat:ejerlavsnavn>København Købstads Bygrunde</mat:ejerlavsnavn>
  <mat:geometri><gml:Polygon srsName="urn:ogc:def:crs:EPSG::25832"><gml:exterior><gml:LinearRing>
   <gml:posList srsDimension="2">${posList}</gml:posList>
  </gml:LinearRing></gml:exterior></gml:Polygon></mat:geometri>
 </mat:Jordstykke></wfs:member>
</wfs:FeatureCollection>`;
    return { gml, centreLat: centre.lat, centreLon: centre.lon };
}

const fakeFetch = (body: string, status = 200) => async () => ({ ok: status >= 200 && status < 300, status, text: async () => body });

describe('parseMatrikelGml — native 25832 → WGS84 ring', () => {
    it('reprojects the posList to WGS84 near Copenhagen + reads matrikelnummer/ejerlav', () => {
        const { gml } = matrikelGmlSquareNearCopenhagen();
        const cands = parseMatrikelGml(gml);
        expect(cands.length).toBe(1);
        const c = cands[0]!;
        expect(c.ring.length).toBeGreaterThanOrEqual(4);
        expect(c.ring[0]!.lat).toBeCloseTo(55.676, 2);
        expect(c.ring[0]!.lon).toBeCloseTo(12.568, 2);
        expect(c.refcat).toContain('7000a');
        expect(c.refcat).toContain('København');
    });
    it('never throws on empty / malformed GML', () => {
        expect(parseMatrikelGml('')).toEqual([]);
        expect(parseMatrikelGml('<x/>')).toEqual([]);
        // @ts-expect-error hostile input
        expect(() => parseMatrikelGml(null)).not.toThrow();
    });
});

describe('fetchDkParcelAtPoint — the Catastro-shaped resolve', () => {
    it('with credentials → a WGS84 Danish parcel { ring, refcat, areaM2 }', async () => {
        const { gml, centreLat, centreLon } = matrikelGmlSquareNearCopenhagen();
        const p = await fetchDkParcelAtPoint(centreLon, centreLat, {
            username: 'svc', password: 'pw', fetchImpl: fakeFetch(gml),
        });
        expect(p).not.toBeNull();
        expect(p!.refcat).toContain('7000a');
        expect(p!.ring.length).toBeGreaterThanOrEqual(3);
        expect(p!.ring[0]!.lat).toBeGreaterThan(55);
        expect(p!.ring[0]!.lat).toBeLessThan(58);
        expect(p!.areaM2).toBeGreaterThan(0);
    });

    it('WITHOUT credentials → null (client then footprint-falls-back), never throws', async () => {
        let called = false;
        const spy = async () => { called = true; return { ok: true, status: 200, text: async () => '' }; };
        const p = await fetchDkParcelAtPoint(12.5683, 55.6761, { fetchImpl: spy });
        expect(p).toBeNull();
        expect(called).toBe(false); // no upstream call is even attempted without creds
    });

    it('upstream failure / bad coords → null (never throws)', async () => {
        expect(await fetchDkParcelAtPoint(12.5683, 55.6761, { username: 'a', password: 'b', fetchImpl: fakeFetch('', 500) })).toBeNull();
        expect(await fetchDkParcelAtPoint(NaN, NaN, { username: 'a', password: 'b', fetchImpl: fakeFetch('') })).toBeNull();
    });
});
