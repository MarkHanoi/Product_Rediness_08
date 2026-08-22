// §PARCEL-ALL-INFO (L-6905..L-6909 · C19 · C58 §1.16 · C84 EI-1b) — WHAT THE PARCEL PANEL'S
// ENVELOPE SLOT SAYS WHEN THE CARD IS NOT THERE.
//
// Founder 2026-08-22: *"On parcel selection I want to have all information directly showing
// up: it is still on GIS."*
//
// The information he listed — buildable envelope, designed-vs-permitted, how these were
// measured, full site & massing — is ALL carried by one element: the singleton buildable-
// envelope card (`data-testid="buildable-envelope-card"`), which `window.pryzmMountEnvelopeCard`
// re-homes into whichever slot asks for it. So composing it into the Parcel panel is one call.
//
// This module is about the OTHER branch: what the slot says when that call returns `false`.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ `false` HAS FOUR DIFFERENT CAUSES AND THEY ARE NOT INTERCHANGEABLE
// ═══════════════════════════════════════════════════════════════════════════════
// `pryzmMountEnvelopeCard` returns `false` when C58 decided there is nothing honest to show.
// Its own doc-comment is emphatic that the value is load-bearing and must never be softened
// into zeros. It does not, however, say WHY — and the four whys need four different sentences
// because they call for four different user actions:
//
//   NO-BOUNDARY  nothing is committed          → go select a parcel
//   RESOLVING    committed, answer in flight   → wait; it is coming (6–11 s, MEASURED)
//   STALLED      committed, deadline blown     → the chain died; recompute
//   REFUSED      committed, answer was "none"  → a determination, not a failure
//
// Collapsing any two of these is the [[context-data-honesty-family]] defect — failure and
// emptiness rendered as the same value — and the GIS panel's existing empty state collapses
// three of them into one sentence ("No buildable envelope determined yet…"), which during the
// founder's measured six-to-eleven-second window is actively wrong: it says nothing has been
// determined when a determination is running.
//
// ⛔ NONE of the arms may render a figure. Not a zero, not an em-dash that reads as zero, not
// the previous parcel's number held over. C58 §1.16 / §L-616: an unknown constraint drawn as a
// value is an overstatement on real land, and here the values are legally loaded — heights,
// setbacks and FAR cited to PGM articles.
//
// PURE, DOM-FREE, and separate from the panel so all five arms are pinned by a spec rather
// than reached through a mount.

/** What the slot should render, given the four inputs below. */
export type ParcelEnvelopeSlotState =
    /** The card claimed the slot. Render nothing else. */
    | 'card-present'
    /** No parcel boundary is committed — there is nothing to determine anything about. */
    | 'no-boundary'
    /** A determination is in flight and inside its deadline. */
    | 'resolving'
    /** A determination was launched and never landed. */
    | 'stalled'
    /** A boundary is committed and no determination is running — the answer was "nothing". */
    | 'settled-without-envelope';

export interface ParcelEnvelopeSlotInputs {
    /** What `window.pryzmMountEnvelopeCard(slot)` returned. */
    readonly cardPresent: boolean;
    /** Does the C19 site hold a committed ring of >= 3 vertices? */
    readonly hasCommittedBoundary: boolean;
    /** `getEnvelopeResolutionPhase()` from `envelopeResolutionState.ts`. */
    readonly resolutionPhase: 'idle' | 'resolving' | 'stalled';
}

/**
 * ⭐ THE DECISION. Deterministic, total, and ordered so no two causes can be reported as one.
 *
 * ⚠ `cardPresent` WINS UNCONDITIONALLY. If the card is on screen it is the answer, and a
 * "resolving" strip above it would claim the figures beside it are provisional when they are
 * the determination. The in-flight phase can legitimately still be `resolving` at that moment —
 * the estimated envelope is cached and rendered before the real chain returns (MEASURED:
 * `computeAndCacheEstimatedEnvelope` runs at `siteDispatch.ts` on every commit, BEFORE
 * `applyZoning` forks) — and that case is handled by the card's own confidence badge, which is
 * the ONE surface entitled to characterise its own numbers. This module does not second-guess
 * it; see `parcelEnvelopeResolvingNoticeApplies` for the narrow exception that does.
 */
