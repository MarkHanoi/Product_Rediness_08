// ADR-0271 — THE COMPOSITION TEST: cadastral parcels → block ring → frontages → derived depth →
// buildable envelope, in one chain, on a Cerdà-shaped block.
//
// WHY THIS FILE EXISTS SEPARATELY FROM THE UNIT TESTS. P1–P4 each pass in isolation and each was
// written against its own inputs. That is exactly the state in which L-465 survived: the solver
// was correct for every input a solver-author would think to write, and wrong for the input the
// CALLER actually produces (a block whose frontages were never classified). The defects in this
// subsystem have consistently lived in the SEAMS — L-462 between inset and its soundness gate,
// L-465 between classification and the solver, L-445 between the schema and any real writer.
//
// So this test deliberately uses NO hand-authored block ring and NO hand-authored classification.
// It starts from parcels, the way the product will, and lets every stage feed the next.

import { describe, it, expect } from 'vitest';
import type { Pt, GeometricRule, ParcelEdgeClassification } from '@pryzm/schemas';
import {
    dissolveParcelsToBlockRing,
    classifyBlockFrontages,
    type RoadPolyline,
} from '../src/geometry/blockRing.js';
import { solveBlockDerivedDepth } from '../src/geometry/blockDerivedDepth.js';
import {
    computeBuildableEnvelope,
    estimatedDefaultZoningRecord,
    ESTIMATED_DEFAULT_PACK,
} from '../src/index.js';

/**
 * A 113 × 113 m Cerdà block divided into 16 parcels (4 × 4). Real Eixample manzanas are ~113 m
 * and subdivided into many plots; a conforming grid is the honest happy path for the
 * edge-cancellation dissolve, and its failure modes are covered in blockRing.test.ts.
 */
const BLOCK_M = 113;
const N = 4;
const CELL = BLOCK_M / N;

function parcelGrid(): Pt[][] {
    const out: Pt[][] = [];
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            const x0 = i * CELL, z0 = j * CELL;
            out.push([
                { x: x0, z: z0 },
                { x: x0 + CELL, z: z0 },
                { x: x0 + CELL, z: z0 + CELL },
                { x: x0, z: z0 + CELL },
            ]);
        }
    }
    return out;
}

/** Streets on all four sides, offset ~6 m out — centrelines, as OSM supplies them. */
const STREETS: RoadPolyline[] = [
    { points: [{ x: -30, z: -6 }, { x: BLOCK_M + 30, z: -6 }] },
    { points: [{ x: -30, z: BLOCK_M + 6 }, { x: BLOCK_M + 30, z: BLOCK_M + 6 }] },
    { points: [{ x: -6, z: -30 }, { x: -6, z: BLOCK_M + 30 }] },
    { points: [{ x: BLOCK_M + 6, z: -30 }, { x: BLOCK_M + 6, z: BLOCK_M + 30 }] },
];

/** The Art. 242.2 parameters for the Eixample. */
const EIXAMPLE_RULE: GeometricRule = {
    kind: 'block-derived-alignment',
    alignTo: 'street',
    alignmentOffset_m: 0,
    sideTreatment: 'party-wall',
    interiorFreeRatio: 0.3,
    minDepth_m: 11,
    maxDepth_m: 30,
};

/** A corner-facing parcel on the south frontage of the block. */
const SUBJECT_PARCEL: Pt[] = [
    { x: CELL, z: 0 },
    { x: 2 * CELL, z: 0 },
    { x: 2 * CELL, z: CELL },
    { x: CELL, z: CELL },
];
const SUBJECT_EDGES: ParcelEdgeClassification[] = ['front', 'side', 'rear', 'side'];

