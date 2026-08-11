// W5-2 — the LAND-BASIS type: what it guarantees, and that the guarantee is structural.
//
// C63 §3.2 (L-656) ratifies BUILDABLE land as the denominator. Before this type nothing in the
// TypeScript source named a land denominator at all, so ratios over different ground could be
// combined by arithmetic that compiled and passed. These tests pin the four properties that
// make the error unrepresentable rather than merely detected.

import { describe, it, expect } from 'vitest';
import {
    LAND_BASIS_BREADTH,
    LandBasisSchema,
    landBasisBreadthRank,
    pairOverSameLand,
    ratioOverLand,
    resolveRatioOverLand,
    sharedLandBasis,
    unreachableLandBasisRefusal,
    type KnownLandBasis,
} from '../src/site/zoning/LandBasis.js';

describe('LandBasis — the vocabulary', () => {
    it('is exactly the five members, and `unknown` is one of them', () => {
        expect(LandBasisSchema.options).toEqual([
            'gross',
            'net-of-cesion',
            'parcel',
            'buildable',
            'unknown',
        ]);
    });

    it('orders the KNOWN bases broadest-first, and gives `unknown` no rank at all', () => {
        expect([...LAND_BASIS_BREADTH]).toEqual(['gross', 'net-of-cesion', 'parcel', 'buildable']);
        // A permutation of the known members — a sixth basis cannot ship unranked.
        const known = LandBasisSchema.options.filter((b) => b !== 'unknown');
        expect([...LAND_BASIS_BREADTH].sort()).toEqual([...known].sort());
        // Monotone: gross is the broadest land, buildable the narrowest.
        expect(landBasisBreadthRank('gross')).toBeLessThan(landBasisBreadthRank('buildable'));
        // `unknown` is not in the list — it has no position, deliberately. Ranking it would
        // invite the arithmetic that turns a refusal back into a number.
        expect(LAND_BASIS_BREADTH).not.toContain('unknown');
    });
});

describe('resolveRatioOverLand — `unknown` is a refusal, never a default', () => {
    it('refuses an UNKNOWN basis with its own code, and does NOT fall back to gross', () => {
        const r = resolveRatioOverLand(0.9, 'unknown', 'maxFAR');
        expect(r.ok).toBe(false);
        if (r.ok) throw new Error('unreachable');
        expect(r.refusal.code).toBe('basis-unknown');
        expect(r.refusal.bases).toEqual(['unknown']);
        // The refusal keeps its reason; it is not reduced to a generic non-answer.
        expect(r.refusal.detail).toMatch(/not `gross`/);
    });

    it('refuses an UNDECLARED basis with a DIFFERENT code — our gap ≠ the source being silent', () => {
        const r = resolveRatioOverLand(0.9, undefined, 'maxFAR');
        expect(r.ok).toBe(false);
        if (r.ok) throw new Error('unreachable');
        expect(r.refusal.code).toBe('basis-not-declared');
        expect(r.refusal.bases).toEqual([null]);
    });

    it('brands a ratio over a KNOWN basis', () => {
        const r = resolveRatioOverLand(0.9, 'parcel', 'maxFAR');
        expect(r.ok).toBe(true);
        if (!r.ok) throw new Error('unreachable');
        expect(r.ratio.value).toBe(0.9);
        expect(r.ratio.basis).toBe('parcel');
    });
});

describe('pairOverSameLand — two ratios, one denominator, or a coded refusal', () => {
    it('refuses a MISMATCH and NAMES BOTH bases', () => {
        const p = pairOverSameLand(
            { value: 0.9, basis: 'gross', label: 'maxFAR' },
            { value: 0.5, basis: 'parcel', label: 'maxCoverage' },
        );
        expect(p.ok).toBe(false);
        if (p.ok) throw new Error('unreachable');
        expect(p.refusal.code).toBe('basis-mismatch');
        expect(p.refusal.bases).toEqual(['gross', 'parcel']);
        expect(p.refusal.detail).toMatch(/gross/);
        expect(p.refusal.detail).toMatch(/parcel/);
    });

    it('pairs two ratios over the same land', () => {
        const p = pairOverSameLand(
            { value: 0.9, basis: 'parcel', label: 'maxFAR' },
            { value: 0.5, basis: 'parcel', label: 'maxCoverage' },
        );
        expect(p.ok).toBe(true);
        if (!p.ok) throw new Error('unreachable');
        expect(p.basis).toBe('parcel');
        expect(sharedLandBasis(p.a, p.b)).toBe('parcel');
    });

    it('⭐ THE CEILING PROPERTY — a pairing NEVER promotes a basis, it only ever weakens', () => {
        // The `capEnvelopeConfidenceToPackDefault` discipline applied to the denominator: a solve
        // may be weakened (to a refusal) but may never be strengthened. In particular a pair of
        // `parcel` ratios must NOT come back as C63's narrower `buildable` denominator — that
        // step requires subtracting a MEASURED non-buildable area, which nothing here does.
        for (const basis of LAND_BASIS_BREADTH) {
            const p = pairOverSameLand(
                { value: 0.9, basis, label: 'a' },
                { value: 0.5, basis, label: 'b' },
            );
            expect(p.ok).toBe(true);
            if (!p.ok) throw new Error('unreachable');
            expect(p.basis).toBe(basis);
            expect(landBasisBreadthRank(p.basis)).toBeLessThanOrEqual(landBasisBreadthRank(basis));
        }
        // And a pairing involving `unknown` cannot produce ANY known basis.
        const withUnknown = pairOverSameLand(
            { value: 0.9, basis: 'unknown', label: 'a' },
            { value: 0.5, basis: 'parcel', label: 'b' },
        );
        expect(withUnknown.ok).toBe(false);
    });
});

describe('the BRAND — the error is unrepresentable, not merely detected', () => {
    it('a ratio can only be built through the constructor (the brand symbol is module-private)', () => {
        const r = ratioOverLand(0.9, 'parcel');
        // The brand is a real symbol value, so construction needs no `as` cast — and a forged
        // object literal cannot name it from outside this module.
        expect(Object.getOwnPropertySymbols(r)).toHaveLength(1);
    });

    it('mixing two bases is a COMPILE error, not a bad verdict', () => {
        const gross = ratioOverLand(0.9, 'gross');
        const parcel = ratioOverLand(0.5, 'parcel');
        // @ts-expect-error `RatioOverLand` is invariant in its basis and `NoInfer` pins B to the
        // first argument — a gross-land ratio cannot occupy a parcel-land slot. If this line ever
        // stops erroring, the guarantee has silently become decoration and this test fails.
        sharedLandBasis(parcel, gross);
        // The same-land call is fine.
        expect(sharedLandBasis(parcel, ratioOverLand(0.2, 'parcel'))).toBe('parcel');
    });

    it('a `unknown`-basis ratio cannot be constructed at all', () => {
        // @ts-expect-error `ratioOverLand` takes a `KnownLandBasis`; `'unknown'` is excluded by
        // construction, so "we do not know which land" can never reach the arithmetic.
        ratioOverLand(0.9, 'unknown');
        expect(true).toBe(true);
    });
});

describe('unreachableLandBasisRefusal — C63 buildable land is NAMED as absent, not substituted', () => {
    it('refuses rather than converting a parcel figure into a buildable-land one', () => {
        const wanted: KnownLandBasis = 'buildable';
        const r = unreachableLandBasisRefusal(wanted, 'parcel', 'maxFAR');
        expect(r.code).toBe('basis-unreachable');
        expect(r.bases).toEqual(['parcel']);
        expect(r.detail).toMatch(/data acquisition, not a rename/);
    });
});
