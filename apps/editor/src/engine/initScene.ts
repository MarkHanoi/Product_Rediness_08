/**
 * initScene — Three.js world, OBC components, camera, and rendering pipeline.
 *
 * D.4.1 (S79-WIRE, Option A) ownership pointer:
 *   The scene-half COMPOSITION-ROOT entry point — the typed input/output
 *   contract + `pryzm.bootstrap.scene` OTel span + soft-fail semantics —
 *   now lives in `packages/renderer/src/SceneBootstrap.ts:bootstrapScene()`.
 *   `composeRuntime.ts` delegates to it instead of inlining the wiring.
 *   The body of THIS file (BimWorld, OBC components, navigation, render
 *   pipelines, etc.) is the future relocation target for Wave 4 — it
 *   stays here until L7 dependencies (BimManager, ProjectContext,
 *   PostproductionRenderer) are factored into thinner L4/L5 surfaces
 *   that can move into `@pryzm/renderer` without inverting the layer
 *   rule.  Until then, app-level callers continue to import this file
 *   directly; the L5 entry point owns the contract.
 *
 * Extracted from EngineBootstrap.ts (Phase F-1).  Covers:
 *   • GPU probe + backend detection
 *   • createBimWorld (components, world, grid)
 *   • ViewNavigationManager, GroundFloorPlanController, ViewController
 *   • GridToggleService, WallEdgeVisibilityService
 *   • view-activated edge / stair plan-representation listener
 *   • ProjectContext + BimManager
 *   • PostproductionRenderer + camera controls event wiring
 *   • Phase 5: PRYZM-owned WebGPU overlay canvas + renderer
 *   • ViewportPathTracer (Tier 2 progressive path tracer)
 *   • PascalSceneLighting (early apply before pipeline compilation)
 *   • RenderingPipelineCoordinator (RealtimeLighting + PBR)
 *   • ViewportCrashGuard + RenderHealthIndicator
 *   • RenderPipelineManager (WebGPU TSL: MRT, SSGI, TRAA, Outlines)
 *   • Pascal lighting geometry events
 *   • EnhancedBloomService (Phase 2 bloom)
 *   • SSGIService (Phase 2 legacy WebGL SSGI)
 *   • RenderPerformanceService (DPR scaling + shadow management)
 *
 * Contract compliance:
 *   §01-BIM-ENGINE-CORE-CONTRACT §9 — engine layer only; no UI shell imports.
 *   Never blocks on a server response.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler } from '@pryzm/frame-scheduler';
import * as OBC from '@thatopen/components';
import * as OBCF from '@thatopen/components-front';
import { GLTFLoader } from '@pryzm/renderer-three';
import { createBimWorld } from '@pryzm/core-app-model';
import { BimManager } from '@pryzm/core-app-model';
import { ViewNavigationManager } from '@pryzm/core-app-model';
import { ViewController } from './ViewController';
import { GroundFloorPlanController } from '@pryzm/core-app-model';
import { GridToggleService } from '@app/ui/GridToggleService';
import { WallEdgeVisibilityService } from '@app/ui/WallEdgeVisibilityService';
import { initParcelBoundarySceneRenderer } from '@app/ui/site/ParcelBoundarySceneRenderer';
import { ProjectContext, projectContext } from '@pryzm/core-app-model';
// ViewportPathTracer is dynamically imported on first activation — see
// `_ensureViewportPathTracer()` below. Statically importing it would pull
// `three-gpu-pathtracer` (~150 KB) into the EngineBootstrap chunk for every
// session, even when path tracing is never used. Type-only import keeps the
// class signature available without emitting a runtime dependency.
import type { ViewportPathTracer as ViewportPathTracerType } from '@pryzm/core-app-model/rendering';
// Phase 4 (PROJECT-LOAD-PERFORMANCE-13 §5): EnhancedBloomService and SSGIService
// are deferred — both are opt-in services activated only when the user toggles
// them on in VisualizationEnginePanel.  We keep the type-only import so the
// constructor signature and method shape remain available to the lazy wrappers
// below, but the runtime module is dynamically imported on first activation
// (via _ensureBloom() / _ensureSSGI()).  This removes both modules + their
// dependency closures (UnrealBloomPass, EffectComposer, GTAOPass, OutputPass,
// RenderPass) from the EngineBootstrap chunk and bytes-on-the-wire at boot.
// Closure variables (pryzmCanvas, isPhase5Active, postproductionRenderer, world)
// are captured from the surrounding initScene() scope and resolve correctly
// because the lazy wrapper closures are created at the original synchronous
// position — only the heavy module fetch + constructor are deferred.
import type { EnhancedBloomService as _EnhancedBloomServiceImpl } from '@pryzm/core-app-model/rendering';
import type { SSGIService as _SSGIServiceImpl } from '@pryzm/core-app-model/rendering';
import { RenderPerformanceService } from '@pryzm/core-app-model/rendering';
import { RenderingPipelineCoordinator } from '@pryzm/core-app-model/rendering';
import { probeRendererBackend, createRenderer } from '../rendering/createRenderer';
import { RenderPipelineManager } from '@pryzm/renderer-three';
import { ViewportCrashGuard } from '@app/ui/primitives/ViewportCrashGuard';
import { RenderHealthIndicator } from '@app/ui/overlays/RenderHealthIndicator';
import { pascalSceneLighting } from '@pryzm/core-app-model/rendering';
import { SceneTheme } from '@pryzm/core-app-model';
import { SplitViewManager } from './views/SplitViewManager';
import { SceneBoundsCache } from '@pryzm/scene-committer';
import { FrameCoordinator } from '@pryzm/core-app-model';
import { topologySpatialIndex } from '@pryzm/room-topology';
import { projectScopeRegistry } from '@pryzm/core-app-model';
import { ViewVisibilityMap } from '@pryzm/core-app-model';
import { EDITOR_LAYER } from '@pryzm/scene-committer';
import { topologyLayer } from '@pryzm/room-topology';
import { unifiedFrameLoop } from '@pryzm/core-app-model';
import { viewDependencyTracker } from '@pryzm/core-app-model';
import { viewTechnicalDrawingCache } from '@pryzm/core-app-model';
import { nativeElementMeshExporter } from '@pryzm/core-app-model';
// Phase 6 — EdgeProjectorService is lazy-loaded. The module is ~1 870 LOC and
// transitively pulls 11 plan-symbol builders + the OBC EdgeProjector +
// TechnicalDrawings APIs into the static graph. Plan / section / elevation
// views are activated post-load when the user explicitly switches view, so
// the entire projection stack can wait until the first switch. `import type`
// is erased by tsc so this line does NOT add the module to the static graph.
// See Phase 6 STATUS in §18.2 for the full consumer audit (8 call sites,
// all of them already either await-style or fire-and-forget setters).
import type { EdgeProjectorService } from './views/EdgeProjectorService';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { ifcProjectionStore } from '@pryzm/core-app-model';
import { frustumCullingService } from '@pryzm/core-app-model/rendering';
import { viewRenderCache } from '@pryzm/core-app-model';
import { levelClipPlaneCache } from '@pryzm/core-app-model';
import { stairPlanSymbolRegistry } from '@pryzm/scene-committer';
import { RoomTagAutoPopulator } from '@pryzm/room-topology';
import { instancedElementRenderer } from '@pryzm/core-app-model/rendering';
import { batchCoordinator } from '@pryzm/core-app-model';

// ── Derived type alias ─────────────────────────────────────────────────────────
// Preserves the specific scene/camera/renderer generic params from createBimWorld
// so callers retain full type narrowing (mode, needsUpdate, controls, updateShadows…).
type BimWorld = ReturnType<typeof createBimWorld>['world'];

// ── Public result type ─────────────────────────────────────────────────────────

export interface SceneResult {
    components: OBC.Components;
    /** Specific world type — retains ShadowedScene, OrthoPerspectiveCamera, PostproductionRenderer generics. */
    world: BimWorld;
    /** OBC SimpleGrid created by createBimWorld */
    grid: any;
    bimManager: BimManager;
    projectContext: ProjectContext;
    navManager: ViewNavigationManager;
    viewController: ViewController;
    gridToggleService: GridToggleService;
    /** OBC FragmentsManager — ready for fragments.init() call */
    fragments: OBC.FragmentsManager;
    gltfLoader: GLTFLoader;
    /** Triggers a renderer needsUpdate when the camera is in MANUAL mode */
    updateIfManualMode: () => void;
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Initialises the Three.js world and the complete PRYZM rendering pipeline.
 *
 * @param container  The #container HTMLElement that hosts the BIM viewport.
 * @returns          Typed scene-level references consumed by subsequent subsystems.
 */
