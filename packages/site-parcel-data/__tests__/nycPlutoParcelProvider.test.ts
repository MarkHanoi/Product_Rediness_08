// L-650 Phase-4 (USA / NYC) — NycPlutoParcelProvider tests. PURE + fixture-driven (no live network).
//
// Fixtures are modelled on the MapPLUTO schema (NYC DCP) verified in the NYC dossier + the Socrata FAR
// probe of 2026-07-24 (`us/findings/USA-PROBE-RESULTS-2026-07-24.md`). We pin the honesty invariants:
//   • a MapPLUTO feature parses → BBL + zoning + FAR + a WGS84 ring (the LEGISLATION head-start);
//   • `farRatio` is the GOVERNING as-of-right FAR (max of resid/comm/facil), NEVER MaxAllwFAR;
//   • a State-Plane ring is REFUSED (crs-unprojected), never plotted as degrees;
//   • the resolver never throws — misses/unreachable/malformed → typed refusals;
//   • the bbox predicate covers the 5 boroughs and excludes non-NYC points.

import { describe, it, expect } from 'vitest';
import {
    isInNYC,
    parseMapPlutoFeature,
    parseMapPlutoResponse,
    deriveFarRatio,
    boroughFromBbl,
    fetchParcelAtPoint,
    nycPlutoParcelProvider,
    NYC_MAPPLUTO_PARCEL_PATH,
} from '../src/parcelProviders/nycPlutoParcelProvider.js';

// A live-shaped ArcGIS FeatureServer feature (outSR=4326): a real-ish Manhattan R8 lot. A small WGS84
// ring near Union Square; BBL 1-block-lot; ResidFAR 6.02, CommFAR 6.0, FacilFAR 6.5.
const ARCGIS_FEATURE = {
    attributes: {
        BBL: '1008440001',
        Borough: 'MN',
        ZoneDist1: 'R8',
        Overlay1: 'C1-5',
        SPDist1: null,
        LotArea: 10000, // ft²
        NumFloors: 12,
        HeightRoof: 120, // ft
        ResidFAR: 6.02,
        CommFAR: 6.0,
        FacilFAR: 6.5,
        MaxAllwFAR: 7.2, // higher than the as-of-right fields → must NOT drive farRatio
        BuiltFAR: 5.1,
    },
    geometry: {
        rings: [[
            [-73.9906, 40.7359],
            [-73.9903, 40.7359],
            [-73.9903, 40.7362],
            [-73.9906, 40.7362],
            [-73.9906, 40.7359],
        ]],
    },
};

// A Socrata row (lower-case fields + GeoJSON the_geom) — the probed 64uk-42ks shape.
const SOCRATA_ROW = {
    bbl: '3012345678',
    borough: 'BK',
    zonedist1: 'R6',
    lotarea: '2500',
    numfloors: '4',
    residfar: '2.43',
    the_geom: {
        type: 'MultiPolygon',
        coordinates: [[[
            [-73.95, 40.68],
            [-73.949, 40.68],
            [-73.949, 40.681],
            [-73.95, 40.681],
            [-73.95, 40.68],
        ]]],
    },
};

describe('isInNYC — 5-borough bbox predicate', () => {
    const inside: ReadonlyArray<[string, number, number]> = [
        ['Manhattan (Union Square)', 40.7359, -73.9911],
        ['Brooklyn (Downtown)', 40.6928, -73.9903],
        ['Bronx (Yankee Stadium)', 40.8296, -73.9262],
        ['Queens (LIC)', 40.7447, -73.9485],
        ['Staten Island (St. George)', 40.6437, -74.0736],
    ];
    for (const [name, lat, lon] of inside) {
        it(`inside: ${name}`, () => expect(isInNYC(lat, lon)).toBe(true));
    }
    // A bbox is a COARSE router, not an authorisation: it self-corrects when MapPLUTO returns no lot
    // (→ footprint). So NJ's Hudson waterfront (Jersey City, within Staten Island's longitude band)
    // IS swept in — the documented rectangular-router tradeoff (cf. France/Zurich in countryBbox.ts).
    it('coarse-router caveat: Jersey City is swept in (self-corrects via empty MapPLUTO result)', () =>
        expect(isInNYC(40.7178, -74.0431)).toBe(true));
    // Genuinely outside: west of the bbox, and Boston to the north-east.
    it('outside: NJ interior (west of bbox)', () => expect(isInNYC(40.75, -74.6)).toBe(false));
    it('outside: Yonkers (north of bbox)', () => expect(isInNYC(40.95, -73.9)).toBe(false));
    it('outside: Boston', () => expect(isInNYC(42.3601, -71.0589)).toBe(false));
    it('non-finite → false', () => {
        expect(isInNYC(NaN, -73.99)).toBe(false);
        expect(isInNYC(40.7, Infinity)).toBe(false);
    });
});

