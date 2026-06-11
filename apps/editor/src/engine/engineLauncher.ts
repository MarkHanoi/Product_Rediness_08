// engineLauncher.ts — BIM engine orchestration entry point (Task 5.2 refactor).
// Spec: docs/archive/pryzm3-internal/04-PLAN-FORWARD/46-IMPLEMENTATION-PLAN-2026-05-08.md §5.2
import { enablePatches } from 'immer';
import { flushRuntimeEventListeners } from './runtimeEventBridge';
enablePatches();

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import * as OBCF from '@thatopen/components-front';
import * as BUI from '@thatopen/ui';
import { RGBELoader } from '@pryzm/renderer-three';
import { STANDARD_MATERIAL_LIBRARY, VisualStyle } from '@pryzm/core-app-model/material-library';
import { undoManager } from '@pryzm/command-registry';
import { PropertyPanelAdapter } from '@app/ui/property-panel/PropertyPanelAdapter';
import { ViewPropertiesPanel } from '@app/ui/ViewPropertiesPanel';
import { workspaceController } from '@app/ui/WorkspaceController';
import { SceneTheme } from '@pryzm/core-app-model';
import { ceilingSystemTypeStore } from '@pryzm/core-app-model/stores';
import { floorSystemTypeStore } from '@pryzm/core-app-model/stores';
import { SlabWallConnectivityService } from '@pryzm/geometry-slab';
import { doorStore } from '@pryzm/geometry-door';
import { windowStore } from '@pryzm/geometry-window';
import { spatialAuthority } from '@pryzm/core-app-model';
import { registerAllStores } from './initStores';
import { ScheduleRegistry } from '@pryzm/core-app-model';
import { SchedulePanel } from '@app/ui/SchedulePanel/SchedulePanel';
import { DataWorkbench } from '@app/ui/dataworkbench/DataWorkbench';
import { UpdateElementMarkCommand, CreatePlanViewCommand, ReDetectRoomsCommand } from '@pryzm/command-registry';
import { annotationStore } from '@pryzm/plugin-annotations';
import { WallInstanceBridge } from '@pryzm/geometry-wall';
import { initScene }          from './initScene';
import { initDataPlatform }   from './initDataPlatform';
import { initBuilders }       from './initBuilders';
import { initPersistence }    from './initPersistence';
import { initCollaboration }  from './initCollaboration';
import { initTools }          from './initTools';
import { initUI }             from './initUI';
import { inspectModeCoordinator }  from './inspect/InspectModeCoordinator';
import { comparisonEngine }        from '@pryzm/core-app-model';
import { batchCoordinator, selectionBus } from '@pryzm/core-app-model';
import { viewIntentInstanceStore } from '@pryzm/core-app-model';
import '../ui/inspect/AuditStack';
import '../ui/data/DataCommandCenter';
import { registerWallPerfBench } from './WallPerfBench';
import { registerWallHandlers } from '@pryzm/plugin-wall';
import { registerRoomHandlers } from '@pryzm/plugin-rooms';
import { registerSlabHandlers } from '@pryzm/plugin-slab';
import { registerCurtainWallHandlers } from '@pryzm/plugin-curtain-wall';
import { registerCeilingHandlers } from '@pryzm/plugin-ceiling';
import { registerRoofHandlers } from '@pryzm/plugin-roof';
import { registerFloorHandlers } from '@pryzm/plugin-floor';
import { registerColumnHandlers } from '@pryzm/plugin-column';
import { registerHandrailHandlers } from '@pryzm/plugin-handrail';
import { registerBeamHandlers } from '@pryzm/plugin-beam';
import { registerGridHandlers } from '@pryzm/plugin-grid';
import { registerStructuralHandlers } from '@pryzm/plugin-structural';
import { registerFurnitureHandlers } from '@pryzm/plugin-furniture';
import { registerPlumbingHandlers } from '@pryzm/plugin-plumbing';
import { registerLightingHandlers } from '@pryzm/plugin-lighting';
import { registerAnnotationHandlers } from '@pryzm/plugin-annotations';
import { registerDimensionHandlers } from '@pryzm/plugin-dimensions';
import { registerDoorHandlers } from '@pryzm/plugin-door';
import { registerWindowHandlers } from '@pryzm/plugin-window';
// §P3.4-SE: SectionData / SectionLine now exported from @pryzm/schemas → @pryzm/plugin-sdk.
// SectionId + 'section' added to Id.ts ElementType.  Gap resolved 2026-05-18.
import { registerSectionHandlers } from '@pryzm/plugin-section-view';
import { registerViewHandlers } from '@pryzm/plugin-view';
import { registerLevelHandlers } from '@pryzm/plugin-levels';
import { registerSelectionHandlers } from '@pryzm/plugin-selection';

// ── Task 5.2 extracted subsystems ─────────────────────────────────────────────
import { initAnnotationTools }        from './initAnnotationTools';
import { initBusHandlers }            from './initBusHandlers';
import { initBatchLifecycle }         from './initBatchLifecycle';
import { WallRebuildCoordinator }     from './WallRebuildCoordinator';
import { createTransformControllers } from './initTransformControllers';
import { registerTransformDragHandler } from './registerTransformDragHandler';
import { initViewpointsPanel }        from './initViewpointsPanel';
import { initViewSetup }              from './initViewSetup';
import { createAddFurniture }         from './initFurnitureInteraction';
import { initWallLevelSubscribers }   from './initWallLevelSubscribers';
import { ProjectLifecycleController } from '@pryzm/runtime-composer';
import { YjsDocAdapter, CRDTConflictResolver } from '@pryzm/sync-client';
// §S-B1 (DAILY-USE-AUDIT 2026-05-20) — wire the P8 conflict-disclosure UI.
// Both classes were already exported but `_yjsDocAdapter.onConflict(...)` was
// never called from the editor app, so concurrent CRDT edits were silently
// LWW'd in violation of C08 §3.1 / §3.3.
import { ConflictDisclosureBanner } from '@app/ui/ConflictDisclosureBanner';
import { ConflictResolutionDialog } from '@app/ui/ConflictResolutionDialog';
import { aiService } from '@pryzm/ai-host';

/**
 * Initialises the full BIM engine and mounts the platform shell toolbar.
 *
 * S5.2-R1 (2026-05-10) — WIRING STATUS:
 *   `bootstrap()` is no longer called as a standalone deprecated entry point.
 *   `src/main.ts` triggers it indirectly through
 *   `runtime.persistence.attachEngineBootstrap({ ensure })` — i.e. the typed
 *   persistence slot on the composed `PryzmRuntime` fires `ensure()` on first
 *   project open, which calls `startEngine(runtime)` → `bootstrap(runtime)`.
 *
 *   `composeRuntime()` is called first (lines 293+) and provides the full
 *   typed runtime handle.  This function receives that handle as its sole
 *   argument — it is NOT a free-standing composition root.
 *
 *   Full merger of `bootstrap()` into `composeRuntime()` (S5.2-R1 terminal
 *   step) is deferred to Phase D.3 (renderer mount from boot) because the
 *   canvas is null during the `composeRuntime()` call — the Three.js world
 *   cannot be initialised until the user opens a project and a DOM canvas is
 *   available.  See `src/main.ts` `bootPlatform()` comment §16.4 D.1/D.2/D.4.
 *
 * Sole importer: src/main.ts (via `loadEngine()` dynamic import).
 */
