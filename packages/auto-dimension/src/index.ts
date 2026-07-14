// @pryzm/auto-dimension — public API barrel (L2, PURE).
//
// The deterministic AutoDimension engine: a floor-plan wall/opening snapshot →
// a non-redundant, architect-grade DimensionString[]. See
// docs/03-execution/spikes/SPIKE-AUTODIMENSION-ENGINE.md (§FEAT-AUTODIMENSION-P1).

export { planAutoDimensions } from './planAutoDimensions.js';
// §FIX-AUTODIM-ORTHO-COMPLETE-CHAINS (L-147, SPEC §4.4 QA-2) — exported so the
// per-run chain gap/overlap detection is unit-testable in isolation.
export {
  detectChainCoverageGaps,
  type ChainCoverageRun,
  type ChainCoverageString,
} from './planAutoDimensions.js';
export { withAutoDimSpan, _resetTracerCache, type AutoDimStage } from './tracing.js';
// Pure placement helpers exposed for deterministic unit tests (§SPIKE §8/§13).
export { polygonCentroid, outwardNormal, cardinalOutwardNormal } from './placement.js';
export { segmentsCross } from './geometry.js';

// §FIX-OVERALL-DIM-OUTSIDE-AND-OUTERMOST (L-281) — THE TIER MODEL.
//
// Exported because the tier gap is NOT the engine's to invent: it is a PAPER constant
// (C24) that only the VIEW can turn into world metres, so the L5 executor calls
// `tierGapWorldM(view.scale)` and passes the result in as `AutoDimOptions.tierGapM`. The
// guard (`detectFootprintCrossings`) is exported for the same reason it exists: an
// L-shaped plate must be assertable — a rectangle passes this rule by luck.
export {
  tierGapWorldM,
  tierOfRank,
  bboxOf,
  bboxClearance,
  tierMagnitudeM,
  TIER_BY_RANK,
  OVERALL_TIER,
  DEFAULT_TIER_GAP_PAPER_MM,
  type FootprintBBox,
} from './tiers.js';
export { detectFootprintCrossings } from './planAutoDimensions.js';
// §FIX-AUTODIM-ORTHO-COMPLETE-CHAINS (L-147, C56 §1.3 DI-7) — the orthogonal-only
// invariant helper the L5 executor consumes to render cardinal dims axis-aligned.
export { cardinalMeasurementAxis } from './planners.js';
export type {
  AutoDimSnapshot,
  AutoDimWall,
  AutoDimOpening,
  AutoDimOptions,
  AutoDimResult,
  AutoDimReport,
  ValidationWarning,
} from './types.js';
export type { PtXZ } from './geometry.js';

// ── BUILDING PARTITION (§FIX-AUTODIM-MULTI-BUILDING, L-268) ──────────────────
//
// "A BUILDING" as a first-class domain concept, exported because it is NOT a private
// detail of the plan planner. Auto-dimension covered only one of two buildings not
// because a branch was missing but because the documentation layer had NO NOTION OF A
// BUILDING — the perimeter was singular by construction.
//
// It is exported here so that every documentation consumer partitions the level with the
// SAME code and can never disagree about what a building is: elevation auto-dimension
// (L-263), auto-tag (L-265), interior elevations, and schedules (C28). C19 already
// contemplates a SITE holding N buildings; this is that concept reaching the
// documentation layer. A consumer that re-derives its own perimeter instead of calling
// this is reintroducing L-268.
export { partitionBuildings } from './buildings.js';
export type { BuildingFootprint, BuildingPartition } from './buildings.js';

// ── ELEVATION strategy (§FEAT-AUTO-DIMENSION-ELEVATION-VIEWS, L-263) ─────────
// ONE engine, multiple consumers. The plan planner above and the elevation
// planner below share this package, the `DimensionString` schema, the tracing
// helper, the report/warning vocabulary, the dimension COMMANDS and the render
// sink. What differs — and ONLY what differs — is the measurement plane (view H/V
// against world-Y) and the rule set (EV-1 overall height / EV-2 floor-to-floor /
// EV-3 typical sill+head). See `elevation/planElevationAutoDimensions.ts` for the
// rule set in full, written down before it was coded.
export {
  planElevationAutoDimensions,
  ELEVATION_RULES_BY_DETAIL_LEVEL,
  type ElevAutoDimResult,
} from './elevation/planElevationAutoDimensions.js';
export type {
  ElevAutoDimSnapshot,
  ElevAutoDimOptions,
  ElevAutoDimLevel,
  ElevAutoDimOpening,
  ElevDimSegment,
  ElevDimRule,
  ElevTopDatumKind,
} from './elevation/types.js';
