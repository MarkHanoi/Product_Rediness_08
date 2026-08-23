// engineLauncher.ts — BIM engine orchestration entry point (Task 5.2 refactor).
// Spec: docs/archive/pryzm3-internal/04-PLAN-FORWARD/46-IMPLEMENTATION-PLAN-2026-05-08.md §5.2
import { enablePatches } from 'immer';
import { flushRuntimeEventListeners } from './runtimeEventBridge';
import { reactToScheduleSelection } from './scheduleClickZoom';
enablePatches();

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import * as OBCF from '@thatopen/components-front';
import * as BUI from '@thatopen/ui';
import { RGBELoader } from '@pryzm/renderer-three';
import { STANDARD_MATERIAL_LIBRARY, VisualStyle } from '@pryzm/core-app-model/material-library';
import { sceneQualityTierManager } from '@pryzm/core-app-model/rendering';
// §PRYZM-PERF (INSTR1) — one console entry point for batch/gesture perf evidence:
//   pryzmPerf.on() → gesture → pryzmPerf.report()
import { setPryzmPerfSources, installPryzmPerfConsole } from './pryzmPerfConsole';
import { undoManager } from '@pryzm/command-registry';
import { PropertyPanelAdapter } from '@app/ui/property-panel/PropertyPanelAdapter';
import { openDimensionPropertiesOnSelect } from '@app/ui/property-panel/dimensionSelectionPanel';
import { openTagPropertiesOnSelect } from '@app/ui/property-panel/tagSelectionPanel';
import { ViewPropertiesPanel } from '@app/ui/ViewPropertiesPanel';
import { workspaceController } from '@app/ui/WorkspaceController';
import { SceneTheme } from '@pryzm/core-app-model';
import { ceilingSystemTypeStore } from '@pryzm/core-app-model/stores';
import { floorSystemTypeStore } from '@pryzm/core-app-model/stores';
import { SlabWallConnectivityService } from '@pryzm/geometry-slab';
// §L-925-NO-FATAL — the SAME chat sink `wallPlacementGate` routes §C83-S1-MOVE
// and §L-921-ATOMIC-GESTURE refusals to. Reused, never duplicated.
import { chatSay } from '@app/ui/ai/chatPromptHost';
import { doorStore } from '@pryzm/geometry-door';
import { windowStore } from '@pryzm/geometry-window';
import { spatialAuthority } from '@pryzm/core-app-model';
import { registerAllStores } from './initStores';
// §MT-05 / ADR-0318 I-1 — the single authoritative store hand-off. See the
// module header: one record, two derived bundles, same references by construction.
import { toRegistryBundle, toSerializerBundle } from './authoritativeStores';
import type { AuthoritativeStores } from './authoritativeStores';
import { ScheduleRegistry } from '@pryzm/core-app-model';
import { SchedulePanel } from '@app/ui/SchedulePanel/SchedulePanel';
import { DataWorkbench } from '@app/ui/dataworkbench/DataWorkbench';
import { UpdateElementMarkCommand, CreatePlanViewCommand, ReDetectRoomsCommand, CopyElementCommand } from '@pryzm/command-registry';
import { annotationStore } from '@pryzm/plugin-annotations';
import { WallInstanceBridge, WallMoveReweldService } from '@pryzm/geometry-wall';
// §MOVE-REWELD-DISPATCH (L-871/L-872) — cascade command class + the cross-service
// latch, injected into WallMoveReweldService (factory pattern: geometry-wall must
// not import command-registry at module load, §SCC).
import { CascadeWallBaselineCommand, isCascadeWallBaselineApplying } from '@pryzm/command-registry';
import { semanticGraphManager } from '@pryzm/core-app-model';
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
// §MULTI-SELECT-SHIFT (L-1553) — id -> element kind, for the multi-selection census.
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { viewIntentInstanceStore } from '@pryzm/core-app-model';
// §L-391-R-B — the session JWT the sync server verifies on the WS upgrade.
import { getStoredToken } from '@pryzm/core-app-model';
import '../ui/inspect/AuditStack';
// §ANALYSIS-SURFACE (ADR-0343 · L-3010) — the F4 mode's right-hand half. Mounted
// exactly as AuditStack is: a module-load singleton that self-appends to
// document.body and shows itself on `pryzm-workspace-mode` === 'analysis'.
// Side-effect import, because nothing else needs to hold a reference to it.
import '../ui/analysis/AnalysisSurface';
import '../ui/data/DataCommandCenter';
// §IFC-TREE-ATTACH (L-8370..L-8376) — the "PRYZM tree / IFC tree" toggle in the
// Inspect header, plus the IFC primitive tree it switches to. Side-effect
// import for the same reason AuditStack's is: it self-attaches and nothing
// needs to hold a reference. It edits NO existing file — it appends into the
// Inspect header's existing `.aud-header-actions` slot at runtime, so it cannot
// collide with the lane restructuring `ui/inspect/**`, and it degrades to one
// warning if those selectors ever stop matching.
import '../ui/ifc-tree/IfcTreeAttachment';
import { registerWallPerfBench } from './WallPerfBench';
import { registerWallHandlers } from '@pryzm/plugin-wall';
import { registerRoomHandlers } from '@pryzm/plugin-rooms';
import { registerSlabHandlers } from '@pryzm/plugin-slab';
// §FEAT-SWIMMING-POOL-ELEMENT (L-292 / ADR-0124) — the pool ASSEMBLY commands.
import { registerPoolHandlers } from '@pryzm/plugin-pool';
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
import { registerSelectionHandlers, type SelectionPastePort } from '@pryzm/plugin-selection';
// GE-06 — the twelve declared `clash-*` verbs. `clash-run` now DETECTS for the
// roof×wall pair (§GE-06-ROOF-WALL-WIRE); the other eleven still REFUSE rather
// than dispatch into nothing. One pair of six is checked, and it says so.
import { registerClashRefusalHandlers, registerClashRun } from '@pryzm/command-bus';
import { createRoofWallClashRunner } from '@pryzm/geometry-roof';

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
import { YjsDocAdapter, CRDTConflictResolver, connectCrdtProvider, DeferredCrdtApplier } from '@pryzm/sync-client';
import { initRemoteElementSync, shouldReplicate } from './initRemoteElementSync';
import type { CollabProviderConfig } from '@pryzm/sync-client';
// L-391 Phase 0 — the real transport lives behind a subpath so the base barrel
// stays free of the y-websocket dependency (opt-in import).
import { createWebsocketProvider } from '@pryzm/sync-client/websocket-provider';
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

    // ── §PRYZM-PERF (INSTR1) — install `window.pryzmPerf` ────────────────────
    // Installed EARLY and unconditionally, for two reasons that are really one:
    // the founder tests in PRODUCTION on real hardware (localhost dev starves the
    // Node event loop and cannot reproduce the freeze), and the gesture under
    // investigation is a BATCH that has, at least once, ended with a dead socket.
    // An instrument installed late, or behind a dev gate, would be missing in
    // exactly the sessions it exists to explain.
    //
    // Cost of it EXISTING: one object on `window`. Cost of it RUNNING: zero —
    // accumulation is off until `pryzmPerf.on()`, and every instrumented call site
    // pays one typed-global read while disarmed.
    //
    // The tier is injected here because `sceneQualityTierManager` is a module
    // singleton on NO global; without this, the only way to read the tier from a
    // console is to scrape a throttled `[SceneQualityTier] … tier=…` log line.
    try {
        setPryzmPerfSources({
            getQualityTier: () => sceneQualityTierManager.currentTier ?? null,
        });
        installPryzmPerfConsole();
    } catch (e) {
        console.warn('[engineLauncher] §PRYZM-PERF install failed (non-fatal):', e);
    }

    // ── W5-4 — close the pre-adapter CRDT drop window (do this FIRST) ─────────
    // The O.8 deferral below constructs the YjsDocAdapter behind
    // `requestIdleCallback(..., { timeout: 4000 })` and only THEN calls
    // `setCrdtApplier`. Until that slot fires `CommandBus._crdtApplier` is null,
    // so step 7 of `executeCommand` is skipped and EVERY command in the first
    // ~1.5–4 s — project open, hydration, an immediately-started generate —
    // never reaches the Y.Doc. No log, no counter, no refusal: the command
    // returns its record and the caller is told the mutation succeeded. That is
    // the same defect class as the `if (!elementId) return` drop W5-3 removed,
    // one layer up.
    //
    // The deferral is KEPT (constructing a Y.Doc on the first-paint path is real
    // main-thread cost, and this repo has a documented white-screen history
    // around boot-ordering changes — see §SCC-no-barrel-access-at-module-load).
    // It is made NON-LOSSY instead: install a queueing applier synchronously
    // here — a bare function-pointer assignment, no Y.Doc, no new module load,
    // no ordering change — and hand the queue to the real adapter on attach.
    //
    // Installed at the TOP of bootstrap, not next to the deferral block ~600
    // lines below, so the window it closes is the whole of boot rather than
    // whatever remains after the rest of bootstrap has already run.
    const _deferredCrdtApplier = new DeferredCrdtApplier();
    if (runtime && typeof runtime.bus.setCrdtApplier === 'function') {
        runtime.bus.setCrdtApplier((type, payload) => {
            // Echo break — a dispatch produced BY the remote read-back path must
            // not be written back into the document, or two peers ping-pong the
            // same value forever. See initRemoteElementSync.ts.
            if (!shouldReplicate(payload)) return;
            _deferredCrdtApplier.apply(type, payload);
        });
    } else {
        console.warn(
            '[EngineBootstrap] W5-4: runtime.bus.setCrdtApplier unavailable — commands ' +
            'issued during boot will NOT reach the CRDT document. Stated, not silent.',
        );
    }

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
    // §VIEW-INTENT-ASSIGN-DISPATCH-IS-DEAD (L-1860) — the runtime argument was
    // MISSING here, so `this.runtime` was null and every
    // `this.runtime?.bus?.executeCommand('vg.assignIntent', …)` in the panel
    // evaluated to `undefined`. Picking a different visibility intent dispatched
    // NOTHING and the dropdown snapped back to the previous value — the founder's
    // "I am trying to select another view intent and it doesn't allow me".
    //
    // Same shape as §SHEET-MOVE-DISPATCH-IS-DEAD (L-1633), and the panel
    // constructed immediately ABOVE this one already carries the identical
    // `runtime ?? null` fix with an "R4 fix: inject runtime" note. One neighbour
    // was repaired and this one was not, which is exactly how an optional-chain
    // dispatch site stays dead: `?.` turns a wiring defect into silence.
    }, runtime ?? null);
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
        // §MULTI-SELECT-SHIFT (L-1550) — this wrapper IS the deselect intent (Escape,
        // tool teardown, post-delete). `selectionManager.unselectAll()` drops the
        // primary and the secondary highlights but not the BUS SET, which is what
        // PlanViewCanvas / AIPanel / ContextualEditBar read. Leaving it populated made
        // Escape look like it worked in 3-D while every other surface still believed
        // N elements were selected.
        if (!selectionBus.isDispatching && selectionBus.currentIds.length > 0) {
            selectionBus.clearAll('3d-canvas');
        }
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
        furnitureStore, lightingStore, handrailStore, beamStore,
        stairStore, stairTypeStore, stairLandingStore, stairRailingStore,
        liftStore, liftTypeStore, liftMeshBuilder, liftCompoundMeshBuilder,
        gridStore, wallSystemTypeStore, slabSystemTypeStore,
        slabBuilder, plumbingBuilder, doorBuilder, windowBuilder,
        furnitureBuilder, stairMeshBuilder,
        // §FIX-BUILDER-ISOLATION-LEAK (L-320) — thread the floor/handrail/stair-railing
        // builders so initTools can dispose them on project switch (bim-project-cleared).
        floorBuilder, handrailBuilder, stairRailingBuilder,
        // L-7202 (lane LEVEL36) — the two per-kind rebuild entry points that let
        // columns and roofs FOLLOW a level-elevation change. Threaded into
        // initWallLevelSubscribers below; see its header for the coverage table.
        columnBuilder, roofBuilder,
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
        liftStore, liftTypeStore, liftMeshBuilder, liftCompoundMeshBuilder,
        gridStore, curtainWallStoreInstance, curtainPanelStoreInstance,
        roofStore, plumbingStore, furnitureStore, handrailStore, openingStore,
        wallSystemTypeStore, slabSystemTypeStore, ceilingStore, floorStore, roomStore,
        slabBuilder, plumbingBuilder, furnitureBuilder, stairMeshBuilder,
        floorBuilder, handrailBuilder, stairRailingBuilder,
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

    // ── §MULTI-SELECT-SHIFT (L-1553) — the property panel must be HONEST at N > 1 ──
    //
    // `updateInspector` renders ONE element's editable fields. With a SHIFT+click
    // multi-selection it would be handed the PRIMARY and would render its fields
    // with nothing on screen saying the other N-1 elements were also selected — so
    // a typed edit would land on one element while the author believed it applied
    // to the set. `showMultiSelection` refuses to show fields it cannot honour and
    // states the count and the kind census instead.
    //
    // Subscribed on the BUS rather than on `bim-selection-changed`, because the
    // count is a property of the SET and `bim-selection-changed` carries a single
    // object — the event cannot answer "how many".
    selectionBus.subscribe((ev) => {
        if (ev.type !== 'select' && ev.type !== 'clear') return;
        const ids = selectionBus.currentIds;
        if (ids.length > 1) {
            const kinds = ids.map((id) => elementRegistry.getStoreType(id) ?? 'element');
            inspector.showMultiSelection(ids, kinds);
        }
        // N <= 1 is left alone: the single-select path (updateInspector) and the
        // deselect path (unselectAll → inspector.update(null)) already own it, and
        // re-rendering here would fight them for the panel on every click.
    });

    // F.events.4 — Route cross-panel element selection through typed runtime.events bus.
    // Replaces the window.addEventListener('pryzm-element-selected') removed from SelectionManager.init().
    //
    // §SCHEDULE-CLICK-ZOOM — when the selection originates from a schedule row
    // click (source: 'schedule'), one user action should both SELECT and ZOOM:
    // after selectById() succeeds we dispatch the existing `zoom-selected`
    // command (registered below at §C-B1), which frames whatever is currently
    // selected.  This is the single chokepoint for EVERY schedule (rooms,
    // doors, windows, walls, slabs, columns, …) and every element type, so the
    // zoom generalises automatically — the schedule UI itself is unchanged.
    //
    // Edge cases handled gracefully:
    //   • element on a non-active level / not yet in the scene → selectById
    //     returns false → we do NOT dispatch zoom (no fit-all flash, no throw);
    //   • element with no geometry → the zoom-selected handler boxes the object
    //     and falls back to zoomToAll on an empty box (never throws);
    //   • non-schedule sources (living-graph, inspect, 3d) keep prior behaviour.
    if (runtime) {
        runtime.events.on('pryzm-element-selected', (detail) => {
            reactToScheduleSelection(detail, selectionManager, runtime.bus);
        });

        // §FIX-DIM-SELECT-PROPERTIES-PANEL (L-173) — a dimension is a first-class
        // SELECTABLE element: selecting one surfaces its Properties Panel exactly
        // like a wall. This is the SINGLE, event-bus-driven authority for that —
        // it mirrors how a wall selection reaches inspector.showElement (see
        // updateInspector above), rather than a per-view direct poke. A UI-drawn
        // linear dimension is an AnnotationElement in the documentation layer
        // (ADR-0119 subsystem annotationStore, Revit parity) — "like a wall" means
        // the SAME panel surface + selectability, NOT promotion to model geometry.
        // The panel's own edits stay P6 commands (annotation.update / setColor /
        // setTextHeight / delete). Fires for BOTH the plan-view pick and the
        // drag-commit re-select (PlanViewInteraction emits with an annotationId);
        // a wall/other id resolves to no annotation and is skipped, so normal BIM
        // selection is untouched.
        runtime.events.on('pryzm-element-selected', (detail) => {
            openDimensionPropertiesOnSelect(detail, {
                getAnnotationById: (id) => annotationStore.getById(id),
                getSelectedElementId: () => window.projectContext?.selectedElementId,
                panel: inspector,
            });
            // §FEAT-TAG-PAPER-SCALE-AND-SELECTABILITY (L-291) — the TAG leg of the same
            // selection→panel seam. A tag is a first-class selectable element: selecting one
            // opens its Properties Panel, rendered FROM ITS RECORD, exactly as a door does.
            // Skips anything that is not a mark-bearing tag, so the dimension path and normal
            // BIM selection are untouched.
            openTagPropertiesOnSelect(detail, {
                getAnnotationById: (id) => annotationStore.getById(id),
                panel: inspector,
            });
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
    // room.redetect uses the CustomEvent bridge (RedetectRoomsHandler → listener below).
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
        try {
            // §FIX-WALL-TYPE-UNIFY-CATALOGUE (L-50, ADR-0116) — the wall handlers'
            // system-type catalogue is now seeded ONCE at the composition root
            // (composeRuntime → PluginRegistry wall descriptor buildAuxiliaries),
            // pointing at the SAME geometry-wall singleton the type picker + plan
            // handler + 3D stamping read (window.wallSystemTypeStore). composeRuntime
            // registers the authoritative CreateWallHandler FIRST, so this call is a
            // §OI-053 idempotent no-op (skipped-if-present) kept only for parity with
            // its sibling registerXxxHandlers(_bus) calls and project-re-open safety.
            // The former §WALL-TYPE-WIRE adapter here was DEAD (its registration was
            // always skipped as a duplicate) — the divergent plugin-side catalogue it
            // tried to override is gone; there is now ONE catalogue.
            registerWallHandlers(_bus);
            console.log('[EngineBootstrap] F-1.3: wall handlers registered (catalogue seeded at composition root — §FIX-WALL-TYPE-UNIFY-CATALOGUE).');
        }
        catch (e: any) { console.error('[EngineBootstrap] F-1.3: registerWallHandlers failed (non-fatal):', e?.message ?? e); }
        try { registerRoomHandlers(_bus); console.log('[EngineBootstrap] F-1.3: room handlers registered.'); }
        catch (e: any) { console.error('[EngineBootstrap] F-1.3: registerRoomHandlers failed (non-fatal):', e?.message ?? e); }
        try { registerSlabHandlers(_bus); console.log('[EngineBootstrap] F-1.3: slab handlers registered.'); }
        catch (e: any) { console.error('[EngineBootstrap] F-1.3: registerSlabHandlers failed (non-fatal):', e?.message ?? e); }
        // §FEAT-SWIMMING-POOL-ELEMENT (L-292, ADR-0124) — pool.create / pool.delete. A pool is an
        // ASSEMBLY: ONE dispatch writes the pool + N walls + the floor slab + the water AND cuts the
        // hole in the host slab, in ONE undo entry (C16 §8.6 B-6). Registered AFTER slab because the
        // pool's canExecute reads the host slab from ctx.stores.slab.
        try { registerPoolHandlers(_bus); console.log('[EngineBootstrap] F-1.3: pool handlers registered.'); }
        catch (e: any) { console.error('[EngineBootstrap] F-1.3: registerPoolHandlers failed (non-fatal):', e?.message ?? e); }
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
        // §FIX-COPY-PASTE (V1-LAUNCH-READINESS-AUDIT L-84, supersedes the TASK-08 Option-A
        // stubs): register REAL copy/paste. `copy-selection` snapshots the canonical
        // SelectionStore into the plugin clipboard; `paste-clipboard` re-creates each copied
        // element with a NEW id + small offset on the SAME level, via the port below. The
        // port routes re-creation through the registered CopyElementCommand so paste is
        // undoable (P6) and reuses the proven wall/furniture clone pipeline — this file must
        // not touch the wall/geometry packages. Phase-1 copyable kinds: wall + furniture.
        const copyPastePort: SelectionPastePort = {
            canCopy: (kind: string) => kind === 'wall' || kind === 'furniture',
            paste: (entry, { newId, offset }) => {
                const elementType = entry.kind === 'furniture' ? 'furniture' : 'wall';
                try {
                    const res = commandManager.execute(
                        new CopyElementCommand({ sourceId: entry.sourceId, newId, offset, elementType }),
                    );
                    if (!res?.success) {
                        console.warn('[§FIX-COPY-PASTE] paste failed for', entry.sourceId, res?.info);
                        return null;
                    }
                    return { newId };
                } catch (err) {
                    console.error('[§FIX-COPY-PASTE] CopyElementCommand threw (non-fatal):', err);
                    return null;
                }
            },
        };
        try { registerSelectionHandlers(_bus, { pastePort: copyPastePort }); console.log('[EngineBootstrap] §FIX-COPY-PASTE: selection handlers (copy/paste) registered.'); }
        catch (e: any) { console.error('[EngineBootstrap] §FIX-COPY-PASTE: registerSelectionHandlers failed (non-fatal):', e?.message ?? e); }

        // ── GE-06 — the twelve `clash-*` verbs REFUSE instead of dispatching
        // into nothing. Same defect as §C-B1 below, one step worse: those verbs
        // had no handler but DO have an implementation to write; these have no
        // implementation at all. There is no clash engine in this build.
        //
        // Registering a refusing handler is deliberately NOT a stub — nothing
        // here returns "no clashes found", because a clean report from an
        // engine that inspected nothing is the lie being removed (ADR-0322 §5).
        // Each verb answers with a typed CapabilityRefusal naming itself and
        // the element pairs nothing looked at, on the `HandlerResult.refusal`
        // channel, so a caller reads a value instead of a thrown "no handler
        // registered for: clash-run" that says nothing about clash detection.
        //
        // Defers to any real detector: an id already registered is skipped, so
        // the lane that lands one simply wins. **GE-06 stays OPEN.**
        //
        // §GE-06-ROOF-WALL-WIRE — `clash-run` is the exception, as of this lane.
        // `packages/geometry-roof/src/pure/roofWallClash.ts` has been a real,
        // oracle-tested roof-vs-walls-beneath detector since `83c82c02`, and its
        // ONLY consumer was the level-reconcile announcer (line ~791): no verb a
        // user could invoke reached it. THIS is the registration that changes
        // that, and it must run BEFORE the refusal pass so `clash-run` is taken.
        //
        // The `checkedPairs` value threaded into the refusal pass is not
        // decoration: without it the other eleven verbs keep telling the user
        // "this build has no clash engine", which is now false in the opposite
        // direction. One pair of six is checked, and every refusal says which.
        let checkedClashPairs: readonly string[] = [];
        try {
            checkedClashPairs = registerClashRun(_bus, createRoofWallClashRunner({
                levelIds:       () => (bimManager?.getLevels?.() ?? []).map((l: any) => l?.id).filter((id: any): id is string => typeof id === 'string'),
                roofsOnLevel:   (levelId) => roofStore?.getByLevel?.(levelId) ?? [],
                wallsOnLevel:   (levelId) => wallStore?.getByLevel?.(levelId) ?? [],
                // `undefined` on purpose when the level is unknown — the runner
                // REFUSES on an unreadable elevation rather than measuring the
                // roof against a fabricated 0, which would read false-CLEAN.
                levelElevation: (levelId) => bimManager?.getLevelById?.(levelId)?.elevation,
            }));
            console.log(`[EngineBootstrap] GE-06: clash-run DETECTS for ${checkedClashPairs.join(', ')} — the remaining pairs are unchecked and every refusal names them.`);
        }
        catch (e: any) {
            // A failed detector registration must NOT leave clash-run silently
            // absent: fall through with an empty checked list so the refusal
            // pass below claims the id and the verb still answers honestly.
            checkedClashPairs = [];
            console.error('[EngineBootstrap] GE-06: registerClashRun failed (non-fatal) — clash-run falls back to REFUSING:', e?.message ?? e);
        }
        try {
            const refusing = registerClashRefusalHandlers(_bus, checkedClashPairs);
            console.log(`[EngineBootstrap] GE-06: ${refusing.length} clash verb(s) registered as REFUSING (checked pairs: ${checkedClashPairs.length === 0 ? 'none' : checkedClashPairs.join(', ')}).`);
        }
        catch (e: any) { console.error('[EngineBootstrap] GE-06: registerClashRefusalHandlers failed (non-fatal):', e?.message ?? e); }

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

    // PR-10: roofStore + bimManager feed the roof→walls-beneath clash check
    // inside the level-rebuild callback (see roofWallClashAnnouncer.ts).
    // L-7202: columnStore/columnBuilder/roofBuilder un-strand Column and Roof on
    // a level-elevation change (ADR-0345). Both builders re-derive worldY from
    // `level.elevation`, so re-invoking them IS the follow — no store write.
    initWallLevelSubscribers({
        wallTool, slabStore, spatialAuthority, roofStore, bimManager,
        columnStore: columnStoreInstance, columnBuilder, roofBuilder,
    });

    // ── §03: Slab-wall connectivity ───────────────────────────────────────────
    const slabWallConnectivityService = new SlabWallConnectivityService(
        slabStore,
        wallTool.getWallStore(),
        () => wallRebuildCoordinator.isJoinsResolving,
        commandManager,
        // §L-925-NO-FATAL (ISSUE-LOG L-925) — where a refused slab-loop weld goes
        // to REACH A PERSON.
        //
        // The service raises a typed refusal instead of letting a store-level
        // policy throw (§WALL-DEEP-2026 B2 and its siblings) escape from inside a
        // store subscriber. It cannot surface the refusal itself: `geometry-slab`
        // sits far below `@app/ui`, and a package that reached up for a DOM sink
        // would be the layer breach, not the fix. So the sink is injected here,
        // at the composition root, which is the only place that legitimately
        // knows both halves.
        //
        // ⚠ THE CHANNEL IS DELIBERATELY THE ONE THAT ALREADY EXISTS.
        // `wallPlacementGate` routes §C83-S1-MOVE and §L-921-ATOMIC-GESTURE
        // refusals to `chatSay`, and it does so because the founder asked for it
        // in those words: *"I WANT THE MESSAGE ONLY ON THE AI CHAT"*
        // (§L-921-ONE-CHANNEL). A wall move refused by the slab weld is the same
        // gesture, refused one subscriber later — giving it a card, a toast or a
        // console line of its own would be the fifth surface C83 §4.1 names as
        // the failure mode. One gesture, one channel.
        (refusal) => {
            chatSay(refusal.sentence);
        },
    );
    slabWallConnectivityService.bootstrap();

    // ── §MOVE-REWELD-DISPATCH (L-871/L-872): junction re-weld on wall move ────
    // The slab service above welds only slab-loop CORNER neighbours. This
    // service welds the moved wall's `joinedTo` partners — including interior
    // walls abutting MID-SPAN (T junctions), which no slab loop ever carries —
    // so a perimeter move no longer detaches the partition and kills the room
    // (founder repro 2026-08-14). Constructed AFTER the slab service so its
    // subscriber runs second: corner welds land first, and already-seated
    // partners fall below computeMoveReweld's displacement floor (no re-write).
    const wallMoveReweldService = new WallMoveReweldService(wallTool.getWallStore(), {
        commandManagerRef: { current: commandManager },
        makeCascadeCommand: (input) => new CascadeWallBaselineCommand(input),
        getJoinedWalls: (wallId) => semanticGraphManager.getJoinedWalls(wallId),
        isJoinResolving: () => wallRebuildCoordinator.isJoinsResolving,
        isCascadeApplying: isCascadeWallBaselineApplying,
        // §L-936-SINK-UNWIRED — L-921 built this sink and NOTHING EVER PASSED IT.
        //
        // `WallMoveReweldService.report()` is `this.deps.onConsequence?.(r)`, so an
        // absent sink is a silent no-op, and this — the ONLY production
        // composition of the service — omitted the field. Measured 2026-08-17
        // (`L936InteriorLPairMove.measure.test.ts`): moving an interior wall whose
        // L-partner cannot be followed computes
        // `INCUMBENT_EXTENSION_REQUIRED: i-a: the new corner falls 600 mm past
        // that wall's end …` — both numbers, the right sentence — and delivered it
        // nowhere. That is L-921's finding ("a refusal computed and a refusal
        // delivered printed as the same outcome") reproduced by the wiring of
        // L-921's own fix: authored, and unreachable.
        //
        // Same channel as the slab service above, for the same founder sentence
        // (§L-921-ONE-CHANNEL, *"I WANT THE MESSAGE ONLY ON THE AI CHAT"*): a
        // junction this move cannot repair is the same gesture refused one
        // subscriber later, and a card or toast of its own would be the fifth
        // surface C83 §4.1 names as the failure mode.
        onConsequence: (report) => {
            const sentences = report.detail.length > 0
                ? report.detail
                : [`${report.reason} — junction(s) left unrepaired: ${report.partnerIds.join(', ')}`];
            for (const sentence of sentences) chatSay(sentence);
        },
    });
    void wallMoveReweldService; // owned by the engine lifetime; disposed with it

    // ── §3.2 + §MT-05: ONE hand-off, TWO consumers ────────────────────────────
    // ADR-0318 I-1 says the instance the StoreRegistry holds IS the instance the
    // ProjectSerializer reads. That used to be a CONVENTION between two separate
    // object literals ~70 lines apart — and for column / curtain-wall the two
    // literals did not even use the same expression (the serializer half read
    // `window.columnStore ?? columnStoreInstance`), which is the residual risk
    // ADR-0318 named and register row MT-05 tracked.
    //
    // Now there is ONE record. `toRegistryBundle` and `toSerializerBundle` both
    // derive from it by property read, so for every kind both consumers receive,
    // they receive the SAME REFERENCE — by construction, not by guard. Asserted
    // on the heap (`toBe`, over the real registry and the real serializer) by
    // apps/editor/src/engine/__tests__/mt05StoreIdentityHeap.spec.ts.
    const authoritativeStores: AuthoritativeStores = {
        // ── shared: both the registry and the serializer receive these ────────
        wallStore:              wallTool.getWallStore(),
        slabStore,
        columnStore:            columnStoreInstance,
        gridStore,
        stairStore,
        beamStore,
        curtainWallStore:       curtainWallStoreInstance,
        roofStore,
        plumbingStore,
        furnitureStore,
        handrailStore,
        openingStore,
        roomStore,
        ceilingStore,
        floorStore,
        // ── serializer-only: the four system-type stores ──────────────────────
        slabSystemTypeStore,    wallSystemTypeStore,
        ceilingSystemTypeStore, floorSystemTypeStore,
        // ── registry-only kinds ───────────────────────────────────────────────
        stairLandingStore,      stairRailingStore,   stairTypeStore,
        liftStore,              liftTypeStore,
        curtainPanelStore:      curtainPanelStoreInstance,
        doorStore,              windowStore,
        lightingStore,
        annotationStore,
    };
    registerAllStores(toRegistryBundle(authoritativeStores));

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

    // ── §MT-05 same-instance guard ────────────────────────────────────────────
    // NOTE (2026-08-16): the SERIALIZER half of MT-05 is now closed by
    // construction — initPersistence below receives `toSerializerBundle(
    // authoritativeStores)`, which reads `columnStoreInstance` /
    // `curtainWallStoreInstance` directly and no longer touches these globals.
    // This guard is therefore no longer protecting persistence; it protects the
    // ~40 REMAINING legacy readers (PropertyInspector, SpatialTree, the plan
    // tools, ScheduleExtractor, ExportIFC, AIReadModel …) that still resolve
    // their store through `window.columnStore` / `window.curtainWallStore`.
    // If a writer publishes a different instance, those readers and the
    // registry/serializer disagree — the UI edits one store and the project
    // saves another. Bootstrap has three window-store writers (initBuilders →
    // initTools → initUI); today every writer provably republishes the same
    // instance, but nothing upstream enforces it.
    // Fail loudly instead (precedent: CurtainWallTool
    // §CURTAIN-WALL-AUDIT-2026 §5.1 throws rather than construct a parallel
    // store). An UNSET global is tolerated — the legacy readers all null-guard;
    // only a set-and-DIFFERENT global is divergence. Pinned in CI by
    // apps/editor/src/engine/__tests__/mt05WindowStoreSameInstance.spec.ts.
    if (window.columnStore !== undefined && window.columnStore !== columnStoreInstance) {
        throw new Error('[EngineBootstrap] §MT-05: window.columnStore diverged from the launcher columnStoreInstance — a writer published a different instance.');
    }
    if (window.curtainWallStore !== undefined && window.curtainWallStore !== curtainWallStoreInstance) {
        throw new Error('[EngineBootstrap] §MT-05: window.curtainWallStore diverged from the launcher curtainWallStoreInstance — a writer published a different instance.');
    }

    // ── Persistence + collaboration ───────────────────────────────────────────
    initPersistence({
        world, bimManager, toolManager, unselectAll,
        // §MT-05 — derived from the SAME `authoritativeStores` record that fed
        // registerAllStores above. The two `window.*Store ?? *Instance` reads
        // that used to sit here are DELETED: there is no longer an expression
        // whose value could differ from the one the registry holds.
        stores: toSerializerBundle(authoritativeStores),
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

        // §PRYZM-PERF (INSTR1) — the founder's 367-element batch ended with
        // `status=disconnected`, so "did the socket survive the gesture?" is a
        // headline row of the report. This adapter is the ONLY live source of that
        // answer and it reaches no global (it is a local const, right above).
        //
        // ⚠ The obvious-looking alternative is a TRAP: `runtime.sync.status` is a
        // FROZEN literal `'disconnected'`, set once by `composeRuntime.buildSyncSlot()`
        // and never updated by the client. Reading it would report the socket as dead
        // in every report, healthy ones included — manufacturing the exact symptom
        // under investigation and "confirming" it every single run.
        setPryzmPerfSources({
            getSocketStatus: () => {
                try { return _yjsDocAdapter.getStatus(); } catch { return null; }
            },
        });
        // L-375a — wire the CRDT applier through the composition root's typed
        // public bus surface (`runtime.bus.setCrdtApplier`), which forwards to
        // the underlying CommandBus instance owned by composeRuntime (P1).
        //
        // The previous code reached `(runtime as any).inner.bus` — a P4 violation
        // that ALSO never worked: the composed runtime handle has no `inner`
        // field (`inner` is a compose-local const), so the read was always
        // `undefined`, the warn below fired every boot, and `setCrdtApplier` was
        // never called → CommandBus._crdtApplier stayed null → real-time
        // replication (C08 §3.1 / G3-T2) was silently off for multi-user edits.
        // Solo editing was unaffected then and remains unaffected now (the
        // applier is null-safe; this only ADDS the remote-replication leg).
        //
        // W5-4 — the applier itself was already installed synchronously at the top
        // of bootstrap as a QUEUEING applier, so nothing dispatched during boot was
        // lost. Here we simply hand it the real adapter; `attach()` replays the
        // queue in dispatch order (a create before the update that edits it) and
        // then passes everything straight through.
        _deferredCrdtApplier.attach(
            (type: string, payload: Record<string, unknown>) =>
                _yjsDocAdapter.applyCommand(type, payload),
        );
        {
            const s = _deferredCrdtApplier.stats;
            console.log(
                `[EngineBootstrap] G3-T2/W5-4: CRDT applier attached → YjsDocAdapter ` +
                `(replayed ${s.replayed} boot-window command(s), dropped ${s.dropped})`,
            );
            if (_deferredCrdtApplier.hasLostCommands) {
                // A loss must never be reportable-only-before-attach.
                console.warn(
                    `[EngineBootstrap] W5-4: ${s.dropped} boot-window command(s) exceeded the ` +
                    `CRDT pre-adapter queue and did NOT reach the document. This is a real ` +
                    `replication gap for those commands, not a throttle.`,
                );
            }
        }

        // ── W5-4 "LEG B" — the READ-BACK path ────────────────────────────────
        // Until now this adapter was WRITE-ONLY: 25 verbs reached the Y.Doc and
        // nothing ever read the canonical element map back, so a receiving client
        // kept every property's creation-time value — confidently, not emptily.
        // `initRemoteElementSync` observes ELEMENTS_NAMESPACE and re-dispatches
        // remote property changes through the bus (P6), which is what actually
        // updates the store and repaints. See that file for the two echo breaks
        // and for what it does NOT apply (remote creates).
        //
        // C66 §1 — this does NOT make collaboration work. Leg (c) is still
        // absent: no CRDT transport is deployed (L-391, the provider block below
        // defaults OFF), so nothing carries a peer's update into this document.
        try {
            const _remoteElementSync = initRemoteElementSync(
                _yjsDocAdapter,
                () => window.runtime?.bus as { executeCommand?: (t: string, p: unknown) => Promise<unknown> } | undefined,
            );
            (window as unknown as { __pryzmRemoteElementSync?: unknown })
                .__pryzmRemoteElementSync = _remoteElementSync;
            console.log(
                '[EngineBootstrap] W5-4 LEG B: CRDT element read-back observing ' +
                'ELEMENTS_NAMESPACE — remote property changes now re-dispatch through the bus.',
            );
        } catch (err) {
            console.error('[EngineBootstrap] W5-4 LEG B: read-back wiring failed (non-fatal):', err);
        }

        // ── L-391 Phase 0 — real-time CRDT websocket provider (GATED, default OFF) ──
        // Until L-375a the CRDT applier wrote to a purely local Y.Doc with NO
        // network provider → the doc never received remote ops and the 3-way
        // CRDTConflictResolver / conflict banner never fired for real multi-user
        // edits (production collab is the socket.io last-write-wins rebroadcast).
        // This block attaches a y-websocket WebsocketProvider to the adapter's
        // Y.Doc so remote ops flow into `_yjsDocAdapter` and the conflict path
        // becomes live — but ONLY when the flag is explicitly enabled AND a sync
        // URL is configured. Both default OFF, so with no config this is a strict
        // no-op and solo/offline editing is byte-identical to today. There is no
        // deployed sync-server yet; turning this on is a deliberate Phase-1 step
        // once apps/sync-server ships (see docs/04-reference/L-391-CRDT-COLLAB-PLAN.md).
        //
        // P1: the composition root (this bootstrap) owns the config + factory and
        // hands them to the pure `connectCrdtProvider` seam in @pryzm/sync-client.
        // P4: window/env reads use `as unknown as {…}` typed shims (no `as any`).
        try {
            const _env = import.meta.env as Record<string, string | undefined>;
            const _win = window as unknown as {
                __pryzmCollabCrdt?: boolean;
                __pryzmSyncUrl?: string;
                __pryzmAuthToken?: string;
                currentProjectId?: string;
            };
            const _syncUrl = _win.__pryzmSyncUrl ?? _env['VITE_SYNC_URL'];
            const _flagOn =
                _win.__pryzmCollabCrdt === true || _env['VITE_COLLAB_CRDT'] === 'true';
            // §L-391-R-B — the sync server AUTHENTICATES the WebSocket upgrade
            // (apps/sync-server/src/auth/WsAuthGate.ts): no token ⇒ HTTP 401
            // with `X-Pryzm-Sync-Refusal: missing-token`.
            //
            // `window.__pryzmAuthToken` is an override hook that NOTHING in this
            // repository ever assigns — it was read here and set nowhere, so
            // before this line the config resolved to `authToken: undefined` for
            // every real browser and the deployed server would have refused every
            // client. `getStoredToken()` is the canonical reader for the session
            // JWT the auth modal writes to localStorage, and it is the SAME token
            // `server/authStore.js` signs with `SESSION_SECRET` — which is exactly
            // what the sync server verifies. The override still wins when present.
            const _authToken = _win.__pryzmAuthToken ?? getStoredToken() ?? undefined;
            const _collabConfig: CollabProviderConfig = {
                // Master gate: OFF unless BOTH the flag is set and a URL exists.
                enabled: _flagOn && Boolean(_syncUrl),
                ...(_syncUrl !== undefined ? { url: _syncUrl } : {}),
                room: _win.currentProjectId ?? 'pryzm-project',
                ...(_authToken !== undefined ? { authToken: _authToken } : {}),
            };
            if (_collabConfig.enabled && _authToken === undefined) {
                // Fail LOUDLY rather than opening a socket that will be refused
                // and reconnect-looped forever with no explanation.
                console.warn(
                    '[EngineBootstrap] L-391: CRDT collaboration is enabled but no session ' +
                    'token is available — the sync server will refuse the upgrade with ' +
                    '`missing-token`. Sign in before enabling collaboration.',
                );
            }
            const _provider = connectCrdtProvider(
                _yjsDocAdapter,
                _collabConfig,
                createWebsocketProvider,
            );
            if (_provider) {
                console.log(
                    `[EngineBootstrap] L-391: CRDT websocket provider connected ` +
                    `room=${_collabConfig.room} url=${_syncUrl}`,
                );
            } else {
                console.log(
                    '[EngineBootstrap] L-391: CRDT websocket provider OFF (flag/url unset) — ' +
                    'solo/socket.io path unchanged.',
                );
            }
        } catch (err) {
            // Provider wiring must never break boot — degrade to solo silently.
            console.warn('[EngineBootstrap] L-391: CRDT provider wiring failed (non-fatal):', err);
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

    // ── F-1.4: room.redetect CustomEvent bridge listener ─────────────────────
    // RedetectRoomsHandler (plugins/rooms L4) dispatches 'pryzm-bus-rooms-redetect'
    // to avoid an L4→L7 import cycle (ADR-002 §3.D).  This L7 listener converts
    // the CustomEvent into a LEGACY commandManager.execute(ReDetectRoomsCommand) call.
    //
    // CRITICAL BUG FIX (F-1.4-REDETECT-LOOP):
    //   The previous implementation called bus.executeCommand('room.redetect') here.
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
        //
        // §UNDO-CLEAR-BOTH-STACKS (L-692) — C03 §4.6 U-6 requires BOTH stacks to be
        // cleared, and this hook cleared only the ring buffer. There are TWO undo
        // backends (§4.3), so wiping one leaves the other holding Project A's
        // entries: once Project B's ring buffer is exhausted, `performUndo`'s
        // commandManager fallback replays a Project-A command's `undo()` against
        // Project-B stores. ProjectLoader (~:2179) already clears both on the LOAD
        // path; the project-SWITCH lifecycle path did not.
        () => {
            const r = window.runtime as { bus?: { clearUndoStacks?: () => void } } | undefined;
            try { r?.bus?.clearUndoStacks?.(); }
            catch (e) { console.warn('[engineLauncher] §U-B1: bus.clearUndoStacks() failed', e); }
            const cm = (globalThis as { commandManager?: { clearHistory?: () => void } }).commandManager;
            try { cm?.clearHistory?.(); }
            catch (e) { console.warn('[engineLauncher] §U-B1: commandManager.clearHistory() failed', e); }
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

    // ── §VI-PROBE (L-778) / C09 §4.3a — the visibility-intent resolution probe ───
    //
    // Bound UNCONDITIONALLY (Pattern E), because the diagnosis this exists for happens on
    // PRODUCTION: `pryzmExplainVisibilityIntent('vd-sys-plan-l0', 'wall')` prints the
    // binding ORIGIN ('own' | 'inherited' | 'global-default' | 'none'), the intent that
    // answered, every rule tier that contributed, and the final pen. Before this, an
    // UNBOUND view and a view bound to the default intent produced the identical pen with
    // nothing anywhere able to tell them apart (§CONTEXT-DATA-HONESTY). Read-only —
    // it dispatches nothing and mutates no store.
    {
        const { bindLegacyBrowserGlobals } = await import('./window-shim');
        const { graphicsRulesEngine, viewDefinitionStore } = await import('@pryzm/core-app-model');
        bindLegacyBrowserGlobals({
            pryzmExplainVisibilityIntent: (
                viewId: string,
                category = 'wall',
                zone: 'CUT' | 'PROJECTION' | 'BEYOND' | 'HIDDEN' = 'CUT',
                viewType?: string,
            ) => {
                const def = viewDefinitionStore.get(viewId);
                const report = graphicsRulesEngine.explainStyle(zone, category, {
                    viewId,
                    viewType: viewType ?? def?.viewType ?? 'plan',
                });
                console.table([{
                    view:    `${viewId} (${report.viewType})`,
                    element: `${category}/${zone}`,
                    binding: report.binding,
                    intent:  report.intentName ?? '—',
                    widthMm: report.pen.widthMm,
                    colour:  report.pen.color,
                    opacity: report.pen.opacity,
                    dash:    report.pen.dashPx ? report.pen.dashPx.join(',') : 'solid',
                }]);
                console.log('[VI-PROBE] rule tiers (low → high priority):', report.tiers);
                if (report.binding === 'global-default') {
                    console.warn(
                        `[VI-PROBE] view '${viewId}' has NO ViewIntentInstance — it is being ` +
                        'drawn with the GLOBAL DEFAULT intent. Per-view intent and per-view ' +
                        'local overrides (C09 §4.3) do NOT apply to it.',
                    );
                }
                return report;
            },
        });
    }
}
