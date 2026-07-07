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
export { polygonCentroid, outwardNormal } from './placement.js';
export { segmentsCross } from './geometry.js';
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
