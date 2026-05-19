/**
 * @pryzm/core-app-model — views sub-barrel (Wave 10 Task 2 W10-A + P9-W4 2026-05-10)
 */

export type {
    VisibilityRuleStub,
    ViewType,
    ViewSpatialContext,
    ViewGeometryLens,
    ViewSectionVolume,
    ViewTemporalContext,
    ViewVisualStyle,
    ViewOutputSettings,
    ViewRangeBound,
    ViewRangeSettings,
    ViewCropSettings,
    ViewUnderlaySettings,
    AnnotationVisibilitySettings,
    ViewSemanticContext,
    ViewTemplateLock,
    OverridePenStyle,
    ViewCategoryOverride,
    ViewElementOverride,
    ViewDefinition,
    ViewProjectionSettings,
    ViewLightingSettings,
    ViewSectionBox,
    ViewDefinitionStoreSnapshot,
} from './ViewDefinitionTypes.js';

export {
    ALL_VIEW_TYPES,
    PLAN_VIEW_TYPES,
    VIEW_PROJECTION_DIRECTIONS,
} from './ViewDefinitionTypes.js';

// ── P9-W4 (2026-05-10) — ViewDefinitionStore, ViewTechnicalDrawingCache, ViewDependencyTracker ──

export { viewDefinitionStore } from './ViewDefinitionStore.js';
export type { ViewDefinitionStoreImpl } from './ViewDefinitionStore.js';

export { ViewTechnicalDrawingCache, viewTechnicalDrawingCache } from './ViewTechnicalDrawingCache.js';

export { ViewDependencyTracker, viewDependencyTracker } from './ViewDependencyTracker.js';

// ── P9-W4 Wave 1 (2026-05-10) ────────────────────────────────────────────────

export type {
    LayoutRuleAnchor, LayoutRuleAlign, LayoutRuleDistribute, LayoutRuleGrid,
    LayoutRuleStack, LayoutRuleSpec, LayoutRule, LayoutPreset, LayoutPresetKey,
    ResolvedPosition,
} from './LayoutTypes.js';

export type {
    DataPanelStyle, DataPanelType, DataPanel,
    AnnotationCategory, AnnotationLayerRule, AnnotationLayer, DataPanelStoreSnapshot,
} from './DataPanelTypes.js';

export type {
    PhaseDisplayStatus, PhaseFilterRule, PhaseFilter, PhaseFilterStoreSnapshot,
} from './PhaseFilterTypes.js';
export { BUILT_IN_PHASE_FILTER_IDS } from './PhaseFilterTypes.js';

export { VIEW_RANGE_PRESETS, computeViewRangeDefaults } from './ViewRangeDefaults.js';

// ── P9-W4 Wave 2 (2026-05-10) ────────────────────────────────────────────────

export { phaseFilterStore } from './PhaseFilterStore.js';
export type { PhaseFilterStoreImpl } from './PhaseFilterStore.js';

// ── Sprint B P9-W8A (2026-05-10) — navigation/views wave ─────────────────────

export type { IViewSwitchListener } from './IViewSwitchListener.js';

export type {
    TitleBlockFieldZone, TitleBlockRevisionZone, TitleBlockTemplate,
} from './TitleBlockTypes.js';
export { PAPER_SIZES } from './TitleBlockTypes.js';

export type { ScheduleType, ScheduleDefinitionStoreSnapshot } from './ScheduleDefinitionTypes.js';
export type { ScheduleDefinition as ViewScheduleDefinition } from './ScheduleDefinitionTypes.js';

export { emitPlanViewMotionEvent } from './otel.js';

export type { ViewPlane } from './ViewPlane.js';
export {
    viewPlaneFromDefinition, canvasHitToWorld3D, snapToViewPlane,
} from './ViewPlane.js';

export { LevelClipPlaneCache, levelClipPlaneCache } from './LevelClipPlaneCache.js';

export type { DrawingBounds } from './TechnicalDrawingBounds.js';
export { TechnicalDrawingBounds } from './TechnicalDrawingBounds.js';

export { OrthoPlanCameraLockController } from './OrthoPlanCameraLockController.js';

export {
    DEFAULT_SNAP_PIXEL_RADIUS, MIN_WORLD_TOLERANCE, MAX_WORLD_TOLERANCE,
    LEGACY_FALLBACK_TOLERANCE, getWorldToleranceForPixels, getWorldToleranceForActiveCamera,
} from './CameraToleranceService.js';
export type { ToleranceOptions } from './CameraToleranceService.js';

export { ViewCameraStateStore } from './ViewCameraStateStore.js';

export type { ActivePlanDrawingRef } from './ActivePlanDrawingRef.js';
export { activePlanDrawingRef } from './ActivePlanDrawingRef.js';

