// L-12871 — REACHABILITY TESTS for the five NATIONAL-CLAIM rows added to
// `parcelProviders/registry.ts` (EE · LT · PL · LU · SE).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS — the gap it closes, and the gap it does NOT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Eight country adapters under `src/countryAdapters/` were committed, unit-tested and in several
// cases probed live against real national services — and `grep -c countryAdapters
// src/parcelProviders/registry.ts` returned 0, so NOTHING ROUTED TO ANY OF THEM. That is the exact
// failure `parcelRegistryWiring.test.ts` was written for in L-651 ("a provider with no registry row
// is inert code, and its own unit tests can never notice"), recurring one wave later with different
// countries. Every assertion below therefore starts from `resolveParcelCandidates(lat, lon)` — the
// real dispatch entry point — and NOT from an adapter function. DELETE A ROW AND ITS TEST FAILS.
//
// ⛔ WHAT THESE TESTS DO **NOT** PROVE. They prove ROUTING. They do not prove that a click returns a
// real parcel: `/api/parcel/{ee,lt,pl}` are not yet wired server-side, so those routes 404 and the
// click falls to the OSM footprint. That is the same declared state the IT / GB-ENG / BE-VLG /
// US-NYC rows carry, and it is recorded in each row's `note`. (⚠ Corrected 2026-09-02: this header
// used to cite `apps/editor/__tests__/parcelRegistryNationalClick.test.ts` as the click-layer half —
// that file DOES NOT EXIST; it is queued work, not a citation. The DK click layer, by contrast, IS
// proven live: `server/__tests__/dkMatrikelProxy.test.ts` + the L-12888 DAWA transcripts.)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE LOAD-BEARING PROPERTY: NOT ONE OF THESE ROWS ROUTES ON A BBOX
// ══════════════════════════════════════════════════════════════════════════════════════════════
// L-12871: `LITHUANIA_BBOX` (≈15.9 deg²) is SMALLER than `POLAND_BBOX` (≈58.6 deg²) and contains
// Suwałki and Sejny, which are POLISH. The registry's per-point resolver breaks ties by SMALLEST BOX
// AREA. So registering LT and PL on their bbox predicates would hand two Polish towns to the
// Lithuanian cadastre — and the same arithmetic hands the German bank of the Oder to Poland. §3
// below asserts BOTH halves of that: that area WOULD pick wrong, and that the shipped routing does
// not, because `contains` is `claimsNation` (boundary geometry + a measured tolerance), never area.

import { describe, it, expect } from 'vitest';
import {
    resolveParcelCandidates,
    resolveParcelJurisdiction,
    parcelJurisdictionSpecificity,
    listParcelJurisdictions,
    type ParcelJurisdiction,
} from '../src/parcelProviders/registry.js';
import {
    resolveNationalJurisdiction,
    NATIONAL_BOUNDARY_SET,
} from '../src/jurisdiction/nationalJurisdictionResolver.js';

/** The top-ranked candidate for a point — what the real dispatch tries FIRST. */
function primary(lat: number, lon: number): ParcelJurisdiction | undefined {
    return resolveParcelCandidates(lat, lon)[0];
}

/** Every region code the router offers at a point, in priority order. */
function codes(lat: number, lon: number): readonly string[] {
    return resolveParcelCandidates(lat, lon).map((j) => j.regionCode);
}

