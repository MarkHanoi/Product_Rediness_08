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
//      parcel-boundary commit frames it (via renderFormaMassing(true) →
//      §GLOBE-FIT-BUILDING flyToBoundingSphere), AND any LATER commit whose plot centroid
//      moved to a genuinely new location re-frames (the founder's "select a point not in
//      the original circle" — a fresh parcel outside the framed area). In-place edits of
//      the SAME plot (zoning recompute, layout changes, an identical re-commit) fall back
//      to the no-re-fly path so continuous edits never yank the camera (L-416).

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

/** The two facts that decide whether the site-authoring split may EXIST yet. */
export interface SiteAuthoringSplitMountState {
    /**
     * `panelDefaults.appPhase() === 'onboarding-globe'` — the guided setup flow is
     * running and the PRYZM Earth globe is a FULL-BLEED surface, not a pane.
     */
    readonly onboardingGlobePhase: boolean;
    /**
     * The model has a Site (`siteModelStore.getSite() !== null`).
     *
     * ⭐ SITE-EXISTS, NOT "the location is a real lat/lon", and the difference is
     * load-bearing. The two onboarding paths that legitimately need the split commit
     * DIFFERENT things immediately before asking for it: §22's reveal anchors a real
     * geocoded location (`dispatchSiteLocation`), while "Draw it on the map" with no
     * location calls `ensureSite()`, which seeds `{0, 0}` ON PURPOSE. A lat/lon test
     * would either accept the 0/0 sentinel — and so test nothing — or refuse the
     * second path and leave the user on the drawing step with no map (L-10721 again).
     */
    readonly siteCommitted: boolean;
}

/**
 * §ONBOARDING-IS-FULL-BLEED (L-13000) — may the site-authoring split MOUNT now?
 *
 * THE DEFECT (founder 2026-09-06, two screenshots): the split mounted while the user
 * was still on the onboarding LOCATION step, reserving the right half for a 3D Site
 * pane with nothing to paint while the full-bleed globe kept the left. His canvas
 * walked `1019 → 557 → 277 → 280 → 346 → 374` and twice reached `0x0`. His
 * requirement: *"AT THIS STAGE THE VIEW IS ALWAYS IN 'AUTHOR' FULL VIEW WITH THE
 * EARTH"* — no split, no analysis panel, until the flow reaches the step that needs
 * one.
 *
 * ⛔ THE CALLER MUST SKIP THE MOUNT, NOT HIDE THE SHELL. A mounted shell still
 * re-targets the SINGLE Cesium container (§L-412 `reparentContainerTo`) and still
 * drives the resize cascade, so a `display: none` would leave every measurement above
 * exactly where it was. This is the strong form of absence the launcher rail already
 * uses (§UX1-PANEL-DEFAULTS D6).
 *
 * ⚠ THE PHASE ALONE IS NOT THE ANSWER, and a future edit must not simplify it to one:
 * §22's zoom-then-split reveal mounts DURING the guided flow BY DESIGN (the founder's
 * own choreography — the globe owns the screen for the whole flight, then the split
 * appears). Refusing on the phase alone would delete that. The reveal passes this gate
 * by CONSTRUCTION rather than by luck: `runSiteRevealSequence`'s order is contractual
 * and asserted — anchor-site-location precedes mount-split — and the draw step's
 * `ensureSite()` likewise precedes its own mount.
 */
export function shouldMountSiteAuthoringSplit(state: SiteAuthoringSplitMountState): boolean {
    // Outside the guided globe flow the split is ordinary editor chrome — never gated.
    if (!state.onboardingGlobePhase) return true;
    return state.siteCommitted;
}

/** A point in the scene's XZ ground plane (metres, LTP-local). */
export interface XZPoint {
    readonly x: number;
    readonly z: number;
}

/**
 * Default re-frame distance (metres). A newly committed parcel whose centroid is at
 * least this far from the last-framed one counts as a NEW location worth a fresh fly; a
 * re-commit of the SAME plot (centroid ~unchanged) stays put (no jitter). 5 m sits well
 * above numeric noise / an identical re-commit yet below any real plot relocation.
 */
export const DEFAULT_PANED_REFRAME_THRESHOLD_M = 5;

/**
 * Simple average centroid of a scene-XZ ring (null if fewer than 3 points). Pure — used
 * by the caller to derive the plot centroid from the committed boundary so the framing
 * decision can compare "did the plot move to a new location?". A vertex average (not
 * area-weighted) is sufficient: we only need a stable per-plot anchor to diff against.
 */
