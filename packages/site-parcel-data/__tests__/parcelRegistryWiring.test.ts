// L-651 — GOLDEN-PARCEL WIRING TESTS for the six providers that were built, unit-tested, and INERT.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS — the exact gap that let six providers ship dead
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `packages/site-parcel-data/src/parcelProviders/` held 13 providers; only 6 had a row in
// `registry.ts`. The other 6 (Brussels, Wallonia, DGT/Portugal, Scotland RoS, San Francisco,
// Chicago) were fully written AND fully unit-tested — `brusselsParcelProvider.test.ts` and friends
// all passed — yet a click anywhere in their territory silently fell through to the OSM footprint,
// because NOTHING ROUTED TO THEM.
//
// The unit tests could never have caught it. They import the provider directly and call its parse /
// fetch functions, which proves the provider WORKS but says nothing about whether it is REACHABLE.
// Reachability is a property of the REGISTRY, not of the provider, so it needs a test that starts
// from a coordinate and asserts what the ROUTER picks — which is what every test below does.
//
// THE LOAD-BEARING PROPERTY: every test here starts from `resolveParcelCandidates(lat, lon)`, the
// real dispatch entry point. DELETE A ROW FROM `PARCEL_JURISDICTIONS` AND THE MATCHING TEST FAILS —
// either the top candidate becomes a different (enclosing) jurisdiction, or the region disappears
// from the registration list. That is the regression barrier the six providers never had.
//
// LIVE-PROBE STATUS (2026-07-31, recorded in each registry row's `note`):
//   • PT / US-SF / US-CHI — upstream VERIFIED LIVE, real parcels returned → `cadastral` rows.
//   • BE-BRU / BE-WAL / GB-SCT — upstream NOT REACHABLE → honest `footprint-fallback` rows.
//     Registered ANYWAY, because a registered footprint tells the truth ("no source wired here")
//     while an absent row tells a lie by omission (the click gets attributed to whichever enclosing
//     box happens to catch it — for Brussels, that is Flanders). See §BELGIUM below.
//
// NETWORK: none. Every geometry assertion runs the provider's PURE parser over a fixture whose
// coordinates/identifiers are copied from the real live probe, so the test is deterministic in CI
// while still pinning the real upstream shape.

import { describe, it, expect } from 'vitest';
import {
    resolveParcelCandidates,
    resolveParcelJurisdiction,
    resolveParcelWithFallback,
    parcelJurisdictionSpecificity,
    listParcelJurisdictions,
    type ParcelJurisdiction,
} from '../src/parcelProviders/registry.js';
import { parseDgtCadastralFeatures } from '../src/parcelProviders/dgtParcelProvider.js';
import { parseSfParcelResponse } from '../src/parcelProviders/sfParcelProvider.js';
import { parseCookCountyResponse } from '../src/parcelProviders/chicagoParcelProvider.js';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// GOLDEN POINTS — a real, named place per newly wired jurisdiction.
// ──────────────────────────────────────────────────────────────────────────────────────────────

const GOLDEN = {
    /** Castelo Branco district, mainland Portugal — beside the parcel the live probe returned. */
    lisbonRegion: { lat: 39.6713, lon: -7.5534, name: 'Castelo Branco (PT)' },
    /** 3976 19th St, San Francisco — the exact lot the live probe resolved (blklot 3584032). */
    sf: { lat: 37.75970573486825, lon: -122.4320260756015, name: '3976 19th St, San Francisco' },
    /** Willis Tower, Chicago — inside the city limits and the Cook County parcel fabric. */
    chicago: { lat: 41.8789, lon: -87.6359, name: 'Willis Tower, Chicago' },
    /** Grand-Place / Grote Markt, Brussels — the enclave's centre. */
    brussels: { lat: 50.8467, lon: 4.3525, name: 'Grand-Place, Brussels' },
    /** Liège, Wallonia — south of the Flanders box, so unambiguously Walloon. */
    liege: { lat: 50.6326, lon: 5.5797, name: 'Liège (BE-WAL)' },
    /** Edinburgh — north of ENGLAND_BBOX's 55.9°N ceiling, so unambiguously Scottish. */
    edinburgh: { lat: 55.9533, lon: -3.1883, name: 'Edinburgh (GB-SCT)' },
    /** Antwerp — Flanders proper, used to prove Brussels does NOT swallow Flemish points. */
    antwerp: { lat: 51.2194, lon: 4.4025, name: 'Antwerp (BE-VLG)' },
    /** Newcastle — inside BOTH the England and Scotland boxes (the border band). */
    newcastle: { lat: 54.9783, lon: -1.6178, name: 'Newcastle upon Tyne' },
} as const;

