// ITALY — `agenziaEntrateParcelProvider` / `parseCadastralParcelGeoJson` + `isInItaly`.
//
// The provider is a thin fetch (through the same-origin `/api/parcel/it` proxy — NEVER a live call:
// every test injects `fetchImpl`) + a deterministic INSPIRE-GeoJSON parse + point-in-polygon select.
// The GeoJSON fixture mirrors an Agenzia Entrate `CP:CadastralParcel` GetFeature response for a small
// Rome parcel (comune Belfiore H501). These tests pin: the parse extracts geometry/reference/comune/
// area verbatim, axis-order is normalised (EPSG:6706 lat,lon AND GeoJSON lon,lat both land right),
// point-in-polygon selects the containing parcel, confidence is HIGH only on the three facts, AP
// Bolzano is excluded from `isInItaly`, and the resolver NEVER throws on any failure path.

import { describe, it, expect } from 'vitest';
import {
    agenziaEntrateParcelProvider,
    parseCadastralParcelGeoJson,
    selectParcelAtPoint,
    orientToWgs84,
    comuneFromReference,
    pointInRing,
    isInItaly,
    buildAgenziaEntrateWfsUrl,
    AGENZIA_ENTRATE_PARCEL_TYPENAME,
} from '../src/parcelProviders/agenziaEntrateParcelProvider.js';

// A small square parcel near the Colosseum, Rome (≈41.8902°N, 12.4922°E). Coordinates in the
// GeoJSON-conformant [lon, lat] order the WFS returns with outputFormat=application/json.
const ROME_RING_LONLAT: [number, number][] = [
    [12.49200, 41.89000],
    [12.49240, 41.89000],
    [12.49240, 41.89040],
    [12.49200, 41.89040],
    [12.49200, 41.89000], // closing vertex (dropped on parse)
];

// A point clearly INSIDE the ring above.
const ROME_LON = 12.49220;
const ROME_LAT = 41.89020;

function feature(coords: [number, number][], props: Record<string, unknown>) {
    return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [coords] },
        properties: props,
    };
}

const ROME_FC = {
    type: 'FeatureCollection',
    features: [
        feature(ROME_RING_LONLAT, {
            NATIONALCADASTRALREFERENCE: 'H501_A_00123',
            AREAVALUE: 1240,
            ADMINISTRATIVEUNIT: 'Roma',
        }),
    ],
};

/** A fetch stub returning a GeoJSON body as JSON with ok:true; counts calls. */
function fakeFetch(body: unknown, { ok = true }: { ok?: boolean } = {}) {
    let n = 0;
    const fetchImpl = (async () => {
        n++;
        return { ok, status: ok ? 200 : 500, statusText: ok ? 'OK' : 'ERR', json: async () => body };
    }) as unknown as typeof fetch;
    return { fetchImpl, calls: () => n };
}

describe('isInItaly — national predicate (AP Trento/Bolzano excluded)', () => {
    it('Rome / Milan / Palermo (Sicily) / Cagliari (Sardinia) are inside', () => {
        expect(isInItaly(41.9028, 12.4964)).toBe(true); // Rome
        expect(isInItaly(45.4642, 9.19)).toBe(true); // Milan
        expect(isInItaly(38.1157, 13.3615)).toBe(true); // Palermo
        expect(isInItaly(39.2238, 9.1217)).toBe(true); // Cagliari
    });
    it('Bolzano (AP — own Catasto tavolare) is EXCLUDED', () => {
        expect(isInItaly(46.4983, 11.3548)).toBe(false); // Bolzano
        expect(isInItaly(46.0679, 11.1211)).toBe(false); // Trento
    });
    // Lane PARCEL-REACH round 3 (2026-09-04): Valletta resolved `IT:cadastral` — a Maltese click was
    // labelled Italy and dispatched to a WFS that cannot serve it. Malta is another COUNTRY inside the
    // Italian rectangle, so it is carved out; the Italian islands around it must survive the carve-out.
    it('MALTA (a sovereign state inside ITALY_BBOX) is EXCLUDED; the Italian islands around it are not', () => {
        expect(isInItaly(35.8989, 14.5146)).toBe(false); // Valletta
        expect(isInItaly(36.0443, 14.2394)).toBe(false); // Victoria, Gozo
        expect(isInItaly(35.5019, 12.6042)).toBe(true); // Lampedusa (IT, west of the carve-out)
        expect(isInItaly(36.7833, 11.9500)).toBe(true); // Pantelleria (IT)
        expect(isInItaly(36.7306, 14.8497)).toBe(true); // Pozzallo, Sicily (IT, north of the carve-out)
    });
    it('outside Italy and non-finite → false', () => {
        expect(isInItaly(48.8566, 2.3522)).toBe(false); // Paris
        expect(isInItaly(Number.NaN, 12)).toBe(false);
    });
});

