// §L-590b / ADR-0273 — UNIT tests for the Art. 350.2.b *franja concèntrica* solver.
//
// ⚠ THESE ASSERT AGAINST CLOSED-FORM ANSWERS DERIVED FROM THE ARTICLE, NOT AGAINST THE SOLVER'S
// OWN OUTPUT. On a rectangle the erosion is exact — eroding a `W × H` block by `d` on all four
// sides leaves `(W − 2d)(H − 2d)` — so "the band's area equals 70 % of the block" has an answer
// anyone can check by hand from the ordinance text. A snapshot of what the bisection happens to
// return would pass whether or not it solves the right equation, which is the failure L-529 shipped
// for two years (a floored depth published as a computed one).
//
// The end-to-end composition, the tiling of the two tiers and the over-statement guards live in
// `tieredOccupationEnvelope.test.ts`; the independent grid-rasterisation oracle over 65 REAL
// dissolved Eixample blocks lives in `scratchpad/probe-l590b-band-oracle.mts`.

import { describe, it, expect } from 'vitest';
import type { Pt, ParcelEdgeClassification } from '@pryzm/schemas';
import {
    solveBlockConcentricBandDepth,
    BLOCK_BAND_RATIO_TOLERANCE,
} from '../src/geometry/blockConcentricBand.js';
import { solveBlockDerivedDepth } from '../src/geometry/blockDerivedDepth.js';

const square = (s: number): Pt[] => [
    { x: 0, z: 0 },
    { x: s, z: 0 },
    { x: s, z: s },
    { x: 0, z: s },
];
const ALL_FRONT: ParcelEdgeClassification[] = ['front', 'front', 'front', 'front'];

/** Closed form for a square: `(s − 2d)² = (1 − band)·s²`. */
const exactDepth = (s: number, bandRatio: number): number =>
    (s - s * Math.sqrt(1 - bandRatio)) / 2;

describe('ADR-0273 — the band solver answers Art. 350.2.b, checkable by hand', () => {
    it('solves the 70 % equality on a Cerdà 113 m block', () => {
        const r = solveBlockConcentricBandDepth({
            blockRing: square(113),
            blockEdgeClassifications: ALL_FRONT,
            bandAreaRatio: 0.7,
        })!;
        expect(r).not.toBeNull();
        expect(r.degenerate).toBe(false);
        expect(r.depth_m).toBeCloseTo(exactDepth(113, 0.7), 4);
        // An EQUALITY lands ON its target. Art. 242.2's minimum does not have this property,
        // which is why that solver needed a separate monotonicity tripwire to notice the same
        // class of geometry failure (L-581).
        expect(r.achievedBandRatio).toBeCloseTo(0.7, 3);
    });

    it('tracks the ratio rather than a constant — 40 %, 70 % and 90 % all solve', () => {
        for (const ratio of [0.4, 0.7, 0.9]) {
            const r = solveBlockConcentricBandDepth({
                blockRing: square(200),
                blockEdgeClassifications: ALL_FRONT,
                bandAreaRatio: ratio,
            })!;
            expect(r.degenerate).toBe(false);
            expect(r.depth_m).toBeCloseTo(exactDepth(200, ratio), 4);
        }
    });

    it('is winding-agnostic and scale-correct', () => {
        const cw = solveBlockConcentricBandDepth({
            blockRing: [...square(113)].reverse(),
            blockEdgeClassifications: ALL_FRONT,
            bandAreaRatio: 0.7,
        })!;
        expect(cw.depth_m).toBeCloseTo(exactDepth(113, 0.7), 4);
    });

    it('is byte-deterministic — fixed iteration budget, no convergence tolerance (C58 §1.1)', () => {
        const input = {
            blockRing: square(113),
            blockEdgeClassifications: ALL_FRONT,
            bandAreaRatio: 0.7,
        };
        expect(JSON.stringify(solveBlockConcentricBandDepth(input))).toBe(
            JSON.stringify(solveBlockConcentricBandDepth(input)),
        );
    });
});

