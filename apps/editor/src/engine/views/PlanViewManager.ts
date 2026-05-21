import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { emitPlanViewMotionEvent } from '@pryzm/core-app-model';
import type { UnifiedFrameLoop } from '@pryzm/core-app-model';
import type { EdgeProjectorService } from './EdgeProjectorService';
import type { ViewDefinition } from '@pryzm/core-app-model';
import type { IPlanViewManager } from '@pryzm/views';
import { viewTechnicalDrawingCache } from '@pryzm/core-app-model';
import { activePlanDrawingRef } from '@pryzm/core-app-model';
import { nativeElementMeshExporter } from '@pryzm/core-app-model';
import { vgGovernanceStore } from '@pryzm/core-app-model';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import {
    DEFAULT_PLAN_VIEW_CANVAS_FRUSTUM,
    PlanViewCanvas,
} from '@pryzm/core-app-model';
import { PlanViewInteraction } from './PlanViewInteraction';
import { planViewToolOverlay } from './PlanViewToolOverlay';
import { viewIntentInstanceStore } from '@pryzm/core-app-model/presentation';
import { visibilityIntentStore } from '@pryzm/core-app-model/presentation';
import { OverridePanel } from '@app/ui/OverridePanel';
import { ifcProjectionStore, IFC_PROJECTION_CHANGED_EVENT } from '@pryzm/core-app-model';

const PLAN_VIEW_MANAGER_FPS_INTERVAL = 1000 / 30;

function useEdgeProjectorNative(): boolean {
    return window.__PRYZM_FLAGS__?.EDGE_PROJECTOR_NATIVE === true;
}

export class PlanViewManager implements IPlanViewManager {
    private readonly _components: OBC.Components;
    private readonly _world: OBC.World;
    private _frameLoop: UnifiedFrameLoop | null = null;
    private _edgeProjectorService: EdgeProjectorService | null = null;
    private _active = false;
    private _viewDef: ViewDefinition | null = null;
    private _root: HTMLElement | null = null;
    private _canvas: HTMLCanvasElement | null = null;
    private _rendererContainer: HTMLElement | null = null;
    private _rendererContainerDisplay = '';
    private _planCanvas: PlanViewCanvas | null = null;
    private _unregisterTick: (() => void) | null = null;
    private _planViewInteraction: PlanViewInteraction | null = null;
    private _lastRender = 0;
    private _hasFitDrawing = false;
    private _isPanning = false;
    private readonly _panStart = new THREE.Vector2();
    private _frustumH = DEFAULT_PLAN_VIEW_CANVAS_FRUSTUM;
    private readonly _camTarget = new THREE.Vector3();
    private readonly _boundWheel = this._onWheel.bind(this);
    private readonly _boundMouseDown = this._onMouseDown.bind(this);
    private readonly _boundMouseMove = this._onMouseMove.bind(this);
    private readonly _boundMouseUp = this._onMouseUp.bind(this);
    private readonly _boundViewUpdated = this._onViewUpdated.bind(this);
    /**
     * Selection-changed handler — mirrors SplitViewManager._subscribeSelectionEvents.
     * PlanViewCanvas._renderSelectionHighlights() reads window.selectionManager
     * directly, so we only need to invalidate _lastRender to force the next
     * UnifiedFrameLoop tick to repaint the Canvas2D plan with the new selection.
     * Without this, clicks select the element silently in the main plan view but
     * the purple highlight glow never appears (it works in split view because
     * SplitViewManager subscribes to the same event).
     */
    private readonly _boundSelectionChanged = () => { this._lastRender = 0; };
    private _unsubSelectionChanged: { dispose(): void } | null = null; // F.events.16
    private _splitViewWasActiveAtActivation = false;
    private _activeSplitViewId: string | null = null;

    // Toolbar state
    private _gridOn = false;
    private _gridToggleBtn: HTMLButtonElement | null = null;
    private _ifcToggleBtn: HTMLButtonElement | null = null;
    private _isolateBanner: HTMLElement | null = null;
    private _overridesBtn: HTMLButtonElement | null = null;
    private _header: HTMLElement | null = null;
    private _leftPanelObserver: ResizeObserver | null = null;
    /** Disposable returned by runtime.events.on('vi:instance-updated', ...) — cleaned up in deactivate(). F.events.2b */
    private _viInstanceUpdatedDisposable: { dispose(): void } | null = null;
    // F.events.7 — split-view typed-bus unsub handles. runtime.events.on() returns a
    // Disposable ({ dispose() }) — NOT an unsubscribe function (see EventBus.ts).
    private _unsubSplitActivated:     { dispose(): void } | null = null;
    private _unsubSplitDeactivated:   { dispose(): void } | null = null;
    private _unsubSplitLayoutChanged: { dispose(): void } | null = null;
    private _unsubSplitViewChanged:   { dispose(): void } | null = null;
    /** DOM adapter — still used for legacy `vi:overrides-cleared` (no viewId in detail). */
    private readonly _boundIntentInstanceUpdated = (e: Event) =>
        this._onIntentInstanceUpdatedCore((e as CustomEvent<{ viewId?: string }>).detail?.viewId);
    private readonly _boundIntentUpdated = this._onIntentUpdated.bind(this);
    private readonly _boundSyncHeaderOffset = () => this._syncHeaderOffset();
    private readonly _boundIfcProjectionChanged = this._onIfcProjectionChanged.bind(this);
    private _unsubIfcImported: { dispose(): void } | null = null;
    private readonly _boundProjectionStale = this._onProjectionStale.bind(this);
    /** Coalesce bursts of element mutations into one re-projection per ~30 ms. */
    private _staleProjectionTimer: ReturnType<typeof setTimeout> | null = null;
    /**
     * Debounce timer to call endMotion() after the last wheel event.
     * Pan end (mouseup) calls endMotion() immediately; wheel zoom has no
     * pointer-release equivalent so we defer by 200 ms (no damping tail exists).
     * See 08-CAMERA-SYSTEM-CONTRACT §3 and the 3D-view fix in initScene.ts.
     */
    private _wheelMotionTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(components: OBC.Components, world: OBC.World) {
        this._components = components;
        this._world = world;
    }

