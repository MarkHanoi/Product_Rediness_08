// Furniture committer surface (S27 / ADR-0027).

export {
  FurnitureCommitter,
  type FurnitureCommitterDeps,
  type FurnitureCommitterStats,
} from './furniture-committer.js';
export { buildFurnitureBufferGeometry, disposeFurnitureGeometry } from './geometry-bridge.js';
export { makeFurnitureMaterialFactory, colorOfFurnitureMaterialKey } from './material-bridge.js';
