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

// §MAT-TIMBER-FALLBACK (DAILY-USE 2026-05-22, #105) — When the producer embeds no
// explicit colour in the material key (parts[3] empty), infer a sensible frame
// colour from the system-type / material-id KEYWORDS instead of always defaulting
// to grey (#cccccc). This is the root cause of "timber windows render grey": the
// timber system type carried no colour, so every frame fell back to grey. The
// keyword colours mirror the wood/metal stops in core-app-model's
// STANDARD_MATERIAL_LIBRARY, kept INLINE to respect the L7→L6 layer boundary (the
// plugin must not import core-app-model). Order matters: more specific (darker)
// hardwoods are matched before the generic light-timber catch-all.
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

export function colorOfWindowMaterialKey(key: string): string {
  const parts = key.split('|');
  if (parts.length < 5 || parts[0] !== 'window') return FALLBACK_GLASS_COLOR;
  const col = parts[3];
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
