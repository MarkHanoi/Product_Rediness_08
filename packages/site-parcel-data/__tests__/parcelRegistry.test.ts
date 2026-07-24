// L-613 — routing tests for the parcel-provider registry. PURE (no network): asserts that a
// real city point in each wired country routes to the right cadastre, that the documented-
// unreachable countries route to the footprint fallback, and that the resolver never throws.

import { describe, it, expect } from 'vitest';
import {
    resolveParcelJurisdiction,
    listParcelJurisdictions,
    UNIVERSAL_FOOTPRINT_JURISDICTION,
} from '../src/parcelProviders/registry.js';

describe('resolveParcelJurisdiction — cadastral routing (live-probed open cadastres)', () => {
    const cadastral: ReadonlyArray<[string, number, number, string]> = [
        ['Barcelona → Catastro', 41.3915, 2.1649, 'catastro'],
        ['Madrid → Catastro', 40.4168, -3.7038, 'catastro'],
        ['Paris → IGN', 48.8566, 2.3522, 'ign-fr'],
        ['Amsterdam → PDOK', 52.373, 4.8925, 'pdok-nl'],
        ['Oslo → Kartverket', 59.9139, 10.7522, 'geonorge-no'],
        ['Düsseldorf → ALKIS NRW', 51.2277, 6.7735, 'alkis-nrw'],
        ['Copenhagen → Matriklen (credential-gated, still routed cadastral)', 55.6761, 12.5683, 'matrikel-dk'],
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
        ['Zurich (CH permission-gated)', 47.3769, 8.5417, 'CH'],
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
    it('New York routes to the universal footprint (no cadastre wired)', () => {
        const j = resolveParcelJurisdiction(40.7128, -74.006);
        expect(j).toBe(UNIVERSAL_FOOTPRINT_JURISDICTION);
        expect(j.kind).toBe('footprint-fallback');
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
    it('lists all registered jurisdictions (cadastral + fallback)', () => {
        const codes = listParcelJurisdictions().map((j) => j.regionCode);
        expect(codes).toEqual(expect.arrayContaining(['ES', 'FR', 'NL', 'NO', 'DE-NW', 'DE', 'CH', 'DK', 'SA']));
    });
});
