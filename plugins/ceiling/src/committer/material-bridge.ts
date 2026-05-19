import * as THREE from '@pryzm/renderer-three/three';

const FALLBACK_BY_SLOT: Readonly<Record<string, string>> = {
  top: '#f5f5f5',
  bottom: '#eaeaea',
  edge: '#cfcfcf',
};

export type CeilingMaterialSlot = 'top' | 'bottom' | 'edge';

export function slotOfCeilingMaterialKey(key: string): CeilingMaterialSlot {
  // Compose key: ceiling|<materialId>|<color>|<slot>
  const parts = key.split('|');
  const s = parts[3] as CeilingMaterialSlot | undefined;
  return s && (s in FALLBACK_BY_SLOT) ? s : 'bottom';
}

export function colorOfCeilingMaterialKey(key: string): string {
  const parts = key.split('|');
  const overrideColor = parts[2];
  if (overrideColor && overrideColor.length > 0) return overrideColor;
  return FALLBACK_BY_SLOT[slotOfCeilingMaterialKey(key)] ?? FALLBACK_BY_SLOT.bottom!;
}

export function makeCeilingMaterialFactory(key: string): () => THREE.MeshStandardMaterial {
  const color = colorOfCeilingMaterialKey(key);
  return () => new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.95,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
}
