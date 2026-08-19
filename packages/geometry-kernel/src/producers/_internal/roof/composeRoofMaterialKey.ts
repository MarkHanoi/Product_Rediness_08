// Deterministic roof material-key composer.  Two roofs that produce
// the same `(materialId, materialColor, slot)` MUST produce the same
// `MaterialKey` so `MaterialPool` can dedupe.  Mirrors the wall
// `composeMaterialKey` shape (S08-T2) but with a roof slot enum.

import { asMaterialKey, type MaterialKey } from '../../../types/MaterialKey.js';
import { resolveMaterialColorSlot } from '../composeMaterialKey.js';

/** Material slots per PRYZM 1 RoofGeometryBuilder §2.5.  Kept as a
 *  literal-typed string so the producer cannot pass an unknown slot. */
export type RoofSlot = 'shingle' | 'deck' | 'trim' | 'interior';

export interface RoofMaterialKeyInput {
  readonly slot: RoofSlot;
  readonly materialId?: string | undefined;
  readonly materialColor?: string | undefined;
}

const DEFAULT_SHINGLE = '#c8a46e';
const DEFAULT_DECK = '#e5e5e5';
const DEFAULT_TRIM = '#ffffff';
const DEFAULT_INTERIOR = '#f0f0f0';

function defaultColorForSlot(slot: RoofSlot): string {
  switch (slot) {
    case 'shingle': return DEFAULT_SHINGLE;
    case 'deck':    return DEFAULT_DECK;
    case 'trim':    return DEFAULT_TRIM;
    case 'interior':return DEFAULT_INTERIOR;
  }
}

/**
 * ⭐ C100 §9.6.b / S16 — the SHINGLE slot now resolves `materialId` against the
 * master; the other three keep their canonical colours, deliberately.
 *
 * ⛔ WHAT WAS WRONG. The colour line read `input.materialColor ?? default`.
 * `materialId` was placed in the key at index 2 and **never resolved by
 * anybody** — the bridge reads index 3 — so a roof whose material was chosen by
 * NAME rather than by hex rendered the default shingle brown. That is C100
 * §9.1's finding on the roof.
 *
 * ⚠ WHY ONLY THE SHINGLE SLOT, and why that is NOT a half-fix. The comment
 * this replaces already recorded the rule and it is a real domain fact, not an
 * oversight: a roof's `materialId` names its ROOFING, and deck / trim / interior
 * are different surfaces with their own canonical colours — pinning them is what
 * lets many roofs with different shingles share one trim material in the pool.
 * C100 §9.6.b names exactly this ("a family's slot count, order and extra slots
 * stay its own") and §3 permits family render constants. Resolving the roof's
 * material onto its trim would repaint every roof edge in the product.
 *
 * The ladder on the shingle slot is now §2.1's, once, via the ONE authority:
 * explicit `materialColor` OVERRIDE > `materialId` in the master > `unresolved:<id>`
 * as a NAMED failure > the family default. The key LAYOUT is unchanged, so the
 * bridge needs no edit and nothing keyed on the shape moves.
 */
export function composeRoofMaterialKey(input: RoofMaterialKeyInput): MaterialKey {
  const color = input.slot === 'shingle'
    ? resolveMaterialColorSlot(input, defaultColorForSlot('shingle')).toLowerCase()
    : defaultColorForSlot(input.slot).toLowerCase();
  const mat = input.materialId ?? '_';
  return asMaterialKey(`roof|${input.slot}|${mat}|${color}`);
}
