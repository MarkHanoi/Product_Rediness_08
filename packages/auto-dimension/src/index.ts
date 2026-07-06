// @pryzm/auto-dimension — public API barrel (L2, PURE).
//
// The deterministic AutoDimension engine: a floor-plan wall/opening snapshot →
// a non-redundant, architect-grade DimensionString[]. See
// docs/03-execution/spikes/SPIKE-AUTODIMENSION-ENGINE.md (§FEAT-AUTODIMENSION-P1).

export { planAutoDimensions } from './planAutoDimensions.js';
export { withAutoDimSpan, _resetTracerCache, type AutoDimStage } from './tracing.js';
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
