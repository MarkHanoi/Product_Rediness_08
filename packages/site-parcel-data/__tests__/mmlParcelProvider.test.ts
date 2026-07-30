// FINLAND — `mmlParcelProvider` / `parseMmlParcelFeatures` + `isInFinland`.
//
// The provider is a thin fetch (through the same-origin `/api/parcel/fi` proxy — NEVER a live call:
// every test injects `fetchImpl`) + a deterministic OGC-API-Features GeoJSON parse + point-in-polygon
// select. The fixture mirrors an MML `PalstanSijaintitiedot` `items` response (WGS84 GeoJSON, lon/lat)
// for a small Helsinki parcel. These tests pin: the parse extracts geometry/tunnus/municipality/area,
// the CRS guard REFUSES a native-EPSG:3067 (projected-metres) body rather than fabricate lat/lon,
// point-in-polygon drives confidence HIGH, Åland is excluded from `isInFinland`, the key-gated blocker
// (401/403 and the `{ ok:false, reason:'no-api-key' }` envelope) surfaces as the distinct `no-api-key`
// refusal, and the resolver NEVER throws / returns null-equivalent refusals on every failure path.

import { describe, it, expect } from 'vitest';
import {
    mmlParcelProvider,
    resolveFinlandParcel,
    parseMmlParcelFeatures,
    parseGeoJsonRing,
    municipalityFromTunnus,
    pointInRing,
    ringAreaM2,
    isInFinland,
    buildMmlItemsUrl,
    FINLAND_BBOX,
    RYHTI_IX_PROBE_URL,
    RYHTI_ATTRIBUTE_FIELDS,
    MML_PARCEL_PATH,
} from '../src/parcelProviders/mmlParcelProvider.js';

// A small square parcel in central Helsinki (≈60.1699°N, 24.9384°E). Coordinates in the
// GeoJSON-conformant [lon, lat] order the OGC API returns with crs=EPSG:4326.
const HELSINKI_RING_LONLAT: [number, number][] = [
    [24.93800, 60.16970],
    [24.93880, 60.16970],
    [24.93880, 60.17010],
    [24.93800, 60.17010],
    [24.93800, 60.16970], // closing vertex
];

// A point clearly INSIDE the ring above.
const HKI_LON = 24.9384;
const HKI_LAT = 60.1699;

function feature(coords: [number, number][], props: Record<string, unknown>) {
    return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [coords] },
        properties: props,
    };
}

const HELSINKI_FC = {
    type: 'FeatureCollection',
    features: [
        feature(HELSINKI_RING_LONLAT, {
            kiinteistotunnuksenEsitysmuoto: '091-021-0001-0001',
            rekisteriyksikonPalstanPintaala: 1520,
        }),
    ],
};

/** A fetch stub returning a body as JSON with a chosen ok/status; counts calls. */
function fakeFetch(body: unknown, { ok = true, status = 200 }: { ok?: boolean; status?: number } = {}) {
    let n = 0;
    const fetchImpl = (async () => {
        n++;
        return { ok, status: ok ? status : status || 500, statusText: ok ? 'OK' : 'ERR', json: async () => body };
    }) as unknown as typeof fetch;
    return { fetchImpl, calls: () => n };
}

describe('isInFinland — national predicate (Åland excluded)', () => {
    it('Helsinki / Tampere / Oulu / Rovaniemi are inside', () => {
        expect(isInFinland(60.1699, 24.9384)).toBe(true); // Helsinki
        expect(isInFinland(61.4978, 23.7610)).toBe(true); // Tampere
        expect(isInFinland(65.0121, 25.4651)).toBe(true); // Oulu
        expect(isInFinland(66.5039, 25.7294)).toBe(true); // Rovaniemi
    });
    it('Mariehamn (Åland — own land registry) is EXCLUDED', () => {
        expect(isInFinland(60.0973, 19.9348)).toBe(false); // Mariehamn
    });
    it('outside Finland and non-finite → false', () => {
        expect(isInFinland(59.3293, 18.0686)).toBe(false); // Stockholm
        expect(isInFinland(48.8566, 2.3522)).toBe(false); // Paris
        expect(isInFinland(Number.NaN, 25)).toBe(false);
    });
    it('the exported bbox is the coarse gate the predicate uses', () => {
        expect(HKI_LAT).toBeGreaterThanOrEqual(FINLAND_BBOX.minLat);
        expect(HKI_LAT).toBeLessThanOrEqual(FINLAND_BBOX.maxLat);
    });
});