describe('ADR-0271 — parcels → block → frontages → depth → envelope, composed', () => {
    it('dissolves 16 cadastral parcels back into the 113 m block', () => {
        const block = dissolveParcelsToBlockRing(parcelGrid());
        expect(block.degenerate).toBe(false);
        // 4 corners after collinear cleanup — the 12 intermediate vertices where parcels met
        // along a straight run carry no shape information.
        expect(block.ring).toHaveLength(4);
    });

    it('classifies all four block edges as street frontage', () => {
        const block = dissolveParcelsToBlockRing(parcelGrid());
        const cls = classifyBlockFrontages(block.ring, STREETS);
        expect(cls).toEqual(['front', 'front', 'front', 'front']);
    });

    it('derives a depth INSIDE the ordinance band, bound by the courtyard rule', () => {
        const block = dissolveParcelsToBlockRing(parcelGrid());
        const cls = classifyBlockFrontages(block.ring, STREETS);
        const solved = solveBlockDerivedDepth({
            blockRing: block.ring,
            blockEdgeClassifications: cls,
            interiorFreeRatio: 0.3,
            minDepth_m: 11,
            maxDepth_m: 30,
        });

        expect(solved).not.toBeNull();
        expect(solved!.degenerate).toBe(false);
        expect(solved!.depth_m).toBeGreaterThanOrEqual(11);
        expect(solved!.depth_m).toBeLessThanOrEqual(30);

        // On a 113 m square, eroding d from all four sides leaves (113 − 2d)². The 30% free
        // requirement gives 113 − 2d = 113·√0.3 ⇒ d ≈ 25.5 m — inside the band, so the RATIO
        // binds, not the cap. Asserting the binding (not just the number) is what distinguishes
        // "the courtyard rule set this" from "the cap set this" — different legal statements,
        // and the L-465 bug was precisely a cap-bound answer masquerading as a real one.
        expect(solved!.binding).toBe('interior-ratio');
        expect(solved!.depth_m).toBeCloseTo((BLOCK_M - BLOCK_M * Math.sqrt(0.3)) / 2, 1);
        expect(solved!.achievedFreeRatio).toBeGreaterThanOrEqual(0.3 - 1e-6);
    });

    it('produces a depth-limited envelope for a parcel on that block', () => {
        const block = dissolveParcelsToBlockRing(parcelGrid());
        const cls = classifyBlockFrontages(block.ring, STREETS);

        const env = computeBuildableEnvelope({
            parcelRing: SUBJECT_PARCEL,
            edgeClassifications: SUBJECT_EDGES,
            zoning: estimatedDefaultZoningRecord(),
            rulePack: ESTIMATED_DEFAULT_PACK,
            geometricRule: EIXAMPLE_RULE,
            blockRing: block.ring,
            blockEdgeClassifications: cls,
        });

        expect(env.insetPolygon.length).toBeGreaterThanOrEqual(3);
        expect(env.insetAreaM2).toBeGreaterThan(0);

        // The parcel is 28.25 m deep and the derived depth ~25.5 m, so the depth band does NOT
        // consume it — but the envelope must still be bounded by the parcel, never larger.
        expect(env.insetAreaM2).toBeLessThanOrEqual(CELL * CELL + 1e-6);

        // The derivation must name BOTH the depth and what bound it — a constructed number
        // presented without its construction is the thing C58 §1.3 exists to prevent.
        const depth = env.derivation.find((d) => d.constraint === 'alignment.depth');
        const binding = env.derivation.find((d) => d.constraint === 'alignment.depthBinding');
        expect(depth?.value).toBeCloseTo((BLOCK_M - BLOCK_M * Math.sqrt(0.3)) / 2, 1);
        expect(binding?.value).toBe('interior-ratio');
    });

    it('is byte-deterministic across the WHOLE chain (C58 §1.1)', () => {
        // Determinism was only ever asserted per-stage. A composition can still be
        // non-deterministic if any stage leaks iteration order — the dissolve builds Maps.
        const run = () => {
            const block = dissolveParcelsToBlockRing(parcelGrid());
            const cls = classifyBlockFrontages(block.ring, STREETS);
            return JSON.stringify(
                computeBuildableEnvelope({
                    parcelRing: SUBJECT_PARCEL,
                    edgeClassifications: SUBJECT_EDGES,
                    zoning: estimatedDefaultZoningRecord(),
                    rulePack: ESTIMATED_DEFAULT_PACK,
                    geometricRule: EIXAMPLE_RULE,
                    blockRing: block.ring,
                    blockEdgeClassifications: cls,
                }),
            );
        };
        expect(run()).toBe(run());
    });
});

describe('ADR-0271 — the chain REFUSES rather than degrading, at every seam', () => {
    it('parcels that do not tile → no block → NO ENVELOPE (never a parcel-only fallback)', () => {
        // THE SEAM THAT MATTERS. If the dissolve fails, the tempting behaviour is to fall back to
        // insetting the parcel alone — which yields a plausible envelope computed from a rule
        // that was never applied. The chain must produce nothing instead.
        const disjoint = [
            [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }],
            [{ x: 500, z: 500 }, { x: 510, z: 500 }, { x: 510, z: 510 }, { x: 500, z: 510 }],
        ];
        const block = dissolveParcelsToBlockRing(disjoint);
        expect(block.degenerate).toBe(true);

        const env = computeBuildableEnvelope({
            parcelRing: SUBJECT_PARCEL,
            edgeClassifications: SUBJECT_EDGES,
            zoning: estimatedDefaultZoningRecord(),
            rulePack: ESTIMATED_DEFAULT_PACK,
            geometricRule: EIXAMPLE_RULE,
            // A failed dissolve yields [] — the caller must pass nothing, not a partial ring.
            blockRing: block.ring.length >= 3 ? block.ring : null,
            blockEdgeClassifications: null,
        });
        expect(env.insetPolygon).toEqual([]);
        expect(env.insetAreaM2).toBe(0);
        expect(env.caveats.join(' ')).toMatch(/block ring|function of the block/i);
    });

    it('a block with NO streets found → no depth → NO ENVELOPE (L-465 end to end)', () => {
        // The classifier returns all-`side` when no road is near. Before L-465 the solver would
        // have answered 30 m — the ordinance maximum — for a block whose streets it could not
        // find. This asserts the refusal survives composition, not just the unit call.
        const block = dissolveParcelsToBlockRing(parcelGrid());
        const cls = classifyBlockFrontages(block.ring, []); // no roads supplied
        expect(cls.every((c) => c === 'side')).toBe(true);

        const env = computeBuildableEnvelope({
            parcelRing: SUBJECT_PARCEL,
            edgeClassifications: SUBJECT_EDGES,
            zoning: estimatedDefaultZoningRecord(),
            rulePack: ESTIMATED_DEFAULT_PACK,
            geometricRule: EIXAMPLE_RULE,
            blockRing: block.ring,
            blockEdgeClassifications: cls,
        });
        expect(env.insetPolygon).toEqual([]);
        expect(env.derivation.find((d) => d.constraint === 'alignment.depth')).toBeUndefined();
    });
});
