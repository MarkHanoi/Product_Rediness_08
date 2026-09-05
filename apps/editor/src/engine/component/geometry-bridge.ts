// geometry-bridge — component `BufferGeometryDescriptor` → `THREE.BufferGeometry`.
// §COMPONENT-RENDER (audit §12 Phase 4E).
//
// ⚠ THIS IS THE THIRD PER-PLUGIN COPY OF A TWELVE-LINE TRANSLATION, AND THE
//   DUPLICATION IS DISCLOSED RATHER THAN DISCOVERED LATER.
//
//   Measured 2026-09-02:
//     plugins/wall/src/committer/geometry-bridge.ts      `buildBufferGeometry`
//     plugins/furniture/src/committer/geometry-bridge.ts `buildFurnitureBufferGeometry`
//     packages/geometry-wall/src/descriptorToBufferGeometry.ts (+ `toCreasedNormals`)
//
//   `@pryzm/plugin-sdk` exports `BufferGeometryDescriptor`, `MaterialPool`,
//   `PrimitiveCommitter` and `bindStore` — and NO descriptor→geometry bridge. So
//   the choices were: (a) import another PLUGIN's committer subpath, coupling the
//   component family to the wall family for a THREE API call; (b) import the L2
//   `geometry-wall` copy, which is legal for a plugin but names a different family
//   and applies wall-specific crease welding; or (c) follow the per-plugin
//   convention the two existing committers already establish.
//
//   (c), because (a) and (b) both buy de-duplication with a WRONG-NAMED edge, and
//   because the right fix is to promote ONE of these onto the SDK facade — which
//   is a `packages/plugin-sdk` change this lane does not own. Logged as the
//   §COMPONENT-RENDER-BRIDGE-DUP finding rather than silently repeated.
//
// ⛔ NO CREASE WELDING. `descriptorToBufferGeometry` runs `toCreasedNormals` at
//    30° because the wall CSG boolean emits per-triangle soup whose coplanar
//    normals differ by float noise (§96-CSG-SEAM-FIX). `produceExtrude` emits
//    clean per-face normals and no boolean runs here, so welding would be a
//    cargo-culted step that changes the vertex count of a geometry whose vertex
//    count lane 4D asserts on.

import * as THREE from '@pryzm/renderer-three/three';
import type { BufferGeometryDescriptor } from '@pryzm/plugin-sdk';

/**
 * Build a `THREE.BufferGeometry` from a kernel descriptor.
 *
 * The typed arrays are wrapped, NOT copied — the descriptor's buffers become the
 * geometry's storage, which is the interchange contract's stated intent
 * (*"no copy when the buffers are owned by the committer's lifetime"*).
 *
 * Bounds are taken from the descriptor rather than recomputed: the producer
 * already computed them over the same vertices, and recomputing would give a
 * second answer to one question at the cost of a full buffer scan per element.
 */
export function buildComponentBufferGeometry(
  descriptor: BufferGeometryDescriptor,
): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(descriptor.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(descriptor.normal, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(descriptor.uv, 2));
  g.setIndex(new THREE.BufferAttribute(descriptor.index, 1));
  for (const grp of descriptor.groups) g.addGroup(grp.start, grp.count, grp.materialIndex);

  const { min, max } = descriptor.bounds;
  g.boundingBox = new THREE.Box3(
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z),
  );
  const cx = (min.x + max.x) * 0.5;
  const cy = (min.y + max.y) * 0.5;
  const cz = (min.z + max.z) * 0.5;
  g.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(cx, cy, cz),
    Math.hypot(max.x - cx, max.y - cy, max.z - cz),
  );
  return g;
}

export function disposeComponentGeometry(g: THREE.BufferGeometry | null | undefined): void {
  if (g) g.dispose();
}
