// L-650 Phase-4 (USA / San Francisco) — SfParcelProvider tests. PURE + fixture-driven (no live network).
//
// Fixtures are modelled on the DataSF assessor "Parcels – Active and Retired" schema (`acdm-wktn`:
// `blklot`/`mapblklot`/`block_num`/`lot_num` + a GeoJSON `the_geom`) and an ArcGIS Esri-JSON shape. We
// pin the honesty invariants:
//   • a DataSF feature parses → APN/blocklot + a WGS84 ring + a geometry-derived area;
//   • SF surfaces NO FAR (governs by height-and-bulk, ADR-0270); zoning is an OPTIONAL DRAFT lead only;
//   • a State-Plane ring is REFUSED (crs-unprojected), never plotted as degrees;
//   • the resolver never throws — misses/unreachable/malformed → typed refusals;
//   • the bbox predicate covers the SF peninsula and excludes non-SF points.

import { describe, it, expect } from 'vitest';
import {
    isInSF,
    parseSfParcelFeature,
    parseSfParcelResponse,
    parseZoningDraft,
    ringAreaM2,
    fetchParcelAtPoint,
    sfParcelProvider,
    SF_DATASF_PARCEL_PATH,
} from '../src/parcelProviders/sfParcelProvider.js';

// A live-shaped ArcGIS FeatureServer feature (outSR=4326): a small WGS84 lot near the Ferry Building.
const ARCGIS_FEATURE = {
    attributes: {
        BLKLOT: '0234001',
        MAPBLKLOT: '0234001',
        BLOCK_NUM: '0234',
        LOT_NUM: '001',
        ACTIVE: true,
    },
    geometry: {
        rings: [[
            [-122.4000, 37.7950],
            [-122.3997, 37.7950],
            [-122.3997, 37.7952],
            [-122.4000, 37.7952],
            [-122.4000, 37.7950],
        ]],
    },
};

// A Socrata row (lower-case fields + GeoJSON the_geom) — the probed acdm-wktn shape, WITH a companion
// zoning/height join the proxy may add (zoning + height-and-bulk district `40-X`).
const SOCRATA_ROW = {
    blklot: '3512028',
    mapblklot: '3512028',
    block_num: '3512',
    lot_num: '028',
    zoning: 'RH-2',
    zoning_sim: 'Residential',
    height: '40-X',
    the_geom: {
        type: 'MultiPolygon',
        coordinates: [[[
            [-122.4260, 37.7600],
            [-122.4257, 37.7600],
            [-122.4257, 37.7602],
            [-122.4260, 37.7602],
            [-122.4260, 37.7600],
        ]]],
    },
};

describe('isInSF — city-county bbox predicate', () => {
    const inside: ReadonlyArray<[string, number, number]> = [
        ['Ferry Building', 37.7955, -122.3937],
        ['Twin Peaks', 37.7544, -122.4477],
        ['Ocean Beach edge', 37.7600, -122.5100],
        ['Treasure Island', 37.8230, -122.3710],
        ['Bayview', 37.7300, -122.3820],
    ];
    for (const [name, lat, lon] of inside) {
        it(`inside: ${name}`, () => expect(isInSF(lat, lon)).toBe(true));
    }
    it('outside: Oakland (east of the bay)', () => expect(isInSF(37.8044, -122.2712)).toBe(false));
    it('outside: Daly City (south of bbox)', () => expect(isInSF(37.6879, -122.4702)).toBe(false));
    it('outside: New York City', () => expect(isInSF(40.7359, -73.9911)).toBe(false));
    it('non-finite → false', () => {
        expect(isInSF(NaN, -122.4)).toBe(false);
        expect(isInSF(37.77, Infinity)).toBe(false);
    });
});

describe('parseSfParcelFeature — ArcGIS Esri-JSON', () => {
    it('parses APN/blocklot + geometry + geometry-derived area', () => {
        const r = parseSfParcelFeature(ARCGIS_FEATURE);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.parcel.apn).toBe('0234001');
        expect(r.parcel.mapBlockLot).toBe('0234001');
        expect(r.parcel.blockNum).toBe('0234');
        expect(r.parcel.lotNum).toBe('001');
        expect(r.parcel.confidence).toBe('high');
        expect(r.parcel.source).toBe('sf-datasf');
        // ring came back in WGS84 lon/lat.
        expect(r.parcel.ring.length).toBeGreaterThanOrEqual(4);
        expect(r.parcel.ring[0]).toEqual({ lat: 37.7950, lon: -122.4000 });
        // area computed from the ring (a ~0.0003° × 0.0002° box ≈ ~26 m × ~22 m ≈ ~590 m²).
        expect(r.parcel.areaM2).toBeGreaterThan(400);
        expect(r.parcel.areaM2).toBeLessThan(800);
        // NO FAR, and no zoning unless a companion layer was joined.
        expect(r.parcel.zoning).toBeNull();
        expect((r.parcel as unknown as { farRatio?: unknown }).farRatio).toBeUndefined();
    });
});

