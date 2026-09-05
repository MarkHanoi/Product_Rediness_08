// LANE NZ-EVERYWHERE (2026-09-05) — the `nz` leg of /api/parcel/:cc: LINZ Data Service WFS, layer
// 50772 "NZ Primary Parcels", the FIRST KEYED leg in EU_CADASTRE_SOURCES.
//
// WHAT THIS PINS (and what it honestly cannot):
//   • KEY GATE — without LINZ_API_KEY the leg answers `unconfigured` and the upstream is NEVER asked;
//     the HTTP handler maps that to 503 + no-store, never `200 {parcel:null}` (C57 §1.5 amendment 3,
//     §1.2 keys server-side only). The key is read from `deps.env` (tests) / process.env (prod).
//   • THE MEASURED 4xx SHAPES (probed 2026-09-05 with a bogus key, verbatim below): a GetFeature with
//     a bad key is HTTP 400 "Feature type … unknown" (the layer list is key-scoped), GetCapabilities
//     keyless is HTTP 401 Jetty HTML. Both classify `unreachable` — never `empty`.
//   • THE URL — key in the LDS path segment, namespaced typeName, srsName 4326, CQL on `shape` in
//     LAT,LON order (AU-VIC precedent; ⚠ UNVERIFIED LIVE — no key held). The key never reaches a log
//     line (redacted) nor a response body.
//   • THE PARSE — a FeatureCollection in the exact FIELD SET the layer's API record enumerates
//     (id, appellation, affected_surveys, parcel_intent, topology_type, statutory_actions,
//     land_district, titles, survey_area, calc_area, shape). ⚠ HONESTY: the field names are verbatim
//     from services/api/v1/layers/50772/ (HTTP 200); the VALUES and the ring are SYNTHETIC — no
//     parcel has been fetched through this leg because no key is held. The first keyed probe must
//     replace this fixture with a captured body.
//
// ⛔ `nz` is NOT in the au-*/tr/qa keyless family: PARCEL-SELECT-COVERAGE lists it WIRED-KEY-PENDING.

import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
    fetchEuParcelAtPoint,
    resolveEuParcelOutcome,
    makeEuParcelHandler,
    __resetEuCadastreCache,
    EU_CADASTRE_SOURCES,
} from '../jurisdiction/euCadastreProxy.js';

const AUCKLAND = { lon: 174.7645, lat: -36.8485 };
const KEY = 'TESTKEY-0123456789abcdef';

// Field set verbatim from the LINZ layer record; values + ring synthetic (see header).
const NZ_GEOJSON = JSON.stringify({
    type: 'FeatureCollection',
    features: [{
        type: 'Feature',
        id: 'layer-50772.4567890',
        geometry: { type: 'MultiPolygon', coordinates: [[[[174.7640, -36.8490], [174.7650, -36.8490], [174.7650, -36.8480], [174.7640, -36.8480], [174.7640, -36.8490]]]] },
        geometry_name: 'shape',
        properties: {
            id: 4567890,
            appellation: 'Lot 1 DP 12345',
            affected_surveys: 'DP 12345',
            parcel_intent: 'Fee Simple Title',
            topology_type: 'Primary',
            statutory_actions: null,
            land_district: 'North Auckland',
            titles: 'NA123/456',
            survey_area: 812.0,
            calc_area: 811.6,
        },
    }],
    totalFeatures: 1, numberMatched: 1, numberReturned: 1,
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::4326' } },
});

// VERBATIM — probed 2026-09-05 with key=BOGUSKEY0000000000000000 (HTTP 400, application/xml, 573 B).
const LINZ_BOGUS_KEY_400 = `<?xml version="1.0" encoding="UTF-8"?><ows:ExceptionReport xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:ows="http://www.opengis.net/ows/1.1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="2.0.0" xsi:schemaLocation="http://www.opengis.net/ows/1.1 https://data.linz.govt.nz/services;key=BOGUSKEY0000000000000000/schemas/ows/1.1.0/owsAll.xsd">
  <ows:Exception exceptionCode="InvalidParameterValue" locator="typeName">
    <ows:ExceptionText>Feature type data.linz.govt.nz:layer-50772 unknown</ows:ExceptionText>
  </ows:Exception>
</ows:ExceptionReport>`;

