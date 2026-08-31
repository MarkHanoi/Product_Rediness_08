// @pryzm/plugin-rooms — public surface (S25 deliverable).
//
// Spec: `phases/PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md` §S25.
// Decision: `code-level ADR docs/02-decisions/adrs/0022-room-boundary-detection.md`.

// GE-04 (2026-08-14): `RoomStore` here is a DEPRECATED bus-contribution shim —
// the room store shipping paths execute is `packages/room-topology`'s
// (`window.roomStore`, storeRegistry key 'room'). See ./store.ts header for
// the measured evidence and the retirement path. `RoomsPluginStore` is the
// honest name; the `RoomStore` alias survives only for PluginRegistry.ts.
export {
  RoomsPluginStore,
  RoomStore,
  type RoomData,
  type RoomId,
  type RoomsState,
} from './store.js';

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

// PR-11 — the boundary-recompute discriminator. Separates "recomputed, nothing
// moved" from the three "I could not recompute" cases the old `room.recomputeBoundary`
// no-op collapsed into one empty pair (C78 §8.1 · C71 §4.4).
export {
  determineRoomBoundaryRecompute,
  type RoomBoundaryAnalytic,
  type RoomBoundaryImpact,
  type RoomBoundaryRecomputeInput,
  type RoomBoundaryRecomputeOutcome,
  type RoomBoundaryUndeterminedReason,
} from './boundaryRecomputeDetermination.js';

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
// C80 GEN-GAP-1 — generation-as-verb. v1 returns a typed refusal.
export {
  RegenerateRoomsHandler,
  buildRegenerationRefusal,
  type RegenerateRoomsPayload,
} from './handlers/RegenerateRooms.js';


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
