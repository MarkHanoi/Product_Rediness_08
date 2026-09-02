// §4D-ONE-LENGTH-SEAM — the ONE place `@pryzm/family-runtime`'s canonical
// length unit is converted into the document's canonical length unit.
//
// ⛔ WHY THIS FILE EXISTS AT ALL.  ADR-0376 **D3** rules METRES canonical at
//    every model boundary and calls two canonical length units in one
//    repository "a 1000× defect class".  Lane 4A executed the D4 half of its
//    row and **deliberately did NOT execute D3** — `family-runtime`'s
//    `CANONICAL_LENGTH_UNIT` is still `'mm'` and its own guard test asserts
//    that OWED state (`phase4/lane-4a-parameter-engine.md` §5).  So today a
//    number that came OUT of the parameter runtime is millimetres and a
//    number that was authored IN the document is metres.
//
// ⭐ That conversion previously lived as a bare `lengthMm / MM_PER_M` inside
//    `bakeFamilyInstance`'s extrude arm — one site, invisible.  This lane adds
//    a SECOND consumer (profile coordinates authored as expressions), and two
//    hand-written ÷1000s is exactly how a 1000× defect survives a migration.
//    Both consumers now call `runtimeLengthToMetres`, so when D3 lands the
//    change is ONE line here and the seam disappears with it.
//
// ⛔ Do NOT add a second conversion helper, and do NOT inline the divide at a
//    new call site.  If a third consumer appears it calls this.
//
// ⚠ DECLARED ABSENCE (C84 EI-6): ANGLES are NOT converted.  `unit-coercion.ts`
//   states radians is canonical and "is NOT a knob" — an angle out of the
//   runtime is already radians and an angle authored in the document is
//   radians, so there is no seam to cross and adding one would invent a defect
//   this file exists to prevent.

/**
 * How many `@pryzm/family-runtime` canonical length units make one metre.
 *
 * TODAY: 1000 (the runtime is millimetres). ⛔ **D3 rules this 1** — when
 * `CANONICAL_LENGTH_UNIT` flips to `'m'` this becomes 1 and every consumer is
 * correct without being touched.
 */
export const RUNTIME_LENGTH_UNITS_PER_METRE = 1000;

/** Convert a length that came out of the parameter runtime into document
 *  metres.  See `§4D-ONE-LENGTH-SEAM` above before adding a caller. */
export function runtimeLengthToMetres(value: number): number {
  return value / RUNTIME_LENGTH_UNITS_PER_METRE;
}