    get isActive(): boolean {
        return this._active;
    }

    get planViewCanvas(): PlanViewCanvas | null {
        return this._planCanvas;
    }

    setUnifiedFrameLoop(loop: UnifiedFrameLoop): void {
        this._frameLoop = loop;
    }

    setEdgeProjectorService(service: EdgeProjectorService): void {
        this._edgeProjectorService = service;
    }

    activate(viewDef: ViewDefinition): void {
        if (this._active) this.deactivate();

        const splitViewManager = window.splitViewManager;
        this._splitViewWasActiveAtActivation = Boolean(splitViewManager?.isActive);

        this._active = true;
        this._viewDef = viewDef;
        this._lastRender = 0;
        this._hasFitDrawing = false;
        this._frustumH = DEFAULT_PLAN_VIEW_CANVAS_FRUSTUM;
        this._camTarget.set(0, 0, 0);

        // Restore grid preference from localStorage
        try {
            const stored = localStorage.getItem('pryzm.planView.gridVisible');
            this._gridOn = stored !== null ? stored !== 'false' : false;
        } catch { this._gridOn = false; }

        // Contract 38 — expose on window so SvpPlanToolOverlay can detect primary-viewport mode
        window.planViewManager = this;

        this._hideRendererContainer();
        this._buildDOM(viewDef);
        this._syncRootLayout();
        this._attachLeftPanelObserver();
        this._buildContext();
        window.addEventListener('vd:view-updated', this._boundViewUpdated);
        // F.events.7 — split-view family migrated to runtime.events typed bus.
        this._unsubSplitActivated     = window.runtime?.events?.on('split-view-activated',     () => this._syncRootLayout()) ?? null;
        this._unsubSplitDeactivated   = window.runtime?.events?.on('split-view-deactivated',   () => this._syncRootLayout()) ?? null;
        this._unsubSplitLayoutChanged = window.runtime?.events?.on('split-view-layout-changed', () => this._syncRootLayout()) ?? null;
        this._unsubSplitViewChanged   = window.runtime?.events?.on('split-view-view-changed',  (p: unknown) => this._onSplitViewViewChanged(p as { viewId?: string | null })) ?? null;
        // vi:instance-updated migrated to runtime.events (F.events.2b); DOM listener kept for vi:overrides-cleared only.
        this._viInstanceUpdatedDisposable = (window as unknown as { runtime?: import('@pryzm/runtime-composer/types').PryzmRuntime })
            .runtime?.events?.on('vi:instance-updated', ({ viewId }) => this._onIntentInstanceUpdatedCore(viewId)) ?? null; // F.events.2b
        window.addEventListener('vi:overrides-cleared', this._boundIntentInstanceUpdated);
        window.addEventListener('vi:intent-updated', this._boundIntentUpdated);
        window.addEventListener(IFC_PROJECTION_CHANGED_EVENT, this._boundIfcProjectionChanged);
        this._unsubIfcImported = window.runtime?.events?.on('pryzm-ifc-imported', () => this._onIfcImported()) ?? null; // F.events.13
        this._unsubSelectionChanged = window.runtime?.events?.on('bim-selection-changed', this._boundSelectionChanged) ?? null; // F.events.16
        window.addEventListener('vd:projection-stale', this._boundProjectionStale);
        this._activeSplitViewId = splitViewManager?.activeViewId ?? null;
        this._registerTick();
        this._ensureProjection(viewDef);

        if (!this._splitViewWasActiveAtActivation) {
            // F.events.7 — split-view family migrated to runtime.events typed bus.
            window.runtime?.events?.emit('split-view-activated', {});
        }
        console.log(`[PlanViewManager] Activated Canvas2D plan view "${viewDef.id}"`);
    }

    deactivate(): void {
        if (!this._active && !this._root && !this._rendererContainer) return;
        this._active = false;
        this._viewDef = null;
        this._isPanning = false;

        this._unregisterTick?.();
        this._unregisterTick = null;

        planViewToolOverlay.detach();
        this._planViewInteraction?.detach();
        this._planViewInteraction = null;

        this._canvas?.removeEventListener('wheel', this._boundWheel);
        this._canvas?.removeEventListener('mousedown', this._boundMouseDown);
        window.removeEventListener('mousemove', this._boundMouseMove);
        window.removeEventListener('mouseup', this._boundMouseUp);
        window.removeEventListener('vd:view-updated', this._boundViewUpdated);
        // F.events.7 — split-view typed-bus unsub cleanup.
        // runtime.events.on() returns a Disposable — dispose via .dispose(), never call
        // as a function. A bad `?.()` here threw `TypeError: ... is not a function`,
        // aborting deactivate() mid-teardown and leaking every listener/timer below
        // (the real root cause behind C11 §7.0 FIX-DEACTIVATE-GUARD).
        this._unsubSplitActivated?.dispose();     this._unsubSplitActivated     = null;
        this._unsubSplitDeactivated?.dispose();   this._unsubSplitDeactivated   = null;
        this._unsubSplitLayoutChanged?.dispose(); this._unsubSplitLayoutChanged = null;
        this._unsubSplitViewChanged?.dispose();   this._unsubSplitViewChanged   = null;
        this._viInstanceUpdatedDisposable?.dispose(); // F.events.2b — was window.removeEventListener('vi:instance-updated', ...)
        this._viInstanceUpdatedDisposable = null;
        window.removeEventListener('vi:overrides-cleared', this._boundIntentInstanceUpdated);
        window.removeEventListener('vi:intent-updated', this._boundIntentUpdated);
        window.removeEventListener(IFC_PROJECTION_CHANGED_EVENT, this._boundIfcProjectionChanged);
        this._unsubIfcImported?.dispose(); this._unsubIfcImported = null; // F.events.13
        this._unsubSelectionChanged?.dispose(); this._unsubSelectionChanged = null; // F.events.16
        window.removeEventListener('vd:projection-stale', this._boundProjectionStale);
        if (this._staleProjectionTimer !== null) {
            clearTimeout(this._staleProjectionTimer);
            this._staleProjectionTimer = null;
        }
        if (this._wheelMotionTimer !== null) {
            clearTimeout(this._wheelMotionTimer);
            this._wheelMotionTimer = null;
            getFrameScheduler().endMotion('plan-zoom');
        }
        this._activeSplitViewId = null;
        // Contract 38 — clear window reference when primary plan view deactivates
        if (window.planViewManager === this) {
            window.planViewManager = null;
        }

        this._leftPanelObserver?.disconnect();
        this._leftPanelObserver = null;
        this._header = null;

        this._planCanvas?.dispose();
        this._planCanvas = null;
        this._canvas = null;
        this._gridToggleBtn = null;
        this._ifcToggleBtn = null;
        this._isolateBanner = null;
        this._overridesBtn = null;
        this._root?.remove();
        this._root = null;
        activePlanDrawingRef.drawing = null;
        this._restoreRendererContainer();

        const splitViewManager = window.splitViewManager;
        if (!splitViewManager?.isActive && !this._splitViewWasActiveAtActivation) {
            // F.events.7 — split-view family migrated to runtime.events typed bus.
            window.runtime?.events?.emit('split-view-deactivated', {});
        }
        this._splitViewWasActiveAtActivation = false;
        console.log('[PlanViewManager] Deactivated Canvas2D plan view');
    }

