// TGL P3a — squarified treemap tests.

import { describe, expect, it } from 'vitest';
import { squarify } from '../src/workflows/apartmentLayout/tgl/squarify.js';
import { rectArea, type Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';

const BOUNDS: Rect = { x0: 0, z0: 0, x1: 10, z1: 8 }; // 80 m²
const overlaps = (a: Rect, b: Rect): boolean =>
    a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6;
const aspect = (r: Rect): number => {
    const w = r.x1 - r.x0, h = r.z1 - r.z0;
    return Math.max(w / h, h / w);
};

describe('squarify (TGL P3a)', () => {
    it('places one cell per item', () => {
        const out = squarify(BOUNDS, [{ id: 'a', area: 1 }, { id: 'b', area: 1 }, { id: 'c', area: 1 }]);
        expect(out.map(p => p.id).sort()).toEqual(['a', 'b', 'c']);
    });

    it('cells tile the bounds (sum of areas === bounds area, no overlaps)', () => {
        const out = squarify(BOUNDS, [{ id: 'a', area: 30 }, { id: 'b', area: 20 }, { id: 'c', area: 18 }, { id: 'd', area: 12 }]);
        const sum = out.reduce((s, p) => s + rectArea(p.rect), 0);
        expect(sum).toBeCloseTo(80, 4);
        for (let i = 0; i < out.length; i++)
            for (let j = i + 1; j < out.length; j++)
                expect(overlaps(out[i]!.rect, out[j]!.rect)).toBe(false);
    });

    it('keeps cells within the bounds', () => {
        const out = squarify(BOUNDS, [{ id: 'a', area: 5 }, { id: 'b', area: 5 }, { id: 'c', area: 5 }, { id: 'd', area: 5 }, { id: 'e', area: 5 }]);
        for (const p of out) {
            expect(p.rect.x0).toBeGreaterThanOrEqual(-1e-6);
            expect(p.rect.z0).toBeGreaterThanOrEqual(-1e-6);
            expect(p.rect.x1).toBeLessThanOrEqual(10 + 1e-6);
            expect(p.rect.z1).toBeLessThanOrEqual(8 + 1e-6);
        }
    });

    it('preserves cell area proportions', () => {
        const out = squarify(BOUNDS, [{ id: 'big', area: 60 }, { id: 'small', area: 20 }]);
        const big = out.find(p => p.id === 'big')!;
        const small = out.find(p => p.id === 'small')!;
        expect(rectArea(big.rect) / rectArea(small.rect)).toBeCloseTo(3, 4);
    });

    it('produces reasonable aspect ratios (not thin strips) for an even split', () => {
        // 6 equal rooms in 10×8 — squarified should keep each well under a 4:1 strip.
        const out = squarify(BOUNDS, Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, area: 1 })));
        for (const p of out) expect(aspect(p.rect)).toBeLessThan(3.0);
    });

    it('returns [] for degenerate input', () => {
        expect(squarify(BOUNDS, [])).toEqual([]);
        expect(squarify({ x0: 0, z0: 0, x1: 0, z1: 0 }, [{ id: 'a', area: 1 }])).toEqual([]);
    });
});