describe('municipalityFromTunnus — kuntanumero extraction', () => {
    it('extracts the 3-digit municipality code from hyphenated and compact tunnus forms', () => {
        expect(municipalityFromTunnus('091-021-0001-0001')).toBe('091'); // Helsinki
        expect(municipalityFromTunnus('09102100010001')).toBe('091'); // compact
        expect(municipalityFromTunnus('837-100-0001-0002')).toBe('837'); // Tampere
    });
    it('junk / empty / null → null (never guesses)', () => {
        expect(municipalityFromTunnus('')).toBeNull();
        expect(municipalityFromTunnus(null)).toBeNull();
        expect(municipalityFromTunnus('xx-1')).toBeNull();
    });
});

describe('parseGeoJsonRing — CRS guard (EPSG:3067 metres refused)', () => {
    it('parses a WGS84 lon/lat ring to {lat, lon}', () => {
        const ring = parseGeoJsonRing(HELSINKI_RING_LONLAT);
        expect(ring).not.toBeNull();
        expect(ring![0]).toEqual({ lat: 60.1697, lon: 24.938 });
    });
    it('returns null when coordinates are projected metres (ETRS-TM35FIN 3067)', () => {
        // A Helsinki parcel in native EPSG:3067 easting/northing (~385000, 6672000).
        const projected: [number, number][] = [
            [385000, 6672000],
            [385040, 6672000],
            [385040, 6672040],
        ];
        expect(parseGeoJsonRing(projected)).toBeNull();
    });
});

describe('parseMmlParcelFeatures — the pure OGC parse', () => {
    it('extracts ring (WGS84) + tunnus + municipality + area from a PalstanSijaintitiedot feature', () => {
        const feats = parseMmlParcelFeatures(HELSINKI_FC);
        expect(feats).toHaveLength(1);
        const f = feats[0]!;
        expect(f.kiinteistotunnus).toBe('091-021-0001-0001');
        expect(f.municipality).toBe('091');
        expect(f.areaM2Attr).toBe(1520);
        expect(f.ring).toHaveLength(5);
        expect(f.crsUnhandled).toBe(false);
        expect(f.ring[0]).toEqual({ lat: 60.1697, lon: 24.938 });
    });
    it('accepts a wrapped `{ geojson }` body and a MultiPolygon geometry', () => {
        const wrapped = { geojson: { type: 'FeatureCollection', features: [
            {
                type: 'Feature',
                geometry: { type: 'MultiPolygon', coordinates: [[HELSINKI_RING_LONLAT]] },
                properties: { kiinteistotunnus: '091-021-0009-0009' },
            },
        ] } };
        const feats = parseMmlParcelFeatures(wrapped);
        expect(feats).toHaveLength(1);
        expect(feats[0]!.kiinteistotunnus).toBe('091-021-0009-0009');
        expect(feats[0]!.areaM2Attr).toBeNull(); // no area attr → resolver shoelaces
    });
    it('flags crsUnhandled for a native-3067 geometry, empty/junk input → []', () => {
        const proj = { type: 'FeatureCollection', features: [
            {
                type: 'Feature',
                geometry: { type: 'Polygon', coordinates: [[[385000, 6672000], [385040, 6672000], [385040, 6672040]]] },
                properties: { kiinteistotunnus: '091-021-0002-0002' },
            },
        ] };
        const feats = parseMmlParcelFeatures(proj);
        expect(feats).toHaveLength(1);
        expect(feats[0]!.crsUnhandled).toBe(true);
        expect(feats[0]!.ring).toHaveLength(0);

        expect(parseMmlParcelFeatures(null)).toEqual([]);
        expect(parseMmlParcelFeatures('<html/>')).toEqual([]);
        expect(parseMmlParcelFeatures({})).toEqual([]);
    });
});

