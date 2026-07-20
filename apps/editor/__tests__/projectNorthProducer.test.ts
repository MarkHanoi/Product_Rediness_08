// §L-430 slice 3 — THE PRODUCER: the parcel is squared into the authoring frame at commit.
//
// This is the slice that makes θ non-zero, so it is the one that can actually break a live
// project. The tests therefore assert the END-TO-END contract rather than the mechanics:
//
//   1. a rotated parcel comes out AXIS-ALIGNED in the authoring frame  (the founder's ask:
//      "orthogonal walls and normals");
//   2. it maps back to its ORIGINAL real-world position on the globe   (nothing moved on earth);
//   3. an already-square parcel is byte-identical                      (ADR-0070 byte-identity);
//   4. the rotation is RIGID                                           (areas/lengths preserved —
//      a parcel must not gain or lose a square metre by being squared).
//
// (2) is the one that matters most: a de-rotation that "looks orthogonal" but does not invert
// exactly on the globe would silently move the building off its real plot, and every view
// would still look plausible.

import { describe, it, expect } from 'vitest';
import {
    deriveProjectNorthAngleFromParcel,
    trueVectorToProjectNorth,
} from '../src/ui/site/overlay/projectTrueNorth';
import { sceneXZToEnu } from '../src/ui/geospatial/sceneEnuFrame';

type XZ = { x: number; z: number };

/** The EXACT transform `dispatchParcelBoundary` applies to the committed ring. */
function squareRingToProjectFrame(ring: XZ[], theta: number): XZ[] {
    return ring.map((p) => {
        const e = trueVectorToProjectNorth({ east: p.x, north: -p.z }, theta);
        return { x: e.east, z: -e.north };
    });
}

/** Shoelace area of a scene-XZ ring (absolute, m²). */
function ringArea(ring: XZ[]): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!, q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a / 2);
}

function rotate(ring: XZ[], deg: number): XZ[] {
    const r = (deg * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
    return ring.map(({ x, z }) => {
        const east = x, north = -z;
        return { x: east * cos - north * sin, z: -(east * sin + north * cos) };
    });
}

/** A realistic city plot: 40 × 15 m, long axis = street frontage. */
const plot: XZ[] = [
    { x: 0, z: 0 }, { x: 40, z: 0 }, { x: 40, z: -15 }, { x: 0, z: -15 },
];

describe('§L-430 slice 3 — producer: parcel squared at commit', () => {
    it('a ROTATED parcel becomes AXIS-ALIGNED in the authoring frame', () => {
        for (const deg of [7, 23, -31, 44, -44]) {
            const trueRing = rotate(plot, deg);
            const theta = deriveProjectNorthAngleFromParcel(trueRing);
            const authored = squareRingToProjectFrame(trueRing, theta);

            // Every edge of a rectangle must now lie on an axis.
            for (let i = 0; i < authored.length; i++) {
                const a = authored[i]!, b = authored[(i + 1) % authored.length]!;
                const dx = Math.abs(b.x - a.x), dz = Math.abs(b.z - a.z);
                expect(Math.min(dx, dz)).toBeLessThan(1e-6);
            }
        }
    });

    it('maps back to the ORIGINAL real-world position on the globe (nothing moved on earth)', () => {
        // The critical one. The globe consumes the authored ring via sceneXZToEnu(θ); that must
        // reproduce the TRUE-frame coordinates the parcel was committed with, exactly. A
        // de-rotation that is orthogonal but not exactly invertible would slide the building
        // off its real plot while every view still looked correct.
        for (const deg of [7, 23, -31, 44]) {
            const trueRing = rotate(plot, deg);
            const theta = deriveProjectNorthAngleFromParcel(trueRing);
            const authored = squareRingToProjectFrame(trueRing, theta);

            authored.forEach((p, i) => {
                const backOnGlobe = sceneXZToEnu(p.x, p.z, theta);
                expect(backOnGlobe.east).toBeCloseTo(trueRing[i]!.x, 9);
                expect(backOnGlobe.north).toBeCloseTo(-trueRing[i]!.z, 9);
            });
        }
    });

    it('an ALREADY-SQUARE parcel is untouched — byte-identical (ADR-0070)', () => {
        // θ is EXACTLY 0 for an axis-aligned parcel, and `dispatchParcelBoundary` guards the
        // whole producer on `projectNorthRad !== 0`. So the committed ring is the ORIGINAL
        // OBJECT — not a transformed copy that happens to match. That guard is the byte-identity
        // guarantee; assert the condition it depends on.
        const theta = deriveProjectNorthAngleFromParcel(plot);
        expect(theta).toBe(0);

        // And the transform itself is numerically the identity. Compared component-wise rather
        // than with toEqual, because `z: -e.north` yields -0 where north is 0: -0 === 0 and
        // every downstream consumer (arithmetic, rendering, serialization to JSON) treats them
        // identically, but Object.is / toEqual distinguish them. Harmless here precisely
        // BECAUSE the guard above means production never runs this path at θ = 0 — worth
        // knowing if that guard is ever removed.
        const passedThrough = squareRingToProjectFrame(plot, 0);
        passedThrough.forEach((p, i) => {
            expect(p.x).toBe(plot[i]!.x);
            expect(Math.abs(p.z - plot[i]!.z)).toBe(0);
        });
    });

    it('is RIGID — the parcel does not gain or lose area by being squared', () => {
        // A parcel's area is a legal quantity; the compliance envelope and FAR are computed
        // from it. A transform that scaled even slightly would corrupt every downstream number
        // while still producing a plausible-looking plot.
        for (const deg of [7, 23, -31, 44]) {
            const trueRing = rotate(plot, deg);
            const theta = deriveProjectNorthAngleFromParcel(trueRing);
            const authored = squareRingToProjectFrame(trueRing, theta);
            expect(ringArea(authored)).toBeCloseTo(ringArea(trueRing), 6);
            expect(ringArea(authored)).toBeCloseTo(40 * 15, 6);
        }
    });

    it('handles a NON-rectangular plot: the dominant edge squares, area still preserved', () => {
        // Real parcels are rarely rectangles. Only the longest edge is guaranteed axis-aligned.
        const lPlot: XZ[] = [
            { x: 0, z: 0 }, { x: 50, z: 0 }, { x: 50, z: -12 },
            { x: 20, z: -12 }, { x: 20, z: -28 }, { x: 0, z: -28 },
        ];
        const trueRing = rotate(lPlot, 37);
        const theta = deriveProjectNorthAngleFromParcel(trueRing);
        const authored = squareRingToProjectFrame(trueRing, theta);

        // Longest edge (the 50 m one) is axis-aligned.
        let bestLen = -1, bestOff = Infinity;
        for (let i = 0; i < authored.length; i++) {
            const a = authored[i]!, b = authored[(i + 1) % authored.length]!;
            const dx = b.x - a.x, dz = b.z - a.z;
            const len = Math.hypot(dx, dz);
            if (len > bestLen) { bestLen = len; bestOff = Math.min(Math.abs(dx), Math.abs(dz)); }
        }
        expect(bestOff).toBeLessThan(1e-6);
        expect(ringArea(authored)).toBeCloseTo(ringArea(trueRing), 6);
    });
});