describe('parseSfParcelFeature — Socrata row with a companion zoning/height join', () => {
    it('parses lower-case fields + GeoJSON the_geom + the DRAFT zoning lead', () => {
        const r = parseSfParcelFeature(SOCRATA_ROW);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.parcel.apn).toBe('3512028');
        expect(r.parcel.ring[0]).toEqual({ lat: 37.7600, lon: -122.4260 });
        // DRAFT zoning lead surfaced from the join.
        expect(r.parcel.zoning).not.toBeNull();
        expect(r.parcel.zoning!.zoningDistrict).toBe('RH-2');
        expect(r.parcel.zoning!.zoningSimplified).toBe('Residential');
        expect(r.parcel.zoning!.heightBulkDistrict).toBe('40-X');
        // 40 ft → 12.192 m, DRAFT.
        expect(r.parcel.zoning!.heightLimitDraftM).toBeCloseTo(12.192, 2);
        expect(r.parcel.zoning!.draft).toBe(true);
        expect(r.parcel.zoning!.citation).toContain('SF Planning Code');
    });
});

describe('parseZoningDraft — SF governs by height-and-bulk, NOT FAR', () => {
    it('null when no companion fields are present (geometry-only default)', () => {
        expect(parseZoningDraft({ blklot: '0234001' })).toBeNull();
    });
    it('parses a leading-ft height from the district code', () => {
        const z = parseZoningDraft({ height: '240-S' });
        expect(z).not.toBeNull();
        expect(z!.heightBulkDistrict).toBe('240-S');
        expect(z!.heightLimitDraftM).toBeCloseTo(73.152, 2);
    });
    it('a non-numeric district (`OS`) → raw carried, height null', () => {
        const z = parseZoningDraft({ height: 'OS' });
        expect(z).not.toBeNull();
        expect(z!.heightBulkDistrict).toBe('OS');
        expect(z!.heightLimitDraftM).toBeNull();
    });
});

describe('ringAreaM2 — geometry-derived, deterministic', () => {
    it('a ~100 m square near SF latitude ≈ 10,000 m²', () => {
        // 100 m ≈ 0.000898° lat; lon at 37.77° ≈ 0.001136°.
        const ring = [
            { lat: 37.7700, lon: -122.4200 },
            { lat: 37.7700, lon: -122.4200 + 0.001136 },
            { lat: 37.7700 + 0.000898, lon: -122.4200 + 0.001136 },
            { lat: 37.7700 + 0.000898, lon: -122.4200 },
        ];
        expect(ringAreaM2(ring)).toBeGreaterThan(9500);
        expect(ringAreaM2(ring)).toBeLessThan(10500);
    });
    it('< 3 vertices → 0', () => {
        expect(ringAreaM2([{ lat: 37.77, lon: -122.42 }, { lat: 37.77, lon: -122.42 }])).toBe(0);
    });
});

describe('parseSfParcelFeature — honesty refusals', () => {
    it('no APN → no-apn', () => {
        const r = parseSfParcelFeature({ attributes: { block_num: '0234' }, geometry: ARCGIS_FEATURE.geometry });
        expect(r).toEqual({ ok: false, reason: 'no-apn' });
    });
    it('State-Plane ring (feet) → crs-unprojected (never plotted as degrees)', () => {
        const r = parseSfParcelFeature({
            attributes: { blklot: '0234001' },
            geometry: { rings: [[[6010000, 2110000], [6010010, 2110000], [6010010, 2110010], [6010000, 2110000]]] },
        });
        expect(r).toEqual({ ok: false, reason: 'crs-unprojected' });
    });
    it('< 3 distinct vertices → degenerate-geometry', () => {
        const r = parseSfParcelFeature({
            attributes: { blklot: '0234001' },
            geometry: { rings: [[[-122.40, 37.79], [-122.40, 37.79]]] },
        });
        expect(r).toEqual({ ok: false, reason: 'degenerate-geometry' });
    });
    it('empty / non-object → no-lot', () => {
        expect(parseSfParcelFeature(null)).toEqual({ ok: false, reason: 'no-lot' });
    });
    it('drops non-finite vertices while parsing the ring', () => {
        const r = parseSfParcelFeature({
            attributes: { blklot: '0234001' },
            geometry: { rings: [[[-122.40, 37.79], ['x', null], [-122.39, 37.79], [-122.39, 37.80], [-122.40, 37.79]]] },
        });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.parcel.ring.length).toBe(4);
    });
});

