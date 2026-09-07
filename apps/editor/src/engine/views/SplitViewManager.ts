/**
 * @file src/core/views/SplitViewManager.ts
 *
 * PRYZM Split View — secondary floor-plan pane.
 *
 * Renders a 2D floor plan by drawing the projected edge geometry stored in
 * ViewTechnicalDrawingCache onto a plain Canvas2D context.  This is the same
 * approach used by the Pascal editor (pascalorg/editor) — no THREE.js renderer
 * is created for the secondary pane.
 *
 * Why Canvas2D instead of a second WebGPU/WebGL renderer:
 *   • Two WebGPU renderers on the same page create separate GPU devices; the
 *     TSL NodeMaterials compiled for device A are not valid on device B, causing
 *     "WebGPU: too many warnings" → blank canvas.
 *   • EdgeProjectorService + VGSceneApplicator already compute fully projected
 *     2D edge geometry (LineSegments) on every geometry change and store the
 *     result in ViewTechnicalDrawingCache — we simply draw those edges.
 *
 * CONTRACT §01 §4  — Secondary pane is projection-only; never modifies scene state.
 * CONTRACT §01 §5  — No side effects; render() is idempotent.
 * CONTRACT §05 §2  — All CSS lives in src/styles/panels/splitView.ts (svp- prefix).
 * CONTRACT §05 §6  — Zero bim-* elements; plain HTML + Canvas2D only.
 */

import * as THREE from '@pryzm/renderer-three/three';
// §L-431 slice 2 — the C58 envelope cache (transient, app-layer) for the plan site-context overlay.
// §L-432 — the shared site-context reader (parcel ring + envelope setback ring + θ), also
// published to the L1 snapping package. One source, so the pane and the snaps cannot disagree.
import { readSiteContextRings } from '../../ui/site/siteSnapContext';
import * as OBC from '@thatopen/components';
import type { ISplitViewManager } from '@pryzm/views';
import { unifiedFrameLoop } from '@pryzm/core-app-model';
import { getFrameScheduler } from '@pryzm/frame-scheduler';
// §VIEW-REGION-HAS-ONE-OWNER (C59 §2 invariant 10 / §2.10 · STR §26.1.2 · L-13030) — the
// split DECLARES its fraction of the view region; the owner derives every box from it.
// ⛔ Nothing in this file may write `#container`'s box again. See `_buildDOM`.
import { setViewRegionSplit } from '@app/ui/layout/viewRegionGeometry';
import { emitPlanViewMotionEvent } from '@pryzm/core-app-model';
import { viewTechnicalDrawingCache } from '@pryzm/core-app-model';
import { DEFAULT_PLAN_VIEW_ID } from '@pryzm/core-app-model';
import { resolveVgCanvasStyle } from '@pryzm/core-app-model';
import { viewDefinitionStore } from '@pryzm/core-app-model';
// §BIM-3D-CHROME-QUIET — the `projectContext` import left with the level chip: this pane
// no longer WRITES the active level. It still FOLLOWS it, through `LevelPlanViewBinder`
// calling `setPlanViewId()`, which is the one-writer shape C59 §2 invariant 3 asks for.
import { IFC_PROJECTION_CHANGED_EVENT } from '@pryzm/core-app-model';
import { scheduleStore } from '@pryzm/core-app-model';
import { sheetStore } from '@pryzm/core-app-model';
// Contract 25b Wave 2: VG template dropdown retired from the SVP header.
// Intent assignment now flows through the unified V/G header panel (OverridePanel).
import {
    DEFAULT_PLAN_VIEW_CANVAS_FRUSTUM,
    MINIMUM_PLAN_VIEW_CANVAS_FRUSTUM,
    // §PLAN-CAMTARGET-REFUSE-AT-PRODUCER (L-604) — the SAME bound PlanViewCanvas.setFrustum
    // enforces. Imported, never re-typed, so producer and consumer cannot drift apart.
    PLAN_CAMTARGET_MAX_ABS_M,
    PlanViewCanvas,
} from '@pryzm/core-app-model';
// §PLAN-FIT-BIM-ONLY (L-814) — the ONE camera-fit bounds collection, shared with
// initViewSetup.zoomToAll (Fit All). Pass 1 = BIM element types only; context/site
// meshes, gizmos and other non-model content are structurally outside the population.
import { computeBimFitBounds } from '@pryzm/scene-committer';
// Contract 27 Phase 6 — SVP canvas click → element selection
import { selectionBus } from '@pryzm/core-app-model';
import { frameObject } from '@pryzm/core-app-model';
// Contract 17 Phase 2 — SVP element creation parity
import { svpPlanToolOverlay } from './SvpPlanToolOverlay';
// §AUTOFRAME-NO-HIJACK-WHILE-DRAWING — suppress deferred auto-frame mid-draw
import { shouldSuppressAutoFrameWhileDrawing } from './autoframeGuard';
import { PlanViewInteraction } from './PlanViewInteraction';
import { mapMirrorClientToSourceClient } from './mirrorFit';
// §SVP-FITALL-MIRROR-STARVED (L-743) — keep the main renderer alive while we mirror it.
import { mainRendererVisibility, MAIN_RENDERER_PIN_SVP_3D_MIRROR } from './mainRendererVisibility';
import { repopulateViewSelectPreservingSelection } from './viewSelectRepopulate';
import { buildViewHeaderToolbar, type ViewHeaderButtonsHandle } from '@app/ui/views/ViewHeaderButtons';
import { escHtml } from '@pryzm/ui-base';
import { triggerWindowResize } from '../triggerWindowResize'; // F.events.16

/** Half the default view frustum extent (world units). */
const DEFAULT_FRUSTUM = DEFAULT_PLAN_VIEW_CANVAS_FRUSTUM;

/** §PLAN-FIT-OUTLIER-DIAG (L-481) — a mesh further than this from the origin is reported by
 *  name before it can drag the plan camera target. 5 km is well beyond any real site extent
 *  but far below the ~300 km excursion measured live, so it fires on the fault and not on
 *  legitimate large projects. Diagnostic only — it changes no behaviour. */
const PLAN_FIT_OUTLIER_WARN_M = 5_000;

/** Target frame interval for the secondary renderer (~30 fps). */
const SECONDARY_FPS_INTERVAL = 1000 / 30;

/**
 * §BIM-3D-CHROME-QUIET (founder 2026-09-07 · L-13027 · L-13084 · C59 §2.10.3) — the local
 * `Level` shape and `_getLevels()` left with the pane-header level chip they existed to
 * populate. The active level now has ONE control (`ActiveLevelHUD`, in the mode bar) and
 * one full list (`LevelManagerPanel`, in the Levels & Grids rail panel); this pane reads
 * the level through `projectContext` / `LevelPlanViewBinder` and no longer enumerates them.
 */

export class SplitViewManager implements ISplitViewManager {
    private _world:    OBC.World;
    private _scene:    THREE.Scene;
    private _active    = false;

    // DOM
    private _pane:            HTMLElement | null = null;
    private _canvas:          HTMLCanvasElement | null = null;
    private _gridToggleBtn:   HTMLElement | null = null;
    /** View-type selector — lets the user switch between plan/section/elevation/RCP. */
    private _viewSelect:      HTMLSelectElement | null = null;
    private _viewHeaderHandle: ViewHeaderButtonsHandle | null = null;
    /** Public accessor — used by remote-sync handlers to refresh header state. */
    get viewHeaderHandle(): ViewHeaderButtonsHandle | null { return this._viewHeaderHandle; }
    // §BIM-3D-CHROME-QUIET — `_levelGroup` / `_levelSelectRef` retired with the chip
    // (see the note above the class). Nothing else in this file held either.

    // Phase 2 — VG event listeners to clean up on deactivate
    private _vgUnlisteners: Array<() => void> = [];
    // Selection sync — listener to re-render on 3D scene selection changes
    private _selectionUnlisteners: Array<() => void> = [];

    private _planCanvas: PlanViewCanvas | null = null;
    // Phase 3 — full PlanViewInteraction layer attached to the SVP canvas
    // (hover snap indicator, annotation drag, context menu, click selection
    // routed through SelectionBus).  Coexists with SVP's pan/wheel/click
    // handlers via the shared `__pryzmToolHandled` event flag.
    private _planInteraction: PlanViewInteraction | null = null;
    /** Currently displayed plan view ID (changes when user picks a level). */
    private _planViewId = DEFAULT_PLAN_VIEW_ID;

    // Tick state (Phase 3)
    /** Phase 3 — unsubscribe handle for the UnifiedFrameLoop tick listener. */
    private _unregisterTick: (() => void) | null = null;
    private _lastRender  = 0;

    // Pan/zoom input state
    private _isPanning   = false;
    private _panStart    = new THREE.Vector2();
    private _frustumH    = DEFAULT_FRUSTUM;      // half height (zoom level)
    private _camTarget   = new THREE.Vector3();  // pan center (XZ plane)
    private _gridVisible = true;
    private _hasFitProjectedDrawing = false;
    /**
     * §PLAN-CAMTARGET-REFUSE-AT-PRODUCER (L-604) — latched so an implausible scene fit is
     * reported ONCE per fault instead of on every frame. Cleared the moment a plausible fit
     * lands, so a fault that recurs after a recovery is reported again rather than swallowed.
     * Failure and silence must never look the same.
     */
    private _planFitRefusalLogged = false;
    /**
     * Debounce timer to call endMotion() after the last wheel event.
     * See 08-CAMERA-SYSTEM-CONTRACT §3 and the equivalent fix in
     * initScene.ts (3D view) and PlanViewManager.ts (primary plan view).
     */
    private _wheelMotionTimer: ReturnType<typeof setTimeout> | null = null;

    // Content mode — 'plan' = Canvas2D projection, '3d' = mirror main renderer,
    // 'schedule' = HTML schedule table, 'sheet' = HTML sheet info
    private _svpMode: 'plan' | '3d' | 'schedule' | 'sheet' = 'plan';
    /** ID of the active schedule (__sched:ID) or sheet (__sheet:ID) when in embed mode. */
    private _svpSpecialId = '';
    /** Overlay div shown in place of the Canvas2D when in schedule/sheet mode. */
    private _embedEl: HTMLElement | null = null;

    // Divider drag
    private _divider:          HTMLElement | null = null;
    private _splitRatio        = 0.40;           // secondary pane as fraction of viewport
    private _isDraggingDivider = false;
    /**
     * Disposer for the divider-drag frame-scheduler subscription.
     *
     * Wave 7 S85.D-finish.4 (2026-04-30 evening): replaces the prior
     * `_dragRafId: number | null` field. The drag-coalesce path now uses
     * `getFrameScheduler().scheduleOnce('split-view-drag', cb, 'overlay')`.
     *
     * Coalescing semantic preserved: a non-null `_dragDispose` means a
     * frame is already queued and subsequent mousemoves only update
     * `_pendingDragRatio` (the L1 idiom of "drop intermediate samples,
     * keep latest"). `_onDividerMouseUp()` cancels via the disposer
     * then synchronously applies the final ratio.
     *
     * `'overlay'` priority: divider drag is a UI-overlay layout op that
     * should paint AFTER the main render pass, mirroring D.7.3's
     * `PlanElementDragController`.
     */
    private _dragDispose: import('@pryzm/frame-scheduler').TickListenerDisposer | null = null;
    /** Latest pending split ratio queued by an rAF-throttled mousemove. */
    private _pendingDragRatio: number | null = null;

    // Resize observer
    private _resizeObserver: ResizeObserver | null = null;

    // Contract 27 Phase 6 — click vs pan discrimination for SVP hit-test
    /** Canvas-relative pixel position at mousedown (left button only). null = no candidate. */
    private _clickStart: { x: number; y: number; cx: number; cy: number } | null = null;

    // Bound handlers (stored for removal)
    private _boundWheel       = this._onWheel.bind(this);
    private _boundMouseDown   = this._onMouseDown.bind(this);
    private _boundMouseMove   = this._onMouseMove.bind(this);
    private _boundMouseUp     = this._onMouseUp.bind(this);
    private _boundDblClick    = this._onDblClick.bind(this);
    private _boundDividerDown = this._onDividerMouseDown.bind(this);
    private _boundDividerMove = this._onDividerMouseMove.bind(this);
    private _boundDividerUp   = this._onDividerMouseUp.bind(this);

    constructor(world: OBC.World) {
        this._world = world;
        this._scene = world.scene.three as THREE.Scene;
    }

    get isActive(): boolean { return this._active; }

