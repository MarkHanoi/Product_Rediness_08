// material-bridge — plumbing MaterialKey → THREE.MeshStandardMaterial.
//
// Material key shape (from producers/plumbing.ts):
//   `plumbing|<kind>|<systemTag>|<color>|<materialId>|body`

import * as THREE from '@pryzm/renderer-three/three';

const SYSTEM_COLORS: Readonly<Record<string, string>> = {
  'cold-water': '#3aa0ff',
  'hot-water': '#ff5a3a',
  'waste': '#5a3a2a',
  'vent': '#9aa3b0',
  'gas': '#f5d142',
};

const FALLBACK_COLOR = '#9aa3b0';

export function colorOfPlumbingMaterialKey(key: string): string {
  const parts = key.split('|');
  if (parts.length < 4) return FALLBACK_COLOR;
  // Prefer explicit color token, otherwise look up by systemTag.
  const explicit = parts[3];
  if (explicit && explicit.length > 0 && explicit !== 'default') {
    if (explicit.startsWith('#')) return explicit;
    if (/^[0-9a-fA-F]{6}$/.test(explicit)) return `#${explicit}`;
  }
  const systemTag = parts[2];
  if (systemTag === undefined) return FALLBACK_COLOR;
  return SYSTEM_COLORS[systemTag] ?? FALLBACK_COLOR;
}

export function makePlumbingMaterialFactory(key: string): () => THREE.MeshStandardMaterial {
  const color = colorOfPlumbingMaterialKey(key);
  return () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: 0.5,
      metalness: 0.4,
      side: THREE.DoubleSide,
    });
}
