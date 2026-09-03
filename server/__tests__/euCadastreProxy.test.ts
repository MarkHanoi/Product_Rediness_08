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

    it('exposes exactly the wired cadastres (L-651 pt/us-sf/us-chi; PROXY-EE-LT-PL ee/lt/pl; LU-PARCEL lu; PROXY-LEGS au-*/tr/qa/lv/hr/gr/si/sk)', () => {
        expect(Object.keys(EU_CADASTRE_SOURCES).sort()).toEqual([
            'au-act', 'au-nsw', 'au-qld', 'au-sa', 'au-tas', 'au-vic',
            'ch', 'de-nrw', 'ee', 'fr', 'gr', 'hr', 'lt', 'lu', 'lv',
            'nl', 'no', 'pl', 'pt', 'qa', 'si', 'sk', 'tr', 'us-chi', 'us-sf',
        ]);
    });

    // LANE PROXY-LEGS — IL is deliberately NOT a key: govmap's identify serves NO parcel ring
    // (centroid + extent only, measured — ilParcelProvider.ts header). Serving the extent
    // RECTANGLE as a boundary would be the L-616 overstatement family; the ring query is the IL
    // lane's recorded follow-up. The IL registry row self-corrects to the footprint on this 404.
    it('does NOT wire il (ring-less identify channel) — the 404 is the honest answer', () => {
        expect(EU_CADASTRE_SOURCES['il']).toBeUndefined();
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

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LANE PROXY-LEGS (2026-09-03) — the AU/TR/QA/LV/HR/GR/SI/SK wave. Fixtures mirror the adapter
// waves' live probes (ids quoted verbatim from the lane docs; every leg was ALSO re-proven live
// through these exact builders on 2026-09-03 — see audit/intl-parcels/2026-09-02/lane-proxy-legs.md).
// Offline here, always: shapes only, never the network.
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** A tiny square ArcGIS ring around (lon,lat) — Esri rings are [x,y] = [lon,lat] under outSR=4326. */
function esriSquare(lon: number, lat: number, d = 0.0004) {
    return { rings: [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]] };
}
/** The same square as GeoJSON Polygon coordinates. */
function geoSquare(lon: number, lat: number, d = 0.0004) {
    return { type: 'Polygon', coordinates: [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]] };
}

const AU_NSW_ARCGIS = JSON.stringify({
    features: [{ attributes: { lotidstring: '100//DP1048011', lotnumber: '100', planlabel: 'DP1048011' }, geometry: esriSquare(151.20658, -33.87344) }],
});

const AU_VIC_GEOJSON = JSON.stringify({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: geoSquare(144.9631, -37.8136), properties: { parcel_spi: 'PC366537', parcel_pfi: '152191430', parcel_plan_number: 'PC366537' } }],
});

// QLD serves the lot PLUS an "Unlinked parcel or interest" twin with null lotplan (measured @
// Brisbane) — both contain the click, so the id-less twin MUST be dropped before point-in-polygon.
const AU_QLD_ARCGIS = JSON.stringify({
    features: [
        { attributes: { lotplan: null, lot: null, plan: null, tenure: 'Unlinked parcel or interest' }, geometry: esriSquare(153.026, -27.4705) },
        { attributes: { lotplan: '47SP317615', lot: '47', plan: 'SP317615', tenure: 'Lands Lease', locality: 'Brisbane City' }, geometry: esriSquare(153.026, -27.4705) },
    ],
});

// SA serves parcel_id whitespace-PADDED ("C21367   F1", measured) + the CT title parts.
const AU_SA_ARCGIS = JSON.stringify({
    features: [{ attributes: { parcel_id: 'C21367   F1', plan_t: 'C', plan: '21367', parcel_t: 'F', parcel: '1', title_t: 'CT', volume: '5954', folio: '719' }, geometry: esriSquare(138.601, -34.9235) }],
});

const AU_TAS_ARCGIS = JSON.stringify({
    features: [{ attributes: { PID: 3321248, VOLUME: '40374', FOLIO: 3, PROP_ADD: '49-51 MURRAY ST HOBART TAS 7000', TENURE_TY: 'Council' }, geometry: esriSquare(147.3272, -42.8821) }],
});

