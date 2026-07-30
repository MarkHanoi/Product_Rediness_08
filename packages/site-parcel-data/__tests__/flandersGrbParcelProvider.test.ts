// BELGIUM / FLANDERS — `resolveFlandersParcel` / `parseGrbAdpFeatures` (GRB Adp) Phase-4 tests.
//
// The compliance-critical seam turned pure: given a fixture GRB WFS GeoJSON body (NEVER a live call
// — every test injects `fetchImpl`), the parse is deterministic. The fixture is a GRB `Adp` feature
// in the response shape the same-origin proxy returns (WGS84 GeoJSON, `srsName=EPSG:4326`), carrying
// a CaPaKey + NISCODE + a small ring near Antwerp. These tests pin: the parcel IS resolved (CaPaKey +
// ring + municipality), confidence is HIGH when the click is inside the polygon, the resolver NEVER
// throws, a native-31370 body REFUSES `crs-unhandled` (never fabricated lat/lon), and the Flanders
// bbox predicate routes correctly.

import { describe, it, expect } from 'vitest';
import {
    resolveFlandersParcel,
    parseGrbAdpFeatures,
    parseGeoJsonRing,
    pointInRing,
    isInFlanders,
    FLANDERS_GRB_PROVIDER_ID,
} from '../src/parcelProviders/flandersGrbParcelProvider.js';

// A small WGS84 ring around a point in Antwerp (Flanders). ~ (51.2194, 4.4025) is inside it.
const ANT_LAT = 51.2194;
const ANT_LON = 4.4025;
const ADP_RING_WGS84: [number, number][] = [
    [4.4020, 51.2190],
    [4.4030, 51.2190],
    [4.4030, 51.2198],
    [4.4020, 51.2198],
    [4.4020, 51.2190],
];

