// Lighting committer surface (S26 / ADR-0023).

export {
  LightingCommitter,
  type LightingCommitterDeps,
  type LightingCommitterStats,
} from './lighting-committer.js';
export { buildLightingBufferGeometry, disposeLightingGeometry } from './geometry-bridge.js';
export { makeLightingMaterialFactory, colorOfLightingMaterialKey } from './material-bridge.js';
