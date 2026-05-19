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
import * as OBC from '@thatopen/components';
import type { ISplitViewManager } from '@pryzm/views';
import { unifiedFrameLoop } from '@pryzm/core-app-model';
import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { emitPlanViewMotionEvent } from '@pryzm/core-app-model';
import { viewTechnicalDrawingCache } from '@pryzm/core-app-model';
import { DEFAULT_PLAN_VIEW_ID } from '@pryzm/core-app-model';
import { vgGovernanceStore } from '@pryzm/core-app-model';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { IFC_PROJECTION_CHANGED_EVENT } from '@pryzm/core-app-model';
import { scheduleStore } from '@pryzm/core-app-model';
import { sheetStore } from '@pryzm/core-app-model';
// Contract 25b Wave 2: VG template dropdown retired from the SVP header.
// Intent assignment now flows through the unified V/G header panel (OverridePanel).
import {
    DEFAULT_PLAN_VIEW_CANVAS_FRUSTUM,
    MINIMUM_PLAN_VIEW_CANVAS_FRUSTUM,
    PlanViewCanvas,
} from '@pryzm/core-app-model';
// Contract 27 Phase 6 — SVP canvas click → element selection
import { selectionBus } from '@pryzm/core-app-model';
// Contract 17 Phase 2 — SVP element creation parity
import { svpPlanToolOverlay } from './SvpPlanToolOverlay';
import { PlanViewInteraction } from './PlanViewInteraction';
import { buildViewHeaderToolbar, type ViewHeaderButtonsHandle } from '@app/ui/views/ViewHeaderButtons';
import { escHtml } from '@pryzm/ui-base';
import { triggerWindowResize } from '../triggerWindowResize'; // F.events.16

/** Half the default view frustum extent (world units). */
const DEFAULT_FRUSTUM = DEFAULT_PLAN_VIEW_CANVAS_FRUSTUM;

/** Target frame interval for the secondary renderer (~30 fps). */
const SECONDARY_FPS_INTERVAL = 1000 / 30;

