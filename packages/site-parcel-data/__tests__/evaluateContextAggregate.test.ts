// LANE S1 / ADR-0379 — evaluation arms for the context-aggregate (fabricDerivedHeight) kind.
//
// Synthetic-context proof (the lane deliverable): extent-weighted MODE aggregation resolves the
// Porto moda-da-cércea reading, and the empty/unavailable context REFUSES honestly. This test
// deliberately does NOT touch the Porto pack or its gate — §PORTO-SIGN-OFF assigns the flip to
// the orchestrator.

import { describe, it, expect } from 'vitest';
import { GeometricRuleSchema, type ContextAggregateRule } from '@pryzm/schemas';
import {
    evaluateContextAggregate,
    type ContextFabricMember,
} from '../src/rulepacks/declarative/evaluateContextAggregate';

const moda = GeometricRuleSchema.parse({
    kind: 'context-aggregate',
    aggregate: 'mode',
    contextSet: 'urban-frontage',
    attribute: 'cornice-height',
    heightDatum: { kind: 'mean-ground-at-facade' }, // Porto Art. 3.º g)
}) as ContextAggregateRule;

/** A synthetic frente urbana: 9 m cércea carries the greatest EXTENT, though 12 m has more members. */
const syntheticFrontage: ContextFabricMember[] = [
    { value_m: 9, extent_m: 40, sourceId: 'f1' },
    { value_m: 12, extent_m: 15, sourceId: 'f2' },
    { value_m: 12, extent_m: 14, sourceId: 'f3' },
    { value_m: 15, extent_m: 10, sourceId: 'f4' },
];

describe('ADR-0379 — evaluateContextAggregate', () => {
    it('⭐ MODE is extent-weighted: 9 m wins on 40 m of frontage (not the member count)', () => {
        const o = evaluateContextAggregate(moda, { status: 'available', members: syntheticFrontage });
        expect(o.ok).toBe(true);
        if (o.ok) {
            expect(o.value_m).toBe(9);
            expect(o.supportExtent_m).toBe(40);
            expect(o.memberCount).toBe(4);
            expect(o.totalExtent_m).toBeCloseTo(79, 9);
            // Granularity is declared, never silently parcel-ised (C58 §1.11).
            expect(o.caveats.join(' ')).toMatch(/frontage-granularity/);
        }
    });

    it('members sharing one value pool their extents before the mode is taken', () => {
        // 12 m appears twice (15 + 14 = 29 m) — still short of 9 m’s 40 m.
        const o = evaluateContextAggregate(moda, {
            status: 'available',
            members: [...syntheticFrontage, { value_m: 12, extent_m: 12, sourceId: 'f5' }],
        });
        if (!o.ok) throw new Error('expected resolution');
        expect(o.value_m).toBe(12); // 41 m now beats 40 m
        expect(o.supportExtent_m).toBe(41);
    });

    it('⭐ an extent TIE between different values REFUSES — never pick on a tie', () => {
        const o = evaluateContextAggregate(moda, {
            status: 'available',
            members: [
                { value_m: 9, extent_m: 30 },
                { value_m: 12, extent_m: 30 },
            ],
        });
        expect(o.ok).toBe(false);
        if (!o.ok) expect(o.code).toBe('aggregate-tie');
    });

    it('⭐ the EMPTY context set refuses — an unbuilt frontage has no moda', () => {
        const o = evaluateContextAggregate(moda, { status: 'available', members: [] });
        expect(o.ok).toBe(false);
        if (!o.ok) {
            expect(o.code).toBe('context-set-empty');
            expect(o.detail).toMatch(/ZERO members/);
        }
    });

    it('⭐ the UNAVAILABLE context set refuses under a DIFFERENT code (failure ≠ empty)', () => {
        const o = evaluateContextAggregate(moda, {
            status: 'unavailable',
            why: 'no frontage extractor wired for pt-1312-porto',
        });
        expect(o.ok).toBe(false);
        if (!o.ok) {
            expect(o.code).toBe('context-set-unavailable');
            expect(o.detail).toMatch(/no frontage extractor/);
        }
    });

    it('a poisoned member refuses the WHOLE evaluation (a silent drop could flip the mode)', () => {
        const o = evaluateContextAggregate(moda, {
            status: 'available',
            members: [...syntheticFrontage, { value_m: Number.NaN, extent_m: 5, sourceId: 'bad' }],
        });
        expect(o.ok).toBe(false);
        if (!o.ok) expect(o.code).toBe('invalid-member');
    });

    it('MEDIAN is extent-weighted (cumulative extent reaches half the total)', () => {
        const median = GeometricRuleSchema.parse({ ...moda, aggregate: 'median' }) as ContextAggregateRule;
        // total 79 m, half 39.5 — 9 m (40 m cumulative) already crosses it.
        const o = evaluateContextAggregate(median, { status: 'available', members: syntheticFrontage });
        if (!o.ok) throw new Error('expected resolution');
        expect(o.value_m).toBe(9);
    });

    it('MAX returns the tallest member (the "unless the existing cércea is higher" class)', () => {
        const max = GeometricRuleSchema.parse({ ...moda, aggregate: 'max' }) as ContextAggregateRule;
        const o = evaluateContextAggregate(max, { status: 'available', members: syntheticFrontage });
        if (!o.ok) throw new Error('expected resolution');
        expect(o.value_m).toBe(15);
    });
});
