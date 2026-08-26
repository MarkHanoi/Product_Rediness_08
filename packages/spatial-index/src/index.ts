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
 * Spec: `docs/archive/pryzm3-internal/04-PLAN-FORWARD/15-PACKAGE-POPULATION-GAP.md §0.0.5`
 *   row `src/spatial | 1,738 LOC | NEW packages/spatial-index/ | 8 + 11`
 * Layer: L2/L3 — spatial geometry and store-query services; no DOM, no React.
 *
 * ## ElementSpatialIndex (Wave 11 partial)
 *
 * ElementSpatialIndex (src/core/drawing/ElementSpatialIndex.ts) is not yet
 * promoted here because it imports from src/core/{ElementRegistry,StoreEventBus}
 * which are being migrated in Wave 10. Promotion completes once Wave 10
 * closes and those imports resolve via @pryzm/core-app-model.
 */

export type { ISpatialIndex } from './types.js';

// TODO(TASK-08): store-unification debt (ADR-0318) — ElementSpatialIndex is not yet
// promoted into this barrel because it still imports src/core/{ElementRegistry,
// StoreEventBus}; promotion completes when those resolve via @pryzm/core-app-model.
// Work note relocated from the file header, where it read to the C74 §3.4 M-B gate as
// a module-scaffold claim; this barrel is production, not a stand-in
// (CO-06, 2026-08-14).

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

// §ROOMTYPE142 — the deterministic, table-driven bulk "autofill room name"
// classifier. Separate from RoomTypeInferenceEngine (see that file's sibling
// header for why); shares the same containment authority.
export {
  ROOM_AUTOFILL_RULES,
  gatherRoomAutofillSignals,
  classifyRoomForAutofill,
} from './RoomAutoFillClassifier.js';
export type {
  AutoFillRule,
  RoomContentSignals,
  RoomAutoFillClassification,
} from './RoomAutoFillClassifier.js';

// ── SL-3: Façade orientation (SPEC-SEMANTIC-DESIGN-ASSISTANT §3) ──────────────
// Pure math + types live in FacadeOrientationMath (no barrel-load side effects —
// import that module directly in tests). The store-backed service + singleton
// pull in @pryzm/core-app-model (storeRegistry).
export {
  classifyFacades,
  orientationFromNormal,
  outwardNormal,
  polygonCentroid,
} from './FacadeOrientationMath.js';
export type { Compass4, FacadeInfo, FacadeWall, FacadeRoom } from './FacadeOrientationMath.js';
export { FacadeOrientationService, facadeOrientationService } from './FacadeOrientationService.js';
