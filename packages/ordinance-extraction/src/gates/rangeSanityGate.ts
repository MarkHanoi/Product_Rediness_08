// GATE — range / sanity bounds (`ORDINANCE-EXTRACTION-PIPELINE.md` §2 Stage 4,
// L-590f §3).
//
// Catches GROSS errors (the `2.000`→`2.0` locale bug's downstream symptom, a
// decimal-shifted height), NOT plausible-but-wrong ones — those are the
// arithmetic/dual-pass gates' job. A value outside a field's plausible band is
// almost always a units/locale/OCR shift.
//
// Pure: value + field → verdict. Bounds are per-field and overridable per
// jurisdiction (a city with genuinely taller stock widens `maxHeight_m`).

import { type ExtractableField, type GateResult } from '../types.js';

export interface FieldBounds {
    readonly min: number;
    readonly max: number;
}

/**
 * Default plausibility bands (`ORDINANCE-EXTRACTION-PIPELINE.md` §2):
 *   FAR ∈ [0.2, 3.0]; height ∈ [3, 120] m; ocupación ∈ [0, 1]; floors ∈ [1, 40];
 *   parcela mínima ∈ [10, 100 000] m²; setbacks ∈ [0, 50] m.
 * Overridable per city.
 */
export const DEFAULT_FIELD_BOUNDS: Readonly<Record<ExtractableField, FieldBounds>> =
    Object.freeze({
        'maxFAR': { min: 0.2, max: 3.0 },
        'maxHeight_m': { min: 3, max: 120 },
        'maxCoverage': { min: 0, max: 1 },
        'maxFloors': { min: 1, max: 40 },
        'minParcelArea_m2': { min: 10, max: 100_000 },
        'setback.front': { min: 0, max: 50 },
        'setback.side': { min: 0, max: 50 },
        'setback.rear': { min: 0, max: 50 },
    });

/**
 * Range/sanity gate.
 *   - `not-applicable` — no value to bound (algorithm/absent).
 *   - `pass`           — value within the field's plausibility band.
 *   - `flag`           — value out of band (a gross shift; route to human).
 */
export function rangeSanityGate(
    field: ExtractableField,
    value: number | null,
    bounds: Partial<Record<ExtractableField, FieldBounds>> = {},
): GateResult {
    if (value === null) {
        return {
            gate: 'range',
            verdict: 'not-applicable',
            detail: 'No numeric value to bound (algorithm/absent).',
            token: 'range:not-applicable',
        };
    }

    const b = bounds[field] ?? DEFAULT_FIELD_BOUNDS[field];
    const within = value >= b.min && value <= b.max;
    return {
        gate: 'range',
        verdict: within ? 'pass' : 'flag',
        detail: within
            ? `${field} = ${value} ∈ [${b.min}, ${b.max}].`
            : `${field} = ${value} OUT OF [${b.min}, ${b.max}] — likely a units/locale/OCR shift; route to human.`,
        token: within ? 'range:pass' : 'range:flag',
    };
}
