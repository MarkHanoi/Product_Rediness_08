// L-613 — routing tests for the parcel-provider registry. PURE (no network): asserts that a
// real city point in each wired country routes to the right cadastre, that the documented-
// unreachable countries route to the footprint fallback, and that the resolver never throws.

import { describe, it, expect } from 'vitest';
import {
    resolveParcelJurisdiction,
    resolveParcelCandidates,
    resolveParcelWithFallback,
    parcelJurisdictionSpecificity,
    listParcelJurisdictions,
    UNIVERSAL_FOOTPRINT_JURISDICTION,
    type ParcelJurisdiction,
} from '../src/parcelProviders/registry.js';

describe('resolveParcelJurisdiction — cadastral routing (live-probed open cadastres)', () => {
    const cadastral: ReadonlyArray<[string, number, number, string]> = [
        ['Barcelona → Catastro', 41.3915, 2.1649, 'catastro'],
        ['Madrid → Catastro', 40.4168, -3.7038, 'catastro'],
        ['Paris → IGN', 48.8566, 2.3522, 'ign-fr'],
        ['Amsterdam → PDOK', 52.373, 4.8925, 'pdok-nl'],
        ['Oslo → Kartverket', 59.9139, 10.7522, 'geonorge-no'],
        ['Düsseldorf → ALKIS NRW', 51.2277, 6.7735, 'alkis-nrw'],
        ['Copenhagen → Matriklen (deferred stub, still routed cadastral)', 55.6761, 12.5683, 'matrikel-dk'],
        ['Zürich → swisstopo AV (federal identify, keyless)', 47.3769, 8.5417, 'swisstopo-av'],
        // L-650 Phase-4 batch (proxy-pending → route cadastral now, fetch falls to OSM until wired).
        ['Rome → Agenzia Entrate (national INSPIRE cadastre)', 41.9028, 12.4964, 'agenzia-entrate'],
        ['Antwerp → GRB (Flanders, before NL+FR)', 51.2194, 4.4025, 'flanders-grb'],
        ['Helsinki → MML (Finland, before NO which encloses it)', 60.1699, 24.9384, 'mml'],
        ['London → HMLR INSPIRE (England, before FR)', 51.5074, -0.1278, 'gb-os-inspire'],
        ['New York City → MapPLUTO (no overlap with any box)', 40.7128, -74.006, 'nyc-pluto'],
    ];
    for (const [name, lat, lon, providerId] of cadastral) {
        it(name, () => {
            const j = resolveParcelJurisdiction(lat, lon);
            expect(j.providerId).toBe(providerId);
            expect(j.kind).toBe('cadastral');
            expect(j.proxyPath).toBeTruthy();
        });
    }
});

describe('resolveParcelJurisdiction — documented footprint-fallback jurisdictions', () => {
    const fallback: ReadonlyArray<[string, number, number, string]> = [
        ['Munich (non-NRW Germany)', 48.1351, 11.582, 'DE'],
        ['Riyadh (SA geo-fenced)', 24.7136, 46.6753, 'SA'],
    ];
    for (const [name, lat, lon, regionCode] of fallback) {
        it(name, () => {
            const j = resolveParcelJurisdiction(lat, lon);
            expect(j.kind).toBe('footprint-fallback');
            expect(j.regionCode).toBe(regionCode);
            expect(j.proxyPath).toBeNull();
            expect(j.providerId).toBe('footprint');
        });
    }
});

