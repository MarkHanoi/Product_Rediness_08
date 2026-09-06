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
        // §L-12912 — `administrativeunit` is a DICOFRE code, labelled so it cannot read as an address.
        expect(p!.address).toBe('DICOFRE 051102');
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

// ══════════════════════════════════════════════════════════════════════════════════════════════
// §L-12912 — BELVERDE (Seixal, PT), founder screenshot 2026-09-05. Attributes copied VERBATIM from
// the live SNIC GetFeature of 2026-09-05 (docs/04-reference/jurisdictions/pt/findings/
// belverde-parcel-probe.mjs): the register serves ONE 766 ha prédio under the whole urbanisation,
// with `areavalue` 7 662 344 m² PUBLISHED. The ring is trimmed to a ~2.77 km square of the same
// order so the shoelace is close to, but NOT equal to, the registry figure.
// ══════════════════════════════════════════════════════════════════════════════════════════════
const PT_BELVERDE_GEOJSON = JSON.stringify({
    type: 'FeatureCollection',
    numberMatched: 1,
    numberReturned: 1,
    features: [{
        type: 'Feature',
        id: 'cadastralparcel.1174096819',
        geometry: { type: 'MultiPolygon', coordinates: [[[[-9.166, 38.5725], [-9.134, 38.5725], [-9.134, 38.5975], [-9.166, 38.5975], [-9.166, 38.5725]]]] },
        properties: {
            inspireid: 'PT.DGT.CP.AAA000091722',
            label: 'AAA 000 091 722',
            nationalcadastralreference: 'AAA000091722',
            areavalue: 7662344,
            validfrom: null,
            validto: null,
            beginlifespanversion: '2023-11-21T00:00:00Z',
            endlifespanversion: null,
            administrativeunit: '151002',
        },
    }],
});

