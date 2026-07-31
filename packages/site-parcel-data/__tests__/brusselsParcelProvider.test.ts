// BELGIUM / BRUSSELS-CAPITAL — `resolveBrusselsParcel` / `parseBrusselsCadastreFeatures` Phase-4 tests.
//
// The compliance-critical seam turned pure: given a fixture Brussels (UrbIS / CIRB) cadastral WFS
// GeoJSON body (NEVER a live call — every test injects `fetchImpl`), the parse is deterministic. The
// fixture is a cadastral feature in the response shape the same-origin proxy returns (WGS84 GeoJSON,
// `srsName=EPSG:4326`), carrying a federal CaPaKey + commune (NIS) + a small ring near central
// Brussels. These tests pin: the parcel IS resolved (CaPaKey + ring + commune), confidence is HIGH when
// the click is inside the polygon, the resolver NEVER throws, a native-31370 body REFUSES
// `crs-unhandled` (never fabricated lat/lon), and the Brussels bbox predicate routes correctly.

import { describe, it, expect } from 'vitest';
import {
    resolveBrusselsParcel,
    parseBrusselsCadastreFeatures,
    parseGeoJsonRing,
    pointInRing,
    isInBrussels,
    BRUSSELS_CADASTRE_PROVIDER_ID,
} from '../src/parcelProviders/brusselsParcelProvider.js';

// A small WGS84 ring around a point in central Brussels. ~ (50.8467, 4.3525) is inside it.
const BRU_LAT = 50.8467;
const BRU_LON = 4.3525;
const CADASTRE_RING_WGS84: [number, number][] = [
    [4.3520, 50.8463],
    [4.3530, 50.8463],
    [4.3530, 50.8471],
    [4.3520, 50.8471],
    [4.3520, 50.8463],
];

/** A cadastral GeoJSON FeatureCollection (the WGS84 shape the proxy returns). */
function cadastreFeatureCollection(ring: [number, number][], props: Record<string, unknown>) {
    return {
        type: 'FeatureCollection',
        features: [
            {
                type: 'Feature',
                geometry: { type: 'Polygon', coordinates: [ring] },
                properties: props,
            },
        ],
    };
}

const CADASTRE_OK = cadastreFeatureCollection(CADASTRE_RING_WGS84, {
    CAPAKEY: '21004A0456/00_000',
    NISCODE: '21004',
    AREA: 421,
});

// A body still in native Lambert-72 (EPSG:31370) — easting/northing ~10^5..10^6, NOT degrees.
const CADASTRE_NATIVE_31370 = cadastreFeatureCollection(
    [
        [149000, 170000],
        [149030, 170000],
        [149030, 170040],
        [149000, 170040],
        [149000, 170000],
    ],
    { CAPAKEY: '21004A0456/00_000', NISCODE: '21004' },
);