// ACT @ Civic: 3 RETIRED (superseded, overlapping) + 1 APPROVED, no CURRENT (measured). A RETIRED
// block containing the click must never be asserted as the parcel.
const AU_ACT_ARCGIS = JSON.stringify({
    features: [
        { attributes: { BLOCK_NUMBER: 12, SECTION_NUMBER: 19, BLOCK_SECTION: '19/12', DISTRICT_NAME: 'CANBERRA CENTRAL', CURRENT_LIFECYCLE_STAGE: 'RETIRED' }, geometry: esriSquare(149.13, -35.2809) },
        { attributes: { BLOCK_NUMBER: 44, SECTION_NUMBER: 19, BLOCK_SECTION: '19/44', DISTRICT_NAME: 'CANBERRA CENTRAL', CURRENT_LIFECYCLE_STAGE: 'APPROVED' }, geometry: esriSquare(149.13, -35.2809) },
    ],
});

// TR — TKGM answers a BARE GeoJSON Feature (not a FeatureCollection), alan is a STRING (measured).
const TR_FEATURE = JSON.stringify({
    type: 'Feature',
    geometry: geoSquare(29.0576, 40.9819),
    properties: { adaNo: '3106', parselNo: '258', ilAd: 'Istanbul', ilceAd: 'Kadiköy', mahalleAd: 'Tuğlaci Başi', alan: '816.27', pafta: '151' },
});

const QA_ARCGIS = JSON.stringify({
    features: [{ attributes: { PIN: 1010028, CDST_KEY: 1010028, PD_NO: 'PD/4693/2019', PDAREA: 183494, GFCODE: 'PDGVCDST' }, geometry: esriSquare(51.531, 25.286) }],
});

const LV_GEOJSON = JSON.stringify({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: geoSquare(24.1052, 56.9496), properties: { code: '01000070006', property_code: '01000070006', address: 'Pils iela 23, Rīga, LV1050', area: 5537, area_scale: 5537.2 } }],
});

const HR_GEOJSON = JSON.stringify({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: geoSquare(15.9771, 45.8132), properties: { ID: 21606979, BROJ_CESTICE: '2379', MATICNI_BROJ_KO: 335240 } }],
});

const GR_ARCGIS = JSON.stringify({
    features: [{ attributes: { KAEK: '050095701001', MAIN_USE: '7300', DESCR: 'Άλλος κοινόχρηστος χώρος', AREA: 10839.77, PERIMETER: 587.9 }, geometry: esriSquare(23.7348, 37.9755) }],
});

const SI_GEOJSON = JSON.stringify({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: geoSquare(14.5058, 46.0569), properties: { KO_ID: 1725, ST_PARCELE: '3274/13', EID_PARCELA: 'SI0123456789', POVRSINA: 19141, NAZIV: '1725 AJDOVŠČINA' } }],
});

const SK_ARCGIS = JSON.stringify({
    features: [{ attributes: { ID: 2090872505, PARCEL_NUMBER: '15', CADASTRAL_UNIT_ID: 2933, DESCRIPTIVE_AREA_OF_PARCEL: 832, FOLIO_ID: 335384911 }, geometry: esriSquare(17.1077, 48.1436) }],
});