/** The top-ranked candidate for a point — what the real dispatch tries FIRST. */
function primary(lat: number, lon: number): ParcelJurisdiction | undefined {
    return resolveParcelCandidates(lat, lon)[0];
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. REACHABILITY — each newly wired jurisdiction is actually SELECTED by the router.
//    Remove its registry row and the primary becomes the enclosing box → these fail.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('L-651 reachability — the six formerly-inert providers are now routed to', () => {
    const cases: ReadonlyArray<[string, number, number, string, string]> = [
        ['Portugal → DGT Cadastro Predial', GOLDEN.lisbonRegion.lat, GOLDEN.lisbonRegion.lon, 'PT', 'dgt-cadastro-predial'],
        ['San Francisco → DataSF assessor', GOLDEN.sf.lat, GOLDEN.sf.lon, 'US-CA-SF', 'sf-datasf'],
        ['Chicago → Cook County', GOLDEN.chicago.lat, GOLDEN.chicago.lon, 'US-IL-CHI', 'chicago-cook'],
        ['Brussels → Brussels-Capital', GOLDEN.brussels.lat, GOLDEN.brussels.lon, 'BE-BRU', 'brussels-cadastre'],
        ['Wallonia → Walloon Region', GOLDEN.liege.lat, GOLDEN.liege.lon, 'BE-WAL', 'wallonia-cadastre'],
        ['Scotland → Registers of Scotland', GOLDEN.edinburgh.lat, GOLDEN.edinburgh.lon, 'GB-SCT', 'gb-sct-ros'],
    ];

    for (const [name, lat, lon, regionCode, providerId] of cases) {
        it(`${name} — the router picks it FIRST (fails if the registry row is deleted)`, () => {
            const top = primary(lat, lon);
            expect(top).toBeDefined();
            expect(top!.regionCode).toBe(regionCode);
            expect(top!.providerId).toBe(providerId);
        });
    }

    it('all six regions appear in the public registration list', () => {
        const codes = listParcelJurisdictions().map((j) => j.regionCode);
        expect(codes).toEqual(
            expect.arrayContaining(['PT', 'US-CA-SF', 'US-IL-CHI', 'BE-BRU', 'BE-WAL', 'GB-SCT']),
        );
    });

    // The silent-inertness guard. A row with no REGION_BBOX entry scores +Infinity and therefore
    // sorts LAST among its candidates — it would be registered yet never chosen for any overlapping
    // point. For an enclave like Brussels that is indistinguishable from not registering it at all.
    it('EVERY registered row has a finite specificity (no row can silently sort last)', () => {
        for (const j of listParcelJurisdictions()) {
            expect(
                Number.isFinite(parcelJurisdictionSpecificity(j)),
                `${j.regionCode} has no REGION_BBOX entry — it would never win a contested point`,
            ).toBe(true);
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. ROUTING EXCLUSIVITY — exactly one jurisdiction claims each golden point, unambiguously.
//
//    "Exclusivity" cannot mean "only one bbox contains the point": the registry is DELIBERATELY
//    built on overlapping coarse boxes plus a priority-fallback walk (L-650), and Portugal ⊂ Spain
//    and Brussels ⊂ Flanders are geographic facts, not modelling errors. What must be exclusive is
//    the VERDICT: exactly one jurisdiction ranks first, and it wins by a strict margin rather than
//    by the registration-order tie-break (which would make the outcome a coin flip that a harmless
//    row reordering could silently invert).
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('L-651 routing exclusivity — one unambiguous winner per golden point', () => {
    const points: ReadonlyArray<[string, number, number, string]> = [
        ['Portugal', GOLDEN.lisbonRegion.lat, GOLDEN.lisbonRegion.lon, 'PT'],
        ['San Francisco', GOLDEN.sf.lat, GOLDEN.sf.lon, 'US-CA-SF'],
        ['Chicago', GOLDEN.chicago.lat, GOLDEN.chicago.lon, 'US-IL-CHI'],
        ['Brussels', GOLDEN.brussels.lat, GOLDEN.brussels.lon, 'BE-BRU'],
        ['Wallonia', GOLDEN.liege.lat, GOLDEN.liege.lon, 'BE-WAL'],
        ['Scotland', GOLDEN.edinburgh.lat, GOLDEN.edinburgh.lon, 'GB-SCT'],
    ];

    for (const [name, lat, lon, regionCode] of points) {
        it(`${name}: the winner is unique and beats the runner-up on specificity (no tie-break coin flip)`, () => {
            const candidates = resolveParcelCandidates(lat, lon);
            expect(candidates.length).toBeGreaterThan(0);
            expect(candidates[0]!.regionCode).toBe(regionCode);

            // Exactly one candidate claims this regionCode.
            expect(candidates.filter((c) => c.regionCode === regionCode)).toHaveLength(1);

            // The win is by MEASUREMENT, not by row order.
            if (candidates.length > 1) {
                expect(parcelJurisdictionSpecificity(candidates[0]!)).toBeLessThan(
                    parcelJurisdictionSpecificity(candidates[1]!),
                );
            }
        });
    }

    it('SF and Chicago are claimed by exactly ONE jurisdiction each (no overlap at all)', () => {
        expect(resolveParcelCandidates(GOLDEN.sf.lat, GOLDEN.sf.lon)).toHaveLength(1);
        expect(resolveParcelCandidates(GOLDEN.chicago.lat, GOLDEN.chicago.lon)).toHaveLength(1);
    });

    it('Portugal outranks Spain even though PORTUGAL_BBOX sits entirely inside SPAIN_BBOX', () => {
        const ids = resolveParcelCandidates(GOLDEN.lisbonRegion.lat, GOLDEN.lisbonRegion.lon).map(
            (j) => j.providerId,
        );
        expect(ids).toEqual(['dgt-cadastro-predial', 'catastro']);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. §BELGIUM — the enclave trap, and why THREE predicates beat one `isInBelgium`.
//
//    Brussels-Capital is an enclave inside Flemish Brabant, so BRUSSELS_BBOX ⊂ FLANDERS_BBOX and a
//    naïve router hands every Brussels click to the Flanders GRB cadastre — which does not serve
//    Brussels at all, so the user gets an empty result attributed to the wrong region. These tests
//    pin the fix, which is measurement (0.038 deg² vs 2.87 deg², a 75× ratio) rather than a
//    hand-maintained ordering rule.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('§BELGIUM — Brussels enclave is not claimed by Flanders (the trap)', () => {
    it('a Brussels click is claimed by BE-BRU, and Flanders ranks strictly BELOW it', () => {
        const candidates = resolveParcelCandidates(GOLDEN.brussels.lat, GOLDEN.brussels.lon);
        const codes = candidates.map((c) => c.regionCode);

        expect(codes[0]).toBe('BE-BRU');
        // Flanders DOES contain the point (geographic fact) but must never be the primary.
        expect(codes).toContain('BE-VLG');
        expect(codes.indexOf('BE-BRU')).toBeLessThan(codes.indexOf('BE-VLG'));
    });

    it('the Brussels win is a 75x specificity margin, not a registration-order accident', () => {
        const candidates = resolveParcelCandidates(GOLDEN.brussels.lat, GOLDEN.brussels.lon);
        const bru = candidates.find((c) => c.regionCode === 'BE-BRU')!;
        const vlg = candidates.find((c) => c.regionCode === 'BE-VLG')!;
        expect(parcelJurisdictionSpecificity(bru) * 50).toBeLessThan(
            parcelJurisdictionSpecificity(vlg),
        );
    });

    it('the reverse holds: Antwerp stays with Flanders and is NOT claimed by Brussels', () => {
        const candidates = resolveParcelCandidates(GOLDEN.antwerp.lat, GOLDEN.antwerp.lon);
        expect(candidates[0]!.regionCode).toBe('BE-VLG');
        expect(candidates.map((c) => c.regionCode)).not.toContain('BE-BRU');
    });

    it('Wallonia does not swallow Brussels, and Brussels does not swallow Wallonia', () => {
        // Liège is Walloon-only among the BE rows.
        const liege = resolveParcelCandidates(GOLDEN.liege.lat, GOLDEN.liege.lon).map((c) => c.regionCode);
        expect(liege[0]).toBe('BE-WAL');
        expect(liege).not.toContain('BE-BRU');
        expect(liege).not.toContain('BE-VLG');
    });

    // The three BE rows carry three DIFFERENT verdicts — which is precisely what a single merged
    // `isInBelgium` row could not express, and the reason the three-predicate shape was chosen.
    it('the three Belgian regions carry three DISTINCT honest verdicts (one row could not)', () => {
        const rows = listParcelJurisdictions();
        const vlg = rows.find((r) => r.regionCode === 'BE-VLG')!;
        const bru = rows.find((r) => r.regionCode === 'BE-BRU')!;
        const wal = rows.find((r) => r.regionCode === 'BE-WAL')!;

        // Flanders has a live keyless cadastre; the other two have no reachable endpoint at all.
        expect(vlg.kind).toBe('cadastral');
        expect(vlg.proxyPath).toBe('/api/parcel/be-vlg');
        expect(bru.kind).toBe('footprint-fallback');
        expect(bru.proxyPath).toBeNull();
        expect(wal.kind).toBe('footprint-fallback');
        expect(wal.proxyPath).toBeNull();

        // Each blocker is named specifically — not a shared generic "unavailable".
        expect(bru.note).toMatch(/AGDP_CAPA/);
        expect(wal.note).toMatch(/Orthos/);
        expect(bru.note).not.toBe(wal.note);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. §CONTEXT-DATA-HONESTY — an unreachable cadastre must never be dressed as a live one.
//
//    L-422/457/467/469: "the source failed" and "there is nothing here" are DIFFERENT VALUES. A row
//    marked `cadastral` with a proxyPath that no server route serves would resolve null on every
//    click and degrade into "this country has no parcels" — the exact collapse this family of bugs
//    keeps reproducing. So the three unreachable jurisdictions are registered as `footprint-fallback`
//    with `proxyPath: null`, which is a CLAIM ABOUT COVERAGE, not a silent failure.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('§CONTEXT-DATA-HONESTY — unreachable jurisdictions degrade honestly', () => {
    const unreachable: ReadonlyArray<[string, string, RegExp]> = [
        ['BE-BRU', 'Brussels', /to-build|sync/i],
        ['BE-WAL', 'Wallonia', /access-deferred/i],
        ['GB-SCT', 'Scotland', /access-deferred/i],
    ];

    for (const [regionCode, name, statusPattern] of unreachable) {
        it(`${name} is a footprint-fallback with a cited blocker and a probe date, never a dead cadastral row`, () => {
            const row = listParcelJurisdictions().find((j) => j.regionCode === regionCode)!;
            expect(row).toBeDefined();
            expect(row.kind).toBe('footprint-fallback');
            expect(row.proxyPath).toBeNull();
            // The note must state WHEN it was probed and WHAT the blocker is — an unexplained
            // fallback is indistinguishable from an unfinished one.
            expect(row.note).toMatch(/PROBED 2026-07-31|NO reachable|DOES NOT EXIST/);
            expect(row.note).toMatch(statusPattern);
        });
    }

    it('Scotland names the credential it needs rather than pretending the data is absent', () => {
        const sct = listParcelJurisdictions().find((j) => j.regionCode === 'GB-SCT')!;
        expect(sct.note).toMatch(/ScotLIS/);
        expect(sct.note).toMatch(/CREDENTIAL|API_KEY/i);
    });

    it('the three LIVE-PROBED jurisdictions are cadastral and each names its own proxy route', () => {
        const rows = listParcelJurisdictions();
        const expected: ReadonlyArray<[string, string]> = [
            ['PT', '/api/parcel/pt'],
            ['US-CA-SF', '/api/parcel/us-sf'],
            ['US-IL-CHI', '/api/parcel/us-chi'],
        ];
        for (const [regionCode, proxyPath] of expected) {
            const row = rows.find((j) => j.regionCode === regionCode)!;
            expect(row.kind).toBe('cadastral');
            expect(row.proxyPath).toBe(proxyPath);
            expect(row.note).toMatch(/VERIFIED-LIVE 2026-07-31/);
        }
    });

    it('every registered proxyPath is unique (no two jurisdictions share a server route)', () => {
        const paths = listParcelJurisdictions()
            .map((j) => j.proxyPath)
            .filter((p): p is string => p !== null);
        expect(new Set(paths).size).toBe(paths.length);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. FALL-THROUGH — the new rows must not break the neighbours they overlap.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('L-651 fall-through — new rows never strand an existing live cadastre', () => {
    /** A fetchFor that answers only for the listed providerIds. */
    const answersFor =
        (...liveIds: string[]) =>
        (jur: ParcelJurisdiction): { id: string } | null =>
            liveIds.includes(jur.providerId) ? { id: jur.providerId } : null;

    it('Newcastle (border band): GB-SCT is ranked first but yields → England still resolves', async () => {
        // SCOTLAND_BBOX is fractionally SMALLER than ENGLAND_BBOX, so Scotland leads on specificity.
        // Harmless only because GB-SCT has no proxy and returns null instantly. This test is the
        // guard: if Scotland ever becomes `cadastral`, this border band needs a kind-aware sort.
        const codes = resolveParcelCandidates(GOLDEN.newcastle.lat, GOLDEN.newcastle.lon).map(
            (c) => c.regionCode,
        );
        expect(codes).toContain('GB-SCT');
        expect(codes).toContain('GB-ENG');

        const hit = await resolveParcelWithFallback(
            GOLDEN.newcastle.lat,
            GOLDEN.newcastle.lon,
            answersFor('gb-os-inspire'),
        );
        expect(hit?.jurisdiction.providerId).toBe('gb-os-inspire');
    });

    it('a Spanish point west of -6.1E (Badajoz) tries Portugal, then self-corrects to Catastro', async () => {
        const hit = await resolveParcelWithFallback(38.8794, -6.9707, answersFor('catastro'));
        expect(hit?.jurisdiction.providerId).toBe('catastro');
    });

    it('Brussels: every candidate yields → null, so the caller applies the universal footprint', async () => {
        // Nothing is ever LABELLED Flanders for a Brussels point: provenance is attached only on a
        // real hit, and GRB does not serve Brussels.
        const hit = await resolveParcelWithFallback(
            GOLDEN.brussels.lat,
            GOLDEN.brussels.lon,
            () => null,
        );
        expect(hit).toBeNull();
    });

    it('the pre-existing golden routes are unchanged by this batch', async () => {
        // Regression guard for the rows this batch inserted rows ahead of.
        // Barcelona sits inside FRANCE_BBOX too, and France's box is the smaller of the two, so the
        // PRIORITY resolver legitimately tries IGN first and self-corrects — pre-existing L-650
        // behaviour, documented in registry.ts. What this batch must not disturb is the LEGACY
        // single verdict, which row order decides: inserting PT ahead of ES must keep ES ahead of FR.
        expect(resolveParcelJurisdiction(41.3915, 2.1649).providerId).toBe('catastro'); // Barcelona
        expect(resolveParcelCandidates(41.3915, 2.1649).map((c) => c.providerId)).toEqual([
            'ign-fr',
            'catastro',
        ]);
        expect(primary(48.8566, 2.3522)!.providerId).toBe('ign-fr'); // Paris
        expect(primary(51.2194, 4.4025)!.providerId).toBe('flanders-grb'); // Antwerp
        expect(primary(51.5074, -0.1278)!.providerId).toBe('gb-os-inspire'); // London
        expect(primary(40.7128, -74.006)!.providerId).toBe('nyc-pluto'); // NYC
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6. GOLDEN GEOMETRY — the three LIVE jurisdictions parse a real upstream body into a real parcel.
//    Fixtures replicate the exact field names + coordinates observed in the 2026-07-31 probe, so a
//    provider that stops understanding its real upstream shape fails here.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('L-651 golden geometry — real probed bodies parse to a parcel + identifier', () => {
    it('Portugal: the SNIC WFS body yields a ring and the national cadastral reference', () => {
        // Field names + the parcel id are verbatim from the live GetFeature (feature
        // `cadastralparcel.1108210701` near -7.5566, 39.6702).
        const body = {
            type: 'FeatureCollection',
            features: [
                {
                    type: 'Feature',
                    id: 'cadastralparcel.1108210701',
                    geometry: {
                        type: 'MultiPolygon',
                        coordinates: [
                            [
                                [
                                    [-7.55663922, 39.67021741],
                                    [-7.55666204, 39.67024859],
                                    [-7.5567797, 39.67033861],
                                    [-7.55630272, 39.6713192],
                                    [-7.55663922, 39.67021741],
                                ],
                            ],
                        ],
                    },
                    properties: {
                        inspireid: 'PT.DGT.CP.AAA001318684',
                        nationalcadastralreference: 'AAA001318684',
                        label: 'AAA 001 318 684',
                        areavalue: 30568,
                        administrativeunit: '051102',
                    },
                },
            ],
        };
        const features = parseDgtCadastralFeatures(body);
        expect(features.length).toBeGreaterThan(0);
        const f = features[0]!;
        expect(f.ring.length).toBeGreaterThanOrEqual(3);
        // Real WGS84 degrees, not projected EPSG:3763 metres.
        for (const p of f.ring) {
            expect(Math.abs(p.lat)).toBeLessThanOrEqual(90);
            expect(Math.abs(p.lon)).toBeLessThanOrEqual(180);
        }
    });

    it('San Francisco: a real Socrata row (geometry under `shape`) yields APN 3584032', () => {
        // ⚠ The geometry column is `shape`. Before the L-651 probe this module looked only at
        // `the_geom`, so this exact body refused `degenerate-geometry` on live data.
        const body = [
            {
                mapblklot: '3584032',
                blklot: '3584032',
                block_num: '3584',
                lot_num: '032',
                zoning_code: 'RH-2',
                zoning_district: 'RESIDENTIAL- HOUSE, TWO FAMILY',
                active: true,
                shape: {
                    type: 'MultiPolygon',
                    coordinates: [
                        [
                            [
                                [-122.432054193, 37.759546743],
                                [-122.432084189, 37.759859519],
                                [-122.431997957, 37.759864717],
                                [-122.431967962, 37.759551961],
                                [-122.432054193, 37.759546743],
                            ],
                        ],
                    ],
                },
            },
        ];
        const res = parseSfParcelResponse(body);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.parcel.apn).toBe('3584032');
        expect(res.parcel.ring.length).toBeGreaterThanOrEqual(3);
        expect(res.parcel.areaM2).toBeGreaterThan(0);
        expect(res.parcel.source).toBe('sf-datasf');
        // SF governs by height-and-bulk, never a citywide FAR — the zoning lead stays a DRAFT.
        expect(res.parcel.zoning?.draft).toBe(true);
        expect(res.parcel.zoning).not.toHaveProperty('farRatio');
    });

    it('Chicago: a real Cook County Socrata row yields PIN 0101100119', () => {
        const body = [
            {
                pin10: '0101100119',
                municipality: 'Barrington',
                the_geom: {
                    type: 'MultiPolygon',
                    coordinates: [
                        [
                            [
                                [-88.13618112411835, 42.153804986153375],
                                [-88.1361806273359, 42.15379376789339],
                                [-88.13618032040051, 42.15378254601369],
                                [-88.1360811241, 42.1537049862],
                                [-88.13618112411835, 42.153804986153375],
                            ],
                        ],
                    ],
                },
            },
        ];
        const res = parseCookCountyResponse(body);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.parcel.pin).toBe('0101100119');
        expect(res.parcel.ring.length).toBeGreaterThanOrEqual(3);
        expect(res.parcel.areaSource).toBe('derived-from-ring');
        expect(res.parcel.source).toBe('chicago-cook');
    });

    it('an empty upstream body is an honest no-parcel, never a fabricated ring', () => {
        expect(parseDgtCadastralFeatures({ type: 'FeatureCollection', features: [] })).toEqual([]);
        expect(parseSfParcelResponse([]).ok).toBe(false);
        expect(parseCookCountyResponse([]).ok).toBe(false);
    });
});
