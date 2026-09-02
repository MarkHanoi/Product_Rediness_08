/* ------------------------------------------------------------------ *
 * §66-PARTIAL — **A FORMULA CHANGE RECOMPUTES ITS DEPENDENTS.**
 *
 * Spec §66's parametric test names five properties; this file proves the
 * fourth, at the parameter layer, which is the only layer this package
 * owns. The other four (20 instances; one instance changes alone; type
 * change propagates; definition change follows version rules) need a placed
 * ELEMENT and therefore belong to lane 4C — stated here so a green run of
 * this file is never mistaken for §66 passing.
 *
 * ⛔ THE LAYER THE PROPERTY IS READ BACK AT (audit R14 / C16 CA-21 applied
 *    to a package with no bus).
 *    `resolveParameter`'s returned `values` map is the AUTHORITATIVE surface
 *    here, and that is a contract fact, not a convenience: **C110 §2.7 rules
 *    that there is no stored `currentValue`, and there must not be one.**
 *    There is no DTO store to read instead of, and no store to read from —
 *    the resolution IS the value. So the CA-21 discipline resolves to:
 *      · never assert `ok === true` and stop;
 *      · never spy on `evaluateAst` and count calls;
 *      · assert the DEPENDENT'S NUMBER changed, and assert the specific
 *        number, both before and after.
 *    A spy would prove the evaluator was CALLED again. It would not prove
 *    the recomputed value reached the resolved state, which is the property
 *    §66 actually asserts.
 *
 * ⛔ FIXTURE DISCIPLINE (C110 §8.3, and §3.3-b's negative-control rule
 *    generalised past units): every assertion below is a MEASURED QUANTITY
 *    AGAINST A KNOWN NUMBER. *A value was produced* and *the array is
 *    non-empty* are not assertions. And the before/after numbers are chosen
 *    far apart (1080 → 960, 540 → 480) so a fixture that silently failed to
 *    change could not pass by looking plausible.
 * ------------------------------------------------------------------ */

import { describe, expect, it } from 'vitest';

import { resolveParameter } from '../src/resolution/resolveParameter.js';
import type { FamilyParameter, ResolverResult } from '../src/types.js';

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

/**
 * The founder's §64 window, as a parameter document, with a THREE-deep
 * dependency chain so "recomputes its dependents" has a transitive arm:
 *
 *   OpeningWidth (1200) ─┐
 *   FrameWidth   (60)  ──┴─▶ GlassWidth ──▶ PaneWidth ──▶ PaneReveal
 *
 * `editFormula` is the smallest possible model of what the authoring
 * surface does when a user retypes a formula: it produces a NEW parameter
 * list. The resolver is a pure function of that list (C110 §5.1), so the
 * edit is the input change and nothing is mutated in place.
 */
function windowDoc(glassFormula: string): readonly FamilyParameter[] {
  return [
    param({ id: 'p_ow', name: 'OpeningWidth', dataType: 'length', defaultValue: 1200 }),
    param({ id: 'p_fw', name: 'FrameWidth', dataType: 'length', defaultValue: 60 }),
    param({ id: 'p_mw', name: 'MullionWidth', dataType: 'length', defaultValue: 30 }),
    param({ id: 'p_gw', name: 'GlassWidth', dataType: 'length', expression: glassFormula }),
    param({ id: 'p_pw', name: 'PaneWidth', dataType: 'length', expression: 'GlassWidth / 2' }),
    param({ id: 'p_pr', name: 'PaneReveal', dataType: 'length', expression: 'PaneWidth - 10' }),
  ];
}

function resolve(params: readonly FamilyParameter[]): ResolverResult {
  return resolveParameter({ parameters: params, type: null, instanceOverrides: {} });
}

