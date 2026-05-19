// material-bridge — beam MaterialKey → THREE.MeshStandardMaterial.

import * as THREE from '@pryzm/renderer-three/three';

const STRUCTURAL_ROUGHNESS = 0.85;
const STRUCTURAL_METALNESS = 0.05;
const FALLBACK_COLOR = '#9b9b9b';

export function colorOfBeamMaterialKey(key: string): string {
  const parts = key.split('|');
  if (parts.length < 4) return FALLBACK_COLOR;
  const col = parts[3];
  return col && col.length > 0 ? col : FALLBACK_COLOR;
}

export function makeBeamMaterialFactory(key: string): () => THREE.MeshStandardMaterial {
  const color = colorOfBeamMaterialKey(key);
  return () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: STRUCTURAL_ROUGHNESS,
      metalness: STRUCTURAL_METALNESS,
      side: THREE.DoubleSide,
    });
}
