// §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412, C59) — PURE decisions for the site-authoring
// two-pane layout (2D map LEFT · 3D Site RIGHT). No DOM / no THREE / no Cesium / no
// I/O — mirrors the `paneViewModel` / `globePlacementDecisions` pure-decision pattern
// so the founder-visible behaviour is unit-testable WITHOUT constructing the
// heavyweight singletons (OBC.World + THREE for SplitViewManager; a live Cesium viewer
// for the Forma framing). Pure decisions are P8 span-exempt.
//
// Two decisions live here:
//   1. shouldAutoOpenSplitView — whether the legacy Canvas2D plan pane's project-load
//      AUTO-open should fire. During SITE authoring the screen must show EXACTLY two
//      panes (2D map + 3D Site); the redundant legacy plan pane must be OFF until walls
//      exist. The site-authoring split SUPPRESSES the auto-open, and this predicate is
//      evaluated at FIRE time (inside the idle callback) so a site-pane mount that
//      lands AFTER the callback was scheduled still wins the race.
//   2. shouldFramePanedSiteOnUpdate — whether a paned 3D-Site live-update should FRAME
//      the camera to the plot. The pane opens zoomed out (whole-city scale); the FIRST
//      parcel-boundary commit frames it ONCE (via renderFormaMassing(true) →
//      §GLOBE-FIT-BUILDING flyToBoundingSphere); every subsequent zoning/edit update
//      falls back to the no-re-fly path so continuous edits never yank the camera.

/** The parcel-commit event that first defines the plot extent (worth framing to). */
export const PARCEL_BOUNDARY_SET_EVENT = 'site.parcel-boundary-set';

export interface SplitViewAutoOpenState {
    /** The legacy Canvas2D plan pane is already open. */
    readonly isActive: boolean;
    /** The site-authoring 2-pane layout has suppressed the auto-open. */
    readonly autoOpenSuppressed: boolean;
}

/**
 * Should the project-load auto-open activate the legacy Canvas2D plan pane NOW?
 * Only when it isn't already open AND the site-authoring split hasn't suppressed it.
 * Evaluate this at FIRE time (inside the requestIdleCallback / setTimeout), NOT only at
 * schedule time — the site panes may mount between the schedule and the fire, and the
 * suppression must still win (the ordering race the task calls out).
 */
export function shouldAutoOpenSplitView(state: SplitViewAutoOpenState): boolean {
    return !state.isActive && !state.autoOpenSuppressed;
}

export interface PanedSiteFrameInput {
    /** The live-update source event (e.g. 'site.parcel-boundary-set', 'site.zoning-updated'). */
    readonly source: string;
    /** The 3D Site (Cesium) is currently hosted in a site-authoring pane. */
    readonly site3dPaned: boolean;
    /** The pane has already been framed to the plot once this mount. */
    readonly alreadyFramed: boolean;
}

/**
 * Should this paned 3D-Site live-update FRAME the camera (a one-shot fly) rather than
 * re-render in place? Yes only on the FIRST parcel-boundary commit into a live pane —
 * so the user sees THEIR plot + envelope instead of the whole city. Every later update
 * (zoning recompute, layout edits) returns false → the no-re-fly path (no jitter).
 */
export function shouldFramePanedSiteOnUpdate(input: PanedSiteFrameInput): boolean {
    return (
        input.site3dPaned &&
        input.source === PARCEL_BOUNDARY_SET_EVENT &&
        !input.alreadyFramed
    );
}
