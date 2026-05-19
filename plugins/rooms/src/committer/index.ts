// Room committer surface (S25).

export {
  RoomCommitter,
  type RoomCommitterDeps,
  type RoomCommitterStats,
  type RoomWallsProvider,
} from './room-committer.js';
export {
  buildRoomBufferGeometry,
  disposeRoomGeometry,
} from './geometry-bridge.js';
export {
  makeRoomMaterialFactory,
  colorOfRoomMaterialKey,
} from './material-bridge.js';
