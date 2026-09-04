// §CONSTRAINT-FORM — the invariants that keep a six-form constraint from collapsing back into a
// nullable number. Each block pins a way the OLD model produced a plausible wrong answer over real
// land: an averaged conditional, a defaulted ELSE, a dropped formula, a polygon reported as
// "unresolved" because it is not a metre.

import { describe, expect, it } from 'vitest';

import {
    ConstraintValueSchema,
    constraintFormIsNumeric,
    constraintInputs,
    resolveConstraint,
    ruleStatusForResolution,
    type ConstraintValue,
} from '../src/site/zoning/ConstraintForm.js';

/**
 * The founder's Andalusian norm, verbatim in shape (ES-FOUNDER-FIELD-LEVEL-PASS §5):
 * "maximum edificability 1.5 / 2.0 / 2.5 / 3.0 m²t/m²s depending on the number of floors".
 * This is the value a `number | null` field cannot hold without inventing one of the four.
 */
const edificability: ConstraintValue = {
    form: 'conditional',
    cases: [
        { when: [{ fact: 'floors', op: 'lte', operand: 1 }], then: { form: 'scalar', value: 1.5, unit: 'm2/m2' } },
        { when: [{ fact: 'floors', op: 'eq', operand: 2 }], then: { form: 'scalar', value: 2.0, unit: 'm2/m2' } },
        { when: [{ fact: 'floors', op: 'eq', operand: 3 }], then: { form: 'scalar', value: 2.5, unit: 'm2/m2' } },
        { when: [{ fact: 'floors', op: 'gte', operand: 4 }], then: { form: 'scalar', value: 3.0, unit: 'm2/m2' } },
    ],
    otherwise: null,
};

/** "IF zone=CH-2 AND use=residential AND parcel_area<=200m² THEN 80% ELSE 70%" — a real conjunction. */
const occupancy: ConstraintValue = {
    form: 'conditional',
    cases: [
        {
            when: [
                { fact: 'zone', op: 'eq', operand: 'CH-2' },
                { fact: 'use', op: 'eq', operand: 'residential' },
                { fact: 'parcel_area', op: 'lte', operand: 200 },
            ],
            then: { form: 'scalar', value: 80, unit: '%' },
        },
    ],
    otherwise: { form: 'scalar', value: 70, unit: '%' },
};

/** "H ≤ L/2 de la voie" — the French street-width formula, affine in one fact. */
const heightFromStreet: ConstraintValue = {
    form: 'formula',
    expression: 'H <= L/2 (L = largeur de la voie)',
    inputs: ['street_width'],
    unit: 'm',
    affine: { coefficient: 0.5, input: 'street_width', constant: 0 },
};

/** A formula we can CARRY but not reduce — corner + average-grade derived height. */
const unreducible: ConstraintValue = {
    form: 'formula',
    expression: 'altura = media de la rasante de fachada, corregida en esquina',
    inputs: ['facade_grade_profile'],
    unit: 'm',
    affine: null,
};

const bouwvlak: ConstraintValue = {
    form: 'geometric',
    ring: [
        { x: 0, z: 0 },
        { x: 10, z: 0 },
        { x: 10, z: 8 },
        { x: 0, z: 8 },
    ],
    role: 'buildable-footprint',
};

const margeDeRecul: ConstraintValue = {
    form: 'linear',
    line: [
        { x: 0, z: 0 },
        { x: 10, z: 0 },
    ],
    role: 'setback-line',
};

const qualitative: ConstraintValue = {
    form: 'document-derived',
    text: "La construction doit s'intégrer harmonieusement dans son environnement.",
    article: 'UC 4.2',
};

