// ADR-0271 P4 — block-ring dissolve + frontage classification.
//
// The bias in this file is deliberate: MOST of it asserts a REFUSAL, not a result. L-462 and
// L-465 were both geometry primitives that answered confidently for an input they should have
// rejected, and both were caught (or missed) by whether such a test existed. An almost-right
// block ring produces an almost-right profunditat edificable, which is exactly the
// confidently-wrong compliance number this whole subsystem is built to avoid.

import { describe, it, expect } from 'vitest';
import type { Pt } from '@pryzm/schemas';
import {
    dissolveParcelsToBlockRing,
    classifyBlockFrontages,
    type RoadPolyline,
} from '../src/geometry/blockRing.js';
import { polygonArea } from '@pryzm/site-validators';

/** Axis-aligned rectangle as a closed-by-convention (open) ring. */
const rect = (x0: number, z0: number, x1: number, z1: number): Pt[] => [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
];

describe('ADR-0271 P4 — dissolveParcelsToBlockRing', () => {
    it('dissolves two parcels sharing a full edge into one rectangle', () => {
        // 20×10 + 20×10 stacked → 20×20. The shared edge appears twice and cancels.
        const res = dissolveParcelsToBlockRing([rect(0, 0, 20, 10), rect(0, 10, 20, 20)]);
        expect(res.degenerate).toBe(false);
        expect(res.ring).toHaveLength(4);
        expect(polygonArea(res.ring)).toBeCloseTo(400, 6);
    });

    it('dissolves a 2×2 tiling of four parcels', () => {
        const res = dissolveParcelsToBlockRing([
            rect(0, 0, 10, 10), rect(10, 0, 20, 10),
            rect(0, 10, 10, 20), rect(10, 10, 20, 20),
        ]);
        expect(res.degenerate).toBe(false);
        expect(polygonArea(res.ring)).toBeCloseTo(400, 6);
        // Interior cross edges must all have cancelled — a square has four corners, not eight.
        expect(res.ring).toHaveLength(4);
    });

    it('passes a single parcel through unchanged in area', () => {
        const res = dissolveParcelsToBlockRing([rect(0, 0, 30, 40)]);
        expect(res.degenerate).toBe(false);
        expect(polygonArea(res.ring)).toBeCloseTo(1200, 6);
    });

    it('is INPUT-ORDER independent — same parcels, any order, byte-identical ring', () => {
        // C58 §1.1. Two callers assembling the same manzana from a different query order must
        // not get different envelopes.
        const a = dissolveParcelsToBlockRing([rect(0, 0, 10, 10), rect(10, 0, 20, 10)]);
        const b = dissolveParcelsToBlockRing([rect(10, 0, 20, 10), rect(0, 0, 10, 10)]);
        expect(JSON.stringify(a.ring)).toBe(JSON.stringify(b.ring));
    });

    it('tolerates sub-millimetre vertex jitter between neighbours', () => {
        // Real cadastral neighbours rarely share bit-identical coordinates.
        const left = rect(0, 0, 10, 10);
        const right: Pt[] = [
            { x: 10.0000001, z: 0 },
            { x: 20, z: 0 },
            { x: 20, z: 10 },
            { x: 10.0000001, z: 10 },
        ];
        const res = dissolveParcelsToBlockRing([left, right]);
        expect(res.degenerate).toBe(false);
        expect(polygonArea(res.ring)).toBeCloseTo(200, 3);
    });

    it('accepts rings supplied CLOSED (first vertex repeated at the end)', () => {
        const closed = [...rect(0, 0, 10, 10), { x: 0, z: 0 }];
        const res = dissolveParcelsToBlockRing([closed]);
        expect(res.degenerate).toBe(false);
        expect(polygonArea(res.ring)).toBeCloseTo(100, 6);
    });
});

