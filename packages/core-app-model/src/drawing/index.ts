/**
 * @pryzm/core-app-model — drawing sub-barrel
 *
 * Re-exports all public drawing-domain types and utilities migrated from
 * src/core/drawing/ in Wave 10 Tasks 1–2 (W10-A).
 */

export type { ViewRangeHashInput } from './DrawingConstants.js';

export {
    GEOMETRIC_EPSILON_M,
    SNAP_TOLERANCE_M,
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

// §FIX-PLAN-CANVAS-HAIRLINE-FLOOR (L-288) — the screen must have the DEVICE PIXELS to draw
// the pen table. The pens are correct (export proves it); the rasteriser's 1-px floor was
// flattening every pen below ~0.265 mm onto one width. The PEN TABLE IS NOT TOUCHED.
export {
    MAX_BACKING_SCALE,
    MIN_LEGIBLE_BACKING_SCALE,
    resolveCanvasRenderScale,
    minStrokePx,
    dashScale,
} from './CanvasRenderScale.js';
export { THINNEST_SYSTEM_PEN_MM } from './PenWeightTable.js';

// ── §FEAT-PEN-WEIGHT-BY-WALL-FUNCTION (L-285) — C09 §4.6.4a, the third pen axis ──
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
export type { DrawingZone, OcclusionDisposition, BeyondLineStyle } from './DrawingZone.js';
// §FEAT-BEYOND-DASH-IN-ELEVATION (L-290) — the two de-emphasis dashes. They MUST differ:
// beyond and hidden share a WIDTH, so the DASH is the only axis that can tell them apart.
export { BEYOND_DASH_PX, HIDDEN_DASH_PX, beyondAndHiddenAreDistinguishable } from './DrawingZone.js';
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

// §ELEV-SYMBOL-OPENING (L-1240) — the AUTHORED door/window elevation symbol, and the total
// orthographic basis that makes its head and sill draw horizontal at EVERY view angle rather
// than at six of them. See both modules' headers for the measured defect each closes.
export type {
    Vec3,
    DrawingHV,
    ElevationViewBasis,
    ElevationBasisRefusal,
} from './ElevationViewBasis.js';
export {
    MIN_HORIZONTAL_COMPONENT,
    OBC_CARDINAL_QUATERNIONS,
    elevationViewBasis,
    elevationBasisRefusal,
    projectToElevation,
    elevationDepthOf,
} from './ElevationViewBasis.js';

export type {
    PlanPoint,
    ElevationSymbolHost,
    ElevationSymbolOpening,
    ElevationSymbolOptions,
    ElevationSymbolPolyline,
    ElevationSymbolRefusal,
    ElevationSymbolResult,
    ElevationSymbolRole,
    SymbolDetail,
} from './OpeningElevationSymbol.js';
export {
    DEFAULT_FRAME_WIDTH_M,
    buildOpeningElevationSymbol,
    nearFaceSign,
} from './OpeningElevationSymbol.js';

export type {
    WallElevationSymbolHost,
    WallElevationSymbolOptions,
    WallElevationSymbolPolyline,
    WallElevationSymbolRefusal,
    WallElevationSymbolResult,
    WallElevationSymbolRole,
    WallStationSample,
} from './WallElevationSymbol.js';
export {
    buildWallElevationSymbol,
    wallNearFaceSign,
} from './WallElevationSymbol.js';

export type {
    ElevationSymbolViewDef,
    ElevationDiagnosis,
    InjectResult,
} from './OpeningElevationSymbolBuilder.js';
export {
    DOOR_SYM_LAYER,
    GLAZ_SYM_LAYER,
    WALL_SYM_LAYER,
    OpeningElevationSymbolBuilder,
    openingElevationSymbolBuilder,
    suppressSymbolisedElementLinework,
} from './OpeningElevationSymbolBuilder.js';

// §VG-LAYER-IDENTITY-IS-THE-ONLY-SURVIVOR (L-1600) — the ONE producer of "which layer
// is this line on, and whose VG category is that?" (C06 §13.3). Seven hand-copied
// answers were consolidated here; see the module header for the measurement.
export type { LayerTaggedObject } from './DrawingLayerIdentity.js';
export {
    ISO_LAYER_TO_VG_CATEGORY,
    composeLayerTag,
    vgCategoryForLayer,
    baseIsoLayerForTag,
} from './DrawingLayerIdentity.js';
