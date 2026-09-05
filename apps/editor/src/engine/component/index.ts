// apps/editor/src/engine/component — the THREE-touching render seam of the
// component family. §COMPONENT-RENDER (audit §12 Phase 4E) · ADR-0376 D10 ·
// §L7-COMMITTER-HOME (see `ComponentCommitter.ts`).
//
// Formerly the `@pryzm/plugin-component/committer` subpath; moved to L7 on
// 2026-09-05 because a plugin may not import `@pryzm/renderer-three` and the
// l7-boundary ratchet for a new plugin is 0. Imported by the WIRING that mounts
// a render path (the one composed runtime), never by the plugin's handlers —
// `@pryzm/plugin-component` is THREE-free end to end.

export {
  ComponentCommitter,
  type ComponentCommitterDeps,
  type ComponentCommitterStats,
} from './ComponentCommitter';

// §82.6-COMPONENT-RENDER-MOUNT — the production mount of the committer (store
// `subscribeDirty` → committer → scene), the shape `attachSpaceEnvelopeRender`
// documents. `initTools` is its one production caller.
export {
  attachComponentRender,
  type ComponentRenderDeps,
  type ComponentRenderHandle,
  type ComponentDefinitionCatalogLike,
  type DirtyComponentStore,
} from './attachComponentRender';

export {
  buildComponentBufferGeometry,
  disposeComponentGeometry,
} from './geometry-bridge';

export {
  makeComponentMaterialFactory,
  colorOfComponentMaterialKey,
  isUnresolvedComponentMaterialKey,
  DEFAULT_COMPONENT_COLOR,
  UNRESOLVED_MATERIAL_COLOR,
} from './material-bridge';

export type {
  BakeComponentInstance,
  BakeResultLike,
  BakedSolidLike,
  UnsupportedSolidLike,
  ComponentDefinitionSource,
} from './ports';