/** A GRB Adp GeoJSON FeatureCollection (the WGS84 shape the proxy returns). */
function adpFeatureCollection(ring: [number, number][], props: Record<string, unknown>) {
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

const ADP_OK = adpFeatureCollection(ADP_RING_WGS84, {
    CAPAKEY: '11002A0345/00_000',
    NISCODE: '11002',
    OPPERVL: 612,
});

// A body still in native Lambert-72 (EPSG:31370) — easting/northing ~10^5..10^6, NOT degrees.
const ADP_NATIVE_31370 = adpFeatureCollection(
    [
        [151000, 212000],
        [151030, 212000],
        [151030, 212040],
        [151000, 212040],
        [151000, 212000],
    ],
    { CAPAKEY: '11002A0345/00_000', NISCODE: '11002' },
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

describe('isInFlanders — the routing predicate', () => {
    it('accepts an Antwerp point and rejects points outside the Flemish bbox', () => {
        expect(isInFlanders(ANT_LAT, ANT_LON)).toBe(true); // Antwerp
        expect(isInFlanders(51.05, 3.72)).toBe(true); // Ghent
        expect(isInFlanders(48.8566, 2.3522)).toBe(false); // Paris
        expect(isInFlanders(41.3925, 2.1649)).toBe(false); // Barcelona
    });
    it('is false on non-finite input (never throws)', () => {
        expect(isInFlanders(Number.NaN, ANT_LON)).toBe(false);
        expect(isInFlanders(ANT_LAT, Number.POSITIVE_INFINITY)).toBe(false);
    });
});

describe('parseGeoJsonRing — WGS84 guard', () => {
    it('parses a WGS84 ring to LatLon[]', () => {
        const ring = parseGeoJsonRing(ADP_RING_WGS84);
        expect(ring).not.toBeNull();
        expect(ring!).toHaveLength(5);
        expect(ring![0]).toEqual({ lat: 51.2190, lon: 4.4020 });
    });
    it('returns null for a native-31370 ring (out-of-degree-bounds → CRS not handled)', () => {
        expect(parseGeoJsonRing([[151000, 212000], [151030, 212040]])).toBeNull();
    });
});

describe('parseGrbAdpFeatures — the pure GeoJSON parse', () => {
    it('extracts the Adp feature: CaPaKey, NISCODE, area, ring', () => {
        const feats = parseGrbAdpFeatures(ADP_OK);
        expect(feats).toHaveLength(1);
        expect(feats[0]!.capakey).toBe('11002A0345/00_000');
        expect(feats[0]!.municipalityNis).toBe('11002');
        expect(feats[0]!.areaM2Attr).toBe(612);
        expect(feats[0]!.ring).toHaveLength(5);
        expect(feats[0]!.crsUnhandled).toBe(false);
    });
    it('flags crsUnhandled on a native-31370 geometry', () => {
        const feats = parseGrbAdpFeatures(ADP_NATIVE_31370);
        expect(feats).toHaveLength(1);
        expect(feats[0]!.crsUnhandled).toBe(true);
        expect(feats[0]!.ring).toHaveLength(0);
    });
    it('empty / malformed input is [] (never throws)', () => {
        expect(parseGrbAdpFeatures(null)).toEqual([]);
        expect(parseGrbAdpFeatures({})).toEqual([]);
        expect(parseGrbAdpFeatures({ features: 'nope' })).toEqual([]);
    });
});

describe('pointInRing', () => {
    it('is true for a point inside and false for one outside', () => {
        const ring = parseGeoJsonRing(ADP_RING_WGS84)!;
        expect(pointInRing(ANT_LAT, ANT_LON, ring)).toBe(true);
        expect(pointInRing(51.5, 4.40, ring)).toBe(false);
    });
});

describe('resolveFlandersParcel — the resolve-the-parcel seam', () => {
    it('HAPPY PATH — resolves the parcel with HIGH confidence (click inside the ADP polygon)', async () => {
        const { fetchImpl } = fakeFetch(ADP_OK);
        const res = await resolveFlandersParcel(ANT_LAT, ANT_LON, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.parcel.capakey).toBe('11002A0345/00_000');
            expect(res.parcel.municipalityNis).toBe('11002');
            expect(res.parcel.areaM2).toBe(612);
            expect(res.parcel.areaSource).toBe('grb-attribute');
            expect(res.parcel.source).toBe(FLANDERS_GRB_PROVIDER_ID);
            expect(res.parcel.confidence).toBe('high');
            expect(res.parcel.ring.length).toBeGreaterThanOrEqual(3);
        }
    });

    it('the resolved parcel carries NO envelope field (geometry-only honesty)', async () => {
        const { fetchImpl } = fakeFetch(ADP_OK);
        const res = await resolveFlandersParcel(ANT_LAT, ANT_LON, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.parcel).not.toHaveProperty('maxFAR');
            expect(res.parcel).not.toHaveProperty('maxHeight_m');
            expect(res.parcel).not.toHaveProperty('maxFloors');
        }
    });

    it('derives the area from the ring when GRB omits the area attribute', async () => {
        const noArea = adpFeatureCollection(ADP_RING_WGS84, { CAPAKEY: 'X', NISCODE: '11002' });
        const { fetchImpl } = fakeFetch(noArea);
        const res = await resolveFlandersParcel(ANT_LAT, ANT_LON, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.parcel.areaSource).toBe('derived-from-ring');
            expect(res.parcel.areaM2).toBeGreaterThan(0);
        }
    });

    it('out-of-Flanders coordinates refuse `out-of-flanders` WITHOUT fetching', async () => {
        const { fetchImpl, calls } = fakeFetch(ADP_OK);
        const res = await resolveFlandersParcel(48.8566, 2.3522, { fetchImpl }); // Paris
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('out-of-flanders');
        expect(calls()).toBe(0);
    });

    it('an empty feature collection → `no-parcel-here`', async () => {
        const { fetchImpl } = fakeFetch({ type: 'FeatureCollection', features: [] });
        const res = await resolveFlandersParcel(ANT_LAT, ANT_LON, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-parcel-here');
    });

    it('a native-31370 body → `crs-unhandled` (never fabricates lat/lon)', async () => {
        const { fetchImpl } = fakeFetch(ADP_NATIVE_31370);
        const res = await resolveFlandersParcel(ANT_LAT, ANT_LON, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('crs-unhandled');
    });

    it('a feature with no CaPaKey → `unparsable-response`', async () => {
        const noKey = adpFeatureCollection(ADP_RING_WGS84, { NISCODE: '11002' });
        const { fetchImpl } = fakeFetch(noKey);
        const res = await resolveFlandersParcel(ANT_LAT, ANT_LON, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('unparsable-response');
    });

    it('an upstream non-OK response → `endpoint-unreachable`, never throws', async () => {
        const { fetchImpl } = fakeFetch(ADP_OK, { ok: false });
        const res = await resolveFlandersParcel(ANT_LAT, ANT_LON, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
    });

    it('a THROWING fetch → `endpoint-unreachable`, never throws into the caller', async () => {
        const throwFetch = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
        await expect(
            resolveFlandersParcel(ANT_LAT, ANT_LON, { fetchImpl: throwFetch }),
        ).resolves.toMatchObject({ ok: false, reason: 'endpoint-unreachable' });
    });

    it('a malformed JSON body (json() throws) → `endpoint-unreachable`, never throws', async () => {
        const badJson = (async () => ({
            ok: true,
            json: async () => { throw new Error('unexpected token'); },
        })) as unknown as typeof fetch;
        const res = await resolveFlandersParcel(ANT_LAT, ANT_LON, { fetchImpl: badJson });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
    });
});
