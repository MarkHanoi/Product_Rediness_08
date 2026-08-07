// §FIX-SITE-PLAN-OVERLAY-ORDER-AND-ENTER-CANVAS (L-258, defect B) — the TERMINAL
// "Finish → enter canvas" transition, owned by the site-plan overlay FLOW itself.
//
// THE PROVEN ROOT CAUSE OF "Finish — enter canvas does not enter the canvas"
// -------------------------------------------------------------------------
// The overlay controller's commit path (SitePlanOverlayController.commitProjectNorth)
// always reaches its host callbacks: it sets Project North, awaits the canvas underlay,
// then calls `onPlacementCommitted`. SiteBoundaryMap2D turned that into ONE side effect:
//
//     runtime.events.emit('site.overlay-placement-committed', {})
//
// and the ONLY subscriber to that event in the entire codebase was an EPHEMERAL listener
// created inside `OnboardingStepController.startOverlayImport()` — i.e. it exists only
// while the first-run wizard is mounted AND only inside its "Overlay a plan/PDF" branch.
//
// So the transition was not "unwired" or "throwing" — it FIRED INTO AN EMPTY BUS. Every
// other way of reaching the same panel (the always-on Plan + Site (GIS) launcher — C06 §7
// — the map's own "Overlay plan / PDF" button, or re-entering the overlay on a project
// that has already been onboarded, which is exactly the "Finished — update & re-enter
// canvas" state the founder saw) had ZERO listeners: Finish created the underlay, wrote
// the Import Manager row, and left the user standing on the map. "The process is corrupted."
//
// THE FIX (architectural, not a patch): a flow owns its own terminal transition. This
// module IS that transition — one idempotent implementation, called by the map host on
// every commit, and reused by the onboarding wizard (which now only disposes itself).
//
// The landing state is the founder's concrete success criterion:
//   3D BIM canvas  +  SPLIT VIEW (3D main pane + plan pane)  +  the imported plan
//   visible as an underlay in BOTH panes.
// The underlay itself is already committed through CREATE_UNDERLAY on the command bus (P6)
// by createPlanCanvasUnderlayFromSiteOverlay, BEFORE this runs — we only switch the view.

// §STARTUP-BUDGET (founder 2026-08-07, 5–10× startup) — passive phase marks; behaviour-free.
import { markStartupPhase, reportStartupBudget } from '../../../engine/startupBudget';

/** The window hooks this transition drives (all registered by GISAreaLayout / initScene). */
interface EnterCanvasHooks {
    pryzmCloseBoundaryMap2D?: () => void;
    pryzmActivateBimView?: (mode?: 'Top' | '3D' | 'Front' | 'Back' | 'Left' | 'Right') => Promise<void> | void;
    pryzmToggleGIS?: (active: boolean) => void;
    splitViewManager?: { isActive?: boolean; activate?: () => void };
    viewController?: { zoomToFit?: (opts?: { animate?: boolean }) => Promise<void> | void };
}

/** The minimal runtime shape this module needs (avoids dragging PryzmRuntime into L7.5 UI). */
interface PlacementRuntime {
    readonly events?: {
        emit(event: 'site.overlay-placement-committed', payload: Record<string, never>): void;
    };
}

/**
 * §FIX-SITE-PLAN-OVERLAY-ORDER-AND-ENTER-CANVAS (L-258 B) — THE single handler for the overlay
 * panel's "✓ Finish — enter canvas". Called by the map host (SiteBoundaryMap2D) on every commit,
 * from EVERY entry point.
 *
 * It does two things, in this order:
 *   1. announce the commit on the runtime bus — the onboarding wizard (when it happens to be
 *      mounted) listens so it can dispose itself and stop owning the screen;
 *   2. PERFORM THE LANDING ITSELF. This is the fix: the announcement used to be the ONLY thing
 *      that happened, and its one listener existed only inside the wizard — so with no wizard,
 *      nothing moved.
 *
 * Idempotent: when the wizard IS mounted it also calls `enterCanvasWithSitePlanUnderlay()` (from
 * its listener, in this same tick) and the in-flight guard collapses both into one landing.
 */
export function onSitePlanPlacementCommitted(runtime: PlacementRuntime | null): Promise<void> {
    try {
        runtime?.events?.emit('site.overlay-placement-committed', {});
    } catch (err) {
        console.warn('[site-overlay→canvas] §ENTER-CANVAS: placement-committed emit threw (non-fatal):', err);
    }
    return enterCanvasWithSitePlanUnderlay();
}