    // §L-412 (C59) — auto-open suppression. The site-authoring 2-pane layout (2D map
    // LEFT · 3D Site RIGHT) OWNS the screen during SITE authoring and must show EXACTLY
    // two panes — the legacy Canvas2D plan pane is redundant before any walls exist.
    // While the site-authoring panes are mounted they SUPPRESS this manager's
    // project-load auto-open (initScene). This gates ONLY the AUTO-open; an explicit
    // `activate()` (e.g. applyBimDualPane at generate-time, once site authoring ends)
    // still works — the plan pane is correct LATER, during BIM authoring.
    private _autoOpenSuppressed = false;
    /** True while the site-authoring split has suppressed the project-load auto-open. */
    get autoOpenSuppressed(): boolean { return this._autoOpenSuppressed; }
    /** Suppress the project-load auto-open, and deactivate the pane if it is already open. */
    suppressAutoOpen(): void {
        this._autoOpenSuppressed = true;
        if (this._active) this.deactivate();
    }
    /** Re-allow the project-load auto-open (does NOT itself re-open the pane). */
    allowAutoOpen(): void {
        this._autoOpenSuppressed = false;
    }

    get activeViewId(): string {
        return this._planViewId;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /** Contract 17 Phase 2 — exposes the SVP canvas for external use (e.g. SvpPlanToolOverlay). */
    /**
     * §FEAT-LEVEL-RELATIVE-PLAN-VIEWS (L-720) — re-target the split pane at a
     * different plan/section/elevation view programmatically.
     *
     * The pane already knew how to switch view (`_onViewSelectChange`, driven by the header
     * dropdown); it just had no way in from outside, so `LevelPlanViewBinder`
     * could not follow a level change here. This is the SAME path the dropdown
     * takes — including `svpPlanToolOverlay.setViewId()` and the
     * `PlanViewInteraction` re-attach, which is what makes the pane's SNAPPING
     * references follow the new level — and it keeps the dropdown's own value in
     * sync so the header never disagrees with what is drawn.
     */
    setPlanViewId(viewId: string): void {
        if (!viewId || viewId === this._planViewId) return;
        this._onViewSelectChange(viewId);
        if (this._viewSelect) this._viewSelect.value = viewId;
        // §BIM-3D-CHROME-QUIET — the pane-header level chip this used to keep in sync is
        // gone; `ActiveLevelHUD` re-renders off `projectContext`'s `activeLevelChanged`,
        // which is the event that got us here, so the surviving control is already right.
    }

    getSvpCanvas(): HTMLCanvasElement | null {
        return this._canvas;
    }

    /** Contract 17 Phase 2 — exposes the PlanViewCanvas for coordinate transforms. */
    getPlanCanvas(): PlanViewCanvas | null {
        return this._planCanvas;
    }

    /**
     * §FIX-SPLIT-VIEW-IS-PLURAL (L-1107) — what this pane is CURRENTLY showing.
     *
     * `activeViewId` alone cannot answer "is the split pane a plan view", because
     * the pane also runs in '3d', 'schedule' and 'sheet' modes while still holding
     * a `_planViewId`. `viewPanes.listViewPanes()` needs both facts to avoid
     * reporting a 3D mirror or a schedule embed as a plan surface.
     */
    get paneMode(): 'plan' | '3d' | 'schedule' | 'sheet' {
        return this._svpMode;
    }

    activate(): void {
        if (this._active) return;
        this._active = true;
        this._gridVisible = this._readGridPreference();
        this._hasFitProjectedDrawing = false;

        this._fitCamTargetToScene();

        this._buildDOM();
        this._buildContext();
        // Phase 2 G6 — apply the FULL per-view configuration on the very first
        // frame (view type + bound level + section/elevation axes), not just
        // the level.  Before this fix the SVP could open straight into a
        // section view but render it as if it were a plan because setViewType
        // and setSectionAxes only ran inside _setView().
        const initialViewDef = viewDefinitionStore.get(this._planViewId);
        const initialViewType = (initialViewDef as any)?.viewType ?? 'plan';
        this._configureCanvasForView(initialViewDef, initialViewType);
        if (viewTechnicalDrawingCache.get(this._planViewId)) {
            const { w, h } = this._paneSize();
            const viewDef = viewDefinitionStore.get(this._planViewId);
            this._planCanvas?.fitToDrawing(viewDef ?? this._planViewId, w, h);
            this._adoptPlanCanvasState();
            this._hasFitProjectedDrawing = true;
        }
        this._subscribeVGEvents();
        this._subscribeSelectionEvents();

        // Contract 17 Phase 2 — attach SVP tool overlay for element creation parity
        if (this._canvas && this._planCanvas) {
            svpPlanToolOverlay.attach(this._canvas, this._planCanvas, this._planViewId);
        }

        // Phase 3 — full PlanViewInteraction parity layer.  Adds hover snap
        // indicator, annotation drag, context menu, and click→bus selection.
        // Coexists with SplitViewManager's own pan/wheel/click handlers via
        // the shared `__pryzmToolHandled` flag (PlanViewInteraction binds
        // mousedown in CAPTURE phase so it sees the event first; if it
        // consumes the event it sets the flag, and the SVP's bubble-phase
        // mousedown then skips pan; if it does not consume, the SVP's own
        // pan / click selection paths run unchanged).
        if (this._canvas && this._planCanvas) {
            this._planInteraction = new PlanViewInteraction();
            this._planInteraction.attach(this._canvas, this._planCanvas, this._planViewId);
        }

        this._unregisterTick = unifiedFrameLoop.addTickListener({
            id:       'split-view-manager',
            priority: 'pre-render',
            callback: (_deltaMs, timestamp) => {
                if (!this._active) return;
                // 30 fps throttle — Canvas2D draw is cheap but no need to run at 60.
                const dt = timestamp - this._lastRender;
                if (dt < SECONDARY_FPS_INTERVAL) return;
                this._lastRender = timestamp - (dt % SECONDARY_FPS_INTERVAL);
                this._render();
            },
        });

        // F.events.7 — split-view family migrated to runtime.events typed bus.
        window.runtime?.events?.emit('split-view-activated', {});
        window.runtime?.events?.emit('split-view-layout-changed', { splitRatio: this._splitRatio });
        window.runtime?.events?.emit('split-view-view-changed', { viewId: this._planViewId });
        console.log('[SplitViewManager] Split view activated (Canvas2D plan mode)');

        // §VIEW-AUTOFRAME (Q3, 2026-06-10) — auto-frame the MAIN 3D viewport on the
        // building when the user enters the 3D + plan combined view.
        //
        // ROOT CAUSE of the founder-reported "3D pane is always EMPTY until I do
        // camera → Home": `activate()` only fits the PLAN pane's Canvas2D camera
        // (`_fitCamTargetToScene()` above writes `_camTarget`/`_frustumH`, which
        // feed `_syncPlanCanvasState()` — the SECONDARY pane only). The MAIN 3D
        // viewport's OBC camera is left at whatever pose it held (typically the
        // (20,20,20) default seed from initViewSetup, or a stale plan-only pose),
        // so the freshly-generated building — which sits at the scene/site frame —
        // is off-screen until the user manually zoom-to-fits. The existing
        // §3D-FRAME-ON-VIEW-SWITCH handler (initTools.ts) only fires ONCE per
        // project session on a `view-activated` perspective event, which the
        // split-view toggle does not emit — so it never re-frames on subsequent
        // entries to 3D+plan.
        //
        // FIX: reuse the existing zoom-to-fit path. We dispatch the already-
        // registered `zoom-fit` bus command (engineLauncher §C-B1 → initViewSetup
        // `zoomToAll()`), which computes the BIM scene bounds and frames the main
        // perspective camera. `zoomToAll()` self-guards on an empty scene (logs
        // "[zoomToAll] No geometry found in scene" and no-ops), so this is safe to
        // fire before geometry exists. Deferred ~320 ms so any just-committed
        // element meshes + matrixWorld are present before bounds are read (the same
        // posture as §3D-FRAME-ON-VIEW-SWITCH / §13-CAM). Additive: does NOT touch
        // the plan pane, 2D Map, or Site-3D paths.
        setTimeout(() => {
            if (!this._active) return; // toggled back off before the frame landed
            // §AUTOFRAME-NO-HIJACK-WHILE-DRAWING (2026-06-23) — if a draw tool is
            // active when this deferred frame lands, the user is mid-draw (e.g.
            // placing their first wall, scene 0→1). Auto-framing here would yank
            // their plan view to the new element. Suppress; explicit zoom-to-fit
            // and project-open framing are unaffected (they don't pass through here).
            if (shouldSuppressAutoFrameWhileDrawing()) {
                console.log('[SplitViewManager] §VIEW-AUTOFRAME: suppressed — a draw tool is active (no camera hijack while drawing).');
                return;
            }
            try {
                window.runtime?.bus?.executeCommand('zoom-fit', {});
                console.log('[SplitViewManager] §VIEW-AUTOFRAME: framed main 3D viewport on split-view entry.');
            } catch (err) {
                console.warn('[SplitViewManager] §VIEW-AUTOFRAME: zoom-fit dispatch failed (non-fatal):', err);
            }
        }, 320);
    }

    deactivate(): void {
        if (!this._active) return;
        this._active = false;

        this._unregisterTick?.();
        this._unregisterTick = null;
        this._unsubscribeVGEvents();
        this._unsubscribeSelectionEvents();

        if (this._wheelMotionTimer !== null) {
            clearTimeout(this._wheelMotionTimer);
            this._wheelMotionTimer = null;
            getFrameScheduler().endMotion('svp-zoom');
        }

        // Contract 17 Phase 2 — detach SVP tool overlay
        svpPlanToolOverlay.detach();

        // Phase 3 — detach the parity interaction layer.
        this._planInteraction?.detach();
        this._planInteraction = null;

        this._teardownDOM();
        this._teardownContext();

        // F.events.7 — split-view family migrated to runtime.events typed bus.
        window.runtime?.events?.emit('split-view-deactivated', {});
        window.runtime?.events?.emit('split-view-layout-changed', { splitRatio: 0 });
        window.runtime?.events?.emit('split-view-view-changed', { viewId: null });
        console.log('[SplitViewManager] Split view deactivated');
    }

    toggle(): void {
        this._active ? this.deactivate() : this.activate();
    }

    /** Call after scene geometry changes to refit the camera. */
    refitCamera(): void {
        if (!this._active) return;
        this._fitCamTargetToScene();
    }

    // ── DOM ───────────────────────────────────────────────────────────────────

    private _buildDOM(): void {
        // ── Secondary pane ────────────────────────────────────────────────────
        const pane = document.createElement('div');
        pane.className = 'svp-pane';
        pane.id = 'svp-secondary-pane';
        this._pane = pane;
        this._applySplitRatio();

        // ── Header ────────────────────────────────────────────────────────────
        const header = document.createElement('div');
        header.className = 'svp-header';

        const titleGroup = document.createElement('div');
        titleGroup.className = 'svp-header-title';

        const dot = document.createElement('span');
        dot.className = 'svp-header-dot';

        // ══════════════════════════════════════════════════════════════════════
        // §ONE-VIEW-SWITCHER (founder 2026-09-07 · L-13160 · C59 §1.4 / §1.1)
        //
        // ⭐ THIS SELECT IS THIS PANE'S ONE VIEW CONTROL, AND IT ALREADY IS A DROPDOWN.
        // The rule that came out of L-13015 is SWITCHER COUNT == VISIBLE VIEW-REGION COUNT.
        // In the PRYZM 3D + plan split there are two regions: `#container` (the model), which
        // §ONE-VIEW-SWITCHER gives the `ViewSwitcherPill`, and THIS pane, which has carried
        // this select since it replaced the static "Floor Plan" label.
        //
        // ⛔ SO NO SECOND DROPDOWN IS ADDED HERE, DELIBERATELY. Mounting the founder's six
        // beside this one would put two view controls over one pane — the exact stack he
        // photographed and ruled on (*"keep the one, the formal and more robust only"*).
        //
        // ⚠ AND IT SWITCHES AT A DIFFERENT GRANULARITY, WHICH IS WHY IT IS NOT REDUNDANT
        // WITH THE PILL. The pill chooses among the founder's six top-level views; this
        // chooses among this project's VIEW DEFINITIONS (which plan, which section, which
        // elevation). C59 §1.1 names that as exactly what `bim-elevation-2d` /
        // `bim-section-2d` need before they can be pane-hosted — *"a per-pane view-definition
        // id, which is Phase 3's per-pane view state"* — and this select is where that id
        // lives today.
        //
        // ⛔ WHAT THIS PANE CANNOT DO, STATED RATHER THAN HIDDEN: it cannot host the 3D Site
        // or the 2D map. It is the legacy Canvas2D pane, not a `PaneHost` (C59 §3, Phase 4),
        // so its dropdown offers view definitions and never the Cesium/MapLibre views. That
        // is a real difference from a site pane's picker, and it is a C59 phase boundary, not
        // an omission by this lane.
        // ══════════════════════════════════════════════════════════════════════
        // View-type selector — replaces the static "Floor Plan" text label.
        const viewSel = document.createElement('select');
        viewSel.className = 'svp-view-select';
        this._buildViewSelectOptions(viewSel);
        viewSel.value = this._planViewId;
        viewSel.addEventListener('change', () => {
            if (this._viewSelect) this._onViewSelectChange(this._viewSelect.value);
        });
        this._viewSelect = viewSel;

        titleGroup.appendChild(dot);
        titleGroup.appendChild(viewSel);

        // ══════════════════════════════════════════════════════════════════════
        // §BIM-3D-CHROME-QUIET (founder 2026-09-07 · L-13027 · L-13084 · C59 §2.10.3)
        //
        // *"clean the rest on the top — make it simple."* The `Level: [Ground ▾]` chip
        // that stood here is RELOCATED, NOT DELETED — and it was never this pane's
        // control to own: `projectContext.activeLevelId` is the ONE level authority and
        // this chip was one of three writers of it.
        //
        // ⭐ WHERE THE FUNCTION LIVES NOW, so nothing became unreachable:
        //   · CHANGE the active level → `ActiveLevelHUD` (`ui/levels/ActiveLevelHUD.ts:123`),
        //     mounted into `#alh-modebar-slot` beside Author | Inspect | Analysis | Data
        //     (`DockingLayout.ts:230` creates the slot, `CreatePanelLayout.ts:835` fills it).
        //     It writes the SAME `projectContext.activeLevelId = id`, always on screen,
        //     independent of whether this pane is open.
        //   · JUMP to a level BY NAME from a list → `LevelManagerPanel`
        //     (`ui/levels/LevelManagerPanel.ts`) inside the Levels & Grids rail panel
        //     (`ui/ViewBrowser/panels/LevelsGridsRailPanel.ts:54`). The HUD steps ▲/▼; the
        //     rail panel is the full list, which is what a tall project needs.
        //   · SHOW which level is active → the HUD renders name + elevation.
        //
        // ⛔ THE ONE RESIDUAL, PROBED BEFORE REMOVAL RATHER THAN ASSUMED. The chip also
        // called `_setCameraElevation(lv.elevation)`, and the HUD does not. MEASURED: that
        // leg is INERT. `_setCameraElevation` writes `_camTarget.y` and NOTHING reads it —
        // `_render` maps world→canvas from `.x`/`.z` only; `PlanViewCanvas.setFrustum`
        // (`packages/core-app-model/src/views/PlanViewCanvas.ts:871`) copies the vector but
        // reads `.y` solely for a `Number.isFinite` check and the refusal log's text. Its
        // own body says so: *"Store the target elevation for multi-level support (future)."*
        // And `_onViewSelectChange` resets `_camTarget.set(0, 0, 0)` on every view change,
        // so even the stored value does not survive the level switch it was set by.
        // The chip's OTHER two legs ARE carried: `_hasFitProjectedDrawing = false` is set
        // by `_onViewSelectChange`, reached via `LevelPlanViewBinder._retargetPlanSurfaces`
        // → `setPlanViewId`; and that binder is driven by the very `activeLevelChanged`
        // that `ActiveLevelHUD` emits (`ProjectContext.ts:33`).
        //
        // ⚠ STATED COST: switching level from the HUD is ▲/▼ stepping, not a one-click jump
        // to an arbitrary storey. On a tall project the by-name jump is the rail panel, one
        // extra gesture away. That is a real degradation and it is written down rather than
        // blessed.
        //
        // The `.svp-level-select` / `.svp-header-level` RULES STAY in `styles/panels/
        // splitView.ts` — `shellFloatBudget.spec.ts` pins their legibility floors and they
        // are the shape any future in-pane level control must take.
        // ══════════════════════════════════════════════════════════════════════

        // ── Contract 25b Wave 2 — legacy VG eye button + template dropdown retired ───
        // The unified shared toolbar built below (`buildViewHeaderToolbar`, Stage S1+S4)
        // owns the V/G entry point, intent picker and overrides badge.

        header.appendChild(titleGroup);

        // ── Stage S1+S4 — shared parity toolbar (Grid / IFC / V/G / Overrides / Intent / Range / Close) ──
        const handle = buildViewHeaderToolbar({
            viewId: this._planViewId,
            initialGridOn: true,
            onGridToggle: () => {
                const btn = this._pane?.querySelector<HTMLButtonElement>('.svp-grid-toggle-btn');
                btn?.click();
            },
            onClose: () => this.deactivate(),
        });
        header.appendChild(handle.toolbar);
        header.appendChild(handle.isolateBanner);
        this._viewHeaderHandle = handle;

        // Contract 25b Wave 2: legacy vgBtn / closeBtn reference-keepers removed
        // along with their declarations; the shared toolbar above is canonical.

        // ── Canvas wrap ───────────────────────────────────────────────────────
        const canvasWrap = document.createElement('div');
        canvasWrap.className = 'svp-canvas-wrap';

        const canvas = document.createElement('canvas');
        canvas.className = 'svp-canvas';
        canvas.id = 'svp-canvas';
        this._canvas = canvas;
        canvasWrap.appendChild(canvas);

        // Phase 1b — icon-only grid toggle in the bottom-left corner.
        const gridToggleBtn = document.createElement('button');
        gridToggleBtn.className = 'svp-grid-toggle-btn';
        gridToggleBtn.type = 'button';
        gridToggleBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <line x1="0" y1="4.67" x2="14" y2="4.67" stroke="currentColor" stroke-width="1.1"/>
            <line x1="0" y1="9.33" x2="14" y2="9.33" stroke="currentColor" stroke-width="1.1"/>
            <line x1="4.67" y1="0" x2="4.67" y2="14" stroke="currentColor" stroke-width="1.1"/>
            <line x1="9.33" y1="0" x2="9.33" y2="14" stroke="currentColor" stroke-width="1.1"/>
        </svg>`;
        gridToggleBtn.addEventListener('click', () => {
            this._gridVisible = !this._gridVisible;
            this._writeGridPreference(this._gridVisible);
            this._syncGridToggleButton();
            this._render();
        });
        this._gridToggleBtn = gridToggleBtn;
        canvasWrap.appendChild(gridToggleBtn);
        this._syncGridToggleButton();

        // ── Badge ─────────────────────────────────────────────────────────────
        const badge = document.createElement('div');
        badge.className = 'svp-badge';
        badge.textContent = 'Scroll to zoom · Drag to pan';
        setTimeout(() => badge.style.opacity = '0', 3000);
        badge.style.transition = 'opacity 0.8s';
        canvasWrap.appendChild(badge);

        pane.appendChild(header);
        pane.appendChild(canvasWrap);
        document.body.appendChild(pane);

        // ── Divider ───────────────────────────────────────────────────────────
        const divider = document.createElement('div');
        divider.className = 'svp-divider';
        divider.id = 'svp-divider';
        this._divider = divider;
        // §VIEW-REGION-HAS-ONE-OWNER — the divider is positioned by the region owner
        // (below, once both nodes are in the document), not by a private spelling here.
        document.body.appendChild(divider);

        // ── Divide the VIEW REGION ────────────────────────────────────────────
        // ⭐ §VIEW-REGION-HAS-ONE-OWNER (C59 §2 invariant 10 / §2.10 · STR §26.1.2 ·
        // L-13030) — THE SPLIT DECLARES A FRACTION. IT DOES NOT WRITE A BOX.
        //
        // ⛔ WHAT THIS REPLACED, AND WHY IT WAS THE OTHER HALF OF THE OSCILLATION. This
        // block wrote `#container.style.{width,maxWidth,flexGrow,flexShrink,flexBasis}`
        // to `(1 - ratio)` OF THE WINDOW, and added `.svp-active` whose stylesheet rule
        // asserted the same 60 % a third time. `DataWorkbench._applyMode` wrote `'50%'`
        // to the same property for its own split mode. Each write resized the canvas;
        // each resize ran a settle pass that re-asserted the other's value — the founder's
        // console showed the resulting cycle SIX times consecutively for zero user input.
        //
        // ⛔ AND `(1 - ratio)` OF THE WINDOW WAS WRONG EVEN ALONE. STR §26.1.2: *"SPLIT
        // VIEW SHOULD ALWAYS SPLIT THE VIEW OF THE SECTION OF THE VIEWS ... in ANALYSE
        // view, then split view will divide THE LEFT HAND SIDE VIEW in 2."* A fraction of
        // the WINDOW makes the Analysis panel one half of the split, which is precisely
        // what the founder called *"mixed up, not architecturally sound"*. The ratio is
        // now a fraction OF THE REGION, and the owner — the only level that knows how big
        // the region is — derives `#container`'s width, this pane's width, and this pane's
        // `right` offset from it. That offset is what puts the pane BESIDE the Analysis
        // panel instead of behind it (which is what `halfCanvasSplitViewPolicy`, now
        // deleted, used to close the pane to avoid).
        setViewRegionSplit(this._splitRatio);
        // Notify the OBC world that the renderer viewport changed.
        const container = document.getElementById('container');
        if (container) setTimeout(() => this._notifyPrimaryResize(), 250);

        // ── Register input events ─────────────────────────────────────────────
        canvas.addEventListener('wheel', this._boundWheel, { passive: false });
        canvas.addEventListener('mousedown', this._boundMouseDown);
        canvas.addEventListener('dblclick', this._boundDblClick);
        window.addEventListener('mousemove', this._boundMouseMove);
        window.addEventListener('mouseup', this._boundMouseUp);
        divider.addEventListener('mousedown', this._boundDividerDown);
        window.addEventListener('mousemove', this._boundDividerMove);
        window.addEventListener('mouseup', this._boundDividerUp);

        // ── ResizeObserver on the secondary pane ─────────────────────────────
        this._resizeObserver = new ResizeObserver(() => this._onSecondaryResize());
        this._resizeObserver.observe(pane);
    }

    private _teardownDOM(): void {
        this._canvas?.removeEventListener('wheel', this._boundWheel);
        this._canvas?.removeEventListener('mousedown', this._boundMouseDown);
        this._canvas?.removeEventListener('dblclick', this._boundDblClick);
        window.removeEventListener('mousemove', this._boundMouseMove);
        window.removeEventListener('mouseup', this._boundMouseUp);
        this._divider?.removeEventListener('mousedown', this._boundDividerDown);
        window.removeEventListener('mousemove', this._boundDividerMove);
        window.removeEventListener('mouseup', this._boundDividerUp);

        this._resizeObserver?.disconnect();
        this._resizeObserver = null;

        this._embedEl?.remove();
        this._embedEl        = null;
        // §SVP-FITALL-MIRROR-STARVED (L-743) — the pane is gone; nothing consumes the main
        // canvas any more, so release the pin and let PlanViewManager's hide take effect.
        mainRendererVisibility.unpin(MAIN_RENDERER_PIN_SVP_3D_MIRROR);
        this._svpMode        = 'plan';
        this._svpSpecialId   = '';

        this._pane?.remove();
        this._divider?.remove();
        this._pane           = null;
        this._canvas         = null;
        this._gridToggleBtn  = null;
        this._viewSelect     = null;
        this._divider        = null;

        // §VIEW-REGION-HAS-ONE-OWNER — the region is no longer divided. Five inline
        // clears used to live here; the owner releases the box back to `flex: 1 1 0`.
        setViewRegionSplit(null);
        const container = document.getElementById('container');
        if (container) setTimeout(() => this._notifyPrimaryResize(), 250);
    }

    // ── Canvas2D context ──────────────────────────────────────────────────────

    /**
     * Obtain a 2D rendering context for the secondary canvas.
     * No THREE.js renderer is created — see file header for rationale.
     */
    private _buildContext(): void {
        if (!this._canvas) return;
        try {
            this._planCanvas = new PlanViewCanvas(this._canvas, {
                gridVisible: this._gridVisible,
                // §L-431 slice 2 — PUSH the site context down to the pure Canvas2D renderer.
                // `PlanViewCanvas` is a LOWER layer (core-app-model) and must not import the
                // site subsystem, so the app layer supplies the rings through this callback
                // (same injection pattern as `styleResolver`). Read fresh on every paint so a
                // newly committed parcel / recomputed envelope appears without re-construction.
                // §L-432 — ONE shared reader, also used by the site-context SNAP provider. Two
                // separate reads could drift, drawing the setback line in one place while the
                // snap fires in another.
                siteContextProvider: readSiteContextRings,
                // VIEW-SYSTEM-AUDIT-2026 F13 — the VG signature is `(modelId, category,
                // viewId?)`. An earlier copy of this closure passed `this._planViewId` as
                // the FIRST positional argument (modelId) and silently produced default
                // styling. That class of drift is why there is now ONE resolver:
                //
                // §FIX-VISIBILITY-INTENT-AUTHORITY (L-776) — shared with PlanViewManager.
                // It reports a VG contribution ONLY where VG genuinely OVERRIDES, so a
                // built-in template seed no longer outranks the bound visibility intent
                // (C09 §4.1 / §4.5). The closure still runs on every paint, so reading
                // `this._planViewId` per call stays correct after `_setView()` switches view.
                styleResolver: (category, layerTag) =>
                    resolveVgCanvasStyle(category, layerTag, this._planViewId ?? undefined),
            });
            this._syncCanvasSize();
            this._syncPlanCanvasState();
            console.log('[SplitViewManager] Canvas2D context ready');
        } catch (err) {
            console.error('[SplitViewManager] Failed to get Canvas2D context');
        }
    }

    private _teardownContext(): void {
        this._planCanvas?.dispose();
        this._planCanvas = null;
    }

    /**
     * Phase 2 G6 — apply per-view canvas configuration (view type, bound level,
     * section/elevation axes).  Called from both activate() (first frame) and
     * _setView() (every subsequent view change), so the SVP first frame is
     * correct even when the user opens the split view directly into a section
     * or elevation.  Returns whether the resolved view is plan-like.
     */
    private _configureCanvasForView(viewDef: any, viewType: string): boolean {
        // Configure PlanViewCanvas for the new view type.
        this._planCanvas?.setViewType(viewType);
        // §02-SPATIAL-PROJECTION §4.2 / §25-VISIBILITY-INTENT §3.4 — propagate
        // the view's bound level so that level-scoped renderers (room fills,
        // BIM grid datums, lighting plan symbols) match what the standalone
        // PlanViewManager renders.
        this._planCanvas?.setLevelId(viewDef?.spatial?.levelId ?? null);

        const isPlanLike = viewType === 'plan' || viewType === 'ceiling-plan' ||
                           viewType === 'structural-plan' || viewType === 'detail';

        if (!isPlanLike) {
            // Section / elevation — map world Y (elevation) to canvas vertical axis.
            const dir = viewDef?.spatial?.projectionDirection;
            let hAxis: 'x' | 'z' = 'x';
            if (dir) {
                const absX = Math.abs(dir.x ?? 0);
                const absZ = Math.abs(dir.z ?? 0);
                hAxis = absX > absZ ? 'z' : 'x';
            }
            const right = { x: -((dir?.z ?? -1)), z: dir?.x ?? 0 };
            const hSign: 1 | -1 = ((hAxis === 'x' ? right.x : right.z) < 0 ? -1 : 1);
            this._planCanvas?.setSectionAxes(hAxis, true, hSign);
        } else {
            this._planCanvas?.setSectionAxes('x', false);
        }
        return isPlanLike;
    }

    // ── Phase 2: VG event subscriptions ──────────────────────────────────────

    /**
     * Subscribe to VG store events so the SVP re-renders when the user changes
     * visibility or templates from the VGGovernancePanel.
     * Mirrors the subscription pattern used by VGGovernancePanel itself.
     */
    private _subscribeVGEvents(): void {
        const VG_EVENTS = [
            'vg:category-style-set',
            'vg:category-style-reset',
            'vg:view-style-set',
            'vg:view-style-reset',
            'vg:model-template-assigned',
            'vg:template-updated',
            'vg:template-deleted',
        ];
        for (const evt of VG_EVENTS) {
            const handler = () => {
                // Contract 25b Wave 2: VG template select removed; only mark dirty.
                this._lastRender = 0;
            };
            window.addEventListener(evt, handler);
            this._vgUnlisteners.push(() => window.removeEventListener(evt, handler));
        }

        // Underlay events — re-render when a PDF/image underlay is placed, removed, or toggled.
        const underlayHandler = () => { this._lastRender = 0; };
        const UNDERLAY_EVENTS = [
            'pryzm-floor-plan-underlay-placed',
            'pryzm-floor-plan-underlay-removed',
            'pryzm-floor-plan-underlay-visibility-changed',
        ];
        for (const evt of UNDERLAY_EVENTS) {
            window.addEventListener(evt, underlayHandler);
            this._vgUnlisteners.push(() => window.removeEventListener(evt, underlayHandler));
        }
    }

    private _unsubscribeVGEvents(): void {
        for (const unlisten of this._vgUnlisteners) unlisten();
        this._vgUnlisteners = [];
    }

    /**
     * Subscribe to 3D scene selection changes so the split view re-renders
     * with selection highlights whenever the user picks an element in the main
     * viewport (or clears the selection).
     *
     * The re-render cost is negligible: PlanViewCanvas already has the drawing
     * in memory and _renderSelectionHighlights() only iterates the segments of
     * the newly selected element — O(segments-in-element), not O(all-segments).
     *
     * Architecture note: PlanViewCanvas._renderSelectionHighlights() reads
     * window.selectionManager.selectedObject directly, so we only need to
     * trigger a re-render; no data has to be passed across the boundary.
     */
    private _subscribeSelectionEvents(): void {
        const selectionHandler = () => {
            // Reset the render timestamp so the next UnifiedFrameLoop tick
            // triggers _render() → PlanViewCanvas.render() →
            // _renderSelectionHighlights() with the latest selection state.
            this._lastRender = 0;
        };
        // F.events.16 — bim-selection-changed migrated to runtime.events typed bus.
        // runtime.events.on() returns a Disposable ({ dispose() }), NOT an unsubscribe
        // function (see packages/runtime-composer/src/EventBus.ts). Calling it as a
        // function threw `TypeError: _unsubSelectionChanged is not a function` inside
        // _unsubscribeSelectionEvents(), aborting deactivate() and wedging the split-view
        // toggle button. Dispose via .dispose() — matches the svp:drawing-refreshed
        // pattern immediately below.
        const _unsubSelectionChanged = window.runtime?.events?.on('bim-selection-changed', selectionHandler) ?? null;
        if (_unsubSelectionChanged) {
            this._selectionUnlisteners.push(() => _unsubSelectionChanged.dispose());
        }

        // When PlanViewManager finishes reprojecting the split view's elevation/section
        // (after a scope/crop change), reset the fit flag so the camera re-fits to the
        // new geometry on the very next render tick.
        // F.events.10 — svp:drawing-refreshed via runtime.events
        const subDrawingRefreshed = window.runtime?.events?.on('svp:drawing-refreshed', (payload: unknown) => {
            const viewId = (payload as { viewId?: string })?.viewId;
            if (viewId && viewId === this._planViewId) {
                this._hasFitProjectedDrawing = false;
                this._lastRender = 0;
            }
        });
        if (subDrawingRefreshed) {
            this._selectionUnlisteners.push(() => subDrawingRefreshed.dispose());
        }

        // Doc 07 Phase 4 — view-definition edits.  When the user edits the
        // currently-displayed view (rename, scope, level, view range, …), the
        // ViewDefinitionStore dispatches `vd:view-updated`.  Repaint on the
        // next tick so the SVP picks up the new view definition immediately.
        // Mirrors PlanViewManager's listener (PlanViewManager.ts:131).
        const viewUpdatedHandler = (e: Event) => {
            const viewId = (e as CustomEvent<{ viewId?: string }>).detail?.viewId;
            // Repaint when our active view was edited, OR when the event has
            // no viewId (broadcast / bulk update).
            if (!viewId || viewId === this._planViewId) {
                this._lastRender = 0;
            }
        };
        window.addEventListener('vd:view-updated', viewUpdatedHandler);
        this._selectionUnlisteners.push(
            () => window.removeEventListener('vd:view-updated', viewUpdatedHandler)
        );

        // §DOC-VIEWS-IN-DROPDOWN (2026-06-24) — repopulate the view-type dropdown
        // when ViewDefinitions are created/deleted/loaded while the split view is
        // open. Previously the SVP only listened for `vd:view-updated` (edits to
        // the active view), so batch-created documentation views (per-level plans,
        // building elevations) NEVER appeared in this dropdown — it kept showing the
        // stale "Floor Plans: Ground Floor / Elevations: (none created)" list until
        // the pane was re-opened. `_buildViewSelectOptions` reads the store live, so
        // re-running it surfaces every new view under its category. We preserve the
        // current selection across the rebuild so the displayed pane does not jump.
        const viewListChangedHandler = (): void => {
            const sel = this._viewSelect;
            if (!sel) return;
            repopulateViewSelectPreservingSelection(
                sel,
                (s) => this._buildViewSelectOptions(s),
                this._planViewId,
            );
        };
        window.addEventListener('vd:view-created', viewListChangedHandler);
        window.addEventListener('vd:view-deleted', viewListChangedHandler);
        window.addEventListener('vd:store-loaded', viewListChangedHandler);
        this._selectionUnlisteners.push(
            () => window.removeEventListener('vd:view-created', viewListChangedHandler),
            () => window.removeEventListener('vd:view-deleted', viewListChangedHandler),
            () => window.removeEventListener('vd:store-loaded', viewListChangedHandler),
        );

        // Doc 07 Phase 4 — IFC re-projection.  When IFCProjectionStore finishes
        // re-projecting a view (after an IFC import, scope change, or projection
        // toggle), clear `_hasFitProjectedDrawing` so the next render re-fits
        // the camera to the freshly-projected geometry, then mark dirty.
        // Mirrors PlanViewManager's listener (PlanViewManager.ts:139).
        const ifcProjectionHandler = (e: Event) => {
            const viewId = (e as CustomEvent<{ viewId?: string }>).detail?.viewId;
            if (!viewId || viewId === this._planViewId) {
                this._hasFitProjectedDrawing = false;
                this._lastRender = 0;
            }
        };
        window.addEventListener(IFC_PROJECTION_CHANGED_EVENT, ifcProjectionHandler);
        this._selectionUnlisteners.push(
            () => window.removeEventListener(IFC_PROJECTION_CHANGED_EVENT, ifcProjectionHandler)
        );
    }

    private _unsubscribeSelectionEvents(): void {
        for (const unlisten of this._selectionUnlisteners) unlisten();
        this._selectionUnlisteners = [];
    }

    // Contract 25b Wave 2 — _buildTemplateOptions / _syncTemplateSelect removed.
    // VG template authoring is fully replaced by the Visibility Intent system.

    /**
     * Populate the view-type <select> with grouped options:
     *   Floor Plans | Reflected Ceiling Plans | Sections | Elevations
     *
     * Views are sourced from ViewDefinitionStore. Each group always appears;
     * if no views of that type exist a disabled placeholder is shown.
     * The default plan view (DEFAULT_PLAN_VIEW_ID) is always included.
     */
    private _buildViewSelectOptions(sel: HTMLSelectElement): void {
        sel.innerHTML = '';

        const addGroup = (label: string, views: Array<{ id: string; name?: string | null }>, placeholder: string) => {
            const group = document.createElement('optgroup');
            group.label = label;
            if (views.length === 0) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = placeholder;
                opt.disabled = true;
                group.appendChild(opt);
            } else {
                views.forEach(v => {
                    const opt = document.createElement('option');
                    opt.value = v.id;
                    opt.textContent = v.name ?? v.id;
                    group.appendChild(opt);
                });
            }
            sel.appendChild(group);
        };

        // ── Floor Plans ──────────────────────────────────────────────────────
        let planViews = viewDefinitionStore.getByType('plan');
        // Ensure the default plan view is always present.
        if (planViews.length === 0) {
            planViews = [{ id: DEFAULT_PLAN_VIEW_ID, name: 'Ground Floor', viewType: 'plan' } as any];
        }
        addGroup('Floor Plans', planViews, '(none)');

        // ── Reflected Ceiling Plans ──────────────────────────────────────────
        const rcpViews = viewDefinitionStore.getByType('ceiling-plan');
        addGroup('Reflected Ceiling Plans', rcpViews, '(none created)');

        // ── Sections ─────────────────────────────────────────────────────────
        const secViews = viewDefinitionStore.getByType('section');
        addGroup('Sections', secViews, '(none created)');

        // ── Elevations ───────────────────────────────────────────────────────
        const elevViews = viewDefinitionStore.getByType('elevation');
        addGroup('Elevations', elevViews, '(none created)');

        // ── 3D View ───────────────────────────────────────────────────────────
        addGroup('3D View', [{ id: '__3d__', name: '3D Model' }], '');

        // ── Schedules ─────────────────────────────────────────────────────────
        const schedules = scheduleStore.getAll().map(s => ({ id: `__sched:${s.id}`, name: s.name ?? s.id }));
        addGroup('Schedules', schedules, '(none created)');

        // ── Sheets ────────────────────────────────────────────────────────────
        const sheets = sheetStore.getAll().map(s => ({ id: `__sheet:${s.id}`, name: s.name ?? s.id }));
        addGroup('Sheets', sheets, '(none created)');
    }

