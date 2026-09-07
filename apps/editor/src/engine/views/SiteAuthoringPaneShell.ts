// §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412, C59 Phase 1b) — the DOM geometry for the
// site-authoring split: a LEFT pane + a draggable divider + a RIGHT pane, tiled
// inside a host element (default `#container`). This is the renderer-agnostic pane
// GEOMETRY the founder default layout (2D map LEFT · 3D Site RIGHT) lives in.
//
// The geometry (ratio + draggable divider + resize fan-out) MIRRORS the proven
// `SplitViewManager` split (`_buildDOM` / `_positionDivider` / `_onDividerMove`,
// SplitViewManager.ts:350–516) — but SplitViewManager's pane is hard-wired to a
// Canvas2D plan surface, so it cannot host Cesium/MapLibre. Rather than destabilise
// that legacy owner (its consolidation is C59 Phase 4), Phase 1b builds this minimal
// self-contained shell that hosts ARBITRARY renderers via the `PaneHost` abstraction.
// The panes TILE (no overlap, C59 §1.3): each renderer surface is a positioned child
// that fills its pane. No `requestAnimationFrame` here (P3) — divider drag only
// re-sizes; the renderers reflow via their `PaneHost.resize()`.

// §PANE-PLACEMENT-AFTER-MODE-SWITCH (L-12988) — the resize/placement pass is COALESCED
// through the ONE frame scheduler. P3 holds: no `requestAnimationFrame` here; this is the
// same primitive `halfCanvasResizer` and `SplitViewManager` already coalesce their drags
// with, and the 'overlay' phase is the C11 §6.1 slot for viewport/HUD work.
import { deferWork, getFrameScheduler } from '@pryzm/frame-scheduler';
import { EMPTY_LR_LAYOUT, isSoloLayout, LEFT_PANE, RIGHT_PANE, type PaneId } from './paneViewModel';
import { PaneHost, MultiPaneController } from './PaneHost';
import { PaneLayoutStore } from './paneLayoutStore';
import { mountPaneViewPicker, type PaneViewPickerHandle } from './PaneViewPicker';
import { mountPaneEmptyState, type PaneEmptyStateHandle } from './PaneEmptyState';
// §SITE-SCOPE (L-645; C12 §13; ADR-0382 D8) — the founder's scope slider, per pane. Same shape
// as the picker above: this composition file RESOLVES ITS PORTS and the control itself reads no
// global, so it stays headless-testable (P1/P4).
import { mountSiteScopeSlider, type SiteScopeSliderHandle, type SiteScopeSliderPorts } from './SiteScopeSlider';
// §SITE-SCOPE — the ONE measured slider range (a leaf module: it imports nothing) and the write
// path + parcel floor (a leaf too — see its header for why it is NOT inside `siteDispatch.ts`).
import { SITE_SCOPE_RANGE } from '../../ui/geospatial/contextExtentBudget';
import { dispatchSiteScope, siteScopeFloorRadiusM } from '../../ui/site/siteScopeDispatch';
// §SITE-VIEW-QUICK-TOGGLE (L-5110) — the founder's 3D globe / 3D site control. ⭐ TYPES
// ONLY SINCE §ONE-PANEL-PER-PANE-AND-MAKE-IT-A-DROPDOWN (L-13015): this shell no longer
// MOUNTS it, it RESOLVES ITS PORTS and hands them to each pane's dropdown, which hosts the
// panel in its popup. The composition layer is still the one place that knows how the
// camera and the basemap are reached (P1/P4) — only the host of the rows changed.
import type {
    SiteViewBasemapPorts,
    SiteViewCameraPorts,
} from './SiteViewQuickToggle';
import type { SiteViewGlobeFraming } from './siteViewQuickToggleModel';
// §GLOBE-QUICK-TOGGLE (L-6800..L-6807, C60 §6.5) — the DECLARED world framing. Imported here,
// in the COMPOSITION layer, and not by the bar's own model: C60 depends on C59 (C60 §7), so a
// C59 chrome module reaching into C60 for a lat/lon would invert that edge. The bar names the
// framing (`view.site.frame-globe`); this file is where "the globe framing" has a value.
import {
    describeSiteFramingReturn,
    siteFramingReturnDecision,
} from './siteEntryModel';

/** The shell handle: pane elements, the store (the ONE write path), and disposal. */
export interface SiteAuthoringPaneShell {
    readonly root: HTMLElement;
    readonly controller: MultiPaneController;
    /**
     * §C59 Phase 2 — the view-state store. EVERY layout change (including a caller
     * applying a model-derived default) must go through `store.dispatch(...)`, not
     * `controller.applyLayout(...)`: the controller is the imperative shell the store
     * drives, and a caller that writes to it directly leaves the store — and therefore
     * every pane picker — stale (C59 §2 invariant 3).
     */
    readonly store: PaneLayoutStore;
    /** The pane element for `left` / `right` (for pane-scoped chrome, e.g. the facts card). */
    getPaneElement(paneId: PaneId): HTMLElement | null;
    /**
     * §PANE-PLACEMENT-AFTER-MODE-SWITCH (L-12988) — ⭐ ONE authoritative placement pass, run
     * AFTER the surrounding layout has settled: assert that each renderer is in the pane the
     * store gives it, and put it back if it is not. Coalesced onto the next frame, so ten
     * callers in one transition cost one pass. Call it from anything that re-writes the
     * shell's box underneath it — a workspace mode switch is the measured case.
     */
    reassertPlacement(): void;
    /** Tear the shell down (removes the DOM + listeners). Idempotent. */
    dispose(): void;
    /** True once disposed. */
    readonly isDisposed: boolean;
}

