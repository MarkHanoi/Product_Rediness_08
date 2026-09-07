// §PLOT-DISPLAY-CONTROLS-HOST (C115 §1.4 `C115-151`/`C115-153` · C19 §5.7 clause 1 · C115-87)
// — WHICH SURFACE IS CURRENTLY SHOWING THE "SHOW ON THE PLOT" CONTROL.
//
// Founder 2026-09-07, on the Parcel Law panel: the SHOW ON THE PLOT switches belong in
// section ① — *"What is this plot?"* — not beside the buildability determination.
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHY A CLAIM AND NOT A SECOND CONTROL
// ═══════════════════════════════════════════════════════════════════════════════════════
// The two switches are produced by ONE pure module (`envelopeVisibilityControl.ts`) and
// concatenated into the singleton buildable-envelope card's markup by `GISAreaLayout.ts`.
// The Parcel Law tab RE-PARENTS that card's slot into question 2. So the control the founder
// is looking at is question 2's, and the surface he wants it on is question 1's — one screen
// apart, on the same scrolling panel.
//
// Two ways to put it in question 1 were available and only one of them is honest:
//
//   ⛔ RENDER A SECOND ONE. Contract-legal (C115 §2.3(g): the same subject writing the same
//      store in two stages is REQUIRED, not a duplication) and still wrong here, because both
//      instances are on the SAME panel at the same time. Worse, only one of them would be
//      truthful at a time: the card does not subscribe to the visibility authority — it
//      repaints from its own click handler — so a write from question 1 would leave question
//      2's switches reading ON while the state is OFF. A lying control one screen away is a
//      strictly worse outcome than the placement complaint it was meant to fix.
//
//   ⭐ CLAIM THE JOB. Exactly one surface DISPLAYS the control at a time, and the surface that
//      does is the one the reader is looking at. That is C19 §5.7 clause 1's own remedy for a
//      two-host mode — *"a host arbiter or a second card instance, never a copied renderer"* —
//      and C115-87 restates it. There is still ONE producer, ONE authority
//      (`envelopeVisibility.ts`) and ONE pair of persisted booleans. What is arbitrated is
//      WHERE the switches are drawn, which is a different question from what they mean.
//
// ⛔ THIS IS NOT VISIBILITY STATE AND MUST NEVER BECOME IT. `envelopeVisibility.ts` answers
// *"is the buildable envelope drawn on the plot?"* — a persisted user intent about the MODEL.
// This module answers *"which surface is currently drawing the switches?"* — session-scoped
// view chrome that nothing persists and nothing renders into the scene. Merging the two would
// be the L-1170 shape (one question, four answers) rebuilt from the other end.
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// ⭐ IT SELF-HEALS, BY THE SAME RULE `getForma3dHostEl` USES
// ═══════════════════════════════════════════════════════════════════════════════════════
// The claim is held BY ELEMENT, not by a string id, and a claim whose element has left the
// document is not a claim. That is the `document.contains(host)` discipline the envelope
// card's re-homing already relies on (GISAreaLayout `getForma3dHostEl`), and it is what makes
// the failure mode safe: if a claimant is ever torn down without releasing — a throw inside a
// dispose, a surface removed by something that does not know about this module — the NEXT card
// render finds the claim stale, drops it, and the card carries the switches again. The control
// can go missing for at most one render, and never permanently.
//
// P4 — no `(window as any)`; this module touches no global. P6 — it writes no store and
// dispatches no command. P7 — this is view chrome, deliberately NOT a visibility intent.

/** The element that claimed the job, or `null`. Held as an element SO THE CLAIM CAN GO STALE. */
let claimant: Element | null = null;
/** A human label for the claiming surface, for the console line only. Never a decision input. */
let claimantLabel = '';

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
    for (const fn of [...listeners]) {
        try {
            fn();
        } catch (e) {
            // One surface that cannot repaint must never stop the others — the rule
            // `envelopeVisibility.ts` states for its own notifier.
            console.warn('[site][plot-display-host] listener threw (non-fatal):', e);
        }
    }
}

/**
 * ⭐ THE ONE READ. Is another surface currently DISPLAYING the SHOW ON THE PLOT control?
 *
 * Self-healing: a claim whose element has left the document is dropped here, so a claimant
 * that died without releasing costs at most one render, never the control.
 */
export function plotDisplayControlsClaimed(): boolean {
    if (claimant === null) return false;
    const connected = typeof claimant.isConnected === 'boolean' ? claimant.isConnected : true;
    if (!connected) {
        console.log(
            `[site][plot-display-host] §PLOT-DISPLAY-CONTROLS-HOST — the claim held by `
                + `"${claimantLabel}" is STALE (its element left the document); dropping it, so the `
                + `envelope card carries the switches again.`,
        );
        claimant = null;
        claimantLabel = '';
        // Deliberately no `notify()` here: this is a read, and a read that fires listeners can
        // re-enter the render that asked. The next real claim/release notifies.
        return false;
    }
    return true;
}

/**
 * Claim the job for `host`. Idempotent for the same element.
 *
 * ⚠ LAST CLAIMER WINS, and that is the same rule the singleton card itself follows
 * (`pryzmMountEnvelopeCard`). Two surfaces that both want to draw the switches is exactly the
 * two-hosts-open-at-once case C115-89 records as an unfixed property of this panel; this module
 * does not fix it and must not be described as fixing it — it only guarantees that ONE of them
 * draws, never both.
 */
export function claimPlotDisplayControls(host: Element, label: string): void {
    if (claimant === host) {
        claimantLabel = label;
        return;
    }
    claimant = host;
    claimantLabel = label;
    console.log(
        `[site][plot-display-host] §PLOT-DISPLAY-CONTROLS-HOST — "${label}" now displays the `
            + `SHOW ON THE PLOT switches; ${listeners.size} surface(s) notified.`,
    );
    notify();
}

/**
 * Release the job, but ONLY if `host` is the current claimant.
 *
 * ⛔ THE GUARD IS THE POINT. A host that released unconditionally would evict whichever OTHER
 * surface had claimed since — the precise failure C19 §5.7 clause 2 exists to prevent, and the
 * reason the Parcel Law tab hands the envelope card back conditionally rather than always.
 */
export function releasePlotDisplayControls(host: Element): void {
    if (claimant !== host) return;
    const label = claimantLabel;
    claimant = null;
    claimantLabel = '';
    console.log(
        `[site][plot-display-host] §PLOT-DISPLAY-CONTROLS-HOST — "${label}" released the SHOW ON `
            + `THE PLOT switches; the envelope card carries them again.`,
    );
    notify();
}

/**
 * Subscribe to claim changes. Used by the card's host so the card re-renders the moment the
 * switches become its job again — without which a released claim would show no control until
 * some unrelated repaint happened to run.
 */
export function subscribePlotDisplayControlsHost(fn: Listener): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

/** Test-only reset. Never called in production. */
export function __resetPlotDisplayControlsHostForTests(): void {
    claimant = null;
    claimantLabel = '';
    listeners.clear();
}
