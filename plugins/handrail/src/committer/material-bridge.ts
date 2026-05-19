import * as THREE from '@pryzm/renderer-three/three';

const RAIL_FALLBACK = '#5a4a3a';

export function colorOfHandrailMaterialKey(_key: string): string {
  return RAIL_FALLBACK;
}

export function makeHandrailMaterialFactory(_key: string): () => THREE.MeshStandardMaterial {
  return () => new THREE.MeshStandardMaterial({
    color: new THREE.Color(RAIL_FALLBACK),
    roughness: 0.6,
    metalness: 0.2,
    side: THREE.DoubleSide,
  });
}
