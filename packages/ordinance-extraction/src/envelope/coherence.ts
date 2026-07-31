// @pryzm/ordinance-extraction — WHOLE-ENVELOPE coherence checks.
//
// Every other gate checks a value against its OWN source text (does the raw string
// parse to this number? is the number plausible for this field?). A coherence check
// is different in kind: it checks one extracted parameter against ANOTHER, using a
// relationship that holds by geometry or by law. It is the `arithmeticCrossCheck`
// idea — "⭐ the free in-document signal" (`ORDINANCE-EXTRACTION-PIPELINE.md` §2
// Stage 4, L-590g §3.2) — lifted from redundant table CELLS to redundant
// PARAMETERS, so it works on running prose where there is no table to reconcile.
//
// It cannot fire on a single value, which is exactly why it catches a different
// class of error: a misread that is individually plausible (GFZ 2,9 instead of 0,9
// passes every range and locale check) but impossible next to its siblings.
//
// Pure: parameters in, verdicts out. Never throws, never mutates.

import { type GateResult } from '../types.js';
import { type ResolvedParameter } from './types.js';

/** Look up a resolved parameter by field (heights excluded — they are datum-keyed). */
function byField(
    params: readonly ResolvedParameter[],
    field: ResolvedParameter['field'],
): ResolvedParameter | undefined {
    return params.find((p) => p.field === field);
}

/**
 * FAR ≤ coverage × floors — the density identity.
 *
 * WHY IT HOLDS. Floor-area ratio is total counted floor area ÷ plot area; coverage
 * is footprint ÷ plot area; floors is the storey count. If no storey may exceed the
 * footprint the coverage allows, then floorArea ≤ floors × coverage × plot, i.e.
 * FAR ≤ coverage × floors. In German terms this is GFZ ≤ GRZ × Z, and it is tight:
 * §20 BauNVO computes Geschossfläche over the SAME Vollgeschosse that Z counts, so
 * the two sides measure the same storeys.
 *
 * ⚠ WHAT A FLAG DOES AND DOES NOT MEAN. `flag` means "these three numbers cannot
 * all describe one Baugebiet" — it does NOT prove which one is misread, and it is
 * NOT proof of a misread at all. Two innocent explanations exist and a human must
 * rule them out:
 *   1. the three values were read from DIFFERENT Baugebiete of the same plan (the
 *      parcel-binding gap — this core has no zone attribution);
 *   2. the plan grants an Ausnahme/Überschreitung (e.g. §19(4) BauNVO lets
 *      Garagen and Nebenanlagen exceed the GRZ).
 * So this gate routes to review; it never discards a value.
 *
 * `not-applicable` when fewer than all three parameters resolved — reported
 * explicitly, because "the check could not run" and "the check passed" are not the
 * same value.
 */
export function densityCoherence(params: readonly ResolvedParameter[]): GateResult {
    const far = byField(params, 'maxFAR');
    const coverage = byField(params, 'maxCoverage');
    const floors = byField(params, 'maxFloors');

    if (!far || !coverage || !floors) {
        const missing = [
            far ? null : 'maxFAR',
            coverage ? null : 'maxCoverage',
            floors ? null : 'maxFloors',
        ].filter((x): x is string => x !== null);
        return {
            gate: 'coherence',
            verdict: 'not-applicable',
            detail: `FAR ≤ coverage × floors not checked — ${missing.join(', ')} did not resolve.`,
            token: 'coherence:not-applicable',
        };
    }

    const ceiling = coverage.value * floors.value;
    // Tolerance absorbs the published rounding of the operands (GRZ/GFZ are stated
    // to 1–2 dp), so a value at the identity's exact boundary never false-flags.
    const tolerance = Math.max(0.01, 0.01 * ceiling);
    const within = far.value <= ceiling + tolerance;

    return {
        gate: 'coherence',
        verdict: within ? 'pass' : 'flag',
        detail: within
            ? `FAR ${far.value} ≤ coverage ${coverage.value} × floors ${floors.value} = ${ceiling.toPrecision(3)}.`
            : `FAR ${far.value} EXCEEDS coverage ${coverage.value} × floors ${floors.value} = ${ceiling.toPrecision(3)} — impossible for one Baugebiet. Either a value is misread or the three were read from different zones/an Ausnahme applies; route to human.`,
        token: within ? 'coherence:pass-density' : 'coherence:flag-density',
    };
}

/**
 * Eaves ≤ ridge — a Traufhöhe can never sit above the Firsthöhe of the same
 * building (the eaves are where the roof starts; the ridge is its top). A plan
 * stating otherwise has a misread or has mixed two buildings/zones.
 *
 * `not-applicable` unless BOTH datums resolved.
 */
export function heightDatumCoherence(params: readonly ResolvedParameter[]): GateResult {
    const eaves = params.find((p) => p.field === 'maxHeight_m' && p.measurement === 'eaves');
    const ridge = params.find((p) => p.field === 'maxHeight_m' && p.measurement === 'ridge');

    if (!eaves || !ridge) {
        return {
            gate: 'coherence',
            verdict: 'not-applicable',
            detail: 'Traufhöhe ≤ Firsthöhe not checked — both datums did not resolve.',
            token: 'coherence:not-applicable',
        };
    }

    const within = eaves.value <= ridge.value + 1e-9;
    return {
        gate: 'coherence',
        verdict: within ? 'pass' : 'flag',
        detail: within
            ? `Traufhöhe ${eaves.value} m ≤ Firsthöhe ${ridge.value} m.`
            : `Traufhöhe ${eaves.value} m EXCEEDS Firsthöhe ${ridge.value} m — the eaves cannot sit above the ridge; route to human.`,
        token: within ? 'coherence:pass-height-datum' : 'coherence:flag-height-datum',
    };
}

/** Run every whole-envelope coherence check, in order. */
export function envelopeCoherence(params: readonly ResolvedParameter[]): GateResult[] {
    return [densityCoherence(params), heightDatumCoherence(params)];
}
