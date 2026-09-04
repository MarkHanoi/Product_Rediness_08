// §L-619 / DK G2 — BYGGELINJER → parcel-edge matching, measured by geometry alone.
//
// THE FAILURE THESE TESTS EXIST TO PREVENT
// ----------------------------------------
// Plandata publishes a byggelinje as a bare line with NO stated binding and NO stated distance. The
// tempting shortcut is to assume an orientation ("the front is the north edge") and hand back a
// front-setback number. On a Copenhagen karré the frontage points whichever way the street runs, so
// that assumption fabricates a legal setback. Every test below therefore checks the SAME parcel and
// the SAME line under ROTATION: the match must be invariant, because the only inputs that may
// decide it are direction and proximity.
//
// The second failure class: a line that is parallel to nothing must match NOTHING (`null`), not the
// least-bad edge. An honest "this line governs no identifiable edge" is the C58 §1.4 answer.

import { describe, it, expect } from 'vitest';
import type { ParcelEdgeClassification, Pt } from '@pryzm/schemas';
import {
    matchBuildingLineToParcelEdge,
    inwardEdgeNormal,
    signedDepthAlongNormal,
    lineParallelToEdge,
    firstFrontEdgeIndex,
} from '../src/index.js';

/** CCW rectangle: edge 0 = south (z=z0), 1 = east, 2 = north, 3 = west. */
function rect(x0: number, z0: number, x1: number, z1: number): Pt[] {
    return [
        { x: x0, z: z0 },
        { x: x1, z: z0 },
        { x: x1, z: z1 },
        { x: x0, z: z1 },
    ];
}