describe('LANE PROXY-LEGS — Australia (six state cadastres)', () => {
    it('AU-NSW → lotidstring refcat + geometry-derived area', async () => {
        const p = await fetchEuParcelAtPoint('au-nsw', 151.20658, -33.87344, { fetchImpl: fakeFetch(AU_NSW_ARCGIS) });
        expect(p).not.toBeNull();
        expect(p!.refcat).toBe('100//DP1048011');
        expect(p!.areaM2).toBeGreaterThan(0); // ALWAYS geometry-derived for AU (ambiguous upstream units)
    });

    it('AU-NSW issues an ArcGIS point-intersect with inSR/outSR 4326 and explicit outFields', async () => {
        let seen = '';
        const spy = async (url: string) => { seen = url; return { ok: true, status: 200, text: async () => AU_NSW_ARCGIS }; };
        await fetchEuParcelAtPoint('au-nsw', 151.20658, -33.87344, { fetchImpl: spy });
        const decoded = decodeURIComponent(seen);
        expect(decoded).toContain('portal.spatial.nsw.gov.au/server/rest/services/NSW_Land_Parcel_Property_Theme/FeatureServer/8/query');
        expect(decoded).toContain('inSR=4326');
        expect(decoded).toContain('outSR=4326');
        expect(decoded).toContain('lotidstring');
        expect(decoded).not.toContain('outFields=*');
    });

    it('AU-VIC → SPI refcat; the CQL INTERSECTS point is LAT,LON order (lon,lat silently returns 0 — measured)', async () => {
        let seen = '';
        const spy = async (url: string) => { seen = url; return { ok: true, status: 200, text: async () => AU_VIC_GEOJSON }; };
        const p = await fetchEuParcelAtPoint('au-vic', 144.9631, -37.8136, { fetchImpl: spy });
        expect(p!.refcat).toBe('PC366537');
        const decoded = decodeURIComponent(seen).replace(/\+/g, ' ');
        expect(decoded).toContain('opendata.maps.vic.gov.au/geoserver/wfs');
        expect(decoded).toContain('typeNames=open-data-platform:v_parcel_mp');
        // LAT first inside POINT — the load-bearing axis pin.
        expect(decoded).toContain('INTERSECTS(geom,POINT(-37.8136 144.9631))');
    });

    it('AU-QLD → lotplan refcat; the id-less "Unlinked parcel" twin is dropped BEFORE point-in-polygon', async () => {
        const p = await fetchEuParcelAtPoint('au-qld', 153.026, -27.4705, { fetchImpl: fakeFetch(AU_QLD_ARCGIS) });
        expect(p).not.toBeNull();
        expect(p!.refcat).toBe('47SP317615'); // never the null-lotplan twin, though it also contains the click
        expect(p!.address).toBe('Brisbane City');
    });

    it('AU-SA injects the documented public SAPPA Referer server-side (soft CloudFront WAF: 403 bare, 200 with)', async () => {
        let seenHeaders: Record<string, string> | undefined;
        const spy = async (_url: string, init?: { headers?: Record<string, string> }) => {
            seenHeaders = init?.headers;
            return { ok: true, status: 200, text: async () => AU_SA_ARCGIS };
        };
        const p = await fetchEuParcelAtPoint('au-sa', 138.601, -34.9235, { fetchImpl: spy });
        expect(seenHeaders?.Referer).toBe('https://sappa.plan.sa.gov.au/');
        // parcel_id arrives whitespace-padded — collapsed; CT title rides as the info-card address.
        expect(p!.refcat).toBe('C21367 F1');
        expect(p!.address).toBe('CT 5954/719');
    });

    it('AU-TAS → PID refcat + street address', async () => {
        const p = await fetchEuParcelAtPoint('au-tas', 147.3272, -42.8821, { fetchImpl: fakeFetch(AU_TAS_ARCGIS) });
        expect(p!.refcat).toBe('3321248');
        expect(p!.address).toBe('49-51 MURRAY ST HOBART TAS 7000');
    });

    it('AU-ACT drops RETIRED blocks and composes block/section from the EXPLICIT fields (BLOCK_SECTION is section/block order)', async () => {
        const p = await fetchEuParcelAtPoint('au-act', 149.13, -35.2809, { fetchImpl: fakeFetch(AU_ACT_ARCGIS) });
        expect(p).not.toBeNull();
        // The RETIRED block 12/19 also contains the click — the APPROVED block 44/19 must win.
        expect(p!.refcat).toBe('44/19');
        expect(p!.address).toBe('CANBERRA CENTRAL');
    });

    it('the AU guards fence each state (a Melbourne click never reaches the NSW service)', async () => {
        let called = false;
        const spy = async () => { called = true; return { ok: true, status: 200, text: async () => AU_NSW_ARCGIS }; };
        expect(await fetchEuParcelAtPoint('au-nsw', 144.9631, -37.8136, { fetchImpl: spy })).toBeNull();
        expect(called).toBe(false);
    });
});

