/**
 * halfCanvasSplitViewPolicy.ts — §HALF-CANVAS-OWNS-THE-RIGHT-EDGE (L-12915 · STR §24.1 item 2)
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THE DEFECT THIS EXISTS FOR, MEASURED IN SOURCE
 * ═════════════════════════════════════════════════════════════════════════════
 * Two independent subsystems claim the SAME pixels and neither knows the other:
 *
 *   • A half-canvas WORKSPACE MODE. `workspaceModes.ts` says it in words —
 *     *"'half' — canvas at 50%, a fixed right-hand surface takes the other
 *     half."* Inspect mounts `#aud-stack`; Analysis mounts `#anl-surface`
 *     (`position: fixed; right: 0; width: 50%; z-index: 50`).
 *
 *   • The SPLIT VIEW secondary pane. `.svp-pane` is `position: fixed; right: 0;
 *     width: 40%; z-index: 1` (`styles/panels/splitView.ts`).
 *
 * Both are `right: 0`. The pane's z-index is 1 and the surface's is 50, so in a
 * half-canvas mode the pane is drawn ENTIRELY BEHIND the panel — a live plan
 * view, ticking every frame, that the reader cannot see.
 *
 * ⭐ AND IT IS NOT ONLY OCCLUSION — THE TWO FIGHT OVER ONE INLINE STYLE.
 *   · `WorkspaceController._applyLayout` sets `#container.style.width = '50%'`
 *     for a half-canvas mode, and `''` for a full one.
 *   · `SplitViewManager._buildDOM` sets `#container.style.width = '60%'`, and
 *     `_teardownDOM` sets it back to `''`.
 * Same node, same property, two owners, no protocol. Measured consequences:
 * activating the pane while in Analysis widens the viewport to 60% and slides
 * its right tenth under the panel; leaving Analysis while the pane is open
 * clears the pane's own 60% and the canvas expands across it.
 *
 * The founder meets this on the first click. From the PARCEL LAW tab the "BIM
 * 3D" segment used to dispatch `site.bim-split` → `applyBimDualPane` →
 * `splitViewManager.activate()`: a pane opens behind the panel and the canvas
 * jumps. Nothing visible happens except that the model moves.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THE RULE
 * ═════════════════════════════════════════════════════════════════════════════
 *   A half-canvas mode OWNS the right edge. While one is active the split-view
 *   secondary pane is closed, and it is REOPENED on return to a full-canvas mode
 *   if — and only if — the shell is the one that closed it.
 *
 * ⛔ WHY THIS IS NOT `suppressAutoOpen()`. That seam already exists (§L-412 /
 * C59: the site-authoring two-pane layout owns the screen and suppresses the
 * project-load auto-open) and it was the obvious thing to reach for. It is a
 * SINGLE BOOLEAN LATCH with two existing claimants — `GISAreaLayout`'s site
 * panes and `OnboardingStepController`. A third claimant calling
 * `allowAutoOpen()` on mode exit would clear a suppression it did not set, which
 * is the two-owners-one-flag defect this file was written to remove, moved one
 * level down. So the shell tracks ITS OWN claim, in its own field, and touches
 * the manager only through `activate()` / `deactivate()` — the same two calls
 * the pane's own close button makes.
 *
 * ⚠ WHAT THIS DELIBERATELY DOES NOT DO.
 *   1. It does not reach `canvas: 'hidden'` (Data). There is no canvas there and
 *      the workbench's own geometry has not been measured by this lane; a policy
 *      that acted on an unmeasured surface would be a guess wearing a rule.
 *      Stated rather than left as a silent `else`.
 *   2. It is applied at MODE CHANGE, not continuously. Something that activates
 *      the pane WHILE a half-canvas mode is up (the GIS bar's `site.bim-split`,
 *      say) still puts it behind the panel until the next mode change. Closing
 *      that needs a subscription to `split-view-activated`, which is a different
 *      decision with a different owner; it is named in this lane's report as an
 *      open seam rather than half-built here.
 *
 * L7 file. PURE: no DOM, no THREE (P2), no rAF (P3), no `(window as any)` (P4),
 * no store writes (P6). One exported function, one span-free decision — it is
 * called from inside `_applyLayout`, whose own span covers it.
 */

import type { WorkspaceCanvasLayout } from './workspaceModes';

/** What the shell should do to the split-view pane for the mode being entered. */
export type SplitViewShellAction =
    /** Close it: a half-canvas surface is about to cover it. */
    | 'close'
    /** Reopen it: the shell closed it, and the right edge is free again. */
    | 'reopen'
    /** Do nothing — the pane's state is the user's, not the shell's. */
    | 'leave';

export interface SplitViewShellState {
    /** The canvas layout the mode being ENTERED declares (`workspaceModes.ts`). */
    readonly canvas: WorkspaceCanvasLayout;
    /** Is the secondary pane open right now? (`SplitViewManager.isActive`) */
    readonly splitViewActive: boolean;
    /**
     * Did the SHELL close it — as opposed to the user, the GIS site panes or
     * onboarding? Only a pane the shell closed may be reopened by the shell.
     */
    readonly closedByShell: boolean;
}

/**
 * The decision AND the shell's next claim, together.
 *
 * ⚠ THE CLAIM IS RETURNED, NOT LEFT TO THE CALLER TO GUESS. An earlier shape of
 * this function returned only the action, and it carried a stale-claim bug: if the
 * pane was reopened by someone else (the GIS bar, the user) while the shell still
 * believed it held a claim, the next trip through a full-canvas mode would reopen a
 * pane the shell had never closed. Returning the next claim makes the state machine
 * TOTAL — every input maps to (action, claim) — and testable without a DOM.
 */
export interface SplitViewShellDecision {
    readonly action: SplitViewShellAction;
    /** What `closedByShell` must be AFTER the action is performed. */
    readonly closedByShell: boolean;
}

/**
 * Decide what the shell does to the split pane when a workspace mode is applied.
 *
 * Total and pure: every combination of the three inputs returns a decision, and the
 * caller performs it. Written as a decision so the rule can be TESTED without a
 * renderer, a DOM or a `SplitViewManager` — the reason `siteAuthoringPaneDecisions.ts`
 * was extracted for the §L-412 rule next door.
 */
export function decideSplitViewForCanvas(state: SplitViewShellState): SplitViewShellDecision {
    if (state.canvas === 'half') {
        // The right edge is about to be taken. An open pane goes behind the panel.
        // Closing it CLAIMS it; finding it already closed claims nothing, because a
        // pane the user closed is not the shell's to reopen.
        return state.splitViewActive
            ? { action: 'close', closedByShell: true }
            : { action: 'leave', closedByShell: state.closedByShell };
    }
    if (state.canvas === 'full') {
        // The right edge is free again. Restore only what the shell itself took — and
        // release the claim either way, because once we are back in a full-canvas mode
        // the shell is no longer holding anything.
        if (state.closedByShell && !state.splitViewActive) {
            return { action: 'reopen', closedByShell: false };
        }
        return { action: 'leave', closedByShell: false };
    }
    // 'hidden' — see the header, note 1. Not measured, therefore not acted on, and the
    // claim is carried THROUGH: Analysis → Data → Author must still restore the pane.
    return { action: 'leave', closedByShell: state.closedByShell };
}
