// material-bridge — door MaterialKey → THREE.MeshStandardMaterial.
//
// Spec: §S11 — door material slot keys come out of the producer in the
// pipe-separated form `door|<systemTypeId>|<materialId>|<color>|<slot>`
// (slot ∈ frame|leaf).  This file is the symmetrical analogue of
// `plugins/wall/src/committer/material-bridge.ts`.

import * as THREE from '@pryzm/renderer-three/three';

const PRYZM1_DOOR_ROUGHNESS = 0.6;
const PRYZM1_DOOR_METALNESS = 0.05;
const FALLBACK_FRAME_COLOR = '#8b7058';
const FALLBACK_LEAF_COLOR = '#c2a684';

export function colorOfDoorMaterialKey(key: string): string {
  const parts = key.split('|');
  if (parts.length < 5 || parts[0] !== 'door') return FALLBACK_LEAF_COLOR;
  const col = parts[3];
  if (col && col.length > 0) return col;
  return parts[4] === 'frame' ? FALLBACK_FRAME_COLOR : FALLBACK_LEAF_COLOR;
}

export function makeDoorMaterialFactory(key: string): () => THREE.MeshStandardMaterial {
  const color = colorOfDoorMaterialKey(key);
  return () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: PRYZM1_DOOR_ROUGHNESS,
      metalness: PRYZM1_DOOR_METALNESS,
      side: THREE.DoubleSide,
    });
}