describe('orientToWgs84 + comuneFromReference — helpers', () => {
    it('orients both EPSG:6706 lat,lon and GeoJSON lon,lat to {lat, lon}', () => {
        expect(orientToWgs84(41.89, 12.49)).toEqual({ lat: 41.89, lon: 12.49 }); // lat,lon
        expect(orientToWgs84(12.49, 41.89)).toEqual({ lat: 41.89, lon: 12.49 }); // lon,lat
    });
    it('non-Italian / junk coordinates → null (never guesses)', () => {
        expect(orientToWgs84(200, 3)).toBeNull();
        expect(orientToWgs84('x', null)).toBeNull();
    });
    it('extracts the comune Belfiore code from the cadastral reference', () => {
        expect(comuneFromReference('H501_A_00123')).toBe('H501');
        expect(comuneFromReference('F205.12.34')).toBe('F205');
        expect(comuneFromReference('')).toBeNull();
        expect(comuneFromReference(null)).toBeNull();
    });
});

describe('parseCadastralParcelGeoJson — the pure INSPIRE parse', () => {
    it('extracts ring (WGS84) + reference + comune + area from a CP:CadastralParcel feature', () => {
        const parcels = parseCadastralParcelGeoJson(ROME_FC);
        expect(parcels).toHaveLength(1);
        const p = parcels[0]!;
        expect(p.cadastralCode).toBe('H501_A_00123');
        expect(p.comune).toBe('H501'); // derived from the reference prefix
        expect(p.areaOfficialM2).toBe(1240);
        expect(p.ring).toHaveLength(4); // closing vertex dropped
        // Axis order normalised to {lat, lon} regardless of source order.
        expect(p.ring[0]).toEqual({ lat: 41.89, lon: 12.492 });
    });

    it('accepts a wrapped `{ geojson }` body and a MultiPolygon geometry', () => {
        const wrapped = { geojson: { type: 'FeatureCollection', features: [
            {
                type: 'Feature',
                geometry: { type: 'MultiPolygon', coordinates: [[ROME_RING_LONLAT]] },
                properties: { nationalCadastralReference: 'H501_B_00999' },
            },
        ] } };
        const parcels = parseCadastralParcelGeoJson(wrapped);
        expect(parcels).toHaveLength(1);
        expect(parcels[0]!.cadastralCode).toBe('H501_B_00999');
        expect(parcels[0]!.areaOfficialM2).toBeNull(); // no AREAVALUE → resolver shoelaces
    });

    it('drops features with no ring or no reference; empty / junk input → []', () => {
        expect(parseCadastralParcelGeoJson({ type: 'FeatureCollection', features: [
            { type: 'Feature', geometry: null, properties: { NATIONALCADASTRALREFERENCE: 'H501_x' } },
            { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ROME_RING_LONLAT] }, properties: {} },
        ] })).toHaveLength(0);
        expect(parseCadastralParcelGeoJson(null)).toEqual([]);
        expect(parseCadastralParcelGeoJson('<html/>')).toEqual([]);
        expect(parseCadastralParcelGeoJson({})).toEqual([]);
    });
});

describe('pointInRing + selectParcelAtPoint', () => {
    const ring = parseCadastralParcelGeoJson(ROME_FC)[0]!.ring;
    it('point-in-polygon is true inside, false outside', () => {
        expect(pointInRing(ring, ROME_LAT, ROME_LON)).toBe(true);
        expect(pointInRing(ring, 41.8, 12.4)).toBe(false);
    });
    it('selects the containing parcel with confidence HIGH (geom + inside + comune)', () => {
        const parcels = parseCadastralParcelGeoJson(ROME_FC);
        const p = selectParcelAtPoint(parcels, ROME_LAT, ROME_LON)!;
        expect(p.cadastralCode).toBe('H501_A_00123');
        expect(p.confidence.match).toBe('high');
        expect(p.confidence.pointInParcel).toBe(true);
        expect(p.confidence.comuneResolved).toBe(true);
        expect(p.confidence.areaSource).toBe('registry-declared');
        expect(p.areaM2).toBe(1240);
        expect(p.source).toBe('agenzia-entrate');
    });
    it('a point OUTSIDE every returned parcel degrades below high (nearest-centroid fallback)', () => {
        const parcels = parseCadastralParcelGeoJson(ROME_FC);
        const p = selectParcelAtPoint(parcels, 41.8, 12.4)!;
        expect(p.confidence.pointInParcel).toBe(false);
        expect(p.confidence.match).not.toBe('high');
    });
    it('no parcels → null', () => {
        expect(selectParcelAtPoint([], ROME_LAT, ROME_LON)).toBeNull();
    });
});