describe('§L-12912 — the two areas leave the proxy as two fields (C57 §2.4 / KV-3 on the EU legs)', () => {
    it('PT / Belverde: the served areavalue is `areaOfficialM2`, the shoelace is `areaSigM2`, and they differ', async () => {
        const r = await resolveEuParcelOutcome('pt', -9.15, 38.585, { fetchImpl: fakeFetch(PT_BELVERDE_GEOJSON) });
        // The SERVER does not refuse: this ring IS the register's answer. The size review belongs to
        // the card (apps/editor …/parcelSizeReview.ts), which needs the true figures to say so.
        expect(r.outcome).toBe('ok');
        const p = r.parcel!;
        expect(p.refcat).toBe('AAA000091722');
        expect(p.areaOfficialM2).toBe(7662344);
        expect(p.areaM2).toBe(7662344);
        expect(p.areaSigM2).toBeGreaterThan(7_000_000);
        expect(p.areaSigM2).toBeLessThan(8_500_000);
        expect(p.areaSigM2).not.toBe(p.areaOfficialM2);
        expect(p.address).toBe('DICOFRE 151002');
    });

    it('PT without an areavalue: `areaOfficialM2` is null and `areaM2` IS the shoelace — never a zero, never invented', async () => {
        const noArea = JSON.parse(PT_BELVERDE_GEOJSON);
        delete noArea.features[0].properties.areavalue;
        const p = await fetchEuParcelAtPoint('pt', -9.15, 38.585, { fetchImpl: fakeFetch(JSON.stringify(noArea)) });
        expect(p!.areaOfficialM2).toBeNull();
        expect(p!.areaSigM2).toBeGreaterThan(0);
        expect(p!.areaM2).toBe(p!.areaSigM2);
    });

    it('a leg that reads a served area without saying so explicitly (FR contenance) still forwards it as registry-declared', async () => {
        const p = await fetchEuParcelAtPoint('fr', 2.3522, 48.8566, { fetchImpl: fakeFetch(FR_GEOJSON) });
        expect(p!.areaOfficialM2).toBe(15168);
        expect(p!.areaSigM2).toBeGreaterThan(0);
        expect(p!.areaSigM2).not.toBe(15168);
    });

    it('a geometry-only leg (NO) forwards NO registry area — `areaOfficialM2` null, `areaM2` equals the shoelace', async () => {
        const p = await fetchEuParcelAtPoint('no', 10.7522, 59.9139, { fetchImpl: fakeFetch(NO_GML) });
        expect(p!.areaOfficialM2).toBeNull();
        expect(p!.areaM2).toBe(p!.areaSigM2);
    });
});

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

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LANE PT-PARCEL-ACCURACY (2026-09-03) — the declared-incomplete coverage note.
// Founder report: "parcels in Portugal are not accurate." Measured root cause (transcripts
// audit/demo-esfrpt/2026-09-02/transcripts/pt-accuracy/): the DGT Cadastro Predial publishes ZERO
// parcels for Lisboa and Porto municípios (numberMatched=0 at central Lisboa AND across the whole
// Porto city bbox) while holding 1,789,672 parcels nationally — so an urban PT click resolves
// `empty` and the client falls to the OSM building footprint. For such a source, `empty` is
// USUALLY "no cadastre published for this área", not "no parcel exists here" — the pt leg's
// `coverageNote` says so on every empty, and ONLY on empty.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('§PT-PARCEL-ACCURACY — declared-incomplete coverage rides every PT empty', () => {
    const EMPTY_FC = '{"type":"FeatureCollection","features":[]}';

    it('a PT `empty` carries the coverageNote naming the Lisboa/Porto publishing gap', async () => {
        const r = await resolveEuParcelOutcome('pt', -9.1393, 38.7223, { fetchImpl: fakeFetch(EMPTY_FC) });
        expect(r.outcome).toBe('empty');
        expect(r.coverageNote).toBeTypeOf('string');
        expect(r.coverageNote).toContain('per-município');
        expect(r.coverageNote).toContain('Lisboa');
        // The note must deny the "no parcel exists here" reading, not soften into it.
        expect(r.coverageNote).toContain('no cadastre published');
    });

    it('a PT `ok` does NOT carry the note — a resolved parcel needs no coverage apology', async () => {
        const r = await resolveEuParcelOutcome('pt', -7.5534, 39.6713, { fetchImpl: fakeFetch(PT_GEOJSON) });
        expect(r.outcome).toBe('ok');
        expect(r.coverageNote).toBeUndefined();
    });

    it('a PT `unreachable` does NOT carry the note — an outage is not a coverage fact', async () => {
        const r = await resolveEuParcelOutcome('pt', -9.1393, 38.7223, { fetchImpl: fakeFetch('', 500) });
        expect(r.outcome).toBe('unreachable');
        expect(r.coverageNote).toBeUndefined();
    });

    it('an `empty` from a source WITHOUT a declared note stays undecorated (FR)', async () => {
        const r = await resolveEuParcelOutcome('fr', 2.3522, 48.8566, { fetchImpl: fakeFetch(EMPTY_FC) });
        expect(r.outcome).toBe('empty');
        expect(r.coverageNote).toBeUndefined();
    });

    it('the pt config is the only one declaring a coverageNote today (add deliberately, never by copy-paste)', () => {
        const noted = Object.entries(EU_CADASTRE_SOURCES)
            .filter(([, cfg]) => typeof (cfg as { coverageNote?: unknown }).coverageNote === 'string')
            .map(([cc]) => cc);
        expect(noted).toEqual(['pt']);
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

    it('exposes exactly the wired cadastres (L-651 pt/us-sf/us-chi; PROXY-EE-LT-PL ee/lt/pl; LU-PARCEL lu; PROXY-LEGS au-*/tr/qa/lv/hr/gr/si/sk; PARCEL-REACH it/bg/be-vlg/gb + 5 us; PARCEL-REACH-2 cz/ie/at + 14 de-*; USA-PARCELS + 9 us; USA-PARCELS-W2 + 5 us states)', () => {
        expect(Object.keys(EU_CADASTRE_SOURCES).sort()).toEqual([
            'at', 'au-act', 'au-nsw', 'au-qld', 'au-sa', 'au-tas', 'au-vic',
            'be-vlg', 'bg', 'ch', 'cz',
            // GERMANY — 14 Länder. ⛔ 'de-by' is ABSENT ON PURPOSE: Bayern's INSPIRE ALKIS WFS
            // answers 401 `WWW-Authenticate: Basic realm="INSPIRE-WFS ALKIS"` and its whole
            // open-data catalogue is raster. A key here would advertise Bayern as wired.
            'de-bb', 'de-be', 'de-bw', 'de-hb', 'de-he', 'de-hh', 'de-mv', 'de-ni', 'de-nrw',
            'de-rp', 'de-sh', 'de-sl', 'de-sn', 'de-st', 'de-th',
            'ee', 'fr', 'gb', 'gr', 'hr', 'ie', 'it',
            // 'nz' — LANE NZ-EVERYWHERE 2026-09-05: the first KEYED leg (LINZ_API_KEY, C57 §1.2);
            // without the key it answers `unconfigured`, never a parcel — see nzLinzParcelLeg.test.ts.
            'lt', 'lu', 'lv', 'nl', 'no', 'nz', 'pl', 'pt', 'qa', 'si', 'sk', 'tr',
            // LANE USA-PARCELS (2026-09-06) — +7 STATES (nc/ny/oh/wi/mt/ut/va) and +2 COUNTIES
            // (ca-la/az-maricopa). ⛔ 'us-tx' is ABSENT ON PURPOSE: the Texas StratMap statewide
            // aggregate IS live at feature.geographic.texas.gov, but its REST query capability —
            // ADVERTISED as `capabilities: "Query,Map"` — answers HTTP 200 with
            // {"error":{"code":400,"extendedCode":-2147220222,"message":"Requested operation is not
            // supported by this service."}} for every query, and its WMS GetFeatureInfo returns real
            // attributes with `"geometry": null`. Identity without a ring; a key here would
            // advertise Texas as wired. See USA_PARCEL_REFUSALS for the verbatim transcript.
            // LANE USA-PARCELS WAVE 2 (2026-09-06) — +5 WHOLE STATES: nj/vt/ct/in/md, every one
            // measured CLEAN against its own denominator (NJ 21/21 counties · VT 256 towns ·
            // CT 169/169 towns · IN 92/92 counties · MD 24/24 jurisdictions).
            // ⭐ 'us-nj' AND 'us-md' EXIST BECAUSE A REFUSAL WAS WRONG, and both were wrong the
            // same way: the earlier probe named the WRONG HOST and recorded its answer as the
            // STATE's. NJ was probed at mapsdep.nj.gov (the DEP host — no parcels there, true, and
            // irrelevant); the parcels are on the NJGIN/NJOGIS AGOL org. MD was probed at
            // geodata.md.gov, which returned 503 and STILL DOES — the live host is
            // mdgeodata.md.gov, an `md` PREFIX. ⛔ Do not "correct" either URL back.
            'us-az-maricopa', 'us-ca-la', 'us-chi', 'us-ct', 'us-fl', 'us-in', 'us-ma', 'us-md',
            'us-mt', 'us-nc', 'us-nj', 'us-ny', 'us-nyc', 'us-oh', 'us-sf', 'us-tx-harris',
            'us-ut', 'us-va', 'us-vt', 'us-wa-king', 'us-wi',
        ]);
    });

    // LANE PARCEL-REACH (2026-09-03) — the five US rows below were registered `kind:'cadastral'`
    // with a proxyPath in registry.ts but had NO key here, so `/api/parcel/us-ma` answered
    // HTTP 404 "Unknown cadastre" in production and every Boston/Miami/Seattle/Houston/NYC click
    // fell silently to the OSM footprint while the registry verdict still read "cadastral".
    // This test is the standing guard against that whole class: a registry row that PROMISES a
    // cadastre must have a route that can DELIVER one. It is keyed on the registry, not on a
    // hand-copied list, so a future row cannot be added without either a leg or an explicit,
    // reasoned exemption below.
    //
    // ⭐ `/api/parcel/gb` WAS on the RING_LESS list and has been REMOVED (lane PARCEL-REACH,
    // 2026-09-04). Its stated reason — "HMLR INSPIRE is a per-LPA bulk download, no keyless
    // point query" — is true of HMLR's OWN endpoints and FALSE of the route the `gb` leg
    // actually uses: MHCLG's Planning Data platform re-publishes the same polygons under OGL v3
    // behind a working keyless point query — live-probed 2026-09-04 at 10 Downing Street,
    // HTTP 200 application/json, reference 48203540, 5-vertex WGS84 ring. Leaving a DELIVERED
    // row exempt would let this guard pass while blind to it: an exemption is honest only for as
    // long as its reason holds, so it is deleted the moment the leg lands.
    // ⚠ EXPLICIT 60 s TIMEOUT, and it is not padding. This test dynamically imports registry.ts;
    // on a COLD vitest transform cache that ONE import measured 21.9 s (vitest's own
    // `transform 32.82s, import 21.91s`) against the 10 s default, so the test PASSED on a warm
    // cache and FAILED on a clean checkout — green for a reason unrelated to what it asserts.
    // It performs NO network I/O; the whole budget is transform cost.
    it('every registry row promising a cadastre has a proxy leg that can deliver it', async () => {
        const { listParcelJurisdictions } = await import(
            '../../packages/site-parcel-data/src/parcelProviders/registry.js'
        );
        // Routes served by their OWN handler rather than the /api/parcel/:cc table.
        const OWN_HANDLER = new Set(['/api/catastro/parcel', '/api/parcel/dk']);
        // Reasoned exemptions — each is a row whose upstream cannot yet serve a RING. They keep a
        // proxyPath so the intent is recorded, and the 404 self-corrects to the footprint, which is
        // the honest answer. ⛔ Do NOT add a row here to silence this test: the bar is "the upstream
        // cannot serve a boundary", not "we have not got round to it".
        const RING_LESS = new Set([
            '/api/parcel/il', // govmap identify serves centroid + extent only — see the IL test above
            '/api/parcel/fi', // MML OGC API is key-gated; no key is carried in this environment
        ]);
        const promised = listParcelJurisdictions()
            .filter((j: { kind: string; proxyPath: string | null }) => j.kind === 'cadastral' && j.proxyPath)
            .map((j: { regionCode: string; proxyPath: string }) => j);
        const undelivered = promised
            .filter((j: { proxyPath: string }) => !OWN_HANDLER.has(j.proxyPath) && !RING_LESS.has(j.proxyPath))
            .filter((j: { proxyPath: string }) => {
                const cc = j.proxyPath.replace('/api/parcel/', '');
                return EU_CADASTRE_SOURCES[cc] === undefined;
            })
            .map((j: { regionCode: string; proxyPath: string }) => `${j.regionCode} → ${j.proxyPath}`);
        expect(undelivered).toEqual([]);
    }, 60_000);

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

    // Lane PARCEL-REACH round 3 (2026-09-04): Malta sits inside the Italian rectangle. Before the
    // carve-out a Valletta click reached the Agenzia WFS (which cannot serve Malta) and paid Italy's
    // 25 s deadline before the footprint appeared. `out-of-area` is the true answer and costs nothing.
    it('IT guard carves out MALTA (out-of-area, no upstream call) while Sicily just north still resolves', async () => {
        let called = false;
        const spy = async () => { called = true; return { ok: true, status: 200, text: async () => '<x/>' }; };
        const valletta = await resolveEuParcelOutcome('it', 14.5146, 35.8989, { fetchImpl: spy });
        expect(valletta.outcome).toBe('out-of-area');
        expect(called).toBe(false);
        const pozzallo = await resolveEuParcelOutcome('it', 14.8497, 36.7306, { fetchImpl: spy });
        expect(called).toBe(true); // Pozzallo (Sicily) DOES reach the Italian cadastre
        expect(pozzallo.outcome).not.toBe('out-of-area');
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

// ⛔ LV CONTAINMENT — the fixture above is a ONE-FEATURE fake and therefore CANNOT falsify the
// containment claim: with a single candidate `pickCandidate` has nothing to choose from, so the
// test that uses it passes whether the leg picks the container or simply takes `features[0]`
// ([[fake-more-capable-than-real]]). The one below reproduces what geolatvija ACTUALLY serves at
// the Rīga golden point, so the pick is load-bearing.
//
// MEASURED LIVE 2026-09-04 (lane PARCEL-REACH round 4), upstream AND through
// https://pryzm.fly.dev/api/parcel/lv?lon=24.1052&lat=56.9496 — both:
//     HTTP 200 · application/json;charset=UTF-8 · 5250 B
//     → refcat 01000070162 · area 5768 m² · 41-vertex ring · v0 56.949201,24.103611
// The dense old-town bbox holds SEVERAL candidates and the FIRST one served is 01000070006
// ("Pils iela 23"), which does NOT contain the click. A `features[0]` leg answers 01000070006 —
// the ADJACENT parcel — under a confident cadastral label, which is the C58 §1.4 false-provenance
// failure at parcel scale rather than at country scale.
const LV_GEOJSON_MULTI = JSON.stringify({
    type: 'FeatureCollection',
    features: [
        // [0] served FIRST by the WFS; its ring lies WEST of the click and does not contain it.
        { type: 'Feature', geometry: geoSquare(24.1040, 56.9490), properties: { code: '01000070006', property_code: '01000070006', address: 'Pils iela 23, Rīga, LV1050', area: 5537, area_scale: 5537.2 } },
        // [1] the TRUE container — the answer the live leg returns.
        { type: 'Feature', geometry: geoSquare(24.1052, 56.9496), properties: { code: '01000070162', property_code: '01000070162', area: 5768, area_scale: 5768.0 } },
        // [2] a third neighbour EAST of the click, so "last feature wins" is falsified too.
        { type: 'Feature', geometry: geoSquare(24.1065, 56.9502), properties: { code: '01000070008', property_code: '01000070008', address: 'Doma laukums 4, Rīga', area: 3210, area_scale: 3210.0 } },
    ],
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

    // ⭐ THE CONTAINMENT PIN (lane PARCEL-REACH round 4, 2026-09-04). Rīga must resolve
    // 01000070162, NEVER 01000070006 — see LV_GEOJSON_MULTI's header for the live evidence.
    it('LV picks the ring that CONTAINS the click (01000070162), not the first feature (01000070006)', async () => {
        const p = await fetchEuParcelAtPoint('lv', 24.1052, 56.9496, { fetchImpl: fakeFetch(LV_GEOJSON_MULTI) });
        expect(p!.refcat).toBe('01000070162');
        expect(p!.areaM2).toBe(5768);
        // The two falsification controls, asserted by name so a regression cannot read as a pass.
        expect(p!.refcat).not.toBe('01000070006'); // features[0] — the adjacent parcel
        expect(p!.refcat).not.toBe('01000070008'); // features[2] — "last feature wins"
    });

    it('LV containment survives the WFS reordering the SAME three candidates', async () => {
        // Order is a property of the service, not of the answer. Reversing it must change nothing;
        // if it does, the leg is reading position rather than geometry.
        const reversed = JSON.stringify({
            type: 'FeatureCollection',
            features: JSON.parse(LV_GEOJSON_MULTI).features.slice().reverse(),
        });
        __resetEuCadastreCache();
        const p = await fetchEuParcelAtPoint('lv', 24.1052, 56.9496, { fetchImpl: fakeFetch(reversed) });
        expect(p!.refcat).toBe('01000070162');
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

// ── LANE PARCEL-REACH (2026-09-04) — CZ / IE / AT ───────────────────────────────────────────────
// Fixtures are TRIMMED CAPTURES of real 2026-09-04 responses (rings shortened to a small square;
// every attribute is verbatim). Each test pins the ONE thing that, if it silently regressed, would
// hand the user a plausible-looking wrong answer rather than an error.

// CZECHIA — ČÚZK INSPIRE. posList is LAT-FIRST; the municipality/cadastral-district names live in
// `xlink:title` ATTRIBUTES on self-closing elements, and `areaValue` carries an official m² figure.
const CZ_GML = `<?xml version="1.0" encoding="utf-8"?>
<FeatureCollection xmlns="http://www.opengis.net/wfs/2.0" xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:cp="http://inspire.ec.europa.eu/schemas/cp/4.0" xmlns:base="http://inspire.ec.europa.eu/schemas/base/3.3" xmlns:xlink="http://www.w3.org/1999/xlink">
 <member><cp:CadastralParcel gml:id="CP.2099310101">
  <cp:areaValue uom="m2">775</cp:areaValue>
  <cp:geometry><gml:Polygon srsName="urn:ogc:def:crs:EPSG::4326"><gml:exterior><gml:LinearRing>
   <gml:posList>50.0873 14.4211 50.0873 14.4215 50.0877 14.4215 50.0877 14.4211 50.0873 14.4211</gml:posList>
  </gml:LinearRing></gml:exterior></gml:Polygon></cp:geometry>
  <cp:inspireId><base:Identifier><base:localId>CP.2099310101</base:localId></base:Identifier></cp:inspireId>
  <cp:label>542</cp:label>
  <cp:nationalCadastralReference>727024-542</cp:nationalCadastralReference>
  <cp:administrativeUnit xlink:type="simple" xlink:href="http://services.cuzk.cz/x" xlink:title="Praha" />
  <cp:zoning xlink:type="simple" xlink:href="http://services.cuzk.cz/y" xlink:title="Staré Město" />
 </cp:CadastralParcel></member>
</FeatureCollection>`;

// IRELAND — Tailte Éireann freehold, GeoJSON [lon,lat].
const IE_GEOJSON = JSON.stringify({
    type: 'FeatureCollection',
    crs: { type: 'name', properties: { name: 'EPSG:4326' } },
    features: [{
        type: 'Feature',
        id: 1128417,
        geometry: { type: 'Polygon', coordinates: [[[-6.2613, 53.3501], [-6.2608, 53.3501], [-6.2608, 53.3505], [-6.2613, 53.3505], [-6.2613, 53.3501]]] },
        properties: { OBJECTID: 1128417, SP_ID: 2577972, COUNTY_NAM: 'Dublin', Shape__Area: 221.607, Shape__Length: 73.75 },
    }],
});

// AUSTRIA — BEV WMS GetFeatureInfo. ⚠ COORDINATES ARE EPSG:3857 METRES, not degrees. This fixture
// is the real Stephansplatz block; the numbers are what the live service returned.
const AT_GEOJSON_3857 = JSON.stringify({
    type: 'FeatureCollection',
    features: [{
        type: 'Feature',
        id: 'CP_CadastralParcel.6856',
        geometry: {
            type: 'MultiPolygon',
            coordinates: [[[[1822669.72, 6141236.763], [1822694.028, 6141278.804], [1822696.288, 6141246.636], [1822685.993, 6141231.955], [1822669.72, 6141236.763]]]],
        },
        properties: { inspireId: 'AT.0002.I.6.CP.01004954' },
    }],
    numberReturned: 1,
});

describe('LANE PARCEL-REACH — CZ / IE / AT', () => {
    beforeEach(() => __resetEuCadastreCache());

    it('CZ: lat-first posList, official m² areaValue, and the xlink:title names', async () => {
        const p = await fetchEuParcelAtPoint('cz', 14.4213, 50.0875, { fetchImpl: fakeFetch(CZ_GML) });
        expect(p).not.toBeNull();
        expect(p!.refcat).toBe('727024-542');
        // ⭐ 775 is the REGISTRY figure from `<cp:areaValue uom="m2">`, NOT the shoelace of this
        // trimmed fixture ring (which is ~1200 m²). If this ever reads the ring value, the official
        // area has stopped being preferred and every Czech parcel silently reports an estimate.
        expect(p!.areaM2).toBe(775);
        // ⛔ These names are in `xlink:title` ATTRIBUTES on SELF-CLOSING elements. `gmlText` reads
        // element TEXT and returns null for both — if this assertion ever goes null, someone
        // "simplified" gmlAttr away and the address silently disappeared.
        expect(p!.address).toBe('Staré Město, Praha');
        // Lat-first: a lon-first read would put this parcel at lat 14 / lon 50 — in Turkmenistan.
        expect(p!.ring.every((v: { lat: number; lon: number }) => v.lat > 50 && v.lat < 51 && v.lon > 14 && v.lon < 15)).toBe(true);
    });

    it('CZ: falls back to the ring when the served area is not in m²', async () => {
        // A hectare read as a square metre is a 10 000× error wearing a number's confidence.
        const ha = CZ_GML.replace('uom="m2">775', 'uom="ha">0.0775');
        const p = await fetchEuParcelAtPoint('cz', 14.4213, 50.0875, { fetchImpl: fakeFetch(ha) });
        expect(p!.areaM2).not.toBe(0.0775);
        expect(p!.areaM2).toBeGreaterThan(100);
    });

    it('IE: cites SP_ID, never the ArcGIS OBJECTID surrogate', async () => {
        const p = await fetchEuParcelAtPoint('ie', -6.261, 53.3503, { fetchImpl: fakeFetch(IE_GEOJSON) });
        expect(p!.refcat).toBe('2577972');
        // ⛔ OBJECTID is an ArcGIS row id, not a cadastral identifier — citing it would attribute a
        // made-up reference to Tailte Éireann.
        expect(p!.refcat).not.toBe('1128417');
        expect(p!.address).toBe('Dublin');
    });

    it('IE: an empty answer on a street is `empty`, never `unreachable`', async () => {
        // Irish coverage is TITLE-BASED, not an exhaustive tessellation — roads genuinely have no
        // polygon (measured: O'Connell St and Cork city centre both return zero). That must read as
        // an authoritative absence so the client shows an honest footprint, not an outage.
        const r = await resolveEuParcelOutcome('ie', -6.2603, 53.3498, {
            fetchImpl: fakeFetch('{"type":"FeatureCollection","features":[]}'),
        });
        expect(r.outcome).toBe('empty');
    });

    it('AT: reprojects EPSG:3857 metres to WGS84 degrees at Stephansplatz', async () => {
        const p = await fetchEuParcelAtPoint('at', 16.3731, 48.2084, { fetchImpl: fakeFetch(AT_GEOJSON_3857) });
        expect(p).not.toBeNull();
        expect(p!.refcat).toBe('AT.0002.I.6.CP.01004954');
        // The whole point of the leg: raw 3857 metres (1_822_669, 6_141_236) must NOT survive into
        // the ring. An un-reprojected ring is off the planet, and `pickCandidate` would then compare
        // degrees against metres and silently degrade every Austrian click to nearest-centroid.
        for (const v of p!.ring as Array<{ lat: number; lon: number }>) {
            expect(Math.abs(v.lat)).toBeLessThanOrEqual(90);
            expect(Math.abs(v.lon)).toBeLessThanOrEqual(180);
        }
        const lats = (p!.ring as Array<{ lat: number }>).map((v) => v.lat);
        const lons = (p!.ring as Array<{ lon: number }>).map((v) => v.lon);
        expect(Math.min(...lats)).toBeGreaterThan(48.2);
        expect(Math.max(...lats)).toBeLessThan(48.21);
        expect(Math.min(...lons)).toBeGreaterThan(16.37);
        expect(Math.max(...lons)).toBeLessThan(16.38);
        // Area must be computed from the REPROJECTED ring: the shoelace of raw metre coordinates
        // would come out ~10^10 m². Stephansplatz's block is on the order of 1e3 m².
        expect(p!.areaM2).toBeGreaterThan(100);
        expect(p!.areaM2).toBeLessThan(100_000);
    });

    it('AT: the three dead BEV routes stay out of the URL builder', () => {
        // ⛔ Recorded so nobody "restores" a WFS route that is switched off. All measured 2026-09-04:
        // BEVdataKAT/wfs → "Service GeoServer Enterprise WFS is disabled"; apps.bev.gv.at advertises
        // no GetFeature at all (bulk download service); kataster.bev.gv.at/ortho carries only
        // elevation + historic-map types. GetFeatureInfo on the WMS is the only keyless channel.
        const url = EU_CADASTRE_SOURCES['at'].url(48.2084, 16.3731);
        expect(url).toContain('data.bev.gv.at/geoserver/INSdataCP/wms');
        expect(url).toContain('REQUEST=GetFeatureInfo');
        // ⛔ EPSG:3857 IS LOAD-BEARING. That GeoServer's numDecimals is 3, so a 4326 answer is
        // rounded to ~110 m and the ring degenerates into repeated identical points — a boundary
        // that LOOKS like a parcel and is not one.
        expect(url).toContain('SRS=EPSG%3A3857');
        expect(url).not.toContain('BEVdataKAT');
        expect(url).not.toContain('apps.bev.gv.at');
    });
});