describe('§66 — a formula change recomputes its dependents', () => {
  it('changes the dependent AND the transitive dependent, by number', () => {
    const before = resolve(windowDoc('OpeningWidth - 2 * FrameWidth'));
    expect(before.ok).toBe(true);
    // 1200 − 2×60 = 1080 · 1080/2 = 540 · 540 − 10 = 530.
    expect(before.ok && before.values).toMatchObject({
      GlassWidth: 1080,
      PaneWidth: 540,
      PaneReveal: 530,
    });

    // THE EDIT: the user retypes the glass formula — two frames become four
    // (a double-frame detail). Nothing else in the document changes.
    const after = resolve(windowDoc('OpeningWidth - 4 * FrameWidth'));
    expect(after.ok).toBe(true);

    // 1200 − 4×60 = 960 · 960/2 = 480 · 480 − 10 = 470.
    // ⭐ `GlassWidth` is the parameter that was edited; `PaneWidth` and
    //    `PaneReveal` were NOT edited and must both move. A recomputation
    //    that updated only the edited parameter would pass an assertion on
    //    `GlassWidth` alone — which is why the dependents carry the test.
    expect(after.ok && after.values).toMatchObject({
      GlassWidth: 960,
      PaneWidth: 480,
      PaneReveal: 470,
    });

    // The inputs are untouched: a recompute that also moved its INPUTS would
    // be a cascade defect, not a recomputation.
    expect(after.ok && after.values['OpeningWidth']).toBe(1200);
    expect(after.ok && after.values['FrameWidth']).toBe(60);
  });

  it('a formula change that introduces a NEW dependency re-sorts the resolution order', () => {
    // Recomputation is not enough on its own: the dependency GRAPH must
    // follow the edit too, or the next edit resolves against a stale
    // topology. `MullionWidth` is present in the document but referenced by
    // nothing until this edit.
    const before = resolve(windowDoc('OpeningWidth - 2 * FrameWidth'));
    const after = resolve(windowDoc('OpeningWidth - 2 * MullionWidth'));
    expect(before.ok && after.ok).toBe(true);
    if (!before.ok || !after.ok) return;

    expect(before.values['GlassWidth']).toBe(1080); // 1200 − 2×60
    expect(after.values['GlassWidth']).toBe(1140); // 1200 − 2×30
    expect(after.values['PaneWidth']).toBe(570);
    expect(after.values['PaneReveal']).toBe(560);

    // The new edge is real: `MullionWidth` is now resolved BEFORE the
    // parameter that reads it. (Both documents resolve all six parameters;
    // the ORDER is what the new edge changes.)
    expect(after.order).toHaveLength(6);
    expect(after.order.indexOf('p_mw')).toBeLessThan(after.order.indexOf('p_gw'));
    expect(after.order.indexOf('p_gw')).toBeLessThan(after.order.indexOf('p_pw'));
    expect(after.order.indexOf('p_pw')).toBeLessThan(after.order.indexOf('p_pr'));
  });

  it('⛔ no stale derived value survives a re-resolution — §66’s last clause, at this layer', () => {
    // Spec §66 ends "and no stale derived geometry may overwrite newer
    // state." At the parameter layer the property is that resolution holds
    // NO state to go stale: resolve the edited document, then the original
    // again, and the original's numbers must come back exactly. A resolver
    // with a memo keyed on parameter id — the obvious optimisation, and the
    // obvious way to reintroduce this defect — fails this arm.
    const edited = resolve(windowDoc('OpeningWidth - 4 * FrameWidth'));
    const reverted = resolve(windowDoc('OpeningWidth - 2 * FrameWidth'));
    expect(edited.ok && edited.values['GlassWidth']).toBe(960);
    expect(reverted.ok && reverted.values['GlassWidth']).toBe(1080);
    expect(reverted.ok && reverted.values['PaneReveal']).toBe(530);

    // …and resolving the SAME document twice is byte-identical (C110 §5.1's
    // purity, exercised rather than asserted in prose).
    const twice = resolve(windowDoc('OpeningWidth - 2 * FrameWidth'));
    expect(twice.ok && twice.values).toEqual(reverted.ok ? reverted.values : null);
    expect(twice.ok && twice.order).toEqual(reverted.ok ? reverted.order : null);
  });

  it('an EXPRESSION added to a previously-constant parameter recomputes its dependents', () => {
    // Spec §13's progressive parametrisation, from the dependents' side:
    // `FrameWidth` starts as a plain default and BECOMES derived. This is
    // the shape ADR-0376 D4 repaired — and the arm proves the repair holds
    // when the newly-derived parameter is one that other formulas read.
    const constant = resolve([
      param({ id: 'p_ow', name: 'OpeningWidth', dataType: 'length', defaultValue: 1200 }),
      param({ id: 'p_fw', name: 'FrameWidth', dataType: 'length', defaultValue: 60 }),
      param({ id: 'p_gw', name: 'GlassWidth', dataType: 'length', expression: 'OpeningWidth - 2 * FrameWidth' }),
    ]);
    expect(constant.ok && constant.values['GlassWidth']).toBe(1080);

    const parametrised = resolve([
      param({ id: 'p_ow', name: 'OpeningWidth', dataType: 'length', defaultValue: 1200 }),
      // The authored default is retained AND superseded — exactly the
      // both-present shape D4 rules on. 1200/12 = 100, not 60.
      param({
        id: 'p_fw',
        name: 'FrameWidth',
        dataType: 'length',
        defaultValue: 60,
        expression: 'OpeningWidth / 12',
      }),
      param({ id: 'p_gw', name: 'GlassWidth', dataType: 'length', expression: 'OpeningWidth - 2 * FrameWidth' }),
    ]);
    expect(parametrised.ok).toBe(true);
    expect(parametrised.ok && parametrised.values['FrameWidth']).toBe(100);
    // 1200 − 2×100 = 1000. If the D4 precedence inversion returned, this
    // would read 1080 and the failure would name this arm.
    expect(parametrised.ok && parametrised.values['GlassWidth']).toBe(1000);
    // …and the superseded default is surfaced, not swallowed.
    expect(parametrised.diagnostics.some((d) => d.code === 'superseded-default' && d.parameterId === 'p_fw')).toBe(true);
  });
});
