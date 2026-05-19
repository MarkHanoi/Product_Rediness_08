// Stair committer barrel (S14-T1).

export { StairCommitter, type StairCommitterDeps, type StairCommitterStats } from './stair-committer.js';
export { buildStairBufferGeometry, disposeStairGeometry } from './geometry-bridge.js';
export {
  makeStairMaterialFactory,
  colorOfStairMaterialKey,
  slotOfStairMaterialKey,
  type StairMaterialSlot,
} from './material-bridge.js';
