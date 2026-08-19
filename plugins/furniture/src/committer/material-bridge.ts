// material-bridge — furniture MaterialKey → THREE.MeshStandardMaterial.
//
// Material key shape (from producers/furniture.ts):
//   `furniture|<catalogId>|<materialId>|<color>|lod=<n>|primary`
//
// ─── ⛔ WHAT THIS FILE USED TO DO, and why it was the worst bridge in C100 §9 ──
//
// The header above used to end: *"We deterministically derive a fallback colour
// from the materialId hash (good-enough placeholder until the dynamic material
// editor in S58 starts feeding real PBR parameters in here)."*
//
// It was not a fallback. It was the ONLY path. `colorOfFurnitureMaterialKey` took
// the `materialId` — a correct, stored, master-library id that had travelled the
// whole pipeline intact — and ran it through a **djb2 hash modulo an EIGHT-ENTRY
// PALETTE**, while the master holds **205 materials**. Measured 2026-08-19:
//
//   wood-oak              master #c8a96e  ->  painted #7d8c8c  (grey-teal)
//   wood-walnut           master #5a3a28  ->  painted #7d8c8c  (grey-teal)
//   fabric-wool-felt-grey master #747873  ->  painted #8fa6c4  (blue)
//
// ⭐ **Oak and walnut collided onto one colour.** At 205 ids over 8 buckets that is
// arithmetic, not bad luck: ~197 of the master's rows are indistinguishable. And
// `catalogue/seed.ts` ships all three of those ids on real catalogue rows, so this
// is what the founder's furniture has always looked like.
//
// ⭐ **The reason it survived is that it looked deliberate.** A hash is stable and
// its palette is tasteful, so the wrong colour came back identically every session
// and read as a design decision rather than as a lost material. C100 §5 exists for
// exactly this: a wrong-but-believable colour is worse than a missing one, because
// nothing ever prompts anybody to look.
//
// The colour is now RESOLVED IN THE PRODUCER through the one master authority and
// carried in slot 3. This file reads it; it no longer decides it.

import * as THREE from '@pryzm/renderer-three/three';

const ROUGHNESS = 0.7;
const METALNESS = 0.0;
const FALLBACK_COLOR = '#a78b6e';

const PALETTE = [
  '#a78b6e', '#b9a48b', '#7d8c8c', '#a3bca3',
  '#8fa6c4', '#c69ea3', '#caa56b', '#9b8eb0',
] as const;

/**
 * ⛔ LEGACY SHAPE ONLY — retained, NOT endorsed, and NOT a fallback for a material
 * that failed to resolve (that is `unresolved:` below, C100 §5).
 *
 * It answers keys minted BEFORE the colour slot existed — a cached descriptor, a
 * pooled material, a stored fixture. Those keys carry no colour, and answering
 * them with black or magenta would be a regression dressed as a cleanup. It
 * reproduces the pre-fix answer for exactly those, byte for byte, and its
 * reachable set shrinks to nothing as descriptors are re-minted. Same discipline
 * as the stair and handrail legacy-shape fallbacks (L-1127 S16).
 */
function hashMaterialId(materialId: string): string {
  if (materialId.length === 0) return FALLBACK_COLOR;
  let h = 5381;
  for (let i = 0; i < materialId.length; i++) {
    h = ((h << 5) + h) ^ materialId.charCodeAt(i);
  }
  return PALETTE[Math.abs(h) % PALETTE.length] ?? FALLBACK_COLOR;
}

/**
 * The marker `resolveMaterialColorSlot` writes when a `materialId` IS present and
 * names nothing in `MATERIAL_CATALOG` — a genuinely broken reference, as distinct
 * from a piece of furniture that never named a material.
 *
 * A literal rather than an import from `geometry-kernel/_internal`: this is L6
 * reading an L2 WIRE FORMAT, and `_internal` is not its to import. The string is
 * part of the key CONTRACT, which is what both sides actually share. Same choice
 * the door and window bridges make.
 */
const UNRESOLVED_PREFIX = 'unresolved:';

/** Magenta, on purpose (C100 §5). "Your material was lost" must never look like a design choice. */
const UNRESOLVED_MATERIAL_COLOR = '#ff00ff';

/** True when the key names a material that could not be resolved in the master. */
export function isUnresolvedFurnitureMaterialKey(key: string): boolean {
  return (colourSlot(key) ?? '').startsWith(UNRESOLVED_PREFIX);
}

/** The id that failed to resolve, or `null` when the slot is an ordinary colour. */
export function unresolvedFurnitureMaterialId(key: string): string | null {
  const slot = colourSlot(key) ?? '';
  return slot.startsWith(UNRESOLVED_PREFIX) ? slot.slice(UNRESOLVED_PREFIX.length) : null;
}

/**
 * Slot 3 of the CURRENT key shape, or `null` for a legacy key that has none.
 *
 * ⚠ Discriminated by CONTENT, not by `parts.length`. In the legacy shape slot 3 is
 * the `lod=<n>` token; in the current shape `lod=` has moved to slot 4. Testing for
 * that token is exact, whereas a length test would misread any catalogId that ever
 * contained a `|`.
 */
function colourSlot(key: string): string | null {
  const parts = key.split('|');
  if (parts.length < 4 || parts[0] !== 'furniture') return null;
  const three = parts[3] ?? '';
  return three.startsWith('lod=') ? null : three;
}

export function colorOfFurnitureMaterialKey(key: string): string {
  const parts = key.split('|');
  // parts[0] = "furniture", parts[1] = catalogId, parts[2] = materialId
  if (parts.length < 3) return FALLBACK_COLOR;

  const col = colourSlot(key);
  if (col !== null) {
    // ⭐ C100 §5 — a NAMED failure outranks every fallback. The producer has
    // already applied the ONE ladder; this side only reads the answer.
    if (col.startsWith(UNRESOLVED_PREFIX)) return UNRESOLVED_MATERIAL_COLOR;
    if (col.length > 0) return col;
  }

  // Legacy key (no colour slot) — pre-fix behaviour, unchanged. See hashMaterialId.
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
