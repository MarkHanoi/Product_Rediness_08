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

// §SINGLE-VIEW-IS-A-LAYOUT-FACT (L-13053) — a TYPE-ONLY import of the pure layout vocabulary.
// This file stays pure: `paneViewModel.ts` is itself a no-DOM / no-renderer module.
import type { SitePaneMode } from './paneViewModel';

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

/** The one field of the runtime the `siteCommitted` question needs. */
export interface SiteStoreHolder {
    readonly siteModelStore?: { getSite?: () => unknown } | null;
}

/**
 * §SITE-CHECK-RUNS-BEFORE-THE-SITE-IS-ANCHORED (L-13002) — READ `siteCommitted` THE WAY
 * THE COMMIT WROTE IT.
 *
 * ⛔ THE DEFECT THIS EXISTS TO PREVENT, and it is the SIXTH recurrence of one shape in
 * this subsystem (§L-1580 · §L-12916 · `getFormaBoundary` · `buildSiteDataBlock` ·
 * {@link resolveLiveUpdateEventBus} · this). The live boot path constructs `GISAreaLayout`
 * via `createMainLayout(props, /* runtime *\/ null)` (`initUI.ts` → `Layout.ts:86`), so the
 * CAPTURED runtime is `null` and `runtime?.siteModelStore` is `undefined`. The L-13000
 * gate's `siteCommitted` input read exactly that — so it answered **`false` on every
 * production session, no matter what had been committed**, and
 * {@link shouldMountSiteAuthoringSplit} refused the split at the §22 reveal and at the
 * draw step, the two places its own refusal text names as the ones that mount.
 *
 * ⭐ THE ORDERING CLAIM IN L-13000 WAS TRUE; THE READ WAS NOT. `runSiteRevealSequence`
 * DOES run `anchor-site-location` → `dispatchSiteLocation` → `ensureSite` before
 * `mount-split`, and that write lands in `resolveSiteContext`'s store — which resolves
 * `runtimeArg ?? window.runtime`. The gate then asked a different object.
 *
 * ⚠ EITHER HOLDER COUNTS, DELIBERATELY. The commit resolves `captured ?? window`; a
 * reader that resolved only `captured` when captured is non-null could still miss a Site
 * written against `window.runtime` by a surface that was handed no runtime of its own
 * (the onboarding draw step is exactly that). "Does the model have a Site?" is a question
 * about the app, and production has ONE runtime — the two reads can only diverge in the
 * null-captured case this function exists for.
 *
 * Pure (P8 span-exempt): no `window` access of its own — the caller passes both holders,
 * which is what makes the null-captured case assertable without a live runtime.
 */
export function isSiteCommittedInModel(
    capturedRuntime: SiteStoreHolder | null | undefined,
    windowRuntime: SiteStoreHolder | null | undefined,
): boolean {
    for (const holder of [capturedRuntime, windowRuntime]) {
        const getSite = holder?.siteModelStore?.getSite;
        if (typeof getSite !== 'function') continue;
        let site: unknown = null;
        try {
            site = getSite.call(holder!.siteModelStore) ?? null;
        } catch {
            // A store that throws is not a store that holds a Site. Try the other holder.
            continue;
        }
        if (site !== null) return true;
    }
    return false;
}

