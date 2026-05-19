// material-bridge — slab MaterialKey → THREE.MeshStandardMaterial.
//
// Slab material slot keys come out of the kernel as
// `slab|<systemTypeId>|<materialId>|<color>|<slot>` where slot ∈
// {top, bottom, side}.  The bridge maps the slot onto PRYZM 1's
// concrete-floor PBR settings.

import * as THREE from '@pryzm/renderer-three/three';

const TOP_ROUGHNESS = 0.85;
const TOP_METALNESS = 0.05;
const BOTTOM_ROUGHNESS = 0.95;
const BOTTOM_METALNESS = 0.0;
const SIDE_ROUGHNESS = 0.9;
const SIDE_METALNESS = 0.0;

const FALLBACK_COLOURS: Readonly<Record<string, string>> = {
  top: '#cfcfcf',
  bottom: '#a8a8a8',
  side: '#9a9a9a',
};

export type SlabMaterialSlot = 'top' | 'bottom' | 'side';

export function slotOfSlabMaterialKey(key: string): SlabMaterialSlot {
  // composeSlabMaterialKey emits `slab|<sys>|<mat>|<color>|<slot>`
  const parts = key.split('|');
  const slot = parts[4] as SlabMaterialSlot | undefined;
  return slot && (slot in FALLBACK_COLOURS) ? slot : 'top';
}

export function colorOfSlabMaterialKey(key: string): string {
  const parts = key.split('|');
  if (parts.length < 5) return FALLBACK_COLOURS.top!;
  const col = parts[3];
  if (col && col.length > 0) return col;
  return FALLBACK_COLOURS[slotOfSlabMaterialKey(key)] ?? FALLBACK_COLOURS.top!;
}

export function makeSlabMaterialFactory(key: string): () => THREE.MeshStandardMaterial {
  const color = colorOfSlabMaterialKey(key);
  const slot = slotOfSlabMaterialKey(key);
  let roughness = TOP_ROUGHNESS;
  let metalness = TOP_METALNESS;
  if (slot === 'bottom') { roughness = BOTTOM_ROUGHNESS; metalness = BOTTOM_METALNESS; }
  else if (slot === 'side') { roughness = SIDE_ROUGHNESS; metalness = SIDE_METALNESS; }
  return () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness,
      metalness,
      side: THREE.DoubleSide,
    });
}