// VERBATIM — GetCapabilities keyless AND with the bogus key (HTTP 401, text/html, 486 B).
const LINZ_KEYLESS_401 = `<html>
<head>
<meta http-equiv="Content-Type" content="text/html;charset=ISO-8859-1"/>
<title>Error 401 Unauthorized</title>
</head>
<body><h2>HTTP ERROR 401 Unauthorized</h2>
<table>
<tr><th>URI:</th><td>/geoserver/data.linz.govt.nz/wfs</td></tr>
<tr><th>STATUS:</th><td>401</td></tr>
<tr><th>MESSAGE:</th><td>Unauthorized</td></tr>
<tr><th>SERVLET:</th><td>dispatcher</td></tr>
</table>
<hr/><a href="https://jetty.org/">Powered by Jetty:// 9.4.58.v20250814</a><hr/>

</body>
</html>`;

type FetchInit = { headers?: Record<string, string> };
type FetchLike = (url: string, init?: FetchInit) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

function fakeFetch(body: string, status = 200): FetchLike & { calls: string[] } {
    const calls: string[] = [];
    const f = (async (url: string) => { calls.push(url); return { ok: status >= 200 && status < 300, status, text: async () => body }; }) as FetchLike & { calls: string[] };
    f.calls = calls;
    return f;
}

interface FakeRes {
    statusCode: number;
    headers: Record<string, string>;
    body: unknown;
    setHeader(k: string, v: string): void;
    status(c: number): FakeRes;
    json(b: unknown): FakeRes;
}
function fakeRes(): FakeRes {
    const r: FakeRes = {
        statusCode: 200, headers: {}, body: undefined,
        setHeader(k, v) { r.headers[k] = v; },
        status(c) { r.statusCode = c; return r; },
        json(b) { r.body = b; return r; },
    };
    return r;
}

beforeEach(() => __resetEuCadastreCache());

describe('nz leg — registration', () => {
    it('is registered as a keyed leg (requiresEnv LINZ_API_KEY) with a GeoJSON format and its own provenance id', () => {
        const cfg = EU_CADASTRE_SOURCES.nz as { requiresEnv?: string; format?: string; source?: string };
        expect(cfg).toBeDefined();
        expect(cfg.requiresEnv).toBe('LINZ_API_KEY');
        expect(cfg.format).toBe('geojson');
        expect(cfg.source).toBe('nz-linz-primary-parcels');
    });

    it('no OTHER leg names a requiresEnv (nz is the first keyed leg; a second one must add its own test)', () => {
        const keyed = Object.entries(EU_CADASTRE_SOURCES)
            .filter(([, c]) => typeof (c as { requiresEnv?: unknown }).requiresEnv === 'string')
            .map(([cc]) => cc);
        expect(keyed).toEqual(['nz']);
    });
});

