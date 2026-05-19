// material-bridge — stair MaterialKey → THREE.MeshStandardMaterial.
//
// Stair material keys come out of the kernel as
// `stair|<materialId>|<slot>` where slot ∈ {tread, riser}.

import * as THREE from '@pryzm/renderer-three/three';

const TREAD_FALLBACK = '#b58a5e';
const RISER_FALLBACK = '#9a7a52';

export type StairMaterialSlot = 'tread' | 'riser';

export function slotOfStairMaterialKey(key: string): StairMaterialSlot {
  const parts = key.split('|');
  return parts[2] === 'riser' ? 'riser' : 'tread';
}

export function colorOfStairMaterialKey(key: string): string {
  return slotOfStairMaterialKey(key) === 'riser' ? RISER_FALLBACK : TREAD_FALLBACK;
}

export function makeStairMaterialFactory(key: string): () => THREE.MeshStandardMaterial {
  const color = colorOfStairMaterialKey(key);
  const slot = slotOfStairMaterialKey(key);
  return () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: slot === 'riser' ? 0.85 : 0.7,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
}
