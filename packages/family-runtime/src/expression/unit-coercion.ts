// Unit coercion for the family expression DSL.
//
// Per plan §7.5: "auto-coerce mm ↔ m where a length parameter is
// used".  The canonical internal units of the family runtime are:
//   - length parameters → millimetres
//   - angle  parameters → radians
//   - everything else   → unit-less
//
// Numeric literals MAY carry a unit suffix (`5 mm`, `0.5 m`, `90
// deg`, `1.57 rad`).  This module converts a `(value, literalUnit)`
// pair into the canonical unit for the literal's intrinsic kind.
//
// We DO NOT cross-convert: a `m` literal supplied where an angle
// parameter is expected raises `UnitMismatchError`.  Mixing units
// inside an expression is fine — the literal converter runs at
// tokenise time, not at parameter-assignment time, so `5 m + 200 mm`
// resolves to `5200` mm cleanly.

import type { Unit } from './tokenizer.js';

export class UnitMismatchError extends Error {
  constructor(message: string) {
    super(`[family-runtime/units] ${message}`);
    this.name = 'UnitMismatchError';
  }
}

/** Convert a unit-tagged numeric literal to its canonical internal
 *  representation:
 *    - mm  → mm  (identity)
 *    - m   → mm  (× 1000)
 *    - deg → rad (× π/180)
 *    - rad → rad (identity)
 *
 *  A literal without a unit is returned as-is — the consumer (the
 *  resolver, when assigning to a parameter) decides the canonical
 *  unit. */
export function toCanonical(value: number, unit: Unit | null): number {
  if (unit === null) return value;
  switch (unit) {
    case 'mm':
      return value;
    case 'm':
      return value * 1000;
    case 'rad':
      return value;
    case 'deg':
      return (value * Math.PI) / 180;
  }
}

/** Detect the canonical kind of a unit literal:
 *    - mm | m   → 'length'
 *    - deg | rad → 'angle'
 *    - null     → 'scalar' (caller decides)
 */
export type CanonicalKind = 'length' | 'angle' | 'scalar';

export function kindOf(unit: Unit | null): CanonicalKind {
  if (unit === null) return 'scalar';
  return unit === 'mm' || unit === 'm' ? 'length' : 'angle';
}
