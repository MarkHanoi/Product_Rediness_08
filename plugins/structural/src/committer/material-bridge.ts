// material-bridge — structural MaterialKey → THREE.MeshStandardMaterial.
//
// Material key shape (from producers/structural.ts):
//   `structural|<kind>|<materialId>|<color>|body`

import * as THREE from '@pryzm/renderer-three/three';

const ROUGHNESS = 0.85;
const METALNESS = 0.05;
const FALLBACK_COLOR = '#7a8190';

/**
 * The marker `resolveMaterialColorSlot` writes when a `materialId` IS present and
 * names nothing in `MATERIAL_CATALOG`. A literal rather than an import from
 * `geometry-kernel/_internal`: this is L6 reading an L2 WIRE FORMAT. Same choice
 * the door, window, furniture, lighting and plumbing bridges make.
 */
const UNRESOLVED_PREFIX = 'unresolved:';

/** Magenta, on purpose (C100 §5). */
const UNRESOLVED_MATERIAL_COLOR = '#ff00ff';

/** True when the key names a material that could not be resolved in the master. */
export function isUnresolvedStructuralMaterialKey(key: string): boolean {
  return (key.split('|')[3] ?? '').startsWith(UNRESOLVED_PREFIX);
}

/** The id that failed to resolve, or `null` when the slot is an ordinary colour. */
export function unresolvedStructuralMaterialId(key: string): string | null {
  const slot = key.split('|')[3] ?? '';
  return slot.startsWith(UNRESOLVED_PREFIX) ? slot.slice(UNRESOLVED_PREFIX.length) : null;
}

export function colorOfStructuralMaterialKey(key: string): string {
  const parts = key.split('|');
  if (parts.length < 4) return FALLBACK_COLOR;
  const col = parts[3];
  // ⭐ C100 §5 — a NAMED failure outranks the fallback. Slot 3 arrives already
  // resolved by `resolveMaterialColorSlot`; `unresolved:` means this member names
  // a material that no longer exists, and a plausible structural grey over that is
  // exactly the silent failure this contract exists to prevent.
  if (col && col.startsWith(UNRESOLVED_PREFIX)) return UNRESOLVED_MATERIAL_COLOR;
  return col && col.length > 0 ? col : FALLBACK_COLOR;
}

export function makeStructuralMaterialFactory(key: string): () => THREE.MeshStandardMaterial {
  const color = colorOfStructuralMaterialKey(key);
  return () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: ROUGHNESS,
      metalness: METALNESS,
      side: THREE.DoubleSide,
    });
}
