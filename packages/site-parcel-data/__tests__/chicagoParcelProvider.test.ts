// L-650 Phase-4 (USA / Chicago) — ChicagoParcelProvider tests. PURE + fixture-driven (no live network).
//
// Fixtures model the Cook County parcel schema (PIN) + the Chicago zoning companion layer
// (`data.cityofchicago.org` 5s3e-9pji) documented in the Chicago dossier + `us/CITIES/CHICAGO.md`.
// We pin the honesty invariants:
//   • a Cook County feature parses → PIN + a WGS84 ring + shoelace-derived area (geometry-only base);
//   • an OPTIONAL joined zoning district folds in as a DRAFT head-start (code only, FAR/height null);
//   • a State-Plane ring is REFUSED (crs-unprojected), never plotted as degrees;
//   • the resolver never throws — misses/unreachable/malformed → typed refusals;
//   • the bbox predicate covers Chicago and excludes non-Chicago points.

import { describe, it, expect } from 'vitest';
import {
    isInChicago,
    parseCookCountyFeature,
    parseCookCountyResponse,
    deriveZoning,
    normalizePin,
    ringAreaM2,
    fetchParcelAtPoint,
    chicagoParcelProvider,
    CHICAGO_PARCEL_PATH,
} from '../src/parcelProviders/chicagoParcelProvider.js';

// A live-shaped ArcGIS FeatureServer feature (outSR=4326): a Loop parcel with a joined zoning code.
// A small WGS84 ring near the Chicago Loop; PIN 14-digit; zone_class DX-16 (downtown mixed-use).
const ARCGIS_FEATURE = {
    attributes: {
        PIN: '17-16-235-016-0000',
        zone_class: 'DX-16',
        zone_type: 'Downtown Mixed-Use District',
    },
    geometry: {
        rings: [[
            [-87.6300, 41.8790],
            [-87.6297, 41.8790],
            [-87.6297, 41.8793],
            [-87.6300, 41.8793],
            [-87.6300, 41.8790],
        ]],
    },
};

// A Socrata GeoJSON Feature (properties + GeoJSON geometry) — a residential parcel, no zoning join.
const GEOJSON_FEATURE = {
    type: 'Feature',
    properties: {
        pin: '13-25-113-012-0000',
    },
    geometry: {
        type: 'MultiPolygon',
        coordinates: [[[
            [-87.7100, 41.9300],
            [-87.7098, 41.9300],
            [-87.7098, 41.9302],
            [-87.7100, 41.9302],
            [-87.7100, 41.9300],
        ]]],
    },
};

describe('isInChicago — city / inner-Cook bbox predicate', () => {
    const inside: ReadonlyArray<[string, number, number]> = [
        ['The Loop', 41.8790, -87.6298],
        ['Lincoln Park', 41.9214, -87.6513],
        ['Hyde Park', 41.7943, -87.5907],
        ['O\'Hare (far NW)', 41.9742, -87.9073],
        ['Far South Side', 41.6500, -87.6000],
    ];
    for (const [name, lat, lon] of inside) {
        it(`inside: ${name}`, () => expect(isInChicago(lat, lon)).toBe(true));
    }
    // Genuinely outside: far outside the box in every direction.
    it('outside: Milwaukee (north)', () => expect(isInChicago(43.0389, -87.9065)).toBe(false));
    it('outside: Indianapolis (south-east)', () => expect(isInChicago(39.7684, -86.1581)).toBe(false));
    it('outside: mid-Lake Michigan (east)', () => expect(isInChicago(41.85, -87.0)).toBe(false));
    it('non-finite → false', () => {
        expect(isInChicago(NaN, -87.63)).toBe(false);
        expect(isInChicago(41.88, Infinity)).toBe(false);
    });
});

describe('normalizePin', () => {
    it('strips dashes/whitespace, keeps the digit run', () => {
        expect(normalizePin('17-16-235-016-0000')).toBe('17162350160000');
        expect(normalizePin(' 1325113012 ')).toBe('1325113012');
    });
    it('refuses a non-PIN string', () => {
        expect(normalizePin('N/A')).toBeNull();
        expect(normalizePin('')).toBeNull();
        expect(normalizePin(null)).toBeNull();
        expect(normalizePin('abc-def')).toBeNull();
    });
});

