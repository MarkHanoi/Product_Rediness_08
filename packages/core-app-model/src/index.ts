/**
 * @pryzm/core-app-model — public surface (Wave 10 W10-A Tasks 1–2)
 *
 * Core application model layer. Absorbs infrastructure code from src/core/
 * that belongs in a reusable package rather than the application source tree.
 *
 * Wave 10 content (W10-A Tasks 1–2):
 *   drawing/      — Pipeline protocol types, pen/hatch/poche tables, DrawingConstants
 *   presentation/ — RenderingIntent, VisibilityIntentTypes, VisibilityRuleTypes, VisualStyleManager
 *   hierarchy/    — HierarchyTypes (IFC 7-level spatial hierarchy)
 *   catalog/      — AssetCatalogTypes
 *   context/      — ProjectContext, EditorMode
 *   navigation/   — GeospatialAdapter, Georeference
 *   persistence/  — ProjectScopeRegistry, ProjectScopedStorage
 *   views/        — ViewDefinitionTypes
 *   root          — CoreElement, StoreEventBus, StoreRegistry, MarkGenerator,
 *                   SelectionBus, SemanticTagRegistry
 *
 * Layer contract: L3 — may import L0–L2 packages; must not import L4+ packages
 * or any app-layer (apps/*) code.
 *
 * @see docs/archive/pryzm3-internal/04-PLAN-FORWARD/17-WAVES-9-12-SRC-MIGRATION.md §2
 * @see docs/archive/pryzm3-internal/00-PROCESS-TRACKER.md §5 W10-A
 */

// ── drawing ──────────────────────────────────────────────────────────────────

export type { ViewRangeHashInput } from './drawing/DrawingConstants.js';
export {
    GEOMETRIC_EPSILON_M, SNAP_TOLERANCE_M, COLLINEAR_ANGLE,
    SCREEN_DPI, EXPORT_DPI, MM_PER_INCH, SCREEN_PX_PER_MM,
    pxPerMm, hashViewRange, hashMatrix4, classificationCacheKey, styleResolverCacheKey,
} from './drawing/DrawingConstants.js';

export type {
    StyledEdge, StyledPolygon, PipelineElementBatch, SerializedRule,
    PipelineRequest, PipelineResult, PipelineError, WorkerOutboundMessage,
} from './drawing/DrawingPipelineTypes.js';

export type { PenStyle, PenZone } from './drawing/PenWeightTable.js';
export { FALLBACK_PEN, resolvePen, penZoneFromLayerName, drawingZoneFromLayer, categoryFromFlags } from './drawing/PenWeightTable.js';

// §FIX-PLAN-CANVAS-HAIRLINE-FLOOR (L-288) — the screen must have the DEVICE PIXELS to draw
// the pen table. The pens are correct (export proves it); the rasteriser's 1-px floor was
// flattening every pen below ~0.265 mm onto one width. The PEN TABLE IS NOT TOUCHED.
export {
    MAX_BACKING_SCALE,
    MIN_LEGIBLE_BACKING_SCALE,
    resolveCanvasRenderScale,
    minStrokePx,
    dashScale,
} from './drawing/CanvasRenderScale.js';
export { THINNEST_SYSTEM_PEN_MM } from './drawing/PenWeightTable.js';

// §FEAT-PEN-WEIGHT-BY-WALL-FUNCTION (L-285) — C09 §4.6.4a, the pen's THIRD axis. FUNCTION
// modulates the weight WITHIN a zone (an interior CUT wall is lighter than an exterior CUT
// wall — and STILL heavier than any PROJECTION line). It is the element TYPE's ISO 13567 /
// Revit function, NEVER its thickness. `geometry-wall` owns the wall half (`WallFunction.ts`).
export type { ElementFunction } from './drawing/ElementFunction.js';
export {
    ELEMENT_FUNCTIONS,
    ELEMENT_FUNCTION_KEY,
    FUNCTION_WEIGHT_SCALE,
    functionWeightScale,
    penWidthScale,
    FUNCTION_MODULATED_ZONES,
    elementFunctionFrom,
} from './drawing/ElementFunction.js';

// §FEAT-REVIT-LINE-TYPE-SEMANTICS (L-277) — C09 §4.6, the four drawing zones. ONLY `hidden`
// dashes. `penZoneFromFlags(isCut, isBeyond)` is DELETED: two booleans cannot express four
// zones, so HIDDEN was structurally unreachable at the one place that paints a line.
export type { DrawingZone, OcclusionDisposition, BeyondLineStyle } from './drawing/DrawingZone.js';
// §FEAT-BEYOND-DASH-IN-ELEVATION (L-290) — the two de-emphasis dashes. They MUST differ:
// beyond and hidden share a WIDTH, so the DASH is the only axis that can tell them apart.
export { BEYOND_DASH_PX, HIDDEN_DASH_PX, beyondAndHiddenAreDistinguishable } from './drawing/DrawingZone.js';
export {
    DRAWING_ZONES,
    DATUM_CATEGORIES,
    ZONE_LAYER_SUFFIX,
    penZoneOf,
    drawingZoneOf,
    layerForZone,
    siblingZoneLayer,
    drawingZoneFromLayerName,
    zoneDashesByDefault,
} from './drawing/DrawingZone.js';

// §FEAT-DOOR-PLAN-SYMBOL-DETAIL-LEVEL (L-241) P2 — shared LOD resolver + the enum
// (re-exported from L0 @pryzm/schemas so downstream packages have one import site).
export type { DetailLevelTargets } from './drawing/DetailLevelResolver.js';
export { DEFAULT_DETAIL_LEVEL, resolveEffectiveDetailLevel } from './drawing/DetailLevelResolver.js';

export { ISO_CUT_LAYER_TO_POCHE_FILL, VG_CATEGORY_TO_ISO_LAYER, resolvePocheFill } from './drawing/PocheFillTable.js';

export type { HatchPatternKey } from './drawing/HatchPatternLibrary.js';
export { clearHatchPatternCache, hasHatchPattern, getHatchPattern, applyHatchFillStyle } from './drawing/HatchPatternLibrary.js';

// ── geometry primitives + temporal types ──────────────────────────────────────

export type { Point3D, EulerDTO } from './types/GeometryDTO.js';
export { isPoint3D, isEulerDTO } from './types/GeometryDTO.js';

export type {
    TemporalEdge, NodeMutationRecord, SerializedTemporalGraph,
    SerializedDecisionRecords, DecisionRecord, TemporalSlice,
} from './types/TemporalTypes.js';

// ── root infrastructure ────────────────────────────────────────────────────

export type {
    ElementType, IFCMetadata, IFCPset, PsetMap, SpatialRelationship, CoreElement,
} from './CoreElement.js';
export { createIfcMetadata } from './CoreElement.js';

export type { StoreChangeEvent } from './StoreEventBus.js'; // TODO(TASK-08)
export { BATCH_COMPLETE_ELEMENT_TYPE, StoreEventBus, storeEventBus } from './StoreEventBus.js'; // TODO(TASK-08)

export type { BimStore } from './StoreRegistry.js';
export { StoreRegistry, storeRegistry } from './StoreRegistry.js';

export type { MarkGeneratorDeps } from './MarkGenerator.js';
export { ELEMENT_MARK_PREFIX, generateMark, parseMark, isValidMark } from './MarkGenerator.js';

