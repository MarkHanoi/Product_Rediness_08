// O.12.c — structured-brief → apartment program mapper tests.
//
// Locks the field-id → request-param map + the graceful fallback (absent /
// ill-typed fields are skipped so the caller's DEFAULT_PROGRAM is preserved).
// Pure + total, so it runs in plain Node (apps/editor vitest env is 'node').

import { describe, expect, it } from 'vitest';
import {
    resolveApartmentBrief,
    APARTMENT_BRIEF_FIELD_IDS,
} from '../src/ui/apartment-layout/briefToProgram.js';

describe('resolveApartmentBrief (O.12.c — structured brief, no NLP parse)', () => {
    it('maps the full apartment brief by field id', () => {
        const { programOverride, extras } = resolveApartmentBrief({
            bedrooms: 3,
            bathrooms: 2,
            openPlanKitchenDining: false,
            masterEnSuite: true,
            targetAreaM2: 95,
            style: 'minimal',
            notes: 'home office please',
        });
        expect(programOverride).toEqual({
            bedrooms: 3,
            bathrooms: 2,
            openPlanKitchenDining: false,
            masterEnSuite: true,
        });
        expect(extras).toEqual({
            targetAreaM2: 95,
            styleHint: 'minimal',
            notes: 'home office please',
        });
    });

    it('returns an EMPTY override for an absent / empty brief (graceful fallback)', () => {
        expect(resolveApartmentBrief(undefined).programOverride).toEqual({});
        expect(resolveApartmentBrief(null).programOverride).toEqual({});
        expect(resolveApartmentBrief({}).programOverride).toEqual({});
        expect(resolveApartmentBrief({}).extras).toEqual({});
    });

    it('only overrides the fields the brief actually set (partial)', () => {
        const { programOverride } = resolveApartmentBrief({ bedrooms: 4 });
        expect(programOverride).toEqual({ bedrooms: 4 });
        // bathrooms / flags omitted ⇒ NOT present (caller keeps DEFAULT_PROGRAM)
        expect('bathrooms' in programOverride).toBe(false);
        expect('masterEnSuite' in programOverride).toBe(false);
    });

    it('clamps bedroom / bathroom counts to the manifest bounds', () => {
        expect(resolveApartmentBrief({ bedrooms: 99 }).programOverride.bedrooms).toBe(5);
        expect(resolveApartmentBrief({ bedrooms: 0 }).programOverride.bedrooms).toBe(1);
        expect(resolveApartmentBrief({ bathrooms: 99 }).programOverride.bathrooms).toBe(3);
        expect(resolveApartmentBrief({ bathrooms: 0 }).programOverride.bathrooms).toBe(1);
    });

    it('coerces stringified primitives (the picker / form emits strings)', () => {
        const { programOverride, extras } = resolveApartmentBrief({
            bedrooms: '2',
            masterEnSuite: 'true',
            openPlanKitchenDining: 'no',
            targetAreaM2: '70',
        });
        expect(programOverride).toEqual({
            bedrooms: 2,
            masterEnSuite: true,
            openPlanKitchenDining: false,
        });
        expect(extras.targetAreaM2).toBe(70);
    });

    it('ignores ill-typed / non-positive values', () => {
        const { programOverride, extras } = resolveApartmentBrief({
            bedrooms: 'lots',
            targetAreaM2: -5,
            style: '   ',
            notes: '',
        });
        expect(programOverride).toEqual({});
        expect(extras).toEqual({});
    });

    it('field ids match the manifest / ApartmentProgram keys', () => {
        // Guards the single-source-of-truth contract: the ids the RAC + picker
        // capture against must be exactly these.
        expect(APARTMENT_BRIEF_FIELD_IDS).toMatchObject({
            bedrooms: 'bedrooms',
            bathrooms: 'bathrooms',
            openPlanKitchenDining: 'openPlanKitchenDining',
            masterEnSuite: 'masterEnSuite',
            targetAreaM2: 'targetAreaM2',
            style: 'style',
            notes: 'notes',
        });
    });
});