describe('§CONSTRAINT-FORM — all six forms parse and round-trip', () => {
    it.each([
        ['scalar', { form: 'scalar', value: 15, unit: 'm' } as ConstraintValue],
        ['formula', heightFromStreet],
        ['conditional', edificability],
        ['geometric', bouwvlak],
        ['linear', margeDeRecul],
        ['document-derived', qualitative],
    ])('%s', (_name, v) => {
        expect(ConstraintValueSchema.parse(v)).toMatchObject({ form: v.form });
    });

    it('recurses — a conditional whose branch is itself a formula parses', () => {
        const nested: ConstraintValue = {
            form: 'conditional',
            cases: [{ when: [{ fact: 'corner', op: 'eq', operand: true }], then: heightFromStreet }],
            otherwise: { form: 'scalar', value: 9, unit: 'm' },
        };
        expect(ConstraintValueSchema.safeParse(nested).success).toBe(true);
    });

    it('only scalar/formula/conditional ever yield a number', () => {
        expect(constraintFormIsNumeric('scalar')).toBe(true);
        expect(constraintFormIsNumeric('formula')).toBe(true);
        expect(constraintFormIsNumeric('conditional')).toBe(true);
        expect(constraintFormIsNumeric('geometric')).toBe(false);
        expect(constraintFormIsNumeric('linear')).toBe(false);
        expect(constraintFormIsNumeric('document-derived')).toBe(false);
    });

    it('rejects a degenerate ring and a one-point line rather than carrying broken geometry', () => {
        expect(ConstraintValueSchema.safeParse({ ...bouwvlak, ring: [{ x: 0, z: 0 }] }).success).toBe(false);
        expect(ConstraintValueSchema.safeParse({ ...margeDeRecul, line: [{ x: 0, z: 0 }] }).success).toBe(false);
    });
});

describe('§CONSTRAINT-FORM — constraintInputs turns a blocker into a work item', () => {
    it('enumerates every fact a conditional depends on, sorted and de-duplicated', () => {
        expect(constraintInputs(occupancy)).toEqual(['parcel_area', 'use', 'zone']);
        expect(constraintInputs(edificability)).toEqual(['floors']);
    });

    it('includes facts reached only through a nested branch', () => {
        const nested: ConstraintValue = {
            form: 'conditional',
            cases: [{ when: [{ fact: 'corner', op: 'eq', operand: true }], then: heightFromStreet }],
            otherwise: null,
        };
        expect(constraintInputs(nested)).toEqual(['corner', 'street_width']);
    });

    it('a form with no site dependency needs nothing', () => {
        expect(constraintInputs(bouwvlak)).toEqual([]);
        expect(constraintInputs(qualitative)).toEqual([]);
    });
});