describe('nz leg — the KEY GATE (C57 §1.2 / §1.5 amendment 3)', () => {
    it('without LINZ_API_KEY → outcome `unconfigured`, and the upstream is NEVER asked', async () => {
        const spy = fakeFetch(NZ_GEOJSON);
        const r = await resolveEuParcelOutcome('nz', AUCKLAND.lon, AUCKLAND.lat, { fetchImpl: spy, env: {} });
        expect(r).toEqual({ outcome: 'unconfigured', parcel: null });
        expect(spy.calls).toHaveLength(0);
    });

    it('a blank / whitespace key counts as unset', async () => {
        const spy = fakeFetch(NZ_GEOJSON);
        const r = await resolveEuParcelOutcome('nz', AUCKLAND.lon, AUCKLAND.lat, { fetchImpl: spy, env: { LINZ_API_KEY: '   ' } });
        expect(r.outcome).toBe('unconfigured');
        expect(spy.calls).toHaveLength(0);
    });

    it('out-of-area is decided BEFORE the key gate — a Sydney click never reads as an NZ key problem', async () => {
        const spy = fakeFetch(NZ_GEOJSON);
        const r = await resolveEuParcelOutcome('nz', 151.2066, -33.8734, { fetchImpl: spy, env: {} });
        expect(r.outcome).toBe('out-of-area');
        expect(spy.calls).toHaveLength(0);
    });

    it('fetchEuParcelAtPoint (the parcel-or-null seam) returns null unkeyed, never throws, never fetches', async () => {
        const spy = fakeFetch(NZ_GEOJSON);
        await expect(fetchEuParcelAtPoint('nz', AUCKLAND.lon, AUCKLAND.lat, { fetchImpl: spy, env: {} })).resolves.toBeNull();
        expect(spy.calls).toHaveLength(0);
    });

    it('the HTTP handler answers 503 + no-store + X-Cadastre-Outcome: unconfigured — NEVER 200 {parcel:null}', async () => {
        const handler = makeEuParcelHandler({ fetchImpl: fakeFetch(NZ_GEOJSON), env: {} });
        const res = fakeRes();
        await handler({ params: { cc: 'nz' }, query: { lon: String(AUCKLAND.lon), lat: String(AUCKLAND.lat) } }, res);
        expect(res.statusCode).toBe(503);
        expect(res.headers['Cache-Control']).toBe('no-store');
        expect(res.headers['X-Cadastre-Outcome']).toBe('unconfigured');
        expect(res.headers['X-Cadastre-Cache']).toBe('MISS-UNCONFIGURED');
        const body = res.body as { parcel: unknown; outcome: string; reason: string };
        expect(body.parcel).toBeNull();
        expect(body.outcome).toBe('unconfigured');
        expect(body.reason).toContain('LINZ_API_KEY');
    });
});