export type { SelectionSource, SelectionEvent } from './SelectionBus.js';
export { selectionBus } from './SelectionBus.js';

export type {
    SemanticTagCategory, SemanticTagDefinition,
} from './SemanticTagRegistry.js';
export {
    SEMANTIC_TAG_DEFINITIONS, SEMANTIC_TAGS, SEMANTIC_TAGS_BY_CATEGORY,
    isRecognizedTag, getTagDefinition, getTagCategory, getTagsForElementType,
} from './SemanticTagRegistry.js';

// ── presentation ──────────────────────────────────────────────────────────

export { RenderingIntent } from './presentation/RenderingIntent.js';

export type {
    ElementState, LineAppearance, FillAppearance, ElementStateAppearance,
    ThreeDimensionalAppearance, ElementGraphicsRules, ViewTypeModifierStateTransform,
    AppearancePatch, ViewTypeModifier, ViewTypeProfile, ProfileElementRulePatch,
    ViewPurpose, PurposeModifier, VisibilityIntent,
    ViewSeedLockableField, ViewSeedDiscipline, ViewSeedPurpose, ViewSeed,
    OverrideTargetKind, VisibilityOverride, GraphicOverride, OverrideLayer,
    PlanViewRangeDefaults, ViewIntentInstance,
} from './presentation/VisibilityIntentTypes.js';
export { EMPTY_OVERRIDE_LAYER } from './presentation/VisibilityIntentTypes.js';

export type {
    QueryExpression, VisibilityEffect, VisibilityRule, VisibilityRuleEngineSnapshot,
} from './presentation/VisibilityRuleTypes.js';

export type { VisualStyle, StyleSchema } from './presentation/VisualStyleManager.js';
export { VisualStyleManager } from './presentation/VisualStyleManager.js';

export {
    SYSTEM_INTENT_IDS,
    SYSTEM_VISIBILITY_INTENTS,
    getDefaultSystemIntentId,
    cloneSystemIntents,
} from './presentation/SystemIntents.js';

export type { VisibilityIntentStoreSnapshot, VisibilityIntentStoreImpl } from './presentation/VisibilityIntentStore.js';
export { visibilityIntentStore } from './presentation/VisibilityIntentStore.js';

export type { ViewIntentInstanceStoreSnapshot, ViewIntentInstanceStoreImpl } from './presentation/ViewIntentInstanceStore.js';
export { viewIntentInstanceStore } from './presentation/ViewIntentInstanceStore.js';

export type {
    IntentResolveTarget, IntentFieldSource, ResolvedField, SourceContribution, InheritanceContext,
} from './presentation/IntentRuleResolver.js';
export {
    stateFromPenZone, isElementTypeFullyHidden, normaliseIfcUserDataType, appearanceToPenStyle,
    resolveIntentStyle, resolveSurface3D, resolveSurface3DExplicit, resolveWithInheritance,
    resolveIntentPenStyle, resolveViewSeed, resolveViewRange, resolveCrop, resolveUnderlay,
    resolveOutput, resolveWithSourceChain,
} from './presentation/IntentRuleResolver.js';

// §SYMBOL-INJECTORS-VS-INTENT (L-3903) — the ONE seam every symbol injector's CALLER
// uses to ask whether an element family may draw in this view. See SymbolInjectionGate.ts.
export { makeSymbolInjectionGate } from './presentation/SymbolInjectionGate.js';
export type { SymbolInjectionGate } from './presentation/SymbolInjectionGate.js';

export type { StyleResolverContext, GraphicsRule } from './drawing/GraphicsRulesEngine.js';
export {
    RULE_PRIORITY_SYSTEM, RULE_PRIORITY_CATEGORY, RULE_PRIORITY_INTENT,
    RULE_PRIORITY_VIEW_TYPE_MODIFIER, RULE_PRIORITY_VIEW, RULE_PRIORITY_ELEMENT,
    RULE_PRIORITY_GRAPHIC_OVERRIDE, GraphicsRulesEngine, graphicsRulesEngine,
} from './drawing/GraphicsRulesEngine.js';

export type { CutPocheResult, CutSectionExtractOptions } from './drawing/CutSectionExtractor.js';
export { extractCutPoches } from './drawing/CutSectionExtractor.js';

export type { OrchestratorJobOptions } from './drawing/DrawingPipelineOrchestrator.js';
export { DrawingPipelineOrchestrator, drawingPipelineOrchestrator } from './drawing/DrawingPipelineOrchestrator.js';

// ── hierarchy ─────────────────────────────────────────────────────────────

export type {
    HierarchyNodeType, SyncState, PlannedData, HierarchyMetadata,
    HierarchyEntityBase, SiteData, BuildingData, LevelData, UnitData,
    AnyHierarchyEntity,
} from './hierarchy/HierarchyTypes.js';

// ── Sprint G P9-W10 (2026-05-10) — HierarchyStore + SyncStateEngine ──────
export { HierarchyStore, hierarchyStore } from './hierarchy/HierarchyStore.js';

// ── ADR-0328 — `partOf` is a DERIVED PROJECTION of the hierarchy substrate ──
// The store above stays the SOLE hierarchy source of truth; this exports the
// graph-level semantic DERIVED from it. It is not a second store, and it holds
// no hierarchy state of its own — see PartOfProjection.ts's header.
export {
    PartOfProjection,
    partOfProjection,
    derivePartOfEdges,
    partOfCitizens,
    readHierarchySubstrate,
} from './hierarchy/PartOfProjection.js';
export type {
    PartOfSubstrateNode,
    PartOfSubstrateRoom,
    PartOfSubstrateSnapshot,
    DerivedPartOfEdge,
    PartOfProjectionStats,
    PartOfRefusalReason,
    PartOfParentQuery,
    PartOfMembersQuery,
} from './hierarchy/PartOfProjection.js';

export type { CheckResult, SyncCheckResult } from './sync/SyncStateEngine.js';
export { syncStateEngine } from './sync/SyncStateEngine.js';

// ── catalog ───────────────────────────────────────────────────────────────

export type {
    AssetCategory, AssetCatalogParameters, AssetCatalogMetadata,
    AssetCatalogEntry, AssetCatalogParamUpdate,
} from './catalog/AssetCatalogTypes.js';

// ── context ───────────────────────────────────────────────────────────────

export type { ProjectEventType, ProjectEventListener } from './context/ProjectContext.js';
export { EditorMode, ProjectContext, projectContext } from './context/ProjectContext.js';

// ── navigation ────────────────────────────────────────────────────────────

export type { Georeference } from './navigation/GeospatialAdapter.js';
export { GeospatialAdapter } from './navigation/GeospatialAdapter.js';

// ── P9-W7 Batch A (2026-05-10) — navigation files ────────────────────────────