export interface SiteAuthoringPaneShellOptions {
    /** Where to mount the split (defaults to `#container`). */
    parent?: HTMLElement;
    /** Initial LEFT-pane fraction of the width (0.2–0.8). Defaults to 0.5. */
    initialLeftFraction?: number;
    /** z-index for the shell root (defaults to just under Cesium's CESIUM_Z=15). */
    zIndex?: number;
    /** Called on every divider drag / resize so the controller can reflow renderers. */
    onResize?: () => void;
    /**
     * §C59 Phase 2 — mount the per-pane view picker on every pane (default true).
     * Off only for tests that want bare geometry.
     */
    viewPicker?: boolean;
    /**
     * §GLOBE-QUICK-TOGGLE (L-6800..L-6807) — the camera ports the top-centre `⊕ 3D Globe`
     * action dispatches into. Defaults to `defaultSiteViewCameraPorts()` (the declared typed
     * globals). Tests pass recorders.
     */
    camera?: SiteViewCameraPorts;
    /**
     * §VIEW-PANEL-PER-PANE (founder 2026-09-06) — the basemap port the `2D Site Map` /
     * `2D Satellite` rows dispatch into. Defaults to `defaultSiteViewBasemapPorts()` (the
     * declared typed globals). Tests pass recorders.
     */
    basemap?: SiteViewBasemapPorts;
    /**
     * §SITE-SCOPE (L-645) — the ports the per-pane scope slider drives. Defaults to
     * `defaultSiteScopePorts()` (the declared typed global GISAreaLayout registers). Tests pass
     * recorders. Mounted on the same `viewPicker !== false` flag as the rest of the pane chrome.
     */
    scopePorts?: SiteScopeSliderPorts;
}

/**
 * §GLOBE-QUICK-TOGGLE (L-6800..L-6807) — resolve the two camera ports from the DECLARED typed
 * globals `GISAreaLayout` already registers. This is the whole production wiring.
 *
 * ⚠ TYPED GLOBALS, NOT `window as any` (P4). Both are declared in `src/types/globals.d.ts`;
 * this is the same idiom `OnboardingStepController` uses to reach the identical camera host for
 * `GlobeHeroSearch`. It lives in this composition file rather than in the bar so the bar stays
 * headless-testable and so there is exactly one place that knows how the globe is reached.
 *
 * ⭐ NEITHER PORT IS NEW MACHINERY.
 *   · `frameGlobe` → `setViewFraming('world')` and NOTHING ELSE. See §GLOBE-KEEPS-THE-VIEW below.
 *   · `frameSite` → `setViewFraming('site')`, then `window.pryzmZoomToSite` — the ONE declared
 *     `site.zoom-to-site` action in `gisActionRegistry.ts`, whose whole reason for existing is
 *     that the ACTIVE SURFACE decides the target — but ONLY when the camera is too far out to
 *     keep. Re-deriving a "fly back to the site" target here would be a third copy of the thing
 *     that registry exists to de-duplicate.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⭐ §GLOBE-KEEPS-THE-VIEW (L-13070) — WHY THE OUTBOUND FLIGHT IS GONE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Founder, 2026-09-07: *"when selecting the parcel — I have selected 3D Globe — it goes into the
 * right view — but it should keep zooming (ideally the precise same view) than the previous view
 * on 3D Site … I would like ideally the same view — precisely the same."*
 *
 * `frameGlobe` used to end `host.flyToGeographic(worldFramingTarget())` — `WORLD_HOME` (15°N,
 * 5°E) at 20 000 km, pitch −90°. That call, and only that call, is why his Barcelona parcel
 * became the whole Earth. It is DELETED, not replaced: `3D Site` and `3D Globe` are the SAME
 * Cesium viewer (§L-412, C60 §6.5, STR §26.1.1), so the camera does not need saving and
 * restoring across the switch — it needs to be LEFT ALONE. Not moving it is exact by
 * construction: position, heading, pitch and roll are the same object, to no tolerance at all.
 *
 * ⛔ NOT `sharedCameraPose.ts` (L-600), and this is the reuse question answered rather than
 * skipped. That pure model exists for the CROSS-RENDERER ask — one angle shared between Cesium
 * and the WebGPU BIM camera, two cameras in two coordinate frames — and it is still unwired
 * behind C59 Phase 3. This switch never crosses that boundary, so projecting a pose here would
 * be machinery for a problem that does not arise. L-600 stays open on its own terms.
 * ⛔ NOT `ViewCameraStateStore` either: it is keyed by view-definition id, belongs to the BIM
 * renderer, and its §L-378 guard explicitly REFUSES globe/ECEF-scale positions — it could not
 * hold this camera even if it were reachable from here.
 *
 * ⚠ THE RETURN TRIP IS NOT SYMMETRIC. `global-earth` renders at every altitude, so carrying the
 * camera OUT is unconditionally safe. `forma-site` does not: it attaches a CITY-BOUNDED terrain
 * tileset, so a WORLD-range camera carried back into `3D Site` would rebuild L-12991's beige
 * shard in the mirror direction. `siteFramingReturnDecision()` is that one pure rule.
 *
 * `canFrameSite` reports whether that entry point is registered AT ALL — the
 * `entryPoints: []` doctrine from the same registry: *"a dead button that looked alive is its
 * own bug"*. When it is missing the bar refuses the OUTBOUND click, so the user is never flown
 * somewhere the return trip cannot be made from.
 *
 * ⚠ IT IS DELIBERATELY UNCHANGED BY L-13070, even though the CARRY arm of the return trip no
 * longer needs `pryzmZoomToSite`. The guard's job is *"can the return be made from ANYWHERE"*,
 * and the REFRAME arm still needs that action — so weakening it to "the host exists" would light
 * the row for a user who is at world range with no way back. Keeping the stronger predicate
 * costs a row that was already dark and re-lights nothing that could then fail.
 */
