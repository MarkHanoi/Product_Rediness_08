// D2.4 — `validateApartmentEnvelope` tests
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29 §9.2).

import { describe, expect, it } from 'vitest';
import { validateApartmentEnvelope } from
    '../src/workflows/apartmentLayout/dimensions/validateApartmentEnvelope.js';

describe('validateApartmentEnvelope — apartment-level gross sanity (§3.1)', () => {
    describe('happy paths land cleanly', () => {
        it('a 38 m² studio is admissible with no findings', () => {
            const v = validateApartmentEnvelope({ bedrooms: 0, grossAreaM2: 38 });
            expect(v.admissible).toBe(true);
            expect(v.hardFindings.length).toBe(0);
            expect(v.softFindings.length).toBe(0);
        });

        it('a 85 m² 2-bedroom is admissible at the target', () => {
            const v = validateApartmentEnvelope({ bedrooms: 2, grossAreaM2: 85 });
            expect(v.admissible).toBe(true);
            expect(v.softFindings.length).toBe(0);
        });

        it('a 150 m² 4-bedroom is admissible at the target', () => {
            const v = validateApartmentEnvelope({ bedrooms: 4, grossAreaM2: 150 });
            expect(v.admissible).toBe(true);
        });
    });

    describe('HARD rejections', () => {
        it('rejects a 35 m² 3-bedroom (gross < hard min 85)', () => {
            const v = validateApartmentEnvelope({ bedrooms: 3, grossAreaM2: 35 });
            expect(v.admissible).toBe(false);
            expect(v.hardFindings.some(f => f.metric === 'grossMin')).toBe(true);
            expect(v.hardFindings[0]!.reason).toMatch(/too narrow|fewer bedrooms/i);
        });

        it('rejects a 200 m² 1-bedroom (gross > hard max 80)', () => {
            const v = validateApartmentEnvelope({ bedrooms: 1, grossAreaM2: 200 });
            expect(v.admissible).toBe(false);
            expect(v.hardFindings.some(f => f.metric === 'grossMax')).toBe(true);
            expect(v.hardFindings[0]!.reason).toMatch(/more bedrooms/i);
        });

        it('rejects degenerate non-positive area', () => {
            const v = validateApartmentEnvelope({ bedrooms: 2, grossAreaM2: 0 });
            expect(v.admissible).toBe(false);
            expect(v.hardFindings[0]!.metric).toBe('grossDegenerate');
        });
    });

    describe('SOFT penalties (admissible but not at target)', () => {
        it('soft-penalises a tight 2-bedroom (62 m² is below target ±25 % band)', () => {
            // target 85; soft band is 63.75–106.25. 62 < 63.75 → soft penalty.
            const v = validateApartmentEnvelope({ bedrooms: 2, grossAreaM2: 62 });
            expect(v.admissible).toBe(true);
            expect(v.softFindings.some(f => f.metric === 'grossTarget')).toBe(true);
            expect(v.softFindings[0]!.reason).toMatch(/tight/i);
        });

        it('soft-penalises a generous 2-bedroom (115 m² above target ±25 % band)', () => {
            const v = validateApartmentEnvelope({ bedrooms: 2, grossAreaM2: 115 });
            expect(v.admissible).toBe(true);
            expect(v.softFindings.some(f => f.metric === 'grossTarget')).toBe(true);
            expect(v.softFindings[0]!.reason).toMatch(/generous/i);
        });
    });

    describe('clamps above 4 bedrooms to the 4-bedroom envelope', () => {
        it('a 5-bedroom apartment with 150 m² admits cleanly (clamps to 4-bed envelope)', () => {
            const v = validateApartmentEnvelope({ bedrooms: 5, grossAreaM2: 150 });
            expect(v.admissible).toBe(true);
        });
    });

    describe('finding delta is in [0, 1]', () => {
        it.each([
            { bedrooms: 2, grossAreaM2: 62 },   // soft below
            { bedrooms: 2, grossAreaM2: 115 },  // soft above
            { bedrooms: 1, grossAreaM2: 200 },  // hard above
            { bedrooms: 3, grossAreaM2: 35 },   // hard below
        ])('delta in [0,1] for bedrooms=$bedrooms, gross=$grossAreaM2', (input) => {
            const v = validateApartmentEnvelope(input);
            for (const f of [...v.hardFindings, ...v.softFindings]) {
                expect(f.delta).toBeGreaterThanOrEqual(0);
                expect(f.delta).toBeLessThanOrEqual(1);
            }
        });
    });
});
