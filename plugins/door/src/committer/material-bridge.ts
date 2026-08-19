// material-bridge — door MaterialKey → THREE.MeshStandardMaterial.
//
// Spec: §S11 — door material slot keys come out of the producer in the
// pipe-separated form `door|<systemTypeId>|<materialId>|<color>|<slot>`
// (slot ∈ frame|leaf).  This file is the symmetrical analogue of
// `plugins/wall/src/committer/material-bridge.ts`.

import * as THREE from '@pryzm/renderer-three/three';

const PRYZM1_DOOR_ROUGHNESS = 0.6;
const PRYZM1_DOOR_METALNESS = 0.05;
const FALLBACK_FRAME_COLOR = '#8b7058';
const FALLBACK_LEAF_COLOR = '#c2a684';

/**
 * The marker `resolveMaterialColorSlot` writes when a `materialId` IS present and
 * names nothing in `MATERIAL_CATALOG` — a genuinely broken reference, as opposed to
 * a door that never named a material.
 *
 * Kept as a literal rather than imported from `geometry-kernel/_internal`: this is
 * L6 reading an L2 wire format, and `_internal` is not its to import. The string is
 * part of the key CONTRACT, which is what both sides share. (Same reasoning, and the
 * same two constants, as the ceiling bridge.)
 */
const UNRESOLVED_PREFIX = 'unresolved:';

/**
 * Magenta, on purpose. C100 §5: "your material was lost" must never look like
 * "this door is oak" — the failure has to be visible in the viewport, not buried in
 * a console nobody reads.
 */
const UNRESOLVED_MATERIAL_COLOR = '#ff00ff';

// ─── §MAT-TIMBER-FALLBACK (DAILY-USE 2026-05-22, #105) ──────────────────────────
//
// ⚠ MEASURED UNREACHABLE 2026-08-19 (C100 S17), and the measurement matters more
// than the table. C100 §9.4 lists this keyword table among FOUR defective bridges,
// as *"regex keyword→hex inference"* competing with the master. It is not competing
// with anything: `produceDoor` is the ONLY minter of a `door|…` key repo-wide
// (grep: one minter, one reader), and it has ALWAYS filled the colour slot —
// `door.frameColor ?? FRAME_FALLBACK_COLOR` can never be empty. So `inferDoorColor`
// has had **zero reachable call paths** since it was written.
//
// ⭐ Recorded as a DEAD table rather than quietly deleted, and NOT counted as a
// fix — C100 §9.7's own discipline: when a finding evaporates under measurement it
// is removed as a measurement error, never re-labelled as something that was
// repaired. It is retained because a key composed before S17 (a cached descriptor,
// a pooled material, a fixture) can still arrive with an empty slot 3, and answering
// that with black would be a regression dressed as a cleanup.
//
// ⛔ It is NOT the fallback for a material that failed to resolve. That case is
// `unresolved:` above, and conflating the two is exactly the §CONTEXT-DATA-HONESTY
// failure C100 §5 exists to remove.
//
// Order: darker/more-specific first, generic light-timber catch-all last.
const DOOR_KEYWORD_COLORS: ReadonlyArray<readonly [RegExp, string]> = [
  [/walnut|mahogany|ebony|wenge/,                                            '#5a3a28'],
  [/oak|teak|cedar|cherry|iroko|merbau|hardwood/,                            '#a0724a'],
  [/timber|wood|pine|birch|ash|maple|larch|spruce|fir|softwood|plywood|veneer|mdf|laminate/, '#c2a684'],
  [/bronze/,                                                                 '#9d724c'],
  [/brass|gold/,                                                             '#c8a840'],
  [/anthracite|charcoal|graphite|jet|black/,                                 '#3c3c3c'],
  [/aluminium|aluminum|\balu\b|steel|metal|chrome|silver|inox/,             '#c0c4c8'],
  [/glass|glazed|glazing/,                                                   '#a4c8e1'],
  [/upvc|u-pvc|pvc|vinyl|white/,                                             '#f0f0f0'],
  [/grey|gray/,                                                              '#8a8a8a'],
];

function inferDoorColor(parts: string[]): string | null {
  const hay = `${parts[1] ?? ''} ${parts[2] ?? ''}`.toLowerCase();
  if (!hay.trim()) return null;
  for (const [re, col] of DOOR_KEYWORD_COLORS) {
    if (re.test(hay)) return col;
  }
  return null;
}

/** True when the key names a material that could not be resolved in the master. */
export function isUnresolvedDoorMaterialKey(key: string): boolean {
  return (key.split('|')[3] ?? '').startsWith(UNRESOLVED_PREFIX);
}

/** The id that failed to resolve, or `null` when the slot is an ordinary colour. */
export function unresolvedDoorMaterialId(key: string): string | null {
  const slot = key.split('|')[3] ?? '';
  return slot.startsWith(UNRESOLVED_PREFIX) ? slot.slice(UNRESOLVED_PREFIX.length) : null;
}

export function colorOfDoorMaterialKey(key: string): string {
  const parts = key.split('|');
  if (parts.length < 5 || parts[0] !== 'door') return FALLBACK_LEAF_COLOR;
  const col = parts[3];
  // ⭐ C100 §5 — a NAMED failure outranks every fallback below. Slot 3 arrives
  // already resolved by `resolveMaterialColorSlot` (S17); when it carries the
  // `unresolved:` marker the door names a material that no longer exists, and the
  // one thing this file must not do is paint a plausible timber over it.
  if (col && col.startsWith(UNRESOLVED_PREFIX)) return UNRESOLVED_MATERIAL_COLOR;
  if (col && col.length > 0) return col;
  // §MAT-TIMBER-FALLBACK — infer from material/system-type keywords before the
  // wood-tinted default, so non-timber doors (aluminium/steel/glass) read correctly.
  return inferDoorColor(parts) ?? (parts[4] === 'frame' ? FALLBACK_FRAME_COLOR : FALLBACK_LEAF_COLOR);
}

export function makeDoorMaterialFactory(key: string): () => THREE.MeshStandardMaterial {
  const color = colorOfDoorMaterialKey(key);
  return () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: PRYZM1_DOOR_ROUGHNESS,
      metalness: PRYZM1_DOOR_METALNESS,
      side: THREE.DoubleSide,
    });
}
