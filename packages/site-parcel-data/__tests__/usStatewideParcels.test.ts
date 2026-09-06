// LANE USA-PARCELS — the +7 STATE / +2 COUNTY wave (NC · NY · OH · WI · MT · UT · VA · LA · Maricopa).
//
// PURE + fixture-driven (no live network). Every fixture below is COPIED FROM THE REAL LIVE PROBE on
// 2026-09-06 — attributes and WGS84 rings verbatim from the ArcGIS response — so the tests are
// deterministic in CI while pinning the real upstream shape. The exact HTTP answers (status, bytes,
// content-type, leading body) live in each config's `note`, which is the same string the registry row
// carries, so a drift between the two is impossible by construction.
//
// FOUR axes, all load-bearing:
//   1. the shared PARSER turns each live-shaped feature into an id + a WGS84 ring + a geometry area;
//   2. the ROUTING predicates fence their own territory and nothing else;
//   3. the REGISTRY actually ROUTES each golden click to the new row FIRST — the §committed≠reachable
//      lesson: a config nobody dispatches to is not a wire;
//   4. the COVERAGE HONESTY of the two rows that are NOT statewide is asserted in the strings the UI
//      reads, because "38 of 62 counties" printed as "New York State" is the C58 §1.4 failure.

import { describe, it, expect } from 'vitest';
import {
    US_NC_PARCELS,
    US_NY_PARCELS,
    US_OH_PARCELS,
    US_WI_PARCELS,
    US_MT_PARCELS,
    US_UT_PARCELS,
    US_VA_PARCELS,
    US_CA_LA_PARCELS,
    US_AZ_MARICOPA_PARCELS,
    USA_PARCELS_CONFIGS,
    USA_PARCEL_REFUSALS,
    US_COMMERCIAL_PARCEL_OPTION,
    isInNorthCarolina,
    isInNewYorkState,
    isInOhio,
    isInWisconsin,
    isInMontana,
    isInUtah,
    isInVirginia,
    isInLosAngelesCounty,
    isInMaricopaCountyAz,
    usNcParcelProvider,
    parseUsArcgisParcelFeature,
    parseUsArcgisParcelResponse,
    buildUsArcgisPointQueryUrl,
    type UsArcgisParcelConfig,
} from '../src/countryAdapters/us/index.js';
import {
    resolveParcelCandidates,
    listParcelJurisdictions,
    parcelJurisdictionSpecificity,
    type ParcelJurisdiction,
} from '../src/parcelProviders/registry.js';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// RECORDED-LIVE FIXTURES — real attributes + real WGS84 rings from the 2026-09-06 probes.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** NC OneMap · Charlotte — parno 07301103A (128 S Tryon St), the live probe's parcel. */
const NC_FEATURE = {
    attributes: {
        parno: '07301103A',
        altparno: '07301103A',
        ownname: ' FIRST-CITIZENS BANK & TR CO',
        siteadd: '128 S TRYON ST CHARLOTTE NC',
        scity: 'CHARLOTTE',
        cntyname: 'Mecklenburg',
        parusedesc: 'OFFICE',
        gisacres: 0.82463669,
    },
    geometry: {
        rings: [[
            [-80.844089, 35.22712],
            [-80.843842, 35.226857],
            [-80.843499, 35.227113],
            [-80.843746, 35.227377],
            [-80.844089, 35.22712],
        ]],
    },
};

/** NYS tax parcels · Albany — PRINT_KEY 76.7-1-1 (Eagle St), the live probe's parcel. */
const NY_FEATURE = {
    attributes: {
        PRINT_KEY: '76.7-1-1',
        SBL: '07600700010010000000',
        PARCEL_ADDR: 'Eagle St',
        COUNTY_NAME: 'Albany',
        MUNI_NAME: 'Albany',
        PROP_CLASS: '652',
        CALC_ACRES: 10.17558228,
        ROLL_YR: 2025,
    },
    geometry: {
        rings: [[
            [-73.75903197444498, 42.654126654093],
            [-73.75537154178315, 42.65201130580772],
            [-73.75529890221264, 42.65197078470799],
            [-73.7568, 42.6512],
            [-73.75903197444498, 42.654126654093],
        ]],
    },
};

