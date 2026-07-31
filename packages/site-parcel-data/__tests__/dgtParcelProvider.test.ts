// PORTUGAL (Continente) — `fetchParcelAtPoint` / `parseDgtCadastralFeatures` (DGT Cadastro Predial,
// SNIC `inspire:cadastralparcel`) Phase-4 tests.
//
// The compliance-critical seam turned pure: given a fixture WFS/GeoJSON body (NEVER a live call — every
// test injects `fetchImpl`), the parse is deterministic. The fixture mirrors the SNIC GeoServer response
// probed 2026-07-31 (WGS84 GeoJSON, `inspireid` / `nationalcadastralreference` / `label` / `areavalue` /
// `administrativeunit`). These tests pin THE PORTUGAL HONESTY INVARIANT: a real cadastre EARNS `high`
// (point-in-parcel + NIC), but every parcel carries the cited coverage caveat; the resolver NEVER throws;
// a native-EPSG:3763 body REFUSES `crs-unhandled` (never fabricated lat/lon); a coverage gap (empty WFS
// result) is an honest `no-parcel-here`, never a fabricated ring; and the mainland-only bbox routes right.

import { describe, it, expect } from 'vitest';
import {
    fetchParcelAtPoint,
    parseDgtCadastralFeatures,
    parseGeoJsonRing,
    pointInRing,
    ringAreaM2,
    isInPortugal,
    buildDgtCadastralWfsUrl,
    DGT_PARCEL_PROVIDER_ID,
    DGT_CADASTRO_TYPENAME,
    DGT_CADASTRO_WFS_ENDPOINT,
    PT_COVERAGE_CAVEAT,
    PORTUGAL_BBOX,
} from '../src/parcelProviders/dgtParcelProvider.js';

// A small WGS84 ring around a point in interior mainland Portugal (near the probed sample @ Castelo Branco).
const PT_LAT = 39.6713;
const PT_LON = -7.5534;
const CADASTRO_RING_WGS84: [number, number][] = [
    [-7.5540, 39.6709],
    [-7.5528, 39.6709],
    [-7.5528, 39.6717],
    [-7.5540, 39.6717],
    [-7.5540, 39.6709],
];

