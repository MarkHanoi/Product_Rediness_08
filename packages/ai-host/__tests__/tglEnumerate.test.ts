// TGL P8 — deterministic Pareto enumeration tests.
// Contract (SPEC §7): returns ≤ count options; Pareto-sorted (no option dominates
// an earlier one); deterministic (two runs deep-equal); < 2 s for a 12-room program.

import { describe, expect, it } from 'vitest';
import { enumerateLayouts, type EnumerateInput, type TglCandidate } from '../src/workflows/apartmentLayout/tgl/enumerate.js';
import { OBJECTIVE_AXES, type ObjectiveVector } from '../src/workflows/apartmentLayout/tgl/objectives.js';
import type { Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };
const PROGRAM: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};
const RECT: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }];

const input = (over: Partial<EnumerateInput> = {}): EnumerateInput => ({
    shellPolygon: RECT, program: PROGRAM, levelId: 'L1', seed: 'seed', weights: WEIGHTS, count: 3, ...over,
});

const dominates = (a: ObjectiveVector, b: ObjectiveVector): boolean => {
    let strict = false;
    for (const ax of OBJECTIVE_AXES) { if (a[ax] < b[ax] - 1e-9) return false; if (a[ax] > b[ax] + 1e-9) strict = true; }
    return strict;
};

describe('enumerateLayouts (TGL P8)', () => {
    it('returns at most `count` candidates', () => {
        expect(enumerateLayouts(input({ count: 3 })).length).toBeLessThanOrEqual(3);
        expect(enumerateLayouts(input({ count: 1 })).length).toBeLessThanOrEqual(1);
    });

    it('each returned candidate is a complete, non-empty layout graph', () => {
        const out = enumerateLayouts(input({ count: 3 }));
        expect(out.length).toBeGreaterThan(0);
        for (const c of out) {
            expect(c.graph.nodes.some(n => n.kind === 'Space')).toBe(true);
            expect(c.graph.nodes.some(n => n.kind === 'Wall')).toBe(true);
            for (const ax of OBJECTIVE_AXES) expect(c.objectives[ax]).toBeGreaterThanOrEqual(0);
        }
    });

    it('is Pareto-respecting: no later option dominates an earlier one', () => {
        const out: TglCandidate[] = enumerateLayouts(input({ count: 8 }));
        for (let i = 0; i < out.length; i++)
            for (let j = i + 1; j < out.length; j++)
                expect(dominates(out[j]!.objectives, out[i]!.objectives)).toBe(false);
    });

    it('ranks are non-decreasing along the returned list', () => {
        const out = enumerateLayouts(input({ count: 8 }));
        for (let i = 1; i < out.length; i++) expect(out[i]!.rank).toBeGreaterThanOrEqual(out[i - 1]!.rank);
    });

    it('is deterministic — two runs are byte-identical (graphs + GUIDs)', () => {
        expect(JSON.stringify(enumerateLayouts(input()))).toEqual(JSON.stringify(enumerateLayouts(input())));
    });

    it('handles an L-shaped shell', () => {
        const L: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 6 }, { x: 6, z: 6 }, { x: 6, z: 10 }, { x: 0, z: 10 }];
        const out = enumerateLayouts(input({ shellPolygon: L }));
        expect(out.length).toBeGreaterThan(0);
        expect(out[0]!.graph.nodes.some(n => n.kind === 'Space')).toBe(true);
    });

    it('completes a 12-room program in well under 2 s', () => {
        const big: ApartmentProgram = { bedrooms: 4, bathrooms: 2, masterEnSuite: true, openPlanKitchenDining: true, livingRoom: true, entranceHall: true };
        const start = performance.now();
        const out = enumerateLayouts(input({ program: big, shellPolygon: [{ x: 0, z: 0 }, { x: 18, z: 0 }, { x: 18, z: 12 }, { x: 0, z: 12 }], count: 5 }));
        const elapsed = performance.now() - start;
        expect(out.length).toBeGreaterThan(0);
        expect(elapsed).toBeLessThan(2000);
    });
});
