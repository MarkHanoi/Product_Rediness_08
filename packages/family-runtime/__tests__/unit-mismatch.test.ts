/* ------------------------------------------------------------------ *
 * §UNIT-KIND-ERASURE — THE FIRST THROW.
 *
 * ⭐ EVERY ARM IN THIS FILE IS NEW BEHAVIOUR, AND THE HEADLINE IS NOT THAT
 *    THE TESTS PASS — IT IS THAT `UnitMismatchError` HAS NEVER ONCE BEEN
 *    CONSTRUCTED IN THIS REPOSITORY BEFORE THEM.
 *
 * The class was authored in S55, exported from the package barrel, and
 * promised in `unit-coercion.ts`'s own header: *"We DO NOT cross-convert: a
 * `m` literal supplied where an angle parameter is expected raises
 * `UnitMismatchError`."*  Measured 2026-09-01 across the whole tree,
 * `grep -rn "UnitMismatchError"` returned FOUR hits — the barrel re-export,
 * that comment, the class declaration and its own `this.name` assignment.
 * No throw site. No caller. C110 §3.5 records it as
 * `§AUTHORED-BUT-UNWIRED`, and §3.5 MUST NOT forbids reporting spec §11's
 * unit-mismatch requirement as met.
 *
 * The root was never a missing check — it was that the check had nothing to
 * read: `EvalScope` was `Readonly<Record<string, number>>`, so a value's
 * quantity kind was erased at the scope boundary and `walk()` could not
 * compare kinds EVEN IN PRINCIPLE (C110 §4.6).
 *
 * ⛔ FALSIFIER, and it is the one the lane brief names: remove the kind from
 *    the scope — make `resolveParameter`'s `kindedScope` a bare
 *    `Record<string, number>` again, or make `kindOfDataType` return
 *    `'scalar'` for everything — and the four refusing arms below fail BY
 *    NAME while every permissive arm keeps passing. That asymmetry is the
 *    proof: the permissive arms show the refusal is not simply "throws a
 *    lot", and the refusing arms show it is not simply "never throws".
 * ------------------------------------------------------------------ */

import { describe, expect, it } from 'vitest';

import { evaluate, ExpressionEvalError } from '../src/expression/evaluator.js';
import { UnitMismatchError } from '../src/expression/unit-coercion.js';
import { resolveParameter } from '../src/resolution/resolveParameter.js';
import type { FamilyParameter } from '../src/types.js';

function param(over: Partial<FamilyParameter>): FamilyParameter {
  return {
    id: over.id ?? 'p_unset',
    name: over.name ?? 'Unset',
    kind: over.kind ?? 'type',
    dataType: over.dataType ?? 'length',
    defaultValue: over.defaultValue ?? null,
    expression: over.expression ?? null,
    ifcMapping: over.ifcMapping ?? null,
    exposed: over.exposed ?? true,
  };
}

/* ================================================================== *
 * THE LAYER THE PROPERTY IS READ BACK AT (audit R14).
 *
 * `resolveParameter`'s returned `{ ok, values, diagnostics }` IS the
 * authoritative surface of this package, and that is a contract fact rather
 * than a convenience: C110 §2.7 rules that **there is no stored
 * `currentValue`, and there must not be one**. There is no store behind the
 * resolver to read instead, so "read it back from the store, not the
 * function" resolves HERE to "read it back from the resolver's diagnostics,
 * never from a spy on the evaluator and never from `ok === false` alone".
 * Every resolver arm below asserts the typed CODE and the MESSAGE CONTENT,
 * because `ok:false` is satisfied by nine other diagnostics.
 * ================================================================== */

