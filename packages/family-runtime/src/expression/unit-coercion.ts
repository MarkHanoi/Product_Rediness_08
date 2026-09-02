// Unit coercion + the QUANTITY-KIND ALGEBRA for the family expression DSL.
//
// ⛔ §UNIT-KIND-ERASURE (C110 §3.5) — WHAT THIS FILE USED TO BE, AND WHY.
//   This module's header promised, verbatim: "We DO NOT cross-convert: a `m`
//   literal supplied where an angle parameter is expected raises
//   `UnitMismatchError`."  It did not.  `UnitMismatchError` was declared,
//   exported from the barrel, documented in that sentence — and NEVER THROWN
//   ANYWHERE.  Four textual hits, no `throw` site, no caller.  The mechanism
//   is why: `EvalScope` was `Readonly<Record<string, number>>`, so a value's
//   unit kind was ERASED the moment it entered scope and `walk()` could not
//   compare kinds even in principle.  `toCanonical` ran on LITERALS only, so
//   mixed-unit literals were handled and mixed-unit PARAMETERS were not
//   checked at all, and could not be.
//   C110 §3.5-a names the exit and it is the one implemented here: the scope
//   carries a `CanonicalKind` alongside every value.
//
// ⛔ §CANONICAL-LENGTH-METRES (C110 §3.1 / ADR-0376 D3) — OWED, NOT EXECUTED.
//   D3 rules METRES canonical at every model boundary.  This package still
//   stores MILLIMETRES, and this file does not change that: the migration is
//   larger than one change-set (the sketch coordinate system is a measured
//   blocker) and
//   `audit/universal-component-editor/2026-09-01/phase3/d3-unit-migration.md`
//   forbids half-doing it.  ⭐ What this file DOES do is make the migration a
//   ONE-TOKEN change: flip `CANONICAL_LENGTH_UNIT` below and every length
//   spelling converts to metres together.  Before this rewrite the same
//   migration was "rewrite a switch whose cases are the vocabulary".
//
// The canonical internal units of the family runtime are therefore, TODAY:
//   - length parameters -> millimetres   (⛔ D3 says metres; OWED)
//   - angle  parameters -> radians       (C110 §3.6, settled, not owed)
//   - everything else   -> unit-less
//
// Numeric literals MAY carry a unit suffix (`5 mm`, `20 cm`, `0.5 m`,
// `90 deg`, `1.57 rad`).  Conversion happens AT THE LITERAL, at parse/eval
// time — never at parameter-assignment time — so `5 m + 200 mm` is genuinely
// correct mixed-unit arithmetic rather than coincidentally correct.

import type { FamilyParameterDataType } from '../types.js';

/* ------------------------------------------------------------------ *
 * §UNIT-TABLE — ONE declaration of the unit vocabulary.
 *
 * ⛔ It used to be FIVE.  `Unit`'s union, the tokenizer's `UNIT_KEYWORDS`
 *    Set, `toCanonical`'s switch, `kindOf`'s ternary and the tokenizer's
 *    LexError message each enumerated the same closed set independently,
 *    and the type system checked none of them against the others — spec §76
 *    gate B (no duplicate source of truth) breached inside one package.
 *    Everything below is DERIVED from `UNIT_KIND`; adding a length spelling
 *    without its conversion factor is now a compile error rather than a
 *    silent wrong answer.
 * ------------------------------------------------------------------ */

/** Every unit spelling the DSL accepts, mapped to the quantity kind it
 *  measures.  ⛔ Widened together with `CanonicalKind` and never apart: a
 *  spelling whose kind is not a declarable `CanonicalKind` cannot be added
 *  here without the persisted `dataType` enum moving too (C110 §3.4). */
const UNIT_KIND = {
  mm: 'length',
  cm: 'length',
  m: 'length',
  deg: 'angle',
  rad: 'angle',
} as const;

