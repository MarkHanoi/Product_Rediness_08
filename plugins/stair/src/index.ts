// @pryzm/plugin-stair — public surface (S14-T1 deliverable).

export { StairStore, type StairData, type StairId, type StairsState } from './store.js';
export {
  StairSystemError,
  StairNotFoundError,
  StairSchemaError,
  StairGeometryError,
  StairRiserCountError,
  isStairSystemError,
} from './errors.js';

export { CreateStairHandler, type CreateStairPayload } from './handlers/CreateStair.js';
export { DeleteStairHandler, type DeleteStairPayload } from './handlers/DeleteStair.js';
export { MoveStairHandler, type MoveStairPayload } from './handlers/MoveStair.js';
export { SetStairTypeHandler, type SetStairTypePayload } from './handlers/SetStairType.js';
export { SetStairShapeHandler, type SetStairShapePayload } from './handlers/SetStairShape.js';
export { SetTreadCountHandler, type SetTreadCountPayload } from './handlers/SetTreadCount.js';
export { SetRiserHeightHandler, type SetRiserHeightPayload } from './handlers/SetRiserHeight.js';
export { SetWidthHandler, type SetWidthPayload } from './handlers/SetWidth.js';
export { RotateStairHandler, type RotateStairPayload } from './handlers/RotateStair.js';

export {
  STAIR_HANDLER_TYPES,
  buildStairHandlerSet,
  registerStairHandlers,
  type StairHandlerType,
} from './handlers/index.js';

export {
  isFiniteVec3,
  totalStairHeight,
  totalStairRun,
  validateStairDims,
  type StairValidation,
} from './intent.js';

export {
  StairPlacementTool,
  STAIR_TOOL_ID,
  type StairPlacementToolDeps,
  type StairScreenToWorld,
  type StairToolPoint3D,
} from './tool.js';

export {
  StairCommitter,
  buildStairBufferGeometry,
  disposeStairGeometry,
  makeStairMaterialFactory,
  colorOfStairMaterialKey,
  slotOfStairMaterialKey,
  type StairCommitterDeps,
  type StairCommitterStats,
  type StairMaterialSlot,
} from './committer/index.js';
