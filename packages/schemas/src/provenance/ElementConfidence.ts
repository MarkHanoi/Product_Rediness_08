// PV-06 (C75 §1.3 · C62 / ADR-0280) — element-side `confidence`, REUSED from
// C62 rather than reinvented.
//
// ── THE MEASURED DEFECT ──────────────────────────────────────────────────────
// Measured 2026-08-14 at HEAD, before this file existed:
//
//     grep -rc 'confidence' packages/schemas/src/elements   →   0
//     grep -rc 'confidence' packages/schemas/src/site       →  48
//
// Zero across all 27 `defineElement()` kinds; rich and in places mandatory
// across the site / context / climate / zoning domains. So a jurisdiction
// setback carries a tier, an authority rank, a validation state and a typed
// unknown-reason, while a wall the generator INFERRED and a wall a human drew
// are indistinguishable in confidence terms — they have none.
//
// ── WHY THIS IS NOT A THIRD CONFIDENCE SCALE ─────────────────────────────────
// C75 §1.3 is explicit that **C62 owns confidence** and §4.h forbids reinventing
// it. This file therefore declares NO new vocabulary. It re-exports C62's
// `DomainConfidence` (`site/metadata/DataConfidence.ts`, ADR-0280) — the same
// tier / score / authorityRank / validationState / unknownReason axes the site
// domain already uses — and adds exactly one thing C62 does not have: a RETROFIT
// default, so the field can be added to schemas that already have serialised
// records in the wild.
//
// C75 §1.2 is also respected by omission: confidence is a SEPARATE axis from
// origin. A `computed` value can be low-confidence and an `observed` one can be
// stale. Nothing here lets a confidence tier be read as an origin, and
// `provenance` (ValueOrigin.ts) stays the only thing that answers "where did
// this come from".
//
// ── THE RETROFIT RULE (identical to PV-02's provenance retrofit) ─────────────
// The field is OPTIONAL-ADDITIVE with an UNKNOWN-with-reason default. An
// element written before this field existed parses unchanged and lands on
// `unknownReason: 'pending-implementation'` — C62's own token, meaning *the
// field is specced but the compute path is not built yet*, which is precisely
// true. It never lands on a tier, never on `score: 0`, and never on a
// fabricated `1`. C75 §1.4: UNKNOWN is a value WITH A REASON.
//
// ⚠ `score: 0` would be the whole defect in one character. A confidence of zero
// is a CLAIM — "we are certain this is wrong". Not knowing is `null` plus a
// reason. C62's own comment says the same thing at `DomainConfidenceSchema`:
// *"Never default an unknown to 0 — that is the fabrication the honesty rule
// forbids."*
//
// LAYERING — L0-pure (P5): Zod only, no I/O, no THREE, no DOM.

import { z } from 'zod';
import {
    DomainConfidenceSchema,
    type DomainConfidence,
    type UnknownReason,
} from '../site/metadata/DataConfidence.js';

export type { DomainConfidence, UnknownReason };

/**
 * The element-side confidence type. **An alias of C62's `DomainConfidence`, on
 * purpose** — PV-06's row says "reuse C62's model — do not reinvent it (§4.h)",
 * so this name exists to make the element-side usage greppable, NOT to fork the
 * shape. Widening it here without widening C62 would be the drift ADR-0280 was
 * written to stop.
 */
export const ElementConfidenceSchema = DomainConfidenceSchema;
export type ElementConfidence = DomainConfidence;

/**
 * The **default** for a confidence field added to an existing element schema.
 *
 * An old record is not evidence about confidence in either direction, so it
 * records `pending-implementation` and nothing else: no tier, `score: null`,
 * `validationState: 'not-checked'`.
 *
 * ⚠ Deliberately a FUNCTION, not a frozen constant handed to `.default()` — the
 * same reasoning as `provenancePredatingTheField()` in `ValueOrigin.ts`. Zod
 * `.default()` with a shared object reference hands every parse the same mutable
 * instance; a factory cannot be aliased into a shared record by accident.
 */
export function confidencePredatingTheField(): ElementConfidence {
    return {
        score: null,
        validationState: 'not-checked',
        unknownReason: 'pending-implementation',
    };
}

/**
 * A confidence field for a schema being retrofitted: **optional, and defaulting
 * to UNKNOWN-with-reason**. Existing snapshots parse unchanged and land on
 * `pending-implementation` rather than on any tier or score.
 *
 * ─── HOW TO ADOPT IT: SPELL IT OUT, DO NOT ABSTRACT IT ───────────────────────
 * ⚠ Write `confidence: RetrofittedConfidenceSchema` **literally** in each
 * element's `defineElement` extension. Do NOT fold it into `BaseNodeShape` and
 * do NOT spread it from a shared constant. This is the same instruction
 * `RetrofittedProvenanceSchema` carries and for the same measured reason: a
 * base-shape edit or a spread gives every kind the field while leaving each
 * element schema looking exactly as bare as before, and hides it from any
 * per-kind coverage evidence. Measured 2026-08-13 for the provenance retrofit:
 * the spread form read **zero covered kinds**.
 */
export const RetrofittedConfidenceSchema = ElementConfidenceSchema.default(
    confidencePredatingTheField,
);

/**
 * Say *we do not know how confident to be, and here is the typed reason* —
 * without inventing a tier or a score. The one-liner every write site uses when
 * it genuinely cannot judge (C75 §1.4).
 */
export function unknownConfidence(reason: UnknownReason): ElementConfidence {
    return { score: null, validationState: 'not-checked', unknownReason: reason };
}

/**
 * True when this confidence record makes no claim — no tier and no score.
 *
 * The predicate exists so a consumer never has to write `c.score === 0` or
 * `!c.tier` and accidentally treat *unknown* as *low*. They are different
 * answers and the whole cluster is about not merging them.
 */
export function confidenceIsUnknown(c: ElementConfidence | undefined): boolean {
    if (c === undefined) return true;
    return c.tier === undefined && c.score === null;
}

/**
 * Record a judged confidence. `unknownReason` is REFUSED here: a value that
 * carries a tier or a score is not unknown, and letting both through would
 * produce a record that claims a confidence and denies it in the same breath.
 *
 * Mirrors the split in `ValueOrigin.ts` between `systemProvenance()` and
 * `unknownProvenance()`: knowing and not-knowing get separate constructors, so
 * a grep finds every site that makes a claim.
 */
export function judgedConfidence(
    judgement: { tier?: string; score?: number | null },
    validationState: ElementConfidence['validationState'] = 'not-checked',
): ElementConfidence {
    if (judgement.tier === undefined && (judgement.score === null || judgement.score === undefined)) {
        throw new Error(
            'judgedConfidence: a judged confidence must carry a tier or a score — call unknownConfidence(reason) instead of minting an empty claim (C75 §1.4)',
        );
    }
    const out: ElementConfidence = {
        score: judgement.score ?? null,
        validationState,
    };
    if (judgement.tier !== undefined) out.tier = judgement.tier;
    return out;
}

/** Narrow, runtime-checkable guard for hand-authored consumers. */
export const isElementConfidence = (v: unknown): v is ElementConfidence =>
    ElementConfidenceSchema.safeParse(v).success;

// Re-exported so a consumer adopting the field never has to reach into the site
// domain for the reason vocabulary it must pair with a null value.
export { UnknownReasonSchema } from '../site/metadata/DataConfidence.js';

/** @internal — keeps `z` referenced for consumers importing the module type-only. */
export type _ZodAnchor = z.ZodTypeAny;