/** A Cadastro Predial GeoJSON FeatureCollection (the WGS84 shape the `/api/parcel/pt` proxy returns). */
function cadastroFeatureCollection(ring: [number, number][], props: Record<string, unknown>) {
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

const CADASTRO_OK = cadastroFeatureCollection(CADASTRO_RING_WGS84, {
    inspireid: 'PT.DGT.CP.AAA001318684',
    nationalcadastralreference: 'AAA001318684',
    label: 'AAA 001 318 684',
    areavalue: 30568,
    administrativeunit: '051102',
});

// A body still in native PT-TM06 (EPSG:3763) — easting/northing ~10^4..10^5, NOT degrees.
const CADASTRO_NATIVE_3763 = cadastroFeatureCollection(
    [
        [40000, 240000],
        [40030, 240000],
        [40030, 240040],
        [40000, 240040],
        [40000, 240000],
    ],
    { inspireid: 'PT.DGT.CP.AAA001318684' },
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

describe('isInPortugal — the routing predicate (mainland only)', () => {
    it('accepts mainland points and rejects points outside continental Portugal', () => {
        expect(isInPortugal(PT_LAT, PT_LON)).toBe(true); // interior mainland
        expect(isInPortugal(38.7223, -9.1393)).toBe(true); // Lisboa
        expect(isInPortugal(41.1579, -8.6291)).toBe(true); // Porto
        expect(isInPortugal(40.4168, -3.7038)).toBe(false); // Madrid (Spain — east of the box)
        expect(isInPortugal(32.6669, -16.9241)).toBe(false); // Funchal (Madeira — its own cadastre)
        expect(isInPortugal(37.7412, -25.6756)).toBe(false); // Ponta Delgada (Açores — its own cadastre)
    });
    it('is false on non-finite input (never throws)', () => {
        expect(isInPortugal(Number.NaN, PT_LON)).toBe(false);
        expect(isInPortugal(PT_LAT, Number.POSITIVE_INFINITY)).toBe(false);
    });
    it('the bbox matches the WFS-declared mainland extent', () => {
        expect(PORTUGAL_BBOX.minLon).toBeLessThan(-6.1 + 1e-9);
        expect(PORTUGAL_BBOX.maxLon).toBeGreaterThan(-9.6 - 1e-9);
    });
});

describe('parseGeoJsonRing — WGS84 CRS guard', () => {
    it('parses a WGS84 ring to LatLon[]', () => {
        const ring = parseGeoJsonRing(CADASTRO_RING_WGS84);
        expect(ring).not.toBeNull();
        expect(ring!).toHaveLength(5);
        expect(ring![0]).toEqual({ lat: 39.6709, lon: -7.5540 });
    });
    it('returns null for a native-3763 ring (out-of-degree-bounds → CRS not handled)', () => {
        expect(parseGeoJsonRing([[40000, 240000], [40030, 240040]])).toBeNull();
    });
});

describe('parseDgtCadastralFeatures — the pure GeoJSON parse', () => {
    it('extracts the parcel: INSPIRE id, NIC, município, area, ring', () => {
        const feats = parseDgtCadastralFeatures(CADASTRO_OK);
        expect(feats).toHaveLength(1);
        expect(feats[0]!.inspireId).toBe('PT.DGT.CP.AAA001318684');
        expect(feats[0]!.nic).toBe('AAA001318684'); // whitespace stripped from label/reference
        expect(feats[0]!.municipality).toBe('051102');
        expect(feats[0]!.areaM2Attr).toBe(30568);
        expect(feats[0]!.ring).toHaveLength(5);
        expect(feats[0]!.crsUnhandled).toBe(false);
    });
    it('derives the NIC from the INSPIRE localId tail when no reference/label property', () => {
        const feats = parseDgtCadastralFeatures(
            cadastroFeatureCollection(CADASTRO_RING_WGS84, { inspireid: 'PT.DGT.CP.ZZZ999' }),
        );
        expect(feats[0]!.nic).toBe('ZZZ999');
    });
    it('flags crsUnhandled on a native-3763 geometry', () => {
        const feats = parseDgtCadastralFeatures(CADASTRO_NATIVE_3763);
        expect(feats).toHaveLength(1);
        expect(feats[0]!.crsUnhandled).toBe(true);
        expect(feats[0]!.ring).toHaveLength(0);
    });
    it('empty / malformed input is [] (never throws)', () => {
        expect(parseDgtCadastralFeatures(null)).toEqual([]);
        expect(parseDgtCadastralFeatures({})).toEqual([]);
        expect(parseDgtCadastralFeatures({ features: 'nope' })).toEqual([]);
    });
});

describe('pointInRing / ringAreaM2', () => {
    it('is true for a point inside and false for one outside', () => {
        const ring = parseGeoJsonRing(CADASTRO_RING_WGS84)!;
        expect(pointInRing(PT_LAT, PT_LON, ring)).toBe(true);
        expect(pointInRing(40.0, -7.5534, ring)).toBe(false);
    });
    it('derives a positive parcel-scale area', () => {
        const ring = parseGeoJsonRing(CADASTRO_RING_WGS84)!;
        expect(ringAreaM2(ring)).toBeGreaterThan(0);
    });
});

describe('buildDgtCadastralWfsUrl — the exact upstream request the proxy must issue', () => {
    it('targets the SNIC WFS with the right typeName + WGS84 srsName + GeoJSON output', () => {
        const url = buildDgtCadastralWfsUrl(PT_LAT, PT_LON);
        expect(url.startsWith(DGT_CADASTRO_WFS_ENDPOINT)).toBe(true);
        expect(url).toContain(encodeURIComponent(DGT_CADASTRO_TYPENAME));
        expect(url).toContain('EPSG%3A%3A4326');
        expect(url).toContain('application%2Fjson');
    });
});

describe('fetchParcelAtPoint — the Portugal coverage-honesty invariant', () => {
    it('HAPPY PATH — resolves a HIGH-confidence parcel inside the polygon, with the cited coverage caveat', async () => {
        const { fetchImpl } = fakeFetch(CADASTRO_OK);
        const res = await fetchParcelAtPoint(PT_LAT, PT_LON, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.parcel.inspireId).toBe('PT.DGT.CP.AAA001318684');
            expect(res.parcel.nic).toBe('AAA001318684');
            expect(res.parcel.municipality).toBe('051102');
            expect(res.parcel.areaM2).toBe(30568);
            expect(res.parcel.areaSource).toBe('registry-declared');
            expect(res.parcel.source).toBe(DGT_PARCEL_PROVIDER_ID);
            // A REAL cadastre → inside + NIC EARNS 'high' (contrast the UK general-boundary cap).
            expect(res.parcel.confidence).toBe('high');
            // …but the coverage caveat is ALWAYS carried (national coverage is incomplete).
            expect(res.parcel.caveat).toBe(PT_COVERAGE_CAVEAT);
            expect(res.parcel.caveat).toMatch(/INCOMPLETE/);
            expect(res.parcel.caveat).toMatch(/mainland-only/);
            expect(res.parcel.ring.length).toBeGreaterThanOrEqual(3);
        }
    });

    it('the resolved parcel carries NO envelope field (geometry-only honesty)', async () => {
        const { fetchImpl } = fakeFetch(CADASTRO_OK);
        const res = await fetchParcelAtPoint(PT_LAT, PT_LON, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.parcel).not.toHaveProperty('maxFAR');
            expect(res.parcel).not.toHaveProperty('indice');
            expect(res.parcel).not.toHaveProperty('cercea');
            expect(res.parcel).not.toHaveProperty('maxHeight_m');
        }
    });

    it('inside a parcel but WITHOUT a NIC degrades to MEDIUM', async () => {
        // A polygon that contains the click but has no NIC-bearing attribute (only a numeric feature id).
        const noNic = {
            type: 'FeatureCollection',
            features: [
                {
                    type: 'Feature',
                    id: 12345,
                    geometry: { type: 'Polygon', coordinates: [CADASTRO_RING_WGS84] },
                    properties: {},
                },
            ],
        };
        const { fetchImpl } = fakeFetch(noNic);
        const res = await fetchParcelAtPoint(PT_LAT, PT_LON, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.parcel.nic).toBeNull();
            expect(res.parcel.confidence).toBe('medium');
        }
    });

    it('a click NOT inside any returned polygon degrades to LOW', async () => {
        const away = cadastroFeatureCollection(
            [
                [-8.6300, 41.1575],
                [-8.6288, 41.1575],
                [-8.6288, 41.1583],
                [-8.6300, 41.1583],
                [-8.6300, 41.1575],
            ],
            { inspireid: 'PT.DGT.CP.PORTO1', nationalcadastralreference: 'PORTO1' },
        );
        const { fetchImpl } = fakeFetch(away);
        const res = await fetchParcelAtPoint(PT_LAT, PT_LON, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.parcel.confidence).toBe('low');
    });

    it('derives the area from the ring when the WFS omits `areavalue`', async () => {
        const noArea = cadastroFeatureCollection(CADASTRO_RING_WGS84, {
            inspireid: 'PT.DGT.CP.X',
            nationalcadastralreference: 'X',
        });
        const { fetchImpl } = fakeFetch(noArea);
        const res = await fetchParcelAtPoint(PT_LAT, PT_LON, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.parcel.areaSource).toBe('derived-from-ring');
            expect(res.parcel.areaM2).toBeGreaterThan(0);
        }
    });

    it('out-of-Portugal coordinates refuse `out-of-portugal` WITHOUT fetching', async () => {
        const { fetchImpl, calls } = fakeFetch(CADASTRO_OK);
        const res = await fetchParcelAtPoint(40.4168, -3.7038, { fetchImpl }); // Madrid
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('out-of-portugal');
        expect(calls()).toBe(0);
    });

    it('an empty feature collection → `no-parcel-here` (honest coverage gap, never a fabricated ring)', async () => {
        const { fetchImpl } = fakeFetch({ type: 'FeatureCollection', features: [] });
        const res = await fetchParcelAtPoint(PT_LAT, PT_LON, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-parcel-here');
    });

    it('a native-3763 body → `crs-unhandled` (never fabricates lat/lon)', async () => {
        const { fetchImpl } = fakeFetch(CADASTRO_NATIVE_3763);
        const res = await fetchParcelAtPoint(PT_LAT, PT_LON, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('crs-unhandled');
    });

    it('a feature with no INSPIRE id and no feature id → `unparsable-response`', async () => {
        const noId = {
            type: 'FeatureCollection',
            features: [
                {
                    type: 'Feature',
                    geometry: { type: 'Polygon', coordinates: [CADASTRO_RING_WGS84] },
                    properties: { label: 'no id here' },
                },
            ],
        };
        const { fetchImpl } = fakeFetch(noId);
        const res = await fetchParcelAtPoint(PT_LAT, PT_LON, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('unparsable-response');
    });

    it('an upstream non-OK response → `endpoint-unreachable`, never throws', async () => {
        const { fetchImpl } = fakeFetch(CADASTRO_OK, { ok: false });
        const res = await fetchParcelAtPoint(PT_LAT, PT_LON, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
    });

    it('no fetch available → `endpoint-unreachable` (proxy not yet wired), never throws', async () => {
        const res = await fetchParcelAtPoint(PT_LAT, PT_LON, { fetchImpl: undefined as unknown as typeof fetch });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
    });

    it('a THROWING fetch → `endpoint-unreachable`, never throws into the caller', async () => {
        const throwFetch = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
        await expect(
            fetchParcelAtPoint(PT_LAT, PT_LON, { fetchImpl: throwFetch }),
        ).resolves.toMatchObject({ ok: false, reason: 'endpoint-unreachable' });
    });

    it('a malformed JSON body (json() throws) → `endpoint-unreachable`, never throws', async () => {
        const badJson = (async () => ({
            ok: true,
            json: async () => { throw new Error('unexpected token'); },
        })) as unknown as typeof fetch;
        const res = await fetchParcelAtPoint(PT_LAT, PT_LON, { fetchImpl: badJson });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
    });
});