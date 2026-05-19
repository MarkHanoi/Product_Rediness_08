// material-bridge — column MaterialKey → THREE.MeshStandardMaterial.
//
// Column material keys come out of the kernel as
// `column|<systemTypeId>|<materialId>|<color>|<slot>` where slot is
// usually 'side'.  Concrete / steel default colours.

import * as THREE from '@pryzm/renderer-three/three';

const STRUCTURAL_ROUGHNESS = 0.85;
const STRUCTURAL_METALNESS = 0.05;

const FALLBACK_COLOR = '#9b9b9b';

export function colorOfColumnMaterialKey(key: string): string {
  const parts = key.split('|');
  if (parts.length < 4) return FALLBACK_COLOR;
  const col = parts[3];
  return col && col.length > 0 ? col : FALLBACK_COLOR;
}

export function makeColumnMaterialFactory(key: string): () => THREE.MeshStandardMaterial {
  const color = colorOfColumnMaterialKey(key);
  return () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: STRUCTURAL_ROUGHNESS,
      metalness: STRUCTURAL_METALNESS,
      side: THREE.DoubleSide,
    });
}