export function resolveParcelEnvelopeSlotState(
    inputs: ParcelEnvelopeSlotInputs,
): ParcelEnvelopeSlotState {
    if (inputs.cardPresent) return 'card-present';
    // Ordered BEFORE the phase checks: with no ring committed there is nothing a resolution
    // could be about, so a leftover phase must not produce a "resolving" message for a parcel
    // that does not exist.
    if (!inputs.hasCommittedBoundary) return 'no-boundary';
    if (inputs.resolutionPhase === 'resolving') return 'resolving';
    if (inputs.resolutionPhase === 'stalled') return 'stalled';
    return 'settled-without-envelope';
}

/**
 * Should a RESOLVING notice appear ABOVE a card that IS present?
 *
 * ⭐ THIS IS THE NARROW CASE THE MEASUREMENT FORCED. `computeAndCacheEstimatedEnvelope` caches
 * an `estimated-ruleset` envelope on EVERY parcel commit, synchronously, before `applyZoning`
 * forks into the jurisdiction chain. So for the whole 6–11 s window the card is present and it
 * is showing the ESTIMATED fallback, not the cited determination that is still being fetched.
 *
 * The card's own `EST` badge is honest about the confidence of what it shows. What it cannot
 * say — because it does not know — is that a BETTER answer is on its way and these figures are
 * about to be replaced. A user reading setbacks off the card in second 3 and acting on them has
 * not been lied to, but they have been under-informed at a surface whose entire discipline is
 * that a provisional value is labelled as one.
 *
 * ⚠ NARROW ON PURPOSE. It returns true ONLY while the phase is `resolving`. A settled estimated
 * envelope — genuine, honest, the right answer outside every registered jurisdiction (C58 §1.6)
 * — gets no notice, because nothing better is coming for it.
 */
export function parcelEnvelopeResolvingNoticeApplies(inputs: {
    readonly cardPresent: boolean;
    readonly resolutionPhase: 'idle' | 'resolving' | 'stalled';
}): boolean {
    return inputs.cardPresent && inputs.resolutionPhase === 'resolving';
}

/**
 * The sentence for each non-card arm.
 *
 * Every one of them states (a) what is known, (b) what is not, and (c) what to do — the C82
 * §1.2 shape (a refusal carries its escape hatch), because a slot that only reports absence is
 * the L-942 defect: a refusing branch whose way out was never built.
 */
export function parcelEnvelopeSlotText(state: ParcelEnvelopeSlotState): string {
    switch (state) {
        case 'card-present':
            return '';
        case 'no-boundary':
            return 'No parcel boundary is committed to this project yet, so there is nothing to '
                + 'determine a buildable envelope against. Select a plot on the 2D map above — '
                + 'the setbacks, height, FAR and the designed-vs-permitted comparison appear here '
                + 'once they can be derived.';
        case 'resolving':
            return 'Resolving the buildable envelope for this parcel. The cadastral facts above '
                + 'are final; the ordinance figures are still being fetched from the jurisdiction '
                + 'and are deliberately not shown as zeros or dashes while they are unknown. This '
                + 'normally takes a few seconds.';
        case 'stalled':
            return 'The buildable-envelope determination for this parcel did not complete. That is '
                + 'a failure to reach an answer, not an answer — nothing has been determined about '
                + 'what may be built here, and no figure is shown in place of one. Recompute below '
                + 'to run it again against the same committed boundary.';
        case 'settled-without-envelope':
            return 'No buildable envelope applies to this parcel, or the data needed to derive one '
                + 'is not published for it. That is a determination, not a failure: PRYZM declines '
                + 'to show a figure rather than publish one it cannot cite. Recompute below to '
                + 're-run it against the same committed boundary.';
    }
}

/**
 * The notice shown ABOVE a present card while a better answer is still in flight.
 * Separate from `parcelEnvelopeSlotText` because it accompanies data rather than replacing it.
 */
export const PARCEL_ENVELOPE_RESOLVING_OVER_CARD_TEXT =
    'These figures are the provisional fallback. The jurisdiction’s own determination for this '
    + 'parcel is still being fetched and will replace them — check the confidence badge on the '
    + 'card before relying on a number.';

/** Which arms offer the recompute escape hatch. */
export function parcelEnvelopeSlotOffersRecompute(state: ParcelEnvelopeSlotState): boolean {
    // ⛔ NOT `resolving`. A recompute button during the window invites the user to restart a
    // chain that is already running — which, per §STALE-ASYNC-ZONING (L-644), makes the older
    // in-flight response a stale one that must then be discarded. Offering the button there
    // would manufacture the exact race that defect exists to prevent.
    return state === 'stalled' || state === 'settled-without-envelope';
}