describe('resolveParcelJurisdiction — universal footprint + never-throws', () => {
    // L-651: Chicago USED to be the "no US cadastre beyond NYC" example. It now has a live Cook
    // County row, so the example moved to Denver — a US city with no wired parcel source. (The US has
    // no national cadastre, so it is wired city by city; every unwired city still lands here.)
    it('a US point in an unwired city (Denver) routes to the universal footprint', () => {
        const j = resolveParcelJurisdiction(39.7392, -104.9903);
        expect(j).toBe(UNIVERSAL_FOOTPRINT_JURISDICTION);
        expect(j.kind).toBe('footprint-fallback');
    });
    it('Chicago now routes to the Cook County cadastre (L-651 wired it)', () => {
        expect(resolveParcelJurisdiction(41.8781, -87.6298).providerId).toBe('chicago-cook');
    });
    it('mid-ocean routes to the universal footprint', () => {
        expect(resolveParcelJurisdiction(0, -30)).toBe(UNIVERSAL_FOOTPRINT_JURISDICTION);
    });
    it('never throws on NaN / Infinity / garbage', () => {
        expect(() => resolveParcelJurisdiction(NaN, 0)).not.toThrow();
        expect(() => resolveParcelJurisdiction(0, Infinity)).not.toThrow();
        expect(resolveParcelJurisdiction(NaN, NaN)).toBe(UNIVERSAL_FOOTPRINT_JURISDICTION);
        // @ts-expect-error — hostile input must still not throw.
        expect(() => resolveParcelJurisdiction('x', undefined)).not.toThrow();
    });
    it('NRW precedes the whole-Germany footprint entry (order matters)', () => {
        // Düsseldorf is in both NRW_BBOX and GERMANY_BBOX; the cadastral entry must win.
        expect(resolveParcelJurisdiction(51.2277, 6.7735).providerId).toBe('alkis-nrw');
    });
    it('Zürich escapes FRANCE_BBOX (maxLon 8.3°) and routes to the Swiss AV cadastre', () => {
        // 8.5417°E is east of France's eastern edge, so FR does not swallow it — CH wins.
        expect(resolveParcelJurisdiction(47.3769, 8.5417).providerId).toBe('swisstopo-av');
    });
    it('Geneva: the legacy single verdict stays FR (first-match), but the real dispatch offers CH alone', () => {
        // 6.14°E, 46.20°N is inside BOTH FRANCE_BBOX and SWITZERLAND_BBOX. The legacy single-verdict
        // `resolveParcelJurisdiction` keeps first-match (FR precedes CH in row order) → 'ign-fr'.
        // ⚠ UPDATED 2026-09-02 (L-12871 wave): the priority resolver used to offer
        // ['swisstopo-av', 'ign-fr'] by box area; the national claim filter now removes the
        // wrong-country candidate — the resolver claims CHE, so only swisstopo AV is offered.
        expect(resolveParcelJurisdiction(46.2044, 6.1432).providerId).toBe('ign-fr');
        expect(resolveParcelCandidates(46.2044, 6.1432).map((j) => j.providerId)).toEqual([
            'swisstopo-av',
        ]);
    });
    it('lists all registered jurisdictions (cadastral + fallback)', () => {
        const codes = listParcelJurisdictions().map((j) => j.regionCode);
        expect(codes).toEqual(
            expect.arrayContaining([
                'ES', 'FR', 'NL', 'NO', 'DE-NW', 'DE', 'CH', 'DK', 'SA',
                // L-650 Phase-4 batch.
                'IT', 'BE-VLG', 'GB-ENG', 'FI', 'US-NY-NYC',
            ]),
        );
    });
});

// ── L-650 per-point PRIORITY-FALLBACK dispatch — specificity ordering + fall-through ─────────────

// ⚠ SECTION UPDATED 2026-09-02 (L-12871 wave). These four used to pin CROSS-COUNTRY candidate
// lists produced by the smallest-box rule (Kirkenes FI-then-NO, Eindhoven BE-then-NL, Calais
// GB-then-FR) and relied on each wrong-country cadastre's null to self-correct. The national
// claim filter in `resolveParcelCandidates` now removes wrong-country candidates outright:
// Kirkenes is NORWEGIAN, so Norway alone is offered. Specificity still orders SUB-NATIONAL rows
// within the claimed country (Düsseldorf: NRW before the DE footprint) — that is the one job the
// area sort keeps on a claim.
describe('resolveParcelCandidates — national claim filters, specificity orders within a country', () => {
    it('Kirkenes is Norwegian: NO alone is offered (FI is no longer tried first)', () => {
        // 69.73°N, 30.05°E is inside BOTH the Finland and Norway boxes; the CLAIM (NOR) decides.
        const ids = resolveParcelCandidates(69.7263, 30.0464).map((j) => j.providerId);
        expect(ids).toEqual(['geonorge-no']);
    });
    it('Eindhoven is Dutch: NL alone is offered (Flanders is no longer tried first)', () => {
        // 51.44°N, 5.48°E is inside FLANDERS_BBOX and NETHERLANDS_BBOX (and NOT FRANCE — lat > 51.2).
        const ids = resolveParcelCandidates(51.4416, 5.4697).map((j) => j.providerId);
        expect(ids).toEqual(['pdok-nl']);
    });
    it('Calais is French: FR alone is offered (England is no longer tried first)', () => {
        const ids = resolveParcelCandidates(50.9513, 1.8587).map((j) => j.providerId);
        expect(ids).toEqual(['ign-fr']);
    });
    it('Düsseldorf: the DEU claim keeps BOTH German rows, NRW first by specificity; NL is dropped', () => {
        const ids = resolveParcelCandidates(51.2277, 6.7735).map((j) => j.providerId);
        expect(ids).toEqual(['alkis-nrw', 'footprint']);
    });
    it('a non-overlapping interior point has exactly one candidate', () => {
        expect(resolveParcelCandidates(41.9028, 12.4964).map((j) => j.providerId)).toEqual([
            'agenzia-entrate',
        ]);
    });
    it('specificity: a city/region box is strictly smaller than its enclosing national box', () => {
        // (Point moved to Düsseldorf 2026-09-02: Kirkenes now yields a single NO row, so the
        // within-country pair to compare is NRW vs the DE footprint.)
        const [nrw, de] = resolveParcelCandidates(51.2277, 6.7735);
        expect(parcelJurisdictionSpecificity(nrw!)).toBeLessThan(parcelJurisdictionSpecificity(de!));
        expect(parcelJurisdictionSpecificity(UNIVERSAL_FOOTPRINT_JURISDICTION)).toBe(
            Number.POSITIVE_INFINITY,
        );
    });
    it('never throws on garbage → empty candidate list', () => {
        expect(resolveParcelCandidates(NaN, 0)).toEqual([]);
        expect(resolveParcelCandidates(0, Infinity)).toEqual([]);
    });
});

