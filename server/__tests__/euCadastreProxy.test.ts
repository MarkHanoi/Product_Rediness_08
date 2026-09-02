// L-613 — /api/parcel/:cc same-origin proxy: per-country WFS → WGS84-ring normalisation.
//
// Pins the "select a real parcel everywhere" behaviours with CAPTURED raw WFS fixtures (shapes
// verified live 2026-07-24 against each national cadastre) — never live network:
//   • FR / NL — GeoJSON (lon,lat); id + area from feature properties.
//   • NO / DE-NRW — GML 3.2.1 posList; NO is lon,lat, NRW is lat,lon (both live-confirmed).
//   • the parcel whose ring CONTAINS the click is chosen out of the bbox response.
//   • out-of-national-bbox / unknown cc / upstream failure → null (client falls to draw/footprint).

import { describe, expect, it, beforeEach } from 'vitest';
import {
    fetchEuParcelAtPoint,
    resolveEuParcelOutcome,
    __resetEuCadastreCache,
    EU_CADASTRE_SOURCES,
} from '../jurisdiction/euCadastreProxy.js';

// ── Captured raw fixtures (one real parcel per source; ring trimmed to a small square) ──
const FR_GEOJSON = JSON.stringify({
    type: 'FeatureCollection',
    features: [{
        type: 'Feature',
        geometry: { type: 'MultiPolygon', coordinates: [[[[2.352, 48.8564], [2.3524, 48.8564], [2.3524, 48.8568], [2.352, 48.8568], [2.352, 48.8564]]]] },
        properties: { idu: '75104000AE0003', numero: '0003', section: 'AE', nom_com: 'Paris', contenance: 15168 },
    }],
});

const NL_GEOJSON = JSON.stringify({
    type: 'FeatureCollection',
    features: [{
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[4.892, 52.3728], [4.893, 52.3728], [4.893, 52.3732], [4.892, 52.3732], [4.892, 52.3728]]] },
        properties: { AKRKadastraleGemeenteCodeWaarde: 'ASD04', sectie: 'F', perceelnummer: 6685, kadastraleGrootteWaarde: 9402.0, kadastraleGemeenteWaarde: 'Amsterdam' },
    }],
});

// NO — posList is lon,lat (live-confirmed: "10.75 59.91 …").
const NO_GML = `<?xml version="1.0"?>
<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:app="https://data.geonorge.no/sosi/matrikkel/">
 <wfs:member><app:Teig>
  <app:teigId>291175379</app:teigId>
  <app:kommunenummer>0301</app:kommunenummer>
  <app:kommunenavn>OSLO</app:kommunenavn>
  <app:omrade><gml:Surface><gml:patches><gml:PolygonPatch><gml:exterior><gml:LinearRing>
   <gml:posList>10.7519 59.9137 10.7525 59.9137 10.7525 59.9141 10.7519 59.9141 10.7519 59.9137</gml:posList>
  </gml:LinearRing></gml:exterior></gml:PolygonPatch></gml:patches></gml:Surface></app:omrade>
  <app:matrikkelenhet><app:Matrikkelenhet><app:gardsnummer>208</app:gardsnummer><app:bruksnummer>644</app:bruksnummer></app:Matrikkelenhet></app:matrikkelenhet>
 </app:Teig></wfs:member>
</wfs:FeatureCollection>`;

// DE-NRW — posList is lat,lon (live-confirmed: "51.22 6.77 …"); flstkennz padded with underscores.
const NRW_GML = `<?xml version="1.0"?>
<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:ave="http://repository.gdi-de.org/schemas/adv/produkt/alkis-vereinfacht/2.0">
 <wfs:member><ave:Flurstueck>
  <ave:flstkennz>05311000400273______</ave:flstkennz>
  <ave:gemarkung>Altstadt</ave:gemarkung>
  <ave:flaeche>2355.0</ave:flaeche>
  <ave:geometry><gml:Polygon><gml:exterior><gml:LinearRing>
   <gml:posList>51.2286 6.7728 51.2286 6.7732 51.2290 6.7732 51.2290 6.7728 51.2286 6.7728</gml:posList>
  </gml:LinearRing></gml:exterior></gml:Polygon></ave:geometry>
 </ave:Flurstueck></wfs:member>
</wfs:FeatureCollection>`;

