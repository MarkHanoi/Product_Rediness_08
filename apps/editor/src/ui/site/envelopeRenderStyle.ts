// §ENVELOPE-CONFIDENCE-COLOUR (L-608) — the ONE place that decides what colour a buildable-envelope
// study volume renders in, so the Three (ParcelBoundarySceneRenderer) and Cesium (CesiumViewport)
// paths cannot drift.
//
// WHY THIS EXISTS
// ---------------
// Founder, testing Barcelona clau 13a: the panel said "Buildable envelope — COULDN'T COMPLETE" and
// yet a flat purple slab rendered in the SAME confident #6600FF as a real determination. That is the
// §CONTEXT-DATA-HONESTY family at the render layer (L-422/457/467/469): a FAILURE (the block-derived
// determination could not complete → an estimated fallback, or a footprint with no confirmed height)
// looks byte-identical to a CONFIDENT answer. The envelope's own `confidence` label (C58 §1.2) and
// whether it carries a real height already SAY which it is — the render just wasn't listening.
//
// THE RULE
// --------
// An envelope reads as CONFIDENT (the unified PRYZM violet #6600FF) only when BOTH hold:
//   1. its confidence is a REAL determination — `authoritative` / `structured` / `block-constructed`
//      (not `estimated-ruleset`, not `pipeline-extracted-unverified`, not unknown), AND
//   2. it carries a real height (a solid, not a flat "we don't claim a height" footprint slab).
// Otherwise it reads PROVISIONAL — a desaturated grey-violet — so an estimate or a flat/incomplete
// envelope is visibly NOT the same thing as a surveyed one. This is deliberately the conservative
// direction: when in doubt (unknown confidence on a persisted ring we did not re-derive), grey.
//
// Colour ONLY — each renderer keeps its own fill/line opacity (the Three volume, the Cesium prism and
// the parcel fill all use different alphas); the honest signal is the hue, not the transparency.

import type { EnvelopeConfidence } from '@pryzm/schemas';

/** The unified PRYZM violet — a CONFIDENT, real determination. */
const CONFIDENT_VIOLET_HEX = 0x6600ff;
const CONFIDENT_VIOLET_CSS = '#6600FF';

/** A desaturated grey-violet — an ESTIMATE or an incomplete/flat envelope. Same family (still
 *  reads as "the envelope"), but visibly muted so it can never be mistaken for a surveyed answer. */
const PROVISIONAL_GREY_HEX = 0x9a93b0;
const PROVISIONAL_GREY_CSS = '#9A93B0';

/** Confidence tiers that represent a REAL determination rather than an estimate/guess (C58 §1.2). */
const TRUSTED_CONFIDENCE: ReadonlySet<EnvelopeConfidence> = new Set([
    'authoritative',
    'structured',
    'block-constructed',
]);

export interface EnvelopeRenderStyle {
    /** True ⇒ a confident, complete determination (violet). False ⇒ estimate/flat/unknown (grey). */
    readonly complete: boolean;
    /** THREE numeric colour. */
    readonly hex: number;
    /** Cesium / CSS colour string. */
    readonly cssHex: string;
    /** One line for logs / an aria hint — WHY it is grey, when it is. */
    readonly reason: string;
}

/**
 * Decide the render colour for a buildable envelope from its honesty signals.
 *
 * @param confidence   the C58 envelope confidence label, or null/undefined when it is not known
 *                     (e.g. a persisted ring whose provenance was deliberately not re-synthesised) —
 *                     unknown is treated as NOT trusted, so it greys.
 * @param hasRealHeight true when the envelope extrudes a real, non-fallback height (a solid, not a
 *                     flat footprint slab).
 */
export function envelopeRenderStyle(
    confidence: EnvelopeConfidence | null | undefined,
    hasRealHeight: boolean,
): EnvelopeRenderStyle {
    const trusted = confidence != null && TRUSTED_CONFIDENCE.has(confidence);
    const complete = trusted && hasRealHeight;
    if (complete) {
        return {
            complete: true,
            hex: CONFIDENT_VIOLET_HEX,
            cssHex: CONFIDENT_VIOLET_CSS,
            reason: `confident (${confidence})`,
        };
    }
    const why = !trusted
        ? `provisional — confidence=${confidence ?? 'unknown'} (estimate/unverified)`
        : 'provisional — no confirmed height (flat footprint)';
    return {
        complete: false,
        hex: PROVISIONAL_GREY_HEX,
        cssHex: PROVISIONAL_GREY_CSS,
        reason: why,
    };
}
