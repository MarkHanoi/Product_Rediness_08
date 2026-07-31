// UNITED KINGDOM / SCOTLAND — `fetchParcelAtPoint` / `parseRosCadastralFeatures` (Registers of Scotland
// Cadastral Map) Phase-4 tests.
//
// The compliance-critical seam turned pure: given a fixture RoS Cadastral Map WFS/GeoJSON body (NEVER a
// live call — every test injects `fetchImpl`), the parse is deterministic. The fixture is a registered
// ownership-extent feature in the shape the same-origin proxy returns (WGS84 GeoJSON), carrying a
// cadastral-unit / title id + a small ring near central Edinburgh. These tests pin THE UK HONESTY
// INVARIANT: the parcel IS resolved (RoS id + ring + `generalBoundary:true` + cited caveat), confidence is
// CAPPED MEDIUM — never HIGH — even when the click is inside the polygon; the resolver NEVER throws; a
// native-27700 body REFUSES `crs-unhandled` (never fabricated lat/lon); unregistered / Sasine-only land is
// `no-parcel-here`; and the Scotland bbox predicate routes correctly (incl. the Anglo-Scottish border).

import { describe, it, expect } from 'vitest';
import {
    fetchParcelAtPoint,
    parseRosCadastralFeatures,
    parseGeoJsonRing,
    pointInRing,
    isInScotland,
    GB_SCT_ROS_PROVIDER_ID,
    GB_SCT_GENERAL_BOUNDARY_CAVEAT,
    type SctParcelMatchTier,
} from '../src/parcelProviders/scotlandRosParcelProvider.js';

// A small WGS84 ring around a point in central Edinburgh (near the Royal Mile). (55.9490, -3.1900) is inside.
const EDI_LAT = 55.9490;
const EDI_LON = -3.1900;
const ROS_RING_WGS84: [number, number][] = [
    [-3.1905, 55.9486],
    [-3.1895, 55.9486],
    [-3.1895, 55.9494],
    [-3.1905, 55.9494],
    [-3.1905, 55.9486],
];