export { frameObject, frameObjects } from './navigation/CameraFramingUtils.js';
// §CAM-FRAME-INVARIANT (L-742) — single framing authority (3D activation + Fit All).
export type { FitPose, FitPoseOptions } from './navigation/cameraFraming.js';
export { computeFitPose, boundsVisibleToCamera, boundsFramedByCamera, shouldPersistDepartingCamera, MIN_FRAMED_SCREEN_FRACTION } from './navigation/cameraFraming.js';
export type { DepartingCameraContext, GroundPointXZ } from './navigation/cameraFraming.js';
// §CAM-BIM-SCALE-BOUNDS (L-744) — L-378 guarded the SAVED pose; this guards the
// COMPUTED one, so an empty slot cannot fall back to a globe-scale default framing.
export { GLOBE_SCALE_LIMIT_M, isGlobeScalePosition, isGlobeScaleBounds, MAX_BIM_NEAR_M, boundsFromSiteRing } from './navigation/cameraFraming.js';
// §CAM-NEAR-SCALES-WITH-STANDOFF (L-2070) — the near plane scales with the camera's
// standoff from the model, so a wall at arm's length is not clipped away.
export { NEAR_INSPECT_M, NEAR_RAMP_STANDOFF_M, MAX_DEPTH_RATIO, nearForStandoff, standoffFromBounds, applyAdaptiveNearPlane, installAdaptiveNearPlane } from './navigation/adaptiveNearPlane.js';
export type { AdaptiveNearPlaneBinding, AdaptiveNearControlsLike } from './navigation/adaptiveNearPlane.js';
export { FirstPersonController } from './navigation/FirstPersonController.js';
export type { KeyboardOrbitCamera } from './navigation/KeyboardOrbitPlugin.js';
export { KeyboardOrbitPlugin } from './navigation/KeyboardOrbitPlugin.js';
export type { CameraSlot, CameraState } from './navigation/MultiViewCameraManager.js';
export { MultiViewCameraManager } from './navigation/MultiViewCameraManager.js';
export type { ViewMode } from './navigation/ViewNavigationManager.js';
export { ViewNavigationManager } from './navigation/ViewNavigationManager.js';

// ── persistence ───────────────────────────────────────────────────────────

export type { ProjectScopedStore, ClearReport } from './persistence/ProjectScopeRegistry.js';
export { projectScopeRegistry } from './persistence/ProjectScopeRegistry.js';
export { projectScopedStorage } from './persistence/ProjectScopedStorage.js';

// P9-W5 additions
export type {
    IProjectSnapshot,
    ILoadResult,
    IProjectSaveDelegate,
    IProjectLoadDelegate,
} from './persistence/DelegateTypes.js';
export {
    installProjectIsolationAudit,
    getIsolationLeakHistory,
    detectLeaks,
    // §L-676 (C13 §3.10) — project-scope probes: the audit's GIS/site-side eyes.
    registerProjectScopeProbe,
    listProjectScopeProbes,
    readProjectScopeProbes,
    _resetProjectScopeProbesForTest,
} from './persistence/ProjectIsolationAudit.js';
export type { ProjectScopeProbe, ScopeProbeReading } from './persistence/ProjectIsolationAudit.js';
// ── ADR-0298 §PROBE-SET-DECLARED — the declared expected probe set ──────────
export {
    DECLARED_PROJECT_SCOPES,
    DECLARED_PROJECT_SCOPE_NAMES,
    DECLARED_PROJECT_SCOPE_SET_VERSION,
    DECLARED_SCOPES_REQUIRING_PRESENCE,
    LOAD_DERIVED_ELEMENT_TYPES,
} from './persistence/declaredProjectScopes.js';
export type { DeclaredProjectScope, ProjectScopePresence } from './persistence/declaredProjectScopes.js';
export {
    isMigrationComplete,
    runVGToIntentMigration,
    prewarmIntentStyleCache,
} from './persistence/migrations/VGToIntentMigration.js';

// ── Sprint E P9-W10 (2026-05-10) — persistence/SnapshotConstants ─────────────
export { SNAPSHOT_SCHEMA_VERSION } from './persistence/SnapshotConstants.js';

// ── views ─────────────────────────────────────────────────────────────────

export type {
    VisibilityRuleStub, ViewType, ViewSpatialContext, ViewGeometryLens,
    ViewSectionVolume, ViewTemporalContext, ViewVisualStyle, ViewOutputSettings,
    ViewRangeBound, ViewRangeSettings, ViewCropSettings, ViewUnderlaySettings,
    AnnotationVisibilitySettings, ViewSemanticContext, ViewTemplateLock,
    OverridePenStyle, ViewCategoryOverride, ViewElementOverride, ViewDefinition,
    ViewProjectionSettings, ViewLightingSettings, ViewSectionBox,
    ViewDefinitionStoreSnapshot,
    // §FEAT-DOOR-PLAN-SYMBOL-DETAIL-LEVEL (L-241) P1 — one owner: @pryzm/schemas.
    DetailLevel,
} from './views/ViewDefinitionTypes.js';
export {
    ALL_VIEW_TYPES, PLAN_VIEW_TYPES, VIEW_PROJECTION_DIRECTIONS,
    // §ELEV-SCOPE-DEPTH (L-1855) — ONE far-clip expression, two NAMED fallbacks.
    // Every producer of an elevation far clip (projector + plan scope symbol +
    // scope drag) resolves through resolveElevationFarDepth; never inline a magic
    // `?? 8` / `?? 200` again. See ViewDefinitionTypes for the derivation.
    UNCLIPPED_ELEVATION_FAR_DEPTH_M, DEFAULT_ELEVATION_SCOPE_DEPTH_M,
    resolveElevationFarDepth,
    // §CROP-IS-THE-CLIP (L-4500) — the crop rectangle IS the clip range. ONE
    // near/far resolution for every producer of an elevation depth window:
    // projector clip planes, oriented section box, plan scope rectangle, drag
    // seed. `resolveElevationFarDepth` is now a thin `.far` wrapper over it.
    resolveElevationClipRange,
    MIN_ELEVATION_CLIP_DEPTH_M,
    // §CROP-IS-THE-CLIP (L-4500) — the plan-family CULL margin on spatial.cropRegion.
    // Not a clip range. See its JSDoc before reading a ~0.10 m discrepancy as a defect.
    CROP_REGION_CULL_MARGIN_M,
} from './views/ViewDefinitionTypes.js';
export type { ElevationClipRange, ElevationClipSource } from './views/ViewDefinitionTypes.js';
// §FIX-ELEVATION-POCHE / §FIX-ELEVATION-SCOPE (L-119 / L-120 P4) — unified view scope.
export { resolveViewScope, resolveOcclusionDisposition, resolveBeyondLineStyle } from './views/ViewScope.js';
export type { ViewScope } from './views/ViewScope.js';

// ── BimKernel + SpatialAuthority (P9-W2 2026-05-10) ────────────────────────

export type { Level, Grid } from './BimKernel.js';
export { SpatialResolutionError, BimManager } from './BimKernel.js';

export type { WorldTransform } from './SpatialAuthority.js';
export { SpatialAuthorityError, SpatialAuthority, spatialAuthority } from './SpatialAuthority.js';

export { LevelVisualizer } from './LevelVisualizer.js';
export { BimGridRenderer } from './BimGridRenderer.js';
export * from './stores/index.js';

// ── rendering/ (P9-W3 2026-05-10) ───────────────────────────────────────────

export type { RenderPassKind, FrameCoordinatorStats } from './rendering/FrameCoordinator.js';
export { RENDER_PASS_KINDS, DEFAULT_GRACE_FRAMES, FrameCoordinator } from './rendering/FrameCoordinator.js';