    /**
     * Handle the user selecting a new view from the view-type dropdown.
     *
     * Special view IDs:
     *   '__3d__'        → mirror the main 3D renderer canvas in the SVP
     *   '__sched:ID'    → show a read-only schedule table in the SVP
     *   '__sheet:ID'    → show a read-only sheet summary in the SVP
     *
     * Per Contract §22:
     *  - section/elevation views need setSectionAxes(hAxis, flipV=true) on PlanViewCanvas.
     *  - hAxis is derived from projectionDirection: x-dominant → hAxis='z', z-dominant → hAxis='x'.
     *  - plan/ceiling-plan views use the default plan axes (hAxis='x', flipV=false).
     *
     * Per Contract §01 §4 the SVP is read-only — this does NOT trigger a new EdgeProjector
     * projection; it renders whatever is already cached for the selected view.
     */
    private _onViewSelectChange(viewId: string): void {
        if (!viewId) return;

        // ── 3D View ───────────────────────────────────────────────────────────
        if (viewId === '__3d__') {
            this._svpSpecialId = viewId;
            this._activateMode('3d');
            console.log('[SplitViewManager] View changed → 3D View');
            // §SVP3D-FRAME-ON-SWITCH (founder 2026-06-24: "the right-pane 3D should zoom/fit") — the
            // right pane's 3D mode is a 1:1 mirror of the main canvas and has NO camera of its own,
            // so framing the MAIN perspective camera reframes the mirror. §VIEW-AUTOFRAME above only
            // fires on split-view ENTRY, not on this in-session switch to 3D. Reuse the registered
            // zoom-fit command (→ zoomToAll), deferred ~320 ms so just-committed meshes are present,
            // guarded by the same no-hijack-while-drawing predicate.
            setTimeout(() => {
                if (!this._active || this._svpMode !== '3d') return;
                if (shouldSuppressAutoFrameWhileDrawing()) return;
                try {
                    window.runtime?.bus?.executeCommand('zoom-fit', {});
                    console.log('[SplitViewManager] §SVP3D-FRAME-ON-SWITCH: framed main 3D on right-pane 3D switch.');
                } catch (err) {
                    console.warn('[SplitViewManager] §SVP3D-FRAME-ON-SWITCH: zoom-fit failed (non-fatal):', err);
                }
            }, 320);
            return;
        }

        // ── Schedule ──────────────────────────────────────────────────────────
        if (viewId.startsWith('__sched:')) {
            const schedId = viewId.slice('__sched:'.length);
            this._svpSpecialId = schedId;
            this._activateMode('schedule');
            console.log('[SplitViewManager] View changed → Schedule', schedId);
            return;
        }

        // ── Sheet ─────────────────────────────────────────────────────────────
        if (viewId.startsWith('__sheet:')) {
            const sheetId = viewId.slice('__sheet:'.length);
            this._svpSpecialId = sheetId;
            this._activateMode('sheet');
            console.log('[SplitViewManager] View changed → Sheet', sheetId);
            return;
        }

        // ── Plan / Section / Elevation (Canvas2D) ─────────────────────────────
        if (viewId === this._planViewId && this._svpMode === 'plan') return;

        this._activateMode('plan');

        // Resolve the view definition from the store.
        const viewDef = viewDefinitionStore.get(viewId);
        const viewType = viewDef?.viewType ?? 'plan';

        this._planViewId = viewId;
        this._hasFitProjectedDrawing = false;

        // Phase 2 G6 — extracted to _configureCanvasForView so first-frame
        // (activate) and subsequent view changes apply identical setup.
        // §BIM-3D-CHROME-QUIET — the return value gated the pane-header level chip's
        // visibility (plan-family views only). The chip is relocated to `ActiveLevelHUD`,
        // which is level state and not view state, so it is correct for it NOT to hide on
        // a section or an elevation: the active level still decides where new elements
        // land. Nothing else read this flag here.
        this._configureCanvasForView(viewDef, viewType);

        // Reset pan/zoom so the new drawing fits the pane.
        this._camTarget.set(0, 0, 0);
        this._frustumH = DEFAULT_FRUSTUM;
        this._syncPlanCanvasState();

        // F.events.7 — split-view family migrated to runtime.events typed bus.
        window.runtime?.events?.emit('split-view-view-changed', { viewId: this._planViewId });

        // Contract 17 Phase 2 — keep SVP tool overlay in sync with the active view
        svpPlanToolOverlay.setViewId(this._planViewId);

        // Phase 3 — re-target the PlanViewInteraction layer at the new view.
        // PlanViewInteraction has no setViewId(), so detach + re-attach.
        if (this._planInteraction && this._canvas && this._planCanvas) {
            this._planInteraction.detach();
            this._planInteraction.attach(this._canvas, this._planCanvas, this._planViewId);
        }

        console.log('[SplitViewManager] View changed →', viewId, `(${viewType})`);
    }

