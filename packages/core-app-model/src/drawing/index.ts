/**
 * @pryzm/core-app-model — drawing sub-barrel
 *
 * Re-exports all public drawing-domain types and utilities migrated from
 * src/core/drawing/ in Wave 10 Tasks 1–2 (W10-A).
 */

export type { ViewRangeHashInput } from './DrawingConstants.js';

export {
    EPSILON,
    SNAP_TOLERANCE,
    COLLINEAR_ANGLE,
    SCREEN_DPI,
    EXPORT_DPI,
    MM_PER_INCH,
    SCREEN_PX_PER_MM,
    pxPerMm,
    hashViewRange,
    hashMatrix4,
    classificationCacheKey,
    styleResolverCacheKey,
} from './DrawingConstants.js';

export type {
    StyledEdge,
    StyledPolygon,
    PipelineElementBatch,
    SerializedRule,
    PipelineRequest,
    PipelineResult,
    PipelineError,
    WorkerOutboundMessage,
} from './DrawingPipelineTypes.js';

export type {
    PenStyle,
    PenZone,
} from './PenWeightTable.js';

export {
    FALLBACK_PEN,
    resolvePen,
    penZoneFromFlags,
    categoryFromFlags,
} from './PenWeightTable.js';

export {
    ISO_CUT_LAYER_TO_POCHE_FILL,
    VG_CATEGORY_TO_ISO_LAYER,
    resolvePocheFill,
} from './PocheFillTable.js';

export type { HatchPatternKey } from './HatchPatternLibrary.js';

export {
    clearHatchPatternCache,
    hasHatchPattern,
    getHatchPattern,
    applyHatchFillStyle,
} from './HatchPatternLibrary.js';

// ── Task 3 W10-A ─────────────────────────────────────────────────────────────

export type { StyleResolverContext, GraphicsRule } from './GraphicsRulesEngine.js';
export {
    RULE_PRIORITY_SYSTEM,
    RULE_PRIORITY_CATEGORY,
    RULE_PRIORITY_INTENT,
    RULE_PRIORITY_VIEW_TYPE_MODIFIER,
    RULE_PRIORITY_VIEW,
    RULE_PRIORITY_ELEMENT,
    RULE_PRIORITY_GRAPHIC_OVERRIDE,
    GraphicsRulesEngine,
    graphicsRulesEngine,
} from './GraphicsRulesEngine.js';

export type { CutPocheResult, CutSectionExtractOptions } from './CutSectionExtractor.js';
export { extractCutPoches } from './CutSectionExtractor.js';

export type { OrchestratorJobOptions } from './DrawingPipelineOrchestrator.js';
export { DrawingPipelineOrchestrator, drawingPipelineOrchestrator } from './DrawingPipelineOrchestrator.js';

// ── P9-W4 Wave 1 (2026-05-10) ────────────────────────────────────────────────

export type { ElementSpatialIndexEntry } from './ElementSpatialIndex.js';
export { ElementSpatialIndex, elementSpatialIndex } from './ElementSpatialIndex.js';

// ── Sprint L (2026-05-10) — HiddenLineRemoval + SymbolicRuleRenderer ─────────

export { removeHiddenLines } from './HiddenLineRemoval.js';

export type { SymbolSegment } from './SymbolicRuleRenderer.js';
export {
    hasSymbolicRenderer,
    renderSymbol,
    symbolicRuleForLayer,
    elementTypeForSymbolLayer,
} from './SymbolicRuleRenderer.js';
