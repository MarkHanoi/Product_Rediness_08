/**
 * @pryzm/spatial-index — Spatial index public API.
 *
 * Wave 11 promotion: SpatialGrid real implementation promoted here from
 * packages/picking/src/snapping/SpatialGrid.ts. ISpatialIndex is now the
 * canonical type in this package.
 *
 * Sprint AC promotion: Room spatial services (RoomGraphService,
 * RoomQueryService, RoomValidationService, RoomTypeInferenceEngine) promoted
 * here from src/engine/subsystems/spatial/. These are the canonical room
 * graph and query APIs consumed by initTools, AI world model adapters, and
 * property-inspector panels.
 *
 * Spec: `docs/03_PRYZM3/04-PLAN-FORWARD/15-PACKAGE-POPULATION-GAP.md §0.0.5`
 *   row `src/spatial | 1,738 LOC | NEW packages/spatial-index/ | 8 + 11`
 * Layer: L2/L3 — spatial geometry and store-query services; no DOM, no React.
 *
 * ## ElementSpatialIndex (Wave 11 partial)
 *
 * ElementSpatialIndex (src/core/drawing/ElementSpatialIndex.ts) is not yet
 * promoted here because it imports from src/core/{ElementRegistry,StoreEventBus} // TODO(TASK-08)
 * which are being migrated in Wave 10. Promotion completes once Wave 10
 * closes and those imports resolve via @pryzm/core-app-model.
 */

export type { ISpatialIndex } from './types.js';

export { SpatialGrid, SnapBoundsError } from './SpatialGrid.js';

// Wave A16 S123 (A16-T7) — Real BVH for O(log n) ray intersection + frustum cull.
// CONTRACT: C04 §3 — spatial queries MUST use an acceleration structure.
export { BVHQuery } from './BVHQuery.js';
export type { BVHElement, BVHQueryOptions } from './BVHQuery.js';

import type * as THREE from '@pryzm/renderer-three/three';
import type { ISpatialIndex } from './types.js';
import { SpatialGrid } from './SpatialGrid.js';

/**
 * Wave 8 null implementation — kept for tests and zero-dep stub consumers.
 */
export class NullSpatialIndex<T> implements ISpatialIndex<T> {
  insert(_item: T, _bounds: THREE.Box3 | THREE.Vector3): void { /* no-op */ }
  remove(_item: T): boolean { return false; }
  query(_bounds: THREE.Box3): T[] { return []; }
  queryRadius(_center: THREE.Vector3, _radius: number): T[] { return []; }
  clear(): void { /* no-op */ }
  get size(): number { return 0; }
}

/**
 * Factory — returns a real SpatialGrid<T> (Wave 11 upgrade; was NullSpatialIndex).
 */
export function createSpatialIndex<T>(cellSize?: number): ISpatialIndex<T> {
  return new SpatialGrid<T>(cellSize);
}

// ── Sprint AC: Room spatial services ─────────────────────────────────────────

export {
  RoomGraphService,
  roomGraphService,
} from './RoomGraphService.js';
export type { RoomNode, RoomEdge, RoomGraph } from './RoomGraphService.js';

export {
  RoomQueryService,
  roomQueryService,
} from './RoomQueryService.js';
export type { ElementRef, BoundaryRef, PathResult } from './RoomQueryService.js';

export {
  RoomValidationService,
  roomValidationService,
} from './RoomValidationService.js';
export type { ValidationSeverity, RoomValidationIssue } from './RoomValidationService.js';

export {
  RoomTypeInferenceEngine,
  roomTypeInferenceEngine,
} from './RoomTypeInferenceEngine.js';
export type { RoomTypeInferenceSuggestion } from './RoomTypeInferenceEngine.js';