    /**
     * Switch the SVP content mode. Handles show/hide of the Canvas2D vs embed div.
     */
    private _activateMode(mode: 'plan' | '3d' | 'schedule' | 'sheet'): void {
        const prev = this._svpMode;
        this._svpMode = mode;

        // §SVP-FITALL-MIRROR-STARVED (L-743) — the '3d' pane is a MIRROR of the main 3D
        // canvas with no camera and no renderer of its own, so its only source of pixels is
        // the main renderer actually rendering. When the main pane hosts a Canvas2D
        // plan / elevation view, PlanViewManager asks for the main renderer container to be
        // hidden — which stops compositing and freezes the mirror. Fit All then moved the
        // shared camera correctly and changed nothing on screen: the founder's "in the split
        // view, right-hand side, the Fit All doesn't work". Pin the renderer visible while we
        // are consuming its pixels; the pin vetoes the hide. The Canvas2D overlay still
        // covers the main pane, so nothing new appears there.
        if (mode === '3d') {
            mainRendererVisibility.pin(MAIN_RENDERER_PIN_SVP_3D_MIRROR);
        } else {
            mainRendererVisibility.unpin(MAIN_RENDERER_PIN_SVP_3D_MIRROR);
        }

        const isEmbed = mode === 'schedule' || mode === 'sheet';
        const wasEmbed = prev === 'schedule' || prev === 'sheet';

        // Show/hide the canvas (both plan and 3d modes use the canvas element)
        if (this._canvas) {
            this._canvas.style.display = isEmbed ? 'none' : '';
            // Doc 08 Phase A — crosshair cursor in 3D mode signals the pane is
            // clickable (clicks are forwarded to the main 3D canvas for picking).
            // Restore the default cursor for plan / section / elevation modes —
            // PlanViewInteraction will override per-gesture (move, ns-resize, …).
            this._canvas.style.cursor = mode === '3d' ? 'crosshair' : '';
        }
        if (this._gridToggleBtn) {
            this._gridToggleBtn.style.display = isEmbed ? 'none' : '';
        }

        if (isEmbed) {
            // Ensure embed container exists inside the canvas-wrap
            if (!this._embedEl) {
                const wrap = this._canvas?.parentElement;
                if (wrap) {
                    const div = document.createElement('div');
                    div.className = 'svp-embed-container';
                    wrap.appendChild(div);
                    this._embedEl = div;
                }
            }
            this._renderEmbed();
        } else {
            // Remove embed container if transitioning away from embed mode
            if (wasEmbed && this._embedEl) {
                this._embedEl.remove();
                this._embedEl = null;
            }
        }
    }

