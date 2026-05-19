// @pryzm/geometry-kernel/dimensions — barrel for the L4 auto-dimension
// pipeline.  See `producer.ts` and `evaluator.ts` for the spec linkage.

export {
  makeMonotonicDimensionIdFactory,
  produceDimensions,
  type DimensionElementSnapshot,
  type DimensionRequest,
  type DoorLike,
  type RoomLike,
  type WallLike,
  type WindowLike,
} from './producer.js';

export {
  evaluateDimensions,
  formatDimension,
  type DoorLikeEvaluator,
  type ElementSnapshotForDim,
  type ProjectUnitSettings,
  type RoomLikeEvaluator,
  type Vec3Like,
  type WallLikeEvaluator,
  type WindowLikeEvaluator,
} from './evaluator.js';
