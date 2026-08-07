import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { ViewNavigationManager, ViewMode } from '@pryzm/core-app-model';
import { PlanViewService } from '@pryzm/core-app-model';
import { SectionViewService } from './views/SectionViewService';
import { OrthoPlanCameraLockController } from '@pryzm/core-app-model';
import { viewDefinitionStore } from '@pryzm/core-app-model';
// §FEAT-LEVEL-RELATIVE-PLAN-VIEWS (L-720) — resolve the plan view that OWNS the active level.
import { findPlanViewForLevel, projectContext } from '@pryzm/core-app-model';
import { SceneBoundsCache } from '@pryzm/scene-committer';
import { SceneObjectClassifier } from '@pryzm/scene-committer';
import type { IViewSwitchListener } from '@pryzm/core-app-model';
import { PlanViewVisibilityCuller } from '@pryzm/core-app-model';
import { ViewCameraStateStore } from '@pryzm/core-app-model';
import type { FrameCoordinator } from '@pryzm/core-app-model';
import type { ViewVisibilityMap } from '@pryzm/core-app-model';
import { BIM_LAYER, EDITOR_LAYER, ANNOTATION_LAYER, PLAN_SYMBOL_LAYER, DOCUMENTATION_LAYER } from '@pryzm/scene-committer';
import { MultiViewCameraManager } from '@pryzm/core-app-model';
// §CAM-FRAME-INVARIANT (L-742) — the single framing authority shared with Fit All.
import { computeFitPose, boundsFramedByCamera, shouldPersistDepartingCamera } from '@pryzm/core-app-model';
// §CAM-BIM-SCALE-BOUNDS (L-744) — L-378 guarded the SAVED camera pose; an empty slot
// then fell through to DEFAULT FRAMING, which reads scene bounds nothing guarded.
import { isGlobeScaleBounds, isGlobeScalePosition, MAX_BIM_NEAR_M } from '@pryzm/core-app-model';
// §CAM-FRAME-SITE-WHEN-NO-MODEL (L-748) — framing precedence model → SITE → constant.
import { boundsFromSiteRing } from '@pryzm/core-app-model';

/**
 * §CAM-NEAR-NEVER-CUTS (L-747) — the BIM baseline far plane, restored alongside `near`
 * when a globe-scale depth range is repaired. Matches `computeFitPose`'s BASELINE_FAR_M.
 */
const CAMERA_BIM_BASELINE_FAR_M = 2000;

/**
 * §CAM-ECEF-HANDBACK (L-746) — distance (metres) of the neutral BIM pose the camera is
 * reset to when the globe hands it back in ECEF space. Matches the historical 3D default;
 * `_ensureGeometryFramed()` does the real framing once bounds are trustworthy.
 */
const CAMERA_HANDBACK_SAFE_DISTANCE_M = 60;
import type { UnifiedFrameLoop } from '@pryzm/core-app-model';
import { previewRegistry } from '@pryzm/scene-committer';
import type { LevelClipPlaneCache } from '@pryzm/core-app-model';
import type { EdgeProjectorService } from './views/EdgeProjectorService';
import type { IViewController } from '@pryzm/engine';
import { viewTechnicalDrawingCache } from '@pryzm/core-app-model';
import { activePlanDrawingRef } from '@pryzm/core-app-model';
import { nativeElementMeshExporter } from '@pryzm/core-app-model';
import { PlanViewManager } from './views/PlanViewManager';
// §C13-MOUNTED-DRAWING-OWNER — the module that owns the mounted TechnicalDrawing for
// the C13 teardown + the ADR-0298 isolation probe. ViewController stays the THREE
// lifetime owner; the module holds the ownership stamp and the registry entry.
import { noteDrawingMounted, noteDrawingUnmounted } from './views/mountedDrawingScope';
import { ifcProjectionStore } from '@pryzm/core-app-model';
// DOC-2.5d: level datum line injection for elevation views
// DOC-2.5e: grid line injection for elevation views
import { levelDatumLineBuilder, sectionGridLineBuilder } from '@pryzm/plugin-annotations';

// ── DOC-1.8 feature flag ─────────────────────────────────────────────────────
// Read at call-time (not module-load) so it can be toggled in the browser
// console without a page refresh.
// Enable:  window.__PRYZM_FLAGS__ = { EDGE_PROJECTOR_NATIVE: true }
// Disable: window.__PRYZM_FLAGS__ = { EDGE_PROJECTOR_NATIVE: false }
function useEdgeProjectorNative(): boolean {
    return window.__PRYZM_FLAGS__?.EDGE_PROJECTOR_NATIVE === true;
}

/**
 * ViewType categorizes views for grid and camera behavior
 */
export type ViewType = 'perspective' | 'orthographic';

/**
 * ViewState tracks the current view activation state
 */
interface ViewState {
    activeView: OBC.View | null;
    viewMode: ViewMode;
    viewType: ViewType;
    isTransitioning: boolean;
}

/**
 * SceneBoundsOptions for computing scene bounds
 */
interface SceneBoundsOptions {
    excludeGrid?: boolean;
    excludeHelpers?: boolean;
    excludePreviews?: boolean;
    excludeLevelPlanes?: boolean;
}

/**
 * ViewController is the SINGLE AUTHORITY for activating and deactivating views.
 * 
 * RESPONSIBILITIES:
 * - Camera projection mode (perspective vs orthographic)
 * - Camera position, target, and framing
 * - Grid visibility and fade state
 * - Clipping plane lifecycle
 * - Control and camera event listener setup and cleanup
 * 
 * UI components should ONLY call this controller for view changes.
 */
export class ViewController implements IViewController {
    private _state: ViewState = {
        activeView: null,
        viewMode: '3D',
        viewType: 'perspective',
        isTransitioning: false
    };

    private _components: OBC.Components;
    private _world: OBC.World;
    private _camera: OBC.OrthoPerspectiveCamera;
    private _grid: any;
    public navManager: ViewNavigationManager;
    private _planViewService: PlanViewService;
    private _sectionViewService: SectionViewService;
    private _orthoPlanLock: OrthoPlanCameraLockController;

    private _activeListeners: Map<string, { target: EventTarget; type: string; handler: EventListener }> = new Map();
    private _clipperPlane: any = null;
    private _savedMaterials: Map<string, THREE.Material | THREE.Material[]> = new Map();
    private _savedMeshes: Map<string, THREE.Mesh> = new Map();
    private _transitionStartTime: number | null = null;
    private _selectionManager: { unselectAll: () => void } | null = null;
    /** View-switch trace: performance.now() at the moment activate() was called. */
    private _switchT0: number = 0;
    /** V001: ViewDefinition id queued by the caller before activate() is invoked. */
    private _activeDefinitionId: string | null = null;
    /**
     * §ANN-VIEW-PERSIST: Persistent record of the most-recently-activated
     * ViewDefinition id. Unlike _activeDefinitionId (which is cleared in the
     * finally block), this field survives activate() returning so that late-
     * initialised subsystems (AnnotationManager, initTools sync) can read it
     * without missing the initial view-selected event.
     */
    private _currentViewDefinitionId: string | null = null;

    /**
     * Phase 1 Performance: optional bounds cache injected by initScene after
     * the world + grid are available. When set, computeSceneBounds() and all
     * camera-framing helpers read from this cache rather than traversing the
     * scene on every call. See SceneBoundsCache for invalidation contract.
     */
    private _boundsCache: SceneBoundsCache | null = null;

    /**
     * Phase 2 Performance: typed view-switch coordination protocol.
     * Replaces window.renderPipelineManager globals.
     */
    private _viewSwitchListeners: Set<IViewSwitchListener> = new Set();

    /**
     * Phase 2 Performance: per-view camera state persistence (Task 2.3).
     * Saves/restores camera position+target per view so re-entry does not
     * recompute from scene bounds.
     */
    private _cameraStateStore: ViewCameraStateStore = new ViewCameraStateStore();

    /**
     * Phase 2 Performance: level-based element visibility culling (Task 2.2).
     * Hides elements not on the active plan view's level.
     */
    private _visibilityCuller: PlanViewVisibilityCuller = new PlanViewVisibilityCuller();

    /**
     * Phase 2 Performance: dual rAF loop synchronization (Task 2.4).
     * Injected by initScene via setFrameCoordinator().
     */
    private _frameCoordinator: FrameCoordinator | null = null;

    /**
     * Phase 4 Performance: per-slot camera state manager (Task 4.1).
     * Maintains three camera-state slots (perspective / plan / section) so
     * view switches are pointer-swaps rather than scene-bounds recompuations.
     * Injected by initScene via setMultiViewCameraManager().
     */
    private _multiViewCameraManager: MultiViewCameraManager = new MultiViewCameraManager();

    /**
     * Phase 4 Performance: unified rAF loop coordinator (Task 4.3).
     * Injected by initScene via setUnifiedFrameLoop(). When set,
     * beginViewSwitch() / endViewSwitch() are called on the loop in addition
     * to the legacy FrameCoordinator so PASCAL passes are deferred via a
     * single canonical mechanism.
     */
    private _unifiedFrameLoop: UnifiedFrameLoop | null = null;

    /**
     * Phase 5 Performance: pre-computed renderer-level clip planes per level.
     * Replaces OBC Clipper + localClippingEnabled with a renderer.clippingPlanes
     * pointer-swap, eliminating per-material shader recompilation (the 15-second
     * freeze on 20-level curtain wall models).
     * Injected by initScene via setLevelClipPlaneCache().
     */
    private _levelClipPlaneCache: LevelClipPlaneCache | null = null;

    /**
     * DOC-1.7: EdgeProjectorService for IFC model projection.
     * Injected by initScene via setEdgeProjectorService() after bimManager is ready.
     * When set, all plan/section/elevation view activations trigger a background
     * EdgeProjector projection and store the result in ViewTechnicalDrawingCache.
     */
    private _edgeProjectorService: EdgeProjectorService | null = null;
    private _planViewManager: PlanViewManager;

    /**
     * DOC-1.5a — The currently mounted TechnicalDrawing group in the scene.
     * Set by _mountDrawing() after EdgeProjectorService.project() resolves.
     * Cleared by _unmountDrawing() on view deactivation or level switch.
     * §01 §5 — never stored in any PRYZM store; THREE object lifecycle owned here.
     */
    private _mountedDrawing: OBC.TechnicalDrawing | null = null;

    constructor(
        components: OBC.Components,
        world: OBC.World,
        camera: OBC.OrthoPerspectiveCamera,
        grid: any,
        navManager: ViewNavigationManager
    ) {
        this._components = components;
        this._world = world;
        this._camera = camera;
        this._grid = grid;
        this.navManager = navManager;
        this._planViewService = new PlanViewService(components, world, grid);
        this._sectionViewService = new SectionViewService(components, world);
        this._orthoPlanLock = new OrthoPlanCameraLockController(this._world);
        this._planViewManager = new PlanViewManager(components, world);

        // Phase 2 Performance: self-register the visibility culler so its
        // onBeforeViewSwitch() restores hidden objects before any scene mutation.
        this._viewSwitchListeners.add(this._visibilityCuller);

        this._initializeDefaultState();
    }

    /**
     * Inject the SelectionManager so ViewController can clear the selection
     * (and detach TransformControls) before any view transition begins.
     * Call this once from EngineBootstrap after both objects are constructed.
     */
    setSelectionManager(sm: { unselectAll: () => void }): void {
        this._selectionManager = sm;
    }

    /**
     * Phase 1 Performance: inject the SceneBoundsCache created in initScene.
     * Must be called once after both the world and grid are available.
     * Subsequent computeSceneBounds() calls delegate to this cache instead
     * of performing a full scene traversal.
     */
    setBoundsCache(cache: SceneBoundsCache): void {
        this._boundsCache = cache;
        this._planViewService.setBoundsCache(cache);
    }

    /**
     * Phase 2 Performance — Task 2.1.
     * Register a listener that will be notified synchronously before and after
     * every view switch. Used by RenderPipelineManager and SelectionManager to
     * coordinate with ViewController without global window references.
     *
     * The PlanViewVisibilityCuller is registered automatically on construction.
     */
    registerViewSwitchListener(listener: IViewSwitchListener): void {
        this._viewSwitchListeners.add(listener);
    }

    // ── IViewController interface — Sprint F-2.3 ──────────────────────────────

    /**
     * IViewController: current camera projection type.
     * Mirrors `_state.viewType` which is updated on every view activation.
     */
    get viewType(): ViewType {
        return this._state.viewType;
    }

    /**
     * IViewController: deactivate the currently active plan/section/elevation
     * view and return to the default 3-D perspective viewport.
     * No-op when already in 3-D mode.
     */
    async deactivateCurrentView(): Promise<void> {
        if (this._state.viewMode !== '3D') {
            await this.deactivate();
        }
    }

    /**
     * IViewController: zoom the camera to frame all visible BIM content.
     *
     * ── §FIX-ZOOMTOFIT-NOT-ITERABLE (L-745) ────────────────────────────────────
     * WAS: `await (this._camera as any).fit?.()`.
     *
     * OBC's `OrthoPerspectiveCamera.fit(meshes, offset)` REQUIRES an iterable of
     * meshes. Called with no argument it iterates `undefined` and throws, which is
     * the founder's:
     *
     *   [site-overlay→canvas] §ENTER-CANVAS: zoom-to-fit failed (non-fatal):
     *     TypeError: t is not iterable
     *         at My.fit (vendor-thatopen…)
     *         at V9.zoomToFit (…ViewController)
     *
     * So "Fit All" — the ONE control the founder reached for when the 3D view opened
     * 6,542 km away — could never work on this path. Not a degraded fit: a throw,
     * every time, before touching the camera. That is why "the camera is too far" and
     * "Fit All doesn't work" were one incident: the escape hatch was already broken.
     *
     * NOW: Fit All goes through the SAME framing authority as 3D-view activation
     * (`computeFitPose` + the guarded, BIM-scale bounds), which is the entire point of
     * §CAM-FRAME-INVARIANT — two disagreeing framing policies was the original defect,
     * and delegating one of them to a vendor call with a different contract was how
     * they disagreed. The near/far range is applied with the pose, exactly as the
     * activation path does, so a large scene cannot be fitted past its own far plane.
     *
     * THROWS on failure. A user-facing action that cannot do what it says MUST NOT
     * resolve silently (ADR-0299) — the caller decides how to surface it.
     */
    async zoomToFit(_opts?: { animate?: boolean }): Promise<void> {
        const bounds = this._getFramingBounds();
        if (bounds.isEmpty()) {
            // Neither model NOR site (§CAM-FRAME-SITE-WHEN-NO-MODEL, L-748). Nothing to
            // frame. Not an error, and not a lie either — say so, and do NOT invent a
            // framing for an empty project.
            console.warn(
                '[ViewController] zoomToFit — no BIM geometry and no committed site boundary ' +
                'to frame; camera unchanged.',
            );
            return;
        }

        const controls = (this._camera as any).controls;
        if (!controls?.setLookAt) {
            throw new Error('[ViewController] zoomToFit — camera controls unavailable; cannot frame.');
        }

        const cam = this._camera.three as THREE.PerspectiveCamera;
        const pose = computeFitPose(bounds, {
            fovDeg: cam.isPerspectiveCamera ? cam.fov : 60,
            aspect: cam.isPerspectiveCamera ? cam.aspect : 1,
        });
        if (!pose) {
            throw new Error('[ViewController] zoomToFit — could not compute a fit pose for the scene bounds.');
        }

        // The depth range MUST travel with the pose (see §CAM-FRAME-INVARIANT): an
        // honest fit of a large scene sits outside the default far plane, and without
        // this every fragment is depth-clipped — a "successful" fit onto a white view.
        cam.near = pose.near;
        cam.far  = pose.far;
        cam.updateProjectionMatrix();

        if (typeof controls.maxDistance === 'number' && controls.maxDistance < pose.distance * 1.1) {
            controls.maxDistance = pose.distance * 1.1;
        }

        await controls.setLookAt(
            pose.position.x, pose.position.y, pose.position.z,
            pose.target.x,   pose.target.y,   pose.target.z,
            _opts?.animate === true,
        );

        // ADR-0299 — verify, do not assume. Same predicate, same standard as activation.
        // §CAM-VERIFY-AFTER-FLUSH — `setLookAt` defers the camera write to the controls'
        // next update; read it before that and you verify the OLD pose.
        try { controls.update?.(0); } catch { /* older controls flush on their own */ }
        cam.updateMatrixWorld(true);
        if (!boundsFramedByCamera(cam, bounds)) {
            throw new Error(
                `[ViewController] zoomToFit — fitted to dist=${pose.distance.toFixed(1)}m but the model ` +
                'is still not framed. Reporting failure rather than returning as if it worked.',
            );
        }
    }