export function defaultSiteViewCameraPorts(): SiteViewCameraPorts {
    return {
        frameGlobe: () => {
            const host = window.pryzmGetSiteEntryCameraHost?.() ?? null;
            if (!host) {
                console.warn('[site-view-toggle] no globe mounted — world framing dropped.');
                return;
            }
            // §GLOBE-INHERITS-THE-CITY-TERRAIN (L-12991) — ⛔ THE SURFACE MOVES BEFORE THE CAMERA.
            // This port used to fly and nothing else, and that was the whole defect: §L-412 keeps
            // ONE Cesium viewer (correctly), so the world framing inherited the SITE's surface —
            // a CITY-BOUNDED terrain tileset that declares availability only inside Córdoba's bbox,
            // the imagery layers hidden by Forma, the photoreal tileset hidden with them, and a
            // transparent clear showing the white page. The founder's `3D Globe` pane therefore
            // rendered one beige triangular shard instead of the Earth. ⚠ L-12991's fix SURVIVES
            // L-13070 unchanged and is the reason this row still does anything at all: the
            // surface swap IS the `3D Globe` row now that the flight is gone. What used to be
            // "declare the framing before the flight" is simply "declare the framing".
            host.setViewFraming('world');
            // §GLOBE-KEEPS-THE-VIEW (L-13070) — ⛔ AND NOTHING ELSE. There is no
            // `flyToGeographic(worldFramingTarget())` here any more, and re-adding one is the
            // founder's *"it goes into the right view — but it should keep … the precise same
            // view"* defect coming back. The surface swaps; the camera is untouched, which is
            // what makes the carry EXACT rather than approximate. `global-earth` is drawn from
            // imagery + the photoreal tileset, both global, so it renders at whatever altitude
            // the user was already at — including 600 m over his parcel.
            console.log(
                '[site-view-panel] §GLOBE-KEEPS-THE-VIEW (L-13070) 3D Globe — surface swapped to ' +
                "'global-earth'; the camera is NOT moved, so the view is the one you were on.",
            );
        },
        frameSite: () => {
            // The return trip owes the same swap, or the site would come back wearing the globe's
            // imagery and no city relief (L-636 §TERRAIN-NORMALS / L-639 §CAMERA-UNDERGROUND-FIX
            // and the per-footprint seat path all need the baked tileset).
            const host = window.pryzmGetSiteEntryCameraHost?.() ?? null;
            if (!host) {
                console.warn('[site-view-toggle] no globe mounted — site framing dropped.');
                return;
            }
            host.setViewFraming('site');
            // §GLOBE-KEEPS-THE-VIEW (L-13070) — carry the camera when the user is still looking
            // at a site, reframe when he is not. The rule is PURE and lives in `siteEntryModel`
            // beside the altitude bands it is expressed in; this is the one place that executes
            // it. `pryzmZoomToSite` is still the ONE declared `site.zoom-to-site` action and
            // still owns the target on the reframe arm — the carry arm issues no flight at all.
            const decision = siteFramingReturnDecision(host.getCameraAltitudeM?.() ?? null);
            console.log(describeSiteFramingReturn(decision));
            if (decision.action === 'reframe') window.pryzmZoomToSite?.();
        },
        canFrameSite: () => typeof window.pryzmZoomToSite === 'function',
    };
}

/**
 * §VIEW-PANEL-PER-PANE (founder 2026-09-06) — resolve the basemap port from the DECLARED
 * typed globals `GISAreaLayout` registers. This is the whole production wiring.
 *
 * ⭐ NO NEW MACHINERY, and that is checkable rather than claimed: `pryzmSetSiteBasemap`
 * forwards to `SiteBoundaryMap2D`'s own `swapBasemap` — the A.8.c.f.4 function the map's
 * corner `Map | Satellite` chip has driven since 2026-06-03, and the only basemap
 * implementation in this app. The founder's *"the 2d map satellite and non-satellite option
 * is MASKED FOR ANOTHER PANEL"* was about REACH, not about a missing feature, so the fix is
 * a second route to one implementation — never a second implementation.
 *
 * ⚠ `getBasemap` returns `null` when the reading is unavailable, and the panel then says so
 * rather than lighting `2D Site Map`. `canSetBasemap` reports whether the swap exists at all
 * — the `entryPoints: []` doctrine from `gisActionRegistry`: *"a dead button that looked
 * alive is its own bug"*.
 */
