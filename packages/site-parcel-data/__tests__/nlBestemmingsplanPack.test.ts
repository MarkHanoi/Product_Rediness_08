// L-609 — the Amsterdam bestemmingsplan PACK: schema validity, the explicit-area declaration, the
// cited refusal, and the bestemming → PermittedUse translation. Mirrors `esMadridNZ1Pack.test.ts`.
//
// The pack is a DECLARATION (all numeric fields null; the real numbers are the live maatvoering),
// so these tests pin its SHAPE + honesty: it parses, it declares `explicit-area` with the ringRef
// the resolver answers for, its refusal is a cited `source-data-unavailable` with legallyGrounded
// false (a statement about PRYZM's data path, not the law), and the bestemming map never invents.

import { describe, it, expect } from 'vitest';
import { JurisdictionZoningContractSchema, EnvelopeRefusalSchema } from '@pryzm/schemas';
import {
    NL_BESTEMMINGSPLAN_PACK,
    NL_RULE,
    NL_ZONE_CODE,
    NL_JURISDICTION_ID,
    NL_RING_REF,
    bestemmingToPermittedUse,
    nlBestemmingsplanRefusal,
    isInAmsterdam,
} from '../src/index.js';

describe('NL_BESTEMMINGSPLAN_PACK — the declaration', () => {
    it('parses against the JurisdictionZoningContract schema', () => {
        expect(() =>
            JurisdictionZoningContractSchema.parse(NL_BESTEMMINGSPLAN_PACK),
        ).not.toThrow();
    });

    it('declares an explicit-area rule whose ringRef equals the resolver handle (no drift)', () => {
        expect(NL_RULE.kind).toBe('explicit-area');
        if (NL_RULE.kind === 'explicit-area') {
            expect(NL_RULE.ringRef).toBe(NL_RING_REF);
        }
        const zone = NL_BESTEMMINGSPLAN_PACK.zones.find((z) => z.code === NL_ZONE_CODE);
        expect(zone).toBeDefined();
        expect(zone!.geometricRule).toEqual(NL_RULE);
    });

    it('⚠ every numeric field is null — the pack asserts NO number (the maatvoering is live)', () => {
        const zone = NL_BESTEMMINGSPLAN_PACK.zones[0]!;
        expect(zone.maxHeight_m).toBeNull();
        expect(zone.maxFloors).toBeNull();
        expect(zone.plotRatioFAR).toBeNull();
        expect(zone.maxCoverage).toBeNull();
        expect(zone.setbacks).toEqual({ front_m: null, side_m: null, rear_m: null });
    });

    it('has the national NL jurisdiction id + estimated-ruleset default confidence', () => {
        expect(NL_BESTEMMINGSPLAN_PACK.jurisdictionId).toBe(NL_JURISDICTION_ID);
        expect(NL_JURISDICTION_ID).toBe('nl-bestemmingsplan');
        expect(NL_BESTEMMINGSPLAN_PACK.defaultConfidence).toBe('estimated-ruleset');
    });
});

describe('nlBestemmingsplanRefusal — the cited, honest refusal (the shipping state)', () => {
    it('is a valid EnvelopeRefusal, source-data-unavailable, legallyGrounded false', () => {
        const r = nlBestemmingsplanRefusal();
        expect(() => EnvelopeRefusalSchema.parse(r)).not.toThrow();
        expect(r.code).toBe('source-data-unavailable'); // transient — the data path, not the law
        expect(r.legallyGrounded).toBe(false);
        expect(r.ordinanceRef).toBeTruthy(); // the ONE legal claim (NL publishes the bouwvlak) is cited
    });

    it('names the plan when one is known (never a fabricated number in its place)', () => {
        const r = nlBestemmingsplanRefusal('Amsterdam Zuidas');
        expect(r.headline).toContain('Amsterdam Zuidas');
        // No numeric allowance anywhere in the refusal — it declines, it does not estimate.
        expect(r.detail).toMatch(/decline|no number/i);
    });
});

describe('bestemmingToPermittedUse — direct translation, never a guess', () => {
    it('maps the common bestemmingen onto the closed vocabulary', () => {
        expect(bestemmingToPermittedUse('Wonen')).toBe('residential');
        expect(bestemmingToPermittedUse('Wonen - 1')).toBe('residential');
        expect(bestemmingToPermittedUse('Gemengd - 2')).toBe('mixed');
        expect(bestemmingToPermittedUse('Centrum')).toBe('mixed');
        expect(bestemmingToPermittedUse('Bedrijf')).toBe('industrial');
        expect(bestemmingToPermittedUse('Kantoor')).toBe('commercial');
        expect(bestemmingToPermittedUse('Maatschappelijk')).toBe('civic');
        expect(bestemmingToPermittedUse('Groen')).toBe('green');
    });
    it('an unrecognised bestemming → "other" (honest), and empty/absent → null', () => {
        expect(bestemmingToPermittedUse('Waterstaat - Waterkering')).toBe('other');
        expect(bestemmingToPermittedUse('')).toBeNull();
        expect(bestemmingToPermittedUse(null)).toBeNull();
    });
});

describe('isInAmsterdam — the coarse jurisdiction gate', () => {
    it('accepts a central-Amsterdam point and rejects a far-away one', () => {
        expect(isInAmsterdam(52.3676, 4.9041)).toBe(true); // Amsterdam centre
        expect(isInAmsterdam(40.4168, -3.7038)).toBe(false); // Madrid
        expect(isInAmsterdam(Number.NaN, 4.9)).toBe(false);
    });
});
