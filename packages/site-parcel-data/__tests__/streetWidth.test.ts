// L-537 — measuring the *amplada de vial* from block + neighbouring-parcel geometry.
//
// The value under test becomes a BUILDING HEIGHT through a stepped table, so the assertions target
// the ways a measurement can be confidently wrong rather than merely absent:
//   • it must measure OUTWARD (a normal flipped by a winding change would measure our own block);
//   • it must refuse a face with nothing across it instead of reporting the search limit;
//   • it must refuse an abutting neighbour instead of reporting a party wall as a 0.5 m street;
//   • it must refuse a non-parallel opposing frontage instead of averaging two different streets;
//   • it must report its own error bar, because the quantiser is only allowed to snap within it.
//
// Frames are synthetic and exact so a failure means the algorithm changed, not that a fixture did.

import { describe, it, expect } from 'vitest';
import {
    measureStreetWidths,
    governingStreetWidth,
    blockEdgesFacingParcel,
} from '../src/geometry/streetWidth.js';

type P = { x: number; z: number };
const rect = (x0: number, z0: number, x1: number, z1: number): P[] => [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
];

/** A 100 × 100 block at the origin, with a facing block across a street of the given width on
 *  each of the four sides. The canonical Cerdà-like case, built exactly. */
function withStreets(w: number): { block: P[]; foreign: P[][] } {
    return {
        block: rect(0, 0, 100, 100),
        foreign: [
            rect(0, -100 - w, 100, -w), // north of z=0
            rect(0, 100 + w, 100, 200 + w), // south of z=100
            rect(-100 - w, 0, -w, 100), // west of x=0
            rect(100 + w, 0, 200 + w, 100), // east of x=100
        ],
    };
}

describe('L-537 — measureStreetWidths', () => {
    it('measures every face of a block surrounded by streets of a known width', () => {
        const { block, foreign } = withStreets(20);
        const r = measureStreetWidths(block, foreign);
        expect(r.measurements).toHaveLength(4);
        for (const m of r.measurements) {
            expect(m.width_m).toBeCloseTo(20, 6);
            // Parallel frontages ⇒ zero spread. Any spread here would mean the sampling itself
            // introduces error, which would then be laundered into the snap tolerance.
            expect(m.spread_m).toBeCloseTo(0, 9);
        }
    });

    it('measures OUTWARD regardless of ring winding', () => {
        // A silent winding flip upstream must not turn the measurement into a diagonal across our
        // OWN block — that would be a plausible-looking wrong number, the one outcome forbidden
        // here. The outward normal is therefore established by a containment probe, not by winding.
        const { block, foreign } = withStreets(30);
        const cw = measureStreetWidths([...block].reverse(), foreign);
        expect(cw.measurements).toHaveLength(4);
        for (const m of cw.measurements) expect(m.width_m).toBeCloseTo(30, 6);
    });

    it('refuses a face with nothing across it rather than reporting the search limit', () => {
        // The search limit is an implementation constant. Reporting it as a width would put an
        // 80 m "street" into the top height band on a block facing a park or the sea.
        const r = measureStreetWidths(rect(0, 0, 100, 100), [rect(0, -100 - 20, 100, -20)]);
        expect(r.measurements.map((m) => m.edgeIndex)).toEqual([0]);
        expect(r.rejected.filter((x) => x.reason === 'no-opposing-frontage')).toHaveLength(3);
    });

    it('refuses an ABUTTING neighbour — a party wall is not a street', () => {
        // Two manzanas that touch have no street between them. Reporting the sliver as a width
        // would land in the narrowest band and produce a PB+1 building on a real city block.
        const r = measureStreetWidths(rect(0, 0, 100, 100), [rect(0, -100, 100, -0.2)]);
        expect(r.measurements).toHaveLength(0);
        expect(r.rejected.some((x) => x.edgeIndex === 0 && x.reason === 'abutting-not-street')).toBe(true);
    });

    it('refuses a NON-PARALLEL opposing frontage instead of averaging two streets', () => {
        // A frontage that recedes across the edge has no single width. Averaging it would put a
        // number with a ±10 m error into a table whose bands are 3–5 m wide.
        const opposing: P[] = [
            { x: 0, z: -15 },
            { x: 100, z: -45 },
            { x: 100, z: -140 },
            { x: 0, z: -140 },
        ];
        const r = measureStreetWidths(rect(0, 0, 100, 100), [opposing]);
        expect(r.rejected.some((x) => x.edgeIndex === 0 && x.reason === 'inconsistent')).toBe(true);
        expect(r.measurements.some((m) => m.edgeIndex === 0)).toBe(false);
    });

    it('reports a spread that reflects real frontage irregularity', () => {
        // The spread IS the error bar the quantiser is allowed to snap within, so it must track
        // the geometry rather than being a constant.
        const opposing: P[] = [
            { x: 0, z: -20 },
            { x: 100, z: -22 },
            { x: 100, z: -140 },
            { x: 0, z: -140 },
        ];
        const r = measureStreetWidths(rect(0, 0, 100, 100), [opposing]);
        const m = r.measurements.find((x) => x.edgeIndex === 0);
        expect(m).toBeDefined();
        expect(m!.spread_m).toBeGreaterThan(1);
        expect(m!.spread_m).toBeLessThan(2);
    });

    it('skips short corner chamfers rather than measuring across them', () => {
        // A 2 m chamfer looks down two streets at once; a width taken there is meaningless.
        const block: P[] = [
            { x: 0, z: 0 },
            { x: 98, z: 0 },
            { x: 100, z: 2 },
            { x: 100, z: 100 },
            { x: 0, z: 100 },
        ];
        const r = measureStreetWidths(block, withStreets(20).foreign);
        expect(r.rejected.some((x) => x.reason === 'edge-too-short')).toBe(true);
    });

    it('returns empty (never throws) for degenerate input', () => {
        expect(measureStreetWidths([], []).measurements).toEqual([]);
        expect(measureStreetWidths([{ x: 0, z: 0 }, { x: 1, z: 0 }], []).measurements).toEqual([]);
        expect(measureStreetWidths(rect(0, 0, 100, 100), []).measurements).toEqual([]);
    });

    it('is deterministic and order-independent in the opposing parcels (C58 §1.1)', () => {
        const { block, foreign } = withStreets(20);
        expect(measureStreetWidths(block, foreign)).toEqual(
            measureStreetWidths(block, [...foreign].reverse()),
        );
    });
});

