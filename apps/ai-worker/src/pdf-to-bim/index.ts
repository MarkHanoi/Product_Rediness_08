// @pryzm/ai-worker — pdf-to-bim namespace barrel (S51 Track B + S52 §4.2).

export type {
  ArcDescriptor,
  ClassifiedLayer,
  ClassifiedLine,
  ColumnCandidate,
  OpeningCandidate,
  OpeningSubtype,
  PageDecomposition,
  SymbolFeature,
  SymbolTemplate,
  VectorElement,
  WallCandidate,
} from './types.js';
export { STAGE2_OTEL_NAMESPACE } from './types.js';

export {
  AI_FALLBACK_THRESHOLD,
  COLUMN_MAX_ASPECT_RATIO,
  COLUMN_SIZE_MAX_MM,
  COLUMN_SIZE_MIN_MM,
  MIN_LINE_LENGTH_MM,
  WALL_MIN_OVERLAP_MM,
  WALL_THICKNESS_MAX_MM,
  WALL_THICKNESS_MIN_MM,
  classifyPage as classifyPageStage2,
  classifyWallsAndColumns,
  classifyWallsAndColumnsWithDiagnostics,
  computeCenterline,
  computeColumnConfidence,
  computeOverlap,
  computeWallConfidence,
  detectColumns,
  detectWallPairs,
  extractLines,
  getBounds,
  groupByAngle,
  isApproximateRectangle,
  perpendicularDistance,
} from './stage2-walls.js';

export {
  ARC_WALL_SNAP_TOLERANCE_MM,
  DEFAULT_DOOR_TEMPLATES,
  DEFAULT_SYMBOL_LIBRARY,
  DEFAULT_WINDOW_TEMPLATE,
  DOOR_ARC_TOLERANCE_RELAXED,
  DOOR_ARC_TOLERANCE_TIGHT,
  DOOR_MATCH_THRESHOLD,
  STAGE2_OPENINGS_OTEL_NAMESPACE,
  WINDOW_GLAZING_MAX_LENGTH_MM,
  WINDOW_GLAZING_MIN_LENGTH_MM,
  WINDOW_GLAZING_MIN_OVERLAP_MM,
  WINDOW_GLAZING_MIN_SEPARATION_MM,
  arcCenterMm,
  detectWindowBreaks,
  estimateOpeningWidth,
  findAdjacentLines,
  findArcs,
  lineAngleRadians,
  lineLengthMm,
  lineOverlapMm,
  matchDoorTemplate,
  matchOpeningSymbols,
  matchOpeningSymbolsWithDiagnostics,
  midpointBetweenLinesMm,
  perpendicularSeparationMm,
  pointToSegmentDistance,
  snapToNearestWall,
} from './stage2-openings.js';

// §VEC-WIRE 2026-08-10 — Stage 1 vectoriser + FloorPlanAnalysis adapter
// (the wiring the audit's §4.1 called for).
export {
  explodeVectorLines,
  extractVectorElements,
  fitArc,
  hasUsableVectorLineWork,
  type PdfOperatorList,
  type PdfOpsSubset,
} from './stage1-vectorise.js';
export {
  VECTOR_MIN_WALLS,
  composeMmToPx,
  openingCentreMm,
  vectorResultToFloorPlanAnalysis,
  vectorResultToFloorPlanAnalysisWithDiagnostics,
  type Affine2D,
  type VectorAnalysisInput,
} from './adapter-floorplan.js';

// §VEC-REJECT-TALLY 2026-08-11 — TIER 1 rejection accounting. "0 doors found"
// and "12 door arcs rejected" used to be the SAME VALUE; these tallies and
// their describe* formatters are what make them different.
export {
  describeDoorOutcome,
  describeVectorRejections,
  describeWallOutcome,
  describeWindowOutcome,
  emptyAdapterTally,
  emptyColumnTally,
  emptyOpeningTally,
  emptyWallTally,
  hasAnyRejection,
  totalDoorArcsRejected,
  totalGlazingPairsRejected,
  totalWallPairsRejected,
  type AdapterRejectionTally,
  type ColumnRejectionTally,
  type OpeningRejectionTally,
  type VectorRejectionReport,
  type WallRejectionTally,
} from './rejections.js';

// §RASTER-CV 2026-08-10 — TIER 2: algorithmic (zero-token) raster fallback for
// scanned / image plans. Feeds its extracted line primitives into the SAME
// stage2 wall classifier, so both tiers share one wall model.
export {
  DEFAULT_RASTER_CV_OPTIONS,
  RASTER_CONF_DOOR_WITH_ARC,
  RASTER_CONF_GAP_ONLY,
  RASTER_CONF_WINDOW_GLAZED,
  RASTER_MIN_WALLS,
  RASTER_OTEL_NAMESPACE,
  analyseRasterFloorPlan,
  arcSpanAtRadius,
  binarize,
  classifyRunGaps,
  despeckle,
  dilate3,
  downsampleGray,
  erode3,
  extractBoundary,
  gapBandInkFraction,
  houghSegments,
  mergeCollinearWallRuns,
  morphClose3,
  morphOpen3,
  otsuThreshold,
  rasterMmToPx,
  rgbaToGray,
  segmentsToVectorElements,
  type BinaryMask,
  type GapRejectReason,
  type GrayImage,
  type LineSegmentPx,
  type RasterAnalysisInput,
  type RasterAnalysisResult,
  type RasterCvOptions,
  type RasterDiagnostics,
  type WallRun,
} from './raster-cv.js';

// S70 D8 — PDF-to-BIM preview gate per ADR-029 Part E + ADR-0052 §B.5.
export {
  PDF_TO_BIM_ACCURACY_THRESHOLDS,
  PDF_TO_BIM_RELEASE_LABEL,
  evaluatePreviewGate,
  pdfToBimFeatureLabel,
  type AccuracyMetrics,
  type PdfToBimReleaseLabel,
} from './preview-gate.js';
