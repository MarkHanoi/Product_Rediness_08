// UNITED KINGDOM / ENGLAND — `fetchParcelAtPoint` / `parseInspirePolygonFeatures` (HMLR INSPIRE Index
// Polygons) Phase-4 tests.
//
// The compliance-critical seam turned pure: given a fixture INSPIRE WFS/GeoJSON body (NEVER a live call
// — every test injects `fetchImpl`), the parse is deterministic. The fixture is an INSPIRE ownership-
// extent feature in the shape the same-origin proxy returns (WGS84 GeoJSON), carrying an INSPIREID + a
// small ring near central London. These tests pin THE UK HONESTY INVARIANT: the parcel IS resolved
// (INSPIRE id + ring + `generalBoundary:true` + cited caveat), confidence is CAPPED MEDIUM — never HIGH
// — even when the click is inside the polygon, the resolver NEVER throws, a native-27700 body REFUSES
// `crs-unhandled` (never fabricated lat/lon), and the England bbox predicate routes correctly.

import { describe, it, expect } from 'vitest';
import {
    fetchParcelAtPoint,
    parseInspirePolygonFeatures,
    parseGeoJsonRing,
    pointInRing,
    isInEngland,
    GB_OS_INSPIRE_PROVIDER_ID,
    GB_GENERAL_BOUNDARY_CAVEAT,
    type GbParcelMatchTier,
} from '../src/parcelProviders/gbOsInspireParcelProvider.js';

// A small WGS84 ring around a point in central London (Westminster). (51.5010, -0.1250) is inside it.
const LDN_LAT = 51.5010;
const LDN_LON = -0.1250;
const INSPIRE_RING_WGS84: [number, number][] = [
    [-0.1255, 51.5006],
    [-0.1245, 51.5006],
    [-0.1245, 51.5014],
    [-0.1255, 51.5014],
    [-0.1255, 51.5006],
];

