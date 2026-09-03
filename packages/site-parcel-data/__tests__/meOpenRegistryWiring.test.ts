// LANE ME-OPEN — REACHABILITY + ROUTING tests for the three ME rows added to
// `parcelProviders/registry.ts` (TR · IL · QA). Every assertion starts from
// `resolveParcelCandidates(lat, lon)` — the REAL dispatch entry point — not from an adapter function,
// so DELETE A ROW AND ITS TEST FAILS (the L-651 / L-12871 reachability discipline).
//
// ⛔ WHAT THESE PROVE / DO NOT PROVE: they prove ROUTING (which cadastre a click is offered). The
// live-parcel proof is the foreground probe of 2026-09-02 (transcripts under
// audit/intl-parcels/2026-09-02/transcripts-me-open/) — TKGM ada 3106/parsel 258, govmap gush
// 6952/helka 139, CadastrePlots PIN 1010028 — plus the per-provider parser tests in this dir. The
// /api/parcel/{tr,il,qa} server proxies are NOT yet wired (each row's note says so), so a real click
// resolves null → OSM footprint until they are.

import { describe, it, expect } from 'vitest';
import {
    resolveParcelCandidates,
    resolveParcelJurisdiction,
    parcelJurisdictionSpecificity,
    listParcelJurisdictions,
    type ParcelJurisdiction,
} from '../src/parcelProviders/registry.js';
import { resolveNationalJurisdiction } from '../src/jurisdiction/nationalJurisdictionResolver.js';

