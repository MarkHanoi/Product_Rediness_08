// LANE USA-PARCELS · WAVE 2 — the five new US STATE parcel jurisdictions (NJ · VT · CT · IN · MD).
//
// PURE + fixture-driven (no live network). Every fixture in
// `__tests__/fixtures/us-wave2-2026-09-06/` is the VERBATIM ArcGIS response body recorded from the
// real live probe on 2026-09-06 — attributes and WGS84 rings exactly as the upstream returned them,
// written straight to disk by the probe rather than retyped. That keeps CI deterministic while
// pinning the real upstream SHAPE, which is the only thing a fixture can honestly pin.
//
// Three axes, all load-bearing (the §committed≠reachable lesson):
//   • the shared PARSER turns each live-shaped feature into an id + a WGS84 ring + a geometry area;
//   • the REGISTRY actually ROUTES each golden click to the new row FIRST;
//   • the AREA is geometry-derived and NOT the served acreage — the trap specific to this wave.
//
// ⚠ UNLIKE THE US-EXPAND SUITE, THESE ROWS DELIBERATELY OVERLAP THEIR NEIGHBOURS, so this file must
// NOT assert `candidates.length === 1`. NJ/VT/CT sit inside the US-NY rectangle, CT also under MA's
// overhang, MD over US-VA, IN over US-OH on a 0.05° strip. Each new box is SMALLER, so specificity
// puts it first and the enclosing row remains the honest fall-through — that ORDERING is what is
// asserted here, and asserting "sole candidate" instead would have to be wrong or the wiring would.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
    US_NJ_PARCELS,
    US_VT_PARCELS,
    US_CT_PARCELS,
    US_IN_PARCELS,
    US_MD_PARCELS,
    USA_PARCELS_WAVE2_CONFIGS,
    US_ALL_PARCEL_CONFIGS,
    isInNewJersey,
    isInVermont,
    isInConnecticut,
    isInIndiana,
    isInMaryland,
    parseUsArcgisParcelResponse,
    buildUsArcgisPointQueryUrl,
    ringAreaM2,
    type UsArcgisParcelConfig,
} from '../src/countryAdapters/us/index.js';
import { resolveParcelCandidates, listParcelJurisdictions } from '../src/parcelProviders/registry.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, 'fixtures', 'us-wave2-2026-09-06');
// ⚠ `parseUsArcgisParcelResponse` takes a PARSED body, not raw text — a string falls through its
// array/object checks and returns `no-parcel`, which reads exactly like an empty upstream. Parsing
// here keeps that distinction honest.
const body = (name: string): unknown => JSON.parse(readFileSync(join(FIX, `${name}.json`), 'utf8'));

/**
 * The GOLDEN clicks — the exact WGS84 points the 2026-09-06 probe used, each one SELF-SOURCED from
 * the layer itself (a real parcel was fetched, its ring centroid computed, and THAT point queried
 * back). That matters: the first NJ attempt used Newark City Hall's published coordinate and
 * returned ZERO features because the point lands in a street right-of-way, which would have been
 * misread as "New Jersey has no parcels" had the centroid trick not falsified it.
 */
