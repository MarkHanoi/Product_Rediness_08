// @pryzm/plugin-component/committer — the THREE-touching surface of this family.
// §COMPONENT-RENDER (audit §12 Phase 4E) · ADR-0376 D10.
//
// Imported by the WIRING that mounts a render path, never by the handlers: the
// rest of this plugin stays THREE-free, which is the same split every other
// element plugin's `./committer` subpath makes.

export {
  ComponentCommitter,
  type ComponentCommitterDeps,
  type ComponentCommitterStats,
} from './ComponentCommitter.js';

export {
  buildComponentBufferGeometry,
  disposeComponentGeometry,
} from './geometry-bridge.js';

export {
  makeComponentMaterialFactory,
  colorOfComponentMaterialKey,
  isUnresolvedComponentMaterialKey,
  DEFAULT_COMPONENT_COLOR,
  UNRESOLVED_MATERIAL_COLOR,
} from './material-bridge.js';

export type {
  BakeComponentInstance,
  BakeResultLike,
  BakedSolidLike,
  UnsupportedSolidLike,
  ComponentDefinitionSource,
} from './ports.js';