function codes(lat: number, lon: number): readonly string[] {
    return resolveParcelCandidates(lat, lon).map((j) => j.regionCode);
}
function row(regionCode: string): ParcelJurisdiction {
    const found = listParcelJurisdictions().find((j) => j.regionCode === regionCode);
    if (!found) throw new Error(`no registry row for ${regionCode}`);
    return found;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. REACHABILITY — each ME country is SELECTED (first) by the router at its own cities.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('ME-OPEN reachability — TR/IL/QA are routed to as the FIRST candidate', () => {
    const cases: ReadonlyArray<[string, number, number, string, string]> = [
        ['Istanbul (Kadıköy)', 40.9819, 29.0576, 'TR', 'tr-tkgm-parsel'],
        ['Ankara', 39.9042, 32.856, 'TR', 'tr-tkgm-parsel'],
        ['Tel Aviv', 32.0783, 34.778, 'IL', 'il-govmap-parcel-all'],
        ['Jerusalem', 31.7683, 35.2137, 'IL', 'il-govmap-parcel-all'],
        ['Doha', 25.286, 51.531, 'QA', 'qa-gisqatar-cadastre-plots'],
    ];
    for (const [name, lat, lon, regionCode, providerId] of cases) {
        it(`${name} → ${regionCode} (${providerId}) first`, () => {
            const top = resolveParcelCandidates(lat, lon)[0];
            expect(top, `${name} matched no jurisdiction`).toBeDefined();
            expect(top!.regionCode).toBe(regionCode);
            expect(top!.providerId).toBe(providerId);
        });
    }

    it('each ME region code is registered exactly once', () => {
        const all = listParcelJurisdictions().map((j) => j.regionCode);
        for (const cc of ['TR', 'IL', 'QA']) {
            expect(all.filter((c) => c === cc), `${cc} row count`).toHaveLength(1);
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE SAUDI-BBOX OVERLAP — QA/IL win Doha/Tel-Aviv ahead of the SA footprint, by SPECIFICITY.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('ME-OPEN §2 — QA/IL sit inside SAUDI_ARABIA_BBOX and outrank the SA footprint', () => {
    it('Doha offers [QA, SA] in that order — the cadastre first, the SA footprint as fall-through', () => {
        expect(codes(25.286, 51.531)).toEqual(['QA', 'SA']);
        expect(parcelJurisdictionSpecificity(row('QA'))).toBeLessThan(parcelJurisdictionSpecificity(row('SA')));
    });

    it('Tel Aviv offers [IL, SA] in that order (Tel Aviv 32.08 N is inside the Saudi box)', () => {
        expect(codes(32.0783, 34.778)).toEqual(['IL', 'SA']);
        expect(parcelJurisdictionSpecificity(row('IL'))).toBeLessThan(parcelJurisdictionSpecificity(row('SA')));
    });

    it('Istanbul is NOT inside the Saudi box, so it offers TR alone', () => {
        expect(codes(40.9819, 29.0576)).toEqual(['TR']);
    });

    // The load-bearing property: the national resolver REFUSES every ME point, which is WHY the bbox
    // rows survive (a claim would filter them out). Asserted directly so the routing above is not a
    // coincidence.
    it('the national resolver REFUSES at every ME point (that refusal is what keeps the rows alive)', () => {
        for (const [lat, lon] of [[40.9819, 29.0576], [39.9042, 32.856], [32.0783, 34.778], [25.286, 51.531]] as const) {
            const v = resolveNationalJurisdiction(lat, lon);
            expect(v.ok).toBe(false);
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. ADVERSARIAL — no ME row claims foreign ground, and the SA claim is untouched.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('ME-OPEN §3 — no ME row claims a point outside its own country', () => {
    it('Riyadh + Jeddah still route to SA (a national CLAIM filters the ME rows out entirely)', () => {
        for (const [lat, lon] of [[24.7136, 46.6753], [21.4858, 39.1925]] as const) {
            const ordered = codes(lat, lon);
            expect(ordered[0]).toBe('SA');
            for (const cc of ['TR', 'IL', 'QA']) expect(ordered).not.toContain(cc);
            expect(resolveParcelJurisdiction(lat, lon).regionCode).toBe('SA');
        }
    });

    const foreign: ReadonlyArray<[string, number, number]> = [
        ['Barcelona', 41.3915, 2.1649],
        ['Paris', 48.8566, 2.3522],
        ['New York City', 40.7128, -74.006],
        ['Nicosia (Cyprus — not modelled)', 35.1856, 33.3823],
    ];
    for (const [name, lat, lon] of foreign) {
        it(`${name} is claimed by NONE of TR/IL/QA`, () => {
            const ordered = codes(lat, lon);
            for (const cc of ['TR', 'IL', 'QA']) {
                expect(ordered, `${cc} must not claim ${name}`).not.toContain(cc);
            }
        });
    }

    it('the ME `contains` predicates are total: NaN / Infinity / junk return false, never throw', () => {
        for (const cc of ['TR', 'IL', 'QA']) {
            const c = row(cc).contains;
            expect(() => c(Number.NaN, 0)).not.toThrow();
            expect(c(Number.NaN, 0)).toBe(false);
            expect(c(0, Number.POSITIVE_INFINITY)).toBe(false);
            expect((c as (a: unknown, b: unknown) => boolean)('x', undefined)).toBe(false);
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. HONESTY OF THE ROW ITSELF — kind matches the measured access state (§CONTEXT-DATA-HONESTY).
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('ME-OPEN §4 — each row declares the access state its probe measured', () => {
    it('TR/IL/QA are cadastral (keyless, live-probed) each with its own unique proxy seat', () => {
        const expected: ReadonlyArray<[string, string]> = [
            ['TR', '/api/parcel/tr'],
            ['IL', '/api/parcel/il'],
            ['QA', '/api/parcel/qa'],
        ];
        for (const [cc, proxyPath] of expected) {
            expect(row(cc).kind).toBe('cadastral');
            expect(row(cc).proxyPath).toBe(proxyPath);
            expect(row(cc).note).toMatch(/VERIFIED-LIVE 2026-09-02/);
        }
    });

    it('every note is honest about the UNREAD licence (YELLOW) and the un-wired proxy', () => {
        for (const cc of ['TR', 'IL', 'QA']) {
            expect(row(cc).note).toMatch(/LICENCE UNREAD \(YELLOW\)/);
            expect(row(cc).note).toMatch(/not yet wired server-side/);
        }
    });

    it('every registered proxyPath is still unique after this batch (no two rows share a route)', () => {
        const paths = listParcelJurisdictions()
            .map((j) => j.proxyPath)
            .filter((p): p is string => p !== null);
        expect(new Set(paths).size).toBe(paths.length);
    });

    it('every ME row has a finite specificity (none can silently sort last)', () => {
        for (const cc of ['TR', 'IL', 'QA']) {
            expect(Number.isFinite(parcelJurisdictionSpecificity(row(cc))), `${cc}`).toBe(true);
        }
    });
});