    /**
     * IViewController: switch camera to perspective (pinhole) projection.
     * No-op when camera is already in perspective mode.
     */
    setPerspectiveProjection(): void {
        if ((this._camera.three as any).isPerspectiveCamera !== true) {
            this._camera.projection.set('Perspective');
            this._state.viewType = 'perspective';
        }
    }

    /**
     * IViewController: switch camera to orthographic (parallel) projection.
     * No-op when camera is already in orthographic mode.
     */
    setOrthographicProjection(): void {
        if ((this._camera.three as any).isOrthographicCamera !== true) {
            this._camera.projection.set('Orthographic');
            this._state.viewType = 'orthographic';
        }
    }

    /**
     * IViewController: register a view-switch listener and return a disposer.
     * Delegates storage to `_viewSwitchListeners` (same set as
     * `registerViewSwitchListener`). Both `onBeforeViewSwitch()` and
     * `onAfterViewSwitch()` are called synchronously around every transition.
     */
    addViewSwitchListener(listener: IViewSwitchListener): () => void {
        this._viewSwitchListeners.add(listener);
        return () => { this._viewSwitchListeners.delete(listener); };
    }

    // ── End IViewController interface ─────────────────────────────────────────

    /**
     * Phase 2 Performance — Task 2.4.
     * Inject the FrameCoordinator created in initScene. When set,
     * beginViewSwitch() / endViewSwitch() are called around the switch so
     * the PASCAL render loop skips its post-processing passes for the duration.
     */
    setFrameCoordinator(coordinator: FrameCoordinator): void {
        this._frameCoordinator = coordinator;
    }

    /**
     * Phase 3 Performance — Task 3.3.
     * Inject the ViewVisibilityMap created in initScene. The map is
     * forwarded to the PlanViewVisibilityCuller so activateForLevel() can
     * use O(1) pre-computed level-membership lookups.
     * Must be called once after both the scene and the map are ready.
     */
    setViewVisibilityMap(map: ViewVisibilityMap): void {
        this._visibilityCuller.setVisibilityMap(map);
    }

    /**
     * Phase 4 Performance — Task 4.3.
     * Inject the UnifiedFrameLoop created in initScene. When set,
     * beginViewSwitch() / endViewSwitch() are called on the loop so its
     * single rAF tick can skip the PASCAL post-processing pass during scene
     * mutation. The legacy FrameCoordinator remains active as fallback.
     */
    setUnifiedFrameLoop(loop: UnifiedFrameLoop): void {
        this._unifiedFrameLoop = loop;
        this._planViewManager.setUnifiedFrameLoop(loop);
    }

    /**
     * Phase 5 Performance — LevelClipPlaneCache injection.
     * Replaces OBC Clipper + localClippingEnabled with renderer-level clip planes.
     * Must be called once from initScene after the renderer and levels are ready.
     * When set, setupFloorPlanClipping() and _clearClipping() delegate to this
     * cache instead of creating/destroying OBC Clipper objects.
     */
    setLevelClipPlaneCache(cache: LevelClipPlaneCache): void {
        this._levelClipPlaneCache = cache;
    }

    /**
     * DOC-1.7: EdgeProjectorService injection.
     * Call once from initScene after bimManager and world are fully initialised.
     * When set, plan/section/elevation view activations fire EdgeProjector projections
     * for loaded IFC models and cache results in ViewTechnicalDrawingCache.
     */
    setEdgeProjectorService(service: EdgeProjectorService): void {
        this._edgeProjectorService = service;
        this._planViewManager.setEdgeProjectorService(service);
        // DOC-1.9: forward to SectionViewService so the SectionTool path also
        // triggers projection (not just the ViewController._activateSectionView path).
        this._sectionViewService.setEdgeProjectorService(service);
    }

    /**
     * DOC-1.4 re-projection path — called by the ViewDependencyTracker flush callback
     * (wired in initScene) after a background re-projection completes.
     *
     * Mounts the freshly projected TechnicalDrawing into the scene ONLY if the
     * view that was re-projected (`viewId`) is still the active view — i.e. the
     * user hasn't switched away while the WebWorker was running.
     *
     * Also re-applies VG category styles so color / visibility overrides survive
     * the projection refresh.
     *
     * @param viewId  The ViewDefinition id that was re-projected.
     * @param drawing The newly completed TechnicalDrawing.
     */
    mountReprojectedDrawing(viewId: string, drawing: OBC.TechnicalDrawing): void {
        if (!this._canMountDrawingForView(viewId)) return;
        this._mountDrawing(drawing);
    }

    /**
     * §FIX-LAZY-INACTIVE-VIEW-PROJECTION (L-117) — public predicate consumed by
     * ViewDependencyTracker to decide whether a 2D documentation view is CURRENTLY
     * VISIBLE in the MAIN viewport (and therefore must reproject eagerly). Mirrors
     * exactly the mount gate: a view is "active" iff a freshly-projected drawing for
     * it would actually be mounted right now (not while the main viewport is in 3D,
     * and — for Canvas2D views — only while the PlanViewManager is active). The
     * split-view Canvas2D pane is a separate surface and is handled by the tracker
     * via `window.splitViewManager`.
     */
    isDrawingViewActive(viewId: string): boolean {
        return this._canMountDrawingForView(viewId);
    }

    private _canMountDrawingForView(viewId: string): boolean {
        if (this._state.viewMode === '3D') return false;

        const viewDef = viewId ? viewDefinitionStore.get(viewId) : undefined;
        const isCanvas2DView =
            viewDef?.viewType === 'plan' ||
            viewDef?.viewType === 'ceiling-plan' ||
            viewDef?.viewType === 'structural-plan' ||
            viewDef?.viewType === 'elevation' ||
            viewDef?.viewType === 'section';
        if (isCanvas2DView && !this._planViewManager.isActive) {
            return false;
        }

        if (this._state.isTransitioning) return this._activeDefinitionId === viewId;
        return this._currentViewDefinitionId === viewId;
    }

    private _disposeRejectedDrawing(drawing: OBC.TechnicalDrawing): void {
        try {
            drawing.onDisposed.trigger();
        } catch {
        }
    }

    /**
     * Phase 4 Performance — Task 4.1.
     * Returns the MultiViewCameraManager so initScene can seed default slot
     * states and diagnostics tooling can inspect slot contents.
     */
    get multiViewCameraManager(): MultiViewCameraManager {
        return this._multiViewCameraManager;
    }

    /**
     * Phase 2 Performance — Task 2.3 / Phase 4 — Task 4.1.
     * Clear all saved per-view camera states. Call on project load so the
     * new project starts with fresh default framing rather than stale state
     * from the previous session.
     *
     * Also clears MultiViewCameraManager slots (Phase 4.1) so stale slot
     * states from the previous project are not applied to the new project's
     * geometry.
     */
    clearCameraStateStore(): void {
        console.log('[ViewController] clearCameraStateStore — per-view camera state cleared for new project');
        this._cameraStateStore.clear();
        this._multiViewCameraManager.clearAll();
    }

    seedPerspectiveCameraFromSceneBounds(): boolean {
        const target = this._computeCameraTarget();
        const distance = this._computeCameraDistance();
        const position = target.clone().add(new THREE.Vector3(distance * 0.6, distance * 0.4, distance * 0.6));
        this._multiViewCameraManager.seedPerspectiveSlot(position, target);
        return true;
    }

    /**
     * V001: Called by ViewsRailPanel._onActivateView() before invoking onViewSelect so
     * that the real ViewDefinition id is available inside activate() for view-selected
     * dispatch (V001) and sectionPlane resolution (V002).
     */
    setActiveViewDefinitionId(id: string): void {
        this._activeDefinitionId = id;
    }

    /** Public read-only access so AnnotationManager can sync on late init. */
    get activeDefinitionId(): string | null {
        return this._activeDefinitionId;
    }

    /**
     * Request a background TechnicalDrawing projection for `viewId` without
     * activating the view (no camera switch, no scene mutation).
     *
     * Called by SheetProjectionOrchestrator when a sheet is opened so that
     * elevation/section thumbnails can be populated without the user having to
     * manually open every view first.
     *
     * If the view already has a cached drawing, the call is a no-op.
     * On completion, 'svp:drawing-refreshed' is dispatched on window so the
     * sheet editor can re-render the affected thumbnail.
     *
     * @param viewId  ViewDefinition.id to project.
     */
    requestBackgroundProjection(viewId: string): void {
        if (!this._edgeProjectorService) return;

        const viewDef = viewDefinitionStore.get(viewId);
        if (!viewDef) return;

        // Skip if already cached
        if (viewTechnicalDrawingCache.has(viewId)) return;

        const fragmentsMgr = this._components.get(OBC.FragmentsManager);
        const allModels = fragmentsMgr.list.size > 0 ? Array.from(fragmentsMgr.list.values()) : [];
        const models = ifcProjectionStore.filterModels(allModels, viewId);

        const nativeGroups = useEdgeProjectorNative()
            ? nativeElementMeshExporter.exportForView(viewDef)
            : [];

        if (models.length === 0 && nativeGroups.length === 0) return;

        const projectionGen = viewTechnicalDrawingCache.beginProjection(viewId);
        this._edgeProjectorService.project(viewDef, models, nativeGroups).then(drawing => {
            const accepted = viewTechnicalDrawingCache.setIfCurrent(viewId, projectionGen, drawing);
            if (!accepted) {
                try { drawing.onDisposed.trigger(); } catch { /* */ }
                // §G1-T3 — disposeProxies: true disposes non-shared proxy geometries.
                nativeElementMeshExporter.releaseGroups(nativeGroups, { disposeProxies: true });
                return;
            }
            // Inject VG overrides if applicable
            const vgApplicator = window.vgSceneApplicator;
            if (vgApplicator && typeof vgApplicator.applyToProjectionLayers === 'function') {
                vgApplicator.applyToProjectionLayers(drawing, viewId);
            }
            // Inject datum lines for elevation views
            if (viewDef.viewType === 'elevation') {
                levelDatumLineBuilder.inject(drawing, viewDef);
                sectionGridLineBuilder.inject(drawing, viewDef);
            }
            // Notify listeners (e.g. SheetEditorPanel) that the drawing is ready
            window.runtime?.events?.emit('svp:drawing-refreshed', { viewId }); // F.events.10
            console.log(`[ViewController] Background projection complete for viewId=${viewId} (${viewDef.viewType})`);
        }).catch(err => {
            nativeElementMeshExporter.releaseGroups(nativeGroups, { disposeProxies: true });
            console.error(`[ViewController] Background projection failed for viewId=${viewId}:`, err);
        });
    }

    /**
     * §ANN-VIEW-PERSIST: Persistent read of the most-recently-activated
     * ViewDefinition id. Always valid after the first successful activate() call,
     * unlike activeDefinitionId which is cleared in the finally block.
     */
    get currentViewDefinitionId(): string | null {
        return this._currentViewDefinitionId;
    }

    get planViewService(): PlanViewService {
        return this._planViewService;
    }

    get sectionViewService(): SectionViewService {
        return this._sectionViewService;
    }

    /**
     * View-Switch Trace helper.
     * Emits a console.log prefixed with [VST][+Xms] where X is ms elapsed
     * since the current activate() call began.  Zero-cost outside of a switch
     * (just a console.log, removed at build time in production by tree-shaking
     * of the dead branch if _switchT0 === 0).
     */
    private _vst(label: string): void {
        const elapsed = this._switchT0 > 0 ? (performance.now() - this._switchT0).toFixed(1) : '??';
        console.log(`[VST][+${elapsed}ms] ${label}`);
    }

    /**
     * Initialize the controller with default 3D view state
     */
    private _initializeDefaultState(): void {
        this._applyGridState('perspective');
    }

    /**
     * Get the current view state
     */
    get state(): Readonly<ViewState> {
        return { ...this._state };
    }

    /**
     * Get the current view mode
     */
    get currentMode(): ViewMode {
        return this._state.viewMode;
    }

    /**
     * Alias for currentMode — exposed so external guards (e.g. ViewsRailPanel RC-A)
     * can read the view mode without breaking if the getter is renamed later.
     */
    get viewMode(): ViewMode {
        return this._state.viewMode;
    }

