// LANE AU-OPEN — AUSTRALIA (open states) parcel wiring + parse tests.
//
// TWO layers of assertion, the same split the L-651 golden-parcel file draws:
//   1. REACHABILITY / ROUTING — start from `resolveParcelCandidates(lat,lon)` (the real dispatch
//      entry) and assert the ROUTER picks the right AU-<state> row. Delete a registry row and the
//      matching test fails. This is the barrier a provider's own unit test can never give.
//   2. PARSE — run the PURE `parseAuResponse` over a fixture whose attributes/geometry are copied
//      from the LIVE probe this session (audit/intl-parcels/2026-09-02/transcripts-au/live-*.json),
//      so the test is deterministic in CI while pinning the real upstream shape + the real id.
//
// NETWORK: none. Every fixture is a trimmed real response body.

import { describe, it, expect } from 'vitest';
import {
    resolveParcelCandidates,
    resolveParcelWithFallback,
    parcelJurisdictionSpecificity,
    listParcelJurisdictions,
    type ParcelJurisdiction,
} from '../src/parcelProviders/registry.js';
import { resolveNationalJurisdiction } from '../src/jurisdiction/nationalJurisdictionResolver.js';
import {
    parseAuResponse,
    AU_STATE_DESCRIPTORS,
    fetchAuParcelAtPoint,
    auStateParcelProvider,
    type AuCadastralRegionCode,
} from '../src/countryAdapters/au/auStateCadastre.js';
import { AU_SOURCES } from '../src/countryAdapters/au/auSources.js';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// GOLDEN POINTS — the six state capitals the lane drives + the deferrals + the collision witnesses.
// ──────────────────────────────────────────────────────────────────────────────────────────────
const GOLDEN = {
    sydney: { lat: -33.87344, lon: 151.20658, name: 'Sydney Town Hall (NSW)' },
    melbourne: { lat: -37.8136, lon: 144.9631, name: 'Melbourne (VIC)' },
    brisbane: { lat: -27.4705, lon: 153.026, name: 'Brisbane CBD (QLD)' },
    adelaide: { lat: -34.9235, lon: 138.601, name: 'Rundle Mall, Adelaide (SA)' },
    hobart: { lat: -42.8821, lon: 147.3272, name: 'Hobart (TAS)' },
    canberra: { lat: -35.2809, lon: 149.13, name: 'Civic, Canberra (ACT)' },
    perth: { lat: -31.9505, lon: 115.8575, name: 'Perth (WA — deferral)' },
    darwin: { lat: -12.4634, lon: 130.8456, name: 'Darwin (NT — deferral)' },
    riyadh: { lat: 24.7136, lon: 46.6753, name: 'Riyadh (Saudi SA — collision witness)' },
    albury: { lat: -36.0737, lon: 146.9135, name: 'Albury (NSW, on the VIC border)' },
} as const;

