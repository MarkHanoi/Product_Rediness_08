// Residential building — Slice 0 / P1.A — §5.1 input-model acceptance test.
import { describe, expect, it } from 'vitest';
import {
    ResidentialBuildingInput,
    parseResidentialBuildingInput,
    enabledTypologies,
} from '../src/inputModel.js';

describe('ResidentialBuildingInput (§5.1)', () => {
    it('parses sane defaults', () => {
        const v = ResidentialBuildingInput.parse({});
        expect(v.minApartmentAreaM2).toBe(45);
        expect(v.maxApartmentAreaM2).toBe(120);
        expect(v.levels).toBe(4);
        expect(v.commercialGroundFloor).toBe(true);
        expect(enabledTypologies(v)).toEqual(['T2', 'T3']);
    });

    it('rejects min > max (HARD band invariant)', () => {
        expect(() =>
            ResidentialBuildingInput.parse({ minApartmentAreaM2: 150, maxApartmentAreaM2: 100 }),
        ).toThrow(/min.*max/i);
    });

    it('rejects an empty typology set', () => {
        expect(() =>
            ResidentialBuildingInput.parse({
                typologies: { T1: false, T2: false, T3: false, T4: false },
            }),
        ).toThrow(/at least one apartment typology/i);
    });

    it('caps levels at 20', () => {
        expect(() => ResidentialBuildingInput.parse({ levels: 21 })).toThrow();
        expect(ResidentialBuildingInput.parse({ levels: 20 }).levels).toBe(20);
    });
});

describe('parseResidentialBuildingInput (brief → typed input)', () => {
    it('folds a multiselect typology array into the {T1..T4} map', () => {
        const v = parseResidentialBuildingInput({
            minApartmentAreaM2: 40,
            maxApartmentAreaM2: 90,
            typologies: ['T1', 'T2'],
            levels: 6,
            commercialGroundFloor: false,
        });
        expect(enabledTypologies(v)).toEqual(['T1', 'T2']);
        expect(v.levels).toBe(6);
        expect(v.commercialGroundFloor).toBe(false);
    });

    it('falls back to defaults for a sparse brief', () => {
        const v = parseResidentialBuildingInput({});
        expect(enabledTypologies(v)).toEqual(['T2', 'T3']);
    });

    it('soft-rejects (throws) an invalid brief combination for the stage to catch', () => {
        expect(() =>
            parseResidentialBuildingInput({ typologies: [] }),
        ).toThrow();
    });
});