describe('ADR-0271 P4 — dissolve REFUSES rather than inventing an outline', () => {
    it('DISJOINT parcels → degenerate, not a ring spanning the gap', () => {
        // The dangerous failure: silently bridging two blocks into one would roughly double the
        // block area and inflate the derived depth on both.
        const res = dissolveParcelsToBlockRing([rect(0, 0, 10, 10), rect(50, 50, 60, 60)]);
        expect(res.degenerate).toBe(true);
        expect(res.reason).toBe('open-or-disjoint');
        expect(res.ring).toEqual([]);
    });

    it('OVERLAPPING parcels → non-manifold, never a plausible outline', () => {
        // Three parcels sharing one edge is not a tiling; any outline would be fiction.
        const res = dissolveParcelsToBlockRing([
            rect(0, 0, 10, 10), rect(0, 10, 10, 20), rect(0, 10, 10, 20),
        ]);
        expect(res.degenerate).toBe(true);
        expect(res.reason).toBe('non-manifold');
    });

    it('a T-JUNCTION → degenerate (the known real-cadastre limitation, made explicit)', () => {
        // Left parcel's right edge spans z 0→20; the two right parcels meet it at z=10, which is
        // a vertex the left parcel does not have. Nothing cancels cleanly. This is the honest
        // boundary of the edge-cancellation approach, asserted so it can never regress into a
        // silent wrong answer.
        const left = rect(0, 0, 10, 20);
        const res = dissolveParcelsToBlockRing([left, rect(10, 0, 20, 10), rect(10, 10, 20, 20)]);
        expect(res.degenerate).toBe(true);
        expect(res.reason).toBe('open-or-disjoint');
    });

    it('a degenerate parcel (<3 vertices) → malformed, not skipped', () => {
        // Skipping it would produce an outline of the REMAINING parcels and call it the block.
        const res = dissolveParcelsToBlockRing([rect(0, 0, 10, 10), [{ x: 0, z: 0 }, { x: 1, z: 1 }]]);
        expect(res.degenerate).toBe(true);
        expect(res.reason).toBe('malformed-parcel');
    });

    it('no parcels → degenerate', () => {
        expect(dissolveParcelsToBlockRing([]).degenerate).toBe(true);
    });
});

describe('ADR-0271 P4 — classifyBlockFrontages', () => {
    /** A 100×100 block with streets on the south and north sides only. */
    const BLOCK = rect(0, 0, 100, 100);
    const southStreet: RoadPolyline = { points: [{ x: -20, z: -6 }, { x: 120, z: -6 }] };
    const northStreet: RoadPolyline = { points: [{ x: -20, z: 106 }, { x: 120, z: 106 }] };

    it('marks the edges with a parallel road as `front` and the rest as `side`', () => {
        const cls = classifyBlockFrontages(BLOCK, [southStreet, northStreet]);
        // Edge 0 = south (z=0), 1 = east, 2 = north (z=100), 3 = west.
        expect(cls).toEqual(['front', 'side', 'front', 'side']);
    });

    it('a PERPENDICULAR road near a corner does NOT make that edge a frontage', () => {
        // Without the parallelism test every corner block edge is misclassified as street —
        // which, via Art. 242, silently changes the derived depth on every corner block.
        const crossing: RoadPolyline = { points: [{ x: -6, z: -20 }, { x: -6, z: 120 }] };
        const cls = classifyBlockFrontages(BLOCK, [crossing]);
        expect(cls[0]).toBe('side'); // south edge — road is perpendicular to it
        expect(cls[3]).toBe('front'); // west edge — road IS parallel to it
    });

    it('a road too far away claims nothing', () => {
        const far: RoadPolyline = { points: [{ x: -20, z: -400 }, { x: 120, z: -400 }] };
        expect(classifyBlockFrontages(BLOCK, [far])).toEqual(['side', 'side', 'side', 'side']);
    });

    it('no roads → every edge `side` (and the engine will then refuse — L-465)', () => {
        // Chained deliberately: this is the input that used to make the solver return the 30 m
        // ordinance cap with `degenerate: false`.
        expect(classifyBlockFrontages(BLOCK, [])).toEqual(['side', 'side', 'side', 'side']);
    });

    it('returns exactly one classification per edge', () => {
        const penta = [
            { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 14, z: 8 }, { x: 5, z: 14 }, { x: -3, z: 7 },
        ];
        expect(classifyBlockFrontages(penta, [southStreet])).toHaveLength(5);
    });

    it('is deterministic and side-effect free across repeated calls', () => {
        const once = classifyBlockFrontages(BLOCK, [southStreet, northStreet]);
        const twice = classifyBlockFrontages(BLOCK, [southStreet, northStreet]);
        expect(twice).toEqual(once);
    });
});
