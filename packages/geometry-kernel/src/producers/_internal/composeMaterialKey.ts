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
 * ⭐ THE ONE RESOLUTION AUTHORITY (C100 §9 / MT-3).
 *
 * Resolve the colour slot, per C100 §2.1's precedence:
 *   1. an explicit user OVERRIDE hex            -> use it
 *   2. else `materialId` resolved in the master -> that material's colour
 *   3. else `materialId` present but unknown    -> `unresolved:<id>` (a NAMED failure)
 *   4. else no material named at all            -> `familyDefault`
 *
 * ─── Why `familyDefault` is a PARAMETER and not the beige constant ──────────
 * Measured 2026-08-19 (C100 §9): thirteen producers mint a material key and
 * **twelve of them resolve nothing** — they write a raw `materialColor`, a
 * per-slot canonical hex, or a bare constant into the colour slot, so the
 * `materialId` sitting one slot over never reaches the screen.  Converging them
 * means every one of those call sites can hand its OWN default here.
 *
 * Forcing them all onto {@link NO_MATERIAL_COLOR} instead would repaint every
 * unmaterialled slab, roof deck and ceiling in the product beige — a visible
 * regression, and one that would rightly get the convergence reverted.  The
 * defect being fixed is *"a chosen material does not render"*, NOT *"families
 * have different defaults"*: a roof trim being white and a slab soffit being
 * grey is a legitimate family difference (C84 EI-10), and C100 §3 explicitly
 * permits an adapter to carry family render constants.
 *
 * So: the DEFAULT stays local, the RESOLUTION becomes shared.  That is the
 * whole of MT-3 in one signature.
 */
export function resolveMaterialColorSlot(
  input: MaterialKeyInput,
  familyDefault: string,
): string {
  const override = input.materialColor;
  if (override && override.length > 0) return override.toLowerCase();

  const id = input.materialId;
  if (id && id.length > 0 && id !== '_') {
    const hex = materialHex(id);
    if (hex) return hex.toLowerCase();
    return `${UNRESOLVED_PREFIX}${id}`;
  }

  return familyDefault;
}

/** The wall/generic form: the family default is {@link NO_MATERIAL_COLOR}. */
function resolveColorSlot(input: MaterialKeyInput): string {
  return resolveMaterialColorSlot(input, NO_MATERIAL_COLOR);
}

export function composeMaterialKey(input: MaterialKeyInput): MaterialKey {
  const sys = input.systemTypeId ?? '_';
  const mat = input.materialId ?? '_';
  const col = resolveColorSlot(input);
  const lay = input.layerName ?? '_';
  return asMaterialKey(`wall|${sys}|${mat}|${col}|${lay}`);
}

/*
 * ─── ⛔ `composeFamilyMaterialKey` WAS HERE. DELETED 2026-08-20 (L-1462). ──────
 *
 * C100 §9.2 recorded it as *"written expressly to extend that resolution to the
 * other families … has ZERO callers. It has never run."* Re-measured on the day it
 * was to be given callers, it STILL had zero — and the reason is not neglect, it is
 * that the shape is wrong.
 *
 * It imposed ONE key layout, `<family>|<materialId>|<color>|<slot>`, on every
 * family. ⛔ **C100 §9.6.b forbids exactly that**: *"MUST NOT: this contract be
 * cited to mandate a single key string layout … A family's slot count, order and
 * extra slots stay its own."* §9.4 measured eighteen distinct layouts and found the
 * bridges and minters AGREE with each other — the layouts were never the defect, so
 * rewriting them would churn every parity snapshot for no user-visible gain.
 *
 * ⭐ Slices S16 and S17 converged ten of the seventeen producers WITHOUT it, each by
 * calling {@link resolveMaterialColorSlot} from inside its OWN minter — converging
 * the VALUE and leaving the FORMAT alone, which is what §9.6.b asks for. So this
 * function was not the unfinished half of that work; it was a rival to it.
 *
 * It is DELETED rather than left in place with a caller invented for it, because
 * §9.6.a's rule is *"MUST NOT let a third appear: the gate's ARM C keys on these two
 * names"* — `resolveMaterialColour` (L2, T2→T1) and `resolveMaterialColorSlot`
 * (kernel, T1-only). A third exported resolver sitting unused is the next rival
 * vocabulary with a head start, and "it has no callers" is exactly what was said
 * about the eight that C100 §1.1 traces.
 *
 * If a family ever genuinely needs a shared layout, it comes back as a caller-driven
 * change with the caller in the same commit — never ahead of one.
 */