// ══════════════════════════════════════════════════════════════════════════════════════
// §PARCEL-COMMITTED-IS-ONE-FACT (L-13086, founder 2026-09-07) — THE DRAW-SURFACE PIN
// RELEASES ON THE COMMITTED BOUNDARY, NOT ON THE GESTURE THAT PRODUCED IT.
// ══════════════════════════════════════════════════════════════════════════════════════
//
// HIS ASK, verbatim: *"pLEASE AS SOON AS THE PARCEL IS SELECTED ENABLE THE USER TO GO TO
// PRYZM 3D AND PRYZM 2D VIEWS"* — sent with the pane switcher open, `2D PRYZM` greyed, and
// his own console reading `site.parcel-boundary-set … area 802.7 m²
// provenance=cadastral/catastro refcat=3332402DF3833C`.
//
// ⛔ THE GATE WAS STALE, NOT REAL, AND ITS OWN COPY SAID SO. The pin
// (§ONBOARDING-STEP-PINS-ITS-SURFACE, L-10720) declares the 2D map load-bearing with the
// sentence *"it stays on screen until you have drawn one or skipped drawing"* — and then
// released on NEITHER of those two events. Its only release was
// `onAppPhaseChanged(() => appPhase() !== 'onboarding-globe')`, i.e. the END OF THE WHOLE
// WIZARD. So between "boundary committed" and "wizard finished" — the entire confirm /
// generate stretch the founder was standing in — the pin refused every choice that would
// move the map out of its pane, printing a reason that had already been satisfied.
// ⭐ A NOTE THAT STILL SAYS "until you have drawn one" AFTER HE HAS DRAWN ONE IS WORSE
// THAN NO NOTE, which is why the copy below moved here with the predicate: one place, so
// the sentence and the condition cannot drift again.
//
// ⚠ THE CADASTRAL-vs-DRAWN ASYMMETRY WAS THE SUSPECT AND IS NOT THE CULPRIT — MEASURED.
// Both routes end at `SiteBoundaryMap2D.commit()` → `dispatchParcelBoundary`, which emits
// `site.parcel-boundary-set` synchronously and writes the SAME `parcel.boundary.polygon`;
// the founder's own log line carries `provenance=cadastral/catastro` on that very event.
// So "parcel committed" IS one fact however the ring arrived — the defect was that NOTHING
// asked it. {@link isParcelBoundaryCommittedInModel} reads the committed ring (route-blind
// by construction: it reads the MODEL, never a gesture, an event source or a provenance),
// and the caller ALSO releases on the event, so a boundary committed after the pin was
// taken releases it too.
//
// ⭐ TWO HALVES, DELIBERATELY, and neither is redundant:
//   · {@link shouldPinDrawSurface} answers "take the pin AT ALL?" — a split mounted when a
//     boundary already exists (re-entering the site, `paneLayoutForPreset('parcel-law')`)
//     must never take a pin it would have to release one tick later.
//   · the caller's `site.parcel-boundary-set` subscription releases a pin ALREADY taken.
// Reading the store alone would miss the founder's case (he committed AFTER the split
// mounted); listening alone would miss the re-entry case. The pair is total.

/** The one field of the runtime the `parcelCommitted` question needs. */
export interface ParcelStoreHolder {
    readonly siteModelStore?: { getSite?: () => unknown } | null;
}

/** The minimum a polygon needs before it bounds any land at all. */
const MIN_BOUNDARY_VERTICES = 3;

/**
 * §PARCEL-COMMITTED-IS-ONE-FACT — is there a COMMITTED parcel boundary in the model?
 *
 * ⚠ "A Site exists" is NOT the same question {@link isSiteCommittedInModel} answers, and
 * the difference is the founder's whole complaint. `ensureSite()` seeds a Site with an
 * EMPTY `parcel.boundary.polygon` on purpose (the "Draw it on the map" path with no
 * location), so a Site-exists test is `true` at STEP 2 — before any plot is drawn — and
 * would release the pin at exactly the moment the pin exists to hold it.
 *
 * ⛔ AND IT READS THE RING, NOT A PROVENANCE, A FLAG OR AN EVENT SOURCE. A cadastral SELECT
 * and a free DRAW write the same `polygon`; keying on anything else is how the two routes
 * would drift apart again.
 *
 * ⚠ EITHER HOLDER COUNTS — the same measured discipline as {@link isSiteCommittedInModel},
 * and for the same reason: the live boot path captures a `null` runtime
 * (`createMainLayout(props, null)`), while the commit resolves `captured ?? window`. A
 * reader that consulted only the captured holder would answer `false` on every production
 * session, which is §SITE-CHECK-RUNS-BEFORE-THE-SITE-IS-ANCHORED (L-13002) exactly.
 *
 * Pure (P8 span-exempt): no `window` access of its own — both holders are parameters.
 */
export function isParcelBoundaryCommittedInModel(
    capturedRuntime: ParcelStoreHolder | null | undefined,
    windowRuntime: ParcelStoreHolder | null | undefined,
): boolean {
    for (const holder of [capturedRuntime, windowRuntime]) {
        const store = holder?.siteModelStore;
        const getSite = store?.getSite;
        if (typeof getSite !== 'function') continue;
        let site: unknown = null;
        try {
            site = getSite.call(store) ?? null;
        } catch {
            // A store that throws is not a store that holds a boundary. Try the other holder.
            continue;
        }
        if (polygonVertexCount(site) >= MIN_BOUNDARY_VERTICES) return true;
    }
    return false;
}

/** `site.parcel.boundary.polygon.length`, defensively — 0 for every shape that is not one. */
function polygonVertexCount(site: unknown): number {
    if (site === null || typeof site !== 'object') return 0;
    const parcel = (site as { parcel?: unknown }).parcel;
    if (parcel === null || typeof parcel !== 'object') return 0;
    const boundary = (parcel as { boundary?: unknown }).boundary;
    if (boundary === null || typeof boundary !== 'object') return 0;
    const polygon = (boundary as { polygon?: unknown }).polygon;
    return Array.isArray(polygon) ? polygon.length : 0;
}