/** A RoS Cadastral Map GeoJSON FeatureCollection (the WGS84 shape the proxy returns). */
function rosFeatureCollection(ring: [number, number][], props: Record<string, unknown>) {
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

const ROS_OK = rosFeatureCollection(ROS_RING_WGS84, {
    titleNumber: 'MID123456',
    localAuthority: 'City of Edinburgh',
    areaValue: 402,
});

// A body still in native British National Grid (EPSG:27700) — easting/northing ~10^5..10^6, NOT degrees.
const ROS_NATIVE_27700 = rosFeatureCollection(
    [
        [325900, 673500],
        [325930, 673500],
        [325930, 673540],
        [325900, 673540],
        [325900, 673500],
    ],
    { titleNumber: 'MID123456' },
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

describe('isInScotland — the routing predicate', () => {
    it('accepts a Scotland point and rejects points outside the Scotland bbox', () => {
        expect(isInScotland(EDI_LAT, EDI_LON)).toBe(true); // Edinburgh
        expect(isInScotland(55.8642, -4.2518)).toBe(true); // Glasgow
        expect(isInScotland(57.1497, -2.0943)).toBe(true); // Aberdeen
        expect(isInScotland(51.5010, -0.1250)).toBe(false); // London (south of the box)
        expect(isInScotland(48.8566, 2.3522)).toBe(false); // Paris
    });
    it('is false on non-finite input (never throws)', () => {
        expect(isInScotland(Number.NaN, EDI_LON)).toBe(false);
        expect(isInScotland(EDI_LAT, Number.POSITIVE_INFINITY)).toBe(false);
    });
});

describe('parseGeoJsonRing — WGS84 guard', () => {
    it('parses a WGS84 ring to SctLatLon[]', () => {
        const ring = parseGeoJsonRing(ROS_RING_WGS84);
        expect(ring).not.toBeNull();
        expect(ring!).toHaveLength(5);
        expect(ring![0]).toEqual({ lat: 55.9486, lon: -3.1905 });
    });
    it('returns null for a native-27700 ring (out-of-degree-bounds → CRS not handled)', () => {
        expect(parseGeoJsonRing([[325900, 673500], [325930, 673540]])).toBeNull();
    });
});

describe('parseRosCadastralFeatures — the pure GeoJSON parse', () => {
    it('extracts the ownership-extent feature: cadastral-unit id, local authority, area, ring', () => {
        const feats = parseRosCadastralFeatures(ROS_OK);
        expect(feats).toHaveLength(1);
        expect(feats[0]!.cadastralUnitId).toBe('MID123456');
        expect(feats[0]!.localAuthority).toBe('City of Edinburgh');
        expect(feats[0]!.areaM2Attr).toBe(402);
        expect(feats[0]!.ring).toHaveLength(5);
        expect(feats[0]!.crsUnhandled).toBe(false);
    });
    it('falls back to the feature-level id when no title/cadastral-unit property', () => {
        const feats = parseRosCadastralFeatures({
            type: 'FeatureCollection',
            features: [
                {
                    type: 'Feature',
                    id: 'ROS.98765',
                    geometry: { type: 'Polygon', coordinates: [ROS_RING_WGS84] },
                    properties: {},
                },
            ],
        });
        expect(feats).toHaveLength(1);
        expect(feats[0]!.cadastralUnitId).toBe('ROS.98765');
    });
    it('flags crsUnhandled on a native-27700 geometry', () => {
        const feats = parseRosCadastralFeatures(ROS_NATIVE_27700);
        expect(feats).toHaveLength(1);
        expect(feats[0]!.crsUnhandled).toBe(true);
        expect(feats[0]!.ring).toHaveLength(0);
    });
    it('empty / malformed input is [] (never throws)', () => {
        expect(parseRosCadastralFeatures(null)).toEqual([]);
        expect(parseRosCadastralFeatures({})).toEqual([]);
        expect(parseRosCadastralFeatures({ features: 'nope' })).toEqual([]);
    });
});

describe('pointInRing', () => {
    it('is true for a point inside and false for one outside', () => {
        const ring = parseGeoJsonRing(ROS_RING_WGS84)!;
        expect(pointInRing(EDI_LAT, EDI_LON, ring)).toBe(true);
        expect(pointInRing(56.05, -3.19, ring)).toBe(false);
    });
});

describe('fetchParcelAtPoint — the UK general-boundary honesty invariant', () => {
    it('HAPPY PATH — resolves the parcel but caps confidence MEDIUM (never HIGH), even inside the polygon', async () => {
        const { fetchImpl } = fakeFetch(ROS_OK);
        const res = await fetchParcelAtPoint({ lat: EDI_LAT, lon: EDI_LON }, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.parcel.cadastralUnitId).toBe('MID123456');
            expect(res.parcel.localAuthority).toBe('City of Edinburgh');
            expect(res.parcel.areaM2).toBe(402);
            expect(res.parcel.areaSource).toBe('ros-attribute');
            expect(res.parcel.source).toBe(GB_SCT_ROS_PROVIDER_ID);
            // THE INVARIANT: inside the polygon, but STILL only MEDIUM — never 'high' (ownership, not survey).
            expect(res.parcel.confidence).toBe('medium');
            // `SctParcelMatchTier` has NO 'high' member — the cap is a COMPILE-TIME invariant, asserted here too.
            expect(['medium', 'low'] as SctParcelMatchTier[]).toContain(res.parcel.confidence);
            expect(res.parcel.generalBoundary).toBe(true);
            expect(res.parcel.caveat).toBe(GB_SCT_GENERAL_BOUNDARY_CAVEAT);
            expect(res.parcel.caveat).toMatch(/general boundaries/i);
            expect(res.parcel.caveat).toMatch(/NOT a survey-grade cadastre/i);
            expect(res.parcel.caveat).toMatch(/Sasine/i);
            expect(res.parcel.ring.length).toBeGreaterThanOrEqual(3);
        }
    });

    it('the resolved parcel carries NO envelope field (geometry-only honesty)', async () => {
        const { fetchImpl } = fakeFetch(ROS_OK);
        const res = await fetchParcelAtPoint({ lat: EDI_LAT, lon: EDI_LON }, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.parcel).not.toHaveProperty('maxFAR');
            expect(res.parcel).not.toHaveProperty('maxHeight_m');
            expect(res.parcel).not.toHaveProperty('maxFloors');
        }
    });

    it('a click NOT inside any returned polygon degrades to LOW (never HIGH), still general-boundary', async () => {
        // Ring far from the query point → no containing polygon → nearest/first usable, tier 'low'.
        const away = rosFeatureCollection(
            [
                [-4.2605, 55.8606],
                [-4.2595, 55.8606],
                [-4.2595, 55.8614],
                [-4.2605, 55.8614],
                [-4.2605, 55.8606],
            ],
            { titleNumber: 'GLA55', localAuthority: 'Glasgow City' },
        );
        const { fetchImpl } = fakeFetch(away);
        const res = await fetchParcelAtPoint({ lat: EDI_LAT, lon: EDI_LON }, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.parcel.confidence).toBe('low');
            expect(res.parcel.generalBoundary).toBe(true);
        }
    });

    it('derives the area from the ring when RoS omits the area attribute', async () => {
        const noArea = rosFeatureCollection(ROS_RING_WGS84, { titleNumber: 'X', localAuthority: 'Edinburgh' });
        const { fetchImpl } = fakeFetch(noArea);
        const res = await fetchParcelAtPoint({ lat: EDI_LAT, lon: EDI_LON }, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.parcel.areaSource).toBe('derived-from-ring');
            expect(res.parcel.areaM2).toBeGreaterThan(0);
        }
    });

    it('out-of-Scotland coordinates refuse `out-of-scotland` WITHOUT fetching', async () => {
        const { fetchImpl, calls } = fakeFetch(ROS_OK);
        const res = await fetchParcelAtPoint({ lat: 51.5010, lon: -0.1250 }, { fetchImpl }); // London
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('out-of-scotland');
        expect(calls()).toBe(0);
    });

    it('an empty feature collection (unregistered / Sasine-only land) → `no-parcel-here`', async () => {
        const { fetchImpl } = fakeFetch({ type: 'FeatureCollection', features: [] });
        const res = await fetchParcelAtPoint({ lat: EDI_LAT, lon: EDI_LON }, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-parcel-here');
    });

    it('a native-27700 body → `crs-unhandled` (never fabricates lat/lon)', async () => {
        const { fetchImpl } = fakeFetch(ROS_NATIVE_27700);
        const res = await fetchParcelAtPoint({ lat: EDI_LAT, lon: EDI_LON }, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('crs-unhandled');
    });

    it('a feature with no RoS id → `unparsable-response`', async () => {
        const noId = rosFeatureCollection(ROS_RING_WGS84, { localAuthority: 'Edinburgh' });
        const { fetchImpl } = fakeFetch(noId);
        const res = await fetchParcelAtPoint({ lat: EDI_LAT, lon: EDI_LON }, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('unparsable-response');
    });

    it('an upstream non-OK response → `endpoint-unreachable`, never throws', async () => {
        const { fetchImpl } = fakeFetch(ROS_OK, { ok: false });
        const res = await fetchParcelAtPoint({ lat: EDI_LAT, lon: EDI_LON }, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
    });

    it('a THROWING fetch → `endpoint-unreachable`, never throws into the caller', async () => {
        const throwFetch = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
        await expect(
            fetchParcelAtPoint({ lat: EDI_LAT, lon: EDI_LON }, { fetchImpl: throwFetch }),
        ).resolves.toMatchObject({ ok: false, reason: 'endpoint-unreachable' });
    });

    it('a malformed JSON body (json() throws) → `endpoint-unreachable`, never throws', async () => {
        const badJson = (async () => ({
            ok: true,
            json: async () => { throw new Error('unexpected token'); },
        })) as unknown as typeof fetch;
        const res = await fetchParcelAtPoint({ lat: EDI_LAT, lon: EDI_LON }, { fetchImpl: badJson });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
    });
});
