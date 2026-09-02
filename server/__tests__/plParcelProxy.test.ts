// Lane PROXY-EE-LT-PL — /api/parcel/pl leg (GUGiK ULDK GetParcelByXY → WGS84 ring). Mirrors
// dkMatrikelProxy.test.ts's shape: a captured upstream fixture drives the leg (no live network)
// AND the issued URL is asserted against the PL adapter's MEASURED request shape
// (countryAdapters/pl/plUldkClient.ts; live leg probe 2026-09-02: Suwałki 54.10166,22.9305 →
// 206301_1.0005.11523/3, transcripts in
// audit/europe-site-intel/2026-08-31/impl/lane-proxy-eeltpl.md).

import { describe, expect, it, beforeEach } from 'vitest';
import {
    fetchEuParcelAtPoint,
    resolveEuParcelOutcome,
    __resetEuCadastreCache,
} from '../jurisdiction/euCadastreProxy.js';

// Captured from the live GetParcelByXY of 2026-09-02 (`srid=4326` → SRID=4326 WKT, LON-first);
// ring trimmed to a small closed square around the click.
const PL_OK =
    '0\n' +
    '206301_1.0005.11523/3|podlaskie|powiat Suwałki|Suwałki (miasto)|Obręb Nr 5|11523/3|' +
    'SRID=4326;POLYGON((22.9301 54.1015,22.9308 54.1015,22.9308 54.1019,22.9301 54.1019,22.9301 54.1015))\n';

function fakeFetch(body: string, status = 200) {
    return async () => ({ ok: status >= 200 && status < 300, status, text: async () => body });
}

beforeEach(() => __resetEuCadastreCache());

describe('/api/parcel/pl — GUGiK ULDK leg', () => {
    it('resolves the TERYT id refcat + commune address + geometry-derived area (ULDK serves none)', async () => {
        const p = await fetchEuParcelAtPoint('pl', 22.9305, 54.10166, { fetchImpl: fakeFetch(PL_OK) });
        expect(p).not.toBeNull();
        expect(p!.refcat).toBe('206301_1.0005.11523/3');
        expect(p!.address).toBe('Suwałki (miasto)');
        expect(p!.areaM2).toBeGreaterThan(0); // shoelace-derived — ULDK has no area field
        // WKT with srid=4326 is lon-first → {lat~54.10, lon~22.93}.
        expect(p!.ring[0]!.lat).toBeGreaterThan(54);
        expect(p!.ring[0]!.lon).toBeLessThan(23);
    });

    // MEASURED FACT 2 of the PL adapter: `xy=` is LONGITUDE FIRST, and the swapped pair fails
    // SILENTLY (`-1 brak wyników` for a point in the sea off Somalia). The URL is the only place
    // the swap can be seen, so it is pinned here — plus `srid=4326` (measured 2026-09-02: same
    // record serves degrees instead of the native EPSG:2180 metres) and the `result=` field list
    // whose ORDER the positional parse depends on.
    it('issues the adapter-measured URL: xy=LON,LAT,4326 + srid=4326 + pinned result field order', async () => {
        let seen = '';
        const spy = async (url: string) => { seen = url; return { ok: true, status: 200, text: async () => PL_OK }; };
        await fetchEuParcelAtPoint('pl', 22.9305, 54.10166, { fetchImpl: spy });
        expect(seen).toContain('uldk.gugik.gov.pl');
        expect(seen).toContain('request=GetParcelByXY');
        expect(seen).toContain('xy=22.9305,54.10166,4326'); // LON first — the silent-failure trap
        expect(seen).toContain('srid=4326');
        expect(seen).toContain('result=id,voivodeship,county,commune,region,parcel,geom_wkt');
    });

    // MEASURED FACT 1 of the PL adapter: EVERY ULDK answer is HTTP 200 — the status is the FIRST
    // TOKEN OF THE BODY. Only `-1 brak wyników` is a real absence; a bad-parameter body (no
    // status token) and any other `-1` are the service failing and must read `unreachable`.
    it('`-1 brak wyników` is `empty`; a bad-parameter body is `unreachable` — never conflated', async () => {
        const absent = await resolveEuParcelOutcome('pl', 22.9305, 54.10166, {
            fetchImpl: fakeFetch('-1 brak wyników\n'),
        });
        expect(absent.outcome).toBe('empty');

        const badParam = await resolveEuParcelOutcome('pl', 22.9305, 54.10166, {
            fetchImpl: fakeFetch('niepoprawny parametr xy, specyfikacja usługi: https://uldk.gugik.gov.pl\n'),
        });
        expect(badParam.outcome).toBe('unreachable');
        expect(badParam.outcome).not.toBe(absent.outcome);
    });

    it('ULDK status 0 with no record is a service defect → `unreachable`, not a coverage fact', async () => {
        const r = await resolveEuParcelOutcome('pl', 22.9305, 54.10166, { fetchImpl: fakeFetch('0\n') });
        expect(r.outcome).toBe('unreachable');
    });

    // If the upstream ever stops honouring `srid=4326`, the record declares SRID=2180 and its
    // metre pairs must NOT pass through as fake degrees.
    it('a record declaring a non-4326 SRID is never served as a fake-degree ring', async () => {
        const native =
            '0\n206301_1.0005.11523/3|podlaskie|powiat Suwałki|Suwałki (miasto)|Obręb Nr 5|11523/3|' +
            'SRID=2180;POLYGON((756900.1 699977.9,756895.9 699977.5,756892.8 700005.6,756900.1 699977.9))\n';
        const r = await resolveEuParcelOutcome('pl', 22.9305, 54.10166, { fetchImpl: fakeFetch(native) });
        expect(r.parcel).toBeNull();
    });

    it('the guard short-circuits an out-of-Poland click without an upstream call', async () => {
        let called = false;
        const spy = async () => { called = true; return { ok: true, status: 200, text: async () => PL_OK }; };
        expect(await fetchEuParcelAtPoint('pl', 25.2797, 54.6872, { fetchImpl: spy })).toBeNull(); // Vilnius
        expect(called).toBe(false);
    });
});