/**
 * §ONBOARDING-STEP-PINS-ITS-SURFACE (L-10720) — the sentence the pin shows the user,
 * verbatim, on every row it refuses.
 *
 * ⛔ IT LIVES BESIDE ITS PREDICATE ON PURPOSE (L-13086). The copy and the release condition
 * were written in two different places and drifted: the sentence promised release on the
 * drawn plot, the code released on the end of the wizard. Anyone changing WHEN the pin
 * lifts now has to walk past the sentence that promises it.
 *
 * ⚠ IT NAMES BOTH ROUTES. "Drawn" alone reads as a refusal to a user who PICKED his plot
 * off the cadastre — which is what the founder did, and what made a satisfied condition
 * look like a broken one.
 */
export const DRAW_SURFACE_PIN_REASON =
    'The 2D site map is where you set your plot — it stays on screen until a plot is '
    + 'committed (drawn, or picked from the cadastre) or you skip drawing. The 3D Site is '
    + 'live beside it.';

/** The two facts that decide whether the 2D draw map is still load-bearing. */
export interface DrawSurfacePinState {
    /** `panelDefaults.appPhase() === 'onboarding-globe'` — the guided flow is running. */
    readonly onboardingGlobePhase: boolean;
    /** A committed parcel boundary exists (see {@link isParcelBoundaryCommittedInModel}). */
    readonly parcelCommitted: boolean;
}

/**
 * §PARCEL-COMMITTED-IS-ONE-FACT (L-13086) — should the 2D draw map be PINNED right now?
 *
 * Only while the guided flow is running AND no plot has been committed yet. Outside the
 * guided flow the map is ordinary editor chrome (the L-10720 rule was always phase-scoped);
 * once a plot exists the step no longer depends on the drawing surface, so pinning it only
 * refuses choices the user is entitled to make.
 */
