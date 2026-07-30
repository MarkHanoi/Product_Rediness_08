// material-bridge — lighting MaterialKey → THREE.MeshStandardMaterial.
//
// Material key shape (from producers/lighting.ts):
//   `lighting|<kind>|<materialId>|<color>|<intensity>|<range>|<emergency>|body`

import * as THREE from '@pryzm/renderer-three/three';

const FALLBACK_COLOR = '#ffffff';

function parseColor(token: string | undefined): string {
  if (!token) return FALLBACK_COLOR;
  // hex, e.g. "ffffff" or "#ffffff"
  if (token.startsWith('#')) return token;
  if (/^[0-9a-fA-F]{6}$/.test(token)) return `#${token}`;
  // tuple form "1,1,1" → multiply 255
  if (token.includes(',')) {
    // Under noUncheckedIndexedAccess each channel is `number | undefined`;
    // default missing channels to 0 (consistent with the `Number(v) || 0`
    // fallback above) so THREE.Color always receives numbers. For a well-formed
    // "r,g,b" tuple every channel is present, so this is a no-op at runtime.
    const rgb = token.split(',').map((v) => Math.max(0, Math.min(1, Number(v) || 0)));
    const c = new THREE.Color(rgb[0] ?? 0, rgb[1] ?? 0, rgb[2] ?? 0);
    return `#${c.getHexString()}`;
  }
  return FALLBACK_COLOR;
}

export function colorOfLightingMaterialKey(key: string): string {
  const parts = key.split('|');
  if (parts.length < 4) return FALLBACK_COLOR;
  return parseColor(parts[3]);
}

export function makeLightingMaterialFactory(key: string): () => THREE.MeshStandardMaterial {
  const color = colorOfLightingMaterialKey(key);
  return () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.4,
      roughness: 0.4,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
}
