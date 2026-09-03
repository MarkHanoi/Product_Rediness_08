// LANE ME-GULF — REACHABILITY + ROUTING + DEFERRAL-HONESTY tests for the four Gulf rows added to
// `parcelProviders/registry.ts` (AE · KW · BH · OM) + the SA note update, the resolver extension
// (AE/KW/BH/OM added to the national boundary set), and the gulf/ adapter deferrals.
//
// Every routing assertion starts from `resolveParcelCandidates(lat, lon)` — the REAL dispatch entry
// point — so DELETE A ROW AND ITS TEST FAILS (the L-651 / L-12871 reachability discipline).
//
// ⛔ WHAT THESE PROVE / DO NOT PROVE: they prove ROUTING (which jurisdiction a click is offered) and
// DEFERRAL HONESTY (a gated channel refuses TRANSIENT, never `absent`, never a fabricated parcel).
// There is NO live-parcel proof because there is no live parcel — every Gulf parcel channel probed
// 2026-09-02 / re-probed 2026-09-03 is GATED or vantage-BLOCKED; the captured gate transcripts live
// under audit/intl-parcels/2026-09-02/transcripts-me-gulf/ and are asserted to exist below.
//
// FIXTURES (recorded-live): the gate transcripts (existence asserted) + the ne_10m boundary
// provenance (sourceSha256 asserted against the pinned value the geometry was extracted from). No
// network in CI.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
import {
    GULF_DEFERRALS,
    GULF_DEFERRED_TOKEN,
    gulfDeferredRefusal,
    assertGulfDeferralsNotExpired,
} from '../src/countryAdapters/gulf/gulfDeferrals.js';
import {
    resolveGulfParcelAtWgs84Point,
    isGulfDeferredRegion,
    GULF_PARCEL_REGION_CODES,
} from '../src/countryAdapters/gulf/gulfParcelProvider.js';
import { isTransientFetchReason } from '@pryzm/schemas';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function codes(lat: number, lon: number): readonly string[] {
    return resolveParcelCandidates(lat, lon).map((j) => j.regionCode);
}
function row(regionCode: string): ParcelJurisdiction {
    const found = listParcelJurisdictions().find((j) => j.regionCode === regionCode);
    if (!found) throw new Error(`no registry row for ${regionCode}`);
    return found;
}

const GULF_COUNTRY_CODES = ['AE', 'KW', 'BH', 'OM'] as const;

