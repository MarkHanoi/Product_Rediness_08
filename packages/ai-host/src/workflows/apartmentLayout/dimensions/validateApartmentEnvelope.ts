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
    readonly bedrooms: number;
    /** Gross internal area of the shell in m². */
    readonly grossAreaM2: number;
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
        hard.push({
            roomId: apartmentId, severity: 'hard', metric: 'grossMin', delta: 1.0,
            reason: `${beds}-bedroom apartment gross ${input.grossAreaM2.toFixed(1)} m² < hard min ${d.grossMin} m² (shell too narrow for ${beds} bedrooms — try widening or fewer bedrooms)`,
        });
    }
    if (input.grossAreaM2 > d.grossMax + 1e-6) {
        hard.push({
            roomId: apartmentId, severity: 'hard', metric: 'grossMax', delta: 1.0,
            reason: `${beds}-bedroom apartment gross ${input.grossAreaM2.toFixed(1)} m² > hard max ${d.grossMax} m² (more bedrooms make sense for this shell)`,
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