describe('buildAgenziaEntrateWfsUrl — the documented upstream request', () => {
    it('is a WFS 2.0 GetFeature for CP:CadastralParcel with a lat,lon BBOX in EPSG:6706', () => {
        const url = buildAgenziaEntrateWfsUrl(ROME_LAT, ROME_LON);
        expect(url).toContain('service=WFS');
        expect(url).toContain('request=GetFeature');
        expect(url).toContain(encodeURIComponent(AGENZIA_ENTRATE_PARCEL_TYPENAME));
        expect(url).toContain('EPSG%3A%3A6706');
        expect(url).toContain('outputFormat=application%2Fjson');
    });
});

describe('agenziaEntrateParcelProvider.fetchParcelAtPoint', () => {
    it('HAPPY PATH — resolves the Rome parcel from injected GeoJSON, hits /api/parcel/it', async () => {
        const { fetchImpl, calls } = fakeFetch(ROME_FC);
        const p = await agenziaEntrateParcelProvider.fetchParcelAtPoint(ROME_LON, ROME_LAT, { fetchImpl });
        expect(p).not.toBeNull();
        expect(p!.cadastralCode).toBe('H501_A_00123');
        expect(p!.confidence.match).toBe('high');
        expect(calls()).toBe(1);
    });

    it('sends the click coords to the same-origin proxy route', async () => {
        let seenUrl = '';
        const fetchImpl = (async (u: unknown) => {
            seenUrl = String(u);
            return { ok: true, json: async () => ROME_FC };
        }) as unknown as typeof fetch;
        await agenziaEntrateParcelProvider.fetchParcelAtPoint(ROME_LON, ROME_LAT, { fetchImpl });
        expect(seenUrl).toContain('/api/parcel/it');
        expect(seenUrl).toContain(`lon=${ROME_LON}`);
        expect(seenUrl).toContain(`lat=${ROME_LAT}`);
    });

    it('a point OUTSIDE Italy (Bolzano / Paris) → null WITHOUT fetching', async () => {
        const { fetchImpl, calls } = fakeFetch(ROME_FC);
        expect(await agenziaEntrateParcelProvider.fetchParcelAtPoint(11.3548, 46.4983, { fetchImpl })).toBeNull();
        expect(await agenziaEntrateParcelProvider.fetchParcelAtPoint(2.3522, 48.8566, { fetchImpl })).toBeNull();
        expect(calls()).toBe(0);
    });

    it('non-finite coords → null WITHOUT fetching', async () => {
        const { fetchImpl, calls } = fakeFetch(ROME_FC);
        expect(await agenziaEntrateParcelProvider.fetchParcelAtPoint(Number.NaN, ROME_LAT, { fetchImpl })).toBeNull();
        expect(calls()).toBe(0);
    });

    it('an empty FeatureCollection (a genuine miss) → null', async () => {
        const { fetchImpl } = fakeFetch({ type: 'FeatureCollection', features: [] });
        expect(await agenziaEntrateParcelProvider.fetchParcelAtPoint(ROME_LON, ROME_LAT, { fetchImpl })).toBeNull();
    });

    it('non-OK / throwing fetch / bad JSON → null, never throws', async () => {
        const bad = fakeFetch(ROME_FC, { ok: false });
        expect(await agenziaEntrateParcelProvider.fetchParcelAtPoint(ROME_LON, ROME_LAT, { fetchImpl: bad.fetchImpl })).toBeNull();

        const throwFetch = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
        await expect(
            agenziaEntrateParcelProvider.fetchParcelAtPoint(ROME_LON, ROME_LAT, { fetchImpl: throwFetch }),
        ).resolves.toBeNull();

        const badJson = (async () => ({ ok: true, json: async () => { throw new Error('not json'); } })) as unknown as typeof fetch;
        expect(await agenziaEntrateParcelProvider.fetchParcelAtPoint(ROME_LON, ROME_LAT, { fetchImpl: badJson })).toBeNull();
    });

    it('no fetch available → null', async () => {
        expect(
            await agenziaEntrateParcelProvider.fetchParcelAtPoint(ROME_LON, ROME_LAT, { fetchImpl: undefined as unknown as typeof fetch }),
        ).toBeNull();
    });
});
