/**
 * @file walkPlanMarker — the ONE reader that decides whether the plan panes may
 *       draw the walking user.
 *
 * §WALK-POSITION-ON-PLAN.  The founder's request was explicit about scope:
 *
 *   "I want a point on plan view about where the user is moving with the camera
 *    — for example in this project I am in ground floor on split view (ONLY IF
 *    WE ARE ON SPLIT VIEW)."
 *
 * ── WHY THIS IS A MODULE AND NOT TWO INLINE CLOSURES ─────────────────────────
 * `PlanViewCanvas` is constructed twice — once by `SplitViewManager` for the
 * secondary pane and once by `PlanViewManager` for the primary pane — and BOTH
 * are on screen while split view is active, so either can be the pane showing
 * the plan.  §L-1176 is the standing record of what happens when a per-view
 * capability is wired into one of them: the dashed violet parcel boundary drew
 * in the split pane and silently not in the main pane, same project, same level,
 * both visible at once.  It was not hidden or mis-styled — it was never asked
 * for.  One shared reader, injected into both panes, is the cure that defect
 * named, and this file is that reader for the walk marker.
 *
 * ── WHY THE SPLIT-VIEW GATE LIVES HERE ───────────────────────────────────────
 * "Is split view active?" is an app-layer fact.  `PlanViewCanvas` is the pure
 * Canvas2D renderer in `@pryzm/core-app-model`, a lower layer, and it must not
 * reach up to ask.  Same injection contract as `siteContextProvider`: the app
 * decides, the renderer draws what it is handed.
 */

import { readWalkPose, type WalkPose } from '@pryzm/core-app-model';

/**
 * The walking user's pose IF the plan panes should show it, else `null`.
 *
 * Returns `null` — meaning "draw nothing" — whenever:
 *   • split view is not active (the founder's explicit scope). Full-screen plan
 *     hides the 3-D pane entirely, so there is no walk for a marker to track;
 *   • walk mode is not engaged, in which case the beacon is already `null`.
 *
 * Read fresh on every paint, exactly like `readSiteContextRings`, so entering or
 * leaving either mode takes effect on the next frame with no invalidation call
 * and no listener to leak.
 */
export function readWalkPlanMarker(): WalkPose | null {
    try {
        const svm = window.splitViewManager as { isActive?: boolean } | undefined;
        if (!svm?.isActive) return null;
        return readWalkPose();
    } catch {
        return null;
    }
}
