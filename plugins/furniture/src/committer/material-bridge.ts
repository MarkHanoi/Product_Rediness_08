// material-bridge — furniture MaterialKey → THREE.MeshStandardMaterial.
//
// Material key shape (from producers/furniture.ts):
//   `furniture|<catalogId>|<materialId>|lod=<n>|primary`
//
// We deterministically derive a fallback colour from the materialId
// hash (good-enough placeholder until the dynamic material editor in
// S58 starts feeding real PBR parameters in here).

import * as THREE from '@pryzm/renderer-three/three';

const ROUGHNESS = 0.7;
const METALNESS = 0.0;
const FALLBACK_COLOR = '#a78b6e';

const PALETTE = [
  '#a78b6e', '#b9a48b', '#7d8c8c', '#a3bca3',
  '#8fa6c4', '#c69ea3', '#caa56b', '#9b8eb0',
] as const;

function hashMaterialId(materialId: string): string {
  if (materialId.length === 0) return FALLBACK_COLOR;
  let h = 5381;
  for (let i = 0; i < materialId.length; i++) {
    h = ((h << 5) + h) ^ materialId.charCodeAt(i);
  }
  return PALETTE[Math.abs(h) % PALETTE.length] ?? FALLBACK_COLOR;
}

export function colorOfFurnitureMaterialKey(key: string): string {
  const parts = key.split('|');
  // parts[0] = "furniture", parts[1] = catalogId, parts[2] = materialId
  if (parts.length < 3) return FALLBACK_COLOR;
  return hashMaterialId(parts[2] ?? '');
}

export function makeFurnitureMaterialFactory(key: string): () => THREE.MeshStandardMaterial {
  const color = colorOfFurnitureMaterialKey(key);
  return () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: ROUGHNESS,
      metalness: METALNESS,
      side: THREE.DoubleSide,
    });
}