describe('resolveParcelWithFallback — falls THROUGH a null provider to the enclosing live cadastre', () => {
    /** A fetchFor that returns a fake parcel ONLY for the given providerIds, null otherwise. */
    const answersFor =
        (...liveIds: string[]) =>
        (jur: ParcelJurisdiction): { id: string } | null =>
            liveIds.includes(jur.providerId) ? { id: jur.providerId } : null;

    it('Kirkenes: FI proxy null → resolves NO (the live Kartverket cadastre)', async () => {
        const hit = await resolveParcelWithFallback(69.7263, 30.0464, answersFor('geonorge-no'));
        expect(hit?.jurisdiction.providerId).toBe('geonorge-no');
        expect(hit?.parcel).toEqual({ id: 'geonorge-no' });
    });
    it('Eindhoven: BE (proxy-pending) null → resolves NL (the live PDOK cadastre)', async () => {
        const hit = await resolveParcelWithFallback(51.4416, 5.4697, answersFor('pdok-nl'));
        expect(hit?.jurisdiction.providerId).toBe('pdok-nl');
    });
    it('Calais: GB (proxy-pending) null → resolves FR (the live IGN cadastre)', async () => {
        const hit = await resolveParcelWithFallback(50.9513, 1.8587, answersFor('ign-fr'));
        expect(hit?.jurisdiction.providerId).toBe('ign-fr');
    });
    it('a genuine FI parcel: FI proxy answers → resolves FI (does NOT fall through)', async () => {
        const hit = await resolveParcelWithFallback(60.1699, 24.9384, answersFor('mml', 'geonorge-no'));
        expect(hit?.jurisdiction.providerId).toBe('mml');
        expect(hit?.parcel).toEqual({ id: 'mml' });
    });
    it('every provider null → returns null (caller applies the universal footprint)', async () => {
        const hit = await resolveParcelWithFallback(51.4416, 5.4697, () => null);
        expect(hit).toBeNull();
    });
    it('a throwing provider is a miss — falls through, never propagates', async () => {
        const hit = await resolveParcelWithFallback(69.7263, 30.0464, (jur) => {
            if (jur.providerId === 'mml') throw new Error('proxy 500');
            return { id: jur.providerId };
        });
        expect(hit?.jurisdiction.providerId).toBe('geonorge-no');
    });
    it('awaits async providers and respects specificity order', async () => {
        const seen: string[] = [];
        const hit = await resolveParcelWithFallback(51.2277, 6.7735, async (jur) => {
            seen.push(jur.providerId);
            return null; // force a full walk
        });
        expect(hit).toBeNull();
        // (Updated 2026-09-02: pdok-nl no longer appears — the DEU claim drops the NL row.)
        expect(seen).toEqual(['alkis-nrw', 'footprint']);
    });
    it('never throws on garbage → null', async () => {
        await expect(resolveParcelWithFallback(NaN, NaN, () => ({ id: 'x' }))).resolves.toBeNull();
    });
});