    /**
     * Render the schedule or sheet embed content inside _embedEl.
     */
    private _renderEmbed(): void {
        const el = this._embedEl;
        if (!el) return;
        el.innerHTML = '';

        if (this._svpMode === 'schedule') {
            const schedule = scheduleStore.get(this._svpSpecialId);
            if (!schedule) {
                el.innerHTML = `<div class="svp-embed-empty">Schedule not found</div>`;
                return;
            }
            // Build a read-only schedule table
            const title = document.createElement('div');
            title.className = 'svp-embed-title';
            title.textContent = schedule.name ?? 'Schedule';
            el.appendChild(title);

            const tableWrap = document.createElement('div');
            tableWrap.className = 'svp-embed-table-wrap';

            const table = document.createElement('table');
            table.className = 'svp-embed-table';

            // Header row from schedule columns
            const cols: Array<{ id: string; label: string }> = (schedule as any).columns ?? [];
            if (cols.length > 0) {
                const thead = table.createTHead();
                const tr = thead.insertRow();
                cols.forEach(col => {
                    const th = document.createElement('th');
                    th.textContent = col.label ?? col.id;
                    tr.appendChild(th);
                });
            }

            // Data rows — pull from SchedulePanel's ScheduleRegistry if available
            const registry = window.scheduleRegistry;
            const rows: Array<Record<string, unknown>> = registry?.getRows?.(schedule.id) ?? [];
            const tbody = table.createTBody();
            if (rows.length === 0) {
                const tr = tbody.insertRow();
                const td = tr.insertCell();
                td.colSpan = Math.max(cols.length, 1);
                td.className = 'svp-embed-empty-row';
                td.textContent = '(no data)';
            } else {
                rows.forEach(row => {
                    const tr = tbody.insertRow();
                    cols.forEach(col => {
                        const td = tr.insertCell();
                        const val = row[col.id];
                        td.textContent = val != null ? String(val) : '—';
                    });
                });
            }

            tableWrap.appendChild(table);
            el.appendChild(tableWrap);
            return;
        }

        if (this._svpMode === 'sheet') {
            const sheet = sheetStore.get(this._svpSpecialId);
            if (!sheet) {
                el.innerHTML = `<div class="svp-embed-empty">Sheet not found</div>`;
                return;
            }

            const title = document.createElement('div');
            title.className = 'svp-embed-title';
            title.textContent = `${(sheet as any).number ?? ''} — ${sheet.name ?? 'Sheet'}`.trim().replace(/^—\s*/, '');
            el.appendChild(title);

            // Sheet metadata
            const meta = document.createElement('div');
            meta.className = 'svp-embed-meta';
            const paperSize = (sheet as any).paperSize as string | undefined;
            const status = (sheet as any).status as string | undefined;
            const issueDate = (sheet as any).issueDate as string | undefined;
            meta.innerHTML = [
                paperSize ? `<span><b>Paper:</b> ${escHtml(paperSize)}</span>` : '',
                status    ? `<span><b>Status:</b> ${escHtml(status)}</span>`    : '',
                issueDate ? `<span><b>Issued:</b> ${escHtml(issueDate)}</span>` : '',
            ].filter(Boolean).join('');
            el.appendChild(meta);

            // Viewport list
            const viewports: Array<{ viewId: string; scale?: number }> = (sheet as any).viewports ?? [];
            if (viewports.length > 0) {
                const vpTitle = document.createElement('div');
                vpTitle.className = 'svp-embed-section';
                vpTitle.textContent = 'Viewports';
                el.appendChild(vpTitle);

                const vpList = document.createElement('ul');
                vpList.className = 'svp-embed-vp-list';
                viewports.forEach(vp => {
                    const viewDef = viewDefinitionStore.get(vp.viewId);
                    const li = document.createElement('li');
                    li.textContent = `${viewDef?.name ?? vp.viewId}${vp.scale ? ` @ 1:${vp.scale}` : ''}`;
                    vpList.appendChild(li);
                });
                el.appendChild(vpList);
            }

            // Revisions
            const revisions: Array<{ rev: string; description?: string }> = (sheet as any).revisions ?? [];
            if (revisions.length > 0) {
                const revTitle = document.createElement('div');
                revTitle.className = 'svp-embed-section';
                revTitle.textContent = 'Revisions';
                el.appendChild(revTitle);

                const tableWrap = document.createElement('div');
                tableWrap.className = 'svp-embed-table-wrap';
                const table = document.createElement('table');
                table.className = 'svp-embed-table';
                const thead = table.createTHead();
                const htr = thead.insertRow();
                ['Rev', 'Description'].forEach(h => {
                    const th = document.createElement('th');
                    th.textContent = h;
                    htr.appendChild(th);
                });
                const tbody = table.createTBody();
                revisions.forEach(rv => {
                    const tr = tbody.insertRow();
                    [rv.rev, rv.description ?? ''].forEach(v => {
                        const td = tr.insertCell();
                        td.textContent = v;
                    });
                });
                tableWrap.appendChild(table);
                el.appendChild(tableWrap);
            }

            if (viewports.length === 0 && revisions.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'svp-embed-empty';
                empty.textContent = 'No viewports or revisions yet';
                el.appendChild(empty);
            }
        }
    }

