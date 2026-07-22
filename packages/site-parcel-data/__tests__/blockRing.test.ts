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
    TJUNCTION_SPLIT_TOLERANCE_M,
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

    it('a T-JUNCTION still refuses when the L-539 repair is switched OFF', () => {
        // Left parcel's right edge spans z 0→20; the two right parcels meet it at z=10, which is
        // a vertex the left parcel does not have. Nothing cancels cleanly. This was the honest
        // boundary of the edge-cancellation approach before §DISSOLVE-TJUNCTION-SPLIT, and it is
        // pinned here so the pre-L-539 behaviour stays inspectable rather than becoming folklore.
        const left = rect(0, 0, 10, 20);
        const res = dissolveParcelsToBlockRing(
            [left, rect(10, 0, 20, 10), rect(10, 10, 20, 20)],
            { repairTJunctions: false },
        );
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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §DISSOLVE-TJUNCTION-SPLIT (L-539)
//
// The measured facts these tests encode (SPAIN-DISSOLVE-FAILURE-TAXONOMY.md, 956 real manzanas):
// the dominant failure is an extra near-collinear vertex on one side of a shared boundary, caused
// by Catastro publishing coordinates rounded to 1e-6° (≈ 0.083 m E / 0.111 m N). There are no
// slivers and no near-coincident vertices to weld — so nothing here welds anything.
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('L-539 §DISSOLVE-TJUNCTION-SPLIT — repairs the ONE class the data says dominates', () => {
    it('a T-junction now dissolves, and says so in `quality`', () => {
        const res = dissolveParcelsToBlockRing([
            rect(0, 0, 10, 20), rect(10, 0, 20, 10), rect(10, 10, 20, 20),
        ]);
        expect(res.degenerate).toBe(false);
        expect(polygonArea(res.ring)).toBeCloseTo(400, 6);
        expect(res.quality.path).toBe('t-junction-split');
        expect(res.quality.splitCount).toBe(1);
        // The split point is EXACTLY on the edge here, so the ring is still exact.
        expect(res.quality.maxOffset_m).toBe(0);
    });

    it('an EXACT tiling is never touched — same ring, and `quality.path === exact`', () => {
        // The load-bearing guarantee: a block that already produced a compliance number must keep
        // producing the SAME one. Applying the repair unconditionally would have changed 137 of
        // 607 real rings, and a silently moved profunditat edificable is the worst outcome here.
        const res = dissolveParcelsToBlockRing([rect(0, 0, 10, 10), rect(10, 0, 20, 10)]);
        expect(res.quality).toEqual({ path: 'exact', splitCount: 0, maxOffset_m: 0, tolerance_m: 0 });
    });

    it('splits at a vertex sitting OFF the line, within the tolerance, and reports the offset', () => {
        // The real shape of the defect: the shared vertex is displaced by a coordinate rounding,
        // so it is near-collinear rather than collinear.
        const off = 0.04; // < 0.10 m, and ≈ the median measured offset
        const left: Pt[] = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 20 }, { x: 0, z: 20 }];
        const lowerRight: Pt[] = [
            { x: 10, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 10 }, { x: 10 - off, z: 10 },
        ];
        const upperRight: Pt[] = [
            { x: 10 - off, z: 10 }, { x: 20, z: 10 }, { x: 20, z: 20 }, { x: 10, z: 20 },
        ];
        const res = dissolveParcelsToBlockRing([left, lowerRight, upperRight]);
        expect(res.degenerate).toBe(false);
        expect(res.quality.path).toBe('t-junction-split');
        expect(res.quality.maxOffset_m).toBeCloseTo(off, 6);
        // Area is the true 400 m² minus the hair-thin notch the displaced vertex cuts — bounded
        // by the tolerance times the edge, i.e. cadastrally invisible.
        expect(polygonArea(res.ring)).toBeGreaterThan(399.5);
        expect(polygonArea(res.ring)).toBeLessThanOrEqual(400);
    });

    it('REFUSES when the vertex is further off the line than the tolerance', () => {
        // 0.3 m is where the measured distribution says real, unrelated geometry lives. Repairing
        // there would be inventing a boundary rather than recovering one.
        const left: Pt[] = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 20 }, { x: 0, z: 20 }];
        const lowerRight: Pt[] = [{ x: 10, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 10 }, { x: 9.7, z: 10 }];
        const upperRight: Pt[] = [{ x: 9.7, z: 10 }, { x: 20, z: 10 }, { x: 20, z: 20 }, { x: 10, z: 20 }];
        const res = dissolveParcelsToBlockRing([left, lowerRight, upperRight]);
        expect(res.degenerate).toBe(true);
        expect(res.reason).toBe('open-or-disjoint');
    });

    it('never splits an edge shorter than 2× the tolerance — even a genuine T-junction on it', () => {
        // The structural safety that stops the tolerance from reshaping the smallest features in
        // the data (0.6 % of real parcel edges are under 0.1 m — themselves artefacts of the same
        // coordinate rounding). The identical configuration on a LONGER shared edge is repaired
        // in the control below, so this asserts the length rule and nothing else.
        const shared = (w: number): Pt[][] => [
            [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: 10 }, { x: 0, z: 10 }],
            [{ x: 0, z: 0 }, { x: w / 2, z: 0.004 }, { x: w, z: 0 }, { x: w, z: -10 }, { x: 0, z: -10 }],
        ];
        const short = dissolveParcelsToBlockRing(shared(2 * TJUNCTION_SPLIT_TOLERANCE_M - 0.01));
        expect(short.degenerate).toBe(true);
        expect(short.quality.splitCount).toBe(0);

        const long = dissolveParcelsToBlockRing(shared(1));
        expect(long.degenerate).toBe(false);
        expect(long.quality.splitCount).toBe(1);
    });

    it('DISJOINT parcels still refuse — the repair cannot bridge a real gap', () => {
        const res = dissolveParcelsToBlockRing([rect(0, 0, 10, 10), rect(50, 50, 60, 60)]);
        expect(res.degenerate).toBe(true);
        expect(res.reason).toBe('open-or-disjoint');
    });

    it('OVERLAPPING parcels are never repaired — non-manifold is a wrong input, not an artefact', () => {
        const res = dissolveParcelsToBlockRing([
            rect(0, 0, 10, 10), rect(0, 10, 10, 20), rect(0, 10, 10, 20),
        ]);
        expect(res.degenerate).toBe(true);
        expect(res.reason).toBe('non-manifold');
        expect(res.quality.path).toBe('exact');
    });

    it('is INPUT-ORDER independent on the repaired path too (C58 §1.1)', () => {
        const parcels = [rect(0, 0, 10, 20), rect(10, 0, 20, 10), rect(10, 10, 20, 20)];
        const a = dissolveParcelsToBlockRing(parcels);
        const b = dissolveParcelsToBlockRing([parcels[2]!, parcels[0]!, parcels[1]!]);
        expect(JSON.stringify(a.ring)).toBe(JSON.stringify(b.ring));
        expect(a.quality).toEqual(b.quality);
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// REAL CADASTRAL GEOMETRY. Following the L-529 precedent: synthetic shapes did not reproduce that
// bug and the regression test that pinned it used the real 58-vertex ring. These two manzanas are
// live Catastro INSPIRE geometry (Córdoba, fetched 2026-07-21), projected with the production
// `latLonToSceneXZ` about the first parcel's first vertex and rounded to 0.1 mm. Both carry the
// published cadastral areas, which are an INDEPENDENT check: "the chain closed" is not the same
// claim as "the ring is the block".
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('L-539 — real Catastro manzanas', () => {
    /** Córdoba manzana 32598 — 6 parcels, 4,162 m² published. The exact pass REFUSES it. */
    const CORDOBA_32598: Pt[][] = [
        [{ x: 0, z: 0 }, { x: 30.8337, z: -16.5866 }, { x: 40.2332, z: 0.2226 }, { x: 7.7304, z: 17.8111 }, { x: 5.6221, z: 13.9149 }, { x: 4.4801, z: 11.7999 }, { x: 1.8448, z: 13.3583 }, { x: -4.3044, z: 2.2264 }, { x: 0, z: 0 }],
        // NB the doubled vertex below is IN THE SOURCE DATA — a real published zero-length edge.
        [{ x: 7.7304, z: 17.8111 }, { x: 40.2332, z: 0.2226 }, { x: 40.2332, z: 0.2226 }, { x: 49.8084, z: 17.5885 }, { x: 39.7061, z: 23.2658 }, { x: 17.4812, z: 35.6222 }, { x: 13.2647, z: 27.9412 }, { x: 9.9265, z: 21.9299 }, { x: 7.7304, z: 17.8111 }],
        [{ x: 52.0923, z: 21.596 }, { x: 59.2957, z: 34.7317 }, { x: 26.705, z: 52.6541 }, { x: 17.4812, z: 35.6222 }, { x: 39.7061, z: 23.2658 }, { x: 49.8084, z: 17.5885 }, { x: 52.0923, z: 21.596 }],
        [{ x: 13.2647, z: 27.9412 }, { x: 17.4812, z: 35.6222 }, { x: 26.705, z: 52.6541 }, { x: -2.7232, z: 68.7954 }, { x: -16.2514, z: 44.1938 }, { x: -3.2503, z: 36.9581 }, { x: 13.2647, z: 27.9412 }],
        [{ x: 4.4801, z: 11.7999 }, { x: 5.6221, z: 13.9149 }, { x: 7.7304, z: 17.8111 }, { x: 9.9265, z: 21.9299 }, { x: 13.2647, z: 27.9412 }, { x: -3.2503, z: 36.9581 }, { x: -16.2514, z: 44.1938 }, { x: -21.3464, z: 34.843 }, { x: -24.8603, z: 28.4978 }, { x: -11.8591, z: 21.0394 }, { x: 4.4801, z: 11.7999 }],
        [{ x: -28.8133, z: 15.4734 }, { x: -7.0276, z: 3.6735 }, { x: -5.095, z: 2.6717 }, { x: -4.3044, z: 2.2264 }, { x: 1.8448, z: 13.3583 }, { x: 1.0541, z: 13.8036 }, { x: -0.8785, z: 14.8055 }, { x: -11.8591, z: 21.0394 }, { x: -22.4884, z: 27.0506 }, { x: -24.8603, z: 28.4978 }, { x: -24.8603, z: 28.3865 }, { x: -31.273, z: 16.8092 }, { x: -28.8133, z: 15.4734 }],
    ];
    const CORDOBA_32598_AREA_M2 = 4162;

    /** Córdoba manzana 44559 — 6 parcels, 1,783 m². The exact pass ALREADY dissolves it. */
    const CORDOBA_44559: Pt[][] = [
        [{ x: 0, z: 0 }, { x: 14.0561, z: -7.4584 }, { x: 21.8747, z: 6.7905 }, { x: 7.8187, z: 14.1376 }, { x: 0, z: 0 }],
        [{ x: -7.9944, z: -14.1376 }, { x: -0.9664, z: -17.8111 }, { x: 6.0617, z: -21.596 }, { x: 8.0822, z: -18.0338 }, { x: 14.0561, z: -7.4584 }, { x: 0, z: 0 }, { x: -7.9944, z: -14.1376 }],
        [{ x: -15.9009, z: -28.2752 }, { x: -1.9327, z: -35.9562 }, { x: 6.0617, z: -21.596 }, { x: -0.9664, z: -17.8111 }, { x: -7.9944, z: -14.1376 }, { x: -9.9271, z: -17.6998 }, { x: -15.9009, z: -28.2752 }],
        [{ x: -23.8953, z: -42.7467 }, { x: -9.7514, z: -50.0938 }, { x: -1.9327, z: -35.9562 }, { x: -15.9009, z: -28.2752 }, { x: -18.8, z: -33.6185 }, { x: -23.8953, z: -42.7467 }],
        [{ x: -22.5775, z: -62.005 }, { x: -17.9215, z: -64.5653 }, { x: -9.7514, z: -50.0938 }, { x: -23.8953, z: -42.7467 }, { x: -31.8897, z: -56.9956 }, { x: -26.2673, z: -60.0012 }, { x: -22.5775, z: -62.005 }],
        [{ x: -22.5775, z: -62.005 }, { x: -26.2673, z: -60.0012 }, { x: -31.8897, z: -56.9956 }, { x: -32.9439, z: -58.888 }, { x: -34.8766, z: -62.2276 }, { x: -36.6336, z: -65.0106 }, { x: -38.0392, z: -67.1257 }, { x: -39.6205, z: -69.5747 }, { x: -41.2897, z: -72.3577 }, { x: -43.8373, z: -76.1425 }, { x: -45.3308, z: -78.3689 }, { x: -46.385, z: -79.9274 }, { x: -41.6411, z: -84.3802 }, { x: -33.2074, z: -92.2839 }, { x: -17.9215, z: -64.5653 }, { x: -22.5775, z: -62.005 }],
    ];
    const CORDOBA_44559_AREA_M2 = 1783;

    it('32598: refused before L-539, dissolves after — and the ring matches the PUBLISHED area', () => {
        const before = dissolveParcelsToBlockRing(CORDOBA_32598, { repairTJunctions: false });
        expect(before.degenerate).toBe(true);
        expect(before.reason).toBe('open-or-disjoint');

        const after = dissolveParcelsToBlockRing(CORDOBA_32598);
        expect(after.degenerate).toBe(false);
        expect(after.quality.path).toBe('t-junction-split');
        expect(after.quality.splitCount).toBe(4);
        // Every applied split sits inside the tolerance, which is inside Catastro's own 0.111 m
        // north coordinate quantum — the repair cannot add an error the input does not have.
        expect(after.quality.maxOffset_m).toBeLessThanOrEqual(TJUNCTION_SPLIT_TOLERANCE_M);
        expect(after.quality.maxOffset_m).toBeCloseTo(0.075, 3);

        // THE INDEPENDENT CHECK. Agreement with the sum of the six published parcel areas is not
        // something edge-cancellation can fake: a ring that closed around the wrong loop, or that
        // swallowed a neighbour, would miss by tens of percent.
        expect(polygonArea(after.ring)).toBeGreaterThan(CORDOBA_32598_AREA_M2 * 0.99);
        expect(polygonArea(after.ring)).toBeLessThan(CORDOBA_32598_AREA_M2 * 1.01);

        // C19 §7.3 vertex budget — a repaired ring must not arrive bloated with split points.
        expect(after.ring.length).toBeLessThanOrEqual(50);
    });

    it('44559: already dissolved, and L-539 leaves it BYTE-IDENTICAL', () => {
        // The regression that matters most. If this ever fails, a shipped compliance number moved.
        const before = dissolveParcelsToBlockRing(CORDOBA_44559, { repairTJunctions: false });
        const after = dissolveParcelsToBlockRing(CORDOBA_44559);
        expect(before.degenerate).toBe(false);
        expect(JSON.stringify(after.ring)).toBe(JSON.stringify(before.ring));
        expect(after.quality.path).toBe('exact');
        expect(polygonArea(after.ring)).toBeGreaterThan(CORDOBA_44559_AREA_M2 * 0.99);
        expect(polygonArea(after.ring)).toBeLessThan(CORDOBA_44559_AREA_M2 * 1.01);
    });

    it('both are deterministic under parcel reordering', () => {
        const shuffle = <T,>(a: T[]) => [a[3]!, a[0]!, a[5]!, a[1]!, a[4]!, a[2]!];
        for (const parcels of [CORDOBA_32598, CORDOBA_44559]) {
            const a = dissolveParcelsToBlockRing(parcels);
            const b = dissolveParcelsToBlockRing(shuffle(parcels));
            expect(JSON.stringify(b.ring)).toBe(JSON.stringify(a.ring));
            expect(b.quality).toEqual(a.quality);
        }
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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §DISSOLVE-INTERIOR-VOID (L-586)
//
// A perimeter that chains into several loops is not one failure but four, and the SIGN of the
// area identity is what tells them apart (see the module header). Census over the same 956 real
// manzanas: 233 multi-loop, of which 83 are holes, 74 interior overlaps, 11 detached fragments and
// 65 satisfy neither identity. Only the 83 may be recovered — and the bias of this block of tests
// is again deliberate: three of its five cases assert a REFUSAL.
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('L-586 §DISSOLVE-INTERIOR-VOID — a hole in a tiling is not a broken tiling', () => {
    /** Four parcels tiling a 30×30 block around a 10×10 unparcelled courtyard. */
    const RING_OF_FOUR: Pt[][] = [
        rect(0, 0, 30, 10),   // south band
        rect(0, 20, 30, 30),  // north band
        rect(0, 10, 10, 20),  // west jamb
        rect(20, 10, 30, 20), // east jamb
    ];

    it('returns the OUTER loop as the ring and the courtyard as a void', () => {
        const res = dissolveParcelsToBlockRing(RING_OF_FOUR);
        expect(res.degenerate).toBe(false);
        expect(res.reason).toBeNull();
        expect(polygonArea(res.ring)).toBeCloseTo(900, 6);
        expect(res.voids).toHaveLength(1);
        expect(polygonArea(res.voids[0]!)).toBeCloseTo(100, 6);
        // The identity that licenses the whole thing, restated as an assertion.
        const parcelSum = RING_OF_FOUR.reduce((s, r) => s + polygonArea(r), 0);
        expect(polygonArea(res.ring) - polygonArea(res.voids[0]!)).toBeCloseTo(parcelSum, 6);
    });

    it('is deterministic under parcel reordering — same ring AND same voids', () => {
        const a = dissolveParcelsToBlockRing(RING_OF_FOUR);
        const b = dissolveParcelsToBlockRing([RING_OF_FOUR[2]!, RING_OF_FOUR[0]!, RING_OF_FOUR[3]!, RING_OF_FOUR[1]!]);
        expect(JSON.stringify(b.ring)).toBe(JSON.stringify(a.ring));
        expect(JSON.stringify(b.voids)).toBe(JSON.stringify(a.voids));
    });

    it('every ring that is NOT hole-punched reports `voids: []`, never undefined', () => {
        // C58 §1.4 — the absence of a void must be a stated fact, not an absent field.
        const res = dissolveParcelsToBlockRing([rect(0, 0, 10, 10), rect(10, 0, 20, 10)]);
        expect(res.degenerate).toBe(false);
        expect(res.voids).toEqual([]);
        expect(dissolveParcelsToBlockRing([]).voids).toEqual([]);
    });

    it('REFUSES two disjoint blocks — the identity ADDS, so they are not one block with a hole', () => {
        // 10×10 at the origin and another 40 m away. Both loops are perfectly valid polygons and
        // the old multi-loop test would have refused this too; the point is that the NEW path must
        // not start accepting it just because it can now enumerate several loops.
        const res = dissolveParcelsToBlockRing([rect(0, 0, 10, 10), rect(40, 0, 60, 20)]);
        expect(res.degenerate).toBe(true);
        expect(res.reason).toBe('open-or-disjoint');
        expect(res.voids).toEqual([]);
    });

    it('REFUSES a detached fragment sitting inside the outline\'s bounding box', () => {
        // The Barcelona 06276 shape: a big block plus a small separate piece. It is caught by the
        // identity (Σ|parcels| == |outer| + |small|), not by any distance heuristic.
        const res = dissolveParcelsToBlockRing([
            rect(0, 0, 100, 100), rect(120, 40, 124, 44),
        ]);
        expect(res.degenerate).toBe(true);
        expect(res.reason).toBe('open-or-disjoint');
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §DISSOLVE-SIMPLICITY-GATE (L-586)
//
// An independent oracle (ring area vs PUBLISHED cadastral parcel areas) found 11 of the 874 rings
// this module emitted over the 956-manzana sample to be SELF-INTERSECTING. Each closed, each had
// every vertex at degree 2, and each matched the published area to 0.00% — nothing in the
// acceptance path could see them. They are zero-area "antennas": a boundary stored twice with
// mismatched endpoints, walked out and back along two near-collinear legs that cross near the base.
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('L-586 §DISSOLVE-SIMPLICITY-GATE — closed is not the same as simple', () => {
    it('refuses a ring that closes but crosses itself, with its own reason', () => {
        // A bow-tie: one "parcel" whose ring is a figure of eight. Every vertex has degree 2, the
        // chain closes in exactly four steps, and |area| is a perfectly plausible 200 m² — the
        // exact shape of defect the area oracle cannot catch.
        const bowtie: Pt[] = [
            { x: 0, z: 0 }, { x: 20, z: 20 }, { x: 20, z: 0 }, { x: 0, z: 20 },
        ];
        const res = dissolveParcelsToBlockRing([bowtie]);
        expect(res.degenerate).toBe(true);
        expect(res.reason).toBe('self-intersecting');
        expect(res.ring).toEqual([]);
        expect(res.voids).toEqual([]);
    });

    it('does NOT refuse an ordinary convex or reflex block', () => {
        // The gate must be incapable of rejecting geometry that has always been fine, including an
        // L-shaped block whose reflex corner is the case a sloppy test would trip on.
        const lShaped = dissolveParcelsToBlockRing([rect(0, 0, 30, 10), rect(0, 10, 10, 30)]);
        expect(lShaped.degenerate).toBe(false);
        expect(polygonArea(lShaped.ring)).toBeCloseTo(500, 6);
        expect(dissolveParcelsToBlockRing([rect(0, 0, 10, 10)]).degenerate).toBe(false);
    });

    it('a crossed exact ring is handed to the T-junction repair before being refused', () => {
        // §DISSOLVE-SIMPLICITY-GATE admits `self-intersecting` to the repairable set precisely so a
        // crossed ring gets the repair the exact pass's false success used to deny it. Measured on
        // the 11 crossed rings in the sample: 7 recover, 4 are refused. This asserts the WIRING —
        // that a crossed result is not short-circuited straight to a refusal.
        const bowtie: Pt[] = [{ x: 0, z: 0 }, { x: 20, z: 20 }, { x: 20, z: 0 }, { x: 0, z: 20 }];
        const repaired = dissolveParcelsToBlockRing([bowtie]);
        const unrepaired = dissolveParcelsToBlockRing([bowtie], { repairTJunctions: false });
        // Neither can be rescued here (there is no neighbour vertex to split on), but both must
        // report the SAME honest reason rather than one of them silently reporting the other's.
        expect(repaired.reason).toBe('self-intersecting');
        expect(unrepaired.reason).toBe('self-intersecting');
    });
});
