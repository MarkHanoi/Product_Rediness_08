// Deterministic material key composer.  Two walls that produce the
// same `(systemTypeId, materialId, materialColor, layerName)` MUST
// produce the same `MaterialKey` so `MaterialPool` can dedupe.
//
// ─── C84 §8.1 S2: this is the point that decides the rendered colour ────────
// The committer's `material-bridge.ts` files parse the colour slot out of this
// key and build the `THREE.Material` from it.  So whatever this function puts in
// slot 3 IS what the user sees — for every element family, through one function.
//
// It used to receive `materialId` AND `materialColor` and use only the colour,
// substituting a beige constant when the colour was absent.  The id — a reference
// into the master library — was carried through the key and never resolved by
// anyone.  That is why families that store a `materialId` and no hex rendered
// beige no matter what the user picked, and why "close the coverage gap" is one
// change here rather than eighteen changes in the plugins.
//
// Resolving here rather than in the bridges is also what C11 §5.4 requires:
// "a <type> is always <colour>" is a domain rule, and it resolves upstream of the
// tool/builder, never inside it.

import { asMaterialKey, type MaterialKey } from '../../types/MaterialKey.js';
import { materialHex } from '@pryzm/schemas/materials';

export interface MaterialKeyInput {
  readonly systemTypeId?: string | undefined;
  readonly materialId?: string | undefined;
  readonly materialColor?: string | undefined;
  readonly layerName?: string | undefined;
}

/**
 * The colour a family falls back to when the element names NO material at all.
 *
 * ⚠ Deliberately still a plausible colour, and that is NOT a §5 violation.
 * C84 §5 / C65 §3.4 govern a reference that FAILS TO RESOLVE — "your material was
 * lost" must never look like "this element is beige".  "No material was ever
 * chosen" is a different, legitimate state, and repainting every unmaterialled
 * element in the product a warning colour would be a regression, not honesty.
 * The two cases are kept apart below, which is the whole point.
 */
const NO_MATERIAL_COLOR = '#d4c5b0';

/**
 * Marker written into the colour slot when a `materialId` IS present but names
 * nothing in the master catalogue — i.e. a genuinely broken reference.
 *
 * C84 §5: it carries the failing id so the diagnostic can name it, and the
 * adapters render {@link UNRESOLVED_MATERIAL_COLOR} — visibly wrong on purpose.
 * A silent beige here is exactly what made a drifted id indistinguishable from a
 * deliberate choice (§NO-EMPTY-MEANS-UNKNOWN).
 */
export const UNRESOLVED_PREFIX = 'unresolved:';

/**
 * Rendered for an unresolved reference.  Magenta, because it must NOT be
 * mistakable for a building material — the failure has to be visible in the
 * viewport, not buried in a console nobody reads.
 */
export const UNRESOLVED_MATERIAL_COLOR = '#ff00ff';

/** True when {@link composeMaterialKey} could not resolve the slot's material id. */
export function isUnresolvedColorSlot(slot: string): boolean {
  return slot.startsWith(UNRESOLVED_PREFIX);
}

/** The id that failed to resolve, or null when the slot is an ordinary colour. */
export function unresolvedIdOf(slot: string): string | null {
  return slot.startsWith(UNRESOLVED_PREFIX) ? slot.slice(UNRESOLVED_PREFIX.length) : null;
}

/**
 * Resolve the colour slot, per C84 §2.1's precedence:
 *   1. an explicit user OVERRIDE hex           -> use it
 *   2. else `materialId` resolved in the master -> that material's colour
 *   3. else `materialId` present but unknown    -> `unresolved:<id>` (a NAMED failure)
 *   4. else no material named at all            -> the family default
 */
function resolveColorSlot(input: MaterialKeyInput): string {
  const override = input.materialColor;
  if (override && override.length > 0) return override.toLowerCase();

  const id = input.materialId;
  if (id && id.length > 0 && id !== '_') {
    const hex = materialHex(id);
    if (hex) return hex.toLowerCase();
    return `${UNRESOLVED_PREFIX}${id}`;
  }

  return NO_MATERIAL_COLOR;
}

export function composeMaterialKey(input: MaterialKeyInput): MaterialKey {
  const sys = input.systemTypeId ?? '_';
  const mat = input.materialId ?? '_';
  const col = resolveColorSlot(input);
  const lay = input.layerName ?? '_';
  return asMaterialKey(`wall|${sys}|${mat}|${col}|${lay}`);
}

/**
 * Compose a key for a family whose producer emits its own shape.
 *
 * Handrail's producer emits `handrail|<materialId>|rail` and its bridge threw the
 * id away, so every handrail in the product rendered one brown (C84 §4.3).  The
 * families that need a colour slot get one composed the same way as walls, so
 * there is ONE resolution rule rather than one per family.
 */
export function composeFamilyMaterialKey(
  family: string,
  input: MaterialKeyInput & { readonly slot?: string | undefined },
): MaterialKey {
  const mat = input.materialId ?? '_';
  const col = resolveColorSlot(input);
  const slot = input.slot ?? 'default';
  return asMaterialKey(`${family}|${mat}|${col}|${slot}`);
}