    private _hideRendererContainer(): void {
        const dom = this._world.renderer?.three?.domElement as HTMLCanvasElement | undefined;
        const container = dom?.parentElement ?? document.getElementById('container');
        if (!container) return;
        this._rendererContainer = container;
        this._rendererContainerDisplay = container.style.display;
        container.style.display = 'none';
    }

    private _restoreRendererContainer(): void {
        if (this._rendererContainer) {
            this._rendererContainer.style.display = this._rendererContainerDisplay;
        }
        this._rendererContainer = null;
        this._rendererContainerDisplay = '';
    }

    private _buildDOM(viewDef: ViewDefinition): void {
        const root = document.createElement('div');
        root.id = 'svp-plan-view-root';
        root.className = 'svp-plan-view-root';

        // ── Floating Toolbar (absolute over canvas, no panel) ─────────────────
        const header = document.createElement('div');
        header.className = 'svp-plan-view-header';

        // View name label (shows for all view types — especially helpful for elevation/section)
        if (viewDef.name) {
            const nameLabel = document.createElement('span');
            nameLabel.className = 'svp-pv-view-name';
            nameLabel.textContent = viewDef.name;
            header.appendChild(nameLabel);
        }

        // Right-side toolbar (the header IS the toolbar — no title panel)
        const toolbar = document.createElement('div');
        toolbar.className = 'svp-plan-view-toolbar';

        // Grid toggle button
        const gridBtn = document.createElement('button');
        gridBtn.className = 'svp-pv-btn svp-pv-btn--grid' + (this._gridOn ? ' svp-pv-btn--active' : '');
        gridBtn.title = this._gridOn ? 'Hide grid' : 'Show grid';
        gridBtn.setAttribute('aria-pressed', String(this._gridOn));
        gridBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M0 4.67h14M0 9.33h14M4.67 0v14M9.33 0v14"/></svg><span>Grid</span>`;
        gridBtn.addEventListener('click', () => this._toggleGrid());
        this._gridToggleBtn = gridBtn;

        // Unified Visibility & Graphics button (Stage S4 consolidation:
        // replaces the legacy separate V/G + Overrides + Intent picker
        // controls with a single panel backed by viewIntentInstanceStore).
        const vgBtn = document.createElement('button');
        vgBtn.className = 'svp-pv-btn';
        vgBtn.title = 'Visibility & Graphics — Intent, overrides, isolate';
        vgBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="7" cy="7" r="3"/><path d="M1 7c1.5-4 9.5-4 12 0-2.5 4-10.5 4-12 0Z"/></svg><span>V/G</span>`;
        vgBtn.addEventListener('click', () => {
            if (!this._viewDef) return;
            if (!window.overridePanel) window.overridePanel = new OverridePanel();
            window.overridePanel.toggle(this._viewDef.id);
        });
        // Re-use the existing customised-state indicator on this single button.
        this._overridesBtn = vgBtn;

        // View Range / Properties button
        const rangeBtn = document.createElement('button');
        rangeBtn.className = 'svp-pv-btn';
        rangeBtn.title = 'View Properties & Range';
        rangeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1" y="1" width="12" height="12" rx="1.5"/><path d="M1 5h12M4 1v4"/></svg><span>View Range</span>`;
        rangeBtn.addEventListener('click', () => {
            const vpp = window.viewPropertiesPanel;
            if (vpp && this._viewDef) {
                if (typeof vpp.showFromDefinition === 'function') {
                    vpp.showFromDefinition(this._viewDef);
                } else if (typeof vpp.show === 'function') {
                    vpp.show(this._viewDef);
                }
            }
        });

        // Close (return to 3D) button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'svp-pv-btn svp-pv-btn--close';
        closeBtn.title = 'Return to 3D view';
        closeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 2l10 10M12 2L2 12"/></svg><span>Close</span>`;
        closeBtn.addEventListener('click', () => this.deactivate());

        // IFC Data toggle button
        const ifcEnabled = ifcProjectionStore.shouldIncludeIFC(viewDef.id);
        const ifcBtn = document.createElement('button');
        ifcBtn.className = 'svp-pv-btn svp-pv-btn--ifc' + (ifcEnabled ? ' svp-pv-btn--active' : '');
        ifcBtn.title = ifcEnabled ? 'IFC imported data: visible (click to hide)' : 'IFC imported data: hidden (click to show)';
        ifcBtn.setAttribute('aria-pressed', String(ifcEnabled));
        ifcBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4">
            <rect x="1" y="3" width="12" height="8" rx="1"/>
            <path d="M4 3V1.5M10 3V1.5M1 6.5h12"/>
            <circle cx="4.5" cy="9" r="0.8" fill="currentColor" stroke="none"/>
            <circle cx="7" cy="9" r="0.8" fill="currentColor" stroke="none"/>
            <circle cx="9.5" cy="9" r="0.8" fill="currentColor" stroke="none"/>
        </svg><span>IFC</span>`;
        ifcBtn.addEventListener('click', () => this._toggleIFCProjection());
        this._ifcToggleBtn = ifcBtn;

        toolbar.appendChild(gridBtn);
        toolbar.appendChild(ifcBtn);
        toolbar.appendChild(vgBtn);
        toolbar.appendChild(rangeBtn);
        toolbar.appendChild(closeBtn);

        header.appendChild(toolbar);

        // ── Canvas ────────────────────────────────────────────────────────────
        const canvas = document.createElement('canvas');
        canvas.className = 'svp-plan-view-canvas';
        canvas.id = 'svp-plan-view-canvas';

        const isolateBanner = document.createElement('div');
        isolateBanner.className = 'svp-isolate-banner';
        isolateBanner.innerHTML = `<span>Isolate active</span><button type="button">Exit Isolate</button>`;
        isolateBanner.querySelector('button')?.addEventListener('click', () => {
            if (!this._viewDef) return;
            // [P6 E.5.4] §01-BIM-ENGINE-CORE-CONTRACT §1 — bus-primary
            window.runtime?.bus?.executeCommand('view.clearAllOverrides', { viewId: this._viewDef.id })
                ?.catch((e: Error) => console.error('[PlanViewManager] view.clearAllOverrides failed:', e));
        });
        this._isolateBanner = isolateBanner;

        root.appendChild(header);
        root.appendChild(isolateBanner);
        root.appendChild(canvas);
        document.body.appendChild(root);

        canvas.addEventListener('wheel', this._boundWheel, { passive: false });
        canvas.addEventListener('mousedown', this._boundMouseDown);
        window.addEventListener('mousemove', this._boundMouseMove);
        window.addEventListener('mouseup', this._boundMouseUp);

        this._root = root;
        this._canvas = canvas;
        this._header = header;
        this._syncOverrideIndicators();
    }

    private _syncRootLayout(): void {
        if (!this._root) return;
        const splitViewManager = window.splitViewManager;
        const pane = document.getElementById('svp-secondary-pane');
        if (!splitViewManager?.isActive || !pane) {
            this._root.style.right = '';
            this._root.classList.remove('svp-plan-view-root--split');
            this._lastRender = 0;
        } else {
            const width = Math.max(0, Math.round(pane.getBoundingClientRect().width));
            this._root.style.right = `${width}px`;
            this._root.classList.add('svp-plan-view-root--split');
            this._lastRender = 0;
        }
        this._syncHeaderOffset();
    }

    /**
     * Reads the right edge of the left-hand side panel from the DOM and
     * shifts the plan-view header accordingly so title / buttons are never
     * hidden behind the panel. Called on every layout change and whenever
     * the left panel is resized (via ResizeObserver).
     */
    private _syncHeaderOffset(): void {
        if (!this._header) return;
        const GAP = 8; // px gap between panel right-edge and header
        const leftPanel =
            document.querySelector<HTMLElement>('.plat-left-panel') ??
            document.querySelector<HTMLElement>('.vb-panel');
        if (!leftPanel) {
            this._header.style.left = '12px';
            return;
        }
        const rect = leftPanel.getBoundingClientRect();
        // Only offset when the panel is actually on the left side of the viewport
        if (rect.right > 0 && rect.left < window.innerWidth * 0.5) {
            this._header.style.left = `${Math.round(rect.right) + GAP}px`;
        } else {
            this._header.style.left = '12px';
        }
    }

    /** Attach a ResizeObserver to the left panel so header tracks width changes live. */
    private _attachLeftPanelObserver(): void {
        this._leftPanelObserver?.disconnect();
        this._leftPanelObserver = null;
        const leftPanel =
            document.querySelector<HTMLElement>('.plat-left-panel') ??
            document.querySelector<HTMLElement>('.vb-panel');
        if (!leftPanel) return;
        this._leftPanelObserver = new ResizeObserver(this._boundSyncHeaderOffset);
        this._leftPanelObserver.observe(leftPanel);
    }

    private _toggleGrid(): void {
        this._gridOn = !this._gridOn;
        this._planCanvas?.setGridVisible(this._gridOn);
        this._syncGridBtn();
        try {
            localStorage.setItem('pryzm.planView.gridVisible', String(this._gridOn));
        } catch { /* ignore */ }
    }

    private _syncGridBtn(): void {
        const btn = this._gridToggleBtn;
        if (!btn) return;
        btn.classList.toggle('svp-pv-btn--active', this._gridOn);
        btn.title = this._gridOn ? 'Hide grid' : 'Show grid';
        btn.setAttribute('aria-pressed', String(this._gridOn));
    }

    private _hasOverrides(viewId: string): boolean {
        const layer = viewIntentInstanceStore.get(viewId)?.localOverrides;
        return Boolean(layer && (layer.isolateActive || layer.visibilityOverrides.length > 0 || layer.graphicOverrides.length > 0));
    }

    private _syncOverrideIndicators(): void {
        const viewId = this._viewDef?.id;
        if (!viewId) return;
        const layer = viewIntentInstanceStore.get(viewId)?.localOverrides;
        const isolateActive = Boolean(layer?.isolateActive);
        this._isolateBanner?.classList.toggle('svp-isolate-banner--visible', isolateActive);
        this._overridesBtn?.classList.toggle('svp-pv-btn--active', this._hasOverrides(viewId));
    }

    /** Core handler — called from both the runtime.events typed path (vi:instance-updated)
     *  and the DOM adapter path (vi:overrides-cleared).  viewId is undefined when the event
     *  carries no view discriminator (e.g. vi:overrides-cleared) meaning "apply to all views". */
    private _onIntentInstanceUpdatedCore(viewId?: string): void {
        if (viewId && viewId !== this._viewDef?.id) return;
        this._syncOverrideIndicators();
        if (this._viewDef?.id) {
            const drawing = viewTechnicalDrawingCache.get(this._viewDef.id);
            const vgApplicator = window.vgSceneApplicator;
            if (drawing && vgApplicator?.applyToProjectionLayers) {
                vgApplicator.applyToProjectionLayers(drawing, this._viewDef.id);
            }
        }
        this._lastRender = 0;
    }

    /**
     * §PLAN-VIEW-REFRESH (Apr 2026) — handle stale-projection notifications.
     *
     * ViewTechnicalDrawingCache emits this event whenever any non-view element
     * (wall, door, window, room, slab, …) is created, updated, or removed. The
     * cached TechnicalDrawing for this view is now stale; we invalidate it and
     * trigger a fresh projection so the 2D plan reflects the new geometry.
     *
     * Bursts of mutations (e.g. a Cascade that updates 4 walls in a row) are
     * coalesced into a single re-projection via a short trailing-edge timer —
     * one event burst → one network of GPU work, not four.
     */
    private _onProjectionStale(_e: Event): void {
        if (!this._viewDef) return;
        if (this._staleProjectionTimer !== null) return;

        this._staleProjectionTimer = setTimeout(() => {
            this._staleProjectionTimer = null;
            const viewDef = this._viewDef;
            if (!viewDef) return;
            viewTechnicalDrawingCache.invalidate(viewDef.id);
            activePlanDrawingRef.drawing = null;
            // §C-B2 (DAILY-USE-AUDIT 2026-05-20) — DO NOT reset _hasFitDrawing here.
            // Architect was losing their working pan/zoom on every element commit
            // because every store change emits a projection-stale event → reset →
            // _render() fitToDrawing() overwrites their position. Fit-to-drawing is
            // an INITIAL-ACTIVATION concern (already covered by activate() at line
            // ~135 which resets the flag). Projection invalidation should re-project
            // the drawing in place, never yank the camera. C04 §3.3 — per-view
            // camera state is sticky across data mutations within the same view session.
            this._lastRender = 0;
            this._ensureProjection(viewDef);
        }, 30);
    }

    private _onIntentUpdated(e: Event): void {
        // When an intent's planViewRange changes, plan views using that intent need full re-projection.
        const intentId = (e as CustomEvent<{ intentId?: string }>).detail?.intentId;
        if (!intentId || !this._viewDef) return;
        const instance = viewIntentInstanceStore.get(this._viewDef.id);
        if (!instance || instance.intentId !== intentId) return;
        // Invalidate the cached drawing and re-project with the new depth settings.
        viewTechnicalDrawingCache.invalidate(this._viewDef.id);
        activePlanDrawingRef.drawing = null;
        // §C-B2 (DAILY-USE-AUDIT 2026-05-20) — intent-driven projection-depth changes
        // re-project but MUST NOT reset the user's camera (same reasoning as above).
        this._lastRender = 0;
        this._ensureProjection(this._viewDef);
    }

    private _buildContext(): void {
        if (!this._canvas) return;
        this._planCanvas = new PlanViewCanvas(this._canvas, {
            gridVisible: this._gridOn,
            styleResolver: (category, layerTag) => {
                const viewId = this._viewDef?.id;
                const { style } = vgGovernanceStore.resolveStyle('model-default', category, viewId);
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
        this._planCanvas.setLevelId(this._viewDef?.spatial?.levelId ?? null);
        const viewType = this._viewDef?.viewType ?? 'plan';
        this._planCanvas.setViewType(viewType);

        // Bug 1 fix: configure section/elevation axes so that world Y (height)
        // maps to screen vertical instead of world Z.
        if (viewType === 'section' || viewType === 'elevation') {
            const dir = (this._viewDef?.spatial as any)?.projectionDirection ?? { x: 0, y: 0, z: -1 };
            const absX = Math.abs(dir.x ?? 0);
            const absZ = Math.abs(dir.z ?? 0);
            const hAxis: 'x' | 'z' = absX > absZ ? 'z' : 'x';
            const right = { x: -(dir.z ?? -1), z: dir.x ?? 0 };
            const hSign: 1 | -1 = ((hAxis === 'x' ? right.x : right.z) < 0 ? -1 : 1);
            this._planCanvas.setSectionAxes(hAxis, true, hSign);
        }

        this._syncCanvasState();

        if (this._viewDef) {
            this._planViewInteraction = new PlanViewInteraction();
            this._planViewInteraction.attach(this._canvas, this._planCanvas, this._viewDef.id);
            planViewToolOverlay.attach(this._canvas, this._planCanvas, this._planViewInteraction, this._viewDef);
        }
    }

    private _registerTick(): void {
        if (!this._frameLoop) {
            console.warn('[PlanViewManager] Unified frame loop unavailable; plan canvas will render once.');
            this._render();
            return;
        }

        this._unregisterTick = this._frameLoop.addTickListener({
            id: 'plan-view-manager',
            priority: 'pre-render',
            callback: (_deltaMs, timestamp) => {
                if (!this._active) return;
                const dt = timestamp - this._lastRender;
                if (dt < PLAN_VIEW_MANAGER_FPS_INTERVAL) return;
                this._lastRender = timestamp - (dt % PLAN_VIEW_MANAGER_FPS_INTERVAL);
                this._render();
            },
        });
    }

    private _render(): void {
        const viewDef = this._viewDef;
        if (!this._active || !viewDef || !this._planCanvas) return;

        // Use actual canvas rect dimensions — this is what getBoundingClientRect() returns
        // in _toWorld() calls, so the coordinate mapping stays consistent.
        const rect = this._canvas?.getBoundingClientRect();
        const w = Math.round(rect?.width ?? 0) || window.innerWidth;
        const h = Math.round(rect?.height ?? 0) || window.innerHeight;
        this._planCanvas.setSize(w, h);
        planViewToolOverlay.notifyResize();

        const drawing = viewTechnicalDrawingCache.get(viewDef.id);
        if (drawing && !this._hasFitDrawing) {
            this._planCanvas.fitToDrawing(viewDef, w, h);
            this._frustumH = this._planCanvas.getFrustumH();
            this._camTarget.copy(this._planCanvas.getCamTarget());
            this._hasFitDrawing = true;
        }

        this._syncCanvasState();
        const splitActiveViewId = this._activeSplitViewId && this._activeSplitViewId !== viewDef.id
            ? this._activeSplitViewId
            : null;
        this._planCanvas.render(viewDef, { activeLinkedViewId: splitActiveViewId });
    }

    private _syncCanvasState(): void {
        this._planCanvas?.setFrustum(this._frustumH, this._camTarget);
    }

    private _ensureProjection(viewDef: ViewDefinition): void {
        const cachedDrawing = viewTechnicalDrawingCache.get(viewDef.id);
        if (cachedDrawing) {
            activePlanDrawingRef.drawing = cachedDrawing;
            this._hasFitDrawing = false;
            this._planViewInteraction?.notifyDrawingChanged(viewDef.id);
            return;
        }

        if (!this._edgeProjectorService) return;

        const fragmentsMgr = this._components.get(OBC.FragmentsManager);
        const allModels = fragmentsMgr.list.size > 0 ? Array.from(fragmentsMgr.list.values()) : [];
        // Apply IFC toggle — omit IFC models when the user has disabled them for this view
        const models = ifcProjectionStore.filterModels(allModels, viewDef.id);
        const nativeGroups = useEdgeProjectorNative()
            ? nativeElementMeshExporter.exportForView(viewDef)
            : [];

        // Collect IFC-imported scene groups (Contract 28 §3.1 / Contract 22 §4.1).
        // IfcGeometryRenderer adds THREE.Group nodes with userData.source === 'ifc-import'
        // directly to the Three.js scene.  They are NOT in OBC FragmentsManager so the
        // Source A EdgeProjector path cannot reach them.  We collect them here and pass
        // them as Source C to EdgeProjectorService.project().
        const ifcSceneGroups: THREE.Group[] = [];
        if (ifcProjectionStore.shouldIncludeIFC(viewDef.id)) {
            const scene = (this._world.scene as any)?.three as THREE.Scene | undefined;
            if (scene) {
                for (const obj of scene.children) {
                    if ((obj as THREE.Group).isGroup && obj.userData?.source === 'ifc-import') {
                        ifcSceneGroups.push(obj as THREE.Group);
                    }
                }
            }
        }

        if (models.length === 0 && nativeGroups.length === 0 && ifcSceneGroups.length === 0) return;

        // Resolve planBelowDepthOffset from the view's assigned intent (default 1.20 m).
        const isPlanType = viewDef.viewType === 'plan' || viewDef.viewType === 'structural-plan';
        let planBelowDepthOffset = 0;
        if (isPlanType) {
            const instance = viewIntentInstanceStore.get(viewDef.id);
            const intent   = instance ? visibilityIntentStore.get(instance.intentId) : null;
            const isStructural = viewDef.viewType === 'structural-plan';
            planBelowDepthOffset = isStructural
                ? (intent?.planViewRange?.structuralPlanBelowLevelDepth ?? 1.20)
                : (intent?.planViewRange?.belowLevelDepth ?? 1.20);
        }

        const projectionGen = viewTechnicalDrawingCache.beginProjection(viewDef.id);
        this._edgeProjectorService.project(viewDef, models, nativeGroups, ifcSceneGroups, planBelowDepthOffset).then(drawing => {
            if (!this._active || this._viewDef?.id !== viewDef.id) {
                // §F.1 — view deactivated while EPS was running; release proxy groups.
                // §G1-T3 — disposeProxies: true disposes non-shared proxy geometries.
                // Shared IM/Mesh-source geometries are guarded by the sharedGeometry flag (§G1-T1).
                nativeElementMeshExporter.releaseGroups(nativeGroups, { disposeProxies: true });
                this._disposeRejectedDrawing(drawing);
                return;
            }

            const accepted = viewTechnicalDrawingCache.setIfCurrent(viewDef.id, projectionGen, drawing);
            if (!accepted) {
                // §F.1 — superseded projection; release proxy groups before discarding.
                nativeElementMeshExporter.releaseGroups(nativeGroups, { disposeProxies: true });
                this._disposeRejectedDrawing(drawing);
                return;
            }

            const vgApplicator = window.vgSceneApplicator;
            if (vgApplicator && typeof vgApplicator.applyToProjectionLayers === 'function') {
                vgApplicator.applyToProjectionLayers(drawing, viewDef.id);
            }

            activePlanDrawingRef.drawing = drawing;
            this._hasFitDrawing = false;
            this._lastRender = 0;
            this._planViewInteraction?.notifyDrawingChanged(viewDef.id);
            console.log(`[PlanViewManager] Projection cached for Canvas2D plan view "${viewDef.id}"`);
        }).catch(err => {
            nativeElementMeshExporter.releaseGroups(nativeGroups, { disposeProxies: true });
            console.error(`[PlanViewManager] EdgeProjectorService.project() failed for plan view "${viewDef.id}":`, err);
        });
    }

    private _onViewUpdated(e: Event): void {
        const viewId = (e as CustomEvent<{ viewId?: string }>).detail?.viewId;
        if (!this._active || !viewId) return;

        if (viewId === this._viewDef?.id) {
            // Active plan view updated — full invalidation + reprojection.
            const nextDef = viewDefinitionStore.get(viewId);
            if (!nextDef) return;

            this._viewDef = nextDef;
            viewTechnicalDrawingCache.invalidate(viewId);
            activePlanDrawingRef.drawing = null;
            this._hasFitDrawing = false;
            this._lastRender = 0;
            this._planViewInteraction?.notifyDrawingChanged(viewId);
            this._ensureProjection(nextDef);
        } else if (viewId === this._activeSplitViewId) {
            // The split view's elevation/section scope changed while a different
            // view is active in the main panel.  Invalidate the cached drawing and
            // reproject in the background without touching the main-panel state.
            const nextDef = viewDefinitionStore.get(viewId);
            if (!nextDef) return;
            viewTechnicalDrawingCache.invalidate(viewId);
            this._ensureProjectionForSplitView(nextDef);
        }
    }

    /**
     * Projects `viewDef` for the split view without requiring it to be the
     * currently active plan view.  Unlike `_ensureProjection`, this path:
     *   - Does NOT set `activePlanDrawingRef.drawing`
     *   - Does NOT touch `_hasFitDrawing` or the main-panel render timestamp
     *   - Does NOT reject completions based on `this._viewDef?.id`
     *
     * When the projection completes, `svp:drawing-refreshed` is dispatched so
     * SplitViewManager can reset its fit flag and pick up the new drawing on the
     * next render tick.
     */
    private _ensureProjectionForSplitView(viewDef: ViewDefinition): void {
        if (!this._edgeProjectorService) return;

        const fragmentsMgr = this._components.get(OBC.FragmentsManager);
        const allModels = fragmentsMgr.list.size > 0 ? Array.from(fragmentsMgr.list.values()) : [];
        const models = ifcProjectionStore.filterModels(allModels, viewDef.id);
        const nativeGroups = useEdgeProjectorNative()
            ? nativeElementMeshExporter.exportForView(viewDef)
            : [];

        // Collect IFC-imported scene groups — same logic as _ensureProjection (Contract 28 §3.1).
        const ifcSceneGroups: THREE.Group[] = [];
        if (ifcProjectionStore.shouldIncludeIFC(viewDef.id)) {
            const scene = (this._world.scene as any)?.three as THREE.Scene | undefined;
            if (scene) {
                for (const obj of scene.children) {
                    if ((obj as THREE.Group).isGroup && obj.userData?.source === 'ifc-import') {
                        ifcSceneGroups.push(obj as THREE.Group);
                    }
                }
            }
        }

        if (models.length === 0 && nativeGroups.length === 0 && ifcSceneGroups.length === 0) return;

        const isPlanTypeSV = viewDef.viewType === 'plan' || viewDef.viewType === 'structural-plan';
        let planBelowDepthOffsetSV = 0;
        if (isPlanTypeSV) {
            const instance = viewIntentInstanceStore.get(viewDef.id);
            const intent   = instance ? visibilityIntentStore.get(instance.intentId) : null;
            const isStructural = viewDef.viewType === 'structural-plan';
            planBelowDepthOffsetSV = isStructural
                ? (intent?.planViewRange?.structuralPlanBelowLevelDepth ?? 1.20)
                : (intent?.planViewRange?.belowLevelDepth ?? 1.20);
        }

        const projectionGen = viewTechnicalDrawingCache.beginProjection(viewDef.id);
        this._edgeProjectorService.project(viewDef, models, nativeGroups, ifcSceneGroups, planBelowDepthOffsetSV).then(drawing => {
            const accepted = viewTechnicalDrawingCache.setIfCurrent(viewDef.id, projectionGen, drawing);
            if (!accepted) {
                // §F.1 — superseded split-view projection; release proxy groups.
                nativeElementMeshExporter.releaseGroups(nativeGroups, { disposeProxies: true });
                this._disposeRejectedDrawing(drawing);
                return;
            }

            const vgApplicator = window.vgSceneApplicator;
            if (vgApplicator && typeof vgApplicator.applyToProjectionLayers === 'function') {
                vgApplicator.applyToProjectionLayers(drawing, viewDef.id);
            }

            window.runtime?.events?.emit('svp:drawing-refreshed', { viewId: viewDef.id }); // F.events.10
            console.log(`[PlanViewManager] Split-view reprojection complete for "${viewDef.id}"`);
        }).catch(err => {
            nativeElementMeshExporter.releaseGroups(nativeGroups, { disposeProxies: true });
            console.error(`[PlanViewManager] Split-view projection failed for "${viewDef.id}":`, err);
        });
    }

    private _onSplitViewViewChanged(payload: { viewId?: string | null }): void {
        const viewId = payload.viewId ?? null;
        this._activeSplitViewId = viewId;
        this._lastRender = 0;
        if (!viewId || viewTechnicalDrawingCache.get(viewId)) return;
        const viewDef = viewDefinitionStore.get(viewId);
        if (!viewDef) return;
        if (viewDef.viewType === 'section' || viewDef.viewType === 'elevation') {
            this._ensureProjectionForSplitView(viewDef);
        }
    }

    /**
     * Toggle IFC data visibility for the currently active view.
     * Updates the IFC toggle button state and triggers reprojection.
     */
    private _toggleIFCProjection(): void {
        if (!this._viewDef) return;
        const current = ifcProjectionStore.shouldIncludeIFC(this._viewDef.id);
        // Use global toggle (affects all views equally) unless per-view is needed
        ifcProjectionStore.setGlobal(!current);
    }

    /**
     * Respond to `ifc-projection-changed` events:
     *   1. Update toggle button visuals.
     *   2. Invalidate caches and trigger reprojection for the active view.
     */
    private _onIfcProjectionChanged(_e: Event): void {
        const enabled = ifcProjectionStore.globalEnabled;

        // Update IFC button UI
        if (this._ifcToggleBtn) {
            this._ifcToggleBtn.classList.toggle('svp-pv-btn--active', enabled);
            this._ifcToggleBtn.setAttribute('aria-pressed', String(enabled));
            this._ifcToggleBtn.title = enabled
                ? 'IFC imported data: visible (click to hide)'
                : 'IFC imported data: hidden (click to show)';
        }

        // Invalidate cache and reproject
        if (!this._viewDef) return;
        viewTechnicalDrawingCache.invalidate(this._viewDef.id);
        activePlanDrawingRef.drawing = null;
        this._hasFitDrawing = false;
        this._lastRender = 0;
        this._planViewInteraction?.notifyDrawingChanged(this._viewDef.id);
        this._ensureProjection(this._viewDef);

        console.log(
            `[PlanViewManager] IFC projection toggled: ${enabled ? 'ON' : 'OFF'} — ` +
            `reprojecting view "${this._viewDef.id}"`,
        );
    }

    /**
     * Respond to `pryzm-ifc-imported` events:
     * When a new IFC model is imported, invalidate the plan-view projection cache and
     * trigger reprojection so the freshly added scene groups (Source C) are included.
     */
    private _onIfcImported(): void {
        if (!this._active || !this._viewDef) return;
        viewTechnicalDrawingCache.invalidate(this._viewDef.id);
        activePlanDrawingRef.drawing = null;
        this._hasFitDrawing = false;
        this._lastRender = 0;
        this._planViewInteraction?.notifyDrawingChanged(this._viewDef.id);
        this._ensureProjection(this._viewDef);
        console.log(
            `[PlanViewManager] pryzm-ifc-imported received — ` +
            `reprojecting view "${this._viewDef.id}" with IFC scene meshes`,
        );
    }

    private _disposeRejectedDrawing(drawing: OBC.TechnicalDrawing): void {
        try {
            drawing.onDisposed.trigger();
        } catch {
        }
    }

    private _onWheel(e: WheelEvent): void {
        if (!this._active) return;
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 1.12 : 0.89;
        this._frustumH = Math.max(2, Math.min(200, this._frustumH * zoomFactor));
        this._syncCanvasState();
        this._lastRender = 0;
        // Keep the FrameScheduler render loop alive during wheel zoom.
        // The plan view has no damping tail after zoom, so we defer endMotion()
        // 200 ms after the last wheel event (debounced).
        // See 08-CAMERA-SYSTEM-CONTRACT §3 and the equivalent fix in initScene.ts.
        // P8 span: pryzm.plan-view.zoom — observable for Honeycomb/Tempo dashboards.
        emitPlanViewMotionEvent('zoom', {
            'pryzm.plan_view.source':  'plan-zoom',
            'pryzm.plan_view.kind':    'primary',
            'pryzm.plan_view.frustum': this._frustumH,
        });
        getFrameScheduler().beginMotion('plan-zoom');
        if (this._wheelMotionTimer !== null) clearTimeout(this._wheelMotionTimer);
        this._wheelMotionTimer = setTimeout(() => {
            this._wheelMotionTimer = null;
            getFrameScheduler().endMotion('plan-zoom');
        }, 200);
    }

    private _onMouseDown(e: MouseEvent): void {
        if (!this._active || (e.button !== 0 && e.button !== 1)) return;
        if ((e as any).__pryzmToolHandled) return;
        this._isPanning = true;
        this._panStart.set(e.clientX, e.clientY);
        this._lastRender = 0;
        // Wake the FrameScheduler render loop for the pan gesture.
        // endMotion() is called in _onMouseUp when the pan ends.
        // See 08-CAMERA-SYSTEM-CONTRACT §3 and the equivalent fix in initScene.ts.
        // P8 span: pryzm.plan-view.pan-begin — observable for Honeycomb/Tempo dashboards.
        emitPlanViewMotionEvent('pan-begin', {
            'pryzm.plan_view.source': 'plan-pan',
            'pryzm.plan_view.kind':   'primary',
        });
        getFrameScheduler().beginMotion('plan-pan');
        // Contract 38 — mirror split view: show grabbing cursor while panning
        if (this._canvas && !this._canvas.classList.contains('svp-tool-active')) {
            this._canvas.style.cursor = 'grabbing';
        }
    }

    private _onMouseMove(e: MouseEvent): void {
        if (!this._active || !this._isPanning) return;
        const rect = this._canvas?.getBoundingClientRect();
        const w = Math.max(rect?.width ?? window.innerWidth, 1);
        const h = Math.max(rect?.height ?? window.innerHeight, 1);
        const dx = (e.clientX - this._panStart.x) / w * (this._frustumH * 2 * (w / h));
        const dz = (e.clientY - this._panStart.y) / h * (this._frustumH * 2);
        this._camTarget.x -= dx;
        // FIX: elevation/section views use flipV — worldToScreen maps higher worldY to
        // LOWER sy, so vertical pan must be inverted relative to plan view.
        // Plan view:       sy increases when worldZ increases  → camTarget.z -= dz
        // Elevation view:  sy increases when camTarget.z increases → camTarget.z += dz
        const viewType = this._viewDef?.viewType ?? 'plan';
        if (viewType === 'elevation' || viewType === 'section') {
            this._camTarget.z += dz;
        } else {
            this._camTarget.z -= dz;
        }
        this._panStart.set(e.clientX, e.clientY);
        this._syncCanvasState();
        this._lastRender = 0;
    }

    private _onMouseUp(): void {
        const wasPanning = this._isPanning;
        this._isPanning = false;
        // Contract 38 — reset cursor to CSS-inherited grab on pan release
        if (this._canvas && !this._canvas.classList.contains('svp-tool-active')) {
            this._canvas.style.cursor = '';
        }
        // End the FrameScheduler motion window that was opened in _onMouseDown.
        // The plan view has no damping tail (unlike 3D camera-controls), so
        // endMotion() fires immediately on pointer release.
        // P8 span: pryzm.plan-view.pan-end — observable for Honeycomb/Tempo dashboards.
        if (wasPanning) {
            emitPlanViewMotionEvent('pan-end', {
                'pryzm.plan_view.source': 'plan-pan',
                'pryzm.plan_view.kind':   'primary',
            });
            getFrameScheduler().endMotion('plan-pan');
        }
    }
}