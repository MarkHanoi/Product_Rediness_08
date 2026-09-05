/**
 * §RESI-STAGE-G — the space envelope's PLAN linework.
 * RESI-ORCHESTRATOR-PLAN §4 Stage G · C114 §10 · C102.
 *
 * ⭐ WHY THESE TWO FUNCTIONS AND NOT THE BUILDER. `SpaceEnvelopePlanSymbolBuilder` needs
 * THREE, `@thatopen/components` and a live `TechnicalDrawing`; what it can get WRONG
 * rather than merely invisible is the geometry — whether the authored OPEN ring is closed
 * before it is drawn, and whether a hatch bridges a concave notch. Both are pure, so both
 * are pinned here.
 */

import { describe, it, expect } from 'vitest';
import { hatchSegments, ringSegments } from '../spaceEnvelopePlanGeometry';

/** Segment pairs come back flat: [ax,ay,az, bx,by,bz, …]. */
const segCount = (flat: readonly number[]): number => flat.length / 6;

const square = (s: number) => [
    { x: 0, z: 0 }, { x: s, z: 0 }, { x: s, z: s }, { x: 0, z: s },
];

/** An L: 10×10 with the (5..10, 5..10) quadrant removed — the concave case. */
const lShape = () => [
    { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 5 },
    { x: 5, z: 5 }, { x: 5, z: 10 }, { x: 0, z: 10 },
];

describe('ringSegments — the OPEN ring is closed before it is drawn', () => {
    it('⭐ emits n segments for an n-vertex ring, INCLUDING the closing edge', () => {
        const flat = ringSegments(square(4), 0);
        expect(segCount(flat)).toBe(4);
        // The last segment runs from the last vertex back to the first — the edge that
        // exists nowhere in the record (the schema forbids repeating vertex 0) and that a
        // producer which forgot would leave the room open on one side.
        const last = flat.slice(-6);
        expect(last[0]).toBe(0); expect(last[2]).toBe(4);   // from (0,4)
        expect(last[3]).toBe(0); expect(last[5]).toBe(0);   // to   (0,0)
    });

    it('carries the storey height into every vertex', () => {
        const flat = ringSegments(square(2), 7.5);
        for (let i = 1; i < flat.length; i += 3) expect(flat[i]).toBe(7.5);
    });

    it('drops a zero-length edge instead of emitting a degenerate segment', () => {
        const withDup = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }];
        expect(segCount(ringSegments(withDup, 0))).toBe(4);
    });

    it('a ring of fewer than three vertices yields nothing to draw', () => {
        // ⭐ MEASURED, then FIXED: this first read `.length <= 6` and the function returned
        // TWELVE — the modulo emitted A→B and B→A, a doubled stroke that looks like a real
        // edge. The guard was added to `ringSegments`; the assertion was not relaxed.
        expect(ringSegments([{ x: 0, z: 0 }, { x: 1, z: 0 }], 0)).toEqual([]);
        expect(ringSegments([], 0)).toEqual([]);
    });
});

describe('hatchSegments — a fill made of linework, clipped to the ring', () => {
    it('fills a square with parallel 45° runs', () => {
        const flat = hatchSegments(square(6), 0);
        expect(segCount(flat)).toBeGreaterThan(4);
        for (let i = 1; i < flat.length; i += 3) expect(flat[i]).toBe(0);
    });

    it('⛔ NEVER LEAVES THE RING — every hatch endpoint is inside the square', () => {
        const flat = hatchSegments(square(6), 0);
        for (let i = 0; i < flat.length; i += 3) {
            expect(flat[i]).toBeGreaterThanOrEqual(-1e-6);
            expect(flat[i]).toBeLessThanOrEqual(6 + 1e-6);
            expect(flat[i + 2]).toBeGreaterThanOrEqual(-1e-6);
            expect(flat[i + 2]).toBeLessThanOrEqual(6 + 1e-6);
        }
    });

    it('⭐ DOES NOT BRIDGE A CONCAVE NOTCH — the L-shape\'s missing quadrant stays empty', () => {
        const flat = hatchSegments(lShape(), 0);
        expect(segCount(flat)).toBeGreaterThan(4);
        // Sample the midpoint of every run; none may land in the removed quadrant
        // (x > 5 AND z > 5), which is exactly what a naive min→max fill would do.
        for (let i = 0; i + 5 < flat.length; i += 6) {
            const mx = (flat[i]! + flat[i + 3]!) / 2;
            const mz = (flat[i + 2]! + flat[i + 5]!) / 2;
            expect(mx > 5.001 && mz > 5.001).toBe(false);
        }
    });

    it('DEGRADES on a huge ring rather than dropping it — the room is never silently unfilled', () => {
        const huge = hatchSegments(square(2000), 0);
        expect(segCount(huge)).toBeGreaterThan(0);
        // The ceiling is 160 scanlines; each can contribute at most one run in a convex ring.
        expect(segCount(huge)).toBeLessThanOrEqual(200);
    });

    it('a degenerate ring hatches to nothing rather than throwing', () => {
        expect(hatchSegments([{ x: 0, z: 0 }, { x: 1, z: 1 }, { x: 2, z: 2 }], 0)).toEqual([]);
        expect(hatchSegments([], 0)).toEqual([]);
    });
});
