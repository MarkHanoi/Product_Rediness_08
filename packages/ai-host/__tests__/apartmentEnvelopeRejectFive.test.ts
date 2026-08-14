// L-911 defect (2) — WHERE DOES "5" COME FROM?
//
// The founder asked for 3 bedrooms (see the sibling brief-count suite) and the
// console then said:
//
//   [apartment-layout] §D3.5 envelope reject: 5-bedroom apartment gross
//   322.5 m² > hard max 220 m² (more bedrooms make sense for this shell)
//
// Three numbers, none of them his. This suite MEASURES the third one rather
// than reasoning about it: it drives the real `scaleProgramToShell` and the
// real `validateApartmentEnvelope` with the founder's own shell area and
// reproduces the console line character-for-character.
//
// THE MECHANISM (executed below):
//   • §ENVELOPE-FIT-GROWTH (bubbleGraph.ts) grows the bedroom count one at a
//     time while the shell EXCEEDS that count's §3.1 grossMax — bounded by
//     MAX_BEDROOMS_SINGLE = 5. On a 322.5 m² shell it walks 2→3→4→5 and stops
//     at the CEILING, not at a fit.
//   • enumerate.ts §D3.5 then validates that SCALED count. 322.5 m² still
//     exceeds the 5-bed envelope (which clamps to the 4-bed row, grossMax
//     220), so it hard-rejects and prints the ESCALATION'S LAST ATTEMPT.
//   • So "5" is a CEILING, not a request, and it is reported without ever
//     naming what the user asked for. It is an ESCALATION LOOP reporting its
//     last attempt — the first of the two hypotheses in the L-911 entry.
//   • It is NOT the requested count in disguise: the growth floor is
//     max(asked, round(area/130)), so asking for 3 lands on the same 5. The
//     shell is simply larger than any apartment the §3.1 table describes.

import { describe, it, expect } from 'vitest';
import { scaleProgramToShell } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { validateApartmentEnvelope } from '../src/workflows/apartmentLayout/dimensions/validateApartmentEnvelope.js';
import type { ApartmentProgram } from '../src/workflows/apartmentLayout/types.js';

/** The founder's shell, from the 2026-08-14 console. */
const FOUNDER_SHELL_M2 = 322.5;

const programOf = (bedrooms: number, bathrooms = 1): ApartmentProgram => ({
    bedrooms, bathrooms, masterEnSuite: false,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
});

describe('L-911 (2) — the "5" is the growth CEILING, not anybody\'s request', () => {
    it('the DEFAULT 2-bed brief is grown to 5 on the founder\'s 322.5 m² shell', () => {
        expect(scaleProgramToShell(programOf(2), FOUNDER_SHELL_M2).bedrooms).toBe(5);
    });

    it('the count the founder ASKED FOR lands on the same 5 — growth ignores the ask', () => {
        // The parser fix (defect 1) makes 3 reach the brief. It does NOT change
        // this outcome, and saying so is the point: two separable defects.
        expect(scaleProgramToShell(programOf(3), FOUNDER_SHELL_M2).bedrooms).toBe(5);
        expect(scaleProgramToShell(programOf(4), FOUNDER_SHELL_M2).bedrooms).toBe(5);
    });

    it('5 is the CEILING — the loop stops there without ever fitting', () => {
        // If the ceiling were the reason to stop, a shell one m² over the
        // 4-bed max still reaches 5; a shell inside the 3-bed band does not.
        expect(scaleProgramToShell(programOf(2), 221).bedrooms).toBe(5);
        expect(scaleProgramToShell(programOf(2), 150).bedrooms).toBe(3);
        // …and no shell, however large, is grown past 5 (MAX_BEDROOMS_SINGLE).
        expect(scaleProgramToShell(programOf(2), 5_000).bedrooms).toBe(5);
    });

    it('THE CONSOLE LINE, reproduced from the scaled count', () => {
        const scaled = scaleProgramToShell(programOf(3), FOUNDER_SHELL_M2).bedrooms;
        const env = validateApartmentEnvelope({ bedrooms: scaled, grossAreaM2: FOUNDER_SHELL_M2 });
        expect(env.admissible).toBe(false);
        const reason = env.hardFindings[0]!.reason;
        expect(reason).toContain('5-bedroom apartment gross 322.5 m² > hard max 220 m²');
    });

    it('the refusal is CORRECT — 322.5 m² is outside the §3.1 apartment table entirely', () => {
        // Worth pinning so nobody "fixes" L-911 by loosening the gate: at every
        // count the table describes, this shell is over the hard max. The bug
        // is that the user was never told, not that the engine said no.
        for (const bedrooms of [0, 1, 2, 3, 4, 5, 6]) {
            expect(
                validateApartmentEnvelope({ bedrooms, grossAreaM2: FOUNDER_SHELL_M2 }).admissible,
                `${bedrooms}-bed`,
            ).toBe(false);
        }
    });
});
