// material-bridge — curtain-wall MaterialKey → THREE.MeshStandardMaterial.
//
// Curtain-wall material keys from the kernel are
// `curtainwall|<systemTypeId>|<materialId>|<color>|<slot>` where
// slot ∈ {mullion, transom, glazed, spandrel, door, opaque}.
// Glazed panels are translucent + low-roughness; mullions/transoms
// are dark anodised aluminium.

import * as THREE from '@pryzm/renderer-three/three';

const FALLBACK_COLOURS: Readonly<Record<string, string>> = {
  mullion: '#3a3a3a',
  transom: '#3a3a3a',
  glazed: '#9bc8e4',
  spandrel: '#5a5a5a',
  door: '#404040',
  opaque: '#7d7d7d',
};

export type CurtainWallSlot = keyof typeof FALLBACK_COLOURS;

export function slotOfCurtainWallMaterialKey(key: string): CurtainWallSlot {
  const parts = key.split('|');
  const slot = parts[4];
  if (slot && (slot in FALLBACK_COLOURS)) return slot as CurtainWallSlot;
  return 'glazed';
}

export function colorOfCurtainWallMaterialKey(key: string): string {
  const parts = key.split('|');
  if (parts.length < 5) return FALLBACK_COLOURS.glazed!;
  const col = parts[3];
  if (col && col.length > 0) return col;
  return FALLBACK_COLOURS[slotOfCurtainWallMaterialKey(key)] ?? FALLBACK_COLOURS.glazed!;
}

export function makeCurtainWallMaterialFactory(key: string): () => THREE.MeshStandardMaterial {
  const slot = slotOfCurtainWallMaterialKey(key);
  const color = colorOfCurtainWallMaterialKey(key);
  if (slot === 'glazed') {
    return () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        roughness: 0.1,
        metalness: 0.0,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
      });
  }
  if (slot === 'mullion' || slot === 'transom') {
    return () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        roughness: 0.5,
        metalness: 0.6,
        side: THREE.DoubleSide,
      });
  }
  return () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: 0.8,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
}
