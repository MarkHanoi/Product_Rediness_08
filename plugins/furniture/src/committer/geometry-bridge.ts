// geometry-bridge — furniture BufferGeometryDescriptor → THREE.BufferGeometry.

import * as THREE from '@pryzm/renderer-three/three';
import type { BufferGeometryDescriptor } from '@pryzm/plugin-sdk';

export function buildFurnitureBufferGeometry(
  descriptor: BufferGeometryDescriptor,
): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(descriptor.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(descriptor.normal, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(descriptor.uv, 2));
  g.setIndex(new THREE.BufferAttribute(descriptor.index, 1));
  for (const grp of descriptor.groups) g.addGroup(grp.start, grp.count, grp.materialIndex);
  const min = descriptor.bounds.min, max = descriptor.bounds.max;
  g.boundingBox = new THREE.Box3(
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z),
  );
  const cx = (min.x + max.x) * 0.5, cy = (min.y + max.y) * 0.5, cz = (min.z + max.z) * 0.5;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, cy, cz),
    Math.hypot(max.x - cx, max.y - cy, max.z - cz));
  return g;
}

export function disposeFurnitureGeometry(g: THREE.BufferGeometry | null | undefined): void {
  if (g) g.dispose();
}
