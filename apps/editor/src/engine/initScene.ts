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
import { initProjectOrigin, reseatProjectOrigin } from './initProjectOrigin'; // §FEAT-PROJECT-ORIGIN (L-109); §L-325 render-side origin re-seat
import { clearMountedDrawing } from './views/mountedDrawingScope'; // §C13-MOUNTED-DRAWING-OWNER — detach Project A's projected linework from the shared scene
import { getFrameScheduler, bumpPerf, addPerfTime, PERF_KEYS } from '@pryzm/frame-scheduler';
// §GEOM-CASTER-EVENT-CHOKEPOINT (L-1189) — the SINGLE declared set of BIM events
// that change the shadow caster set. `_pascalGeomEvents` used to be a second
// hand-written literal here and eleven families (handrail + stair-railing among
// them) were in neither it nor `_rpcGeomEvents`, so their rebuild never armed the
// §FIX-SHADOW-WALLCOMMIT-DESTROY freeze. Gated by geometryCasterEvents.test.ts.
import { GEOMETRY_CASTER_MUTATION_EVENTS } from './geometryMutationEvents';
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
// ADR-0346 / C13 §3.13 (L-2900) — LINKED MODELS: another project's building drawn
// read-only in this scene, anchored on the shared parcel. Importing the scope module
// is what registers its C13 owner + ADR-0298 probe (module-scope side effect).
import { LinkedModelSceneRenderer } from './links/LinkedModelSceneRenderer';
import { linkedModelController } from './links/linkedModelController';
import './links/linkedModelScope';
import { installSiteProjectScope } from '@app/ui/site/siteProjectScope';
import { ProjectContext, projectContext } from '@pryzm/core-app-model';
// §CAM-NEAR-SCALES-WITH-STANDOFF (L-2070) — the perspective near plane scales with
// the camera's standoff from the model, so a wall at arm's length is not clipped.
import { installAdaptiveNearPlane } from '@pryzm/core-app-model';
import type { AdaptiveNearControlsLike } from '@pryzm/core-app-model';
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
// §FIX-LIGHT-TIER-UNWIRED — the render tier is also the live-light budget's tier.
import type { SceneQualityTier } from '@pryzm/core-app-model/rendering';
// ADR-0076 Axis 2 (§PERF-WEBGPU-FRAGMENT) — furniture decorative-shadow budget setter.
import { setFurnitureShadowBudget } from '@pryzm/geometry-furniture';
import { probeRendererBackend, createRenderer, setRendererBackendPreference, getRendererBackendPreference, isUnintendedWebglOnlySwap, isNativeWebGpuBackend, isLightweightWebGlBackend, swapMayPersistPreference } from '../rendering/createRenderer';
import type { RendererBackendPreference } from '../rendering/createRenderer';
import { maybeAutoSwitchToWebGLForHeavyScene } from '../rendering/autoWebGLHeavyScene';
// ADR-0077 (§RENDERER-LIVE-SWAP) — OTel span for the live backend swap (C01 P8).
import { trace, SpanStatusCode } from '@opentelemetry/api';
// §PERF-WEBGPU-FRAGMENT / ADR-0076 — user-facing GPU backend corner toggle.
import { rendererBackendToggle } from '@app/ui/overlays/RendererBackendToggle';
// §FEAT-SWAP-LOADING-OVERLAY (L-141) — brand loading cover over the live backend swap.
import { showRendererSwapOverlay, hideRendererSwapOverlay } from '@app/ui/overlays/RendererSwapOverlay';
import { RenderPipelineManager } from '@pryzm/renderer-three';
// §RETIRE-RENDERER-DETACHES-LISTENERS (L-948) — the live backend swap RETIRES a
// renderer; a bare dispose() leaves it listening on the kept scene's materials.
import { retireRenderer, mintedRenderObjectCount, classifyRetirement, describeRetirement } from '@pryzm/renderer-three';
// §SURFACE-WITH-NO-AREA-REFUSES-THE-PASS (L-1470) — refuse a pass whose surface has no
// area, and say so ONCE. See clearObcBaseFramebuffer for the measured mechanism.
import { admitSurface, getZeroAreaSurfaceReport } from '@pryzm/renderer-three';
import { ViewportCrashGuard } from '@app/ui/primitives/ViewportCrashGuard';
import { RenderHealthIndicator } from '@app/ui/overlays/RenderHealthIndicator';
import { pascalSceneLighting } from '@pryzm/core-app-model/rendering';
import { RealEnvironmentService } from '@pryzm/core-app-model/rendering';
import { SceneTheme } from '@pryzm/core-app-model';
import { SplitViewManager } from './views/SplitViewManager';
// §L-412 (C59) — PURE decision guarding the project-load auto-open against the
// site-authoring 2-pane split (evaluated at idle-callback FIRE time to win the race).
import { shouldAutoOpenSplitView } from './views/siteAuthoringPaneDecisions';
import { SceneBoundsCache } from '@pryzm/scene-committer';
import { FrameCoordinator } from '@pryzm/core-app-model';
import { topologySpatialIndex } from '@pryzm/room-topology';
import { projectScopeRegistry } from '@pryzm/core-app-model';
import { ViewVisibilityMap } from '@pryzm/core-app-model';
import { EDITOR_LAYER } from '@pryzm/scene-committer';
import { topologyLayer } from '@pryzm/room-topology';
import { unifiedFrameLoop } from '@pryzm/core-app-model';
// §DEFER-TIER-DURING-DRAW — read the shared tool-interaction latch so a wall/tool
// draw defers the render-tier escalation (pipeline rebuild + TRAA enable) out of
// the live rubber-band interaction; the deferred escalation runs once on commit.
import { toolInteractionRef } from '@pryzm/core-app-model';
import { viewDependencyTracker } from '@pryzm/core-app-model';
import { viewTechnicalDrawingCache } from '@pryzm/core-app-model';
import { nativeElementMeshExporter } from '@pryzm/core-app-model';
import { elementRegistry } from '@pryzm/core-app-model/element-registry'; // §L-325 render/projection-registry isolation teardown
// §L-711 (ADR-0298) — the DECLARED list of element types that are constructed during a
// load rather than restored from the snapshot, so the §L-325 audit can tell a real
// unaccounted root from a legitimately-derived one instead of calling both "foreign".
import { LOAD_DERIVED_ELEMENT_TYPES } from '@pryzm/core-app-model';
// §L-711 — a C13 violation must be VISIBLE to the person it affects, not only to a console.
import { showToast } from '@app/ui/platform/PlatformToastSystem';
// Phase 6 — EdgeProjectorService is lazy-loaded. The module is ~1 870 LOC and
// transitively pulls 11 plan-symbol builders + the OBC EdgeProjector +
// TechnicalDrawings APIs into the static graph. Plan / section / elevation
// views are activated post-load when the user explicitly switches view, so
// the entire projection stack can wait until the first switch. `import type`
// is erased by tsc so this line does NOT add the module to the static graph.
// See Phase 6 STATUS in §18.2 for the full consumer audit (8 call sites,
// all of them already either await-style or fire-and-forget setters).
import type { EdgeProjectorService } from './views/EdgeProjectorService';
// §PERF-PROJECTION-CANCEL-SUPERSEDED (L-704) — leaf module by design: a value import from
// EdgeProjectorService here would defeat the Phase 6 lazy load of the projector.
import { isProjectionSuperseded } from './views/projectionCancellation';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { ifcProjectionStore } from '@pryzm/core-app-model';
import { frustumCullingService } from '@pryzm/core-app-model/rendering';
import { levelScoped3DCullingService } from '@pryzm/core-app-model/rendering';
import type { LevelScoped3DMode } from '@pryzm/core-app-model/rendering';
import { viewRenderCache } from '@pryzm/core-app-model';
import { levelClipPlaneCache } from '@pryzm/core-app-model';
import { stairPlanSymbolRegistry } from '@pryzm/scene-committer';
import { RoomTagAutoPopulator } from '@pryzm/room-topology';
// §FEAT-SET-OUT-LIVE-DOCUMENTATION (L-286) — a live Set-Out view re-derives its annotation
// set whenever the model changes, using the SAME idempotent reconciler as the button.
import { registerSetOut } from '@app/ui/documentation/setOut';
import { instancedElementRenderer } from '@pryzm/core-app-model/rendering';
// §PERF instrumentation (L-02/L-03) — gated behind globalThis.__pryzmPerfTrace.
import { perfTraceOn, perfTime, perfLog, perfDump } from '@pryzm/core-app-model/rendering';
// §FIX-LOAD-TRAVERSE-BATCH (P2) — per-add geometry-pass gate policy (unit-tested).
import { isProjectLoadActive, shouldDeferPerAddGeometryPass } from './perAddGeometryGate';
import { batchCoordinator } from '@pryzm/core-app-model';
// §L-432 — publishes the parcel + envelope rings for the L1 site-context snap provider.
import { installSiteSnapContext } from '../ui/site/siteSnapContext';

// ── Derived type alias ─────────────────────────────────────────────────────────
// Preserves the specific scene/camera/renderer generic params from createBimWorld
// so callers retain full type narrowing (mode, needsUpdate, controls, updateShadows…).
type BimWorld = ReturnType<typeof createBimWorld>['world'];

// ── §FIX-HEAVY-SCENE-MASSING-LOD (L-150) — 3D-detail view-option control ──────────
//
// The level-scoped 3D culler (L-139) + massing LOD (L-150) previously had ONLY a
// console flag. This mounts a small user-facing selector so a user can choose how a
// large building renders in 3D:
//
//   • "Full building (massing)" — DEFAULT: active floors in full detail, all other
//     floors as a lightweight massing silhouette (the whole tower is visible).
//   • "Active floors only"      — the L-139 behaviour (far floors hidden; lightest).
//   • "All floors — heavy"      — the escape hatch (full detail everywhere); gated
//     behind a confirm() because on a 40-storey tower it is the WebGPU device-loss
//     path L-139 exists to prevent.
//
// It is self-contained DOM (no dependency on the UI chrome package) and only appears
// once level-scoping engages on a large model — it stays hidden for houses / single
// apartments. Visibility is refreshed off the same events the culler listens to
// (no polling loop — P3). The console flag / globals keep working unchanged.
function mountLevelScoped3DViewControl(): void {
    if (typeof document === 'undefined') return;
    const CONTROL_ID = 'pryzm-level3d-detail-control';
    if (document.getElementById(CONTROL_ID)) return; // idempotent

    const readEngaged = (): boolean => {
        const stats = (globalThis as unknown as {
            __pryzmLevelCullStats?: { engaged?: boolean };
        }).__pryzmLevelCullStats;
        return stats?.engaged === true;
    };

    const wrap = document.createElement('div');
    wrap.id = CONTROL_ID;
    wrap.setAttribute('data-pryzm-view-option', 'level-3d-detail');
    wrap.style.cssText =
        'position:fixed;bottom:12px;left:12px;z-index:40;display:none;align-items:center;' +
        'gap:6px;padding:6px 9px;border-radius:8px;font:11px/1.2 system-ui,sans-serif;' +
        'color:#2a2140;background:rgba(255,255,255,0.92);border:1px solid #6600FF33;' +
        'box-shadow:0 2px 8px rgba(102,0,255,0.12);backdrop-filter:blur(4px);';

    const label = document.createElement('span');
    label.textContent = '3D detail';
    label.style.cssText = 'font-weight:600;color:#6600FF;';

    const select = document.createElement('select');
    select.style.cssText =
        'font:11px system-ui,sans-serif;color:#2a2140;background:#fff;border:1px solid #6600FF44;' +
        'border-radius:6px;padding:2px 4px;cursor:pointer;';
    const OPTIONS: ReadonlyArray<{ value: LevelScoped3DMode; text: string }> = [
        { value: 'massing', text: 'Full building (massing)' },
        { value: 'scoped',  text: 'Active floors only' },
        { value: 'all',     text: 'All floors — heavy' },
    ];
    for (const opt of OPTIONS) {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.text;
        select.appendChild(o);
    }
    select.value = levelScoped3DCullingService.getMode();

    select.addEventListener('change', () => {
        const mode = select.value as LevelScoped3DMode;
        if (mode === 'all') {
            const ok = typeof window !== 'undefined' && typeof window.confirm === 'function'
                ? window.confirm(
                    'Render ALL floors at full detail?\n\nOn a large building this is heavy and can ' +
                    'destabilise the 3D renderer (WebGPU device loss). Use "Full building (massing)" ' +
                    'for a stable full-building view.')
                : true;
            if (!ok) { select.value = levelScoped3DCullingService.getMode(); return; }
        }
        levelScoped3DCullingService.setMode(mode);
        select.value = levelScoped3DCullingService.getMode();
    });

    wrap.appendChild(label);
    wrap.appendChild(select);
    document.body.appendChild(wrap);

    const refresh = (): void => {
        wrap.style.display = readEngaged() ? 'flex' : 'none';
        select.value = levelScoped3DCullingService.getMode();
    };
    for (const evt of ['project-loaded', 'pryzm-project-loaded', 'activeLevelChanged', 'view-activated']) {
        window.addEventListener(evt, () => {
            // The culler re-derives on these events; refresh after it settles.
            setTimeout(refresh, 350);
        });
    }
    refresh();
}

