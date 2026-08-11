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

import {
    type KnownLandBasis,
    type LandBasisRefusal,
    type RatioOverLand,
    pairOverSameLand,
    sharedLandBasis,
} from '@pryzm/schemas';
import { type GateResult } from '../types.js';
import { type CoherenceGateResult, type ResolvedParameter } from './types.js';

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
 *
 * ⭐ W5-2 — THE IDENTITY IS ONLY VALID OVER **ONE DENOMINATOR**, AND THAT IS NOW A TYPE.
 *
 * Read the derivation above again: "floorArea ≤ floors × coverage × plot". The word `plot`
 * appears on BOTH sides and cancels. It only cancels if it is the SAME land. Given a FAR over
 * gross sector area and a coverage over the parcel, the cancellation is invalid — but the
 * arithmetic is not, so the gate returned `pass` and three mutually consistent numbers were all
 * wrong at once. C63 §3.2 (L-656) ratifies that the denominator is buildable land, yet nothing
 * in the source named a land denominator at all: `densityScope` was a metadata string this
 * function never read.
 *
 * So the denominator is resolved FIRST, through the L0 `LandBasis` type, and the identity is
 * only ever asserted by {@link densityIdentityOverOneLand} — whose signature takes both ratios
 * over a single `B`. Mixing bases there is a `tsc` error, not a verdict. When the runtime data
 * cannot produce one land, this returns a CODED refusal (`basis-mismatch` / `basis-unknown` /
 * `basis-not-declared`) rather than a number, per §CONTEXT-DATA-HONESTY and L-616: an unknown
 * denominator read as a known one always over-states on real land.
 */
export function densityCoherence(params: readonly ResolvedParameter[]): CoherenceGateResult {
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

    // ── STAGE 1 — WHICH LAND? Before any arithmetic. `maxFloors` is a COUNT, not a ratio, so
    // it carries no basis and needs none: it multiplies whatever denominator the two ratios
    // share. Only the two ratios must agree.
    const denominator = pairOverSameLand(
        { value: far.value, basis: far.landBasis, label: 'maxFAR' },
        { value: coverage.value, basis: coverage.landBasis, label: 'maxCoverage' },
    );
    if (!denominator.ok) return refuseOnDenominator(denominator.refusal);

    // ── STAGE 2 — the identity, over ONE land, enforced by the signature below.
    return densityIdentityOverOneLand(denominator.a, denominator.b, floors.value);
}

/**
 * Render a denominator refusal as a coherence gate result, KEEPING its code and its reason.
 *
 * The verdict is chosen to say the true thing in the existing three-word vocabulary:
 *   - `basis-mismatch` ⇒ **`flag`**. Two ratios over different land is a POSITIVE finding — the
 *     values may each be correct and the relation is still unassertable. It routes to a human
 *     exactly as a breached identity does, and it must never read as "not checked".
 *   - everything else ⇒ **`not-applicable`**. The denominator is unknown or undeclared, so the
 *     check genuinely could not run. It is emphatically NOT a `pass`.
 * In both cases `denominator` carries the code, so a consumer can tell these apart from the
 * plain "a parameter did not resolve" case (see `CoherenceGateResult`).
 */
function refuseOnDenominator(refusal: LandBasisRefusal): CoherenceGateResult {
    return {
        gate: 'coherence',
        verdict: refusal.code === 'basis-mismatch' ? 'flag' : 'not-applicable',
        detail:
            `FAR ≤ coverage × floors NOT ASSERTED — ${refusal.headline} ${refusal.detail}`,
        token: `coherence:denominator-refused:${refusal.code}`,
        denominator: refusal,
    };
}

/**
 * The density identity, asserted over ONE land.
 *
 * ⭐ THIS SIGNATURE IS THE FIX. Both ratios are `RatioOverLand<B>` for a single `B`, and the
 * second is wrapped in `NoInfer` so `B` is pinned by the first argument rather than widened to
 * a union. `RatioOverLand` is invariant in `B` (see its phantom in `LandBasis.ts`), so passing
 * a `RatioOverLand<'gross'>` alongside a `RatioOverLand<'parcel'>` does not return a bad
 * verdict — **it does not compile.** The error is unrepresentable rather than detected, which
 * is the difference between an invariant and a check somebody has to remember to run.
 *
 * Exported so a future consumer (a pack, a scorecard slice) can assert the same identity
 * without re-deriving the guard, and so the guarantee is testable directly.
 */
export function densityIdentityOverOneLand<B extends KnownLandBasis>(
    far: RatioOverLand<B>,
    coverage: RatioOverLand<NoInfer<B>>,
    floors: number,
): CoherenceGateResult {
    const basis = sharedLandBasis(far, coverage);
    const ceiling = coverage.value * floors;
    // Tolerance absorbs the published rounding of the operands (GRZ/GFZ are stated
    // to 1–2 dp), so a value at the identity's exact boundary never false-flags.
    const tolerance = Math.max(0.01, 0.01 * ceiling);
    const within = far.value <= ceiling + tolerance;

    // The land is named in BOTH messages. A density verdict with no stated denominator is the
    // very thing this change exists to abolish — including when it passes.
    return {
        gate: 'coherence',
        verdict: within ? 'pass' : 'flag',
        detail: within
            ? `FAR ${far.value} ≤ coverage ${coverage.value} × floors ${floors} = ${ceiling.toPrecision(3)}, both over ${basis} land.`
            : `FAR ${far.value} EXCEEDS coverage ${coverage.value} × floors ${floors} = ${ceiling.toPrecision(3)} (both over ${basis} land) — impossible for one Baugebiet. Either a value is misread or the three were read from different zones/an Ausnahme applies; route to human.`,
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
export function envelopeCoherence(params: readonly ResolvedParameter[]): CoherenceGateResult[] {
    return [densityCoherence(params), heightDatumCoherence(params)];
}
