// Lane PROXY-EE-LT-PL — /api/parcel/ee leg (Maa-amet kataster:ky_kehtiv → WGS84 ring).
// Mirrors dkMatrikelProxy.test.ts's shape: a captured upstream fixture drives the leg (no live
// network) AND the issued URL is asserted against the EE adapter's MEASURED request shape
// (packages/site-parcel-data/src/countryAdapters/ee/eeWfsClient.ts; live leg probe 2026-09-02:
// Tallinn 59.437,24.7536 → tunnus 78401:114:0086, transcripts in
// audit/europe-site-intel/2026-08-31/impl/lane-proxy-eeltpl.md).

import { describe, expect, it, beforeEach } from 'vitest';
import {
    fetchEuParcelAtPoint,
    resolveEuParcelOutcome,
    __resetEuCadastreCache,
} from '../jurisdiction/euCadastreProxy.js';

// Captured from the live GetFeature of 2026-09-02 (srsName=EPSG:4326 → GeoJSON [lon,lat]);
// rings trimmed to small squares. TWO candidates in the bbox — only the second CONTAINS the
// click, so this also pins the containment pick over first-feature-wins.
const EE_GEOJSON = JSON.stringify({
    type: 'FeatureCollection',
    features: [
        {
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [[[24.7539, 59.4366], [24.7543, 59.4366], [24.7543, 59.4369], [24.7539, 59.4369], [24.7539, 59.4366]]] },
            properties: { tunnus: '78401:102:0140', l_aadress: 'Viru väljak 4', pindala: 16063 },
        },
        {
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [[[24.7532, 59.4370], [24.7540, 59.4370], [24.7540, 59.4376], [24.7532, 59.4376], [24.7532, 59.4370]]] },
            properties: { tunnus: '78401:114:0086', l_aadress: 'Viru väljak', pindala: 11445 },
        },
    ],
});

function fakeFetch(body: string, status = 200) {
    return async () => ({ ok: status >= 200 && status < 300, status, text: async () => body });
}

beforeEach(() => __resetEuCadastreCache());

describe('/api/parcel/ee — Maa-amet kataster leg', () => {
    it('resolves the containing katastriüksus: tunnus refcat + registered pindala + l_aadress', async () => {
        const p = await fetchEuParcelAtPoint('ee', 24.7536, 59.4373, { fetchImpl: fakeFetch(EE_GEOJSON) });
        expect(p).not.toBeNull();
        expect(p!.refcat).toBe('78401:114:0086'); // the CONTAINING parcel, not features[0]
        expect(p!.areaM2).toBe(11445); // cadastre-registered `pindala`, never derived when served
        expect(p!.address).toBe('Viru väljak');
        // GeoJSON is lon,lat → the ring must come back as {lat~59.43, lon~24.75}.
        expect(p!.ring[0]!.lat).toBeGreaterThan(59);
        expect(p!.ring[0]!.lon).toBeLessThan(25);
    });

    // THE AXIS-ORDER GOTCHA, same class as PT: the layer's native CRS is PROJECTED (L-EST97 /
    // EPSG:3301), the exact case where a bare `EPSG:4326` bbox is silently accepted and returns
    // ZERO features. The URL must carry the urn AUTHORITY bbox form (lat,lon order — the EE
    // adapter's measured fact 3) AND srsName=EPSG:4326 for degrees back.
    it('issues the adapter-measured URL: kataster:ky_kehtiv + urn AUTHORITY bbox + srsName=4326', async () => {
        let seen = '';
        const spy = async (url: string) => { seen = url; return { ok: true, status: 200, text: async () => EE_GEOJSON }; };
        await fetchEuParcelAtPoint('ee', 24.7536, 59.4373, { fetchImpl: spy });
        const decoded = decodeURIComponent(seen);
        expect(decoded).toContain('gsavalik.envir.ee/geoserver/kataster/ows');
        expect(decoded).toContain('typeNames=kataster:ky_kehtiv');
        expect(decoded).toContain('srsName=EPSG:4326');
        expect(decoded).toContain('urn:ogc:def:crs:EPSG::4326');
        // bbox is LAT,LON ordered (urn form): first bbox number is the latitude band.
        const bbox = /bbox=([\d.]+),([\d.]+)/.exec(decoded);
        expect(Number(bbox![1])).toBeCloseTo(59.4373, 2);
        expect(Number(bbox![2])).toBeCloseTo(24.7536, 2);
    });

    it('answered-empty is `empty`, no-answer is `unreachable` — never the same verdict', async () => {
        const empty = await resolveEuParcelOutcome('ee', 24.7536, 59.4373, {
            fetchImpl: fakeFetch('{"type":"FeatureCollection","features":[]}'),
        });
        expect(empty.outcome).toBe('empty');
        const down = await resolveEuParcelOutcome('ee', 24.7536, 59.4373, { fetchImpl: fakeFetch('', 500) });
        expect(down.outcome).toBe('unreachable');
    });

    it('the guard short-circuits an out-of-Estonia click without an upstream call', async () => {
        let called = false;
        const spy = async () => { called = true; return { ok: true, status: 200, text: async () => EE_GEOJSON }; };
        expect(await fetchEuParcelAtPoint('ee', 2.35, 48.85, { fetchImpl: spy })).toBeNull(); // Paris
        expect(called).toBe(false);
    });
});