export function defaultSiteViewBasemapPorts(): SiteViewBasemapPorts {
    return {
        setBasemap: (next) => { window.pryzmSetSiteBasemap?.(next); },
        getBasemap: () => window.pryzmGetSiteBasemap?.() ?? null,
        canSetBasemap: () => typeof window.pryzmSetSiteBasemap === 'function',
    };
}

/**
 * §SITE-SCOPE (L-645; C12 §13; ADR-0382 D8) — resolve the scope slider's ports. This is the whole
 * production wiring, and it is the same idiom as the two port factories above.
 *
 * ⭐ NO NEW MACHINERY, and that is checkable rather than claimed:
 *   · the value, the preview ring and the cap measurements come off the ONE Cesium viewport
 *     `window.pryzmGetSiteEntryCameraHost()` already returns (`GISAreaLayout` registers it as
 *     `() => cesiumViewport`, verbatim) — the SAME host `frameGlobe` above flies;
 *   · the RELEASE goes through `dispatchSiteScope` → `site.setScope` → `site.scope-changed`, the
 *     ONE mutation path for `SiteModel.scope` (P6), which is also the reload trigger;
 *   · the FLOOR is read from the committed parcel (`siteScopeFloorRadiusM`), never re-derived here.
 *
 * ⚠ RESOLVED LAZILY, ON EVERY CALL. This shell mounts BEFORE GIS activates — `pryzmToggleGIS(true)`
 * constructs the Cesium viewport inside a lazy import — so capturing the host at mount time would
 * freeze the control against a viewport that did not exist yet and the slider would read "not
 * available" for the rest of the session. Each accessor asks again.
 *
 * ⛔ THE DEGRADED ANSWERS ARE DIFFERENT FACTS AND ARE KEPT APART: `getScope()` → `null` ("no
 * 3D-Site surface"), `commit()` → `false` ("nothing to store it on"), `getCompleteMark()` → `null`
 * ("not measured yet"). None of them is a zero — a fabricated zero is what the slider would draw.
 */
export function defaultSiteScopePorts(): SiteScopeSliderPorts {
    const host = () => window.pryzmGetSiteEntryCameraHost?.() ?? null;
    return {
        getScope: () => host()?.getResolvedSiteScope?.()?.scope ?? null,
        // The RANGE is the ONE measured object (`contextExtentBudget.ts`, a leaf that imports
        // nothing), not two numbers re-stated here — C12 §13.1 forbids a second range.
        getRange: () => ({
            minRadiusM: SITE_SCOPE_RANGE.minRadiusM,
            maxRadiusM: SITE_SCOPE_RANGE.maxRadiusM,
        }),
        getFloorRadiusM: () => siteScopeFloorRadiusM(null, host()?.getContextScope?.()?.shape ?? 'rectangle'),
        preview: (scope) => { host()?.previewSiteScope?.(scope); },
        commit: (scope) => dispatchSiteScope(null, scope),
        getCompleteMark: () => host()?.getCompleteScopeMark?.() ?? null,
        getCapVerdicts: () => host()?.getScopeCapVerdicts?.() ?? [],
    };
}

const MIN_FRACTION = 0.2;
const MAX_FRACTION = 0.8;

/**
 * §SEAM-HAIRLINE-WHITE (L-12966, founder 2026-09-06, Córdoba: "the line between 2d and 3d should be
 * a super thin line white — not this one that we have now").
 *
 * WHAT IT WAS: a 6 px track filled with `linear-gradient(180deg,#2a2340,#6600FF)` — the PRYZM brand
 * purple used as furniture. It competed with the two maps it separates AND with the parcel
 * highlight, which is the one thing #6600FF is reserved for (§PREVIEW-COLOR-UNIFIED-PURPLE).
 *
 * WHAT IT IS: a 1 px WHITE hairline. The visible line is the flex track itself; the DRAG TARGET is a
 * transparent child that overhangs it by `DIVIDER_HIT_OVERHANG_PX` on each side, so the pointer
 * still has a 13 px band to grab. Shrinking the track to 1 px WITHOUT that overlay would have made
 * the seam thin by making the handle unusable — the founder asked for a thinner LINE, not a
 * harder-to-drag divider.
 *
 * `.svp-divider` (SplitViewManager's own body-level divider, styled in `ui/styles/panels/splitView.ts`)
 * needed no change: it is already `background: transparent`, and `svpPlanPaneMounter` hides it
 * outright inside this shell — this element is the ONLY seam the founder can be seeing.
 */
const DIVIDER_WIDTH_PX = 1;
const DIVIDER_COLOUR = '#FFFFFF';
/** Transparent grab margin either side of the hairline (total pointer target = 1 + 2×6 = 13 px). */
const DIVIDER_HIT_OVERHANG_PX = 6;

/**
 * Build the two-pane site-authoring shell. Returns the pane elements wrapped in a
 * `MultiPaneController` (with `left` + `right` `PaneHost`s) — the caller registers
 * the renderer mounters and applies the founder default layout via the pure model
 * (`siteAuthoringDefaultLayout()`).
 */
