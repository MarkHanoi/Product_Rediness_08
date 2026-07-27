// L-613 — /api/parcel/:cc same-origin proxy: per-country WFS → WGS84-ring normalisation.
//
// Pins the "select a real parcel everywhere" behaviours with CAPTURED raw WFS fixtures (shapes
// verified live 2026-07-24 against each national cadastre) — never live network:
//   • FR / NL — GeoJSON (lon,lat); id + area from feature properties.
//   • NO / DE-NRW — GML 3.2.1 posList; NO is lon,lat, NRW is lat,lon (both live-confirmed).
//   • the parcel whose ring CONTAINS the click is chosen out of the bbox response.
//   • out-of-national-bbox / unknown cc / upstream failure → null (client falls to draw/footprint).

import { describe, expect, it, beforeEach } from 'vitest';
import { fetchEuParcelAtPoint, __resetEuCadastreCache, EU_CADASTRE_SOURCES } from '../euCadastreProxy.js';

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

    it('exposes exactly the five wired cadastres', () => {
        expect(Object.keys(EU_CADASTRE_SOURCES).sort()).toEqual(['ch', 'de-nrw', 'fr', 'nl', 'no']);
    });

    it('CH guard short-circuits a click outside the Swiss bbox (no upstream call)', async () => {
        let called = false;
        const spy = async () => { called = true; return { ok: true, status: 200, text: async () => CH_ESRI }; };
        const p = await fetchEuParcelAtPoint('ch', 2.3522, 48.8566, { fetchImpl: spy }); // Paris
        expect(p).toBeNull();
        expect(called).toBe(false);
    });
});