export type { RenderCallback, TargetFPS, TickPriority, TickListener } from './rendering/UnifiedFrameLoop.js';
export { UnifiedFrameLoop, unifiedFrameLoop } from './rendering/UnifiedFrameLoop.js';

// ── §PERF instrumentation (L-02/L-03) — gated behind globalThis.__pryzmPerfTrace ──
export {
    perfTraceOn, perfAccum, perfTime, perfRead, perfReset, perfLog, perfDump,
} from './rendering/perfTrace.js';

// §DEFER-TIER-DURING-DRAW (2026-07-02) — tool-interaction latch so the render
// tier escalation can be deferred while a wall/tool draw is in progress.
export type { ToolInteractionRefApi, DeferredTierApply } from './rendering/ToolInteractionRef.js';
export { toolInteractionRef } from './rendering/ToolInteractionRef.js';

// ── views/ stores (P9-W4 2026-05-10) ────────────────────────────────────────

export { viewDefinitionStore } from './views/ViewDefinitionStore.js';
export type { ViewDefinitionStoreImpl } from './views/ViewDefinitionStore.js';

export { ViewTechnicalDrawingCache, viewTechnicalDrawingCache } from './views/ViewTechnicalDrawingCache.js';

export { ViewDependencyTracker, viewDependencyTracker, PLAN_INCREMENTAL_SAFE_TYPES } from './views/ViewDependencyTracker.js';

// ── batch/ (P9-W4 2026-05-10) ────────────────────────────────────────────────

export type { BatchOptions } from './batch/BatchCoordinator.js';
export { batchCoordinator } from './batch/BatchCoordinator.js';

// ── presentation/ additional (P9-W4 Sprint A 2026-05-10) ─────────────────────

export { setUD, deleteUD } from './presentation/userDataSafe.js';

export { GraphicHierarchyRenderer } from './presentation/GraphicHierarchyRenderer.js';

export { PresentationEngine } from './presentation/PresentationEngine.js';

export { CURRENT_INTENT_SCHEMA_VERSION, migrateIntentToCurrent } from './presentation/migrations/IntentSchemaMigrations.js';

export type { ZoneClassification } from './presentation/ViewRangeClassifier.js';
export { classifyElement, classifyScene } from './presentation/ViewRangeClassifier.js';

export {
    defaultStateAppearance,
    defaultRulesForElementType,
    DEFAULT_ELEMENT_GRAPHICS_RULES,
    cloneDefaultElementGraphicsRules,
} from './presentation/VisibilityIntentDefaults.js';

export type {
    VGCategoryStyle,
    AnnotationStyleRecord,
    VGTemplate,
    VGModelRecord,
    VGViewRecord,
    VGResolvedStyle,
    VGGovernanceStoreImpl,
} from './presentation/VGGovernanceStore.js';
export { vgGovernanceStore } from './presentation/VGGovernanceStore.js';

// §ROOM-VG-CATEGORY (L-1610) — `room` as a first-class VG category + the per-view
// resolution of how rooms are colour-coded (by type / size / user-defined / all white).
export type { RoomColourMode, RoomColourIntent } from './presentation/RoomColourIntent.js';
export {
    ROOM_VG_CATEGORY,
    DEFAULT_ROOM_COLOUR_MODE,
    DEFAULT_UNIFORM_ROOM_COLOUR,
    ROOM_COLOUR_MODE_CHOICES,
    isRoomColourMode,
    resolveRoomColourIntent,
    activeRoomColourIntent,
    getActiveRoomColourViewId,
    setActiveRoomColourViewId,
    getRoomColourModelId,
    setRoomColourModelId,
} from './presentation/RoomColourIntent.js';
// §FIX-VISIBILITY-INTENT-AUTHORITY (L-776) — the ONE VG→canvas contribution resolver.
export { resolveVgCanvasStyle } from './presentation/VgCanvasStyleResolver.js';
export type { VgCanvasStyle } from './presentation/VgCanvasStyleResolver.js';

export type { VGInstanceOverrideStoreImpl } from './presentation/VGInstanceOverrideStore.js';
export { vgInstanceOverrideStore } from './presentation/VGInstanceOverrideStore.js';

export { viewportPreviewRenderer, fitLetterbox } from './presentation/ViewportPreviewRenderer.js';
export type { Resolved3DCapture, LetterboxFit } from './presentation/ViewportPreviewRenderer.js';

export type { IntentUsageSummary } from './presentation/selectors/intentUsageCount.js';
export { intentUsageCount, formatIntentUsageLabel } from './presentation/selectors/intentUsageCount.js';

// ── P9-W4 Wave 1 (2026-05-10) — views/ + drawing/ + presentation/ ────────────

export type {
    LayoutRuleAnchor, LayoutRuleAlign, LayoutRuleDistribute, LayoutRuleGrid,
    LayoutRuleStack, LayoutRuleSpec, LayoutRule, LayoutPreset, LayoutPresetKey,
    ResolvedPosition,
} from './views/LayoutTypes.js';

export type {
    DataPanelStyle, DataPanelType, DataPanel,
    AnnotationCategory, AnnotationLayerRule, AnnotationLayer, DataPanelStoreSnapshot,
} from './views/DataPanelTypes.js';

export type {
    PhaseDisplayStatus, PhaseFilterRule, PhaseFilter, PhaseFilterStoreSnapshot,
} from './views/PhaseFilterTypes.js';
export { BUILT_IN_PHASE_FILTER_IDS } from './views/PhaseFilterTypes.js';

export { VIEW_RANGE_PRESETS, computeViewRangeDefaults } from './views/ViewRangeDefaults.js';

export type { ElementSpatialIndexEntry } from './drawing/ElementSpatialIndex.js';
export { ElementSpatialIndex, elementSpatialIndex } from './drawing/ElementSpatialIndex.js';

export {
    defaultInheritanceContext,
    resolveBoundIntentWithInheritance,
    getInheritedFromViewId,
    resolveInheritanceChain,
} from './presentation/IntentBindingResolver.js';

export { CropRegionFilterService } from './presentation/CropRegionFilterService.js';

export { UnderlayRenderService } from './presentation/UnderlayRenderService.js';

// ── P9-W4 Wave 2 (2026-05-10) ────────────────────────────────────────────────

export type { PaperParams } from './presentation/LayoutEngine.js';
export { layoutEngine } from './presentation/LayoutEngine.js';
export type { LayoutEngineImpl } from './presentation/LayoutEngine.js';

export { dataPanelRenderer } from './presentation/DataPanelRenderer.js';
export type { DataPanelRendererImpl } from './presentation/DataPanelRenderer.js';

export {
    DEFAULT_BELOW_LEVEL_DEPTH,
    resolveViewRangeWorldY,
    resolveEffectiveViewRange,
    resolveEffectivePlanDepthY,
} from './presentation/ViewRangeIntentResolver.js';

export { ThreeDAppearanceResolver, threeDAppearanceResolver } from './presentation/ThreeDAppearanceResolver.js';

export { phaseFilterStore } from './views/PhaseFilterStore.js';
export type { PhaseFilterStoreImpl } from './views/PhaseFilterStore.js';

// ── P9-W4 Wave 3 (2026-05-10) ────────────────────────────────────────────────

export { ViewRangeFilterService } from './presentation/ViewRangeFilterService.js';

export { ViewRangeZoneApplicator } from './presentation/ViewRangeZoneApplicator.js';