describe('parseMapPlutoFeature — ArcGIS Esri-JSON', () => {
    it('parses BBL + zoning + FAR + geometry', () => {
        const r = parseMapPlutoFeature(ARCGIS_FEATURE);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.parcel.bbl).toBe('1008440001');
        expect(r.parcel.borough).toBe('Manhattan');
        expect(r.parcel.zoning.zoneDist1).toBe('R8');
        expect(r.parcel.zoning.overlay1).toBe('C1-5');
        expect(r.parcel.confidence).toBe('high');
        expect(r.parcel.source).toBe('nyc-mappluto');
        // ring came back in WGS84 lon/lat.
        expect(r.parcel.ring.length).toBeGreaterThanOrEqual(4);
        expect(r.parcel.ring[0]).toEqual({ lat: 40.7359, lon: -73.9906 });
        // LotArea ft² → m².
        expect(r.parcel.lotAreaSqFt).toBe(10000);
        expect(r.parcel.lotAreaM2).toBeCloseTo(929.03, 1);
        expect(r.parcel.numFloors).toBe(12);
        // HeightRoof 120 ft → ~36.6 m.
        expect(r.parcel.bldgHeightM).toBeCloseTo(36.576, 2);
    });

    it('farRatio is the governing as-of-right FAR (facil 6.5), NOT MaxAllwFAR (7.2)', () => {
        const r = parseMapPlutoFeature(ARCGIS_FEATURE);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.parcel.zoning.farRatio).toBe(6.5);
        expect(r.parcel.zoning.farBasis).toBe('facil');
        expect(r.parcel.zoning.maxAllwFAR).toBe(7.2); // carried raw, not folded
        expect(r.parcel.zoning.farCitation).toContain('NYC Zoning Resolution');
    });
});

describe('parseMapPlutoFeature — Socrata row', () => {
    it('parses lower-case fields + GeoJSON the_geom', () => {
        const r = parseMapPlutoFeature(SOCRATA_ROW);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.parcel.bbl).toBe('3012345678');
        expect(r.parcel.borough).toBe('Brooklyn');
        expect(r.parcel.zoning.zoneDist1).toBe('R6');
        expect(r.parcel.zoning.residFAR).toBe(2.43);
        expect(r.parcel.zoning.farRatio).toBe(2.43);
        expect(r.parcel.zoning.farBasis).toBe('resid');
        expect(r.parcel.ring[0]).toEqual({ lat: 40.68, lon: -73.95 });
    });
});

describe('parseMapPlutoFeature — honesty refusals', () => {
    it('no BBL → no-bbl', () => {
        const r = parseMapPlutoFeature({ attributes: { ZoneDist1: 'R6' }, geometry: ARCGIS_FEATURE.geometry });
        expect(r).toEqual({ ok: false, reason: 'no-bbl' });
    });
    it('State-Plane ring (feet) → crs-unprojected (never plotted as degrees)', () => {
        const r = parseMapPlutoFeature({
            attributes: { BBL: '1000010001' },
            geometry: { rings: [[[987000, 210000], [987010, 210000], [987010, 210010], [987000, 210000]]] },
        });
        expect(r).toEqual({ ok: false, reason: 'crs-unprojected' });
    });
    it('< 3 distinct vertices → degenerate-geometry', () => {
        const r = parseMapPlutoFeature({
            attributes: { BBL: '1000010001' },
            geometry: { rings: [[[-73.99, 40.73], [-73.99, 40.73]]] },
        });
        expect(r).toEqual({ ok: false, reason: 'degenerate-geometry' });
    });
    it('empty / non-object → no-lot', () => {
        expect(parseMapPlutoFeature(null)).toEqual({ ok: false, reason: 'no-lot' });
    });
    it('drops non-finite vertices while parsing the ring', () => {
        const r = parseMapPlutoFeature({
            attributes: { BBL: '1000010001' },
            geometry: { rings: [[[-73.99, 40.73], ['x', null], [-73.98, 40.73], [-73.98, 40.74], [-73.99, 40.73]]] },
        });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.parcel.ring.length).toBe(4);
    });
});