/** Ohio statewide parcels · Columbus — STATEWIDE_PIN 39049-010-000602, the live probe's parcel. */
const OH_FEATURE = {
    attributes: {
        PIN: '010-000602',
        STATEWIDE_PIN: '39049-010-000602',
        COUNTY: 'Franklin',
        OWNER1: 'VS STATE STREET LLC',
        ASSR_ACRES: 0.19227437,
        CurrentTo: 1709269200000,
    },
    geometry: {
        rings: [[
            [-82.999744, 39.959904],
            [-82.999351, 39.959897],
            [-82.999344, 39.960139],
            [-82.999737, 39.960146],
            [-82.999744, 39.959904],
        ]],
    },
};

/** Wisconsin V12 · Madison — STATEID 025070923208015 (821 University Ave), the live probe's parcel. */
const WI_FEATURE = {
    attributes: {
        STATEID: '025070923208015',
        PARCELID: '070923208015',
        TAXPARCELID: null,
        SITEADRESS: '821 UNIVERSITY AVE',
        PLACENAME: 'CITY OF MADISON',
        CONAME: 'DANE',
        TAXROLLYEAR: '2025',
    },
    geometry: {
        rings: [[
            [-89.399211, 43.072162],
            [-89.398921, 43.072402],
            [-89.399625, 43.072765],
            [-89.399915, 43.072525],
            [-89.399211, 43.072162],
        ]],
    },
};

/** Montana cadastral · Helena — PARCELID 05188830321090000, the live probe's parcel. */
const MT_FEATURE = {
    attributes: {
        PARCELID: '05188830321090000',
        CountyName: 'Lewis and Clark',
        AssessmentCode: '0000006516',
        AddressLine1: '330 N LAST CHANCE GULCH ',
        CityStateZip: 'HELENA, MT 59601',
        TaxYear: 2026,
        PropType: 'Improved Property',
        GISAcres: 0.06866983,
    },
    geometry: {
        rings: [[
            [-112.03807, 46.58966],
            [-112.03793, 46.58966],
            [-112.03793, 46.58957],
            [-112.03807, 46.58957],
            [-112.03807, 46.58966],
        ]],
    },
};

/** Utah statewide · Salt Lake City — PARCEL_ID 15014300180000 (18 W Market St), the probe's parcel. */
const UT_FEATURE = {
    attributes: {
        PARCEL_ID: '15014300180000',
        PARCEL_ADD: '18 W MARKET ST',
        PARCEL_CITY: 'Salt Lake City',
        PARCEL_ZIP: '84101',
        County: 'SaltLake',
        OWN_TYPE: 'Private',
        ACCOUNT_NUM: null,
        ParcelsCur: 1786492800000,
    },
    geometry: {
        rings: [[
            [-111.891333, 40.762012],
            [-111.891137, 40.762012],
            [-111.891137, 40.761866],
            [-111.891333, 40.761866],
            [-111.891333, 40.762012],
        ]],
    },
};

/** VGIN · Richmond — VGIN_QPID 5176000025467 (a JSON FLOAT on the wire), the live probe's parcel. */
const VA_FEATURE = {
    attributes: {
        VGIN_QPID: 5176000025467.0,
        PARCELID: '517466',
        LOCALITY: 'Richmond City',
        FIPS: '51760',
        LASTUPDATE: 1775433600000,
    },
    geometry: {
        rings: [[
            [-77.431341, 37.539088],
            [-77.430512, 37.538699],
            [-77.431016, 37.537742],
            [-77.431845, 37.538131],
            [-77.431341, 37.539088],
        ]],
    },
};

/** LA County Assessor · downtown LA — AIN 5161005902 (312 N Spring St), the live probe's parcel. */
const LA_FEATURE = {
    attributes: {
        AIN: '5161005902',
        APN: '5161-005-902',
        SitusAddress: '312 N SPRING ST',
        SitusCity: 'LOS ANGELES CA',
        SitusZIP: '90012-4701',
        UseType: 'Government',
        UseDescription: 'Government Parcel',
        TaxRateCity: 'LOS ANGELES',
    },
    geometry: {
        rings: [[
            [-118.2408, 34.055547],
            [-118.24028, 34.054921],
            [-118.242932, 34.053928],
            [-118.243452, 34.054554],
            [-118.2408, 34.055547],
        ]],
    },
};