describe('parseSfParcelResponse — response shapes', () => {
    it('ArcGIS { features: [...] } → first feature', () => {
        const r = parseSfParcelResponse({ features: [ARCGIS_FEATURE] });
        expect(r.ok).toBe(true);
    });
    it('Socrata array → first row', () => {
        const r = parseSfParcelResponse([SOCRATA_ROW]);
        expect(r.ok).toBe(true);
    });
    it('empty features / empty array → no-lot', () => {
        expect(parseSfParcelResponse({ features: [] })).toEqual({ ok: false, reason: 'no-lot' });
        expect(parseSfParcelResponse([])).toEqual({ ok: false, reason: 'no-lot' });
    });
});

describe('fetchParcelAtPoint — the impure seam never throws', () => {
    const SF = { lat: 37.7955, lon: -122.3937 };
    const okFetch = (body: unknown): typeof fetch =>
        (async () => ({ ok: true, json: async () => body })) as unknown as typeof fetch;

    it('resolves a parcel from the proxy body', async () => {
        const r = await fetchParcelAtPoint(SF, { fetchImpl: okFetch({ features: [ARCGIS_FEATURE] }) });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.parcel.apn).toBe('0234001');
    });

    it('queries the same-origin proxy with the click coords', async () => {
        let calledUrl = '';
        const spy = (async (url: string) => {
            calledUrl = String(url);
            return { ok: true, json: async () => ({ features: [ARCGIS_FEATURE] }) };
        }) as unknown as typeof fetch;
        await fetchParcelAtPoint(SF, { fetchImpl: spy });
        expect(calledUrl).toContain(SF_DATASF_PARCEL_PATH);
        expect(calledUrl).toContain('lat=37.7955');
        expect(calledUrl).toContain('lon=-122.3937');
    });

    it('out-of-SF point → out-of-sf (no fetch attempted)', async () => {
        let called = false;
        const spy = (async () => { called = true; return { ok: true, json: async () => ({}) }; }) as unknown as typeof fetch;
        const r = await fetchParcelAtPoint({ lat: 40.7359, lon: -73.9911 }, { fetchImpl: spy });
        expect(r).toEqual({ ok: false, reason: 'out-of-sf' });
        expect(called).toBe(false);
    });

    it('bad point / non-OK / throw / bad JSON → typed refusal, never throws', async () => {
        await expect(fetchParcelAtPoint(null)).resolves.toEqual({ ok: false, reason: 'no-point' });
        await expect(fetchParcelAtPoint({ lat: NaN, lon: -122.4 })).resolves.toEqual({ ok: false, reason: 'no-point' });

        const nonOk = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
        await expect(fetchParcelAtPoint(SF, { fetchImpl: nonOk })).resolves.toEqual({ ok: false, reason: 'endpoint-unreachable' });

        const throwing = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
        await expect(fetchParcelAtPoint(SF, { fetchImpl: throwing })).resolves.toEqual({ ok: false, reason: 'endpoint-unreachable' });

        const badJson = (async () => ({ ok: true, json: async () => { throw new Error('not json'); } })) as unknown as typeof fetch;
        await expect(fetchParcelAtPoint(SF, { fetchImpl: badJson })).resolves.toEqual({ ok: false, reason: 'endpoint-unreachable' });
    });
});

describe('sfParcelProvider handle', () => {
    it('is a cadastral provider carrying isInSF + fetchParcelAtPoint', () => {
        expect(sfParcelProvider.id).toBe('sf-datasf');
        expect(sfParcelProvider.kind).toBe('cadastral');
        expect(sfParcelProvider.isInSF(37.7955, -122.3937)).toBe(true);
        expect(typeof sfParcelProvider.fetchParcelAtPoint).toBe('function');
    });
});
