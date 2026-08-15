// D2.4 — `validateApartmentEnvelope` pure validator
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29 §9.2 D2.4).
//
// Apartment-LEVEL gross-area sanity (framework §3.1). Runs PRE-D-TGL so we
// can refuse to generate when the shell + program is architecturally absurd
// (e.g. a 200 m² 1-bedroom or a 35 m² 3-bedroom).
//
// Returns a DimensionalValidation; the trigger (e.g. apartmentLayoutTrigger.ts)
// surfaces a single error toast on HARD-REJECT with the specific reason.

import { apartmentDimensionsFor } from './roomDimensions.js';
import type { DimensionalValidation, ValidationFinding } from './types.js';

export interface ApartmentEnvelopeInput {
    /** The count actually being VALIDATED — after §ENVELOPE-FIT-GROWTH has
     *  scaled the programme to the shell. Usually NOT what the user asked for. */
    readonly bedrooms: number;
    /** Gross internal area of the shell in m². */
    readonly grossAreaM2: number;
    /**
     * L-911 (C73 §4.4) — the count the USER asked for, when the caller knows
     * it. A refusal must carry BOTH numbers: what was asked, and what fits.
     * The founder asked for 3, the growth loop escalated to 5, and the only
     * sentence anyone produced named 5 — so the message read as though the
     * engine were answering a question he never put. Omitted ⇒ the reason is
     * byte-identical to the pre-L-911 wording for the requested==validated
     * case, which is every existing caller that does not pass it.
     */
    readonly requestedBedrooms?: number;
}

/**
 * Validate an apartment's gross-area envelope against the §3.1 table.
 *
 * HARD-REJECT below grossMin or above grossMax for the bedroom count.
 * SOFT penalties outside the target ± 25 % band.
 */
export function validateApartmentEnvelope(input: ApartmentEnvelopeInput): DimensionalValidation {
    const d = apartmentDimensionsFor(input.bedrooms);
    const hard: ValidationFinding[] = [];
    const soft: ValidationFinding[] = [];
    const beds = Math.max(0, Math.floor(input.bedrooms));
    const apartmentId = `apartment-${beds}bed`;

    if (!(input.grossAreaM2 > 0)) {
        return {
            admissible: false,
            hardFindings: [{
                roomId: apartmentId, severity: 'hard', metric: 'grossDegenerate',
                reason: `apartment has non-positive gross area`,
                delta: 1.0,
            }],
            softFindings: [],
        };
    }

    if (input.grossAreaM2 < d.grossMin - 1e-6) {
        // L-911, same class as the grossMax hint below: "fewer bedrooms" is
        // not advice you can act on at zero. A studio under the floor needs a
        // bigger shell, full stop.
        const hint = beds > 0
            ? `shell too narrow for ${beds} bedrooms — try widening or fewer bedrooms`
            : `this shell is smaller than the smallest dwelling the §3.1 table describes (a studio needs ${d.grossMin} m²) — draw a larger shell`;
        hard.push({
            roomId: apartmentId, severity: 'hard', metric: 'grossMin', delta: 1.0,
            reason: `${beds}-bedroom apartment gross ${input.grossAreaM2.toFixed(1)} m² < hard min ${d.grossMin} m² (${hint})`,
        });
    }
    if (input.grossAreaM2 > d.grossMax + 1e-6) {
        // L-911 — THE PARENTHETICAL USED TO READ BACKWARDS. "(more bedrooms
        // make sense for this shell)" was printed while REFUSING a shell for
        // being too big at a count that is ALREADY the top of the §3.1 table:
        // there are no more bedrooms to add, and the advice sent the user back
        // into the loop that produced the refusal. It is sound advice only
        // while a HIGHER count genuinely buys more area — so ask the table.
        const headroom = apartmentDimensionsFor(beds + 1).grossMax > d.grossMax;
        const hint = headroom
            ? 'more bedrooms make sense for this shell'
            : `this shell is larger than any apartment the §3.1 table describes (the biggest is ${d.grossMax} m²) — ` +
              'split it into separate units, or generate a residential building instead of one apartment';
        // C73 §4.4 — both numbers. "invalid" is a shrug; a refusal names what
        // was asked AND what fits.
        const askedPrefix =
            typeof input.requestedBedrooms === 'number' && Math.floor(input.requestedBedrooms) !== beds
                ? `you asked for ${Math.max(0, Math.floor(input.requestedBedrooms))} bedroom` +
                  `${Math.floor(input.requestedBedrooms) === 1 ? '' : 's'}; sized to ${beds} for this shell — `
                : '';
        hard.push({
            roomId: apartmentId, severity: 'hard', metric: 'grossMax', delta: 1.0,
            reason: `${askedPrefix}${beds}-bedroom apartment gross ${input.grossAreaM2.toFixed(1)} m² > hard max ${d.grossMax} m² (${hint})`,
        });
    }

    if (hard.length === 0) {
        // Soft penalties: ±25 % around the target.
        const targetLow = d.grossTarget * 0.75;
        const targetHigh = d.grossTarget * 1.25;
        if (input.grossAreaM2 < targetLow) {
            const range = Math.max(1e-6, targetLow - d.grossMin);
            const delta = Math.min(1, (targetLow - input.grossAreaM2) / range);
            soft.push({
                roomId: apartmentId, severity: 'soft', metric: 'grossTarget', delta,
                reason: `${beds}-bed apartment gross ${input.grossAreaM2.toFixed(1)} m² is tight (target ~${d.grossTarget} m²)`,
            });
        } else if (input.grossAreaM2 > targetHigh) {
            const range = Math.max(1e-6, d.grossMax - targetHigh);
            const delta = Math.min(1, (input.grossAreaM2 - targetHigh) / range);
            soft.push({
                roomId: apartmentId, severity: 'soft', metric: 'grossTarget', delta,
                reason: `${beds}-bed apartment gross ${input.grossAreaM2.toFixed(1)} m² is generous (target ~${d.grossTarget} m²)`,
            });
        }
    }

    return {
        admissible: hard.length === 0,
        hardFindings: hard,
        softFindings: soft,
    };
}
