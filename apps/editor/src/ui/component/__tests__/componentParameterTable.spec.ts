/**
 * §PARAM-SOURCE-IS-VISIBLE — the `'parameters'` tab that has been a TYPE with nothing behind it
 * since S55 now has a body, and the body is honest about **where each number came from**.
 *
 * ⛔ **EVERY ARM READS BACK FROM THE DOM** (audit **R14**). The model function is exported and
 * is *not* what these arms assert on: a table that computed the right model and rendered the
 * wrong cell would pass a model-level test and fail the user, which is the whole reason C16
 * CA-21 forbids reading back from the layer that wrote.
 *
 * ⛔ **AND THE RESOLVER IS THE AUTHORITY, NOT THIS TABLE.** Every value asserted below is one
 * `resolveParameter` produced. The table's own `source` derivation is *verified against* that
 * output (`§PARAM-SOURCE-DERIVED-THEN-VERIFIED`), so no arm here can pass by the table
 * agreeing with itself.
 */

import { describe, it, expect } from 'vitest';
import type { FamilyParameter, ResolverInput } from '@pryzm/family-runtime';
import { RUNTIME_LENGTH_UNITS_PER_METRE } from '@pryzm/family-instance';
import { createComponentParameterTable, runtimeUnitLabel } from '../index';

function param(p: Partial<FamilyParameter> & { id: string; name: string }): FamilyParameter {
    return {
        kind: 'type',
        dataType: 'length',
        defaultValue: null,
        expression: null,
        ifcMapping: null,
        exposed: true,
        ...p,
    };
}

function render(input: ResolverInput): HTMLElement {
    const t = createComponentParameterTable();
    t.render(input);
    return t.root;
}

const row = (root: HTMLElement, id: string): HTMLElement =>
    root.querySelector(`[data-cpt-row="${id}"]`) as HTMLElement;
const source = (root: HTMLElement, id: string): string | null =>
    row(root, id).getAttribute('data-cpt-source');
const valueCell = (root: HTMLElement, id: string): HTMLElement =>
    row(root, id).querySelector('[data-cpt-value]') as HTMLElement;

/* ── ARM A — the table exists and renders the resolver's values ───────────── */

describe('§PARAM-SOURCE-IS-VISIBLE · ARM A — the tab has a body', () => {
    it('⭐ renders one row per parameter, with the resolved value in the cell', () => {
        const root = render({
            parameters: [
                param({ id: 'p1', name: 'Width', defaultValue: 1200 }),
                param({ id: 'p2', name: 'Height', defaultValue: 1500 }),
            ],
            type: null,
            instanceOverrides: {},
        });
        expect(root.querySelectorAll('[data-cpt-row]')).toHaveLength(2);
        expect(valueCell(root, 'p1').getAttribute('data-cpt-value')).toBe('1200');
        expect(valueCell(root, 'p2').textContent).toContain('1500');
    });

    it('⛔ NON-VACUITY — an empty parameter list says so instead of rendering an empty table silently', () => {
        const root = render({ parameters: [], type: null, instanceOverrides: {} });
        expect(root.querySelector('[data-cpt-empty]')?.textContent)
            .toContain('declares no parameters');
    });
});

/* ── ARM B — the four sources are four visibly different things ───────────── */