describe('§UNIT-KIND-ERASURE — the resolver refuses a real unit mismatch', () => {
  it('refuses length + angle, with a typed `unit-mismatch` code naming BOTH kinds', () => {
    // A window with a width and a sill tilt. Adding them is meaningless, and
    // until this lane it silently produced 800.5 and `ok: true`.
    const r = resolveParameter({
      parameters: [
        param({ id: 'p_w', name: 'Width', dataType: 'length', defaultValue: 800 }),
        param({ id: 'p_t', name: 'Tilt', dataType: 'angle', defaultValue: 0.5 }),
        param({ id: 'p_bad', name: 'Nonsense', dataType: 'length', expression: 'Width + Tilt' }),
      ],
      type: null,
      instanceOverrides: {},
    });

    expect(r.ok).toBe(false);
    const d = r.diagnostics.find((x) => x.code === 'unit-mismatch');
    expect(d).toBeDefined();
    expect(d!.severity).toBe('error');
    expect(d!.parameterId).toBe('p_bad');
    // ⛔ BOTH kinds and the operator, never a bare "unit mismatch": a
    //    refusal that does not say what it refused and what it refused it
    //    against is not actionable (the RAC hard-stopper doctrine — refuse
    //    with BOTH numbers).
    expect(d!.message).toContain("kind 'length'");
    expect(d!.message).toContain("kind 'angle'");
    expect(d!.message).toContain('"+"');

    // …and it is exactly ONE diagnostic, on exactly the offending parameter.
    // The two well-formed parameters must not be collateral damage.
    expect(r.diagnostics.filter((x) => x.code === 'unit-mismatch')).toHaveLength(1);
  });

  it('refuses a length handed to a trigonometric function', () => {
    // `sin(Width)` is `sin(800)` today — a finite number, which is precisely
    // what a wrong answer looks like when nothing checks the kind.
    const r = resolveParameter({
      parameters: [
        param({ id: 'p_w', name: 'Width', dataType: 'length', defaultValue: 800 }),
        param({ id: 'p_s', name: 'Skew', dataType: 'number', expression: 'sin(Width)' }),
      ],
      type: null,
      instanceOverrides: {},
    });
    expect(r.ok).toBe(false);
    const d = r.diagnostics.find((x) => x.code === 'unit-mismatch');
    expect(d).toBeDefined();
    expect(d!.parameterId).toBe('p_s');
    expect(d!.message).toContain('sin() takes an angle');
  });

  it('refuses min() across two different kinds', () => {
    const r = resolveParameter({
      parameters: [
        param({ id: 'p_w', name: 'Width', dataType: 'length', defaultValue: 800 }),
        param({ id: 'p_t', name: 'Tilt', dataType: 'angle', defaultValue: 0.5 }),
        param({ id: 'p_m', name: 'Smallest', dataType: 'length', expression: 'min(Width, Tilt)' }),
      ],
      type: null,
      instanceOverrides: {},
    });
    expect(r.ok).toBe(false);
    expect(r.diagnostics.find((x) => x.code === 'unit-mismatch')?.parameterId).toBe('p_m');
  });

  it('refuses an AREA added to a LENGTH inside one expression', () => {
    // `Width * Height` is an area, and nothing DECLARES it: no parameter has
    // `dataType: 'area'` and none may, because widening the persisted enum
    // belongs to another lane (C110 §3.4). The kind is DERIVED by the
    // algebra, which is what makes this refusal possible at zero cost to
    // that lane.
    const r = resolveParameter({
      parameters: [
        param({ id: 'p_w', name: 'Width', dataType: 'length', defaultValue: 1200 }),
        param({ id: 'p_h', name: 'Height', dataType: 'length', defaultValue: 1500 }),
        param({ id: 'p_x', name: 'Nonsense', dataType: 'number', expression: 'Width * Height + Width' }),
      ],
      type: null,
      instanceOverrides: {},
    });
    expect(r.ok).toBe(false);
    const d = r.diagnostics.find((x) => x.code === 'unit-mismatch');
    expect(d).toBeDefined();
    expect(d!.parameterId).toBe('p_x');
    expect(d!.message).toContain("kind 'area'");
    expect(d!.message).toContain("kind 'length'");
  });
});

