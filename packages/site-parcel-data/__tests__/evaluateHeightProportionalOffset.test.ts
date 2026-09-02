// LANE S1 / ADR-0378 — evaluation arms for the height-proportional-offset kind.
//
// The one catastrophic silent failure this class admits: an UNRESOLVED H quietly degrading to
// the minimum floor. 0,4·H for a 20 m building is 8 m; the floor is 3 m; the difference is 5 m
// of envelope that does not exist. The refusal arm is therefore the load-bearing test here.

import { describe, it, expect } from 'vitest';
import { GeometricRuleSchema, type HeightProportionalOffsetRule } from '@pryzm/schemas';
import { evaluateHeightProportionalOffset } from '../src/rulepacks/declarative/evaluateHeightProportionalOffset';

const de = GeometricRuleSchema.parse({
    kind: 'height-proportional-offset',
    heightFactor: 0.4,
    minOffset_m: 3,
    direction: 'into-parcel',
    appliesTo: 'all-plot-boundaries',
    measuredFrom: 'plot-boundary',
    appliesToStoreys: 'all',
    heightDatum: { kind: 'terrain-lowest' }, // a resolved-datum stand-in for the evaluation arms
}) as HeightProportionalOffsetRule;

describe('ADR-0378 — evaluateHeightProportionalOffset', () => {
    it('computes the closed form at resolved H: 0,4 × 20 m = 8 m (formula governs)', () => {
        const o = evaluateHeightProportionalOffset(de, { ok: true, maxHeightM: 20 });
        expect(o.ok).toBe(true);
        if (o.ok) {
            expect(o.offset_m).toBeCloseTo(8, 9);
            expect(o.governedBy).toBe('height-proportional');
            expect(o.heightUsed_m).toBe(20);
            expect(o.appliesTo).toBe('all-plot-boundaries');
        }
    });

    it('applies the stated floor when the formula falls below it: 0,4 × 5 m → 3 m', () => {
        const o = evaluateHeightProportionalOffset(de, { ok: true, maxHeightM: 5 });
        if (o.ok) {
            expect(o.offset_m).toBe(3);
            expect(o.governedBy).toBe('minimum-floor');
        } else {
            throw new Error('expected resolution');
        }
    });

    it('the Porto H/2 reading: 0,5 × 9 m = 4,5 m, upper storeys only', () => {
        const pt = GeometricRuleSchema.parse({
            ...de,
            heightFactor: 0.5,
            appliesToStoreys: 'above-ground-floor',
        }) as HeightProportionalOffsetRule;
        const o = evaluateHeightProportionalOffset(pt, { ok: true, maxHeightM: 9 });
        if (!o.ok) throw new Error('expected resolution');
        expect(o.offset_m).toBeCloseTo(4.5, 9);
        expect(o.appliesToStoreys).toBe('above-ground-floor');
    });

    it('⭐ REFUSES when H is unresolved — and NEVER degrades to the minimum floor', () => {
        const o = evaluateHeightProportionalOffset(de, {
            ok: false,
            refusal: 'tier6-unknown-height',
            detail: 'the height answer is tier-6 uncertain-missing',
        });
        expect(o.ok).toBe(false);
        if (!o.ok) {
            expect(o.code).toBe('height-unresolved');
            // The refusal must SAY why the floor is not substituted — the overstatement direction.
            expect(o.detail).toMatch(/NEVER substituted|OVERSTATES/);
        }
    });

    it('REFUSES on an unresolved H-datum (seat 1 wired into seat 2)', () => {
        const unknownDatum = GeometricRuleSchema.parse({
            ...de,
            heightDatum: { kind: 'unknown' },
        }) as HeightProportionalOffsetRule;
        const o = evaluateHeightProportionalOffset(unknownDatum, { ok: true, maxHeightM: 20 });
        expect(o.ok).toBe(false);
        if (!o.ok) expect(o.code).toBe('height-datum-unresolved');
    });

    it('REFUSES a degenerate resolved height (0 / NaN) rather than collapsing to the floor', () => {
        for (const maxHeightM of [0, Number.NaN]) {
            const o = evaluateHeightProportionalOffset(de, { ok: true, maxHeightM });
            expect(o.ok).toBe(false);
            if (!o.ok) expect(o.code).toBe('height-invalid');
        }
    });
});
