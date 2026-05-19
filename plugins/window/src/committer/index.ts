// Window committer surface (S11-T2).

export {
  WindowCommitter,
  resolveWindowPlacement,
  type WindowCommitterDeps,
  type WindowCommitterStats,
} from './window-committer.js';
export {
  buildWindowBufferGeometry,
  disposeWindowGeometry,
} from './geometry-bridge.js';
export {
  makeWindowMaterialFactory,
  colorOfWindowMaterialKey,
  slotOfWindowMaterialKey,
} from './material-bridge.js';