// ── P9-W4 Batch 4A (2026-05-10) — IFCPsetAdapter + TemporalGraph ─────────────

export type { IFCPsetDict, IFCFlatProps, IFCPsetAdapterImpl } from './IFCPsetAdapter.js';
export { ifcPsetAdapter } from './IFCPsetAdapter.js';

export type { SessionSummary } from './TemporalGraph.js';
export { TemporalGraphManager, temporalGraphManager } from './TemporalGraph.js';

// ── P9-W4 Batch 4B (2026-05-10) — SemanticIndex + GhostOverlayRenderer ───────

export type { SemanticQueryExpression, SemanticIndexImpl } from './SemanticIndex.js';
export { semanticIndex } from './SemanticIndex.js';

export { initGhostOverlayRenderer } from './presentation/GhostOverlayRenderer.js';

// ── P9-W4 Batch 4C (2026-05-10) — VisibilityRuleEngine ───────────────────────

export type { VisibilityRuleEngineImpl } from './presentation/VisibilityRuleEngine.js';
export { visibilityRuleEngine } from './presentation/VisibilityRuleEngine.js';

// ── P9-W4 Batch 4D (2026-05-10) — VGSceneApplicator ─────────────────────────

export { VGSceneApplicator } from './presentation/VGSceneApplicator.js';

// ── annotations/ — §FEAT-AUTO-TAG-BATCH-EXECUTOR (L-265) ─────────────────────
// The GENERIC tag engine: one lifecycle (create · refresh · dedupe · un-orphan),
// N categories (room / door / window / wall), two projections (plan / elevation).
// Consumers: RoomTagAutoPopulator (@pryzm/room-topology) and the editor's
// autoTagActiveView. Nobody else may grow a second tag lifecycle.
export * from './annotations/index.js';

// ── schedules/ + requirements/ (P9-W6 2026-05-10) ────────────────────────────

export type { ScheduleColumn, ScheduleDefinition } from './schedules/ScheduleRegistry.js';
export { ScheduleRegistry } from './schedules/ScheduleRegistry.js';
export { ScheduleExtractor } from './schedules/ScheduleExtractor.js';

// ── quantities/ — the *medición* read-model (lane DATA1, 2026-08-21) ──────────
// Re-exported from the root barrel so `apps/editor` reaches it the same way it
// already reaches ScheduleExtractor. The leaf subpath `@pryzm/core-app-model/quantities`
// is also published for consumers that must avoid the root barrel at module load
// (MEMORY §SCC: no barrel access at module load).
export type {
    QuantityUnit, TakeoffChapterId, TakeoffChapterDef, SecondaryMeasure,
    TakeoffLine, CoverageState, CoverageRow, TakeoffResult,
    TakeoffStores, RateEntry, RateBook, CostedLine, CostedTakeoff, CostSummary,
    UnpricedReason, RateImportResult,
    // 4D / 6D (lane DIM46, 2026-08-21; ADR-0351) - the same take-off, two more
    // questions asked of it. There is ONE measurement engine in this product.
    MaterialVolume,
    CarbonOverrideBook, CarbonMaterialRow, CarbonLine, CarbonChapterTotal,
    CarbonGapRow, CarbonSummary, CarbonResult,
    ConstructionSchedule, ConstructionTask, TaskProgressState, ResolvedTask,
    TaskStateAt, ScheduleStateAt, ScheduleCoverage,
} from './quantities/index.js';
export {
    UNIT_LABEL, TAKEOFF_CHAPTERS,
    computeTakeoff, defaultTakeoffStores, wallBaselineLength, openingVoidArea,
    applyRates, chapterSubtotals,
    takeoffToCsv, costedTakeoffToCsv, rateBookToCsv, parseRateCsv,
    computeCarbon, carbonToCsv, scheduleToCsv,
    EMPTY_SCHEDULE, resolveTasks, scheduleStateAt, scheduleCoverage, taskFromLine,
    taskFinishDate, taskWindowMs, taskProgressAt, scheduleWindowMs, taskDefects,
} from './quantities/index.js';

export type {
    RequirementStatus,
    SpatialRequirements,
    PhysicsRequirements,
    FinishRequirements,
    AssetRequirements,
    SafetyRequirements,
    RequirementParameters,
    RequirementMetadata,
    RoomRequirement,
    RequirementParamUpdate,
} from './requirements/RequirementTypes.js';

export {
    SpatialRequirementsSchema,
    PhysicsRequirementsSchema,
    FinishRequirementsSchema,
    AssetRequirementsSchema,
    SafetyRequirementsSchema,
    RequirementParametersSchema,
    RequirementMetadataSchema,
    RequirementStatusSchema,
    RoomRequirementAddSchema,
    RoomRequirementUpdateSchema,
    formatRequirementZodError,
} from './requirements/RequirementSchema.js';

export { RequirementStore, requirementStore } from './requirements/RequirementStore.js';

// ── Sprint B P9-W8 (2026-05-10) — scene/ + geometry/ + views/ wave ───────────

export {
    BIM_LAYER, EDITOR_LAYER, ANNOTATION_LAYER, PLAN_SYMBOL_LAYER, DOCUMENTATION_LAYER,
    SceneBoundsCache, SceneObjectClassifier, PreviewRegistry, previewRegistry,
    StairPlanSymbolRegistry, stairPlanSymbolRegistry,
} from './scene/index.js';

export type { NMEExportOptions } from './geometry/NativeElementMeshExporter.js';
export { NativeElementMeshExporter, nativeElementMeshExporter } from './geometry/NativeElementMeshExporter.js';

