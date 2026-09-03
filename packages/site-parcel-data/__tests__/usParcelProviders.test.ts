// LANE US-EXPAND — the four new US parcel jurisdictions (MA · FL · WA-King · TX-Harris).
//
// PURE + fixture-driven (no live network). Every fixture below is COPIED FROM THE REAL LIVE PROBE
// on 2026-09-03 (attributes + WGS84 rings verbatim from the ArcGIS response), so the tests are
// deterministic in CI while pinning the real upstream shape. The transcripts + click coordinates
// are in `audit/intl-parcels/2026-09-02/lane-us-expand.md`.
//
// Two axes, both load-bearing (the §committed≠reachable lesson):
//   • the shared PARSER turns each live-shaped feature into an id + a WGS84 ring + a geometry area,
//     refuses a projected ring, and never throws;
//   • the REGISTRY actually ROUTES each golden click to the new row FIRST — delete a row and the
//     matching reachability test fails.

import { describe, it, expect } from 'vitest';
import {
    US_MA_PARCELS,
    US_FL_PARCELS,
    US_WA_KING_PARCELS,
    US_TX_HARRIS_PARCELS,
    US_EXPAND_PARCEL_CONFIGS,
    isInMassachusetts,
    isInFlorida,
    isInKingCountyWa,
    isInHarrisCountyTx,
    parseUsArcgisParcelFeature,
    parseUsArcgisParcelResponse,
    buildUsArcgisPointQueryUrl,
    ringAreaM2,
    fetchUsParcelAtPoint,
    usMaParcelProvider,
    type UsArcgisParcelConfig,
} from '../src/countryAdapters/us/index.js';
import {
    resolveParcelCandidates,
    listParcelJurisdictions,
    parcelJurisdictionSpecificity,
    type ParcelJurisdiction,
} from '../src/parcelProviders/registry.js';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// RECORDED-LIVE FIXTURES — real attributes + real WGS84 rings from the 2026-09-03 probe.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** MassGIS L3 · Worcester — LOC_ID F_574532_2920828 (455 Main St), the live probe's parcel. */
const MA_FEATURE = {
    attributes: {
        LOC_ID: 'F_574532_2920828',
        MAP_PAR_ID: '02-024-00001',
        SITE_ADDR: '455 MAIN ST',
        CITY: 'WORCESTER',
        USE_CODE: '9310',
        FY: 2026,
    },
    geometry: {
        rings: [[
            [-71.801933, 42.263172],
            [-71.801586, 42.263058],
            [-71.800691, 42.262729],
            [-71.800976, 42.262069],
            [-71.801122, 42.261732],
            [-71.801933, 42.263172],
        ]],
    },
};

/** FDOR statewide · Tampa — PARCEL_ID 1829244ZI000075000020A (325 N Florida Ave). Real 5-vertex ring. */
const FL_FEATURE = {
    attributes: {
        PARCEL_ID: '1829244ZI000075000020A',
        CO_NO: 39,
        DOR_UC: '039',
        PHY_ADDR1: '325 N FLORIDA AVE',
        PHY_CITY: 'TAMPA',
        ASMNT_YR: 2025,
    },
    geometry: {
        rings: [[
            [-82.456082, 27.947581],
            [-82.456696, 27.947372],
            [-82.456931, 27.947917],
            [-82.456325, 27.948128],
            [-82.456082, 27.947581],
        ]],
    },
};

/** King County · Capitol Hill, Seattle — PIN 9831200275. Geometry + PIN only (SF strong case). */
const WA_FEATURE = {
    attributes: {
        OBJECTID: 1216,
        MAJOR: '983120',
        MINOR: '0275',
        PIN: '9831200275',
    },
    geometry: {
        rings: [[
            [-122.321853, 47.625388],
            [-122.321855, 47.625251],
            [-122.321857, 47.625172],
            [-122.322104, 47.625172],
            [-122.322124, 47.625184],
            [-122.321853, 47.625388],
        ]],
    },
};

/** Harris County / HCAD · Montrose, Houston — HCAD_NUM 0261520000043 (3217 Montrose Blvd). */
const TX_FEATURE = {
    attributes: {
        LOWPARCELID: '0261520000043',
        HCAD_NUM: '0261520000043',
        acct_num: '0261520000043',
        SiteNumber: '3217',
        mail_addr_1: '3217 MONTROSE BLVD',
        site_city: 'HOUSTON',
        mail_city: 'HOUSTON',
        tax_year: '2025',
    },
    geometry: {
        rings: [[
            [-95.390883, 29.743828],
            [-95.391110, 29.743826],
            [-95.391112, 29.744058],
            [-95.390720, 29.744064],
            [-95.390718, 29.743967],
            [-95.390883, 29.743828],
        ]],
    },
};