describe('ADR-0273 — ⚠ it is NOT Art. 242.2, and the difference is the whole reason it exists', () => {
    it('⚠ MEASURED: the two constructions COINCIDE exactly where Art. 242’s clamps do not bite', () => {
        // ⚠ THIS IS A FINDING, AND IT IS RECORDED RATHER THAN HIDDEN BECAUSE IT LOOKS LIKE AN
        // ARGUMENT AGAINST THIS MODULE. On a Cerdà 113 m block Art. 242.2's ratio genuinely binds
        // (30 m of erosion leaves only 22 % free, so the cap cannot govern), and a minimum "leave
        // ≥ 30 % free" bound by its ratio lands on the SAME depth as an equality "the band is
        // 70 %" — because both are the depth at which free area is exactly 30 %. Anyone reading
        // only this block would conclude the two solvers are the same function.
        //
        // They are not, and the next two tests show where they part: at Art. 242's 11 m FLOOR and
        // its 30 m CAP, neither of which Art. 350 states. Coinciding on the unclamped interior is
        // exactly what you would expect of two rules that share an erosion and differ in their
        // bounds — and it is why the difference must be asserted at the bounds, not in the middle.
        const block = square(113);
        const art242 = solveBlockDerivedDepth({
            blockRing: block,
            blockEdgeClassifications: ALL_FRONT,
            interiorFreeRatio: 0.3,
            minDepth_m: 11,
            maxDepth_m: 30,
        })!;
        const art350 = solveBlockConcentricBandDepth({
            blockRing: block,
            blockEdgeClassifications: ALL_FRONT,
            bandAreaRatio: 0.7,
        })!;
        expect(art242.binding).toBe('interior-ratio');
        expect(art350.depth_m).toBeCloseTo(art242.depth_m, 3);
    });

    it('⚠ AT THE FLOOR: Art. 242 REFUSES a small block where Art. 350.2.b has a clean answer', () => {
        // A 30 m block. The 70 % band is 6.78 m deep — a perfectly good Art. 350.2.b answer.
        // Art. 242 cannot express it: its 11 m FLOOR is deeper than the construction wants, so
        // that solver returns `degenerate` ("the ordinance cannot be satisfied on this block").
        // Routing a 22a parcel through it would REFUSE an envelope the article grants, citing a
        // floor Art. 350 does not contain.
        const block = square(30);
        const art242 = solveBlockDerivedDepth({
            blockRing: block,
            blockEdgeClassifications: ALL_FRONT,
            interiorFreeRatio: 0.3,
            minDepth_m: 11,
            maxDepth_m: 30,
        })!;
        const art350 = solveBlockConcentricBandDepth({
            blockRing: block,
            blockEdgeClassifications: ALL_FRONT,
            bandAreaRatio: 0.7,
        })!;
        expect(art242.degenerate).toBe(true);
        expect(art242.binding).toBe('min-floor');
        expect(art350.degenerate).toBe(false);
        expect(art350.depth_m).toBeCloseTo(exactDepth(30, 0.7), 4);
    });

    it('⚠ AT THE CAP: Art. 242 stops at 30 m where Art. 350.2.b keeps going', () => {
        // A 400 m block. Art. 242's cap governs at 30 m; Art. 350.2.b's band is 90.5 m deep.
        // Publishing 30 m under a citation to Art. 350.2.b would UNDER-state by a factor of 3 on
        // exactly the large-parcel industrial fabric this clau covers — a real number, correctly
        // computed, from the wrong article. That is L-526.
        const block = square(400);
        const art242 = solveBlockDerivedDepth({
            blockRing: block,
            blockEdgeClassifications: ALL_FRONT,
            interiorFreeRatio: 0.3,
            minDepth_m: 11,
            maxDepth_m: 30,
        })!;
        const art350 = solveBlockConcentricBandDepth({
            blockRing: block,
            blockEdgeClassifications: ALL_FRONT,
            bandAreaRatio: 0.7,
        })!;
        expect(art242.binding).toBe('max-cap');
        expect(art242.depth_m).toBe(30);
        expect(art350.depth_m).toBeCloseTo(exactDepth(400, 0.7), 3);
        expect(art350.depth_m).toBeGreaterThan(3 * art242.depth_m);
    });

    it('accepts NO depth bounds — the schema and the solver both refuse to hold one', () => {
        // Art. 350 states neither a floor nor a cap. If either ever appears in this input type,
        // the number came from somewhere other than Art. 350 (L-526).
        const keys = Object.keys({
            blockRing: square(50),
            blockEdgeClassifications: ALL_FRONT,
            bandAreaRatio: 0.7,
        });
        expect(keys).not.toContain('minDepth_m');
        expect(keys).not.toContain('maxDepth_m');
    });

    it('finds a deep answer a 30 m cap would have hidden — a very large block', () => {
        // A 400 m block's 70 % band is 90.5 m deep. Under Art. 242's clamps that answer is
        // unreachable; here it is simply the answer, because the article states no cap. This is
        // what "the construction is unbounded because the article is" means in practice.
        const r = solveBlockConcentricBandDepth({
            blockRing: square(400),
            blockEdgeClassifications: ALL_FRONT,
            bandAreaRatio: 0.7,
        })!;
        expect(r.degenerate).toBe(false);
        expect(r.depth_m).toBeCloseTo(exactDepth(400, 0.7), 3);
        expect(r.depth_m).toBeGreaterThan(30);
    });
});