describe('LANE PROXY-LEGS — Turkey (TKGM parsel)', () => {
    it('TR parses the BARE GeoJSON Feature body → ada/parsel refcat + served alan (a string) + composed address', async () => {
        const p = await fetchEuParcelAtPoint('tr', 29.0576, 40.9819, { fetchImpl: fakeFetch(TR_FEATURE) });
        expect(p).not.toBeNull();
        expect(p!.refcat).toBe('3106/258');
        expect(p!.areaM2).toBeCloseTo(816.27, 2);
        expect(p!.address).toBe('Tuğlaci Başi, Kadiköy, Istanbul');
    });

    it('TR builds the LAT-then-LON path form (measured path-param order)', async () => {
        let seen = '';
        const spy = async (url: string) => { seen = url; return { ok: true, status: 200, text: async () => TR_FEATURE }; };
        await fetchEuParcelAtPoint('tr', 29.0576, 40.9819, { fetchImpl: spy });
        expect(seen).toBe('https://cbsapi.tkgm.gov.tr/megsiswebapi.v3/api/parsel/40.9819/29.0576');
    });

    it('the TKGM 404 is SEMANTIC ("Parsel Bulunamadı") → `empty`, never `unreachable` — and only for TR', async () => {
        const notFound = fakeFetch('{"Message":"Parsel Bulunamadı: Enlem = 40.98 - Boylam=29.05"}', 404);
        const tr = await resolveEuParcelOutcome('tr', 29.0576, 40.9819, { fetchImpl: notFound });
        expect(tr.outcome).toBe('empty'); // a durable, authoritative "no parcel here"
        // Every other source keeps 404 → unreachable (for a query endpoint a 404 IS a broken route).
        const fr = await resolveEuParcelOutcome('fr', 2.3522, 48.8566, { fetchImpl: fakeFetch('', 404) });
        expect(fr.outcome).toBe('unreachable');
    });
});