export function ringCentroidXZ(ring: ReadonlyArray<XZPoint> | null | undefined): XZPoint | null {
    if (!ring || ring.length < 3) return null;
    let sx = 0;
    let sz = 0;
    for (const p of ring) {
        sx += p.x;
        sz += p.z;
    }
    return { x: sx / ring.length, z: sz / ring.length };
}

export interface PanedSiteFrameInput {
    /** The live-update source event (e.g. 'site.parcel-boundary-set', 'site.zoning-updated'). */
    readonly source: string;
    /** The 3D Site (Cesium) is currently hosted in a site-authoring pane. */
    readonly site3dPaned: boolean;
    /** Centroid (scene-XZ) of the just-committed plot, or null if it can't be read. */
    readonly newCentroid: XZPoint | null;
    /** Centroid the camera was last framed to this mount, or null if never framed yet. */
    readonly lastFramedCentroid: XZPoint | null;
    /** Re-frame when the new centroid is ≥ this far (m) from the last-framed one. */
    readonly reframeThresholdM?: number;
}

/**
 * Should this paned 3D-Site live-update FRAME the camera (a fly) rather than re-render in
 * place? Only on a parcel-boundary commit into a live pane, AND either (a) the pane has
 * never been framed this mount (it opened at whole-city scale — show THEIR plot), or
 * (b) the plot centroid moved to a genuinely NEW location beyond the re-frame threshold
 * (a fresh parcel outside the framed area — L-416 "a point not in the original circle").
 * An in-place re-commit of the SAME plot, and every non-boundary update (zoning recompute,
 * layout edits), return false → the no-re-fly path (no jitter).
 */
export function shouldFramePanedSiteOnUpdate(input: PanedSiteFrameInput): boolean {
    if (!input.site3dPaned || input.source !== PARCEL_BOUNDARY_SET_EVENT) return false;
    // Never framed this mount → frame (the pane opened at whole-city scale).
    if (!input.lastFramedCentroid) return true;
    // Already framed once: re-frame ONLY when the plot moved to a new location.
    if (!input.newCentroid) return false;
    const threshold = input.reframeThresholdM ?? DEFAULT_PANED_REFRAME_THRESHOLD_M;
    const dx = input.newCentroid.x - input.lastFramedCentroid.x;
    const dz = input.newCentroid.z - input.lastFramedCentroid.z;
    return Math.hypot(dx, dz) >= threshold;
}

/** The minimal event-bus surface the Forma live-update subscription needs. Both the
 *  composed `runtime.events` (a callable `EventSubscription`) and the `window.runtime`
 *  slot satisfy it — `on` returns a callable disposer. */
export interface LiveUpdateEventBus {
    on(event: string, handler: (payload: unknown) => void): () => void;
}

/**
 * §L-412 (root-cause) — resolve the runtime event bus the Forma live-update
 * subscription (frame-to-plot + buildable-envelope render on `site.parcel-boundary-set`)
 * must listen on.
 *
 * WHY THIS EXISTS: the LIVE boot path constructs `GISAreaLayout` via
 * `createMainLayout(props, /* runtime *\/ null)` (initUI.ts), so the CAPTURED runtime is
 * `null` and `runtime?.events` is `undefined`. The Forma live-update subscription then
 * early-returned and NEVER subscribed — so a plot drawn AFTER the 3D-Site pane mounted
 * (the onboarding draw flow) never framed the plot or rendered the purple envelope: the
 * 3D Site stayed whole-city. The composed runtime IS reachable via the `window.runtime`
 * slot (published at `bootstrap()` start, before `initUI` runs), so we fall back to it —
 * the SAME captured-then-window resolution `getFormaBoundary` uses for the store (Bug-2).
 * One C19 spine, no second bus. Pure decision (P8 span-exempt), so it is unit-testable
 * without constructing the heavyweight Cesium/runtime singletons.
 */
export function resolveLiveUpdateEventBus(
    capturedBus: LiveUpdateEventBus | null | undefined,
    windowBus: LiveUpdateEventBus | null | undefined,
): LiveUpdateEventBus | null {
    if (capturedBus && typeof capturedBus.on === 'function') return capturedBus;
    if (windowBus && typeof windowBus.on === 'function') return windowBus;
    return null;
}