describe('§PARAM-SOURCE-IS-VISIBLE · ARM B — ⭐ THE PRECEDENCE IS ON THE SCREEN (C110 §2.2)', () => {
    const parameters = [
        param({ id: 'p1', name: 'Width', defaultValue: 1200 }),
        param({ id: 'p2', name: 'Height', defaultValue: 1500 }),
        param({ id: 'p3', name: 'Area', dataType: 'number', expression: 'Width * Height' }),
        param({ id: 'p4', name: 'Unset' }),
    ];

    it('⭐ default / expression / type / instance each render their OWN badge', () => {
        const root = render({
            parameters,
            type: { id: 't1', name: 'Medium', values: { p2: 1600 } },
            instanceOverrides: { p1: 1800 },
        });
        expect(source(root, 'p1')).toBe('instance');
        expect(source(root, 'p2')).toBe('type');
        expect(source(root, 'p3')).toBe('expression');
        expect(source(root, 'p4')).toBe('unresolved');
        // The badges are four DISTINCT strings on screen, not four identical pills.
        const labels = ['p1', 'p2', 'p3', 'p4']
            .map((id) => row(root, id).querySelector('[data-cpt-source-badge]')!.textContent);
        expect(new Set(labels).size).toBe(4);
        expect(labels).toEqual(['Instance', 'Type', 'Formula', 'Not resolved']);
    });

    it('⭐⭐ D4 ON SCREEN — a parameter with BOTH a default and a formula shows the FORMULA’s value', () => {
        // ADR-0376 D4 / C110 §2.2. Before the repair this resolved to 999 with `ok: true` and
        // zero diagnostics — a number on screen with no way to tell it was the wrong one.
        const root = render({
            parameters: [
                param({ id: 'p1', name: 'Width', defaultValue: 1200 }),
                param({ id: 'p2', name: 'Glass', dataType: 'number', defaultValue: 999, expression: 'Width - 150' }),
            ],
            type: null,
            instanceOverrides: {},
        });
        expect(valueCell(root, 'p2').getAttribute('data-cpt-value')).toBe('1050');
        expect(source(root, 'p2')).toBe('expression');
        expect(valueCell(root, 'p2').textContent).not.toContain('999');
    });

    it('⭐ an INSTANCE override changes ONE row and leaves the others alone (§66 at the UI layer)', () => {
        const base = render({
            parameters, type: { id: 't1', name: 'Medium', values: { p2: 1600 } }, instanceOverrides: {},
        });
        expect(valueCell(base, 'p1').getAttribute('data-cpt-value')).toBe('1200');
        expect(source(base, 'p1')).toBe('default');

        const overridden = render({
            parameters, type: { id: 't1', name: 'Medium', values: { p2: 1600 } }, instanceOverrides: { p1: 1800 },
        });
        expect(valueCell(overridden, 'p1').getAttribute('data-cpt-value')).toBe('1800');
        expect(source(overridden, 'p1')).toBe('instance');
        // …and the type-driven row is untouched by the instance override.
        expect(valueCell(overridden, 'p2').getAttribute('data-cpt-value')).toBe('1600');
        expect(source(overridden, 'p2')).toBe('type');
    });

    it('⭐ a FORMULA CHANGE recomputes its dependent, and the screen shows the new number', () => {
        const withA = render({
            parameters: [
                param({ id: 'p1', name: 'Width', defaultValue: 1200 }),
                param({ id: 'p2', name: 'Glass', dataType: 'number', expression: 'Width - 150' }),
            ],
            type: null, instanceOverrides: {},
        });
        const withB = render({
            parameters: [
                param({ id: 'p1', name: 'Width', defaultValue: 1200 }),
                param({ id: 'p2', name: 'Glass', dataType: 'number', expression: 'Width - 300' }),
            ],
            type: null, instanceOverrides: {},
        });
        expect(valueCell(withA, 'p2').getAttribute('data-cpt-value')).toBe('1050');
        expect(valueCell(withB, 'p2').getAttribute('data-cpt-value')).toBe('900');
    });
});

/* ── ARM C — the WARN reaches the screen ─────────────────────────────────── */

describe('§PARAM-SOURCE-IS-VISIBLE · ARM C — ⭐ `superseded-default` REACHES THE SCREEN (C110 §2.4)', () => {
    it('a WARN-severity diagnostic is RENDERED, not swallowed', () => {
        // ⛔ This is the arm that matters most. `superseded-default` is a `warn`, so the pass
        // stays `ok: true` — which means a renderer that draws only values would discard it
        // entirely and the author would never learn their default is dead data.
        const root = render({
            parameters: [
                param({ id: 'p1', name: 'Width', defaultValue: 1200 }),
                param({ id: 'p2', name: 'Glass', dataType: 'number', defaultValue: 999, expression: 'Width - 150' }),
            ],
            type: null, instanceOverrides: {},
        });
        const foot = root.querySelector('[data-cpt-status]')!;
        expect(foot.getAttribute('data-cpt-status')).toBe('ok');   // the pass DID succeed…
        const diag = root.querySelector('[data-cpt-diag="superseded-default"]')!;
        expect(diag).not.toBeNull();                                // …and the warning is still on screen
        expect(diag.getAttribute('data-cpt-diag-severity')).toBe('warn');
        expect(diag.textContent).toContain('Glass');                // it NAMES the parameter (C110 §2.4)
        // …and the footer COUNTS the warning rather than reporting a clean pass.
        expect(foot.textContent).toContain('1 warning');
    });

    it('⛔ NON-VACUITY — with the default cleared there is no warning to show', () => {
        const root = render({
            parameters: [
                param({ id: 'p1', name: 'Width', defaultValue: 1200 }),
                param({ id: 'p2', name: 'Glass', dataType: 'number', expression: 'Width - 150' }),
            ],
            type: null, instanceOverrides: {},
        });
        expect(root.querySelector('[data-cpt-diag="superseded-default"]')).toBeNull();
    });

    it('⭐ `supersededDefault` PROVENANCE is shown as provenance, never as a value', () => {
        const root = render({
            parameters: [
                param({ id: 'p1', name: 'Width', defaultValue: 1200 }),
                param({
                    id: 'p2', name: 'Glass', dataType: 'number',
                    expression: 'Width - 150', supersededDefault: 999,
                }),
            ],
            type: null, instanceOverrides: {},
        });
        expect(root.querySelector('[data-cpt-superseded="999"]')?.textContent)
            .toContain('never resolved');
        expect(valueCell(root, 'p2').getAttribute('data-cpt-value')).toBe('1050');
    });
});

