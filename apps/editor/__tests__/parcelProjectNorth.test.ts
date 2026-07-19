// §L-430 slice 1 — parcel-derived PROJECT NORTH (θ).
//
// These tests do NOT merely assert an angle: they round-trip the parcel through the REAL
// ADR-0115 transform (`trueToProjectNorth`) and assert the dominant edge comes out
// AXIS-ALIGNED. That is the property the founder actually asked for ("orthogonal walls +
// normals"), and it pins the sign convention — an inverted θ would still "look like" a
// plausible angle but would fail these.

import { describe, it, expect } from 'vitest';
import {
    deriveProjectNorthAngleFromParcel,
    trueToProjectNorth,
} from '../src/ui/site/overlay/projectTrueNorth';

type XZ = { x: number; z: number };

/** Rotate a scene-XZ ring by `deg` about the origin, in the East/North sense (east=x, north=-z). */
function rotateRing(ring: XZ[], deg: number): XZ[] {
    const r = (deg * Math.PI) / 180;
    const cos = Math.cos(r), sin = Math.sin(r);
    return ring.map(({ x, z }) => {
        const east = x, north = -z;
        const e2 = east * cos - north * sin;
        const n2 = east * sin + north * cos;
        return { x: e2, z: -n2 };
    });
}

/** Longest-edge direction of a ring AFTER mapping into the project frame with θ. */
function dominantEdgeInProjectFrame(ring: XZ[], theta: number): { dE: number; dN: number } {
    const base = { east: 0, north: 0 };
    const pts = ring.map((p) => trueToProjectNorth({ east: p.x, north: -p.z }, theta, base));
    let best = { dE: 0, dN: 0 }, bestLen = -1;
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
        const dE = b.east - a.east, dN = b.north - a.north;
        const len = dE * dE + dN * dN;
        if (len > bestLen) { bestLen = len; best = { dE, dN }; }
    }
    return best;
}

/** A rectangular plot, long axis along +East, already square to true north. */
const squarePlot: XZ[] = [
    { x: 0, z: 0 }, { x: 40, z: 0 }, { x: 40, z: -15 }, { x: 0, z: -15 },
];

describe('§L-430 deriveProjectNorthAngleFromParcel', () => {
    it('returns EXACTLY 0 for an already axis-aligned parcel (ADR-0070 byte-identity)', () => {
        expect(deriveProjectNorthAngleFromParcel(squarePlot)).toBe(0);
    });

    it('returns 0 for degenerate input (null / too few points / coincident points)', () => {
        expect(deriveProjectNorthAngleFromParcel(null)).toBe(0);
        expect(deriveProjectNorthAngleFromParcel([{ x: 1, z: 1 }])).toBe(0);
        expect(deriveProjectNorthAngleFromParcel([{ x: 1, z: 1 }, { x: 1, z: 1 }])).toBe(0);
    });

    it('SQUARES a rotated parcel: the dominant edge is axis-aligned in the project frame', () => {
        for (const deg of [10, 30, -20, 63, -77]) {
            const rotated = rotateRing(squarePlot, deg);
            const theta = deriveProjectNorthAngleFromParcel(rotated);
            const { dE, dN } = dominantEdgeInProjectFrame(rotated, theta);
            // Axis-aligned ⇒ one component is ~0.
            const offAxis = Math.min(Math.abs(dE), Math.abs(dN));
            expect(offAxis).toBeLessThan(1e-6);
        }
    });

    it('always picks the SMALLEST squaring rotation (|θ| ≤ 45°)', () => {
        for (const deg of [5, 44, 46, 80, 89, 135, -100]) {
            const theta = deriveProjectNorthAngleFromParcel(rotateRing(squarePlot, deg));
            expect(Math.abs(theta)).toBeLessThanOrEqual(Math.PI / 4 + 1e-9);
        }
    });

    it('is DETERMINISTIC — the same parcel always yields the same θ (no frame flapping)', () => {
        const p = rotateRing(squarePlot, 23);
        expect(deriveProjectNorthAngleFromParcel(p)).toBe(deriveProjectNorthAngleFromParcel(p));
    });

    it('uses the LONGEST edge (street frontage), not merely the first edge', () => {
        // First edge is short and at 45°; the long edge is axis-aligned ⇒ θ must be 0.
        const lShaped: XZ[] = [
            { x: 0, z: 0 }, { x: 3, z: -3 },      // short 45° edge (first)
            { x: 60, z: -3 }, { x: 60, z: -20 }, { x: 0, z: -20 }, // long axis-aligned edge
        ];
        expect(deriveProjectNorthAngleFromParcel(lShaped)).toBe(0);
    });
});