export async function bootstrap(
    runtime: import('@pryzm/runtime-composer').PryzmRuntime | null = null,
): Promise<void> {

    // ── P1 invariant: publish runtime to window slot before F.events sites run ─
    // All F.events-migrated files subscribe/emit via window.runtime?.events and
    // dispatch via window.runtime?.bus.  Without this assignment every optional-
    // chain silently no-ops because window.runtime is undefined.
    // Must precede PropertyPanelAdapter construction (line ~143) and all
    // initXxx() calls so that flushRuntimeEventListeners() finds a live bus.
    // See REGRESSION-DIAGNOSIS.md §2 for the full root-cause analysis.
    if (runtime) window.runtime = runtime as typeof window.runtime;

    // ── O.8 (PERF 2026-06-04): defer non-essential collaboration/CRDT init ─────
    // The CRDT replication adapter (YjsDocAdapter) + conflict-disclosure UI are
    // multi-user collaboration plumbing. A solo onboarding session reaching the
    // GENERATE step needs NONE of it: the command bus' CRDT applier is null-safe
    // (CommandBus.ts §`if (this._crdtApplier)`), the BatchCoordinator's adapter
    // hooks are optional (`this._yjsDocAdapter?.onBatchWindowOpen?.(...)`), and
    // the conflict banner/dialog only matter once a second editor concurrently
    // mutates the model. Constructing YjsDocAdapter (Yjs doc + sync wiring) inside
    // the synchronous boot path adds main-thread work before first paint, so we
    // move it behind `requestIdleCallback` after the editor is interactive.
    //
    // ESCAPE HATCH: set `window.__pryzmEagerBoot = true` (before boot) to run the
    // wiring inline, restoring the pre-O.8 synchronous ordering if deferral ever
    // misbehaves.
    const DEFER_NONESSENTIAL_INIT =
        (window as unknown as { __pryzmEagerBoot?: boolean }).__pryzmEagerBoot !== true;

    // ── BUI + tool registry + globals ─────────────────────────────────────────
    BUI.Manager.init();
    initAnnotationTools();
    window.UpdateElementMarkCommand = UpdateElementMarkCommand;
    window.OBC = OBC;
    window.CreatePlanViewCommand = CreatePlanViewCommand;
    window.comparisonEngine = comparisonEngine;
    registerWallPerfBench();
    console.log('Initializing Hybrid BIM Configurator...');

    ScheduleRegistry.registerDefaultSchedules();
    const schedulePanel = new SchedulePanel(runtime ?? null);
    window.schedulePanel = schedulePanel;
    const dataWorkbench = new DataWorkbench(runtime ?? null);
    window.dataWorkbench = dataWorkbench;

    // ── Scene ─────────────────────────────────────────────────────────────────
    const container = document.getElementById('container')!;
    const {
        components, world, grid,
        bimManager, projectContext,
        navManager, viewController, gridToggleService,
        fragments, gltfLoader, updateIfManualMode,
    } = await initScene(container, runtime ?? null);

    const highlighter = components.get(OBCF.Highlighter);
    highlighter.setup({ world }); highlighter.enabled = true;

    const {
        viewpoints, viewpointsTable, viewsTable,
        createViewpoint, updateViewsTable,
    } = initViewpointsPanel({ components, world });

    if (!world.renderer || !world.camera) throw new Error('World renderer or camera not initialized');
    {
        const canvas = world.renderer.three.domElement as HTMLCanvasElement;
        canvas.setAttribute('aria-label', '3D viewport — use keyboard to orbit');
        canvas.setAttribute('role', 'application');
        canvas.setAttribute('tabindex', '0');
    }

    const {
        transformControls, levelPlaneConstraint,
        hostedDragController, wallTransformController, stairTransformController, wallEndpointController,
    } = createTransformControllers(world);

    const { zoomToAll } = initViewSetup({ components, world, viewController });

    // ── Inspector (TDZ-lazy: selectionManager captured after initTools) ────────
    const materialMap = new Map(STANDARD_MATERIAL_LIBRARY.map(m => [m.id, m]));

    const inspector = new PropertyPanelAdapter({
        onUnselect: () => unselectAll(),
        onApplyHighlight: (obj) => selectionManager.applyHighlight(obj),
        onUpdateShadows: async () => { await (world.scene as any).updateShadows(); },
        transformControls,
        materialMap,
        getCurrentVisualStyle: () => currentVisualStyle,
    }, runtime ?? null); // R4 fix: inject runtime so _bindGridSelectedEvent uses typed path
    const bimViewport = container.querySelector('bim-viewport') as HTMLElement | null;
    const viewPropertiesPanel = new ViewPropertiesPanel({
        onViewUpdate: () => {},
        onSceneBgChange: (colorHex: string) => {
            if (bimViewport) SceneTheme.setBackground(colorHex, world, bimViewport);
            window.renderPipelineManager?.setColor(colorHex);
        },
    });
    window.viewPropertiesPanel = viewPropertiesPanel;
    window.runtime?.events?.on('view-selected', (payload: unknown) => { // F.events.8
        const view = (payload as { view?: object })?.view;
        if (view) { inspector.hide(); viewPropertiesPanel.show(view as any); }
    });
    const propertyPanel = inspector.element;
    const unselectAll = () => {
        selectionManager.unselectAll();
        inspector.update(null);
        viewPropertiesPanel.hide();
        highlighter.clear();
    };
    const updateInspector = (obj: THREE.Object3D | OBC.View) => {
        viewPropertiesPanel.hide();
        inspector.update(obj);
        if (obj instanceof THREE.Object3D && obj.userData?.id) {
            window.projectContext.selectedElementId = obj.userData.id;
            runtime?.events?.emit('pryzm-element-selected', { elementId: obj.userData.id, elementType: obj.userData.elementType ?? '', source: '3d' });
        } else {
            window.projectContext.selectedElementId = null;
        }
    };
    window.unselectAll = unselectAll;
    window.updateInspector = updateInspector;

    // ── WASM (non-blocking) + HDRI (lazy) ─────────────────────────────────────
    (fragments as any)._initPromise = fragments.init('/fragments-worker.mjs');
    let currentVisualStyle = VisualStyle.CONSISTENT_COLORS;
    let _hdriCache: Promise<THREE.Texture | null> | null = null;
    const getHdriTexture = (): Promise<THREE.Texture | null> => {
        if (!_hdriCache) {
            _hdriCache = new Promise<THREE.Texture | null>((resolve) => {
                new RGBELoader().load(
                    'https://thatopen.github.io/engine_fragment/resources/textures/envmaps/san_giuseppe_bridge_2k.hdr',
                    (t) => { t.mapping = THREE.EquirectangularReflectionMapping; resolve(t); },
                    undefined,
                    () => { console.warn('[EngineBootstrap] HDRI unavailable'); resolve(null); },
                );
            });
        }
        return _hdriCache;
    };

    // ── Builders ──────────────────────────────────────────────────────────────
    const {
        commandManagerRef,
        columnStore: columnStoreInstance,
        curtainWallStore: curtainWallStoreInstance,
        curtainPanelStore: curtainPanelStoreInstance,
        slabStore, ceilingStore, floorStore, roomStore,
        wallStore, roofStore, plumbingStore, openingStore,
        furnitureStore, handrailStore, beamStore,
        stairStore, stairTypeStore, stairLandingStore, stairRailingStore,
        gridStore, wallSystemTypeStore, slabSystemTypeStore,
        slabBuilder, plumbingBuilder, doorBuilder, windowBuilder,
        furnitureBuilder, stairMeshBuilder,
    } = await initBuilders({ scene: world.scene.three as THREE.Scene, bimManager, projectContext });
    bimManager.setRoofStore(roofStore);
    bimManager.setGridStore(gridStore); // OI-044: inject GridStore into BimManager
    spatialAuthority.setRoofStore(roofStore);
    window.roofStore = roofStore; // TODO(TASK-08)
    window.__slabRebuildControl = {
        pause:          () => slabBuilder.pause(),
        resume:         () => slabBuilder.resume(),
        resumeAndFlush: () => slabBuilder.resumeAndFlush(),
        isPaused:       () => slabBuilder.isPaused(),
    };

    // ── Tools ─────────────────────────────────────────────────────────────────
    const {
        selectionManager, commandManager, toolManager,
        wallTool, slabTool, curtainWallTool, columnTool, roofTool,
        roomTopologyObserver,
    } = await initTools({
        world, components, container, bimManager, projectContext,
        transformControls, levelPlaneConstraint, viewController, navManager,
        updateInspector, unselectAll, zoomToAll,
        getHdriTexture, getCurrentVisualStyle: () => currentVisualStyle,
        commandManagerRef, inspector, runtime,
        wallStore, slabStore, columnStoreInstance, beamStore,
        stairStore, stairTypeStore, stairLandingStore, stairRailingStore,
        gridStore, curtainWallStoreInstance, curtainPanelStoreInstance,
        roofStore, plumbingStore, furnitureStore, handrailStore, openingStore,
        wallSystemTypeStore, slabSystemTypeStore, ceilingStore, floorStore, roomStore,
        slabBuilder, plumbingBuilder, furnitureBuilder, stairMeshBuilder,
    });
    window.bimWorld = world;
    inspector.setRoofStore(roofStore);
    // §R4-FIX: thread commandManager into the PropertyPanel so that room-panel,
    // annotation/dimension editing, grid editing, and RoofPropertySheet all have
    // a live command manager reference. Previously only setRoofStore was called;
    // the missing setCommandManager call left _commandManager = null inside
    // PropertyPanel, silently breaking every code path that goes through it.
    inspector.setCommandManager(commandManager);

    // ── OI-044/045: package-tier dependency injection ─────────────────────────
    // These calls eliminate all `(window as any).selectionManager` reads in
    // packages/core-app-model/src/SelectionBus.ts (×3) and the
    // `(window as any).selectionManager?.world?.scene?.three` read in
    // packages/ai-host/src/QueryEngine.ts (×1).  Must run after initTools()
    // since selectionManager is created there.
    selectionBus.setSelectionManager(selectionManager);
    aiService.setSceneAccessor(() => (world.scene as any)?.three ?? null);
    console.log('[EngineBootstrap] OI-044/045: selectionBus + aiService scene accessor wired.');

    // F.events.4 — Route cross-panel element selection through typed runtime.events bus.
    // Replaces the window.addEventListener('pryzm-element-selected') removed from SelectionManager.init().
    if (runtime) {
        runtime.events.on('pryzm-element-selected', (detail) => {
            if (detail.source === '3d') return;
            if (!detail.elementType) return;
            if (detail.elementId) selectionManager.selectById(detail.elementId);
        });
    }

    // ── Post-tools wiring ─────────────────────────────────────────────────────
    try {
        const eps = window.edgeProjectorService, cmdMgr = commandManagerRef.current;
        if (eps && roofStore && cmdMgr && bimManager) {
            const { RoofSlopeSymbolBuilder } = await import('@pryzm/geometry-roof');
            eps.setRoofSlopeSymbolBuilder(new RoofSlopeSymbolBuilder(roofStore, bimManager, cmdMgr));
            console.log('[EngineBootstrap] §ROOF-AUDIT §5.4: RoofSlopeSymbolBuilder wired.');
        }
    } catch (err) { console.error('[EngineBootstrap] RoofSlopeSymbolBuilder wiring failed:', err); }

    try {
        const _ier = window.__instancedElementRenderer;
        const _builder = wallTool.getFragmentBuilder();
        if (_ier && _builder && typeof _builder.setInstanceBridge === 'function') {
            _builder.setInstanceBridge(new WallInstanceBridge(_ier));
            console.log('[EngineBootstrap] §PHASE-3: WallInstanceBridge connected.');
        }
    } catch (e: any) { console.error('[EngineBootstrap] §PHASE-3: WallInstanceBridge failed:', e?.message ?? e); }

    // ── Batch + event bus wiring ───────────────────────────────────────────────
    batchCoordinator.inject(commandManager, bimManager, runtime ?? null);
    // P9-W4: wire the legacy REDETECT_ROOMS factory so BatchCoordinator (now in
    // packages/) can instantiate commands without a dynamic src/ import.
    batchCoordinator.setLegacyRedetectRoomsFactory(
        (levelId, elevation, height) => new ReDetectRoomsCommand(levelId, elevation, height),
    );
    initBatchLifecycle({ world });
    initBusHandlers(runtime);
    // ── F.events.2b: vi:instance-updated dispatch bridge → runtime.events ─────
    // ViewIntentInstanceStore is a package-tier singleton that cannot import
    // runtime-composer (circular-dep violation). We inject a typed emitter here
    // so all runtime.events.on('vi:instance-updated', ...) listeners in the UI
    // layer (PlanViewManager, OverridePanel, ViewsRailPanel, ViewPropertiesPanel,
    // ViewHeaderButtons, HeaderIntentPicker) receive the typed event after every
    // store mutation. The parallel window.dispatchEvent(CustomEvent) path in the
    // store is preserved so package-tier DOM listeners (GraphicsRulesEngine,
    // ViewRangeFilterService, ViewRangeZoneApplicator, ViewTechnicalDrawingCache)
    // continue working without runtime access.
    if (runtime?.events) {
        viewIntentInstanceStore.setRuntimeViEmitter((viewId, instanceId) => {
            runtime!.events!.emit('vi:instance-updated', { viewId, instanceId });
        });
        console.log('[EngineBootstrap] F.events.2b: viewIntentInstanceStore runtime emitter wired.');
    }
    // ── F-1.3: Wire plugin handler registrations ──────────────────────────────
    // All authoritative element handlers live in plugin packages (L4) and are
    // registered here at bootstrap.  Bridge handlers (wall.create-on-all-slabs,
    // slab.create-on-all-floors, curtain-wall.create-on-all-slabs,
    // level.duplicate-floor-plan) use (window as any).commandManager internally.
    // rooms.redetect uses the CustomEvent bridge (RedetectRoomsHandler → listener below).
    if (runtime) {
        // The PryzmRuntime.bus slot is intentionally narrow ({ executeCommand,
        // register, registry }) to avoid exposing CommandBus internals through the
        // public runtime contract (types.ts §Slot-3 comment, D.5.A.8).  Plugin
        // registerXxxHandlers() functions declare `bus: CommandBus` because they
        // were written before the slot was narrowed.  Cast through `any` here —
        // the underlying value IS always a CommandBus instance.  Same pattern as
        // the CRDT-applier wiring below (line ~407).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const _busRaw = runtime.bus as any;
        // §OI-053 (PERF 2026-05-24) — idempotent register facade. composeRuntime()
        // already registers the authoritative plugin handlers, and initBusHandlers()
        // (line 335) registers more, so the registerXxxHandlers() calls below
        // re-register the SAME command types. CommandBus.register() throws
        // "handler already registered" on a duplicate, so this block previously threw
        // ~25× per boot — each caught + logged as a red console.error WITH a stack
        // trace (a real cost with DevTools open, and it buried genuine errors). This
        // facade makes register() skip-if-present: "first registration wins" is
        // exactly the shipped behaviour (the duplicate always threw + was discarded),
        // so this is behaviour-preserving — it only removes the throw/catch/spam and
        // makes the block safe to re-run on project re-open. Genuine handler-shape
        // errors (bad affectedStores / missing execute) still throw + surface.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const _bus: any = new Proxy(_busRaw, {
            get(target, prop, receiver) {
                if (prop === 'register') {
                    return (handler: any) => {
                        const t = handler?.type;
                        if (t && (target.registry?.has?.(t) ?? target.has?.(t))) return;
                        return target.register(handler);
                    };
                }
                return Reflect.get(target, prop, receiver);
            },
        });
        try { registerWallHandlers(_bus); console.log('[EngineBootstrap] F-1.3: wall handlers registered.'); }
        catch (e: any) { console.error('[EngineBootstrap] F-1.3: registerWallHandlers failed (non-fatal):', e?.message ?? e); }
        try { registerRoomHandlers(_bus); console.log('[EngineBootstrap] F-1.3: room handlers registered.'); }
        catch (e: any) { console.error('[EngineBootstrap] F-1.3: registerRoomHandlers failed (non-fatal):', e?.message ?? e); }
        try { registerSlabHandlers(_bus); console.log('[EngineBootstrap] F-1.3: slab handlers registered.'); }
        catch (e: any) { console.error('[EngineBootstrap] F-1.3: registerSlabHandlers failed (non-fatal):', e?.message ?? e); }
        try { registerCurtainWallHandlers(_bus); console.log('[EngineBootstrap] F-1.3: curtain-wall handlers registered.'); }
        catch (e: any) { console.error('[EngineBootstrap] F-1.3: registerCurtainWallHandlers failed (non-fatal):', e?.message ?? e); }
        // §P3.2-CL (IMPL-PLAN-2026-05-17): ceiling handlers — fixes previously broken ceiling.create path.
        // CeilingPlanToolHandler dispatches ceiling.create; CreateCeilingHandler updates the Immer ceiling
        // store; initTools.ts §P3.2-CL bridge mirrors to legacy CeilingStore for mesh rendering.
        try { registerCeilingHandlers(_bus); console.log('[EngineBootstrap] §P3.2-CL: ceiling handlers registered.'); }
        catch (e: any) { console.error('[EngineBootstrap] §P3.2-CL: registerCeilingHandlers failed (non-fatal):', e?.message ?? e); }
        // §P3.2-RF (IMPL-PLAN-2026-05-17): roof handlers — replaces the `roof.create` legacy bridge
        // in initBusHandlers.ts. CreateRoofHandler registers under command type 'roof.create';
        // initTools.ts §P3.2-RF bridge mirrors to legacy RoofStore for RoofFragmentBuilder mesh.
        try { registerRoofHandlers(_bus); console.log('[EngineBootstrap] §P3.2-RF: roof handlers registered.'); }
        catch (e: any) { console.error('[EngineBootstrap] §P3.2-RF: registerRoofHandlers failed (non-fatal):', e?.message ?? e); }
        // §P3.2-FL (IMPL-PLAN-2026-05-17): floor handlers — replaces the `floor.create` legacy bridge
        // in initBusHandlers.ts. CreateFloorHandler registers under command type 'floor.create';
        // initTools.ts §P3.2-FL bridge mirrors to legacy FloorStore for FloorFragmentBuilder mesh.
        try { registerFloorHandlers(_bus); console.log('[EngineBootstrap] §P3.2-FL: floor handlers registered.'); }
        catch (e: any) { console.error('[EngineBootstrap] §P3.2-FL: registerFloorHandlers failed (non-fatal):', e?.message ?? e); }
        // §P3.3-CO (IMPL-PLAN-2026-05-17): column handlers — fixes previously unhandled column.create.
        // ColumnPlanToolHandler/CopyPlanToolHandler dispatch column.create; CreateColumnHandler writes
        // to Immer column store; initTools.ts §P3.3-CO bridge mirrors to legacy ColumnStore for mesh.
        try { registerColumnHandlers(_bus); console.log('[EngineBootstrap] §P3.3-CO: column handlers registered.'); }
        catch (e: any) { console.error('[EngineBootstrap] §P3.3-CO: registerColumnHandlers failed (non-fatal):', e?.message ?? e); }
        // §P3.3-HR (IMPL-PLAN-2026-05-17): Handrail handlers — CreateHandrail + Delete + SetPath +
        // SetShape + SetHost + Recompute.  HandrailPlanToolHandler dispatches 'handrail.create';
        // CreateHandrailHandler writes to the Immer handrail store.
        // beam.batch.create structural stub in initBusHandlers.ts removed; real batch handler here.
        try { registerHandrailHandlers(_bus); console.log('[EngineBootstrap] §P3.3-HR: handrail handlers registered.'); }
        catch (e: any) { console.error('[EngineBootstrap] §P3.3-HR: registerHandrailHandlers failed (non-fatal):', e?.message ?? e); }
        // §P3.3-BM (IMPL-PLAN-2026-05-17): Beam handlers — CreateBeam + CreateBeamBatch + Delete +
        // Move + SetType + SetSection.  Supersedes beam.batch.create structural stub.
        try { registerBeamHandlers(_bus); console.log('[EngineBootstrap] §P3.3-BM: beam handlers registered.'); }
        catch (e: any) { console.error('[EngineBootstrap] §P3.3-BM: registerBeamHandlers failed (non-fatal):', e?.message ?? e); }
        // §P3.4-GR (IMPL-PLAN-2026-05-17): Grid handlers — CreateGrid + Delete + SetSpacing + SetExtent.
        try { registerGridHandlers(_bus); console.log('[EngineBootstrap] §P3.4-GR: grid handlers registered.'); }
        catch (e: any) { console.error('[EngineBootstrap] §P3.4-GR: registerGridHandlers failed (non-fatal):', e?.message ?? e); }
        // §P3.4-ST (IMPL-PLAN-2026-05-17): Structural handlers — CreateStructural + 6 update handlers.
        try { registerStructuralHandlers(_bus); console.log('[EngineBootstrap] §P3.4-ST: structural handlers registered.'); }
        catch (e: any) { console.error('[EngineBootstrap] §P3.4-ST: registerStructuralHandlers failed (non-fatal):', e?.message ?? e); }
        // §P3.5-FU (IMPL-PLAN-2026-05-17): Furniture handlers — Create + Delete + Move + Rotate + Scale + Lod + Representation + UpdateParams.
        try { registerFurnitureHandlers(_bus); console.log('[EngineBootstrap] §P3.5-FU: furniture handlers registered.'); }
        catch (e: any) { console.error('[EngineBootstrap] §P3.5-FU: registerFurnitureHandlers failed (non-fatal):', e?.message ?? e); }
        // §P3.5-PL (IMPL-PLAN-2026-05-17): Plumbing handlers — Create + CreateFixture + Delete + Move + SetSystem.
        // Supersedes plumbing.create bridge in initBusHandlers.ts (retired below).
        try { registerPlumbingHandlers(_bus); console.log('[EngineBootstrap] §P3.5-PL: plumbing handlers registered.'); }
        catch (e: any) { console.error('[EngineBootstrap] §P3.5-PL: registerPlumbingHandlers failed (non-fatal):', e?.message ?? e); }
        // §P3.5-LT (IMPL-PLAN-2026-05-17): Lighting handlers — Create + Delete + Move + SetIntensity + SetEmergency.
        // Supersedes lighting.create bridge in initBusHandlers.ts (retired).
        try { registerLightingHandlers(_bus); console.log('[EngineBootstrap] §P3.5-LT: lighting handlers registered.'); }
        catch (e: any) { console.error('[EngineBootstrap] §P3.5-LT: registerLightingHandlers failed (non-fatal):', e?.message ?? e); }
        // §P3.5-AN (IMPL-PLAN-2026-05-17): Annotation handlers — Create + Delete.
        // Supersedes annotation.create bridge in initBusHandlers.ts (retired).
        try { registerAnnotationHandlers(_bus); console.log('[EngineBootstrap] §P3.5-AN: annotation handlers registered.'); }
        catch (e: any) { console.error('[EngineBootstrap] §P3.5-AN: registerAnnotationHandlers failed (non-fatal):', e?.message ?? e); }
        // §P3.5-DI (IMPL-PLAN-2026-05-17): Dimension handlers — Create + Delete.
        try { registerDimensionHandlers(_bus); console.log('[EngineBootstrap] §P3.5-DI: dimension handlers registered.'); }
        catch (e: any) { console.error('[EngineBootstrap] §P3.5-DI: registerDimensionHandlers failed (non-fatal):', e?.message ?? e); }
        // §P3.1-DO (IMPL-PLAN-2026-05-17): Door handlers — Create + BatchCreate + Delete + Move + SetType + SetSwing + SetWidth + SetHeight + SetFireRating + SetAccessibility.
        // Supersedes door.batch.create structural stub in initBusHandlers.ts.
        try { registerDoorHandlers(_bus); console.log('[EngineBootstrap] §P3.1-DO: door handlers registered.'); }
        catch (e: any) { console.error('[EngineBootstrap] §P3.1-DO: registerDoorHandlers failed (non-fatal):', e?.message ?? e); }
        // §P3.1-WI (IMPL-PLAN-2026-05-17): Window handlers — Create + BatchCreate + Delete + Move + SetType + SetSize + SetSillHeight + SetFireRating.
        // Supersedes window.batch.create structural stub in initBusHandlers.ts.
        try { registerWindowHandlers(_bus); console.log('[EngineBootstrap] §P3.1-WI: window handlers registered.'); }
        catch (e: any) { console.error('[EngineBootstrap] §P3.1-WI: registerWindowHandlers failed (non-fatal):', e?.message ?? e); }
        // §P3.4-SE (IMPL-PLAN-2026-05-17): Section handlers — Create + Delete + MoveLine + SetDepth + SetMark + SetScale.
        // Supersedes section.create bridge in initBusHandlers.ts (retired below).
        // SectionData type gap fixed: SectionData / SectionLine / SectionId added to @pryzm/schemas → @pryzm/plugin-sdk.
        try { registerSectionHandlers(_bus); console.log('[EngineBootstrap] §P3.4-SE: section handlers registered.'); }
        catch (e: any) { console.error('[EngineBootstrap] §P3.4-SE: registerSectionHandlers failed (non-fatal):', e?.message ?? e); }
        // §P3.4-VW (IMPL-PLAN-2026-05-17): View handlers — covers view.* update family.
        try { registerViewHandlers(_bus); console.log('[EngineBootstrap] §P3.4-VW: view handlers registered.'); }
        catch (e: any) { console.error('[EngineBootstrap] §P3.4-VW: registerViewHandlers failed (non-fatal):', e?.message ?? e); }
        try { registerLevelHandlers(_bus); console.log('[EngineBootstrap] F-1.3: level handlers registered.'); }
        catch (e: any) { console.error('[EngineBootstrap] F-1.3: registerLevelHandlers failed (non-fatal):', e?.message ?? e); }
        // §TASK-08 (MASTER-IMPL-PLAN-FUNCTIONAL-2026-05-18): Register copy/paste handlers so
        // copy-selection and paste-clipboard are no longer silent no-ops.  Option A: canExecute
        // returns { valid: false, reason: '...' } to surface feedback to the caller.
        try { registerSelectionHandlers(_bus); console.log('[EngineBootstrap] TASK-08: selection handlers (copy/paste) registered.'); }
        catch (e: any) { console.error('[EngineBootstrap] TASK-08: registerSelectionHandlers failed (non-fatal):', e?.message ?? e); }

        // ── §C-B1 (DAILY-USE-AUDIT 2026-05-20) — register zoom-fit/zoom-selected ─
        // The MainToolbar buttons dispatched these bus commands (declared in
        // packages/command-bus/src/commands.ts:45-46), but no handler was
        // registered anywhere → every click was a silent no-op. They're
        // pure side-effect navigation commands (no store mutation), so they
        // use the same shape as e.g. `view.create`: empty `affectedStores`,
        // trivial canExecute, side-effect `execute`. The handlers are inline
        // here because `zoomToAll` is the engineLauncher closure (line 173)
        // and `viewController` is the constructed instance — both already in
        // scope. Logged via `withHandlerSpan`-equivalent console marker so
        // observability sees the command (P8 compliance: every public-API
        // surface produces a trace marker).
        try {
            _bus.register({
                type: 'zoom-fit',
                affectedStores: [] as const,
                canExecute: () => ({ valid: true }),
                execute: () => {
                    // zoomToAll handles 3D + plan/section/elevation via the camera-controls fit().
                    void zoomToAll(true).catch((err) =>
                        console.warn('[zoom-fit] zoomToAll failed (non-fatal):', err)
                    );
                    return { forward: [], inverse: [] };
                },
            });
            console.log('[EngineBootstrap] §C-B1: zoom-fit handler registered.');
        } catch (e: any) {
            console.error('[EngineBootstrap] §C-B1: zoom-fit register failed:', e?.message ?? e);
        }
        try {
            _bus.register({
                type: 'zoom-selected',
                affectedStores: [] as const,
                canExecute: () => ({ valid: true }),
                execute: () => {
                    const sel = selectionManager?.selectedObject;
                    if (!sel) {
                        // No selection → fall back to fit-all so the button always does
                        // something visible (better UX than silent no-op).
                        void zoomToAll(true).catch(() => { /* non-fatal */ });
                        return { forward: [], inverse: [] };
                    }
                    try {
                        // Compute the Box3 of the selected object's mesh subtree and ask
                        // the OBC camera-controls to fit it. Animate=true matches the
                        // zoomToAll convention.
                        const box = new THREE.Box3().setFromObject(sel);
                        if (box.isEmpty()) {
                            void zoomToAll(true).catch(() => { /* non-fatal */ });
                            return { forward: [], inverse: [] };
                        }
                        const min = box.min;
                        const max = box.max;
                        // §C-B1 — the real `CameraControls` type doesn't structurally
                        // overlap with our narrow shape, so cast through `unknown` as
                        // TS recommends (TS2352 mitigation). We rely on duck-typing here
                        // because camera-controls' API surface varies by build.
                        const ctrls = world.camera.controls as unknown as {
                            fitToBox?: (b: unknown, animate?: boolean) => Promise<void>;
                            setLookAt?: (px: number, py: number, pz: number, tx: number, ty: number, tz: number, animate?: boolean) => Promise<void>;
                        };
                        if (typeof ctrls.fitToBox === 'function') {
                            void ctrls.fitToBox(box, true).catch?.(() => { /* non-fatal */ });
                        } else if (typeof ctrls.setLookAt === 'function') {
                            // Fallback for camera-controls builds without fitToBox: aim at centre,
                            // back off by 2× the bounding-sphere radius.
                            const cx = (min.x + max.x) / 2;
                            const cy = (min.y + max.y) / 2;
                            const cz = (min.z + max.z) / 2;
                            const r  = Math.max(max.x - min.x, max.y - min.y, max.z - min.z) || 1;
                            const off = r * 2;
                            void ctrls.setLookAt(cx + off, cy + off, cz + off, cx, cy, cz, true).catch?.(() => { /* non-fatal */ });
                        }
                    } catch (err) {
                        console.warn('[zoom-selected] failed (non-fatal):', err);
                    }
                    return { forward: [], inverse: [] };
                },
            });
            console.log('[EngineBootstrap] §C-B1: zoom-selected handler registered.');
        } catch (e: any) {
            console.error('[EngineBootstrap] §C-B1: zoom-selected register failed:', e?.message ?? e);
        }
    }

    // ── Wall rebuild coordinator (§DIRTY-BATCH / C13) ─────────────────────────
    const wallRebuildCoordinator = new WallRebuildCoordinator();
    wallRebuildCoordinator.init({ wallTool, slabStore, bimManager, doorBuilder, windowBuilder, world });

    // §WS-2.A — dedupe wall redetect: tell the RoomTopologyObserver to ignore
    // WallStore events fired by the join-resolver storm. The committed event
    // (`bim-wall-mutation-committed`) still drives ONE redetect after the
    // resolver finishes, so a single user wall draw produces ONE redetect
    // instead of TWO (commit + N debounced resolver updates). Wired against
    // the LOCAL roomTopologyObserver instance (returned by initTools) — no
    // window-bridge needed; respects P4.
    roomTopologyObserver.setJoinsResolvingPredicate(
        () => wallRebuildCoordinator.isJoinsResolving,
    );

    const addFurniture = createAddFurniture({
        world, projectContext, gltfLoader, bimManager, furnitureBuilder, furnitureStore,
        getSelectionManager: () => selectionManager,
        updateInspector,
    });

    // §II-2: First-pass inject (CW control set again after initUI — §FIX-CW-CTRL-REREGISTER).
    batchCoordinator.registerBuilderControls(
        window.__wallRebuildControl,
        window.__curtainWallRebuildControl,
        window.__slabRebuildControl,
    );

    registerTransformDragHandler({
        transformControls, levelPlaneConstraint, hostedDragController,
        wallTransformController, stairTransformController, wallEndpointController,
        world, bimManager, selectionManager, updateInspector,
    });

    initWallLevelSubscribers({ wallTool, slabStore, spatialAuthority });

    // ── §03: Slab-wall connectivity ───────────────────────────────────────────
    const slabWallConnectivityService = new SlabWallConnectivityService(
        slabStore,
        wallTool.getWallStore(),
        () => wallRebuildCoordinator.isJoinsResolving,
        commandManager,
    );
    slabWallConnectivityService.bootstrap();

    // ── §3.2: StoreRegistry ───────────────────────────────────────────────────
    registerAllStores({
        wallStore:         wallTool.getWallStore(),
        slabStore,
        columnStore:       columnStoreInstance,
        beamStore,         stairStore,          stairLandingStore,
        stairRailingStore, stairTypeStore,
        curtainWallStore:  curtainWallStoreInstance,
        curtainPanelStore: curtainPanelStoreInstance,
        doorStore,         windowStore,          roofStore,
        plumbingStore,     furnitureStore,       handrailStore,
        openingStore,      gridStore,            roomStore,
        ceilingStore,      floorStore,           annotationStore,
    });

    initDataPlatform({ world, selectionManager, updateInspector }, runtime ?? null);

    // ── UI ────────────────────────────────────────────────────────────────────
    await initUI({
        runtime, world, components, container, bimManager, projectContext,
        commandManager, selectionManager, toolManager,
        inspector, propertyPanel,
        wallTool, slabTool, curtainWallTool, columnTool, roofTool,
        viewController, navManager, gridToggleService,
        undoManager, grid,
        viewpoints, viewpointsTable, viewsTable,
        zoomToAll, createViewpoint, updateViewsTable,
        addFurniture, materialMap, getHdriTexture,
        curtainPanelStoreInstance, fragments,
        unselectAll, updateIfManualMode,
    });

    // §FIX-CW-CTRL-REREGISTER: CurtainWallBuilder is constructed inside initUI — re-inject.
    batchCoordinator.registerBuilderControls(
        window.__wallRebuildControl,
        window.__curtainWallRebuildControl,
        window.__slabRebuildControl,
    );
    console.log(`[EngineBootstrap] §FIX-CW-CTRL-REREGISTER: cw=${!!window.__curtainWallRebuildControl}`);

    // F.events.2d — flush deferred runtime-event subscriptions (e.g. DiagnosticMaterialManager
    // constructor listeners queued before window.runtime was set).
    flushRuntimeEventListeners();

    inspectModeCoordinator.init(world.scene.three as THREE.Scene);
    workspaceController.restoreFromStorage();
    window.workspaceController = workspaceController;

    // ── Persistence + collaboration ───────────────────────────────────────────
    initPersistence({
        world, bimManager, toolManager, unselectAll,
        stores: {
            wallStore:          wallTool.getWallStore(),
            slabStore,
            columnStore:        window.columnStore ?? columnStoreInstance, // TODO(TASK-08)
            gridStore,          stairStore,         beamStore,
            curtainWallStore:   window.curtainWallStore || curtainWallStoreInstance, // TODO(TASK-08)
            roofStore,          plumbingStore,       furnitureStore,
            handrailStore,      openingStore,        roomStore,
            slabSystemTypeStore, wallSystemTypeStore,
            ceilingStore,       ceilingSystemTypeStore,
            floorStore,         floorSystemTypeStore,
        },
        runtime: runtime ?? null,
    });
    initCollaboration({ container, commandManager, events: runtime?.events });

    // ── G3-T2 + §S-B1: CRDT applier + conflict-disclosure UI — DEFERRED (O.8) ──
    // Constructs the YjsDocAdapter (Yjs doc + sync wiring), registers it with the
    // BatchCoordinator (§E.1 batch-window hooks), attaches it to the CommandBus
    // CRDT applier slot, and wires the P8 conflict banner/dialog. This is solo-
    // irrelevant collaboration plumbing — see the DEFER_NONESSENTIAL_INIT comment
    // at the top of bootstrap(). It is moved off the first-paint/generate critical
    // path and scheduled on idle. Guarded by `_crdtWired` so it runs exactly once,
    // and exposed on `window.__pryzmEnsureCollabCRDT` so any future caller that
    // hard-depends on live CRDT replication can force-init it early (the generate
    // path does NOT — the applier + adapter hooks are both null-safe).
    let _crdtWired = false;
    const wireCollaborationCRDT = (): void => {
        if (_crdtWired) return;
        _crdtWired = true;

        // Creates a YjsDocAdapter, registers it with BatchCoordinator (wiring the
        // §E.1 batch-window hooks so G3-T1 logging fires), then attaches it to the
        // CommandBus CRDT applier slot (step 7 in executeCommand).
        //
        // Effect: every commandBus.executeCommand() now also calls
        //   yjsDocAdapter.applyCommand(type, payload) immediately — one CRDT op per
        //   element instead of one coalesced StoreEventBus event per level per batch.
        // This eliminates the 11.4-second CRDT blackout documented in
        // gap-analysis doc 50, §3 and ADR-049 §4.4 (G3-T2).
        const _yjsDocAdapter = new YjsDocAdapter(
            (window as { currentProjectId?: string }).currentProjectId ?? 'pryzm-project',
        );
        batchCoordinator.registerYjsDocAdapter(_yjsDocAdapter);
        // runtime.inner.bus is the CommandBus instance (types.ts Slot 3).
        // The PryzmRuntime public interface narrows bus to { executeCommand, register,
        // registry } — cast through `any` to reach the full CommandBus API without
        // widening the public contract (same pattern as setRingBuffer in composeRuntime).
        const _innerBus = (runtime as any)?.inner?.bus; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (_innerBus && typeof _innerBus.setCrdtApplier === 'function') {
            _innerBus.setCrdtApplier(
                (type: string, payload: Record<string, unknown>) =>
                    _yjsDocAdapter.applyCommand(type, payload),
            );
            console.log('[EngineBootstrap] G3-T2: CRDT applier wired → YjsDocAdapter');
        } else {
            console.warn('[EngineBootstrap] G3-T2: runtime.inner.bus not accessible — CRDT applier not wired');
        }

        // ── §S-B1 (DAILY-USE-AUDIT 2026-05-20) — wire P8 conflict-disclosure UI ──
        // C08 §3.1 / §3.3: silent LWW is forbidden. When `YjsDocAdapter.emitConflict`
        // fires (concurrent semantic edit detected by `CRDTConflictResolver` or by
        // the in-batch elevation-mismatch detector), the user MUST see:
        //   1. ConflictDisclosureBanner — non-blocking alert (role=alert, aria-live)
        //      announcing that a remote edit overrode their change.
        //   2. ConflictResolutionDialog (on banner click) — Keep mine / Keep theirs
        //      / Merge picker. CRDTConflictResolver.applyResolution() returns the
        //      chosen value; the actual re-dispatch to update the element happens
        //      via the command bus using the element type's update handler.
        //
        // Architectural alignment: the resolver, dialog, banner, and emitConflict
        // hook all already exist (Wave A19-T3/T6/T7); this is the missing wiring
        // step at the L7 application layer. Singletons live for the engine lifetime;
        // the dialog/banner manage their own DOM lifecycle (show/hide).
        try {
            const _conflictBanner   = new ConflictDisclosureBanner();
            const _conflictDialog   = new ConflictResolutionDialog();
            const _conflictResolver = new CRDTConflictResolver();
            _yjsDocAdapter.onConflict((conflict) => {
                _conflictBanner.show({
                    remoteAuthor: conflict.remoteAuthor,
                    propertyName: conflict.property,
                    onResolve: () => {
                        _conflictDialog.show(conflict, (result) => {
                            try {
                                const finalValue = _conflictResolver.applyResolution(
                                    result.conflict,
                                    result.resolution,
                                    result.mergedValue,
                                );
                                // Route the resolved value back through `element.updateParameters`
                                // — the generic update bridge (`initBusHandlers §E.5.x`) that
                                // routes by elementId without needing the caller to know the
                                // element type. If the bus dispatch fails we still emit a
                                // resolution-recorded telemetry log so the resolver decision
                                // is auditable. The remote LWW value has already been applied
                                // by Yjs; this dispatch overrides it when the user picks
                                // "Keep mine" / "Merge".
                                const r = window.runtime as { bus?: { executeCommand?: (t: string, p: unknown) => Promise<unknown> } } | undefined;
                                r?.bus?.executeCommand?.('element.updateParameters', {
                                    id: conflict.elementId,
                                    params: { [conflict.property]: finalValue },
                                })?.catch?.((err: unknown) => {
                                    console.warn('[ConflictResolution] re-dispatch failed (logged for audit):', err);
                                });
                                console.log(
                                    `[ConflictResolution] resolved id=${conflict.elementId} prop=${conflict.property} ` +
                                    `→ resolution=${result.resolution} value=${JSON.stringify(finalValue)}`,
                                );
                            } catch (err) {
                                console.error('[ConflictResolution] applyResolution failed:', err);
                            }
                        });
                    },
                });
            });
            console.log('[EngineBootstrap] §S-B1: CRDT conflict UI wired — banner + dialog active.');
        } catch (err) {
            console.error('[EngineBootstrap] §S-B1: conflict UI wiring failed (non-fatal):', err);
        }
    };

    // Expose a force-init guard so any hard CRDT dependency can wire it early.
    (window as unknown as { __pryzmEnsureCollabCRDT?: () => void })
        .__pryzmEnsureCollabCRDT = wireCollaborationCRDT;

    if (DEFER_NONESSENTIAL_INIT) {
        // O.8 — schedule on idle, after first paint, with a setTimeout fallback.
        // Also (re-)schedule after the first project load so the CRDT applier is
        // live well before any multi-user editing, even if no idle slot fires.
        // Idempotent (`_crdtWired`) — these can all race harmlessly.
        const ric = window.requestIdleCallback as
            | ((cb: () => void, opts?: { timeout: number }) => number) | undefined;
        if (typeof ric === 'function') ric(() => wireCollaborationCRDT(), { timeout: 4000 });
        else setTimeout(() => wireCollaborationCRDT(), 1500);
        window.runtime?.events?.on('pryzm-project-loaded', () => { // F.events.9
            if (typeof ric === 'function') ric(() => wireCollaborationCRDT(), { timeout: 3000 });
            else setTimeout(() => wireCollaborationCRDT(), 800);
        });
        console.log('[EngineBootstrap] O.8: collaboration/CRDT wiring deferred to idle (post-paint).');
    } else {
        // Escape hatch (`window.__pryzmEagerBoot`) — original synchronous ordering.
        wireCollaborationCRDT();
    }

    // ── F-1.4: rooms.redetect CustomEvent bridge listener ─────────────────────
    // RedetectRoomsHandler (plugins/rooms L4) dispatches 'pryzm-bus-rooms-redetect'
    // to avoid an L4→L7 import cycle (ADR-002 §3.D).  This L7 listener converts
    // the CustomEvent into a LEGACY commandManager.execute(ReDetectRoomsCommand) call.
    //
    // CRITICAL BUG FIX (F-1.4-REDETECT-LOOP):
    //   The previous implementation called bus.executeCommand('rooms.redetect') here.
    //   That re-entered RedetectRoomsHandler.execute() which dispatches this same
    //   CustomEvent again → infinite recursion → RangeError: Maximum call stack size exceeded.
    //   (Reported in live logs: RedetectRooms.ts:80 Uncaught RangeError.)
    //   Fix: use commandManager.execute(ReDetectRoomsCommand) — the legacy path that
    //   actually runs room detection without touching the bus.
    //   Contract: C11 §6.3 event-driven path; C06 §3.D layer rule preserved.
    window.addEventListener('pryzm-bus-rooms-redetect', (e) => {
        const cmd = (e as CustomEvent<{ levelId: string; elevation: number; height: number }>).detail ?? {};
        if (!cmd.levelId) return;
        try {
            commandManager.execute(
                new ReDetectRoomsCommand(cmd.levelId, cmd.elevation ?? 0, cmd.height ?? 3),
            );
        } catch (err) {
            console.error('[EngineBootstrap] pryzm-bus-rooms-redetect: commandManager.execute failed:', err);
        }
    });

    // ── Camera fit on project load (Contract 20 §6/§7.3) ─────────────────────
    window.runtime?.events?.on('pryzm-project-loaded', (payload: unknown) => { // F.events.9
        const p = payload as { empty?: boolean } | undefined;
        if (p?.empty) {
            console.log('[EngineBootstrap] pryzm-project-loaded(empty) — skipping zoomToAll');
            return;
        }
        setTimeout(() => { zoomToAll(true).catch(() => {}); }, 150);
    });

    // ── C13 §4: Level camera tracking + project lifecycle ─────────────────────
    // _levelCamReady guards (a) snapshot replay and (b) plan/section view modes.
    let _levelCamReady = false;
    const _lifecycle = new ProjectLifecycleController(
        batchCoordinator,
        () => { _levelCamReady = false; }, // step-5 callback
        // §U-B1 (DAILY-USE-AUDIT 2026-05-20) — clear undo stacks on project switch
        // so Project B never sees Project A's Ctrl+Z entries.
        () => {
            const r = window.runtime as { bus?: { clearUndoStacks?: () => void } } | undefined;
            r?.bus?.clearUndoStacks?.();
        },
    );
    _lifecycle.bind();
    window.runtime?.events?.on('pryzm-project-loaded', () => { _levelCamReady = true; }); // F.events.9

    window.addEventListener('activeLevelChanged', (e) => {
        if (!_levelCamReady) return;
        if (viewController.viewMode !== '3D') return;
        if (window._ifcLevelImportInProgress) return;
        const detail = (e as CustomEvent).detail ?? {};
        const levelId: string = detail.levelId;
        if (!levelId) return;
        const level = bimManager.getLevelById(levelId);
        if (!level) return;
        const newElevation = level.elevation;
        const controls = world.camera.controls;
        const currentTarget = new THREE.Vector3();
        controls.getTarget(currentTarget);
        const deltaY = newElevation - currentTarget.y;
        if (Math.abs(deltaY) < 0.01) return;
        const camPos = world.camera.three.position;
        controls.setLookAt(
            camPos.x, camPos.y + deltaY, camPos.z,
            currentTarget.x, newElevation, currentTarget.z,
            true,
        ).catch(() => {});
        console.log(
            `[EngineBootstrap] Level switch → "${level.name}" ` +
            `(target.Y: ${currentTarget.y.toFixed(2)} → ${newElevation.toFixed(2)})`,
        );
    });

    // ── Wave 5 Day 10: DEV-only window shim ───────────────────────────────────
    if (import.meta.env.DEV) {
        const { exposeDevHelpers, exposeDevCommands } = await import('./window-shim');
        exposeDevHelpers({});
        exposeDevCommands({});
    }
}
