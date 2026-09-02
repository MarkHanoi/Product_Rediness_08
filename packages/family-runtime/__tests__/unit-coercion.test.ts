import { describe, expect, it } from 'vitest';

import {
  divideKinds,
  kindOf,
  kindOfDataType,
  multiplyKinds,
  toCanonical,
  unifyKinds,
  UnitMismatchError,
  UNIT_NAMES,
} from '../src/expression/unit-coercion.js';
import { tokenize } from '../src/expression/tokenizer.js';

describe('unit-coercion', () => {
  it('returns identity for unit-less literals', () => {
    expect(toCanonical(7, null)).toBe(7);
  });

  it('treats mm as canonical', () => {
    expect(toCanonical(800, 'mm')).toBe(800);
  });

  it('converts m → mm by ×1000', () => {
    expect(toCanonical(0.5, 'm')).toBe(500);
    expect(toCanonical(2, 'm')).toBe(2000);
  });

  it('converts deg → rad', () => {
    expect(toCanonical(180, 'deg')).toBeCloseTo(Math.PI, 10);
    expect(toCanonical(90, 'deg')).toBeCloseTo(Math.PI / 2, 10);
  });

  it('treats rad as canonical', () => {
    expect(toCanonical(Math.PI, 'rad')).toBe(Math.PI);
  });

  it('classifies the canonical kind', () => {
    expect(kindOf(null)).toBe('scalar');
    expect(kindOf('mm')).toBe('length');
    expect(kindOf('m')).toBe('length');
    expect(kindOf('deg')).toBe('angle');
    expect(kindOf('rad')).toBe('angle');
  });
});

/* ------------------------------------------------------------------ *
 * §UNIT-TABLE — the widening, and the proof that it is a WIDENING of one
 * declaration rather than a fifth copy of the vocabulary.
 * ------------------------------------------------------------------ */

describe('§UNIT-TABLE — one declaration, and `cm` proves it', () => {
  it('converts the new `cm` spelling with no bespoke code path', () => {
    // `cm` was added as ONE row in `UNIT_KIND` plus ONE column in the length
    // factor table. If either had been forgotten the package would not
    // compile — the factor table is typed by the unit table's own keys.
    expect(toCanonical(20, 'cm')).toBe(200);
    expect(kindOf('cm')).toBe('length');
  });

  it('the TOKENIZER accepts it too, because its keyword set is derived', () => {
    // ⛔ THIS IS THE ARM THAT WOULD HAVE FAILED BEFORE THE REFACTOR. The
    //    tokenizer used to carry its own hand-written
    //    `new Set(['mm','m','deg','rad'])`, so a spelling added to the type
    //    union alone would have lexed as an adjacent identifier and thrown.
    const t = tokenize('20cm + 5 cm');
    expect(t.filter((x) => x.kind === 'number').map((x) => (x as { unit: unknown }).unit)).toEqual(['cm', 'cm']);
  });

  it('user-facing messages list the units from the same table', () => {
    // The LexError used to spell out `mm | m | deg | rad` as prose — the
    // fifth independent copy, and the one a reader trusts most.
    expect(() => tokenize('5x')).toThrow(/cm/);
    expect(UNIT_NAMES).toEqual(['mm', 'cm', 'm', 'deg', 'rad']);
  });

  it('⛔ D3 IS OWED: length is still stored in MILLIMETRES, and this arm says so', () => {
    // ADR-0376 D3 rules METRES canonical. This package does not implement it
    // yet, deliberately — `phase3/d3-unit-migration.md` establishes the
    // migration is larger than one change-set and forbids half-doing it.
    // ⛔ This assertion exists so the owed state is MEASURED rather than
    //    remembered: when the migration lands, this arm fails and must be
    //    inverted along with the whole change-set. It must never be deleted
    //    on its own — deleting it is how the debt would stop being counted.
    //    Both readings are three orders apart and both are physically
    //    plausible for a window (C110 §3.3-b's negative-control rule).
    expect(toCanonical(2.1, 'm')).toBe(2100);
    expect(toCanonical(2100, 'mm')).toBe(2100);
  });
});

/* ------------------------------------------------------------------ *
 * §KIND-ALGEBRA — the rules, unit-tested where they are declared.
 * ------------------------------------------------------------------ */

describe('§KIND-ALGEBRA', () => {
  it('maps every declared dataType to a kind, exhaustively', () => {
    expect(kindOfDataType('length')).toBe('length');
    expect(kindOfDataType('angle')).toBe('angle');
    expect(kindOfDataType('number')).toBe('scalar');
    expect(kindOfDataType('count')).toBe('scalar');
    expect(kindOfDataType('boolean')).toBe('scalar');
    // `string` never reaches the numeric scope; it is `unknown`, not a kind
    // it does not have.
    expect(kindOfDataType('string')).toBe('unknown');
  });

  it('unify: likes agree, scalar adopts, unknown propagates, unlikes REFUSE', () => {
    expect(unifyKinds('length', 'length', '+')).toBe('length');
    expect(unifyKinds('length', 'scalar', '+')).toBe('length');
    expect(unifyKinds('scalar', 'angle', '+')).toBe('angle');
    expect(unifyKinds('length', 'unknown', '+')).toBe('unknown');
    expect(() => unifyKinds('length', 'angle', '+')).toThrow(UnitMismatchError);
    expect(() => unifyKinds('area', 'length', '-')).toThrow(UnitMismatchError);
  });

  it('multiply: builds the kinds it can name, `unknown` for the rest — and never refuses', () => {
    expect(multiplyKinds('length', 'length')).toBe('area');
    expect(multiplyKinds('length', 'area')).toBe('volume');
    expect(multiplyKinds('area', 'length')).toBe('volume');
    expect(multiplyKinds('scalar', 'length')).toBe('length');
    // ⭐ `unknown`, NOT `scalar`. A length times an angle is not
    //    dimensionless; claiming it is would make "cannot name this" and
    //    "genuinely has no dimension" the same value.
    expect(multiplyKinds('length', 'angle')).toBe('unknown');
    expect(multiplyKinds('volume', 'volume')).toBe('unknown');
  });

  it('divide: a ratio of likes really is dimensionless', () => {
    expect(divideKinds('length', 'length')).toBe('scalar');
    expect(divideKinds('area', 'length')).toBe('length');
    expect(divideKinds('volume', 'area')).toBe('length');
    expect(divideKinds('volume', 'length')).toBe('area');
    expect(divideKinds('length', 'scalar')).toBe('length');
    // 1 / length has no name here, and is not claimed to be scalar.
    expect(divideKinds('scalar', 'length')).toBe('unknown');
  });
});
