// @pryzm/plugin-rooms — public surface (S25 deliverable).
//
// Spec: `phases/PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md` §S25.
// Decision: `code-level ADR docs/02-decisions/adrs/0022-room-boundary-detection.md`.

export { RoomStore, type RoomData, type RoomId, type RoomsState } from './store.js';

export {
  RoomSystemError,
  RoomNotFoundError,
  RoomSchemaError,
  RoomSeedError,
  RoomBoundaryError,
  RoomNameError,
  RoomHeightError,
  isRoomSystemError,
} from './errors.js';

export {
  recomputeRoomAnalytic,
  validateRoomSeed,
  type RoomAnalyticUpdate,
} from './intent.js';

export {
  CreateRoomHandler,
  type CreateRoomPayload,
} from './handlers/CreateRoom.js';
export {
  DeleteRoomHandler,
  type DeleteRoomPayload,
} from './handlers/DeleteRoom.js';
export {
  MoveRoomHandler,
  type MoveRoomPayload,
} from './handlers/MoveRoom.js';
export {
  SetRoomNameHandler,
  type SetRoomNamePayload,
} from './handlers/SetRoomName.js';
export {
  SetRoomNumberHandler,
  type SetRoomNumberPayload,
} from './handlers/SetRoomNumber.js';
export {
  SetRoomOccupancyHandler,
  type SetRoomOccupancyPayload,
} from './handlers/SetRoomOccupancy.js';
export {
  SetRoomMaterialHandler,
  type SetRoomMaterialPayload,
} from './handlers/SetRoomMaterial.js';
export {
  SetRoomHeightOffsetHandler,
  type SetRoomHeightOffsetPayload,
} from './handlers/SetRoomHeightOffset.js';

export {
  ROOM_HANDLER_TYPES,
  buildRoomHandlerSet,
  registerRoomHandlers,
  type RoomHandlerType,
} from './handlers/index.js';

export {
  RecomputeRoomBoundaryHandler,
  type RecomputeRoomBoundaryPayload,
} from './handlers/RecomputeRoomBoundary.js';
export {
  RedetectRoomsHandler,
  type RedetectRoomsPayload,
} from './handlers/RedetectRooms.js';

export {
  RoomSeedTool,
  ROOM_TOOL_ID,
  type RoomSeedToolDeps,
  type RoomScreenToWorld,
  type RoomToolPoint3D,
} from './tool.js';

export {
  wireRoomEventSubscriptions,
  type RoomEventRuntime,
  type RoomEventDisposable,
} from './contributions.js';

export {
  RoomCommitter,
  buildRoomBufferGeometry,
  disposeRoomGeometry,
  makeRoomMaterialFactory,
  colorOfRoomMaterialKey,
  type RoomCommitterDeps,
  type RoomCommitterStats,
  type RoomWallsProvider,
} from './committer/index.js';
