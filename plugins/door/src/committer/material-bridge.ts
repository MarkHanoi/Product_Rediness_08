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

// §MAT-TIMBER-FALLBACK (DAILY-USE 2026-05-22, #105) — mirror of the window
// material-bridge: when the producer embeds no explicit colour (parts[3] empty),
// infer the leaf/frame colour from the system-type / material-id KEYWORDS rather
// than always falling back to wood (which mis-colours metal/aluminium/glass doors).
// Inline keyword colours respect the L7→L6 boundary (no core-app-model import).
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

export function colorOfDoorMaterialKey(key: string): string {
  const parts = key.split('|');
  if (parts.length < 5 || parts[0] !== 'door') return FALLBACK_LEAF_COLOR;
  const col = parts[3];
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
