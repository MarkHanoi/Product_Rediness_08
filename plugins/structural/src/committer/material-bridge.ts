// material-bridge — structural MaterialKey → THREE.MeshStandardMaterial.
//
// Material key shape (from producers/structural.ts):
//   `structural|<kind>|<materialId>|<color>|body`

import * as THREE from '@pryzm/renderer-three/three';

const ROUGHNESS = 0.85;
const METALNESS = 0.05;
const FALLBACK_COLOR = '#7a8190';

export function colorOfStructuralMaterialKey(key: string): string {
  const parts = key.split('|');
  if (parts.length < 4) return FALLBACK_COLOR;
  const col = parts[3];
  return col && col.length > 0 ? col : FALLBACK_COLOR;
}

export function makeStructuralMaterialFactory(key: string): () => THREE.MeshStandardMaterial {
  const color = colorOfStructuralMaterialKey(key);
  return () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: ROUGHNESS,
      metalness: METALNESS,
      side: THREE.DoubleSide,
    });
}
