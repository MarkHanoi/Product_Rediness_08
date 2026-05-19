// @pryzm/plugin-curtain-wall — public surface (S12-T5).

export {
  CurtainWallStore,
  type CurtainWallData,
  type CurtainWallId,
  type CurtainWallsState,
} from './store.js';
export {
  CurtainWallSystemError,
  CurtainWallNotFoundError,
  CurtainWallSchemaError,
  CurtainWallGeometryError,
  CurtainWallPanelNotFoundError,
  isCurtainWallSystemError,
} from './errors.js';

export { CreateCurtainWallHandler, type CreateCurtainWallPayload } from './handlers/CreateCurtainWall.js';
export { DeleteCurtainWallHandler, type DeleteCurtainWallPayload } from './handlers/DeleteCurtainWall.js';
export { MoveCurtainWallHandler, type MoveCurtainWallPayload } from './handlers/MoveCurtainWall.js';
export { SetCurtainWallGridHandler, type SetCurtainWallGridPayload } from './handlers/SetCurtainWallGrid.js';
export {
  SetCurtainWallMullionTypeHandler,
  type SetCurtainWallMullionTypePayload,
} from './handlers/SetCurtainWallMullionType.js';
export {
  SetCurtainWallTransomTypeHandler,
  type SetCurtainWallTransomTypePayload,
} from './handlers/SetCurtainWallTransomType.js';
export {
  SetCurtainWallPanelTypeHandler,
  type SetCurtainWallPanelTypePayload,
} from './handlers/SetCurtainWallPanelType.js';
export {
  SetCurtainWallOutlineHandler,
  type SetCurtainWallOutlinePayload,
} from './handlers/SetCurtainWallOutline.js';
export { ResizeCurtainWallHandler, type ResizeCurtainWallPayload } from './handlers/ResizeCurtainWall.js';

export {
  CURTAIN_WALL_HANDLER_TYPES,
  buildCurtainWallHandlerSet,
  registerCurtainWallHandlers,
  type CurtainWallHandlerType,
  // P2e: batch create
  CreateCurtainWallBatchHandler,
  type CreateCurtainWallBatchPayload,
} from './handlers/index.js';

export { isFiniteVec3, isNonZeroBaseLine, baseLineLength } from './intent.js';
export {
  CurtainWallPlacementTool,
  CURTAIN_WALL_TOOL_ID,
  type CurtainWallPlacementToolDeps,
  type CurtainWallScreenToWorld,
  type CurtainWallToolPoint3D,
} from './tool.js';

export {
  CurtainWallCommitter,
  buildCurtainWallBufferGeometry,
  disposeCurtainWallGeometry,
  makeCurtainWallMaterialFactory,
  colorOfCurtainWallMaterialKey,
  slotOfCurtainWallMaterialKey,
  type CurtainWallCommitterDeps,
  type CurtainWallCommitterStats,
  type CurtainWallSlot,
} from './committer/index.js';
