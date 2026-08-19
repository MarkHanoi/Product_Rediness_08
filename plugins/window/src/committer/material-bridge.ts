// material-bridge — window MaterialKey → THREE.MeshStandardMaterial.
//
// Spec: §S11 — window material slot keys come out of the producer in
// the pipe-separated form `window|<systemTypeId>|<materialId>|<color>|<slot>`
// (slot ∈ frame|glass).

import * as THREE from '@pryzm/renderer-three/three';

const PRYZM1_FRAME_ROUGHNESS = 0.55;
const PRYZM1_FRAME_METALNESS = 0.05;
const PRYZM1_GLASS_ROUGHNESS = 0.05;
const PRYZM1_GLASS_METALNESS = 0.0;
const PRYZM1_GLASS_OPACITY = 0.35;
const FALLBACK_FRAME_COLOR = '#cccccc';
const FALLBACK_GLASS_COLOR = '#a4c8e1';

/**
 * The marker `resolveMaterialColorSlot` writes when a `materialId` IS present and
 * names nothing in `MATERIAL_CATALOG` — a genuinely broken reference, as opposed to
 * a window that never named a material.
 *
 * Kept as a literal rather than imported from `geometry-kernel/_internal`: this is
 * L6 reading an L2 wire format, and `_internal` is not its to import. The string is
 * part of the key CONTRACT, which is what both sides share.
 */
const UNRESOLVED_PREFIX = 'unresolved:';

/**
 * Magenta, on purpose. C100 §5: "your material was lost" must never look like
 * "this window is timber".
 */
const UNRESOLVED_MATERIAL_COLOR = '#ff00ff';

// ─── §MAT-TIMBER-FALLBACK (DAILY-USE 2026-05-22, #105) ──────────────────────────
//
// ⚠ MEASURED UNREACHABLE 2026-08-19 (C100 S17), and TWO of the three claims in the
// comment this replaces were false. It read: keyword inference fires "when the
// producer embeds no explicit colour (parts[3] empty)", and the table is "kept
// INLINE to respect the L7→L6 layer boundary (the plugin must not import
// core-app-model)".
//
//   · **Slot 3 was never empty.** `produceWindow` is the ONLY minter of a
//     `window|…` key repo-wide (grep: one minter, one reader) and it has always
//     written `win.frameColor ?? FRAME_FALLBACK_COLOR`. So `inferFrameColor` has had
//     **zero reachable call paths** since it was written — including for the very
//     "timber windows render grey" case it was authored to fix.
//   · **There is no such layer boundary.** C100 §4.3 measured it: plugins are L6,
//     `core-app-model` is L2, L6→L2 is downward and legal, and 27 real
//     `from '@pryzm/core-app-model'` imports already exist under `plugins/`. This
//     file is named in C100 §4.3 as one of the two origins of that false
//     justification, which propagated into a SPEC and thence into further files.
//
// ⭐ Recorded as a DEAD table rather than deleted, and NOT counted as a fix — C100
// §9.7's discipline: a finding that evaporates under measurement is removed as a
// measurement error, never re-labelled as something repaired. It is retained because
// a key composed before S17 (a cached descriptor, a pooled material, a fixture) can
// still arrive with an empty slot 3, and answering that with black would be a
// regression dressed as a cleanup.
//
// ⛔ It is NOT the fallback for a material that failed to resolve — that is
// `unresolved:` above (C100 §5).
const FRAME_KEYWORD_COLORS: ReadonlyArray<readonly [RegExp, string]> = [
  [/walnut|mahogany|ebony|wenge/,                                            '#5a3a28'], // dark hardwood
  [/oak|teak|cedar|cherry|iroko|merbau|hardwood/,                            '#a0724a'], // mid hardwood
  [/timber|wood|pine|birch|ash|maple|larch|spruce|fir|softwood|plywood|clt|glulam|bamboo|veneer/, '#c8a96e'], // light timber
  [/bronze/,                                                                 '#9d724c'],
  [/brass|gold/,                                                             '#c8a840'],
  [/anthracite|charcoal|graphite|jet|black/,                                 '#3c3c3c'],
  [/aluminium|aluminum|\balu\b|steel|metal|chrome|silver|inox/,             '#c0c4c8'],
  [/upvc|u-pvc|pvc|vinyl|white/,                                             '#f0f0f0'],
  [/grey|gray/,                                                              '#8a8a8a'],
];

/** Infer a frame colour from the system-type (parts[1]) + material-id (parts[2]) keywords. */
function inferFrameColor(parts: string[]): string | null {
  const hay = `${parts[1] ?? ''} ${parts[2] ?? ''}`.toLowerCase();
  if (!hay.trim()) return null;
  for (const [re, col] of FRAME_KEYWORD_COLORS) {
    if (re.test(hay)) return col;
  }
  return null;
}

/** True when the key names a material that could not be resolved in the master. */
export function isUnresolvedWindowMaterialKey(key: string): boolean {
  return (key.split('|')[3] ?? '').startsWith(UNRESOLVED_PREFIX);
}

/** The id that failed to resolve, or `null` when the slot is an ordinary colour. */
export function unresolvedWindowMaterialId(key: string): string | null {
  const slot = key.split('|')[3] ?? '';
  return slot.startsWith(UNRESOLVED_PREFIX) ? slot.slice(UNRESOLVED_PREFIX.length) : null;
}

export function colorOfWindowMaterialKey(key: string): string {
  const parts = key.split('|');
  if (parts.length < 5 || parts[0] !== 'window') return FALLBACK_GLASS_COLOR;
  const col = parts[3];
  // ⭐ C100 §5 — a NAMED failure outranks every fallback below, INCLUDING the glass
  // slot's blue. Slot 3 arrives already resolved by `resolveMaterialColorSlot`
  // (S17); the `unresolved:` marker means the window names a material that no longer
  // exists, and painting a plausible glazing tint over that is the silent failure
  // this contract exists to prevent.
  if (col && col.startsWith(UNRESOLVED_PREFIX)) return UNRESOLVED_MATERIAL_COLOR;
  if (col && col.length > 0) return col;
  // §MAT-TIMBER-FALLBACK — infer a frame colour from material/system-type keywords
  // before the flat grey fallback (fixes "timber window renders grey"). Glass keeps
  // its blue fallback (the producer always supplies glass tints when relevant).
  if (parts[4] === 'frame') {
    return inferFrameColor(parts) ?? FALLBACK_FRAME_COLOR;
  }
  return FALLBACK_GLASS_COLOR;
}

export function slotOfWindowMaterialKey(key: string): 'frame' | 'glass' {
  const parts = key.split('|');
  return parts[4] === 'frame' ? 'frame' : 'glass';
}

export function makeWindowMaterialFactory(key: string): () => THREE.MeshStandardMaterial {
  const color = colorOfWindowMaterialKey(key);
  const slot = slotOfWindowMaterialKey(key);
  return () => {
    if (slot === 'frame') {
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        roughness: PRYZM1_FRAME_ROUGHNESS,
        metalness: PRYZM1_FRAME_METALNESS,
        side: THREE.DoubleSide,
      });
    }
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: PRYZM1_GLASS_ROUGHNESS,
      metalness: PRYZM1_GLASS_METALNESS,
      transparent: true,
      opacity: PRYZM1_GLASS_OPACITY,
      side: THREE.DoubleSide,
    });
  };
}