// CH — geo.admin.ch identify Esri-JSON (rings are lon,lat; sr 4326). Real Zürich Grundstück shape
// captured live 2026-07-26 (egris_egrid CH119192997709, number AA8048, ak ZH); ring trimmed to a
// small square around the click. No area attribute → area is derived from the ring.
const CH_ESRI = JSON.stringify({
    results: [{
        layerBodId: 'ch.kantone.cadastralwebmap-farbe',
        featureId: 2619911,
        attributes: { ak: 'ZH', number: 'AA8048', identnd: 'ZH0200000261', egris_egrid: 'CH119192997709', realestate_type: null, label: 'ZH' },
        geometry: { rings: [[[8.5411, 47.3763], [8.5423, 47.3763], [8.5423, 47.3775], [8.5411, 47.3775], [8.5411, 47.3763]]], spatialReference: { wkid: 4326 } },
    }],
});

/** A fake fetch that returns a fixed body for any URL (no network). */
function fakeFetch(body: string, status = 200) {
    return async () => ({ ok: status >= 200 && status < 300, status, text: async () => body });
}

beforeEach(() => __resetEuCadastreCache());

describe('fetchEuParcelAtPoint — per-country normalisation (captured fixtures)', () => {
    it('FR / IGN GeoJSON → ring + idu + contenance + commune', async () => {
        const p = await fetchEuParcelAtPoint('fr', 2.3522, 48.8566, { fetchImpl: fakeFetch(FR_GEOJSON) });
        expect(p).not.toBeNull();
        expect(p!.refcat).toBe('75104000AE0003');
        expect(p!.areaM2).toBe(15168);
        expect(p!.address).toContain('Paris');
        expect(p!.ring.length).toBeGreaterThanOrEqual(3);
        // GeoJSON is lon,lat → the ring must come back as {lat~48.85, lon~2.35}.
        expect(p!.ring[0]!.lat).toBeGreaterThan(48);
        expect(p!.ring[0]!.lon).toBeLessThan(3);
    });

    it('NL / PDOK GeoJSON → composite refcat + kadastrale grootte + gemeente', async () => {
        const p = await fetchEuParcelAtPoint('nl', 4.8925, 52.373, { fetchImpl: fakeFetch(NL_GEOJSON) });
        expect(p).not.toBeNull();
        expect(p!.refcat).toBe('ASD04 F 6685');
        expect(p!.areaM2).toBe(9402);
        expect(p!.address).toBe('Amsterdam');
    });

    it('NO / Kartverket GML (lon,lat) → kommune-gnr/bnr refcat + derived area', async () => {
        const p = await fetchEuParcelAtPoint('no', 10.7522, 59.9139, { fetchImpl: fakeFetch(NO_GML) });
        expect(p).not.toBeNull();
        expect(p!.refcat).toBe('0301-208/644');
        expect(p!.address).toBe('OSLO');
        expect(p!.areaM2).toBeGreaterThan(0); // derived from the ring (teig carries no area field)
        expect(p!.ring[0]!.lat).toBeGreaterThan(59);
        expect(p!.ring[0]!.lon).toBeLessThan(11);
    });

    it('DE-NRW / ALKIS GML (lat,lon) → flstkennz (underscores stripped) + flaeche + gemarkung', async () => {
        const p = await fetchEuParcelAtPoint('de-nrw', 6.773, 51.2288, { fetchImpl: fakeFetch(NRW_GML) });
        expect(p).not.toBeNull();
        expect(p!.refcat).toBe('05311000400273');
        expect(p!.areaM2).toBe(2355);
        expect(p!.address).toBe('Altstadt');
        expect(p!.ring[0]!.lat).toBeGreaterThan(51);
        expect(p!.ring[0]!.lon).toBeLessThan(7);
    });

    it('CH / swisstopo AV Esri-JSON (lon,lat) → EGRID refcat + canton+number address + derived area', async () => {
        const p = await fetchEuParcelAtPoint('ch', 8.5417, 47.3769, { fetchImpl: fakeFetch(CH_ESRI) });
        expect(p).not.toBeNull();
        expect(p!.refcat).toBe('CH119192997709'); // the federal EGRID, not the local parcel number
        expect(p!.address).toBe('ZH AA8048');
        expect(p!.areaM2).toBeGreaterThan(0); // no area attribute → derived from the ring
        // Esri rings are lon,lat → the ring must come back as {lat~47.37, lon~8.54}.
        expect(p!.ring[0]!.lat).toBeGreaterThan(47);
        expect(p!.ring[0]!.lon).toBeGreaterThan(8);
        expect(p!.ring[0]!.lon).toBeLessThan(9);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// L-651 — the three newly wired sources (PT / US-SF / US-CHI). Fixtures are copied verbatim from
// the live probes of 2026-07-31, so a drift in the real upstream shape breaks these.
// ══════════════════════════════════════════════════════════════════════════════════════════════

// PT — DGT SNIC INSPIRE WFS. Field names + coordinates from the live GetFeature.
const PT_GEOJSON = JSON.stringify({
    type: 'FeatureCollection',
    features: [{
        type: 'Feature',
        id: 'cadastralparcel.1108210701',
        geometry: { type: 'MultiPolygon', coordinates: [[[[-7.5540, 39.6709], [-7.5528, 39.6709], [-7.5528, 39.6717], [-7.5540, 39.6717], [-7.5540, 39.6709]]]] },
        properties: {
            inspireid: 'PT.DGT.CP.AAA001318684',
            nationalcadastralreference: 'AAA001318684',
            label: 'AAA 001 318 684',
            areavalue: 30568,
            administrativeunit: '051102',
        },
    }],
});

// US-SF — DataSF Socrata: a BARE ARRAY of flat rows, geometry under `shape` (⚠ not `the_geom`).
const SF_SOCRATA = JSON.stringify([{
    mapblklot: '3584032', blklot: '3584032', block_num: '3584', lot_num: '032',
    from_address_num: '3976', street_name: '19TH', street_type: 'ST',
    zoning_code: 'RH-2', active: true,
    shape: { type: 'MultiPolygon', coordinates: [[[[-122.4321, 37.7594], [-122.4319, 37.7594], [-122.4319, 37.7599], [-122.4321, 37.7599], [-122.4321, 37.7594]]]] },
}]);

// US-CHI — Cook County Socrata: same bare-array shape, geometry under `the_geom`.
const CHI_SOCRATA = JSON.stringify([{
    pin10: '1716424019', municipality: 'Chicago',
    the_geom: { type: 'MultiPolygon', coordinates: [[[[-87.6362, 41.8786], [-87.6356, 41.8786], [-87.6356, 41.8792], [-87.6362, 41.8792], [-87.6362, 41.8786]]]] },
}]);

describe('L-651 — newly wired sources (PT / US-SF / US-CHI)', () => {
    it('PT / DGT SNIC GeoJSON → national cadastral reference + declared areavalue + município', async () => {
        const p = await fetchEuParcelAtPoint('pt', -7.5534, 39.6713, { fetchImpl: fakeFetch(PT_GEOJSON) });
        expect(p).not.toBeNull();
        expect(p!.refcat).toBe('AAA001318684');
        expect(p!.areaM2).toBe(30568); // registry-declared, not derived
        expect(p!.address).toBe('051102');
        // Real WGS84 degrees, NOT projected EPSG:3763 metres (which would be ~10^5).
        expect(Math.abs(p!.ring[0]!.lat)).toBeLessThanOrEqual(90);
        expect(Math.abs(p!.ring[0]!.lon)).toBeLessThanOrEqual(180);
    });

    // THE AXIS-ORDER GOTCHA. Portugal's layer is native EPSG:3763 (projected), the exact case where a
    // bare `EPSG:4326` bbox is accepted and returns ZERO features. The URL must carry the authority
    // `urn:ogc:def:crs:EPSG::4326` form. This asserts the URL we actually issue, because the failure
    // mode is a silently-empty 200 — indistinguishable from "no parcel here" at the response level.
    it('PT issues the urn AUTHORITY bbox form (a bare EPSG:4326 bbox returns silently empty)', async () => {
        let seen = '';
        const spy = async (url: string) => { seen = url; return { ok: true, status: 200, text: async () => PT_GEOJSON }; };
        await fetchEuParcelAtPoint('pt', -7.5534, 39.6713, { fetchImpl: spy });
        expect(decodeURIComponent(seen)).toContain('urn:ogc:def:crs:EPSG::4326');
        expect(decodeURIComponent(seen)).toContain('typeNames=inspire:cadastralparcel');
        expect(decodeURIComponent(seen)).toContain('srsName=EPSG:4326');
    });

    it('US-SF / DataSF Socrata (geometry under `shape`) → blklot APN + street address', async () => {
        const p = await fetchEuParcelAtPoint('us-sf', -122.432, 37.7597, { fetchImpl: fakeFetch(SF_SOCRATA) });
        expect(p).not.toBeNull();
        expect(p!.refcat).toBe('3584032');
        expect(p!.address).toBe('3976 19TH ST');
        expect(p!.areaM2).toBeGreaterThan(0); // always geometry-derived (ambiguous upstream units)
        expect(p!.ring[0]!.lat).toBeGreaterThan(37);
        expect(p!.ring[0]!.lon).toBeLessThan(-122);
    });

    // Regression guard for the live-probe correction: DataSF names the column `shape`. If the parser
    // ever reverts to `the_geom`-only, a real SF row yields NO geometry and the click silently dies.
    it('US-SF ignores a row with no usable geometry column rather than inventing one', async () => {
        const noGeom = JSON.stringify([{ blklot: '3584032', the_geom: null, shape: null }]);
        expect(await fetchEuParcelAtPoint('us-sf', -122.432, 37.7597, { fetchImpl: fakeFetch(noGeom) })).toBeNull();
    });

    it('US-CHI / Cook County Socrata (geometry under `the_geom`) → 10-digit PIN + municipality', async () => {
        const p = await fetchEuParcelAtPoint('us-chi', -87.6359, 41.8789, { fetchImpl: fakeFetch(CHI_SOCRATA) });
        expect(p).not.toBeNull();
        expect(p!.refcat).toBe('1716424019');
        expect(p!.address).toBe('Chicago');
        expect(p!.areaM2).toBeGreaterThan(0);
    });

    it('the Socrata sources send a SoQL intersects point query in lon lat order', async () => {
        let seen = '';
        const spy = async (url: string) => { seen = url; return { ok: true, status: 200, text: async () => SF_SOCRATA }; };
        await fetchEuParcelAtPoint('us-sf', -122.432, 37.7597, { fetchImpl: spy });
        // URLSearchParams form-encodes spaces as `+`. Socrata accepts that (VERIFIED LIVE 2026-07-31:
        // this exact URL shape returned blklot 3584032), so the assertion normalises `+` → space
        // rather than changing the encoder to `%20`.
        const decoded = decodeURIComponent(seen).replace(/\+/g, ' ');
        expect(decoded).toContain("intersects(shape, 'POINT (-122.432 37.7597)')");
        expect(decoded).toContain('data.sfgov.org/resource/acdm-wktn.json');
    });

    it('the new guards short-circuit out-of-area clicks without an upstream call', async () => {
        for (const [cc, lon, lat] of [['pt', 2.35, 48.85], ['us-sf', -87.63, 41.87], ['us-chi', -122.43, 37.75]] as const) {
            let called = false;
            const spy = async () => { called = true; return { ok: true, status: 200, text: async () => '[]' }; };
            expect(await fetchEuParcelAtPoint(cc, lon, lat, { fetchImpl: spy })).toBeNull();
            expect(called, `${cc} should not call upstream for an out-of-area point`).toBe(false);
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// §CONTEXT-DATA-HONESTY (L-422/457/467/469) — a fetch FAILURE and a genuine "no parcel here" are
// DIFFERENT VALUES. Before L-651 both returned `null` from this module, so an outage silently
// became "this country has no parcels" and the client dropped to the OSM footprint without ever
// learning the authoritative source had failed.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('§CONTEXT-DATA-HONESTY — outage and empty never collapse', () => {
    it('an upstream that ANSWERS with zero features is `empty` (authoritative no-parcel)', async () => {
        const r = await resolveEuParcelOutcome('pt', -7.5534, 39.6713, {
            fetchImpl: fakeFetch('{"type":"FeatureCollection","features":[]}'),
        });
        expect(r.outcome).toBe('empty');
        expect(r.parcel).toBeNull();
    });

    it('an upstream that does NOT answer is `unreachable` — NOT the same value as empty', async () => {
        const down = await resolveEuParcelOutcome('pt', -7.5534, 39.6713, { fetchImpl: fakeFetch('', 500) });
        expect(down.outcome).toBe('unreachable');
        expect(down.parcel).toBeNull();

        const empty = await resolveEuParcelOutcome('pt', -7.5534, 39.6713, {
            fetchImpl: fakeFetch('{"type":"FeatureCollection","features":[]}'),
        });
        // The whole point: these two must not be the same verdict.
        expect(down.outcome).not.toBe(empty.outcome);
    });

    it('a malformed body is `empty` only if it parsed; an unparsable/absent body is unreachable', async () => {
        expect((await resolveEuParcelOutcome('pt', -7.5534, 39.6713, { fetchImpl: fakeFetch('not json') })).outcome).toBe('empty');
        expect((await resolveEuParcelOutcome('pt', -7.5534, 39.6713, { fetchImpl: fakeFetch('') })).outcome).toBe('unreachable');
    });

    it('out-of-area and unknown-source are their own verdicts, never "unreachable"', async () => {
        expect((await resolveEuParcelOutcome('pt', 2.35, 48.85, { fetchImpl: fakeFetch(PT_GEOJSON) })).outcome).toBe('out-of-area');
        expect((await resolveEuParcelOutcome('xx', 2.35, 48.85, { fetchImpl: fakeFetch(PT_GEOJSON) })).outcome).toBe('unknown-source');
        expect((await resolveEuParcelOutcome('pt', NaN, NaN, { fetchImpl: fakeFetch(PT_GEOJSON) })).outcome).toBe('bad-input');
    });

    it('a successful resolution reports `ok`', async () => {
        const r = await resolveEuParcelOutcome('pt', -7.5534, 39.6713, { fetchImpl: fakeFetch(PT_GEOJSON) });
        expect(r.outcome).toBe('ok');
        expect(r.parcel?.refcat).toBe('AAA001318684');
    });

    it('the legacy fetchEuParcelAtPoint signature is unchanged (parcel | null)', async () => {
        expect(await fetchEuParcelAtPoint('pt', -7.5534, 39.6713, { fetchImpl: fakeFetch(PT_GEOJSON) })).not.toBeNull();
        expect(await fetchEuParcelAtPoint('pt', -7.5534, 39.6713, { fetchImpl: fakeFetch('', 500) })).toBeNull();
    });
});

describe('fetchEuParcelAtPoint — guards + never-throws', () => {
    it('out-of-national-bbox short-circuits without calling the WFS', async () => {
        let called = false;
        const spy = async () => { called = true; return { ok: true, status: 200, text: async () => FR_GEOJSON }; };
        const p = await fetchEuParcelAtPoint('fr', -74, 40.7, { fetchImpl: spy }); // New York
        expect(p).toBeNull();
        expect(called).toBe(false);
    });

    it('unknown cc → null', async () => {
        expect(await fetchEuParcelAtPoint('xx', 2.35, 48.85, { fetchImpl: fakeFetch(FR_GEOJSON) })).toBeNull();
    });

    it('upstream non-OK / empty / malformed → null (never throws)', async () => {
        expect(await fetchEuParcelAtPoint('fr', 2.3522, 48.8566, { fetchImpl: fakeFetch('', 500) })).toBeNull();
        expect(await fetchEuParcelAtPoint('fr', 2.3522, 48.8566, { fetchImpl: fakeFetch('not json') })).toBeNull();
        expect(await fetchEuParcelAtPoint('nl', 4.8925, 52.373, { fetchImpl: fakeFetch('{"features":[]}') })).toBeNull();
        await expect(fetchEuParcelAtPoint('fr', NaN, NaN, { fetchImpl: fakeFetch(FR_GEOJSON) })).resolves.toBeNull();
    });

    it('exposes exactly the wired cadastres (L-651 added pt / us-sf / us-chi; lane PROXY-EE-LT-PL added ee / lt / pl)', () => {
        expect(Object.keys(EU_CADASTRE_SOURCES).sort()).toEqual([
            'ch', 'de-nrw', 'ee', 'fr', 'lt', 'nl', 'no', 'pl', 'pt', 'us-chi', 'us-sf',
        ]);
    });

    // L-651 — Brussels / Wallonia / Scotland have providers but NO reachable upstream (probed
    // 2026-07-31). They must stay OUT of this table: a dead `cc` here would answer every click in
    // those regions with an empty parcel, which reads as "no parcels exist here". An absent key
    // 404s instead — "there is no route", which is the true statement.
    it('does NOT wire the three unreachable jurisdictions as dead routes', () => {
        for (const cc of ['be-bru', 'be-wal', 'gb-sct']) {
            expect(EU_CADASTRE_SOURCES[cc]).toBeUndefined();
        }
    });

    it('CH guard short-circuits a click outside the Swiss bbox (no upstream call)', async () => {
        let called = false;
        const spy = async () => { called = true; return { ok: true, status: 200, text: async () => CH_ESRI }; };
        const p = await fetchEuParcelAtPoint('ch', 2.3522, 48.8566, { fetchImpl: spy }); // Paris
        expect(p).toBeNull();
        expect(called).toBe(false);
    });
});
