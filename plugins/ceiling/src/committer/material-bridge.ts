import * as THREE from '@pryzm/renderer-three/three';

/**
 * ⭐ C100 §9.6.b / S16 — this file no longer DECIDES the ceiling's colour. It
 * READS the one the producer already resolved.
 *
 * ⛔ WHAT IT USED TO DO, and why it was the whole defect. The key has always
 * been `ceiling|<materialId>|<colour>|<slot>`, and this file read slot 2 only:
 *
 *     const overrideColor = parts[2];
 *     if (overrideColor?.length) return overrideColor;
 *     return FALLBACK_BY_SLOT[...];
 *
 * The `materialId` sat in slot 1 — one slot over — travelled all the way here,
 * and was **discarded**. A user who picked "Plasterboard · Acoustic" got this
 * file's grey, every time, because nothing between the store and the pixel ever
 * looked the id up. That is C100 §9.1's finding, in seven lines.
 *
 * `composeCeilingMaterialKey` now fills slot 2 via `resolveMaterialColorSlot`,
 * the ONE authority for C100 §2.1's precedence. Slot 2 therefore arrives
 * already correct, and this file's job shrinks to two things a bridge legitimately
 * owns: PBR parameters, and painting the NAMED unresolved state.
 */

/**
 * ⚠ RETAINED FOR LEGACY KEYS ONLY, and deliberately not deleted.
 *
 * These three values MOVED UPSTREAM into `producers/ceiling.ts` as
 * `CEILING_DEFAULT_BY_SLOT` — the same three hexes, so an unmaterialled ceiling
 * renders identically before and after. They stay here because a key composed
 * before that change (a cached descriptor, a pooled material, a fixture) can
 * still arrive with an EMPTY slot 2, and answering that with black would be a
 * regression dressed as a cleanup.
 *
 * ⛔ They are NOT the fallback for a material that failed to resolve. That case
 * is `unresolved:` below, and conflating the two is precisely the
 * §CONTEXT-DATA-HONESTY failure C100 §5 exists to remove.
 */
const FALLBACK_BY_SLOT: Readonly<Record<string, string>> = {
  top: '#f5f5f5',
  bottom: '#eaeaea',
  edge: '#cfcfcf',
};

/**
 * The marker `resolveMaterialColorSlot` writes when a `materialId` IS present
 * and names nothing in `MATERIAL_CATALOG` — a genuinely broken reference, as
 * opposed to an element that simply never named a material.
 *
 * Kept as a literal rather than imported from `geometry-kernel/_internal`: this
 * is L6 reading an L2 wire format, and `_internal` is not its to import. The
 * string is part of the key CONTRACT, which is what both sides share.
 */
const UNRESOLVED_PREFIX = 'unresolved:';

/**
 * Magenta, on purpose. C100 §5: "your material was lost" must never look like
 * "this ceiling is grey". The failure has to be visible in the viewport, not
 * buried in a console nobody reads.
 */
const UNRESOLVED_MATERIAL_COLOR = '#ff00ff';

export type CeilingMaterialSlot = 'top' | 'bottom' | 'edge';

export function slotOfCeilingMaterialKey(key: string): CeilingMaterialSlot {
  // Key layout: ceiling|<materialId>|<colour>|<slot>
  const parts = key.split('|');
  const s = parts[3] as CeilingMaterialSlot | undefined;
  return s && (s in FALLBACK_BY_SLOT) ? s : 'bottom';
}

/** True when the key names a material that could not be resolved in the master. */
export function isUnresolvedCeilingMaterialKey(key: string): boolean {
  return (key.split('|')[2] ?? '').startsWith(UNRESOLVED_PREFIX);
}

/** The id that failed to resolve, or `null` when the slot is an ordinary colour. */
export function unresolvedCeilingMaterialId(key: string): string | null {
  const slot = key.split('|')[2] ?? '';
  return slot.startsWith(UNRESOLVED_PREFIX) ? slot.slice(UNRESOLVED_PREFIX.length) : null;
}

export function colorOfCeilingMaterialKey(key: string): string {
  const resolved = key.split('|')[2];
  if (resolved && resolved.startsWith(UNRESOLVED_PREFIX)) return UNRESOLVED_MATERIAL_COLOR;
  if (resolved && resolved.length > 0) return resolved;
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
