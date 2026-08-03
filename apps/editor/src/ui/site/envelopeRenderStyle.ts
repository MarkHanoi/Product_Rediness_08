// §ENVELOPE-CONFIDENCE-COLOUR (L-608) / §L-619 — the ONE place that decides what colour + fill a
// buildable-envelope study volume renders in, for the FLAT surfaces: the Three plan/BIM overlay
// (`ParcelBoundarySceneRenderer`) and the info card. The 3D MASSING (`CesiumViewport`) reads its hue
// from `MassingSolid.style` produced by `envelopeToMassing` (C58 §1.14). Both share ONE honesty
// classifier — `classifyEnvelopeCompleteness` in `@pryzm/site-parcel-data` (L2) — so the globe, the
// plan view and the card cannot drift. The RULE lives once, in the layer below its consumers.
//
// WHY THIS EXISTS
// ---------------
// Founder, testing Barcelona clau 13a: the panel said "Buildable envelope — COULDN'T COMPLETE" and
// yet a flat purple slab rendered in the SAME confident #6600FF as a real determination. That is the
// §CONTEXT-DATA-HONESTY family at the render layer (L-422/457/467/469): a FAILURE (the block-derived
// determination could not complete → an estimated fallback, or a footprint with no confirmed height)
// looks byte-identical to a CONFIDENT answer.
//
// THE RULE (now enforced once, in the L2 classifier — see there for the full statement)
// -------------------------------------------------------------------------------------
// CONFIDENT (the unified violet #6600FF) only when the confidence is a REAL determination AND a real
// height is carried; otherwise PROVISIONAL grey. §L-619 — an UPPER-BOUND footprint (setbacks
// unpublished, so the ring is the whole parcel as a MAXIMUM extent) is NEVER confident, whatever its
// height/FAR: the footprint is the thing in doubt.
//
// Colour ONLY — each renderer keeps its own fill/line opacity; the honest signal is the hue.

import type { EnvelopeConfidence, EnvelopePublicationPosture } from '@pryzm/schemas';
import { classifyEnvelopeCompleteness } from '@pryzm/site-parcel-data';

/** The unified PRYZM violet — a CONFIDENT, real determination. Exported so the Cesium rasteriser
 *  maps `MassingSolid.style.hue === 'confident'` to the SAME colour, from one source. */
export const CONFIDENT_VIOLET_HEX = 0x6600ff;
export const CONFIDENT_VIOLET_CSS = '#6600FF';

/** A desaturated grey-violet — an ESTIMATE / incomplete / upper-bound envelope. Same family (still
 *  reads as "the envelope"), visibly muted so it can never be mistaken for a surveyed answer. */
export const PROVISIONAL_GREY_HEX = 0x9a93b0;
export const PROVISIONAL_GREY_CSS = '#9A93B0';

export interface EnvelopeRenderStyle {
    /** True ⇒ a confident, complete determination (violet). False ⇒ estimate/flat/unknown (grey). */
    readonly complete: boolean;
    /**
     * §L-619 / §CONTEXT-DATA-HONESTY — TRUE when the FOOTPRINT is an UPPER BOUND: the ring is the
     * whole parcel ONLY because the ordinance publishes no setbacks (Copenhagen / DK Plandata), NOT
     * because full-parcel coverage was granted. The renderer MUST then draw the volume as a
     * near-wireframe "maximum extent" (a faint fill, outline-dominant) rather than a filled study
     * solid. `complete` is always false when this is true — the footprint is the thing in doubt,
     * regardless of how trusted the height/FAR are.
     */
    readonly footprintUpperBound: boolean;
    /**
     * §OPEN-TOP-INDICATIVE (ADR-0293) — TRUE when the publication posture is `open-top-indicative`:
     * PRYZM may DRAW this volume but claims NO buildable right in it, because constraint families
     * that can only ever REDUCE it are unmodelled. The flat overlay MUST then draw the prism with
     * NO TOP CAP (an open shell) at the near-wireframe fill. `complete` is always false when this is
     * true, so the hue is already the provisional grey — the open top is the SECOND, independent
     * channel, and it is the one a colour-blind viewer still reads.
     */
    readonly openTop: boolean;
    /** THREE numeric colour. */
    readonly hex: number;
    /** Cesium / CSS colour string. */
    readonly cssHex: string;
    /** One line for logs / an aria hint — WHY it is grey, when it is. */
    readonly reason: string;
}

/**
 * Decide the render colour for a buildable envelope from its honesty signals. Thin adapter over the
 * shared L2 `classifyEnvelopeCompleteness` (the single authority; C58 §1.14) — this file only maps
 * the completeness class to the concrete THREE/CSS colours the flat surfaces + card use.
 *
 * @param confidence   the C58 envelope confidence label, or null/undefined when not known (a
 *                     persisted ring whose provenance was deliberately not re-synthesised) — unknown
 *                     is treated as NOT trusted, so it greys.
 * @param hasRealHeight true when the envelope extrudes a real, non-fallback height (a solid, not a
 *                     flat footprint slab).
 * @param footprintIsUpperBound §L-619 — true when the FOOTPRINT is the whole parcel ONLY because the
 *                     ordinance publishes no setbacks. Forces PROVISIONAL regardless of confidence.
 * @param publicationPosture §OPEN-TOP-INDICATIVE (ADR-0293) — what PRYZM may CLAIM, from
 *                     `envelopePublicationPosture()`. `'open-top-indicative'` forces PROVISIONAL and
 *                     sets `openTop`. ⚠ NULL/absent means NOT STATED and changes nothing — every
 *                     pre-existing call site is byte-identical.
 *
 * ⭐ NO NEW COLOUR SYSTEM. There are exactly TWO hues here and there still are: the unified violet is
 * reserved for a real determination, and an indicative envelope — never `complete` — takes the SAME
 * provisional grey an estimate takes. What separates INDICATIVE from merely provisional is `openTop`,
 * a SILHOUETTE difference, not a third swatch. (`PreviewStyle.ts`'s `#6600FF` is the CREATION-preview
 * purple and is a different vocabulary entirely; it is not in play on this surface.)
 */
export function envelopeRenderStyle(
    confidence: EnvelopeConfidence | null | undefined,
    hasRealHeight: boolean,
    footprintIsUpperBound: boolean = false,
    publicationPosture: EnvelopePublicationPosture | null | undefined = null,
): EnvelopeRenderStyle {
    const cls = classifyEnvelopeCompleteness(
        confidence,
        hasRealHeight,
        footprintIsUpperBound,
        publicationPosture,
    );
    return {
        complete: cls.complete,
        footprintUpperBound: cls.footprintUpperBound,
        openTop: cls.openTop,
        hex: cls.complete ? CONFIDENT_VIOLET_HEX : PROVISIONAL_GREY_HEX,
        cssHex: cls.complete ? CONFIDENT_VIOLET_CSS : PROVISIONAL_GREY_CSS,
        reason: cls.reason,
    };
}
