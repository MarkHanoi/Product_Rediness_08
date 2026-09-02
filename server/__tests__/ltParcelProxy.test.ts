// Lane PROXY-EE-LT-PL — /api/parcel/lt leg (Registrų centras NTR via Statistics Lithuania,
// ArcGIS FeatureServer → WGS84 ring). Mirrors dkMatrikelProxy.test.ts's shape: a captured
// upstream fixture drives the leg (no live network) AND the issued URL is asserted against the
// LT adapter's MEASURED request shape (countryAdapters/lt/ltArcgisClient.ts / ltParcelProvider.ts;
// live leg probe 2026-09-02: Žvėrynas 54.69317,25.24374 → kadastro_nr 0101/0039:1406,
// transcripts in audit/europe-site-intel/2026-08-31/impl/lane-proxy-eeltpl.md).

import { describe, expect, it, beforeEach } from 'vitest';
import {
    fetchEuParcelAtPoint,
    resolveEuParcelOutcome,
    __resetEuCadastreCache,
} from '../jurisdiction/euCadastreProxy.js';

// Captured from the live query of 2026-09-02 (GET + outSR=4326 → rings [lon,lat] degrees);
// ring trimmed to a small square. sav_pavad/sen_pavad are the MEASURED honest nulls
// (the adapter's fill caveat) — carried as null, never back-filled.
const LT_ARCGIS = JSON.stringify({
    features: [{
        attributes: {
            kadastro_nr: '0101/0039:1406', unikalus_nr: '440021798516',
            pask_tipas_pavad: null, sav_pavad: null, sen_pavad: null,
            skl_plotas: 0.4402, pastat_sk: 2,
        },
        geometry: { rings: [[[25.2436, 54.6929], [25.2440, 54.6929], [25.2440, 54.6934], [25.2436, 54.6934], [25.2436, 54.6929]]] },
    }],
});

function fakeFetch(body: string, status = 200) {
    return async () => ({ ok: status >= 200 && status < 300, status, text: async () => body });
}

beforeEach(() => __resetEuCadastreCache());

describe('/api/parcel/lt — Registrų centras NTR leg', () => {
    it('resolves kadastro_nr refcat + the ha→m² transform (skl_plotas is HECTARES) + honest-null address', async () => {
        const p = await fetchEuParcelAtPoint('lt', 25.24374, 54.69317, { fetchImpl: fakeFetch(LT_ARCGIS) });
        expect(p).not.toBeNull();
        expect(p!.refcat).toBe('0101/0039:1406');
        // ⚠ THE UNIT TRAP: 0.4402 served → 4402 m², never 0.4402 m² and never 4402 ha.
        expect(p!.areaM2).toBe(4402);
        expect(p!.address).toBeNull(); // measured honest null — never invented from the id prefix
        // Esri rings with outSR=4326 are lon,lat → {lat~54.69, lon~25.24}.
        expect(p!.ring[0]!.lat).toBeGreaterThan(54);
        expect(p!.ring[0]!.lon).toBeLessThan(26);
    });

    it('issues the adapter-measured query: point intersects, inSR/outSR 4326, EXPLICIT outFields', async () => {
        let seen = '';
        const spy = async (url: string) => { seen = url; return { ok: true, status: 200, text: async () => LT_ARCGIS }; };
        await fetchEuParcelAtPoint('lt', 25.24374, 54.69317, { fetchImpl: spy });
        const decoded = decodeURIComponent(seen).replace(/\+/g, ' ');
        expect(decoded).toContain('osp-sdg.stat.gov.lt/arcgis/rest/services/ntr_sklypai/FeatureServer/0/query');
        // Esri JSON point is {x: LON, y: LAT} — x first, x is the longitude.
        expect(decoded).toContain('"x":25.24374');
        expect(decoded).toContain('"y":54.69317');
        expect(decoded).toContain('geometryType=esriGeometryPoint');
        expect(decoded).toContain('spatialRel=esriSpatialRelIntersects');
        expect(decoded).toContain('inSR=4326');
        expect(decoded).toContain('outSR=4326'); // server-side reprojection — no math in the proxy
        expect(decoded).toContain('f=json');
        // Explicit column list, never `*` (the adapter's discipline): kadastro_nr must be named.
        expect(decoded).toContain('outFields=unikalus_nr,kadastro_nr');
        expect(decoded).not.toContain('outFields=*');
    });

    // MEASURED FACT 3 of the LT adapter: ArcGIS answers a BAD REQUEST with HTTP **200** and an
    // `{ "error": {...} }` body. Reading that as zero candidates would return `empty` — an
    // authoritative "no parcel here" minted from a misconfiguration. It must be `unreachable`.
    it('an HTTP-200 ArcGIS error body is `unreachable`, NEVER `empty`', async () => {
        const errBody = JSON.stringify({
            error: { code: 400, message: 'Unable to complete operation.', details: ['Unable to perform query operation.'] },
        });
        const r = await resolveEuParcelOutcome('lt', 25.24374, 54.69317, { fetchImpl: fakeFetch(errBody) });
        expect(r.outcome).toBe('unreachable');
        expect(r.parcel).toBeNull();
    });

    // The unparcelled-land caveat (lane 4 LT-3): Lithuanian street/state land is frequently
    // unparcelled, so an ANSWERED zero-feature point query is a real, durable `empty` —
    // live-confirmed 2026-09-02 at Gedimino pr. (54.6872, 25.2797 → 0 features).
    it('an answered zero-feature response is `empty` (unparcelled state land, not an outage)', async () => {
        const r = await resolveEuParcelOutcome('lt', 25.2797, 54.6872, { fetchImpl: fakeFetch('{"features":[]}') });
        expect(r.outcome).toBe('empty');
    });

    it('the guard short-circuits an out-of-Lithuania click without an upstream call', async () => {
        let called = false;
        const spy = async () => { called = true; return { ok: true, status: 200, text: async () => LT_ARCGIS }; };
        expect(await fetchEuParcelAtPoint('lt', 24.7536, 59.437, { fetchImpl: spy })).toBeNull(); // Tallinn
        expect(called).toBe(false);
    });
});