describe('nz leg — keyed request shape + parse', () => {
    it('builds the LDS URL: key in the path segment, namespaced layer-50772, srsName 4326, CQL on `shape` in LAT,LON order', async () => {
        const spy = fakeFetch(NZ_GEOJSON);
        const p = await fetchEuParcelAtPoint('nz', AUCKLAND.lon, AUCKLAND.lat, { fetchImpl: spy, env: { LINZ_API_KEY: KEY } });
        expect(p).not.toBeNull();
        expect(spy.calls).toHaveLength(1);
        const decoded = decodeURIComponent(spy.calls[0]!).replace(/\+/g, ' ');
        expect(decoded).toContain(`https://data.linz.govt.nz/services;key=${KEY}/wfs?`);
        expect(decoded).toContain('typeNames=data.linz.govt.nz:layer-50772');
        expect(decoded).toContain('outputFormat=application/json');
        expect(decoded).toContain('srsName=EPSG:4326');
        // LAT first inside POINT — the axis pin (unverified live; the swap's symptom is a silent 0-feature answer).
        expect(decoded).toContain('INTERSECTS(shape,POINT(-36.8485 174.7645))');
    });

    it('normalises: appellation as the refcat, surveyed area as the served/official figure, titles as the address line', async () => {
        const r = await resolveEuParcelOutcome('nz', AUCKLAND.lon, AUCKLAND.lat, { fetchImpl: fakeFetch(NZ_GEOJSON), env: { LINZ_API_KEY: KEY } });
        expect(r.outcome).toBe('ok');
        const parcel = r.parcel as { refcat: string; areaM2: number; areaOfficialM2: number | null; areaSigM2: number; address: string | null; ring: Array<{ lat: number; lon: number }> };
        expect(parcel.refcat).toBe('Lot 1 DP 12345');
        expect(parcel.areaM2).toBe(812.0);                 // survey_area preferred over calc_area
        expect(parcel.areaOfficialM2).toBe(812.0);         // register-published → official (C57 §2.4)
        expect(parcel.areaSigM2).toBeGreaterThan(0);       // shoelace over the served ring — a different fact
        expect(parcel.areaSigM2).not.toBe(812.0);
        expect(parcel.address).toBe('NA123/456');
        expect(parcel.ring.length).toBeGreaterThanOrEqual(4);
        expect(parcel.ring[0]).toEqual({ lon: 174.7640, lat: -36.8490 }); // GeoJSON lon,lat honoured
    });

    it('the key never appears in the returned parcel or the handler body', async () => {
        const handler = makeEuParcelHandler({ fetchImpl: fakeFetch(NZ_GEOJSON), env: { LINZ_API_KEY: KEY } });
        const res = fakeRes();
        await handler({ params: { cc: 'nz' }, query: { lon: String(AUCKLAND.lon), lat: String(AUCKLAND.lat) } }, res);
        expect(res.statusCode).toBe(200);
        expect(JSON.stringify(res.body)).not.toContain(KEY);
        expect((res.body as { parcel: { source: string } }).parcel.source).toBe('nz-linz-primary-parcels');
    });

    it('falls back to the LINZ parcel id when appellation is absent; calc_area when survey_area is null', async () => {
        const body = JSON.parse(NZ_GEOJSON);
        body.features[0].properties.appellation = null;
        body.features[0].properties.survey_area = null;
        const r = await resolveEuParcelOutcome('nz', AUCKLAND.lon, AUCKLAND.lat, { fetchImpl: fakeFetch(JSON.stringify(body)), env: { LINZ_API_KEY: KEY } });
        expect(r.outcome).toBe('ok');
        const parcel = r.parcel as { refcat: string; areaM2: number; areaOfficialM2: number | null };
        expect(parcel.refcat).toBe('4567890');
        expect(parcel.areaM2).toBe(811.6);
        expect(parcel.areaOfficialM2).toBe(811.6);
    });

    it('an answered EMPTY collection (keyed) is `empty` — a durable absence, not an outage', async () => {
        const r = await resolveEuParcelOutcome('nz', AUCKLAND.lon, AUCKLAND.lat, {
            fetchImpl: fakeFetch(JSON.stringify({ type: 'FeatureCollection', features: [], totalFeatures: 0, numberMatched: 0, numberReturned: 0 })),
            env: { LINZ_API_KEY: KEY },
        });
        expect(r).toEqual({ outcome: 'empty', parcel: null });
    });
});

describe('nz leg — the MEASURED 4xx shapes classify `unreachable`, never `empty` (probed 2026-09-05)', () => {
    it('HTTP 400 ows:ExceptionReport "Feature type … unknown" (bogus key) → unreachable', async () => {
        const r = await resolveEuParcelOutcome('nz', AUCKLAND.lon, AUCKLAND.lat, { fetchImpl: fakeFetch(LINZ_BOGUS_KEY_400, 400), env: { LINZ_API_KEY: KEY } });
        expect(r).toEqual({ outcome: 'unreachable', parcel: null });
    });

    it('HTTP 401 Jetty "Unauthorized" (keyless service) → unreachable', async () => {
        const r = await resolveEuParcelOutcome('nz', AUCKLAND.lon, AUCKLAND.lat, { fetchImpl: fakeFetch(LINZ_KEYLESS_401, 401), env: { LINZ_API_KEY: KEY } });
        expect(r).toEqual({ outcome: 'unreachable', parcel: null });
    });

    it('the non-OK warning line REDACTS the key (a log is a response body one grep away — C57 §1.2)', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            await resolveEuParcelOutcome('nz', AUCKLAND.lon, AUCKLAND.lat, { fetchImpl: fakeFetch(LINZ_BOGUS_KEY_400, 400), env: { LINZ_API_KEY: KEY } });
            const lines = warn.mock.calls.map((c) => c.map(String).join(' '));
            const http = lines.filter((l) => l.includes('[eu-cadastre] HTTP 400'));
            expect(http).toHaveLength(1);
            expect(http[0]).toContain(';key=REDACTED/wfs');
            expect(http[0]).not.toContain(KEY);
        } finally {
            warn.mockRestore();
        }
    });
});
