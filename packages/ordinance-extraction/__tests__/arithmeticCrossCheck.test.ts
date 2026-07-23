import { describe, expect, it } from 'vitest';
import { arithmeticCrossCheck } from '../src/gates/arithmeticCrossCheck.js';

// Real Can Figuerola (L-590g §3.2) table rows: Sup.planta × plantas = Sup.edificada.
describe('arithmeticCrossCheck — Can Figuerola rows (the pilot)', () => {
    it('reconciles row A exactly (444,15 × 4 = 1776,60)', () => {
        const r = arithmeticCrossCheck({ operands: [444.15, 4], op: 'product', expected: 1776.6 });
        expect(r.verdict).toBe('pass');
        expect(r.residual).toBeCloseTo(0, 6);
    });

    it('reconciles row E exactly (304,46 × 10 = 3044,60)', () => {
        expect(
            arithmeticCrossCheck({ operands: [304.46, 10], op: 'product', expected: 3044.6 }).verdict,
        ).toBe('pass');
    });

    it('FLAGS row I — irreconcilable (247,50 × 6 = 1485 ≠ 1361,25)', () => {
        const r = arithmeticCrossCheck({ operands: [247.5, 6], op: 'product', expected: 1361.25 });
        expect(r.verdict).toBe('flag');
        expect(r.computed).toBeCloseTo(1485, 6);
        expect(r.residual).toBeCloseTo(123.75, 6);
    });

    it('FLAGS row H — subtle 2-digit misread (241,63 × 6 = 1449,78, read 1449,81)', () => {
        const r = arithmeticCrossCheck({ operands: [241.63, 6], op: 'product', expected: 1449.81 });
        expect(r.verdict).toBe('flag');
        expect(r.residual).toBeCloseTo(0.03, 6);
    });
});

describe('arithmeticCrossCheck — general behaviour', () => {
    it('supports a sum identity', () => {
        expect(
            arithmeticCrossCheck({ operands: [10, 5, 5], op: 'sum', expected: 20 }).verdict,
        ).toBe('pass');
    });

    it('respects a widened tolerance for coarse figures', () => {
        const tight = arithmeticCrossCheck({ operands: [241.63, 6], op: 'product', expected: 1449.81 });
        const loose = arithmeticCrossCheck({
            operands: [241.63, 6],
            op: 'product',
            expected: 1449.81,
            absoluteTolerance: 0.05,
        });
        expect(tight.verdict).toBe('flag');
        expect(loose.verdict).toBe('pass'); // 0.03 < 0.05
    });

    it('applies relative tolerance when larger than absolute', () => {
        const r = arithmeticCrossCheck({
            operands: [100, 10],
            op: 'product',
            expected: 1005,
            relativeTolerance: 0.01, // 1% of 1005 = 10.05 > residual 5
        });
        expect(r.verdict).toBe('pass');
        expect(r.tolerance).toBeCloseTo(10.05, 6);
    });
});