describe('parseCookCountyFeature — ArcGIS Esri-JSON + joined zoning', () => {
    it('parses PIN + geometry + a DRAFT zoning head-start', () => {
        const r = parseCookCountyFeature(ARCGIS_FEATURE);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.parcel.pin).toBe('17162350160000');
        expect(r.parcel.confidence).toBe('high');
        expect(r.parcel.source).toBe('chicago-cook');
        // ring came back in WGS84 lon/lat.
        expect(r.parcel.ring.length).toBeGreaterThanOrEqual(4);
        expect(r.parcel.ring[0]).toEqual({ lat: 41.8790, lon: -87.6300 });
        // area is shoelace-derived from the ring (never the ambiguous attribute).
        expect(r.parcel.areaSource).toBe('derived-from-ring');
        expect(r.parcel.areaM2).toBeGreaterThan(0);
        // DRAFT zoning: district code only, FAR/height null.
        expect(r.parcel.zoning).not.toBeNull();
        expect(r.parcel.zoning?.zoneClass).toBe('DX-16');
        expect(r.parcel.zoning?.isDraft).toBe(true);
        expect(r.parcel.zoning?.far).toBeNull();
        expect(r.parcel.zoning?.maxHeightM).toBeNull();
        expect(r.parcel.zoning?.citation).toContain('Title 17');
        expect(r.parcel.zoning?.caveat).toContain('DRAFT');
    });
});

describe('parseCookCountyFeature — GeoJSON Feature, geometry-only', () => {
    it('parses lower-case pin + GeoJSON geometry with no zoning', () => {
        const r = parseCookCountyFeature(GEOJSON_FEATURE);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.parcel.pin).toBe('13251130120000');
        expect(r.parcel.ring[0]).toEqual({ lat: 41.9300, lon: -87.7100 });
        // No zoning field present → geometry-only (null), never a fabricated district.
        expect(r.parcel.zoning).toBeNull();
    });
});

describe('parseCookCountyFeature — honesty refusals', () => {
    it('no PIN → no-pin', () => {
        const r = parseCookCountyFeature({ attributes: { zone_class: 'RS-3' }, geometry: ARCGIS_FEATURE.geometry });
        expect(r).toEqual({ ok: false, reason: 'no-pin' });
    });
    it('State-Plane ring (feet) → crs-unprojected (never plotted as degrees)', () => {
        const r = parseCookCountyFeature({
            attributes: { PIN: '17162350160000' },
            geometry: { rings: [[[1176000, 1900000], [1176010, 1900000], [1176010, 1900010], [1176000, 1900000]]] },
        });
        expect(r).toEqual({ ok: false, reason: 'crs-unprojected' });
    });
    it('< 3 distinct vertices → degenerate-geometry', () => {
        const r = parseCookCountyFeature({
            attributes: { PIN: '17162350160000' },
            geometry: { rings: [[[-87.63, 41.88], [-87.63, 41.88]]] },
        });
        expect(r).toEqual({ ok: false, reason: 'degenerate-geometry' });
    });
    it('empty / non-object → no-parcel', () => {
        expect(parseCookCountyFeature(null)).toEqual({ ok: false, reason: 'no-parcel' });
    });
    it('drops non-finite vertices while parsing the ring', () => {
        const r = parseCookCountyFeature({
            attributes: { PIN: '17162350160000' },
            geometry: { rings: [[[-87.63, 41.88], ['x', null], [-87.62, 41.88], [-87.62, 41.89], [-87.63, 41.88]]] },
        });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.parcel.ring.length).toBe(4);
    });
});

describe('deriveZoning — DRAFT district head-start', () => {
    it('null when no district code present (geometry-only)', () => {
        expect(deriveZoning({ pin: '17162350160000' })).toBeNull();
    });
    it('DRAFT district, FAR/height null, cited to Title 17', () => {
        const z = deriveZoning({ zoning_classification: 'B3-2' });
        expect(z).not.toBeNull();
        expect(z?.zoneClass).toBe('B3-2');
        expect(z?.isDraft).toBe(true);
        expect(z?.far).toBeNull();
        expect(z?.maxHeightM).toBeNull();
    });
});