/** In-flight landing, so the map host + the onboarding wizard calling this in the same
 *  tick perform ONE transition (and one zoom-to-fit), not two. Cleared once settled so a
 *  later re-import can land again. */
let inFlight: Promise<void> | null = null;

/**
 * Land the user in the PRYZM canvas with the just-committed site-plan underlay:
 *   1. tear down the 2D overlay map;
 *   2. EXIT GIS and activate the **3D** BIM view (routes through GISAreaLayout.activateView
 *      → toggleGIS(false) → ViewController.activate, the single view authority);
 *   3. open the SPLIT VIEW so the plan pane sits beside the 3D pane (the secondary pane
 *      renders the Canvas2D plan projection, which repaints on the
 *      `pryzm-floor-plan-underlay-placed` event the underlay bridge emits);
 *   4. frame the camera on the plan.
 *
 * Best-effort + fully guarded at every step: a missing hook degrades to a plain GIS exit
 * rather than stranding the user on the map. Never throws.
 */
export function enterCanvasWithSitePlanUnderlay(): Promise<void> {
    if (inFlight) return inFlight;
    inFlight = runLanding().finally(() => { inFlight = null; });
    return inFlight;
}

async function runLanding(): Promise<void> {
    const w = window as unknown as EnterCanvasHooks;
    console.log('[site-overlay→canvas] §ENTER-CANVAS: landing — close map → exit GIS → 3D view → split (3D + plan) → frame.');

    // 1) Tear down the 2D overlay map (it is absolutely positioned over the editor #container).
    try {
        w.pryzmCloseBoundaryMap2D?.();
    } catch (err) {
        console.warn('[site-overlay→canvas] §ENTER-CANVAS: closing the 2D map threw (non-fatal):', err);
    }

    // 2) Exit GIS + activate the 3D BIM view (the founder's "3D PRYZM view").
    try {
        if (typeof w.pryzmActivateBimView === 'function') {
            await w.pryzmActivateBimView('3D');
        } else {
            console.warn('[site-overlay→canvas] §ENTER-CANVAS: pryzmActivateBimView missing — degrading to a plain GIS exit.');
            w.pryzmToggleGIS?.(false);
        }
    } catch (err) {
        console.warn('[site-overlay→canvas] §ENTER-CANVAS: BIM view activation failed (non-fatal):', err);
        try { w.pryzmToggleGIS?.(false); } catch { /* ignore */ }
    }

    // 3) Open the plan + 3D SPLIT view. `isActive` is a boolean getter on SplitViewManager;
    //    the split auto-opens on project load, so activating an already-open split would
    //    needlessly rebuild it.
    try {
        const svm = w.splitViewManager;
        if (svm && typeof svm.activate === 'function' && !svm.isActive) svm.activate();
    } catch (err) {
        console.warn('[site-overlay→canvas] §ENTER-CANVAS: split-view activation failed (non-fatal):', err);
    }

    // 4) Frame the camera on the just-placed plan.
    try {
        await w.viewController?.zoomToFit?.({ animate: false });
    } catch (err) {
        // ── ADR-0299 — a FAILED USER-FACING ACTION IS NOT "non-fatal" ──────────
        // This used to log `zoom-to-fit failed (non-fatal)` at warn level and carry on.
        // It hid `TypeError: t is not iterable` (L-745) for as long as the bug existed,
        // while the founder — who had just landed in a 3D view framed 6,542 km from
        // their walls — pressed Fit All and watched nothing happen.
        //
        // Framing is not decoration on this path: it is the difference between landing
        // on your site and landing in orbit. Log it as an ERROR with the real cause, so
        // it cannot rot behind a warn line nobody reads. We still do not re-throw — the
        // user is already in the editor and aborting the transition would be worse than
        // an unframed camera — but the failure is now visible and attributable.
        console.error(
            '[site-overlay→canvas] §ENTER-CANVAS: zoom-to-fit FAILED — the 3D view may be left ' +
            'unframed (this is a defect, not a cosmetic warning):',
            err,
        );
    }

    console.log('[site-overlay→canvas] §ENTER-CANVAS: landed — 3D + plan split view, plan underlay in both panes.');
    // §STARTUP-BUDGET — the startup pipeline's terminal phase: the usable editor. Print the
    // whole run as one table (idempotent — only the first arrival of a run reports).
    markStartupPhase('enter-canvas');
    reportStartupBudget('enter-canvas');
}