export type { IViewSwitchListener } from './views/IViewSwitchListener.js';
export type { TitleBlockFieldZone, TitleBlockRevisionZone, TitleBlockTemplate } from './views/TitleBlockTypes.js';
export { PAPER_SIZES } from './views/TitleBlockTypes.js';
export type { ScheduleType, ScheduleDefinitionStoreSnapshot } from './views/ScheduleDefinitionTypes.js';
export type { ScheduleDefinition as ViewScheduleDefinition } from './views/ScheduleDefinitionTypes.js';
export { emitPlanViewMotionEvent } from './views/otel.js';
export type { ViewPlane } from './views/ViewPlane.js';
export { viewPlaneFromDefinition, canvasHitToWorld3D, snapToViewPlane } from './views/ViewPlane.js';
export { LevelClipPlaneCache, levelClipPlaneCache } from './views/LevelClipPlaneCache.js';
export type { DrawingBounds } from './views/TechnicalDrawingBounds.js';
export { TechnicalDrawingBounds, NON_CONTENT_LAYERS, isNonContentLayer } from './views/TechnicalDrawingBounds.js';
export { OrthoPlanCameraLockController } from './views/OrthoPlanCameraLockController.js';
export { DEFAULT_SNAP_PIXEL_RADIUS, MIN_WORLD_TOLERANCE_M, MAX_WORLD_TOLERANCE_M, LEGACY_FALLBACK_TOLERANCE_M, getWorldToleranceForPixels, getWorldToleranceForActiveCamera } from './views/CameraToleranceService.js';
export type { ToleranceOptions } from './views/CameraToleranceService.js';
export { ViewCameraStateStore } from './views/ViewCameraStateStore.js';
export type { ActivePlanDrawingRef } from './views/ActivePlanDrawingRef.js';
export { activePlanDrawingRef } from './views/ActivePlanDrawingRef.js';
export { ViewVisibilityMap } from './views/ViewVisibilityMap.js';
export type { RevisionEntry, SheetViewport, SheetStatus, SheetDefinition, PaperSize, OutputConfig, SheetDefinitionStoreSnapshot } from './views/SheetDefinitionTypes.js';
export { getViewIds } from './views/SheetDefinitionTypes.js';
export { FastPathProjectorService } from './views/FastPathProjectorService.js';
export { ifcProjectionStore, IFC_PROJECTION_CHANGED_EVENT } from './views/IFCProjectionStore.js';
export type { IFCProjectionStoreImpl } from './views/IFCProjectionStore.js';
export type { UnderlayRenderRef } from './views/FloorPlanUnderlayRef.js';
export { floorPlanUnderlayRef } from './views/FloorPlanUnderlayRef.js';
export { ViewRenderCache, viewRenderCache } from './views/ViewRenderCache.js';
export type { SheetComment, SheetCommentReply, CursorPresence } from './views/SheetCommentStore.js';
export { sheetCommentStore } from './views/SheetCommentStore.js';
export type { SheetCommentStoreImpl } from './views/SheetCommentStore.js';
export { titleBlockStore } from './views/TitleBlockStore.js';
export type { TitleBlockStoreImpl } from './views/TitleBlockStore.js';
export { scheduleStore } from './views/ScheduleStore.js';
export type { ScheduleStoreImpl } from './views/ScheduleStore.js';
// #105 Materials Repository — user-managed material store (Phase 1 data layer).
// C100 §2.1 — THE ONE material-colour resolution ladder (override -> T2 -> T1 ->
// NAMED unresolved). Exported here so no family has to chain the two tiers itself;
// a private chain is how a sixth material vocabulary gets written (C100 §1.1).
export { resolveMaterialColour } from './materialResolution.js';
export type { MaterialColourResolution } from './materialResolution.js';
export { userMaterialStore } from './stores/UserMaterialStore.js';
export type { UserMaterialStoreImpl, UserMaterialDef, UserMaterialStoreSnapshot } from './stores/UserMaterialStore.js';
export { sheetStore } from './views/SheetStore.js';
export type { SheetStoreImpl } from './views/SheetStore.js';
export type { ViewTemplate, ViewTemplateStoreSnapshot } from './views/ViewTemplateTypes.js';
export { viewTemplateStore } from './views/ViewTemplateStore.js';
export type { ViewTemplateStoreImpl } from './views/ViewTemplateStore.js';
export type { SnapResult } from './views/PlanView2DSnapService.js';
export { PlanView2DSnapService, planView2DSnapService } from './views/PlanView2DSnapService.js';
export { GroundFloorPlanController } from './views/GroundFloorPlanController.js';
export { PlanView2DCreationMode, planView2DCreationMode } from './views/PlanView2DCreationMode.js';
export { ViewportThumbnailRenderer, viewportThumbnailRenderer } from './views/ViewportThumbnailRenderer.js';
export { PlanViewVisibilityCuller } from './views/PlanViewVisibilityCuller.js';
export { DEFAULT_3D_VIEW_ID, DEFAULT_PLAN_VIEW_ID, initDefaultViewsManager } from './views/DefaultViewsManager.js';
// §FEAT-LEVEL-RELATIVE-PLAN-VIEWS (L-720) — the level→plan-view resolver. Every
// reference surface (mesh export band, clip range, edge projection, drawing cache,
// room tags, plan snapping) is already parametric on `viewDef.spatial.levelId`;
// these are what make the ACTIVE plan view follow the ACTIVE level.
export {
    planViewIdForLevel, findPlanViewForLevel, ensurePlanViewsForLevels, removePlanViewForLevel,
} from './views/DefaultViewsManager.js';
// §FIX-VIEW-DELETE-ORPHANS (G8) — per-view dependent state dies with its view (and
// is re-instated when DeleteViewDefinitionCommand.undo() restores it).
export { initViewDeletionCascade } from './views/ViewDeletionCascade.js';
export type { ViewDependentState } from './views/ViewDeletionCascade.js';
export type { PlanWorldToScreen, PlanViewAnnotationRenderOptions } from './views/PlanViewAnnotationRenderer.js';
export { DRAGGABLE_ANNOTATION_TYPES, PlanViewAnnotationRenderer, planViewAnnotationRenderer } from './views/PlanViewAnnotationRenderer.js';
export type { OrthographicViewDirection, OrthographicViewConfig, EmptySceneConfig } from './views/PlanViewService.js';
export { PlanViewService } from './views/PlanViewService.js';

// ── Sprint D P9-W9 (2026-05-10) — geometry/WallJoinAuditUtils ────────────────

export type { JoinAdjustment, JoinResult } from './geometry/WallJoinAuditUtils.js';

// ── Sprint E P9-W10 (2026-05-10) — geometry/WallJoinTypes (JoinData for packages) ──
export type { JoinData } from './geometry/WallJoinTypes.js';
export {
    validateEndpointConvergence,
    computeBisector,
    computeMiterNormal,
    diagnoseJoinRobustness,
} from './geometry/WallJoinAuditUtils.js';

// ── Sprint H P9 (2026-05-10) — SemanticGraph + SpatialIndex + templates + catalog/stores extensions ──

export type { RelationshipType, Relationship, SemanticGraph } from './SemanticGraph.js';
// ADR-0321 — joinedTo writer-input + typed-reader result shapes
export type { JoinedToJunctionType, JoinedToJunctionInput, JoinedWallsQuery } from './SemanticGraph.js';
// §SITSON-REVERSE-READER / §HOSTEDBY-REVERSE-READER (C71 §2.1 #5 / #1) — the
// refusal-bearing result types of the two typed reverse readers.
export type { SittingOnQuery, HostWallQuery } from './SemanticGraph.js';
// §GR10-DESERIALIZE-DROP-REPORT (C71 §5.7) — the load outcome a caller branches
// on. Exported because the loaders are the callers: a drop that only the graph
// knows about is the silence this shape exists to end.
export type {
    SemanticGraphLoadResult,
    DroppedRelationshipRow,
    RelationshipDropReason,
} from './SemanticGraph.js';
export { SemanticGraphManager, semanticGraphManager } from './SemanticGraph.js';

export type { AABB } from './SpatialIndex.js';
export { SpatialIndex, roomSpatialIndex } from './SpatialIndex.js';

export * from './templates/index.js';

export { AssetCatalogStore, assetCatalogStore } from './catalog/AssetCatalogStore.js';
export {
    AssetCatalogEntryAddSchema,
    AssetCatalogEntryUpdateSchema,
    formatAssetCatalogZodError,
} from './catalog/AssetCatalogSchema.js';
export { buildDefaultAssetCatalog } from './catalog/assetCatalogDefaults.js';

// ── Sprint H P9 — ProjectSnapshot concrete type + UiPreferences ───────────────
export type { ProjectSnapshot } from './persistence/DelegateTypes.js';
export { UiPreferences } from './ui/UiPreferences.js';
export type { UiPrefsData } from './ui/UiPreferences.js';