    private _syncCanvasSize(): void {
        if (!this._planCanvas) return;
        const { w, h } = this._paneSize();
        this._planCanvas.setSize(w, h);
    }

    // §BIM-3D-CHROME-QUIET — `_setCameraElevation(elevation)` lived here and had ONE
    // caller, the retired level chip. Its whole body was `this._camTarget.y = elevation`
    // under the comment *"Store the target elevation for multi-level support (future)."*
    // ⭐ IT WAS PROVABLY INERT and that is why removing it changes no pixel: `_render`
    // maps world→canvas from `_camTarget.x` / `.z` only, `PlanViewCanvas.setFrustum` reads
    // `.y` for a finiteness check and a log string and never for geometry, and
    // `_onViewSelectChange` clears the vector with `_camTarget.set(0, 0, 0)` on every view
    // change. Documented rather than silently deleted so a future per-level plan CAMERA
    // (the "future" that comment promised) is built deliberately, not inherited half-done.

    // ── Render Loop ───────────────────────────────────────────────────────────

    /**
     * Draw one frame of the 2D floor plan onto the Canvas2D context.
     *
     * Source data: ViewTechnicalDrawingCache.get(planViewId) — a TechnicalDrawing
     * whose THREE.Group contains LineSegments children with projected XZ geometry.
     * Each vertex (after world-matrix transform) maps to world XZ coordinates that
     * we convert to canvas pixels via the current pan/zoom state (_camTarget, _frustumH).
     *
     * Coordinate transform (world → canvas):
     *   canvasX = (worldX - camTarget.x + fW) / (2·fW) · W
     *   canvasY = (worldZ - camTarget.z + fH) / (2·fH) · H
     * where fH = _frustumH, fW = fH·aspect, W/H = canvas CSS dimensions.
     * This places worldZ = camTarget.z-fH at the top (screen up = world -Z).
     */
    private _render(): void {
        // ── 3D mirror mode ────────────────────────────────────────────────────
        if (this._svpMode === '3d') {
            this._render3dMirror();
            return;
        }
        // ── Embed modes (schedule / sheet) — HTML-only, no canvas draw needed ─
        if (this._svpMode === 'schedule' || this._svpMode === 'sheet') return;

        // ── Canvas2D plan/section/elevation ───────────────────────────────────
        if (!this._planCanvas) return;
        const { w, h } = this._paneSize();
        if (w <= 0 || h <= 0) return;

        this._planCanvas.setSize(w, h);
        this._syncPlanCanvasState();
        const viewDef = viewDefinitionStore.get(this._planViewId);
        if (!viewDef) return;
        if (viewTechnicalDrawingCache.get(this._planViewId) && !this._hasFitProjectedDrawing) {
            // §AUTOFRAME-NO-HIJACK-WHILE-DRAWING (2026-06-23) — `_hasFitProjectedDrawing`
            // is reset to false on every `svp:drawing-refreshed` (a projection refresh
            // after a geometry change), so the first wall the user draws in the split
            // plan pane lands here and `fitToDrawing` yanks the camera to it — the same
            // "plan-view auto-zoom on first draw" residual guarded in PlanViewManager.
            // Drawing must never move the camera: when a draw tool is active, skip the
            // fit AND mark it handled so it does not re-fire the instant the tool ends.
            // Split-view entry / project-open framing run with no draw tool active, so
            // the predicate is false there and fitting proceeds normally.
            if (shouldSuppressAutoFrameWhileDrawing()) {
                this._hasFitProjectedDrawing = true;
                console.log('[SplitViewManager] §AUTOFRAME-NO-HIJACK-WHILE-DRAWING: suppressed split plan-view fit-to-drawing — a draw tool is active.');
            } else {
                this._planCanvas.fitToDrawing(viewDef, w, h);
                this._adoptPlanCanvasState();
                this._hasFitProjectedDrawing = true;
            }
        }
        // Phase 2 G5 — forward `activeLinkedViewId` so section/elevation marks
        // referencing the standalone PlanViewManager's currently open view
        // light up here too.  Mirrors PlanViewManager._render() at line 563
        // which passes its own _activeSplitViewId.  The "sibling" surface for
        // the SVP is the standalone Plan View, so we read its current viewId
        // off the global handle published in PlanViewManager.activate().
        const standalone = window.planViewManager;
        const standaloneViewId: string | null = standalone?._viewDef?.id ?? null;
        const linked = standaloneViewId && standaloneViewId !== viewDef.id
            ? standaloneViewId
            : null;
        this._planCanvas.render(viewDef, { activeLinkedViewId: linked });
    }

