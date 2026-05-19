// material-bridge — window MaterialKey → THREE.MeshStandardMaterial.
//
// Spec: §S11 — window material slot keys come out of the producer in
// the pipe-separated form `window|<systemTypeId>|<materialId>|<color>|<slot>`
// (slot ∈ frame|glass).

import * as THREE from '@pryzm/renderer-three/three';

const PRYZM1_FRAME_ROUGHNESS = 0.55;
const PRYZM1_FRAME_METALNESS = 0.05;
const PRYZM1_GLASS_ROUGHNESS = 0.05;
const PRYZM1_GLASS_METALNESS = 0.0;
const PRYZM1_GLASS_OPACITY = 0.35;
const FALLBACK_FRAME_COLOR = '#cccccc';
const FALLBACK_GLASS_COLOR = '#a4c8e1';

export function colorOfWindowMaterialKey(key: string): string {
  const parts = key.split('|');
  if (parts.length < 5 || parts[0] !== 'window') return FALLBACK_GLASS_COLOR;
  const col = parts[3];
  if (col && col.length > 0) return col;
  return parts[4] === 'frame' ? FALLBACK_FRAME_COLOR : FALLBACK_GLASS_COLOR;
}

export function slotOfWindowMaterialKey(key: string): 'frame' | 'glass' {
  const parts = key.split('|');
  return parts[4] === 'frame' ? 'frame' : 'glass';
}

export function makeWindowMaterialFactory(key: string): () => THREE.MeshStandardMaterial {
  const color = colorOfWindowMaterialKey(key);
  const slot = slotOfWindowMaterialKey(key);
  return () => {
    if (slot === 'frame') {
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        roughness: PRYZM1_FRAME_ROUGHNESS,
        metalness: PRYZM1_FRAME_METALNESS,
        side: THREE.DoubleSide,
      });
    }
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: PRYZM1_GLASS_ROUGHNESS,
      metalness: PRYZM1_GLASS_METALNESS,
      transparent: true,
      opacity: PRYZM1_GLASS_OPACITY,
      side: THREE.DoubleSide,
    });
  };
}