export function mountSiteAuthoringPaneShell(
    opts: SiteAuthoringPaneShellOptions = {},
): SiteAuthoringPaneShell {
    const parent = opts.parent ?? document.getElementById('container') ?? document.body;
    const zIndex = opts.zIndex ?? 14; // below Cesium's own container z (15) — it fills its pane.
    let leftFraction = clampFraction(opts.initialLeftFraction ?? 0.5);

    // ── Root (tiles the parent viewport) ────────────────────────────────────────
    const root = document.createElement('div');
    root.id = 'pryzm-site-authoring-panes';
    root.setAttribute('data-testid', 'site-authoring-panes');
    Object.assign(root.style, {
        position: 'absolute',
        inset: '0',
        display: 'flex',
        flexDirection: 'row',
        zIndex: String(zIndex),
        background: '#0b0b12',
    } satisfies Partial<CSSStyleDeclaration>);

    // Ensure the parent is a positioning context so `inset:0` fills it.
    if (parent instanceof HTMLElement && !parent.style.position) {
        parent.style.position = 'relative';
    }

    const leftPaneEl = document.createElement('div');
    leftPaneEl.id = 'pryzm-pane-left';
    leftPaneEl.setAttribute('data-pane', LEFT_PANE);
    Object.assign(leftPaneEl.style, {
        position: 'relative',
        overflow: 'hidden',
        flex: `0 0 ${(leftFraction * 100).toFixed(3)}%`,
        minWidth: '0',
        height: '100%',
    } satisfies Partial<CSSStyleDeclaration>);

    // §SEAM-HAIRLINE-WHITE (L-12966) — see the constants above for the founder quote and the reason
    // the visible line and the hit area are two elements.
    const divider = document.createElement('div');
    divider.id = 'pryzm-pane-divider';
    divider.setAttribute('data-testid', 'pane-divider');
    Object.assign(divider.style, {
        position: 'relative',
        flex: `0 0 ${DIVIDER_WIDTH_PX}px`,
        cursor: 'col-resize',
        background: DIVIDER_COLOUR,
        zIndex: '2',
        userSelect: 'none',
    } satisfies Partial<CSSStyleDeclaration>);

    // The grab band. A CHILD of the divider, so the single `mousedown` listener on `divider` still
    // receives the press by bubbling — no second listener, no second drag path to keep in sync.
    // It overhangs both panes by `DIVIDER_HIT_OVERHANG_PX`; the divider's `zIndex: 2` keeps it above
    // the pane surfaces, and it is fully transparent, so nothing is drawn over either map.
    const dividerHit = document.createElement('div');
    dividerHit.setAttribute('data-testid', 'pane-divider-hit');
    Object.assign(dividerHit.style, {
        position: 'absolute',
        top: '0',
        bottom: '0',
        left: `-${DIVIDER_HIT_OVERHANG_PX}px`,
        right: `-${DIVIDER_HIT_OVERHANG_PX}px`,
        cursor: 'col-resize',
        background: 'transparent',
    } satisfies Partial<CSSStyleDeclaration>);
    divider.appendChild(dividerHit);

    const rightPaneEl = document.createElement('div');
    rightPaneEl.id = 'pryzm-pane-right';
    rightPaneEl.setAttribute('data-pane', RIGHT_PANE);
    Object.assign(rightPaneEl.style, {
        position: 'relative',
        overflow: 'hidden',
        flex: '1 1 0',
        minWidth: '0',
        height: '100%',
    } satisfies Partial<CSSStyleDeclaration>);

    root.appendChild(leftPaneEl);
    root.appendChild(divider);
    root.appendChild(rightPaneEl);
    parent.appendChild(root);

    const leftHost = new PaneHost(LEFT_PANE, leftPaneEl);
    const rightHost = new PaneHost(RIGHT_PANE, rightPaneEl);
    const controller = new MultiPaneController([leftHost, rightHost]);

    // ── §C59 Phase 2 — the view-state store (the ONE write path) + per-pane pickers ──
    // The store owns the layout and drives the controller; the pickers only dispatch
    // intents into it (C59 §2 invariant 3). The shell itself never assigns a view.
    const store = new PaneLayoutStore(EMPTY_LR_LAYOUT, { applier: controller });

    // ── Divider drag (mirrors SplitViewManager._onDividerMove) ──────────────────
    let dragging = false;
    /** Declared here (not beside `dispose`) because the settle pass below reads it. */
    let disposed = false;
    const applyFraction = (): void => {
        // §C59 Phase 2 — FULL SCREEN is a LAYOUT fact, not a second mechanism: when
        // exactly one pane holds a view (the `solo` / "empty this pane" intents), the
        // vacated pane and the divider collapse and the surviving pane fills the shell —
        // carrying its picker with it, which is how the founder's "in each view, split
        // OR complete, change to another view" holds in full screen too.
        const layout = store.getLayout();
        const leftEmpty = layout[LEFT_PANE] == null;
        const rightEmpty = layout[RIGHT_PANE] == null;
        // §SINGLE-VIEW-IS-A-LAYOUT-FACT (L-13053) — ONE RULE, ONE COPY. This read
        // `leftEmpty !== rightEmpty` inline, and `pryzmGetSiteAuthoringPaneMode` now has to
        // answer the SAME question for the split toggle. Two independent expressions of one
        // predicate is how a control ends up describing a screen the user is not looking at,
        // so the shell and the reading share `isSoloLayout`.
        const solo = isSoloLayout(layout); // exactly one occupied → full screen.

        divider.style.display = solo ? 'none' : '';
        if (solo && leftEmpty) {
            leftPaneEl.style.display = 'none';
            rightPaneEl.style.display = '';
            rightPaneEl.style.flex = '1 1 0';
        } else if (solo && rightEmpty) {
            rightPaneEl.style.display = 'none';
            leftPaneEl.style.display = '';
            leftPaneEl.style.flex = '1 1 100%';
        } else {
            leftPaneEl.style.display = '';
            rightPaneEl.style.display = '';
            rightPaneEl.style.flex = '1 1 0';
            leftPaneEl.style.flex = `0 0 ${(leftFraction * 100).toFixed(3)}%`;
        }
    };

    // ══════════════════════════════════════════════════════════════════════════════
    // §PANE-PLACEMENT-AFTER-MODE-SWITCH (L-12988) — ⭐ ONE SETTLE PASS, COALESCED.
    //
    // ⛔ WHAT THIS REPLACES, AND WHY IT WAS ITS OWN DEFECT. There were FOUR call sites
    // (divider move, divider release, window resize, store notify) and each called
    // `controller.resize()` straight through. `resize()` on the Cesium mounter is
    // `reflowContainer()` → `viewer.resize()` + `scene.requestRender()` + a scheduled
    // SECOND pass — so each trigger costs the renderer two buffer re-allocations. In the
    // founder's trace ONE layout change produced SEVEN of them, to seven different widths:
    //     canvas 511x981 … 372x976 … 367x976 … 256x976 … 248x976 … 252x976 … 391x976
    // That is a renderer being resized against a box that is still settling, and the last
    // width it happens to catch is the one the canvas keeps. Coalescing is therefore not
    // polish here: it is what makes the FINAL measurement the one that lands.
    //
    // The pass does three things, in this order and only in this order:
    //   1. `applyFraction()`  — the pane BOXES take their final geometry;
    //   2. `reassertPlacement()` — each renderer is checked against the pane the STORE
    //      gives it, and put back if it is elsewhere (the L-12988 disagreement);
    //   3. `resize()` + `onResize` — everything reflows ONCE, to a box that has stopped
    //      moving and to the pane it actually belongs in.
    // Geometry before placement before measurement. Reversing 2 and 3 would measure the
    // wrong pane, which is the bug.
    //
    // P3: `scheduleOnce` is the frame scheduler's own one-shot; when the pump is not
    // running (headless / before composeRuntime) `deferWork(…, 0)` — also
    // frame-scheduler-owned — keeps the pass from being silently dropped.
    // ══════════════════════════════════════════════════════════════════════════════
    let settleScheduled = false;
    let settleNeedsPlacement = false;
    const runSettle = (): void => {
        settleScheduled = false;
        if (disposed) return;
        const withPlacement = settleNeedsPlacement;
        settleNeedsPlacement = false;
        applyFraction();
        // §REFLOW-NO-OP-IS-NOT-WORK (L-13206 · C59 §2.10.5) — ⛔ THIS WAS TWO REFLOWS PER PANE,
        // BY CONSTRUCTION, and it read as one. `MultiPaneController.reassertPlacement()` fans out
        // to `PaneHost.reassertPlacement()`, and EVERY return path of that method already ends in
        // `this.resize()` (placed / not-placed-and-corrected / unknown / no-predicate). Following
        // it with `controller.resize()` therefore reflowed every host a SECOND time, to the same
        // box, on every placement settle — a divider drag is one settle per frame, so this was a
        // guaranteed doubling of the Cesium buffer work for the whole drag.
        //
        // The ordering comment above still holds exactly: geometry (applyFraction) → placement →
        // measurement. Placement JUST DOES the measurement itself; the two branches below are the
        // same three steps, not a shortcut past one of them.
        if (withPlacement) controller.reassertPlacement();
        else controller.resize();
        opts.onResize?.();
    };
    /** Ask for a settle pass. `placement` also re-asserts which pane owns which renderer. */
    const requestSettle = (placement = false): void => {
        if (disposed) return;
        if (placement) settleNeedsPlacement = true;
        if (settleScheduled) return;
        settleScheduled = true;
        const scheduler = getFrameScheduler();
        if (scheduler.isRunning) scheduler.scheduleOnce('pane-shell-settle', runSettle, 'overlay');
        else deferWork(runSettle, 0);
    };

    const onDown = (e: MouseEvent): void => {
        dragging = true;
        e.preventDefault();
        document.body.style.userSelect = 'none';
    };
    const onMove = (e: MouseEvent): void => {
        if (!dragging) return;
        const rect = root.getBoundingClientRect();
        if (rect.width <= 0) return;
        leftFraction = clampFraction((e.clientX - rect.left) / rect.width);
        // The BOX follows the pointer synchronously (the divider must not lag); the
        // renderer reflow is what gets coalesced onto the frame (no re-fly — C59 §3.4).
        applyFraction();
        requestSettle();
    };
    const onUp = (): void => {
        if (!dragging) return;
        dragging = false;
        document.body.style.userSelect = '';
        requestSettle();
    };
    divider.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    // ── Window resize → settle both renderers ───────────────────────────────────
    // A window resize is exactly the transition in which the shell's own box is being
    // re-written underneath it, so it asks for the placement check too.
    //
    // ⭐ CORRECTED 2026-09-06 (L-13030 · C59 §2 invariant 10 / §2.10). This comment read
    // *"`#container.style.width` has three writers"*. IT WAS SEVEN SITES ACROSS FIVE
    // MODULES, and a comment that names a defect but gets its size wrong is how a known
    // problem stays open — the number looked survivable. It now has exactly ONE writer,
    // `ui/layout/viewRegionGeometry.ts`, and a second one is a contract violation rather
    // than a fact to be defended against here.
    const onWindowResize = (): void => { requestSettle(true); };
    window.addEventListener('resize', onWindowResize);

    // ── Layout changes → re-tile (split ⇄ full screen) + settle the renderers ────
    // The store notifies AFTER the controller has mounted/unmounted — but a Cesium mount
    // is ASYNC, so at notify time the surface may not have landed yet. The pass therefore
    // runs on the next frame and re-asserts placement rather than assuming the notify
    // ordering is the whole story; `MultiPaneController.applyLayout` independently runs
    // its own placement pass when its pending mounts resolve. Two arms, one rule.
    const unsubscribeLayout = store.subscribe(() => {
        applyFraction();
        requestSettle(true);
    });

    // ── §C59 Phase 2 — the per-pane view picker, on EVERY pane ──────────────────
    // ONE component, mounted per pane, content derived from VIEW_TYPE_REGISTRY. This is
    // the standardised switcher the founder asked for; it replaces per-surface bespoke
    // toggles for pane views (C59 §4 Phase 2, absorbing L-405).
    //
    // ⭐ §ONE-PANEL-PER-PANE-AND-MAKE-IT-A-DROPDOWN (L-13015, founder 2026-09-06) — AND IT
    // IS NOW THE ONLY VIEW CONTROL ON A PANE. He photographed three stacked over one pane
    // and ruled *"keep the one, the formal and more robust only, and keep it DROP DOWN
    // only … when in split view … keep TWO dropdown panels"*, so the founder's six moved
    // INTO this dropdown's popup (`panel` below) instead of floating over the pane beside
    // it. Switcher count == visible pane count, and `applyFraction` collapses the vacated
    // pane in a solo layout — so a single view shows one dropdown and a split shows two,
    // by the same mechanism rather than by two behaviours.
    //
    // ⚠ THE GLOBE FRAMING IS SHARED, HELD HERE. Two panes drive ONE Cesium camera; a memory
    // private to each panel would let the left one report "you are on the globe" while the
    // right one reports you are not — two copies of one fact, drifting, which is the defect
    // `gisActionRegistry` exists to remove. This shell owns the value and hands both
    // dropdowns the same getter and the same setter.
    let globeFraming: SiteViewGlobeFraming = 'site';
    const pickers: PaneViewPickerHandle[] = [];
    if (opts.viewPicker !== false) {
        const camera = opts.camera ?? defaultSiteViewCameraPorts();
        const basemap = opts.basemap ?? defaultSiteViewBasemapPorts();
        const panel = {
            mountableKinds: () => controller.registeredKinds?.() ?? null,
            camera,
            basemap,
            getFraming: () => globeFraming,
            onFramingChanged: (next: SiteViewGlobeFraming) => {
                globeFraming = next;
                // The OTHER dropdown is now stale about the one camera. Repaint it.
                for (const p of pickers) p.refresh();
            },
        } as const;
        // ⭐ §PANE-DROPDOWN-CENTRED (founder 2026-09-07, verbatim: *"THEY NEED TO BE
        // CENTERED."*). The mirrored top-left / top-right pair is retired: each pane's dropdown
        // now sits at the TOP CENTRE OF ITS OWN PANE, which is what C59's card text already
        // promised — *"Switch the view, or split it, from the bar centred on the view itself."*
        //
        // ⛔ CENTRED ON THE PANE, NOT ON THE CANVAS (C59 §2.10.3 clause 4 / L-13027). The
        // picker is `position:absolute` inside `paneEl`, so `left:50%` + `translateX(-50%)` is
        // arithmetic on its own pane. That is the whole difference from the bar this replaced,
        // which centred on `--shell-canvas-cx` and so drifted off its view the moment the split
        // collapsed — and it is why a SOLO layout needs no special case here: the survivor pane
        // becomes the region, and 50% of it follows for free.
        pickers.push(
            mountPaneViewPicker({ paneId: LEFT_PANE, paneEl: leftPaneEl, store, corner: 'top-center', panel }),
            mountPaneViewPicker({ paneId: RIGHT_PANE, paneEl: rightPaneEl, store, corner: 'top-center', panel }),
        );
    }

    // ── §SITE-SCOPE (L-645; C12 §13.4; ADR-0382 D8) — THE SCOPE SLIDER, ONE PER PANE ───────
    //
    // Founder: *"I want to have a slide of the scope on 3D Site view — like cityweft does."*
    //
    // ⚠ ONE VALUE, TWO CONTROLS — the same rule as the globe framing above, for the same reason.
    // Two panes drive ONE Cesium viewer (C59 §2 invariant 1), so the scope is a property of the
    // SITE, not of a pane; both sliders read it through the SAME ports and each repaints from the
    // store. A per-pane scope is forbidden by name (C12 §13.6).
    //
    // Each slider hides itself unless ITS pane holds `site-3d`, so the split shows one and a solo
    // 3D Site shows one — by the same mechanism as the pickers, not by a second behaviour.
    const scopeSliders: SiteScopeSliderHandle[] = [];
    if (opts.viewPicker !== false) {
        const ports = opts.scopePorts ?? defaultSiteScopePorts();
        scopeSliders.push(
            mountSiteScopeSlider({ paneId: LEFT_PANE, paneEl: leftPaneEl, store, ports }),
            mountSiteScopeSlider({ paneId: RIGHT_PANE, paneEl: rightPaneEl, store, ports }),
        );
    }

    // ── §SWAP-NOT-VACATE (L-12999 clause 4) — EVERY PANE STATES ITSELF ──────────
    //
    // Founder ruling: *"pane A must end holding SOMETHING IT CAN STATE — a 2D view, or an
    // honest placeholder that says why it is not showing 3D and what to press to get it
    // back."* `assignViewToPane`'s swap delivers the first clause and is the better answer;
    // this is the second, for the empties that remain ON PURPOSE.
    //
    // ⭐ THE CASE THIS ACTUALLY PAINTS is the one `applyFraction` above CANNOT collapse.
    // Its solo rule is `leftEmpty !== rightEmpty` — exactly one occupied — so `× Empty this
    // pane` and `Full screen` become a legible full screen and never a blank rectangle. But
    // this shell opens on `EMPTY_LR_LAYOUT`, where BOTH panes are empty, nothing is solo,
    // and both stay on screen holding nothing. That is the *"BLANK light-lavender rectangle
    // with only the tool rail"* of the founder's second L-13000 screenshot, and it is a
    // REAL window: `set-layout` arrives later, and a Cesium mount is async on top of that.
    //
    // ⛔ NOT A CSS FIX (the ruling forbids one by name): the pane keeps its box, its chrome
    // and its place in the split. It gains WORDS and one button, and the button dispatches a
    // `view.pane.*` intent like every other control here (P6).
    //
    // Mounted AFTER the pickers so it sits under them in DOM order, and gated on the same
    // `viewPicker` flag — a test asking for bare geometry wants no chrome at all, and the
    // placeholder's whole offer is "use the panel above", which that test has removed.
    const emptyStates: PaneEmptyStateHandle[] = [];
    if (opts.viewPicker !== false) {
        emptyStates.push(
            mountPaneEmptyState({ paneId: LEFT_PANE, paneEl: leftPaneEl, store }),
            mountPaneEmptyState({ paneId: RIGHT_PANE, paneEl: rightPaneEl, store }),
        );
    }

    // ── ⛔ §ONE-PANEL-PER-PANE-AND-MAKE-IT-A-DROPDOWN (L-13015) — THE FLOATING PER-PANE
    //      SEGMENT BAR IS GONE, AND ITS ROWS ARE NOT ────────────────────────────────
    //
    // Until 2026-09-06 this shell mounted a SECOND control per pane: `mountSiteViewQuickToggle`
    // as `.svq-bar--pane`, the six-segment bar floating at the top of each pane BESIDE the
    // dropdown above. The founder photographed the result — three switchers stacked over one
    // pane (this bar, the dropdown, and the body-level `.vsw-onview` bar) — and ruled:
    //
    //   *"the left hand side have double panels with the view — keep the one, the formal and
    //    more robust only, and keep it DROP DOWN only. But when in split view, on the left hand
    //    side only, please keep TWO dropdown panels."*
    //
    // ⛔ NO ROUTE WAS REMOVED (C19 §5.6 clause 4). Every row that bar carried — the founder's
    // six from `viewPanelOptions()`, their variants, their refusals and the three ports they
    // dispatch into — is rendered by the SAME component in its `'menu'` shape inside each
    // dropdown's popup (`panel` above). The bar's own `◧ Split` is suppressed there only
    // because the popup already renders `describePaneLayoutActions`, restore-split included.
    //
    // ⛔ AND NO SECOND OPTION TABLE WAS MINTED. `viewPanelOptions.ts` remains the ONE panel
    // definition; this lane changed the HOST, not the definition — which is exactly what the
    // §VIEW-PANEL-PER-PANE lane did before it when the bar moved from `document.body` into
    // the panes. `SiteViewQuickToggle.ts`'s `'bar'` shape is still the shipped whole-screen
    // control and is still exercised by its own spec; nothing was deleted.

    const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        controller.dispose();
        divider.removeEventListener('mousedown', onDown);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.removeEventListener('resize', onWindowResize);
        unsubscribeLayout();
        for (const p of pickers) {
            try { p.dispose(); } catch { /* chrome already gone */ }
        }
        for (const sl of scopeSliders) {
            try { sl.dispose(); } catch { /* chrome already gone */ }
        }
        for (const e of emptyStates) {
            try { e.dispose(); } catch { /* chrome already gone */ }
        }
        // Detach both hosted renderers before removing the DOM (the mounters re-home
        // their singleton — e.g. Cesium back to #container — on unmount).
        leftHost.unmount();
        rightHost.unmount();
        if (root.parentElement) root.parentElement.removeChild(root);
    };

    return {
        root,
        controller,
        store,
        getPaneElement: (paneId) => controller.getPaneElement(paneId),
        reassertPlacement: () => requestSettle(true),
        dispose,
        get isDisposed() {
            return disposed;
        },
    };
}

function clampFraction(f: number): number {
    if (!Number.isFinite(f)) return 0.5;
    return Math.max(MIN_FRACTION, Math.min(MAX_FRACTION, f));
}