describe('§CONSTRAINT-FORM — resolution NEVER invents a value', () => {
    it('the Andalusian conditional resolves to ONE stated value when the fact is known', () => {
        expect(resolveConstraint(edificability, { floors: 3 })).toEqual({
            kind: 'scalar',
            value: 2.5,
            unit: 'm2/m2',
        });
    });

    it('⭐ with the fact MISSING it yields ALL FOUR readings — never an average, never the first', () => {
        const r = resolveConstraint(edificability, {});
        expect(r.kind).toBe('branch-undetermined');
        if (r.kind !== 'branch-undetermined') throw new Error('unreachable');
        expect(r.branches).toHaveLength(4);
        expect(r.missing).toEqual(['floors']);
        // The defect this exists to prevent: 1.5/2.0/2.5/3.0 averaging to 2.25, a number no
        // article supports, printed over someone's land.
        const values = r.branches.map((b) => (b.form === 'scalar' ? b.value : null));
        expect(values).toEqual([1.5, 2.0, 2.5, 3.0]);
    });

    it('a conjunction with ONE false predicate takes the ELSE — a known-false is not an unknown', () => {
        expect(resolveConstraint(occupancy, { zone: 'CH-1' })).toEqual({
            kind: 'scalar',
            value: 70,
            unit: '%',
        });
    });

    it('a conjunction with an UNKNOWN predicate does NOT default to the ELSE branch', () => {
        // The silent-default defect: `zone` matches, `use` is unknown, so the 80% case is still
        // live. Taking 70% here would be a fabricated entitlement reduction.
        const r = resolveConstraint(occupancy, { zone: 'CH-2', parcel_area: 150 });
        expect(r.kind).toBe('branch-undetermined');
        if (r.kind !== 'branch-undetermined') throw new Error('unreachable');
        expect(r.missing).toEqual(['use']);
        expect(r.branches).toHaveLength(2); // the 80% case AND the 70% otherwise
    });

    it('⚠ falling off the end of an enumeration is NOT "no limit" (L-616)', () => {
        const r = resolveConstraint(edificability, { floors: 2.5 }); // matches no case
        expect(r).toEqual({ kind: 'indeterminate', reason: 'no-matching-case', missing: [] });
        // Emphatically not a value, and not an unbounded.
        expect(r.kind).not.toBe('scalar');
    });

    it('an affine formula computes; a missing input names itself', () => {
        expect(resolveConstraint(heightFromStreet, { street_width: 12 })).toEqual({
            kind: 'scalar',
            value: 6,
            unit: 'm',
        });
        expect(resolveConstraint(heightFromStreet, {})).toEqual({
            kind: 'indeterminate',
            reason: 'missing-facts',
            missing: ['street_width'],
        });
    });

    it('a CARRIED-but-unreducible formula is distinguishable from a missing one', () => {
        // Two different remedies, so two different reasons — the whole point of not using `null`.
        expect(resolveConstraint(unreducible, { facade_grade_profile: 'x' })).toEqual({
            kind: 'indeterminate',
            reason: 'formula-not-reducible',
            missing: [],
        });
        expect(resolveConstraint(unreducible, {})).toEqual({
            kind: 'indeterminate',
            reason: 'missing-facts',
            missing: ['facade_grade_profile'],
        });
    });

    it('comparing a string against a numeric threshold is a PACK BUG, not a false predicate', () => {
        // The regression this test caught during authoring: an earlier implementation short-circuited
        // a single live case and returned 80% — promoting an UNKNOWN to a definite match, which is
        // precisely the silent-branch defect the whole file exists to prevent.
        const r = resolveConstraint(occupancy, { zone: 'CH-2', use: 'residential', parcel_area: 'big' });
        expect(r).toEqual({ kind: 'indeterminate', reason: 'predicate-not-evaluable', missing: [] });
    });

    it('ONE live branch with no stated ELSE is our gap, not a printable alternative', () => {
        const cornerOnly: ConstraintValue = {
            form: 'conditional',
            cases: [{ when: [{ fact: 'corner', op: 'eq', operand: true }], then: { form: 'scalar', value: 12, unit: 'm' } }],
            otherwise: null,
        };
        // "12 m, or the instrument says nothing" is not a bounded set of legal readings — and
        // RuleState's `alternative` arm requires ≥2 alternatives for exactly this reason.
        expect(resolveConstraint(cornerOnly, {})).toEqual({
            kind: 'indeterminate',
            reason: 'missing-facts',
            missing: ['corner'],
        });
        expect(resolveConstraint(cornerOnly, { corner: true })).toEqual({
            kind: 'scalar',
            value: 12,
            unit: 'm',
        });
    });

    it('is deterministic and never mutates the facts it is given', () => {
        const facts = Object.freeze({ floors: 3 });
        expect(resolveConstraint(edificability, facts)).toEqual(resolveConstraint(edificability, facts));
        expect(facts).toEqual({ floors: 3 });
    });
});

describe('§CONSTRAINT-FORM — the join to RuleState, stated once', () => {
    it('a resolved scalar is `resolved`', () => {
        expect(ruleStatusForResolution(resolveConstraint(edificability, { floors: 3 }))).toBe('resolved');
    });

    it('⭐ an undetermined conditional is `alternative` — the two halves of the vocabulary meet', () => {
        expect(ruleStatusForResolution(resolveConstraint(edificability, {}))).toBe('alternative');
    });

    it('drawn geometry is `resolved`, NOT unresolved — a bouwvlak is the strongest answer we have', () => {
        expect(ruleStatusForResolution(resolveConstraint(bouwvlak))).toBe('resolved');
        expect(ruleStatusForResolution(resolveConstraint(margeDeRecul))).toBe('resolved');
    });

    it('a document-derived rule is `qualitative` — an answer, not a failure', () => {
        expect(ruleStatusForResolution(resolveConstraint(qualitative))).toBe('qualitative');
    });

    it('every indeterminacy is OURS — `unrecovered`', () => {
        expect(ruleStatusForResolution(resolveConstraint(heightFromStreet, {}))).toBe('unrecovered');
        expect(ruleStatusForResolution(resolveConstraint(edificability, { floors: 2.5 }))).toBe('unrecovered');
    });
});