// ── Sprint H P9 — ElementCodeStore ────────────────────────────────────────────
export type { ElementCode } from './ElementCodeStore.js';
export { ElementCodeStore, elementCodeStore } from './ElementCodeStore.js';

// ── Sprint M (2026-05-10) — PlanViewCanvas + PlanSnapEngine + PlanElementDragController + lighting ──

export type {
    LightingFixtureType,
    DownlightParams, PendantParams, LinearLedParams, PendantPebbleParams,
    PendantCeramicBellParams, PendantConicalParams, FloorWoodPostParams,
    FloorArcBrassParams, TableTerracottaParams, FloorTripodBlackParams,
    MirrorLightParams,
    PendantClusterParams,
    LightEmissionConfig, LightingData,
    // §FEAT-LOD200-LUMINAIRES (L-1330) — the ONE override block shared by all twenty.
    Lod200OverrideParams,
} from './lighting/LightingTypes.js';
export { FLOOR_MOUNTED_FIXTURES, MIRROR_LIGHT_DEFAULTS, PENDANT_CLUSTER_DEFAULTS } from './lighting/LightingTypes.js';

// ── §FEAT-FIXTURE-PHOTOMETRY (2026-08-06) ────────────────────────────────────
// The single photometric authority for every artificial fixture (lumens/kelvin
// per family, scene candela scale, day/night multipliers) and the bounded
// live-light budget that keeps it affordable. Pure — no THREE, no DOM, no I/O.
export type { FixturePhotometry, FurnitureLampKind, LightingConstructionForm } from './lighting/FixturePhotometry.js';
export {
    LIGHTING_FIXTURE_PHOTOMETRY,
    FURNITURE_LAMP_PHOTOMETRY,
    FALLBACK_PHOTOMETRY,
    SCENE_CANDELA_PER_REAL_CANDELA,
    FIXTURE_DAY_MULTIPLIER,
    FIXTURE_NIGHT_MULTIPLIER,
    FIXTURE_LIGHT_ROLE,
    photometryForFixture,
    photometryForFurnitureLamp,
    constructionFormFor,
    candelaFromLumens,
    beamSolidAngleSr,
    sceneIntensityFor,
    lensEmissiveFor,
    kelvinToLinearRgb,
    kelvinToHex,
} from './lighting/FixturePhotometry.js';


// ── §FEAT-LOD200-LUMINAIRES (L-1330, 2026-08-19) ─────────────────────────────
// The LOD-200 luminaire MATRIX: twenty generic architectural, exterior and
// life-safety families authored as short rows of independent facts, with reach,
// optical form, efficacy, efficacy class, floor-seating, the photometry rows and
// the type-picker rows all DERIVED from them. Adding a twenty-first luminaire is
// one row there and zero lines anywhere else.
export type {
    Lod200FixtureRow, Lod200FixtureId, Lod200Archetype, Lod200Face,
    Lod200Location, Lod200EfficacyClass, Lod200PhotometryRow,
} from './lighting/Lod200FixtureCatalogue.js';
export {
    LOD200_FIXTURE_ROWS,
    LOD200_FIXTURE_IDS,
    LOD200_FLOOR_MOUNTED_IDS,
    EFFICACY_BANDS,
    lod200Row,
    reachForLumens,
    formForFace,
    efficacyLmPerW,
    efficacyClassFor,
    minIpForLocation,
    lod200BodyColor,
    lod200BodyAppearance,
    isGeneralLightingFixture,
    photometryRowsForLod200,
    lod200TypeDefinitionRows,
} from './lighting/Lod200FixtureCatalogue.js';

export type { LightBudgetCandidate, LightBudgetSelection } from './lighting/LiveLightBudget.js';
export {
    LIVE_LIGHT_BUDGET_BY_TIER,
    DEFAULT_LIVE_LIGHT_BUDGET,
    liveLightBudgetForTier,
    selectLiveLights,
} from './lighting/LiveLightBudget.js';
export type { SceneQualityTier } from './rendering/SceneQualityTierManager.js';

export type { RenderLightingSymbolsOptions } from './views/symbols/LightingPlanSymbolRenderer.js';
export { renderLightingSymbols } from './views/symbols/LightingPlanSymbolRenderer.js';

export type {
    PlanViewCanvasStyle, PlanViewCanvasOptions, PlanViewCanvasRenderOptions,
} from './views/PlanViewCanvas.js';
export {
    DEFAULT_PLAN_VIEW_CANVAS_FRUSTUM,
    MINIMUM_PLAN_VIEW_CANVAS_FRUSTUM,
    // §PLAN-CAMTARGET-SANITY (L-481/L-604) — exported so the PRODUCER
    // (SplitViewManager._fitCamTargetToScene) refuses against the SAME bound the consumer
    // enforces. A second hand-typed limit would drift, and the drift would be invisible.
    PLAN_CAMTARGET_MAX_ABS_M,
    PlanViewCanvas,
} from './views/PlanViewCanvas.js';
// §CROP-HANDLE-IS-GRABBABLE (L-4302) — the crop-handle id union + the ONE grab radius.
export type { CropHandleId } from './views/PlanViewCanvas.js';
// §CROP-OVERLAY-IS-PRYZM-PURPLE (L-4300) — the view-authoring overlay palette.
export {
    CROP_INK,
    CROP_HANDLE_DRAWN_PX,
    CROP_HANDLE_DRAWN_HOVER_PX,
    CROP_HANDLE_GRAB_PX,
    cropZoneFill,
} from './views/ViewCropPalette.js';

export type { PlanSnapType, PlanSnapResult } from './views/PlanSnapEngine.js';
export { PlanSnapEngine } from './views/PlanSnapEngine.js';

export { PlanElementDragController, planElementDragController } from './views/PlanElementDragController.js';

// ── Sprint L (2026-05-10) — core top-level batch ──────────────────────────────

export {
    SCENE_BG_HEX, SCENE_BG_NUM, SCENE_BG_DARK_HEX, GRID_COLOR_NUM,
    SCENE_BG_STORAGE_KEY, SceneTheme,
} from './SceneTheme.js';

export { InfiniteGrid3D } from './InfiniteGrid3D.js';

export { ArchitectureFragments } from './ArchitectureFragments.js';

export type { RebuildTask, RebuildDispatcher, AffectedSet } from './DependencyResolver.js';
export { DependencyResolver, dependencyResolver } from './DependencyResolver.js';

export { decisionRecordStore } from './DecisionRecordStore.js';

export { createBimWorld } from './BimWorld.js';

// ── Sprint L drawing sub-barrel re-exports ────────────────────────────────────

export { applyOcclusion, VIEW_DEPTH_KEY } from './drawing/HiddenLineRemoval.js';
export type { OcclusionOptions, OcclusionResult } from './drawing/HiddenLineRemoval.js';

export type { SymbolSegment } from './drawing/SymbolicRuleRenderer.js';
export {
    hasSymbolicRenderer,
    renderSymbol,
    symbolicRuleForLayer,
    elementTypeForSymbolLayer,
} from './drawing/SymbolicRuleRenderer.js';

