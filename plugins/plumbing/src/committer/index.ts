// Plumbing committer surface (S26 / ADR-0026).

export {
  PlumbingCommitter,
  type PlumbingCommitterDeps,
  type PlumbingCommitterStats,
} from './plumbing-committer.js';
export { buildPlumbingBufferGeometry, disposePlumbingGeometry } from './geometry-bridge.js';
export { makePlumbingMaterialFactory, colorOfPlumbingMaterialKey } from './material-bridge.js';
