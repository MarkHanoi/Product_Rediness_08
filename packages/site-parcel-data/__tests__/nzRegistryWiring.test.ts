// LANE NZ-EVERYWHERE (2026-09-05) — REACHABILITY + ROUTING tests for the New Zealand row added to
// `parcelProviders/registry.ts`. Every assertion starts from `resolveParcelCandidates(lat, lon)` —
// the REAL dispatch entry point — so DELETE THE ROW AND THIS FAILS (the L-651 / L-12871 discipline).
//
// ⛔ WHAT THIS PROVES / DOES NOT PROVE: routing only. No parcel has been served through
// `/api/parcel/nz` yet — LINZ is API-key gated and no key is held (server/__tests__/nzLinzParcelLeg.
// test.ts pins the leg's key gate + the measured 401/400 shapes). Until LINZ_API_KEY is set on Fly a
// real NZ click resolves 503 `unconfigured` → WfsParcelProvider null → the honest OSM footprint.

import { describe, it, expect } from 'vitest';
import {
    resolveParcelCandidates,
    resolveParcelJurisdiction,
    parcelJurisdictionSpecificity,
    listParcelJurisdictions,
    type ParcelJurisdiction,
} from '../src/parcelProviders/registry.js';
import { resolveNationalJurisdiction } from '../src/jurisdiction/nationalJurisdictionResolver.js';
import { isInNewZealand, NEW_ZEALAND_BBOX } from '../src/countryAdapters/nz/nzJurisdiction.js';

function codes(lat: number, lon: number): readonly string[] {
    return resolveParcelCandidates(lat, lon).map((j) => j.regionCode);
}
function row(regionCode: string): ParcelJurisdiction {
    const found = listParcelJurisdictions().find((j) => j.regionCode === regionCode);
    if (!found) throw new Error(`no registry row for ${regionCode}`);
    return found;
}

const NZ_CITIES: ReadonlyArray<[string, number, number]> = [
    ['Auckland', -36.8485, 174.7645],
    ['Wellington', -41.2865, 174.7762],
    ['Christchurch', -43.5321, 172.6362],
    ['Dunedin', -45.8788, 170.5028],
    ['Invercargill (Stewart Island side)', -46.4132, 168.3538],
    ['Whangārei (far north)', -35.7251, 174.3237],
];

describe('NZ reachability — the LINZ row is the FIRST (and only) candidate at every NZ city', () => {
    for (const [name, lat, lon] of NZ_CITIES) {
        it(`${name} → NZ (nz-linz-primary-parcels) alone`, () => {
            const cands = resolveParcelCandidates(lat, lon);
            expect(cands, `${name} matched no jurisdiction`).toHaveLength(1);
            expect(cands[0]!.regionCode).toBe('NZ');
            expect(cands[0]!.providerId).toBe('nz-linz-primary-parcels');
            expect(cands[0]!.proxyPath).toBe('/api/parcel/nz');
            expect(cands[0]!.kind).toBe('cadastral');
            expect(resolveParcelJurisdiction(lat, lon).regionCode).toBe('NZ');
        });
    }

    it('NZ is registered exactly once, with a finite specificity (a REGION_BBOX entry exists)', () => {
        expect(listParcelJurisdictions().filter((j) => j.regionCode === 'NZ')).toHaveLength(1);
        expect(Number.isFinite(parcelJurisdictionSpecificity(row('NZ')))).toBe(true);
    });

    it('the row note states the key gate honestly (WIRED-KEY-PENDING, 503 unconfigured, C57 §1.2)', () => {
        const note = row('NZ').note;
        expect(note).toContain('LINZ_API_KEY');
        expect(note).toContain('unconfigured');
        expect(note).toContain('50772');
        expect(note).toMatch(/No live parcel has been served/);
    });
});

describe('NZ §2 — the national resolver REFUSES every NZ point (that refusal is what keeps the bbox row alive)', () => {
    it('no-national-candidate at Auckland / Wellington / Christchurch', () => {
        for (const [, lat, lon] of NZ_CITIES.slice(0, 3)) {
            expect(resolveNationalJurisdiction(lat, lon).ok).toBe(false);
        }
    });
});

describe('NZ §3 — ADVERSARIAL: the NZ box claims no foreign ground and no AU row reaches into NZ', () => {
    const australia: ReadonlyArray<[string, number, number, string]> = [
        ['Sydney', -33.8734, 151.2066, 'AU-NSW'],
        ['Melbourne', -37.8136, 144.9631, 'AU-VIC'],
        ['Brisbane', -27.4705, 153.026, 'AU-QLD'],
        ['Hobart', -42.8821, 147.3272, 'AU-TAS'],
    ];
    for (const [name, lat, lon, expected] of australia) {
        it(`${name} → ${expected}, and NZ is not offered`, () => {
            const ordered = codes(lat, lon);
            expect(ordered[0]).toBe(expected);
            expect(ordered).not.toContain('NZ');
            expect(isInNewZealand(lat, lon)).toBe(false);
        });
    }

    it('the Chatham Islands (east of the antimeridian, ~176.5 W) are DELIBERATELY outside — matching the bake/terrain bboxes', () => {
        expect(isInNewZealand(-43.95, -176.55)).toBe(false);
        expect(codes(-43.95, -176.55)).not.toContain('NZ');
    });

    it('the routing box equals the bake/terrain bbox 166.0,-47.5,178.7,-34.3 and stays west of the antimeridian', () => {
        expect(NEW_ZEALAND_BBOX).toEqual({ minLat: -47.5, maxLat: -34.3, minLon: 166.0, maxLon: 178.7 });
        expect(NEW_ZEALAND_BBOX.maxLon).toBeLessThanOrEqual(180);
    });

    it('isInNewZealand is pure: NaN / Infinity never route (and never throw)', () => {
        expect(isInNewZealand(NaN, 174.7)).toBe(false);
        expect(isInNewZealand(-36.8, Infinity)).toBe(false);
    });
});
