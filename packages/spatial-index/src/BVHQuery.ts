// @pryzm/spatial-index — BVHQuery (Wave A16 S123, A16-T7).
//
// CONTRACT (C04 §3): Element spatial queries MUST use a real acceleration
// structure.  This file promotes the package from SpatialGrid (uniform-cell
// hash-grid) to a proper BVH (Bounding Volume Hierarchy) for O(log n)
// ray intersection and frustum culling.
//
// Implementation: median-split AABB tree (surface-area heuristic deferred;
// median split is simpler, build is O(n log n), queries are O(log n) average).
//
// Layer: L2 — no DOM, no React, no stores.  THREE geometry types only.
//
// NOTE: This package is OUTSIDE packages/renderer-three/ and MUST import
// THREE via the sub-path re-export (@pryzm/renderer-three/three), not from
// 'three' directly (P2 gate — check-three-imports.ts, HARD_FAIL=0).

import * as THREE from '@pryzm/renderer-three/three';

// ── Public types ───────────────────────────────────────────────────────────

/** A scene element with an axis-aligned bounding box. */
export interface BVHElement {
  /** Stable element ID (same as the ID in the picking ID buffer). */
  readonly id: string;
  /** Axis-aligned bounding box of the element in world space. */
  readonly bounds: THREE.Box3;
}

export interface BVHQueryOptions {
  /**
   * Maximum number of elements stored in a leaf node before the node is split.
   * Default: 4.  Lower values → deeper tree, faster queries, more memory.
   */
  maxLeafSize?: number;
}

// ── Internal tree types ────────────────────────────────────────────────────

interface BVHLeaf {
  readonly kind: 'leaf';
  readonly ids: string[];
  readonly bounds: THREE.Box3;
}

interface BVHInternal {
  readonly kind: 'internal';
  readonly bounds: THREE.Box3;
  readonly left: BVHNode;
  readonly right: BVHNode;
}

type BVHNode = BVHLeaf | BVHInternal;

// ── BVHQuery ───────────────────────────────────────────────────────────────

/**
 * BVHQuery — O(log n) spatial queries over scene elements.
 *
 * Replaces the uniform-grid (`SpatialGrid`) for use cases that need
 * ray intersection and frustum culling over large element sets
 * (C04 §3 — picking system MUST use an acceleration structure).
 *
 * @example
 * ```ts
 * import { BVHQuery } from '@pryzm/spatial-index';
 * import * as THREE from '@pryzm/renderer-three/three';
 *
 * const bvh = new BVHQuery();
 * bvh.build(elements.map(e => ({ id: e.id, bounds: e.worldBounds })));
 *
 * const hits = bvh.intersectRay(ray.origin, ray.direction);
 * // hits is a subset of element IDs — follow up with mesh-level tests.
 *
 * const visible = bvh.frustumCull(camera.frustum);
 * ```
 */
export class BVHQuery {
  private _root: BVHNode | null = null;
  private _elementCount = 0;
  private readonly _maxLeaf: number;

  // Scratch vectors — reused across calls to avoid allocations on the hot path.
  private static readonly _sSize = new THREE.Vector3();

  constructor(options: BVHQueryOptions = {}) {
    this._maxLeaf = Math.max(1, options.maxLeafSize ?? 4);
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  /**
   * Build the BVH over `elements`.  O(n log n).
   * Replaces any previously built tree.
   * Calling `build([])` resets the tree to empty.
   */
  build(elements: readonly BVHElement[]): void {
    this._elementCount = elements.length;
    this._root = elements.length > 0 ? this._buildNode([...elements]) : null;
  }

  /** Number of elements in the most-recently-built tree. */
  get elementCount(): number {
    return this._elementCount;
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  /**
   * O(log n) ray intersection.
   *
   * Returns the IDs of all elements whose AABB intersects the ray.
   * Callers that need exact mesh-level hits should follow up with
   * `THREE.Raycaster` against only this subset (avoids O(n) full scene cast).
   *
   * @param origin    Ray origin in world space.
   * @param direction Ray direction in world space (need not be normalised).
   */
  intersectRay(origin: THREE.Vector3, direction: THREE.Vector3): string[] {
    if (!this._root) return [];
    const ray = new THREE.Ray(origin, direction.clone().normalize());
    const hits: string[] = [];
    this._traverseRay(this._root, ray, hits);
    return hits;
  }

  /**
   * O(log n) frustum cull.
   *
   * Returns the IDs of all elements whose AABB intersects the frustum.
   * Suitable for per-frame visibility culling and LOD determination.
   *
   * @param frustum Camera frustum in world space (e.g. from `THREE.Camera`).
   */
  frustumCull(frustum: THREE.Frustum): string[] {
    if (!this._root) return [];
    const visible: string[] = [];
    this._traverseFrustum(this._root, frustum, visible);
    return visible;
  }

  // ── Private — tree construction ───────────────────────────────────────────

  private _buildNode(elements: BVHElement[]): BVHNode {
    const bounds = this._unionBounds(elements);

    if (elements.length <= this._maxLeaf) {
      return { kind: 'leaf', ids: elements.map(e => e.id), bounds };
    }

    // Choose the axis with the longest extent (simple SAH approximation).
    bounds.getSize(BVHQuery._sSize);
    const { x, y, z } = BVHQuery._sSize;
    const axis: 0 | 1 | 2 = x >= y && x >= z ? 0 : y >= z ? 1 : 2;
    const axisKey = (['x', 'y', 'z'] as const)[axis];

    // Median-split by centroid on the chosen axis.
    const scratch = new THREE.Vector3();
    elements.sort((a, b) => {
      a.bounds.getCenter(scratch);
      const ca = scratch[axisKey];
      b.bounds.getCenter(scratch);
      return ca - scratch[axisKey];
    });

    const mid = Math.ceil(elements.length / 2);
    return {
      kind: 'internal',
      bounds,
      left: this._buildNode(elements.slice(0, mid)),
      right: this._buildNode(elements.slice(mid)),
    };
  }

  private _unionBounds(elements: BVHElement[]): THREE.Box3 {
    const bounds = new THREE.Box3();
    for (const e of elements) bounds.union(e.bounds);
    return bounds;
  }

  // ── Private — traversal ───────────────────────────────────────────────────

  private _traverseRay(node: BVHNode, ray: THREE.Ray, hits: string[]): void {
    // Early-out: ray misses this node's AABB entirely.
    if (!ray.intersectsBox(node.bounds)) return;

    if (node.kind === 'leaf') {
      for (const id of node.ids) hits.push(id);
    } else {
      this._traverseRay(node.left, ray, hits);
      this._traverseRay(node.right, ray, hits);
    }
  }

  private _traverseFrustum(node: BVHNode, frustum: THREE.Frustum, visible: string[]): void {
    // Early-out: AABB is entirely outside the frustum.
    if (!frustum.intersectsBox(node.bounds)) return;

    if (node.kind === 'leaf') {
      for (const id of node.ids) visible.push(id);
    } else {
      this._traverseFrustum(node.left, frustum, visible);
      this._traverseFrustum(node.right, frustum, visible);
    }
  }
}
