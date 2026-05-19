/**
 * @pryzm/snapping — Snapping engine public API.
 *
 * Wave 11 migration: implementation promoted from packages/picking/src/snapping/.
 * packages/picking now re-exports from this package via its ./snapping sub-path.
 *
 * Dependency direction (post-Wave-11):
 *   @pryzm/spatial-index  ← standalone (no picking dep)
 *   @pryzm/snapping       ← depends on @pryzm/spatial-index + @pryzm/stores + THREE
 *   @pryzm/picking        ← depends on @pryzm/snapping + @pryzm/spatial-index + THREE
 *
 * Layer: L3 — geometry + tool infrastructure; no DOM, no React.
 */

export * from './types.js';
export * from './GeometryUtils.js';
export * from './SnapManager.js';
export * from './SnapVisualizer.js';
export * from './providers/GridSnapProvider.js';
export * from './providers/WallSnapProvider.js';
export * from './providers/WallJoinSnapProvider.js';
export * from './providers/CurtainWallSnapProvider.js';
export * from './providers/DoorSnapProvider.js';
export * from './providers/WindowSnapProvider.js';
export * from './providers/ColumnSnapProvider.js';
export * from './providers/SlabSnapProvider.js';
export * from './providers/StairSnapProvider.js';
export * from './providers/FurnitureSnapProvider.js';
export * from './providers/BeamSnapProvider.js';

export { SpatialGrid, SnapBoundsError } from '@pryzm/spatial-index';
