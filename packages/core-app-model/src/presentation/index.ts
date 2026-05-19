/**
 * @pryzm/core-app-model — presentation sub-barrel (Wave 10 Task 2 W10-A + P9-W4 Sprint A)
 */

export { RenderingIntent } from './RenderingIntent.js';

export type {
    ElementState,
    LineAppearance,
    FillAppearance,
    ElementStateAppearance,
    ThreeDimensionalAppearance,
    ElementGraphicsRules,
    ViewTypeModifierStateTransform,
    AppearancePatch,
    ViewTypeModifier,
    ViewTypeProfile,
    ProfileElementRulePatch,
    ViewPurpose,
    PurposeModifier,
    VisibilityIntent,
    ViewSeedLockableField,
    ViewSeedDiscipline,
    ViewSeedPurpose,
    ViewSeed,
    OverrideTargetKind,
    VisibilityOverride,
    GraphicOverride,
    OverrideLayer,
    PlanViewRangeDefaults,
    ViewIntentInstance,
} from './VisibilityIntentTypes.js';

export { EMPTY_OVERRIDE_LAYER } from './VisibilityIntentTypes.js';

export type {
    QueryExpression,
    VisibilityEffect,
    VisibilityRule,
    VisibilityRuleEngineSnapshot,
} from './VisibilityRuleTypes.js';

export type {
    VisualStyle,
    StyleSchema,
} from './VisualStyleManager.js';

export { VisualStyleManager } from './VisualStyleManager.js';

// ── Task 3 W10-A ─────────────────────────────────────────────────────────────

export {
    SYSTEM_INTENT_IDS,
    SYSTEM_VISIBILITY_INTENTS,
    getDefaultSystemIntentId,
    cloneSystemIntents,
} from './SystemIntents.js';

export type { VisibilityIntentStoreSnapshot, VisibilityIntentStoreImpl } from './VisibilityIntentStore.js';
export { visibilityIntentStore } from './VisibilityIntentStore.js';

export type { ViewIntentInstanceStoreSnapshot, ViewIntentInstanceStoreImpl } from './ViewIntentInstanceStore.js';
export { viewIntentInstanceStore } from './ViewIntentInstanceStore.js';

export type {
    IntentResolveTarget,
    IntentFieldSource,
    ResolvedField,
    SourceContribution,
    InheritanceContext,
} from './IntentRuleResolver.js';

export {
    stateFromPenZone,
    isElementTypeFullyHidden,
    normaliseIfcUserDataType,
    appearanceToPenStyle,
    resolveIntentStyle,
    resolveSurface3D,
    resolveSurface3DExplicit,
    resolveWithInheritance,
    resolveIntentPenStyle,
    resolveViewSeed,
    resolveViewRange,
    resolveCrop,
    resolveUnderlay,
    resolveOutput,
    resolveWithSourceChain,
} from './IntentRuleResolver.js';

export { ELEMENT_TYPE_REGISTRY, ELEMENT_TYPE_PARENT, getElementTypeRules } from './ElementTypeRegistry.js';

// ── P9-W4 Sprint A — additional presentation files ────────────────────────────

export { setUD, deleteUD } from './userDataSafe.js';

export { GraphicHierarchyRenderer } from './GraphicHierarchyRenderer.js';

export { PresentationEngine } from './PresentationEngine.js';

export { CURRENT_INTENT_SCHEMA_VERSION, migrateIntentToCurrent } from './migrations/IntentSchemaMigrations.js';

export type { ZoneClassification } from './ViewRangeClassifier.js';
export { classifyElement, classifyScene } from './ViewRangeClassifier.js';

export {
    defaultStateAppearance,
    defaultRulesForElementType,
    DEFAULT_ELEMENT_GRAPHICS_RULES,
    cloneDefaultElementGraphicsRules,
} from './VisibilityIntentDefaults.js';

export type {
    VGCategoryStyle,
    AnnotationStyleRecord,
    VGTemplate,
    VGModelRecord,
    VGViewRecord,
    VGResolvedStyle,
    VGGovernanceStoreImpl,
} from './VGGovernanceStore.js';
export { vgGovernanceStore } from './VGGovernanceStore.js';

export type { VGInstanceOverrideStoreImpl } from './VGInstanceOverrideStore.js';
export { vgInstanceOverrideStore } from './VGInstanceOverrideStore.js';

export { viewportPreviewRenderer } from './ViewportPreviewRenderer.js';

export type { IntentUsageSummary } from './selectors/intentUsageCount.js';
export { intentUsageCount, formatIntentUsageLabel } from './selectors/intentUsageCount.js';

// ── P9-W4 Wave 1 (2026-05-10) ────────────────────────────────────────────────

export {
    defaultInheritanceContext,
    resolveBoundIntentWithInheritance,
    getInheritedFromViewId,
    resolveInheritanceChain,
} from './IntentBindingResolver.js';

export { CropRegionFilterService } from './CropRegionFilterService.js';

export { UnderlayRenderService } from './UnderlayRenderService.js';

// ── P9-W4 Wave 2 (2026-05-10) ────────────────────────────────────────────────

export type { PaperParams } from './LayoutEngine.js';
export { layoutEngine } from './LayoutEngine.js';
export type { LayoutEngineImpl } from './LayoutEngine.js';

export { dataPanelRenderer } from './DataPanelRenderer.js';
export type { DataPanelRendererImpl } from './DataPanelRenderer.js';

export {
    DEFAULT_BELOW_LEVEL_DEPTH,
    resolveViewRangeWorldY,
    resolveEffectiveViewRange,
    resolveEffectivePlanDepthY,
} from './ViewRangeIntentResolver.js';

export { ThreeDAppearanceResolver, threeDAppearanceResolver } from './ThreeDAppearanceResolver.js';

// ── P9-W4 Wave 3 (2026-05-10) ────────────────────────────────────────────────

export { ViewRangeFilterService } from './ViewRangeFilterService.js';

export { ViewRangeZoneApplicator } from './ViewRangeZoneApplicator.js';

export { initGhostOverlayRenderer } from './GhostOverlayRenderer.js';

export type { VisibilityRuleEngineImpl } from './VisibilityRuleEngine.js';
export { visibilityRuleEngine } from './VisibilityRuleEngine.js';

export { VGSceneApplicator } from './VGSceneApplicator.js';
