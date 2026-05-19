// BufferGeometryDescriptor — the kernel ↔ committer interchange shape.
//
// FROZEN at S08 D2 by ADR-009.  Plain typed arrays only — zero THREE
// imports — so the producer can run byte-identically in the browser
// worker, Node `worker_thread`, and the bake service (P1 from
// `01-TARGET-ARCHITECTURE.md §0`).
//
// The committer reconstructs `THREE.BufferGeometry` on the scenic side
// by wrapping each typed array in a `THREE.BufferAttribute` (no copy
// when the buffers are owned by the committer's lifetime).
//
// The S07 stub (a wrapped-attribute shape) is REPLACED here with the
// flat shape mandated by `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md`
// §S08 lines 589-600 + ADR-009.

import type { Point3D } from './Point3D.js';
import type { MaterialKey } from './MaterialKey.js';

/**
 * One contiguous draw range inside a descriptor.  Mirrors
 * `THREE.BufferGeometry.groups[i]`.  The committer issues one
 * `drawElements()` per group.
 */
export interface DescriptorGroup {
  /** First index in `descriptor.index` for this group (in INDEX units). */
  readonly start: number;
  /** Number of indices in this group. */
  readonly count: number;
  /** Offset into `descriptor.materialKeys` (resolved by `MaterialPool`). */
  readonly materialIndex: number;
}

/**
 * The DTO produced by `producers/<element>.ts` and consumed by
 * `plugins/<element>/committer.ts`.
 *
 * Invariants (enforced by `assertValidDescriptor`):
 *   - `position.length === 3 * vertexCount`
 *   - `normal.length   === 3 * vertexCount` and ≈ unit-length
 *   - `uv.length       === 2 * vertexCount`
 *   - every entry in `index` is in `[0, vertexCount)`
 *   - `Σ groups[i].count === index.length` and the groups are
 *     monotonically non-overlapping
 *   - `bounds.min.x ≤ bounds.max.x` (and same for y, z)
 *   - all numeric values are finite (no NaN, no Infinity)
 *   - `hash` is a non-empty string
 */
export interface BufferGeometryDescriptor {
  /** Tightly-packed positions (x, y, z, x, y, z, …). */
  readonly position: Float32Array;
  /** Tightly-packed normals (x, y, z, …) — unit-length within 1e-5. */
  readonly normal: Float32Array;
  /** Tightly-packed UVs (u, v, …). */
  readonly uv: Float32Array;
  /**
   * Triangle index buffer.  `Uint16Array` when `vertexCount < 65536`;
   * `Uint32Array` otherwise.  The producer chooses the narrowest type
   * that fits.
   */
  readonly index: Uint16Array | Uint32Array;
  /** Axis-aligned bounding box in the DTO's local space. */
  readonly bounds: { readonly min: Point3D; readonly max: Point3D };
  /**
   * Draw groups partition `index` into per-material slices.  At least
   * one entry; for a single-material geometry the array has length 1.
   */
  readonly groups: readonly DescriptorGroup[];
  /**
   * Content-addressed material keys, indexed by
   * `groups[i].materialIndex`.  Resolved by `MaterialPool` on the
   * committer side.
   */
  readonly materialKeys: readonly MaterialKey[];
  /**
   * Composer-derived deterministic cache key.  For walls this is the
   * output of `composeWallGeometryHash`; identical inputs MUST produce
   * identical hashes across Node and the browser.
   */
  readonly hash: string;
}

// `IndexedAttribute` is the legacy S07-stub name that early callers
// referenced.  Re-export a stripped-down compatibility shim so the
// switch to the flat shape is a non-breaking import-path change for
// any sketch code that landed before S08 D2.  No runtime cost.
export interface IndexedAttribute {
  readonly itemSize: number;
  readonly array: Float32Array;
  readonly normalized?: boolean;
}