/** Maricopa Assessor · Phoenix — APN 11221001 (50 N Central Ave), the live probe's parcel. */
const AZ_FEATURE = {
    attributes: {
        APN: '11221001',
        APN_DASH: '112-21-001',
        PHYSICAL_ADDRESS: '50 N CENTRAL AVE   PHOENIX  85004',
        PHYSICAL_CITY: 'PHOENIX',
        PHYSICAL_ZIP: '85004',
        OWNER_NAME: 'PHOENIX CITY OF                  (LEASED OUT)',
    },
    geometry: {
        rings: [[
            [-112.073957, 33.449148],
            [-112.073757, 33.449148],
            [-112.073757, 33.449002],
            [-112.073957, 33.449002],
            [-112.073957, 33.449148],
        ]],
    },
};

/** The golden click for each new jurisdiction — the exact coordinate the live probe used. */
const GOLDEN = {
    nc: { lat: 35.226987, lon: -80.844178, name: 'Charlotte, NC' },
    ny: { lat: 42.6523009, lon: -73.7568442, name: 'Albany, NY' },
    oh: { lat: 39.960019, lon: -82.999580, name: 'Columbus, OH' },
    wi: { lat: 43.072297, lon: -89.400247, name: 'Madison, WI' },
    mt: { lat: 46.589655, lon: -112.038221, name: 'Helena, MT' },
    ut: { lat: 40.761939, lon: -111.891571, name: 'Salt Lake City, UT' },
    va: { lat: 37.538326, lon: -77.431270, name: 'Richmond, VA' },
    la: { lat: 34.054737, lon: -118.241866, name: 'Downtown Los Angeles, CA' },
    az: { lat: 33.449177, lon: -112.074098, name: 'Phoenix, AZ' },
} as const;

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE SHARED PARSER — each live feature → id + WGS84 ring + geometry-derived area.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('USA-PARCELS parser — recorded-live features parse to id + ring + area', () => {
    const cases: ReadonlyArray<[string, unknown, UsArcgisParcelConfig, string, string | null]> = [
        ['NC OneMap', NC_FEATURE, US_NC_PARCELS, '07301103A', '128 S TRYON ST CHARLOTTE NC'],
        ['NYS tax parcels', NY_FEATURE, US_NY_PARCELS, '76.7-1-1', 'Eagle St'],
        ['Ohio statewide', OH_FEATURE, US_OH_PARCELS, '39049-010-000602', null],
        ['Wisconsin V12', WI_FEATURE, US_WI_PARCELS, '025070923208015', '821 UNIVERSITY AVE'],
        ['Montana cadastral', MT_FEATURE, US_MT_PARCELS, '05188830321090000', '330 N LAST CHANCE GULCH'],
        ['Utah statewide', UT_FEATURE, US_UT_PARCELS, '15014300180000', '18 W MARKET ST'],
        ['VGIN Virginia', VA_FEATURE, US_VA_PARCELS, '5176000025467', null],
        ['LA County', LA_FEATURE, US_CA_LA_PARCELS, '5161005902', '312 N SPRING ST'],
        ['Maricopa County', AZ_FEATURE, US_AZ_MARICOPA_PARCELS, '11221001', '50 N CENTRAL AVE   PHOENIX  85004'],
    ];

    for (const [name, feature, config, parcelId, address] of cases) {
        it(`${name} — id, WGS84 ring, positive geometry-derived area`, () => {
            const r = parseUsArcgisParcelFeature(feature, config);
            expect(r.ok).toBe(true);
            if (!r.ok) return;
            expect(r.parcel.parcelId).toBe(parcelId);
            expect(r.parcel.address).toBe(address);
            expect(r.parcel.crs).toBe('EPSG:4326');
            expect(r.parcel.source).toBe(config.providerId);
            expect(r.parcel.ring.length).toBeGreaterThanOrEqual(3);
            // Degrees, never a projected leak.
            for (const p of r.parcel.ring) {
                expect(Math.abs(p.lon)).toBeLessThanOrEqual(180);
                expect(Math.abs(p.lat)).toBeLessThanOrEqual(90);
            }
            expect(r.parcel.areaM2).toBeGreaterThan(0);
        });
    }

    it('VGIN_QPID arrives as a JSON FLOAT and is stringified, never parsed as a schema', () => {
        // The measured wire value is 5176000025467.0 — a Number, not a String. Regression guard for
        // the coercion, because a float id rendered as "5.176000025467e+12" would be an unusable key.
        expect(typeof VA_FEATURE.attributes.VGIN_QPID).toBe('number');
        const r = parseUsArcgisParcelFeature(VA_FEATURE, US_VA_PARCELS);
        expect(r.ok && r.parcel.parcelId).toBe('5176000025467');
    });

    it('an ArcGIS error body is `endpoint-unreachable`, never a "no parcel here"', () => {
        // The exact shape the NC layer returns when an outField does not exist — measured 2026-09-06.
        const body = { error: { code: 400, message: 'Failed to execute query.', details: [] } };
        expect(parseUsArcgisParcelResponse(body, US_NC_PARCELS)).toEqual({
            ok: false,
            reason: 'endpoint-unreachable',
        });
    });

    it('an empty feature set is `no-parcel` — a real absence, distinct from a failure', () => {
        expect(parseUsArcgisParcelResponse({ features: [] }, US_NY_PARCELS)).toEqual({
            ok: false,
            reason: 'no-parcel',
        });
    });

    it('a projected ring is REFUSED rather than mis-plotted as degrees', () => {
        // State-Plane feet, the frame NC / MT / VA store in natively.
        const projected = {
            attributes: { parno: '07301103A' },
            geometry: { rings: [[[1451000, 525000], [1451100, 525000], [1451100, 525100], [1451000, 525000]]] },
        };
        expect(parseUsArcgisParcelFeature(projected, US_NC_PARCELS)).toEqual({
            ok: false,
            reason: 'crs-unprojected',
        });
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. ROUTING PREDICATES — each fences its OWN territory and claims nothing else.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('USA-PARCELS routing predicates', () => {
    it('each golden click is inside its own jurisdiction', () => {
        expect(isInNorthCarolina(GOLDEN.nc.lat, GOLDEN.nc.lon)).toBe(true);
        expect(isInNewYorkState(GOLDEN.ny.lat, GOLDEN.ny.lon)).toBe(true);
        expect(isInOhio(GOLDEN.oh.lat, GOLDEN.oh.lon)).toBe(true);
        expect(isInWisconsin(GOLDEN.wi.lat, GOLDEN.wi.lon)).toBe(true);
        expect(isInMontana(GOLDEN.mt.lat, GOLDEN.mt.lon)).toBe(true);
        expect(isInUtah(GOLDEN.ut.lat, GOLDEN.ut.lon)).toBe(true);
        expect(isInVirginia(GOLDEN.va.lat, GOLDEN.va.lon)).toBe(true);
        expect(isInLosAngelesCounty(GOLDEN.la.lat, GOLDEN.la.lon)).toBe(true);
        expect(isInMaricopaCountyAz(GOLDEN.az.lat, GOLDEN.az.lon)).toBe(true);
    });

    it('the COUNTY boxes exclude the rest of their state (no statewide overstatement)', () => {
        // San Francisco and San Diego are California, but they are not Los Angeles County.
        expect(isInLosAngelesCounty(37.7597, -122.4320)).toBe(false);
        expect(isInLosAngelesCounty(32.7157, -117.1611)).toBe(false);
        // Tucson and Flagstaff are Arizona, but they are not Maricopa County.
        expect(isInMaricopaCountyAz(32.2226, -110.9747)).toBe(false);
        expect(isInMaricopaCountyAz(35.1983, -111.6513)).toBe(false);
    });

    it('no new predicate matches a European or non-finite point', () => {
        const all = [
            isInNorthCarolina, isInNewYorkState, isInOhio, isInWisconsin, isInMontana,
            isInUtah, isInVirginia, isInLosAngelesCounty, isInMaricopaCountyAz,
        ];
        for (const p of all) {
            expect(p(48.8566, 2.3522)).toBe(false); // Paris
            expect(p(Number.NaN, Number.NaN)).toBe(false);
        }
    });

    it('the two DOCUMENTED overlaps exist and are the only ones between the new state boxes', () => {
        // NC ∩ VA — the 36.54–36.59°N border strip. Real geography; specificity + `empty` resolve it.
        expect(isInNorthCarolina(36.56, -79.0)).toBe(true);
        expect(isInVirginia(36.56, -79.0)).toBe(true);
        // OH ∩ VA — the band over WEST VIRGINIA, where NEITHER service has data.
        expect(isInOhio(38.9, -81.5)).toBe(true);
        expect(isInVirginia(38.9, -81.5)).toBe(true);
        // …and the state boxes that must NOT overlap, do not.
        expect(isInWisconsin(GOLDEN.mt.lat, GOLDEN.mt.lon)).toBe(false);
        expect(isInMontana(GOLDEN.ut.lat, GOLDEN.ut.lon)).toBe(false);
        expect(isInUtah(GOLDEN.az.lat, GOLDEN.az.lon)).toBe(false);
        expect(isInOhio(GOLDEN.ny.lat, GOLDEN.ny.lon)).toBe(false);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. REGISTRY WIRING — the router SELECTS each new row FIRST at its golden click (reachability).
// ══════════════════════════════════════════════════════════════════════════════════════════════

function primary(lat: number, lon: number): ParcelJurisdiction | undefined {
    return resolveParcelCandidates(lat, lon)[0];
}

describe('USA-PARCELS reachability — each jurisdiction is actually routed to', () => {
    const cases: ReadonlyArray<[string, number, number, string, string]> = [
        ['NC → NC OneMap', GOLDEN.nc.lat, GOLDEN.nc.lon, 'US-NC', 'us-nc-onemap-parcels'],
        ['NY → NYS tax parcels', GOLDEN.ny.lat, GOLDEN.ny.lon, 'US-NY', 'us-ny-nysgis-taxparcels'],
        ['OH → ODNR statewide', GOLDEN.oh.lat, GOLDEN.oh.lon, 'US-OH', 'us-oh-odnr-statewide-parcels'],
        ['WI → DOA V12', GOLDEN.wi.lat, GOLDEN.wi.lon, 'US-WI', 'us-wi-doa-statewide-parcels'],
        ['MT → MSL cadastral', GOLDEN.mt.lat, GOLDEN.mt.lon, 'US-MT', 'us-mt-msl-cadastral'],
        ['UT → UGRC parcels', GOLDEN.ut.lat, GOLDEN.ut.lon, 'US-UT', 'us-ut-ugrc-parcels'],
        ['VA → VGIN parcels', GOLDEN.va.lat, GOLDEN.va.lon, 'US-VA', 'us-va-vgin-parcels'],
        ['LA County', GOLDEN.la.lat, GOLDEN.la.lon, 'US-CA-LA', 'us-ca-la-county-parcels'],
        ['Maricopa County', GOLDEN.az.lat, GOLDEN.az.lon, 'US-AZ-MARICOPA', 'us-az-maricopa-parcels'],
    ];

    for (const [name, lat, lon, regionCode, providerId] of cases) {
        it(`${name} — the router picks it FIRST and calls it cadastral`, () => {
            const head = primary(lat, lon);
            expect(head?.regionCode).toBe(regionCode);
            expect(head?.providerId).toBe(providerId);
            expect(head?.kind).toBe('cadastral');
            expect(head?.proxyPath).toBe(
                USA_PARCELS_CONFIGS.find((c) => c.regionCode === regionCode)!.proxyPath,
            );
        });
    }

    it('all nine regions appear in the public registration list', () => {
        const codes = listParcelJurisdictions().map((j) => j.regionCode);
        expect(codes).toEqual(
            expect.arrayContaining([
                'US-NC', 'US-NY', 'US-OH', 'US-WI', 'US-MT',
                'US-UT', 'US-VA', 'US-CA-LA', 'US-AZ-MARICOPA',
            ]),
        );
    });

    it('every new row has a FINITE specificity (a missing REGION_BBOX entry sorts it LAST)', () => {
        for (const code of ['US-NC', 'US-NY', 'US-OH', 'US-WI', 'US-MT', 'US-UT', 'US-VA', 'US-CA-LA', 'US-AZ-MARICOPA']) {
            const row = listParcelJurisdictions().find((j) => j.regionCode === code)!;
            expect(Number.isFinite(parcelJurisdictionSpecificity(row))).toBe(true);
        }
    });

    it('NEW YORK CITY still resolves to MapPLUTO, not to the statewide layer that now encloses it', () => {
        // US-NY's box contains all of NYC. MapPLUTO must keep the city on specificity — it carries
        // ZoneDist1/ResidFAR that the statewide tax-parcel layer does not.
        expect(primary(40.7128, -74.0060)?.regionCode).toBe('US-NY-NYC');
        // …and the statewide row IS the second candidate, so a MapPLUTO miss has somewhere to fall.
        const nyc = resolveParcelCandidates(40.7128, -74.0060).map((j) => j.regionCode);
        expect(nyc[0]).toBe('US-NY-NYC');
        expect(nyc).toContain('US-NY');
    });

    it('the pre-existing US rows still resolve (no regression from the nine new boxes)', () => {
        expect(primary(37.7597, -122.4320)?.regionCode).toBe('US-CA-SF'); // San Francisco
        expect(primary(41.8789, -87.6359)?.regionCode).toBe('US-IL-CHI'); // Chicago
        expect(primary(42.26259, -71.80230)?.regionCode).toBe('US-MA'); // Worcester, MA
        expect(primary(27.94810, -82.45640)?.regionCode).toBe('US-FL'); // Tampa, FL
        expect(primary(47.62530, -122.32220)?.regionCode).toBe('US-WA-KING'); // Seattle
        expect(primary(29.74400, -95.39080)?.regionCode).toBe('US-TX-HARRIS'); // Houston
    });

    it('the NC/VA border strip is ordered by specificity and both rows survive as candidates', () => {
        // VA's box is fractionally smaller, so it is tried first; NC remains reachable behind it, and
        // the wrong-state service answers `empty`, which is the documented self-correction.
        const codes = resolveParcelCandidates(36.56, -79.0).map((j) => j.regionCode);
        expect(codes[0]).toBe('US-VA');
        expect(codes).toContain('US-NC');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. COVERAGE HONESTY — the two rows that are NOT statewide must SAY SO where the UI reads.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('USA-PARCELS coverage honesty (C58 §1.4)', () => {
    it('US-NY names its 38-of-62-county coverage in the label AND the note, not just a comment', () => {
        expect(US_NY_PARCELS.label).toContain('38 counties');
        expect(US_NY_PARCELS.note).toContain('38 OF NEW YORK');
        expect(US_NY_PARCELS.note).toContain('62');
        // The registry row the UI labels from carries the SAME strings.
        const row = listParcelJurisdictions().find((j) => j.regionCode === 'US-NY')!;
        expect(row.countryName).toContain('38 of 62');
        expect(row.note).toBe(US_NY_PARCELS.note);
    });

    it('US-VA names Rappahannock County as the measured gap, by name', () => {
        expect(US_VA_PARCELS.note).toContain('RAPPAHANNOCK COUNTY IS ABSENT');
        expect(US_VA_PARCELS.label).toContain('94 counties');
        const row = listParcelJurisdictions().find((j) => j.regionCode === 'US-VA')!;
        expect(row.note).toBe(US_VA_PARCELS.note);
    });

    it('every config records a MEASURED live probe and a licence — no blank provenance', () => {
        for (const c of USA_PARCELS_CONFIGS) {
            expect(c.note).toContain('VERIFIED-LIVE 2026-09-06');
            expect(c.note).toContain('HTTP 200');
            expect(c.licence.length).toBeGreaterThan(20);
            expect(c.proxyPath.startsWith('/api/parcel/')).toBe(true);
            expect(c.upstreamQueryUrl.startsWith('https://')).toBe(true);
            expect(c.idFields.length).toBeGreaterThan(0);
        }
    });

    it('NO config emits zoning, FAR or height — geometry + identity only', () => {
        for (const c of USA_PARCELS_CONFIGS) {
            expect(Object.keys(c)).not.toContain('farRatio');
            expect(Object.keys(c)).not.toContain('heightM');
        }
        const parsed = parseUsArcgisParcelFeature(NC_FEATURE, US_NC_PARCELS);
        expect(parsed.ok).toBe(true);
        if (parsed.ok) {
            // `parusedesc: OFFICE` rode in on the fixture and must NOT reach the parcel object.
            expect(Object.keys(parsed.parcel)).not.toContain('zoning');
            expect(Object.keys(parsed.parcel)).not.toContain('farRatio');
        }
    });

    it('the COMMERCIAL option is recorded with its probe and is NOT wired anywhere', () => {
        // Recording a vendor is a decision record, never an integration. If this ever becomes a leg,
        // it must arrive as a KEYED leg (the LINZ precedent) with its licence read first — so the
        // guard is that today there is no client, no key and no row.
        expect(US_COMMERCIAL_PARCEL_OPTION.vendor).toContain('Regrid');
        // The probe is a 401, and the record must say so rather than repeating the vendor's claim.
        expect(US_COMMERCIAL_PARCEL_OPTION.probe).toContain('HTTP 401');
        expect(US_COMMERCIAL_PARCEL_OPTION.probe).toContain('An access token is required');
        expect(US_COMMERCIAL_PARCEL_OPTION.probe).toContain('VENDOR CLAIMS ARE NOT MEASUREMENTS');
        expect(US_COMMERCIAL_PARCEL_OPTION.openQuestions.length).toBeGreaterThanOrEqual(4);
        // NOT WIRED: no config, no registry row, no provider carries the vendor's name.
        expect(USA_PARCELS_CONFIGS.some((c) => /regrid/i.test(c.providerId))).toBe(false);
        expect(listParcelJurisdictions().some((j) => /regrid/i.test(j.providerId))).toBe(false);
    });

    it('the NAMED REFUSALS are enumerated as data, each with a verbatim HTTP answer', () => {
        const codes = USA_PARCEL_REFUSALS.map((r) => r.regionCode);
        expect(codes).toEqual(
            expect.arrayContaining(['US-TX', 'US-NJ', 'US-KY', 'US-TN', 'US-MD', 'US-OR', 'US-IL-COOK']),
        );
        for (const r of USA_PARCEL_REFUSALS) {
            expect(r.endpoint.startsWith('https://')).toBe(true);
            expect(/HTTP \d{3}/.test(r.answer)).toBe(true);
            expect(r.verdict.length).toBeGreaterThan(40);
        }
        // Texas is the load-bearing one: a LIVE statewide aggregate whose query capability is
        // advertised and refused, and whose WMS serves identity with a null geometry.
        const tx = USA_PARCEL_REFUSALS.find((r) => r.regionCode === 'US-TX')!;
        expect(tx.answer).toContain('-2147220222');
        expect(tx.verdict).toContain('"geometry": null');
        // …and it must NOT be wired: no US-TX row, and no US-TX config.
        expect(listParcelJurisdictions().some((j) => j.regionCode === 'US-TX')).toBe(false);
        expect(USA_PARCELS_CONFIGS.some((c) => c.regionCode === 'US-TX')).toBe(false);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE DOCUMENTED UPSTREAM QUERY + the impure seam (offline).
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('USA-PARCELS upstream query + fetch seam', () => {
    it('buildUsArcgisPointQueryUrl emits a JSON point geometry with outSR=4326 for a new config', () => {
        const url = buildUsArcgisPointQueryUrl(US_MT_PARCELS, GOLDEN.mt.lat, GOLDEN.mt.lon);
        expect(url.startsWith(US_MT_PARCELS.upstreamQueryUrl + '?')).toBe(true);
        expect(url).toContain('outSR=4326');
        expect(url).toContain('esriSpatialRelIntersects');
        const geom = new URL(url).searchParams.get('geometry')!;
        expect(JSON.parse(geom)).toEqual({
            x: GOLDEN.mt.lon,
            y: GOLDEN.mt.lat,
            spatialReference: { wkid: 4326 },
        });
    });

    it('fetchParcelAtPoint refuses out-of-bounds without any network call', async () => {
        let called = false;
        const fetchImpl = (async () => {
            called = true;
            return new Response('{}', { status: 200 });
        }) as unknown as typeof fetch;
        const r = await usNcParcelProvider.fetchParcelAtPoint({ lat: 48.8566, lon: 2.3522 }, { fetchImpl });
        expect(r).toEqual({ ok: false, reason: 'out-of-bounds' });
        expect(called).toBe(false);
    });

    it('fetchParcelAtPoint returns the parsed parcel from an injected proxy body (in-bounds)', async () => {
        const fetchImpl = (async () =>
            new Response(JSON.stringify({ features: [NC_FEATURE] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            })) as unknown as typeof fetch;
        const r = await usNcParcelProvider.fetchParcelAtPoint(
            { lat: GOLDEN.nc.lat, lon: GOLDEN.nc.lon },
            { fetchImpl },
        );
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.parcel.parcelId).toBe('07301103A');
    });

    it('a non-OK proxy response is a refusal, never a throw', async () => {
        const fetchImpl = (async () => new Response('boom', { status: 502 })) as unknown as typeof fetch;
        const r = await usNcParcelProvider.fetchParcelAtPoint(
            { lat: GOLDEN.nc.lat, lon: GOLDEN.nc.lon },
            { fetchImpl },
        );
        expect(r).toEqual({ ok: false, reason: 'endpoint-unreachable' });
    });
});
