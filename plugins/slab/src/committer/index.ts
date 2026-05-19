// Slab committer surface (S12-T2).

export {
  SlabCommitter,
  type SlabCommitterDeps,
  type SlabCommitterStats,
} from './slab-committer.js';
export {
  buildSlabBufferGeometry,
  disposeSlabGeometry,
} from './geometry-bridge.js';
export {
  makeSlabMaterialFactory,
  colorOfSlabMaterialKey,
  slotOfSlabMaterialKey,
  type SlabMaterialSlot,
} from './material-bridge.js';
