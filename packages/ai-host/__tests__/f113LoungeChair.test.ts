// F1.13 (2026-05-30) — lounge_chair semantic alias contract-complete tests.

import { describe, expect, it } from 'vitest';
import { footprintOf, FURNITURE_KINDS } from '../src/workflows/furnishLayout/footprints.js';

describe('F1.13 — lounge_chair semantic alias', () => {
    it('FurnitureKind union admits lounge_chair', () => {
        expect(FURNITURE_KINDS).toContain('lounge_chair');
    });

    it('lounge_chair footprint is generous (lounge silhouette)', () => {
        const f = footprintOf('lounge_chair');
        expect(f.w).toBeGreaterThan(0.7);
        expect(f.l).toBeGreaterThan(0.7);
        expect(f.h).toBeGreaterThan(0.85);
        expect(f.baseOffset).toBe(0);
    });
});