export async function initScene(container: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime initScene */): Promise<SceneResult> {

    // ── Phase 1 (WebGPU Rendering Migration): Unified GPU backend probe ──────
    // probeRendererBackend() tests for WebGPU first, then WebGL 2 — matching
    // the same priority used by createRenderer() when the OBC renderer is
    // decoupled in Phase 5.  For now, OBCF.PostproductionRenderer continues
    // to manage the active renderer canvas; createRenderer.ts is wired in
    // as the factory for future phases.
    const detectedBackend = probeRendererBackend();
    if (detectedBackend === 'none') {
        const errorMsg = document.createElement('div');
        errorMsg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);padding:2rem;background:#fff;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.2);text-align:center;font-family:sans-serif;z-index:9999;';
        errorMsg.innerHTML = '<h2 style="color:#dc3545;margin-top:0;">GPU Not Supported</h2><p>Your browser or device does not support WebGPU or WebGL 2, which are required for this application.</p>';
        document.body.appendChild(errorMsg);
        throw new Error('[initScene] GPU backend not supported — aborting engine init.');
    }
    console.log(`[PRYZM] GPU backend detected: ${detectedBackend}`);

    // ── World + OBC components ────────────────────────────────────────────────
    // createBimWorld exposes components, world, threeScene, threeCamera to window
    const { components, world, grid, infiniteGrid } = createBimWorld(container);

    const navManager = new ViewNavigationManager(world.camera);
    window.navManager = navManager;

    // Create GroundFloorPlanController
    const groundFloorController = new GroundFloorPlanController(components, world);
    window.groundFloorController = groundFloorController;

    // Create the centralized ViewController (single authority for view activation)
    const viewController = new ViewController(components, world, world.camera, grid, navManager);
    window.viewController = viewController;

    // ── Phase 1 Performance: SceneBoundsCache ─────────────────────────────────
    // Replaces 3-6 full scene.traverse() calls per view switch with a single
    // lazy-computed, event-invalidated cache. Shared by ViewController and
    // PlanViewService so all bounds queries within one view-switch cycle hit
    // the same cached result.
    //
    // The cache self-registers on window.__sceneBoundsCache so any command
    // or builder can call window.__sceneBoundsCache?.invalidate() after
    // mutating geometry without needing a direct module import.
    const sceneBoundsCache = new SceneBoundsCache(
        world.scene.three as THREE.Scene,
        grid?.three ?? null
    );
    viewController.setBoundsCache(sceneBoundsCache);

    // Contract 45 §6 — Phase 5: register the per-engine cache so project
    // switching wipes it from the same code path that wipes the stores.
    // The cache also self-invalidates on the 'bim-project-cleared' DOM
    // event; the registry call here ensures the central [ClearProjectCommand]
    // log enumerates this scope alongside every other.
    projectScopeRegistry.register({
        scopeName: 'sceneBoundsCache',
        clear: () => sceneBoundsCache.invalidate(),
    });
    // ── End SceneBoundsCache ──────────────────────────────────────────────────

    // ── Phase 2 Performance: FrameCoordinator ────────────────────────────────
    // Created here (outside the RPM try block) so it is available to both
    // viewController and renderPipelineManager. ViewController uses it to
    // signal beginViewSwitch()/endViewSwitch(). RenderPipelineManager calls
    // shouldRenderPascalPass() to skip post-processing during view switches.
    const frameCoordinator = new FrameCoordinator();
    viewController.setFrameCoordinator(frameCoordinator);
    // ── End FrameCoordinator ──────────────────────────────────────────────────

    // ── Phase 3 Performance: TopologySpatialIndex (Task 3.1) ─────────────────
    // Wire the singleton's scene reference so lazy rebuilds can scan scene
    // children for element bounds. The index subscribes to StoreEventBus and
    // DOM events on its own; this is the only engine-bootstrap call needed.
    topologySpatialIndex.setScene(world.scene.three as THREE.Scene);
    // ── End TopologySpatialIndex ──────────────────────────────────────────────

    // ── Phase 3 Performance: SceneLayers — EDITOR_LAYER on OBC grid (Task 3.2)
    // Move the OBC SimpleGrid's Three.js objects to EDITOR_LAYER so raycasters
    // configured for BIM_LAYER (layer 0) do not accidentally hit grid geometry.
    // The grid is always rendered (it enables all layers) so visibility is unaffected.
    if (grid?.three) {
        grid.three.traverse((obj: THREE.Object3D) => {
            obj.layers.set(EDITOR_LAYER);
        });
    }
    // ── End SceneLayers grid assignment ──────────────────────────────────────

    // ── Phase 3 Performance: ViewVisibilityMap (Task 3.3) ────────────────────
    // Pre-computes levelId → Set<elementId> from scene children so plan view
    // activation uses O(1) map lookups instead of per-child string comparisons.
    // Injected into ViewController which propagates it to PlanViewVisibilityCuller.
    const viewVisibilityMap = new ViewVisibilityMap();
    viewVisibilityMap.setScene(world.scene.three as THREE.Scene);
    viewController.setViewVisibilityMap(viewVisibilityMap);

    // Contract 45 §6 — Phase 5: register the per-engine visibility map so the
    // levelId → elementId Set is wiped on project switch alongside the stores.
    projectScopeRegistry.register({
        scopeName: 'viewVisibilityMap',
        clear: () => viewVisibilityMap.invalidate(),
    });
    // ── End ViewVisibilityMap ─────────────────────────────────────────────────

    // ── Phase 4 Performance: TopologyLayer (Task 4.2) ─────────────────────────
    // Full Contract 01 §1.2 Phase 2 Topology Layer. Subscribes to StoreEventBus,
    // computes adjacency, emits topology events. Scene injection is the only
    // engine-bootstrap call needed — StoreEventBus subscription happens in the
    // constructor.
    try {
        topologyLayer.setScene(world.scene.three as THREE.Scene);
        console.log('[initScene] TopologyLayer ready.');
    } catch (tlErr: any) {
        console.warn('[initScene] TopologyLayer init error:', tlErr?.message ?? tlErr);
    }
    // ── End TopologyLayer ─────────────────────────────────────────────────────

    // ── Phase 4 Performance: FrustumCullingService (Task 4.4) ─────────────────
    // Conservative GPU-side frustum culling for models with >500 elements.
    // Re-enables frustumCulled=true and recomputes bounding spheres on builders
    // that disable it for incremental geometry updates.
    try {
        frustumCullingService.setScene(world.scene.three as THREE.Scene);
        frustumCullingService.activate();
        console.log('[initScene] FrustumCullingService ready.');
    } catch (fcErr: any) {
        console.warn('[initScene] FrustumCullingService init error:', fcErr?.message ?? fcErr);
    }
    // ── End FrustumCullingService ─────────────────────────────────────────────

    // ── Phase 4 Performance: ViewRenderCache (Task 4.5) ───────────────────────
    // Per-view offscreen WebGLRenderTarget cache for non-interactive contexts
    // (sheet thumbnails, PDF export). Singleton is self-registering on window.
    // Default size set to 1024×768; sheet exporters can override per-call.
    try {
        viewRenderCache.setDefaultSize(1024, 768);
        window.__viewRenderCache = viewRenderCache;
        console.log('[initScene] ViewRenderCache ready.');
    } catch (vrcErr: any) {
        console.warn('[initScene] ViewRenderCache init error:', vrcErr?.message ?? vrcErr);
    }
    // ── End ViewRenderCache ───────────────────────────────────────────────────

    // ── Phase 4 Performance: UnifiedFrameLoop (Task 4.3) ──────────────────────
    // Bridges FrameCoordinator so ViewController's beginViewSwitch() /
    // endViewSwitch() propagate through the unified loop. The PASCAL render
    // callback is wired inside the RPM try block below, after renderPipelineManager
    // is constructed. The loop is started there too.
    try {
        unifiedFrameLoop.setFrameCoordinator(frameCoordinator);
        viewController.setUnifiedFrameLoop(unifiedFrameLoop);
        console.log('[initScene] UnifiedFrameLoop bridged to FrameCoordinator.');
    } catch (uflErr: any) {
        console.warn('[initScene] UnifiedFrameLoop bridge error:', uflErr?.message ?? uflErr);
    }
    // ── End UnifiedFrameLoop pre-wiring ──────────────────────────────────────

    // ── Phase 5 Performance: LevelClipPlaneCache + StairPlanSymbolRegistry ───
    // Fixes the 15-second plan view activation freeze on large buildings.
    //
    // ROOT CAUSE:
    //   setupFloorPlanClipping() called OBC.Clipper.create() + set
    //   localClippingEnabled=true. This forces THREE.js to recompile all GPU
    //   shaders for the CLIPPING_PLANES variant — once per unique material.
    //   For a 20-level curtain wall building with 50–100 unique materials
    //   at 100–200ms per recompile = 5–15 second freeze on every plan view switch.
    //
    // FIX:
    //   Use renderer.clippingPlanes (renderer-level) instead of
    //   material.clippingPlanes + localClippingEnabled (per-material).
    //   With renderer-level planes, the shader variant is compiled ONCE for the
    //   entire renderer — not once per material. Switching planes is a pointer
    //   swap on renderer.clippingPlanes (<0.1ms).
    //
    //   Pre-compute THREE.Plane objects for all known levels at project load
    //   (during idle time) so plan view activation is a cache hit, not on-demand.
    try {
        const threeRenderer = (world.renderer as any).three as THREE.WebGLRenderer;
        if (threeRenderer) {
            levelClipPlaneCache.setRenderer(threeRenderer);
            viewController.setLevelClipPlaneCache(levelClipPlaneCache);
            groundFloorController.setLevelClipPlaneCache(levelClipPlaneCache);
            // QF-1: Mark the cache as ready so ViewController can gate plan view activation.
            // This flag prevents the silent fallback to the legacy 15-second OBC Clipper path.
            console.log('[initScene] LevelClipPlaneCache wired — OBC Clipper replaced with renderer-level planes. Plan views are safe.');
        } else {
            // QF-1: Hard error — do NOT silently fall back to localClippingEnabled.
            // The legacy fallback recompiles all GPU shaders and causes a 15-second freeze.
            // Instead, flag plan views as unavailable until the renderer is resolved.
            console.error(
                '[initScene] CRITICAL: LevelClipPlaneCache could not resolve THREE.WebGLRenderer. ' +
                'Plan views are DISABLED to prevent the legacy 15-second shader recompilation freeze. ' +
                'Renderer must be available before initScene runs.'
            );
            window.__planViewsDisabled = true;
        }
    } catch (lccErr: any) {
        // QF-1: Treat injection errors the same way — disable plan views rather than freeze.
        console.error('[initScene] LevelClipPlaneCache init error — plan views DISABLED:', lccErr?.message ?? lccErr);
        window.__planViewsDisabled = true;
    }

    // StairPlanSymbolRegistry: replace scene.traverse() in view-activated with O(k) lookup.
    // Stair builders call stairPlanSymbolRegistry.register(obj) on each plan-representation
    // mesh. The view-activated listener (below) calls showPlanSymbols()/hidePlanSymbols().
    console.log('[initScene] StairPlanSymbolRegistry ready — stair traverse replaced with O(k) registry.');

    // ── Level registration for LevelClipPlaneCache ───────────────────────────
    // Pre-compute THREE.Plane objects for each BIM level so plan view activation
    // is a pointer-swap cache hit rather than an on-demand plane construction.
    //
    // Three integration points mirror the existing pattern in ViewVisibilityMap
    // (which also maintains level→element maps from these same events):

    // 1. Individual level added / updated (from AddLevelCommand, DeleteLevelCommand)
    window.addEventListener('bim-level-added', (e: Event) => {
        try {
            // F.events.16: payload normalized to { id, elevation? } by DOMEventBus migration.
            const d = (e as CustomEvent<{ id?: string; elevation?: number }>).detail;
            if (d?.id !== undefined) {
                const elevation = d.elevation ?? 0;
                levelClipPlaneCache.updateLevel(d.id, elevation);
                console.log(`[initScene] LevelClipPlaneCache: registered level "${d.id}" at ${elevation}m`);
            }
        } catch (lvErr: any) {
            console.warn('[initScene] bim-level-added clip plane error:', lvErr?.message ?? lvErr);
        }
    });

    // 2. Bulk-register all levels when a project is opened.
    //    'project-loaded' is the canonical event (same as ViewVisibilityMap / TopologyLayer).
    //    Access levels via window.bimManager (available after initBuilders runs).
    window.addEventListener('project-loaded', () => {
        try {
            levelClipPlaneCache.clear();
            const bm = window.bimManager;
            const levels: Array<{ id: string; elevation: number }> = bm?.getLevels?.() ?? [];
            for (const lv of levels) {
                levelClipPlaneCache.registerLevel(lv.id, lv.elevation);
            }
            console.log(`[initScene] LevelClipPlaneCache: pre-computed ${levels.length} level clip planes on project-loaded.`);

            // Prewarm the clipping shader variant during idle time.
            // This pays the ONE-TIME shader compilation cost now (project load / idle)
            // instead of on the user's first plan view switch.
            const threeCamera = world.camera.three as THREE.Camera;
            const threeScene  = world.scene.three as THREE.Scene;
            if (levels.length > 0) {
                requestIdleCallback(() => {
                    levelClipPlaneCache.prewarm(threeScene, threeCamera);
                }, { timeout: 3000 });
            }
        } catch (plErr: any) {
            console.warn('[initScene] project-loaded clip plane error:', plErr?.message ?? plErr);
        }
    });

    // 3. Clear the cache when a project is closed / cleared.
    window.addEventListener('clear-project', () => {
        levelClipPlaneCache.clear();
        console.log('[initScene] LevelClipPlaneCache: cleared on project close.');
        // Phase 7: release all InstancedMesh GPU buffers on project close.
        try {
            instancedElementRenderer.clear();
        } catch { /* noop */ }
    });
    // ── End Phase 5 LevelClipPlaneCache + StairPlanSymbolRegistry ────────────

    // ── Phase 7: GPU Instancing — InstancedElementRenderer ──────────────────
    // Provides a general-purpose coordinator for rendering repeating elements
    // (curtain wall panels, columns, structural bays) as THREE.InstancedMesh,
    // reducing N draw calls to O(geometry types).  CurtainWallInstanceManager
    // already provides per-curtain-wall instancing; this is the global registry
    // available to any builder via window.__instancedElementRenderer.
    try {
        instancedElementRenderer.setScene(world.scene.three as THREE.Scene);
        window.__instancedElementRenderer = instancedElementRenderer;
        console.log('[initScene] InstancedElementRenderer wired — Phase 7 GPU instancing active.');
    } catch (ierErr: any) {
        console.warn('[initScene] InstancedElementRenderer init error:', ierErr?.message ?? ierErr);
    }

    // GridToggleService — user-controlled grid on/off, survives view changes.
    // Also drives the custom InfiniteGrid3D shader plane so the 3D grid and
    // the 2D plan grid share a single user-facing on/off switch.
    const gridToggleService = new GridToggleService(grid);
    gridToggleService.attachAuxiliary(infiniteGrid);

    // Keep the InfiniteGrid3D parked at the active level's elevation so the
    // grid sits on the floor of whatever storey the user is working on.
    const _updateGridElevation = (): void => {
        try {
            const ctx = window.projectContext;
            const bm  = window.bimManager;
            const levelId = ctx?.activeLevelId;
            let elevation = 0;
            if (levelId && bm?.getLevelById) {
                const lvl = bm.getLevelById(levelId);
                if (lvl && typeof lvl.elevation === 'number') elevation = lvl.elevation;
            } else if (bm?.getLevels) {
                const levels = bm.getLevels() ?? [];
                if (levels.length > 0 && typeof levels[0].elevation === 'number') {
                    elevation = levels[0].elevation;
                }
            }
            infiniteGrid.setElevation(elevation);
        } catch (_) { /* non-fatal: grid stays at last known elevation */ }
    };
    window.addEventListener('activeLevelChanged', _updateGridElevation);
    window.addEventListener('project-loaded',     _updateGridElevation);
    _updateGridElevation();

    // WallEdgeVisibilityService — user-controlled wall edge overlay on/off
    const wallEdgeVisibilityService = new WallEdgeVisibilityService(world.scene.three as THREE.Scene);

    // Apply line-edges default whenever a view is activated.
    // Plan-family views (FloorPlan, GroundFloor): edges ON.
    // All other views (3D, Section, Elevation):   edges OFF.
    // The V/G Panel overrides this default immediately when the user changes
    // the "Line Edges" toggle for a specific view.
    //
    // B2 — Edge render-mode wiring:
    // When entering a plan-family view (white background forced by B1), switch
    // all edge overlays to 'plan' mode: crisp black (0x000000), depthTest=false,
    // renderOrder=999. This ensures wall and slab edges are clearly legible black
    // lines against the white plan-view background.
    // When leaving plan view, restore '3d' mode (subtle grey, depth-tested).
    window.runtime?.events?.on('view-activated', (payload: unknown) => { // F.events.8
        const mode = (payload as { mode?: string })?.mode;
        if (!mode) return;
        // Mode strings must match what ViewController.activate() dispatches:
        // 'Top' = floor plan, 'Ground Floor' = ground-floor ortho view.
        const isPlanMode = mode === 'Top' || mode === 'Ground Floor';
        wallEdgeVisibilityService.setVisible(isPlanMode);
        // B2: Switch edge material to plan-optimised (black, no depth-test) or
        // restore 3D mode. Runs after setVisible() so hidden edges also get
        // their material updated — they will display correctly if made visible
        // programmatically (e.g. V/G panel override) without another mode switch.
        wallEdgeVisibilityService.applyRenderMode(isPlanMode ? 'plan' : '3d');

        // Toggle stair plan-representation lines (walking line, break line,
        // direction arrow) — visible only in plan views, hidden in 3D/elevation.
        //
        // Phase 5 Performance: replaced full scene.traverse() with O(k) registry
        // lookup via stairPlanSymbolRegistry. Stair builders register their
        // plan-representation objects at creation time; we simply show/hide them.
        // Stair builders must call stairPlanSymbolRegistry.register(obj) when
        // creating walking-line, break-line, and direction-arrow objects.
        if (isPlanMode) {
            stairPlanSymbolRegistry.showPlanSymbols();
        } else {
            stairPlanSymbolRegistry.hidePlanSymbols();
        }
    });

    // ── DOC-2.5b: RoomTagAutoPopulator — place room tags on view activation ──
    // §13 / M1 fix: pass stores explicitly via constructor DI rather than
    // relying on the runtime `window` lookup performed by populate().
    const roomTagAutoPopulator = new RoomTagAutoPopulator({
        roomStore:       window.roomStore, // TODO(TASK-08)
        annotationStore: window.annotationStore, // TODO(TASK-08)
        commandManager:  window.commandManager, // TODO(TASK-06)
    });
    window.runtime?.events?.on('view-selected', (payload: unknown) => { // F.events.8
        const viewId = (payload as { viewId?: string | null })?.viewId;
        if (!viewId) return;
        const viewDef = viewDefinitionStore.get(viewId);
        if (!viewDef) return;
        // Only auto-populate for floor-plan views (they carry a spatial.levelId).
        if (!viewDef.spatial.levelId) return;
        roomTagAutoPopulator.populate(viewDef);
    });

    // ── Context + BimManager ──────────────────────────────────────────────────
    // §01 §2.1 SINGLETON FIX: Reuse the module-level singleton instead of creating
    // a new ProjectContext instance here. Previously this created a second instance
    // that was assigned to window.projectContext, while SlabTool (and other tools
    // that import the singleton directly) still read the original stale instance,
    // causing slabs to always be placed on L0 regardless of the active level.
    // Now window.projectContext and every direct import resolve to the same object.
    window.projectContext = projectContext;

    const bimManager = new BimManager(
        world.scene.three as THREE.Scene,
        () => projectContext.editorMode
    );
    window.bimManager = bimManager;

    // ── A.21.D34(c): Hide level datum lines in the 3D model view ─────────────
    // LevelVisualizer draws Revit-style datum lines (two ±30 m dashed crosses +
    // level-head bubbles) per BIM level at the level elevation. These extend far
    // past any building footprint and, in a generated multi-storey house, stack
    // up one set per storey — reading as oversized translucent gridded markers
    // sticking out beyond the walls at each floor height. Datum lines are a 2-D
    // documentation aid (section / elevation drawings), not a 3-D model overlay:
    // Revit itself never shows them in the 3D view. We therefore hide the level
    // datum group in the pure 3D ('3D' / perspective) model view and show it in
    // every 2-D documentation view (plan / section / elevation). This removes the
    // artifact without deleting the datum lines, the structural grid, the grid
    // toggle, or any real geometry — they remain available where they belong.
    const _applyLevelDatumVisibilityForView = (mode?: string): void => {
        try {
            // The bug only manifests in the orbit-able 3D model view. Every other
            // surface (plan / section / elevation / ceiling) legitimately wants the
            // datum lines, so default to showing them when the mode is unknown.
            const is3DModelView = mode === '3D';
            window.bimManager?.toggleVisibility?.('levels', !is3DModelView);
        } catch { /* non-fatal: datum group keeps its last visibility */ }
    };
    window.runtime?.events?.on('view-activated', (payload: unknown) => { // F.events.8
        _applyLevelDatumVisibilityForView((payload as { mode?: string })?.mode);
    });
    // Boot view is the 3D model view — hide the datum lines immediately so they
    // never flash before the first view-activated event lands.
    _applyLevelDatumVisibilityForView('3D');

    // ── A.21.D34(c) RECURRENCE: Hide per-floor tile/plank HATCH in the 3D view ──
    // SEPARATE artifact from the datum lines above. FloorPanelBuilder draws a
    // fine tile / plank grid overlay (`floor-tile-grid` LineSegments — 0.12 m
    // plank → 0.3 m tile spacing) on every floor finish as a 2-D drawing symbol.
    // It is generated by sweeping each room's BOUNDING BOX (not the polygon), so
    // for non-rectangular rooms (L-shapes, corridors, the apartment master suite)
    // the hatch quads spill OUTSIDE the floor boundary and past the walls — and
    // one set exists per storey. In the orbit-able 3D / exploded model view this
    // reads exactly as the founder reported: translucent finely-gridded
    // rectangles, one per floor elevation, extending beyond the building
    // footprint. The tile/plank hatch is a plan-drawing convention (Revit shows
    // surface patterns in 2-D views, not the 3-D model), so we gate it to plan /
    // section / elevation views and hide it in the pure 3-D model view — the same
    // doctrine as the datum-line fix. The real floor finish MESH (colour, slab,
    // geometry), the plan view, and the user grid toggle are all untouched: only
    // the cosmetic 2-D hatch LINE overlay is hidden in 3-D. New floors built
    // after a view switch inherit the current mode via the floor build events.
    const _applyFloorHatchVisibilityForView = (mode?: string): void => {
        try {
            const is3DModelView = mode === '3D';
            const scene = world.scene.three as THREE.Scene;
            scene.traverse((obj: THREE.Object3D) => {
                if (obj.name === 'floor-tile-grid') {
                    obj.visible = !is3DModelView;
                }
            });
        } catch { /* non-fatal: hatch keeps its last visibility */ }
    };
    // Track the last activated view mode so newly built floors match it.
    let _lastFloorHatchViewMode: string | undefined = '3D';
    window.runtime?.events?.on('view-activated', (payload: unknown) => { // F.events.8
        _lastFloorHatchViewMode = (payload as { mode?: string })?.mode;
        _applyFloorHatchVisibilityForView(_lastFloorHatchViewMode);
    });
    // Re-apply when floors are (re)built — the builder always creates the hatch
    // visible, so without this a floor created/edited while in the 3-D view would
    // show its hatch until the next view switch. Deferred to a microtask because
    // initScene registers this BEFORE initBuilders registers the floor-mesh
    // builder for the same event; the microtask guarantees the (synchronous)
    // buildFloor() has already created the `floor-tile-grid` child before we
    // toggle its visibility.
    const _reapplyFloorHatch = (): void => {
        queueMicrotask(() => _applyFloorHatchVisibilityForView(_lastFloorHatchViewMode));
    };
    window.addEventListener('bim-floor-added',   _reapplyFloorHatch);
    window.addEventListener('bim-floor-updated', _reapplyFloorHatch);
    // Boot view is 3-D — hide the hatch immediately so it never flashes.
    _applyFloorHatchVisibilityForView('3D');

    // ── A.21.D34(c) RECURRENCE 2: Hide the flat ROOM-FILL overlay in the 3D view ──
    // SEPARATE artifact from the datum lines + floor hatch above. RoomBoundaryBuilder
    // (@pryzm/room-topology) lays one flat, translucent ShapeGeometry fill plane per
    // DETECTED room (`room-overlay-<id>`, userData.isRoomOverlay), on the ground at the
    // level elevation, built straight from `room.boundary.polygon`. For a freshly
    // detected room that has not been occupancy-tagged yet, RoomColourSystem.resolve()
    // returns the `unclassified` grey `#E0E0E0` at the default 0.35 opacity — so over
    // the white viewport it reads as a flat GREY plane lying on the ground. This is
    // EXACTLY the founder's live-test screenshot: a large grey rectangular plane on the
    // ground extending out from a façade (it overshoots a wall whenever the detected
    // room polygon bulges past the perimeter), and in plan it reads as a grey "shadow"
    // band on the boundary wall ("linked with room?"). It is a SCENE mesh — not a real
    // cast shadow and not a shadow-catcher — so the v50 Forma/Cesium ground fix and the
    // PascalSceneLighting sun/AO shadows are untouched.
    //
    // The room FILL is a 2-D documentation overlay (Revit shows room/area colour fills
    // in plan, never as a slab in the 3-D model), so — exactly like the datum-line and
    // floor-hatch fixes — we gate it to plan / section / elevation views and hide it in
    // the pure 3-D model view. The 2-D plan view paints its OWN room fills on the plan
    // CANVAS (PlanViewFillRenderer.renderRoomFills), so hiding this 3-D scene overlay
    // does NOT remove room colour from the plan. The room VOLUME mesh (isRoomVolume) is
    // already opt-in via the `showRoomVolumeColour` preference (default OFF) and is left
    // alone. Real geometry (walls, floor finish meshes, slabs) is untouched.
    const _applyRoomOverlayVisibilityForView = (mode?: string): void => {
        try {
            const is3DModelView = mode === '3D';
            const scene = world.scene.three as THREE.Scene;
            scene.traverse((obj: THREE.Object3D) => {
                if (obj.userData?.isRoomOverlay === true) {
                    obj.visible = !is3DModelView;
                }
            });
        } catch { /* non-fatal: overlay keeps its last visibility */ }
    };
    let _lastRoomOverlayViewMode: string | undefined = '3D';
    window.runtime?.events?.on('view-activated', (payload: unknown) => { // F.events.8
        _lastRoomOverlayViewMode = (payload as { mode?: string })?.mode;
        _applyRoomOverlayVisibilityForView(_lastRoomOverlayViewMode);
    });
    // Re-apply when rooms are (re)built — RoomBoundaryBuilder always creates the fill
    // overlay visible, so without this a room detected/updated while in the 3-D view
    // would show its grey plane until the next view switch. Deferred to a microtask for
    // the same reason as the floor hatch: initScene registers this BEFORE initBuilders
    // registers the room-mesh builder for the same event, so the microtask guarantees
    // the (synchronous) updateRoom() has already created `room-overlay-<id>` before we
    // toggle its visibility.
    const _reapplyRoomOverlay = (): void => {
        queueMicrotask(() => _applyRoomOverlayVisibilityForView(_lastRoomOverlayViewMode));
    };
    window.addEventListener('bim-room-added',   _reapplyRoomOverlay);
    window.addEventListener('bim-room-updated', _reapplyRoomOverlay);
    // Boot view is 3-D — hide the overlay immediately so it never flashes.
    _applyRoomOverlayVisibilityForView('3D');

    viewDependencyTracker.setLevelResolver((elementId) => bimManager.getLevelForElement(elementId)?.id);
    viewDependencyTracker.init();
    nativeElementMeshExporter.setBimManager(bimManager);

    // DOC-1.8: Enable native element edge projection by default.
    // Without this flag, EdgeProjectorService skips PRYZM native meshes (walls,
    // doors, stairs, slabs, etc.) so plan views only show IFC geometry.
    // The flag is settable at runtime: window.__PRYZM_FLAGS__.EDGE_PROJECTOR_NATIVE = false
    // to disable if performance issues arise on very large projects.
    if (!window.__PRYZM_FLAGS__) {
        window.__PRYZM_FLAGS__ = {};
    }
    if (window.__PRYZM_FLAGS__.EDGE_PROJECTOR_NATIVE === undefined) {
        window.__PRYZM_FLAGS__.EDGE_PROJECTOR_NATIVE = true;
    }

    // ── DOC-1.7: EdgeProjectorService — wired after bimManager is ready ──────
    // Phase 6 LAZY — was: `new EdgeProjectorService(components, world, bimManager)`
    // constructed eagerly here, pulling 1 870 LOC + 11 plan-symbol builders
    // (Door/Sofa/Bed/Kitchen/Wardrobe/Chair/Tree/Stair/Roof/Column/Window) +
    // OBC EdgeProjector + TechnicalDrawings into the boot graph. The service is
    // ONLY needed once the user activates a 2-D drawing view (plan / section /
    // elevation); 3-D-only sessions never invoke it.
    //
    // Pattern: build a Promise-returning façade with the same `{ project,
    // setRoofSlopeSymbolBuilder }` surface the consumers (ViewController,
    // PlanViewManager, SectionViewService, viewDependencyTracker callback,
    // EngineBootstrap RoofSlopeSymbolBuilder wire-up) already use. The first
    // call to `project()` lazy-imports the module, instantiates the real
    // service, replays any queued `setRoofSlopeSymbolBuilder` value, caches
    // the instance, and forwards the call. All `.project(...).then(...)`
    // chains in consumers continue to work — `project()` already returned a
    // Promise. `setRoofSlopeSymbolBuilder()` is a fire-and-forget setter, so
    // the façade just stores the latest value and applies it on construction.
    //
    // Mirrors the proven Phase 3 `_ensureXxx()` pattern (PdfExportService,
    // VisibilityIntentPanel, SheetEditorPanel) — adapted for a service
    // injected into multiple sites rather than read once from window.
    let _edgeProjectorServicePromise: Promise<EdgeProjectorService> | null = null;
    let _queuedRoofSlopeSymbolBuilder: any | null = null;
    const _ensureEdgeProjectorService = (): Promise<EdgeProjectorService> => {
        if (_edgeProjectorServicePromise) return _edgeProjectorServicePromise;
        _edgeProjectorServicePromise = (async () => {
            const { EdgeProjectorService: RealEdgeProjectorService } =
                await import('./views/EdgeProjectorService');
            const svc = new RealEdgeProjectorService(components, world, bimManager);
            // Replay any queued setRoofSlopeSymbolBuilder() that arrived before
            // the real service was constructed (EngineBootstrap.ts L1208 wires
            // it asynchronously while we may not have lazy-loaded yet).
            if (_queuedRoofSlopeSymbolBuilder) {
                try { svc.setRoofSlopeSymbolBuilder(_queuedRoofSlopeSymbolBuilder); }
                catch (err) {
                    console.error('[initScene] queued setRoofSlopeSymbolBuilder failed:', err);
                }
            }
            console.log('[initScene] Phase 6: EdgeProjectorService lazy-loaded on first projection.');
            return svc;
        })().catch((err) => {
            // Reset on failure so the next `project()` call retries instead of
            // forever returning the same rejected promise (matches Phase 3
            // proxy semantics — see PdfExportService precedent).
            _edgeProjectorServicePromise = null;
            console.error('[initScene] EdgeProjectorService lazy load failed:', err);
            throw err;
        });
        return _edgeProjectorServicePromise;
    };

    // Façade with the exact public surface used by ViewController /
    // PlanViewManager / SectionViewService / viewDependencyTracker /
    // EngineBootstrap. Cast to the real type so downstream `setEdgeProjectorService`
    // calls accept it without a type change at every consumer.
    const edgeProjectorService = {
        project: (
            viewDef:              Parameters<EdgeProjectorService['project']>[0],
            models:               Parameters<EdgeProjectorService['project']>[1],
            nativeMeshGroups:     Parameters<EdgeProjectorService['project']>[2],
            ifcSceneGroups?:      Parameters<EdgeProjectorService['project']>[3],
            planBelowDepthOffset?: Parameters<EdgeProjectorService['project']>[4],
        ): ReturnType<EdgeProjectorService['project']> => {
            return _ensureEdgeProjectorService().then(svc =>
                svc.project(viewDef, models, nativeMeshGroups, ifcSceneGroups, planBelowDepthOffset),
            );
        },
        setRoofSlopeSymbolBuilder: (builder: Parameters<EdgeProjectorService['setRoofSlopeSymbolBuilder']>[0]): void => {
            // If the real service is already loaded, forward immediately;
            // otherwise queue for replay during construction.
            if (_edgeProjectorServicePromise) {
                _edgeProjectorServicePromise
                    .then(svc => svc.setRoofSlopeSymbolBuilder(builder))
                    .catch(() => { /* ensure() already logged */ });
            } else {
                _queuedRoofSlopeSymbolBuilder = builder;
            }
        },
        // §C.4.4 — CW projection cache invalidation forwarded through the lazy
        // facade so CurtainWallBuilder.remove() does not need to import EPS
        // and callers do not need to await the lazy service promise.
        invalidateCwElement: (id: string): void => {
            if (_edgeProjectorServicePromise) {
                _edgeProjectorServicePromise
                    .then(svc => svc.invalidateCwElement(id))
                    .catch(() => { /* best effort */ });
            }
        },
        clearCwProjectionCache: (): void => {
            if (_edgeProjectorServicePromise) {
                _edgeProjectorServicePromise
                    .then(svc => svc.clearCwProjectionCache())
                    .catch(() => { /* best effort */ });
            }
        },
    } as unknown as EdgeProjectorService;

    viewController.setEdgeProjectorService(edgeProjectorService);
    // §ROOF-SYSTEM-AUDIT-2026 §5.4 — expose so EngineBootstrap can wire the
    // constructor-DI RoofSlopeSymbolBuilder once roofStore + commandManager exist.
    // The window global now points at the lazy façade (consumer-transparent).
    window.edgeProjectorService = edgeProjectorService;
    console.log('[initScene] DOC-1.7: EdgeProjectorService façade installed (lazy — real service loads on first projection).');

    // Wire ViewDependencyTracker re-projection callback (DOC-1.4 flush path).
    // When element changes mark views dirty, the 300ms-debounced flush calls this
    // for each dirty viewId, re-projecting IFC models (+ native when flag ON)
    // and updating the cache.  DOC-1.8: native groups included via feature flag.
    // DOC-1.5f: callback now receives `gen` — the monotonic generation number from
    // ViewTechnicalDrawingCache.beginProjection(). Use setIfCurrent() to reject
    // stale completions when the user edits geometry again before this one finishes.
    viewDependencyTracker.onReprojectionNeeded = async (viewId: string, gen: number) => {
        const viewDef = viewDefinitionStore.get(viewId);
        if (!viewDef) return;

        // §PERF-3D-SKIP (defense-in-depth): 3D views display the live THREE.js
        // scene mesh and do NOT use TechnicalDrawings from EdgeProjectorService.
        // Projecting the full building for a 3D view is catastrophically expensive
        // (9,461 edge geometries → 12,635ms LONGTASK observed in production).
        // ViewDependencyTracker._getAffectedViews() already excludes '3d' views
        // from being dirtied; this guard catches any path that bypasses that filter.
        if (viewDef.viewType === '3d') return;

        // DOC-2.5b: Auto-populate room tags for plan views whenever the view is
        // dirtied (e.g. after room detection or geometry edits). The populator
        // skips rooms that already have a tag in this view, so this is idempotent.
        if (viewDef.spatial.levelId) {
            roomTagAutoPopulator.populate(viewDef);
        }

        const fragmentsMgr = components.get(OBC.FragmentsManager);
        const allModels = fragmentsMgr.list.size > 0 ? Array.from(fragmentsMgr.list.values()) : [];
        // Apply IFC toggle — omit OBC fragment models when IFC is disabled for this view.
        const models = ifcProjectionStore.filterModels(allModels, viewId);
        // DOC-1.8: native groups included when EDGE_PROJECTOR_NATIVE flag is ON.
        const nativeGroups = window.__PRYZM_FLAGS__?.EDGE_PROJECTOR_NATIVE === true
            ? nativeElementMeshExporter.exportForView(viewDef)
            : [];

        // §28 / Contract 22 §4.1 — Collect IFC-imported scene groups (Source C).
        // IfcGeometryRenderer adds THREE.Group nodes with userData.source === 'ifc-import'
        // directly to the Three.js scene. They are NOT in OBC FragmentsManager so the
        // Source A EdgeProjector path cannot reach them. Collect them here so they are
        // included in every reprojection triggered by native element changes.
        const ifcSceneGroups: THREE.Group[] = [];
        if (ifcProjectionStore.shouldIncludeIFC(viewId)) {
            const scene = (world.scene as any)?.three as THREE.Scene | undefined;
            if (scene) {
                for (const obj of scene.children) {
                    if ((obj as THREE.Group).isGroup && obj.userData?.source === 'ifc-import') {
                        ifcSceneGroups.push(obj as THREE.Group);
                    }
                }
            }
        }

        if (models.length === 0 && nativeGroups.length === 0 && ifcSceneGroups.length === 0) return;
        try {
            const drawing = await edgeProjectorService.project(viewDef, models, nativeGroups, ifcSceneGroups);

            // DOC-1.5f: only commit to cache if this generation is still current.
            // If the user moved a wall again while this projection was in flight,
            // a newer generation will have been started and this result is discarded.
            const accepted = viewTechnicalDrawingCache.setIfCurrent(viewId, gen, drawing);
            if (!accepted) return; // stale — discard; newer projection will overwrite

            console.log(`[initScene] DOC-1.4/1.8: Re-projection complete for viewId=${viewId} gen=${gen} (OBC-IFC=${models.length}, native=${nativeGroups.length}, ifc-scene=${ifcSceneGroups.length})`);

            // DOC-1.13: Apply VG category styles to the freshly projected TechnicalDrawing.
            // vgSceneApplicator is created in initUI.ts and placed on window; it owns the
            // 'model-default' model record which covers all native (non-IFC) elements.
            const vgApplicator = window.vgSceneApplicator;
            if (vgApplicator && typeof vgApplicator.applyToProjectionLayers === 'function') {
                vgApplicator.applyToProjectionLayers(drawing, viewId);
            }

            // DOC-1.4: Mount the freshly projected TechnicalDrawing into the scene
            // so the vector overlay updates immediately after element changes.
            // mountReprojectedDrawing() is a no-op when the user has switched away
            // from the re-projected view, preventing stale drawing from appearing.
            viewController.mountReprojectedDrawing(viewId, drawing);
        } catch (err) {
            // §G1-T3 — disposeProxies: true disposes non-shared proxy geometries.
            nativeElementMeshExporter.releaseGroups(nativeGroups, { disposeProxies: true });
            console.error(`[initScene] DOC-1.4/1.8: Re-projection failed for viewId=${viewId} gen=${gen}`, err);
        }
    };

    window.addEventListener('bim-project-cleared', () => {
        viewDependencyTracker.clear();
        viewTechnicalDrawingCache.clear();
    });

    // Levels and grids are hidden by default — users can enable them via the
    // Visual panel ("Show Levels" / "Show Grids"). The checkboxes in Layout.ts
    // start unchecked and stay in sync with this initial state.
    bimManager.toggleVisibility('levels', false);
    bimManager.toggleVisibility('grids', false);

    // §02 Phase 2: Sync active level visual whenever ProjectContext changes.
    // Initial state: ground level L0 is always the starting active level.
    bimManager.setActiveLevel(projectContext.activeLevelId);
    projectContext.subscribe((event, data) => {
        if (event === 'activeLevelChanged') {
            bimManager.setActiveLevel(data.levelId);
        }
    });

    // ── PostproductionRenderer + camera events ────────────────────────────────
    const postproductionRenderer = world.renderer as OBCF.PostproductionRenderer;
    postproductionRenderer.postproduction.enabled = true;
    // Always expose the OBC WebGL renderer canvas so 3D view thumbnails on sheets
    // can capture real frames in both WebGL-only (Phase 1-4) and WebGPU (Phase 5) mode.
    // In WebGPU mode window.pryzmCanvas takes precedence; this is the fallback.
    window.obcRendererCanvas = postproductionRenderer.three.domElement;

    world.camera.projection.onChanged.add(() => {
        postproductionRenderer.postproduction.updateCamera();
    });

    // ── Phase 5 renderer state ─────────────────────────────────────────────
    // Declared here so Phase 5 setup block, resize handler, legacy service
    // handlers, and the RPM bind can all close over the same references.
    //   pryzmRenderer   — the PRYZM-owned renderer (WebGPU if Phase 5 ok, else OBC's WebGL)
    //   pryzmCanvas     — the overlay canvas element (null when Phase 5 inactive)
    //   isPhase5Active  — true after the Phase 5 setup block succeeds
    let pryzmRenderer:    THREE.WebGLRenderer      = postproductionRenderer.three;
    let pryzmCanvas:      HTMLCanvasElement | null = null;
    let isPhase5Active                             = false;

    const updateIfManualMode = () => {
        if (world.renderer && world.renderer.mode === OBC.RendererMode.MANUAL) {
            world.renderer.needsUpdate = true;
        }
    };

    world.camera.controls.addEventListener('update', updateIfManualMode);
    if (world.renderer) {
        world.renderer.onResize.add(updateIfManualMode);
    }

    // NOTE: bim-furniture-added/updated/removed listeners were removed from here
    // (Phase F-1).  They now live in initBuilders.ts alongside the furnitureBuilder
    // that owns the actual update/remove methods.

    const fragments = components.get(OBC.FragmentsManager);

    const gltfLoader = new GLTFLoader();

    const resize = () => {
        // Use the actual rendered area of #container (the 3D viewport).
        // Panels like the Split View or DataWorkbench narrow #container by
        // changing its CSS width.  Using window.innerWidth here caused the
        // OBC WebGL canvas (and camera frustum) to stay at full-window width
        // while the PRYZM WebGPU canvas (CSS width:100%) correctly shrank with
        // the container — making every raycast NDC coordinate wrong by the
        // fraction the panel occupies.  Using container.clientWidth keeps the
        // OBC canvas, camera aspect, and visible scene all using the same width.
        const width  = container.clientWidth  || window.innerWidth;
        const height = container.clientHeight || window.innerHeight;
        if (world.renderer) {
            world.renderer.three.setSize(width, height);
        }
        // Phase 5: keep PRYZM renderer in sync with the container size
        if (isPhase5Active && pryzmRenderer !== postproductionRenderer.three) {
            pryzmRenderer.setSize(width, height);
        }
        if (world.camera) {
            const camera = world.camera.three as THREE.PerspectiveCamera;
            if (camera.isPerspectiveCamera) {
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
            }
        }
    };
    resize();

    // C2 — Debounced pipeline rebuild on window resize (Phase C polish).
    // When the window resizes, the WebGPU render targets need to be recreated
    // at the new dimensions. A 200ms debounce prevents thrashing during a
    // continuous drag-resize. onProjectSwitch() handles the full rebuild.
    let _resizeRebuildTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRPMRebuild = () => {
        if (_resizeRebuildTimer !== null) clearTimeout(_resizeRebuildTimer);
        _resizeRebuildTimer = setTimeout(() => {
            _resizeRebuildTimer = null;
            window.renderPipelineManager?.onProjectSwitch?.();
        }, 200);
    };

    window.addEventListener('resize', () => {
        resize();
        scheduleRPMRebuild();
    });

    // F-P2: Also observe the editor container element itself.  When the
    // application is embedded in a split-pane shell (e.g. inspector panel
    // expanding/collapsing) the window 'resize' event does NOT fire — only
    // the container changes size.  ResizeObserver fires for both cases,
    // ensuring the renderer/camera aspect ratio always matches the actual
    // canvas size.  scheduleOnce coalesces rapid resize bursts into a single
    // update per frame (same pattern as scheduleRPMRebuild; named key
    // 'initScene-resize-coalesce' deduplicates repeated observer firings).
    const editorContainer = document.getElementById('container');
    if (editorContainer && typeof ResizeObserver !== 'undefined') {
        const roObserver = new ResizeObserver(() => {
            getFrameScheduler().scheduleOnce('initScene-resize-coalesce', () => {
                resize();
                scheduleRPMRebuild();
            });
        });
        roObserver.observe(editorContainer);
    }

    // ── Task 5.1 Phase 5: WebGL Context Loss Resilience ──────────────────────
    // GPU context can be lost when too much geometry is uploaded in a single
    // synchronous call stack — most commonly triggered by
    // CreateCurtainWallsOnAllSlabsCommand across a 20-floor building (80 builds).
    //
    // WebGL spec requires preventDefault() on contextlost for browser-initiated
    // recovery to be possible. Without it the context is permanently destroyed.
    //
    // On contextrestored: renderPipelineManager.onProjectSwitch() rebuilds all
    // render targets (including the depth-stencil buffer) at the current viewport
    // size, eliminating the depth-stencil mismatch that caused the post-context-loss
    // crash in Phases 1–4. The rAF loop is then restarted.
    {
        const _obcCanvas = postproductionRenderer.three.domElement;
        _obcCanvas.addEventListener('webglcontextlost', (evt: Event) => {
            evt.preventDefault();
            console.error(
                '[initScene] WebGL context lost — suspending rAF loop. ' +
                'Waiting for browser to restore context (may take 2–10 seconds).'
            );
            // BN-05c: WebGL context loss invalidates all compiled PSOs.
            // Reset the CW prewarm flag so the next CW batch re-compiles PSOs
            // against the restored context instead of relying on stale cache entries
            // that no longer exist — preventing a silent 14,000ms cold-PSO LONGTASK.
            try {
                if (typeof window.__resetCwPrewarm === 'function') {
                    window.__resetCwPrewarm();
                    console.log('[initScene] §BN-05c WebGL context lost — CW prewarm reset (PSOs invalidated)');
                }
                // BN-09a: Set GPU-recovery cooldown so prewarm does not fire until Three.js
                // has had 5s of render frames to garbage-collect stale GPU render objects
                // (nodeBuilderState=undefined) from the dead WebGL context.  Without this
                // cooldown the prewarm's rpm.render(0) calls immediately hit stale OutlineNode
                // buffers → vertex_OutlineNode.depth shader errors → 3ms abort each → 11ms
                // total → BN-05b catches it but PSOs are never compiled → 14,175ms LONGTASK.
                window.__cwPrewarmCooldownUntil = Date.now() + 5000;
                console.log('[initScene] §BN-09a WebGL context lost — CW prewarm cooldown set (5000ms)');
            } catch (_) { /* non-fatal */ }
            try { (unifiedFrameLoop as any).stop?.(); } catch (_) { /* ignore */ }
        }, false);
        _obcCanvas.addEventListener('webglcontextrestored', () => {
            console.warn(
                '[initScene] WebGL context restored — reinitialising post-processing pipeline.'
            );
            try {
                window.renderPipelineManager?.onProjectSwitch?.();
            } catch (restoreErr: any) {
                console.error(
                    '[initScene] Post-processing pipeline reinit after context restore failed:',
                    restoreErr?.message ?? restoreErr
                );
            }
            try { (unifiedFrameLoop as any).start?.(); } catch (_) { /* ignore */ }
        }, false);
        console.log('[initScene] Task 5.1: WebGL context loss handlers registered.');
    }

    // PERF-FIX (2026-05-01): Guard shadow update on camera rest.
    // In Phase 5 (WebGPU active) PRYZM's WebGPU renderer owns shadow management
    // exclusively — the shadow-depth texture lives on the WebGPU side.
    // Calling OBC's world.scene.updateShadows() here:
    //   (a) creates a synchronous GPU stall on every orbit-rest event → orbit jank
    //   (b) causes OBC's WebGL renderer to destroy and recreate light.shadow.map
    //       while PRYZM's WebGPU pipeline still holds references to it →
    //       "Destroyed texture [ShadowDepthTexture] used in a submit" ×479.
    // In non-Phase-5 (OBC WebGL only), the call is still incorrect because shadows
    // do not change on camera movement (shadow camera is fixed to the light, not the
    // view camera).  Shadow updates are handled after geometry changes instead
    // (see bim-*-added / bim-*-updated handlers below).
    // Contract: 01-BIM-ENGINE-CORE §4.3 — no scene mutations from frame callbacks.
    // §H15 (audit) — try/catch the async body. The listener is invoked by
    // camera-controls every time the camera rests; an exception inside
    // updateShadows() (the file's own comments document recurring "Destroyed
    // texture used in a submit" GPU-stall errors) would produce an unhandled
    // promise rejection on EVERY rest, polluting telemetry and previously
    // terminating the engine bootstrap path before §H11's global handlers
    // were wired.
    world.camera.controls.addEventListener("rest", () => {
        if (isPhase5Active) return;
        void Promise.resolve().then(async () => {
            try { await world.scene.updateShadows(); }
            catch (err) { console.warn('[initScene] updateShadows() on camera rest failed (non-fatal):', err); }
        });
    });

    // ── Camera Dragging Guard (Pascal §cameraDragging) ─────────────────────
    // Pascal custom-camera-controls.tsx: onTransitionStart → cameraDragging=true,
    // onRest/onSleep → cameraDragging=false.  This flag is read by SelectionManager
    // to prevent phantom selections when the user releases the mouse after orbiting.
    // PRYZM uses a window flag to avoid coupling SelectionManager to any state library.
    // PERF-FIX (2026-05-01): Wire camera motion to FrameScheduler.
    // ROOT CAUSE of orbit jank / "jumping":
    //   The @pryzm/frame-scheduler stops its rAF loop after 30 idle frames
    //   (ADR-006 "0 fps idle" idle-continuation gate).  OBC camera-controls
    //   runs on its OWN rAF loop — it updates camera position every frame
    //   regardless of whether PRYZM's scheduler is alive.  Without dirty
    //   flags from camera updates, the scheduler goes idle and stops calling
    //   UnifiedFrameLoop._tick().  The camera accumulates N frames of movement
    //   unrendered, then the loop wakes (e.g. on Escape / any state mutation)
    //   and the viewport jumps to the accumulated position.
    //
    // Fix: use the FrameScheduler motion gate (designed for exactly this case,
    //   per ADR-006 §"S17 motion gate") so the loop is alive for the full
    //   drag + damping tail.
    //   • controlstart → beginMotion('camera-orbit')  : drag begins
    //   • update       → beginMotion('camera-orbit')  : damping tail fires 'update'
    //                                                    even after controlend
    //   • rest / sleep → endMotion('camera-orbit')    : camera fully settled
    //   controlend does NOT end motion because the damping animation continues
    //   to fire 'update' events for several hundred ms after pointer release.
    //
    // Contract: 08-CAMERA-SYSTEM-CONTRACT §3 — camera events must keep the
    //   render loop alive for the full motion window including damping tail.
    world.camera.controls.addEventListener('controlstart', () => {
        window.isCameraDragging = true;
        getFrameScheduler().beginMotion();
    });
    // controlend fires immediately when the pointer is released after a camera control
    // action (orbit/pan/zoom). Clearing the drag flag here ensures that a click
    // immediately after releasing an orbit does not get blocked by a stale flag.
    // rest/sleep fire later (after damping settles) and serve as the motion-end signal.
    world.camera.controls.addEventListener('controlend', () => {
        window.isCameraDragging = false;
        // Do NOT call endMotion here — damping fires 'update' events for
        // several hundred ms after pointer release.  endMotion in rest/sleep.
    });
    world.camera.controls.addEventListener('update', () => {
        // Covers damping tail: camera-controls fires 'update' on every rAF
        // frame while the camera is still moving, even after controlend.
        // beginMotion is idempotent — no-op if motion is already active.
        getFrameScheduler().beginMotion();
    });
    world.camera.controls.addEventListener('rest', () => {
        window.isCameraDragging = false;
        getFrameScheduler().endMotion();
    });
    world.camera.controls.addEventListener('sleep', () => {
        window.isCameraDragging = false;
        getFrameScheduler().endMotion();
    });

    // B5: If the browser tab is hidden while a camera drag is in progress,
    // 'controlend' never fires (the browser pauses RAF and pointer events when
    // a tab is backgrounded), leaving isCameraDragging = true permanently.
    // ALL selection is blocked until the user manually triggers another drag.
    // Reset the flag on visibilitychange (tab hidden/shown) and window blur
    // (browser window loses focus) as a backstop against this silent lockup.
    const _resetDragOnFocusLoss = (): void => { window.isCameraDragging = false; };
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') _resetDragOnFocusLoss();
    });
    window.addEventListener('blur', _resetDragOnFocusLoss);

    // ── Phase 5: PRYZM-Owned WebGPU Renderer (OBC Decoupling) ────────────
    // Option C from 01-WEBGPU-RENDERING-MIGRATION §Phase-5:
    //   @thatopen/components is retained ONLY for IFC/Fragments geometry and
    //   the scene graph / camera controls.  It no longer owns the render loop.
    //
    // Implementation: a new <canvas> is overlaid on the #container div
    // (position:absolute, pointer-events:none, z-index:2).  OBC's canvas sits
    // behind it and continues to capture all pointer events for tools.
    // OBC's PostproductionRenderer is permanently set to MANUAL so it never
    // calls render.  The PRYZM WebGPU renderer uses OBC's scene + camera to
    // produce the final image.
    //
    // Legacy services (PathTracer, EnhancedBloom, SSGIService) that run their
    // own EffectComposer on postproductionRenderer.three suspend the PRYZM
    // canvas (display:none) on activate so OBC's canvas becomes visible, then
    // restore the PRYZM canvas on deactivate.
    try {
        // ── RENDERER PRE-WARM: consume fast path if available ─────────────────
        // `rendererPrewarm.ts` starts WebGPURenderer.init() during Phase B
        // (background) so the 2,401 ms GPU adapter + shader-compilation LONGTASK
        // is absorbed before the user opens a project.
        // If the pre-warm is still in flight (fast user) we await it here — the
        // user still gets a benefit since partial GPU work has already completed.
        // If the pre-warm failed or was never started, `prewarmed` is null and
        // we fall through to the original synchronous `createRenderer()` path.
        // NFT alignment: NFT-2 (project-load < 6 s p95) — 01-VISION.md §5.
        const { consumePrewarmedRenderer } = await import('../rendering/rendererPrewarm');
        const prewarmed = await consumePrewarmedRenderer();

        // Declare mutable holders — assigned in fast or slow path below.
        let webgpuCanvas: HTMLCanvasElement;
        let rendererResult: import('../rendering/createRenderer').RendererResult;

        const OVERLAY_CSS = [
            'position:absolute',
            'top:0',
            'left:0',
            'width:100%',
            'height:100%',
            'pointer-events:none',
            'z-index:2',
        ].join(';');

        if (prewarmed !== null) {
            // ── Fast path: renderer already initialised — O(1) hand-off ─────
            webgpuCanvas   = prewarmed.canvas;
            rendererResult = prewarmed.rendererResult;

            // Apply overlay CSS (canvas was detached during pre-warm)
            webgpuCanvas.style.cssText = OVERLAY_CSS;

            if (getComputedStyle(container).position === 'static') {
                container.style.position = 'relative';
            }

            // Sync canvas buffer size to current viewport (may have changed)
            webgpuCanvas.width  = window.innerWidth;
            webgpuCanvas.height = window.innerHeight;
            (rendererResult.renderer as any).setSize?.(window.innerWidth, window.innerHeight);

            container.appendChild(webgpuCanvas);

            // Pre-lock OBC — same contract as the slow path.
            postproductionRenderer.postproduction.enabled = false;
            (postproductionRenderer as any).mode          = OBC.RendererMode.MANUAL;
            postproductionRenderer.three.shadowMap.enabled = false;

            console.log('[initScene] Phase 5: pre-warmed renderer consumed — 2,401 ms LONGTASK skipped.');
        } else {
            // ── Slow path (fallback): create renderer on demand ──────────────
            // Reached when: (a) pre-warm was never started, (b) pre-warm failed,
            // or (c) a second project open already consumed the singleton.
            webgpuCanvas = document.createElement('canvas');
            webgpuCanvas.setAttribute('data-pryzm', 'webgpu');
            webgpuCanvas.style.cssText = OVERLAY_CSS;

            // Ensure the container is relatively positioned so z-index works
            if (getComputedStyle(container).position === 'static') {
                container.style.position = 'relative';
            }
            container.appendChild(webgpuCanvas);

            // Size the canvas buffer to match the current viewport
            webgpuCanvas.width  = window.innerWidth;
            webgpuCanvas.height = window.innerHeight;

            // ── Pre-lock: silence OBC BEFORE the async renderer creation ─────
            // `await createRenderer(...)` yields the JS event loop. During that
            // window OBC's AUTO render loop continues to fire, calling
            // WebGLShadowMap.render() and writing a WebGLRenderTarget into
            // light.shadow.map — overwriting and destroying the WebGPU
            // ShadowDepthTexture that PRYZM creates simultaneously.
            // Setting MANUAL + disabling shadowMap + postproduction here closes
            // the race before the await, not after it.
            postproductionRenderer.postproduction.enabled = false;
            (postproductionRenderer as any).mode          = OBC.RendererMode.MANUAL;
            postproductionRenderer.three.shadowMap.enabled = false;

            // Create the PRYZM renderer (WebGPU preferred, WebGL 2 fallback)
            rendererResult = await createRenderer(webgpuCanvas);
        }

        // Guard: only hand Phase 5 control to a renderer that can run the TSL pipeline.
        // createRenderer() now always tries WebGPURenderer first (WebGPU or WebGL2 backend).
        // Only falls back to a plain THREE.WebGLRenderer (backend='webgl-only') when
        // WebGPURenderer itself fails catastrophically — that renderer cannot drive the
        // TSL pipeline, so we abort Phase 5 and keep OBC in control.
        //
        // 'webgpu'         → native WebGPU backend — full TSL pipeline ✓
        // 'webgl-fallback' → WebGPURenderer with WebGL2 backend — TSL via GLSL ✓
        // 'webgl-only'     → plain THREE.WebGLRenderer — no TSL pipeline ✗
        const isWebGPUCapable = rendererResult.backend !== 'webgl-only';

        if (!isWebGPUCapable) {
            webgpuCanvas.remove();
            throw new Error(
                `[initScene] Phase 5 abort — renderer backend is ` +
                `'${rendererResult.backend}' (WebGL2 required for TSL pipeline). OBC renderer retained.`,
            );
        }

        pryzmRenderer        = rendererResult.renderer;
        pryzmCanvas          = webgpuCanvas;
        isPhase5Active       = true;

        // ── Silence OBC's camera-driven render trigger (fix 2) ────────────
        // `updateIfManualMode` is registered on camera-controls 'update' and
        // world.renderer.onResize.  Once OBC is in MANUAL mode it fires on
        // every pan/zoom, sets world.renderer.needsUpdate = true, and causes
        // OBC to render a WebGL frame concurrently with PRYZM's WebGPU loop.
        // That concurrent render recreates light.shadow.map, destroying
        // PRYZM's ShadowDepthTexture mid-submit → 500× GPU errors → black.
        // In Phase 5, PRYZM's UnifiedFrameLoop is the sole renderer; OBC must
        // be completely silent.
        world.camera.controls.removeEventListener('update', updateIfManualMode);
        try { (world.renderer?.onResize as any)?.delete(updateIfManualMode); } catch { /* OBC event API */ }

        // Lock OBC to MANUAL — it will never call render() again.
        // postproduction is also disabled: PRYZM's TSL pipeline replaces it.
        // (Already applied in the pre-lock above; repeated here for clarity.)
        postproductionRenderer.postproduction.enabled = false;
        (postproductionRenderer as any).mode          = OBC.RendererMode.MANUAL;

        // ── Phase 5: disable WebGL shadow-map rendering on OBC's renderer ──
        // OBC's WebGL renderer and PRYZM's WebGPU renderer share the same
        // THREE.DirectionalLight objects in the scene.  Both renderers write
        // their shadow render-target to light.shadow.map, but only ONE can own
        // it at a time.
        //
        // Root cause of "500× Destroyed texture [ShadowDepthTexture]":
        //   Every camera-controls 'update' event calls updateIfManualMode →
        //   OBC's WebGL renderer renders one frame → WebGLShadowMap.render()
        //   creates a new WebGLRenderTarget and writes it to light.shadow.map,
        //   disposing PRYZM's existing WebGPU shadow render-target.  PRYZM's
        //   render loop then submits command buffers that still reference the
        //   now-destroyed WebGPU depth texture → GPU validation errors ×500.
        //
        // Fix: disable shadowMap on OBC's WebGL renderer so it NEVER touches
        // light.shadow.map.  PRYZM's WebGPU renderer retains exclusive
        // ownership of all shadow rendering.
        postproductionRenderer.three.shadowMap.enabled = false;

        // ── Phase 5: clear scene.three.background ─────────────────────────
        // The TSL pipeline's bgUniform handles the background colour via the
        // compositing formula: finalOutput = mix(bgUniform, colorSource, contentAlpha).
        // This works correctly ONLY when background pixels have alpha=0 in the MRT
        // output attachment — so the geometry mask (hasGeometry = scenePassColor.a)
        // correctly identifies empty space (alpha=0) vs geometry (alpha=1).
        //
        // SceneTheme._applyHex() previously set world.scene.three.background to a
        // THREE.Color (e.g. white #ffffff). When the WebGPU renderer renders a scene
        // with a background color set, it renders a background quad into the MRT
        // framebuffer, giving ALL pixels alpha=1 — including empty space. This
        // defeats the geometry mask: hasGeometry=1 everywhere, bgUniform is never
        // mixed in, and sceneColor * ao on the white background = washed-out white
        // flooding the entire canvas (the "whitening layer" symptom).
        //
        // Fix: null the background — the renderer clears to alpha=0 (setClearAlpha(0)
        // is called each frame in RenderPipelineManager.render()) so background pixels
        // have alpha=0, and the bgUniform fills them via the mix() formula.
        world.scene.three.background = null;
        // Also prime the pryzmRenderer clear color to fully transparent so any
        // explicit clear before the pipeline runs doesn't bleed opaque white.
        try {
            (pryzmRenderer as any).setClearColor?.(new THREE.Color(0x000000), 0);
        } catch { /* not all renderer variants expose setClearColor */ }

        // Expose for debugging and for legacy service suspend/resume
        window.pryzmCanvas          = pryzmCanvas;
        window.pryzmRenderer        = pryzmRenderer;
        // Expose OBC WebGL renderer canvas for sheet 3D view thumbnail capture
        window.obcRendererCanvas    = postproductionRenderer.three.domElement;

        console.log(
            `[initScene] Phase 5 active — PRYZM renderer: ${rendererResult.backend}`,
        );
    } catch (phase5Err: any) {
        // Phase 5 failed — undo the pre-lock so OBC can render normally.
        // The pre-lock (postproduction.enabled=false, mode=MANUAL,
        // shadowMap.enabled=false) was applied inside the try block. If the
        // failure happened after the lock but before isPhase5Active=true, OBC
        // would be permanently silenced without this rollback.
        try {
            postproductionRenderer.postproduction.enabled = true;
            (postproductionRenderer as any).mode          = OBC.RendererMode.AUTO;
            postproductionRenderer.three.shadowMap.enabled = true;
        } catch { /* ignore rollback errors */ }
        console.warn(
            '[initScene] Phase 5 renderer setup failed — continuing with OBC WebGL renderer:',
            phase5Err?.message ?? phase5Err,
        );
        // pryzmRenderer stays as postproductionRenderer.three (no-op fallback)
    }
    // ── End Phase 5 ───────────────────────────────────────────────────────

    // ── Tier 2: In-Viewport Progressive Path Tracer ───────────────────────
    // ViewportPathTracer operates on the MAIN renderer canvas.
    // initScene owns the OBC-layer concerns (mode switching, postproduction);
    // ViewportPathTracer owns only the path-tracing accumulation loop.
    //
    // BUNDLE-SPLIT: the path tracer (and its three-gpu-pathtracer dependency)
    // is loaded lazily on first activation. Until then `viewportPathTracer`
    // is null. UI panels that read `window.viewportPathTracer` already
    // guard with optional chaining (vpt?.active), so this null state is safe.
    let viewportPathTracer: ViewportPathTracerType | null = null;
    let _vptModulePromise: Promise<typeof import('@pryzm/core-app-model/rendering')> | null = null;

    const _ensureViewportPathTracer = async (): Promise<ViewportPathTracerType> => {
        if (viewportPathTracer) return viewportPathTracer;
        if (!_vptModulePromise) {
            _vptModulePromise = import('@pryzm/core-app-model/rendering').catch(err => {
                // Reset on failure so the next activation retries cleanly.
                _vptModulePromise = null;
                throw err;
            });
        }
        const mod = await _vptModulePromise;
        if (!viewportPathTracer) {
            viewportPathTracer = new mod.ViewportPathTracer(postproductionRenderer.three);
            // Re-publish on window now that the instance exists. Panels that
            // queried earlier received null and no-op'd; subsequent reads see
            // the live instance.
            window.viewportPathTracer = viewportPathTracer;
        }
        return viewportPathTracer;
    };

    let _vptPrevMode: OBC.RendererMode = OBC.RendererMode.AUTO;

    const enableViewportRenderMode = async (opts?: object) => {
        const vpt = await _ensureViewportPathTracer();
        if (vpt.active) return;

        // Phase 5: suspend PRYZM canvas — VPT renders to OBC's WebGL canvas
        if (pryzmCanvas) pryzmCanvas.style.display = 'none';

        // 1. Disable postproduction effects (already false in Phase 5)
        postproductionRenderer.postproduction.enabled = false;

        // 2. Switch to MANUAL so OBC stops auto-rendering (already MANUAL in Phase 5)
        _vptPrevMode = postproductionRenderer.mode as OBC.RendererMode;
        postproductionRenderer.mode = OBC.RendererMode.MANUAL;

        // Wire callbacks to the ViewportRenderModePanel
        const vptPanel = window.viewportRenderModePanel;

        vpt.onSamplesUpdate = (samples, max, status) => {
            vptPanel?.updateSamples(samples, max, status);
        };
        vpt.onStatusChange = (status) => {
            vptPanel?.updateStatus(status);
            if (status === 'accumulating') vptPanel?.enableActions();
        };
        vpt.onError = (err) => {
            console.error('[ViewportPathTracer] Activation error:', err);
            // Restore renderer mode (deactivate is a no-op when already inactive).
            disableViewportRenderMode();
            // Show the error inside the VPT panel rather than dispatching a
            // 'vpt-mode-changed(false)' event which would hide the panel — the
            // panel stays open so the user can read the error and close it manually.
            const errMsg = err instanceof Error ? err.message : String(err);
            vptPanel?.updateStatus(`Activation failed: ${errMsg}`);
        };

        try {
            await vpt.activate(
                world.scene.three,
                world.camera.three,
                opts ?? {},
            );
            window.runtime?.events?.emit('vpt-mode-changed', { active: true }); // F.events.10
        } catch {
            // activate() already called onError; restore state
            // Phase 5: stay in MANUAL mode — only restore if Phase 5 is not active
            if (!isPhase5Active) {
                postproductionRenderer.mode = _vptPrevMode;
                postproductionRenderer.postproduction.enabled = true;
                postproductionRenderer.needsUpdate = true;
            }
            // Phase 5: re-show PRYZM canvas on failed activation
            if (pryzmCanvas) pryzmCanvas.style.removeProperty('display');
        }
    };

    const disableViewportRenderMode = () => {
        // Lazy-loaded VPT may still be null (never activated) — safe no-op.
        if (!viewportPathTracer || !viewportPathTracer.active) return;

        // Deactivate path tracer (restores scene env)
        viewportPathTracer.deactivate(world.scene.three);

        // Phase 5: restore PRYZM canvas — WebGPU rendering resumes
        if (pryzmCanvas) pryzmCanvas.style.removeProperty('display');

        // Phase 5: stay in MANUAL, postproduction stays disabled
        if (!isPhase5Active) {
            postproductionRenderer.mode = _vptPrevMode;
            postproductionRenderer.postproduction.enabled = true;
            postproductionRenderer.needsUpdate = true;
        }
    };

    // Reset accumulation when camera moves during path tracing.
    // Lazy-loaded: viewportPathTracer is null until first activation.
    world.camera.controls.addEventListener('update', () => {
        if (viewportPathTracer?.active) {
            viewportPathTracer.reset();
        }
    });

    // Auto-exit render mode when the user makes any BIM edit
    const _vptEditEvents = [
        'bim-wall-updated',       'bim-wall-removed',
        'bim-slab-updated',       'bim-slab-removed',
        'bim-furniture-added',    'bim-furniture-updated',    'bim-furniture-removed',
        'bim-roof-updated',       'bim-stair-updated',
        'bim-column-updated',     'bim-beam-updated',
        'bim-curtainwall-updated','bim-plumbing-updated',
    ] as const;
    _vptEditEvents.forEach(evt => {
        window.addEventListener(evt, () => {
            if (viewportPathTracer?.active) {
                disableViewportRenderMode();
                window.runtime?.events?.emit('vpt-mode-changed', { active: false }); // F.events.10
            }
        });
    });

    // Expose on window for UI layer and panel callbacks.
    // viewportPathTracer is null until first activation; _ensureViewportPathTracer()
    // re-publishes the live instance once it's constructed. UI panels already
    // guard their reads with optional chaining (vpt?.active), so this is safe.
    window.viewportPathTracer        = viewportPathTracer; // null until first activation
    window.enableViewportRenderMode  = enableViewportRenderMode;
    window.disableViewportRenderMode = disableViewportRenderMode;

    // ── End Tier 2 ────────────────────────────────────────────────────────

    // ── Pascal Lighting — MUST run before any pipeline compilation ────────
    // Apply Pascal's directional light setup (3 directional + ambient) NOW,
    // before RenderingPipelineCoordinator and RenderPipelineManager compile
    // any GPU shaders.  Applying lights after compilation causes a race:
    //
    //   1. Pipeline compiles with no shadow light → no ShadowDepthTexture binding
    //   2. pascalSceneLighting.apply() adds castShadow key light
    //   3. First render creates ShadowDepthTexture V1
    //   4. ShadowQualityUpgrader (async, from coordinator) disposes shadow.map
    //      → destroys V1 while the rAF loop is still submitting command buffers
    //   5. WebGPU: "Destroyed texture [ShadowDepthTexture] used in a submit"
    //
    // Applying lights here (before coordinator + RPM) guarantees:
    //   • ShadowQualityUpgrader finds shadow.map=null (not yet rendered) →
    //     dispose() is a no-op → no texture destruction
    //   • RenderPipelineManager compiles the scenePass with the shadow light
    //     already in the scene → ShadowDepthTexture bindings are correct
    //     from the first frame → no need for scheduleShadowRebuild() at startup
    //
    // Reference: Pascal/packages/viewer/src/components/viewer/lights.tsx
    try {
        pascalSceneLighting.apply(world.scene.three as THREE.Scene);
    } catch (pslEarlyErr: any) {
        console.warn('[initScene] PascalSceneLighting early apply error:', pslEarlyErr?.message ?? pslEarlyErr);
    }
    // ── End early Pascal Lighting apply ───────────────────────────────────

    // ── Rendering Pipeline Coordinator (Phase 1 + 2 — Enscape-level) ─────
    // Orchestrates: RealtimeLightingService, ShadowQualityUpgrader,
    // PBRSceneUpgrader, ReflectionProbeService.
    // Each service is isolated to the Three.js projection layer (§4.3).
    // Wrapped in try/catch so any failure does NOT break existing engine init.
    try {
        const renderingCoordinator = new RenderingPipelineCoordinator();
        renderingCoordinator.bind(
            world.scene.three as THREE.Scene,
            postproductionRenderer.three,
        );

        // Wire state changes to the quality panel
        renderingCoordinator.onStateChange = (state) => {
            window.renderingQualityPanel?.syncState(
                state.enhancementLevel,
                state.hdriPresetId,
            );
        };

        // Expose for UI and VPT interop
        window.renderingPipelineCoordinator = renderingCoordinator;

        // §A.21.D40 PBR-SCOPE — meshes already handed to the PBR upgrader.
        // The upgrader itself is idempotent at the MATERIAL level (it skips any
        // material already snapshotted), but the post-batch callback used to
        // `scene.traverse` ALL ~520 meshes and chunk them through the upgrader on
        // EVERY batch — re-walking the entire scene N times during a multi-batch
        // house generate (the `totalPbrMs=1328.6ms` / `943ms` lines). Tracking the
        // meshes we've already processed lets each batch upgrade ONLY its NEW
        // meshes, so a later batch never re-iterates earlier storeys' geometry.
        // Correctness is unchanged — every mesh is still upgraded exactly once.
        const pbrSeenMeshes = new WeakSet<THREE.Object3D>();
        /** Collect scene meshes not yet handed to the PBR upgrader, marking them
         *  seen. Returns only the genuinely-new meshes for this pass. */
        const collectNewPbrMeshes = (scene: THREE.Scene): THREE.Mesh[] => {
            const fresh: THREE.Mesh[] = [];
            scene.traverse(obj => {
                if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
                    if (pbrSeenMeshes.has(obj)) return;
                    pbrSeenMeshes.add(obj);
                    fresh.push(obj as THREE.Mesh);
                }
            });
            return fresh;
        };

        // Notify coordinator when new BIM geometry is added so incremental
        // PBR upgrade can run on newly created meshes.
        // Includes both '-added' events (project loading via CreateWallCommand etc.)
        // and '-updated' events (live editing).  setTimeout(0) defers until after
        // WallFragmentBuilder / SlabFragmentBuilder have added their meshes to scene.
        const _rpcGeomEvents = [
            'bim-wall-added',      'bim-wall-updated',
            'bim-slab-added',      'bim-slab-updated',
            'bim-ceiling-added',   'bim-ceiling-updated',
            'bim-floor-added',     'bim-floor-updated',
            'bim-column-added',    'bim-column-updated',
            'bim-beam-added',      'bim-beam-updated',
            'bim-roof-added',      'bim-roof-updated',
            'bim-stair-added',     'bim-stair-updated',
            'bim-curtainwall-added', 'bim-curtainwall-updated',
            'bim-furniture-added', 'bim-furniture-updated',
        ] as const;
        _rpcGeomEvents.forEach(evt => {
            window.addEventListener(evt, () => {
                // P1.3: Skip per-element scene traversal during a batch.
                // batchCoordinator.setPostBatchCallback (below) fires a single
                // consolidated pass for all elements after the batch completes.
                if (batchCoordinator.isBatching) return;
                // Defer one tick so fragment builders can add meshes before we scan
                setTimeout(() => {
                    const scene = world.scene.three as THREE.Scene;
                    // §A.21.D40 PBR-SCOPE — only the meshes we haven't already
                    // upgraded (was: a full scene.traverse on every geometry event).
                    const newMeshes = collectNewPbrMeshes(scene);
                    if (newMeshes.length > 0) renderingCoordinator.onSceneGeometryAdded(newMeshes);
                    // NOTE: scheduleShadowRebuild() is intentionally NOT called here.
                    // Setting castShadow/receiveShadow on individual meshes does NOT
                    // destroy or recreate ShadowDepthTexture — the texture lives on
                    // the light (DirectionalLightShadow.map), not on meshes.  Calling
                    // scheduleShadowRebuild() on every geometry event causes needless
                    // pipeline rebuilds and can itself trigger the "Destroyed texture"
                    // error by disposing the pipeline mid-render.
                }, 0);
            });
        });

        // P1.3: Single consolidated geometry pass after every batch completes.
        // During a batch (e.g. 50 curtain walls via AI), the per-element `bim-*-added`
        // window events are gated above (isBatching guard) and in the Pascal block below.
        // _executeFinalSweep() fires this callback ONCE after storeEventBus.endBatch(),
        // when all geometry is stable and all registrations are complete.
        // The setTimeout(0) here matches the existing per-element deferred pattern,
        // ensuring any trailing one-tick builder work lands before the scan.
        batchCoordinator.setPostBatchCallback(() => {
            // §FIX-SKIP-PBR-UPGRADE (2026-05-05): Curtain-wall batches pass skipPbrUpgrade:true
            // because curtain wall materials are already MeshStandardMaterial (PBR-ready).
            // The scene-traverse + needsUpdate=true pass measured ~482 ms for 626 meshes even
            // after the chunk fix — skipping it eliminates this cost with no visual regression.
            //
            // RACE-FIX (2026-05-05): capture the flag synchronously NOW — before any
            // requestIdleCallback or forceReset() can reset _skipPbrUpgrade to false.
            // Reading batchCoordinator.skipPbrUpgrade inside requestIdleCallback() is too
            // late: forceReset() (called on project switch) resets the field before the
            // idle callback fires, making the guard always read false.
            const shouldSkipPbr = batchCoordinator.skipPbrUpgrade;
            if (shouldSkipPbr) {
                console.log(
                    '[BatchCoordinator/P1.3] §TRACE PBR-UPGRADE-SKIPPED ' +
                    '(skipPbrUpgrade=true — curtain-wall batch; materials are already PBR-ready)'
                );
                return;
            }
            console.log(
                '[BatchCoordinator/P1.3] §TRACE PBR-UPGRADE-RUNNING ' +
                '(skipPbrUpgrade=false at post-batch callback time — running upgrade)'
            );

            // PERF-DEFER-PBR-IDLE (Curtain Wall Batch Optimisation):
            //   The entire PBR upgrade pass is deferred to browser idle time via
            //   requestIdleCallback (or a 100 ms setTimeout fallback on environments
            //   where requestIdleCallback is undefined, e.g. WebWorkers / old WebKit).
            //
            //   Rationale: PBR upgrade (scene.traverse + needsUpdate=true per chunk) is
            //   pure material metadata work — it does not contribute to the first visible
            //   frame after a batch.  Running it during a busy-idle gap (deadline ≥ 1 ms)
            //   instead of immediately after the batch completes removes ~100–200 ms from
            //   the critical path for large projects.  timeout:5000 ensures the upgrade
            //   runs within 5 s even if the tab never has a full idle gap (e.g. continuous
            //   animation or sustained user interaction).
            //
            // P1.3 fix (2026-05-04): inner work uses canonical FrameScheduler 'post-render'
            // slot (C04 §3, C11 §6.1, P3 single-rAF-owner) — unchanged from before.
            //
            // §FIX-POST-BATCH-SHADOW (2026-05-04):
            //   pascalSceneLighting.onGeometryAdded(scene) is NO LONGER called here.
            //   Root cause: calling it here caused a second synchronous shadow-flag
            //   sweep over all 332+ existing meshes AFTER CurtainWallBuilder._reactivateShadows()
            //   had already flagged them in the _drainRegistrations → _onShadowReactivation path.
            //   WebGPU treats the re-flag as a pipeline dirty signal and recompiles all shadow
            //   depth PSOs synchronously on the next render() call — producing the observed
            //   ~14,950ms LONGTASK (measured 2026-05-04 console log session).
            //   Shadow reactivation is fully owned by CurtainWallBuilder._reactivateShadows()
            //   which already slices the work across post-render frames (WALLS_PER_SHADOW_FRAME=10).
            //
            // §FIX-POST-BATCH-PBR-CHUNK (2026-05-04):
            //   PBR upgrade is chunked across post-render frames (CHUNK=120 meshes/frame)
            //   instead of a single synchronous scene.traverse() over 626+ meshes.
            //   The previous synchronous pass took ~482ms (measured same session).
            //   upgradeNewMeshes() already skips materials that are in _snapshots, so only
            //   truly new materials pay the needsUpdate=true cost per chunk.
            const runPbrUpgrade = () => {
                const __t_pbr_idle = performance.now();
                console.log(
                    `[BatchCoordinator/P1.3] §TRACE PBR-UPGRADE-IDLE-START ` +
                    `idleCallbackT=${__t_pbr_idle.toFixed(1)}ms ` +
                    `(requestIdleCallback fired — scheduling post-render traversal)`
                );
                getFrameScheduler().scheduleOnce('p1.3-post-batch-pbr', () => {
                    const __t_pbr_traverse = performance.now();
                    const scene = world.scene.three as THREE.Scene;
                    const PBR_CHUNK = 120;
                    // §A.21.D40 PBR-SCOPE — only this batch's NEW meshes, not a full
                    // re-walk of the whole scene every batch. During a multi-batch
                    // house generate the old full traverse re-iterated ALL ~520
                    // meshes on each batch (the repeated `totalPbrMs≈1300ms`/`943ms`
                    // post-batch lines); scoping to fresh meshes makes every later
                    // batch's pass O(its own additions). Materials are still upgraded
                    // exactly once (the upgrader is material-idempotent regardless).
                    const allMeshes = collectNewPbrMeshes(scene);
                    const total = allMeshes.length;
                    console.log(
                        `[BatchCoordinator/P1.3] §TRACE PBR-UPGRADE-TRAVERSE-DONE ` +
                        `newMeshes=${total} chunks=${Math.ceil(total / PBR_CHUNK)} ` +
                        `traverseMs=${(performance.now() - __t_pbr_traverse).toFixed(1)}ms ` +
                        `(§A.21.D40 PBR-SCOPE — new meshes only)`
                    );
                    if (total === 0) {
                        console.log(
                            '[BatchCoordinator/P1.3] §TRACE PBR-UPGRADE-COMPLETE ' +
                            '0 new mesh(es) — nothing to upgrade this batch (§A.21.D40 PBR-SCOPE)'
                        );
                        return;
                    }
                    let offset = 0;
                    let chunkIndex = 0;
                    const __t_pbr_chunk_start = performance.now();
                    const upgradeChunk = () => {
                        const __t_chunk = performance.now();
                        chunkIndex++;
                        const slice = allMeshes.slice(offset, offset + PBR_CHUNK);
                        renderingCoordinator.onSceneGeometryAdded(slice);
                        offset += PBR_CHUNK;
                        if (offset < total) {
                            console.log(
                                `[BatchCoordinator/P1.3] §TRACE PBR-CHUNK-${chunkIndex} ` +
                                `meshes=${slice.length} remaining=${total - offset} ` +
                                `chunkMs=${(performance.now() - __t_chunk).toFixed(1)}ms`
                            );
                            getFrameScheduler().scheduleOnce(
                                'p1.3-post-batch-pbr-chunk',
                                upgradeChunk,
                                'post-render',
                            );
                        } else {
                            console.log(
                                `[BatchCoordinator/P1.3] §TRACE PBR-UPGRADE-COMPLETE ` +
                                `${total} mesh(es) in ${chunkIndex} chunk(s) ` +
                                `totalPbrMs=${(performance.now() - __t_pbr_chunk_start).toFixed(1)}ms ` +
                                `(§FIX-POST-BATCH-PBR-CHUNK)`
                            );
                        }
                    };
                    upgradeChunk();
                }, 'post-render');
            };

            // PERF-DEFER-PBR-IDLE: defer to idle time; fall back to setTimeout if the
            // API is not available (SSR, older Safari, some WebView environments).
            if (typeof requestIdleCallback !== 'undefined') {
                requestIdleCallback(runPbrUpgrade, { timeout: 5000 });
            } else {
                setTimeout(runPbrUpgrade, 100);
            }
        });

        // ── Auto-activate rendering quality at startup ────────────────────
        // When Phase 5 (PRYZM WebGPU renderer) is active, PascalSceneLighting
        // manages all lighting with Pascal's exact 3-directional-light setup and
        // clears scene.environment = null. HDRI IBL must NOT be loaded in this
        // path because it floods the scene with uniform ambient light that makes
        // SSGI AO (~15-30% darkening) invisible. We activate 'standard' quality
        // only (PBR materials + shadows, no HDRI) to match Pascal's rendering.
        //
        // When Phase 5 is inactive (OBC WebGL renderer), HDRI is still useful
        // for IBL-based material previews. Restores from localStorage (default 'high').
        (async () => {
            try {
                const QUALITY_KEY = 'pryzm_quality_level';
                const HDRI_KEY    = 'pryzm_hdri_preset';

                let activationLevel: 'off' | 'standard' | 'high' | 'ultra';
                let storedHdri: string;

                if (isPhase5Active) {
                    // Phase 5: WebGPU + PascalSceneLighting — NO HDRI
                    // PascalSceneLighting clears scene.environment to null.
                    // Activate 'standard' only (PBR + shadows, no HDRI load).
                    activationLevel = 'standard';
                    storedHdri      = 'none';
                    console.log('[initScene] Phase 5 active — skipping HDRI, using standard PBR only.');
                } else {
                    // OBC WebGL path: restore last-used quality from localStorage
                    activationLevel = (localStorage.getItem(QUALITY_KEY) ?? 'high') as
                        'off' | 'standard' | 'high' | 'ultra';
                    storedHdri = localStorage.getItem(HDRI_KEY) ?? 'daylight-interior';
                }

                await renderingCoordinator.activateRealtimeEnhancements(activationLevel, {
                    hdriPresetId: storedHdri,
                });
                console.log(`[initScene] Auto-activated quality "${activationLevel}" (hdri: ${storedHdri}) at startup.`);
            } catch (autoErr: any) {
                console.warn('[initScene] Auto PBR activation error:', autoErr?.message ?? autoErr);
            }
        })();
        // ── End auto-activate ─────────────────────────────────────────────

        console.log('[initScene] RenderingPipelineCoordinator ready.');
    } catch (rpcErr: any) {
        console.warn('[initScene] RenderingPipelineCoordinator init error:', rpcErr?.message ?? rpcErr);
    }

    // ── End Rendering Pipeline Coordinator ────────────────────────────────

    // ── WebGPU TSL Render Pipeline (Phases 2–5 — MRT, SSGI, TRAA, Outlines) ──
    // RenderPipelineManager assembles: ScenePass (MRT), ZonePass, PostProcessing,
    // SSGIPass (GTAONode + DenoiseNode), TRAAPass, OutlinePass.
    // Phase 5: pryzmRenderer is now a PRYZM-owned WebGPU renderer (or WebGL 2
    // fallback via WebGPURenderer).  bind() detects it via `.isWebGPURenderer === true`
    // (r183 API) and activates the full TSL pipeline.
    // Wrapped in try/catch so any failure does NOT break existing engine init.

    // ── §5.1 Viewport Crash Guard + §5.4 Render Health Indicator ─────────
    // Created BEFORE the RPM try block so they are active during pipeline init.
    // ViewportCrashGuard monitors window 'error' / 'unhandledrejection' events
    // and intercepts GPU/render-related errors to show SceneCrashFallback.
    // RenderHealthIndicator shows a bottom-right badge when the pipeline
    // degrades (retrying) or enters permanent error state.
    // Phase B.39 (S73-WIRE) — thread composed runtime so the crash guard
    // and health indicator can route through runtime.telemetry once C lands.
    const viewportCrashGuard   = new ViewportCrashGuard(runtime /* B-runtime-thread ViewportCrashGuard */);
    const renderHealthIndicator = new RenderHealthIndicator(runtime /* B-runtime-thread RenderHealthIndicator */);
    renderHealthIndicator.mount();
    viewportCrashGuard.activate();

    try {
        const renderPipelineManager = new RenderPipelineManager();

        renderPipelineManager.onStateChange = (status) => {
            console.log(
                `[RenderPipelineManager] Phase: ${status.phase} | ` +
                `WebGPU: ${status.webGpuActive} | SSGI: ${status.ssgiActive} | ` +
                `TRAA: ${status.traaActive}`,
            );

            // Fix 2: Keep window.currentPipelinePhase updated so
            // VisualizationEnginePanel._autoActivateIfNeeded() can guard against
            // calling activateRealtimeEnhancements while the WebGPU TSL pipeline owns the
            // render loop (Phase 3+). Numeric mapping: idle=0, phase2=2, phase3=3, phase4=4,
            // error=-1. Any value >= 3 means TSL post-processing is active.
            const phaseNumber: Record<string, number> = {
                idle: 0, phase2: 2, phase3: 3, phase4: 4, error: -1,
            };
            window.currentPipelinePhase = phaseNumber[status.phase] ?? 0;

            // §5.4 — Sync health indicator with pipeline status
            renderHealthIndicator.syncFromPipelineStatus(status);

            // §5.1 — Show crash fallback when pipeline retries are exhausted
            if (status.phase === 'error') {
                viewportCrashGuard.handlePipelineError();
            }
        };

        // Phase 5: bind to pryzmRenderer (WebGPU if Phase 5 succeeded, OBC WebGL as fallback).
        // When WebGPU active, bind() sets _webGpuActive=true and builds the TSL pipeline.
        // Always start with a pure white background (light theme).
        // Binding with 'light' initialises the TSL bgUniform directly to #ffffff —
        // no extra setColor() call needed, so there is no dark→white flash.
        await renderPipelineManager.bind(
            world.scene.three as THREE.Scene,
            world.camera.three,
            pryzmRenderer,
            'light',
        );

        // ── Phase 3 + 4: Activate full TSL post-processing pipeline ───────
        // bind() establishes Phase 2 (MRT + ScenePass + background blend only).
        //
        // Phase B (r183 upgrade):
        //   activateSSGI()     — Phase 3: SSGINode (r183) ambient occlusion + AI denoiser
        //   activateOutlines() — Phase 4: TSL selection + pulsing hover outlines
        //   activateTRAA()     — Phase 4: TRAANode (r183) colour filter — removes edge aliasing
        //
        // TRAA is now active: r183 ships TRAANode.js (colour filter) which accepts a
        // composite colour node as input and slots cleanly after SSGI + outlines.
        // The r175 TRAAPassNode (scene-level pass) is no longer used.
        //
        // Each method is a no-op if WebGPU is inactive (status.webGpuActive = false),
        // so this block is safe when the OBC WebGL fallback is in effect.
        //
        // ORDERING CONTRACT (GPU safety):
        // activateSSGI() + activateOutlines() MUST run before UnifiedFrameLoop.start().
        // Both calls trigger WebGPU pipeline rebuilds that destroy and recreate internal
        // textures (including ShadowDepthTexture).  If the render loop is already
        // submitting command buffers when the rebuild runs, the submitted buffers still
        // hold references to the old (destroyed) textures → WebGPU validation error
        // "Destroyed texture [ShadowDepthTexture] used in a submit" on every frame.
        //
        // Deferring these calls after loop start caused exactly that crash (2026-05-01).
        // They stay here — synchronous, before UnifiedFrameLoop.start() below.
        //
        // NOTE: TRAA is intentionally NOT activated here.
        // The default UI state (RenderRailPanel) has TRAA OFF.
        // Activating TRAA at startup and then deactivating it in the panel
        // triggers two consecutive pipeline rebuilds that reset the SSGI
        // temporal-accumulation history and cause the scene to flicker.
        // TRAA is activated on-demand when the user enables it in the panel.
        if (renderPipelineManager.status.webGpuActive) {
            await renderPipelineManager.activateSSGI();
            await renderPipelineManager.activateOutlines();
            console.log('[initScene] TSL pipeline at Phase 3/4 (SSGI + Outlines). TRAA OFF by default.');
        }

        window.renderPipelineManager = renderPipelineManager;

        // ── Phase 2 Performance: IViewSwitchListener + FrameCoordinator ──────
        // Register RPM as a view-switch listener so ViewController calls
        // rpm.onBeforeViewSwitch() / rpm.onAfterViewSwitch() directly, replacing
        // the window.renderPipelineManager globals. Also inject the
        // shared FrameCoordinator so RPM can skip post-processing during switches.
        viewController.registerViewSwitchListener(renderPipelineManager);
        renderPipelineManager.setFrameCoordinator(frameCoordinator);
        // ── End Phase 2 wiring ────────────────────────────────────────────────

        // Project-switch handler: clear stale outline refs ONLY — no pipeline
        // rebuild here, because the rebuild fires expensive GPU longtasks that
        // blank the screen while elements are still loading.  The rebuild is
        // deferred to onProjectLoaded() below, which runs after all elements are
        // visible, so the user sees geometry continuously through the switch.
        //
        // Pascal SceneLoader (canvas freeze-frame): additionally mount a
        // backdrop-blurred overlay on the 3D canvas itself so that the scene-
        // clear / geometry-reload cycle is invisible to the user.  The overlay
        // is removed by the pryzm-project-loaded handler below.
        let _switchFreezeFrame: HTMLElement | null = null;
        // Debounce guard: pryzm-project-switch can fire more than once per actual
        // project navigation (e.g. the 200ms resize-debounce from a viewport resize
        // coincides with the event, or rapid project hub browsing). A 400ms window
        // prevents duplicate pipeline clears and camera-store wipes that corrupt
        // the MultiViewCameraManager perspective slot with plan-view coordinates.
        let _lastProjectSwitchMs = 0;
        window.runtime?.events?.on('pryzm-project-switch', (p: { projectId: string; projectName: string }) => { // F.events.15
            const now = Date.now();
            if (now - _lastProjectSwitchMs < 400) {
                console.log('[initScene] pryzm-project-switch debounced (duplicate within 400ms) — skipping');
                return;
            }
            _lastProjectSwitchMs = now;
            console.log('[initScene] pryzm-project-switch received — project:', p.projectId);
            renderPipelineManager.onProjectSwitch();
            // Phase 2: clear per-view camera states so the new project starts
            // with fresh default framing rather than stale positions.
            viewController.clearCameraStateStore();
            // §C.5 — Clear EPS projection cache on project switch so Project A's
            // CW drawing-space geometries are never replayed into Project B views.
            // The edgeProjectorService facade forwards to the real service if it
            // has already been lazy-loaded; otherwise this is a safe no-op.
            try { (edgeProjectorService as any).clearCwProjectionCache?.(); } catch { /* best effort */ }

            // Mount freeze-frame overlay on the viewport container.
            // Skip if the full-screen EngineLoadingOverlay is already covering
            // everything (identified by its DOM id).
            if (!document.getElementById('pryzm-engine-loading-overlay') && !_switchFreezeFrame) {
                const ff = document.createElement('div');
                ff.id = 'pryzm-switch-freeze-frame';
                ff.style.cssText = [
                    'position:absolute',
                    'inset:0',
                    'z-index:9998',
                    'backdrop-filter:blur(6px) brightness(0.92)',
                    '-webkit-backdrop-filter:blur(6px) brightness(0.92)',
                    'background:rgba(255,255,255,0.18)',
                    'display:flex',
                    'align-items:center',
                    'justify-content:center',
                    'opacity:0',
                    'transition:opacity 0.2s ease',
                    'pointer-events:none',
                ].join(';');
                // Subtle spinner so the user knows something is happening
                ff.innerHTML = `<div style="
                    width:36px;height:36px;border-radius:50%;
                    border:3px solid rgba(102,0,255,0.15);
                    border-top-color:#6600FF;
                    animation:pryzm-ff-spin 0.8s linear infinite;
                "></div>`;
                // Ensure keyframe exists once
                if (!document.getElementById('pryzm-ff-keyframe')) {
                    const style = document.createElement('style');
                    style.id = 'pryzm-ff-keyframe';
                    style.textContent = '@keyframes pryzm-ff-spin{to{transform:rotate(360deg)}}';
                    document.head.appendChild(style);
                }
                // container must be position:relative for absolute child to work
                if (getComputedStyle(container).position === 'static') {
                    container.style.position = 'relative';
                }
                container.appendChild(ff);
                // Fade in on next frame so the transition fires.
                // D.7.6: routed through getFrameScheduler() instead of raw rAF.
                getFrameScheduler().scheduleOnce(
                    'init-scene-freeze-frame-fadein',
                    () => { ff.style.opacity = '1'; },
                );
                _switchFreezeFrame = ff;
            }
        });

        // pryzm-project-loaded: elements are fully rendered at this point.
        // Trigger the deferred pipeline rebuild (outline GPU targets + SSGI/TRAA
        // recomposition) NOW so it doesn't race with geometry draw-calls.
        //
        // ── Camera Fit Invariant (Contract 20 §6) ────────────────────────────
        // DO NOT call seedPerspectiveCameraFromSceneBounds() or zoomToAll() here.
        // Camera fitting is handled EXCLUSIVELY by EngineBootstrap's own
        // pryzm-project-loaded listener, which calls zoomToAll(true) after a
        // 150 ms delay.  Any additional camera-fit call here causes the user to
        // see the camera jump twice in quick succession (the regression that was
        // present before 2026-04-14 and must not return).
        // ─────────────────────────────────────────────────────────────────────
        window.runtime?.events?.on('pryzm-project-loaded', (payload: unknown) => { // F.events.9
            const _loadedDetail = (payload as { projectId?: string; empty?: boolean } | undefined) ?? {};
            console.log(
                '[initScene] pryzm-project-loaded —',
                _loadedDetail.empty ? 'empty project (no geometry)' : `project: ${_loadedDetail.projectId}`,
            );
            // onProjectLoaded() runs unconditionally: the pipeline must be active
            // even for an empty project so the grid, background and scene are
            // rendered correctly (Contract 20 §8.2).
            renderPipelineManager.onProjectLoaded();

            // Remove the canvas freeze-frame overlay (if mounted) with a short
            // fade so the transition into the fully-loaded scene feels smooth.
            if (_switchFreezeFrame) {
                const ff = _switchFreezeFrame;
                _switchFreezeFrame = null;
                ff.style.transition = 'opacity 0.4s ease';
                ff.style.opacity = '0';
                setTimeout(() => ff.remove(), 450);
            }
        });

        // ── Phase 4 Performance: UnifiedFrameLoop (Task 4.3) — PASCAL callback ──
        // Wire the PASCAL render callback and start the unified rAF loop. The OBC
        // callback is left empty (no-op) since PostproductionRenderer drives its
        // own render in MANUAL mode; the UnifiedFrameLoop only needs to drive the
        // PASCAL post-processing pass.
        //
        // renderPipelineManager.render(delta) is a no-op when WebGL is active
        // (_webGpuActive = false for OBC's PostproductionRenderer), so the unified
        // loop coexists safely alongside OBC's own render loop in Phases 1–4.
        // When WebGPU is active (Phase 5+, after OBC decoupling), this loop
        // becomes the sole renderer — OBC's render loop is stopped at that point.
        //
        // IMPORTANT: The UnifiedFrameLoop's isSwitching flag prevents the PASCAL
        // callback from running during view switches — replacing the FrameCoordinator
        // V1 check that was previously inside renderPipelineManager.render().
        {
            const rpmClock = new THREE.Clock();
            unifiedFrameLoop.setPascalRenderCallback((_deltaMs: number) => {
                const delta = rpmClock.getDelta();
                renderPipelineManager.render(delta);
            });
            // Start the unified loop. If UnifiedFrameLoop.start() fails for any
            // reason, fall back to the legacy independent rAF loop so rendering
            // is never lost.
            try {
                unifiedFrameLoop.start();
                console.log('[initScene] UnifiedFrameLoop started — single rAF loop active.');
            } catch (uflStartErr: any) {
                console.warn('[initScene] UnifiedFrameLoop start failed, falling back to legacy rAF:', uflStartErr?.message);
                // Legacy fallback — D.7.6: continuous render driven by
                // FrameScheduler. The scheduler re-invokes the body every
                // tick so the manual reschedule disappears. Disposer is
                // intentionally discarded — this fallback path runs for the
                // lifetime of the page (matches the legacy fire-and-forget
                // semantics, since the original code had no stop-handle).
                const tickRPMFallback = (): void => {
                    const delta = rpmClock.getDelta();
                    renderPipelineManager.render(delta);
                };
                getFrameScheduler().addTickListener(
                    'init-scene-rpm-fallback',
                    tickRPMFallback,
                    'render',
                );
            }
        }

        // ── Phase 4: Selection → Outline sync ─────────────────────────────
        // Listens for the 'bim-selection-changed' event dispatched by
        // SelectionManager and mirrors the selected object into the RPM's
        // outline array so TSL outlines track the active selection.
        // F.events.16 — migrated to runtime.events typed bus.
        window.runtime?.events?.on('bim-selection-changed', (payload: unknown) => {
            const detail = payload as { object?: THREE.Object3D | null };
            if (detail?.object) {
                renderPipelineManager.setSelectedObjects([detail.object]);
            } else {
                renderPipelineManager.setSelectedObjects([]);
            }
        });

        // A2: Hover → pulsing TSL outline sync.
        // SelectionManager dispatches 'bim-hover-changed' on pointermove when the
        // hovered selectable root changes. Mirror it into the RPM hover array so
        // the blue pulsing outline appears/disappears without a pipeline rebuild.
        window.addEventListener('bim-hover-changed', (evt: Event) => {
            const detail = (evt as CustomEvent<{ object: THREE.Object3D | null }>).detail;
            renderPipelineManager.setHoveredObjects(detail.object ? [detail.object] : []);
        });

        // A1/A5: Always white — background was already snapped to #ffffff above at bind()
        // time, and localStorage was updated. No re-application needed here.

        // ── Camera-switch handler + orthographic background enforcement ─────
        // OBC's OrthoPerspectiveCamera replaces world.camera.three with a new
        // THREE.OrthographicCamera object when switching to floor-plan / elevation
        // / section views, and restores a THREE.PerspectiveCamera on the way
        // back to 3D.  The scenePass and SSGI nodes are created with a direct
        // camera reference, so the pipeline must be rebuilt whenever that object
        // changes.  updateCamera() updates this._camera, cancels any pending
        // shadow-rebuild timer, and runs _fullRebuild() so every compiled GPU
        // resource handle is fresh.
        //
        // _fullRebuild() now guards SSGI + TRAA for orthographic cameras (A6):
        //  - SSGI is skipped for orthographic (screen-space AO is perspective-only)
        //  - TRAA is skipped for orthographic (velocity reprojection assumes perspective)
        //  Both are restored automatically on the next perspective-camera rebuild.
        //
        // A4 — Orthographic background enforcement:
        //  Plan/elevation/section views use white background by BIM drawing convention.
        //  Save the user's current background color, force white for ortho views,
        //  and restore the saved color when returning to perspective. The save/restore
        //  uses SceneTheme.getStoredColor() (reads localStorage) so it survives across
        //  multiple view switches.  We deliberately do NOT write to localStorage on the
        //  forced white change — only the user's explicit color-picker choices persist.
        let _savedBgBeforeOrtho: string | null = null;
        window.runtime?.events?.on('view-activated', (payload: unknown) => { // F.events.8
            const p = payload as { type?: string; camera?: THREE.Camera } | undefined;
            const isOrtho = p?.type === 'orthographic';

            if (isOrtho) {
                if (_savedBgBeforeOrtho === null) {
                    _savedBgBeforeOrtho = SceneTheme.getStoredColor();
                }
                // B1: Apply white across ALL three background layers:
                //   1. TSL bgUniform (WebGPU path) — smooth lerp via setColor
                //   2. viewport.style.background (CSS, visible through transparent canvas)
                //   3. scene.three.background + renderer.setClearColor (WebGL path)
                // SceneTheme._applyHex() handles layers 2 & 3 without writing to
                // localStorage (SceneTheme.setBackground() would persist — unwanted here).
                // It already guards against touching scene.three.background when
                // pryzmCanvas is active (WebGPU path clears to alpha each frame instead).
                renderPipelineManager.setColor('#ffffff');
                const vp = container.querySelector('bim-viewport') as HTMLElement | null;
                if (vp) SceneTheme._applyHex('#ffffff', world, vp);
                console.log('[initScene] Orthographic view — background forced to white (all layers), SSGI suspended.');
            } else if (_savedBgBeforeOrtho !== null) {
                // B1: Restore the user's saved background across all three layers.
                renderPipelineManager.setColor(_savedBgBeforeOrtho);
                const vp = container.querySelector('bim-viewport') as HTMLElement | null;
                if (vp) SceneTheme._applyHex(_savedBgBeforeOrtho, world, vp);
                console.log(`[initScene] Perspective view restored — background: ${_savedBgBeforeOrtho} (all layers)`);
                _savedBgBeforeOrtho = null;
            }

            // §CAM-SYNC-FIX: prefer payload.camera (set by ViewController at dispatch
            // time, guaranteed fresh after projection.set()) over world.camera.three
            // which camera-controls may not have updated yet when the view-activated
            // handler fires synchronously during the projection toggle.
            renderPipelineManager.updateCamera(p?.camera ?? world.camera.three).catch((err: unknown) => {
                console.warn('[initScene] Camera update after view-activated failed:', err);
            });
        });

        console.log('[initScene] RenderPipelineManager ready.');
    } catch (rpmErr: any) {
        console.warn('[initScene] RenderPipelineManager init error:', rpmErr?.message ?? rpmErr);
    }

    // ── End WebGPU TSL Render Pipeline ────────────────────────────────────

    // ── Pascal Lighting — wire geometry events + expose on window ─────────
    // pascalSceneLighting.apply() was called BEFORE the pipeline managers above
    // (see "MUST run before any pipeline compilation" block near the top of
    // this function).  Here we only register the per-element geometry events
    // so new BIM meshes receive castShadow/receiveShadow flags as they are
    // added to the scene during a project load or live editing session.
    //
    // NOTE: scheduleShadowRebuild() is NOT called here.  Setting castShadow on
    // individual meshes does NOT destroy or recreate the ShadowDepthTexture
    // (the texture lives on the light, not on meshes).  Only changing the
    // light's shadow.mapSize destroys and recreates the texture, which no
    // longer happens after startup because the Pascal lights are fixed.
    try {
        // Re-enable shadows on new BIM meshes added after startup.
        // Includes '-added' events (project load) as well as '-updated' events.
        // setTimeout(0) defers until after fragment builders have placed meshes.
        const _pascalGeomEvents = [
            'bim-wall-added',      'bim-wall-updated',
            'bim-slab-added',      'bim-slab-updated',
            'bim-ceiling-added',   'bim-ceiling-updated',
            'bim-floor-added',     'bim-floor-updated',
            'bim-column-added',    'bim-column-updated',
            'bim-beam-added',      'bim-beam-updated',
            'bim-roof-added',      'bim-roof-updated',
            'bim-stair-added',     'bim-stair-updated',
            'bim-curtainwall-added', 'bim-curtainwall-updated',
            'bim-furniture-added', 'bim-furniture-updated',
        ] as const;
        // PERF-FIX (2026-05-01): Debounce per-element onGeometryAdded calls.
        // Problem: without debouncing, each bim-*-added event fires a separate
        // setTimeout(onGeometryAdded) — so creating 18 walls queues 18 full
        // scene.traverse() calls in the same microtask batch, causing FPS drops
        // to ~9fps during wall creation.
        // The batch-coordinator guard (isBatching) only helps for AI batch ops,
        // not normal single-element user edits.
        // Fix: collapse all rapid-fire geometry events into a single traversal
        // using a 100ms debounce. This is safe because:
        //   - Shadow flags on new meshes are idempotent (no-op if already set)
        //   - 100ms lag is imperceptible vs the ~17ms frame budget
        //   - The batch-coordinator post-batch path already runs once after batches
        //     and will reset/cancel any pending debounce via the timer check
        // Contract: 01-BIM-ENGINE-CORE §4.3 — no per-frame scene mutations.
        let _geomAddedDebounceTimer: ReturnType<typeof setTimeout> | null = null;
        const _debouncedGeomAdded = () => {
            if (batchCoordinator.isBatching) return;
            if (_geomAddedDebounceTimer !== null) clearTimeout(_geomAddedDebounceTimer);
            _geomAddedDebounceTimer = setTimeout(() => {
                _geomAddedDebounceTimer = null;
                pascalSceneLighting.onGeometryAdded(world.scene.three as THREE.Scene);
            }, 100);
        };

        _pascalGeomEvents.forEach(evt => {
            window.addEventListener(evt, _debouncedGeomAdded);
        });

        // Expose on window for manual tuning from browser console
        window.pascalSceneLighting = pascalSceneLighting;
    } catch (pslErr: any) {
        console.warn('[initScene] PascalSceneLighting geometry events error:', pslErr?.message ?? pslErr);
    }
    // ── End Pascal Lighting ───────────────────────────────────────────────

    // ── Phase 2: Enhanced Bloom (UnrealBloomPass + EffectComposer) ────────
    // Pattern mirrors ViewportPathTracer: bloom takes exclusive renderer control
    // by setting PostproductionRenderer to MANUAL mode.  The bloom service runs
    // its own rAF loop; OBC resumes AUTO mode when bloom is disabled.
    //
    // PROJECT-LOAD-PERFORMANCE-13 Phase 4 (§5) — DEFERRED.
    // Bloom is opt-in: it only runs when the user toggles it on in
    // VisualizationEnginePanel.  Move construction off the boot path by
    // installing thin sync wrappers on window.{enableEnhancedBloom,
    // disableEnhancedBloom} that lazy-import the module on first activation.
    // window.enhancedBloomService is set once the module loads; until then it
    // is undefined, which is safe because every consumer (sliders in
    // VisualizationEnginePanel L1065/L1073/L1081, mutex check in SSGI block
    // below, panel `.active` reads) optional-chains it (`?.setX(val)`,
    // `?.active`).  Closure variables (pryzmCanvas, isPhase5Active,
    // postproductionRenderer, world) are captured here at the original
    // synchronous position; only the heavy module fetch + constructor
    // (~190 LOC + UnrealBloomPass + EffectComposer dep closure) defer.
    try {
        let _bloomService: _EnhancedBloomServiceImpl | null = null;
        let _bloomLoading: Promise<_EnhancedBloomServiceImpl> | null = null;
        let _bloomPrevMode: OBC.RendererMode = OBC.RendererMode.AUTO;
        let _bloomResizeWired = false;

        const _ensureBloom = (): Promise<_EnhancedBloomServiceImpl> => {
            if (_bloomService) return Promise.resolve(_bloomService);
            if (_bloomLoading) return _bloomLoading;
            _bloomLoading = import('@pryzm/core-app-model/rendering')
                .then(({ EnhancedBloomService }) => {
                    const svc = new EnhancedBloomService();
                    _bloomService = svc;
                    // Expose now that the real instance exists; sliders that
                    // were no-op until this point begin tracking immediately.
                    window.enhancedBloomService = svc;

                    // Wire resize forwarder once, after the service exists.
                    if (!_bloomResizeWired) {
                        window.addEventListener('resize', () => {
                            if (svc.active) {
                                svc.onResize(
                                    window.innerWidth,
                                    window.innerHeight,
                                    postproductionRenderer.three.getPixelRatio(),
                                );
                            }
                        });
                        _bloomResizeWired = true;
                    }

                    console.log('[initScene] EnhancedBloomService lazy-loaded.');
                    return svc;
                });
            return _bloomLoading;
        };

        const enableEnhancedBloom = async (
            opts?: Parameters<_EnhancedBloomServiceImpl['activate']>[3],
        ): Promise<void> => {
            const svc = await _ensureBloom();
            if (svc.active) return;

            // Phase 5: suspend PRYZM canvas — bloom renders to OBC's WebGL canvas
            if (pryzmCanvas) pryzmCanvas.style.display = 'none';

            // Suspend OBC auto-rendering (already false/MANUAL in Phase 5)
            postproductionRenderer.postproduction.enabled = false;
            _bloomPrevMode = postproductionRenderer.mode as OBC.RendererMode;
            postproductionRenderer.mode = OBC.RendererMode.MANUAL;

            svc.activate(
                world.scene.three as THREE.Scene,
                world.camera.three,
                postproductionRenderer.three,
                opts,
            );
        };

        const disableEnhancedBloom = (): void => {
            // No-op when the service was never loaded (user never enabled it).
            if (!_bloomService || !_bloomService.active) return;

            _bloomService.deactivate();

            // Phase 5: restore PRYZM canvas — WebGPU rendering resumes
            if (pryzmCanvas) pryzmCanvas.style.removeProperty('display');

            // Phase 5: stay in MANUAL, postproduction stays disabled
            if (!isPhase5Active) {
                postproductionRenderer.mode = _bloomPrevMode;
                postproductionRenderer.postproduction.enabled = true;
                postproductionRenderer.needsUpdate = true;
            }
        };

        // Expose on window for UI layer.  enableEnhancedBloom/disableEnhancedBloom
        // are installed at boot (sync wiring is cheap); enhancedBloomService is
        // attached lazily inside _ensureBloom() once the module loads.
        window.enableEnhancedBloom   = enableEnhancedBloom;
        window.disableEnhancedBloom  = disableEnhancedBloom;

        console.log('[initScene] EnhancedBloomService deferred — lazy wrappers installed.');
    } catch (bloomErr: any) {
        console.warn('[initScene] EnhancedBloomService deferred-init wiring error:', bloomErr?.message ?? bloomErr);
    }
    // ── End Enhanced Bloom ────────────────────────────────────────────────

    // ── Phase 2: Screen-Space GI (GTAOPass — SSGIService) ────────────────
    // SSGIService builds an EffectComposer with GTAOPass + RenderPass + OutputPass.
    // Pattern mirrors EnhancedBloomService: exclusive renderer control via MANUAL mode.
    // SSGI and EnhancedBloom are mutually exclusive — only one runs at a time.
    // Wrapped in try/catch so any failure does NOT break existing engine init.
    //
    // PROJECT-LOAD-PERFORMANCE-13 Phase 4 (§5) — DEFERRED.
    // SSGI is opt-in: it only runs when the user toggles it on in
    // VisualizationEnginePanel.  Same lazy pattern as EnhancedBloomService
    // above.  window.ssgiService is undefined until first activation, which is
    // safe because every consumer (VisualizationEnginePanel sliders, mutex
    // checks, VideoExportPanel renderOnce path) optional-chains it.  The
    // bloom-active mutex check below uses `window.enhancedBloomService
    // as _EnhancedBloomServiceImpl | undefined)?.active` which returns
    // undefined when bloom is also unloaded — no disable call needed in that
    // case, which is the correct behaviour (you cannot need to disable a
    // service that was never loaded).
    try {
        let _ssgiService: _SSGIServiceImpl | null = null;
        let _ssgiLoading: Promise<_SSGIServiceImpl> | null = null;
        let _ssgiPrevMode: OBC.RendererMode = OBC.RendererMode.AUTO;
        let _ssgiResizeWired = false;

        const _ensureSSGI = (): Promise<_SSGIServiceImpl> => {
            if (_ssgiService) return Promise.resolve(_ssgiService);
            if (_ssgiLoading) return _ssgiLoading;
            _ssgiLoading = import('@pryzm/core-app-model/rendering')
                .then(({ SSGIService }) => {
                    const svc = new SSGIService();
                    _ssgiService = svc;
                    window.ssgiService = svc;

                    // Wire resize forwarder once, after the service exists.
                    if (!_ssgiResizeWired) {
                        window.addEventListener('resize', () => {
                            if (svc.active) {
                                svc.onResize(window.innerWidth, window.innerHeight);
                            }
                        });
                        _ssgiResizeWired = true;
                    }

                    console.log('[initScene] SSGIService lazy-loaded.');
                    return svc;
                });
            return _ssgiLoading;
        };

        const enableSSGI = async (
            opts?: Parameters<_SSGIServiceImpl['activate']>[3],
        ): Promise<void> => {
            // A4: Guard — the WebGPU TSL pipeline already provides ambient occlusion
            // via GTAONode (SSGIPass.ts). Activating the legacy WebGL SSGIService while
            // WebGPU is active would hide the PRYZM canvas (pryzmCanvas.style.display='none')
            // and erase all TSL effects: SSGI, outlines, and the animated background.
            // Block the call and inform the developer via console.
            // NOTE: This guard runs BEFORE _ensureSSGI() so we don't pay the
            // dynamic-import cost just to immediately bail.
            const rpm = window.renderPipelineManager;
            if (rpm?.status?.webGpuActive) {
                console.warn(
                    '[PRYZM] enableSSGI(): blocked — the WebGPU TSL pipeline is active and ' +
                    'already provides SSGI via GTAONode. Use renderPipelineManager.activateSSGI() instead.'
                );
                return;
            }

            // Mutual exclusivity: deactivate Bloom first if running.
            // When bloom was never loaded, ?.active is undefined → falsy → no-op,
            // which is correct: you cannot need to disable a service that was
            // never activated.
            const ebsActive = (window.enhancedBloomService as _EnhancedBloomServiceImpl | undefined)?.active;
            if (ebsActive) {
                window.disableEnhancedBloom?.();
            }

            const svc = await _ensureSSGI();
            if (svc.active) return;

            // Phase 5: suspend PRYZM canvas — legacy SSGI renders to OBC's WebGL canvas
            if (pryzmCanvas) pryzmCanvas.style.display = 'none';

            // Suspend OBC auto-rendering (already false/MANUAL in Phase 5)
            postproductionRenderer.postproduction.enabled = false;
            _ssgiPrevMode = postproductionRenderer.mode as OBC.RendererMode;
            postproductionRenderer.mode = OBC.RendererMode.MANUAL;

            svc.activate(
                world.scene.three as THREE.Scene,
                world.camera.three,
                postproductionRenderer.three,
                opts,
            );
        };

        const disableSSGI = (): void => {
            // No-op when the service was never loaded (user never enabled it).
            if (!_ssgiService || !_ssgiService.active) return;

            _ssgiService.deactivate();

            // Phase 5: restore PRYZM canvas — WebGPU rendering resumes
            if (pryzmCanvas) pryzmCanvas.style.removeProperty('display');

            // Phase 5: stay in MANUAL, postproduction stays disabled
            if (!isPhase5Active) {
                postproductionRenderer.mode = _ssgiPrevMode;
                postproductionRenderer.postproduction.enabled = true;
                postproductionRenderer.needsUpdate = true;
            }
        };

        // Expose on window for UI layer.  enableSSGI/disableSSGI are installed
        // at boot (sync wiring is cheap); ssgiService is attached lazily inside
        // _ensureSSGI() once the module loads.
        window.enableSSGI   = enableSSGI;
        window.disableSSGI  = disableSSGI;

        console.log('[initScene] SSGIService deferred — lazy wrappers installed.');
    } catch (ssgiErr: any) {
        console.warn('[initScene] SSGIService deferred-init wiring error:', ssgiErr?.message ?? ssgiErr);
    }
    // ── End SSGI ──────────────────────────────────────────────────────────

    // ── Phase 2: Render Performance Optimisation (DPR scaling + shadow mgmt) ─
    try {
        const renderPerfService = new RenderPerformanceService();
        renderPerfService.bind(
            postproductionRenderer.three as THREE.WebGLRenderer,
            world.scene.three as THREE.Scene,
        );

        // Default to 'high' — full native DPR, balanced quality
        renderPerfService.setQualityLevel('high');

        // Expose setRenderQualityLevel as a convenience alias for the UI layer
        // (VisualizationEnginePanel calls this when switching quality levels)
        window.setRenderQualityLevel    = (level: string) => {
            if (level === 'off' || level === 'standard') {
                renderPerfService.setQualityLevel('standard');
            } else if (level === 'high') {
                renderPerfService.setQualityLevel('high');
            } else if (level === 'ultra') {
                renderPerfService.setQualityLevel('ultra');
            }
        };

        console.log('[initScene] RenderPerformanceService ready.');
    } catch (perfErr: any) {
        console.warn('[initScene] RenderPerformanceService init error:', perfErr?.message ?? perfErr);
    }
    // ── End Render Performance ─────────────────────────────────────────────

    // ── Split View Manager ────────────────────────────────────────────────────
    // Instantiate the split-view manager and expose it globally so the UI toggle
    // button (wired in initUI.ts) can call splitViewManager.toggle().
    // CONTRACT §01 §4: SplitViewManager is read-only w.r.t. the scene graph.
    // CONTRACT §05 §2: All CSS lives in src/styles/panels/splitView.ts (svp- prefix).
    try {
        const splitViewManager = new SplitViewManager(world);
        window.splitViewManager = splitViewManager;
        console.log('[initScene] SplitViewManager ready.');

        // Contract 17 §4 — Auto-open the split view whenever a project loads.
        // The SVP opens by default so users immediately see both the 3D viewport
        // and the 2D floor plan on first open. Users may close it via the ✕ button;
        // re-opening a project always restores it to the open state.
        window.runtime?.events?.on('pryzm-project-loaded', () => { // F.events.9
            if (!splitViewManager.isActive) {
                // PERF-FIX (Apr 2026): Defer the Canvas2D plan rebuild until the
                // browser is idle. Previously this fired 400 ms after project load
                // and blocked the main thread for ~300 ms while the rest of the
                // pipeline was still warming up. Using requestIdleCallback (with
                // a setTimeout fallback) lets first paint, camera fit and the
                // initial WebGPU frame all complete before the SVP rebuild runs.
                const _activate = () => {
                    splitViewManager.activate();
                    console.log('[initScene] Split view auto-opened on project load (idle)');
                };
                const ric = window.requestIdleCallback as
                    | ((cb: () => void, opts?: { timeout: number }) => number)
                    | undefined;
                if (typeof ric === 'function') {
                    ric(_activate, { timeout: 1500 });
                } else {
                    setTimeout(_activate, 600);
                }
            }
        }, { once: false });
    } catch (svpErr: any) {
        console.warn('[initScene] SplitViewManager init error:', svpErr?.message ?? svpErr);
    }

    // ── Task 6.7 Phase 6: GPU Memory Monitor — growth-rate detector ──────────
    // Replaces the Task 5.4 fixed-threshold alert (5,000 geometries) with a
    // two-tier detector:
    //   Tier 1 — growth alert: fires when geometry count grows >10% in 10s
    //            (catches active leaks; skips first 3 samples as warm-up).
    //   Tier 2 — absolute ceiling: fires when count exceeds 12,000
    //            (2× expected maximum for a 30-floor complex project).
    //
    // Rationale for removing the fixed threshold:
    //   A 20-floor BIM project legitimately generates 3,850–5,500 geometries at
    //   stable state (OBC fragments + walls + CW panels + rooms + grid helpers).
    //   The old >5,000 warning fired on every 10s poll — pure log noise.
    //   The growth-rate detector catches the same real leaks (geometry GROWTH
    //   during a view switch) without false-positive flooding.
    if (import.meta.env.DEV) {
        const _gpuRenderer = postproductionRenderer.three;
        let _gpuLastGeometries = 0;
        let _gpuSampleCount = 0;
        const _gpuMonitorInterval = setInterval(() => {
            const { geometries, textures } = _gpuRenderer.info.memory;
            const { calls, triangles } = _gpuRenderer.info.render;
            console.log(
                `[GPU Monitor] geometries:${geometries} textures:${textures}` +
                ` | drawCalls:${calls} tris:${triangles}`
            );
            _gpuSampleCount++;
            // Detect growth, not absolute count. Skip the first 3 samples (warm-up period).
            // A >10% growth between 10-second samples indicates a leak.
            if (_gpuSampleCount > 3 && _gpuLastGeometries > 0) {
                const growthPct = ((geometries - _gpuLastGeometries) / _gpuLastGeometries) * 100;
                if (growthPct > 10) {
                    console.warn(
                        `[GPU Monitor] ⚠ Geometry count grew ${growthPct.toFixed(1)}% ` +
                        `(${_gpuLastGeometries} → ${geometries}) in 10s — possible leak. ` +
                        `Check WallFragmentBuilder.removeWallFragments() and CurtainWallBuilder._disposeChildren().`
                    );
                }
            }
            // Absolute ceiling: alert if project exceeds 12,000 geometries
            // (2× the expected maximum for a 30-floor complex project).
            if (geometries > 12_000) {
                console.error(
                    `[GPU Monitor] 🔴 Geometry count (${geometries}) exceeded project ceiling of 12,000. ` +
                    `This is a definite memory leak. Investigate with renderer.info.memory in DevTools.`
                );
            }
            _gpuLastGeometries = geometries;
        }, 10_000);
        // Prevent the interval from keeping the page alive after Vite HMR hot-reload.
        if (import.meta.hot) {
            import.meta.hot.dispose(() => clearInterval(_gpuMonitorInterval));
        }
    }

    // ── A.8.x (IP-A2): committed parcel boundary → in-scene ground outline ────
    // Render the C19 SiteModelStore parcel boundary as a subtle violet ground
    // outline (non-pickable, EDITOR_LAYER) so an authored plot stays visible as
    // site context, distinct from generated walls. Project-scoped + disposed via
    // projectScopeRegistry. No-ops when no boundary / scene / runtime is present.
    try {
        const _parcelBoundaryRenderer = initParcelBoundarySceneRenderer(
            world.scene.three as THREE.Scene,
            runtime ?? (window.runtime as unknown as import('@pryzm/runtime-composer').PryzmRuntime | null),
        );
        if (import.meta.hot) {
            import.meta.hot.dispose(() => _parcelBoundaryRenderer?.dispose());
        }
    } catch (pbErr: any) {
        console.warn('[initScene] ParcelBoundarySceneRenderer init error:', pbErr?.message ?? pbErr);
    }
    // ── End A.8.x parcel-boundary outline ─────────────────────────────────────

    // ── Return typed scene result ─────────────────────────────────────────────
    // groundFloorController is not returned — it is already on window.groundFloorController
    // and only ever accessed by ViewController via that global (§View-System-Status V007).
    console.log('[initScene] Scene subsystem fully initialised.');
    return {
        components,
        world,
        grid,
        bimManager,
        projectContext,
        navManager,
        viewController,
        gridToggleService,
        fragments,
        gltfLoader,
        updateIfManualMode,
    };
}