/** A fetch stub returning a JSON body with ok:true; counts calls. */
function fakeFetch(body: unknown, { ok = true }: { ok?: boolean } = {}) {
    let n = 0;
    const fetchImpl = (async () => {
        n++;
        return { ok, json: async () => body };
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, calls: () => n };
}

describe('isInBrussels — the routing predicate', () => {
    it('accepts a central-Brussels point and rejects points outside the Brussels bbox', () => {
        expect(isInBrussels(BRU_LAT, BRU_LON)).toBe(true); // Grand-Place area
        expect(isInBrussels(50.8135, 4.3820)).toBe(true); // Ixelles/ULB
        expect(isInBrussels(51.2194, 4.4025)).toBe(false); // Antwerp (Flanders)
        expect(isInBrussels(50.6326, 5.5797)).toBe(false); // Liège (Wallonia)
    });
    it('is false on non-finite input (never throws)', () => {
        expect(isInBrussels(Number.NaN, BRU_LON)).toBe(false);
        expect(isInBrussels(BRU_LAT, Number.POSITIVE_INFINITY)).toBe(false);
    });
});

describe('parseGeoJsonRing — WGS84 guard', () => {
    it('parses a WGS84 ring to LatLon[]', () => {
        const ring = parseGeoJsonRing(CADASTRE_RING_WGS84);
        expect(ring).not.toBeNull();
        expect(ring!).toHaveLength(5);
        expect(ring![0]).toEqual({ lat: 50.8463, lon: 4.3520 });
    });
    it('returns null for a native-31370 ring (out-of-degree-bounds → CRS not handled)', () => {
        expect(parseGeoJsonRing([[149000, 170000], [149030, 170040]])).toBeNull();
    });
});

describe('parseBrusselsCadastreFeatures — the pure GeoJSON parse', () => {
    it('extracts the cadastral feature: CaPaKey, commune (NIS), area, ring', () => {
        const feats = parseBrusselsCadastreFeatures(CADASTRE_OK);
        expect(feats).toHaveLength(1);
        expect(feats[0]!.capakey).toBe('21004A0456/00_000');
        expect(feats[0]!.communeNis).toBe('21004');
        expect(feats[0]!.areaM2Attr).toBe(421);
        expect(feats[0]!.ring).toHaveLength(5);
        expect(feats[0]!.crsUnhandled).toBe(false);
    });
    it('reads the CaPaKey from the INSPIRE `nationalCadastralReference` alias', () => {
        const alias = cadastreFeatureCollection(CADASTRE_RING_WGS84, {
            nationalCadastralReference: '21004A0777/00_000',
            commune: 'Bruxelles',
        });
        const feats = parseBrusselsCadastreFeatures(alias);
        expect(feats[0]!.capakey).toBe('21004A0777/00_000');
        expect(feats[0]!.communeNis).toBe('Bruxelles');
    });
    it('flags crsUnhandled on a native-31370 geometry', () => {
        const feats = parseBrusselsCadastreFeatures(CADASTRE_NATIVE_31370);
        expect(feats).toHaveLength(1);
        expect(feats[0]!.crsUnhandled).toBe(true);
        expect(feats[0]!.ring).toHaveLength(0);
    });
    it('empty / malformed input is [] (never throws)', () => {
        expect(parseBrusselsCadastreFeatures(null)).toEqual([]);
        expect(parseBrusselsCadastreFeatures({})).toEqual([]);
        expect(parseBrusselsCadastreFeatures({ features: 'nope' })).toEqual([]);
    });
});

describe('pointInRing', () => {
    it('is true for a point inside and false for one outside', () => {
        const ring = parseGeoJsonRing(CADASTRE_RING_WGS84)!;
        expect(pointInRing(BRU_LAT, BRU_LON, ring)).toBe(true);
        expect(pointInRing(50.90, 4.3525, ring)).toBe(false);
    });
});

describe('resolveBrusselsParcel — the resolve-the-parcel seam', () => {
    it('HAPPY PATH — resolves the parcel with HIGH confidence (click inside the polygon)', async () => {
        const { fetchImpl } = fakeFetch(CADASTRE_OK);
        const res = await resolveBrusselsParcel(BRU_LAT, BRU_LON, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.parcel.capakey).toBe('21004A0456/00_000');
            expect(res.parcel.communeNis).toBe('21004');
            expect(res.parcel.areaM2).toBe(421);
            expect(res.parcel.areaSource).toBe('cadastre-attribute');
            expect(res.parcel.source).toBe(BRUSSELS_CADASTRE_PROVIDER_ID);
            expect(res.parcel.confidence).toBe('high');
            expect(res.parcel.ring.length).toBeGreaterThanOrEqual(3);
        }
    });

    it('the resolved parcel carries NO envelope field (geometry-only honesty)', async () => {
        const { fetchImpl } = fakeFetch(CADASTRE_OK);
        const res = await resolveBrusselsParcel(BRU_LAT, BRU_LON, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.parcel).not.toHaveProperty('maxFAR');
            expect(res.parcel).not.toHaveProperty('maxHeight_m');
            expect(res.parcel).not.toHaveProperty('maxFloors');
        }
    });

    it('derives the area from the ring when the cadastre omits the area attribute', async () => {
        const noArea = cadastreFeatureCollection(CADASTRE_RING_WGS84, { CAPAKEY: 'X', NISCODE: '21004' });
        const { fetchImpl } = fakeFetch(noArea);
        const res = await resolveBrusselsParcel(BRU_LAT, BRU_LON, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.parcel.areaSource).toBe('derived-from-ring');
            expect(res.parcel.areaM2).toBeGreaterThan(0);
        }
    });

    it('out-of-Brussels coordinates refuse `out-of-brussels` WITHOUT fetching', async () => {
        const { fetchImpl, calls } = fakeFetch(CADASTRE_OK);
        const res = await resolveBrusselsParcel(50.6326, 5.5797, { fetchImpl }); // Liège (Wallonia)
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('out-of-brussels');
        expect(calls()).toBe(0);
    });

    it('an empty feature collection → `no-parcel-here`', async () => {
        const { fetchImpl } = fakeFetch({ type: 'FeatureCollection', features: [] });
        const res = await resolveBrusselsParcel(BRU_LAT, BRU_LON, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-parcel-here');
    });

    it('a native-31370 body → `crs-unhandled` (never fabricates lat/lon)', async () => {
        const { fetchImpl } = fakeFetch(CADASTRE_NATIVE_31370);
        const res = await resolveBrusselsParcel(BRU_LAT, BRU_LON, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('crs-unhandled');
    });

    it('a feature with no CaPaKey → `unparsable-response`', async () => {
        const noKey = cadastreFeatureCollection(CADASTRE_RING_WGS84, { NISCODE: '21004' });
        const { fetchImpl } = fakeFetch(noKey);
        const res = await resolveBrusselsParcel(BRU_LAT, BRU_LON, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('unparsable-response');
    });

    it('an upstream non-OK response → `endpoint-unreachable`, never throws', async () => {
        const { fetchImpl } = fakeFetch(CADASTRE_OK, { ok: false });
        const res = await resolveBrusselsParcel(BRU_LAT, BRU_LON, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
    });

    it('a THROWING fetch → `endpoint-unreachable`, never throws into the caller', async () => {
        const throwFetch = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
        await expect(
            resolveBrusselsParcel(BRU_LAT, BRU_LON, { fetchImpl: throwFetch }),
        ).resolves.toMatchObject({ ok: false, reason: 'endpoint-unreachable' });
    });

    it('a malformed JSON body (json() throws) → `endpoint-unreachable`, never throws', async () => {
        const badJson = (async () => ({
            ok: true,
            json: async () => { throw new Error('unexpected token'); },
        })) as unknown as typeof fetch;
        const res = await resolveBrusselsParcel(BRU_LAT, BRU_LON, { fetchImpl: badJson });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
    });
});
