// Structural committer surface (S26 / ADR-0026).

export {
  StructuralCommitter,
  type StructuralCommitterDeps,
  type StructuralCommitterStats,
} from './structural-committer.js';
export { buildStructuralBufferGeometry, disposeStructuralGeometry } from './geometry-bridge.js';
export { makeStructuralMaterialFactory, colorOfStructuralMaterialKey } from './material-bridge.js';
