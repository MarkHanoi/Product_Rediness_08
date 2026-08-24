/**
 * @file apps/editor/src/ui/property-panel/__tests__/propertyDisplayRounding.spec.ts
 *
 * §PROP-PANEL-RAW-FLOAT (L-10280) — seventeen decimal places in a BIM panel.
 *
 * FOUNDER's DEFINITION PROPERTIES sheet, 2026-08-23, verbatim:
 *     Riser Height (m)   0.1777777777777778
 *     Tread Depth (m)    0.26961245339649037
 *
 * Both are DERIVED — `levelHeight / riserCount` and `polylineLength / totalSteps` —
 * so they are honest binary fractions that `String(value)` was printing raw.
 *
 * ⛔ THE STORED VALUE MUST NOT BE ROUNDED. `riserHeight × riserCount` has to equal
 * the storey height or the top flight misses its landing. These tests pin that the
 * fix is a STRING formatter and nothing else.
 */
import { describe, it, expect } from 'vitest';
import { formatDisplayNumber } from '../PropertyRenderer';

describe('§PROP-PANEL-RAW-FLOAT — display rounding', () => {
    it('⭐ fixes the two values from the founder’s screenshot', () => {
        expect(formatDisplayNumber(0.1777777777777778)).toBe('0.1778');
        expect(formatDisplayNumber(0.26961245339649037)).toBe('0.2696');
    });

    it('rounds at 0.1 mm — the significance threshold the model itself uses (C73 §2.3)', () => {
        expect(formatDisplayNumber(1.23456789)).toBe('1.2346');
        expect(formatDisplayNumber(2.99999999)).toBe('3');
    });

    it('leaves already-short values EXACTLY as they are — no trailing zeros invented', () => {
        expect(formatDisplayNumber(0.025)).toBe('0.025');
        expect(formatDisplayNumber(1.05)).toBe('1.05');
        expect(formatDisplayNumber(0.9)).toBe('0.9');
        expect(formatDisplayNumber(17)).toBe('17');
        expect(formatDisplayNumber(0)).toBe('0');
        expect(formatDisplayNumber(-0.175)).toBe('-0.175');
    });

    it('⛔ a nonzero quantity never displays as "0" — it falls back to 3 significant figures', () => {
        // §CONTEXT-DATA-HONESTY: "absent" and "very small" must not be one value.
        expect(formatDisplayNumber(0.0000123456)).toBe('0.0000123');
        expect(formatDisplayNumber(1e-9)).not.toBe('0');
    });

    it('passes non-finite values through rather than inventing a number', () => {
        expect(formatDisplayNumber(NaN)).toBe('NaN');
        expect(formatDisplayNumber(Infinity)).toBe('Infinity');
    });

    it('⭐ is LOSSLESS about intent: parsing the display back never moves it past 0.1 mm', () => {
        for (const v of [0.1777777777777778, 0.26961245339649037, 3 / 17, 11 / 17, 1.2345678]) {
            expect(Math.abs(parseFloat(formatDisplayNumber(v)) - v)).toBeLessThanOrEqual(5e-5);
        }
    });
});
