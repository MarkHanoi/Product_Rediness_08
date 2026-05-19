import type * as THREE from '@pryzm/renderer-three/three';

/**
 * Generic 3-D spatial index contract.
 *
 * Wave 11 canonical location. Moved from packages/picking/src/snapping/types.ts
 * (which defined ISpatialIndex inline) and from packages/spatial-index/src/index.ts
 * (stub mirror). All consumers should import from '@pryzm/spatial-index'.
 *
 * Layer: L2 — pure geometry types; no DOM, no React, no renderer.
 */
export interface ISpatialIndex<T> {
  /** Insert `item` at the given world-space bounds. */
  insert(item: T, bounds: THREE.Box3 | THREE.Vector3): void;
  /** Remove `item`. Returns `true` if the item was present. */
  remove(item: T): boolean;
  /** Return every item whose registered bounds intersect `bounds`. */
  query(bounds: THREE.Box3): T[];
  /** Return every item within `radius` world-units of `center`. */
  queryRadius(center: THREE.Vector3, radius: number): T[];
  /** Remove all items. */
  clear(): void;
  /** Number of indexed items. */
  readonly size: number;
}
