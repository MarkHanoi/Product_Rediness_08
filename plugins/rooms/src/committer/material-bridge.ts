// material-bridge — room MaterialKey → THREE.MeshStandardMaterial.
//
// Room material keys are emitted as `room|<materialId>|<color>|fill`.
// Rooms are read from above (overhead camera in plan, raised camera
// in 3D) so we keep the floor-fill nearly unlit — matte, double-sided,
// transparent at 0.18 alpha so the slab beneath shows through.

import * as THREE from '@pryzm/renderer-three/three';

const FALLBACK_COLOR = '#b3d8ff';
const FILL_OPACITY = 0.18;
const FILL_ROUGHNESS = 0.95;
const FILL_METALNESS = 0.0;

export function colorOfRoomMaterialKey(key: string): string {
  // composeRoomMaterialKey emits `room|<mat>|<color>|fill`
  const parts = key.split('|');
  if (parts.length < 4) return FALLBACK_COLOR;
  const col = parts[2];
  if (col && col.length > 0) return col;
  return FALLBACK_COLOR;
}

export function makeRoomMaterialFactory(key: string): () => THREE.MeshStandardMaterial {
  const color = colorOfRoomMaterialKey(key);
  return () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: FILL_ROUGHNESS,
      metalness: FILL_METALNESS,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: FILL_OPACITY,
      depthWrite: false,
    });
}