function row(regionCode: string): ParcelJurisdiction {
    const found = listParcelJurisdictions().find((j) => j.regionCode === regionCode);
    if (!found) throw new Error(`no registry row for ${regionCode}`);
    return found;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. REACHABILITY — each newly registered country is actually SELECTED by the router.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('L-12871 reachability — the five country adapters are now routed to', () => {
    const cases: ReadonlyArray<[string, number, number, string, string]> = [
        ['Tallinn', 59.437, 24.7536, 'EE', 'ee-maaamet-kataster'],
        ['Tartu', 58.378, 26.729, 'EE', 'ee-maaamet-kataster'],
        ['Vilnius', 54.6872, 25.2797, 'LT', 'lt-rc-ntr-parcels-featureserver'],
        ['Kaunas', 54.8985, 23.9036, 'LT', 'lt-rc-ntr-parcels-featureserver'],
        ['Warsaw', 52.2297, 21.0122, 'PL', 'pl-gugik-uldk'],
        ['Kraków', 50.0647, 19.945, 'PL', 'pl-gugik-uldk'],
        ['Luxembourg City', 49.6116, 6.1319, 'LU', 'footprint'],
        ['Esch-sur-Alzette', 49.4958, 5.9806, 'LU', 'footprint'],
        ['Stockholm', 59.3293, 18.0686, 'SE', 'se-lantmateriet-fastighetsindelning'],
        ['Visby', 57.6348, 18.2948, 'SE', 'se-lantmateriet-fastighetsindelning'],
    ];

    for (const [name, lat, lon, regionCode, providerId] of cases) {
        it(`${name} routes to ${regionCode} (${providerId}) as the FIRST candidate`, () => {
            const top = primary(lat, lon);
            expect(top, `${name} matched no jurisdiction at all`).toBeDefined();
            expect(top!.regionCode).toBe(regionCode);
            expect(top!.providerId).toBe(providerId);
        });
    }

    it('all five region codes are registered exactly once', () => {
        const all = listParcelJurisdictions().map((j) => j.regionCode);
        for (const cc of ['EE', 'LT', 'PL', 'LU', 'SE']) {
            expect(all.filter((c) => c === cc), `${cc} row count`).toHaveLength(1);
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE MISROUTES THESE ROWS REMOVE — each was live before this batch.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('L-12871 — the pre-existing misroutes these rows correct', () => {
    // ⚠ TEST CORRECTED 2026-09-02 (this wave). As inherited, these three asserted the wrong-country
    // rows were still OFFERED behind the right one ("expect(ordered).toContain('NO')") — written
    // for a registration-only design where EE merely OUTRANKED Norway. The shipped design is
    // stronger, per the wave brief: `resolveParcelCandidates` consults the national resolver and
    // a CLAIM routes to that country ALONE, so Kartverket is not offered at Tallinn at all. The
    // assertions were tightened to the shipped guarantee, not loosened.
    it('Tallinn no longer asks KARTVERKET: a national EE claim removes the enclosing NO row entirely', () => {
        const ordered = codes(59.437, 24.7536);
        expect(ordered[0]).toBe('EE');
        // NORWAY_BBOX (57.8–71.4 N, 4.4–31.3 E) still CONTAINS Tallinn — but the national claim
        // filter drops it: a Norwegian cadastre can never be the right answer on Estonian soil.
        expect(ordered).not.toContain('NO');
    });

    it('Stockholm no longer reads as NORWAY: the national SE claim removes the NO row', () => {
        const ordered = codes(59.3293, 18.0686);
        expect(ordered[0]).toBe('SE');
        expect(ordered).not.toContain('NO');
        // The legacy single-verdict resolver must agree, or a coverage/inspection caller still
        // reports Stockholm as Norwegian.
        expect(resolveParcelJurisdiction(59.3293, 18.0686).regionCode).toBe('SE');
    });

    it('Luxembourg City no longer reads as a German Land: the national LU claim removes DE and FR', () => {
        const ordered = codes(49.6116, 6.1319);
        expect(ordered[0]).toBe('LU');
        expect(ordered).not.toContain('DE');
        expect(ordered).not.toContain('FR');
        expect(ordered).not.toContain('BE-WAL');
        expect(resolveParcelJurisdiction(49.6116, 6.1319).regionCode).toBe('LU');
    });

    it('Vilnius and Warsaw resolved to NOTHING before this batch — now they resolve', () => {
        // No pre-existing registered bbox reaches either (NORWAY_BBOX starts at 57.8 N; GERMANY_BBOX
        // ends at 15.1 E). Both used to fall straight to the universal footprint.
        expect(codes(54.6872, 25.2797)).toEqual(['LT']);
        expect(codes(52.2297, 21.0122)).toEqual(['PL']);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. ⛔ THE FALSIFICATION CONTROL — area WOULD get L-12871 wrong; the shipped routing does not.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('L-12871 §3 — no point is decided by box area', () => {
    it('CONTROL: the smallest-box rule that L-12871 forbids WOULD pick Lithuania at Suwałki', () => {
        // This is the arithmetic the issue names, asserted directly so the test that follows cannot
        // pass vacuously. If this control ever fails, the bboxes moved and §3 is measuring nothing.
        const lt = parcelJurisdictionSpecificity(row('LT'));
        const pl = parcelJurisdictionSpecificity(row('PL'));
        expect(lt).toBeLessThan(pl);
        expect(lt).toBeCloseTo(15.9, 0);
        expect(pl).toBeCloseTo(58.6, 0);
    });

    const named: ReadonlyArray<[string, number, number, string]> = [
        ['Suwałki (POLISH, inside LITHUANIA_BBOX)', 54.1, 22.93, 'PL'],
        ['Sejny (POLISH, inside LITHUANIA_BBOX)', 54.11, 23.35, 'PL'],
        ['Marijampolė (LITHUANIAN, inside POLAND_BBOX)', 54.55, 23.35, 'LT'],
    ];

    for (const [name, lat, lon, expected] of named) {
        it(`${name} → exactly ONE country claims it, and it is ${expected}`, () => {
            // (a) The national resolver claims exactly one, and names its basis — never "smallest box".
            const verdict = resolveNationalJurisdiction(lat, lon);
            expect(verdict.ok).toBe(true);
            if (!verdict.ok) return;
            expect(verdict.regionCode).toBe(expected);
            expect(['polygon-containment', 'nearest-polygon']).toContain(verdict.basis.kind);

            // (b) The ROUTER agrees, and the rival country is not even offered as a candidate.
            const ordered = codes(lat, lon);
            expect(ordered[0]).toBe(expected);
            const rival = expected === 'PL' ? 'LT' : 'PL';
            expect(ordered, `${rival} must not be a candidate at ${name}`).not.toContain(rival);
        });
    }

    it('the registry file contains no area/specificity logic on the national rows', () => {
        // Both national rows sort by area like every other row (that is the shared metric), but the
        // MATCH decision is `claimsNation`. Proven behaviourally: at Suwałki the LT row's own
        // `contains` is false even though its box is smaller and does contain the point.
        expect(row('LT').contains(54.1, 22.93)).toBe(false);
        expect(row('PL').contains(54.1, 22.93)).toBe(true);
        expect(row('PL').contains(54.55, 23.35)).toBe(false);
        expect(row('LT').contains(54.55, 23.35)).toBe(true);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. THE ODER STRIP — the half that REFUSES, asserted as a refusal, not tuned into a claim.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('L-12871 §4 — the German/Polish border band refuses rather than guessing', () => {
    const band: ReadonlyArray<[string, number, number]> = [
        ['Frankfurt (Oder) — GERMAN', 52.3471, 14.5506],
        ['Słubice — POLISH', 52.3481, 14.5606],
        ['Görlitz — GERMAN', 51.1526, 14.9876],
    ];

    for (const [name, lat, lon] of band) {
        it(`${name}: the PL row does NOT match, so no cadastre is confidently wrong`, () => {
            expect(row('PL').contains(lat, lon)).toBe(false);
            expect(codes(lat, lon)).not.toContain('PL');
            const verdict = resolveNationalJurisdiction(lat, lon);
            expect(verdict.ok).toBe(false);
            if (verdict.ok) return;
            expect(verdict.reason).toBe('within-dataset-tolerance-of-rival');
            // The refusal carries BOTH numbers — the rival distance and the tolerance it failed.
            expect(verdict.detail).toMatch(/\d+ m away/);
            expect(verdict.detail).toMatch(/1500 m/);
        });
    }

    it('a refused point still resolves to SOMETHING — a click is never dead (C58 §1.4)', () => {
        // The coarse DE footprint row still covers the strip. ⚠ Słubice is POLISH and gets a
        // German-attributed footprint; that is UNCHANGED from before this batch (nothing routed to
        // PL at all) and is recorded as a data limit in the PL row's note, not fixed by tuning.
        for (const [, lat, lon] of band) {
            expect(primary(lat, lon)).toBeDefined();
            expect(primary(lat, lon)!.kind).toBe('footprint-fallback');
        }
    });

    it('Zgorzelec (POLISH, 1839 m from the German polygon) DOES claim — the band is not a blanket', () => {
        // Proves §4 is a measured tolerance band and not "refuse everywhere near a border": 1839 m
        // clears the 1500 m tolerance, so the claim is made.
        expect(codes(51.1494, 15.0086)[0]).toBe('PL');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. ADVERSARIAL — a new row must never claim a point outside its own country.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('L-12871 §5 — no new row claims foreign ground', () => {
    const foreign: ReadonlyArray<[string, number, number, string]> = [
        ['København (DANISH, inside SWEDEN_BBOX)', 55.6761, 12.5683, 'SE'],
        ['Kuressaare (ESTONIAN, inside SWEDEN_BBOX)', 58.2528, 22.4869, 'SE'],
        ['Klaipėda (LITHUANIAN, inside SWEDEN_BBOX)', 55.7033, 21.1443, 'SE'],
        ['Røros (NORWEGIAN, inside SWEDEN_BBOX)', 62.5744, 11.3842, 'SE'],
        ['Berlin (GERMAN)', 52.52, 13.405, 'PL'],
        ['Rīga (LATVIAN, inside SWEDEN_BBOX)', 56.9496, 24.1052, 'SE'],
        ['Metz (FRENCH, near LU)', 49.1193, 6.1757, 'LU'],
        ['Trier (GERMAN, near LU)', 49.7596, 6.6439, 'LU'],
    ];

    for (const [name, lat, lon, mustNotClaim] of foreign) {
        it(`${name} is NOT claimed by ${mustNotClaim}`, () => {
            expect(row(mustNotClaim).contains(lat, lon)).toBe(false);
            expect(codes(lat, lon)).not.toContain(mustNotClaim);
        });
    }

    it('København still routes to Denmark and is NOT claimed by the new SE row', () => {
        expect(codes(55.6761, 12.5683)).toContain('DK');
        expect(codes(55.6761, 12.5683)).not.toContain('SE');
    });

    // ⚠ TEST CORRECTED 2026-09-02 (this wave). As inherited, this pinned a MEASURED LIMIT: the
    // DK bbox row (≈26.6 deg², smaller than SWEDEN_BBOX ≈183.5 deg²) still ranked FIRST at Malmö
    // and Göteborg, harmless only because the Danish proxy returned null. That limit is now FIXED
    // at its root, not papered over: `resolveParcelCandidates` consults the national resolver, the
    // resolver claims SWE at both cities, and the claim filter drops the DK row entirely. The fix
    // matters beyond tidiness — the DK route is no longer a dead stub (the keyless DAWA leg is
    // stacked ahead of it, L-12888), so "harmless because null" would have silently become a REAL
    // wrong-country query the day DAWA landed. This is that surfacing, one wave early.
    it('Malmö/Göteborg: the national SE claim removes DK — a Danish cadastre is never asked on Swedish soil', () => {
        for (const [lat, lon] of [[55.605, 13.0038], [57.7089, 11.9746]] as const) {
            const ordered = codes(lat, lon);
            expect(ordered[0]).toBe('SE');
            expect(ordered).not.toContain('DK');
            expect(resolveParcelJurisdiction(lat, lon).regionCode).toBe('SE');
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6. PURITY — the national predicates never throw, and the memo cannot leak a stale verdict.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('L-12871 §6 — purity and the one-entry memo', () => {
    for (const cc of ['EE', 'LT', 'PL', 'LU', 'SE']) {
        it(`${cc}.contains is total: NaN / Infinity / junk all return false, never throw`, () => {
            const c = row(cc).contains;
            expect(() => c(Number.NaN, 0)).not.toThrow();
            expect(c(Number.NaN, 0)).toBe(false);
            expect(c(0, Number.POSITIVE_INFINITY)).toBe(false);
            expect(c(-Number.NaN, Number.NaN)).toBe(false);
            expect((c as (a: unknown, b: unknown) => boolean)('x', undefined)).toBe(false);
        });
    }

    it('the memo does not carry one point’s verdict to the next', () => {
        // Interleave two countries repeatedly: a memo keyed on the wrong thing (or never
        // invalidated) makes the second call in each pair inherit the first's answer.
        for (let i = 0; i < 3; i++) {
            expect(codes(59.437, 24.7536)[0]).toBe('EE');
            expect(codes(52.2297, 21.0122)[0]).toBe('PL');
            expect(codes(59.3293, 18.0686)[0]).toBe('SE');
            expect(codes(54.6872, 25.2797)[0]).toBe('LT');
        }
    });

    it('re-asking the SAME point is stable (the memo returns the same verdict)', () => {
        const first = codes(49.6116, 6.1319);
        expect(codes(49.6116, 6.1319)).toEqual(first);
        expect(codes(49.6116, 6.1319)).toEqual(first);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 7. ⛔ DENMARK — exactly ONE Danish parcel path in the router (C84 EI-9).
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('L-12871 §7 — the DK collision left ONE Danish route, not two', () => {
    it('there is exactly one row with regionCode DK', () => {
        expect(listParcelJurisdictions().filter((j) => j.regionCode === 'DK')).toHaveLength(1);
    });

    it('there is exactly one row bound to /api/parcel/dk, and it is that row', () => {
        const dk = listParcelJurisdictions().filter((j) => j.proxyPath === '/api/parcel/dk');
        expect(dk).toHaveLength(1);
        expect(dk[0]!.regionCode).toBe('DK');
        expect(dk[0]!.providerId).toBe('matrikel-dk');
    });

    it('the DAWA adapter is NOT registered as a rival Danish provider', () => {
        const ids = listParcelJurisdictions().map((j) => j.providerId);
        expect(ids).not.toContain('dk-dawa-jordstykker');
        expect(ids.filter((id) => id.startsWith('dk-') || id === 'matrikel-dk')).toEqual(['matrikel-dk']);
    });

    it('the DK row records that DAWA is keyless and live, so the note cannot read as "Denmark has no access"', () => {
        expect(row('DK').note).toContain('DAWA');
        expect(row('DK').note).toContain('KEYLESSLY');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 8. HONESTY OF THE ROW ITSELF — kind matches the measured access state.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('L-12871 §8 — each row declares the access state its lane measured', () => {
    it('EE / LT / PL are cadastral (keyless services, live-probed) with a proxy seat', () => {
        for (const cc of ['EE', 'LT', 'PL']) {
            expect(row(cc).kind).toBe('cadastral');
            expect(row(cc).proxyPath).toBe(`/api/parcel/${cc.toLowerCase()}`);
            // The proxy is NOT wired yet, and the row must say so rather than implying coverage.
            expect(row(cc).note).toContain('NOT yet wired');
        }
    });

    it('SE is a footprint-fallback: the cadastre answered 401, so nothing is behind the route', () => {
        expect(row('SE').kind).toBe('footprint-fallback');
        expect(row('SE').proxyPath).toBeNull();
        expect(row('SE').note).toContain('401');
    });

    it('LU is a footprint-fallback: the LU adapter ships no parcel provider at all', () => {
        expect(row('LU').kind).toBe('footprint-fallback');
        expect(row('LU').proxyPath).toBeNull();
        expect(row('LU').note).toContain('NO parcel source is wired');
    });

    it('every new row has a finite specificity (none can silently sort last)', () => {
        for (const cc of ['EE', 'LT', 'PL', 'LU', 'SE']) {
            expect(Number.isFinite(parcelJurisdictionSpecificity(row(cc))), `${cc}`).toBe(true);
        }
    });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// 9. ⛔ THE ANNEXATION CONTROL — the misroute an unrestricted national claim WOULD have shipped.
// ════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ TEST CORRECTED 2026-09-02 (this wave). As inherited, the control asserted the LIVE resolver
// claims LU at Athus (Belgium) — true when written, and exactly the defect L-12887 then fixed
// INSIDE the resolver: the un-modelled land neighbours (BEL among them) now ship as refusal-only
// members, so the resolver itself refuses at Athus BY NAME and the guard no longer needs to live
// in the routing predicate. The control therefore moves to a deps-injection: STRIP the neighbour
// ring and the annexation returns, proving the guard is load-bearing, not vacuous. The inherited
// comment's conclusion ("the routing predicate accepts polygon-containment ONLY") is SUPERSEDED
// with the same fix: nearest-polygon claims are safe now that every land neighbour is a rival,
// and rejecting them would cost København (140 m outside ne_10m DNK) its own cadastre.

describe('L-12871 §9 — an un-modelled neighbour is never annexed', () => {
    it('CONTROL: with the neighbour ring STRIPPED the resolver DOES claim LU at Athus — the guard is load-bearing', () => {
        // If this control ever stops claiming, §9 is passing vacuously (L-12887's red-first state).
        const stripped = { ...NATIONAL_BOUNDARY_SET, neighbours: {} };
        const verdict = resolveNationalJurisdiction(49.5622, 5.8261, { boundaries: stripped });
        expect(verdict.ok).toBe(true);
        if (!verdict.ok) return;
        expect(verdict.regionCode).toBe('LU');
        expect(verdict.basis.kind).toBe('nearest-polygon');
    });

    it('the SHIPPED resolver refuses Athus BY NAME — the true owner is in the detail (L-12887)', () => {
        const verdict = resolveNationalJurisdiction(49.5622, 5.8261);
        expect(verdict.ok).toBe(false);
        if (verdict.ok) return;
        expect(verdict.reason).toBe('claimed-by-unmodelled-neighbour');
        expect(verdict.detail).toContain('BEL');
    });

    it('the LU row nevertheless does NOT match Athus — a Belgian click stays Belgian', () => {
        expect(row('LU').contains(49.5622, 5.8261)).toBe(false);
        expect(codes(49.5622, 5.8261)).not.toContain('LU');
        expect(codes(49.5622, 5.8261)[0]).toBe('BE-WAL');
    });

    const belgian: ReadonlyArray<[string, number, number, string]> = [
        ['Brussels', 50.8467, 4.3525, 'BE-BRU'],
        ['Antwerp', 51.2194, 4.4025, 'BE-VLG'],
        ['Liège', 50.6326, 5.5797, 'BE-WAL'],
        ['Bastogne', 50.0033, 5.7186, 'BE-WAL'],
        ['Arlon', 49.6839, 5.8167, 'BE-WAL'],
    ];
    for (const [name, lat, lon, expected] of belgian) {
        it(`${name} still routes to ${expected} — the batch takes no Belgian point`, () => {
            expect(codes(lat, lon)[0]).toBe(expected);
            for (const cc of ['EE', 'LT', 'PL', 'LU', 'SE']) {
                expect(codes(lat, lon), `${cc} must not claim ${name}`).not.toContain(cc);
            }
        });
    }
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// 10. THE COVERAGE THIS BATCH ACTUALLY DELIVERS — a number, not an adjective.
// ════════════════════════════════════════════════════════════════════════════════════════════

describe('L-12871 §10 — measured coverage over the ten largest cities of each country', () => {
    const CITIES: Readonly<Record<string, ReadonlyArray<readonly [string, number, number]>>> = {
        EE: [
            ['Tallinn', 59.437, 24.7536], ['Tartu', 58.378, 26.729], ['Narva', 59.3797, 28.1791],
            ['Pärnu', 58.3859, 24.4971], ['Kohtla-Järve', 59.3986, 27.2731], ['Viljandi', 58.3639, 25.59],
            ['Rakvere', 59.3465, 26.3558], ['Kuressaare', 58.2528, 22.4869], ['Haapsalu', 58.9431, 23.5414],
            ['Sillamäe', 59.3997, 27.7742],
        ],
        LT: [
            ['Vilnius', 54.6872, 25.2797], ['Kaunas', 54.8985, 23.9036], ['Klaipėda', 55.7033, 21.1443],
            ['Šiauliai', 55.9333, 23.3167], ['Panevėžys', 55.7333, 24.35], ['Alytus', 54.3963, 24.0458],
            ['Marijampolė', 54.559, 23.354], ['Mažeikiai', 56.3167, 22.3333], ['Utena', 55.4986, 25.6017],
            ['Palanga', 55.9175, 21.0686],
        ],
        PL: [
            ['Warszawa', 52.2297, 21.0122], ['Kraków', 50.0647, 19.945], ['Łódź', 51.7592, 19.456],
            ['Wrocław', 51.1079, 17.0385], ['Poznań', 52.4064, 16.9252], ['Gdańsk', 54.352, 18.6466],
            ['Szczecin', 53.4285, 14.5528], ['Bydgoszcz', 53.1235, 18.0084], ['Lublin', 51.2465, 22.5684],
            ['Białystok', 53.1325, 23.1688],
        ],
        LU: [
            ['Luxembourg City', 49.6116, 6.1319], ['Esch-sur-Alzette', 49.4958, 5.9806],
            ['Differdange', 49.5242, 5.8914], ['Dudelange', 49.4808, 6.0875], ['Ettelbruck', 49.8475, 6.1039],
            ['Diekirch', 49.8683, 6.1594], ['Wiltz', 49.9667, 5.9333], ['Echternach', 49.8117, 6.42],
            ['Rumelange', 49.455, 6.0294], ['Grevenmacher', 49.68, 6.4419],
        ],
        SE: [
            ['Stockholm', 59.3293, 18.0686], ['Göteborg', 57.7089, 11.9746], ['Malmö', 55.605, 13.0038],
            ['Uppsala', 59.8586, 17.6389], ['Västerås', 59.6099, 16.5448], ['Örebro', 59.2741, 15.2066],
            ['Linköping', 58.4109, 15.6216], ['Helsingborg', 56.0465, 12.6945], ['Kiruna', 67.8558, 20.2253],
            ['Visby', 57.6348, 18.2948],
        ],
    };

    /**
     * The cities the batch does NOT route — NAMED, so the shortfall cannot drift silently.
     * ⚠ RE-MEASURED 2026-09-02 after the L-12887 neighbour ring landed (transcript
     * impl/…/06-city50-sweep.txt): Helsingborg NOW ROUTES (the nearest-polygon rescue claims SWE
     * decisively — DNK across the Öresund is kilometres farther — and nearest-polygon claims are
     * accepted for routing now that every land neighbour is a rival). Narva's reason CHANGED:
     * ne_10m's displaced border puts Narva town inside RUSSIA, so it refuses
     * `claimed-by-unmodelled-neighbour` naming RUS — a stronger refusal than the inherited
     * "outside the simplified EE polygon", and visibly a data limit, not a routing bug.
     */
    const KNOWN_MISSES: ReadonlyArray<readonly [string, string, string]> = [
        ['EE', 'Narva', 'claimed-by-unmodelled-neighbour: ne_10m places Narva inside RUS (displaced Narva-river boundary)'],
        ['LU', 'Dudelange', 'within 1500 m of the FR boundary (measured 1154 m) — the dataset cannot separate it'],
        ['LU', 'Echternach', 'ne_10m displacement puts it inside DEU with LUX 687 m away — refused, never claimed for DE'],
        ['LU', 'Rumelange', 'within 1500 m of the FR boundary (measured 869 m) — the dataset cannot separate it'],
        ['LU', 'Grevenmacher', 'within 1500 m of the DE boundary (measured 15 m) — the dataset cannot separate it'],
    ];

    it('45 of 50 cities are routed to their own country — and the 5 that are not are NAMED', () => {
        const missed: string[] = [];
        let routed = 0;
        for (const [cc, list] of Object.entries(CITIES)) {
            for (const [name, lat, lon] of list) {
                if (codes(lat, lon).includes(cc)) routed++;
                else missed.push(`${cc}:${name}`);
            }
        }
        expect(routed).toBe(45);
        expect(missed.sort()).toEqual(
            KNOWN_MISSES.map(([cc, name]) => `${cc}:${name}`).sort(),
        );
    });

    it('every miss is a REFUSAL — not one of them is claimed by the WRONG new row', () => {
        for (const [cc, name] of KNOWN_MISSES) {
            const city = CITIES[cc]!.find(([n]) => n === name)!;
            const ordered = codes(city[1], city[2]);
            for (const other of ['EE', 'LT', 'PL', 'LU', 'SE']) {
                expect(ordered, `${name} must not be claimed by ${other}`).not.toContain(other);
            }
        }
    });

    it('LU is the country the tolerance costs most — 6 of 10, and that is a DATA limit', () => {
        // Luxembourg is ~82 km across against a MEASURED 1500 m boundary tolerance, so a large share
        // of it sits in the un-separable band. Registering it is still strictly better than not: with
        // no row all ten towns are attributed to Germany or France, and the row is a
        // footprint-fallback either way, so no click changes what the user actually gets.
        const luRouted = CITIES.LU!.filter(([, lat, lon]) => codes(lat, lon).includes('LU')).length;
        expect(luRouted).toBe(6);
        expect(row('LU').kind).toBe('footprint-fallback');
    });
});
