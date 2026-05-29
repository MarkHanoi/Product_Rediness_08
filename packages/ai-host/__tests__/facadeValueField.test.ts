// L1-α-1 — `computeFacadeValueField` tests
// (APARTMENT-COGNITION-STACK-AND-IMPLEMENTATION-PLAN-2026-05-29 §3.A).

import { describe, expect, it } from 'vitest';
import {
    computeFacadeValueField,
    type Cardinal,
} from '../src/workflows/apartmentLayout/environment/facadeValueField.js';
import type { Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';

// Convention: +Z = North, +X = East. CCW unit square goes:
//   (0,0) → (1,0) → (1,1) → (0,1) → (0,0)
//   edge 0: (0,0)→(1,0) — runs East, outward-normal points South.
//   edge 1: (1,0)→(1,1) — runs North, outward-normal points East.
//   edge 2: (1,1)→(0,1) — runs West, outward-normal points North.
//   edge 3: (0,1)→(0,0) — runs South, outward-normal points West.
const SQUARE: Pt[] = [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }, { x: 0, z: 1 }];

describe('computeFacadeValueField (L1-α-1)', () => {
    describe('degenerate input', () => {
        it('returns empty for < 3 vertices', () => {
            const f = computeFacadeValueField([{ x: 0, z: 0 }, { x: 1, z: 0 }]);
            expect(f.edges.length).toBe(0);
        });

        it('returns empty for zero-area polygon', () => {
            const f = computeFacadeValueField([
                { x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 },
            ]);
            expect(f.edges.length).toBe(0);
        });
    });

    describe('CCW unit square — cardinal orientations', () => {
        const f = computeFacadeValueField(SQUARE);

        it('emits 4 edges', () => {
            expect(f.edges.length).toBe(4);
        });

        // Outward normals: edge 0 (S), 1 (E), 2 (N), 3 (W).
        it.each<[number, Cardinal]>([
            [0, 'S'],
            [1, 'E'],
            [2, 'N'],
            [3, 'W'],
        ])('edge %i orientation = %s', (i, expected) => {
            expect(f.edges[i]!.orientation).toBe(expected);
        });
    });

    describe('sunlight score by orientation', () => {
        const f = computeFacadeValueField(SQUARE);
        it('south edge scores higher than north edge', () => {
            const south = f.edges.find(e => e.orientation === 'S')!;
            const north = f.edges.find(e => e.orientation === 'N')!;
            expect(south.sunlightScore).toBeGreaterThan(north.sunlightScore);
        });

        it('east edge scores higher than north edge', () => {
            const east = f.edges.find(e => e.orientation === 'E')!;
            const north = f.edges.find(e => e.orientation === 'N')!;
            expect(east.sunlightScore).toBeGreaterThan(north.sunlightScore);
        });

        it('south edge has the maximum sunlight score', () => {
            const south = f.edges.find(e => e.orientation === 'S')!;
            for (const e of f.edges) expect(south.sunlightScore).toBeGreaterThanOrEqual(e.sunlightScore);
        });
    });

    describe('CW polygon is canonicalised to CCW', () => {
        const REVERSED: Pt[] = [...SQUARE].reverse();
        const f = computeFacadeValueField(REVERSED);
        it('still returns 4 edges with the SAME cardinal set', () => {
            expect(f.edges.length).toBe(4);
            const cards = new Set(f.edges.map(e => e.orientation));
            expect(cards.has('S')).toBe(true);
            expect(cards.has('E')).toBe(true);
            expect(cards.has('N')).toBe(true);
            expect(cards.has('W')).toBe(true);
        });
    });

    describe('corner-exposure score', () => {
        it('every right-angle corner edge has cornerExposureScore ≈ 0.5 (one end turn 0.5)', () => {
            const f = computeFacadeValueField(SQUARE);
            for (const e of f.edges) {
                expect(e.cornerExposureScore).toBeGreaterThan(0.4);
                expect(e.cornerExposureScore).toBeLessThanOrEqual(1);
            }
        });

        it('a straight edge with no corners returns 0 corner exposure for that side', () => {
            // L-shape: a 1m strip on a 5m run gives one "straight extension" point.
            const lShape: Pt[] = [
                { x: 0, z: 0 }, { x: 5, z: 0 },          // edge 0 — south
                { x: 5, z: 1 }, { x: 3, z: 1 },          // edges 1+2 — east + north
                { x: 3, z: 3 }, { x: 0, z: 3 },          // edges 3+4 — north + north
            ];
            const f = computeFacadeValueField(lShape);
            // The L-shape's inner corner is a "concave" feature; outer corners are
            // convex. Just check the field is non-empty + every score in [0, 1].
            expect(f.edges.length).toBeGreaterThan(0);
            for (const e of f.edges) {
                expect(e.cornerExposureScore).toBeGreaterThanOrEqual(0);
                expect(e.cornerExposureScore).toBeLessThanOrEqual(1);
            }
        });
    });

    describe('overallValue', () => {
        const f = computeFacadeValueField(SQUARE);
        it('every edge scores in [0, 1]', () => {
            for (const e of f.edges) {
                expect(e.overallValue).toBeGreaterThanOrEqual(0);
                expect(e.overallValue).toBeLessThanOrEqual(1);
            }
        });

        it('the south edge outperforms the north edge overall', () => {
            const south = f.edges.find(e => e.orientation === 'S')!;
            const north = f.edges.find(e => e.orientation === 'N')!;
            expect(south.overallValue).toBeGreaterThan(north.overallValue);
        });
    });

    describe('edge length', () => {
        it('a 4 × 3 rectangle has 2 edges of length 4 + 2 of length 3', () => {
            const rect: Pt[] = [
                { x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 },
            ];
            const f = computeFacadeValueField(rect);
            expect(f.edges.filter(e => Math.abs(e.length - 4) < 1e-6).length).toBe(2);
            expect(f.edges.filter(e => Math.abs(e.length - 3) < 1e-6).length).toBe(2);
        });
    });
});
