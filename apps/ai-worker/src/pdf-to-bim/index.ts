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
  midpointBetweenLinesMm,
  perpendicularSeparationMm,
  pointToSegmentDistance,
  snapToNearestWall,
} from './stage2-openings.js';

// S70 D8 — PDF-to-BIM preview gate per ADR-029 Part E + ADR-0052 §B.5.
export {
  PDF_TO_BIM_ACCURACY_THRESHOLDS,
  PDF_TO_BIM_RELEASE_LABEL,
  evaluatePreviewGate,
  pdfToBimFeatureLabel,
  type AccuracyMetrics,
  type PdfToBimReleaseLabel,
} from './preview-gate.js';