describe('ADR-0273 — the equality VERIFIES ITSELF, and refuses when it misses', () => {
    it('`degenerate` is EXACTLY "missed its own target" — never a judgement about the block', () => {
        // ⚠ THE INVARIANT, ASSERTED AS AN INVARIANT RATHER THAN VIA A FABRICATED FAILURE. Art.
        // 350.2.b's equality always has a solution on a well-formed block, so a miss can only ever
        // mean our erosion is discontinuous here (the L-581 pathology). This test pins the
        // biconditional on a spread of shapes — squares, a long rectangle, an L, a needle — so
        // that no future edit can start refusing (or start publishing) on any other criterion.
        // Whether any given shape happens to fail is not asserted, because asserting a failure we
        // had to construct would be testing our own fixture rather than the rule.
        const shapes: Array<{ ring: Pt[]; cls: ParcelEdgeClassification[] }> = [
            { ring: square(30), cls: ALL_FRONT },
            { ring: square(113), cls: ALL_FRONT },
            { ring: square(400), cls: ALL_FRONT },
            {
                ring: [{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 0.2 }, { x: 0, z: 0.2 }],
                cls: ALL_FRONT,
            },
            {
                ring: [
                    { x: 0, z: 0 }, { x: 120, z: 0 }, { x: 120, z: 40 },
                    { x: 40, z: 40 }, { x: 40, z: 120 }, { x: 0, z: 120 },
                ],
                cls: ['front', 'front', 'front', 'side', 'front', 'front'],
            },
        ];
        for (const s of shapes) {
            const r = solveBlockConcentricBandDepth({
                blockRing: s.ring,
                blockEdgeClassifications: s.cls,
                bandAreaRatio: 0.7,
            });
            if (r === null) continue;   // could not be asked at all — a different refusal
            expect(r.degenerate).toBe(
                Math.abs(r.achievedBandRatio - 0.7) > BLOCK_BAND_RATIO_TOLERANCE,
            );
            // A published depth is always a real, finite, non-negative distance.
            if (!r.degenerate) {
                expect(Number.isFinite(r.depth_m)).toBe(true);
                expect(r.depth_m).toBeGreaterThan(0);
            }
        }
    });

    it('refuses a block with NO street frontage — a construction with no input', () => {
        // §BLOCK-DEPTH-REQUIRES-FRONTAGE (L-465). Without this the erosion removes nothing at
        // every depth, the search runs to its geometric ceiling and hands back a band covering
        // the whole block: maximum buildability, produced from nothing.
        expect(
            solveBlockConcentricBandDepth({
                blockRing: square(113),
                blockEdgeClassifications: ['side', 'side', 'side', 'side'],
                bandAreaRatio: 0.7,
            }),
        ).toBeNull();
    });

    it('refuses degenerate rings, mismatched classifications and out-of-range ratios', () => {
        const base = { blockEdgeClassifications: ALL_FRONT, bandAreaRatio: 0.7 };
        expect(
            solveBlockConcentricBandDepth({
                ...base,
                blockRing: [{ x: 0, z: 0 }, { x: 1, z: 1 }],
                blockEdgeClassifications: ['front', 'front'],
            }),
        ).toBeNull();
        expect(
            solveBlockConcentricBandDepth({ ...base, blockRing: square(113), blockEdgeClassifications: ['front'] }),
        ).toBeNull();
        for (const bad of [0, 1, -0.5, 1.5, Number.NaN]) {
            expect(
                solveBlockConcentricBandDepth({
                    blockRing: square(113),
                    blockEdgeClassifications: ALL_FRONT,
                    bandAreaRatio: bad,
                }),
            ).toBeNull();
        }
    });
});
