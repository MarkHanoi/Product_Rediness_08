// material-bridge — handrail MaterialKey → THREE.MeshStandardMaterial.
//
// Keys arrive as `handrail|<materialId>|<colour>|rail`.
//
// ⭐ C100 §9.6.b / S16 — this file no longer DECIDES the handrail's colour.
//
// ⛔ THIS FILE IS THE EXHIBIT `composeMaterialKey`'s header cites, and it was
// worse than "the id was ignored": the function IGNORED ITS OWN ARGUMENT.
//
//     export function colorOfHandrailMaterialKey(_key: string): string {
//       return RAIL_FALLBACK;
//     }
//
// The underscore in `_key` says it out loud. Every handrail in the product was
// the same brown, whatever the architect picked, because the only function whose
// job was to turn a material reference into a colour never read the reference.
// C100 §9.1's finding, in three lines.
//
// The producer had no colour slot to converge (the key was `handrail|<id>|rail`),
// so one is inserted at index 2 in the same commit — the deliberate exception
// §9.6.b's "converge the VALUE, not the FORMAT" presumes away. Nothing else
// parses this key.

import * as THREE from '@pryzm/renderer-three/three';

/**
 * ⚠ RETAINED FOR LEGACY KEYS ONLY. This hex MOVED UPSTREAM into
 * `producers/handrail.ts` as `HANDRAIL_DEFAULT_RAIL_COLOR` — the same value, so
 * an unmaterialled handrail renders exactly as before. It stays because a key
 * composed before this change can still arrive in the old three-field shape.
 *
 * ⛔ It is NOT the answer for a material that failed to RESOLVE — that is
 * `unresolved:` below (C100 §5).
 */
const RAIL_FALLBACK = '#5a4a3a';

/** Part of the key CONTRACT, shared with `geometry-kernel` — not an import of its `_internal`. */
const UNRESOLVED_PREFIX = 'unresolved:';

/** Magenta on purpose (C100 §5): "your material was lost" must not look like timber. */
const UNRESOLVED_MATERIAL_COLOR = '#ff00ff';

/** True when the key names a material that could not be resolved in the master. */
export function isUnresolvedHandrailMaterialKey(key: string): boolean {
  const parts = key.split('|');
  return parts.length >= 4 && (parts[2] ?? '').startsWith(UNRESOLVED_PREFIX);
}

/** The id that failed to resolve, or `null` when the slot is an ordinary colour. */
export function unresolvedHandrailMaterialId(key: string): string | null {
  const parts = key.split('|');
  const slot = parts.length >= 4 ? (parts[2] ?? '') : '';
  return slot.startsWith(UNRESOLVED_PREFIX) ? slot.slice(UNRESOLVED_PREFIX.length) : null;
}

export function colorOfHandrailMaterialKey(key: string): string {
  const parts = key.split('|');
  if (parts.length >= 4) {
    const resolved = parts[2] ?? '';
    if (resolved.startsWith(UNRESOLVED_PREFIX)) return UNRESOLVED_MATERIAL_COLOR;
    if (resolved.length > 0) return resolved;
  }
  return RAIL_FALLBACK; // legacy `handrail|<id>|rail`
}

export function makeHandrailMaterialFactory(key: string): () => THREE.MeshStandardMaterial {
  const color = colorOfHandrailMaterialKey(key);
  return () => new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.6,
    metalness: 0.2,
    side: THREE.DoubleSide,
  });
}