/** Rotate a point set about the origin by `deg` — the invariance harness. */
function rotate(pts: readonly Pt[], deg: number): Pt[] {
    const a = (deg * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return pts.map((p) => ({ x: p.x * c - p.z * s, z: p.x * s + p.z * c }));
}

/** A 40 × 28 m parcel — the founder's ~1,116 m² Copenhagen karré plot, near enough. */
const PARCEL = rect(0, 0, 40, 28);
/** A byggelinje 4 m inside the south (edge 0) frontage, running its full width. */
const LINE_4M_FROM_SOUTH: Pt[] = [
    { x: 0, z: 4 },
    { x: 40, z: 4 },
];
/** A second line 16 m in — with the first, these two bound a 12 m building band. */
const LINE_16M_FROM_SOUTH: Pt[] = [
    { x: 0, z: 16 },
    { x: 40, z: 16 },
];

const ROTATIONS = [0, 17, 45, 90, 133, 180, 271, 359];

describe('matchBuildingLineToParcelEdge — matches by geometry, invariant under rotation', () => {
    it('matches the line to the edge it runs along, and MEASURES the offset (4 m)', () => {
        const m = matchBuildingLineToParcelEdge(PARCEL, LINE_4M_FROM_SOUTH);
        expect(m).not.toBeNull();
        expect(m!.edgeIndex).toBe(0); // the south edge, which the line parallels at 4 m
        expect(m!.offsetM).toBeCloseTo(4, 9);
        expect(m!.parallelism).toBeCloseTo(1, 9);
    });

    it('returns the SAME edge and the SAME measured offset at every parcel orientation', () => {
        // This is the whole point: no `front = north`. Rotating the world must not move the answer.
        for (const deg of ROTATIONS) {
            const m = matchBuildingLineToParcelEdge(rotate(PARCEL, deg), rotate(LINE_4M_FROM_SOUTH, deg));
            expect(m, `rotation ${deg}°`).not.toBeNull();
            expect(m!.edgeIndex, `rotation ${deg}°`).toBe(0);
            expect(m!.offsetM, `rotation ${deg}°`).toBeCloseTo(4, 6);
        }
    });

    it('prefers the NEARER of two parallel candidate edges (4 m south, not 24 m north)', () => {
        // Both the south and north edges are parallel to the line; only proximity separates them,
        // and picking the far one would silently double the implied depth.
        const m = matchBuildingLineToParcelEdge(PARCEL, LINE_4M_FROM_SOUTH);
        expect(m!.edgeIndex).toBe(0);
        const far = matchBuildingLineToParcelEdge(PARCEL, LINE_16M_FROM_SOUTH);
        // 16 m from south vs 12 m from north — the north edge (index 2) is now nearer.
        expect(far!.edgeIndex).toBe(2);
        expect(far!.offsetM).toBeCloseTo(12, 9);
    });

    it('returns NULL for a line parallel to no edge — never a forced least-bad match', () => {
        const diagonal: Pt[] = [
            { x: 0, z: 0 },
            { x: 40, z: 28 },
        ];
        // ~35° from both edge directions — outside the 20° default tolerance on every edge.
        expect(matchBuildingLineToParcelEdge(PARCEL, diagonal)).toBeNull();
    });

    it('honours a widened angle tolerance rather than hard-coding 20°', () => {
        const diagonal: Pt[] = [
            { x: 0, z: 0 },
            { x: 40, z: 28 },
        ];
        const m = matchBuildingLineToParcelEdge(PARCEL, diagonal, {
            maxAngleRad: (60 * Math.PI) / 180,
        });
        expect(m).not.toBeNull();
    });

    it('returns NULL (never throws) on degenerate input', () => {
        expect(matchBuildingLineToParcelEdge([], LINE_4M_FROM_SOUTH)).toBeNull();
        expect(matchBuildingLineToParcelEdge(PARCEL, [{ x: 1, z: 1 }])).toBeNull();
        // A zero-length "line" has no direction to match on.
        expect(
            matchBuildingLineToParcelEdge(PARCEL, [
                { x: 5, z: 5 },
                { x: 5, z: 5 },
            ]),
        ).toBeNull();
    });

    it('matches a POLYLINE byggelinje on its overall first→last direction', () => {
        const polyline: Pt[] = [
            { x: 0, z: 4 },
            { x: 20, z: 4.05 },
            { x: 40, z: 4 },
        ];
        const m = matchBuildingLineToParcelEdge(PARCEL, polyline);
        expect(m!.edgeIndex).toBe(0);
        expect(m!.offsetM).toBeCloseTo(4.0167, 3); // the centroid's perpendicular distance
    });
});

describe('inwardEdgeNormal — points INTO the parcel regardless of winding', () => {
    it('gives the interior normal for a CCW ring', () => {
        const n = inwardEdgeNormal(PARCEL, 0);
        expect(n).not.toBeNull();
        expect(n!.x).toBeCloseTo(0, 9);
        expect(n!.z).toBeCloseTo(1, 9); // south edge → interior is +z
    });

    it('gives the SAME interior normal for the reversed (CW) ring — winding-agnostic', () => {
        const cw = [...PARCEL].reverse();
        // In the reversed ring the south edge is the one from (40,0) to (0,0) — index 2.
        const n = inwardEdgeNormal(cw, 2);
        expect(n!.x).toBeCloseTo(0, 9);
        expect(n!.z).toBeCloseTo(1, 9);
    });

    it('returns NULL on a degenerate ring', () => {
        expect(inwardEdgeNormal([{ x: 0, z: 0 }], 0)).toBeNull();
    });

    // ⚠ REGRESSION, 2026-09-04 (lane ENVELOPE-NLDK). The side used to be chosen by testing both
    // candidate normals against the ring's VERTEX CENTROID. That is sound only for a CONVEX ring.
    // This U-shaped parcel's vertex centroid is (15, 17.5), which lies in the NOTCH — outside the
    // polygon — so the centroid test returned the OUTWARD normal for the notch's bottom edge, with
    // no error raised. A flipped normal puts a byggelinje / achtererfgebied line on the wrong side of
    // the building and yields a plausible, wrong buildable area (the L-616 shape). Courtyard blocks
    // and flag lots are non-convex as a matter of course, so this is a live case, not a curiosity.
    const U_PARCEL: Pt[] = [
        { x: 0, z: 0 },
        { x: 30, z: 0 },
        { x: 30, z: 30 },
        { x: 20, z: 30 },
        { x: 20, z: 10 },
        { x: 10, z: 10 },
        { x: 10, z: 30 },
        { x: 0, z: 30 },
    ];

    it('a NON-CONVEX ring whose centroid falls OUTSIDE it still gets the interior normal', () => {
        // edge 4 = (20,10) → (10,10), the bottom of the notch; the interior lies BELOW it (−z).
        const n = inwardEdgeNormal(U_PARCEL, 4);
        expect(n).not.toBeNull();
        expect(n!.x).toBeCloseTo(0, 9);
        expect(n!.z).toBeCloseTo(-1, 9);
        // and the outer south edge still points +z
        const s = inwardEdgeNormal(U_PARCEL, 0)!;
        expect(s.z).toBeCloseTo(1, 9);
    });

    it('the non-convex answer is identical under the reversed winding', () => {
        const cw = [...U_PARCEL].reverse();
        const m = U_PARCEL.length;
        const rev = (i: number): number => ((m - 2 - i) % m + m) % m; // edge i runs vertex i → i+1
        const n = inwardEdgeNormal(cw, rev(4));
        expect(n!.x).toBeCloseTo(0, 9);
        expect(n!.z).toBeCloseTo(-1, 9);
        const s = inwardEdgeNormal(cw, rev(0))!;
        expect(s.z).toBeCloseTo(1, 9);
    });
});

describe('signedDepthAlongNormal — the primitive that turns two lines into a band depth', () => {
    it('measures each byggelinje as a depth into the parcel, so the band is 12 m', () => {
        const n = inwardEdgeNormal(PARCEL, 0)!;
        const a = PARCEL[0]!;
        const dFacade = signedDepthAlongNormal(LINE_4M_FROM_SOUTH[0]!, a, n);
        const dRear = signedDepthAlongNormal(LINE_16M_FROM_SOUTH[0]!, a, n);
        expect(dFacade).toBeCloseTo(4, 9);
        expect(dRear).toBeCloseTo(16, 9);
        expect(dRear - dFacade).toBeCloseTo(12, 9); // a typical Danish karré building depth
    });

    it('is 0 on the edge itself and NEGATIVE outside the parcel', () => {
        const n = inwardEdgeNormal(PARCEL, 0)!;
        const a = PARCEL[0]!;
        expect(signedDepthAlongNormal({ x: 20, z: 0 }, a, n)).toBeCloseTo(0, 9);
        expect(signedDepthAlongNormal({ x: 20, z: -3 }, a, n)).toBeCloseTo(-3, 9);
    });

    it('is rotation-invariant (the measured band depth does not depend on north)', () => {
        for (const deg of ROTATIONS) {
            const p = rotate(PARCEL, deg);
            const l1 = rotate(LINE_4M_FROM_SOUTH, deg);
            const l2 = rotate(LINE_16M_FROM_SOUTH, deg);
            const n = inwardEdgeNormal(p, 0)!;
            const depth =
                signedDepthAlongNormal(l2[0]!, p[0]!, n) - signedDepthAlongNormal(l1[0]!, p[0]!, n);
            expect(depth, `rotation ${deg}°`).toBeCloseTo(12, 6);
        }
    });
});

describe('lineParallelToEdge + firstFrontEdgeIndex — the frontage filter', () => {
    it('keeps frontage-parallel lines and drops crossing ones', () => {
        expect(lineParallelToEdge(PARCEL, 0, LINE_4M_FROM_SOUTH)).toBe(true);
        expect(
            lineParallelToEdge(PARCEL, 0, [
                { x: 10, z: 0 },
                { x: 10, z: 28 },
            ]),
        ).toBe(false); // perpendicular — not a façade/rear line for this frontage
    });

    it('is false (not a throw) on degenerate input', () => {
        expect(lineParallelToEdge([], 0, LINE_4M_FROM_SOUTH)).toBe(false);
        expect(lineParallelToEdge(PARCEL, 0, [{ x: 0, z: 0 }])).toBe(false);
    });

    it('finds the first `front` edge, or null when none is classified', () => {
        const withFront: ParcelEdgeClassification[] = ['unclassified', 'front', 'rear', 'side'];
        expect(firstFrontEdgeIndex(withFront)).toBe(1);
        expect(firstFrontEdgeIndex(['unclassified', 'unclassified'])).toBeNull();
        expect(firstFrontEdgeIndex([])).toBeNull();
    });
});
