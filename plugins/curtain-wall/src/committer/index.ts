// Curtain-wall committer surface (S12-T5).

export {
  CurtainWallCommitter,
  type CurtainWallCommitterDeps,
  type CurtainWallCommitterStats,
} from './curtain-wall-committer.js';
export {
  buildCurtainWallBufferGeometry,
  disposeCurtainWallGeometry,
} from './geometry-bridge.js';
export {
  makeCurtainWallMaterialFactory,
  colorOfCurtainWallMaterialKey,
  slotOfCurtainWallMaterialKey,
  type CurtainWallSlot,
} from './material-bridge.js';