// A real, named place per Gulf country + the emirate cores (all inside SAUDI_ARABIA_BBOX except OM).
const CITIES: ReadonlyArray<[string, number, number, string]> = [
    ['Dubai', 25.1972, 55.2744, 'AE'],
    ['Abu Dhabi', 24.4539, 54.3773, 'AE'],
    ['Sharjah', 25.3463, 55.4209, 'AE'],
    ['Kuwait City', 29.3759, 47.9774, 'KW'],
    ['Manama (Bahrain)', 26.2285, 50.586, 'BH'],
    ['Muscat (Oman)', 23.588, 58.3829, 'OM'],
];

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. REACHABILITY — each Gulf country is SELECTED (first) by the router at its own cities.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('ME-GULF reachability — AE/KW/BH/OM are routed to as the FIRST candidate', () => {
    for (const [name, lat, lon, regionCode] of CITIES) {
        it(`${name} → ${regionCode} (footprint-fallback) first`, () => {
            const top = resolveParcelCandidates(lat, lon)[0];
            expect(top, `${name} matched no jurisdiction`).toBeDefined();
            expect(top!.regionCode).toBe(regionCode);
            expect(top!.kind).toBe('footprint-fallback');
            expect(top!.providerId).toBe('footprint');
        });
    }

    it('each Gulf region code is registered exactly once', () => {
        const all = listParcelJurisdictions().map((j) => j.regionCode);
        for (const cc of GULF_COUNTRY_CODES) {
            expect(all.filter((c) => c === cc), `${cc} row count`).toHaveLength(1);
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE SAUDI-BBOX FIX — the whole point of this lane. Dubai/Abu Dhabi/Kuwait/Bahrain sit INSIDE
//    SAUDI_ARABIA_BBOX; before this lane they matched only the SA footprint row and were labelled
//    Saudi. Now the national resolver CLAIMS them (AE/KW/BH/OM are in the boundary set), which
//    filters SA out entirely.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('ME-GULF §2 — the Saudi-bbox mislabel is fixed by a national CLAIM (not a refusal)', () => {
    it('Dubai offers [AE] alone — the SA footprint is filtered out by the AE claim', () => {
        expect(codes(25.1972, 55.2744)).toEqual(['AE']);
    });
    it('Abu Dhabi offers [AE] alone', () => {
        expect(codes(24.4539, 54.3773)).toEqual(['AE']);
    });
    it('Kuwait City offers [KW] alone', () => {
        expect(codes(29.3759, 47.9774)).toEqual(['KW']);
    });
    it('Manama offers [BH] alone (an island ~25 km off the Saudi coast — a clean claim)', () => {
        expect(codes(26.2285, 50.586)).toEqual(['BH']);
    });

    it('the national resolver CLAIMS each Gulf city for its own country (contrast TR/IL/QA which refuse)', () => {
        for (const [name, lat, lon, cc] of CITIES) {
            const v = resolveNationalJurisdiction(lat, lon);
            expect(v.ok, `${name} should be claimed`).toBe(true);
            if (v.ok) expect(v.regionCode, name).toBe(cc);
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. ADVERSARIAL — no Gulf row claims foreign ground; Saudi + the QA lane's row are untouched.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('ME-GULF §3 — no Gulf row claims a point outside its own country', () => {
    it('Riyadh + Dammam still route to SA (a Saudi CLAIM; no Gulf row appears)', () => {
        for (const [lat, lon] of [[24.7136, 46.6753], [26.4207, 50.0888]] as const) {
            const ordered = codes(lat, lon);
            expect(ordered[0]).toBe('SA');
            for (const cc of GULF_COUNTRY_CODES) expect(ordered).not.toContain(cc);
        }
    });

    it('Doha (Qatar, the QA lane’s row) is NOT claimed by any Gulf country and still routes QA-first', () => {
        // Qatar is deliberately NOT in the boundary set here — it must REFUSE (not be annexed to
        // Saudi, and not be swallowed by UAE whose pre-filter box reaches Doha’s longitude).
        const v = resolveNationalJurisdiction(25.2854, 51.531);
        expect(v.ok).toBe(false);
        const ordered = codes(25.2854, 51.531);
        expect(ordered[0]).toBe('QA');
        for (const cc of GULF_COUNTRY_CODES) expect(ordered).not.toContain(cc);
    });

    const foreign: ReadonlyArray<[string, number, number]> = [
        ['Barcelona', 41.3915, 2.1649],
        ['Tehran (Iran — not modelled)', 35.6892, 51.389],
        ['New York City', 40.7128, -74.006],
    ];
    for (const [name, lat, lon] of foreign) {
        it(`${name} is claimed by NONE of AE/KW/BH/OM`, () => {
            const ordered = codes(lat, lon);
            for (const cc of GULF_COUNTRY_CODES) {
                expect(ordered, `${cc} must not claim ${name}`).not.toContain(cc);
            }
        });
    }

    it('the Gulf `contains` predicates are total: NaN / Infinity / junk return false, never throw', () => {
        for (const cc of GULF_COUNTRY_CODES) {
            const c = row(cc).contains;
            expect(() => c(Number.NaN, 0)).not.toThrow();
            expect(c(Number.NaN, 0)).toBe(false);
            expect(c(0, Number.POSITIVE_INFINITY)).toBe(false);
            expect((c as (a: unknown, b: unknown) => boolean)('x', undefined)).toBe(false);
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. HONESTY OF THE ROW — footprint-fallback (deferral), proxyPath null, gate named in the note.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('ME-GULF §4 — each row declares the DEFERRAL its probe measured', () => {
    it('AE/KW/BH/OM are footprint-fallback with no proxy seat (nothing behind the route)', () => {
        for (const cc of GULF_COUNTRY_CODES) {
            expect(row(cc).kind).toBe('footprint-fallback');
            expect(row(cc).proxyPath).toBeNull();
            expect(row(cc).providerId).toBe('footprint');
            expect(row(cc).note).toMatch(/DEFERRAL|DECLARED DEFERRAL|deferral/);
        }
    });

    it('the AE note names BOTH emirate gates (the founder’s two spend targets)', () => {
        const note = row('AE').note;
        expect(note).toMatch(/DUBAI/);
        expect(note).toMatch(/ABU DHABI/);
        expect(note).toMatch(/F5|WAF/);
        expect(note).toMatch(/TCP-timeout|TCP timeout/);
        expect(note).toMatch(/claimsNation/);
    });

    it('the SA note carries the L-606 token/SSO DELTA (not the stale IP-fence text)', () => {
        const note = row('SA').note;
        expect(note).toMatch(/L-606 DELTA/);
        expect(note).toMatch(/Token Required|token/);
        expect(note).toMatch(/Balady SSO|Nafath|credential-class/);
        // the stale claim must be gone
        expect(note).not.toMatch(/IP geo-fenced \(WAF-blocks non-SA IPs/);
    });

    it('every Gulf row has a finite specificity (none can silently sort last)', () => {
        for (const cc of GULF_COUNTRY_CODES) {
            expect(Number.isFinite(parcelJurisdictionSpecificity(row(cc))), cc).toBe(true);
        }
    });

    it('adding the Gulf rows kept every registered proxyPath unique (no route collision)', () => {
        const paths = listParcelJurisdictions()
            .map((j) => j.proxyPath)
            .filter((p): p is string => p !== null);
        expect(new Set(paths).size).toBe(paths.length);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE DEFERRALS — a gated channel refuses TRANSIENT (never `absent`), on an L0 token (L-12874),
//    each descriptor points at a real captured transcript, and the reviewBy assertion is armed.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('ME-GULF §5 — the declared deferrals are honest, self-announcing and dated', () => {
    it('gulfDeferredRefusal is TRANSIENT (not absent) and rides the L0 endpoint-unreachable token', () => {
        for (const rc of GULF_PARCEL_REGION_CODES) {
            const out = gulfDeferredRefusal<{ x: 1 }>(rc, 'test leg');
            expect(out.status, `${rc} must be transient, never absent`).toBe('transient');
            if (out.status === 'transient') {
                const prefix = out.reason.split(':', 1)[0]!.trim();
                expect(prefix, `${rc} token must be an L0 transient token`).toBe('endpoint-unreachable');
                expect(isTransientFetchReason(prefix), `${rc} L-12874`).toBe(true);
                expect(out.reason).toContain(GULF_DEFERRED_TOKEN);
                expect(out.reason).toMatch(/DECLARED DEFERRAL/);
            }
        }
    });

    it('resolveGulfParcelAtWgs84Point defers for every Gulf regionCode (never a fabricated parcel)', async () => {
        for (const rc of GULF_PARCEL_REGION_CODES) {
            const out = await resolveGulfParcelAtWgs84Point(rc, 25.2, 55.27);
            expect(out.status).toBe('transient');
        }
    });

    it('every GULF_DEFERRALS descriptor carries a gate, evidence, reviewBy and a real transcript file', () => {
        for (const d of Object.values(GULF_DEFERRALS)) {
            expect(d.gateClass, `${d.regionCode} gateClass`).toBeTruthy();
            expect(d.evidence.length, `${d.regionCode} evidence`).toBeGreaterThan(40);
            expect(d.gatedEndpoints.length, `${d.regionCode} endpoints`).toBeGreaterThan(0);
            expect(d.reviewBy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(d.retiredBy.length, `${d.regionCode} retiredBy`).toBeGreaterThan(20);
            const abs = REPO_ROOT + d.transcript;
            expect(existsSync(abs), `transcript missing for ${d.regionCode}: ${d.transcript}`).toBe(true);
        }
    });

    it('Dubai and Abu Dhabi are DISTINCT descriptors with DISTINCT gate classes', () => {
        expect(GULF_DEFERRALS['AE-DU']!.gateClass).toBe('vantage-network-fence');
        expect(GULF_DEFERRALS['AE-AZ']!.gateClass).toBe('waf');
        expect(GULF_DEFERRALS['SA']!.gateClass).toBe('token-sso');
    });

    it('assertGulfDeferralsNotExpired passes today and THROWS BY NAME after a reviewBy', () => {
        expect(() => assertGulfDeferralsNotExpired('2026-09-03')).not.toThrow();
        expect(() => assertGulfDeferralsNotExpired('2099-01-01')).toThrow(/passed reviewBy/);
    });

    it('isGulfDeferredRegion is true for the six probed codes, false otherwise', () => {
        for (const rc of ['AE-DU', 'AE-AZ', 'SA', 'KW', 'BH', 'OM']) expect(isGulfDeferredRegion(rc)).toBe(true);
        expect(isGulfDeferredRegion('ES')).toBe(false);
        expect(isGulfDeferredRegion('QA')).toBe(false);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6. THE RESOLVER EXTENSION — AE/KW/BH/OM are in the boundary set, from the SAME pinned ne_10m
//    source the existing 16 came from (provenance fixture).
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('ME-GULF §6 — the boundary-set extension is present and provenance-consistent', () => {
    it('ARE/KWT/BHR/OMN are claimable countries with the right ISO-3166-1 alpha-2 regionCodes', () => {
        const map: ReadonlyArray<[string, string]> = [
            ['ARE', 'AE'],
            ['KWT', 'KW'],
            ['BHR', 'BH'],
            ['OMN', 'OM'],
        ];
        for (const [iso3, rc] of map) {
            const c = NATIONAL_BOUNDARY_SET.countries[iso3];
            expect(c, `${iso3} missing from boundary set`).toBeDefined();
            expect(c!.regionCode).toBe(rc);
            expect(c!.rings.length, `${iso3} rings`).toBeGreaterThan(0);
        }
    });

    it('the boundary set is still the pinned ne_10m source (sha256 unchanged by the Gulf extension)', () => {
        expect(NATIONAL_BOUNDARY_SET.sourceSha256).toBe(
            '239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255',
        );
        expect(NATIONAL_BOUNDARY_SET.dataset).toMatch(/ne_10m_admin_0_countries/);
    });

    it('Qatar (QAT) is deliberately NOT added here — it is the QA lane’s jurisdiction', () => {
        expect(NATIONAL_BOUNDARY_SET.countries['QAT']).toBeUndefined();
    });
});