    /** Mirror the main 3D renderer canvas into the SVP canvas via drawImage(). */
    private _render3dMirror(): void {
        const canvas = this._canvas;
        if (!canvas) return;
        const { w, h } = this._paneSize();
        if (w <= 0 || h <= 0) return;

        // Resize if necessary (lazy).
        const dpr = window.devicePixelRatio || 1;
        const bw = Math.round(w * dpr);
        const bh = Math.round(h * dpr);
        if (canvas.width !== bw || canvas.height !== bh) {
            canvas.width  = bw;
            canvas.height = bh;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Prefer WebGPU composited output (window.pryzmCanvas), fall back to OBC WebGL canvas.
        const src: HTMLCanvasElement | undefined =
            window.pryzmCanvas ??
            (this._world.renderer as any)?.three?.domElement ??
            undefined;

        ctx.clearRect(0, 0, bw, bh);

        if (src && src !== canvas && src.width > 0 && src.height > 0) {
            try {
                // §FIX-SPLIT-3D-MIRROR (L-96) — ASPECT-CORRECT contain-fit blit. The old
                // `drawImage(src,0,0,bw,bh)` stretched the main viewport to fill the pane,
                // distorting the view whenever the pane aspect ≠ the main-viewport aspect
                // (the founder's "visual drift"). Contain-fit centres the main canvas
                // undistorted (letterbox bars stay in the cleared black background), so the
                // split 3D pane is a FAITHFUL mirror; the click path uses the matching
                // inverse (mapMirrorClientToSourceClient) so a pick lands on the exact pixel.
                // Formula = computeContainFit(src.width, src.height, bw, bh); inlined here to
                // keep the per-frame blit span-free (P8 span lives on the click-time export).
                const scale = Math.min(bw / src.width, bh / src.height);
                const dw = src.width  * scale;
                const dh = src.height * scale;
                const dx = (bw - dw) / 2;
                const dy = (bh - dh) / 2;
                ctx.drawImage(src, dx, dy, dw, dh);
            } catch {
                // Cross-origin or tainted canvas — show placeholder
                this._draw3dPlaceholder(ctx, bw, bh);
            }
        } else {
            this._draw3dPlaceholder(ctx, bw, bh);
        }
    }

    private _draw3dPlaceholder(ctx: CanvasRenderingContext2D, w: number, h: number): void {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.font = `${Math.round(h * 0.04)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('3D View', w / 2, h / 2);
    }

    // ── Input Handlers ────────────────────────────────────────────────────────

    private _onWheel(e: WheelEvent): void {
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 1.12 : 0.89;
        this._frustumH = Math.max(2, Math.min(200, this._frustumH * zoomFactor));
        this._syncPlanCanvasState();
        // No camera to sync — _render() reads _frustumH directly.
        this._lastRender = 0;
        // Keep the FrameScheduler render loop alive during wheel zoom.
        // See 08-CAMERA-SYSTEM-CONTRACT §3 and the 3D fix in initScene.ts.
        // P8 span: pryzm.plan-view.zoom — observable for Honeycomb/Tempo dashboards.
        emitPlanViewMotionEvent('zoom', {
            'pryzm.plan_view.source':  'svp-zoom',
            'pryzm.plan_view.kind':    'split',
            'pryzm.plan_view.frustum': this._frustumH,
        });
        getFrameScheduler().beginMotion('svp-zoom');
        if (this._wheelMotionTimer !== null) clearTimeout(this._wheelMotionTimer);
        this._wheelMotionTimer = setTimeout(() => {
            this._wheelMotionTimer = null;
            getFrameScheduler().endMotion('svp-zoom');
        }, 200);
    }

    private _onMouseDown(e: MouseEvent): void {
        if (e.button !== 0 && e.button !== 1) return;
        // Contract 17 Phase 2 — do not start a pan when a creation tool consumed this event
        if ((e as any).__pryzmToolHandled) return;
        // Doc 08 Phase A — in 3D mirror mode the canvas does NOT pan (the SVP
        // shares the main camera; pan is owned by the main viewport).  Skip
        // the Canvas2D pan/click recording entirely so a 3D click is forwarded
        // to the main canvas in _onMouseUp without also dragging this pane.
        if (this._svpMode === '3d') return;
        this._isPanning = true;
        this._panStart.set(e.clientX, e.clientY);
        this._lastRender = 0;
        // Wake the FrameScheduler render loop for the pan gesture.
        // endMotion() is called in _onMouseUp when the pan ends.
        // See 08-CAMERA-SYSTEM-CONTRACT §3 and the 3D fix in initScene.ts.
        // P8 span: pryzm.plan-view.pan-begin — observable for Honeycomb/Tempo dashboards.
        emitPlanViewMotionEvent('pan-begin', {
            'pryzm.plan_view.source': 'svp-pan',
            'pryzm.plan_view.kind':   'split',
        });
        getFrameScheduler().beginMotion('svp-pan');
        // Contract 27 Phase 6 — record canvas-relative click candidate (left button only)
        if (e.button === 0 && this._canvas) {
            const rect = this._canvas.getBoundingClientRect();
            this._clickStart = {
                x:  e.clientX,
                y:  e.clientY,
                cx: e.clientX - rect.left,
                cy: e.clientY - rect.top,
            };
        }
    }

    private _onMouseMove(e: MouseEvent): void {
        if (!this._isPanning) return;
        const { w, h } = this._paneSize();

        // Convert mouse delta to world-space delta using current frustum.
        const dx = (e.clientX - this._panStart.x) / w  * (this._frustumH * 2 * (w / Math.max(h, 1)));
        const dz = (e.clientY - this._panStart.y) / h  * (this._frustumH * 2);

        this._camTarget.x -= dx;
        this._camTarget.z -= dz;
        this._panStart.set(e.clientX, e.clientY);
        this._syncPlanCanvasState();
        this._lastRender = 0;
        // _render() picks up updated _camTarget on the next tick.
    }

    private _onMouseUp(e: MouseEvent): void {
        const wasPanning = this._isPanning;
        // Doc 08 Phase A — 3D mirror click-through.  In 3D mode the SVP shares
        // the main camera; forward the click to the main 3D canvas so
        // SelectionManager performs its normal raycast pick.  Use the original
        // event's screen-relative position over the SVP canvas to derive the
        // equivalent point on the main canvas (NDC is preserved across the
        // mirror because it draws the same camera 1:1).
        if (e.button === 0 && this._svpMode === '3d' && this._canvas) {
            const rect = this._canvas.getBoundingClientRect();
            const inside = e.clientX >= rect.left && e.clientX <= rect.right
                        && e.clientY >= rect.top  && e.clientY <= rect.bottom;
            if (inside && !((e as any).__pryzmToolHandled)) {
                const cx = e.clientX - rect.left;
                const cy = e.clientY - rect.top;
                this._forward3dClickToMain(cx, cy, rect.width, rect.height, e);
            }
            this._isPanning = false;
            return;
        }
        // Contract 27 Phase 6 — if left button and travel < 5px, treat as a click
        // Contract 17 Phase 2 — skip selection if a creation tool handled this event
        if (e.button === 0 && this._clickStart) {
            const dx = e.clientX - this._clickStart.x;
            const dy = e.clientY - this._clickStart.y;
            const isClick = dx * dx + dy * dy < 25;      // < 5px radius
            const toolHandled = (e as any).__pryzmToolHandled === true;
            // Phase 3 — when the full PlanViewInteraction parity layer is
            // attached, IT owns click-to-select (it routes through
            // selectionBus.select(id, 'plan-view') with annotation / grid /
            // level-line / underlay branches that the minimal SVP path lacks).
            // Running both would dispatch two consecutive selectionBus.select()
            // calls — wasteful and would emit `bim-selection-changed` twice.
            // Fall back to the minimal path only when the interaction layer is
            // not attached (e.g. embed modes that don't use the plan canvas).
            if (isClick && !toolHandled && !this._planInteraction) {
                // §MULTI-SELECT-SHIFT (L-1550) — the minimal SVP plan path (used in
                // embed modes where PlanViewInteraction is not attached) honours SHIFT
                // too, so the modifier does not silently mean something different
                // depending on which plan renderer happens to be mounted.
                this._trySelectAtCanvasPoint(this._clickStart.cx, this._clickStart.cy, e.shiftKey);
            }
            this._clickStart = null;
        }
        this._isPanning = false;
        // End the FrameScheduler motion window opened in _onMouseDown.
        // The plan view has no damping tail so endMotion fires immediately.
        // See 08-CAMERA-SYSTEM-CONTRACT §3 and the 3D fix in initScene.ts.
        // P8 span: pryzm.plan-view.pan-end — observable for Honeycomb/Tempo dashboards.
        if (wasPanning) {
            emitPlanViewMotionEvent('pan-end', {
                'pryzm.plan_view.source': 'svp-pan',
                'pryzm.plan_view.kind':   'split',
            });
            getFrameScheduler().endMotion('svp-pan');
        }
    }

    /**
     * Doc 08 Phase A — forward an SVP-canvas click to the main 3D canvas.
     *
     * The SVP 3D mode is a 1:1 pixel mirror of the main 3D canvas drawn through
     * the SAME camera, so the NDC of a point on the SVP canvas corresponds to
     * the same NDC on the main canvas.  We synthesise mousedown + mouseup
     * events on the main canvas at the equivalent client coordinates so the
     * SelectionManager (which is bound to the main canvas) performs its normal
     * raycast pick.  This avoids spinning up a second renderer in the SVP.
     *
     * @param cx     Click x relative to the SVP canvas.
     * @param cy     Click y relative to the SVP canvas.
     * @param svpW   SVP canvas CSS width.
     * @param svpH   SVP canvas CSS height.
     */
    private _forward3dClickToMain(
        cx: number,
        cy: number,
        svpW: number,
        svpH: number,
        /**
         * §MULTI-SELECT-SHIFT (L-1550) — THE SOURCE EVENT, for its MODIFIER KEYS.
         *
         * A synthetic `PointerEvent` carries only the fields its init dict names, and
         * this dict named none of the modifiers. So a SHIFT+click inside the 3-D
         * mirror pane arrived at the main canvas with `shiftKey === false` and was
         * handled as an ordinary replace-the-selection click — the modifier was
         * dropped IN TRANSIT, at the same seam where `__pryzmForwarded` was added
         * because the forwarded click carried too little context to be picked
         * correctly. Optional so the existing tests, which call this with four
         * arguments, keep compiling and keep meaning "no modifiers".
         */
        source?: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean },
    ): void {
        if (svpW <= 0 || svpH <= 0) return;
        const mainCanvas: HTMLCanvasElement | undefined =
            window.pryzmCanvas ??
            (this._world.renderer as any)?.three?.domElement ??
            undefined;
        if (!mainCanvas) {
            console.warn('[SplitViewManager] 3D click forward — no main canvas found');
            return;
        }
        // §FIX-SPLIT-3D-MIRROR (L-96) — EXACT inverse of the aspect-correct contain-fit
        // blit. The previous mapping assumed a full-stretch mirror (`ndc = cx/svpW·2−1`),
        // which was wrong for any pane whose aspect ≠ the main viewport — the forwarded
        // pointer landed on the wrong main-canvas pixel → the pick resolved the wrong
        // element (or missed). mapMirrorClientToSourceClient uses the LIVE main-canvas rect
        // and the same contain-fit the blit draws, and returns null for clicks in a
        // letterbox bar (no mirrored pixel there) so we don't synthesise a bogus edge pick.
        const mainRect = mainCanvas.getBoundingClientRect();
        const mapped = mapMirrorClientToSourceClient(cx, cy, svpW, svpH, mainRect);
        if (!mapped) return;
        const mainClientX = mapped.clientX;
        const mainClientY = mapped.clientY;

        const dispatch = (type: string, EventCtor: typeof MouseEvent | typeof PointerEvent) => {
            const init: PointerEventInit = {
                bubbles:    true,
                cancelable: true,
                button:     0,
                buttons:    type === 'pointerup' || type === 'mouseup' ? 0 : 1,
                clientX:    mainClientX,
                clientY:    mainClientY,
                view:       window,
                pointerType: 'mouse',
                pointerId:  1,
                // §MULTI-SELECT-SHIFT (L-1550) — carry the modifiers across the mirror.
                shiftKey:   source?.shiftKey === true,
                ctrlKey:    source?.ctrlKey  === true,
                metaKey:    source?.metaKey  === true,
                altKey:     source?.altKey   === true,
            };
            // §SELECT-SVP3D-ANCHOR-SKIP — tag the synthetic event so the main
            // SelectionManager skips its hover-anchor fast path. The cursor was over
            // the SVP pane, so the main canvas's last-hover state is stale; honouring
            // it would snap the click back to the previously-selected element instead
            // of picking what is under the cursor in the mirror.
            let evt: Event;
            try {
                evt = new (EventCtor as any)(type, init);
            } catch {
                evt = new MouseEvent(type, init as MouseEventInit);
            }
            (evt as { __pryzmForwarded?: boolean }).__pryzmForwarded = true;
            mainCanvas.dispatchEvent(evt);
        };
        // SelectionManager listens to pointerdown / pointerup and click —
        // fire the full sequence so its mousedown/up timing check passes.
        dispatch('pointerdown', window.PointerEvent ?? MouseEvent);
        dispatch('mousedown',   MouseEvent);
        dispatch('pointerup',   window.PointerEvent ?? MouseEvent);
        dispatch('mouseup',     MouseEvent);
        dispatch('click',       MouseEvent);
        console.log('[SplitViewManager] 3D click forwarded → main canvas',
            `(svp ${cx.toFixed(0)},${cy.toFixed(0)} → main ${mainClientX.toFixed(0)},${mainClientY.toFixed(0)})`);
    }

    /**
     * Contract 27 Phase 6 — attempt element selection at a canvas-relative pixel.
     * Uses PlanViewCanvas.hitTest() which resolves through DrawingSelectionIndex.
     * Does nothing if no element occupies that pixel within the hit threshold.
     */
    private _trySelectAtCanvasPoint(cx: number, cy: number, additive = false): void {
        if (!this._planCanvas) return;
        const elemId = this._planCanvas.hitTest(cx, cy);
        if (!elemId) return;
        console.log(`[SplitViewManager] SVP click → element ${elemId}${additive ? ' (additive)' : ''}`);
        // §MULTI-SELECT-SHIFT (L-1550) — same one rule as the 3-D viewport and the
        // standalone plan view; see `SelectionBus.toggle`.
        if (additive) selectionBus.toggle(elemId, 'svp');
        else          selectionBus.select(elemId, 'svp');
    }

    /**
     * §SVP-DBLCLICK-FRAME — double-click an element in the split-view PLAN pane
     * → select it on every surface AND frame the MAIN 3D camera on it.
     *
     * This is the plan-surface analogue of the main-viewport double-click-zoom
     * (initUI.ts ~`container.addEventListener('dblclick', …)`), satisfying the
     * architect's request: "if the user double-clicks an element in plan view
     * and we are in split-view mode, the selected element should be zoomed in
     * the 3D view."
     *
     * Contract alignment:
     *   • Contract §43 (43-CAMERA-FRAMING-CONTRACT) §2 — `frameObject` with the
     *     canonical double-click-focus defaults (minDist 2.5 m, dimMult 1.5).
     *   • Contract C11 §12 (Split-View 3D Synchronization & Camera Framing) —
     *     extends the §13-CAM family from "frame on first create" / "frame on
     *     view-switch" to "frame on plan-pane double-click".
     *   • Contract 27/38 (Cross-View Selection Parity) — selection is routed
     *     through `selectionBus` so the 3D highlight, Properties Panel, and all
     *     other surfaces stay in sync; framing reuses the resulting selection.
     *
     * Only fires in plan mode. In '3d' mirror mode the SVP forwards pointer
     * events to the main canvas, where initUI's own dblclick-zoom already runs,
     * so re-handling here would double-frame.
     */
    private async _onDblClick(e: MouseEvent): Promise<void> {
        if (e.button !== 0) return;
        if (this._svpMode !== 'plan') return;           // 3d-mirror handled by main canvas
        if (!this._planCanvas || !this._canvas) return;

        const rect = this._canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const elemId = this._planCanvas.hitTest(cx, cy);
        if (!elemId) return;

        // Ensure the element is selected on every surface (idempotent — the
        // first click of the double already routed through selection; this
        // guarantees it even if the parity layer ordering missed it).
        selectionBus.select(elemId, 'svp');

        // Resolve the element's 3D object. SelectionManager.selectById() sets
        // `selectedObject` synchronously; prefer it, else resolve via selectById.
        const sm = window.selectionManager as
            | {
                  selectedObject?: { userData?: { id?: string } } | null;
                  selectById?: (id: string) => boolean;
              }
            | undefined;
        let obj = sm?.selectedObject ?? null;
        if (!obj || obj.userData?.id !== elemId) {
            obj = sm?.selectById?.(elemId) ? (sm.selectedObject ?? null) : null;
        }

        const controls = (this._world?.camera as { controls?: unknown } | undefined)?.controls;
        if (!obj || !controls) {
            console.log(`[SplitViewManager] §SVP-DBLCLICK-FRAME no 3D object/controls for ${elemId}`);
            return;
        }
        console.log(`[SplitViewManager] §SVP-DBLCLICK-FRAME framing ${elemId} in 3D view`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await frameObject(obj as any, controls as any);
    }

    // ── Divider Drag ──────────────────────────────────────────────────────────

    private _onDividerMouseDown(e: MouseEvent): void {
        e.preventDefault();
        this._isDraggingDivider = true;
        this._divider?.classList.add('svp-divider--dragging');
        // Suppress text selection / iframe pointer captures during drag for smoothness.
        document.body.style.userSelect = 'none';
        document.body.style.cursor     = 'col-resize';
    }

    private _onDividerMouseMove(e: MouseEvent): void {
        if (!this._isDraggingDivider) return;
        // Coalesce multiple mousemove events fired between two animation frames
        // into a single layout pass via requestAnimationFrame. This keeps the
        // drag silky-smooth even when the listener side-effects (canvas resize,
        // ResizeObserver, projection invalidation) are heavy.
        const vw = window.innerWidth;
        const newSecondaryPx = vw - e.clientX;
        this._pendingDragRatio = Math.max(0.20, Math.min(0.65, newSecondaryPx / vw));

        if (this._dragDispose !== null) return;
        this._dragDispose = getFrameScheduler().scheduleOnce(
            'split-view-drag',
            () => {
                this._dragDispose = null;
                const ratio = this._pendingDragRatio;
                this._pendingDragRatio = null;
                if (ratio == null || !this._isDraggingDivider) return;
                this._applyDragRatio(ratio);
            },
            'overlay',
        );
    }

    /**
     * Cheap layout-only application used during an active drag.
     * Skips the `split-view-layout-changed` dispatch and the primary-renderer
     * resize notification — both are expensive and only need to fire once on
     * commit (mouseup). The primary 3D renderer rescales its viewport lazily
     * via CSS in the meantime.
     */
    private _applyDragRatio(ratio: number): void {
        this._splitRatio = ratio;
        // §VIEW-REGION-HAS-ONE-OWNER — ONE call places all three boxes (`#container`,
        // this pane and the divider) from ONE fraction. The three hand-written writes that
        // used to live here could disagree during a drag, and did: the pane was sized as a
        // fraction of the WINDOW while `#container` was sized as the complement of that,
        // so in a half-canvas mode they overlapped by the panel's width. The divider's
        // `left: 'auto'` is part of the same derivation.
        setViewRegionSplit(ratio);
    }

    private _onDividerMouseUp(): void {
        if (!this._isDraggingDivider) return;
        this._isDraggingDivider = false;
        this._divider?.classList.remove('svp-divider--dragging');
        document.body.style.userSelect = '';
        document.body.style.cursor     = '';

        // Flush any pending scheduled frame and apply the final ratio synchronously.
        if (this._dragDispose !== null) {
            this._dragDispose();
            this._dragDispose = null;
        }
        if (this._pendingDragRatio != null) {
            this._applyDragRatio(this._pendingDragRatio);
            this._pendingDragRatio = null;
        }

        // Commit: dispatch the layout event ONCE and resize the 3D renderer.
        // F.events.7 — split-view family migrated to runtime.events typed bus.
        window.runtime?.events?.emit('split-view-layout-changed', { splitRatio: this._splitRatio });
        this._notifyPrimaryResize();
    }

    // ── Resize ────────────────────────────────────────────────────────────────

    private _onSecondaryResize(): void {
        // Canvas buffer size is updated lazily in _render(); no renderer to resize.
        this._hasFitProjectedDrawing = false;
        // Contract 17 Phase 2 — keep tool overlay canvas in sync with SVP canvas size
        svpPlanToolOverlay.notifyResize();
    }

    private _paneSize(): { w: number; h: number } {
        const pane = this._pane;
        if (!pane) {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            return { w: Math.round(vw * this._splitRatio), h: vh };
        }
        return { w: pane.clientWidth, h: pane.clientHeight - 36 }; // minus header height
    }

    /**
     * Announce the ratio. §VIEW-REGION-HAS-ONE-OWNER — the pane's WIDTH is no longer
     * written here: it is a fraction OF THE REGION, and only `viewRegionGeometry` knows
     * how big the region is. This method keeps its event, which is what consumers read.
     *
     * ⛔ `_positionDivider()` was removed for the same reason and is not coming back:
     * it wrote `right: <ratio>%` of the WINDOW, which put the divider inside the Analysis
     * panel whenever a panel was up.
     */
    private _applySplitRatio(): void {
        if (!this._pane) return;
        // F.events.7 — split-view family migrated to runtime.events typed bus.
        window.runtime?.events?.emit('split-view-layout-changed', { splitRatio: this._splitRatio });
    }

    // ── Scene Helpers ─────────────────────────────────────────────────────────

    /**
     * §PLAN-FIT-OUTLIER-DIAG (L-481) — name the mesh that drags the plan camera away.
     *
     * ── §PLAN-FIT-BIM-ONLY (L-814) — THE PRODUCER IS FIXED ────────────────────────────
     * This USED to expand a Box3 over EVERY mesh in the scene, unfiltered, and hand the
     * centre to the plan camera target. One mesh placed far from the origin therefore moved
     * the target arbitrarily far — and because `PlanViewCanvas.screenToWorld` ADDS that
     * target to every click, it silently relocated authored geometry. Live evidence: a wall
     * committed at (181116, -253540), ~300 km out; and the 2026-08-10 production spam —
     * plan view + 3D Site context, target (114525, -1577006, 135718) refused 191×/399× per
     * burst — was this traversal averaging georeferenced context content into the fit.
     * The fit now reads `computeBimFitBounds` (scene-committer): the SAME BIM-typed
     * collection Fit All uses, so context/site meshes, gizmos and helpers are structurally
     * outside the population. The refusal below stays as defense-in-depth for the
     * classified all-mesh FALLBACK pass (scenes with no BIM-typed content).
     *
     * The outlier diagnostic is kept: it now names the farthest mesh actually INCLUDED in
     * the fit, so a far-origin AUTHORED element is still reported by ancestry.
     *
     * ── §PLAN-FIT-DIAG-MEASURED-NOTHING (L-604) ────────────────────────────────────────
     * ⚠ THE DIAGNOSTIC ABOVE WAS BROKEN, AND ITS BREAKAGE IS WHY L-481 STAYED UNSOLVED.
     * `box.expandByObject(obj)` measures the mesh in WORLD space (it applies `matrixWorld`),
     * but the outlier probe read `obj.position` — the mesh's LOCAL offset from its PARENT. A
     * mesh whose own position is (0.4, 0, 1.2) but whose PARENT GROUP carries a huge matrix is
     * therefore invisible to the probe while dominating the box. That is exactly the shape of
     * the live fault: `CesiumThreeBridge.setAnchor()` re-parents BIM meshes into a
     * `GIS_BIM_ROOT` group and gives that group the full ECEF `eastNorthUpToFixedFrame`
     * matrix, whose translation is on the order of 6.4e6 m. The meshes' LOCAL positions never
     * change, so the probe stayed silent and named nothing — a probe that could pass while
     * measuring nothing. Fixed here: measure the WORLD position (the same space the box uses)
     * and name the ANCESTRY, not just the leaf, because the offending transform lives on an
     * ancestor by construction.
     *
     * ── §PLAN-CAMTARGET-REFUSE-AT-PRODUCER (L-604) ─────────────────────────────────────
     * `PlanViewCanvas.setFrustum` REFUSES an implausible target — correctly, and that refusal
     * is what has kept geometry from being authored 2 000 km away. But the refusal happened at
     * the CONSUMER while this method kept the bad value in `this._camTarget`, and `_render()`
     * re-pushes `_camTarget` through `_syncPlanCanvasState()` on EVERY frame. So the guard
     * re-fired on every frame forever: an unbroken console error at 30 fps, with no way to see
     * anything else in the log. A guard that fires forever is a guard hiding a bug.
     *
     * So the same bound is now enforced HERE, at the producer, against the SAME imported
     * constant. On refusal the previous known-good target is KEPT (identical policy to the
     * consumer: an absent pan costs nothing, a relocated project costs everything), and the
     * error is logged ONCE per fault rather than per frame. This does NOT fix the coordinate
     * leak itself — see the L-604 audit row; it makes the leak diagnosable instead of deafening.
     */
    private _fitCamTargetToScene(): void {
        // §PLAN-FIT-BIM-ONLY (L-814) — the fit population is AUTHORED BIM CONTENT, not
        // "every mesh in the scene". This was the PRODUCER behind the L-481 refusal spam:
        // with the 3D Site context open, georeferenced content (context/site meshes, and
        // anything re-seated under GIS_BIM_ROOT's ECEF matrix) sat megametres from the
        // site origin, the unfiltered Box3 averaged it into the plan camera target, and
        // §PLAN-CAMTARGET-SANITY refused the result on every frame. The collection is now
        // the SAME one Fit All uses (`computeBimFitBounds`, scene-committer): pass 1 keeps
        // only BIM element types — context tiles, terrain, underlays and gizmos carry no
        // BIM `userData.elementType`, so they are structurally outside the population —
        // with a classified all-mesh fallback for scenes that predate element tagging.
        // The plausibility refusal below is KEPT as defense-in-depth for the fallback.
        const { bounds: box, farthestIncluded } = computeBimFitBounds(this._scene, null);
        if (farthestIncluded && farthestIncluded.distanceM > PLAN_FIT_OUTLIER_WARN_M) {
            console.error(
                `[SplitViewManager] §PLAN-FIT-OUTLIER-DIAG (L-481/L-604) — mesh "${farthestIncluded.ancestry}" sits ` +
                    `${Math.round(farthestIncluded.distanceM)} m from the origin IN WORLD SPACE and is being averaged ` +
                    'into the PLAN camera target. Every plan click adds that target to its world ' +
                    'position, so this is the producer of far-away authored geometry. THE ANCESTRY IS ' +
                    'THE ANSWER — the offending transform is usually on a PARENT (e.g. CesiumThreeBridge’s ' +
                    'GIS_BIM_ROOT, which carries the full ECEF eastNorthUpToFixedFrame matrix), not on ' +
                    'the leaf mesh.',
            );
        }
        if (box.isEmpty()) {
            this._camTarget.set(0, 0, 0);
            this._frustumH = DEFAULT_FRUSTUM;
            this._planFitRefusalLogged = false;
            this._syncPlanCanvasState();
            return;
        }
        const center = box.getCenter(new THREE.Vector3());
        const size   = box.getSize(new THREE.Vector3());

        // §PLAN-CAMTARGET-REFUSE-AT-PRODUCER (L-604) — refuse HERE, keep the last good target,
        // and log ONCE. Otherwise `_render` re-pushes the bad value every frame forever.
        const targetY = box.min.y + 1.5;
        const plausible =
            Number.isFinite(center.x) && Number.isFinite(center.z) && Number.isFinite(targetY) &&
            Math.abs(center.x) <= PLAN_CAMTARGET_MAX_ABS_M &&
            Math.abs(center.z) <= PLAN_CAMTARGET_MAX_ABS_M;
        if (!plausible) {
            if (!this._planFitRefusalLogged) {
                this._planFitRefusalLogged = true;
                console.error(
                    '[SplitViewManager] §PLAN-CAMTARGET-REFUSE-AT-PRODUCER (L-604) — REFUSED a scene ' +
                        `fit that produced an implausible plan camera target (${center.x}, ${targetY}, ` +
                        `${center.z}); limit is ±${PLAN_CAMTARGET_MAX_ABS_M} m from the site origin. ` +
                        `Keeping the last good target (${this._camTarget.x.toFixed(2)}, ` +
                        `${this._camTarget.z.toFixed(2)}). These magnitudes are GLOBE/ECEF scale, not ` +
                        'site-local — see the §PLAN-FIT-OUTLIER-DIAG line above for the offending ' +
                        'ancestry. Logged ONCE per fault; the per-frame repeat was the L-481 symptom.',
                );
            }
            this._syncPlanCanvasState();
            return;
        }

        this._planFitRefusalLogged = false;
        this._camTarget.set(center.x, targetY, center.z);
        // Phase 1b — tightened from 0.55 → 0.42 so the fallback lands closer to geometry
        // when the drawing is not yet in cache. PlanViewCanvas.fitToDrawing() will refine on arrival.
        this._frustumH = Math.max(MINIMUM_PLAN_VIEW_CANVAS_FRUSTUM, Math.max(size.x, size.z) * 0.42);
        this._syncPlanCanvasState();
    }

    // §PLAN-FIT-DIAG-MEASURED-NOTHING (L-604) — the ancestry-naming diagnostic moved to
    // `describeMeshAncestry` in @pryzm/scene-committer (bimFitBounds.ts) with the shared
    // collection (§PLAN-FIT-BIM-ONLY, L-814).

    private _syncPlanCanvasState(): void {
        this._planCanvas?.setGridVisible(this._gridVisible);
        this._planCanvas?.setFrustum(this._frustumH, this._camTarget);
    }

    private _adoptPlanCanvasState(): void {
        if (!this._planCanvas) return;
        this._frustumH = this._planCanvas.getFrustumH();
        this._camTarget.copy(this._planCanvas.getCamTarget());
    }

    private _syncGridToggleButton(): void {
        if (!this._gridToggleBtn) return;
        this._gridToggleBtn.title = this._gridVisible ? 'Hide grid' : 'Show grid';
        this._gridToggleBtn.setAttribute('aria-pressed', String(this._gridVisible));
        this._gridToggleBtn.classList.toggle('svp-grid-toggle-btn--off', !this._gridVisible);
    }

    private _readGridPreference(): boolean {
        try {
            return localStorage.getItem('pryzm.splitView.gridVisible') !== 'false';
        } catch {
            return true;
        }
    }

    private _writeGridPreference(value: boolean): void {
        try {
            localStorage.setItem('pryzm.splitView.gridVisible', String(value));
        } catch {
            // §SWALLOW-STORAGE — localStorage throws on private-mode/quota/blocked-cookie
            // browsers. This is a UI PREFERENCE: the read side (`_readGridPreference`)
            // already defaults to `true` when storage is unavailable, so failing to
            // persist degrades to "grid visible next session" and nothing else.
        }
    }

    // §BIM-3D-CHROME-QUIET — `_getLevels()` (a bimManager-then-projectContext level
    // reader) lived here with ONE caller: `_buildDOM`, populating the retired level chip.
    // `ActiveLevelHUD` and `LevelManagerPanel` read levels from an INJECTED `bimManager`
    // rather than off `window`, which is the shape a replacement should take.

    /** Notify the primary OBC world/renderer that its canvas size changed. */
    private _notifyPrimaryResize(): void {
        try {
            const world = this._world;
            // OBC's PostproductionRenderer listens to 'resize' on the window.
            triggerWindowResize(); // F.events.16
            // Also try the OBC resize API if available.
            (world.renderer as any)?.resize?.();
        } catch { /* ignore */ }
    }
}
