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
} from '../jurisdiction/dkMatrikelProxy.js';

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

// The parcel-lot POLYGON lives on `lodflade_current.geometri` (native EPSG:25832, posList = E N
// pairs) and carries only `jordstykkeLokalId` — NOT matrikelnummer. This mirrors the live shape.
// A ~20 m square near Copenhagen, plus the separate `jordstykke_current` attribute record the proxy
// joins to (by id_lokalId) to recover the human-facing matrikelnummer.
const JORDSTYKKE_LOKALID = '100063526';
function lodfladeGmlSquareNearCopenhagen(): { gml: string; centreLat: number; centreLon: number } {
    const c = wgs84ToUtm32n(55.6761, 12.5683);
    const E0 = Math.round(c.E), N0 = Math.round(c.N);
    const pts = [[E0, N0], [E0 + 20, N0], [E0 + 20, N0 + 20], [E0, N0 + 20], [E0, N0]];
    const posList = pts.map(([e, n]) => `${e} ${n}`).join(' ');
    const centre = utm32nToWgs84(E0 + 10, N0 + 10);
    const gml = `<?xml version="1.0"?>
<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:mat_v001="http://datafordeler.dk/schemas/mat/v001/gml3">
 <wfs:member><mat_v001:lodflade_current gml:id="lodflade_current.9098202">
  <mat_v001:status>Gældende</mat_v001:status>
  <mat_v001:geometri><gml:Polygon srsName="http://www.opengis.net/gml/srs/epsg.xml#25832" srsDimension="2"><gml:exterior><gml:LinearRing>
   <gml:posList>${posList}</gml:posList>
  </gml:LinearRing></gml:exterior></gml:Polygon></mat_v001:geometri>
  <mat_v001:jordstykkeLokalId>${JORDSTYKKE_LOKALID}</mat_v001:jordstykkeLokalId>
 </mat_v001:lodflade_current></wfs:member>
</wfs:FeatureCollection>`;
    return { gml, centreLat: centre.lat, centreLon: centre.lon };
}

// The attribute-join response: jordstykke_current filtered by id_lokalId → matrikelnummer.
const jordstykkeAttrGml = `<?xml version="1.0"?>
<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:mat_v001="http://datafordeler.dk/schemas/mat/v001/gml3">
 <wfs:member><mat_v001:jordstykke_current gml:id="jordstykke_current.1">
  <mat_v001:id_lokalId>${JORDSTYKKE_LOKALID}</mat_v001:id_lokalId>
  <mat_v001:matrikelnummer>7000a</mat_v001:matrikelnummer>
 </mat_v001:jordstykke_current></wfs:member>
</wfs:FeatureCollection>`;

const fakeFetch = (body: string, status = 200) => async () => ({ ok: status >= 200 && status < 300, status, text: async () => body });
// Routes by TYPENAMES: the geometry (lodflade) query vs. the jordstykke attribute join.
const routingFetch = (geomGml: string, attrGml: string) => async (url: string) => {
    const body = String(url).includes('lodflade') ? geomGml : attrGml;
    return { ok: true, status: 200, text: async () => body };
};

describe('parseMatrikelGml — native 25832 → WGS84 ring', () => {
    it('reprojects the lodflade posList to WGS84 near Copenhagen + reads jordstykkeLokalId', () => {
        const { gml } = lodfladeGmlSquareNearCopenhagen();
        const cands = parseMatrikelGml(gml);
        expect(cands.length).toBe(1);
        const c = cands[0]!;
        expect(c.ring.length).toBeGreaterThanOrEqual(4);
        expect(c.ring[0]!.lat).toBeCloseTo(55.676, 2);
        expect(c.ring[0]!.lon).toBeCloseTo(12.568, 2);
        // lodflade has no matrikelnummer → provisional refcat falls back to the FK, upgraded later.
        expect(c.jordstykkeLokalId).toBe(JORDSTYKKE_LOKALID);
        expect(c.refcat).toContain(JORDSTYKKE_LOKALID);
    });
    it('never throws on empty / malformed GML', () => {
        expect(parseMatrikelGml('')).toEqual([]);
        expect(parseMatrikelGml('<x/>')).toEqual([]);
        // @ts-expect-error hostile input
        expect(() => parseMatrikelGml(null)).not.toThrow();
    });
});

describe('fetchDkParcelAtPoint — the Catastro-shaped resolve', () => {
    it('with credentials → a WGS84 Danish parcel { ring, refcat, areaM2 }, refcat=matrikelnummer via join', async () => {
        const { gml, centreLat, centreLon } = lodfladeGmlSquareNearCopenhagen();
        const p = await fetchDkParcelAtPoint(centreLon, centreLat, {
            apikey: 'testkey', fetchImpl: routingFetch(gml, jordstykkeAttrGml),
        });
        expect(p).not.toBeNull();
        expect(p!.refcat).toBe('7000a'); // upgraded from jordstykkeLokalId by the attribute join
        expect(p!.ring.length).toBeGreaterThanOrEqual(3);
        expect(p!.ring[0]!.lat).toBeGreaterThan(55);
        expect(p!.ring[0]!.lat).toBeLessThan(58);
        expect(p!.areaM2).toBeGreaterThan(0);
    });

    it('join failure still yields a parcel labelled by jordstykkeLokalId (never throws)', async () => {
        const { gml, centreLat, centreLon } = lodfladeGmlSquareNearCopenhagen();
        // attr join returns empty → refcat stays the provisional jordstykkeLokalId.
        const p = await fetchDkParcelAtPoint(centreLon, centreLat, {
            apikey: 'testkey', fetchImpl: routingFetch(gml, ''),
        });
        expect(p).not.toBeNull();
        expect(p!.refcat).toBe(JORDSTYKKE_LOKALID);
        expect(p!.ring.length).toBeGreaterThanOrEqual(3);
    });

    it('WITHOUT credentials → null (client then footprint-falls-back), never throws', async () => {
        let called = false;
        const spy = async () => { called = true; return { ok: true, status: 200, text: async () => '' }; };
        const p = await fetchDkParcelAtPoint(12.5683, 55.6761, { fetchImpl: spy });
        expect(p).toBeNull();
        expect(called).toBe(false); // no upstream call is even attempted without creds
    });

    it('upstream failure / bad coords → null (never throws)', async () => {
        expect(await fetchDkParcelAtPoint(12.5683, 55.6761, { apikey: 'k', fetchImpl: fakeFetch('', 500) })).toBeNull();
        expect(await fetchDkParcelAtPoint(NaN, NaN, { apikey: 'k', fetchImpl: fakeFetch('') })).toBeNull();
    });
});