// §ELEV-SYMBOL-OPENING (L-1240) — the total elevation basis + the authored opening symbol.
export type {
    ElevationViewBasis,
    ElevationBasisRefusal,
    ElevationSymbolHost,
    ElevationSymbolOpening,
    ElevationSymbolPolyline,
    ElevationSymbolRefusal,
    ElevationSymbolResult,
} from './drawing/index.js';
export {
    elevationViewBasis,
    elevationBasisRefusal,
    projectToElevation,
    buildOpeningElevationSymbol,
    nearFaceSign,
    buildWallElevationSymbol,
    wallNearFaceSign,
    openingElevationSymbolBuilder,
    suppressSymbolisedElementLinework,
    DOOR_SYM_LAYER,
    GLAZ_SYM_LAYER,
    WALL_SYM_LAYER,
} from './drawing/index.js';

// ── Sprint K (2026-05-10) — comparison/ + remediation/ ────────────────────────
export type {
    DeltaStatus,
    DeltaSeverity,
    DeltaCategory,
    DeltaEntry,
    DeltaMap,
} from './comparison/ComparisonEngine.js';
export { ComparisonEngine, comparisonEngine } from './comparison/ComparisonEngine.js';

export type { AutoRemediatePayload } from './remediation/AutoRemediateCommand.js';
export { AutoRemediateCommand } from './remediation/AutoRemediateCommand.js';


// ── Sprint Z (2026-05-12) — DrawingSelectionIndex ────────────────────────────
export type { SegmentUUIDMap } from './views/DrawingSelectionIndex.js';
export { registerSegmentUUID, lookupElementUUID } from './views/DrawingSelectionIndex.js';

// ── Sprint V (2026-05-12) — preview/PreviewStyle ───────────────────────────
export type {
    PreviewColor,
    GhostBodyOptions,
    GhostBoxOptions,
} from './preview/PreviewStyle.js';
export {
    PREVIEW_COLOR,
    OBJECT_PREVIEW_OPACITY,
    createGhostBodyMaterial,
    createObjectPreviewMaterial,
    createFootprintLineMaterial,
    createMarkerMaterial,
    tagPreview,
    disposePreviewObject,
    createGhostBoxBetween,
    createFootprintLine,
} from './preview/PreviewStyle.js';

// ── §FIX-THUMBNAIL-DURABILITY — project-preview payload budget ──────────────
// Single declaration of the `PATCH /api/projects/:id/thumbnail` ceiling plus
// the encode ladder that keeps a capture inside it, so a preview can actually
// REACH its durable per-user home (`projects.thumbnail`) instead of living only
// in a client cache that sign-out deletes by design.
export type {
    ThumbnailEncodeAttempt,
    ThumbnailFitFailure,
    ThumbnailFitResult,
} from './preview/thumbnailBudget.js';
export {
    THUMBNAIL_MAX_CHARS,
    THUMBNAIL_ENCODE_LADDER,
    fitThumbnailToBudget,
} from './preview/thumbnailBudget.js';

// ── §FEAT-PLACEMENT-SPACEBAR-ROTATE (ADR-0105) — shared SPACE-to-rotate state ──
// Single source of truth for one-click placement pre-rotation (furniture, GLB
// carousel drops, plumbing, lighting, …). Each placement tool constructs ONE
// instance, attach()es on activate / detach()es on deactivate, reads
// rotationY() for the live ghost + the create-command `rotation` payload.
export type { PrePlacementRotationOptions } from './preview/PrePlacementRotation.js';
export {
    PrePlacementRotation,
    PRE_PLACEMENT_ROTATION_STEP,
} from './preview/PrePlacementRotation.js';

// ── §FEAT-DOOR-FLIP-ON-SPACE (L-92, ADR-0107) — shared SPACE-to-flip state ────
// Door analogue of PrePlacementRotation: a cyclic 4-state flip (swing in/out ×
// hinge left/right) for wall-hosted door placement. DoorPlanToolHandler (plan)
// and DoorTool (3D) advance it on SPACE and read swingDirection()/hingesSide()
// into the wall.opening.create payload so the committed door carries the preview.
export type {
    DoorPlacementFlipOptions,
    DoorFlipState,
    DoorSwingDirection,
    DoorHingeSide,
} from './preview/DoorPlacementFlip.js';
export {
    DoorPlacementFlip,
    DOOR_FLIP_STATES,
} from './preview/DoorPlacementFlip.js';

// ── Sprint AB (2026-05-12) — ToolName + ToolState ────────────────────────────
export type { ToolName } from './tool-types.js';
export { ToolState } from './tool-types.js';

// ── Sprint AG (2026-05-12) — services/ extraction ────────────────────────────
export { getStoredToken, getCurrentUserId, apiFetch } from './apiFetch.js';
export { getCesium } from './cesiumLoader.js';
export { debug } from './debugOverlay.js';
export { resolveRoomFinishes, FINISH_UNDETERMINED } from './RoomFinishResolver.js';
export type { ResolvedRoomFinishes } from './RoomFinishResolver.js';
// §FIX-BOUNDING-WALLS-UNDETERMINED (C78 §1.4 · C71 §4.4 · C79 §5.2.0) — THE
// discriminator every reader of `boundingWallIds` uses in place of `?? []`.
export {
  determineBoundingWalls,
  boundingWallIdsOrUnknown,
  isBoundingWallsUndetermined,
  boundingWallsUndeterminedLabel,
} from './boundingWallDetermination.js';
export type {
  BoundingWallDetermination,
  BoundingWallUndeterminedReason,
  BoundingWallCarrier,
} from './boundingWallDetermination.js';
export { RoomFinishSyncService } from './RoomFinishSyncService.js';
export type { RoomFinishSyncDeps } from './RoomFinishSyncService.js';
export { sheetIndexService } from './SheetIndexService.js';
export type { SheetIndexRow, SheetIndexServiceImpl } from './SheetIndexService.js';

// ── Sprint AH (2026-05-12) — DrawingEditorService ────────────────────────────
export { drawingEditorService, DrawingEditorService, ANNOTATION_TOOL_IDS } from './views/DrawingEditorService.js';

// ── Sprint AI (2026-05-12) — PocheFillBuilder ────────────────────────────────
export type { PochePolygon } from './views/PocheFillBuilder.js';
export { PocheFillBuilder } from './views/PocheFillBuilder.js';

// ── Sprint AJ (2026-05-12) — Monetization layer ───────────────────────────────
export {
    Feature,
    isPlanAtLeast,
    suggestedUpgradePlan,
    getPlanDisplayName,
    formatPrice,
    PLAN_LIMITS,
    PLAN_PRICING,
    FEATURE_REQUIRED_PLAN,
} from './monetization/PlanConfig.js';
export type { Plan, PlanStatus, PlanLimits, PlanPricing } from './monetization/PlanConfig.js';
export { AIUsageTracker } from './monetization/AIUsageTracker.js';
export { EntitlementStore } from './monetization/EntitlementStore.js';

// §GRID-CONTEXTUAL-EDIT (SV2) — the grid edit-capability table. Pure predicates over a
// structural subject: no store, no THREE, no DOM, no imports at all, so exporting it
// here cannot create a barrel cycle.
export {
    GRID_EDIT_AXES,
    GRID_PINNED_DELETE_IS_UNDECIDED,
    gridEditActiveAxes,
    gridEditAvailability,
} from './grids/GridEditVariants.js';
export type {
    GridEditAxis,
    GridEditAxisRow,
    GridEditOperation,
    GridEditStatus,
    GridEditSubject,
    GridEditVerdict,
} from './grids/GridEditVariants.js';
