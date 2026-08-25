// C108 §4 (C62 / ADR-0280) — facade-side confidence, REUSED from C62 rather than
// reinvented.
//
// ── WHY THIS IS NOT A NEW CONFIDENCE SCALE ───────────────────────────────────
// C62 §1.2 binds new subsystems in as many words:
//
//     "New subsystems MUST express confidence through `DomainConfidence`, not a
//      bespoke scalar."
//
// So this file declares NO new vocabulary. `FacadeConfidence` is an ALIAS of
// C62's `DomainConfidence`, exactly as `packages/schemas/src/provenance/
// ElementConfidence.ts` is — and for the reason stated there: the name exists to
// make the facade-side usage greppable, NOT to fork the shape. Widening it here
// without widening C62 is the drift ADR-0280 was written to stop.
//
// ── THE §17 SCALAR AND THIS RECORD ARE THE SAME NUMBER ───────────────────────
// The founder's §17 puts a bare `confidence` on every IR node. That scalar IS
// `DomainConfidence.score` — one number, not two. The `evidence` sibling carries
// the axes a scalar cannot express (`unknownReason`, `validationState`,
// `authorityRank`). Where they could disagree they must not, and the corpus
// asserts `confidence === evidence.score`.
//
// ── `0` AND `unknown` ARE DIFFERENT ANSWERS ──────────────────────────────────
// C62's own comment on `DomainConfidenceSchema`: "Never default an unknown to 0 —
// that is the fabrication the honesty rule forbids." A `0` is the CLAIM *we are
// certain this is wrong*. Not knowing is `score: null` plus a typed reason.
//
// ⚠ Brief §17's literal template shows `"confidence":0` in every empty slot. That
// is a TEMPLATE PLACEHOLDER, not a computed value, and C108 §2.3 resolves it: §17
// is read as a SHAPE. This engine never emits `0` to mean "we did not look".

import {
    ElementConfidenceSchema,
    UnknownReasonSchema,
    type DomainConfidence,
    type UnknownReason,
} from '@pryzm/schemas/provenance';

export type { DomainConfidence, UnknownReason };
export { UnknownReasonSchema };

/**
 * The facade-side confidence type. **An alias of C62's `DomainConfidence`, on
 * purpose** — see the header. Do not widen it here.
 */
export const FacadeConfidenceSchema = ElementConfidenceSchema;
export type FacadeConfidence = DomainConfidence;

/**
 * *We do not know how confident to be, and here is the typed reason* — without
 * inventing a tier or a score.
 *
 * This is the constructor a stage calls when the image does not answer its
 * question, and it is deliberately a DIFFERENT function from {@link measured}
 * so that a grep finds every site that makes a claim.
 */
export function unknown(reason: UnknownReason): FacadeConfidence {
    return { score: null, validationState: 'not-checked', unknownReason: reason };
}

/**
 * Record a measured confidence in `[0, 1]`.
 *
 * ⛔ Refuses a non-finite or out-of-range score rather than clamping silently: a
 * stage producing `NaN` has a bug, and clamping it to `0` would convert that bug
 * into the strongest possible claim ("certain this is wrong").
 */
export function measured(score: number): FacadeConfidence {
    if (!Number.isFinite(score) || score < 0 || score > 1) {
        throw new Error(
            `FacadeConfidence.measured: score must be a finite number in [0,1], got ${String(score)} — ` +
                'call unknown(reason) instead of minting a fabricated claim (C62 §1.1)',
        );
    }
    return { score, validationState: 'not-checked' };
}

/** True when this record makes no claim — no tier and no score. */
export function isUnknown(c: FacadeConfidence | undefined): boolean {
    if (c === undefined) return true;
    return c.tier === undefined && (c.score === null || c.score === undefined);
}

/**
 * The C108 §4.3 roll-up: a stage's own support, **capped by a `min` over its
 * inputs**.
 *
 * ⛔ A `min`, never a product and never an average, and the reason is arithmetic
 * rather than stylistic:
 *
 *   • a PRODUCT of four independent 0.9s reads 0.66, which claims the chain is
 *     far less certain than any measurement in it supports;
 *   • an AVERAGE lets one confident stage hide one that measured nothing, which
 *     is the failure mode this whole subsystem is shaped to avoid.
 *
 * ⛔ **Unknown in ⇒ unknown out.** If any input is unknown the result is unknown,
 * carrying the FIRST input's reason. That propagation is the entire reason the
 * field exists: a facade width computed from a quad nobody could find is not
 * "moderately confident", it is not known.
 */
export function capBy(own: FacadeConfidence, ...inputs: readonly FacadeConfidence[]): FacadeConfidence {
    for (const input of inputs) {
        if (isUnknown(input)) {
            return unknown(input.unknownReason ?? 'geometry-incomplete');
        }
    }
    if (isUnknown(own)) return own;
    let score = own.score as number;
    for (const input of inputs) {
        score = Math.min(score, input.score as number);
    }
    return { score, validationState: own.validationState };
}

/**
 * The scalar the §17 wire shape carries for a node — `null` when unknown.
 *
 * Every IR writer goes through this, so `confidence === evidence.score` holds by
 * construction rather than by discipline.
 */
export function scalarOf(c: FacadeConfidence): number | null {
    return isUnknown(c) ? null : (c.score as number);
}
