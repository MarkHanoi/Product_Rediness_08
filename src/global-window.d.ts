/**
 * global-window.d.ts — Wave 5 typed-globals sweep
 *
 * Extends the global Window interface with all 157 properties previously
 * accessed via window-global casts across src/ui/.
 *
 * Properties are declared as `any` here to preserve the same runtime
 * behaviour as the former window-global cast pattern while eliminating
 * the per-call cast syntax from src/ui/ code.  Progressive type-tightening
 * of individual properties is scheduled for Wave 6/7 subsystem sweeps —
 * each property can be narrowed independently without touching UI callsites.
 *
 * Organised by subsystem:
 *   §1  Commands & selection
 *   §2  Stores (element data stores)
 *   §3  Tools (interactive scene tools)
 *   §4  Builders & services
 *   §5  Data-platform singletons
 *   §6  Engine / rendering / navigation
 *   §7  UI panels & layout bridges
 *   §8  External / browser globals
 *   §9  Legacy bridge state (temporary flags & callbacks)
 *
 * TODO(D.x): Replace `any` annotations with specific class import types as
 *            each UI sub-module is migrated to receive runtime via injection.
 *            See Wave 11 src/-wide sweep plan in docs/03_PRYZM3/03-CURRENT-STATE.md §12.
 *
 * Wave 7 additions: window-global properties that were previously accessed via
 * cast patterns in non-shim files; declared here so those files can use plain
 * window.X syntax.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

declare global {
  /** Minimal common interface for all element-family stores bridged via window globals.
   *  Mirror of the same interface in packages/core-app-model/src/global.d.ts.
   *  Declared here so root-tsc can resolve field types in BimKernel/SpatialAuthority. */
  interface LegacyElementStoreGlobal {
    get?(id: string): any;
    getById?(id: string): any;
    getAll?(): any[];
    getAllDoors?(): any[];
    getAllWindows?(): any[];
    getWindow?(id: string): any;
    getDoor?(id: string): any;
    add?(item: unknown): void;
    update?(id: string, updates: unknown): void;
    has?(id: string): boolean;
    remove?(id: string): void;
  }

  interface Window {
    // ─── §1  Commands & selection ─────────────────────────────────────────────
    commandManager?: any;
    commandContext?: any;
    selectionManager?: any;
    toolManager?: any;
    transformControls?: any;
    /** Constructor exposed for dynamic instantiation from UI layer. */
    UpdateElementMarkCommand?: any;
    /** Constructor exposed for dynamic instantiation from AI layer. */
    CreateWallOpeningCommand?: any;

    // ─── §2  Element data stores ─────────────────────────────────────────────
    wallStore?: any;
    roomStore?: any;
    slabStore?: any;
    ceilingStore?: any;
    floorStore?: any;
    doorStore?: any;
    windowStore?: any;
    curtainWallStore?: any;
    curtainPanelStore?: any;
    plumbingStore?: any;
    lightingStore?: any;
    furnitureStore?: any;
    handrailStore?: any;
    openingStore?: any;
    beamStore?: any;
    stairStore?: any;
    columnStore?: any;
    gridStore?: any;
    ifcModelStore?: any;
    levelStore?: any;
    componentInstanceStore?: any;
    vgGovernanceStore?: any;
    annotationStore?: any;
    constraintStore?: any;
    stairRailingStore?: any;
    roofStore?: any;
    visibilityRuleEngine?: any;
    semanticIndex?: any;
    scheduleStore?: any;

    wallPresetStore?: any;

    plumbingSystemTypeStore?: any;

    // System-type stores
    wallSystemTypeStore?: any;
    slabSystemTypeStore?: any;
    ceilingSystemTypeStore?: any;
    floorSystemTypeStore?: any;
    windowSystemTypeStore?: any;

    // Wave 7 additions — stores
    roomBoundingLineStore?: any;
    roomSystemTypeStore?: any;
    ifcConversionReportStore?: any;
    decisionRecordStore?: any;

    // ─── §3  Tools ────────────────────────────────────────────────────────────
    slabTool?: any;
    roofTool?: any;
    wallTool?: any;
    stairPathTool?: any;
    stairPath3DTool?: any;
    stairTool?: any;
    ceilingTool?: any;
    floorTool?: any;
    doorTool?: any;
    plumbingTool?: any;
    lightingTool?: any;
    furnitureTool?: any;
    handrailTool?: any;
    roomTool?: any;
    roomBoundingLineTool?: any;
    floorPlanUnderlayTool?: any;
    sectionBoxTool?: any;
    curtainWallTool?: any;
    windowTool?: any;
    activeOpeningTool?: any;
    rampTool?: any;
    xxxTool?: any;

    // Mode-picker bridge refs (legacy panel-host)
    wallModePicker?: any;
    ceilingModePicker?: any;
    curtainWallModePicker?: any;
    floorModePicker?: any;

    // ─── §4  Builders & services ─────────────────────────────────────────────
    wallFragmentBuilder?: any;
    slabBuilder?: any;
    plumbingFragmentBuilder?: any;
    roomBoundaryBuilder?: any;
    roomContentsService?: any;
    roomTopologyObserver?: any;
    furnitureFragmentBuilder?: any;
    columnBuilder?: any;
    annotationManager?: any;
    kitchenRunInspector?: any;
    kitchenUnitInspector?: any;
    wardrobeRunInspector?: any;
    wardrobeSectionInspector?: any;
    updateInspector?: any;
    curtainWallBuilder?: any;
    dxfExportService?: any;
    fastPathProjectorService?: any;
    sheetExportService?: any;
    pdfExportService?: any;
    lightingBuilder?: any;
    lightingFragmentBuilder?: any;
    cropFilterService?: any;
    viewRangeFilterService?: any;
    underlayRenderService?: any;

    // Wave 7 additions — builders & services
    sheetIndexService?: any;
    saveViewCamera?: any;
    roomAutoOrganiser?: any;
    edgeProjectorService?: any;
    __edgeProjectorService?: any;
    pryzmExport?: any;

    // ─── §5  Data-platform singletons ────────────────────────────────────────
    hierarchyStore?: any;
    templateStore?: any;
    templateAssignmentStore?: any;
    syncStateEngine?: any;
    constraintEngine?: any;
    constraintSolver?: any;
    resolverStores?: any;
    visibilityIntentStore?: any;
    viewIntentInstanceStore?: any;
    elementCodeStore?: any;
    semanticGraphManager?: any;
    temporalGraphManager?: any;
    roomGraphService?: any;
    roomQueryService?: any;
    roomTypeInferenceEngine?: any;
    roomValidationService?: any;
    facadeOrientationService?: any; // SL-3 (SPEC-SEMANTIC §3)
    elementRegistry?: any;
    programmeStore?: any;
    worldModelAdapter?: any;
    selectionBus?: any;
    aiService?: any;
    annotationDependencyGraph?: any;
    scheduleRegistry?: any;

    // Wave 7 additions — data-platform singletons
    physicsEngine?: any;

    // ─── §6  Engine / rendering / navigation ─────────────────────────────────
    bimManager?: any;
    /** @deprecated alias for bimManager — use bimManager directly */
    __bimManager?: any;
    bimKernel?: any;
    bimService?: any;
    bimWorld?: any;
    projectContext?: any;
    projectStore?: any;
    projectSerializer?: any;
    projectName?: any;
    platformShell?: any;

    viewController?: any;
    navManager?: any;
    renderPipelineManager?: any;
    renderingPipelineCoordinator?: any;
    presentationEngine?: any;
    viewportPathTracer?: any;
    planViewToolOverlay?: any;
    planViewOverlay?: any;
    planViewManager?: any;
    splitViewManager?: any;
    dimensionManager?: any;
    firstPersonController?: any;
    groundFloorController?: any;
    vgSceneApplicator?: any;
    obcRendererCanvas?: any;
    pascalSceneLighting?: any;
    pryzmCanvas?: any;
    previewManager?: any;
    activeCamera?: any;

    camera?: any;
    threeCamera?: any;
    threeScene?: any;
    bimScene?: any;
    activeScene?: any;
    scene?: any;
    renderer?: any;
    world?: any;
    components?: any;
    obcViewpoints?: any;
    obcWorld?: any;
    OBCF?: any;
    cameraControls?: any;
    viewportContainer?: any;
    workspaceController?: any;

    /**
     * Composed runtime singleton written by `engineLauncher.ts` after
     * `composeRuntime()` resolves.  Typed as `any` here (progressive-narrowing
     * plan: see TODO(D.x) at top of file) so legacy command call sites can
     * access `window.runtime?.bus` without an unsafe cast.
     * Phase E.5.x: once all 214 `commandManager.execute()` sites are migrated,
     * narrow this to `import('@pryzm/runtime-composer').PryzmRuntime | null`.
     *
     * @see `src/engine/engineLauncher.ts` (writer)
     * @see `23-L2-COMMAND-EVENT-BUS-IMPLEMENTATION-PLAN.md §9` (constraint)
     */
    runtime?: any;

    // Wave 7 additions — rendering
    pryzmRenderer?: any;
    __pryzmRenderer?: any;
    /**
     * §BATCH-SHADOW (BatchCoordinator / CurtainWallBuilder) — saves the Three.js
     * renderer shadowMap.enabled state before a batch suppresses shadows, so
     * _reactivateShadows() can restore the exact pre-batch state.
     */
    __pryzmBatchShadowWasEnabled?: boolean;
    /**
     * §IFC-CRS (initUI IFC import) — CRS record from the last loaded IFC file.
     * null when IFC had a CRS block but no parseable record; undefined when not
     * yet set (no IFC loaded).
     */
    pryzmCRS?: Record<string, unknown> | null;
    __instancedElementRenderer?: any;
    renderingQualityPanel?: any;
    __renderingQualityPanel?: any;
    __frustumCullingService?: any;
    __levelClipPlaneCache?: any;
    __topologySpatialIndex?: any;
    __topologyLayer?: any;
    __unifiedFrameLoop?: any;
    __viewDependencyTracker?: any;
    __viewVisibilityMap?: any;
    __stairPlanSymbolRegistry?: any;
    __wallPerfBench?: any;

    // Rendering pipeline debug helpers
    currentPipelinePhase?: any;
    setRenderQualityLevel?: any;
    disableEnhancedBloom?: any;
    enableEnhancedBloom?: any;
    disableSSGI?: any;
    enableSSGI?: any;
    disableViewportRenderMode?: any;
    enableViewportRenderMode?: any;
    enhancedBloomService?: any;
    ssgiService?: any;

    // ─── §7  UI panels & layout bridges ─────────────────────────────────────
    dataWorkbench?: any;
    viewPropertiesPanel?: any;
    schedulePanel?: any;
    furnitureCarousel?: any;

    // Wave 7 additions — UI panel state bridges
    cameraPanelSettings?: any;
    worksetPanelSettings?: any;
    viewRangeSettings?: any;
    viewTemplateSettings?: any;
    dimensionStyle?: any;
    textStyle?: any;
    tagStyle?: any;
    leaderStyle?: any;
    scheduleConfig?: any;
    scheduleSort?: any;
    scheduleFilter?: any;
    scheduleField?: any;
    roomTag?: any;
    revisionCloud?: any;
    detailComponent?: any;
    layerVisibility?: any;
    layerLock?: any;

    viewDefinitionStore?: any;
    viewTemplateStore?: any;
    sheetStore?: any;
    activeSheetId?: any;

    // Panel bridge refs
    panoramaPanel?: any;
    renderPanel?: any;
    videoExportPanel?: any;
    viewportRenderModePanel?: any;
    vizEnginePanel?: any;
    sheetEditor?: any;
    sheetEditorPanel?: any;
    annotationVisibilityPanel?: any;
    performanceModePanel?: any;
    visibilityIntentPanel?: any;
    overridePanel?: any;

    toggleDxfPanel?: any;
    toggleFloorPlanPanel?: any;
    showAppToast?: any;

    // ─── §8  External / browser globals ─────────────────────────────────────
    /**
     * Socket.io global injected by CDN.
     * TODO(C.3.x): Replace with runtime.transport.socket
     */
    io?: any;
    /**
     * Live socket instance when collaboration is active.
     */
    socket?: any;
    /**
     * Sentry SDK injected by CDN script tag.
     */
    Sentry?: any;
    /**
     * window.requestIdleCallback — polyfill/shim for legacy Safari.
     * TODO(C.3.x): Remove once tsconfig targets ≥ ES2022.
     */
    requestIdleCallback?: any;
    /**
     * Web Speech API — SpeechRecognition (standard) and webkitSpeechRecognition (legacy Chrome).
     * Used by VoiceSpatialInterface. Both are undefined in non-supporting browsers.
     */
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
    /**
     * OpenBIM Components (OBC) — CDN-loaded or bundled and exposed on window
     * for plan-view integration (CreatePlanViewCommand, ViewerBootstrap).
     */
    OBC?: any;

    // ─── §9  Legacy bridge state ─────────────────────────────────────────────
    __curtainSubElement?: any;
    _pryzmActivePlumbingType?: any;
    _pryzmActiveShowerVariant?: any;
    _pryzmActiveToiletVariant?: any;
    _pryzmActiveLightingType?: any;
    _pryzmActiveFurnitureType?: any;
    _pryzmActiveOpeningMode?: any;
    _pryzmSelectedSlabId?: any;
    __pendingProjectId?: any;
    __pendingProjectName?: any;
    __rq_video_job_id__?: any;
    __sheetEditorPreviousSheet?: any;
    __aiPanelShowApprovalModal?: any;
    __pryzmRecreateUnderlayInternal?: any;
    __pryzmRemoveUnderlayInternal?: any;
    floorPlanUnderlayRef?: any;
    __pryzmCommands__?: any;
    __hierarchyCmds__?: any;
    __stores?: any;
    propertyUpdates?: any;

    // Wave 7 additions — legacy bridge state
    __PRYZM_PERF_ENABLED?: any;
    __PRYZM_SHOW_DEBUG_OVERLAY?: any;
    // __pryzm2RuntimeComposed — DELETED Wave 17 (2026-05-02); direct param in initPersistence()
    _ifcLevelImportInProgress?: any;
    _pryzmLastImportSource?: any;
    __PRYZM_SCENE__?: any;
    __PRYZM_FLAGS__?: any;
    __PRYZM_DEBUG_ZONES__?: any;
    __pryzmDebugWalls?: any;
    __pryzmIsolationLeaks?: any;
    __pryzmSelectedAnnotationId?: any;
    __sceneBoundsCache?: any;
    __viewRenderCache?: any;
    __viewSwitchInProgress?: any;
    /**
     * §LOAD-RAF-PAUSE + §BATCH-BUS-DISCARD: WallFragmentBuilder flush control surface.
     *
     * pause() / resumeAndFlush(): Used by ProjectLoader and BatchCoordinator._setupBatch()
     *   to suppress per-wall rAF scheduling during bulk mutations and run ONE coalesced
     *   WallJoinResolver pass at the end (§LOAD-RAF-PAUSE pattern).
     *
     * discardAndSuppress() / restore(): Used by BatchCoordinator._executeFinalSweep() to
     *   bracket storeEventBus.endBatch() — wall events that flush during endBatch() are
     *   silently dropped (not accumulated) because the walls were already built by
     *   WallFragmentBuilder in the batch drain phase (§BATCH-BUS-DISCARD pattern).
     */
    __wallRebuildControl?: {
        pause(): void;
        /** §F.2 — async-schedule the wall flush (FrameScheduler pre-render slot). */
        resume(): void;
        /** @deprecated Use `resume()` (§F.2).  Still called by ProjectLoader. */
        resumeAndFlush(): void;
        discardAndSuppress(): void;
        restore(): void;
    };
    /**
     * C13 §4 (Wave 35 I-2) — Project isolation teardown surface.
     *
     * Exposes a reset hook for all closure-private wall-rebuild state and
     * readable state getters so the `pryzm-project-switch` handler (I-3)
     * can clean up before Project B loads and the OTel span (I-5) can
     * report the pre-teardown state.  Declared as optional because
     * engineLauncher assigns it after the wall pipeline initialises; the
     * `pryzm-project-switch` listener always guards with `?.`.
     */
    __engineTeardown?: {
        resetWallRebuildState(): void;
        readonly isWallRebuildPaused:     boolean;
        readonly isWallRebuildDiscarding: boolean;
        readonly pendingWallEventCount:   number;
    };
    /** §BATCH-CW-PAUSE: CurtainWallBuilder pause/resume/query API — wired by constructor, consumed by BatchCoordinator and project-switch teardown. */
    __curtainWallRebuildControl?: {
        pause(): void;
        /** §F.2 — async-schedule the CW drain via scheduleOnce('pre-render'). */
        resume(): void;
        /** @deprecated Use `resume()` (§F.2).  Kept for backward compat. */
        resumeAndFlush(): void;
        isPaused(): boolean;
        addManyPaused?(walls: import('@pryzm/geometry-curtain-wall').CurtainWallData[]): void;
        scheduleBatchShadow?(ids: string[]): void;
    };
    /**
     * §BN-09a — GPU recovery cooldown end timestamp (ms since epoch).
     * Set to Date.now() + 5000 by webglcontextlost / WebGPU device-loss handlers.
     * Read by CreateCurtainWallsOnAllSlabsCommand._prewarmCurtainWallShaders() to
     * abort prewarm while stale GPU render objects from the dead device are present.
     */
    __cwPrewarmCooldownUntil?: number;
    /**
     * §DEV: Registered by CreateCurtainWallsOnAllSlabsCommand module IIFE.
     * Call window.__resetCwPrewarm() in DevTools to force-repro the first-run
     * WebGPU PSO prewarm on the next execute() without a page reload.
     */
    __resetCwPrewarm?: () => void;
    /**
     * §PERF-2026-Q2-CW-CREATE/F9: Opt-in verbose logging for CurtainWallBuilder.
     * Set window.__cwBuilderDebug = true in DevTools to enable per-build / per-drain
     * trace logs. Warnings (SLOW_BUILD) remain unconditional.
     */
    __cwBuilderDebug?: boolean;
    /**
     * §A.6 / §D.1 — Current batch ID (8-character UUID prefix).
     * Set by BatchCoordinator._setupBatch(), cleared by forceReset() and on normal
     * batch completion (set to undefined). Used for cross-module diagnostic log
     * threading: all log lines produced during a single batch share this prefix,
     * enabling `grep batchId=abc12345` to isolate one batch in a busy console.
     * Also consumed by CurtainWallStore.addMany() §A4-SAFETY error log.
     *
     * Typed as string | undefined (not any) per I-6 (no window-as-any outside shim).
     */
    __activeBatchId?: string;
    /** §BATCH-SLAB-PAUSE: SlabFragmentBuilder pause/resume/query API — wired in engineLauncher, consumed by BatchCoordinator and project-switch teardown. */
    __slabRebuildControl?: {
        pause(): void;
        /** §F.2 — async-schedule the slab drain via scheduleOnce('pre-render'). */
        resume(): void;
        /** @deprecated Use `resume()` (§F.2).  Kept for backward compat. */
        resumeAndFlush(): void;
        isPaused(): boolean;
    };
    __underlayScaleActive?: any;
    __underlayHit?: any;
    __planViewsDisabled?: any;
    __cwPanelStoreVerify?: any;
    __planSymbolCache?: any;
    __slabProfileEditor?: any;
    lastPointerMoveEvent?: any;
    __kitchenSubUnit?: any;
    __wardrobeSubUnit?: any;
    activeLevelElevation?: any;
    isCameraDragging?: any;
    unselectAll?: any;
    __projectScopedStorage?: any;
    __projectScopeRegistry?: any;
    authToken?: any;
    clerkUser?: any;
    currentProjectId?: any;
    readModel?: any;
    // ── Wave 5 Day 10 — Pattern D / E globals restored ─────────────────────
    // These were incorrectly swept as "orphaned" in Day 10; restored here so
    // the typed `window.X = X` writes compile without casts.
    // Pattern D (DEV console access — Wave 7 gates behind import.meta.env.DEV):
    CreatePlanViewCommand?: any;
    comparisonEngine?: any;
    // Pattern E (runtime interop — IFC loaders call window.ifcPsetAdapter.ingest):
    ifcPsetAdapter?: any;
    // Pattern D (store debug inspection):
    titleBlockStore?: any;
    phaseFilterStore?: any;
  }
}

export {};