const GOLDEN = {
    nj: { lat: 40.780885, lon: -74.155224, id: '0714_835_7', addr: '916-918 BROADWAY', verts: 5 },
    vt: { lat: 44.522464, lon: -73.266076, id: '114-035-10304', addr: null, verts: 5 },
    ct: { lat: 41.697994, lon: -72.38787, id: '25/022/000019', addr: 'GILEAD RD', verts: 7 },
    in: { lat: 39.898502, lon: -86.124186, id: '490219107055000800', addr: '2101 BEACH AVE', verts: 5 },
    md: { lat: 39.29153, lon: -76.587071, id: '0301011738 004', addr: '2107 E BALTIMORE ST', verts: 6 },
} as const;

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE PARSER — each recorded-live body yields an id + a WGS84 ring + a geometry area.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('wave 2 parser — every recorded-live body resolves to a real parcel', () => {
    const cases: ReadonlyArray<[string, UsArcgisParcelConfig, string, (typeof GOLDEN)[keyof typeof GOLDEN]]> = [
        ['NJ / NJGIN composite', US_NJ_PARCELS, 'us-nj-newark', GOLDEN.nj],
        ['VT / VCGI standardized', US_VT_PARCELS, 'us-vt-burlington', GOLDEN.vt],
        ['CT / CT GIS CAMA+parcel', US_CT_PARCELS, 'us-ct-andover', GOLDEN.ct],
        ['IN / IndianaMap', US_IN_PARCELS, 'us-in-indianapolis', GOLDEN.in],
        ['MD / MD iMAP SDAT', US_MD_PARCELS, 'us-md-baltimore', GOLDEN.md],
    ];

    for (const [name, cfg, fixture, golden] of cases) {
        it(`${name} — real id, WGS84 ring, positive geometry area`, () => {
            const out = parseUsArcgisParcelResponse(body(fixture), cfg);
            expect(out.ok).toBe(true);
            if (!out.ok) return;
            expect(out.parcel.parcelId).toBe(golden.id);
            expect(out.parcel.crs).toBe('EPSG:4326');
            expect(out.parcel.source).toBe(cfg.providerId);
            expect(out.parcel.ring.length).toBe(golden.verts);
            expect(out.parcel.areaM2).toBeGreaterThan(0);
            // The ring must be in DEGREES, not a projected system that leaked through. Every one of
            // these layers is natively projected except Indiana, so a missing `outSR=4326` would
            // show up here as six-figure coordinates rather than a lat/lon.
            for (const p of out.parcel.ring) {
                expect(Math.abs(p.lat)).toBeLessThanOrEqual(90);
                expect(Math.abs(p.lon)).toBeLessThanOrEqual(180);
            }
            // ...and it must actually be near the click that produced it — the check that would
            // catch a lat/lon SWAP, which stays inside the ranges above.
            const lat = out.parcel.ring.reduce((s, p) => s + p.lat, 0) / out.parcel.ring.length;
            const lon = out.parcel.ring.reduce((s, p) => s + p.lon, 0) / out.parcel.ring.length;
            expect(Math.abs(lat - golden.lat)).toBeLessThan(0.01);
            expect(Math.abs(lon - golden.lon)).toBeLessThan(0.01);
        });
    }

    it('addresses come through where the source has one, and null where it does not', () => {
        // NOT cosmetic. CT serves `Location` null across whole towns and Indiana serves `prop_add`
        // null on rural rows — an address-less parcel is the NORMAL case for these two, so the card
        // must tolerate it rather than treating null as a parse failure.
        const nj = parseUsArcgisParcelResponse(body('us-nj-newark'), US_NJ_PARCELS);
        const md = parseUsArcgisParcelResponse(body('us-md-baltimore'), US_MD_PARCELS);
        const inCity = parseUsArcgisParcelResponse(body('us-in-indianapolis'), US_IN_PARCELS);
        // Lake Village, Newton Co. — a REAL recorded row whose `prop_add` is null. Rural Indiana
        // rows frequently carry no address, so this is the normal case, not a broken fixture.
        const inRural = parseUsArcgisParcelResponse(body('us-in-lakevillage'), US_IN_PARCELS);
        expect(nj.ok && nj.parcel.address).toBe(GOLDEN.nj.addr);
        expect(md.ok && md.parcel.address).toBe(GOLDEN.md.addr);
        expect(inCity.ok && inCity.parcel.address).toBe('2101 BEACH AVE');
        expect(inRural.ok && inRural.parcel.address).toBeNull();
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. ⭐ THE AREA TRAP — the served acreage is a TAX RECORD and must never become the parcel area.
// ══════════════════════════════════════════════════════════════════════════════════════════════
// This is the wave's most dangerous field and the one a future edit is most likely to "optimise"
// into use, because every one of these layers offers a ready-made acreage that LOOKS authoritative.

describe('area is geometry-derived, NEVER the served acreage', () => {
    it('CT — the served Land_Acres is integer-quantised and disagrees with the polygon', () => {
        const parsed = body('us-ct-andover') as { features: { attributes: Record<string, unknown> }[] };
        const served = parsed.features[0]!.attributes.Land_Acres as number;
        const out = parseUsArcgisParcelResponse(body('us-ct-andover'), US_CT_PARCELS);
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        // The recorded row serves a WHOLE number of acres. Three separately measured Hartford
        // parcels of 2561 / 3230 / 2357 m² ALL served exactly 1 — it is a tax-roll figure, not a
        // geometry, and using it would quantise every Connecticut parcel to the nearest acre.
        expect(Number.isInteger(served)).toBe(true);
        const servedM2 = served * 4046.8564224;
        expect(out.parcel.areaM2).not.toBeCloseTo(servedM2, 0);
        // What IS emitted is the ring's own area.
        expect(out.parcel.areaM2).toBeCloseTo(ringAreaM2(out.parcel.ring), 6);
    });

    it('IN — the emitted area is METRES², consistent with the ring extent in metres', () => {
        // Indiana is served natively in EPSG:4326, so its `SHAPE__Area` is in SQUARE DEGREES
        // (measured: 1.6e-6 for an 18,643 m² Indianapolis lot). A degrees² leak would show up as an
        // area ~1e10 times too small, so the invariant asserted here is the one that would CATCH it:
        // the emitted m² must agree with the ring's own bounding box converted to metres.
        // ⚠ NOT a fixed floor. An earlier draft asserted `> 100 m²` and FAILED against a real
        // recorded parcel — Lake Village is a genuine 4.6 m × 6.1 m circular utility pad of ~22 m².
        // The parcel was right and the assertion was wrong; a bound derived from the geometry cannot
        // make that mistake.
        for (const fx of ['us-in-indianapolis', 'us-in-lakevillage']) {
            const out = parseUsArcgisParcelResponse(body(fx), US_IN_PARCELS);
            expect(out.ok).toBe(true);
            if (!out.ok) continue;
            const lats = out.parcel.ring.map((p) => p.lat);
            const lons = out.parcel.ring.map((p) => p.lon);
            const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
            const hM = (Math.max(...lats) - Math.min(...lats)) * 110_540;
            const wM = (Math.max(...lons) - Math.min(...lons)) * 111_320 * Math.cos((midLat * Math.PI) / 180);
            const bboxM2 = wM * hM;
            // A simple polygon's area lies between a sliver and its own bounding box.
            expect(out.parcel.areaM2).toBeGreaterThan(bboxM2 * 0.1);
            expect(out.parcel.areaM2).toBeLessThanOrEqual(bboxM2 * 1.05);
        }
    });

    it('every wave-2 parcel area equals its own ring area, for all five', () => {
        const pairs: ReadonlyArray<[UsArcgisParcelConfig, string]> = [
            [US_NJ_PARCELS, 'us-nj-newark'],
            [US_VT_PARCELS, 'us-vt-burlington'],
            [US_CT_PARCELS, 'us-ct-andover'],
            [US_IN_PARCELS, 'us-in-indianapolis'],
            [US_IN_PARCELS, 'us-in-lakevillage'],
            [US_MD_PARCELS, 'us-md-baltimore'],
        ];
        for (const [cfg, fx] of pairs) {
            const out = parseUsArcgisParcelResponse(body(fx), cfg);
            expect(out.ok).toBe(true);
            if (!out.ok) continue;
            expect(out.parcel.areaM2).toBeCloseTo(ringAreaM2(out.parcel.ring), 6);
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. REACHABILITY — the registry routes each golden click to the NEW row, ahead of its enclosure.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('wave 2 reachability — each state is actually routed to, FIRST', () => {
    // ⚠ NEW JERSEY IS DELIBERATELY ABSENT FROM THIS TABLE and has its own case below. NYC_BBOX
    // (40.47–40.93 N, -74.28 – -73.68 E) OVERHANGS THE HUDSON and covers Newark AND Jersey City, and
    // at ≈0.28 deg² it is far smaller than US-NJ (≈4.4 deg²), so specificity puts MapPLUTO FIRST on
    // New Jersey soil. Asserting 'US-NJ' first there would be asserting a falsehood.
    const cases: ReadonlyArray<[string, number, number, string, string]> = [
        ['VT → VCGI parcels', GOLDEN.vt.lat, GOLDEN.vt.lon, 'US-VT', 'us-vt-vcgi-standardized-parcels'],
        ['CT → CT GIS CAMA', GOLDEN.ct.lat, GOLDEN.ct.lon, 'US-CT', 'us-ct-ctgis-cama-parcels'],
        ['IN → IndianaMap', GOLDEN.in.lat, GOLDEN.in.lon, 'US-IN', 'us-in-indianamap-parcels'],
        ['MD → MD iMAP SDAT', GOLDEN.md.lat, GOLDEN.md.lon, 'US-MD', 'us-md-sdat-parcel-boundaries'],
    ];

    for (const [name, lat, lon, regionCode, providerId] of cases) {
        it(`${name} — router picks it FIRST`, () => {
            const candidates = resolveParcelCandidates(lat, lon);
            expect(candidates.length).toBeGreaterThan(0);
            expect(candidates[0]!.regionCode).toBe(regionCode);
            expect(candidates[0]!.providerId).toBe(providerId);
            expect(candidates[0]!.kind).toBe('cadastral');
            expect(candidates[0]!.proxyPath).toBe(
                USA_PARCELS_WAVE2_CONFIGS.find((c) => c.regionCode === regionCode)!.proxyPath,
            );
        });
    }

    it('⚠ NJ — MapPLUTO is tried FIRST at Newark, and US-NJ is the fall-through that answers', () => {
        // MEASURED, not assumed: NYC_BBOX overhangs the Hudson, so a Newark or Jersey City click
        // resolves US-NY-NYC first. The OUTCOME is still correct because `resolveParcelWithFallback`
        // (apps/editor/src/ui/site/parcel/parcelRegistry.ts) tries candidates most-specific-first and
        // falls THROUGH on a miss: MapPLUTO holds only NYC tax lots, returns nothing at Newark, and
        // US-NJ then answers with the real parcel. The COST is one wasted upstream call on every
        // click in New Jersey's two largest cities — recorded as a named follow-up, not hidden.
        // ⛔ This test pins the ORDER as it actually is. If NYC_BBOX is ever tightened to the true
        // shoreline, this expectation SHOULD fail — that is the signal, not a regression.
        const njCodes = resolveParcelCandidates(GOLDEN.nj.lat, GOLDEN.nj.lon).map((c) => c.regionCode);
        expect(njCodes[0]).toBe('US-NY-NYC');
        expect(njCodes).toContain('US-NJ');
        // US-NJ must still beat the coarse statewide US-NY row, or a Newark click that fell past
        // MapPLUTO would land on a New York layer that holds no New Jersey parcels.
        expect(njCodes.indexOf('US-NJ')).toBeLessThan(njCodes.indexOf('US-NY'));
    });

    it('the deliberate enclosures resolve in the right ORDER, not by luck', () => {
        // CT sits inside the US-NY rectangle and under MA's southern overhang. It must come FIRST on
        // its own soil, with the enclosing rows still present BEHIND it as the fall-through — that is
        // what makes an out-of-coverage click degrade honestly instead of vanishing.
        const ctCodes = resolveParcelCandidates(GOLDEN.ct.lat, GOLDEN.ct.lon).map((c) => c.regionCode);
        expect(ctCodes[0]).toBe('US-CT');
        expect(ctCodes.indexOf('US-CT')).toBeLessThan(ctCodes.indexOf('US-MA'));

        // MD must precede the coarser US-VA row across the Potomac.
        const mdCodes = resolveParcelCandidates(GOLDEN.md.lat, GOLDEN.md.lon).map((c) => c.regionCode);
        expect(mdCodes[0]).toBe('US-MD');
    });

    it('all five regions appear in the public registration list', () => {
        const codes = listParcelJurisdictions().map((j) => j.regionCode);
        expect(codes).toEqual(expect.arrayContaining(['US-NJ', 'US-VT', 'US-CT', 'US-IN', 'US-MD']));
    });

    it('US_ALL_PARCEL_CONFIGS is the real union of all three waves — no duplicate ids', () => {
        // This constant was a PHANTOM CITATION until 2026-09-06: two files documented it as living
        // in `index.ts` and nothing defined it. It is asserted here so it cannot silently rot back.
        const ids = US_ALL_PARCEL_CONFIGS.map((c) => c.providerId);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toEqual(expect.arrayContaining(USA_PARCELS_WAVE2_CONFIGS.map((c) => c.providerId)));
        expect(US_ALL_PARCEL_CONFIGS.length).toBeGreaterThanOrEqual(18);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. BOX PREDICATES + THE QUERY URL — the routing rectangles and the request that leaves the server.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('wave 2 bbox predicates', () => {
    it('each predicate accepts its own golden click', () => {
        expect(isInNewJersey(GOLDEN.nj.lat, GOLDEN.nj.lon)).toBe(true);
        expect(isInVermont(GOLDEN.vt.lat, GOLDEN.vt.lon)).toBe(true);
        expect(isInConnecticut(GOLDEN.ct.lat, GOLDEN.ct.lon)).toBe(true);
        expect(isInIndiana(GOLDEN.in.lat, GOLDEN.in.lon)).toBe(true);
        expect(isInMaryland(GOLDEN.md.lat, GOLDEN.md.lon)).toBe(true);
    });

    it('rejects far-away points, including each other', () => {
        expect(isInNewJersey(GOLDEN.vt.lat, GOLDEN.vt.lon)).toBe(false);
        expect(isInVermont(GOLDEN.md.lat, GOLDEN.md.lon)).toBe(false);
        expect(isInMaryland(GOLDEN.in.lat, GOLDEN.in.lon)).toBe(false);
        expect(isInIndiana(GOLDEN.ct.lat, GOLDEN.ct.lon)).toBe(false);
        // London and Sydney — the universal sanity pair.
        expect(isInConnecticut(51.5, -0.12)).toBe(false);
        expect(isInIndiana(-33.87, 151.21)).toBe(false);
    });
});

describe('wave 2 point-query URL', () => {
    it('always requests WGS84 out, JSON point geometry in, and intersects', () => {
        for (const cfg of USA_PARCELS_WAVE2_CONFIGS) {
            const url = buildUsArcgisPointQueryUrl(cfg, 40, -75);
            expect(url).toContain('outSR=4326');
            expect(url).toContain('esriSpatialRelIntersects');
            expect(url).toContain('geometryType=esriGeometryPoint');
            // The hosted FDOR service taught this: a bare `x,y` string 400s where JSON geometry
            // works, so the builder must emit the JSON form for every row.
            expect(decodeURIComponent(url)).toContain('"spatialReference"');
        }
    });

    it('⛔ Maryland points at mdgeodata.md.gov, NOT geodata.md.gov', () => {
        // geodata.md.gov is a DIFFERENT hostname that has been serving an HTTP 503 maintenance page
        // throughout, and an earlier refusal recorded that 503 as Maryland having no parcel channel.
        // Anyone "fixing" this URL to drop the `md` prefix would re-create that outage.
        expect(US_MD_PARCELS.upstreamQueryUrl).toContain('mdgeodata.md.gov');
        expect(US_MD_PARCELS.upstreamQueryUrl).not.toContain('//geodata.md.gov');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. PROVENANCE — the config rows are evidence, so the fields that carry it must stay populated.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('wave 2 provenance is complete on every row', () => {
    for (const cfg of USA_PARCELS_WAVE2_CONFIGS) {
        it(`${cfg.regionCode} carries licence, proxy path, measured note`, () => {
            expect(cfg.regionCode.startsWith('US-')).toBe(true);
            expect(cfg.proxyPath).toBe(`/api/parcel/${cfg.regionCode.toLowerCase().replace('us-', 'us-')}`);
            expect(cfg.licence.length).toBeGreaterThan(20);
            expect(cfg.idFields.length).toBeGreaterThan(0);
            expect(cfg.upstreamQueryUrl).toMatch(/^https:\/\//);
            expect(cfg.upstreamQueryUrl.endsWith('/query')).toBe(true);
            // The note is the row's evidence. It must name the probe date and a measured
            // denominator, not just assert "statewide" the way two wave-1 titles did.
            expect(cfg.note).toContain('VERIFIED-LIVE 2026-09-06');
            expect(cfg.note).toMatch(/COVERAGE MEASURED/);
            // ⛔ No US row may ever emit zoning/FAR/height (C58 §1.4).
            expect(cfg.note).toMatch(/NEVER inferred here|NEITHER is inferred here|is inferred here/);
        });
    }
});