/* ================================================================== *
 * ⛔ §DERIVED-KIND-BOUNDARY — A LIMIT FOUND BY EXECUTION, ASSERTED SO IT
 *    CANNOT BE MISREPORTED AS A CAPABILITY.
 *
 * The arm below was written expecting a refusal and DID NOT GET ONE, and
 * the reason is worth more than the arm: a derived kind survives only
 * inside ONE expression. The instant a value becomes a parameter it
 * re-enters scope under its DECLARED `dataType`, and `dataType` has no
 * `area` member — so an area stored in a `number` parameter comes back as
 * `scalar`, which is permissive with everything.
 *
 * ⭐ The declaration is left authoritative ON PURPOSE. Letting a computed
 *    kind silently override a declared one would give a parameter two
 *    sources of truth for what it measures (spec §76 gate B), and would
 *    HIDE the genuine authoring error of a `length` parameter whose formula
 *    computes an area.
 *
 * This is therefore the exact seam C110 §3.4's "widened in BOTH the runtime
 * type and the persisted schema, in the same change-set" clause protects,
 * met by execution rather than by reading. Closing it requires
 * `FamilyParameterDataTypeSchema` in `@pryzm/file-format` to name `area` —
 * another lane's file. **OWED, and reported as owed.**
 * ================================================================== */

describe('§DERIVED-KIND-BOUNDARY — the honest limit of the widening', () => {
  it('a derived AREA does NOT survive into the next parameter — declared kind wins', () => {
    const r = resolveParameter({
      parameters: [
        param({ id: 'p_w', name: 'Width', dataType: 'length', defaultValue: 1200 }),
        param({ id: 'p_h', name: 'Height', dataType: 'length', defaultValue: 1500 }),
        // Declares `number`; computes an area. The declaration is what the
        // next expression sees.
        param({ id: 'p_a', name: 'Glazed', dataType: 'number', expression: 'Width * Height' }),
        param({ id: 'p_x', name: 'Mixed', dataType: 'number', expression: 'Glazed + Width' }),
      ],
      type: null,
      instanceOverrides: {},
    });
    // ⛔ NOT a refusal, and the assertion says so out loud rather than
    //    leaving the gap to be discovered as a surprise.
    expect(r.ok).toBe(true);
    expect(r.diagnostics.filter((d) => d.code === 'unit-mismatch')).toHaveLength(0);
    expect(r.ok && r.values['Mixed']).toBe(1200 * 1500 + 1200);
  });
});

/* ================================================================== *
 * THE PERMISSIVE HALF — the negative control for the refusal.
 *
 * ⛔ A kind checker that refuses everything is not a kind checker, it is an
 *    outage. These arms are the ones that fail if the algebra is made
 *    stricter than the model can justify, and they are ordinary formulas a
 *    user writes on day one.
 * ================================================================== */

