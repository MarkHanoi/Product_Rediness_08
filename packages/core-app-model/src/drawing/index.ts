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
    penZoneFromLayerName,
    drawingZoneFromLayer,
    categoryFromFlags,
} from './PenWeightTable.js';

// ── §FEAT-PEN-WEIGHT-BY-WALL-FUNCTION (L-285) — C09 §4.6.6, the third pen axis ──
export type { ElementFunction } from './ElementFunction.js';
export {
    ELEMENT_FUNCTIONS,
    ELEMENT_FUNCTION_KEY,
    FUNCTION_WEIGHT_SCALE,
    functionWeightScale,
    penWidthScale,
    FUNCTION_MODULATED_ZONES,
    elementFunctionFrom,
} from './ElementFunction.js';

// ── §FEAT-REVIT-LINE-TYPE-SEMANTICS (L-277) — C09 §4.6, the four zones ───────
export type { DrawingZone, OcclusionDisposition } from './DrawingZone.js';
export {
    DRAWING_ZONES,
    DATUM_CATEGORIES,
    ZONE_LAYER_SUFFIX,
    penZoneOf,
    drawingZoneOf,
    layerForZone,
    siblingZoneLayer,
    drawingZoneFromLayerName as drawingZoneFrom,
    zoneDashesByDefault,
} from './DrawingZone.js';

export {
    ISO_CUT_LAYER_TO_POCHE_FILL,
    VG_CATEGORY_TO_ISO_LAYER,
    resolvePocheFill,
    // §FEAT-WALL-POCHE-FILL-BY-INTENT (L-261)
    POCHE_CONSTRUCTION_DOCS_FILL,
    WALL_LAYER_POCHE_TONE_FACTOR,
    WALL_LAYER_POCHE_TONE_FALLBACK,
    defaultPocheFillForCategory,
    wallLayerPocheToneFactor,
    resolveWallLayerPocheFill,
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

// §FEAT-REVIT-LINE-TYPE-SEMANTICS (L-277) — `removeHiddenLines` and
// `reclassifyOccludedElevationLines` are DELETED. They were two occluders for three view
// types (C09 §4.6.5 forbids exactly that). `applyOcclusion` is the one engine.
export { applyOcclusion, VIEW_DEPTH_KEY } from './HiddenLineRemoval.js';
export type { OcclusionOptions, OcclusionResult } from './HiddenLineRemoval.js';

// ── §FEAT-DOOR-PLAN-SYMBOL-DETAIL-LEVEL (L-241) P2 — shared LOD resolver ─────
// The single answer to "at what Detail Level must element E be drawn in view V?"
// consumed by EVERY plan-symbol builder (door first; window / stair / plumbing /
// furniture next). Do NOT re-implement this precedence per element type.

export type { DetailLevelTargets } from './DetailLevelResolver.js';
export {
    DEFAULT_DETAIL_LEVEL,
    resolveEffectiveDetailLevel,
} from './DetailLevelResolver.js';

export type { SymbolSegment } from './SymbolicRuleRenderer.js';
export {
    hasSymbolicRenderer,
    renderSymbol,
    symbolicRuleForLayer,
    elementTypeForSymbolLayer,
} from './SymbolicRuleRenderer.js';