describe('ringAreaM2', () => {
    it('is positive for a real ring and 0 for a degenerate one', () => {
        expect(ringAreaM2([{ lat: 41.879, lon: -87.63 }, { lat: 41.879, lon: -87.6297 }, { lat: 41.8793, lon: -87.6297 }])).toBeGreaterThan(0);
        expect(ringAreaM2([{ lat: 41.879, lon: -87.63 }])).toBe(0);
    });
});

describe('parseCookCountyResponse — response shapes', () => {
    it('ArcGIS { features: [...] } → first feature', () => {
        expect(parseCookCountyResponse({ features: [ARCGIS_FEATURE] }).ok).toBe(true);
    });
    it('GeoJSON FeatureCollection → first feature', () => {
        expect(parseCookCountyResponse({ type: 'FeatureCollection', features: [GEOJSON_FEATURE] }).ok).toBe(true);
    });
    it('bare array → first row', () => {
        expect(parseCookCountyResponse([GEOJSON_FEATURE]).ok).toBe(true);
    });
    it('empty features / empty array → no-parcel', () => {
        expect(parseCookCountyResponse({ features: [] })).toEqual({ ok: false, reason: 'no-parcel' });
        expect(parseCookCountyResponse([])).toEqual({ ok: false, reason: 'no-parcel' });
    });
});

describe('fetchParcelAtPoint — the impure seam never throws', () => {
    const CHI = { lat: 41.8790, lon: -87.6298 };
    const okFetch = (body: unknown): typeof fetch =>
        (async () => ({ ok: true, json: async () => body })) as unknown as typeof fetch;

    it('resolves a parcel from the proxy body', async () => {
        const r = await fetchParcelAtPoint(CHI, { fetchImpl: okFetch({ features: [ARCGIS_FEATURE] }) });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.parcel.pin).toBe('17162350160000');
    });

    it('queries the same-origin proxy with the click coords', async () => {
        let calledUrl = '';
        const spy = (async (url: string) => {
            calledUrl = String(url);
            return { ok: true, json: async () => ({ features: [ARCGIS_FEATURE] }) };
        }) as unknown as typeof fetch;
        await fetchParcelAtPoint(CHI, { fetchImpl: spy });
        expect(calledUrl).toContain(CHICAGO_PARCEL_PATH);
        expect(calledUrl).toContain('lat=41.879');
        expect(calledUrl).toContain('lon=-87.6298');
    });

    it('out-of-Chicago point → out-of-chicago (no fetch attempted)', async () => {
        let called = false;
        const spy = (async () => { called = true; return { ok: true, json: async () => ({}) }; }) as unknown as typeof fetch;
        const r = await fetchParcelAtPoint({ lat: 43.0389, lon: -87.9065 }, { fetchImpl: spy });
        expect(r).toEqual({ ok: false, reason: 'out-of-chicago' });
        expect(called).toBe(false);
    });

    it('bad point / non-OK / throw / bad JSON → typed refusal, never throws', async () => {
        await expect(fetchParcelAtPoint(null)).resolves.toEqual({ ok: false, reason: 'no-point' });
        await expect(fetchParcelAtPoint({ lat: NaN, lon: -87.63 })).resolves.toEqual({ ok: false, reason: 'no-point' });

        const nonOk = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
        await expect(fetchParcelAtPoint(CHI, { fetchImpl: nonOk })).resolves.toEqual({ ok: false, reason: 'endpoint-unreachable' });

        const throwing = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
        await expect(fetchParcelAtPoint(CHI, { fetchImpl: throwing })).resolves.toEqual({ ok: false, reason: 'endpoint-unreachable' });

        const badJson = (async () => ({ ok: true, json: async () => { throw new Error('not json'); } })) as unknown as typeof fetch;
        await expect(fetchParcelAtPoint(CHI, { fetchImpl: badJson })).resolves.toEqual({ ok: false, reason: 'endpoint-unreachable' });
    });
});

describe('chicagoParcelProvider handle', () => {
    it('is a cadastral provider carrying isInChicago + fetchParcelAtPoint', () => {
        expect(chicagoParcelProvider.id).toBe('chicago-cook');
        expect(chicagoParcelProvider.kind).toBe('cadastral');
        expect(chicagoParcelProvider.isInChicago(41.8790, -87.6298)).toBe(true);
        expect(typeof chicagoParcelProvider.fetchParcelAtPoint).toBe('function');
    });
});