/** A unit-tagged literal's suffix.  DERIVED from `UNIT_KIND` — this type
 *  cannot drift from the table the tokenizer and `toCanonical` read. */
export type Unit = keyof typeof UNIT_KIND;

type UnitsOfKind<K> = { [U in Unit]: (typeof UNIT_KIND)[U] extends K ? U : never }[Unit];
type LengthUnit = UnitsOfKind<'length'>;
type AngleUnit = UnitsOfKind<'angle'>;

/** Ordered unit names, for the tokenizer's keyword set and for every
 *  user-facing message that lists them.  Derived, so a message still
 *  listing `mm | m | deg | rad` after a fifth spelling was added is
 *  impossible rather than merely unlikely. */
export const UNIT_NAMES: readonly Unit[] = Object.freeze(Object.keys(UNIT_KIND) as Unit[]);

/* ------------------------------------------------------------------ *
 * §CANONICAL-LENGTH-METRES — the D3 knob.
 * ------------------------------------------------------------------ */

/** ⛔ **THE D3 MIGRATION IS THIS ONE TOKEN.**  ADR-0376 D3 rules `'m'`; the
 *  repository stores `'mm'` and the migration is OWED as ONE change-set (see
 *  the header, and `phase3/d3-unit-migration.md` §4 for the sequencing and
 *  the sketch-coordinate blocker that gates it).  ⛔ Flipping this alone is a
 *  HALF-MIGRATION and is the one outcome that plan forbids: it would make
 *  "metres is canonical" true of parameters and false of sketch coordinates,
 *  with no gate saying which is which. */
const CANONICAL_LENGTH_UNIT: CanonicalLengthUnit = 'mm';

/** The two spellings ADR-0376 D3 ruled BETWEEN. Deliberately narrower than
 *  `LengthUnit`: `cm` is an authoring literal and was never a candidate for
 *  the storage unit, and a type that admitted it would invite a third
 *  answer to a question that has one. */
type CanonicalLengthUnit = Extract<LengthUnit, 'mm' | 'm'>;

/** Factors to `CANONICAL_LENGTH_UNIT`, written as EXACT literals in both
 *  columns rather than derived by division: the resolver's assertions are
 *  exact (`toBe(500)`, not `toBeCloseTo`), and two short columns cost less
 *  than one float-drift investigation. */
const LENGTH_TO_CANONICAL: Readonly<Record<CanonicalLengthUnit, Readonly<Record<LengthUnit, number>>>> = {
  mm: { mm: 1, cm: 10, m: 1000 },
  m: { mm: 0.001, cm: 0.01, m: 1 },
};

/** Radians is canonical and is NOT a knob — C110 §3.6 rules it in the same
 *  shape as D3 rules length, so ADR-0376's silence on angle is not later
 *  read as licence.  The D3 migration must not disturb these. */
const ANGLE_TO_CANONICAL: Readonly<Record<AngleUnit, number>> = {
  rad: 1,
  deg: Math.PI / 180,
};

/* ------------------------------------------------------------------ *
 * §QUANTITY-KIND — spec §10's "units are semantic and typed".
 * ------------------------------------------------------------------ */