/** The four golden clicks — the EXACT WGS84 points that returned the fixtures above, live. */
const GOLDEN = {
    ma: { lat: 42.26259, lon: -71.80230, name: 'Worcester, MA' },
    fl: { lat: 27.94810, lon: -82.45640, name: 'Tampa, FL' },
    wa: { lat: 47.62530, lon: -122.32220, name: 'Capitol Hill, Seattle WA' },
    tx: { lat: 29.74400, lon: -95.39080, name: 'Montrose, Houston TX' },
} as const;

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE SHARED PARSER — each live feature → id + WGS84 ring + geometry-derived area.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('US-EXPAND parser — recorded-live features parse to id + ring + area', () => {
    const cases: ReadonlyArray<[string, unknown, UsArcgisParcelConfig, string, string | null, string | null]> = [
        ['MA / MassGIS', MA_FEATURE, US_MA_PARCELS, 'F_574532_2920828', '02-024-00001', 'WORCESTER'],
        ['FL / FDOR', FL_FEATURE, US_FL_PARCELS, '1829244ZI000075000020A', null, 'TAMPA'],
        ['WA / King', WA_FEATURE, US_WA_KING_PARCELS, '9831200275', '983120', null],
        ['TX / HCAD', TX_FEATURE, US_TX_HARRIS_PARCELS, '0261520000043', '3217', 'HOUSTON'],
    ];

    for (const [name, feature, config, id, altId, locality] of cases) {
        it(`${name}: id=${id}, WGS84 ring, positive area`, () => {
            const r = parseUsArcgisParcelFeature(feature, config);
            expect(r.ok).toBe(true);
            if (!r.ok) return;
            expect(r.parcel.parcelId).toBe(id);
            expect(r.parcel.altParcelId).toBe(altId);
            expect(r.parcel.locality).toBe(locality);
            expect(r.parcel.crs).toBe('EPSG:4326');
            expect(r.parcel.source).toBe(config.providerId);
            expect(r.parcel.confidence).toBe('high');
            // WGS84 magnitude, not State-Plane.
            for (const p of r.parcel.ring) {
                expect(Math.abs(p.lon)).toBeLessThanOrEqual(180);
                expect(Math.abs(p.lat)).toBeLessThanOrEqual(90);
            }
            expect(r.parcel.areaM2).toBeGreaterThan(0);
        });
    }

    it('MA parcel area is a plausible urban lot magnitude (geometry-derived, not an upstream field)', () => {
        const r = parseUsArcgisParcelFeature(MA_FEATURE, US_MA_PARCELS);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        // The truncated fixture ring encloses a few thousand m² — assert a sane order of magnitude.
        expect(r.parcel.areaM2).toBeGreaterThan(500);
        expect(r.parcel.areaM2).toBeLessThan(1_000_000);
    });

    it('a Socrata-style array response and an ArcGIS {features:[…]} response both parse', () => {
        expect(parseUsArcgisParcelResponse([FL_FEATURE], US_FL_PARCELS).ok).toBe(true);
        expect(parseUsArcgisParcelResponse({ features: [WA_FEATURE] }, US_WA_KING_PARCELS).ok).toBe(true);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. HONESTY GATES — empty, malformed, projected-CRS and no-id are DISTINCT refusals; never throws.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('US-EXPAND parser — typed refusals, never a throw or a guess', () => {
    it('zero features → no-parcel (not an error)', () => {
        const r = parseUsArcgisParcelResponse({ features: [] }, US_MA_PARCELS);
        expect(r).toEqual({ ok: false, reason: 'no-parcel' });
    });

    it('an ArcGIS error body → endpoint-unreachable (distinct from no-parcel)', () => {
        const r = parseUsArcgisParcelResponse({ error: { code: 400, message: 'bad' } }, US_FL_PARCELS);
        expect(r).toEqual({ ok: false, reason: 'endpoint-unreachable' });
    });

    it('a feature with no id field → no-parcel-id (refuse rather than key on geometry alone)', () => {
        const r = parseUsArcgisParcelFeature(
            { attributes: { SOMETHING: 'x' }, geometry: WA_FEATURE.geometry },
            US_WA_KING_PARCELS,
        );
        expect(r).toEqual({ ok: false, reason: 'no-parcel-id' });
    });

    it('a State-Plane (feet) ring → crs-unprojected (never plotted as degrees)', () => {
        // King County native EPSG:3857/2926 magnitudes — the guard must catch a proxy that forgot outSR.
        const projected = {
            attributes: { PIN: '9831200275' },
            geometry: { rings: [[
                [1_270_500.0, 230_100.0],
                [1_270_600.0, 230_100.0],
                [1_270_600.0, 230_200.0],
                [1_270_500.0, 230_200.0],
                [1_270_500.0, 230_100.0],
            ]] },
        };
        expect(parseUsArcgisParcelFeature(projected, US_WA_KING_PARCELS)).toEqual({
            ok: false,
            reason: 'crs-unprojected',
        });
    });

    it('a degenerate (2-vertex) ring → degenerate-geometry', () => {
        const r = parseUsArcgisParcelFeature(
            { attributes: { PARCEL_ID: 'X' }, geometry: { rings: [[[-82.4, 27.9], [-82.4, 27.9]]] } },
            US_FL_PARCELS,
        );
        expect(r).toEqual({ ok: false, reason: 'degenerate-geometry' });
    });

    it('null / non-object feature → no-parcel, no throw', () => {
        expect(parseUsArcgisParcelFeature(null, US_MA_PARCELS)).toEqual({ ok: false, reason: 'no-parcel' });
        expect(parseUsArcgisParcelResponse(42, US_MA_PARCELS)).toEqual({ ok: false, reason: 'no-parcel' });
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. BBOX PREDICATES — the golden click is inside, and out-of-jurisdiction points are outside.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('US-EXPAND bbox predicates', () => {
    it('each golden click is inside its own jurisdiction bbox', () => {
        expect(isInMassachusetts(GOLDEN.ma.lat, GOLDEN.ma.lon)).toBe(true);
        expect(isInFlorida(GOLDEN.fl.lat, GOLDEN.fl.lon)).toBe(true);
        expect(isInKingCountyWa(GOLDEN.wa.lat, GOLDEN.wa.lon)).toBe(true);
        expect(isInHarrisCountyTx(GOLDEN.tx.lat, GOLDEN.tx.lon)).toBe(true);
    });

    it('the county boxes exclude the rest of their state (no statewide overstatement)', () => {
        // Spokane, WA — far east of King County.
        expect(isInKingCountyWa(47.6588, -117.4260)).toBe(false);
        // Dallas, TX — far north of Harris County.
        expect(isInHarrisCountyTx(32.7767, -96.7970)).toBe(false);
    });

    it('no US predicate matches a European or non-finite point', () => {
        for (const p of [isInMassachusetts, isInFlorida, isInKingCountyWa, isInHarrisCountyTx]) {
            expect(p(48.8566, 2.3522)).toBe(false); // Paris
            expect(p(Number.NaN, Number.NaN)).toBe(false);
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. REGISTRY WIRING — the router SELECTS each new row FIRST at its golden click (reachability).
//    Delete a row from PARCEL_JURISDICTIONS and the matching case here fails.
// ══════════════════════════════════════════════════════════════════════════════════════════════

function primary(lat: number, lon: number): ParcelJurisdiction | undefined {
    return resolveParcelCandidates(lat, lon)[0];
}

describe('US-EXPAND reachability — each jurisdiction is actually routed to', () => {
    const cases: ReadonlyArray<[string, number, number, string, string]> = [
        ['MA → MassGIS L3', GOLDEN.ma.lat, GOLDEN.ma.lon, 'US-MA', 'us-ma-massgis-l3'],
        ['FL → FDOR cadastral', GOLDEN.fl.lat, GOLDEN.fl.lon, 'US-FL', 'us-fl-fdor-cadastral'],
        ['WA-King → King County', GOLDEN.wa.lat, GOLDEN.wa.lon, 'US-WA-KING', 'us-wa-king-parcels'],
        ['TX-Harris → HCAD', GOLDEN.tx.lat, GOLDEN.tx.lon, 'US-TX-HARRIS', 'us-tx-harris-hcad'],
    ];

    for (const [name, lat, lon, regionCode, providerId] of cases) {
        it(`${name} — router picks it FIRST, and it is the SOLE candidate`, () => {
            const candidates = resolveParcelCandidates(lat, lon);
            expect(candidates.length).toBe(1); // no US box overlaps any other row
            expect(candidates[0]!.regionCode).toBe(regionCode);
            expect(candidates[0]!.providerId).toBe(providerId);
            expect(candidates[0]!.kind).toBe('cadastral');
            expect(candidates[0]!.proxyPath).toBe(US_EXPAND_PARCEL_CONFIGS.find((c) => c.regionCode === regionCode)!.proxyPath);
        });
    }

    it('all four regions appear in the public registration list', () => {
        const codes = listParcelJurisdictions().map((j) => j.regionCode);
        expect(codes).toEqual(
            expect.arrayContaining(['US-MA', 'US-FL', 'US-WA-KING', 'US-TX-HARRIS']),
        );
    });

    it('every new row has a finite specificity (no row can silently sort last)', () => {
        for (const code of ['US-MA', 'US-FL', 'US-WA-KING', 'US-TX-HARRIS']) {
            const row = listParcelJurisdictions().find((j) => j.regionCode === code)!;
            expect(Number.isFinite(parcelJurisdictionSpecificity(row))).toBe(true);
        }
    });

    it('the existing three US cities still resolve (no regression from the new rows)', () => {
        expect(primary(40.7128, -74.0060)?.regionCode).toBe('US-NY-NYC'); // Manhattan
        expect(primary(37.7597, -122.4320)?.regionCode).toBe('US-CA-SF'); // SF
        expect(primary(41.8789, -87.6359)?.regionCode).toBe('US-IL-CHI'); // Chicago
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE DOCUMENTED UPSTREAM QUERY + the impure seam (offline).
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('US-EXPAND upstream query + fetch seam', () => {
    it('buildUsArcgisPointQueryUrl emits a JSON point geometry (the FDOR-strict form) with outSR=4326', () => {
        const url = buildUsArcgisPointQueryUrl(US_FL_PARCELS, 27.9481, -82.4564);
        expect(url.startsWith(US_FL_PARCELS.upstreamQueryUrl + '?')).toBe(true);
        expect(url).toContain('outSR=4326');
        expect(url).toContain('esriSpatialRelIntersects');
        // The geometry param is URL-encoded JSON, not a bare "x,y" string.
        const geom = new URL(url).searchParams.get('geometry')!;
        expect(JSON.parse(geom)).toEqual({ x: -82.4564, y: 27.9481, spatialReference: { wkid: 4326 } });
    });

    it('fetchUsParcelAtPoint refuses out-of-bounds without any network call', async () => {
        let called = false;
        const fetchImpl = (async () => {
            called = true;
            return new Response('{}', { status: 200 });
        }) as unknown as typeof fetch;
        const r = await usMaParcelProvider.fetchParcelAtPoint({ lat: 48.8566, lon: 2.3522 }, { fetchImpl });
        expect(r).toEqual({ ok: false, reason: 'out-of-bounds' });
        expect(called).toBe(false);
    });

    it('fetchUsParcelAtPoint returns the parsed parcel from an injected proxy body (in-bounds)', async () => {
        const fetchImpl = (async () =>
            new Response(JSON.stringify({ features: [MA_FEATURE] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            })) as unknown as typeof fetch;
        const r = await fetchUsParcelAtPoint(US_MA_PARCELS, { lat: GOLDEN.ma.lat, lon: GOLDEN.ma.lon }, { fetchImpl });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.parcel.parcelId).toBe('F_574532_2920828');
    });

    it('a non-OK proxy response → endpoint-unreachable, never a throw', async () => {
        const fetchImpl = (async () => new Response('boom', { status: 502 })) as unknown as typeof fetch;
        const r = await fetchUsParcelAtPoint(US_TX_HARRIS_PARCELS, { lat: GOLDEN.tx.lat, lon: GOLDEN.tx.lon }, { fetchImpl });
        expect(r).toEqual({ ok: false, reason: 'endpoint-unreachable' });
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6. AREA MATH — pinned so a refactor cannot silently change the geometry-derived area.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('ringAreaM2 — deterministic equirectangular shoelace', () => {
    it('a ~100 m square near 45°N is ~10,000 m²', () => {
        // 100 m ≈ 0.000898° lat; lon scaled by cos(45°).
        const dLat = 100 / 111_320;
        const dLon = 100 / (111_320 * Math.cos((45 * Math.PI) / 180));
        const ring = [
            { lat: 45, lon: 0 },
            { lat: 45, lon: dLon },
            { lat: 45 + dLat, lon: dLon },
            { lat: 45 + dLat, lon: 0 },
        ];
        expect(ringAreaM2(ring)).toBeGreaterThan(9_800);
        expect(ringAreaM2(ring)).toBeLessThan(10_200);
    });

    it('a < 3-vertex ring is 0 (never NaN)', () => {
        expect(ringAreaM2([{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }])).toBe(0);
    });
});
