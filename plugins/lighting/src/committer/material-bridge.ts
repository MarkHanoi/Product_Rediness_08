// material-bridge — lighting MaterialKey → THREE.MeshStandardMaterial.
//
// Material key shape (from producers/lighting.ts):
//   `lighting|<kind>|<materialId>|<color>|<emission>|<range>|<emergency>|<bodyColor>|body`
//
// §FEAT-FIXTURE-PHOTOMETRY (2026-08-06) — slot 4 was `<intensity>` (a derived
// renderer scalar) and is now `<lumens>@<kelvin>[!<intensity>]`, the REAL
// photometry with an optional explicit-override suffix. Slot INDICES are
// unchanged, so `colorOfLightingMaterialKey` (slot 3) is unaffected.

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

/**
 * The marker `resolveMaterialColorSlot` writes when a `materialId` IS present and
 * names nothing in `MATERIAL_CATALOG`. A literal rather than an import from
 * `geometry-kernel/_internal`: this is L6 reading an L2 WIRE FORMAT, and the
 * string is the part of the contract both sides genuinely share. Same choice the
 * door, window and furniture bridges make.
 */
const UNRESOLVED_PREFIX = 'unresolved:';

/** Magenta, on purpose (C100 §5). A lost material must never look like a finish. */
const UNRESOLVED_MATERIAL_COLOR = '#ff00ff';

/**
 * ⭐ C100 §2.1 — the fixture's BODY colour: what the luminaire is MADE OF, which is
 * a different physical quantity from what it EMITS.
 *
 * ⛔ Until 2026-08-19 there was no such slot, and `makeLightingMaterialFactory`
 * painted the body with `colorOfLightingMaterialKey` — slot 3, THE LIGHT'S OWN
 * COLOUR. A black anodised downlight emitting 2700 K rendered as a warm-white
 * object, and the `materialId` sitting in slot 2 (unread since the key was
 * written) could not change it.
 *
 * Returns `null` for a LEGACY key (fewer than 9 parts) and for a fixture that
 * names no material — in both cases the caller must reproduce the old answer
 * exactly (C100 §9.6.b), which is why "absent" and "empty" are one return value
 * here: neither is a material, and neither may invent one.
 */
export function bodyColorOfLightingMaterialKey(key: string): string | null {
  const parts = key.split('|');
  if (parts.length < 9 || parts[0] !== 'lighting') return null;
  const slot = parts[7] ?? '';
  if (slot.length === 0) return null;
  if (slot.startsWith(UNRESOLVED_PREFIX)) return UNRESOLVED_MATERIAL_COLOR;
  return slot;
}

/** The id that failed to resolve, or `null` when the body slot is fine or absent. */
export function unresolvedLightingMaterialId(key: string): string | null {
  const parts = key.split('|');
  if (parts.length < 9 || parts[0] !== 'lighting') return null;
  const slot = parts[7] ?? '';
  return slot.startsWith(UNRESOLVED_PREFIX) ? slot.slice(UNRESOLVED_PREFIX.length) : null;
}

export function makeLightingMaterialFactory(key: string): () => THREE.MeshStandardMaterial {
  // The LIGHT's colour — still slot 3, still the emissive. Unchanged.
  const lightColor = colorOfLightingMaterialKey(key);
  // ⭐ The BODY's colour. Falls back to the light colour ONLY when the fixture
  // names no material, which is byte-identical to the pre-fix behaviour for every
  // fixture in every existing project (C100 §9.6.b).
  const bodyColor = bodyColorOfLightingMaterialKey(key) ?? lightColor;
  return () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(bodyColor),
      // ⚠ The EMISSIVE stays the light's colour even when the body is a named
      // material, and that is the physically correct split rather than an
      // oversight: a black fixture emitting warm white is black AND glows warm.
      emissive: new THREE.Color(lightColor),
      emissiveIntensity: 0.4,
      roughness: 0.4,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
}