describe('L-537 — blockEdgesFacingParcel', () => {
    // A 100 × 100 block; the parcel occupies the strip along its NORTH edge only (edge 0).
    const block = rect(0, 0, 100, 100);

    it('returns only the block edges the parcel actually lies on', () => {
        // Taking the narrowest street around the WHOLE block would under-build a parcel that fronts
        // only the wide artery — wrong in the safe direction is still wrong.
        expect(blockEdgesFacingParcel(block, rect(30, 0, 60, 25))).toEqual([0]);
    });

    it('returns BOTH edges for a corner parcel', () => {
        // The corner case Art. 327 resolves per façade; the caller then applies its own policy.
        expect(blockEdgesFacingParcel(block, rect(0, 0, 25, 25)).sort()).toEqual([0, 3]);
    });

    it('finds a parcel sitting at the far END of a long block edge', () => {
        // Sampling along the edge, not only at its midpoint: a block edge is usually longer than
        // one parcel, so a midpoint-only test would silently miss most parcels on it.
        expect(blockEdgesFacingParcel(block, rect(88, 0, 100, 20))).toContain(0);
    });

    it('returns [] for an interior parcel touching no perimeter — caller must not guess', () => {
        expect(blockEdgesFacingParcel(block, rect(40, 40, 60, 60))).toEqual([]);
    });
});

describe('L-537 — governingStreetWidth', () => {
    it('takes the NARROWEST street, the conservative answer on a corner', () => {
        // Art. 327 resolves height per façade, so a corner parcel has two answers. The narrower
        // street gives the LOWER height: on a compliance path the error that costs a redesign is
        // always preferable to the one that costs an illegal building.
        const block = rect(0, 0, 100, 100);
        const foreign = [
            rect(0, -100 - 20, 100, -20), // 20 m to the north
            rect(-100 - 40, 0, -40, 100), // 40 m to the west
        ];
        const r = measureStreetWidths(block, foreign);
        expect(governingStreetWidth(r)!.width_m).toBeCloseTo(20, 6);
    });

    it('restricts to the caller-supplied façade edges when given', () => {
        const block = rect(0, 0, 100, 100);
        const foreign = [rect(0, -120, 100, -20), rect(-140, 0, -40, 100)];
        const r = measureStreetWidths(block, foreign);
        const west = r.measurements.find((m) => Math.abs(m.width_m - 40) < 1e-6)!;
        expect(governingStreetWidth(r, [west.edgeIndex])!.width_m).toBeCloseTo(40, 6);
    });

    it('returns null when nothing was measurable — never a default', () => {
        expect(governingStreetWidth({ measurements: [], rejected: [] })).toBeNull();
    });
});
