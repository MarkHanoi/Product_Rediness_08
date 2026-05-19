// @pryzm/plugin-door — public surface (S11-T1 deliverable).
//
// Headless half lives at the package root (store, errors, intent, tool,
// handlers).  THREE-touching surface lives under `src/committer/` and
// is re-exported here for caller convenience — only the editor
// bootstrap is expected to instantiate the committer directly.

export { DoorStore, type DoorData, type DoorId, type DoorsState } from './store.js';
export {
  DoorSystemError,
  DoorNotFoundError,
  HostWallNotFoundError,
  DoorSchemaError,
  DoorDimensionsError,
  DoorTypeNotFoundError,
  DoorOffsetOutOfRangeError,
  isDoorSystemError,
} from './errors.js';

export { CreateDoorHandler, type CreateDoorPayload } from './handlers/CreateDoor.js';
export { DeleteDoorHandler, type DeleteDoorPayload } from './handlers/DeleteDoor.js';
export { MoveDoorHandler, type MoveDoorPayload } from './handlers/MoveDoor.js';
export { SetDoorTypeHandler, type SetDoorTypePayload } from './handlers/SetDoorType.js';
export { SetDoorSwingHandler, type SetDoorSwingPayload } from './handlers/SetDoorSwing.js';
export { SetDoorWidthHandler, type SetDoorWidthPayload } from './handlers/SetDoorWidth.js';
export {
  DOOR_HANDLER_TYPES,
  buildDoorHandlerSet,
  registerDoorHandlers,
  type DoorHandlerType,
} from './handlers/index.js';

export {
  resolveDoorPlacement as resolveDoorPlacementIntent,
  wallLength,
  type DoorPlacementResult,
} from './intent.js';

export {
  DoorPlacementTool,
  DOOR_TOOL_ID,
  type DoorCreationToolDeps,
  type DoorScreenToWorld,
  type DoorToolPoint3D,
  type WallsSnapshot,
} from './tool.js';

export {
  DoorCommitter,
  resolveDoorPlacement,
  buildDoorBufferGeometry,
  disposeDoorGeometry,
  makeDoorMaterialFactory,
  colorOfDoorMaterialKey,
  type DoorCommitterDeps,
  type DoorCommitterStats,
} from './committer/index.js';