describe('§KIND-ALGEBRA — what it must NOT refuse', () => {
  it('a unit-less literal is adoptive, not dimensionless-by-decree', () => {
    // `Width - 120` is the single most common formula shape in the corpus.
    // Reading `120` as "dimensionless, therefore incompatible with a length"
    // would refuse it, which is why `scalar` is permissive rather than a
    // named rival kind.
    const r = resolveParameter({
      parameters: [
        param({ id: 'p_ow', name: 'OpeningWidth', dataType: 'length', defaultValue: 1200 }),
        param({ id: 'p_g', name: 'GlassWidth', dataType: 'length', expression: 'OpeningWidth - 120' }),
      ],
      type: null,
      instanceOverrides: {},
    });
    expect(r.ok).toBe(true);
    expect(r.ok && r.values['GlassWidth']).toBe(1080);
  });

  it('length / length is genuinely a ratio, and a ratio combines with anything', () => {
    const r = resolveParameter({
      parameters: [
        param({ id: 'p_w', name: 'Width', dataType: 'length', defaultValue: 1200 }),
        param({ id: 'p_h', name: 'Height', dataType: 'length', defaultValue: 1500 }),
        param({ id: 'p_r', name: 'Aspect', dataType: 'number', expression: 'Width / Height' }),
        param({ id: 'p_t', name: 'Tilt', dataType: 'angle', defaultValue: 0.5 }),
        // A ratio added to an angle is legal precisely because the ratio is
        // dimensionless — the algebra must tell that apart from a length.
        param({ id: 'p_s', name: 'Sum', dataType: 'angle', expression: 'Aspect + Tilt' }),
      ],
      type: null,
      instanceOverrides: {},
    });
    expect(r.ok).toBe(true);
    expect(r.diagnostics.filter((d) => d.code === 'unit-mismatch')).toHaveLength(0);
  });

  it('area + area is fine — likes combine', () => {
    const r = resolveParameter({
      parameters: [
        param({ id: 'p_w', name: 'Width', dataType: 'length', defaultValue: 1200 }),
        param({ id: 'p_h', name: 'Height', dataType: 'length', defaultValue: 1500 }),
        param({ id: 'p_a', name: 'PaneA', dataType: 'number', expression: 'Width * Height' }),
        param({ id: 'p_b', name: 'PaneB', dataType: 'number', expression: 'Width * Height' }),
        param({ id: 'p_t', name: 'Total', dataType: 'number', expression: 'PaneA + PaneB' }),
      ],
      type: null,
      instanceOverrides: {},
    });
    expect(r.ok).toBe(true);
    expect(r.ok && r.values['Total']).toBe(2 * 1200 * 1500);
  });

  it('the founder §64 demo formula still resolves, and its kinds agree', () => {
    // ⛔ REGRESSION GUARD ON THE D4 REPAIR. `OpeningWidth - 2 * FrameWidth`
    //    is `length - (scalar × length)`. If `*` were made to refuse unlike
    //    kinds, or if `scalar` were made strict, the demo ADR-0376 D4 exists
    //    to make work would start failing for a NEW reason.
    const r = resolveParameter({
      parameters: [
        param({ id: 'p_ow', name: 'OpeningWidth', dataType: 'length', defaultValue: 1200 }),
        param({ id: 'p_fw', name: 'FrameWidth', dataType: 'length', defaultValue: 60 }),
        param({
          id: 'p_gw',
          name: 'GlassWidth',
          dataType: 'length',
          defaultValue: 999,
          expression: 'OpeningWidth - 2 * FrameWidth',
        }),
      ],
      type: null,
      instanceOverrides: {},
    });
    expect(r.ok).toBe(true);
    expect(r.ok && r.values['GlassWidth']).toBe(1080);
  });
});

/* ================================================================== *
 * THE EVALUATOR LAYER — the same refusal one layer down, plus the
 * explicitly-stated limit of the bare-number scope.
 * ================================================================== */

describe('§UNIT-KIND-ERASURE — the evaluator', () => {
  it('throws `UnitMismatchError` for a kinded scope — the class`s first construction', () => {
    let thrown: unknown;
    try {
      evaluate('W + A', { W: { value: 800, kind: 'length' }, A: { value: 0.5, kind: 'angle' } });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(UnitMismatchError);
    const err = thrown as UnitMismatchError;
    // The structured fields, not just the message: a consumer that wants to
    // render "length vs angle" in a panel must not have to parse prose.
    expect(err.left).toBe('length');
    expect(err.right).toBe('angle');
    expect(err.operation).toBe('+');
    expect(err.name).toBe('UnitMismatchError');
    // It is NOT an ExpressionEvalError — the two are different failure
    // classes and the resolver maps them to different diagnostic codes.
    expect(err).not.toBeInstanceOf(ExpressionEvalError);
  });

  it('⛔ CANNOT refuse a bare-number scope, and does not pretend to', () => {
    // This is the honest limit of the fix, asserted rather than left to be
    // discovered: a caller that supplies plain numbers has already thrown
    // the kind away, so every value is `scalar` and every combination is
    // permissive. The production caller (`resolveParameter`) supplies kinds;
    // this arm exists so nobody reads the arm above as "the DSL always
    // detects unit mismatches".
    expect(evaluate('W + A', { W: 800, A: 0.5 })).toBe(800.5);
  });

  it('a mixed-unit LITERAL expression was always correct, and still is', () => {
    // `toCanonical` ran on literals from the start; that half of §11 was
    // never broken and this lane must not disturb it.
    expect(evaluate('5 m + 200 mm')).toBe(5200);
    expect(evaluate('5 m + 20 cm')).toBe(5200);
  });

  it('refuses a length literal added to an angle literal', () => {
    expect(() => evaluate('800 mm + 90 deg')).toThrow(UnitMismatchError);
  });
});
