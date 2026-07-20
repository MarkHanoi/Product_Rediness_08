// ADR-0271 (L-460) — block-derived *profunditat edificable* (PGM Art. 242.2).
//
// The thing under test is a LEGAL CONSTRUCTION, so the assertions are chosen to catch a
// plausible-but-wrong depth, not merely a broken one:
//   • the 30% courtyard rule actually binds (and the achieved ratio lands ON it, not near it);
//   • the ordinance CAP and FLOOR are distinguishable from the ratio in the reported `binding`,
//     because "the cap set this" and "the courtyard rule set this" are different legal claims
//     about the same number;
//   • a block too shallow to honour the rule is reported DEGENERATE, never silently clamped —
//     publishing an unsanctioned depth is the failure mode this whole ADR exists to prevent;
//   • determinism (C58 §1.1), since the solver bisects.

import { describe, it, expect } from 'vitest';
import {
    solveBlockDerivedDepth,
    type BlockDerivedDepthInput,
} from '../src/geometry/blockDerivedDepth.js';
import type { ParcelEdgeClassification } from '@pryzm/schemas';

/** A rectangular block W × H with all four edges as street frontages — the Cerdà case. */
function block(w: number, h: number): BlockDerivedDepthInput {
    return {
        blockRing: [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: h }, { x: 0, z: h }],
        blockEdgeClassifications: ['front', 'front', 'front', 'front'] as ParcelEdgeClassification[],
        interiorFreeRatio: 0.30,
        minDepth_m: 11,
        maxDepth_m: 30,
    };
}

describe('ADR-0271 solveBlockDerivedDepth — the Art. 242.2 construction', () => {
    // A real Cerdà block is ~113 m square. Eroding d from all four sides leaves
    // (113−2d)² free; 30% of 113² needs (113−2d)² ≥ 0.30·113² ⇒ d ≤ 113(1−√0.3)/2 ≈ 25.5 m.
    it('binds on the 30% interior-free rule for a real Cerdà-sized block', () => {
        const res = solveBlockDerivedDepth(block(113, 113))!;
        expect(res.binding).toBe('interior-ratio');
        expect(res.degenerate).toBe(false);
        // Closed form: (113−2d)² ≥ 0.30·113² ⇒ d ≤ 113(1−√0.3)/2 = 25.5537 m.
        expect(res.depth_m).toBeCloseTo(25.5537, 3);
        // The achieved ratio must land ON the requirement, not comfortably above it — that is
        // what "largest admissible depth" means, and a solver that stopped early would pass a
        // naive ">= 0.30" check while quietly under-building the plot.
        expect(res.achievedFreeRatio).toBeGreaterThanOrEqual(0.30);
        expect(res.achievedFreeRatio).toBeLessThan(0.3001);
    });

    // ⚠ NOT the same legal statement as the one above, even though both yield a number.
    it('reports the ordinance CAP as the binding constraint when the ratio never bites', () => {
        // A very large block: even at 30 m depth, far more than 30% stays free.
        const res = solveBlockDerivedDepth(block(400, 400))!;
        expect(res.binding).toBe('max-cap');
        expect(res.depth_m).toBe(30);
        expect(res.degenerate).toBe(false);
        expect(res.achievedFreeRatio).toBeGreaterThan(0.30);
    });

    // THE HONESTY CASE. A block too shallow to keep its courtyard at the 11 m floor cannot be
    // built to the ordinance at all. Clamping to 11 m would publish a depth the ordinance does
    // not sanction — plausible, well-formed and wrong.
    it('reports DEGENERATE (never silently clamps) when even the floor cannot hold the courtyard', () => {
        // 30 m deep block: at d = 11 the remainder is 8 m × 8 m of a 30×30 = 7.1% — far under 30%.
        const res = solveBlockDerivedDepth(block(30, 30))!;
        expect(res.degenerate).toBe(true);
        expect(res.binding).toBe('min-floor');
        expect(res.achievedFreeRatio).toBeLessThan(0.30);
    });

    it('measures depth from STREET FRONTAGES only, not from every edge', () => {
        // Same block, but only two opposite edges are streets: the erosion is one-dimensional,
        // so far more depth is admissible than in the all-frontage case.
        const twoStreets: BlockDerivedDepthInput = {
            ...block(113, 113),
            blockEdgeClassifications: ['front', 'side', 'front', 'side'] as ParcelEdgeClassification[],
        };
        const both = solveBlockDerivedDepth(block(113, 113))!;
        const two = solveBlockDerivedDepth(twoStreets)!;
        expect(two.depth_m).toBeGreaterThan(both.depth_m);
    });

    it('is DETERMINISTIC — repeated solves are bit-identical (C58 §1.1)', () => {
        const a = solveBlockDerivedDepth(block(113, 113))!;
        const b = solveBlockDerivedDepth(block(113, 113))!;
        expect(a.depth_m).toBe(b.depth_m);
        expect(a.achievedFreeRatio).toBe(b.achievedFreeRatio);
    });

    it('respects a non-default ratio / floor / cap (the rule is per-jurisdiction, not hardcoded)', () => {
        const strict = solveBlockDerivedDepth({ ...block(113, 113), interiorFreeRatio: 0.60 })!;
        const loose = solveBlockDerivedDepth({ ...block(113, 113), interiorFreeRatio: 0.10 })!;
        // More required free space ⇒ shallower permitted depth. Monotonicity, stated as a test.
        expect(strict.depth_m).toBeLessThan(loose.depth_m);
    });

    it('honours a lowered cap even when the ratio would allow more', () => {
        const res = solveBlockDerivedDepth({ ...block(113, 113), maxDepth_m: 15 })!;
        expect(res.binding).toBe('max-cap');
        expect(res.depth_m).toBe(15);
    });

    describe('degenerate inputs — never throws, returns null', () => {
        it('null for a ring with fewer than 3 points', () => {
            expect(solveBlockDerivedDepth({ ...block(113, 113), blockRing: [{ x: 0, z: 0 }] })).toBeNull();
        });
        it('null for an inverted depth range', () => {
            expect(solveBlockDerivedDepth({ ...block(113, 113), minDepth_m: 30, maxDepth_m: 11 }))
                .toBeNull();
        });
        it('null for a zero-area block', () => {
            expect(solveBlockDerivedDepth({
                ...block(113, 113),
                blockRing: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 20, z: 0 }],
            })).toBeNull();
        });
    });
});
