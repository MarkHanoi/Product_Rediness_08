// L-911 defect (3), first half — WHAT THE REFUSAL SAYS.
//
// The founder's console line was:
//   "5-bedroom apartment gross 322.5 m² > hard max 220 m²
//    (more bedrooms make sense for this shell)"
// …printed while REFUSING the shell for being TOO BIG, at a count that is
// already the top of the §3.1 table. The advice was backwards, and the only
// count named was one nobody asked for.
//
// C73 §4.4: a refusal carries BOTH numbers — what was asked, and what fits.

import { describe, it, expect } from 'vitest';
import { validateApartmentEnvelope } from
    '../src/workflows/apartmentLayout/dimensions/validateApartmentEnvelope.js';

const reasonOf = (i: Parameters<typeof validateApartmentEnvelope>[0]): string => {
    const v = validateApartmentEnvelope(i);
    expect(v.admissible).toBe(false);
    return v.hardFindings[0]!.reason;
};

describe('L-911 (3) — the over-max refusal states both numbers and gives actionable advice', () => {
    it("THE FOUNDER'S CASE — asked 3, sized 5, and the sentence says so", () => {
        const reason = reasonOf({ bedrooms: 5, grossAreaM2: 322.5, requestedBedrooms: 3 });
        expect(reason).toContain('you asked for 3 bedrooms');
        expect(reason).toContain('sized to 5 for this shell');
        expect(reason).toContain('322.5 m² > hard max 220 m²');
    });

    it('THE BACKWARDS PARENTHETICAL IS GONE at the top of the table', () => {
        const reason = reasonOf({ bedrooms: 5, grossAreaM2: 322.5, requestedBedrooms: 3 });
        expect(reason).not.toMatch(/more bedrooms make sense/i);
        // …and what replaces it is something the user can act on.
        expect(reason).toMatch(/larger than any apartment/i);
        expect(reason).toMatch(/split it into separate units|residential building/i);
    });

    it('"more bedrooms" survives where it is TRUE — a 1-bed in 200 m² has headroom', () => {
        // The old wording was not wrong everywhere; it was wrong at the ceiling.
        expect(reasonOf({ bedrooms: 1, grossAreaM2: 200 })).toMatch(/more bedrooms make sense/i);
        expect(reasonOf({ bedrooms: 3, grossAreaM2: 200 })).toMatch(/more bedrooms make sense/i);
    });

    it('the under-min hint never tells a STUDIO to drop bedrooms it does not have', () => {
        const reason = reasonOf({ bedrooms: 0, grossAreaM2: 12 });
        expect(reason).not.toMatch(/fewer bedrooms/i);
        expect(reason).toMatch(/larger shell/i);
        // The bedroom-bearing case keeps its (correct) advice.
        expect(reasonOf({ bedrooms: 3, grossAreaM2: 35 })).toMatch(/fewer bedrooms/i);
    });

    it('CONTROL — no asked-count, or an unscaled one, adds no prefix', () => {
        expect(reasonOf({ bedrooms: 5, grossAreaM2: 322.5 })).not.toMatch(/you asked for/i);
        // Requested === validated: there is nothing to reconcile, so saying
        // "you asked for 5; sized to 5" would be noise, not honesty.
        expect(reasonOf({ bedrooms: 5, grossAreaM2: 322.5, requestedBedrooms: 5 }))
            .not.toMatch(/you asked for/i);
    });

    it('CONTROL — an admissible shell produces no finding at all', () => {
        const v = validateApartmentEnvelope({ bedrooms: 3, grossAreaM2: 115, requestedBedrooms: 3 });
        expect(v.admissible).toBe(true);
        expect(v.hardFindings.length).toBe(0);
    });
});