interface Level {
    id: string;
    name: string;
    elevation: number;
}

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
    /** Level group wrapper — hidden when a non-plan view is active. */
    private _levelGroup:      HTMLElement | null = null;
    /** Level selector element — kept for future programmatic level changes. */
    private readonly _levelSelectRef: { el: HTMLSelectElement | null } = { el: null };

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
    private _boundDividerDown = this._onDividerMouseDown.bind(this);
    private _boundDividerMove = this._onDividerMouseMove.bind(this);
    private _boundDividerUp   = this._onDividerMouseUp.bind(this);

    constructor(world: OBC.World) {
        this._world = world;
        this._scene = world.scene.three as THREE.Scene;
    }

    get isActive(): boolean { return this._active; }

    get activeViewId(): string {
        return this._planViewId;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /** Contract 17 Phase 2 — exposes the SVP canvas for external use (e.g. SvpPlanToolOverlay). */
    getSvpCanvas(): HTMLCanvasElement | null {
        return this._canvas;
    }

    /** Contract 17 Phase 2 — exposes the PlanViewCanvas for coordinate transforms. */
    getPlanCanvas(): PlanViewCanvas | null {
        return this._planCanvas;
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
        const levels = this._getLevels();

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

        const levelGroup = document.createElement('div');
        levelGroup.className = 'svp-header-level';
        this._levelGroup = levelGroup;

        if (levels.length > 0) {
            const levelLabel = document.createElement('span');
            levelLabel.className = 'svp-level-label';
            levelLabel.textContent = 'Level:';

            const sel = document.createElement('select');
            sel.className = 'svp-level-select';
            levels.forEach(lv => {
                const opt = document.createElement('option');
                opt.value = lv.id;
                opt.textContent = lv.name;
                sel.appendChild(opt);
            });
            sel.addEventListener('change', () => {
                const lv = levels.find(l => l.id === sel.value);
                if (lv) {
                    this._setCameraElevation(lv.elevation);
                    this._hasFitProjectedDrawing = false;
                }
            });
            this._levelSelectRef.el = sel;

            levelGroup.appendChild(levelLabel);
            levelGroup.appendChild(sel);
        }

        // ── Contract 25b Wave 2 — legacy VG eye button + template dropdown retired ───
        // The unified shared toolbar built below (`buildViewHeaderToolbar`, Stage S1+S4)
        // owns the V/G entry point, intent picker and overrides badge.

        header.appendChild(titleGroup);
        header.appendChild(levelGroup);

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
        this._positionDivider();
        document.body.appendChild(divider);

        // ── Shrink primary container ──────────────────────────────────────────
        // #container has flex:1 1 0 so we must disable flex-grow and set max-width
        // to prevent the container filling the full row behind the fixed SVP pane.
        const container = document.getElementById('container');
        if (container) {
            container.classList.add('svp-active');
            const pct = `${(1 - this._splitRatio) * 100}%`;
            container.style.width    = pct;
            container.style.maxWidth = pct;
            container.style.flexGrow   = '0';
            container.style.flexShrink = '0';
            container.style.flexBasis  = 'auto';
            // Notify OBC world that the renderer viewport changed
            setTimeout(() => this._notifyPrimaryResize(), 250);
        }

        // ── Register input events ─────────────────────────────────────────────
        canvas.addEventListener('wheel', this._boundWheel, { passive: false });
        canvas.addEventListener('mousedown', this._boundMouseDown);
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
        window.removeEventListener('mousemove', this._boundMouseMove);
        window.removeEventListener('mouseup', this._boundMouseUp);
        this._divider?.removeEventListener('mousedown', this._boundDividerDown);
        window.removeEventListener('mousemove', this._boundDividerMove);
        window.removeEventListener('mouseup', this._boundDividerUp);

        this._resizeObserver?.disconnect();
        this._resizeObserver = null;

        this._embedEl?.remove();
        this._embedEl        = null;
        this._svpMode        = 'plan';
        this._svpSpecialId   = '';

        this._pane?.remove();
        this._divider?.remove();
        this._pane           = null;
        this._canvas         = null;
        this._gridToggleBtn  = null;
        this._viewSelect     = null;
        this._levelGroup     = null;
        this._divider        = null;
        this._levelSelectRef.el = null;

        const container = document.getElementById('container');
        if (container) {
            container.classList.remove('svp-active');
            container.style.width      = '';
            container.style.maxWidth   = '';
            container.style.flexGrow   = '';
            container.style.flexShrink = '';
            container.style.flexBasis  = '';
            setTimeout(() => this._notifyPrimaryResize(), 250);
        }
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
                styleResolver: (category, layerTag) => {
                    // VIEW-SYSTEM-AUDIT-2026 F13 — `vgGovernanceStore.resolveStyle()`
                    // signature is `(modelId, category, viewId?)`.  The previous code
                    // accidentally passed `this._planViewId` as the FIRST positional
                    // argument (modelId), which silently produced default styling
                    // because the SVP viewId is not a registered model.  Pass the
                    // canonical 'model-default' modelId and the SVP viewId third.
                    // The resolver closure runs on every paint, so reading
                    // this._planViewId each call is correct even after _setView()
                    // switches view.
                    const { style } = vgGovernanceStore.resolveStyle('model-default', category, this._planViewId);
                    const isCut = /:cut$/i.test(layerTag);
                    const isBeyond = /:beyond$/i.test(layerTag);
                    return {
                        visible: isBeyond ? ((style as any).beyondVisible ?? style.visible) : style.visible,
                        edgeColor: isBeyond ? ((style as any).beyondEdgeColor ?? style.edgeColor) : style.edgeColor,
                        fillColor: style.fillColor,
                        fillPattern: (style as any).fillPattern,
                        transparency: style.transparency,
                        lineWeight: isCut
                            ? ((style as any).cutLineWeight ?? style.lineWeight)
                            : isBeyond
                            ? ((style as any).beyondLineWeight ?? Math.max(1, style.lineWeight - 1))
                            : ((style as any).projectionLineWeight ?? style.lineWeight),
                    };
                },
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
        const _unsubSelectionChanged = window.runtime?.events?.on('bim-selection-changed', selectionHandler) ?? null;
        this._selectionUnlisteners.push(() => _unsubSelectionChanged?.());

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
        const isPlanLike = this._configureCanvasForView(viewDef, viewType);

        // Show/hide the level selector — only meaningful for plan-family views.
        if (this._levelGroup) {
            this._levelGroup.style.display = isPlanLike ? '' : 'none';
        }

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

    private _setCameraElevation(elevation: number): void {
        // Store the target elevation for multi-level support (future).
        this._camTarget.y = elevation;
    }

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
            this._planCanvas.fitToDrawing(viewDef, w, h);
            this._adoptPlanCanvasState();
            this._hasFitProjectedDrawing = true;
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
                ctx.drawImage(src, 0, 0, bw, bh);
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
                this._forward3dClickToMain(cx, cy, rect.width, rect.height);
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
                this._trySelectAtCanvasPoint(this._clickStart.cx, this._clickStart.cy);
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
    private _forward3dClickToMain(cx: number, cy: number, svpW: number, svpH: number): void {
        if (svpW <= 0 || svpH <= 0) return;
        const mainCanvas: HTMLCanvasElement | undefined =
            window.pryzmCanvas ??
            (this._world.renderer as any)?.three?.domElement ??
            undefined;
        if (!mainCanvas) {
            console.warn('[SplitViewManager] 3D click forward — no main canvas found');
            return;
        }
        const ndcX =  (cx / svpW) * 2 - 1;
        const ndcY = -((cy / svpH) * 2 - 1);
        const mainRect = mainCanvas.getBoundingClientRect();
        if (mainRect.width <= 0 || mainRect.height <= 0) return;
        const mainClientX = mainRect.left + ((ndcX + 1) / 2) * mainRect.width;
        const mainClientY = mainRect.top  + ((-ndcY + 1) / 2) * mainRect.height;

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
            };
            try {
                mainCanvas.dispatchEvent(new (EventCtor as any)(type, init));
            } catch {
                mainCanvas.dispatchEvent(new MouseEvent(type, init as MouseEventInit));
            }
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
    private _trySelectAtCanvasPoint(cx: number, cy: number): void {
        if (!this._planCanvas) return;
        const elemId = this._planCanvas.hitTest(cx, cy);
        if (!elemId) return;
        console.log(`[SplitViewManager] SVP click → element ${elemId}`);
        selectionBus.select(elemId, 'svp');
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
        if (this._pane) {
            this._pane.style.width = `${(ratio * 100).toFixed(2)}%`;
        }
        if (this._divider) {
            this._divider.style.right = `${(ratio * 100).toFixed(2)}%`;
            this._divider.style.left  = 'auto';
        }
        const container = document.getElementById('container');
        if (container) {
            const pct = `${((1 - ratio) * 100).toFixed(2)}%`;
            container.style.width    = pct;
            container.style.maxWidth = pct;
        }
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

    private _applySplitRatio(): void {
        if (!this._pane) return;
        const pct = `${(this._splitRatio * 100).toFixed(1)}%`;
        this._pane.style.width = pct;
        // F.events.7 — split-view family migrated to runtime.events typed bus.
        window.runtime?.events?.emit('split-view-layout-changed', { splitRatio: this._splitRatio });
    }

    private _positionDivider(): void {
        if (!this._divider) return;
        const rightPct = (this._splitRatio * 100).toFixed(1);
        this._divider.style.right  = `${rightPct}%`;
        this._divider.style.left   = 'auto';
    }

    // ── Scene Helpers ─────────────────────────────────────────────────────────

    private _fitCamTargetToScene(): void {
        const box = new THREE.Box3();
        this._scene.traverse(obj => {
            if ((obj as THREE.Mesh).isMesh) {
                box.expandByObject(obj);
            }
        });
        if (box.isEmpty()) {
            this._camTarget.set(0, 0, 0);
            this._frustumH = DEFAULT_FRUSTUM;
            this._syncPlanCanvasState();
            return;
        }
        const center = box.getCenter(new THREE.Vector3());
        const size   = box.getSize(new THREE.Vector3());
        this._camTarget.set(center.x, box.min.y + 1.5, center.z);
        // Phase 1b — tightened from 0.55 → 0.42 so the fallback lands closer to geometry
        // when the drawing is not yet in cache. PlanViewCanvas.fitToDrawing() will refine on arrival.
        this._frustumH = Math.max(MINIMUM_PLAN_VIEW_CANVAS_FRUSTUM, Math.max(size.x, size.z) * 0.42);
        this._syncPlanCanvasState();
    }

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
        }
    }

    private _getLevels(): Level[] {
        try {
            const bimManager = window.bimManager;
            if (bimManager?.getLevels) {
                return (bimManager.getLevels() as any[]).map((lv: any) => ({
                    id:        lv.id,
                    name:      lv.name ?? lv.id,
                    elevation: lv.elevation ?? 0,
                }));
            }
            const pc = window.projectContext;
            if (pc?.getLevels) {
                return (pc.getLevels() as any[]).map((lv: any) => ({
                    id:        lv.id,
                    name:      lv.name ?? lv.id,
                    elevation: lv.elevation ?? 0,
                }));
            }
        } catch { /* ignore */ }
        return [];
    }

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
