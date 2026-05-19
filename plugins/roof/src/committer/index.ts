// Roof committer surface (S11-T3).

export {
  RoofCommitter,
  type RoofCommitterDeps,
  type RoofCommitterStats,
} from './roof-committer.js';
export {
  buildRoofBufferGeometry,
  disposeRoofGeometry,
} from './geometry-bridge.js';
export {
  makeRoofMaterialFactory,
  colorOfRoofMaterialKey,
  slotOfRoofMaterialKey,
  type RoofMaterialSlot,
} from './material-bridge.js';