    /**
     * GRID VISIBILITY STATE MACHINE
     * 
     * 3D Views:
     * - grid.visible = true
     * - grid.fade = true
     * - Grid is never clipped
     * 
     * Orthographic Views (Floor plans, elevations, sections):
     * - grid.visible = true
     * - grid.fade = false
     * - Grid is never clipped
     */
    private _applyGridState(viewType: ViewType): void {
        if (!this._grid || !this._grid.three) {
            console.warn('[ViewController] Grid not available');
            return;
        }

        this._grid.three.visible = true;

        if (viewType === 'perspective') {
            this._grid.fade = true;
        } else {
            this._grid.fade = false;
        }

        const gridObject = this._grid.three;
        if (gridObject) {
            gridObject.traverse((obj: THREE.Object3D) => {
                if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
                    const material = obj.material as THREE.Material;
                    if (material) {
                        material.clippingPlanes = [];
                    }
                }
            });
        }
    }

    /**
     * SCENE BOUNDS HELPER
     * Returns the scene bounding box for all BIM geometry, excluding helpers,
     * previews, level planes, and the OBC grid.
     *
     * Phase 1 Performance: delegates to SceneBoundsCache when injected via
     * setBoundsCache(). A single scene traversal is shared across all callers
     * within one view-switch cycle. Falls back to a direct scene traversal only
     * when no cache is available (before initScene wires it up).
     */
    computeSceneBounds(_options: SceneBoundsOptions = {}): THREE.Box3 {
        if (this._boundsCache) {
            return this._boundsCache.getBounds();
        }

        // Fallback (pre-cache) — direct traversal, matches pre-Phase1 behaviour.
        const box = new THREE.Box3();
        const scene = this._world.scene?.three;
        if (!scene) return box;

        const gridRoot = this._grid?.three ?? null;
        scene.traverse((obj: THREE.Object3D) => {
            if (!obj.visible) return;
            if (SceneObjectClassifier.shouldExcludeFromBounds(obj, gridRoot)) return;
            if (obj instanceof THREE.Mesh && obj.geometry) {
                const objBox = new THREE.Box3().setFromObject(obj);
                if (!objBox.isEmpty()) box.union(objBox);
            }
        });
        return box;
    }

    /**
     * Returns the scene bounding box used for camera framing, reading from the
     * bounds cache once and reusing the result for both target and distance
     * calculations. Avoids the previous pattern where each helper method called
     * getFragmentBounds() + computeSceneBounds() independently (2–4 traversals).
     */
    private _getSceneBoundsForCamera(): THREE.Box3 {
        const bounds = this.computeSceneBounds();

        // ── §CAM-BIM-SCALE-BOUNDS (L-744) ──────────────────────────────────────
        // Reject ECEF / globe-scale bounds before ANY framing decision reads them.
        //
        // FOUNDER EVIDENCE (2026-08-07, brand-new project, walls at the origin):
        //   _activate3DView — controls.setLookAt() START (target=0.0,0.0,0.0, dist=6542305.9)
        // 6,542 km — the Earth's radius — to look at a 5 m wall.
        //
        // The chain: the Cesium/3D-site view leaves the SHARED OBC camera at ECEF
        // scale → L-378 correctly REFUSES to save that pose → the slot is therefore
        // EMPTY → activation falls through to DEFAULT FRAMING → default framing
        // derives its distance from these bounds → and nothing guarded the bounds.
        // *L-378 guards the stored value; this guards the computed one.* Fixing only
        // one of them means the fallback re-creates exactly what the guard rejected.
        //
        // This is the single choke point: `_computeCameraTarget()`,
        // `_computeCameraDistance()` and `_ensureGeometryFramed()` all read bounds
        // through here, so one guard covers every framing decision.
        //
        // Returning EMPTY (not a clamped box) is deliberate. Every caller already has
        // a correct empty-bounds path — target (0,0,0), distance 50 m, and "do not
        // frame" — which are BIM-scale answers. Inventing a clamped box would make up
        // a model extent we do not have, which is the dishonesty `computeFitPose`
        // exists to avoid ("callers narrow the BOUNDS, never the pose").
        if (isGlobeScaleBounds(bounds)) {
            this._reportGlobeScaleBounds(bounds);
            return new THREE.Box3();
        }
        return bounds;
    }

    /**
     * §CAM-FRAME-SITE-WHEN-NO-MODEL (L-748) — the framing precedence:
     * **MODEL → SITE → constant**, never model → constant.
     *
     * FOUNDER: *"THE 3D VIEW STILL IS NOT DOING THE CORRECT ZOOM AT START UP. I NEED TO
     * CLICK HOME — THEN I HAVE THE 3D BOUNDARY CORRECT."*
     *
     * On a fresh project with a committed parcel but no walls, every guard was correct and
     * the user still got the wrong camera: both caches MISS, scene bounds are REJECTED
     * (L-744), `zoomToFit` REFUSES — so framing fell to a hard-coded 50 m about the ORIGIN,
     * while the parcel sits ~13 m away. Correct components, wrong composition: the
     * precedence simply had no SITE rung.
     *
     * ⚠ Home is NOT the authority this borrows from. `captureDefaultView()` only snapshots
     * the live camera ~1.2 s after project load; it knows nothing about the site and framed
     * correctly here only because some earlier flow happened to leave a good pose behind —
     * the same sampling race that let it capture an ECEF pose in another session (L-746).
     * Home working is a symptom that a correct framing EXISTED at some point, not evidence
     * of where to get one.
     *
     * The site ring is read from the C19 `SiteModelStore`, already in scene-XZ metres — the
     * same frame as walls (`Parcel.boundary.polygon`, C12 LTP-ENU). It is deliberately NOT
     * folded into `computeSceneBounds()`: "what the model occupies" and "where the site is"
     * are different questions, and merging them would silently widen every other consumer
     * of model bounds (fit-to-selection, level framing, export scoping).
     *
     * Returns EMPTY when there is neither model nor site. An empty scene must NOT be framed
     * as though it were authored — the constant is the honest answer there.
     */
    private _getFramingBounds(): THREE.Box3 {
        const model = this._getSceneBoundsForCamera();
        if (!model.isEmpty()) return model;

        // P4: `window.runtime` is the typed PryzmRuntime handle already used throughout this
        // file (`window.runtime?.events?.emit`), not a `(window as any)` escape hatch.
        const ring = window.runtime?.siteModelStore?.getParcelBoundary()?.polygon;
        const site = boundsFromSiteRing(ring);
        if (!site) return model;   // empty — no model, no site: caller uses its constant.

        const size = site.getSize(new THREE.Vector3());
        const centre = site.getCenter(new THREE.Vector3());
        console.log(
            '[ViewController] §CAM-FRAME-SITE-WHEN-NO-MODEL (L-748) — no BIM geometry yet; ' +
            `framing the committed site boundary instead of the origin constant ` +
            `(${ring!.length} vertices, ${size.x.toFixed(1)}×${size.z.toFixed(1)}m, ` +
            `centre ${centre.x.toFixed(1)},${centre.z.toFixed(1)}).`,
        );
        return site;
    }

    /**
     * §CAM-ECEF-HANDBACK (L-746) — restore a BIM-space camera at the globe→BIM handback,
     * BEFORE any consumer samples it.
     *
     * ## Why this exists, and why guarding each consumer was not enough
     *
     * The Cesium / 3D-site view drives the SHARED OBC THREE camera to ECEF coordinates.
     * When it hands back, nothing puts the camera back into BIM space — L-378 guards the
     * SAVE, and only the save. Everything that samples the live camera afterwards
     * inherits the contamination. Three consumers found so far, each discovered
     * separately and each looking like its own bug:
     *
     *   1. `MultiViewCameraManager.saveSlot()` — refuses the pose (L-378 works), which
     *      leaves the slot EMPTY and sends activation to default framing.
     *   2. `HomeView.captureDefaultView()` — snapshots the live camera 1.2 s after project
     *      load and stores it as the "Home" viewpoint. Observed capturing
     *      `x: -4073337.57`. Home is NOT an independent authority; it is downstream of the
     *      same polluted camera, and it looked sane in one session purely by sampling
     *      timing.
     *   3. `EngineBootstrap` level switch — `target.Y: -2297615.50 → 3.00`. The camera
     *      TARGET was 2,297 km out and only a level switch happened to reset it.
     *
     * The third was found by accident, which is the strongest argument that there are
     * more. Guarding consumers one at a time is an unbounded task with no completion
     * test; sealing the SOURCE bounds it. This is the barrier — belt — and the per-read
     * guards (`isGlobeScaleBounds` on scene bounds, L-378 on save/restore, the HomeView
     * capture guard) are braces, kept because a barrier that is ever bypassed must not be
     * silent.
     *
     * Deliberately a NEUTRAL BIM pose, not a fitted one: this runs before layers,
     * clipping and visibility are restored, so scene bounds are not yet trustworthy.
     * `_ensureGeometryFramed()` — which runs later, with a verified outcome — is what
     * actually frames the model. All this has to guarantee is that no consumer can ever
     * read an ECEF value.
     */
    private _sanitizeLiveCameraIfGlobeScale(): void {
        const controls = (this._camera as any)?.controls;
        if (!controls?.getPosition || !controls?.setLookAt) return;
        try {
            // ── §CAM-NEAR-NEVER-CUTS (L-747) — the DEPTH RANGE is separate state ──
            // A contaminated near/far outlives the pose that produced it. Both paths
            // that apply a fit (`_ensureGeometryFramed`, `zoomToFit`) return EARLY when
            // the bounds are empty or the model is already framed — without touching
            // near/far — so once `near` has been set to 14 m it stays there for the rest
            // of the session and every wall the user approaches keeps getting sliced.
            //
            // L-744 stopped the contamination reaching `computeFitPose`, which prevents
            // NEW occurrences; it cannot repair a camera that is already poisoned. This
            // does, and it is checked INDEPENDENTLY of the position — a camera can sit at
            // a perfectly sane BIM position behind a 14 m near plane.
            this._repairCameraDepthRange();

            const pos = new THREE.Vector3();
            const tgt = new THREE.Vector3();
            controls.getPosition(pos);
            controls.getTarget(tgt);

            const posBad = isGlobeScalePosition(pos.x, pos.y, pos.z);
            const tgtBad = isGlobeScalePosition(tgt.x, tgt.y, tgt.z);
            if (!posBad && !tgtBad) return;

            console.error(
                '[ViewController] §CAM-ECEF-HANDBACK (L-746) — the shared camera returned from the ' +
                `globe still in ECEF space (position=${pos.toArray().map(v => v.toFixed(0)).join(',')}, ` +
                `target=${tgt.toArray().map(v => v.toFixed(0)).join(',')}). Resetting to a neutral BIM ` +
                'pose BEFORE anything samples it — otherwise every consumer of the live camera ' +
                '(camera slots, the Home viewpoint, level switching, default framing) inherits it.',
            );

            // Neutral BIM pose. Matches the historical 3D default look angle/distance, so a
            // scene that fails to frame later still lands somewhere a user recognises.
            controls.setLookAt(
                CAMERA_HANDBACK_SAFE_DISTANCE_M, CAMERA_HANDBACK_SAFE_DISTANCE_M * 0.65, CAMERA_HANDBACK_SAFE_DISTANCE_M,
                0, 0, 0,
                false,
            );
            const cam = this._camera.three as THREE.PerspectiveCamera;
            if (cam.isPerspectiveCamera) {
                // An ECEF camera also carries an ECEF depth range; a BIM pose behind a
                // 14,000 km far plane has no usable depth precision.
                cam.near = MAX_BIM_NEAR_M;
                cam.far  = CAMERA_BIM_BASELINE_FAR_M;
                cam.updateProjectionMatrix();
            }
        } catch (err) {
            console.warn('[ViewController] §CAM-ECEF-HANDBACK sanitize failed (non-blocking):', err);
        }
    }

    /**
     * §CAM-NEAR-NEVER-CUTS (L-747) — repair a near plane that is clipping the model.
     *
     * The founder: *"BEFORE I could get close to elements and they would NEVER sectionate.
     * NOW it creates a camera section … as I get closer to the element it gets sectioned."*
     * Not a section feature — `CutFill` was off (and sets `clippingPlanes = []` when off).
     * It is the near plane, and their activation log printed it: `near=14.02 far=14022863`.
     *
     * Called on every 3D activation, independently of the camera position, because the
     * depth range is state that survives the pose that created it.
     */
    private _repairCameraDepthRange(): void {
        const cam = this._camera.three as THREE.PerspectiveCamera;
        if (!cam?.isPerspectiveCamera) return;
        if (Number.isFinite(cam.near) && cam.near <= MAX_BIM_NEAR_M) return;

        const wasNear = cam.near;
        cam.near = MAX_BIM_NEAR_M;
        // A near plane this large only ever comes from a globe-scale `far`; bring the far
        // plane back to the BIM baseline too, or the near/far ratio stays pathological.
        if (!Number.isFinite(cam.far) || cam.far > CAMERA_BIM_BASELINE_FAR_M) {
            cam.far = CAMERA_BIM_BASELINE_FAR_M;
        }
        cam.updateProjectionMatrix();
        console.error(
            `[ViewController] §CAM-NEAR-NEVER-CUTS (L-747) — the camera near plane was ${wasNear}m, ` +
            `so every surface within ${wasNear}m of the viewpoint was being CLIPPED (the founder's ` +
            `"camera section"). Repaired to near=${MAX_BIM_NEAR_M} far=${cam.far}. This is a stale ` +
            'depth range left by globe-scale scene bounds (L-744); the source is guarded, this ' +
            'repairs a camera that was already poisoned.',
        );
    }

    /**
     * §CAM-BIM-SCALE-BOUNDS (L-744) — name the object that dragged the scene bounds to
     * globe scale, once per activation, so this is diagnosable instead of merely survivable.
     *
     * Rejecting the bounds keeps the camera sane, but something globe-scale is still IN
     * the BIM scene and passing `SceneObjectClassifier.shouldExcludeFromBounds` — that is
     * a real defect in whatever added it, and silently working around it forever is how
     * the next person inherits an unexplained 6,542 km. This runs ONLY on the reject
     * path, so it costs nothing in the normal case.
     */
    private _reportGlobeScaleBounds(bounds: THREE.Box3): void {
        const size = bounds.getSize(new THREE.Vector3());

        // §CAM-BIM-SCALE-BOUNDS probe, revision 2. Revision 1 printed
        //   `Largest contributor: X (elementType=∅, id=∅)`
        // which established that a non-BIM object exists and NOTHING about what it is:
        // `X` is a minified constructor name and both userData fields are empty, which is
        // exactly what a non-element object looks like. A probe that cannot identify its
        // subject has not done its job (ADR-0301 — report what you actually know).
        //
        // What identifies an anonymous THREE object is its TYPE and its ANCESTRY: a
        // `Points` under a node named `cesium-*` is a different bug from a `Mesh` under
        // `scene → helpers`. So we print constructor + `.type` + `.name`, the parent chain
        // up to the scene root, geometry vertex count, and the world-space box — and we
        // report the top THREE offenders, because "half the extent" (1,575 km of 3,152 km)
        // means there is more than one.
        interface Offender {
            extent: number; label: string; box: THREE.Box3; verts: number;
        }
        const offenders: Offender[] = [];

        const ancestry = (obj: THREE.Object3D): string => {
            const chain: string[] = [];
            for (let n: THREE.Object3D | null = obj.parent, hops = 0; n && hops < 8; n = n.parent, hops++) {
                chain.push(n.name || (n as { type?: string }).type || '?');
            }
            return chain.length ? chain.join(' ← ') : '(no parent — detached)';
        };

        try {
            const scene = this._world.scene?.three;
            const gridRoot = this._grid?.three ?? null;
            scene?.traverse((obj: THREE.Object3D) => {
                if (!obj.visible) return;
                if (SceneObjectClassifier.shouldExcludeFromBounds(obj, gridRoot)) return;
                // Revision 1 only looked at Mesh. Points / LineSegments / Sprite carry
                // geometry too, and a globe-scale point cloud would have been invisible to
                // the old probe — a blind spot that could have cost another whole session.
                const geo = (obj as Partial<THREE.Mesh>).geometry as THREE.BufferGeometry | undefined;
                if (!geo) return;

                const box = new THREE.Box3().setFromObject(obj);
                if (box.isEmpty()) return;
                const s = box.getSize(new THREE.Vector3());
                const extent = Math.max(
                    Math.abs(box.min.x), Math.abs(box.min.y), Math.abs(box.min.z),
                    Math.abs(box.max.x), Math.abs(box.max.y), Math.abs(box.max.z),
                    s.x, s.y, s.z,
                );
                if (extent <= 1000) return;   // only report things that could matter

                offenders.push({
                    extent,
                    verts: geo.getAttribute?.('position')?.count ?? -1,
                    box,
                    label:
                        `ctor=${obj.constructor?.name ?? '?'} type=${obj.type} name="${obj.name || '∅'}" ` +
                        `elementType=${String(obj.userData?.elementType ?? '∅')} ` +
                        `id=${String(obj.userData?.id ?? '∅')} ` +
                        `userDataKeys=[${Object.keys(obj.userData ?? {}).join(',') || '∅'}] ` +
                        `ancestry: ${ancestry(obj)}`,
                });
            });
        } catch { /* diagnosis must never break framing */ }

        offenders.sort((a, b) => b.extent - a.extent);
        const top = offenders.slice(0, 3).map((o, i) =>
            `  #${i + 1} extent=${o.extent.toFixed(0)}m verts=${o.verts} ` +
            `box=[${o.box.min.toArray().map(v => v.toFixed(0)).join(',')} → ` +
            `${o.box.max.toArray().map(v => v.toFixed(0)).join(',')}]\n     ${o.label}`,
        ).join('\n');

        console.error(
            '[ViewController] §CAM-BIM-SCALE-BOUNDS (L-744) — scene bounds are globe/ECEF-scale ' +
            `(extent ${Math.max(size.x, size.y, size.z).toFixed(0)}m); REJECTING them for camera framing.\n` +
            'The camera is safe, but this is NOT fixed: a globe-scale object is in the BIM scene and is ' +
            `passing shouldExcludeFromBounds — it is still in the render set and every traversal.\n` +
            `${offenders.length} object(s) over 1 km. Top contributors:\n${top || '  (none identified)'}`,
        );
    }

    /**
     * Get a valid camera target based on scene geometry or grid center.
     * Reads from the shared bounds cache — no extra traversal.
     */
    private _computeCameraTarget(): THREE.Vector3 {
        const bounds = this._getFramingBounds();
        const target = new THREE.Vector3();
        if (!bounds.isEmpty()) {
            bounds.getCenter(target);
        }
        return target;
    }

    /**
     * Compute camera distance based on scene bounds.
     * Reads from the shared bounds cache — no extra traversal.
     */
    private _computeCameraDistance(): number {
        const bounds = this._getFramingBounds();
        if (bounds.isEmpty()) return 50;
        const size = bounds.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 10);
        return maxDim * 2;
    }

    /**
     * §CAM-FRAME-INVARIANT (L-742, 2026-08-07) — supersedes §VIEW-ZOOM (2026-06-08).
     *
     * ## The invariant (C04)
     *   Activating a 3D view MUST leave the model on screen. A remembered camera is kept
     *   ONLY if the scene bounds still INTERSECT its frustum (near/far included);
     *   otherwise the view is fitted.
     *
     * ## What the old §VIEW-ZOOM heuristic got wrong
     *
     * It asked "is the camera roughly aimed at the scene centre, at a plausible distance?"
     * — a proxy for "can the user see the model" that is wrong in both directions — and
     * then fitted at `maxDim * 2` metres WITHOUT touching the perspective far plane, which
     * `_activate3DView` hard-wires to 2000 m. On a scene whose bounds exceed roughly a
     * kilometre (an IFC import whose storeys land at ±800 m / 6 km, a site or context mesh,
     * one stray far-away element) that fit places the camera BEYOND its own far plane and
     * every fragment is depth-clipped: the founder's "the 3D view always comes white".
     * Camera → Fit All then "brought the geometry back" only because `zoomToAll()` clamps
     * its distance to ≤ 80 m and so never leaves the far plane — two disagreeing framing
     * policies, which was the real defect.
     *
     * The replacement asks the question directly (`boundsVisibleToCamera`, a frustum ∩ box
     * test that INCLUDES near/far) and fits through the shared `computeFitPose()` authority,
     * applying the near/far range that pose requires.
     *
     * Intersection — not containment — preserves deliberate framing: a user zoomed into a
     * door detail still intersects the scene bounds and is left exactly where they were.
     *
     * No-op on an empty scene (nothing to frame). Pure read of scene bounds + one setLookAt.
     */
    private async _ensureGeometryFramed(controls: any): Promise<void> {
        const bounds = this._getFramingBounds();
        if (bounds.isEmpty()) return;                       // nothing to frame yet

        const cam = this._camera.three;
        cam.updateMatrixWorld();
        if (boundsFramedByCamera(cam, bounds)) {
            // The model is genuinely on screen AND big enough to be the subject — keep the
            // user's camera untouched (a deliberate zoom-in projects far larger than the
            // viewport and passes trivially).
            return;
        }

        const perspective = cam as THREE.PerspectiveCamera;
        const pose = computeFitPose(bounds, {
            fovDeg: perspective.isPerspectiveCamera ? perspective.fov : 60,
            aspect: perspective.isPerspectiveCamera ? perspective.aspect : 1,
        });
        if (!pose) return;

        // The depth range MUST be applied with the pose. This is the line that stops the
        // white viewport: an honest fit of a large scene sits outside the default 2000 m
        // far plane, and without this every fragment is clipped away.
        cam.near = pose.near;
        cam.far  = pose.far;
        cam.updateProjectionMatrix();

        // camera-controls clamps setLookAt to [minDistance, maxDistance]; a large scene
        // needs the ceiling raised or the "fit" silently lands short and stays off-frame.
        if (typeof controls?.maxDistance === 'number' && controls.maxDistance < pose.distance * 1.1) {
            controls.maxDistance = pose.distance * 1.1;
        }

        await controls.setLookAt(
            pose.position.x, pose.position.y, pose.position.z,
            pose.target.x,   pose.target.y,   pose.target.z,
            false,                                          // snap immediately — no tween
        );

        // ── ADR-0299 — A RECOVERY MUST VERIFY ITS OUTCOME ──────────────────────
        // This block used to log "auto-framed" unconditionally, immediately after
        // setLookAt. The founder's log therefore read:
        //
        //   §CAM-FRAME-INVARIANT auto-framed (restored camera did not see the model);
        //     dist=6515673.6m near=14.02 far=14022863
        //
        // A confident success message reporting a 6,515 km framing of a 5 m wall. The
        // recovery RAN; it did not WORK. Its own predicate — "can the camera see the
        // model?" — was never re-asked afterwards, so the one check that would have
        // caught it was the check it skipped.
        //
        // We now re-run the SAME predicate against the camera we actually produced.
        // `boundsFramedByCamera` includes the apparent-size floor
        // (MIN_FRAMED_SCREEN_FRACTION), so "technically inside the frustum but
        // sub-pixel" — exactly the founder's state — is a FAILURE, not a pass.
        // ⚠ FLUSH THE CONTROLS BEFORE READING THE CAMERA (§CAM-VERIFY-AFTER-FLUSH).
        // `camera-controls.setLookAt(..., false)` does NOT write `camera.position`
        // synchronously — it stores the goal and raises an internal dirty flag; the
        // camera is moved in `controls.update(delta)` on the next frame. Verifying
        // immediately therefore inspected the PRE-FIT camera and reported a failure for a
        // fit that had actually worked — the founder's log shows exactly that false
        // negative ("auto-frame RAN BUT DID NOT WORK … dist=60.7m") for a correct 39×33 m
        // site fit. A verification that reads stale state is worse than none: it cries
        // wolf on the good path and would mask the real failure it exists to catch.
        try { controls.update?.(0); } catch { /* older controls flush on their own */ }
        cam.updateMatrixWorld(true);
        if (!boundsFramedByCamera(cam, bounds)) {
            console.error(
                '[ViewController] §CAM-FRAME-INVARIANT (ADR-0299) — auto-frame RAN BUT DID NOT WORK: ' +
                `the model is still not framed after fitting to dist=${pose.distance.toFixed(1)}m ` +
                `(target=${pose.target.toArray().map(v => v.toFixed(1)).join(',')}, ` +
                `near=${pose.near} far=${pose.far.toFixed(0)}). Reporting the failure instead of ` +
                'claiming success — the view is NOT framed and the user will see nothing usable.',
            );
            // Deliberately NOT seeding the perspective slot: caching a pose we have just
            // proven does not frame the model would replay this failure on every re-entry
            // and make it look like a remembered user preference.
            return;
        }

        this._multiViewCameraManager.seedPerspectiveSlot(pose.position, pose.target);
        this._vst(
            `_activate3DView — §CAM-FRAME-INVARIANT auto-framed and VERIFIED (restored camera did not ` +
            `see the model); dist=${pose.distance.toFixed(1)}m near=${pose.near} far=${pose.far.toFixed(0)}`,
        );
    }

    /**
     * EVENT LISTENER HYGIENE
     * Register a listener that will be cleaned up on deactivate()
     */
    private _registerListener(id: string, target: EventTarget, type: string, handler: EventListener): void {
        if (this._activeListeners.has(id)) {
            const existing = this._activeListeners.get(id)!;
            existing.target.removeEventListener(existing.type, existing.handler);
        }

        target.addEventListener(type, handler);
        this._activeListeners.set(id, { target, type, handler });
    }

    /**
     * Remove a specific registered listener
     */
    unregisterListener(id: string): void {
        const entry = this._activeListeners.get(id);
        if (entry) {
            entry.target.removeEventListener(entry.type, entry.handler);
            this._activeListeners.delete(id);
        }
    }

    /**
     * Remove all registered listeners
     */
    private _cleanupAllListeners(): void {
        for (const [, entry] of this._activeListeners) {
            entry.target.removeEventListener(entry.type, entry.handler);
        }
        this._activeListeners.clear();
    }

    /**
     * CLIPPING PLANE LIFECYCLE
     * Set up clipping plane for floor plan views
     */
    setupFloorPlanClipping(elevation: number, cutHeight: number): void {
        // ── Phase 5 Performance: renderer-level clip plane (no shader recompile) ───
        // LevelClipPlaneCache stores a pre-computed THREE.Plane per level.
        // Switching clip planes is a renderer.clippingPlanes pointer swap (<0.1ms)
        // instead of OBC Clipper.create() + localClippingEnabled=true which forced
        // GPU shader recompilation on every unique material (50-100 × 100-200ms = 15s).
        if (this._levelClipPlaneCache) {
            this._clearClipping();
            // Derive a synthetic levelId from elevation so the cache can look it up.
            // This path is used when the caller provides raw elevation+cutHeight
            // (e.g. GroundFloorPlanController) rather than a typed level object.
            const syntheticId = `_elev_${elevation.toFixed(3)}`;
            this._levelClipPlaneCache.registerLevel(syntheticId, elevation, cutHeight);
            this._levelClipPlaneCache.activate(syntheticId, elevation);
            console.log(`[ViewController] Floor plan clipping via LevelClipPlaneCache at height: ${(elevation + cutHeight).toFixed(2)}m`);
            return;
        }

        // ── Legacy path (fallback when LevelClipPlaneCache not yet injected) ───────
        // Retained for safety; will be removed in Phase 6 once all callers are wired.
        this._clearClipping();

        const clipper = this._components.get(OBC.Clipper);
        if (!clipper) {
            console.warn('[ViewController] Clipper component not available');
            return;
        }

        clipper.enabled = true;
        this._clipperPlane = clipper.create(this._world);

        if (this._clipperPlane?.three) {
            const plane = this._clipperPlane.three as THREE.Mesh;
            plane.position.set(0, elevation + cutHeight, 0);
            plane.rotation.set(Math.PI / 2, 0, 0);
            plane.visible = false;
        }

        const renderer = this._world.renderer;
        if (renderer && renderer.three) {
            renderer.three.localClippingEnabled = true;
        }

        console.warn(`[ViewController] Floor plan clipping via legacy OBC Clipper (inject LevelClipPlaneCache to fix 15s freeze) at height: ${elevation + cutHeight}`);
    }

    /**
     * Clear all clipping planes.
     *
     * Phase 5: delegates to LevelClipPlaneCache.deactivate() when available.
     * Cost: one renderer.clippingPlanes = [] assignment (<0.01ms).
     * Legacy: clipper.deleteAll() + localClippingEnabled=false.
     */
    private _clearClipping(): void {
        if (this._levelClipPlaneCache) {
            this._levelClipPlaneCache.deactivate();
            this._clipperPlane = null;
            return;
        }

        // Legacy path
        const clipper = this._components.get(OBC.Clipper);
        if (clipper) {
            clipper.deleteAll();
            clipper.enabled = false;
        }

        const renderer = this._world.renderer;
        if (renderer && renderer.three) {
            renderer.three.localClippingEnabled = false;
        }

        this._clipperPlane = null;
    }

    /**
     * ACTIVATE VIEW
     * This is the main public API for view activation.
     * All view changes should go through this method.
     */
    async activate(view: OBC.View | ViewMode): Promise<void> {
        if (this._state.isTransitioning) {
            console.warn('[ViewController] View transition already in progress');
            // Recovery guard: if stuck for more than 5 seconds, allow override
            if (this._transitionStartTime && (Date.now() - this._transitionStartTime > 5000)) {
                console.warn('[ViewController] Force resetting transition lock (timeout)');
                this._state.isTransitioning = false;
            } else {
                return;
            }
        }

        this._state.isTransitioning = true;
        this._transitionStartTime = Date.now();
        // Task 5.5 Phase 5: high-resolution timestamp for view switch timing.
        const _viewSwitchT0 = performance.now();
        this._switchT0 = _viewSwitchT0;
        const viewModeStr = typeof view === 'string' ? view : (view as any).id;
        this._vst(`ViewController.activate("${viewModeStr}") ENTRY — activeDefinitionId=${this._activeDefinitionId}`);

        // ── Phase 1 Performance: invalidate bounds cache before each switch ─────
        // Marks the SceneBoundsCache dirty so the next getBounds() call performs
        // a single fresh traversal. This guarantees correctness (the user may
        // have added/removed elements since the last switch) while ensuring that
        // _computeCameraTarget() and _computeCameraDistance() — both called
        // during this same activation — share the same traversal result.
        this._boundsCache?.invalidate();
        this._vst(`SceneBoundsCache invalidated — dirty flag set`);

        // ── PRE-SWITCH: Synchronously clear PASCAL pipeline and TransformControls ──
        // This MUST happen before any scene mutation (deactivate, cleanup, camera).
        // 1. Notify all IViewSwitchListeners (replaces window.renderPipelineManager globals).
        //    RPM.onBeforeViewSwitch() → clears outline arrays + sets _viewSwitchInProgress.
        // 2. Detach TransformControls → no stale object reference in the scene graph.
        // 3. Signal UnifiedFrameLoop (Phase 4) + FrameCoordinator (Phase 2 fallback) →
        //    PASCAL skips post-processing during the switch. UnifiedFrameLoop bridges to
        //    FrameCoordinator internally when set, so both are covered by one call.
        this._vst(`onBeforeViewSwitch — notifying ${this._viewSwitchListeners.size} listeners`);
        for (const listener of this._viewSwitchListeners) {
            listener.onBeforeViewSwitch();
        }
        this._vst(`onBeforeViewSwitch — DONE`);
        this._selectionManager?.unselectAll();
        this._vst(`selectionManager.unselectAll() — TransformControls detached`);
        // Phase 4.3: prefer UnifiedFrameLoop; FrameCoordinator still called as fallback
        // in case RPM queries it directly (some callers cache the FC reference).
        this._unifiedFrameLoop?.beginViewSwitch();
        this._frameCoordinator?.beginViewSwitch();
        this._vst(`UnifiedFrameLoop.beginViewSwitch() — PASCAL post-processing PAUSED`);
        // ──────────────────────────────────────────────────────────────────────────

        try {
            this._vst(`deactivate() — START (departing view: "${this._state.viewMode}")`);
            await this.deactivate();
            this._vst(`deactivate() — COMPLETE`);

            let viewMode: ViewMode;
            let obcView: OBC.View | null = null;

            if (typeof view === 'string') {
                viewMode = view as ViewMode;
                const views = this._components.get(OBC.Views);
                obcView = views?.list.get(view) || null;
            } else {
                obcView = view;
                viewMode = (view as any).id as ViewMode || '3D';
            }

            const routedViewDef = this._activeDefinitionId
                ? viewDefinitionStore.get(this._activeDefinitionId)
                : undefined;

            // Elevation presets (Front/Back/Left/Right) now keep Perspective projection
            // (they snap the camera to a named direction then allow free orbit).
            // ViewDefinition-backed Canvas2D views stay orthographic for event consumers.
            const elevationPresets: ViewMode[] = ['Front', 'Back', 'Left', 'Right'];
            let viewType: ViewType = (viewMode === '3D' || elevationPresets.includes(viewMode as ViewMode))
                ? 'perspective'
                : 'orthographic';
            if (
                routedViewDef &&
                ['plan', 'ceiling-plan', 'structural-plan', 'elevation', 'section'].includes(routedViewDef.viewType)
            ) {
                viewType = 'orthographic';
            }
            this._state.viewMode = viewMode;
            this._state.viewType = viewType;
            this._state.activeView = obcView;

            this._applyGridState(viewType);
            this._vst(`_applyGridState("${viewType}") — grid.fade=${viewType === 'perspective'}`);

            this._vst(`routing to activation handler for viewMode="${viewMode}"`);
            if (viewMode === 'Ground Floor' as any) {
                await this._activateGroundFloorView(obcView);
            } else if (viewMode === 'Ceiling' || viewMode === 'ceiling-plan' || routedViewDef?.viewType === 'ceiling-plan') {
                await this._activateCeilingPlanView(obcView);
            } else if (viewMode === 'Top' || routedViewDef?.viewType === 'structural-plan') {
                // DOC-2.5h: structural-plan views use the same floor-plan activation path as
                // regular plans. VIEW_TYPE_TO_OBC['structural-plan'] = 'Top' so viewMode is
                // already 'Top' in normal flow; the explicit guard handles edge cases where
                // the OBC view mode differs from the ViewDefinition type.
                await this._activateFloorPlanView(obcView);
            } else if (routedViewDef?.viewType === 'elevation' || routedViewDef?.viewType === 'section') {
                // DOC-19B: elevation and section ViewDefinitions created by the plan-view
                // tools use the Canvas2D renderer (PlanViewManager), NOT the WebGPU camera
                // preset path. PlanViewManager._ensureProjection() fires EdgeProjectorService
                // using spatial.projectionDirection (elevation) or spatial.sectionPlane
                // (section) to project the 3D scene from the correct angle.
                // This guard must come BEFORE the generic 'Section' and elevation-preset
                // checks so that plan-tool-created views always land on Canvas2D.
                this._planViewManager.activate(routedViewDef);
            } else if (viewMode === '3D') {
                await this._activate3DView(obcView);
            } else if (viewMode === ('Section' as any)) {
                await this._activateSectionView(obcView);
            } else {
                await this._activateElevationView(viewMode, obcView);
            }
            this._vst(`activation handler COMPLETE`);

            this._setupViewListeners(viewType);
            this._vst(`_setupViewListeners("${viewType}") — camera-update listener registered`);

            this._forceRendererUpdate();
            this._vst(`_forceRendererUpdate() — renderer.needsUpdate = true`);

            // §VIEW-DIRTY-CHECK §1.4: 'source: view-switch' signals EngineBootstrap
            // to suppress redundant wall-geometry rebuilds triggered by this event.
            // §CAM-SYNC-FIX: include this._camera.three in the detail so handlers
            // receive the live camera reference at dispatch time, not a potentially
            // stale world.camera.three that OBC may not have updated yet when the
            // projection toggle is asynchronously committed by camera-controls.
            this._vst(`dispatching "view-activated" event (mode="${viewMode}", type="${viewType}")`);
            window.runtime?.events?.emit('view-activated', { view: obcView, mode: viewMode, type: viewType, source: 'view-switch', camera: this._camera.three }); // F.events.8

            // §ANN-VIEW-PERSIST: Persist the definition id BEFORE dispatching.
            // When switching back to 3D, clear any stale plan-view definition id so
            // AnnotationManager does not remain bound to the previous plan view.
            if (viewMode === '3D') {
                this._currentViewDefinitionId = null;
            } else if (this._activeDefinitionId) {
                this._currentViewDefinitionId = this._activeDefinitionId;
            }

            // §ANN-VIEW-INFER: When the caller used the legacy OBC path (activate(obcId)
            // directly without calling setActiveViewDefinitionId first), _activeDefinitionId
            // is null and viewMode is a non-3D view. In that case, find any 'plan'
            // ViewDefinition in the store and use it as the persistent id so
            // AnnotationManager can still function.
            // NOTE: this inference is intentionally skipped for 3D view activations.
            if (viewMode !== '3D' && !this._currentViewDefinitionId) {
                // §FEAT-LEVEL-RELATIVE-PLAN-VIEWS (L-720) — prefer the ACTIVE LEVEL's plan
                // view. This inference used `getByType('plan')[0]`, which — while
                // `vd-sys-plan-l0` was the only plan view — silently made the ground floor
                // the answer for every level. With one plan view per level, order in the
                // store is not a level decision, so ask the level.
                const byLevel = findPlanViewForLevel(projectContext.activeLevelId);
                const planViews = viewDefinitionStore.getByType('plan');
                const inferred = byLevel ?? (planViews.length > 0 ? planViews[0] : null);
                if (inferred) {
                    this._currentViewDefinitionId = inferred.id;
                    console.log(
                        '[ViewController] §ANN-VIEW-INFER: inferred plan view →', this._currentViewDefinitionId,
                        `(activeLevelId=${projectContext.activeLevelId}, byLevel=${byLevel ? 'yes' : 'no'})`,
                    );
                }
            }

            // V001 fix: dispatch view-selected. Prefer the caller-supplied id; fall back
            // to the inferred plan view id so AnnotationManager always receives a valid id.
            // For 3D views, dispatchViewId is null, signalling "no plan view active".
            const dispatchViewId = this._activeDefinitionId ?? this._currentViewDefinitionId;
            this._vst(`dispatching "view-selected" event (viewId="${dispatchViewId}")`);
            window.runtime?.events?.emit('view-selected', { viewId: dispatchViewId }); // F.events.8

        } catch (error) {
            console.error('[ViewController] Error activating view:', error);
            // Fallback strategy: if non-3D view fails, try to return to 3D
            if (viewModeStr !== '3D') {
                console.warn('[ViewController] Attempting fallback to 3D view...');
                this._state.isTransitioning = false; // Reset lock for fallback attempt
                await this.activate('3D');
            }
        } finally {
            this._state.isTransitioning = false;
            this._transitionStartTime = null;
            this._activeDefinitionId = null;
            // Re-enable PASCAL outline compositing and end PASCAL frame deferral now that
            // the view is fully stable. Uses typed listeners — no window globals.
            // Phase 4.3: end both UnifiedFrameLoop and legacy FrameCoordinator.
            this._vst(`UnifiedFrameLoop.endViewSwitch() — PASCAL post-processing RE-ENABLED`);
            this._unifiedFrameLoop?.endViewSwitch();
            this._frameCoordinator?.endViewSwitch();
            this._vst(`onAfterViewSwitch — notifying ${this._viewSwitchListeners.size} listeners`);
            for (const listener of this._viewSwitchListeners) {
                listener.onAfterViewSwitch();
            }
            // Task 5.5 Phase 5: log view switch duration and warn on regression.
            const _viewSwitchElapsed = performance.now() - _viewSwitchT0;
            console.log(
                `[ViewController] ✅ View switch to "${viewModeStr}" completed in ${_viewSwitchElapsed.toFixed(1)}ms`
            );
            if (_viewSwitchElapsed > 500) {
                console.warn(
                    `[ViewController] ⚠️  SLOW — View switch to "${viewModeStr}" took ${_viewSwitchElapsed.toFixed(1)}ms ` +
                    `(threshold: 500ms). Bottleneck candidates: camera.projection.set(), ` +
                    `SceneBoundsCache miss or RenderPipelineManager.updateCamera().`
                );
            } else if (_viewSwitchElapsed > 200) {
                console.warn(
                    `[ViewController] ⚠ View switch exceeded 200ms (${_viewSwitchElapsed.toFixed(1)}ms) ` +
                    `— check LevelClipPlaneCache injection.`
                );
            }
            this._switchT0 = 0;
        }
    }

    /**
     * Activate 3D perspective view
     */
    private async _activate3DView(_view: OBC.View | null): Promise<void> {
        this._vst(`_activate3DView() ENTRY`);
        // §CAM-ECEF-HANDBACK (L-746) — the FIRST thing that happens on re-entering a
        // BIM view: put the shared camera back in BIM space before anything reads it.
        this._sanitizeLiveCameraIfGlobeScale();
        // DOC-1.5a: unmount TechnicalDrawing when returning to 3D view — vector overlay removed.
        this._unmountDrawing();
        // DOC-4.7: Clear underlay level halftone when returning to 3D view.
        // Elements that were rendered as ghost underlay revert to their normal VG style.
        {
            const vgApplicator = window.vgSceneApplicator;
            if (vgApplicator && typeof vgApplicator.setUnderlayLevelId === 'function') {
                vgApplicator.setUnderlayLevelId(null);
            }
        }
        // ── Clear any stale plan-mode control lock from navManager ────────────
        this._vst(`_activate3DView — navManager.clearControlLock()`);
        this.navManager.clearControlLock();

        // ── Phase 3: Restore 3D layer visibility ─────────────────────────────
        // RC-B FIX (Option C): Replace camera.layers.enableAll() with explicit
        // per-layer enables. enableAll() would re-expose PLAN_SYMBOL_LAYER for
        // one render frame before the subsequent disable() call — enough for the
        // WebGPU renderer to encounter ghost EdgeProjector line objects whose
        // geometry.attributes have been cleared by previewRegistry.disposeAll(),
        // causing THREE.AttributeNode crashes ("position/lineDistance not found").
        //
        // deactivate() already calls:
        //   camera.layers.enable(BIM_LAYER)       ← main 3D geometry
        //   camera.layers.disable(PLAN_SYMBOL_LAYER) ← plan linework suppressed
        // We only need to re-enable layers disabled during plan view activation.
        this._vst(`_activate3DView — camera.layers explicit restore (BIM+ANNOTATION, PLAN_SYMBOL+DOCUMENTATION stay off)`);
        this._camera.three.layers.enable(BIM_LAYER);           // already on from deactivate; be explicit
        this._camera.three.layers.enable(ANNOTATION_LAYER);    // disabled by _activateFloorPlanView
        // §L-426 (founder live-traced) — EDITOR_LAYER carries the on-screen editor AIDS:
        // the C19 parcel-boundary outline + the C58 buildable-envelope study volume
        // (ParcelBoundarySceneRenderer). The RC-B change above swapped `enableAll()` for
        // explicit per-layer enables to keep PLAN_SYMBOL ghosts off the WebGPU renderer —
        // and DROPPED EDITOR_LAYER in the process, so those aids were never rendered by the
        // 3D camera ("no envelope is seen on pryzm views" even though the envelope card
        // showed a valid area). Enable it explicitly: editor-only aids are on-screen design
        // references; they are excluded from PRINT by the sheet/export path, not by this camera.
        this._camera.three.layers.enable(EDITOR_LAYER);
        this._camera.three.layers.disable(DOCUMENTATION_LAYER);
        // PLAN_SYMBOL_LAYER stays disabled — deactivate() already turned it off.
        // No enableAll() call so ghost plan-symbol objects are NEVER visible to camera.

        // Multi-Camera Single-Pipeline — Phase A.
        // Arm the RPM fast path BEFORE projection.set() fires.
        // notifyProjectionToggle(false) signals that the next updateCamera()
        // call (triggered by the window 'view-activated' event) is a
        // perspective restore — skip _fullRebuild(), swap camera on existing
        // PassNodes, and rebuild only the pipeline graph.
        this._vst(`_activate3DView — rpm.notifyProjectionToggle(false) (fast path armed)`);
        window.renderPipelineManager?.notifyProjectionToggle?.(false);

        if ((this._camera.three as any).isPerspectiveCamera !== true) {
            this._vst(`_activate3DView — camera.projection.set("Perspective") START`);
            this._camera.projection.set('Perspective');
            this._vst(`_activate3DView — camera.projection.set("Perspective") DONE`);
        } else {
            this._vst(`_activate3DView — camera already Perspective; projection.set skipped`);
        }

        // RC5-FIX: Reset near/far on the NEW PerspectiveCamera immediately after the
        // projection switch.
        this._camera.three.near = 0.1;
        this._camera.three.far  = 2000;

        const controls = this._camera.controls;
        controls.mouseButtons.left = 1;  // ROTATE
        (controls.touches as any).one = 1;
        (controls as any).enableRotate = true;

        this._camera.three.up.set(0, 1, 0);
        this._camera.three.updateProjectionMatrix();

        this._vst(`_activate3DView — _clearClipping() (renderer.clippingPlanes = [])`);
        this._clearClipping();
        this._restore3DRendererPresentation();

        // §CAM-FRAME-INVARIANT (L-742) — re-invalidate the bounds cache HERE.
        // activate() invalidates at its entry, which is BEFORE deactivate() runs
        // PlanViewVisibilityCuller.deactivate() and restores the objects a plan /
        // elevation view had hidden. Any consumer that read getBounds() in between
        // (PlanViewService, thumbnail renderer) would have marked the cache clean over
        // the CULLED scene, and the framing check below would then decide "the model is
        // on screen" against a bounding box missing most of the model. One extra
        // traversal per 3D entry is the correct price for a correct frame.
        this._boundsCache?.invalidate();
        this._vst(`_activate3DView — SceneBoundsCache re-invalidated (post-visibility-restore)`);

        // ── Phase 4.1: Fast-path — restore from MultiViewCameraManager slot ──────
        this._vst(`_activate3DView — MultiViewCameraManager.restoreSlot("perspective")`);
        let slotRestored3D = this._multiViewCameraManager.restoreSlot('perspective', this._camera);
        // Sanity-check the restored perspective position: if the camera is closer
        // than 4 m to its target the slot likely contains plan-view coordinates
        // (e.g. after a rapid project-switch that briefly wrote plan coords into the
        // perspective slot before clearAll() ran). Treat this as a MISS so the
        // auto-frame path computes a proper aerial 3D framing.
        if (slotRestored3D) {
            const cam3    = this._camera.three;
            const ctrl    = (this._camera as any).controls;
            const pos3D   = cam3.position;
            const tgt3D   = new THREE.Vector3();
            if (ctrl?.getTarget) {
                ctrl.getTarget(tgt3D);
            } else {
                // fallback: derive from stored slot state
                const snap = this._multiViewCameraManager.getSlotSnapshot('perspective');
                tgt3D.copy(snap.target);
            }
            const camDist = pos3D.distanceTo(tgt3D);
            if (camDist < 4) {
                this._vst(
                    `_activate3DView — perspective slot SANITY-FAIL (cam↔target dist=${camDist.toFixed(2)}m < 4m, likely plan coords); falling back to auto-frame`
                );
                this._multiViewCameraManager.clearSlot('perspective');
                slotRestored3D = false;
            }
        }
        this._vst(`_activate3DView — perspective slot ${slotRestored3D ? 'HIT (instant restore, no traversal)' : 'MISS'}`);

        if (!slotRestored3D) {
            // ── Phase 2: Restore saved camera state or fall back to computed framing
            const restoreKey3D = this._activeDefinitionId ?? '3D';
            const restored3D = this._cameraStateStore.restore(restoreKey3D, this._camera);
            this._vst(`_activate3DView — ViewCameraStateStore.restore("${restoreKey3D}") ${restored3D ? 'HIT' : 'MISS'}`);

            if (!restored3D) {
                this._vst(`_activate3DView — computing default framing: _computeCameraTarget() + _computeCameraDistance()`);
                const target = this._computeCameraTarget();
                const distance = this._computeCameraDistance();

                const offset = new THREE.Vector3(distance * 0.6, distance * 0.4, distance * 0.6);
                const position = target.clone().add(offset);

                this._vst(`_activate3DView — controls.setLookAt() START (target=${target.toArray().map(v=>v.toFixed(1))}, dist=${distance.toFixed(1)})`);
                await controls.setLookAt(
                    position.x, position.y, position.z,
                    target.x, target.y, target.z,
                    false   // snap immediately — no tween
                );
                this._vst(`_activate3DView — controls.setLookAt() DONE`);

                // Seed the perspective slot so subsequent re-entries skip bounds computation.
                this._multiViewCameraManager.seedPerspectiveSlot(position, target);
                this._vst(`_activate3DView — perspective slot seeded for fast re-entry`);
            }
        }

        // §VIEW-ZOOM (2026-06-08) — if the restored camera is stale (house off-screen),
        // auto-frame the geometry so the founder never has to click "Home" on 3D entry.
        // No-op when the geometry is already in view (preserves manual navigation).
        await this._ensureGeometryFramed(controls);

        // Sync camera-controls' internal state with the camera we just placed.
        controls.update(0);

        this._camera.three.updateProjectionMatrix();

        const rpm = window.renderPipelineManager;
        if (rpm?.needsSsgiFullRebuild?.()) {
            this._vst(`_activate3DView — rpm.scheduleShadowRebuild() (pending SSGI rebuild)`);
            rpm.scheduleShadowRebuild?.();
        }

        this._vst(`_activate3DView() COMPLETE`);
    }

    /**
     * ROBUST FLOOR PLAN BEHAVIOR
     * 
     * Camera:
     * - Orthographic projection
     * - Locked rotation
     * - View direction (0, -1, 0) (Y-down in world space)
     * 
     * Clipping:
     * - Plane normal (0, -1, 0)
     * - Plane constant = level.elevation + cutHeight
     * 
     * Framing:
     * - Center on model geometry if present
     * - Otherwise center on the grid
     */
    /**
     * DOC-1.5a — Mount a TechnicalDrawing into the Three.js scene on DOCUMENTATION_LAYER (5).
     * Called after EdgeProjectorService.project() resolves for plan/elevation/section views.
     * Unmounts any previously mounted drawing first so switching levels is always clean.
     * §01 §5 — no store mutation; THREE lifecycle owned by ViewController.
     */
    private _mountDrawing(drawing: OBC.TechnicalDrawing): void {
        this._unmountDrawing(); // clear previous level's drawing first

        // Bug 2 fix: when the Canvas2D section/elevation view (PlanViewManager)
        // is active the TechnicalDrawing THREE.Group must NOT be added to the
        // 3D scene — the linework is rendered exclusively on the 2D canvas.
        // We still update activePlanDrawingRef so the PlanViewCanvas can access
        // the drawing for snap/hit-test; we just skip the scene.add() call.
        if (!shouldPersistDepartingCamera({ departingViewIsCanvas2D: this._planViewManager.isActive })) {
            activePlanDrawingRef.drawing = drawing;
            console.log('[ViewController] DOC-1.5a: PlanViewManager is active — TechnicalDrawing NOT mounted to 3D scene (Canvas2D only).');
            return;
        }

        const scene = this._world.scene?.three;
        if (!scene) {
            console.warn('[ViewController] DOC-1.5a: world.scene.three not available; cannot mount TechnicalDrawing.');
            return;
        }

        // Assign all children to DOCUMENTATION_LAYER so the SelectionManager
        // raycaster (which targets BIM_LAYER = 0) never intercepts vector lines.
        (drawing as any).three?.traverse?.((child: any) => {
            child.layers.set(DOCUMENTATION_LAYER);
        });

        scene.add((drawing as any).three);
        this._mountedDrawing = drawing;
        // §C13-MOUNTED-DRAWING-OWNER — hand the C13 teardown a NAMED OWNER for the
        // group we have just parented to the SHARED scene. Until this line existed,
        // `_unmountDrawing()` was reachable only from view activation, so a project
        // switch left Project A's projected wall linework in Project B's 3D scene
        // while `viewTechnicalDrawingCache.clear()` emptied the cache the PLAN pane
        // reads — the founder's two-panes-disagree report. See mountedDrawingScope.ts.
        noteDrawingMounted(
            () => this._unmountDrawing(),
            this.currentViewDefinitionId ?? null,
        );
        // DOC-5.2: expose the mounted drawing to the tool layer via the rendering-layer ref
        // (not a store — no undo/redo; purely a snapshot for snap queries)
        activePlanDrawingRef.drawing = drawing;
        console.log(`[ViewController] DOC-1.5a: TechnicalDrawing mounted on DOCUMENTATION_LAYER (${DOCUMENTATION_LAYER})`);
        console.log('[ViewController] DOC-5.2: activePlanDrawingRef updated — 2D snap enabled');
    }

    /**
     * DOC-1.5a — Remove the currently mounted TechnicalDrawing from the scene.
     * Safe to call when no drawing is mounted (no-op).
     */
    private _unmountDrawing(): void {
        if (!this._mountedDrawing) return;

        const scene = this._world.scene?.three;
        if (scene) {
            scene.remove((this._mountedDrawing as any).three);
        }
        this._mountedDrawing = null;
        // §C13-MOUNTED-DRAWING-OWNER — the scope no longer owns anything. Safe to call
        // from inside the scope's own `clear()` path: `clearMountedDrawing()` drops its
        // handle in a `finally`, so this is not re-entrant.
        noteDrawingUnmounted();
        // DOC-5.2: clear the tool-layer ref so snap falls back to 3D raycast in 3D view
        activePlanDrawingRef.drawing = null;
        console.log('[ViewController] DOC-1.5a: TechnicalDrawing unmounted from scene.');
        console.log('[ViewController] DOC-5.2: activePlanDrawingRef cleared — 2D snap disabled');
    }

    private async _activateFloorPlanView(_view: OBC.View | null, isCeilingPlan: boolean = false): Promise<void> {
        const logScope = isCeilingPlan ? '_activateCeilingPlanView' : '_activateFloorPlanView';
        // DOC-1.5a: unmount any drawing from the previous level before building the new view.
        this._unmountDrawing();
        this._vst(`${logScope}() ENTRY`);
        // ── QF-1: Hard guard — never activate a plan view without the LevelClipPlaneCache ──
        // If LevelClipPlaneCache was not injected, the only fallback is the legacy OBC
        // Clipper path which recompiles all GPU shaders and causes a 15-second freeze.
        // Refuse activation and stay in 3D instead.
        //
        // This guard fires when:
        //   a) The WebGLRenderer was not ready during initScene (race condition / slow GPU init)
        //   b) An injection error occurred and __planViewsDisabled was set to true
        const planViewsDisabled = window.__planViewsDisabled === true;
        const hasSafePath = this._levelClipPlaneCache !== null;
        this._vst(`${logScope} — hasSafePath=${hasSafePath} planViewsDisabled=${planViewsDisabled} levelClipPlaneCache=${this._levelClipPlaneCache !== null}`);
        if (planViewsDisabled || !hasSafePath) {
            console.warn(
                '[ViewController] LevelClipPlaneCache is unavailable, but Canvas2D plan view can continue without WebGPU clipping.'
            );
        }

        // Phase D Fix A: non-throwing assertion — warn when the caller did not
        // set _activeDefinitionId before invoking activate('Top').  This is a
        // configuration smell (ViewsRailPanel always sets it; direct ViewCube /
        // BottomActionMenu activations do not).  We still proceed — Fix C below
        // provides an OBC-name-based inference fallback.
        if (!this._activeDefinitionId) {
            console.warn(
                '[ViewController] _activateFloorPlanView() called without a prior ' +
                'setActiveViewDefinitionId(). levelId may not be resolvable from the ' +
                'ViewDefinitionStore. Fix C inference will attempt OBC-name lookup.'
            );
        }

        // Resolve the level ID for this plan view — needed for the visibility culler
        // and EdgeProjector activation below.
        const explicitViewDef: any = this._activeDefinitionId
            ? viewDefinitionStore.get(this._activeDefinitionId)
            : undefined;

        // §FEAT-LEVEL-RELATIVE-PLAN-VIEWS (L-720) — THE de-facto-singleton site.
        // When the caller did not set `_activeDefinitionId` (ViewCube, BottomActionMenu,
        // any 2D entry that is not the Views rail), activation fell through to
        // `getByType('plan')[0]` below. While `vd-sys-plan-l0` was the only plan view,
        // that fallback WAS the bug the founder reported: authoring on Level 1 mounted
        // the GROUND plan, so the mesh-export band (`Y=[-1.20, 0.00]`), the clip range,
        // the projected linework the user snaps to, and the room tags were all ground
        // floor while the walls were correctly registered on Level 1.
        //
        // Resolving here — BEFORE the underlay block and the levelId consumers below —
        // rather than at the mount site is deliberate: `planLevelId` and the DOC-4.7
        // underlay must describe the view that is actually mounted, or the plan draws
        // Level 1 while the culler and the ghost underlay still describe Level 0.
        const levelPlanDef: any = (!explicitViewDef && !isCeilingPlan)
            ? findPlanViewForLevel(projectContext.activeLevelId)
            : null;
        if (levelPlanDef) {
            this._activeDefinitionId = levelPlanDef.id;
            console.log(
                `[ViewController] §FEAT-LEVEL-RELATIVE-PLAN-VIEWS — no explicit view definition; ` +
                `resolved plan view "${levelPlanDef.id}" from activeLevelId="${projectContext.activeLevelId}".`,
            );
        }
        const planViewDef: any = explicitViewDef ?? levelPlanDef ?? undefined;
        let planLevelId = planViewDef?.spatial?.levelId;

        // DOC-4.7: Pass underlay baseLevelId to VGSceneApplicator so elements on
        // the underlay level are rendered as a halftoned ghost reference.
        // When no underlay is configured, null clears any previous underlay state.
        {
            const underlayBaseLevelId = planViewDef?.underlay?.baseLevelId ?? null;
            const vgApplicator = window.vgSceneApplicator;
            if (vgApplicator && typeof vgApplicator.setUnderlayLevelId === 'function') {
                vgApplicator.setUnderlayLevelId(underlayBaseLevelId);
            }
            this._vst(
                `${logScope} — DOC-4.7 underlayBaseLevelId="${underlayBaseLevelId ?? 'none'}" ` +
                `(orientation="${planViewDef?.underlay?.orientation ?? 'n/a'}")`
            );
        }

        // Phase D Fix C: OBC-name-based levelId inference fallback.
        // When the store lookup fails (no _activeDefinitionId or missing levelId),
        // try matching the OBC view's display name against ViewDefinition.name.
        // This recovers plan views activated via ViewCube / BottomActionMenu without
        // an explicit setActiveViewDefinitionId() call.
        if (!planLevelId && _view) {
            const obcViewName: string = (_view as any).name ?? (_view as any).id ?? '';
            if (obcViewName) {
                const inferredDef = viewDefinitionStore.getByViewName(obcViewName);
                if (inferredDef?.spatial?.levelId) {
                    planLevelId = inferredDef.spatial.levelId;
                    this._vst(
                        `_activateFloorPlanView — Fix C: inferred levelId="${planLevelId}" ` +
                        `from OBC view name "${obcViewName}" (ViewDefinition.id="${inferredDef.id}")`
                    );
                    console.log(
                        `[ViewController] Fix C: levelId inferred from OBC view name ` +
                        `"${obcViewName}" → "${planLevelId}".`
                    );
                }
            }
        }

        this._vst(`${logScope} — levelId="${planLevelId ?? 'UNKNOWN'}" (from ViewDefinition "${this._activeDefinitionId}")`);

        // Last-resort positional fallback (project whose levels are not loaded yet —
        // `findPlanViewForLevel` above has already been given first refusal).
        const canvasPlanViewDef = planViewDef
            ?? viewDefinitionStore.getByType(isCeilingPlan ? 'ceiling-plan' : 'plan')[0]
            ?? viewDefinitionStore.getByType('structural-plan')[0];

        if (canvasPlanViewDef) {
            this._vst(`${logScope} — PlanViewManager.activate("${canvasPlanViewDef.id}") START`);
            this._planViewManager.activate(canvasPlanViewDef);
            this._vst(`${logScope} — PlanViewManager.activate("${canvasPlanViewDef.id}") DONE`);
            return;
        }

        console.warn(`[ViewController] ${logScope}: no ViewDefinition available for Canvas2D plan view.`);
        window.runtime?.events?.emit('plan-view-unavailable', {
            reason: 'No ViewDefinition available for Canvas2D plan view',
            disabled: planViewsDisabled ?? false,
            hasSafePath: hasSafePath ?? false,
        });
        return;

        // ── Phase 3: Disable annotation layer in plan view (Task 3.2) ────────
        // Annotation geometry (dimensions, tags, grid bubbles) is drawn in
        // screen-space by the annotation pipeline. Disabling ANNOTATION_LAYER
        // on the camera prevents it from being rasterised into the 3D depth
        // buffer, eliminating depth-fighting and overdraw artefacts.
        this._vst(`_activateFloorPlanView — camera.layers.disable(ANNOTATION_LAYER)`);
        this._camera.three.layers.disable(ANNOTATION_LAYER);
        // §L-431 (founder 2026-07-19) — the PARCEL OUTLINE + BUILDABLE ENVELOPE are site
        // context an architect needs while drawing IN PLAN (you set out walls against the
        // setback line). They live on EDITOR_LAYER, which this activation never enabled —
        // so the plan view showed neither, even after L-426 fixed 3D/elevation/section.
        // The plan-specific fill gate (`_applyParcelFillVisibilityForView`) still hides the
        // translucent parcel FILL slab where appropriate; only the crisp outline + envelope show.
        this._vst(`_activateFloorPlanView — camera.layers.enable(EDITOR_LAYER) (§L-431 parcel + envelope in plan)`);
        this._camera.three.layers.enable(EDITOR_LAYER);

        // ── Phase 2: Apply per-level element visibility culling (Task 2.2) ───
        // Hide elements not on the active plan view's level before camera setup
        // so the GPU processes only relevant geometry.
        const scene = this._world.scene?.three as any;
        if (planLevelId && scene && !isCeilingPlan) {
            this._vst(`${logScope} — PlanViewVisibilityCuller.activateForLevel("${planLevelId}") START`);
            this._visibilityCuller.activateForLevel(planLevelId, scene);
            this._vst(`${logScope} — PlanViewVisibilityCuller.activateForLevel DONE`);
        }

        // ── Layer flip: BIM_LAYER / PLAN_SYMBOL_LAYER ─────────────────────────
        // BIM_LAYER (0) is DISABLED in regular plan views so 3D geometry is
        // hidden while PLAN_SYMBOL_LAYER (3) carries EdgeProjector linework.
        // _activate3DView() / _activateElevationView() / _activateSectionView()
        // all call camera.layers.enableAll() which restores BIM_LAYER on exit.
        // RCP (ceiling plan) keeps BIM_LAYER enabled — it uses projected geometry.
        if (isCeilingPlan) {
            this._vst(`${logScope} — layer flip: enable BIM_LAYER=0, disable PLAN_SYMBOL_LAYER=3 (RCP uses projected/model ceiling geometry)`);
            this._camera.three.layers.enable(BIM_LAYER);
            this._camera.three.layers.disable(PLAN_SYMBOL_LAYER);
        } else {
            this._vst(`${logScope} — layer flip: disable BIM_LAYER=0, enable PLAN_SYMBOL_LAYER=3`);
            this._camera.three.layers.disable(BIM_LAYER);
            this._camera.three.layers.enable(PLAN_SYMBOL_LAYER);
        }

        // Multi-Camera Single-Pipeline — Phase A.
        // Arm the RPM fast path BEFORE applyFloorPlan() triggers projection.set().
        // applyFloorPlan() → applyOrthographicView() → camera.projection.set('Ortho')
        // which fires OBC's internal event.  The window 'view-activated' event (which
        // triggers rpm.updateCamera()) is dispatched later by ViewController.activate().
        // notifyProjectionToggle(true) ensures that updateCamera() uses the fast path
        // — swaps camera on existing PassNodes and builds a Phase 2 graph without
        // calling _fullRebuild() (no WebGPU shader recompile).
        this._vst(`${logScope} — rpm.notifyProjectionToggle(true) (fast path armed)`);
        window.renderPipelineManager?.notifyProjectionToggle?.(true);

        // Use animate=false to snap the camera immediately instead of tweening.
        // A multi-frame tween (animate=true) creates a long window during which
        // the PASCAL render loop fires concurrently with scene mutation, increasing
        // the risk of race conditions. The view switch itself provides the visual
        // context change; a sub-100ms snap is imperceptible.
        this._vst(`${logScope} — PlanViewService.${isCeilingPlan ? 'applyCeilingPlan' : 'applyFloorPlan'}() START (animate=false)`);
        if (isCeilingPlan) {
            await this._planViewService.applyCeilingPlan(this._camera, false);
        } else {
            await this._planViewService.applyFloorPlan(this._camera, false);
        }
        this._vst(`${logScope} — PlanViewService.${isCeilingPlan ? 'applyCeilingPlan' : 'applyFloorPlan'}() DONE`);

        // ── Phase 4.1: Fast-path — restore from MultiViewCameraManager plan slot ──
        // Replaces the default framing from applyFloorPlan() if the plan slot was
        // saved on a previous visit. Single Map lookup — no bounds traversal.
        this._vst(`${logScope} — MultiViewCameraManager.restoreSlot("plan")`);
        const slotRestoredFP = this._multiViewCameraManager.restoreSlot('plan', this._camera);
        this._vst(`${logScope} — plan slot ${slotRestoredFP ? 'HIT (instant restore)' : `MISS (using ${isCeilingPlan ? 'applyCeilingPlan' : 'applyFloorPlan'} default framing)`}`);

        if (!slotRestoredFP) {
            // ── Phase 2: Restore saved camera state (Task 2.3) ─────────────────
            // Override the default framing from applyFloorPlan() if the user has
            // previously navigated within this view. Falls through to the
            // applyFloorPlan framing when no saved state exists.
            const restoreKeyFP = this._activeDefinitionId ?? (isCeilingPlan ? 'Ceiling' : 'Top');
            const restoredFP = this._cameraStateStore.restore(restoreKeyFP, this._camera);
            this._vst(`${logScope} — ViewCameraStateStore.restore("${restoreKeyFP}") ${restoredFP ? 'HIT' : 'MISS — using default framing'}`);
        }

        this._vst(`${logScope} — OrthoPlanCameraLockController.activate()`);
        this._orthoPlanLock.activate();

        const controls = this._camera.controls;
        const lockHandler = () => {
            if (this._state.viewMode === 'Top' || this._state.viewMode === 'Ceiling' || this._state.viewMode === 'ceiling-plan') {
                controls.mouseButtons.left = 2;
                (controls.touches as any).one = 2;
            }
        };

        this._registerListener('floorplan-lock', controls as unknown as EventTarget, 'control', lockHandler);

        // ── DOC-1.7 / DOC-1.8: IFC + native element projection ───────────────
        // Trigger EdgeProjector for loaded IFC Fragment models (always, when present).
        // DOC-1.8: when EDGE_PROJECTOR_NATIVE flag is ON, also pass native mesh
        // groups so EdgeProjector linework covers native elements too.
        // Runs after all camera/layer/symbol setup so view switch never blocks.
        // §02 §1.2 — level elevation resolved by EdgeProjectorService; never cached here.
        if (planViewDef && this._edgeProjectorService) {
            const fragmentsMgr = this._components.get(OBC.FragmentsManager);
            const allModels = fragmentsMgr.list.size > 0 ? Array.from(fragmentsMgr.list.values()) : [];
            // Apply IFC toggle — respect user's include/exclude preference for this view
            const models = ifcProjectionStore.filterModels(allModels, planViewDef.id);

            // DOC-1.8: native groups only when feature flag is ON.
            const nativeGroups = useEdgeProjectorNative()
                ? nativeElementMeshExporter.exportForView(planViewDef)
                : [];

            // §28 / Contract 22 §4.1 — Collect IFC-imported scene groups (Source C).
            // IfcGeometryRenderer adds THREE.Group nodes with userData.source === 'ifc-import'
            // directly to the Three.js scene. They are NOT in OBC FragmentsManager so the
            // Source A EdgeProjector path cannot reach them.
            const ifcSceneGroups: THREE.Group[] = [];
            if (ifcProjectionStore.shouldIncludeIFC(planViewDef.id)) {
                const sceneThree = (this._world.scene as any)?.three;
                if (sceneThree) {
                    for (const obj of (sceneThree as THREE.Scene).children) {
                        if ((obj as THREE.Group).isGroup && obj.userData?.source === 'ifc-import') {
                            ifcSceneGroups.push(obj as THREE.Group);
                        }
                    }
                }
            }

            if (models.length > 0 || nativeGroups.length > 0 || ifcSceneGroups.length > 0) {
                this._vst(
                    `${logScope} — EdgeProjectorService.project() START ` +
                    `(${models.length} IFC model(s), ${nativeGroups.length} native group(s), ` +
                    `${ifcSceneGroups.length} ifc-scene group(s), nativeFlag=${useEdgeProjectorNative()})`,
                );
                const projectionGen = viewTechnicalDrawingCache.beginProjection(planViewDef.id);
                this._edgeProjectorService!.project(planViewDef, models, nativeGroups, ifcSceneGroups).then(drawing => {
                    const accepted = viewTechnicalDrawingCache.setIfCurrent(planViewDef.id, projectionGen, drawing);
                    if (!accepted) {
                        // §F.1 — superseded plan projection; release proxy groups.
                        nativeElementMeshExporter.releaseGroups(nativeGroups, { disposeProxies: true });
                        this._disposeRejectedDrawing(drawing);
                        return;
                    }
                    this._vst(`${logScope} — EdgeProjectorService.project() DONE → cached viewId=${planViewDef.id}`);
                    console.log(`[ViewController] DOC-1.10: projection cached for ${isCeilingPlan ? 'ceiling-plan' : 'plan'} view "${planViewDef.id}" (IFC=${models.length}, native=${nativeGroups.length}, ifc-scene=${ifcSceneGroups.length})`);
                    // DOC-1.13: apply VG category visibility/colour to projection layers
                    const vgApplicator = window.vgSceneApplicator;
                    if (vgApplicator && typeof vgApplicator.applyToProjectionLayers === 'function') {
                        vgApplicator.applyToProjectionLayers(drawing, planViewDef.id);
                    }
                    // DOC-1.5a / DOC-1.5f: mount only if this view is still active after async projection.
                    this.mountReprojectedDrawing(planViewDef.id, drawing);
                }).catch(err => {
                    // Release native groups on error to avoid memory leak (§02 §4.3).
                    nativeElementMeshExporter.releaseGroups(nativeGroups, { disposeProxies: true });
                    console.error(`[ViewController] DOC-1.10: EdgeProjectorService.project() failed for ${isCeilingPlan ? 'ceiling-plan' : 'plan'} view:`, err);
                });
            }
        }

        this._vst(`${logScope}() COMPLETE`);
    }

    private async _activateCeilingPlanView(view: OBC.View | null): Promise<void> {
        await this._activateFloorPlanView(view, true);
    }

    /**
     * Activate elevation/section view using PlanViewService
     */
    private async _activateElevationView(mode: ViewMode, _view: OBC.View | null): Promise<void> {
        this._clearClipping();

        // Multi-Camera Single-Pipeline — Phase A.
        // Elevation views always end as a perspective camera (EL-FIX-2 below switches
        // back to Perspective immediately after applyElevation() sets Ortho).
        // Arm the fast path so the window 'view-activated' updateCamera() call
        // receives a perspective camera and rebuilds only the pipeline graph.
        window.renderPipelineManager?.notifyProjectionToggle?.(false);

        // ── Phase 3: Restore annotation layer visibility (Task 3.2) ──────────
        // Elevation views are perspective camera presets.
        // Explicit enables instead of enableAll() — avoids re-exposing PLAN_SYMBOL_LAYER
        // to the WebGPU renderer (ghost objects with disposed geometry crash the
        // AttributeNode compiler if enableAll() fires while ghosts are still in scene).
        this._camera.three.layers.enable(BIM_LAYER);
        this._camera.three.layers.enable(ANNOTATION_LAYER);
        this._camera.three.layers.enable(DOCUMENTATION_LAYER);
        // §L-426 — editor aids (parcel boundary + buildable envelope) live on EDITOR_LAYER;
        // the explicit-enable refactor dropped it, so they never rendered. Same fix as 3D.
        this._camera.three.layers.enable(EDITOR_LAYER);
        // PLAN_SYMBOL_LAYER stays disabled — deactivate() already disabled it.

        // EL-FIX-1: Clear any stale navManager pan-lock handler that may have been
        // registered by a direct navManager.setViewMode('Top') call (e.g. from
        // BottomActionMenu). Without this, the lockControls closure re-fires on every
        // camera 'control' event and forces mouseButtons.left = 2 (PAN) back,
        // overriding our orbit restoration below.
        this.navManager.clearControlLock();

        const directionMap: Record<string, 'front' | 'back' | 'left' | 'right'> = {
            'Front': 'front',
            'Back': 'back',
            'Left': 'left',
            'Right': 'right'
        };

        const direction = directionMap[mode] || 'front';

        // applyElevation internally calls applyOrthographicView, which:
        //   - switches the camera to Orthographic projection
        //   - positions + aims the camera at the correct elevation angle
        // We use its position/target computation, then immediately switch BACK to
        // Perspective.  This implements the "camera preset" behaviour described in the
        // contract comment below: the cube face snaps the camera to the named direction
        // but the user can freely orbit away without being locked in ortho.
        await this._planViewService.applyElevation(this._camera, direction, false); // snap, no tween

        // EL-FIX-2: Elevation views are CAMERA PRESETS, not locked ortho views.
        // Switch back to Perspective immediately after the camera is positioned so
        // that left-drag orbits freely in full 3-D rather than panning a flat ortho
        // projection.  Mirrors the comment in the original implementation:
        //   "we treat them as camera presets: snap then allow free orbit"
        this._camera.projection.set('Perspective');

        // EL-FIX-3: Reset near/far on the newly-created PerspectiveCamera.
        // camera.projection.set('Perspective') may create a new Three.js camera
        // object; the clip planes must be applied to that new object, not the old one.
        this._camera.three.near = 0.1;
        this._camera.three.far  = 2000;
        this._camera.three.updateProjectionMatrix();

        // Restore orbit controls (left-drag = ROTATE, not PAN).
        const controls = this._camera.controls;
        controls.mouseButtons.left = 1;           // restore left-drag = orbit
        (controls.touches as any).one = 1;        // restore single-finger = orbit
        (controls as any).enableRotate = true;

        // Sync camera-controls' internal state so the first orbit gesture is smooth.
        controls.update(0);

        // ── Phase 2: Restore saved elevation camera state (Task 2.3) ─────────
        // If the user previously navigated in this elevation view, restore their
        // position. Falls through to the applyElevation framing if no state saved.
        const restoreKeyElev = this._activeDefinitionId ?? mode;
        this._cameraStateStore.restore(restoreKeyElev, this._camera);

        // ── DOC-1.7 / DOC-1.8: IFC + native projection for elevation view ────
        // Projection direction from viewDef.spatial.projectionDirection or falls
        // back to elevationFront. DOC-1.8: native meshes when flag is ON.
        if (this._edgeProjectorService && this._activeDefinitionId) {
            const elevViewDef = viewDefinitionStore.get(this._activeDefinitionId);
            if (elevViewDef) {
                const fragmentsMgr = this._components.get(OBC.FragmentsManager);
                const allModels = fragmentsMgr.list.size > 0 ? Array.from(fragmentsMgr.list.values()) : [];
                // Apply IFC toggle — respect user's include/exclude preference for this view
                const models = ifcProjectionStore.filterModels(allModels, elevViewDef.id);
                const nativeGroups = useEdgeProjectorNative()
                    ? nativeElementMeshExporter.exportForView(elevViewDef)
                    : [];

                if (models.length > 0 || nativeGroups.length > 0) {
                    const projectionGen = viewTechnicalDrawingCache.beginProjection(elevViewDef.id);
                    this._edgeProjectorService.project(elevViewDef, models, nativeGroups).then(drawing => {
                        const accepted = viewTechnicalDrawingCache.setIfCurrent(elevViewDef.id, projectionGen, drawing);
                        if (!accepted) {
                            // §F.1 — superseded elevation projection; release proxy groups.
                            nativeElementMeshExporter.releaseGroups(nativeGroups, { disposeProxies: true });
                            this._disposeRejectedDrawing(drawing);
                            return;
                        }
                        console.log(`[ViewController] DOC-1.8: projection cached for elevation view "${elevViewDef.id}" (IFC=${models.length}, native=${nativeGroups.length})`);
                        // DOC-1.13: apply VG category visibility/colour to projection layers
                        const vgApplicator = window.vgSceneApplicator;
                        if (vgApplicator && typeof vgApplicator.applyToProjectionLayers === 'function') {
                            vgApplicator.applyToProjectionLayers(drawing, elevViewDef.id);
                        }
                        // DOC-2.5d: inject level datum lines into elevation drawings.
                        levelDatumLineBuilder.inject(drawing, elevViewDef);
                        // DOC-2.5e: inject vertical grid lines into elevation drawings.
                        sectionGridLineBuilder.inject(drawing, elevViewDef);
                        // DOC-1.5a / DOC-1.5f: mount only if this view is still active after async projection.
                        this.mountReprojectedDrawing(elevViewDef.id, drawing);
                    }).catch(err => {
                        nativeElementMeshExporter.releaseGroups(nativeGroups, { disposeProxies: true });
                        console.error('[ViewController] DOC-1.8: EdgeProjectorService.project() failed for elevation view:', err);
                    });
                }
            }
        }
    }

    /**
     * Activate section view using SectionViewService
     */
    private async _activateSectionView(view: OBC.View | null): Promise<void> {
        // Multi-Camera Single-Pipeline — Phase A.
        // Section view stays as orthographic — arm ortho fast path.
        window.renderPipelineManager?.notifyProjectionToggle?.(true);

        // ── Phase 3: Restore annotation layer visibility (Task 3.2) ──────────
        // Section views are 3D cut views — explicit enables, not enableAll().
        // Same rationale as elevation: avoids re-exposing PLAN_SYMBOL_LAYER ghosts.
        this._camera.three.layers.enable(BIM_LAYER);
        this._camera.three.layers.enable(ANNOTATION_LAYER);
        this._camera.three.layers.enable(DOCUMENTATION_LAYER);
        // §L-426 — editor aids (parcel boundary + buildable envelope) live on EDITOR_LAYER;
        // the explicit-enable refactor dropped it, so they never rendered. Same fix as 3D.
        this._camera.three.layers.enable(EDITOR_LAYER);
        // PLAN_SYMBOL_LAYER stays disabled — deactivate() already disabled it.

        // V002 fix: resolve the section plane from the active ViewDefinition stored in
        // viewDefinitionStore, keyed by the id queued via setActiveViewDefinitionId().
        // Falls back to OBC view properties (always undefined in practice) and then to
        // safe defaults so callers without a queued definition degrade gracefully.
        const viewDef = this._activeDefinitionId
            ? viewDefinitionStore.get(this._activeDefinitionId)
            : undefined;
        const sp = viewDef?.spatial?.sectionPlane;

        let normal: THREE.Vector3;
        let origin: THREE.Vector3;
        if (sp) {
            const [nx, ny, nz] = sp.normal;
            normal = new THREE.Vector3(nx, ny, nz).normalize();
            origin = normal.clone().multiplyScalar(-sp.constant);
        } else {
            normal = (view as any)?.direction ?? new THREE.Vector3(0, 0, -1);
            origin = (view as any)?.position ?? new THREE.Vector3(0, 0, 0);
        }

        // DOC-1.9: pass viewDef so SectionViewService fires the EdgeProjector projection
        // internally — the projection block below has been removed to avoid double-fire.
        await this._sectionViewService.activateSection({ normal, origin }, viewDef);

        // Apply orthographic camera setup using front as a base for section
        await this._planViewService.applyOrthographicView(this._camera, 'front', true);

        // Orient camera to match section normal
        const controls = this._camera.controls;
        const target = origin.clone();

        // ── Camera Anti-Clip: Bounding-Box Distance for Section View ─────────
        // Phase 1 Performance: use computeSceneBounds() which reads from the
        // shared SceneBoundsCache — no extra scene.traverse() / setFromObject()
        // call. Previously used Box3.setFromObject(scene.three) which was a
        // full vertex-level traversal without any helper/preview exclusion.
        let distance = 50; // safe fallback for empty scenes
        {
            const sceneBox = this.computeSceneBounds();
            if (!sceneBox.isEmpty()) {
                const sceneSize = new THREE.Vector3();
                sceneBox.getSize(sceneSize);
                const maxDim = Math.max(sceneSize.x, sceneSize.y, sceneSize.z);
                if (Number.isFinite(maxDim) && maxDim > 0) {
                    distance = Math.max(maxDim * 1.5, 10);
                }
            }
        }

        const position = target.clone().sub(normal.clone().multiplyScalar(distance));

        await controls.setLookAt(
            position.x, position.y, position.z,
            target.x, target.y, target.z,
            true
        );

        // ── Phase 2: Restore saved section camera state (Task 2.3) ───────────
        const restoreKeySection = this._activeDefinitionId ?? 'Section';
        this._cameraStateStore.restore(restoreKeySection, this._camera);

        // NOTE (DOC-1.9): Section projection now owned by SectionViewService._projectSection().
        // It is fired inside activateSection() above when viewDef is supplied.
        // Do NOT add a second projection call here — it would double-fire per section activation.
    }

    /**
     * Set up view-specific event listeners
     */
    private _setupViewListeners(_viewType: ViewType): void {
        const updateHandler = () => {
            const renderer = this._world.renderer as any;
            if (renderer && renderer.mode === OBC.RendererMode.MANUAL) {
                renderer.needsUpdate = true;
            }
        };

        this._registerListener('camera-update', 
            this._camera.controls as unknown as EventTarget, 
            'update', 
            updateHandler
        );
    }

    /**
     * Activate true Ground Floor plan view with clipping
     */
    private async _activateGroundFloorView(_view: OBC.View | null): Promise<void> {
        // ── QF-1: Hard guard — Ground Floor view uses LevelClipPlaneCache for clipping ──
        // Ground Floor view applies a horizontal clip plane via groundFloorController.
        // If LevelClipPlaneCache wasn't injected into groundFloorController during initScene,
        // the controller falls back to the legacy OBC Clipper which triggers a shader
        // recompilation freeze. Block activation and fall back to 3D if the cache is missing.
        const planViewsDisabled = window.__planViewsDisabled === true;
        if (planViewsDisabled || this._levelClipPlaneCache === null) {
            console.error(
                '[ViewController] Ground Floor view blocked: LevelClipPlaneCache not injected. ' +
                'Falling back to 3D view to prevent the 15-second GPU shader freeze.'
            );
            await this._activate3DView(null);
            window.runtime?.events?.emit('plan-view-unavailable', {
                reason: 'LevelClipPlaneCache not ready — ground floor view disabled to prevent GPU freeze',
                disabled: planViewsDisabled ?? false,
                hasSafePath: false,
            });
            return;
        }

        // ── Phase 3: Disable annotation layer in ground-floor plan view (Task 3.2) ─
        // Also explicitly re-enable BIM_LAYER (0) and disable PLAN_SYMBOL_LAYER in
        // case the camera arrives here from a Floor Plan view which disabled BIM_LAYER
        // and enabled PLAN_SYMBOL_LAYER.  Ground Floor uses 3D geometry with an OBC
        // Clipper cut — it must NOT inherit the plan-view layer mask.
        this._camera.three.layers.enable(BIM_LAYER);
        this._camera.three.layers.disable(PLAN_SYMBOL_LAYER);
        this._camera.three.layers.disable(ANNOTATION_LAYER);

        // ── Phase 2: Apply per-level element visibility culling (Task 2.2) ───
        const gfViewDef = this._activeDefinitionId
            ? viewDefinitionStore.get(this._activeDefinitionId)
            : undefined;
        const gfLevelId = gfViewDef?.spatial?.levelId;
        const gfScene = this._world.scene?.three as THREE.Scene | undefined;
        if (gfLevelId && gfScene) {
            this._visibilityCuller.activateForLevel(gfLevelId, gfScene);
        }

        // Multi-Camera Single-Pipeline — Phase A.
        // Ground floor view is orthographic — arm fast path before applyFloorPlan().
        window.renderPipelineManager?.notifyProjectionToggle?.(true);

        // Use PlanViewService for atomic camera setup
        await this._planViewService.applyFloorPlan(this._camera, false);

        // ── Phase 2: Restore saved ground floor camera state (Task 2.3) ──────
        const restoreKeyGF = this._activeDefinitionId ?? 'Ground Floor';
        this._cameraStateStore.restore(restoreKeyGF, this._camera);

        // Setup clipping before activating lock
        const groundFloorController = window.groundFloorController;
        if (groundFloorController) {
            groundFloorController.activate();
        }

        // Activate lock after camera is positioned and clipping is ready
        this._orthoPlanLock.activate();
    }

    /**
     * DEACTIVATE VIEW
     * Cleans up the current view state, including:
     * - Event listeners
     * - Clipping planes
     * - Saved materials
     */
    async deactivate(): Promise<void> {
        // ── Phase 2: Save camera state for the departing view BEFORE cleanup ──
        // Key: use the persistent definition id for plan views, or the mode
        // string ('3D', 'Front', etc.) for non-plan views. This must happen
        // before orthoPlanLock.deactivate() or any other camera mutation.
        const saveKey = this._currentViewDefinitionId ?? this._state.viewMode;

        // §CAM-SLOT-CANVAS2D (L-742) — a Canvas2D view has NO OBC camera to save.
        //
        // Plan / elevation / section ViewDefinitions rendered by PlanViewManager draw to a
        // 2D canvas; their "camera" is that canvas's own pan/zoom. The shared OBC camera is
        // never touched while such a view is active, so saving it here records the pose of
        // whatever view came BEFORE — the founder's log shows the identical
        // pos(53.95, 34.66, 39.04) written under five different level view keys in a row.
        //
        // That is not merely useless, it is CORRUPTING. `slotForViewMode()` only recognises
        // 'Top' / 'FloorPlan' / 'Ceiling' / 'Section' / 'Elevation' and falls through to
        // 'perspective' for everything else — and a per-level Canvas2D view's mode string is
        // its ViewDefinition id ('level-ifc-159'). So departing a Canvas2D plan view wrote a
        // stale, frequently ORTHOGRAPHIC-PLAN pose straight into the PERSPECTIVE slot,
        // destroying the user's real 3D camera. That is the "even if last time it was opened
        // it was framed" half of the report.
        //
        // Skip both persistence paths when the departing view was Canvas2D. This runs BEFORE
        // _planViewManager.deactivate() below, so isActive still reflects the departing view.
        if (!shouldPersistDepartingCamera({ departingViewIsCanvas2D: this._planViewManager.isActive })) {
            this._vst(
                `deactivate — §CAM-SLOT-CANVAS2D: departing view "${saveKey}" is Canvas2D ` +
                `(PlanViewManager); skipping camera save — it never drove the OBC camera`,
            );
        } else {
            this._vst(`deactivate — ViewCameraStateStore.save("${saveKey}")`);
            this._cameraStateStore.save(saveKey, this._camera);

            // ── Phase 4.1: Save the departing slot into MultiViewCameraManager ───
            // Runs alongside _cameraStateStore.save() — both persistence mechanisms
            // are updated in parallel so either restore path is current.
            const departingSlot = MultiViewCameraManager.slotForViewMode(this._state.viewMode);
            this._vst(`deactivate — MultiViewCameraManager.saveSlot("${departingSlot}")`);
            this._multiViewCameraManager.saveSlot(departingSlot, this._camera);
        }

        // BUG-FIX (bug 2b): _cleanupAllListeners() MUST run before
        // _orthoPlanLock.deactivate().  The floor-plan view registers a 'control'
        // listener ('floorplan-lock') via _registerListener that forces
        // mouseButtons.left = 2 (PAN) on every camera-controls update event.
        // If that listener is still alive when _orthoPlanLock.deactivate() resets
        // its internal state, the next controls.update(0) call inside
        // camera.projection.set('Perspective') re-fires it and overrides orbit
        // restoration, making the 3D camera appear frozen on first return.
        this._vst(`deactivate — _cleanupAllListeners() (${this._activeListeners.size} listeners) [MUST precede orthoPlanLock.deactivate]`);
        this._cleanupAllListeners();

        this._vst(`deactivate — PlanViewManager.deactivate()`);
        try {
            this._planViewManager.deactivate();
        } catch (pvmErr) {
            // §FIX-DEACTIVATE-GUARD (2026-05-19): PlanViewManager.deactivate() must never
            // abort the view switch. If plan-view cleanup fails (e.g. runtime.events.emit
            // propagates a handler throw, or canvas disposal hits a stale DOM ref), log
            // the error and continue — 3D activation must always complete regardless.
            console.error('[ViewController] PlanViewManager.deactivate() threw (non-fatal, continuing view switch):', pvmErr);
        }

        this._vst(`deactivate — OrthoPlanCameraLockController.deactivate()`);
        this._orthoPlanLock.deactivate();

        const groundFloorController = window.groundFloorController;
        if (groundFloorController) {
            this._vst(`deactivate — groundFloorController.deactivate()`);
            groundFloorController.deactivate();
        }

        this._vst(`deactivate — _clearClipping() (LevelClipPlaneCache or OBC Clipper)`);
        this._clearClipping();
        this._sectionViewService.deactivate();

        // Reset layer state on every view departure: ensure BIM_LAYER is re-enabled
        // and PLAN_SYMBOL_LAYER disabled so every subsequent activation starts from a
        // neutral, known state.  Switching Floor Plan → Elevation must not leave the
        // plan symbol layer enabled; _activateFloorPlanView() re-enables it explicitly.
        this._vst(`deactivate — layer reset: enable BIM_LAYER, disable PLAN_SYMBOL_LAYER and DOCUMENTATION_LAYER`);
        this._camera.three.layers.enable(BIM_LAYER);
        this._camera.three.layers.disable(PLAN_SYMBOL_LAYER);
        this._camera.three.layers.disable(DOCUMENTATION_LAYER);
        this._visibilityCuller.deactivate();
        this._vst(`deactivate — PlanViewVisibilityCuller.deactivate() — all hidden objects restored`);

        this._restoreMaterials();

        // --- NEW: Deep Scene Cleanup ---
        this._vst(`deactivate — _deepSceneCleanup() (previewRegistry.disposeAll)`);
        this._deepSceneCleanup();

        // RC5-FIX: near/far reset intentionally removed from deactivate().
        // deactivate() runs while the camera is still OrthographicCamera — setting
        // near/far on it is a semantic no-op (ortho cameras use a different clip
        // range scheme) and the values do NOT transfer when camera.projection.set()
        // later creates a new PerspectiveCamera.  The reset now lives in
        // _activate3DView() immediately after projection.set('Perspective'), where
        // it correctly targets the newly-created PerspectiveCamera.
        // Note: scene.updateMatrixWorld(true) remains intentionally absent — see
        // the TransformControls/OutlineNode race condition documented here previously.

        this._state.activeView = null;
    }

    /**
     * Deep cleanup of the scene to remove zombie objects and stale renderer state.
     * Prevents performance degradation after clipped views.
     */
    private _deepSceneCleanup(): void {
        // ── Phase 5 Performance: O(1) preview disposal via PreviewRegistry ──────────
        // REMOVED: full scene.traverse() that visited 5,000-20,000+ nodes per switch.
        //
        // Builders now register preview objects in previewRegistry at creation time.
        // disposeAll() removes and disposes them in O(k) where k = number of preview
        // objects (typically 0-5 during normal editing, never in the thousands).
        //
        // Per-material clipping plane cleanup (staleClipMaterials) is also removed:
        // LevelClipPlaneCache uses renderer.clippingPlanes (renderer-level planes),
        // which never set material.clippingPlanes, so the stale-cleanup traversal
        // is a guaranteed no-op once Phase 5 is active.
        previewRegistry.disposeAll();

        // RC-B Fix Option A: sweep the scene for any surviving PLAN_SYMBOL_LAYER
        // objects whose geometry was disposed (by previewRegistry.disposeAll() or
        // a prior deactivate() call) but whose Three.js nodes were never removed.
        // These ghost objects cause WebGPU AttributeNode crashes on 3D return because
        // their geometry.attributes is empty — layer filtering alone cannot help once
        // the WebGPU compiler visits them during the shadow/SSGI prepass.
        const scene = (this._world.scene as any)?.three ?? (this._world.scene as any);
        if (scene instanceof THREE.Object3D) {
            const ghosts: THREE.Object3D[] = [];
            scene.traverse((obj: THREE.Object3D) => {
                if (!obj.layers.isEnabled(PLAN_SYMBOL_LAYER)) return;
                const mesh = obj as THREE.Mesh;
                if (mesh.isMesh && (!mesh.geometry || !mesh.geometry.attributes?.position)) {
                    ghosts.push(obj);
                }
            });
            for (const g of ghosts) {
                g.parent?.remove(g);
                if ((g as THREE.Mesh).geometry) {
                    (g as THREE.Mesh).geometry.dispose();
                }
            }
            if (ghosts.length > 0) {
                console.log(`[ViewController] _deepSceneCleanup — removed ${ghosts.length} PLAN_SYMBOL_LAYER ghost object(s)`);
            }
        }

        // Clear renderer-level clipping planes (safe — does not reset GPU state).
        // renderer.state.reset() is intentionally excluded: calling it during an
        // active rAF loop corrupts the WebGPU/WebGL state machine.
        const renderer = this._world.renderer?.three;
        if (renderer) {
            renderer.clippingPlanes = [];
            // localClippingEnabled stays FALSE — LevelClipPlaneCache never enables it.
            // Explicitly set to false here as a safety guard for any legacy code path
            // that may have set it before Phase 5 was wired.
            renderer.localClippingEnabled = false;
        }
    }

    private _restore3DRendererPresentation(): void {
        const renderer = this._world.renderer?.three;
        if (!renderer) return;

        renderer.clippingPlanes = [];
        renderer.localClippingEnabled = false;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.9;
        // BUG-FIX (bug 1): shadowMap.enabled MUST remain false.
        // PRYZM's WebGPU pipeline owns the shadow depth texture (ShadowDepthTexture).
        // Enabling shadowMap here causes OBC's WebGLShadowMap.render() to write a new
        // WebGLRenderTarget over the WebGPU depth handle on the same frame, corrupting
        // every rp.render() call and producing solid-black walls on return to 3D.
        renderer.shadowMap.enabled = false;

        const shadowedScene = this._world.scene as any;
        if ('shadowsEnabled' in shadowedScene) {
            shadowedScene.shadowsEnabled = true;
        }
    }

    /**
     * Restore materials that were modified during view activation.
     *
     * Phase 1 Performance: previously did a full scene.traverse() per saved UUID.
     * Now uses a direct Map lookup — O(m) where m = saved materials, not O(n × m).
     * Since _savedMaterials is backed by UUID→material entries, any code that
     * saves a material should also add to _savedMeshes (UUID→THREE.Mesh) so the
     * restore can resolve the mesh in O(1) without scene traversal.
     *
     * In the current implementation _savedMaterials is never populated, making
     * this effectively a no-op. The pattern is correct for when material saving
     * is introduced.
     */
    private _restoreMaterials(): void {
        if (this._savedMaterials.size === 0) return;
        for (const [uuid, material] of this._savedMaterials) {
            const mesh = this._savedMeshes?.get(uuid);
            if (mesh) {
                mesh.material = material as THREE.Material;
            }
        }
        this._savedMaterials.clear();
        this._savedMeshes?.clear();
    }

    /**
     * Force renderer to update
     */
    private _forceRendererUpdate(): void {
        const renderer = this._world.renderer;
        if (renderer) {
            if ('needsUpdate' in renderer) {
                (renderer as any).needsUpdate = true;
            }
        }

        setTimeout(() => {
            if (renderer && 'needsUpdate' in renderer) {
                (renderer as any).needsUpdate = true;
            }
        }, 100);
    }

    /**
     * Dispose of the controller and clean up all resources
     */
    dispose(): void {
        this._cleanupAllListeners();
        this._clearClipping();
        this._sectionViewService.dispose();
        this._restoreMaterials();
        this._planViewService.dispose();
        // Phase 2: restore any hidden elements and clear saved camera states
        this._visibilityCuller.deactivate();
        this._cameraStateStore.clear();
        this._viewSwitchListeners.clear();
        this._state.activeView = null;
        this._state.viewMode = '3D';
        this._state.viewType = 'perspective';
        console.log('[ViewController] Disposed');
    }
}