/** An INSPIRE Index Polygon GeoJSON FeatureCollection (the WGS84 shape the proxy returns). */
function inspireFeatureCollection(ring: [number, number][], props: Record<string, unknown>) {
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

const INSPIRE_OK = inspireFeatureCollection(INSPIRE_RING_WGS84, {
    INSPIREID: '52104603',
    localAuthority: 'City of Westminster',
    areaValue: 418,
});

// A body still in native British National Grid (EPSG:27700) — easting/northing ~10^5..10^6, NOT degrees.
const INSPIRE_NATIVE_27700 = inspireFeatureCollection(
    [
        [530000, 180000],
        [530030, 180000],
        [530030, 180040],
        [530000, 180040],
        [530000, 180000],
    ],
    { INSPIREID: '52104603' },
);

/** A fetch stub returning a JSON body with ok:true; counts calls. */
function fakeFetch(body: unknown, { ok = true }: { ok?: boolean } = {}) {
    let n = 0;
    const fetchImpl = async () => {
        n++;
        return { ok, json: async () => body };
    };
    return { fetchImpl: fetchImpl as unknown as typeof fetch, calls: () => n };
}

describe('isInEngland — the routing predicate', () => {
    it('accepts an England point and rejects points outside the England bbox', () => {
        expect(isInEngland(LDN_LAT, LDN_LON)).toBe(true); // London
        expect(isInEngland(53.4808, -2.2426)).toBe(true); // Manchester
        expect(isInEngland(48.8566, 2.3522)).toBe(false); // Paris
        expect(isInEngland(55.9533, -3.1883)).toBe(false); // Edinburgh (Scotland — north of the box)
    });
    it('is false on non-finite input (never throws)', () => {
        expect(isInEngland(Number.NaN, LDN_LON)).toBe(false);
        expect(isInEngland(LDN_LAT, Number.POSITIVE_INFINITY)).toBe(false);
    });
});

describe('parseGeoJsonRing — WGS84 guard', () => {
    it('parses a WGS84 ring to GbLatLon[]', () => {
        const ring = parseGeoJsonRing(INSPIRE_RING_WGS84);
        expect(ring).not.toBeNull();
        expect(ring!).toHaveLength(5);
        expect(ring![0]).toEqual({ lat: 51.5006, lon: -0.1255 });
    });
    it('returns null for a native-27700 ring (out-of-degree-bounds → CRS not handled)', () => {
        expect(parseGeoJsonRing([[530000, 180000], [530030, 180040]])).toBeNull();
    });
});

describe('parseInspirePolygonFeatures — the pure GeoJSON parse', () => {
    it('extracts the ownership-extent feature: INSPIRE id, local authority, area, ring', () => {
        const feats = parseInspirePolygonFeatures(INSPIRE_OK);
        expect(feats).toHaveLength(1);
        expect(feats[0]!.inspireId).toBe('52104603');
        expect(feats[0]!.localAuthority).toBe('City of Westminster');
        expect(feats[0]!.areaM2Attr).toBe(418);
        expect(feats[0]!.ring).toHaveLength(5);
        expect(feats[0]!.crsUnhandled).toBe(false);
    });
    it('falls back to the feature-level id when no INSPIREID property', () => {
        const feats = parseInspirePolygonFeatures({
            type: 'FeatureCollection',
            features: [
                {
                    type: 'Feature',
                    id: 'INSPIRE.12345',
                    geometry: { type: 'Polygon', coordinates: [INSPIRE_RING_WGS84] },
                    properties: {},
                },
            ],
        });
        expect(feats).toHaveLength(1);
        expect(feats[0]!.inspireId).toBe('INSPIRE.12345');
    });
    it('flags crsUnhandled on a native-27700 geometry', () => {
        const feats = parseInspirePolygonFeatures(INSPIRE_NATIVE_27700);
        expect(feats).toHaveLength(1);
        expect(feats[0]!.crsUnhandled).toBe(true);
        expect(feats[0]!.ring).toHaveLength(0);
    });
    it('empty / malformed input is [] (never throws)', () => {
        expect(parseInspirePolygonFeatures(null)).toEqual([]);
        expect(parseInspirePolygonFeatures({})).toEqual([]);
        expect(parseInspirePolygonFeatures({ features: 'nope' })).toEqual([]);
    });
});

describe('pointInRing', () => {
    it('is true for a point inside and false for one outside', () => {
        const ring = parseGeoJsonRing(INSPIRE_RING_WGS84)!;
        expect(pointInRing(LDN_LAT, LDN_LON, ring)).toBe(true);
        expect(pointInRing(51.6, -0.125, ring)).toBe(false);
    });
});

describe('fetchParcelAtPoint — the UK general-boundary honesty invariant', () => {
    it('HAPPY PATH — resolves the parcel but caps confidence MEDIUM (never HIGH), even inside the polygon', async () => {
        const { fetchImpl } = fakeFetch(INSPIRE_OK);
        const res = await fetchParcelAtPoint({ lat: LDN_LAT, lon: LDN_LON }, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.parcel.inspireId).toBe('52104603');
            expect(res.parcel.localAuthority).toBe('City of Westminster');
            expect(res.parcel.areaM2).toBe(418);
            expect(res.parcel.areaSource).toBe('inspire-attribute');
            expect(res.parcel.source).toBe(GB_OS_INSPIRE_PROVIDER_ID);
            // THE INVARIANT: inside the polygon, but STILL only MEDIUM — never 'high' (ownership, not survey).
            expect(res.parcel.confidence).toBe('medium');
            // `GbParcelMatchTier` has NO 'high' member — the cap is a COMPILE-TIME invariant, asserted here too.
            expect(['medium', 'low'] as GbParcelMatchTier[]).toContain(res.parcel.confidence);
            expect(res.parcel.generalBoundary).toBe(true);
            expect(res.parcel.caveat).toBe(GB_GENERAL_BOUNDARY_CAVEAT);
            expect(res.parcel.caveat).toMatch(/general boundaries/i);
            expect(res.parcel.caveat).toMatch(/NOT a survey-grade cadastre/i);
            expect(res.parcel.ring.length).toBeGreaterThanOrEqual(3);
        }
    });

    it('the resolved parcel carries NO envelope field (geometry-only honesty)', async () => {
        const { fetchImpl } = fakeFetch(INSPIRE_OK);
        const res = await fetchParcelAtPoint({ lat: LDN_LAT, lon: LDN_LON }, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.parcel).not.toHaveProperty('maxFAR');
            expect(res.parcel).not.toHaveProperty('maxHeight_m');
            expect(res.parcel).not.toHaveProperty('maxFloors');
        }
    });

    it('a click NOT inside any returned polygon degrades to LOW (never HIGH), still general-boundary', async () => {
        // Ring far from the query point → no containing polygon → nearest/first usable, tier 'low'.
        const away = inspireFeatureCollection(
            [
                [-0.2005, 51.4006],
                [-0.1995, 51.4006],
                [-0.1995, 51.4014],
                [-0.2005, 51.4014],
                [-0.2005, 51.4006],
            ],
            { INSPIREID: 'X99', localAuthority: 'Lambeth' },
        );
        const { fetchImpl } = fakeFetch(away);
        const res = await fetchParcelAtPoint({ lat: LDN_LAT, lon: LDN_LON }, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.parcel.confidence).toBe('low');
            expect(res.parcel.generalBoundary).toBe(true);
        }
    });

    it('derives the area from the ring when INSPIRE omits the area attribute', async () => {
        const noArea = inspireFeatureCollection(INSPIRE_RING_WGS84, { INSPIREID: 'X', localAuthority: 'Westminster' });
        const { fetchImpl } = fakeFetch(noArea);
        const res = await fetchParcelAtPoint({ lat: LDN_LAT, lon: LDN_LON }, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.parcel.areaSource).toBe('derived-from-ring');
            expect(res.parcel.areaM2).toBeGreaterThan(0);
        }
    });

    it('out-of-England coordinates refuse `out-of-england` WITHOUT fetching', async () => {
        const { fetchImpl, calls } = fakeFetch(INSPIRE_OK);
        const res = await fetchParcelAtPoint({ lat: 48.8566, lon: 2.3522 }, { fetchImpl }); // Paris
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('out-of-england');
        expect(calls()).toBe(0);
    });

    it('an empty feature collection → `no-parcel-here`', async () => {
        const { fetchImpl } = fakeFetch({ type: 'FeatureCollection', features: [] });
        const res = await fetchParcelAtPoint({ lat: LDN_LAT, lon: LDN_LON }, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-parcel-here');
    });

    it('a native-27700 body → `crs-unhandled` (never fabricates lat/lon)', async () => {
        const { fetchImpl } = fakeFetch(INSPIRE_NATIVE_27700);
        const res = await fetchParcelAtPoint({ lat: LDN_LAT, lon: LDN_LON }, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('crs-unhandled');
    });

    it('a feature with no INSPIRE id → `unparsable-response`', async () => {
        const noId = inspireFeatureCollection(INSPIRE_RING_WGS84, { localAuthority: 'Westminster' });
        const { fetchImpl } = fakeFetch(noId);
        const res = await fetchParcelAtPoint({ lat: LDN_LAT, lon: LDN_LON }, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('unparsable-response');
    });

    it('an upstream non-OK response → `endpoint-unreachable`, never throws', async () => {
        const { fetchImpl } = fakeFetch(INSPIRE_OK, { ok: false });
        const res = await fetchParcelAtPoint({ lat: LDN_LAT, lon: LDN_LON }, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
    });

    it('a THROWING fetch → `endpoint-unreachable`, never throws into the caller', async () => {
        const throwFetch = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
        await expect(
            fetchParcelAtPoint({ lat: LDN_LAT, lon: LDN_LON }, { fetchImpl: throwFetch }),
        ).resolves.toMatchObject({ ok: false, reason: 'endpoint-unreachable' });
    });

    it('a malformed JSON body (json() throws) → `endpoint-unreachable`, never throws', async () => {
        const badJson = (async () => ({
            ok: true,
            json: async () => { throw new Error('unexpected token'); },
        })) as unknown as typeof fetch;
        const res = await fetchParcelAtPoint({ lat: LDN_LAT, lon: LDN_LON }, { fetchImpl: badJson });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
    });
});