describe('pointInRing + ringAreaM2', () => {
    const ring = parseMmlParcelFeatures(HELSINKI_FC)[0]!.ring;
    it('point-in-polygon is true inside, false outside', () => {
        expect(pointInRing(HKI_LAT, HKI_LON, ring)).toBe(true);
        expect(pointInRing(60.0, 24.0, ring)).toBe(false);
    });
    it('shoelace area of the ~44 m square is a few thousand m²', () => {
        const a = ringAreaM2(ring);
        expect(a).toBeGreaterThan(500);
        expect(a).toBeLessThan(5000);
    });
});

describe('buildMmlItemsUrl — the documented upstream OGC request (no key in the builder)', () => {
    it('is an OGC items query for the parcel collection with a lon,lat bbox in EPSG:4326', () => {
        const url = buildMmlItemsUrl(HKI_LAT, HKI_LON);
        expect(url).toContain('/collections/PalstanSijaintitiedot/items');
        expect(url).toContain('bbox=');
        expect(url).toContain(encodeURIComponent('http://www.opengis.net/def/crs/EPSG/0/4326'));
        expect(url).toContain('f=application%2Fgeo%2Bjson');
        // The builder carries NO api-key — the proxy injects it server-side.
        expect(url).not.toContain('api-key');
    });
});

