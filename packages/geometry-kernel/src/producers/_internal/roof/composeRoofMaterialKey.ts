// Deterministic roof material-key composer.  Two roofs that produce
// the same `(materialId, materialColor, slot)` MUST produce the same
// `MaterialKey` so `MaterialPool` can dedupe.  Mirrors the wall
// `composeMaterialKey` shape (S08-T2) but with a roof slot enum.

import { asMaterialKey, type MaterialKey } from '../../../types/MaterialKey.js';

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

export function composeRoofMaterialKey(input: RoofMaterialKeyInput): MaterialKey {
  // The schema's `materialColor` only applies to the shingle slot —
  // trim/deck/interior keep their canonical colors so multiple roofs
  // with different shingle colors still share the trim/deck/interior
  // material in the pool.
  const color = input.slot === 'shingle'
    ? (input.materialColor ?? defaultColorForSlot('shingle')).toLowerCase()
    : defaultColorForSlot(input.slot).toLowerCase();
  const mat = input.materialId ?? '_';
  return asMaterialKey(`roof|${input.slot}|${mat}|${color}`);
}
