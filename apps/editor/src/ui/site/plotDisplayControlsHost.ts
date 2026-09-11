// §PLOT-DISPLAY-CONTROLS-HOST (C115 §1.4 `C115-151`/`C115-153` · C19 §5.7 clause 1 · C115-87)
// — WHICH SURFACE IS CURRENTLY SHOWING THE "SHOW ON THE PLOT" CONTROL.
//
// Founder 2026-09-07, on the Parcel Law panel: the SHOW ON THE PLOT switches belong in
// section ① — *"What is this plot?"* — not beside the buildability determination.
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// ⭐ 2026-09-11 (L-13315) — THIS IS NOW A VIEW OF THE ONE CARD-JOB ARBITER, NOT ITS OWN
// ═══════════════════════════════════════════════════════════════════════════════════════
// The founder's Site-panel restructure (Section 1) gave the card a SECOND hostable job — the
// buildable-envelope summary — on exactly this module's terms. Rather than copy this module's
// claim / release / self-heal body into a second one (the same rule with two implementations),
// that body moved to `envelopeCardJobHost.ts`, keyed by a closed two-member union, and every
// export below is a one-line delegation with an UNCHANGED signature and UNCHANGED semantics:
// held by element, self-healing, last-claimer-wins, release guarded on identity.
//
// ⚠ ONE DELIBERATE WIDENING, stated: `subscribePlotDisplayControlsHost` now fires on a claim
// change to EITHER job. Its only production subscriber is the envelope card's host
// (`GISAreaLayout`), which repaints the card on notification — and the card must repaint when
// the summary job changes hands too. A repaint on an unrelated claim change costs one render and
// can show nothing stale, because the card re-reads both claims on every pass.
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHY A CLAIM AND NOT A SECOND CONTROL (unchanged)
// ═══════════════════════════════════════════════════════════════════════════════════════
// The two switches are produced by ONE pure module (`envelopeVisibilityControl.ts`) and
// concatenated into the singleton buildable-envelope card's markup by `GISAreaLayout.ts`.
// The Parcel Law tab RE-PARENTS that card's slot into question 2. So the control the founder
// is looking at is question 2's, and the surface he wants it on is question 1's — one screen
// apart, on the same scrolling panel.
//
//   ⛔ RENDER A SECOND ONE. Contract-legal (C115 §2.3(g)) and still wrong here, because both
//      instances are on the SAME panel at the same time, and the card does not subscribe to
//      the visibility authority — a write from question 1 would leave question 2's switches
//      reading ON while the state is OFF.
//
//   ⭐ CLAIM THE JOB. Exactly one surface DISPLAYS the control at a time. That is C19 §5.7
//      clause 1's own remedy for a two-host mode — *"a host arbiter or a second card instance,
//      never a copied renderer"* — and C115-87 restates it. There is still ONE producer, ONE
//      authority (`envelopeVisibility.ts`) and ONE pair of persisted booleans.
//
// ⛔ THIS IS NOT VISIBILITY STATE AND MUST NEVER BECOME IT. `envelopeVisibility.ts` answers
// *"is the buildable envelope drawn on the plot?"* — a persisted user intent about the MODEL.
// This module answers *"which surface is currently drawing the switches?"* — session-scoped
// view chrome that nothing persists and nothing renders into the scene.
//
// P4 — no `(window as any)`; this module touches no global. P6 — it writes no store and
// dispatches no command. P7 — this is view chrome, deliberately NOT a visibility intent.

import {
    __resetEnvelopeCardJobHostForTests,
    claimEnvelopeCardJob,
    envelopeCardJobClaimed,
    releaseEnvelopeCardJob,
    subscribeEnvelopeCardJobHost,
} from './envelopeCardJobHost';

/**
 * ⭐ THE ONE READ. Is another surface currently DISPLAYING the SHOW ON THE PLOT control?
 * Self-healing: a claim whose element has left the document is dropped, never kept.
 */
export function plotDisplayControlsClaimed(): boolean {
    return envelopeCardJobClaimed('plot-display');
}

/** Claim the job for `host`. Idempotent for the same element; last claimer wins. */
export function claimPlotDisplayControls(host: Element, label: string): void {
    claimEnvelopeCardJob('plot-display', host, label);
}

/** Release the job, but ONLY if `host` is the current claimant (C19 §5.7 clause 2). */
export function releasePlotDisplayControls(host: Element): void {
    releaseEnvelopeCardJob('plot-display', host);
}

/**
 * Subscribe to claim changes. Used by the card's host so the card re-renders the moment a job
 * becomes its own again. ⚠ Fires on a change to ANY card job — see the header.
 */
export function subscribePlotDisplayControlsHost(fn: () => void): () => void {
    return subscribeEnvelopeCardJobHost(fn);
}

/** Test-only reset (every card job and every listener). Never called in production. */
export function __resetPlotDisplayControlsHostForTests(): void {
    __resetEnvelopeCardJobHostForTests();
}