export { ViewVisibilityMap } from './ViewVisibilityMap.js';

export type {
    RevisionEntry, SheetViewport, SheetStatus, SheetDefinition,
    PaperSize, OutputConfig, SheetDefinitionStoreSnapshot,
} from './SheetDefinitionTypes.js';
export { getViewIds } from './SheetDefinitionTypes.js';

export { FastPathProjectorService } from './FastPathProjectorService.js';

export {
    ifcProjectionStore, IFC_PROJECTION_CHANGED_EVENT,
} from './IFCProjectionStore.js';
export type { IFCProjectionStoreImpl } from './IFCProjectionStore.js';

export type { UnderlayRenderRef } from './FloorPlanUnderlayRef.js';
export { floorPlanUnderlayRef } from './FloorPlanUnderlayRef.js';

export { ViewRenderCache, viewRenderCache } from './ViewRenderCache.js';

export type {
    SheetComment, SheetCommentReply, CursorPresence,
} from './SheetCommentStore.js';
export { sheetCommentStore } from './SheetCommentStore.js';
export type { SheetCommentStoreImpl } from './SheetCommentStore.js';

export { titleBlockStore } from './TitleBlockStore.js';
export type { TitleBlockStoreImpl } from './TitleBlockStore.js';

export { scheduleStore } from './ScheduleStore.js';
export type { ScheduleStoreImpl } from './ScheduleStore.js';

export { sheetStore } from './SheetStore.js';
export type { SheetStoreImpl } from './SheetStore.js';

export type { ViewTemplate, ViewTemplateStoreSnapshot } from './ViewTemplateTypes.js';

export { viewTemplateStore } from './ViewTemplateStore.js';
export type { ViewTemplateStoreImpl } from './ViewTemplateStore.js';

export type { SnapResult } from './PlanView2DSnapService.js';
export { PlanView2DSnapService, planView2DSnapService } from './PlanView2DSnapService.js';

export { GroundFloorPlanController } from './GroundFloorPlanController.js';

export { PlanView2DCreationMode, planView2DCreationMode } from './PlanView2DCreationMode.js';

export { ViewportThumbnailRenderer, viewportThumbnailRenderer } from './ViewportThumbnailRenderer.js';

export { PlanViewVisibilityCuller } from './PlanViewVisibilityCuller.js';

export {
    DEFAULT_3D_VIEW_ID, DEFAULT_PLAN_VIEW_ID, initDefaultViewsManager,
} from './DefaultViewsManager.js';

// ── Sprint B P9-W8B (2026-05-10) — PlanViewAnnotationRenderer + PlanViewService ─

export type { PlanWorldToScreen, PlanViewAnnotationRenderOptions } from './PlanViewAnnotationRenderer.js';
export {
    DRAGGABLE_ANNOTATION_TYPES, PlanViewAnnotationRenderer, planViewAnnotationRenderer,
} from './PlanViewAnnotationRenderer.js';

export type {
    OrthographicViewDirection, OrthographicViewConfig, EmptySceneConfig,
} from './PlanViewService.js';
export { PlanViewService } from './PlanViewService.js';

// ── Sprint M (2026-05-10) — PlanViewCanvas + PlanSnapEngine + PlanElementDragController ──

export type {
    PlanViewCanvasStyle,
    PlanViewCanvasOptions,
    PlanViewCanvasRenderOptions,
} from './PlanViewCanvas.js';
export {
    DEFAULT_PLAN_VIEW_CANVAS_FRUSTUM,
    MINIMUM_PLAN_VIEW_CANVAS_FRUSTUM,
    PlanViewCanvas,
} from './PlanViewCanvas.js';

export type { PlanSnapType, PlanSnapResult } from './PlanSnapEngine.js';
export { PlanSnapEngine } from './PlanSnapEngine.js';

export { PlanElementDragController, planElementDragController } from './PlanElementDragController.js';

// ── Sprint M (2026-05-10) — LightingPlanSymbolRenderer ────────────────────────

export type { RenderLightingSymbolsOptions } from './symbols/LightingPlanSymbolRenderer.js';
export { renderLightingSymbols } from './symbols/LightingPlanSymbolRenderer.js';

// ── Sprint AH (2026-05-12) — DrawingEditorService ────────────────────────────
export { drawingEditorService, ANNOTATION_TOOL_IDS } from './DrawingEditorService.js';
export type { } from './DrawingEditorService.js';
export { DrawingEditorService } from './DrawingEditorService.js';

// ── Sprint AI (2026-05-12) — PocheFillBuilder ─────────────────────────────────
export type { PochePolygon } from './PocheFillBuilder.js';
export { PocheFillBuilder } from './PocheFillBuilder.js';
