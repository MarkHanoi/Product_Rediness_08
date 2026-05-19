// Door committer surface (S11-T1).

export {
  DoorCommitter,
  resolveDoorPlacement,
  type DoorCommitterDeps,
  type DoorCommitterStats,
} from './door-committer.js';
export {
  buildDoorBufferGeometry,
  disposeDoorGeometry,
} from './geometry-bridge.js';
export {
  makeDoorMaterialFactory,
  colorOfDoorMaterialKey,
} from './material-bridge.js';