describe('deriveFarRatio — governing as-of-right FAR', () => {
    it('picks the max, tags the basis', () => {
        expect(deriveFarRatio(2.0, 3.4, 1.0)).toEqual({ farRatio: 3.4, farBasis: 'comm' });
        expect(deriveFarRatio(6.02, null, 6.5)).toEqual({ farRatio: 6.5, farBasis: 'facil' });
        expect(deriveFarRatio(null, null, null)).toEqual({ farRatio: null, farBasis: null });
    });
});

describe('boroughFromBbl', () => {
    it('from the BBL leading digit', () => {
        expect(boroughFromBbl('1008440001', null)).toBe('Manhattan');
        expect(boroughFromBbl('4008440001', null)).toBe('Queens');
    });
    it('from the MapPLUTO Borough code', () => {
        expect(boroughFromBbl(null, 'SI')).toBe('Staten Island');
    });
    it('null when neither resolves', () => {
        expect(boroughFromBbl(null, null)).toBeNull();
    });
});

describe('parseMapPlutoResponse — response shapes', () => {
    it('ArcGIS { features: [...] } → first feature', () => {
        const r = parseMapPlutoResponse({ features: [ARCGIS_FEATURE] });
        expect(r.ok).toBe(true);
    });
    it('Socrata array → first row', () => {
        const r = parseMapPlutoResponse([SOCRATA_ROW]);
        expect(r.ok).toBe(true);
    });
    it('empty features / empty array → no-lot', () => {
        expect(parseMapPlutoResponse({ features: [] })).toEqual({ ok: false, reason: 'no-lot' });
        expect(parseMapPlutoResponse([])).toEqual({ ok: false, reason: 'no-lot' });
    });
});

describe('fetchParcelAtPoint — the impure seam never throws', () => {
    const NYC = { lat: 40.7359, lon: -73.9911 };
    const okFetch = (body: unknown): typeof fetch =>
        (async () => ({ ok: true, json: async () => body })) as unknown as typeof fetch;

    it('resolves a parcel from the proxy body', async () => {
        const r = await fetchParcelAtPoint(NYC, { fetchImpl: okFetch({ features: [ARCGIS_FEATURE] }) });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.parcel.bbl).toBe('1008440001');
    });

    it('queries the same-origin proxy with the click coords', async () => {
        let calledUrl = '';
        const spy = (async (url: string) => {
            calledUrl = String(url);
            return { ok: true, json: async () => ({ features: [ARCGIS_FEATURE] }) };
        }) as unknown as typeof fetch;
        await fetchParcelAtPoint(NYC, { fetchImpl: spy });
        expect(calledUrl).toContain(NYC_MAPPLUTO_PARCEL_PATH);
        expect(calledUrl).toContain('lat=40.7359');
        expect(calledUrl).toContain('lon=-73.9911');
    });

    it('out-of-NYC point → out-of-nyc (no fetch attempted)', async () => {
        let called = false;
        const spy = (async () => { called = true; return { ok: true, json: async () => ({}) }; }) as unknown as typeof fetch;
        const r = await fetchParcelAtPoint({ lat: 42.36, lon: -71.06 }, { fetchImpl: spy });
        expect(r).toEqual({ ok: false, reason: 'out-of-nyc' });
        expect(called).toBe(false);
    });

    it('bad point / non-OK / throw / bad JSON → typed refusal, never throws', async () => {
        await expect(fetchParcelAtPoint(null)).resolves.toEqual({ ok: false, reason: 'no-point' });
        await expect(fetchParcelAtPoint({ lat: NaN, lon: -73.99 })).resolves.toEqual({ ok: false, reason: 'no-point' });

        const nonOk = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
        await expect(fetchParcelAtPoint(NYC, { fetchImpl: nonOk })).resolves.toEqual({ ok: false, reason: 'endpoint-unreachable' });

        const throwing = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
        await expect(fetchParcelAtPoint(NYC, { fetchImpl: throwing })).resolves.toEqual({ ok: false, reason: 'endpoint-unreachable' });

        const badJson = (async () => ({ ok: true, json: async () => { throw new Error('not json'); } })) as unknown as typeof fetch;
        await expect(fetchParcelAtPoint(NYC, { fetchImpl: badJson })).resolves.toEqual({ ok: false, reason: 'endpoint-unreachable' });
    });
});

describe('nycPlutoParcelProvider handle', () => {
    it('is a cadastral provider carrying isInNYC + fetchParcelAtPoint', () => {
        expect(nycPlutoParcelProvider.id).toBe('nyc-pluto');
        expect(nycPlutoParcelProvider.kind).toBe('cadastral');
        expect(nycPlutoParcelProvider.isInNYC(40.7359, -73.9911)).toBe(true);
        expect(typeof nycPlutoParcelProvider.fetchParcelAtPoint).toBe('function');
    });
});
