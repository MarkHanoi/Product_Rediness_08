// @pryzm/plugin-wall/committer — barrel for the THREE-touching surface.
//
// All files here live under `plugins/wall/src/committer/` so the
// `pryzm/no-three-outside-committer` lint rule (folder-form allowlist)
// permits THREE imports.  The rest of the plugin (store, handlers,
// tool, errors, system-type-store) is THREE-free.

export { WallCommitter, type WallCommitterStats } from './wall-committer.js';
export { WallSelectionHighlightCommitter } from './selection-highlight.js';
export { buildBufferGeometry, disposeGeometry } from './geometry-bridge.js';
export {
  colorOfWallMaterialKey,
  makeWallMaterialFactory,
} from './material-bridge.js';