describe('resolveFinlandParcel — the impure seam', () => {
    it('HAPPY PATH — resolves the Helsinki parcel from injected GeoJSON, hits /api/parcel/fi', async () => {
        let seenUrl = '';
        const fetchImpl = (async (u: unknown) => {
            seenUrl = String(u);
            return { ok: true, status: 200, json: async () => HELSINKI_FC };
        }) as unknown as typeof fetch;
        const r = await resolveFinlandParcel(HKI_LAT, HKI_LON, { fetchImpl });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.parcel.kiinteistotunnus).toBe('091-021-0001-0001');
            expect(r.parcel.municipality).toBe('091');
            expect(r.parcel.areaM2).toBe(1520);
            expect(r.parcel.areaSource).toBe('mml-attribute');
            expect(r.parcel.confidence).toBe('high'); // click inside the ring
            expect(r.parcel.source).toBe('mml');
        }
        expect(seenUrl).toContain(MML_PARCEL_PATH);
        expect(seenUrl).toContain(`lat=${HKI_LAT}`);
        expect(seenUrl).toContain(`lon=${HKI_LON}`);
    });

    it('a point OUTSIDE the returned parcel degrades below high, area shoelaced when no attr', async () => {
        const noAttrFC = { type: 'FeatureCollection', features: [
            feature(HELSINKI_RING_LONLAT, { kiinteistotunnus: '091-021-0003-0003' }),
        ] };
        // Query a point still in Finland but outside this ring → nearest, medium.
        const { fetchImpl } = fakeFetch(noAttrFC);
        const r = await resolveFinlandParcel(60.2000, 24.9500, { fetchImpl });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.parcel.confidence).toBe('medium');
            expect(r.parcel.areaSource).toBe('derived-from-ring');
        }
    });

    it('a point OUTSIDE Finland (Mariehamn / Stockholm) → out-of-finland WITHOUT fetching', async () => {
        const { fetchImpl, calls } = fakeFetch(HELSINKI_FC);
        expect((await resolveFinlandParcel(60.0973, 19.9348, { fetchImpl })).ok).toBe(false); // Åland
        expect((await resolveFinlandParcel(59.3293, 18.0686, { fetchImpl })).ok).toBe(false); // Stockholm
        expect(calls()).toBe(0);
    });

    it('KEY-GATED: 401/403 → no-api-key refusal (the founder self-service blocker)', async () => {
        const r401 = await resolveFinlandParcel(HKI_LAT, HKI_LON, { fetchImpl: fakeFetch(null, { ok: false, status: 401 }).fetchImpl });
        expect(r401).toEqual({ ok: false, reason: 'no-api-key' });
        const r403 = await resolveFinlandParcel(HKI_LAT, HKI_LON, { fetchImpl: fakeFetch(null, { ok: false, status: 403 }).fetchImpl });
        expect(r403).toEqual({ ok: false, reason: 'no-api-key' });
    });

    it('KEY-GATED: a wired proxy with no key answers 200 `{ ok:false, reason:"no-api-key" }` → no-api-key', async () => {
        const { fetchImpl } = fakeFetch({ ok: false, reason: 'no-api-key' });
        const r = await resolveFinlandParcel(HKI_LAT, HKI_LON, { fetchImpl });
        expect(r).toEqual({ ok: false, reason: 'no-api-key' });
    });

    it('a native-3067 body (projected metres) → crs-unhandled, never fabricated lat/lon', async () => {
        const projFC = { type: 'FeatureCollection', features: [
            {
                type: 'Feature',
                geometry: { type: 'Polygon', coordinates: [[[385000, 6672000], [385040, 6672000], [385040, 6672040], [385000, 6672000]]] },
                properties: { kiinteistotunnus: '091-021-0004-0004' },
            },
        ] };
        const { fetchImpl } = fakeFetch(projFC);
        const r = await resolveFinlandParcel(HKI_LAT, HKI_LON, { fetchImpl });
        expect(r).toEqual({ ok: false, reason: 'crs-unhandled' });
    });

    it('an empty FeatureCollection (a genuine miss) → no-parcel-here', async () => {
        const { fetchImpl } = fakeFetch({ type: 'FeatureCollection', features: [] });
        const r = await resolveFinlandParcel(HKI_LAT, HKI_LON, { fetchImpl });
        expect(r).toEqual({ ok: false, reason: 'no-parcel-here' });
    });

    it('a feature with no tunnus → unparsable-response', async () => {
        const noId = { type: 'FeatureCollection', features: [feature(HELSINKI_RING_LONLAT, {})] };
        const { fetchImpl } = fakeFetch(noId);
        const r = await resolveFinlandParcel(HKI_LAT, HKI_LON, { fetchImpl });
        expect(r).toEqual({ ok: false, reason: 'unparsable-response' });
    });

    it('non-OK (500) / throwing fetch / bad JSON / no-fetch → endpoint-unreachable, never throws', async () => {
        const r500 = await resolveFinlandParcel(HKI_LAT, HKI_LON, { fetchImpl: fakeFetch(null, { ok: false, status: 500 }).fetchImpl });
        expect(r500).toEqual({ ok: false, reason: 'endpoint-unreachable' });

        const throwFetch = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
        await expect(resolveFinlandParcel(HKI_LAT, HKI_LON, { fetchImpl: throwFetch })).resolves.toEqual({ ok: false, reason: 'endpoint-unreachable' });

        const badJson = (async () => ({ ok: true, status: 200, json: async () => { throw new Error('not json'); } })) as unknown as typeof fetch;
        expect((await resolveFinlandParcel(HKI_LAT, HKI_LON, { fetchImpl: badJson })).ok).toBe(false);

        const r = await resolveFinlandParcel(HKI_LAT, HKI_LON, { fetchImpl: undefined as unknown as typeof fetch });
        expect(r).toEqual({ ok: false, reason: 'endpoint-unreachable' });
    });

    it('provider object exposes the canonical shape', () => {
        expect(mmlParcelProvider.id).toBe('mml');
        expect(mmlParcelProvider.proxyPath).toBe('/api/parcel/fi');
        expect(mmlParcelProvider.kind).toBe('cadastral');
        expect(mmlParcelProvider.isInFinland(HKI_LAT, HKI_LON)).toBe(true);
    });
});

describe('RYHTI PROBE — documented, unprobed (the second-Denmark gate)', () => {
    it('exposes the exact open no-auth `_ix_` item GET and the three fields to confirm', () => {
        expect(RYHTI_IX_PROBE_URL).toContain('ryhti_plan/ogc/features/v1');
        expect(RYHTI_IX_PROBE_URL).toContain('pub_valid_ld_plan_ix_gs/items?limit=1');
        expect(RYHTI_ATTRIBUTE_FIELDS.far).toBe('tehokkuusluku');
        expect(RYHTI_ATTRIBUTE_FIELDS.storeys).toBe('kerrosluku');
        expect(RYHTI_ATTRIBUTE_FIELDS.useCode).toBe('kayttotarkoitus');
    });
});