function primary(lat: number, lon: number): ParcelJurisdiction | undefined {
    return resolveParcelCandidates(lat, lon)[0];
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// RECORDED-LIVE FIXTURES — trimmed verbatim from the live probes (ids + a few real ring vertices).
// ──────────────────────────────────────────────────────────────────────────────────────────────
const NSW_FIXTURE = {
    features: [
        {
            attributes: {
                lotidstring: '100//DP1048011',
                lotnumber: '100',
                sectionnumber: null,
                planlabel: 'DP1048011',
                plannumber: 1048011,
            },
            geometry: {
                rings: [
                    [
                        [151.20599295484809, -33.87284842990249],
                        [151.20604704353426, -33.872850419457535],
                        [151.20620338408048, -33.87285621937377],
                        [151.2064146206738, -33.87288762897616],
                        [151.20599295484809, -33.87284842990249],
                    ],
                ],
            },
        },
    ],
};

// QLD returns TWO features: the Lot Type Parcel + an "Unlinked parcel or interest" (null lotplan).
const QLD_FIXTURE = {
    features: [
        {
            attributes: { lot: '47', plan: 'SP317615', lotplan: '47SP317615', tenure: 'Lands Lease', locality: 'Brisbane City' },
            geometry: {
                rings: [
                    [
                        [153.025767148, -27.470478370227173],
                        [153.02585373800002, -27.470411009227192],
                        [153.026005812, -27.470290518227173],
                        [153.02613768699996, -27.470428376227186],
                        [153.025767148, -27.470478370227173],
                    ],
                ],
            },
        },
        {
            attributes: { lot: null, plan: null, lotplan: null, tenure: null, locality: 'Brisbane City' },
            geometry: {
                rings: [
                    [
                        [153.02585373800002, -27.470411009227192],
                        [153.026005812, -27.470290518227173],
                        [153.02613768699996, -27.470428376227186],
                        [153.02598677599997, -27.47054889022718],
                        [153.02585373800002, -27.470411009227192],
                    ],
                ],
            },
        },
    ],
};

const SA_FIXTURE = {
    features: [
        {
            attributes: {
                plan_t: 'C',
                plan: '21367',
                parcel_t: 'F',
                parcel: '1',
                title_t: 'CT',
                volume: '5954',
                folio: '719',
                parcel_id: 'C21367   F1',
            },
            geometry: {
                rings: [
                    [
                        [138.60087220172846, -34.92374130357054],
                        [138.60072859884377, -34.92374910354922],
                        [138.6007176959912, -34.92360980053196],
                        [138.6008569645046, -34.923603510453546],
                        [138.60087220172846, -34.92374130357054],
                    ],
                ],
            },
        },
    ],
};

const TAS_FIXTURE = {
    features: [
        {
            attributes: {
                CID: 1358531,
                VOLUME: '40374',
                FOLIO: 3,
                PID: 3321248,
                TENURE_TY: 'Council',
                COMP_AREA: 28.678,
                PROP_ADD: '49-51 MURRAY ST HOBART TAS 7000',
            },
            geometry: {
                rings: [
                    [
                        [147.32723224503812, -42.88206926912499],
                        [147.32716080921014, -42.882183353551994],
                        [147.32714248986653, -42.88216939349889],
                        [147.3272130767866, -42.8820545823425],
                        [147.32723224503812, -42.88206926912499],
                    ],
                ],
            },
        },
    ],
};

// ACT returns FOUR features at Civic: three RETIRED (superseded) + one APPROVED (the live block).
const ACT_FIXTURE = {
    features: [
        {
            attributes: { BLOCK_KEY: 11080190012, BLOCK_NUMBER: 12, SECTION_NUMBER: 19, BLOCK_SECTION: '19/12', DISTRICT_NAME: 'CANBERRA CENTRAL', VOLUME_FOLIO: null, CURRENT_LIFECYCLE_STAGE: 'RETIRED' },
            geometry: { rings: [[[149.129502914574, -35.279759484154], [149.130213733281, -35.2798367085238], [149.130254882101, -35.2798422522077], [149.130295530651, -35.2798498842583], [149.129502914574, -35.279759484154]]] },
        },
        {
            attributes: { BLOCK_KEY: 11080190023, BLOCK_NUMBER: 23, SECTION_NUMBER: 19, BLOCK_SECTION: '19/23', DISTRICT_NAME: 'CANBERRA CENTRAL', VOLUME_FOLIO: null, CURRENT_LIFECYCLE_STAGE: 'RETIRED' },
            geometry: { rings: [[[149.129502914574, -35.279759484154], [149.130213733281, -35.2798367085238], [149.130254882101, -35.2798422522077], [149.130295530651, -35.2798498842583], [149.129502914574, -35.279759484154]]] },
        },
        {
            attributes: { BLOCK_KEY: 11080190009, BLOCK_NUMBER: 9, SECTION_NUMBER: 19, BLOCK_SECTION: '19/9', DISTRICT_NAME: 'CANBERRA CENTRAL', VOLUME_FOLIO: null, CURRENT_LIFECYCLE_STAGE: 'RETIRED' },
            geometry: { rings: [[[149.13077476054, -35.2825613235163], [149.130600559743, -35.28245793495], [149.130559241808, -35.2824299901215], [149.130522547958, -35.2823979985865], [149.13077476054, -35.2825613235163]]] },
        },
        {
            attributes: { BLOCK_KEY: 11080190044, BLOCK_NUMBER: 44, SECTION_NUMBER: 19, BLOCK_SECTION: '19/44', DISTRICT_NAME: 'CANBERRA CENTRAL', VOLUME_FOLIO: null, CURRENT_LIFECYCLE_STAGE: 'APPROVED' },
            geometry: { rings: [[[149.1294, -35.27979], [149.1298, -35.27979], [149.1298, -35.28009], [149.1294, -35.28009], [149.1294, -35.27979]]] },
        },
    ],
};

// VIC is a GeoJSON FeatureCollection (WFS), lon/lat, geometry column `geom`.
const VIC_FIXTURE = {
    type: 'FeatureCollection',
    features: [
        {
            type: 'Feature',
            properties: { parcel_spi: 'PC366537', parcel_pfi: '152191430', parcel_plan_number: 'PC366537', parcel_lot_number: null, parcel_status: 'A' },
            geometry: {
                type: 'MultiPolygon',
                coordinates: [
                    [
                        [
                            [144.963696, -37.813937],
                            [144.963267, -37.814062],
                            [144.962895, -37.813245],
                            [144.96332, -37.813122],
                            [144.963556, -37.813634],
                            [144.963696, -37.813937],
                        ],
                    ],
                ],
            },
        },
    ],
};

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. PARSE — each state's live fixture yields the REAL legal id + a usable ring + a positive area.
// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('AU parse — the six live states yield their real legal identifiers', () => {
    const cases: ReadonlyArray<[AuCadastralRegionCode, unknown, string, string | null]> = [
        ['AU-NSW', NSW_FIXTURE, '100//DP1048011', null],
        ['AU-VIC', VIC_FIXTURE, 'PC366537', null],
        ['AU-QLD', QLD_FIXTURE, '47SP317615', null],
        ['AU-SA', SA_FIXTURE, 'C21367 F1', 'CT 5954/719'],
        ['AU-TAS', TAS_FIXTURE, '3321248', '40374/3'],
        ['AU-ACT', ACT_FIXTURE, '44/19', null],
    ];
    for (const [regionCode, fixture, expectedId, expectedTitle] of cases) {
        it(`${regionCode} → parcelId ${expectedId}`, () => {
            const res = parseAuResponse(fixture, AU_STATE_DESCRIPTORS[regionCode]);
            expect(res.ok).toBe(true);
            if (!res.ok) return;
            expect(res.parcel.parcelId).toBe(expectedId);
            expect(res.parcel.regionCode).toBe(regionCode);
            expect(res.parcel.ring.length).toBeGreaterThanOrEqual(3);
            expect(res.parcel.areaM2).toBeGreaterThan(0);
            expect(res.parcel.confidence).toBe('high');
            if (expectedTitle) expect(res.parcel.identity.title).toBe(expectedTitle);
        });
    }

    it('QLD SKIPS the "Unlinked parcel" (null lotplan) and resolves the real lot', () => {
        const res = parseAuResponse(QLD_FIXTURE, AU_STATE_DESCRIPTORS['AU-QLD']);
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.parcel.parcelId).toBe('47SP317615');
    });

    it('ACT DROPS the three RETIRED blocks and resolves the APPROVED block (RETIRED ≠ current)', () => {
        const res = parseAuResponse(ACT_FIXTURE, AU_STATE_DESCRIPTORS['AU-ACT']);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.parcel.parcelId).toBe('44/19'); // block 44 section 19 — the sole non-retired feature
        expect(res.parcel.identity.components.block).toBe('44');
        expect(res.parcel.identity.components.section).toBe('19');
    });

    it('CRS guard — a projected (MGA metre) ring is REFUSED, not plotted as degrees', () => {
        const projected = {
            features: [
                {
                    attributes: { lotidstring: '1//DP0', lotnumber: '1', planlabel: 'DP0' },
                    geometry: { rings: [[[313000, 6250000], [313010, 6250000], [313010, 6250010], [313000, 6250010], [313000, 6250000]]] },
                },
            ],
        };
        const res = parseAuResponse(projected, AU_STATE_DESCRIPTORS['AU-NSW']);
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('crs-unprojected');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. ROUTING / REACHABILITY — the router selects the right AU state for each capital.
// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('AU routing — each capital is routed to its own state cadastre', () => {
    const cases: ReadonlyArray<[string, number, number, string, string]> = [
        ['Sydney', GOLDEN.sydney.lat, GOLDEN.sydney.lon, 'AU-NSW', 'au-nsw-dcs-cadastre'],
        ['Melbourne', GOLDEN.melbourne.lat, GOLDEN.melbourne.lon, 'AU-VIC', 'au-vic-vicmap-cadastre'],
        ['Brisbane', GOLDEN.brisbane.lat, GOLDEN.brisbane.lon, 'AU-QLD', 'au-qld-qspatial-cadastre'],
        ['Adelaide', GOLDEN.adelaide.lat, GOLDEN.adelaide.lon, 'AU-SA', 'au-sa-sappa-cadastre'],
        ['Hobart', GOLDEN.hobart.lat, GOLDEN.hobart.lon, 'AU-TAS', 'au-tas-thelist-cadastre'],
    ];
    for (const [name, lat, lon, regionCode, providerId] of cases) {
        it(`${name} → ${regionCode} FIRST (fails if the row is deleted)`, () => {
            const top = primary(lat, lon);
            expect(top).toBeDefined();
            expect(top!.regionCode).toBe(regionCode);
            expect(top!.providerId).toBe(providerId);
        });
    }

    it('Canberra → AU-ACT ahead of the enclosing NSW box (specificity), never AU-NSW first', () => {
        const cands = resolveParcelCandidates(GOLDEN.canberra.lat, GOLDEN.canberra.lon);
        expect(cands[0]!.regionCode).toBe('AU-ACT');
        expect(cands.map((c) => c.regionCode)).toContain('AU-NSW'); // NSW is a candidate, ranked lower
        expect(parcelJurisdictionSpecificity(cands[0]!)).toBeLessThan(
            parcelJurisdictionSpecificity(cands.find((c) => c.regionCode === 'AU-NSW')!),
        );
    });

    it('all eight AU regions are registered (six cadastral + two deferrals)', () => {
        const codes = listParcelJurisdictions().map((j) => j.regionCode);
        expect(codes).toEqual(
            expect.arrayContaining(['AU-NSW', 'AU-VIC', 'AU-QLD', 'AU-SA', 'AU-TAS', 'AU-ACT', 'AU-WA', 'AU-NT']),
        );
    });

    it('every AU row has a finite specificity (a REGION_BBOX entry — cannot silently sort last)', () => {
        for (const j of listParcelJurisdictions()) {
            if (!j.regionCode.startsWith('AU-')) continue;
            expect(Number.isFinite(parcelJurisdictionSpecificity(j)), `${j.regionCode} missing REGION_BBOX`).toBe(true);
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE NATIONAL RESOLVER REFUSES for AU — which is exactly what lets the bbox rows route.
// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('AU national-jurisdiction — refuses (no AUS in the boundary set), so bbox rows survive', () => {
    for (const p of [GOLDEN.sydney, GOLDEN.melbourne, GOLDEN.brisbane, GOLDEN.hobart, GOLDEN.canberra]) {
        it(`${p.name} → no-national-candidate (never a European/US/Saudi claim)`, () => {
            const v = resolveNationalJurisdiction(p.lat, p.lon);
            expect(v.ok).toBe(false);
            if (!v.ok) expect(v.reason).toBe('no-national-candidate');
        });
    }
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. THE REGION-CODE COLLISION — AU-SA (South Australia) is NOT SA (Saudi Arabia).
// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('AU-SA vs SA — the two South-Australia/Saudi codes never cross', () => {
    it('Adelaide routes to AU-SA (cadastral), not SA', () => {
        const top = primary(GOLDEN.adelaide.lat, GOLDEN.adelaide.lon);
        expect(top!.regionCode).toBe('AU-SA');
        expect(top!.kind).toBe('cadastral');
    });
    it('Riyadh routes to SA (Saudi footprint), not AU-SA', () => {
        const top = primary(GOLDEN.riyadh.lat, GOLDEN.riyadh.lon);
        expect(top!.regionCode).toBe('SA');
        expect(top!.kind).toBe('footprint-fallback');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. DECLARED DEFERRALS — Perth/Darwin land on an honest AU footprint row, not a false cadastre.
// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('AU deferrals — WA + NT are honest footprint rows carrying their gate', () => {
    it('Perth → AU-WA footprint-fallback (Landgate identifier gate)', () => {
        const top = primary(GOLDEN.perth.lat, GOLDEN.perth.lon);
        expect(top!.regionCode).toBe('AU-WA');
        expect(top!.kind).toBe('footprint-fallback');
        expect(top!.proxyPath).toBeNull();
    });
    it('Darwin → AU-NT footprint-fallback (viewer-gated)', () => {
        const top = primary(GOLDEN.darwin.lat, GOLDEN.darwin.lon);
        expect(top!.regionCode).toBe('AU-NT');
        expect(top!.kind).toBe('footprint-fallback');
    });
    it('the two deferral source rows carry a live gate transcript + reviewBy', () => {
        const deferrals = AU_SOURCES.filter((s) => s.access === 'declared-deferral');
        expect(deferrals.map((s) => s.regionCode).sort()).toEqual(['AU-NT', 'AU-WA']);
        for (const d of deferrals) {
            expect(d.gate).toBeTruthy();
            expect(d.reviewBy).toBeTruthy();
            expect(d.probe.transcript).toBeTruthy();
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6. PRIORITY-FALLBACK — a shared-border click self-corrects on the wrong-state service's null.
// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('AU border self-correction — Albury (NSW) tried VIC-first, falls THROUGH to NSW', () => {
    it('VIC ranks first at Albury but returns null → resolveParcelWithFallback lands on NSW', async () => {
        const cands = resolveParcelCandidates(GOLDEN.albury.lat, GOLDEN.albury.lon).map((c) => c.regionCode);
        expect(cands).toContain('AU-VIC');
        expect(cands).toContain('AU-NSW');
        expect(cands.indexOf('AU-VIC')).toBeLessThan(cands.indexOf('AU-NSW')); // VIC box is smaller

        // Simulate each state's cadastre: only NSW answers at this NSW-side point.
        const hit = await resolveParcelWithFallback(GOLDEN.albury.lat, GOLDEN.albury.lon, (jur) => {
            if (jur.regionCode === 'AU-NSW') return { id: 'NSW-parcel' };
            return null; // VIC (and any other candidate) returns no feature for a NSW point
        });
        expect(hit).not.toBeNull();
        expect(hit!.jurisdiction.regionCode).toBe('AU-NSW');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 7. THE IMPURE SEAM — never throws; out-of-region + injected-fetch behave.
// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('AU fetch seam — typed refusals, never a throw', () => {
    it('out-of-region point → out-of-region refusal (no network)', async () => {
        const res = await fetchAuParcelAtPoint('AU-NSW', { lat: 48.85, lon: 2.35 }); // Paris
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('out-of-region');
    });
    it('injected fetch returning the NSW body → the parsed parcel', async () => {
        const provider = auStateParcelProvider('AU-NSW');
        const fakeFetch = (async () =>
            ({ ok: true, json: async () => NSW_FIXTURE }) as unknown as Response) as typeof fetch;
        const res = await provider.fetchParcelAtPoint(
            { lat: GOLDEN.sydney.lat, lon: GOLDEN.sydney.lon },
            { fetchImpl: fakeFetch },
        );
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.parcel.parcelId).toBe('100//DP1048011');
    });
    it('a non-ok upstream → endpoint-unreachable (falls to footprint, never throws)', async () => {
        const badFetch = (async () => ({ ok: false }) as unknown as Response) as typeof fetch;
        const res = await fetchAuParcelAtPoint('AU-TAS', { lat: GOLDEN.hobart.lat, lon: GOLDEN.hobart.lon }, { fetchImpl: badFetch });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
    });
});
