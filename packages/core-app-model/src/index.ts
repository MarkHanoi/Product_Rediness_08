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
 *   root          — CoreElement, StoreEventBus, StoreRegistry, MarkGenerator, // TODO(TASK-08)
 *                   SelectionBus, SemanticTagRegistry
 *
 * Layer contract: L3 — may import L0–L2 packages; must not import L4+ packages
 * or any app-layer (apps/*) code.
 *
 * @see docs/03_PRYZM3/04-PLAN-FORWARD/17-WAVES-9-12-SRC-MIGRATION.md §2
 * @see docs/03_PRYZM3/00-PROCESS-TRACKER.md §5 W10-A
 */

// ── drawing ──────────────────────────────────────────────────────────────────

export type { ViewRangeHashInput } from './drawing/DrawingConstants.js';
export {
    EPSILON, SNAP_TOLERANCE, COLLINEAR_ANGLE,
    SCREEN_DPI, EXPORT_DPI, MM_PER_INCH, SCREEN_PX_PER_MM,
    pxPerMm, hashViewRange, hashMatrix4, classificationCacheKey, styleResolverCacheKey,
} from './drawing/DrawingConstants.js';

export type {
    StyledEdge, StyledPolygon, PipelineElementBatch, SerializedRule,
    PipelineRequest, PipelineResult, PipelineError, WorkerOutboundMessage,
} from './drawing/DrawingPipelineTypes.js';

export type { PenStyle, PenZone } from './drawing/PenWeightTable.js';
export { FALLBACK_PEN, resolvePen, penZoneFromFlags, categoryFromFlags } from './drawing/PenWeightTable.js';

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
} from './persistence/ProjectIsolationAudit.js';
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
} from './views/ViewDefinitionTypes.js';
export {
    ALL_VIEW_TYPES, PLAN_VIEW_TYPES, VIEW_PROJECTION_DIRECTIONS,
} from './views/ViewDefinitionTypes.js';

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

// ── views/ stores (P9-W4 2026-05-10) ────────────────────────────────────────

export { viewDefinitionStore } from './views/ViewDefinitionStore.js';
export type { ViewDefinitionStoreImpl } from './views/ViewDefinitionStore.js';

export { ViewTechnicalDrawingCache, viewTechnicalDrawingCache } from './views/ViewTechnicalDrawingCache.js';

export { ViewDependencyTracker, viewDependencyTracker } from './views/ViewDependencyTracker.js';

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

export type { VGInstanceOverrideStoreImpl } from './presentation/VGInstanceOverrideStore.js';
export { vgInstanceOverrideStore } from './presentation/VGInstanceOverrideStore.js';

export { viewportPreviewRenderer } from './presentation/ViewportPreviewRenderer.js';

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

// ── schedules/ + requirements/ (P9-W6 2026-05-10) ────────────────────────────

export type { ScheduleColumn, ScheduleDefinition } from './schedules/ScheduleRegistry.js';
export { ScheduleRegistry } from './schedules/ScheduleRegistry.js';
export { ScheduleExtractor } from './schedules/ScheduleExtractor.js';

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
export { TechnicalDrawingBounds } from './views/TechnicalDrawingBounds.js';
export { OrthoPlanCameraLockController } from './views/OrthoPlanCameraLockController.js';
export { DEFAULT_SNAP_PIXEL_RADIUS, MIN_WORLD_TOLERANCE, MAX_WORLD_TOLERANCE, LEGACY_FALLBACK_TOLERANCE, getWorldToleranceForPixels, getWorldToleranceForActiveCamera } from './views/CameraToleranceService.js';
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
    LightEmissionConfig, LightingData,
} from './lighting/LightingTypes.js';
export { FLOOR_MOUNTED_FIXTURES } from './lighting/LightingTypes.js';

export type { RenderLightingSymbolsOptions } from './views/symbols/LightingPlanSymbolRenderer.js';
export { renderLightingSymbols } from './views/symbols/LightingPlanSymbolRenderer.js';

export type {
    PlanViewCanvasStyle, PlanViewCanvasOptions, PlanViewCanvasRenderOptions,
} from './views/PlanViewCanvas.js';
export {
    DEFAULT_PLAN_VIEW_CANVAS_FRUSTUM,
    MINIMUM_PLAN_VIEW_CANVAS_FRUSTUM,
    PlanViewCanvas,
} from './views/PlanViewCanvas.js';

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

export type { RebuildTask, RebuildDispatcher } from './DependencyResolver.js';
export { DependencyResolver, dependencyResolver } from './DependencyResolver.js';

export { decisionRecordStore } from './DecisionRecordStore.js';

export { createBimWorld } from './BimWorld.js';

// ── Sprint L drawing sub-barrel re-exports ────────────────────────────────────

export { removeHiddenLines } from './drawing/HiddenLineRemoval.js';

export type { SymbolSegment } from './drawing/SymbolicRuleRenderer.js';
export {
    hasSymbolicRenderer,
    renderSymbol,
    symbolicRuleForLayer,
    elementTypeForSymbolLayer,
} from './drawing/SymbolicRuleRenderer.js';

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

// ── Sprint AB (2026-05-12) — ToolName + ToolState ────────────────────────────
export type { ToolName } from './tool-types.js';
export { ToolState } from './tool-types.js';

// ── Sprint AG (2026-05-12) — services/ extraction ────────────────────────────
export { getStoredToken, getCurrentUserId, apiFetch } from './apiFetch.js';
export { getCesium } from './cesiumLoader.js';
export { debug } from './debugOverlay.js';
export { resolveRoomFinishes } from './RoomFinishResolver.js';
export type { ResolvedRoomFinishes } from './RoomFinishResolver.js';
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