/**
 * The quantity kind a value measures.
 *
 * Spec §10 names nine (length, area, volume, angle, mass, temperature,
 * pressure, energy, power, …).  This union carries **four of them plus two
 * honest non-answers**, and the split is deliberate:
 *
 *  - `length` / `angle` — DECLARABLE: a parameter's `dataType` can be one of
 *    these, and the persisted `FamilyParameterDataTypeSchema` already
 *    carries both.
 *  - `area` / `volume` — DERIVED ONLY, never declarable.  They are produced
 *    by the algebra below (`length * length`, `area * length`) and no
 *    parameter may declare them, because declaring them would require
 *    widening the persisted enum in `@pryzm/file-format`, which C110 §3.4
 *    binds to the SAME change-set — and that file belongs to another lane.
 *    Deriving them costs that lane nothing and buys the refusal
 *    `area + length`.
 *  - `scalar` — genuinely dimensionless: a unit-less literal, a count, a
 *    boolean, a ratio, the 0/1 of a comparison.  PERMISSIVE with every kind,
 *    because `Width - 120` and `Width / 2` are the ordinary spelling of real
 *    formulas and refusing them would be a false refusal.
 *  - `unknown` — ⭐ NOT the same value as `scalar`, on purpose.  It means
 *    *this engine cannot name this quantity* (`length * angle`,
 *    `sqrt(area)`, `1 / length`).  Collapsing it into `scalar` would assert
 *    "dimensionless" about something that is not — failure and empty
 *    carrying the same value.  It is permissive (an engine that cannot name
 *    a kind has no standing to refuse one) and it propagates, so one
 *    unnameable subexpression never manufactures a confident refusal higher
 *    up the tree.
 *
 * ⛔ The five remaining spec §10 kinds (mass, temperature, pressure, energy,
 *    power) are NOT minted here.  Each needs a `Unit` spelling AND a
 *    persisted `dataType` member, and C110 §3.4 requires both in one
 *    change-set.  Reported OWED rather than half-built.
 */
export type CanonicalKind = 'length' | 'area' | 'volume' | 'angle' | 'scalar' | 'unknown';

/** A value that still knows what it measures.  This interface's absence was
 *  §UNIT-KIND-ERASURE. */
export interface Quantity {
  readonly value: number;
  readonly kind: CanonicalKind;
}

/**
 * A unit mismatch, refused.
 *
 * ⭐ Declared, exported and documented since S55 and NEVER CONSTRUCTED until
 *    the typed scope landed.  It now carries BOTH kinds and the operation
 *    rather than a bare sentence: a refusal that does not name both sides of
 *    what it refused is not actionable, and every message a user sees here
 *    must survive being pasted into a bug report on its own.
 */
export class UnitMismatchError extends Error {
  readonly left: CanonicalKind;
  readonly right: CanonicalKind;
  readonly operation: string;

  constructor(details: {
    readonly left: CanonicalKind;
    readonly right: CanonicalKind;
    readonly operation: string;
    readonly detail?: string;
  }) {
    super(
      `[family-runtime/units] unit mismatch at ${JSON.stringify(details.operation)}: ` +
        `kind '${details.left}' and kind '${details.right}'` +
        (details.detail === undefined ? '' : ` (${details.detail})`),
    );
    this.name = 'UnitMismatchError';
    this.left = details.left;
    this.right = details.right;
    this.operation = details.operation;
  }
}

/** Convert a unit-tagged numeric literal to its canonical internal
 *  representation.  TODAY (D3 owed): `mm → mm`, `cm → mm (×10)`,
 *  `m → mm (×1000)`, `deg → rad`, `rad → rad`.
 *
 *  A literal without a unit is returned as-is — it is `scalar`, and the
 *  consumer (the resolver, when assigning to a parameter) decides what it
 *  means. */
export function toCanonical(value: number, unit: Unit | null): number {
  if (unit === null) return value;
  if (UNIT_KIND[unit] === 'angle') {
    return value * ANGLE_TO_CANONICAL[unit as AngleUnit];
  }
  return value * LENGTH_TO_CANONICAL[CANONICAL_LENGTH_UNIT][unit as LengthUnit];
}

/** The canonical kind of a unit literal.  `null` (no suffix) is `scalar`. */
export function kindOf(unit: Unit | null): CanonicalKind {
  return unit === null ? 'scalar' : UNIT_KIND[unit];
}

/** The canonical kind a declared parameter `dataType` carries into scope.
 *
 *  ⛔ This is the function that ends §UNIT-KIND-ERASURE, and it is the ONLY
 *     mapping from the persisted vocabulary to the algebra's.  `number`,
 *     `count` and `boolean` are genuinely dimensionless.  `string` never
 *     reaches the numeric scope at all (the evaluator is numeric), so it
 *     maps to `unknown` rather than being handed a dimension it does not
 *     have — an unreachable branch that is honest anyway. */