export function shouldPinDrawSurface(state: DrawSurfacePinState): boolean {
    return state.onboardingGlobePhase && !state.parcelCommitted;
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

/** What the SITE-phase bottom-left split pill knows about its world. */
export interface SiteSplitLauncherState {
    /** `panelDefaults.appPhase() === 'onboarding-globe'` — the guided flow is running. */
    readonly onboardingGlobePhase: boolean;
    /** The model has a Site (see {@link isSiteCommittedInModel}). */
    readonly siteCommitted: boolean;
}

/**
 * §AFTER-LOCATION-LAND-ON-THE-PASTEL-MAP (L-13001, founder 2026-09-06) — may the
 * bottom-left SPLIT pill exist right now?
 *
 * HIS ASK: *"i want to have the split view icon (as we have in pryzm view interface, on
 * the bottom left corner, to activate split view)"*, said about the step AFTER a location
 * resolves.
 *
 * ⭐ THE PREDICATE IS THE L-13000/L-13002 PAIR, REUSED A THIRD TIME — NOT A NEW FLAG.
 * "The guided flow is running AND a Site exists" is exactly the SITE phase: the split has
 * mounted, the pastel 2D map is on the left and the 3D Site on the right. Before a Site
 * exists it is STEP 1 OF 4 and the globe owns the whole screen
 * (§ONBOARDING-IS-FULL-BLEED) — the founder confirmed that view is correct and no pill
 * may appear over it.
 *
 * ⛔ AND IT IS FALSE ON THE CANVAS, WHICH IS THE HALF THAT PREVENTS A COLLISION.
 * `#svp-toggle-button` (initUI) already owns launcher-rail SLOT 0 there — the same corner,
 * the same slot accounting (§FIX-LAUNCHER-COVERS-SPLITVIEW / L-159, C06 §7.2). The two
 * controls are mutually exclusive BY CONSTRUCTION rather than by careful placement: this
 * one exists only while the launcher rail is `absent` (the globe phase), and that one only
 * while it is `open` (the canvas). Never both, so slot 0 is never double-booked.
 *
 * ⚠ THEY ALSO DRIVE DIFFERENT SPLITS, AND THAT IS WHY THIS IS NOT ONE BUTTON WITH TWO
 * MOODS. `#svp-toggle-button` toggles the legacy `splitViewManager` (BIM 3D + floor plan)
 * — the very pane `mountSiteAuthoringPanes` calls `suppressAutoOpen()` on, because during
 * site authoring there are no walls for it to draw (§L-412 Req 1). At the site phase the
 * only split that exists is the site-authoring one, so this pill dispatches THAT pair of
 * declared entry points and nothing else.
 */
export function shouldMountSiteSplitLauncher(state: SiteSplitLauncherState): boolean {
    return state.onboardingGlobePhase && state.siteCommitted;
}

/** The rendered state of a split toggle — what to say, and whether it can act. */
export interface SplitTogglePresentation {
    readonly label: string;
    readonly enabled: boolean;
    readonly pressed: boolean;
    readonly title: string;
}

/** What a split toggle can observe about the split and about its own wiring. */
export interface SplitToggleState {
    /** Is the site-authoring PANE SHELL on screen? A READING, never a remembered command. */
    readonly open: boolean;
    /** `pryzmMountSiteAuthoringPanes` is registered in this session. */
    readonly canOpen: boolean;
    /** `pryzmUnmountSiteAuthoringPanes` is registered in this session. */
    readonly canClose: boolean;
    /**
     * §SINGLE-VIEW-IS-A-LAYOUT-FACT (L-13053) — the THREE-state reading, for a host that can
     * make it. `open` alone cannot distinguish the two states a live shell has once "single
     * view" stops meaning "no shell": a shell showing ONE pane is up (so `open` is true) and
     * is not a split.
     *
     * ⚠ ABSENT ⇒ DERIVED FROM `open`, which is exactly what every caller meant before a shell
     * could be up with one pane. The site-phase pill still reads two states and is unchanged.
     */
    readonly mode?: SitePaneMode;
    /**
     * The host can move between `'split'` and `'single'` THROUGH THE LAYOUT STORE
     * (`pryzmSetSiteAuthoringPaneMode`) instead of tearing the shell down. When false the
     * toggle falls back to its historical open/close pair.
     */
    readonly canSetMode?: boolean;
}

/** The sentence a split toggle shows when it cannot act. Named, never a silent no-op. */
export const SPLIT_TOGGLE_UNAVAILABLE_TEXT =
    'Split is not available from here in this session: the site views have not registered '
    + 'pryzmMountSiteAuthoringPanes. Open the site once from the GIS panel, then return.';

/**
 * §26.1.1 — THE REFUSAL SPEAKS. A split toggle that cannot act says WHY and what to do;
 * a silently greyed segment *"tells the user nothing and reads as a bug, which is exactly
 * how the founder has read three defects this session"*.
 *
 * Pure so the two hosts of this control — the on-view bar's `.vsw-split` and the site
 * phase's bottom-left pill — render ONE decision instead of drifting copies of it. Neither
 * is the authority; this is.
 */
export function describeSplitToggle(state: SplitToggleState): SplitTogglePresentation {
    const mode: SitePaneMode = state.mode ?? (state.open ? 'split' : 'absent');

    // §SINGLE-VIEW-IS-A-LAYOUT-FACT (L-13053) — the shell is UP and showing ONE pane. The
    // button is therefore NOT pressed (there is no split), and pressing it asks for the split
    // back. This state only exists for a host that can set the mode; without that capability
    // `mode` is never 'single' and this arm is unreachable rather than half-wired.
    if (mode === 'single') {
        return {
            label: '◧ Split',
            enabled: state.canSetMode === true,
            pressed: false,
            title: state.canSetMode === true
                ? 'Show two views side by side again — the pane you are on keeps its view and '
                    + 'the one it was split with comes back.'
                : SPLIT_TOGGLE_UNAVAILABLE_TEXT,
        };
    }

    // The shell is up and split: pressing collapses it to ONE pane, which keeps that pane's
    // own dropdown on screen (C59 §1.4). Only a host WITHOUT the mode capability still closes
    // the whole shell here.
    const enabled = mode === 'split'
        ? (state.canSetMode === true || state.canClose)
        : state.canOpen;
    return {
        label: mode === 'split' ? '◧ Split — on' : '◧ Split',
        enabled,
        pressed: mode === 'split',
        title: !enabled
            ? SPLIT_TOGGLE_UNAVAILABLE_TEXT
            : mode === 'split'
                ? (state.canSetMode === true
                    ? 'Go to a single view. The pane you keep fills the region and keeps its own '
                        + 'view dropdown — nothing is torn down, so this is reversible.'
                    : 'Close the split and go back to a single view.')
                : 'Show two views side by side — the 2D site map and the 3D Site. '
                    + 'Each pane keeps its own view picker, so you choose what goes in each.',
    };
}
