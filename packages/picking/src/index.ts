// @pryzm/picking — public barrel.
//
// L5 module.  See `docs/02-decisions/adrs/0015-picking-strategy.md` for
// the design brief and `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md`
// §S16 for the sprint contract.

export type {
  ElementId,
  ElementKind,
  Point2D,
  Rect2D,
  Point3D,
  PickResult,
  PickStrategyId,
  PickProbeResult,
  ElementRegistry,
  GpuPickRenderer,
  PickContext,
  PickStrategy,
} from './types.js';
export { encodeIndexToRGBA, decodeRGBAToIndex } from './types.js';

export { GpuPickStrategy, type GpuPickOptions } from './gpu-pick.js';
export { BvhPickStrategy, type BvhPickOptions } from './bvh-pick.js';
// §FIX-3D-DOOR-PICK-PRIORITY (L-99b) — hosted-element (door/window) pick priority.
export {
  resolveHostedPickPriority,
  type HostedPickCandidate,
  type HostedPickPriorityOptions,
} from './hostedPickPriority.js';
export { resolvePickStrategy, type PickStrategyResolverOptions } from './PickStrategyResolver.js';

// Snapping sub-system — promoted from src/snapping/ (S91-WIRE)
export * from './snapping/index.js';