// ── §RPM-RECOVERY-DOWNGRADE (ADR-0087) — non-fatal pipeline rebind helper ────────
//
// During a renderer live-swap (and the device-loss recovery path in
// createRenderer.ts) the heavy phase-4 TSL pipeline (SSGI/outlines) is rebuilt
// against a fresh GPU device. On some devices a generated fragment shader fails
// to compile, which previously flipped THREE's fatal "Rendering has stopped"
// latch and killed the viewport behind a hard error overlay.
//
// RenderPipelineManager.recoverPipeline() rebuilds the FULL pipeline but
// DOWNGRADES to the lightweight phase-2 pipeline (no post-FX) on a shader-compile
// failure — the viewport keeps rendering plain. This wrapper prefers it and
// falls back to the old bind()+activate* sequence for any older RPM build that
// predates the method (defensive; both call sites in the live-swap reuse it).
async function recoverPipelineOrBind(
    rpm: RenderPipelineManager,
    scene: THREE.Scene,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    backendIsWebGPU: boolean,
): Promise<void> {
    // Structural shape (not Pick<RPM,…>) so this compiles even against an older
    // RPM .d.ts that predates recoverPipeline (cross-package type resolution).
    const maybe = rpm as unknown as {
        recoverPipeline?: (
            s: THREE.Scene, c: THREE.Camera, r: THREE.WebGLRenderer, b?: boolean,
        ) => Promise<unknown>;
    };
    if (typeof maybe.recoverPipeline === 'function') {
        await maybe.recoverPipeline(scene, camera, renderer, backendIsWebGPU);
        return;
    }
    // Legacy fallback path (no recoverPipeline): old fatal-on-compile sequence.
    await rpm.bind(scene, camera, renderer, 'light', backendIsWebGPU);
    if (rpm.status.webGpuActive) {
        // §FIX-SSGI-DEFAULT-OFF-TRAA-SELECT-FLASH (founder L-59) — SSGI is OFF by
        // default (user-opt-in via the RenderRail toggle). Only restore it across a
        // live backend swap if the user had it enabled (status.ssgiActive), so the
        // constant SSGI flicker does not silently return. Outlines always restore.
        if (rpm.status.ssgiActive) await rpm.activateSSGI();
        await rpm.activateOutlines();
    }
}

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
    // §VIEWPORT-BG-BACKEND-VOCABULARY / L-1284 — SAY WHAT THIS ACTUALLY MEASURED.
    //
    // ⚠ THIS LINE USED TO READ `GPU backend detected: ${detectedBackend}` AND IT
    // WAS A LIE — a load-bearing one. On the founder's boot it printed `webgpu`
    // while the authority had resolved WebGL2 and the status pill said WebGL:
    //
    //     [createRenderer] resolvedPreference=webgl (forceWebGL=true) …
    //     [renderer-three] backend: webgl2 …
    //     [initScene] Phase 5 active — PRYZM renderer: webgl-fallback
    //     [PRYZM] GPU backend detected: webgpu           ← this line
    //
    // `probeRendererBackend()` never asks the renderer anything. It returns
    // `'webgpu'` the instant `navigator.gpu` is truthy — no `requestAdapter()`,
    // no device, no preference read — and it runs ~1700 lines BEFORE
    // `createRenderer()` resolves. It CANNOT know the backend; it is an API-
    // presence sniff, and the function's own doc comment says so honestly. Only
    // the log message overclaimed.
    //
    // Kept as a sniff (it is the right instrument for the abort above: no GPU API
    // at all ⇒ nothing can be built) and RENAMED in the output, so exactly one
    // line in the boot — `[initScene] Phase 5 active — PRYZM renderer: …`,
    // sourced from `rendererResult.backend` — claims to name the backend. A
    // second opinion about the backend is how a WebGPU-only path gets armed on a
    // WebGL device; the cheapest permanent fix is to stop publishing one.
    console.log(
        `[PRYZM] GPU APIs available (pre-resolution sniff, NOT the backend): ${detectedBackend}. ` +
        'The resolved backend is reported later by "[initScene] Phase 5 active — PRYZM renderer: …".',
    );

    // §PERF-WEBGPU-FRAGMENT / ADR-0076 — mount the corner GPU backend toggle
    // (Auto / WebGPU / WebGL). Mounted unconditionally + early so it is the
    // user's escape hatch even when the WebGPU pipeline is misbehaving. The
    // active backend label is filled once createRenderer() sets
    // window.pryzmRendererBackend; a later remount picks it up.
    try {
        rendererBackendToggle.mount();
    } catch (toggleErr) {
        console.warn('[initScene] §PERF-WEBGPU-FRAGMENT backend toggle mount failed:', toggleErr);
    }

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

    // ── §CAM-NEAR-SCALES-WITH-STANDOFF (L-2070) — adaptive perspective near plane ──
    //
    // FOUNDER (2026-08-21, prod 071a7b2c, WebGL): *"when I zoom in — sometimes too much
    // (not even to a wall) — the window disappears."* Screenshot: the wall is a flat
    // white/grey field with two window-shaped rectangles floating in it and the green
    // ground showing through them.
    //
    // That is NEAR-PLANE CLIPPING against a DoubleSide wall: the near face is discarded,
    // the far face of the same solid still draws (hence a flat field, not a hole), the
    // opening shows the ground, and the glass at mid-thickness survives as a rectangle.
    //
    // L-747 capped `near` at MAX_BIM_NEAR_M = 0.1 m and that fixed the 14 m catastrophe.
    // It did not fix this: 0.1 m is still a clip plane, and NOTHING stops the eye getting
    // closer than 0.1 m to a surface. `BimWorld` arms `controls.minDistance = 0.2`, but
    // camera-controls measures that to the ORBIT TARGET, not to geometry — orbiting a
    // target inside a room sweeps the eye through the walls, and dollying toward a target
    // 15 m away crosses the façade with `distance` still ~15.
    //
    // So `near` is keyed on the camera's standoff from the MODEL BOUNDS (0 when inside):
    // 1 cm touching, ramping to today's 0.1 m by 20 m out. Aerial and site-scale viewing
    // are bit-for-bit unchanged.
    //
    // P3 — no rAF is added here. It binds to camera-controls events the existing frame
    // scheduler already drives. Orthographic plan/elevation/section cameras are left
    // untouched (their near is -1000, a signed range, not a metric standoff).
    //
    // ⚠ The bounds include site/context geometry, so standing 100 m from a building on a
    // wide terrain still reports standoff ≈ 0 and keeps the small near. That errs toward
    // NOT clipping, which is the direction C04 chose at L-747.
    installAdaptiveNearPlane({
        // A thunk, not a captured reference: OBC's OrthoPerspectiveCamera REPLACES
        // world.camera.three on a projection change (see the projection.set() comment
        // further down this file).
        getCamera: () => world.camera.three,
        getModelBounds: () => sceneBoundsCache.getBounds(),
        controls: world.camera.controls as unknown as AdaptiveNearControlsLike,
    });
    // ── End §CAM-NEAR-SCALES-WITH-STANDOFF ───────────────────────────────────

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

    // ── §FIX-HEAVY-SCENE-3D-SCALABILITY (L-139) / §FIX-MASSING-LOD-THRESHOLD-TOO-AGGRESSIVE (L-164) ───
    // LevelScoped3DCullingService renders EVERY floor at full detail by default. It
    // AUTO-ESCALATES to massing LOD (active level ± N, rest hidden + drawn as a light
    // block) ONLY on a genuinely device-loss-risk model — a tall tower (≥ 15 levels)
    // carrying substantial geometry (≥ 1000 elements), or ≥ 4000 elements outright.
    // That keeps the 40-storey office alive (was a device-loss cascade → dead renderer)
    // while a normal ~6-storey residential building renders in full (L-164 fixed the
    // L-150 over-aggressive > 500-elems / > 5-levels default that showed a grey massing
    // "envelope shade" around a modest building). Visibility intent only; no store /
    // scene-graph mutation. Plan/section views stand down (plan culler owns those).
    // Flag __pryzmLevelScoped3DCulling (=== false restores all-levels full detail);
    // __pryzmLevelScoped3DMode ('all'|'scoped'|'massing') is an explicit user override.
    try {
        levelScoped3DCullingService.setScene(world.scene.three as THREE.Scene);
        levelScoped3DCullingService.activate();
        // §FIX-HEAVY-SCENE-MASSING-LOD (L-150) / §FIX-MASSING-LOD-THRESHOLD-TOO-AGGRESSIVE (L-164)
        // — user-facing view option so the massing LOD is not just a console flag. Mounts a
        // compact "3D detail" selector that only appears once scoping ENGAGES (a heavy model
        // auto-escalates, or the user opts in). On a normal building it stays hidden and every
        // floor renders full detail. 'all' = full detail (default); 'massing' = whole tower as
        // a silhouette; 'scoped' hides far levels (lightest).
        mountLevelScoped3DViewControl();
        console.log('[initScene] LevelScoped3DCullingService ready (full detail default; massing auto-escalation on huge models).');
    } catch (lcErr: any) {
        console.warn('[initScene] LevelScoped3DCullingService init error:', lcErr?.message ?? lcErr);
    }
    // ── End LevelScoped3DCullingService ───────────────────────────────────────

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
    /** §FURNISH-PERF (L-1398) — one timed seam for BOTH populate() call sites, so the
     *  report can say how many passes a gesture paid for and what they cost. Disarmed,
     *  this is one boolean check (see PerfCounters `timePerf`'s cost model). */
    const _timedPopulate = (viewDef: Parameters<typeof roomTagAutoPopulator.populate>[0]): void => {
        bumpPerf(PERF_KEYS.ROOMTAG_POPULATE);
        const _t0 = performance.now();
        try { roomTagAutoPopulator.populate(viewDef); }
        finally { addPerfTime(PERF_KEYS.ROOMTAG_POPULATE_MS, performance.now() - _t0); }
    };
    window.runtime?.events?.on('view-selected', (payload: unknown) => { // F.events.8
        const viewId = (payload as { viewId?: string | null })?.viewId;
        if (!viewId) return;
        const viewDef = viewDefinitionStore.get(viewId);
        if (!viewDef) return;
        // Only auto-populate for floor-plan views (they carry a spatial.levelId).
        if (!viewDef.spatial.levelId) return;
        // §FURNISH-PERF (L-1398) — this is the FIRST of TWO populate() passes a level
        // switch can drive; the second is inside `onReprojectionNeeded` below. Neither
        // was counted, so "the room-tag pass runs twice per level" was unmeasurable.
        _timedPopulate(viewDef);
    });

    // ── §FEAT-SET-OUT-LIVE-DOCUMENTATION (L-286) — bind Set Out to the change
    //    detection that ALREADY EXISTS. `registerSetOut` subscribes to
    //    ViewDependencyTracker's dirty-view signal and re-runs the SAME idempotent
    //    reconciler the Auto-tag button uses, scoped to what each live view SHOWS.
    //    No second change detector, no second tag engine.
    if (window.runtime) {
        registerSetOut(window.runtime as Parameters<typeof registerSetOut>[0]);
    }

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
            bumpPerf(PERF_KEYS.TRAVERSE_VIEW_GATES);
            scene.traverse((obj: THREE.Object3D) => {
                if (obj.name === 'floor-tile-grid') {
                    obj.visible = !is3DModelView;
                }
            });
        } catch { /* non-fatal: hatch keeps its last visibility */ }
    };
    // Track the last activated view mode so newly built floors match it.
    let _lastFloorHatchViewMode: string | undefined = '3D';
    // ⭐ §VIEW-GATE-NO-OP (L-1398) — A FULL-SCENE TRAVERSAL THAT RE-DECIDES THE SAME
    // ANSWER IS NOT A CHEAP TRAVERSAL, IT IS A WASTED ONE.
    //
    // The three `view-activated` visibility gates below each walk the WHOLE scene and
    // set `visible = !(mode === '3D')` on their own overlay family. Their input is the
    // view MODE and nothing else. A LEVEL switch re-activates a plan view, so the mode
    // is IDENTICAL ('Top' → 'Top') and every one of them re-walked 6113 meshes to write
    // the values that were already there. `triggerFurnishAllFloors` did that eight
    // times, which is ~24 whole-scene walks of pure no-op (L-1395 removes the switches;
    // this removes the waste for every OTHER level switch in the app — the level panel,
    // the HUD, the post-gen chain).
    //
    // ⛔ The guard is on the EVENT HANDLER only, never on the helper: the other callers
    // (a floor rebuilt, a room re-detected, the parcel fill re-authored) legitimately
    // re-apply the SAME mode to NEW geometry and must still traverse. And the first
    // activation always runs, because `_lastX` is seeded with a guess — an unapplied
    // gate that skipped because its guess happened to match would be a correctness bug,
    // not a saving.
    let _floorHatchGateApplied = false;
    window.runtime?.events?.on('view-activated', (payload: unknown) => { // F.events.8
        const _mode = (payload as { mode?: string })?.mode;
        if (_floorHatchGateApplied && _mode === _lastFloorHatchViewMode) return;   // §VIEW-GATE-NO-OP (L-1398)
        _floorHatchGateApplied = true;
        _lastFloorHatchViewMode = _mode;
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
            bumpPerf(PERF_KEYS.TRAVERSE_VIEW_GATES);
            scene.traverse((obj: THREE.Object3D) => {
                if (obj.userData?.isRoomOverlay === true) {
                    obj.visible = !is3DModelView;
                }
            });
        } catch { /* non-fatal: overlay keeps its last visibility */ }
    };
    let _lastRoomOverlayViewMode: string | undefined = '3D';
    let _roomOverlayGateApplied = false;
    window.runtime?.events?.on('view-activated', (payload: unknown) => { // F.events.8
        const _mode = (payload as { mode?: string })?.mode;
        if (_roomOverlayGateApplied && _mode === _lastRoomOverlayViewMode) return;   // §VIEW-GATE-NO-OP (L-1398)
        _roomOverlayGateApplied = true;
        _lastRoomOverlayViewMode = _mode;
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

    // ── A.21.D44: Hide the flat PARCEL-BOUNDARY FILL in the 3D model view ──────
    // DISTINCT artifact from the datum lines / floor hatch / room-fill overlay above
    // (this is NOT D42 #6 / `isRoomOverlay`). ParcelBoundarySceneRenderer (A.8.x)
    // draws the committed C19 site boundary as a violet ground outline PLUS a faint
    // translucent ShapeGeometry FILL (`pryzm-parcel-boundary-fill`,
    // userData.isParcelBoundaryFill) spanning the WHOLE drawn lot. The fill is a flat
    // XZ plane at y≈0.02 sized to the PARCEL, not the building footprint — so in the
    // orbit-able pure-3D BIM model view it floats BESIDE / below the generated house
    // (the lot overshoots the footprint and is usually offset/angled vs the building)
    // and, at #6600FF @ 0.06 opacity over the white viewport, reads as a large flat
    // light-grey rectangular slab off to the side. That is EXACTLY the founder's
    // recurring "floating grey shade beside the house" (A.21.D44). It is a real scene
    // mesh on EDITOR_LAYER — NOT a cast shadow, NOT a shadow-catcher — so the Pascal
    // sun/AO shadows and the Forma/Cesium ground are untouched.
    //
    // The parcel fill is SITE context: it legitimately belongs in the site / GIS /
    // plan views (where the lot footprint reads correctly from above), so — exactly
    // like the datum-line, floor-hatch and room-overlay fixes — we GATE it (hide in
    // pure '3D', show in every other view) rather than deleting it. The thin violet
    // boundary LINE is left visible in all views (a harmless outline that keeps the
    // lot legible without the slab artifact). Re-applied on every view switch AND
    // whenever the renderer rebuilds the fill (`site.parcel-boundary-set`), since the
    // renderer always creates the fill visible.
    const _applyParcelFillVisibilityForView = (mode?: string): void => {
        try {
            const is3DModelView = mode === '3D';
            const scene = world.scene.three as THREE.Scene;
            bumpPerf(PERF_KEYS.TRAVERSE_VIEW_GATES);
            scene.traverse((obj: THREE.Object3D) => {
                if (obj.userData?.isParcelBoundaryFill === true) {
                    obj.visible = !is3DModelView;
                }
            });
        } catch { /* non-fatal: parcel fill keeps its last visibility */ }
    };
    let _lastParcelFillViewMode: string | undefined = '3D';
    let _parcelFillGateApplied = false;
    window.runtime?.events?.on('view-activated', (payload: unknown) => { // F.events.8
        const _mode = (payload as { mode?: string })?.mode;
        if (_parcelFillGateApplied && _mode === _lastParcelFillViewMode) return;   // §VIEW-GATE-NO-OP (L-1398)
        _parcelFillGateApplied = true;
        _lastParcelFillViewMode = _mode;
        _applyParcelFillVisibilityForView(_lastParcelFillViewMode);
    });
    // Re-apply when the boundary is (re)authored — the renderer rebuilds the fill
    // visible, so without this a boundary committed while in the 3-D view would show
    // its grey slab until the next view switch. Deferred to a microtask so the
    // (synchronous) renderer refresh() has already (re)added the fill mesh before we
    // toggle its visibility.
    try {
        const _parcelEvtSub = window.runtime?.events?.on('site.parcel-boundary-set', () => {
            queueMicrotask(() => _applyParcelFillVisibilityForView(_lastParcelFillViewMode));
        });
        if (import.meta.hot && typeof _parcelEvtSub === 'function') {
            import.meta.hot.dispose(() => { try { _parcelEvtSub(); } catch { /* noop */ } });
        }
    } catch { /* non-fatal: gate still re-applies on view switch */ }
    // Boot view is 3-D — hide the parcel fill immediately so it never flashes.
    _applyParcelFillVisibilityForView('3D');

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
            // §PERF-PROJECTION-CANCEL-SUPERSEDED (L-704) — forwarded through the lazy façade.
            isSuperseded?:         Parameters<EdgeProjectorService['project']>[5],
        ): ReturnType<EdgeProjectorService['project']> => {
            return _ensureEdgeProjectorService().then(svc =>
                svc.project(viewDef, models, nativeMeshGroups, ifcSceneGroups, planBelowDepthOffset, isSuperseded),
            );
        },
        // §FIX-PLAN-PROJECT-INCREMENTAL (L-65) — incremental graft forwarded through
        // the lazy façade. Only invoked from onReprojectionNeeded AFTER a warm drawing
        // exists, i.e. the real service is already loaded from an earlier project() call.
        projectElementsInto: (
            targetDrawing:        Parameters<EdgeProjectorService['projectElementsInto']>[0],
            viewDef:              Parameters<EdgeProjectorService['projectElementsInto']>[1],
            dirtyGroups:          Parameters<EdgeProjectorService['projectElementsInto']>[2],
            dirtyIds:             Parameters<EdgeProjectorService['projectElementsInto']>[3],
            planBelowDepthOffset?: Parameters<EdgeProjectorService['projectElementsInto']>[4],
        ): ReturnType<EdgeProjectorService['projectElementsInto']> => {
            return _ensureEdgeProjectorService().then(svc =>
                svc.projectElementsInto(targetDrawing, viewDef, dirtyGroups, dirtyIds, planBelowDepthOffset),
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
    viewDependencyTracker.onReprojectionNeeded = async (viewId: string, genFromFlush: number, graftElementIds?: ReadonlySet<string>) => {
        const viewDef = viewDefinitionStore.get(viewId);
        if (!viewDef) return;
        // §FURNISH-PERF (L-1398) — wall-clock for the whole re-projection pass, whichever
        // arm it takes. The counters above say WHICH arm; this says what it cost.
        const _reprojT0 = performance.now();
        try {
            await _reprojectView(viewId, genFromFlush, graftElementIds, viewDef);
        } finally {
            addPerfTime(PERF_KEYS.REPROJECT_MS, performance.now() - _reprojT0);
        }
    };

    const _reprojectView = async (
        viewId: string,
        genFromFlush: number,
        graftElementIds: ReadonlySet<string> | undefined,
        viewDef: NonNullable<ReturnType<typeof viewDefinitionStore.get>>,
    ): Promise<void> => {

        // §FIX-PLAN-GEN-SELF-SUPERSEDE (L-705, ADR-0299) — the generation this handler is
        // COMMITTING under. It starts as the one `_flush()` handed us, but the incremental-
        // graft fast-path below can decide to THROW THE DRAWING AWAY and fall back to a full
        // projection — and throwing it away bumps the generation. Carrying `genFromFlush`
        // past that point made the fallback pass stale-by-exactly-one against a cache the
        // handler had itself just emptied: the precise condition §FIX-PLAN-BLANK-STALEGEN
        // force-accepts, which is why that RECOVERY was writing this view on every edit
        // (founder log: staleGen=54 currentGen=55 lastAcceptedGen=53). `restartProjection()`
        // performs the invalidate and re-declares the generation as one operation.
        let gen = genFromFlush;

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
            _timedPopulate(viewDef);   // §FURNISH-PERF (L-1398) — the SECOND pass.
        }

        const fragmentsMgr = components.get(OBC.FragmentsManager);
        const allModels = fragmentsMgr.list.size > 0 ? Array.from(fragmentsMgr.list.values()) : [];
        // Apply IFC toggle — omit OBC fragment models when IFC is disabled for this view.
        const models = ifcProjectionStore.filterModels(allModels, viewId);

        // §FIX-PLAN-PROJECT-INCREMENTAL (L-65, C04 §3.3 / DOC-1.4) — incremental graft
        // fast-path. When ViewDependencyTracker narrows the flush to a set of pure-
        // projection element ids (create/update of wall/slab/beam/ceiling/floor) AND the
        // cached drawing is still warm AND this is a native-only plan view, project ONLY
        // those elements and graft them onto the warm drawing (O(dirty)) rather than
        // disposing + re-projecting all N elements. Any failure falls through to the full
        // path below, so this is safe by construction.
        const isPlan = viewDef.viewType === 'plan' || viewDef.viewType === 'structural-plan';

        // §DIAG-GRAFT-FALLTHROUGH (L-706) — SAY WHY THE O(1) PATH WAS NOT TAKEN.
        //
        // Founder, 2026-08-07: one new wall re-exports 40 elements and re-projects 36
        // groups. An incremental-graft fast path EXISTS; the question that actually needs
        // answering is why an edit does not use it. That question was unanswerable from
        // the logs — the full path and the declined fast path are indistinguishable,
        // because declining was silent. Each gate now names itself, so the reason is a
        // fact in the log rather than an inference (ADR-0292).
        const graftDecline =
            !graftElementIds || graftElementIds.size === 0
                ? 'no-graft-ids (ViewDependencyTracker marked this view COARSE: a delete, a '
                  + 'non-pure-projection create such as door/window/furniture/stair/column/roof, '
                  + 'a batch, or a §G3 stale-id fallback — see PLAN_INCREMENTAL_SAFE_TYPES)'
            : !isPlan
                ? `not-a-plan-view (viewType=${viewDef.viewType}; elevation/section have NO graft path at all — they always take the full pass)`
            : models.length > 0
                ? `ifc-models-present (${models.length}); graft covers native Source B only`
            : window.__PRYZM_FLAGS__?.EDGE_PROJECTOR_NATIVE !== true
                ? 'EDGE_PROJECTOR_NATIVE flag OFF'
            : !viewTechnicalDrawingCache.has(viewId)
                ? 'no-warm-drawing (cache empty — nothing to graft onto; this is the cold pass)'
            : null;
        if (graftDecline) {
            console.log(
                `[initScene] §DIAG-GRAFT-FALLTHROUGH viewId=${viewId} FULL re-projection because: ${graftDecline}`,
            );
            // §FURNISH-PERF (L-1398) — the §DIAG-GRAFT-FALLTHROUGH line already SAYS
            // why the O(dirty) arm was declined; nothing COUNTED how often. Read
            // `view.reprojectFull` against `view.reprojectGraft`: a gesture whose
            // furniture batch coarse-marks the view takes the full O(N) arm every time.
            bumpPerf(PERF_KEYS.REPROJECT_FULL);
        }

        if (graftElementIds && graftElementIds.size > 0 && isPlan && models.length === 0
            && window.__PRYZM_FLAGS__?.EDGE_PROJECTOR_NATIVE === true) {
            const warm = viewTechnicalDrawingCache.get(viewId);
            if (warm) {
                try {
                    const allGroups = nativeElementMeshExporter.exportForView(viewDef);
                    const dirtyGroups: THREE.Group[] = [];
                    const spareGroups: THREE.Group[] = [];
                    for (const g of allGroups) {
                        const id = g.userData?.elementUUID as string | undefined;
                        (id && graftElementIds.has(id) ? dirtyGroups : spareGroups).push(g);
                    }
                    nativeElementMeshExporter.releaseGroups(spareGroups, { disposeProxies: true });
                    if (dirtyGroups.length > 0) {
                        const moved = await edgeProjectorService.projectElementsInto(warm, viewDef, dirtyGroups, graftElementIds);
                        nativeElementMeshExporter.releaseGroups(dirtyGroups, { disposeProxies: true });
                        if (moved > 0 && viewTechnicalDrawingCache.setIfCurrent(viewId, gen, warm)) {
                            const vgApplicatorInc = window.vgSceneApplicator;
                            vgApplicatorInc?.applyToProjectionLayers?.(warm, viewId);
                            viewController.mountReprojectedDrawing(viewId, warm);
                            bumpPerf(PERF_KEYS.REPROJECT_GRAFT);   // §FURNISH-PERF (L-1398)
                            console.log(`[initScene] §FIX-PLAN-PROJECT-INCREMENTAL: grafted ${moved} element(s) onto warm drawing viewId=${viewId} gen=${gen}`);
                            return;
                        }
                    } else {
                        nativeElementMeshExporter.releaseGroups(dirtyGroups, { disposeProxies: true });
                    }
                    // Fell through: nothing was grafted, so `warm` was NOT mutated and is
                    // still a valid drawing of the pre-edit model.
                    //
                    // §FIX-PLAN-COMPUTE-THEN-SWAP (L-706) — KEEP IT ON SCREEN. Discarding it
                    // here (the previous `restartProjection`) is what made the plan go white
                    // for the width of the full re-projection that follows. Holding it costs
                    // nothing: the full pass below commits under this fresh generation and
                    // `set()` swaps atomically, releasing the displaced drawing (ADR-0297 L2).
                    //
                    // §FIX-PLAN-GEN-SELF-SUPERSEDE (L-705) is PRESERVED and is the reason
                    // this re-declares `gen` at all: the fallback pass must never run under
                    // the generation `_flush` handed us, or it is stale before it starts.
                    console.log(
                        `[initScene] §DIAG-GRAFT-FALLTHROUGH viewId=${viewId} FULL re-projection because: ` +
                        `graft produced nothing (the dirty elements contributed no linework to THIS view — ` +
                        `cross-level change, or an element with no plan geometry)`,
                    );
                    gen = viewTechnicalDrawingCache.beginSwap(viewId);
                } catch (err) {
                    // ⚠ DIFFERENT CASE, DIFFERENT CHOICE. `projectElementsInto` mutates `warm`
                    // in place, so a throw can leave it PARTIALLY grafted — a drawing we cannot
                    // vouch for. This is the one place holding the last good drawing is not
                    // clearly right, so this path still DISCARDS. It is also rare, unlike the
                    // clean fall-through above which fires on ordinary edits.
                    console.error(`[initScene] §FIX-PLAN-PROJECT-INCREMENTAL graft failed — full fallback (discarding a possibly half-grafted drawing) for viewId=${viewId}:`, err);
                    gen = viewTechnicalDrawingCache.restartProjection(viewId);
                }
            }
        }

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
        {
            // §RHINO-PLAN — Rhino reference groups ride the same Source C lane
            // (projected-only; see EdgeProjectorService §RHINO-PLAN). Outside
            // the shouldIncludeIFC gate: Rhino visibility is the group's own
            // `visible` flag, not the IFC projection toggle.
            const scene = (world.scene as any)?.three as THREE.Scene | undefined;
            const includeIfc = ifcProjectionStore.shouldIncludeIFC(viewId);
            if (scene) {
                for (const obj of scene.children) {
                    if (!(obj as THREE.Group).isGroup) continue;
                    if (includeIfc && obj.userData?.source === 'ifc-import') {
                        ifcSceneGroups.push(obj as THREE.Group);
                    } else if (obj.userData?.isRhinoImport === true && obj.visible) {
                        ifcSceneGroups.push(obj as THREE.Group);
                    }
                }
            }
        }

        if (models.length === 0 && nativeGroups.length === 0 && ifcSceneGroups.length === 0) {
            // §FIX-PLAN-COMPUTE-THEN-SWAP (L-706) — THE ONE CASE WHERE HOLDING IS WRONG.
            // There is nothing to project, so the correct content is NOTHING. Under
            // hold-last-good the cache still contains the pre-edit drawing, and simply
            // returning would leave the user looking at geometry they just deleted. Blank
            // it deliberately. (Previously the coarse `invalidate()` in _flush had already
            // emptied the cache, so this early return was silently correct; now that the
            // drawing is held, correctness has to be stated.)
            viewTechnicalDrawingCache.invalidate(viewId);
            return;
        }
        try {
            // §PERF-PROJECTION-CANCEL-SUPERSEDED (L-704) — abandon this pass the moment a
            // newer generation for the same view is started. Without it the projection ran
            // to completion and was rejected by setIfCurrent() at the very end; the
            // founder's 2026-08-06 log shows THREE complete plan projections discarded per
            // wall drawn ("Stale projection rejected — staleGen=2/3/4 currentGen=5").
            const drawing = await edgeProjectorService.project(
                viewDef, models, nativeGroups, ifcSceneGroups, 0,
                () => viewTechnicalDrawingCache.currentGeneration(viewId) !== gen,
            );

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
            // §PERF-PROJECTION-CANCEL-SUPERSEDED (L-704) — cancellation is the SUCCESSFUL
            // outcome of "stop computing what nobody can display", not a failure. Logging
            // it as an error would put a red line in the console on every wall drawn.
            if (isProjectionSuperseded(err)) return;
            console.error(`[initScene] DOC-1.4/1.8: Re-projection failed for viewId=${viewId} gen=${gen}`, err);
        }
    };

    // ── §FIX-LAZY-INACTIVE-VIEW-PROJECTION (L-117 / L-121, C04 §3.3 / DOC-1.4) ────
    // An INACTIVE documentation view must NOT eagerly reproject. The four
    // always-present L-110 default elevations (§FEAT-DEFAULT-ELEVATIONS) were being
    // reprojected on EVERY view-dependency flush — each one exporting the WHOLE
    // model (`No levelId — exporting all N elements`). On a 2000+ element tower that
    // is 4×full-tower projections per 3D/plan edit → runaway CPU/GPU + NME cache
    // thrash → WebGPU device-loss crash on first navigation (L-117), and the
    // wall+door-move freeze (L-121: `flush — 5 dirty view(s): vd-sys-p, vd-sys-e ×4`).
    //
    // The predicate reports a view VISIBLE iff its drawing would mount right now:
    //   • the MAIN viewport's active 2D view (ViewController.isDrawingViewActive), or
    //   • the split-view Canvas2D pane (window.splitViewManager).
    // Any dirty view the predicate reports inactive is DEFERRED by the tracker
    // (marked dirty, NOT reprojected) until it is actually activated — at which
    // point `notifyViewActivated` triggers exactly one full reprojection. This drops
    // per-edit reprojection from N views to just the active one, while L-110 stays
    // correct (an elevation still reprojects the moment it is opened).
    viewDependencyTracker.setActiveViewPredicate((viewId: string): boolean => {
        try {
            if (viewController.isDrawingViewActive(viewId)) return true;
        } catch { /* fall through to split-view check */ }
        const svm = window.splitViewManager as
            { isActive?: boolean; activeViewId?: string } | undefined;
        if (svm?.isActive === true && svm.activeViewId === viewId) return true;
        return false;
    });

    // When a documentation view is activated (main viewport OR split pane), project
    // it once if it accumulated deferred dirty state while inactive.
    window.runtime?.events?.on('view-selected', (payload: unknown) => { // F.events.8
        const viewId = (payload as { viewId?: string | null })?.viewId;
        if (viewId) viewDependencyTracker.notifyViewActivated(viewId);
    });
    window.runtime?.events?.on('split-view-view-changed', (payload: unknown) => { // F.events.7
        const viewId = (payload as { viewId?: string | null })?.viewId;
        if (viewId) viewDependencyTracker.notifyViewActivated(viewId);
    });
    window.runtime?.events?.on('split-view-activated', () => { // F.events.7
        const svm = window.splitViewManager as { activeViewId?: string } | undefined;
        if (svm?.activeViewId) viewDependencyTracker.notifyViewActivated(svm.activeViewId);
    });

    // §FIX-ELEVATION-PROJECTION-COMPLETENESS (L-124 / L-123) — catch-up reprojection.
    // ViewTechnicalDrawingCache dispatches this when it accepts a STALE projection into
    // an empty cache (rapid SET_VIEW_CROP bumps the generation faster than projections
    // complete). Request a fresh full reprojection so the FINAL crop lands with COMPLETE
    // linework instead of an older, smaller-crop drawing (elevation "shows only a
    // portion / incomplete as the crop extends"). forceReproject respects the lazy
    // active-view gate, so an inactive elevation still just projects on activation.
    window.addEventListener('vd:reprojection-required', (e: Event) => {
        const viewId = (e as CustomEvent<{ viewId?: string }>).detail?.viewId;
        if (viewId) viewDependencyTracker.forceReproject(viewId);
    });

    window.addEventListener('bim-project-cleared', () => {
        viewDependencyTracker.clear();
        viewTechnicalDrawingCache.clear();
        // §L-325 (C13 render/projection isolation — L-316 / L-320 lineage) —
        // ClearProjectCommand emits `bim-project-cleared` right after
        // `elementRegistry.clear()`. But `clear()` deliberately does NOT fire the
        // onUnregister listeners (see ElementRegistry.clear() doc), so the two
        // render/projection caches that are pruned ONLY via those listeners survive
        // the data-side teardown: NativeElementMeshExporter's proxy-descriptor cache
        // (constructor-wired onUnregister) and FrustumCullingService's validated-bounds
        // WeakSet + pending audit. Purge them here — the render-layer companion to the
        // command's data-side clear — so a project reload/version-restore on the SAME
        // project (which fires bim-project-cleared but not pryzm-project-switch) never
        // re-projects the previous element set.
        try { nativeElementMeshExporter.clearCache(); } catch (e) { console.warn('[initScene] §L-325 NME.clearCache (bim-project-cleared) failed:', e); }
        try { frustumCullingService.reset(); } catch (e) { console.warn('[initScene] §L-325 FrustumCulling.reset (bim-project-cleared) failed:', e); }
    });

    // §L-676 (C13 §3.7 / §3.9 / §3.10, C19 §1.11) — WIRE THE GIS/SITE HALF of the
    // project-isolation teardown. `siteProjectScope` registers the three site scopes
    // (`site.model`, `site.dispatch`, `site.neighbourFootprints`) with
    // `projectScopeRegistry` so ClearProjectCommand tears them down on every load,
    // subscribes the C13 §3.7 `pryzm-project-switch` trigger on the TYPED bus, and
    // registers the matching `ProjectScopeProbe`s so a surviving Project-A site FAILS
    // the isolation audit instead of passing it.
    //
    // This call is the whole point of that module: until it existed, the file was
    // exported and imported by nothing, so all three mechanisms were inert — the
    // classic authored-but-unwired failure, where the fix ships, its unit tests pass
    // in isolation, and production behaviour is completely unchanged. Placed here
    // (rather than at module scope) because it resolves `window.runtime.events`, which
    // the §L-325 block immediately below already relies on being live at this point.
    try {
        installSiteProjectScope();
    } catch (e) {
        console.error('[initScene] §L-676 installSiteProjectScope failed — GIS/site isolation is NOT wired:', e);
    }

    // §L-325 (C13 §3.10 render side) — RENDER-SIDE ISOLATION DEV-ASSERT. The data-side
    // ProjectIsolationAudit compares the live STORES + scene against the loaded snapshot's
    // expected id set (`__pryzmLoadedProjectExpectation`). It does NOT inspect the
    // render/projection registries — so the exact leak reported here (elementRegistry
    // holding 117 roots while the snapshot declared 10) sails past it as "loaded clean".
    // This tripwire mirrors that audit on the render side: on every project load it flags
    // any `elementRegistry` root whose id is NOT in the just-loaded project's expected set
    // (a foreign root carried over from the previous project). It fails LOUDLY (a
    // `[C13 VIOLATION]` error + a `pryzm-render-registry-isolation-leak` event) so
    // 117 ≠ 10 can never again pass silently. Derived/unknown-expectation loads are
    // skipped to keep the false-positive rate at zero (same policy as the data-side audit).
    window.runtime?.events?.on('pryzm-project-loaded', (payload: unknown) => { // F.events.9
        const detail = (payload as { projectId?: string; empty?: boolean } | undefined) ?? {};
        const projectId = detail.projectId ?? '<unknown>';
        // Defer one frame so any load-tail root registration has settled.
        getFrameScheduler().scheduleOnce('l325-render-registry-audit', () => {
            try {
                const exp = (globalThis as unknown as {
                    __pryzmLoadedProjectExpectation?: { projectId: string; elementIds: string[] };
                }).__pryzmLoadedProjectExpectation;
                // Expectation unknown for this project (a load path that bypassed
                // ProjectLoader) → skip the id-based check (zero false positives). An
                // empty-flagged load has a well-defined expectation: nothing.
                let expected: Set<string> | null = null;
                if (exp && exp.projectId === projectId && Array.isArray(exp.elementIds)) {
                    expected = new Set(exp.elementIds);
                } else if (detail.empty === true) {
                    expected = new Set<string>();
                }
                if (!expected) return;
                const roots = elementRegistry.getAllRoots();
                // §L-711 — CARRY THE TYPE. The predecessor mapped straight to `r.id`, so
                // the report was a list of opaque uuids under a sentence that ASSERTED
                // their provenance ("from a prior project"). On live `096e12b4` that
                // sentence was false: the session was fresh, there was no prior project,
                // and the three roots were the project's own restored LIGHTING fixtures,
                // missing from `__pryzmLoadedProjectExpectation` (fixed in ProjectLoader).
                // A tripwire that names a cause it did not measure is the same defect
                // class it exists to catch — so it now reports what it can SEE (the
                // registry's own storeType) and stops narrating what it cannot.
                const unexpected = roots.filter(r => !expected!.has(r.id));
                const derived = unexpected.filter(r => r.storeType != null
                    && LOAD_DERIVED_ELEMENT_TYPES.includes(r.storeType));
                const foreign = unexpected.filter(r => !derived.includes(r));
                const fmt = (rs: typeof roots): Array<{ id: string; storeType: string }> =>
                    rs.slice(0, 20).map(r => ({ id: r.id, storeType: r.storeType ?? 'unregistered' }));
                if (foreign.length === 0) {
                    console.log(
                        `[L325-RenderRegistryAudit] ✓ project ${projectId} — elementRegistry holds ` +
                        `${roots.length} root(s); ${expected.size} declared by the snapshot, ` +
                        `${derived.length} legitimately load-derived (C13 §3.10), 0 unaccounted.`,
                    );
                    return;
                }
                // ADR-0298 / C13 §3.10 — WHAT A LOAD-TIME VIOLATION MUST DO.
                //
                // Previously: one console.error and the load continued. A detector that
                // writes a P0 correctness violation to a console the user never opens is
                // not a detector, it is a comment. Three things now happen, in order of
                // increasing cost, and NONE of them is an automatic repair:
                //
                //   1. REPORT WITH EVIDENCE — ids AND storeTypes, so the next reader can
                //      tell a leak from an expectation gap without guessing (above).
                //   2. ONE PLACE TO LOOK — push onto `window.__pryzmIsolationLeaks`, the
                //      same buffer the data-side ProjectIsolationAudit writes to, so the
                //      two halves of C13 do not need two debugging habits.
                //   3. TELL THE USER — they are editing a document that may contain
                //      another project's geometry. That is not a developer's fact.
                //
                // Deliberately NOT auto-repairing (i.e. unregistering the offending roots
                // + purging NME/culling). Repair acts on the audit's MODEL of what is
                // foreign, and this very defect proved that model can be wrong: on
                // `096e12b4` an auto-repair would have deleted three of the user's own
                // light fixtures from the render registry and reported success. L-694's
                // lesson inverted — do not let an unverified model take destructive
                // action. The repair belongs at the teardown chokepoint, where the set
                // being cleared is "everything", not at the audit, where it is "whatever
                // we believe is foreign".
                console.error(
                    `[C13 VIOLATION] §L-325 render-registry isolation leak on load of ${projectId}: ` +
                    `elementRegistry holds ${roots.length} root(s); the snapshot declared ${expected.size} ` +
                    `and ${derived.length} are load-derived — ${foreign.length} root(s) are UNACCOUNTED FOR. ` +
                    `NME/culling will re-project them. Types are from the registry itself; ` +
                    `provenance is NOT measured here:`,
                    { unaccounted: fmt(foreign), loadDerived: fmt(derived) },
                );
                try {
                    const buf = (window as unknown as { __pryzmIsolationLeaks?: unknown[] });
                    (buf.__pryzmIsolationLeaks ??= []).push({
                        timestamp: new Date().toISOString(),
                        projectId,
                        findings: [{
                            surface: 'renderRegistry.unaccountedRoot',
                            count: foreign.length,
                            details: { registryRootCount: roots.length, expectedCount: expected.size, unaccounted: fmt(foreign) },
                        }],
                    });
                } catch { /* the leak buffer must never break a load */ }
                try {
                    window.dispatchEvent(new CustomEvent('pryzm-render-registry-isolation-leak', {
                        detail: {
                            projectId,
                            registryRootCount: roots.length,
                            expectedCount: expected.size,
                            derivedCount: derived.length,
                            foreignIds: foreign.slice(0, 50).map(r => r.id),
                            foreign: fmt(foreign),
                        },
                    }));
                } catch { /* DOM dispatch must never throw past this guard */ }
                try {
                    showToast(
                        `Project isolation warning: ${foreign.length} element(s) in this session are not part ` +
                        `of this project's saved data. Save to a new version before continuing.`,
                        'error',
                        15000,
                    );
                } catch { /* a missing toast host must never break a load */ }
            } catch (e) {
                console.warn('[initScene] §L-325 render-registry audit failed (non-fatal):', e);
            }
        }, 'post-render');
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
    // §PERF-WEBGL2-NO-TSL — the AUTHORITATIVE resolved GPU backend the renderer
    // factory selected. Threaded into RenderPipelineManager.bind() so it never
    // re-probes the renderer CLASS. Only 'webgpu' (a native WebGPU backend) may run
    // the TSL pipeline; 'webgl-fallback' (WebGPURenderer forceWebGL → WebGL2 backend)
    // and the OBC default ('webgl-only') stay on the lightweight WebGL path.
    let pryzmRendererBackend: import('../rendering/createRenderer').RendererBackend = 'webgl-only';

    // ── ADR-0077 (§RENDERER-LIVE-SWAP) — rebind-layer holders ────────────────
    // The renderer-bound services are constructed later in this same composition
    // root (RenderPipelineManager, RenderPerformanceService) inside their own
    // try blocks. We hoist references to the outer scope so the live-swap closure
    // (swapRendererBackend, defined at the end of initScene) can re-bind every
    // service that captured the OLD renderer to the NEW one — WITHOUT a page
    // reload. Null until the matching block below assigns them. P1: this stays a
    // single composition root; no parallel runtime wiring is created.
    // ⚠ CORRECTED 2026-08-19 §PERF-DPR-BINDS-THE-LIVE-RENDERER (L-1149). This used to
    // read "(RenderPerformanceService is bound to the OBC renderer, which is never
    // swapped, so it needs no holder here.)" That was TRUE about lifetime and WRONG
    // about effect: in Phase 5 the OBC renderer is MANUAL, postproduction-disabled and
    // never issues a draw, so scaling ITS pixel ratio changed the resolution of a canvas
    // nobody sees — the quality control in VisualizationEnginePanel did nothing to the
    // viewport the user is looking at. It now binds the LIVE renderer, so it needs a
    // holder exactly like the pipeline manager, and the swap re-binds + re-applies it.
    let renderPipelineManagerRef: import('@pryzm/renderer-three').RenderPipelineManager | null = null;
    let renderPerfServiceRef: RenderPerformanceService | null = null;
    // Re-sizes the active PRYZM renderer to the container — assigned where the
    // `resize` closure is defined so the swap can resize a freshly-built renderer.
    let resizePryzmRenderer: (() => void) | null = null;

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
    // ADR-0077 (§RENDERER-LIVE-SWAP) — expose the resize closure to the swap so a
    // freshly-built renderer/canvas is sized to the container before first paint.
    resizePryzmRenderer = resize;

    // §RESIZE-IS-NOT-A-PROJECT-SWITCH (ADR-0302 §2, L-749) — a resize reconciles the
    // render size and NOTHING else.
    //
    // This used to call `onProjectSwitch()`, which unconditionally runs
    // `_reconcileRenderSize()` + `scheduleShadowRebuild()` + an outline reset, and pauses
    // WebGPU submits for the rebuild's duration (measured at 834-1862 ms on a founder
    // project). The ResizeObserver below fires for ANY viewport-geometry change — the
    // inspector opening, a sidebar toggle, a panel drag, devtools, browser zoom, a CSS
    // transition on a neighbour, the split view mounting during project load. A founder
    // trace showed the container oscillating 677 -> 678 -> 677 px, each step taking the
    // full reconstruction path.
    //
    // ADR-0297 already forbids routing RECOVERY through onProjectSwitch, and
    // ViewportCrashGuardRecoveryLever.test.ts:79 pins "NEVER via onProjectSwitch()".
    // This subscription was simply never audited under that rule — a
    // §FIX-ONCE-IMPORT-EVERYWHERE instance.
    //
    // Verified in RenderPipelineManager.viewportResize.test.ts: post-FX targets need
    // nothing (PassNode re-derives from renderer.getSize() every frame) and the shadow
    // map needs nothing (its resolution is a function of quality TIER, not viewport
    // size — and reallocating it is the very operation that destroys a
    // ShadowDepthTexture mid-submit).
    let _resizeRebuildTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRPMRebuild = () => {
        if (_resizeRebuildTimer !== null) clearTimeout(_resizeRebuildTimer);
        _resizeRebuildTimer = setTimeout(() => {
            _resizeRebuildTimer = null;
            window.renderPipelineManager?.onViewportResize?.();
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

    // §FIX-OBC-BASE-STALE-COMPOSITE (Defect A / A1) — one-shot clear of the OBC
    // base framebuffer. The OBC base canvas (autoClear=false, silenced in Phase 5)
    // otherwise freezes on its last-painted frame and composites UNDER the
    // transparent PRYZM overlay, producing the "duplicated visuals on camera move"
    // ghosting. Clearing to fully-transparent black leaves the overlay as the sole
    // visible surface. Best-effort: any failure is non-fatal (OBC keeps its frame).
    // §FIX-WEBGL2-GHOST-ON-ROTATE (W2.2) — `quiet` suppresses the success log for
    // the per-frame call site (armed as the RPM pre-lightweight-frame hook below):
    // logging every WebGL2 move-frame would flood the console. The one-shot
    // activate/live-swap callers keep their single audit log.
    const clearObcBaseFramebuffer = (reason: string, quiet = false): void => {
        try {
            // ── §FRAME-STARTS-CLEAN-ON-EVERY-BACKEND (L-1350) — SELF-GATE ────────
            // This closure is now armed as a PER-FRAME hook on EVERY Phase-5 backend
            // (it used to be armed only on the lightweight WebGL arm, which is the one
            // arm where the overlay is opaque and the clear can change nothing). That
            // makes the gate below load-bearing rather than defensive.
            //
            // The OBC canvas is NOT always our base layer. `enableEnhancedBloom`,
            // `enableSSGI` (legacy) and the viewport path tracer each HIDE the PRYZM
            // overlay (`pryzmCanvas.style.display = 'none'`) and render their own image
            // INTO this canvas — while RenderPipelineManager keeps ticking, because
            // nothing suspends it. Clearing here every frame in that state would wipe
            // their output on the frame after they drew it.
            //
            // So: clear ONLY while the PRYZM overlay is the visible surface. When the
            // overlay is hidden the OBC canvas is somebody else's output and there is
            // nothing stale to hide — it IS the picture.
            if (pryzmCanvas && pryzmCanvas.style.display === 'none') return;

            const obc = postproductionRenderer.three as THREE.WebGLRenderer;

            // ── §SURFACE-WITH-NO-AREA-REFUSES-THE-PASS (L-1470) — THE SECOND SELF-GATE ──
            // ⭐ THE GATE ABOVE ASKS A DIFFERENT QUESTION THAN THE ONE THAT BIT US.
            // It asks "is somebody else painting into the OBC canvas right now?" via an
            // INLINE STYLE ON A DIFFERENT ELEMENT (`pryzmCanvas`). That is a correct
            // answer to that question. It is not an answer to "does my surface have any
            // area?", and the founder's flood is the second question:
            //
            //   [.WebGL-0x…] GL_INVALID_FRAMEBUFFER_OPERATION: glClear:
            //       Framebuffer is incomplete: Attachment has zero size.
            //   245x glDrawElements / 9x glDrawArrays, then
            //   "WebGL: too many errors, no more errors will be reported for this context."
            //
            // MECHANISM, measured from real source on both sides (2026-08-20):
            //   • `mainRendererVisibility._apply()` sets `display:none` on `#container` —
            //     the OBC canvas's PARENT — for the plan / split-pane hide.
            //   • OBC's `SimpleRenderer.resize` (@thatopen/components index.mjs:14535) is
            //     `this.three.setSize(container.clientWidth, container.clientHeight)` with
            //     NO guard, wired to a ResizeObserver on that same parent (:14680).
            //   ⇒ hiding the container drives `setSize(0, 0)`. `pryzmCanvas.style.display`
            //     is untouched, so the gate above PASSES and this clear runs into a
            //     zero-area framebuffer on every presented frame.
            //
            // ⭐ CAN THIS CONDITION EVER BE SATISFIED? NO — this is not a transient
            // mid-layout zero that the next frame resolves. A surface sized from a
            // display:none container stays zero until that container is shown again, so
            // the clear is discarded FOREVER and the driver goes silent after ~255
            // errors, hiding every later finding on that context (L-1402).
            //
            // ⛔ Deliberately NOT a clamp to 1x1: a 1x1 target still discards the image
            // and would trade a diagnosable error for a silent wrong picture. The pass
            // simply must not run. `admitSurface` reads the BACKING STORE (reflow-free,
            // and the dimension the attachments are actually allocated from) and
            // aggregates on the REASON, so this site logs ONCE on refusal and ONCE on
            // resume with the count — never 245 times (C04 §INST.4).
            if (!admitSurface(obc, 'initScene.clearObcBaseFramebuffer')) return;

            // §FIX-WEBGL2-GHOST-STALE-TARGET (L-05 / G6) — CLEAR THE CANVAS, NOT WHOEVER'S
            // BUFFER HAPPENS TO BE BOUND.
            //
            // three's `WebGLRenderer.clear()` issues `gl.clear()` against the CURRENTLY BOUND
            // framebuffer — not the canvas. And this renderer is SHARED: the GPU picker borrows
            // it on every hover/click (`SelectionManager`), and so do the pick-strategy probe
            // and `ViewRenderCache`, each via `setRenderTarget(target) → render() → restore`.
            // When that inner `render()` THROWS — and on this backend it does; the founder's
            // console carries `GL_INVALID_OPERATION: Mismatch between texture format and sampler
            // type` and `Cannot read properties of undefined (reading 'usedTimes')` — the
            // restore never runs and the renderer stays PERMANENTLY BOUND to that offscreen
            // target.
            //
            // From that moment the ghost fix becomes a NO-OP: every per-frame call here dutifully
            // clears the leaked PICK BUFFER while the canvas keeps compositing its last good
            // frame, and the camera goes on orbiting behind a frozen image. That is precisely why
            // ADR-0108 is in the code and the founder STILL sees ghost-on-rotate.
            //
            // Unbinding first makes this function mean what its name says. It is also the honest
            // fix for a shared resource: the frame owner asserts its own invariant rather than
            // trusting every borrower to unwind correctly on the error path.
            obc.setRenderTarget?.(null);

            obc.setClearColor?.(new THREE.Color(0x000000), 0);
            obc.clear?.(true, true, true);
            if (!quiet) {
                console.log(`[initScene] §FIX-OBC-BASE-STALE-COMPOSITE OBC base framebuffer cleared (${reason}).`);
            }
        } catch (e) {
            console.warn('[initScene] §FIX-OBC-BASE-STALE-COMPOSITE OBC base clear failed (non-fatal):', e);
        }
    };

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
        //
        // §L-372 Batch 2 / L-382 — this BOOT abort is intentionally LEFT AS-IS (zero
        // boot-behavior change): a catastrophic WebGPURenderer boot failure still falls to
        // OBC exactly as today. The heavy-generation classic-renderer route is driven
        // ENTIRELY through the live-swap path (§RENDERER-LIVE-SWAP below), which builds the
        // classic renderer via `createRenderer(newCanvas, 'webgl-classic')` and rebinds in
        // place — it never re-enters this boot Phase-5 block, so re-asserting this abort
        // does not affect the L-372/L-382 fix.
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
        pryzmRendererBackend = rendererResult.backend; // §PERF-WEBGL2-NO-TSL authoritative backend

        // §PERF-WEBGPU-FRAGMENT / ADR-0076 — remount the backend toggle now that
        // createRenderer() has set window.pryzmRendererBackend, so the pill shows
        // the active backend (e.g. "· webgpu"). mount() is idempotent.
        try { rendererBackendToggle.mount(); } catch { /* non-fatal cosmetic remount */ }

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
        //
        // ⚠ §VIEWPORT-BG-BACKEND-VOCABULARY (L-1191) — BOTH writes below are now
        // gated on `isNativeWebGpuBackend(pryzmRendererBackend)`. Everything the
        // paragraph above argues is true of NATIVE WebGPU and FALSE of the two
        // lightweight WebGL backends: there is no MRT attachment, no `hasGeometry`
        // mask and no `bgUniform` on 'webgl-fallback' / 'webgl-only', so nulling
        // the background and priming the clear TRANSPARENT there does not enable a
        // compositing formula — it simply removes the only two things that paint
        // the viewport, and the app-chrome grey (`--app-bg` #e8edf6) shows through
        // the overlay. That is the founder's recurring grey viewport (L-326 →
        // L-1148 → L-1191).
        //
        // This was ALREADY the wrong decision before L-1148: RN1 moved the
        // decision into `RenderPipelineManager._applyViewportBackground()`
        // (§VIEWPORT-BG-ONE-AUTHORITY-RUNTIME), which resolves it from the bound
        // backend — but left these two unconditional writes standing. They are
        // harmless TODAY only because `rpm.bind()` happens to run LATER in this
        // same function (:3091) and overwrites both. A single authority whose
        // correctness depends on the statement ORDER of a rival writer 1000 lines
        // away is not a single authority. Gate them, so the rival writer only ever
        // asserts the case where it and the authority AGREE.
        if (isNativeWebGpuBackend(pryzmRendererBackend)) {
            world.scene.three.background = null;
            // Also prime the pryzmRenderer clear color to fully transparent so any
            // explicit clear before the pipeline runs doesn't bleed opaque white.
            try {
                (pryzmRenderer as any).setClearColor?.(new THREE.Color(0x000000), 0);
            } catch { /* not all renderer variants expose setClearColor */ }
        } else {
            console.log(
                '[initScene] §VIEWPORT-BG-BACKEND-VOCABULARY boot backend is ' +
                `'${pryzmRendererBackend}' (lightweight WebGL) — the transparent clear prime and ` +
                'the scene.background null are SKIPPED; RenderPipelineManager owns the viewport ' +
                'background on this backend (§VIEWPORT-BG-ONE-AUTHORITY-RUNTIME).',
            );
        }

        // Expose for debugging and for legacy service suspend/resume
        window.pryzmCanvas          = pryzmCanvas;
        window.pryzmRenderer        = pryzmRenderer;
        // Expose OBC WebGL renderer canvas for sheet 3D view thumbnail capture
        window.obcRendererCanvas    = postproductionRenderer.three.domElement;

        // §FIX-OBC-BASE-STALE-COMPOSITE (Defect A / A1) — the "junks / duplicated
        // visuals on camera move" root cause. In Phase 5 the PRYZM overlay canvas
        // (z-index:2, alpha:true, cleared transparent every frame) is composited on
        // TOP of the OBC base canvas. The OBC base renderer has autoClear=false
        // (BimWorld.ts) and is now silenced (MANUAL, postproduction off, never
        // renders again) — so it FREEZES on whatever it last painted during boot,
        // before Phase 5 locked it. As the camera orbits/pans, the overlay draws the
        // scene at its new positions while the frozen OBC frame shows the OLD
        // positions THROUGH the overlay's transparent pixels → the user sees BOTH
        // the live and the stale geometry at once = doubled/ghosted "junks".
        //
        // Fix: clear the OBC base framebuffer ONCE at hand-over so nothing stale
        // sits under the transparent overlay. OBC never renders again in Phase 5 so a
        // single clear suffices; VPT/bloom modes re-drive the OBC canvas themselves
        // (they hide pryzmCanvas), so the canvas stays fully usable. Re-applied after
        // a live backend swap (§RENDERER-LIVE-SWAP) for the same reason.
        clearObcBaseFramebuffer('phase5-activate');

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

    // §FIX-LOAD-TRAVERSE-BATCH (P2) — hoisted handle to the consolidated tier + PBR
    // pass. Assigned inside the RenderingPipelineCoordinator try-block below (where
    // the coordinator + collectNewPbrMeshes exist) and invoked once by the post-load
    // `pryzm-project-loaded` handler, which lives OUTSIDE that try-block's scope.
    let _runConsolidatedTierPbrPass: (() => void) | null = null;

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

        // ── ADR-0076 Axis 1 (§PERF-WEBGPU-FRAGMENT) — render quality tier hooks ──
        // The coordinator owns shadow level + reflection probe directly; SSGI / TRAA
        // and the furniture shadow budget live elsewhere, so we inject them as hooks.
        // Default-on + hysteretic: ≤1500 meshes = cinematic (full quality, unchanged);
        // a typical generated building (~4000 meshes) drops to `performance`
        // (SSGI off, TRAA off, shadow=standard, decorative-furniture shadows off).
        renderingCoordinator.setTierFurnitureBudgetHook((decorativeShadows) => {
            setFurnitureShadowBudget(decorativeShadows ? 'full' : 'decorative-off');
        });
        renderingCoordinator.setTierSsgiHook((enabled) => {
            // window.enableSSGI/disableSSGI self-guard: enableSSGI is a no-op while
            // the WebGPU TSL pipeline owns SSGI, so this is safe on every backend.
            if (enabled) { void window.enableSSGI?.(); }
            else { window.disableSSGI?.(); }
        });
        renderingCoordinator.setTierTraaHook((enabled) => {
            // TRAA lives in RenderPipelineManager (WebGPU TSL path). Resolved at
            // call-time via window so the RPM (created later in this init) is wired.
            // Both methods are idempotent + no-op when WebGPU is inactive.
            const rpm = window.renderPipelineManager;
            if (enabled) { void rpm?.activateTRAA?.(); }
            else { void rpm?.deactivateTRAA?.(); }
        });
        // §PERF-HEAVY-SHADOW-OFF — the REAL heavy-scene shadow lever. The coordinator's
        // own ShadowQualityUpgrader is bound to the (Phase-5-silenced) OBC WebGL renderer
        // and only de-shadows lights it snapshotted, so its ≥8000-caster ceiling never
        // reached the Pascal key light — the sole default shadow caster that the live
        // PRYZM WebGPU renderer actually draws a pass for. On the 40-storey office
        // (13,652 meshes → performance tier, 12,737 shadow-flagged) that pass runs EVERY
        // navigation frame and is the dominant cost. Routing the gate here to
        // pascalSceneLighting.setShadowsSuppressed() clears keyLight.castShadow → THREE
        // renders no shadow pass at all. Reversible; small (<8000-mesh) scenes keep
        // their shadows exactly as before because the gate only trips at the ceiling
        // (or `settings.shadows === false` at survival).
        //
        // §FIX-SHADOW-MIDSUBMIT-DESTROY — the HEAVY-tier gate and the NAV gate no
        // longer share the castShadow lever. HEAVY is a PERSISTENT drop of the whole
        // shadow pass (≥8000 casters / survival) — clearing keyLight.castShadow is
        // correct there because it happens once and stays, and THREE reclaims the map
        // on its own schedule (§SHADOW-DEVICE-LOSS-FIX). NAV is a TRANSIENT per-motion
        // suppression that used to thrash castShadow (destroying the ShadowDepthTexture
        // mid-submit → black 3D); it now FREEZES the map instead (see the nav-LOD block
        // below), so the two intents are fully decoupled.
        let _heavyShadowSuppressed = false;
        let _navShadowSuppressed   = false;
        renderingCoordinator.setTierSceneShadowHook((suppressed) => {
            _heavyShadowSuppressed = suppressed;
            try { pascalSceneLighting.setShadowsSuppressed(suppressed); }
            catch (e) { console.warn('[initScene] §PERF-HEAVY-SHADOW-OFF setShadowsSuppressed error:', e); }
        });

        // §FIX-SHADOW-LOAD-TIER-DESTROY (founder L-39) — shadow-map realloc guard.
        // The load-time sibling of §FIX-SHADOW-MIDSUBMIT-DESTROY / ADR-0111 (L-25).
        //
        // ShadowQualityUpgrader.apply()/setLevel() reallocate the Pascal key light's
        // shadow map (mapSize 512→2048) when the SceneQualityTier escalates to
        // `cinematic` on project open. The map lives on the light, so the LIVE PRYZM
        // WebGPU renderer draws its shadow pass with it — and with that renderer's
        // `shadowMap.autoUpdate=true`, THREE performs the realloc INSIDE a render/submit
        // while the rAF loop is still draining command buffers that reference the old
        // ShadowDepthTexture → "Destroyed texture [ShadowDepthTexture] used in a submit"
        // ×hundreds → WebGPU device loss → the whole app freezes on the last frame. The
        // existing §SHADOW-DEVICE-LOSS-FIX setTimeout(0) covered the upgrader's explicit
        // .dispose() but NOT THREE's own in-render realloc when autoUpdate is live.
        //
        // The guard FREEZES the live renderer's shadow map (autoUpdate=false via the
        // ref-counted setShadowReallocFrozen) so THREE cannot touch it while the mapSize
        // changes, runs the realloc, then THAWS on a deferred macrotask (setTimeout(0),
        // past the in-flight submit) + wakes the loop once so the single regen at the
        // new resolution lands on an idle frame. Reuses the same mechanism/discipline as
        // the nav lever; WebGPU-path only (setShadowReallocFrozen is a no-op on WebGL2).
        renderingCoordinator.setShadowReallocGuardHook((mutate) => {
            const rpm = window.renderPipelineManager;
            try { rpm?.setShadowReallocFrozen?.(true); }
            catch (e) { console.warn('[initScene] §FIX-SHADOW-LOAD-TIER-DESTROY freeze error:', e); }
            try {
                mutate();
            } finally {
                // Defer the thaw past the current frame's submit so the one regen at the
                // new shadow resolution happens on an idle frame, never mid-submit.
                setTimeout(() => {
                    try { rpm?.setShadowReallocFrozen?.(false); }
                    catch (e) { console.warn('[initScene] §FIX-SHADOW-LOAD-TIER-DESTROY thaw error:', e); }
                    // Wake the loop once so the refreshed shadow pass is actually drawn
                    // before the scheduler idles (P3: no new rAF — reuse the frame bus).
                    try { getFrameScheduler().markDirty('shadow-realloc-thaw'); }
                    catch { /* scheduler not ready — next interaction repaints */ }
                }, 0);
            }
        });

        // §FIX-SHADOW-TIER-CASTER-DESTROY (founder L-908) — shadow-CASTER-SET guard.
        //
        // The SIBLING of the realloc guard above, and deliberately a SEPARATE seam. The
        // realloc guard freezes (`autoUpdate=false`) so THREE cannot resize the map
        // mid-encode — correct for a mapSize change, and useless for this one. When the
        // tier's ≥8000-mesh ceiling clears `keyLight.castShadow`, three drops the light's
        // ShadowNode and releases the ShadowDepthTexture on its OWN schedule inside the
        // next render(); there is no depth pass left for a freeze to suppress. Only
        // PAUSING SUBMITS orders that release against the frames still in flight — the
        // same remedy §L930-DETACH-BEFORE-FREE established for the recovery path.
        //
        // Wired to the RPM's ref-counted submit-pause pair, so it composes with the nav
        // (L-25), whole-load (L-39), wall-commit (L-64) and rebuild (L-231/L-930) windows
        // rather than adding a fifth independent latch. Falls back to running the mutation
        // unwrapped when the RPM is absent or on the WebGL2 fallback (which owns its own
        // shadowMap and needs no pause) — the coordinator is no-op-safe either way.
        renderingCoordinator.setShadowCasterGuardHook((mutate) => {
            const rpm = window.renderPipelineManager;
            if (!rpm?.runShadowCasterMutation) { mutate(); return; }
            try {
                rpm.runShadowCasterMutation(mutate);
            } catch (e) {
                console.warn('[initScene] §FIX-SHADOW-TIER-CASTER-DESTROY caster guard error:', e);
            }
            // Wake the loop once the guard's deferred resume AND thaw have both landed,
            // so the single depth regen at the NEW caster set is actually drawn before
            // the scheduler idles. The RPM resumes submits at T+1 and pops the freeze at
            // T+2, so the wake is NESTED to land at T+2 — a single setTimeout(0) here
            // would fire at T+1, repaint against a still-frozen map, and leave the
            // post-thaw `needsUpdate` with nothing to wake it (P3: no new rAF — this
            // reuses the frame bus).
            setTimeout(() => {
                setTimeout(() => {
                    try { getFrameScheduler().markDirty('shadow-caster-thaw'); }
                    catch { /* scheduler not ready — next interaction repaints */ }
                }, 0);
            }, 0);
        });

        // §PERF-NAV-LOD — drop the shadow PASS DURING active camera motion and
        // restore it once the camera settles. This is a real per-frame win on the
        // mid-heavy band (2500–8000 meshes) that the heavy ceiling does NOT cover
        // (those scenes keep shadows at rest). Reuses the EXISTING camera-controls
        // motion events (P3: no new requestAnimationFrame). Gated on a non-trivial
        // live mesh count so small/showcase scenes never flicker their shadows on
        // orbit. When the scene is already heavy, `heavy` keeps shadows off through
        // the settle, so nav-LOD is a no-op there (correct).
        //
        // §FIX-SHADOW-MIDSUBMIT-DESTROY (founder L-25) — this lever NO LONGER clears
        // `keyLight.castShadow`. Clearing castShadow made THREE's WebGPU shadow
        // renderer DESTROY the ShadowDepthTexture inside the next rp.render(), while
        // the previous frame's command buffer (referencing it) was still in flight →
        // "Destroyed texture [ShadowDepthTexture] used in a submit" → device-loss →
        // black 3D. Rapid mouse motion (each nudge = controlstart→rest) thrashed that
        // destroy/realloc every few frames. Instead we FREEZE the shadow map on the
        // live WebGPU renderer (rpm.setShadowPassSuppressed → shadowMap.autoUpdate =
        // false): THREE reuses the existing texture and skips the shadow-caster
        // re-render — the pass is skipped, but NOTHING is destroyed, so a mid-submit
        // destroy is impossible. Restore is DEBOUNCED so a burst of nudges does not
        // repeatedly force a shadow re-render.
        const NAV_LOD_MIN_MESHES = 1_200; // matches the large-scene tier cap floor
        const NAV_LOD_RESTORE_SETTLE_MS = 120; // debounce: settle before un-freezing
        const _liveMeshCount = (): number => {
            let n = 0;
            try {
                (world.scene.three as THREE.Scene).traverse((o) => {
                    if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) n++;
                });
            } catch { /* count is advisory */ }
            return n;
        };
        let _navRestoreTimer: ReturnType<typeof setTimeout> | null = null;
        const _freezeNavShadow = (): void => {
            if (_navShadowSuppressed) return;
            _navShadowSuppressed = true;
            // Freeze the shadow map — never destroys the texture (safe mid-submit).
            try { window.renderPipelineManager?.setShadowPassSuppressed?.(true); }
            catch (e) { console.warn('[initScene] §FIX-SHADOW-MIDSUBMIT-DESTROY nav freeze error:', e); }
        };
        const _thawNavShadow = (): void => {
            if (!_navShadowSuppressed) return;
            _navShadowSuppressed = false;
            // Un-freeze: refresh the shadow map once against the settled scene, unless
            // the heavy-tier gate wants shadows dropped anyway (then leave it frozen —
            // §PERF-HEAVY-SHADOW-OFF has already cleared castShadow, no pass runs).
            try { window.renderPipelineManager?.setShadowPassSuppressed?.(_heavyShadowSuppressed); }
            catch (e) { console.warn('[initScene] §FIX-SHADOW-MIDSUBMIT-DESTROY nav thaw error:', e); }
            // The scene is settling → the loop is about to go idle. Mark one dirty
            // frame so the refreshed shadow pass is actually rendered before the
            // scheduler stops (P3: no new rAF — just wake the existing loop once).
            if (!_heavyShadowSuppressed) {
                try { getFrameScheduler().markDirty('nav-lod-shadow-restore'); }
                catch { /* scheduler not ready — next interaction repaints */ }
            }
        };
        // Cache the mesh count at motion START (one traverse per drag, not per frame).
        world.camera.controls.addEventListener('controlstart', () => {
            // A new motion burst — cancel any pending restore so we don't thaw mid-drag.
            if (_navRestoreTimer !== null) { clearTimeout(_navRestoreTimer); _navRestoreTimer = null; }
            if (_navShadowSuppressed) return;
            if (_liveMeshCount() < NAV_LOD_MIN_MESHES) return;
            _freezeNavShadow();
        });
        const _endNavLod = (): void => {
            if (!_navShadowSuppressed) return;
            // Debounce the thaw: if another motion burst starts within the settle
            // window, controlstart cancels this and keeps the map frozen — so rapid
            // start/settle nudges never thrash shadow-map re-renders.
            if (_navRestoreTimer !== null) clearTimeout(_navRestoreTimer);
            _navRestoreTimer = setTimeout(() => {
                _navRestoreTimer = null;
                _thawNavShadow();
            }, NAV_LOD_RESTORE_SETTLE_MS);
        };
        // rest/sleep fire after the damping tail fully settles (controlend fires too
        // early — damping keeps moving the camera for several hundred ms after).
        world.camera.controls.addEventListener('rest', _endNavLod);
        world.camera.controls.addEventListener('sleep', _endNavLod);

        // §PERF-WEBGL2-NO-SSGI — authoritative "is this a REAL WebGPU backend?" signal
        // for the render-tier backend gate. On the WebGL2 fallback backend (a
        // WebGPURenderer with forceWebGL:true, or a plain WebGLRenderer) the tier must
        // force SSGI/TRAA OFF — otherwise the legacy multi-pass denoised SSGIService
        // (window.enableSSGI → SSGIService.activate) runs on the GL thread and freezes
        // the viewport (renders but cannot orbit) on heavy scenes. The RPM's
        // status.webGpuActive is set from RenderPipelineManager.isRealWebGPUBackend()
        // (backend.isWebGPUBackend === true) — the same authoritative signal
        // §PERF-WEBGL2-NO-TSL uses to gate the TSL pipeline. Resolved at call-time:
        // the RPM is created later in this init, and undefined (RPM not yet bound)
        // safely leaves cold-start behaviour unchanged.
        const resolveIsRealWebGPU = (): boolean | undefined =>
            window.renderPipelineManager?.status?.webGpuActive;

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
            // §FIX-LIGHT-TIER-UNWIRED (2026-08-09) — lighting was the ONLY element type
            // absent from this list, so placing a fixture never re-evaluated the render
            // tier. A fixture is not a cheap element: it adds meshes AND (up to the
            // live-light budget) a real PointLight, which is a MULTIPLIER on the whole
            // scene's per-fragment shading and a full shader-permutation rebuild
            // (§PERF-LIGHT-COST-MODEL). The one element type that changes the light
            // count was invisible to the subsystem that exists to bound it.
            'bim-lighting-added',  'bim-lighting-updated',
        ] as const;
        /**
         * §FIX-LIGHT-TIER-UNWIRED (2026-08-09) — push the resolved render tier into the
         * lighting builder's LIVE-LIGHT BUDGET.
         *
         * `LiveLightBudget` authors a per-tier ladder and `LightingFragmentBuilder`
         * exposes `setQualityTier` to consume it — but NOTHING in production ever called
         * it (only `FixtureEmission.test.ts`). So `_tier` stayed `undefined` forever and
         * the budget was pinned to `DEFAULT_LIVE_LIGHT_BUDGET` on every scene, on every
         * backend, no matter how heavy: authored capability, unreachable in production.
         *
         * The tier is computed here already (`applyTierForMeshCount`); this forwards it.
         * Structural cast, not `any` (P4): `window.lightingBuilder` is typed `unknown`.
         */
        const _pushTierToLightBudget = (tier: SceneQualityTier): void => {
            try {
                (window.lightingBuilder as { setQualityTier?: (t: SceneQualityTier) => void } | undefined)
                    ?.setQualityTier?.(tier);
            } catch (lightTierErr) {
                console.warn('[initScene] §FIX-LIGHT-TIER-UNWIRED light-budget tier push failed (non-fatal):', lightTierErr);
            }
        };
        // §FIX-LOAD-TRAVERSE-BATCH (P2) — the per-add tier + PBR pass, extracted so
        // the SAME work can run either per-event (interactive path) or exactly ONCE
        // after a project load completes (see the consolidated post-load pass in the
        // `pryzm-project-loaded` handler below). The tier + PBR result is identical
        // either way — only the FREQUENCY changes.
        const runTierPbrPass = (reason: string): void => {
            const scene = world.scene.three as THREE.Scene;
            // §A.21.D40 PBR-SCOPE — only the meshes we haven't already upgraded
            // (was: a full scene.traverse on every geometry event).
            // §PERF-L03-TIER-TRAVERSE (P1.1) — gated timing of the collect traverse.
            const newMeshes = perfTraceOn()
                ? perfTime('l03.collectNewPbrMeshes', () => collectNewPbrMeshes(scene))
                : collectNewPbrMeshes(scene);
            if (newMeshes.length > 0) renderingCoordinator.onSceneGeometryAdded(newMeshes);
            // §PERF-WEBGPU-FRAGMENT / ADR-0076 — re-evaluate the render tier on
            // every (non-batched) geometry add too, not only at batch-end. Some
            // generators (e.g. the residential-building pipeline) add geometry
            // outside batchCoordinator batches, so the post-batch callback alone
            // could leave the tier stuck at cold-start. applyTierForMeshCount
            // ALWAYS logs (observable) and only re-applies on a real tier change.
            // Hoisted to the pass scope so the §AUTO-WEBGL-HEAVY swap below can read the
            // live mesh count (feeds the dedicated ≥ 1000-mesh swap arm, ADR-0267 §Fix-1).
            let meshCount = 0;
            try {
                const countMeshes = (): void => {
                    meshCount = 0;
                    scene.traverse((obj) => {
                        if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) meshCount++;
                    });
                };
                // §PERF-L03-TIER-TRAVERSE (P1.1) — gated timing of the mesh-count traverse.
                if (perfTraceOn()) perfTime('l03.tierMeshCount', countMeshes);
                else countMeshes();
                // §DEFER-TIER-DURING-DRAW — if a wall/tool draw is in progress,
                // do NOT escalate the tier now: on an empty project the FIRST
                // wall would flip cold-start→cinematic, disposing+rebuilding the
                // WebGPU pipeline and turning TRAA on mid-draw (visible stall +
                // ghosted rubber-band). deferTierApply() captures the LATEST apply
                // and runs it exactly once when the interaction ends.
                // §FIX-LIGHT-TIER-UNWIRED — the tier the coordinator resolves is also the
                // live-light budget's tier; forward it (see _pushTierToLightBudget).
                const applyTier = () => {
                    const res = renderingCoordinator.applyTierForMeshCount(meshCount, resolveIsRealWebGPU());
                    _pushTierToLightBudget(res.tier);
                    return res;
                };
                if (!toolInteractionRef.deferTierApply(applyTier)) {
                    applyTier();
                }
                if (perfTraceOn()) {
                    perfLog('§PERF-L03-TIER-TRAVERSE', `pass reason=${reason} meshCount=${meshCount} newMeshes=${newMeshes.length}`);
                }
            } catch (tierErr) {
                console.warn('[initScene] §PERF-WEBGPU-FRAGMENT per-event tier apply error:', tierErr);
            }
            // §AUTO-WEBGL-HEAVY (ADR-0267, L-362) — the residential-building pipeline adds its
            // geometry OUTSIDE batchCoordinator batches, so its heaviness only ever surfaces on
            // THIS per-add tier pass (the batch GPU-compile-start hook never fires for it). As the
            // scene crosses the device-loss-risk threshold, proactively live-swap Auto→WebGL once
            // (before the WebGPU PSO storm that TDRs the device on some GPUs, L-361). No-op on
            // light scenes / explicit backends / non-WebGPU / after the first swap. Rendering is
            // live here (no batch suppress), so this is an ordinary live swap — the same path the
            // corner toggle uses. Best-effort.
            try {
                // Thread the live scene mesh count (already counted above) so the swap's
                // dedicated ≥ 1000-mesh arm (ADR-0267 §Fix-1 / L-366) can trip on a
                // ~1,645-mesh building whose top-level element roots stay under 400.
                maybeAutoSwitchToWebGLForHeavyScene(scene, `tier:${reason}`, meshCount);
            } catch (autoWebGlErr) {
                console.warn('[initScene] §AUTO-WEBGL-HEAVY guard error (non-fatal):', autoWebGlErr);
            }
            // §L-361-WEBGPU-TRANSMISSION-GUARD (ADR-0267 §Fix-2 / L-366) — the residential /
            // office generators add glass OUTSIDE batchCoordinator batches, so
            // BatchCoordinator's setShadowPassDisabled('batch', true) — the ONLY caller of the
            // transmission neutralizer — never fires for them, leaving the transmission-glass
            // TSL node graph to compile on the first WebGPU render and device-loss ("expected a
            // float", L-361). Neutralize transmission glass on THIS non-batched geometry-add
            // hook too (the same seam the Auto-swap uses), BEFORE the next render that would
            // compile the node. Real-WebGPU-gated + idempotent inside the RPM method; a cheap
            // no-op on WebGL and on an explicit-WebGL backend. Best-effort.
            try {
                window.renderPipelineManager?.neutralizeTransmissionForWebGPU?.();
            } catch (txErr) {
                console.warn('[initScene] §L-361-WEBGPU-TRANSMISSION-GUARD non-batched neutralize error (non-fatal):', txErr);
            }
            // §REVERT-SHADOW-TO-KNOWN-GOOD (L-205) — no WebGPU ScenePass rebuild is triggered
            // on new geometry, here or anywhere. The first-caster rebuild seam was reverted:
            // shadow sampling is keyed on the LIGHT (the Pascal key light casts from boot) and
            // the shadow depth map re-renders every frame via THREE's `autoUpdate`
            // (ShadowNode.updateShadow draws every castShadow mesh currently in the scene), so
            // new casters are picked up with NO pipeline rebuild — the last-known-good
            // 72e34915 topology. The only geometry-driven shadow work now is
            // RealEnvironmentService's pure caster-VISIBILITY gate (below), which flips
            // `mesh.visible` and touches no GPU resource.
        };
        // Publish the consolidated pass to the hoisted handle so the post-load
        // handler (outside this try-block's scope) can fire it exactly once.
        _runConsolidatedTierPbrPass = () => runTierPbrPass('post-load');

        _rpcGeomEvents.forEach(evt => {
            window.addEventListener(evt, () => {
                // §PERF-L03-TIER-TRAVERSE (P1.1) entry — log the batch/load state at
                // add-event time (gated). During a load, isBatching is FALSE while
                // loadActive is TRUE: that is the O(n²) window §FIX-LOAD-TRAVERSE-BATCH
                // closes (the per-add traverse below is skipped, one pass runs at load end).
                if (perfTraceOn()) {
                    perfLog(
                        '§PERF-L03-TIER-TRAVERSE',
                        `event=${evt} isBatching=${batchCoordinator.isBatching} loadActive=${isProjectLoadActive()}`,
                    );
                }
                // P1.3 + §FIX-LOAD-TRAVERSE-BATCH (P2): skip the per-add scene
                // traversal during a batchCoordinator batch OR a project load. The
                // consolidated pass runs once at batch-end (setPostBatchCallback below)
                // / load-end (pryzm-project-loaded handler below).
                if (shouldDeferPerAddGeometryPass(batchCoordinator.isBatching)) return;
                // Defer one tick so fragment builders can add meshes before we scan
                setTimeout(() => {
                    runTierPbrPass(`add:${evt}`);
                }, 0);
            });
        });

        // §PERF-POSTGEOM-COMPILE-NO-SYNC-BLOCK (ADR-0094) — inject the ACTUAL live
        // scene mesh-count provider the BatchCoordinator uses to gate its post-geometry
        // synchronous `rpm.render()` compile. BatchCoordinator lives in core-app-model
        // and must not import THREE (P2), so it reads the real scene size via this hook
        // (initScene is the THREE owner). Without it, the coordinator judged small-vs-
        // large by the batch's EXPECTED element count — which is ~0 for office/resi/
        // apartment (geometry arrives via the bus uncounted) — so a 1200+-mesh tower
        // slipped into a ~50s synchronous render that froze the viewport.
        batchCoordinator.setSceneMeshCountProvider(() => {
            const scene = world.scene.three as THREE.Scene;
            const count = (): number => {
                let meshCount = 0;
                scene.traverse((obj) => {
                    if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) meshCount++;
                });
                return meshCount;
            };
            // §PERF-L03-TIER-TRAVERSE (P1.1) — gated timing of the on-demand
            // mesh-count provider (invocation count + wall-clock accumulate).
            return perfTraceOn() ? perfTime('l03.meshCountProvider', count) : count();
        });

        // P1.3: Single consolidated geometry pass after every batch completes.
        // During a batch (e.g. 50 curtain walls via AI), the per-element `bim-*-added`
        // window events are gated above (isBatching guard) and in the Pascal block below.
        // _executeFinalSweep() fires this callback ONCE after storeEventBus.endBatch(),
        // when all geometry is stable and all registrations are complete.
        // The setTimeout(0) here matches the existing per-element deferred pattern,
        // ensuring any trailing one-tick builder work lands before the scan.
        batchCoordinator.setPostBatchCallback(() => {
            // ── ADR-0076 Axis 1 (§PERF-WEBGPU-FRAGMENT) — re-tier after every batch ──
            // A batch is the moment a scene becomes heavy. Count the live scene
            // meshes once and let the coordinator step the quality tier down on
            // already-heavy scenes (hysteretic; idempotent — only re-applies on a
            // real tier change). Runs regardless of the PBR-skip early-return below.
            try {
                const scene = world.scene.three as THREE.Scene;
                let meshCount = 0;
                scene.traverse((obj) => {
                    if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) meshCount++;
                });
                // §DEFER-TIER-DURING-DRAW — same deferral at the post-batch trigger.
                // A batch that lands while a draw is live must not rebuild the pipeline
                // mid-interaction; the escalation runs once the tool commits/deactivates.
                // §FIX-LIGHT-TIER-UNWIRED — same forwarding at the post-batch trigger; an
                // AI lighting layout adds its fixtures INSIDE a batch, so this is the seam
                // where a 60-fixture plate must degrade its live-light budget.
                const applyTier = () => {
                    const res = renderingCoordinator.applyTierForMeshCount(meshCount, resolveIsRealWebGPU());
                    _pushTierToLightBudget(res.tier);
                    return res;
                };
                if (!toolInteractionRef.deferTierApply(applyTier)) {
                    applyTier();
                }
            } catch (tierErr) {
                console.warn('[initScene] §PERF-WEBGPU-FRAGMENT tier apply error:', tierErr);
            }

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

            // §PERF-WEBGPU-FRAGMENT / ADR-0076 — TIER-GATED PBR DEFER (the 38.7s fix).
            // On a real 4073-mesh building the post-batch PBRSceneUpgrader is ~38.7s
            // wall-clock (materials look unfinished for ~38s). It is only a cosmetic
            // envMapIntensity/toneMapped refinement — base MeshStandardMaterial already
            // renders correctly without it. So at `balanced` and above (any scene
            // beyond a small ≤1500-mesh showcase) we SKIP the whole-scene upgrade
            // entirely. The tier was already (re)evaluated at the top of this callback,
            // so currentTier reflects this batch's mesh count.
            if (!renderingCoordinator.shouldRunFullPbrUpgrade()) {
                let _mc = 0;
                try {
                    (world.scene.three as THREE.Scene).traverse((o) => {
                        if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) _mc++;
                    });
                } catch { /* count is advisory */ }
                console.log(
                    `[SceneQualityTier] deferring/skipping post-batch PBR upgrade ` +
                    `(${_mc} meshes — tier above 'cinematic'; base MeshStandardMaterial ` +
                    `renders correctly without the cosmetic envMap tuning). §PERF-WEBGPU-FRAGMENT`
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

            // §5.1 — Show crash fallback when the pipeline enters phase='error'.
            //
            // §L-966 — PASS THE ERROR. This call used to take no argument, although
            // `handlePipelineError(error?: Error)` has always accepted one, so the
            // guard minted its own placeholder — *"Render pipeline retries exhausted
            // — phase=error"*. On the founder's actual path that string is a
            // FABRICATION: the escalation came from `_onDestroyedGpuResource`, which
            // sets phase='error' directly and never runs the retry ladder. Worse, the
            // guard's `_diagnose()` keys on the error SIGNATURE to decide whether to
            // say "this is a PRYZM defect" or the default "probably your GPU driver"
            // — so discarding the identity here made us blame the user's hardware for
            // our own resource-lifetime bug, and cost us the bug report. `lastError`
            // now carries what actually died, and why recovery could not fix it.
            if (status.phase === 'error') {
                viewportCrashGuard.handlePipelineError(status.lastError ?? undefined);
            }
        };

        // Phase 5: bind to pryzmRenderer (WebGPU if Phase 5 succeeded, OBC WebGL as fallback).
        // When WebGPU active, bind() sets _webGpuActive=true and builds the TSL pipeline.
        // Always start with a pure white background (light theme).
        // Binding with 'light' initialises the TSL bgUniform directly to #ffffff —
        // no extra setColor() call needed, so there is no dark→white flash.
        //
        // §PERF-WEBGL2-NO-TSL — thread the AUTHORITATIVE backend the factory already
        // resolved. ONLY backend==='webgpu' (a native WebGPU backend) may run the TSL
        // pipeline. backend==='webgl-fallback' is a WebGPURenderer with forceWebGL → a
        // WebGL2 backend: it has isWebGPURenderer===true but MUST use the lightweight
        // WebGL path. Passing this flag stops bind() re-probing the renderer CLASS (the
        // old `.isWebGPURenderer` check) which wrongly bound SSGI/outlines/post-FX on the
        // forced-WebGL path → multi-minute load + frozen viewport on heavy scenes.
        // §VIEWPORT-BG-BACKEND-VOCABULARY / L-1284 — ask the PARTITION, never
        // re-write the comparison. `isNativeWebGpuBackend` and
        // `isLightweightWebGlBackend` are exhaustive by construction (the second
        // is defined as the negation of the first), so a fourth `RendererBackend`
        // member can never land on the wrong side of them. A hand-written
        // `=== 'webgpu'` here agreed with the predicate today and would have had
        // to be found by hand tomorrow; every other decision site in this file
        // (2111, 3177, 4475, 4487, 4613) was already converted and this one was
        // missed.
        const backendIsRealWebGPU = isNativeWebGpuBackend(pryzmRendererBackend);
        await renderPipelineManager.bind(
            world.scene.three as THREE.Scene,
            world.camera.three,
            pryzmRenderer,
            'light',
            backendIsRealWebGPU,
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
        //
        // §FIX-SSGI-DEFAULT-OFF-TRAA-SELECT-FLASH (founder L-59) — SSGI is likewise NOT
        // activated at startup. SSGINode's per-frame denoise temporal accumulation
        // flickers ALL elements on WebGPU (the founder's constant-flicker report), so
        // SSGI is now purely user-opt-in via the RenderRail toggle (rpm.activateSSGI()).
        // Only outlines are built here — the pipeline runs at phase4 (outlines composited
        // by _buildPipeline, no SSGI/AO/GI needed) so selection highlighting still works.
        if (renderPipelineManager.status.webGpuActive) {
            await renderPipelineManager.activateOutlines();
            console.log('[initScene] TSL pipeline at Phase 4 (Outlines only). SSGI + TRAA OFF by default (user-opt-in).');
        } else if (isPhase5Active && isLightweightWebGlBackend(pryzmRendererBackend)) {
            // ── §PERF-WEBGL2-RENDER-ON-MOVE (ADR-061) ────────────────────────
            // §VIEWPORT-BG-BACKEND-VOCABULARY (L-1191) — this gate was the literal
            // `pryzmRendererBackend === 'webgl-fallback'`, and the comment that stood
            // here defended it: "boot can never resolve to 'webgl-only' (the Phase-5
            // abort above rejects it), so a 'webgl-only' arm here would be dead."
            //
            // That claim is TRUE today — re-verified 2026-08-19 at :2015,
            // `isWebGPUCapable = rendererResult.backend !== 'webgl-only'` throws the
            // Phase-5 abort — and it is exactly the problem. A gate that lists ONE of
            // the TWO lightweight backends and is correct only because of a guard
            // 1100 lines earlier fails silently the day that guard is relaxed, and it
            // fails as "the viewport never paints at all": nothing arms the per-frame
            // render, nothing arms the OBC base clear, and the app-chrome grey shows
            // through the transparent overlay. Read the ONE predicate instead — it is
            // the complement of native WebGPU, so it cannot list one of two.
            //
            // Phase 5 is active (PRYZM owns the sole renderer, OBC is MANUAL +
            // silenced + `updateIfManualMode` was removed) but the resolved
            // backend is the WebGL2 backend of a forced-WebGL WebGPURenderer, so
            // the TSL pipeline is OFF and renderPipelineManager.render() would
            // no-op. With nothing driving a per-frame paint, the viewport froze
            // during orbit/pan/zoom and only repainted once motion stopped.
            //
            // Enable the lightweight WebGL render path so the existing pascal
            // callback (called once per rAF by the single FrameScheduler loop —
            // C04 §2 / P3) issues a plain `renderer.render(scene, camera)` every
            // frame. The camera-controls 'update'/'controlstart' events already
            // call FrameScheduler.beginMotion() (initScene §cameraDragging), which
            // keeps that single loop alive for the whole drag + damping tail — so
            // the scene now repaints continuously while moving and idles at rest.
            renderPipelineManager.setLightweightWebGlRender(true);
            console.log(
                '[initScene] §PERF-WEBGL2-RENDER-ON-MOVE — lightweight per-frame WebGL render enabled ' +
                `(${pryzmRendererBackend} backend; continuous repaint during camera movement).`,
            );
        }

        // ── §FRAME-STARTS-CLEAN-ON-EVERY-BACKEND (L-1350) ────────────────────────
        // ARM THE BASE CLEAR ON THE CONDITION, NOT THE BACKEND. This used to live
        // inside the lightweight-WebGL arm above, i.e. on the ONE backend where the
        // overlay clears OPAQUE (§FIX-WEBGL2-GHOST-ON-ROTATE-INCOMPLETE / L-317) and
        // therefore the ONE backend where a stale base canvas cannot show through at
        // all. On native WebGPU — where the overlay's output alpha is
        // `presenceAlpha = step(0.0001, contentAlpha)`, deliberately 0 in every
        // empty-space pixel — the base canvas IS visible through the overlay on every
        // frame, and that arm was explicitly disarmed (`setPreLightweightFrameHook(null)`
        // on a swap to WebGPU). The fix was armed where it could not matter and
        // disarmed where it was the only thing that could. That is the founder's WebGPU
        // ghost ("reminiscencia" — the model drawn twice, the faded copy at an older
        // camera pose).
        //
        // The condition the clear answers — "the OBC base canvas may still hold a
        // previous composite when RPM presents a frame" — is true on EVERY Phase-5
        // backend, so it is armed once, here, for all of them. The closure self-gates on
        // the overlay being the visible surface (bloom / legacy-SSGI / VPT render INTO
        // the OBC canvas with the overlay hidden), so arming it always is safe.
        if (isPhase5Active) {
            renderPipelineManager.setPreFrameBaseClearHook(
                () => clearObcBaseFramebuffer('per-frame', /* quiet */ true),
            );
            console.log(
                '[initScene] §FRAME-STARTS-CLEAN-ON-EVERY-BACKEND per-frame OBC base clear armed ' +
                `on backend '${pryzmRendererBackend}' (armed on the CONDITION, not the backend — L-1350).`,
            );
        }

        window.renderPipelineManager = renderPipelineManager;
        // ADR-0077 (§RENDERER-LIVE-SWAP) — hoist for the live-swap rebind layer.
        renderPipelineManagerRef = renderPipelineManager;

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
        // §FIX-SHADOW-LOAD-TIER-DESTROY (founder L-39) — whole-load shadow freeze.
        // Boolean-latched so the ref-counted setShadowReallocFrozen push/pop stays
        // balanced regardless of how many times project-switch / project-loaded fire.
        // Belt-and-suspenders over the per-realloc guard above: while a project loads,
        // the shadow map is frozen so NO shadow-map churn (tier escalation, lighting
        // re-apply, outline rebuild) can destroy the ShadowDepthTexture mid-submit; the
        // shadow quality is escalated exactly once when the device is idle post-load.
        let _loadShadowFreezeActive = false;
        const _freezeShadowForLoad = (): void => {
            if (_loadShadowFreezeActive) return;
            _loadShadowFreezeActive = true;
            try { window.renderPipelineManager?.setShadowReallocFrozen?.(true); }
            catch (e) { console.warn('[initScene] §FIX-SHADOW-LOAD-TIER-DESTROY load-freeze error:', e); }
        };
        const _thawShadowAfterLoad = (): void => {
            if (!_loadShadowFreezeActive) return;
            _loadShadowFreezeActive = false;
            // Defer past the outline rebuild + in-flight submit so the single post-load
            // shadow regen lands on an idle frame (device settled), never mid-submit.
            setTimeout(() => {
                try { window.renderPipelineManager?.setShadowReallocFrozen?.(false); }
                catch (e) { console.warn('[initScene] §FIX-SHADOW-LOAD-TIER-DESTROY load-thaw error:', e); }
                try { getFrameScheduler().markDirty('shadow-load-thaw'); }
                catch { /* scheduler not ready — next interaction repaints */ }
            }, 0);
        };
        window.runtime?.events?.on('pryzm-project-switch', (p: { projectId: string; projectName: string }) => { // F.events.15
            const now = Date.now();
            if (now - _lastProjectSwitchMs < 400) {
                console.log('[initScene] pryzm-project-switch debounced (duplicate within 400ms) — skipping');
                return;
            }
            _lastProjectSwitchMs = now;
            console.log('[initScene] pryzm-project-switch received — project:', p.projectId);
            // Freeze the shadow map for the whole load window (thawed on project-loaded).
            _freezeShadowForLoad();
            renderPipelineManager.onProjectSwitch();
            // Phase 2: clear per-view camera states so the new project starts
            // with fresh default framing rather than stale positions.
            viewController.clearCameraStateStore();
            // §C.5 — Clear EPS projection cache on project switch so Project A's
            // CW drawing-space geometries are never replayed into Project B views.
            // The edgeProjectorService facade forwards to the real service if it
            // has already been lazy-loaded; otherwise this is a safe no-op.
            try { (edgeProjectorService as any).clearCwProjectionCache?.(); } catch { /* best effort */ }

            // §L-325 (C13 render/projection isolation — L-316 / L-320 lineage) —
            // RENDER-SIDE TEARDOWN CHOKEPOINT. `pryzm-project-switch` is emitted by
            // PlatformShell.setProjectContext on EVERY project-entry path (new / create /
            // switch / import) BEFORE the incoming project hydrates — the single reliable
            // render-side trigger (C13 §3.7), the sibling to ClearProjectCommand's
            // data-side teardown (P1: one path, not per-entry-point).
            //
            // The reported leak: a project entered after the 40-storey office left
            // `elementRegistry` holding the tower's 117 roots (new snapshot = 10) — NME
            // exported all 117 and FrustumCullingService audited 878 elements while the
            // 3D scene was empty. The data-load teardown (ClearProjectCommand) either did
            // not stick or was repopulated under the coupled L-324 renderer recovery. This
            // switch fires regardless, so purge the render/projection registries here as
            // the isolation belt (P4 — robust to a mid-recovery renderer where the load
            // path is skipped/corrupted). All calls are idempotent + non-throwing.
            try { elementRegistry.clear(); } catch (e) { console.warn('[initScene] §L-325 elementRegistry.clear failed:', e); }
            try { nativeElementMeshExporter.clearCache(); } catch (e) { console.warn('[initScene] §L-325 NME.clearCache failed:', e); }
            try { frustumCullingService.reset(); } catch (e) { console.warn('[initScene] §L-325 FrustumCulling.reset failed:', e); }
            try { viewTechnicalDrawingCache.clear(); } catch (e) { console.warn('[initScene] §L-325 VTDC.clear failed:', e); }
            // §C13-MOUNTED-DRAWING-OWNER — the OTHER HALF of the line above, and it must
            // never be separated from it again.
            //
            // `viewTechnicalDrawingCache.clear()` disposes the drawings and empties the
            // map the PLAN pane reads (`PlanViewCanvas` → `viewTechnicalDrawingCache.get`).
            // It does NOT detach the drawing's THREE group from the scene, because the
            // cache does not own the mount — `ViewController._mountDrawing` does, and
            // nothing on any project path called `_unmountDrawing()`. So this teardown
            // used to clear the plan pane's source and leave the 3D pane's source in
            // place: a new project drew Project A's projected wall linework (grey dashed
            // hidden lines + solid outlines) under the plan pane's "Add walls to see the
            // floor plan" empty state. That is the founder's 2026-08-07 report, and it is
            // C13 §3.8/§3.10 — the scene graph is project-scoped state and needs a named
            // owner.
            //
            // The registry entry in `mountedDrawingScope` covers every project-entry path
            // via ClearProjectCommand; this call is the defence-in-depth sibling that runs
            // synchronously at the switch, BEFORE Project B hydrates (C13 §3.7), exactly
            // as `reseatProjectOrigin` does below. Idempotent + non-throwing.
            try { clearMountedDrawing(); } catch (e) { console.warn('[initScene] §C13-MOUNTED-DRAWING-OWNER clearMountedDrawing failed:', e); }
            // P3 — re-seat the always-on ProjectOrigin blue-sphere datum into the CURRENT
            // live scene (robust to an L-324 renderer live-swap that replaced world.scene)
            // so the incoming project always renders its origin marker.
            try { reseatProjectOrigin(world.scene.three as THREE.Scene); } catch (e) { console.warn('[initScene] §L-325 reseatProjectOrigin failed:', e); }

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

            // §FIX-SHADOW-LOAD-TIER-DESTROY (founder L-39) — the project is loaded and
            // the pipeline rebuild is scheduled; release the whole-load shadow freeze on
            // a deferred macrotask so the single shadow-quality escalation regen happens
            // now that the device is idle post-load, never mid-submit during the load.
            _thawShadowAfterLoad();

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

        // ── §FIX-LOAD-TRAVERSE-BATCH (P2) — consolidated post-load tier + PBR pass ──
        // A SEPARATE `pryzm-project-loaded` listener (decoupled from the pipeline
        // handler above, which another lane owns) that runs the per-add tier + PBR
        // pass EXACTLY ONCE at load end. During the load, the per-add handler skipped
        // its two full-scene traversals (load-scoped guard), so this single pass
        // upgrades every not-yet-seen mesh and applies the final tier — the same
        // result the old per-add path produced, but O(n) instead of O(n²).
        window.runtime?.events?.on('pryzm-project-loaded', () => { // F.events.9
            // Defer one tick to match the per-add deferral (lets any trailing
            // fragment-builder work land before the scan), exactly like the
            // interactive path's setTimeout(0).
            setTimeout(() => {
                try {
                    _runConsolidatedTierPbrPass?.();
                } catch (e) {
                    console.warn('[initScene] §FIX-LOAD-TRAVERSE-BATCH post-load pass error:', e);
                }

                // §PERF-L02-DRAWCALLS (P1.1/P1.3) — one-shot post-load snapshot of the
                // render cost: draw calls + instanced vs plain mesh counts + instanced
                // group sizes. Quantifies L02-A/B/C. Gated; production pays nothing.
                if (!perfTraceOn()) return;
                try {
                    const scene = world.scene.three as THREE.Scene;
                    let plainMeshes = 0;
                    let instancedMeshes = 0;
                    let instancedInstances = 0;
                    const groupSizes: number[] = [];
                    scene.traverse((obj) => {
                        if (obj instanceof THREE.InstancedMesh) {
                            instancedMeshes++;
                            instancedInstances += obj.count;
                            groupSizes.push(obj.count);
                        } else if (obj instanceof THREE.Mesh) {
                            plainMeshes++;
                        }
                    });
                    let drawCalls = -1;
                    try {
                        drawCalls = ((world.renderer as unknown as { three?: THREE.WebGLRenderer })?.three)
                            ?.info?.render?.calls ?? -1;
                    } catch { /* renderer not reachable in this backend — leave -1 */ }
                    perfLog(
                        '§PERF-L02-DRAWCALLS',
                        `drawCalls=${drawCalls} plainMeshes=${plainMeshes} instancedMeshes=${instancedMeshes} ` +
                        `instancedInstances=${instancedInstances} groupSizes=[${groupSizes.slice(0, 20).join(',')}]`,
                    );
                    // Flush the traverse accumulators gathered across the load window
                    // (§PERF-L03-TIER-TRAVERSE) — counts + summed/max wall-clock.
                    perfDump('§PERF-L03-TIER-TRAVERSE', 'l03.collectNewPbrMeshes', '(load window)');
                    perfDump('§PERF-L03-TIER-TRAVERSE', 'l03.tierMeshCount', '(load window)');
                    perfDump('§PERF-L03-TIER-TRAVERSE', 'l03.meshCountProvider', '(load window)');
                } catch (e) {
                    console.warn('[initScene] §PERF-L02-DRAWCALLS log error:', e);
                }
            }, 0);
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
        // ── §VIEWPORT-BG-LOG-SAYS-WHAT-IT-DID (L-1351) ──────────────────────────
        // Both log lines below used to end "(all layers)". THEY DID NOT WRITE ALL
        // LAYERS, and they never can on a Phase-5 backend. `SceneTheme._applyHex()`
        // is `viewport.style.background = hex; if (!window.pryzmCanvas) { scene.background
        // = ...; renderer.setClearColor(...) }` — and `window.pryzmCanvas` is non-null on
        // EVERY Phase-5 backend (webgpu AND webgl-fallback AND webgl-only), set at
        // phase-5 activate. So on every backend the founder actually runs, `_applyHex`
        // writes exactly ONE of its three layers: the CSS. The other two are written by
        // `renderPipelineManager.setColor()` on the line above, through the
        // §VIEWPORT-BG-ONE-AUTHORITY-RUNTIME authority.
        //
        // A line that reports success for work another component owns is a no-op that
        // prints a claim — the defect class this repo keeps finding (a version count that
        // could not fail honestly, an audit detector only its own tests satisfy). The
        // colour IS applied; the line simply must not claim the mechanism it did not use,
        // because a reader debugging "still grey" was being told all three surfaces were
        // covered by a call that covered one.
        const describeBackgroundWriters = (hex: string): string =>
            window.pryzmCanvas
                ? `Writers: RenderPipelineManager.setColor('${hex}') owns scene.background + the ` +
                  'renderer clear (§VIEWPORT-BG-ONE-AUTHORITY-RUNTIME); SceneTheme wrote the ' +
                  '<bim-viewport> CSS ONLY (pryzmCanvas active).'
                : `Writers: SceneTheme._applyHex('${hex}') wrote CSS + scene.background + the ` +
                  'renderer clear (no PRYZM overlay — OBC owns the canvas).';

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
                console.log(
                    '[initScene] Orthographic view — background forced to white, SSGI suspended. ' +
                    describeBackgroundWriters('#ffffff'),
                );
            } else if (_savedBgBeforeOrtho !== null) {
                // B1: Restore the user's saved background across all three layers.
                renderPipelineManager.setColor(_savedBgBeforeOrtho);
                const vp = container.querySelector('bim-viewport') as HTMLElement | null;
                if (vp) SceneTheme._applyHex(_savedBgBeforeOrtho, world, vp);
                console.log(
                    `[initScene] Perspective view restored — background: ${_savedBgBeforeOrtho}. ` +
                    describeBackgroundWriters(_savedBgBeforeOrtho),
                );
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
        // §GEOM-CASTER-EVENT-CHOKEPOINT (L-1189) — THIS USED TO BE A HAND-WRITTEN
        // LITERAL OF ELEVEN FAMILIES, and it is the list that ARMS the
        // §FIX-SHADOW-WALLCOMMIT-DESTROY freeze below. Handrail, stair-railing,
        // plumbing, lighting, lift, door/window/opening and stair-landing were all
        // absent, so each of those rebuilt its meshes — and therefore mutated the
        // shadow caster set, since `_enableShadowsOnScene` promotes every
        // non-denylisted Mesh to `castShadow=true` — with the live WebGPU shadow map
        // UNFROZEN. Handrail is the worst case and was the founder's P0: C95 §15.5
        // measures 279 meshes / 93 distinct materials torn down and re-minted in ONE
        // tick for a 31-segment circular run retype (one record per SEGMENT), against
        // a neighbouring family that lost the WebGPU device at ~100 unique materials.
        // The set now has exactly one home and a gate that fails when a new family
        // is left unclassified (geometryMutationEvents.ts / geometryCasterEvents.test.ts).
        const _pascalGeomEvents = GEOMETRY_CASTER_MUTATION_EVENTS;
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

        // §FIX-SHADOW-WALLCOMMIT-DESTROY (founder L-64) — freeze the shadow map across
        // a non-batched geometry COMMIT frame (e.g. pressing Enter to CLOSE a polyline
        // wall). The prod log shows `[PascalSceneLighting] Shadow flags set on N mesh(es)`
        // immediately followed by `Destroyed texture [ShadowDepthTexture] used in a
        // submit` → WebGPU device-loss cascade → the walls flash BLACK for a microsecond.
        //
        // ROOT CAUSE (same device-loss class as ADR-0111 / L-25 / L-39): the instant the
        // newly-committed walls enter the scene, two things happen against the LIVE
        // WebGPU renderer whose `shadowMap.autoUpdate === true`:
        //   (a) this debounced pass sets `castShadow` on the new meshes (the caster set
        //       changes → THREE re-renders the shadow pass), and
        //   (b) the SceneQualityTier re-evaluates on the mesh-count change and may
        //       reallocate the Pascal key light's shadow map (mapSize change).
        // Either can make THREE touch/realloc the ShadowDepthTexture INSIDE a submit
        // while the previous frame's command buffer (referencing the old texture) is
        // still draining on the GPU queue → the mid-submit destroy.
        //
        // The per-realloc guard (§FIX-SHADOW-LOAD-TIER-DESTROY) only freezes for the
        // synchronous duration of the tier's mapSize mutation; it does NOT span the
        // shadow-flag pass (a) nor the settle frame. This freeze extends the SAME
        // ref-counted `setShadowReallocFrozen` latch across the WHOLE commit window:
        // armed SYNCHRONOUSLY the moment the commit begins mutating the scene (before
        // the flags are set and before the deferred tier re-eval macrotask runs), and
        // released one frame AFTER the shadow flags settle. While frozen THREE reuses
        // the existing ShadowDepthTexture (autoUpdate=false) and never destroys it, so
        // the single regen at the new caster set / resolution lands on an idle frame.
        //
        // Ref-counted + WebGPU-path-only (no-op on the WebGL2 fallback), so it composes
        // with the nav (L-25) and load (L-39) freezes and never touches the shadow
        // LEVEL/quality or the SSGI/TRAA booleans (L-59) — timing only.
        let _wallCommitShadowFreezeActive = false;
        const _armWallCommitShadowFreeze = (): void => {
            if (_wallCommitShadowFreezeActive) return;
            _wallCommitShadowFreezeActive = true;
            try { window.renderPipelineManager?.setShadowReallocFrozen?.(true); }
            catch (e) { console.warn('[initScene] §FIX-SHADOW-WALLCOMMIT-DESTROY freeze error:', e); }
        };
        const _releaseWallCommitShadowFreeze = (): void => {
            if (!_wallCommitShadowFreezeActive) return;
            _wallCommitShadowFreezeActive = false;
            // Defer the thaw past the current frame's submit so the one shadow regen at
            // the new caster set / resolution happens on an idle frame, never mid-submit.
            setTimeout(() => {
                try { window.renderPipelineManager?.setShadowReallocFrozen?.(false); }
                catch (e) { console.warn('[initScene] §FIX-SHADOW-WALLCOMMIT-DESTROY thaw error:', e); }
                // Wake the loop once so the refreshed shadow pass is drawn before the
                // scheduler idles (P3: no new rAF — reuse the existing frame bus).
                try { getFrameScheduler().markDirty('shadow-wallcommit-thaw'); }
                catch { /* scheduler not ready — next interaction repaints */ }
            }, 0);
        };

        const _debouncedGeomAdded = () => {
            if (batchCoordinator.isBatching) return;
            // §FIX-SHADOW-WALLCOMMIT-DESTROY — freeze BEFORE the shadow-flag pass runs
            // and before the deferred per-event tier re-eval macrotask escalates the
            // tier, coalescing a burst of commit events (all segments of one polyline
            // close) into ONE continuous freeze window via the boolean latch.
            _armWallCommitShadowFreeze();
            if (_geomAddedDebounceTimer !== null) clearTimeout(_geomAddedDebounceTimer);
            _geomAddedDebounceTimer = setTimeout(() => {
                _geomAddedDebounceTimer = null;
                pascalSceneLighting.onGeometryAdded(world.scene.three as THREE.Scene);
                // Commit has settled — release the freeze one frame later so the single
                // shadow regen lands on an idle frame (never destroyed mid-submit).
                _releaseWallCommitShadowFreeze();
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

    // ── §FEAT-REAL-ENVIRONMENT (ADR-0106) — REAL sun + ground shadow-catcher ──
    // Makes the View Properties "Environment & Camera" panel real:
    //   8A real sun  — drives the Pascal KEY LIGHT (the scene's sole real shadow
    //                  caster) from the true solar position at the site lat/lon +
    //                  time-of-day, same NOAA basis as the Cesium/Forma globe.
    //   8B ground    — mounts an INVISIBLE ShadowMaterial plane at L0 so every
    //                  element casts a real grounded shadow.
    // Coordinates with §PERF-HEAVY-SHADOW-OFF: the sun steers the SAME key light
    // the suppression gates (one caster, one lever) and the catcher adds ZERO
    // casters — so heavy/nav scenes that drop the shadow pass simply show no
    // ground shadow, fully reversible, no synchronous GPU dispose (ADR-0111 safe).
    try {
        const realEnvironment = new RealEnvironmentService();
        // §REVERT-SHADOW-TO-KNOWN-GOOD (L-205) — the three shadow files (RealSunService,
        // RealEnvironmentService, ShadowQualityUpgrader) were reverted to the last-known-good
        // 72e34915, which projected the real sun shadow with no grey. The only behaviour kept
        // from the reverted stack is the pure caster-VISIBILITY gate
        // (RealEnvironmentService.updateGroundCatcherVisibility → flips `mesh.visible`; no GPU
        // work). The removed seams — the first-caster ScenePass rebuild (setFirstCasterHook),
        // the fitted shadow frustum + light re-home (setShadowCoverage), and the forced shadow
        // refresh (onKeyLightDriven → requestShadowRefresh) — are NOT re-wired here: each was a
        // repair-chasing-a-repair since 72e34915 and each is re-earned later, one at a time,
        // verified on prod. A read-only §DIAG-GROUND-SHADOW-FIT line now logs the live light +
        // shadow-camera numbers on the first caster (inside updateGroundCatcherVisibility).
        // Site location (C19) via the composed runtime's siteModelStore — mirrors
        // CesiumViewport.readSiteLocation() so the two viewports agree on the sun.
        // 0/0 is the ensureSite placeholder (Null Island) and is treated as unset.
        const readSiteLatLon = (): { lat: number; lon: number } | null => {
            try {
                const store = (runtime ?? window.runtime)?.siteModelStore as
                    | { getLocation?: () => { latitude: number; longitude: number } | null }
                    | undefined;
                const loc = store?.getLocation?.();
                if (loc && (loc.latitude !== 0 || loc.longitude !== 0)) {
                    return { lat: loc.latitude, lon: loc.longitude };
                }
            } catch { /* store not ready — treat as unset */ }
            return null;
        };
        // L0 elevation = the lowest authored level's elevation (default 0).
        const readL0Elevation = (): number => {
            try {
                const levels: Array<{ elevation?: number }> =
                    (window.bimManager as { getLevels?: () => Array<{ elevation?: number }> } | undefined)?.getLevels?.() ?? [];
                if (levels.length === 0) return 0;
                const min = levels.reduce((m, lv) => Math.min(m, lv.elevation ?? 0), Number.POSITIVE_INFINITY);
                return Number.isFinite(min) ? min : 0;
            } catch { return 0; }
        };

        // The Pascal key light is our KeyLightHost (its `keyLight` getter exposes the
        // sole real shadow caster). Bind + enable so the very first frame shows the
        // real sun; ground shadows default ON per the founder mandate.
        realEnvironment.bind(
            world.scene.three as THREE.Scene,
            pascalSceneLighting,      // KeyLightHost
            readSiteLatLon,
            readL0Elevation,
        );

        // §REVERT-SHADOW-TO-KNOWN-GOOD (L-205) — the L-171 `onKeyLightDriven` →
        // requestShadowRefresh() forced-refresh seam is intentionally NOT wired. At the
        // known-good 72e34915 the key light's shadow map re-renders on THREE's own
        // `autoUpdate` schedule (ShadowNode.updateShadow draws every castShadow mesh each
        // frame) with no external poke; the forced refresh existed only to service the
        // reverted frustum-fit's idle re-home, and on the freeze/realloc window it forced
        // the depth pass mid-submit — a prime suspect for the destroyed ShadowDepthTexture
        // that left the catcher reading uniform grey. Re-earn a freeze-aware refresh later
        // only if a genuine idle-repaint gap is observed on prod.
        realEnvironment.enable();

        // §L-432 — publish the site-context snap reader (parcel boundary + buildable-envelope
        // setback line). Without this the envelope is a picture: a user drawing walls by hand
        // has nothing to bite onto and can cross the setback line the panel claims to enforce.
        installSiteSnapContext();

        // Re-solve the sun when the site location changes (onboarding / relocate).
        window.runtime?.events?.on('site.location-changed', () => {
            try { realEnvironment.refreshSiteLocation(); }
            catch (e) { console.warn('[initScene] realEnvironment.refreshSiteLocation error:', e); }
            // §L-430 slice 2c — push θ (project→true north) into the sun service on the SAME
            // event that carries it (`SiteLocation.trueNorth`). Slice 2a gave RealSunService a
            // `setProjectNorth` but NO caller, so the viewport key light would have stayed in
            // the true frame while the model rotated — every shadow silently wrong by θ.
            //
            // This is the frame, not a preference: it is deliberately separate from the panel's
            // `setOffsets` so a user slider can never move it (ADR-0115 "two angles must never
            // alias"). θ = 0 ⇒ no-op, so this is inert until the producer ships.
            try {
                const theta = (window.runtime?.siteModelStore as
                    { getLocation?: () => { trueNorth?: number } | null } | undefined)
                    ?.getLocation?.()?.trueNorth;
                const coordinator = window.renderingPipelineCoordinator as
                    { realSunService?: { setProjectNorth?: (rad: number) => void } } | undefined;
                coordinator?.realSunService?.setProjectNorth?.(
                    typeof theta === 'number' && Number.isFinite(theta) ? theta : 0,
                );
            } catch (e) {
                console.warn('[initScene] §L-430 setProjectNorth error (advisory):', e);
            }
        });
        // Re-place the catcher when the active level / levels change.
        window.runtime?.events?.on('view-activated', () => {
            try { realEnvironment.refreshGroundElevation(); }
            catch { /* advisory */ }
            scheduleCatcherVisibilityUpdate();
        });

        // §L-205 caster-visibility gate — recompute the catcher's visibility as geometry is
        // added, so the invisible-on-empty catcher flips visible the moment the first caster
        // (a hand-drawn wall or a generated building) lands and starts receiving the real
        // ground shadow. Debounced (300 ms) so a generation that fires hundreds of *-added
        // events costs at most one scene sweep per settle window. This is a PURE scene-graph
        // sweep + `mesh.visible` flip — NO frustum fit, NO light re-home, NO shadow-map /
        // mapSize write, NO pipeline rebuild (the wider shadow improvements were reverted at
        // §REVERT-SHADOW-TO-KNOWN-GOOD and are re-earned later, one at a time).
        let _catcherVisTimer: ReturnType<typeof setTimeout> | null = null;
        function scheduleCatcherVisibilityUpdate(): void {
            if (_catcherVisTimer) return;
            _catcherVisTimer = setTimeout(() => {
                _catcherVisTimer = null;
                try { realEnvironment.updateGroundCatcherVisibility(); }
                catch (e) { console.warn('[initScene] realEnvironment.updateGroundCatcherVisibility error:', e); }
            }, 300);
        }
        const _envCatcherVisEvents = [
            'bim-wall-added', 'bim-slab-added', 'bim-roof-added', 'bim-column-added',
            'bim-beam-added', 'bim-stair-added', 'bim-curtainwall-added', 'bim-floor-added',
            'bim-ceiling-added', 'bim-furniture-added', 'pryzm-project-loaded',
        ] as const;
        _envCatcherVisEvents.forEach((evt) => window.addEventListener(evt, scheduleCatcherVisibilityUpdate));

        // Panel bridge — the View Properties panel emits these via runtime.events.
        // §FEAT-REAL-ENVIRONMENT-SUN — sun mode / offsets / time / ground toggle.
        window.runtime?.events?.on('pryzm-set-sun-mode', ({ mode }: { mode: 'real+offset' | 'manual' }) => {
            realEnvironment.setSunMode(mode);
        });
        window.runtime?.events?.on('pryzm-set-sun-offsets', (o: { azimuthDeg?: number; elevationDeg?: number; intensity?: number }) => {
            realEnvironment.setSunOffsets(o);
        });
        window.runtime?.events?.on('pryzm-set-sun-time', ({ hours }: { hours: number }) => {
            realEnvironment.setSunTime(hours);
        });
        window.runtime?.events?.on('pryzm-toggle-ground-shadows', ({ enabled }: { enabled: boolean }) => {
            realEnvironment.setGroundShadows(enabled);
        });

        // §FIX-SHADOW-CATCHER-RESTORE (L-112) — the ground shadow-catcher is attached
        // up front at enable() (above) so it is in the shadow-sampling set from the
        // first frame and receives the real building shadow, exactly as it did before
        // L-107. The prior L-107 deferred-attach (a debounced caster sweep that added
        // the receiver only after the first element) dropped the plane out of the
        // WebGPU shadow pass — the real shadow stopped rendering. That sweep is removed;
        // no caster-presence gating touches the receive path.

        // Expose for the panel + the existing VisualizationEnginePanel / console.
        window.realEnvironmentService = realEnvironment;

        // The coordinator owns a SEPARATE RealSunService instance used by the legacy
        // VisualizationEnginePanel "Real Sun" toggle. Point ITS sun at the same key
        // light so that path also drives the real caster (no parallel light) and both
        // toggles stay consistent. Guarded + idempotent (only drives once enabled).
        try {
            (window.renderingPipelineCoordinator as { realSunService?: { bindKeyLightHost?: (h: unknown) => void } } | undefined)
                ?.realSunService?.bindKeyLightHost?.(pascalSceneLighting);
        } catch { /* coordinator sun optional */ }

        console.log('[initScene] §FEAT-REAL-ENVIRONMENT real sun + ground shadow-catcher active.');
    } catch (envErr: any) {
        console.warn('[initScene] §FEAT-REAL-ENVIRONMENT init error (non-fatal):', envErr?.message ?? envErr);
    }
    // ── End §FEAT-REAL-ENVIRONMENT ────────────────────────────────────────

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
        // §PERF-DPR-BINDS-THE-LIVE-RENDERER (L-1149) — bind the LIVE PRYZM renderer,
        // not `postproductionRenderer.three`. DPR scaling is the cheapest and largest
        // fill-rate lever there is ('standard' = 0.75x DPR = ~56% of the fragment work),
        // and it was being applied to the silenced OBC renderer, which draws nothing in
        // Phase 5. When Phase 5 aborts, `pryzmRenderer` IS `postproductionRenderer.three`,
        // so this expression is correct on both paths rather than only one.
        renderPerfServiceRef = renderPerfService;
        renderPerfService.bind(
            pryzmRenderer as THREE.WebGLRenderer,
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
            // §L-412 (C59) — evaluate the auto-open decision at FIRE time (below), not
            // just here at schedule time: the site-authoring 2-pane split may mount
            // (and call suppressAutoOpen()) AFTER this idle callback is scheduled but
            // BEFORE it runs, and the suppression must still win that race.
            if (shouldAutoOpenSplitView(splitViewManager)) {
                // PERF-FIX (Apr 2026): Defer the Canvas2D plan rebuild until the
                // browser is idle. Previously this fired 400 ms after project load
                // and blocked the main thread for ~300 ms while the rest of the
                // pipeline was still warming up. Using requestIdleCallback (with
                // a setTimeout fallback) lets first paint, camera fit and the
                // initial WebGPU frame all complete before the SVP rebuild runs.
                const _activate = () => {
                    // Re-check at fire time — the site-authoring split may have
                    // suppressed the auto-open since this was scheduled (the race).
                    if (!shouldAutoOpenSplitView(splitViewManager)) {
                        console.log('[initScene] Split view auto-open skipped (site-authoring split active / already open)');
                        return;
                    }
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

    // ── ADR-0346 (L-2900): LINKED MODELS → read-only massing in the host scene ─
    // A linked model is another PRYZM project's building, drawn here so the user can
    // see and coordinate against it without owning or editing it. Default is MASSING:
    // one InstancedMesh per link, one draw call, regardless of how big the linked
    // project is — the founder's scene is draw-call bound and a full second model
    // would double it.
    //
    // The subtree is non-pickable at all four pick doors and carries the C13 §3.13
    // `pryzmLink*` tags so `ProjectIsolationAudit`'s `scene.linkedModel` arm can
    // account for it. Teardown is owned by `links.linkedModels` (a declared
    // ADR-0298 scope), NOT by this call site.
    try {
        linkedModelController.install(
            new LinkedModelSceneRenderer(world.scene.three as THREE.Scene),
        );
        if (import.meta.hot) {
            import.meta.hot.dispose(() => linkedModelController.uninstall());
        }
    } catch (lmErr: any) {
        console.warn('[initScene] LinkedModelSceneRenderer init error:', lmErr?.message ?? lmErr);
    }
    // ── End ADR-0346 linked models ────────────────────────────────────────────

    // ── ADR-0077 (§RENDERER-LIVE-SWAP) — live in-place backend swap ───────────
    // Supersedes ADR-0076's persist+reload toggle. The renderer-bound services
    // (RenderPipelineManager, the PRYZM overlay canvas, the resize sync) were all
    // captured in THIS composition root, so the rebind layer lives here too (P1 —
    // one runtime, one wiring path). The scene graph (THREE.Scene, geometry,
    // materials, lights, camera) is backend-agnostic CPU data and is NOT rebuilt;
    // THREE re-uploads GPU resources lazily on the next render against the new
    // device. The work is: stop the loop → dispose old RPM pipeline + old renderer
    // → build the new renderer on a fresh canvas in the same DOM slot → re-bind
    // every captured service → re-establish the TSL pipeline for the new backend →
    // resume the loop. Camera position/target and the current view are untouched
    // (we never touch world.camera). On failure we keep the current renderer and
    // surface a toast; the toggle's own catch falls back to the legacy reload.
    //
    // ⚠ CORRECTED 2026-08-19 (L-1149): this used to say "RenderPerformanceService is
    // bound to the OBC renderer (postproductionRenderer.three) which is NEVER swapped,
    // so it needs no re-bind." It now binds the LIVE renderer (the OBC one draws nothing
    // in Phase 5, so scaling its DPR scaled an invisible canvas), and step 5b below
    // re-binds AND re-applies the current quality level. RenderingPipeline-
    // Coordinator's tier gate reads window.renderPipelineManager.status.webGpuActive
    // at call-time, so it picks up the new backend automatically on the next
    // geometry-add — no re-bind needed there either. The `_swapTracer` span (P8)
    // records the from/to backend + outcome.
    // ── §SWAP-PAINTS-THE-BUILDING (L-1411) — probe the SWAP, not the theory ──────
    //
    // The founder's report is "the building did not load in the 3D view", and the only
    // thing in his log between a clean load and an empty viewport is this swap. Two
    // rival explanations were live when that was investigated — (a) the retire detaches
    // 3,181 objects and nothing re-attaches them, (b) the swap leaves the frame loop or
    // the render path unarmed — and this repo's recorded lesson is that TWO RIVAL
    // THEORIES CAN BOTH BE "CONFIRMED" BY READING AND BOTH BE WRONG. (a) has since been
    // MEASURED FALSE (see rendererRetirement.populatedScene.test.ts: 3,181 scene meshes
    // keep a live material+geometry binding across a real retire; only the retired
    // renderer's 6,362 dispose listeners come off). This probe exists so the NEXT report
    // arrives with (b) already answered instead of re-derived.
    //
    // It prints, at the layer the user experiences:
    //   • how many scene meshes still hold a LIVE material AND a non-empty position
    //     attribute — derived by traversal, not from a remembered list of element types;
    //   • whether the single rAF loop is running and whether the lightweight WebGL
    //     render path is armed (the two "the swap finished but nothing draws" states);
    //   • RenderPipelineManager's own §L900-FRAME-SKIP-ATTRIBUTION report, which names
    //     the exact gate a stalled viewport is stalled at;
    //   • the renderer's own draw-call / triangle counters.
    //
    // Called twice: once immediately (state at the swap boundary) and once after frames
    // have had time to run — the second is the decisive one. `framesPresented > 0` with
    // `drawCalls > 0` and a non-zero live-binding count means the swap painted the
    // building and any remaining blankness is a COMPOSITING question; `framesPresented
    // === 0` names the gate instead. Diagnostic only: never allowed to fail a swap.
    const reportSwapPaintsTheBuilding = (phase: string): void => {
        const scene = world.scene.three as THREE.Scene;
        let meshes = 0;
        let liveBindings = 0;
        let visibleWithLiveBindings = 0;
        scene.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!(m as unknown as { isMesh?: boolean }).isMesh) return;
            meshes++;
            const mat = m.material as THREE.Material | THREE.Material[] | null | undefined;
            const hasMaterial = Array.isArray(mat) ? mat.length > 0 && mat.every(Boolean) : !!mat;
            const pos = m.geometry?.getAttribute?.('position') as { count?: number } | undefined;
            if (!hasMaterial || !pos || (pos.count ?? 0) === 0) return;
            liveBindings++;
            if (m.visible) visibleWithLiveBindings++;
        });
        const rpm = renderPipelineManagerRef as unknown as {
            getFrameSkipReport?: () => { framesPresented: number; consecutiveSkips: number; lastSkipReason: string | null };
            isLightweightWebGlActive?: boolean;
        } | null;
        const skip = rpm?.getFrameSkipReport?.() ?? null;
        const info = (pryzmRenderer as unknown as { info?: { render?: { calls?: number; triangles?: number } } })?.info?.render ?? null;
        console.log(
            `[initScene] §SWAP-PAINTS-THE-BUILDING (${phase}) backend=${pryzmRendererBackend} ` +
            `sceneMeshes=${meshes} withLiveMaterialAndGeometry=${liveBindings} ` +
            `ofThoseVisible=${visibleWithLiveBindings} ` +
            `loopRunning=${String((unifiedFrameLoop as unknown as { isRunning?: boolean }).isRunning)} ` +
            `lightweightWebGlActive=${String(rpm?.isLightweightWebGlActive)} ` +
            `framesPresented=${skip?.framesPresented ?? '?'} ` +
            `consecutiveSkips=${skip?.consecutiveSkips ?? '?'} ` +
            `lastSkipReason=${skip?.lastSkipReason ?? 'none'} ` +
            `drawCalls=${info?.calls ?? '?'} triangles=${info?.triangles ?? '?'}`,
        );
    };

    const _swapTracer = trace.getTracer('pryzm-engine');
    let _swapInFlight = false;
    const swapRendererBackend = async (pref: RendererBackendPreference): Promise<boolean> => {
        return _swapTracer.startActiveSpan('pryzm.renderer.swap', async (span) => {
            span.setAttribute('pryzm.renderer.swap.pref', pref);
            span.setAttribute('pryzm.renderer.swap.from', pryzmRendererBackend);

            // Re-entrancy + capability guards.
            if (_swapInFlight) {
                console.warn('[initScene] §RENDERER-LIVE-SWAP swap already in flight — ignoring.');
                span.setAttribute('pryzm.renderer.swap.outcome', 'busy');
                span.end();
                return false;
            }
            // The live swap re-binds the PRYZM-owned overlay renderer + its TSL
            // pipeline. If Phase 5 never activated (OBC WebGL is the sole renderer,
            // no pryzmCanvas), there is nothing to rebind in place — signal the
            // caller to use the reload path instead.
            if (!isPhase5Active || !pryzmCanvas || !renderPipelineManagerRef) {
                console.warn(
                    '[initScene] §RENDERER-LIVE-SWAP Phase 5 not active (no PRYZM overlay renderer) — ' +
                    'cannot hot-swap; caller should reload.',
                );
                span.setAttribute('pryzm.renderer.swap.outcome', 'no-phase5');
                span.end();
                return false;
            }

            _swapInFlight = true;
            // §FEAT-SWAP-LOADING-OVERLAY (L-141) — cover the swap window. The old
            // renderer/canvas are disposed and a fresh one is built below, so the
            // viewport briefly blanks/flickers; show a brand loading cover now and
            // hide it in the finally so it is bounded by this swap's own completion
            // or rollback and can NEVER get stuck visible (even if the swap throws).
            showRendererSwapOverlay('Switching renderer…');
            // §FIX-SWAP-WEBGL-TO-WEBGPU-CRASH (L-153) — snapshot the CURRENTLY persisted
            // preference BEFORE we overwrite it, so a rollback (a failed WebGL→WebGPU swap)
            // can restore it. Otherwise the persisted key would say 'webgpu' while the live
            // renderer is still the rolled-back WebGL one → the next reload re-attempts the
            // failing backend and the desync compounds.
            const prevPersistedPref = getRendererBackendPreference();
            // §L-372 Batch 2 / L-382 — 'webgl-classic' is the PROGRAMMATIC heavy-gen
            // target (a classic THREE.WebGLRenderer → backend 'webgl-only'), NOT a user
            // toggle state. The classic routing is threaded per-call via the
            // createRenderer(pref) override below, not via persistence.
            const intendedClassicWebGL = pref === 'webgl-classic';

            // ⭐⭐ §HEURISTIC-MAY-OVERRIDE-A-PIN-BUT-NEVER-OVERWRITE-IT (L-1483, lane WEBGL4,
            // 2026-08-20). This line used to be, unconditionally:
            //
            //     setRendererBackendPreference(intendedClassicWebGL ? 'webgl' : pref);
            //
            // justified as *"persist the closest user-facing value ('webgl') so a manual reload
            // lands on the safe webgl-fallback default"*. On the §AUTO-WEBGL-HEAVY path that is
            // not persisting a default — **it is overwriting the user's explicit choice with a
            // guard's choice, on disk.**
            //
            // THE FOUNDER'S CASE, from his own console: he had PINNED WebGPU. The heavy-scene
            // guard swapped him to 'webgl-classic' anyway (deliberate — ADR-0267 §Fix-3 / L-366;
            // C04 §1.4 now records it honestly) and its message told him *"Re-pick WebGPU to
            // override."* But this line had already rewritten `pryzm.renderer.backend` from
            // 'webgpu' to 'webgl', so his NEXT boot resolved 'webgl' → forceWebGL →
            // 'webgl-fallback' **before the heuristic even ran**. He was not being overridden
            // for a session; he was being permanently re-defaulted, and re-picking WebGPU only
            // survived until the next open. That is why he kept landing back on the WebGL path.
            //
            // THE RULE. A stored preference is the USER'S STATEMENT OF INTENT. A safety
            // heuristic may override it FOR A SESSION; it may not DESTROY it. Persisting
            // collapses two different states — *"the user chose WebGL"* and *"a guard chose
            // WebGL for the user"* — into one value the system can never tell apart again. That
            // is the failure-vs-empty defect class this codebase keeps re-learning, wearing a
            // renderer costume.
            //
            // ⛔ NOT A NEW MECHANISM. `§DIAG-FIX-WEBGPU-BACKEND-OSCILLATION` already added the
            // per-call, NON-persisting `backendOverride` parameter to `createRenderer()`
            // (createRenderer.ts:233-243) for exactly this case — its own doc says it exists so
            // the device-loss safe mode can force WebGL "WITHOUT calling
            // setRendererBackendPreference('webgl') — which previously silently clobbered the
            // user's persisted WebGPU/Auto choice and produced the flip-flopping the founder
            // reported (L-203 issue #1)". The mechanism was built, and this call site did not
            // use it. This is L-203, re-created one seam over.
            //
            // ⭐ A USER-DRIVEN swap still persists, exactly as before — that IS a statement of
            // intent and it must survive a reload. Only the PROGRAMMATIC heavy-gen target
            // ('webgl-classic', which no user toggle can produce) is now session-scoped. The
            // rollback path below restores `prevPersistedPref` either way, so a failed swap
            // still cannot leave the stored value describing a backend that is not live.
            if (!swapMayPersistPreference(pref)) {
                console.log(
                    '[initScene] §HEURISTIC-MAY-OVERRIDE-A-PIN-BUT-NEVER-OVERWRITE-IT (L-1483) — ' +
                    `'${pref}' is a PROGRAMMATIC swap target, not a user-expressible choice; ` +
                    `the stored backend preference ` +
                    `stays '${prevPersistedPref}' (session-scoped override only). A reload therefore ` +
                    'returns the user to the backend THEY picked, not to the one this guard picked.',
                );
            } else {
                // A user-driven toggle. Persist FIRST so createRenderer() resolves the new
                // backend AND a fresh boot honours the choice. (No reload — that is the point.)
                setRendererBackendPreference(pref);
            }

            const rpm = renderPipelineManagerRef;
            const oldCanvas = pryzmCanvas;
            const oldRenderer = pryzmRenderer;
            // Capture the OLD backend up-front — step 4 reassigns pryzmRendererBackend
            // to the new value, so the rollback path must use this snapshot to re-bind
            // the old renderer with the correct (real-WebGPU?) flag.
            const oldBackend = pryzmRendererBackend;
            let newCanvas: HTMLCanvasElement | null = null;

            try {
                // 1. Stop the single rAF loop (P3 — never start a second one; we
                //    re-start THIS one after the rebind).
                try { (unifiedFrameLoop as any).stop?.(); } catch { /* ignore */ }

                // 2. Dispose the old TSL pipeline (watch the §I2 usedTimes guard,
                //    handled inside RPM.dispose() → _safeDisposeRenderPipeline()).
                try { rpm.dispose(); }
                catch (e) { console.warn('[initScene] §RENDERER-LIVE-SWAP old RPM dispose failed (non-fatal):', e); }

                // 3. Build the NEW renderer on a FRESH canvas in the SAME DOM slot.
                //    WebGPURenderer is constructed against one canvas for its
                //    lifetime, so we mint a new overlay canvas rather than reuse the
                //    old one. §L-372B — thread `pref` as the per-call backend override so
                //    a 'webgl-classic' heavy-gen swap builds the CLASSIC renderer directly
                //    (backend='webgl-only', no TSL/node compile) without persisting an
                //    internal value; for 'auto'/'webgpu'/'webgl' this equals the value just
                //    persisted above, so their behaviour is unchanged.
                newCanvas = document.createElement('canvas');
                newCanvas.setAttribute('data-pryzm', 'webgpu');
                newCanvas.style.cssText = [
                    'position:absolute', 'top:0', 'left:0',
                    'width:100%', 'height:100%', 'pointer-events:none', 'z-index:2',
                ].join(';');
                newCanvas.width  = window.innerWidth;
                newCanvas.height = window.innerHeight;
                container.appendChild(newCanvas);

                const newResult = await createRenderer(newCanvas, pref);

                // §L-372 Batch 2 / L-382 — 'webgl-only' is a swap FAILURE only when it was
                // NOT the intended target. For 'auto'/'webgpu'/'webgl' a webgl-only result
                // means WebGPURenderer construction failed, so we roll back to the old
                // renderer (unchanged behaviour). But a 'webgl-classic' heavy-gen swap
                // INTENDS the classic webgl-only renderer — that is SUCCESS, not a failure.
                // (If classic construction itself failed, createRenderer's guarded fallback
                // already produced 'webgl-fallback' instead, handled by the lightweight
                // branch below = today's behaviour — never a dead viewport.)
                if (isUnintendedWebglOnlySwap(newResult.backend, intendedClassicWebGL)) {
                    throw new Error(
                        `[initScene] §RENDERER-LIVE-SWAP new renderer backend is 'webgl-only' ` +
                        `(WebGPURenderer construction failed) — rolling back.`,
                    );
                }

                // 4. Promote the new renderer + canvas to the closure refs that
                //    every other handler reads (resize, VPT suspend/resume, etc.).
                pryzmRenderer        = newResult.renderer;
                pryzmCanvas          = newCanvas;
                pryzmRendererBackend = newResult.backend;

                // §VIEWPORT-BG-BACKEND-VOCABULARY (L-1191) — prime the clear colour to
                // TRANSPARENT so the TSL bgUniform mix() drives the background rather than
                // an opaque clear — but ONLY on the backend that HAS a bgUniform.
                //
                // This was unconditional ("same as the boot path"), copied from a boot
                // path that was itself wrong the same way (:2084 above, now gated). It is
                // the single most direct producer of the founder's grey: the swap has
                // ALREADY resolved `newResult.backend` four lines up, so it knows the new
                // renderer will never build a TSL pipeline, and it primes it transparent
                // anyway. Every frame that does not reach RenderPipelineManager's
                // lightweight branch then inherits a transparent clear, and the app-chrome
                // grey (`--app-bg` #e8edf6, `#container`/`bim-viewport`) shows through the
                // overlay. rpm.bind() re-primes it opaque a few lines below — so today
                // this is a race the later statement happens to win, not a decision.
                // Do not un-gate it: the seam that knows the backend must not take the
                // other backend's decision.
                if (isNativeWebGpuBackend(pryzmRendererBackend)) {
                    try { (pryzmRenderer as any).setClearColor?.(new THREE.Color(0x000000), 0); }
                    catch { /* not all variants expose setClearColor */ }
                }

                // Size the new renderer/canvas to the container BEFORE first paint.
                try { resizePryzmRenderer?.(); }
                catch { (pryzmRenderer as any).setSize?.(window.innerWidth, window.innerHeight); }

                // 5. Re-bind the TSL pipeline to the new renderer for the NEW
                //    backend. §PERF-WEBGL2-NO-TSL — only a native 'webgpu' backend
                //    may run the TSL pipeline; BOTH WebGL backends stay lightweight.
                const newIsRealWebGPU = isNativeWebGpuBackend(newResult.backend);
                // §L-372 Batch 2 / L-382 — BOTH WebGL backends (the WebGPURenderer WebGL2
                // fallback AND the classic webgl-only renderer) run TSL-OFF and therefore
                // need the lightweight per-frame render + OBC base clear. This is the seam
                // that makes a heavy-gen classic (webgl-only) swap render every frame
                // (no frozen viewport) and paint the building on stock GLSL.
                // §VIEWPORT-BG-BACKEND-VOCABULARY (L-1191) — was a hand-written
                // `=== 'webgl-fallback' || === 'webgl-only'` here and a `=== 'webgl-fallback'`
                // at the boot arm; two spellings of one rule that had already drifted apart.
                // Both arms now read the ONE predicate.
                const newIsLightweightWebGl = isLightweightWebGlBackend(newResult.backend);
                // §RPM-RECOVERY-DOWNGRADE (ADR-0087) — route through recoverPipeline()
                // so a "Fragment shader failed to compile" on the new device downgrades
                // to the lightweight phase-2 pipeline instead of killing the viewport.
                // (defensive: tolerate an older RPM build without the method.)
                await recoverPipelineOrBind(rpm, world.scene.three as THREE.Scene, world.camera.three, pryzmRenderer, newIsRealWebGPU);
                // §PERF-WEBGL2-RENDER-ON-MOVE (ADR-061) — match the boot path:
                // drive a per-frame plain WebGL render on EITHER WebGL backend, and turn
                // it OFF when swapping to a real WebGPU backend (the TSL pipeline renders).
                rpm.setLightweightWebGlRender(newIsLightweightWebGl);
                // §FRAME-STARTS-CLEAN-ON-EVERY-BACKEND (L-1350) — arm the per-frame OBC
                // base clear on EVERY backend. This was `newIsLightweightWebGl ? hook :
                // null` — it DISARMED the clear on exactly the backend that needs it. The
                // comment that stood here said "no OBC composite there; the TSL pipeline
                // owns the paint", and the second half is true while the first is not:
                // the TSL pipeline owns the paint and presents it with
                // `presenceAlpha = step(0.0001, contentAlpha)`, so its empty-space pixels
                // are transparent and the OBC canvas underneath composites straight
                // through them. See the RPM field doc for the full post-mortem.
                rpm.setPreFrameBaseClearHook?.(
                    () => clearObcBaseFramebuffer('per-frame', /* quiet */ true),
                );

                // §PERF-DPR-BINDS-THE-LIVE-RENDERER (L-1149) — re-bind the DPR service to
                // the NEW renderer and RE-APPLY the level already in force. `bind()` alone
                // would leave the new renderer at its adapter's construction-time DPR cap,
                // silently discarding a 'standard' choice at the exact moment a heavy scene
                // triggered the swap and needs it most. Best-effort: a quality lever must
                // never be able to abort a backend swap.
                try { renderPerfServiceRef?.rebind(pryzmRenderer as THREE.WebGLRenderer, world.scene.three as THREE.Scene); }
                catch (e) { console.warn('[initScene] §PERF-DPR-BINDS-THE-LIVE-RENDERER rebind failed (non-fatal):', e); }

                // 6. Publish the new renderer/canvas on the window globals other
                //    subsystems read (sheet thumbnails, legacy service suspend).
                window.pryzmRenderer = pryzmRenderer;
                window.pryzmCanvas   = pryzmCanvas;

                // 7. RETIRE the OLD renderer + remove the OLD canvas now that the
                //    new one is live (do this AFTER the new renderer renders-ready
                //    so there is no blank frame).
                //
                //    §RETIRE-RENDERER-DETACHES-LISTENERS (L-948) — `retireRenderer()`,
                //    never a bare `dispose()`. The comment at the top of this block is
                //    right that the scene graph is backend-agnostic CPU data and is not
                //    rebuilt — but that is exactly what makes the bare dispose unsafe.
                //    three r183's `RenderObject` registers a 'dispose' listener on every
                //    material and geometry it draws (RenderObject.js:328-329), and
                //    `Renderer.dispose()`'s only render-object teardown,
                //    `RenderObjects.dispose()`, is `this.chainMaps = {}` — it removes
                //    none of them (RenderObjects.js:173-177), then clears the DataMaps
                //    those listeners read. The KEPT scene therefore keeps the DEAD
                //    renderer subscribed. three's lighting caches are module-global and
                //    keyed by scene/light (Lighting.js:4, ShadowFilterNode.js:12), so the
                //    stale ShadowNode + shadow NodeMaterial survive too: the first
                //    material compiled on the NEW backend runs `AnalyticLightNode.setup()`,
                //    which disposes that shadow material, which re-enters the dead
                //    renderer → `Cannot read properties of undefined (reading 'usedTimes')`
                //    thrown OUT of setup() before its `this.shadowNode = null` — so every
                //    subsequent compile throws identically and the viewport renders nothing
                //    new while plan view (no shader compile) stays perfect. That is the
                //    founder's "many elements batch created — none visible" verbatim.
                //    DETACH here, RELEASE here (ADR-0297 INVARIANT L2).
                try {
                    // §RETIRE-ZERO-IS-NOT-ONE-FACT (L-1410) — capture the denominator and the
                    // KIND *before* the sweep runs, so the line below can never print a bare
                    // `0` that means three different things. This log has reported 0, 3181,
                    // 6936 and 6937 across a single day of founder sessions and a prior lane
                    // flagged the `0` without being able to tell whether it meant "nothing was
                    // attached" or "the sweep looked in the wrong place". Now it says which.
                    const _kind   = classifyRetirement(oldRenderer);
                    const _minted = mintedRenderObjectCount(oldRenderer);
                    const _detached = retireRenderer(oldRenderer);
                    console.log(
                        `[initScene] §RETIRE-RENDERER-DETACHES-LISTENERS old renderer retired — ` +
                        `${describeRetirement(oldRenderer, _detached, _minted, _kind)} (L-948/L-1410). ` +
                        `⚠ DETACH means the RETIRED RENDERER stopped listening to the scene's ` +
                        `materials/geometries — it does NOT unbind geometry from the scene and ` +
                        `nothing needs re-attaching: the new renderer mints its own draw state on ` +
                        `its first frame (measured, L-1410).`,
                    );
                }
                catch (e) { console.warn('[initScene] §RENDERER-LIVE-SWAP old renderer dispose failed (non-fatal):', e); }
                try { oldCanvas.remove(); } catch { /* already detached */ }

                // §FIX-OBC-BASE-STALE-COMPOSITE (Defect A / A1) — re-clear the OBC
                // base framebuffer after the swap. The new overlay is transparent, so
                // any stale OBC frame would again ghost under it during camera move.
                clearObcBaseFramebuffer('post-live-swap');

                // 8. Resume the single rAF loop. The PASCAL render callback closes
                //    over `renderPipelineManager` (the SAME rpm instance, now rebound
                //    to the new renderer) so no callback re-wire is needed.
                try { (unifiedFrameLoop as any).start?.(); } catch { /* ignore */ }

                span.setAttribute('pryzm.renderer.swap.to', pryzmRendererBackend);
                span.setAttribute('pryzm.renderer.swap.outcome', 'ok');
                console.log(
                    `[initScene] §RENDERER-LIVE-SWAP live swap complete — backend now: ${pryzmRendererBackend} (no reload).`,
                );

                // §VIEWPORT-BG-PROBE (L-1191) — the live swap is the ONE seam the
                // founder's grey has always been reported against, so it prints the
                // full background stack unconditionally. The next report carries a
                // hex instead of the word "grey". Never allowed to fail a swap.
                try { reportViewportBackground('post-live-swap'); } catch { /* diagnostic only */ }

                // §SWAP-PAINTS-THE-BUILDING (L-1411) — the boundary reading, then the
                // one that matters. The second fires after frames have had time to run,
                // so `framesPresented` / `drawCalls` distinguish "the swap painted the
                // building" from "the swap finished and nothing draws" WITHOUT anyone
                // having to re-derive it from a console transcript.
                try { reportSwapPaintsTheBuilding('immediately-after-swap'); } catch { /* diagnostic only */ }
                setTimeout(() => {
                    try { reportSwapPaintsTheBuilding('one-second-after-swap'); } catch { /* diagnostic only */ }
                }, 1000);

                // Remount the corner pill so the "· <backend>" label updates.
                try { rendererBackendToggle.mount(); } catch { /* cosmetic */ }

                _swapInFlight = false;
                span.end();
                return true;
            } catch (err) {
                // Rollback: the old renderer/canvas may still be alive (we only
                // dispose them on the success path). Re-bind the existing rpm to the
                // OLD renderer and resume so the viewport is never left dead.
                console.error('[initScene] §RENDERER-LIVE-SWAP swap failed — rolling back to previous backend:', err);
                span.recordException(err as Error);
                span.setStatus({ code: SpanStatusCode.ERROR });
                try { newCanvas?.remove(); } catch { /* ignore */ }
                // §FIX-SWAP-WEBGL-TO-WEBGPU-CRASH (L-153) — restore the persisted preference
                // to what it was before this (now-rolled-back) swap, so the toggle label and
                // the next fresh boot reflect the backend that is ACTUALLY live, not the one
                // we failed to reach.
                try { setRendererBackendPreference(prevPersistedPref); } catch { /* non-fatal */ }
                try {
                    pryzmRenderer        = oldRenderer;
                    pryzmCanvas          = oldCanvas;
                    pryzmRendererBackend = oldBackend;
                    window.pryzmRenderer = oldRenderer;
                    window.pryzmCanvas   = oldCanvas;
                    const oldIsRealWebGPU = isNativeWebGpuBackend(oldBackend);
                    // §RPM-RECOVERY-DOWNGRADE (ADR-0087) — non-fatal rebind on rollback too.
                    await recoverPipelineOrBind(rpm, world.scene.three as THREE.Scene, world.camera.three, oldRenderer, oldIsRealWebGPU);
                    // §VIEWPORT-BG-BACKEND-VOCABULARY (L-1191) — RE-ASSERT the two
                    // backend-shaped arms on the ROLLBACK path too. This was the THIRD arm
                    // in the enumeration and it asserted NEITHER: it restored the old
                    // renderer and resumed the loop, leaving `_lightweightWebGlActive` and
                    // the per-frame OBC base clear at whatever the half-completed swap had
                    // left them. A rollback that lands back on a lightweight backend with
                    // the lightweight render un-armed paints NOTHING — the failure mode is
                    // not "wrong colour", it is "no frame at all, app-chrome grey showing
                    // through the transparent overlay", i.e. the same user-visible symptom.
                    // Both calls are idempotent no-ops when already in the right state.
                    const oldIsLightweightWebGl = isLightweightWebGlBackend(oldBackend);
                    rpm.setLightweightWebGlRender(oldIsLightweightWebGl);
                    // §FRAME-STARTS-CLEAN-ON-EVERY-BACKEND (L-1350) — armed on every
                    // backend on the rollback path too, symmetric with the success path.
                    rpm.setPreFrameBaseClearHook?.(
                        () => clearObcBaseFramebuffer('per-frame', /* quiet */ true),
                    );
                    try { (unifiedFrameLoop as any).start?.(); } catch { /* ignore */ }
                    console.warn('[initScene] §RENDERER-LIVE-SWAP rolled back — previous renderer restored, viewport alive.');
                } catch (rollbackErr) {
                    console.error('[initScene] §RENDERER-LIVE-SWAP ROLLBACK also failed — viewport may need a reload:', rollbackErr);
                }
                span.setAttribute('pryzm.renderer.swap.outcome', 'failed');
                _swapInFlight = false;
                span.end();
                return false;
            } finally {
                // §FEAT-SWAP-LOADING-OVERLAY (L-141) — guaranteed hide on EVERY exit
                // path (success, rollback, or an unexpected throw). Paired with the
                // showRendererSwapOverlay() above so the cover is always bounded by
                // this swap and never left stuck.
                hideRendererSwapOverlay();
            }
        });
    };

    // ── §VIEWPORT-BG-PROBE (L-1191) — name the colour, then trace it ──────────
    // "The background is sometimes grey" has now been reported four times
    // (L-326 → L-326 reopened → L-1148 → L-1191) and not one report carried a
    // HEX. Every fix therefore had to guess which of five surfaces the user was
    // looking at, and two of them fixed a surface that was already correct.
    //
    // ⚠ CORRECTED 2026-08-20 (lane BG1, L-1352). This read "There are exactly five
    // things that can be 'the background of the 3D view'". There are exactly five
    // BACKGROUNDS. That is not the same set as "things that can look grey", and the
    // difference is the whole reason a fifth report exists: the probe enumerated the
    // surfaces the previous fixes had already visited. A `groundShadowCatcher` entry
    // (surface 0, below) now covers the one thing DRAWN that can wash the viewport grey.
    // If a sixth report arrives with all six entries white, the next thing to add is
    // whatever it names — the list is a ledger, not a proof of completeness.
    //
    // The five background surfaces, stacked back-to-front; only the top one that is
    // actually opaque is what the user sees:
    //   1. the PRYZM overlay canvas   — RenderPipelineManager's per-frame clear
    //                                   (`_lightweightBgColor`, opaque) or nothing
    //   2. `scene.background`         — RPM's §VIEWPORT-BG-ONE-AUTHORITY-RUNTIME
    //   3. the OBC base canvas        — cleared transparent in Phase 5
    //   4. `<bim-viewport>` CSS       — SceneTheme._applyHex / night toggle
    //   5. `#container` CSS           — index.html boot shell, #ffffff
    // Surfaces 4 and 5 are the ONLY greys in the stack when they carry the
    // app-chrome token `--app-bg` (#e8edf6) instead of the scene white, and they
    // are visible ONLY when 1 and 2 both fail to paint. That distinction is the
    // whole diagnosis, and it is one console call away.
    //
    // Read-only: it allocates nothing on the GPU, renders nothing, and mutates
    // nothing. It exists so the NEXT report names the hex.
    const reportViewportBackground = (label = 'manual'): Record<string, unknown> => {
        const asHex = (c: unknown): string | null => {
            const col = c as { isColor?: boolean; getHexString?: () => string } | null | undefined;
            if (col?.isColor === true && typeof col.getHexString === 'function') return `#${col.getHexString()}`;
            return null;
        };
        const rpm = renderPipelineManagerRef;
        const sceneBg = (world.scene.three as unknown as { background?: unknown }).background;
        const vpEl = container.querySelector('bim-viewport') as HTMLElement | null;
        let rendererClear: string | null = null;
        let rendererClearAlpha: number | null = null;
        try {
            const r = pryzmRenderer as unknown as {
                getClearColor?: (t: THREE.Color) => THREE.Color;
                getClearAlpha?: () => number;
            };
            const tmp = new THREE.Color();
            rendererClear = r.getClearColor ? `#${r.getClearColor(tmp).getHexString()}` : null;
            rendererClearAlpha = r.getClearAlpha ? r.getClearAlpha() : null;
        } catch { /* not all renderer variants expose the clear getters */ }

        const report: Record<string, unknown> = {
            label,
            backend: pryzmRendererBackend,
            isPhase5Active,
            // The gate the whole lightweight paint hangs off. FALSE on a WebGL
            // backend means NOTHING paints surface 1 — look at 4/5 for the grey.
            lightweightRenderArmed: rpm?.isLightweightWebGlActive ?? null,
            webGpuActive: rpm?.status?.webGpuActive ?? null,
            // Surface 1 — what RPM clears the overlay to every lightweight frame.
            overlayClearColor: rendererClear,
            overlayClearAlpha: rendererClearAlpha,
            // Surface 2 — RPM's scene-property authority. `null` is CORRECT on
            // native WebGPU and WRONG on either lightweight WebGL backend.
            sceneBackground:
                sceneBg == null
                    ? null
                    : (asHex(sceneBg) ?? `<texture:${(sceneBg as { type?: string }).type ?? 'unknown'}>`),
            // Surfaces 4 + 5 — the CSS underneath. #e8edf6 (`--app-bg`) here while
            // 1 and 2 are absent IS the founder's grey; #ffffff is correct.
            bimViewportCss: vpEl ? getComputedStyle(vpEl).backgroundColor : null,
            containerCss: getComputedStyle(container).backgroundColor,
            // ── SURFACE 0 — §PROBE-ENUMERATES-BACKGROUNDS-NOT-GREYS (L-1352) ──────
            // The five surfaces above are the five BACKGROUNDS. The founder's grey does
            // not have to be a background: anything DRAWN can be grey, and one thing in
            // this scene is a 4 km × 4 km translucent plane.
            //
            // `GroundShadowCatcher` is a `THREE.ShadowMaterial` plane, opacity 0.32,
            // `renderOrder -1`, centred on the origin. Its alpha, in three r183's node
            // renderer (which BOTH 'webgpu' and 'webgl-fallback' use), is
            // `ShadowMaskModel.finish()`: `diffuseColor.a *= shadowMask.oneMinus()` — so
            // it is transparent where LIT (mask 1) and paints 32 % black where the mask
            // reads 0. `RealEnvironmentService` already records, twice, that on this
            // renderer it "composites as fully shadowed → an opaque grey fill" and calls
            // that a SEPARATE open follow-up. A visible catcher whose mask reads 0 over
            // its unoccluded area is a flat grey wash over the whole lower viewport with
            // a darker blob where the real shadow falls — which is a background report
            // that no background fix can ever close.
            //
            // So the probe now names it. If `overlayClear`/`sceneBackground` read white
            // while the screen is grey, look HERE, and confirm with the one-click
            // discriminator: turning ground shadows off must make the grey vanish.
            groundShadowCatcher: (() => {
                try {
                    let found: Record<string, unknown> | null = null;
                    (world.scene.three as THREE.Scene).traverse((o: THREE.Object3D) => {
                        if (found || o.userData?.isGroundShadowCatcher !== true) return;
                        const m = (o as THREE.Mesh).material as
                            { type?: string; opacity?: number; transparent?: boolean } | undefined;
                        found = {
                            visible: o.visible,
                            visibleInTree: o.visible && (o.parent?.visible ?? true),
                            material: m?.type ?? 'none',
                            opacity: m?.opacity ?? null,
                            transparent: m?.transparent ?? null,
                        };
                    });
                    return found ?? 'not-in-scene';
                } catch { return 'probe-failed'; }
            })(),
        };
        console.log('[initScene] §VIEWPORT-BG-PROBE', report);

        // §PROBE-ENUMERATES-BACKGROUNDS-NOT-GREYS (L-1352) — do not print a VERDICT
        // (a wrong verdict is worse than none, and this family has produced two).
        // Print the NEXT MEASUREMENT: when every background surface reads white and the
        // screen does not, the grey is being DRAWN, and there is exactly one full-scene
        // translucent surface in this scene that can do it.
        const bgLooksWhite =
            (rendererClear === null || rendererClear === '#ffffff') &&
            (report.sceneBackground === null || report.sceneBackground === '#ffffff');
        const catcherVisible =
            typeof report.groundShadowCatcher === 'object' &&
            (report.groundShadowCatcher as { visible?: boolean } | null)?.visible === true;
        if (bgLooksWhite && catcherVisible) {
            console.log(
                '[initScene] §VIEWPORT-BG-PROBE next measurement — every BACKGROUND surface above ' +
                'reads white while the ground shadow-catcher is VISIBLE. If the viewport still looks ' +
                'grey, the grey is DRAWN, not a background: the catcher is a ShadowMaterial plane whose ' +
                'alpha is opacity x (1 - product of every shadow-casting light mask), so it washes its ' +
                'in-frustum footprint grey whenever any of those masks reads 0. CONFIRM by turning ' +
                'ground shadows OFF — if the grey vanishes it is the catcher, and no background fix ' +
                'can ever close it. See §DIAG-GROUND-SHADOW-CASTING-LIGHTS for the light count.',
            );
        }
        return report;
    };
    window.pryzmViewportBackgroundReport = reportViewportBackground;

    // ── §VIEWPORT-GREY-PIXEL-PROBE (L-1942) — read the PIXEL, not the config ──
    //
    // §VIEWPORT-BG-PROBE above enumerates what every surface is CONFIGURED to be. Six
    // reports of "the background is grey" have now been answered from that list, and
    // every one of them had to end in an inference — "these read white, therefore the
    // grey must be something else" — because nothing in this codebase has ever read the
    // colour that is actually on the screen. That inference is what a wrong fix is made
    // of: it is equally consistent with "the catcher is painting it", "a surface not on
    // the list is painting it", and "the configured value never reached the GPU".
    //
    // This probe measures the FRAMEBUFFER. It renders, downsamples the live canvas into
    // a 5x5 2D canvas and reads the 25 actual RGBA values; then it hides the ground
    // shadow-catcher, renders again, reads again, and restores it. The two grids and
    // their per-cell delta answer the question that five fixes had to assume:
    //
    //   * grids DIFFER  -> the catcher IS painting those pixels. The `withCatcher` hex
    //                      is the founder's grey and `withoutCatcher` is what is under
    //                      it. No background fix can ever close it.
    //   * grids MATCH   -> the catcher is NOT the grey. Whatever `withCatcher` reads is
    //                      being painted by something else, and §VIEWPORT-BG-PROBE's
    //                      surface list is where to look next.
    //
    // That is an OBSERVATION either way, not a verdict — the probe never says which
    // outcome it expects. It is also the one check that needs no UI toggling, so it can
    // be run from a console on production in one call, on BOTH backends.
    //
    // Mutating: it renders up to 3 extra frames and flips `catcher.visible` inside a
    // try/finally that always restores it. It allocates one 5x5 2D canvas. It performs
    // NO GPU dispose and touches no material, light or shadow state (ADR-0111 safe).
    const GREY_PIXEL_PROBE_GRID = 5;

    /** Downsample the live canvas to a 5x5 grid and return the 25 hex values. */
    const samplePresentedPixels = (): string[] | string => {
        try {
            const cv = pryzmCanvas;
            if (!cv) return 'no-canvas';
            const n = GREY_PIXEL_PROBE_GRID;
            const tmp = document.createElement('canvas');
            tmp.width = n; tmp.height = n;
            const ctx = tmp.getContext('2d', { willReadFrequently: true });
            if (!ctx) return 'no-2d-context';
            // Fill magenta first: if the WebGL/WebGPU canvas hands back nothing (a lost
            // drawing buffer), the reader sees #ff00ff and knows the sample is INVALID
            // rather than reading an all-zero grid as "the screen is black".
            ctx.fillStyle = '#ff00ff';
            ctx.fillRect(0, 0, n, n);
            ctx.drawImage(cv, 0, 0, n, n);
            const d = ctx.getImageData(0, 0, n, n).data;
            const out: string[] = [];
            for (let i = 0; i < n * n; i++) {
                const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], a = d[i * 4 + 3];
                const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
                out.push(a === 255 ? hex : `${hex}/a${a}`);
            }
            return out;
        } catch (e) {
            return `sample-failed:${e instanceof Error ? e.message : String(e)}`;
        }
    };

    const greyPixelProbe = (label = 'manual'): Record<string, unknown> => {
        const scene = world.scene.three as THREE.Scene;
        let catcher: THREE.Object3D | null = null;
        scene.traverse((o: THREE.Object3D) => {
            if (catcher === null && o.userData?.isGroundShadowCatcher === true) catcher = o;
        });
        const renderOnce = (): void => {
            try { renderPipelineManagerRef?.render(0); } catch { /* probe never breaks the frame loop */ }
        };

        renderOnce();
        const withCatcher = samplePresentedPixels();

        let withoutCatcher: string[] | string = 'catcher-not-in-scene';
        let catcherWasVisible: boolean | null = null;
        if (catcher !== null) {
            const c = catcher as THREE.Object3D;
            catcherWasVisible = c.visible;
            try {
                c.visible = false;
                renderOnce();
                withoutCatcher = samplePresentedPixels();
            } finally {
                c.visible = catcherWasVisible;
                renderOnce();
            }
        }

        // Per-cell delta — the measurement. Only computed when BOTH samples are grids.
        let changedCells: number | null = null;
        let firstChange: string | null = null;
        if (Array.isArray(withCatcher) && Array.isArray(withoutCatcher)) {
            changedCells = 0;
            for (let i = 0; i < withCatcher.length; i++) {
                if (withCatcher[i] !== withoutCatcher[i]) {
                    changedCells++;
                    if (firstChange === null) {
                        firstChange = `cell${i}: ${withCatcher[i]} -> ${withoutCatcher[i]}`;
                    }
                }
            }
        }

        const report: Record<string, unknown> = {
            label,
            backend: pryzmRendererBackend,
            canvasSize: pryzmCanvas ? `${pryzmCanvas.width}x${pryzmCanvas.height}` : null,
            grid: `${GREY_PIXEL_PROBE_GRID}x${GREY_PIXEL_PROBE_GRID}`,
            catcherInScene: catcher !== null,
            catcherWasVisible,
            withCatcher,
            withoutCatcher,
            changedCells,
            firstChange,
        };
        console.log('[initScene] §VIEWPORT-GREY-PIXEL-PROBE', report);
        if (changedCells !== null) {
            console.log(
                changedCells > 0
                    ? `[initScene] §VIEWPORT-GREY-PIXEL-PROBE OBSERVED — hiding the ground shadow-catcher ` +
                      `changed ${changedCells} of ${GREY_PIXEL_PROBE_GRID * GREY_PIXEL_PROBE_GRID} sampled ` +
                      `pixels (${firstChange}). Those pixels are DRAWN BY THE CATCHER; no scene.background ` +
                      'or renderer-clear change can affect them.'
                    : `[initScene] §VIEWPORT-GREY-PIXEL-PROBE OBSERVED — hiding the ground shadow-catcher ` +
                      'changed NONE of the sampled pixels. The catcher is not painting them. Read ' +
                      'window.pryzmViewportBackgroundReport() for the configured background stack, and ' +
                      'note that its surface list is a ledger, not a proof of completeness.',
            );
        }
        return report;
    };
    window.pryzmViewportGreyPixelProbe = greyPixelProbe;

    // §SURFACE-WITH-NO-AREA-REFUSES-THE-PASS (L-1470) — the SURVIVING half of the
    // aggregated log. Each refusing site warns ONCE per episode; the counts stay here
    // so a reader who arrived after the message scrolled past (or after Chrome stopped
    // reporting on that context entirely) can still retrieve them. A non-empty
    // `suppressedTotal` names a surface that has been discarding draws.
    (window as unknown as { pryzmZeroAreaSurfaceReport?: () => unknown })
        .pryzmZeroAreaSurfaceReport = () => {
            const rows = getZeroAreaSurfaceReport();
            if (rows.length === 0) {
                console.log('[initScene] §SURFACE-WITH-NO-AREA-REFUSES-THE-PASS — no site has ever been refused (every surface had area).');
            } else {
                console.table(rows);
            }
            return rows;
        };

    // Register the swap so the corner RendererBackendToggle can call it instead of
    // persisting + reloading (ADR-0077 supersedes ADR-0076's reload path).
    window.pryzmSwapRendererBackend = swapRendererBackend;
    console.log('[initScene] §RENDERER-LIVE-SWAP live backend-swap entry point registered (window.pryzmSwapRendererBackend).');

    // ── §FEAT-PROJECT-ORIGIN (L-109) — always-on blue-sphere project base point ──
    // Attach the singleton coordination-datum marker (C11 project singleton, C19/
    // ADR-0115 shared-coordinate origin). Additive + isolated: it only adds one
    // non-pickable helper mesh + a store subscription. Never throws into boot.
    try {
        initProjectOrigin(world.scene.three as THREE.Scene);
    } catch (e) {
        console.warn('[initScene] §FEAT-PROJECT-ORIGIN marker init failed (non-fatal):', e);
    }

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
