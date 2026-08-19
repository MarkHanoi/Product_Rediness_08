// material-bridge — stair MaterialKey → THREE.MeshStandardMaterial.
//
// Stair material keys come out of the kernel as
// `stair|<materialId>|<colour>|<slot>` where slot ∈ {tread, riser}.
//
// ⭐ C100 §9.6.b / S16 — this file no longer DECIDES the stair's colour. It READS
// the one `producers/stair.ts` already resolved against the master catalogue.
//
// ⛔ WHAT IT USED TO DO, in one line, and it is the whole defect:
//
//     return slotOfStairMaterialKey(key) === 'riser' ? RISER_FALLBACK : TREAD_FALLBACK;
//
// The colour was a function of the SLOT and nothing else. The key carried a
// `materialId` — a reference into the master library — the entire way here, and
// **not one line of this file ever looked at it**. So every stair in the product
// was the same two browns no matter what the architect chose. C100 §9.1's finding,
// in one ternary.
//
// The key gained a colour slot at index 2 in the same commit (it had none — see
// `composeStairMaterialKey`'s header for why that is a deliberate exception to
// "converge the VALUE, not the FORMAT"), so the slot moved from index 2 to 3.

import * as THREE from '@pryzm/renderer-three/three';

/**
 * ⚠ RETAINED FOR LEGACY KEYS ONLY. These two hexes MOVED UPSTREAM into
 * `producers/stair.ts` as `STAIR_DEFAULT_BY_SLOT` — the same values, so an
 * unmaterialled stair renders exactly as before. They stay because a key
 * composed before this change (a cached descriptor, a pooled material, a
 * fixture) can still arrive in the OLD three-field shape, and answering that
 * with black would be a regression dressed as a cleanup.
 *
 * ⛔ They are NOT the answer for a material that failed to RESOLVE. That is
 * `unresolved:` below, and conflating the two is the §CONTEXT-DATA-HONESTY
 * failure C100 §5 exists to remove.
 */
const TREAD_FALLBACK = '#b58a5e';
const RISER_FALLBACK = '#9a7a52';

/**
 * The marker `resolveMaterialColorSlot` writes when a `materialId` IS present
 * and names nothing in `MATERIAL_CATALOG`. Kept as a literal rather than
 * imported from `geometry-kernel/_internal`: this is L6 reading an L2 wire
 * format, and `_internal` is not its to import. The string is part of the key
 * CONTRACT, which is what both sides legitimately share.
 */
const UNRESOLVED_PREFIX = 'unresolved:';

/** Magenta on purpose (C100 §5) — "your material was lost" must not look like wood. */
const UNRESOLVED_MATERIAL_COLOR = '#ff00ff';

export type StairMaterialSlot = 'tread' | 'riser';

/**
 * ⚠ Reads index 3, and falls back to index 2 for a key written before the colour
 * slot existed. Without that fallback an old cached key would report every tread
 * as a riser — a silent visual regression on reload, which is worse than the
 * defect being fixed.
 */
export function slotOfStairMaterialKey(key: string): StairMaterialSlot {
  const parts = key.split('|');
  if (parts.length >= 4) return parts[3] === 'riser' ? 'riser' : 'tread';
  return parts[2] === 'riser' ? 'riser' : 'tread'; // legacy `stair|<id>|<slot>`
}

/** True when the key names a material that could not be resolved in the master. */
export function isUnresolvedStairMaterialKey(key: string): boolean {
  const parts = key.split('|');
  return parts.length >= 4 && (parts[2] ?? '').startsWith(UNRESOLVED_PREFIX);
}

/** The id that failed to resolve, or `null` when the slot is an ordinary colour. */
export function unresolvedStairMaterialId(key: string): string | null {
  const parts = key.split('|');
  const slot = parts.length >= 4 ? (parts[2] ?? '') : '';
  return slot.startsWith(UNRESOLVED_PREFIX) ? slot.slice(UNRESOLVED_PREFIX.length) : null;
}

export function colorOfStairMaterialKey(key: string): string {
  const parts = key.split('|');
  if (parts.length >= 4) {
    const resolved = parts[2] ?? '';
    if (resolved.startsWith(UNRESOLVED_PREFIX)) return UNRESOLVED_MATERIAL_COLOR;
    if (resolved.length > 0) return resolved;
  }
  return slotOfStairMaterialKey(key) === 'riser' ? RISER_FALLBACK : TREAD_FALLBACK;
}

export function makeStairMaterialFactory(key: string): () => THREE.MeshStandardMaterial {
  const color = colorOfStairMaterialKey(key);
  const slot = slotOfStairMaterialKey(key);
  return () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: slot === 'riser' ? 0.85 : 0.7,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
}