/* ── ARM D — the unit label follows the CODE, not the contract's aspiration ─ */

describe('§PARAM-SOURCE-IS-VISIBLE · ARM D — ⛔ the unit label is DERIVED FROM THE SEAM (C110 §3.3)', () => {
    it('a length row is labelled with the unit the number is ACTUALLY in', () => {
        // ⛔ C110 §3.1 rules metres canonical; C110 §3.3 measures that the code is still
        // millimetres and calls the delta OWED. Printing "m" here because the contract says
        // metres would be describing the repository we wish we had.
        // Widened for the same reason `runtimeUnitLabel` widens it — see that function.
        const perMetre: number = RUNTIME_LENGTH_UNITS_PER_METRE;
        const expected = perMetre === 1 ? 'm' : 'mm';
        expect(runtimeUnitLabel('length')).toBe(expected);
        const root = render({
            parameters: [param({ id: 'p1', name: 'Head Height', defaultValue: 2100 })],
            type: null, instanceOverrides: {},
        });
        expect(valueCell(root, 'p1').getAttribute('data-cpt-unit')).toBe(expected);
        // ⛔ §3.3-b's NEGATIVE CONTROL: 2100 mm and 2.1 m differ by three orders of magnitude
        // and are both physically plausible head heights, so this fixture CAN falsify a 1000×
        // error. A fixture of `1` could not.
        expect(valueCell(root, 'p1').textContent).toBe(`2100 ${expected}`);
    });

    it('an ANGLE is radians on both sides of the seam, so it carries no conversion risk', () => {
        expect(runtimeUnitLabel('angle')).toBe('rad');
        expect(runtimeUnitLabel('number')).toBe('');
        expect(runtimeUnitLabel('string')).toBe('');
    });
});

/* ── ARM E — unresolved is VISIBLY unresolved ────────────────────────────── */

describe('§PARAM-SOURCE-IS-VISIBLE · ARM E — ⛔ nothing is substituted for a failed computation', () => {
    it('an expression that fails leaves the cell EMPTY and the pass FAILED — never the default', () => {
        // C110 §2.5 MUST NOT: *"a missing value is visibly missing; a substituted one is not."*
        const root = render({
            parameters: [
                param({ id: 'p1', name: 'Width', defaultValue: 1200 }),
                param({ id: 'p2', name: 'Glass', dataType: 'number', defaultValue: 999, expression: 'Nonexistent * 2' }),
            ],
            type: null, instanceOverrides: {},
        });
        expect(valueCell(root, 'p2').getAttribute('data-cpt-value')).toBe('');
        expect(valueCell(root, 'p2').textContent).toBe('—');
        expect(valueCell(root, 'p2').textContent).not.toContain('999');
        expect(source(root, 'p2')).toBe('unresolved');
        const foot = root.querySelector('[data-cpt-status]')!;
        expect(foot.getAttribute('data-cpt-status')).toBe('error');
        expect(foot.textContent).toContain('nothing has been substituted');
    });

    it('⭐ a UNIT MISMATCH reaches the screen as itself, not as a generic failure', () => {
        // The diagnostic lane 4A made throwable for the first time (C110 §3.5).
        const root = render({
            parameters: [
                param({ id: 'p1', name: 'Width', dataType: 'length', defaultValue: 1200 }),
                param({ id: 'p2', name: 'Tilt', dataType: 'angle', defaultValue: 0.5 }),
                param({ id: 'p3', name: 'Bad', dataType: 'number', expression: 'Width + Tilt' }),
            ],
            type: null, instanceOverrides: {},
        });
        const diag = root.querySelector('[data-cpt-diag="unit-mismatch"]');
        expect(diag).not.toBeNull();
        expect(diag!.getAttribute('data-cpt-diag-severity')).toBe('error');
        expect(source(root, 'p3')).toBe('unresolved');
    });

    it('⛔ a parse error does NOT read as "Formula" — the formula never became the source', () => {
        const root = render({
            parameters: [
                param({ id: 'p1', name: 'Width', dataType: 'number', defaultValue: 1200, expression: '1 +' }),
            ],
            type: null, instanceOverrides: {},
        });
        // The pass is `ok:false`, so no value exists and the row says unresolved rather than
        // labelling a number that was never produced.
        expect(source(root, 'p1')).toBe('unresolved');
        expect(root.querySelector('[data-cpt-diag="expression-parse"]')).not.toBeNull();
    });
});
