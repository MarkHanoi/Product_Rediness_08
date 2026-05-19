// geometry-bridge — `BufferGeometryDescriptor` → `THREE.BufferGeometry`.
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S09 D6 line:
//   "Implement bridge from BufferGeometryDescriptor → THREE.BufferGeometry
//    (pooled, reused across walls)."
//
// THREE-only file — lives under `plugins/wall/src/committer/` so the
// `pryzm/no-three-outside-committer` rule (folder-form allowlist) lets
// it import THREE.  Higher layers still see only the public committer
// surface.
//
// The bridge is a PURE translation — no caching, no pooling.  Pooling
// of identical geometries (same descriptor.hash) is the WallCommitter's
// concern; this file is the safe, sized-attribute path used on cache
// miss.

import * as THREE from '@pryzm/renderer-three/three';
import type { BufferGeometryDescriptor } from '@pryzm/plugin-sdk';

/**
 * Build a THREE.BufferGeometry that mirrors `descriptor` exactly:
 *
 *   • `position` / `normal` / `uv` attributes wrap the descriptor's
 *      typed arrays directly (no copy — the descriptor's lifetime is
 *      tied to the geometry's via the WallCommitter).
 *   • Index buffer uses the descriptor's narrowest type (Uint16 or
 *      Uint32) — `THREE.BufferAttribute(array, 1)` honours the array
 *      element type so picking + draws use the right glDrawElements
 *      argument.
 *   • Each `descriptor.groups[i]` becomes one `geometry.addGroup(start,
 *      count, materialIndex)` call so the MeshPass issues per-material
 *      draw ranges (matches `THREE.Mesh` material-array semantics when
 *      the committer hands the Mesh a `material[]`).
 *   • bounding box / sphere are populated up-front so the renderer can
 *      frustum-cull without traversing the position attribute on every
 *      frame.
 */
export function buildBufferGeometry(
  descriptor: BufferGeometryDescriptor,
): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(descriptor.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(descriptor.normal, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(descriptor.uv, 2));
  g.setIndex(new THREE.BufferAttribute(descriptor.index, 1));

  for (const grp of descriptor.groups) {
    g.addGroup(grp.start, grp.count, grp.materialIndex);
  }

  const min = descriptor.bounds.min;
  const max = descriptor.bounds.max;
  g.boundingBox = new THREE.Box3(
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z),
  );
  // Bounding sphere from the AABB centre + corner — cheap and sufficient
  // for frustum culling.  The renderer never re-derives this.
  const cx = (min.x + max.x) * 0.5;
  const cy = (min.y + max.y) * 0.5;
  const cz = (min.z + max.z) * 0.5;
  const dx = max.x - cx;
  const dy = max.y - cy;
  const dz = max.z - cz;
  g.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(cx, cy, cz),
    Math.sqrt(dx * dx + dy * dy + dz * dz),
  );
  return g;
}

/** Free GPU buffers held by `geometry`.  Idempotent — safe to call
 *  twice (THREE swallows the second `dispose`). */
export function disposeGeometry(geometry: THREE.BufferGeometry): void {
  geometry.dispose();
}
