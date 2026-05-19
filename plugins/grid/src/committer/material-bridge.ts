// material-bridge — grid MaterialKey → THREE.MeshBasicMaterial.
//
// Grid lines are 2D guides; we render them with an unlit basic
// material so they remain visible at any camera angle / lighting.

import * as THREE from '@pryzm/renderer-three/three';

const FALLBACK_COLOR = '#5b5b5b';

export function colorOfGridMaterialKey(key: string): string {
  const parts = key.split('|');
  if (parts.length < 4) return FALLBACK_COLOR;
  const col = parts[3];
  return col && col.length > 0 ? col : FALLBACK_COLOR;
}

export function makeGridMaterialFactory(key: string): () => THREE.MeshBasicMaterial {
  const color = colorOfGridMaterialKey(key);
  return () =>
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
}