export function kindOfDataType(dataType: FamilyParameterDataType): CanonicalKind {
  switch (dataType) {
    case 'length':
      return 'length';
    case 'angle':
      return 'angle';
    case 'number':
    case 'count':
    case 'boolean':
      return 'scalar';
    case 'string':
      return 'unknown';
  }
}

/* ------------------------------------------------------------------ *
 * §KIND-ALGEBRA — what makes the refusal CORRECT rather than merely loud.
 *
 * The discipline throughout: NEVER OVERSTATE.  Every rule below either
 * knows the answer or returns `unknown`; none invents a refusal it cannot
 * justify.  Under-detection is a named gap (C110 §7 G-1's remaining half);
 * over-detection is a false refusal on a real formula, and a false refusal
 * is the worse of the two.
 * ------------------------------------------------------------------ */

/** True when a kind imposes no constraint on its partner. */
function isPermissive(k: CanonicalKind): boolean {
  return k === 'scalar' || k === 'unknown';
}

/**
 * `+`, `-`, `min`, `max`, the two branches of `if`, and both sides of a
 * comparison: the operands must MEASURE THE SAME THING.
 *
 * ⭐ THIS IS THE ONLY RULE THAT REFUSES A BINARY OPERATION, and it refuses
 *    exactly one shape: two DIFFERENT NAMED kinds.  `length + scalar`
 *    resolves to `length` — `Width - 120`'s `120` is not dimensionless by
 *    decree, it is unit-less and adoptive.  `length + unknown` resolves to
 *    `unknown`.  `length + angle` refuses.
 */
export function unifyKinds(left: CanonicalKind, right: CanonicalKind, operation: string): CanonicalKind {
  if (left === right) return left;
  if (left === 'unknown' || right === 'unknown') return 'unknown';
  if (left === 'scalar') return right;
  if (right === 'scalar') return left;
  throw new UnitMismatchError({
    left,
    right,
    operation,
    detail: 'both operands of this operation must measure the same quantity',
  });
}

/** `*`.  Never refuses: multiplying unlike kinds is how derived quantities
 *  are legitimately built.  Names the three products it can name and says
 *  `unknown` for the rest rather than guessing. */
export function multiplyKinds(left: CanonicalKind, right: CanonicalKind): CanonicalKind {
  if (left === 'unknown' || right === 'unknown') return 'unknown';
  if (left === 'scalar') return right;
  if (right === 'scalar') return left;
  if (left === 'length' && right === 'length') return 'area';
  if ((left === 'length' && right === 'area') || (left === 'area' && right === 'length')) return 'volume';
  return 'unknown';
}

/** `/`.  Never refuses, for the same reason.  A ratio of like kinds IS
 *  genuinely dimensionless — that one really is `scalar`, not `unknown`. */
export function divideKinds(left: CanonicalKind, right: CanonicalKind): CanonicalKind {
  if (left === 'unknown' || right === 'unknown') return 'unknown';
  if (right === 'scalar') return left;
  if (left === right) return 'scalar';
  if (left === 'area' && right === 'length') return 'length';
  if (left === 'volume' && right === 'area') return 'length';
  if (left === 'volume' && right === 'length') return 'area';
  return 'unknown';
}

/** Trigonometry takes an ANGLE.  `sin(Width)` on a length is the second
 *  shape this file can refuse, and it is a real defect rather than a
 *  pedantry: today it is silently `sin(800)`, which is a number, and a
 *  number is exactly what a wrong answer looks like here. */
export function assertAngleArgument(k: CanonicalKind, fnName: string): void {
  if (k === 'angle' || isPermissive(k)) return;
  throw new UnitMismatchError({
    left: 'angle',
    right: k,
    operation: fnName,
    detail: `${fnName}() takes an angle`,
  });
}
