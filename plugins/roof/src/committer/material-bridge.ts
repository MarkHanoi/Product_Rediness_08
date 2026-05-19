// material-bridge — roof MaterialKey → THREE.MeshStandardMaterial.
//
// Roof material slot keys come out of the kernel via
// `composeRoofMaterialKey({slot, materialId, materialColor})` — see
// `packages/geometry-kernel/src/producers/_internal/roof/composeRoofMaterialKey.ts`.
// This bridge maps the `slot` (shingle | deck | trim | interior) onto
// PRYZM 1's PBR settings.

import * as THREE from '@pryzm/renderer-three/three';

const SHINGLE_ROUGHNESS = 0.85;
const SHINGLE_METALNESS = 0.05;
const DECK_ROUGHNESS = 0.9;
const DECK_METALNESS = 0.0;
const TRIM_ROUGHNESS = 0.4;
const TRIM_METALNESS = 0.1;

const FALLBACK_COLOURS: Readonly<Record<string, string>> = {
  shingle: '#7a4a2a',
  deck: '#a37b58',
  trim: '#3a3a3a',
  interior: '#cccccc',
};

export type RoofMaterialSlot = 'shingle' | 'deck' | 'trim' | 'interior';

export function slotOfRoofMaterialKey(key: string): RoofMaterialSlot {
  // composeRoofMaterialKey emits `roof|<slot>|<materialId>|<color>`
  const parts = key.split('|');
  const slot = parts[1] as RoofMaterialSlot | undefined;
  return slot && (slot in FALLBACK_COLOURS) ? slot : 'shingle';
}

export function colorOfRoofMaterialKey(key: string): string {
  const parts = key.split('|');
  if (parts.length < 4) return FALLBACK_COLOURS.shingle!;
  const col = parts[3];
  if (col && col.length > 0) return col;
  return FALLBACK_COLOURS[slotOfRoofMaterialKey(key)] ?? FALLBACK_COLOURS.shingle!;
}

export function makeRoofMaterialFactory(key: string): () => THREE.MeshStandardMaterial {
  const color = colorOfRoofMaterialKey(key);
  const slot = slotOfRoofMaterialKey(key);
  let roughness = SHINGLE_ROUGHNESS;
  let metalness = SHINGLE_METALNESS;
  if (slot === 'deck') { roughness = DECK_ROUGHNESS; metalness = DECK_METALNESS; }
  else if (slot === 'trim') { roughness = TRIM_ROUGHNESS; metalness = TRIM_METALNESS; }
  return () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness,
      metalness,
      side: THREE.DoubleSide,
    });
}