describe('LANE PROXY-LEGS — Qatar / Latvia / Croatia / Greece / Slovenia / Slovakia', () => {
    it('QA → PIN refcat + served PDAREA (surveyed m², not a zoning figure)', async () => {
        const p = await fetchEuParcelAtPoint('qa', 51.531, 25.286, { fetchImpl: fakeFetch(QA_ARCGIS) });
        expect(p!.refcat).toBe('1010028');
        expect(p!.areaM2).toBe(183494);
        expect(p!.address).toBeNull(); // no address field is served — never invented
    });

    it('QA issues the CadastrePlots query in the adapter-measured shape (outSR=4326)', async () => {
        let seen = '';
        const spy = async (url: string) => { seen = url; return { ok: true, status: 200, text: async () => QA_ARCGIS }; };
        await fetchEuParcelAtPoint('qa', 51.531, 25.286, { fetchImpl: spy });
        const decoded = decodeURIComponent(seen);
        expect(decoded).toContain('services.gisqatar.org.qa/server/rest/services/Vector/CadastrePlots/MapServer/0/query');
        expect(decoded).toContain('outSR=4326');
    });

    it('LV → cadastral code refcat + registered area + address', async () => {
        const p = await fetchEuParcelAtPoint('lv', 24.1052, 56.9496, { fetchImpl: fakeFetch(LV_GEOJSON) });
        expect(p!.refcat).toBe('01000070006');
        expect(p!.areaM2).toBe(5537); // the cadastre's own `area`, never derived when served
        expect(p!.address).toBe('Pils iela 23, Rīga, LV1050');
    });

    it('LV issues the urn AUTHORITY form for BOTH srsName and bbox, with a SMALL dense-parcel window', async () => {
        let seen = '';
        const spy = async (url: string) => { seen = url; return { ok: true, status: 200, text: async () => LV_GEOJSON }; };
        await fetchEuParcelAtPoint('lv', 24.1052, 56.9496, { fetchImpl: spy });
        const decoded = decodeURIComponent(seen);
        expect(decoded).toContain('geolatvija.lv/geoserver/vraa/wfs');
        expect(decoded).toContain('typeNames=vraa:parcel');
        expect(decoded).toContain('srsName=urn:ogc:def:crs:EPSG::4326');
        // ±0.0001 lat,lon window, lat-first, urn-terminated (float-safe: parse the bbox back).
        const bbox = new URL(seen).searchParams.get('bbox')!;
        const parts = bbox.split(',');
        expect(parts).toHaveLength(5);
        expect(Number(parts[0])).toBeCloseTo(56.9495, 6); // latMin FIRST — the urn axis order
        expect(Number(parts[1])).toBeCloseTo(24.1051, 6);
        expect(Number(parts[2])).toBeCloseTo(56.9497, 6);
        expect(Number(parts[3])).toBeCloseTo(24.1053, 6);
        expect(parts[4]).toBe('urn:ogc:def:crs:EPSG::4326');
    });

    it('HR → composed "k.č. …, k.o. …" refcat (the adapter own composition; NOT the INSPIRE harmonized key)', async () => {
        const p = await fetchEuParcelAtPoint('hr', 15.9771, 45.8132, { fetchImpl: fakeFetch(HR_GEOJSON) });
        expect(p!.refcat).toBe('k.č. 2379, k.o. 335240');
        expect(p!.areaM2).toBeGreaterThan(0); // no area field served → geometry-derived
    });

    it('HR asks srsName=EPSG:4326 for OUTPUT (measured 2026-09-03: honoured; without it the ring is native EPSG:3765 metres)', async () => {
        let seen = '';
        const spy = async (url: string) => { seen = url; return { ok: true, status: 200, text: async () => HR_GEOJSON }; };
        await fetchEuParcelAtPoint('hr', 15.9771, 45.8132, { fetchImpl: spy });
        const decoded = decodeURIComponent(seen);
        expect(decoded).toContain('api.uredjenazemlja.hr/services/inspire/cp_wms/wfs');
        expect(decoded).toContain('typeNames=cp_wms:CP.CadastralParcel');
        expect(decoded).toContain('srsName=EPSG:4326');
        expect(decoded).toContain('urn:ogc:def:crs:EPSG::4326'); // the entry bbox authority form
    });

    it('GR → KAEK refcat + served AREA; DESCR (a land-use text) is deliberately NOT surfaced as an address', async () => {
        const p = await fetchEuParcelAtPoint('gr', 23.7348, 37.9755, { fetchImpl: fakeFetch(GR_ARCGIS) });
        expect(p!.refcat).toBe('050095701001');
        expect(p!.areaM2).toBeCloseTo(10839.77, 2);
        expect(p!.address).toBeNull();
    });

    it('SI → KO_ID + ST_PARCELE refcat + POVRSINA + NAZIV (the queued B3 shape, applied)', async () => {
        const p = await fetchEuParcelAtPoint('si', 14.5058, 46.0569, { fetchImpl: fakeFetch(SI_GEOJSON) });
        expect(p!.refcat).toBe('1725 3274/13');
        expect(p!.areaM2).toBe(19141);
        expect(p!.address).toBe('1725 AJDOVŠČINA');
    });

    it('SK → composed parc. č./k.ú. refcat + register area; the query is SPATIAL — NO where= (the ESKN WAF 403s any where clause)', async () => {
        let seen = '';
        const spy = async (url: string) => { seen = url; return { ok: true, status: 200, text: async () => SK_ARCGIS }; };
        const p = await fetchEuParcelAtPoint('sk', 17.1077, 48.1436, { fetchImpl: spy });
        expect(p!.refcat).toBe('parc. č. 15, k.ú. 2933');
        expect(p!.areaM2).toBe(832);
        const decoded = decodeURIComponent(seen);
        expect(decoded).toContain('kataster.skgeodesy.sk/eskn/rest/services/VRM/kn/MapServer/9/query');
        expect(decoded).not.toContain('where='); // ⛔ the WAF pin — a where= clause is HTTP 403
    });

    it('an ArcGIS error body on the new arcgis legs stays `unreachable`, never `empty`', async () => {
        const errBody = fakeFetch('{"error":{"code":400,"message":"Invalid parameters"}}');
        for (const [cc, lon, lat] of [['gr', 23.7348, 37.9755], ['sk', 17.1077, 48.1436], ['qa', 51.531, 25.286], ['au-nsw', 151.20658, -33.87344]] as const) {
            const r = await resolveEuParcelOutcome(cc, lon, lat, { fetchImpl: errBody });
            expect(r.outcome, `${cc} must classify an ArcGIS error body as unreachable`).toBe('unreachable');
        }
    });

    it('the new guards short-circuit out-of-area clicks without an upstream call', async () => {
        for (const [cc, lon, lat] of [['tr', 2.35, 48.85], ['qa', 24.11, 56.95], ['lv', 51.53, 25.29], ['hr', 23.73, 37.98], ['gr', 15.98, 45.81], ['si', 17.11, 48.14], ['sk', 14.51, 46.06]] as const) {
            let called = false;
            const spy = async () => { called = true; return { ok: true, status: 200, text: async () => '{"features":[]}' }; };
            expect(await fetchEuParcelAtPoint(cc, lon, lat, { fetchImpl: spy })).toBeNull();
            expect(called, `${cc} must not call upstream for an out-of-area point`).toBe(false);
        }
    });
});
