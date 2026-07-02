// §FEAT-WALL-MOVE-DIMENSIONS (founder L-29) — pure move-time set-out geometry
// unit tests (no browser). Proves the perpendicular gap dimension(s) from a
// MOVING wall equal the true orthogonal distances to the nearest parallel
// neighbours and update with the move offset.

import { describe, it, expect } from 'vitest';
import {
    computeWallMoveDimensions,
    classifyMovingWallAxis,
    type MoveWallSegment,
} from './wallMoveDimensions';

/** A horizontal wall (runs along X) at z = Z, spanning x0..x1. */
const hWall = (z: number, x0: number, x1: number): MoveWallSegment => ({ a: { x: x0, z }, b: { x: x1, z } });
/** A vertical wall (runs along Z) at x = X, spanning z0..z1. */
const vWall = (x: number, z0: number, z1: number): MoveWallSegment => ({ a: { x, z: z0 }, b: { x, z: z1 } });

describe('classifyMovingWallAxis — §FEAT-WALL-MOVE-DIMENSIONS', () => {
    it('classifies a horizontal wall as axis x', () => {
        expect(classifyMovingWallAxis(hWall(2, 0, 5))).toBe('x');
    });
    it('classifies a vertical wall as axis z', () => {
        expect(classifyMovingWallAxis(vWall(3, 0, 5))).toBe('z');
    });
    it('returns null for a near-diagonal wall (±22.5° neutral zone)', () => {
        expect(classifyMovingWallAxis({ a: { x: 0, z: 0 }, b: { x: 5, z: 5 } })).toBeNull();
    });
    it('returns null for a degenerate (zero-length) wall', () => {
        expect(classifyMovingWallAxis({ a: { x: 1, z: 1 }, b: { x: 1, z: 1 } })).toBeNull();
    });
});

describe('computeWallMoveDimensions — §FEAT-WALL-MOVE-DIMENSIONS', () => {
    it('measures the Z gap from a horizontal moving wall to parallel walls above AND below', () => {
        // Moving wall runs along X at z=2, spanning x 0..4 (midpoint x=2).
        // Neighbours: horizontal walls at z=0 (below) and z=5 (above), both spanning the midpoint.
        const moving = hWall(2, 0, 4);
        const dims = computeWallMoveDimensions(moving, [hWall(0, 0, 4), hWall(5, 0, 4)]);
        expect(dims).toHaveLength(2);
        // All gaps run along Z (perpendicular to the horizontal wall).
        expect(dims.every((d) => d.axis === 'z')).toBe(true);
        const minus = dims.find((d) => d.side === 'minus')!;
        const plus  = dims.find((d) => d.side === 'plus')!;
        expect(minus.distanceMm).toBe(2000); // z=2 → z=0
        expect(plus.distanceMm).toBe(3000);  // z=2 → z=5
        // Feet of the perpendicular sit on the neighbour walls at the moving midpoint x.
        expect(minus.to).toEqual({ x: 2, z: 0 });
        expect(plus.to).toEqual({ x: 2, z: 5 });
    });

    it('measures the X gap for a vertical moving wall', () => {
        // Moving wall runs along Z at x=3, spanning z 0..4 (midpoint z=2).
        const dims = computeWallMoveDimensions(vWall(3, 0, 4), [vWall(0, 0, 4), vWall(5, 0, 4)]);
        expect(dims).toHaveLength(2);
        expect(dims.every((d) => d.axis === 'x')).toBe(true);
        expect(dims.find((d) => d.side === 'minus')!.distanceMm).toBe(3000); // x=3 → x=0
        expect(dims.find((d) => d.side === 'plus')!.distanceMm).toBe(2000);  // x=3 → x=5
    });

    it('updates the perpendicular gap with the move offset', () => {
        // Same neighbours (z=0 and z=5); slide the moving wall from z=2 to z=3.5.
        const before = computeWallMoveDimensions(hWall(2, 0, 4), [hWall(0, 0, 4), hWall(5, 0, 4)]);
        const after  = computeWallMoveDimensions(hWall(3.5, 0, 4), [hWall(0, 0, 4), hWall(5, 0, 4)]);
        expect(before.find((d) => d.side === 'minus')!.distanceMm).toBe(2000);
        expect(before.find((d) => d.side === 'plus')!.distanceMm).toBe(3000);
        // After moving +1.5 m along Z: the below gap grows, the above gap shrinks.
        expect(after.find((d) => d.side === 'minus')!.distanceMm).toBe(3500);
        expect(after.find((d) => d.side === 'plus')!.distanceMm).toBe(1500);
    });

    it('picks the NEAREST neighbour on each side when several are parallel', () => {
        const dims = computeWallMoveDimensions(
            hWall(2, 0, 4),
            [hWall(0, 0, 4), hWall(-3, 0, 4), hWall(3, 0, 4), hWall(6, 0, 4)],
        );
        expect(dims.find((d) => d.side === 'minus')!.distanceMm).toBe(2000); // z=0 nearest below
        expect(dims.find((d) => d.side === 'plus')!.distanceMm).toBe(1000);  // z=3 nearest above
    });

    it('does NOT dimension a neighbour the moving wall does not project onto', () => {
        // Moving wall midpoint x=2, but the parallel neighbour spans x 10..15 → no overlap.
        const dims = computeWallMoveDimensions(hWall(2, 0, 4), [hWall(0, 10, 15)]);
        expect(dims).toHaveLength(0);
    });

    it('ignores perpendicular (non-parallel) neighbours', () => {
        // A vertical wall is perpendicular to a horizontal moving wall → no gap dim.
        const dims = computeWallMoveDimensions(hWall(2, 0, 4), [vWall(2, -5, 5)]);
        expect(dims).toHaveLength(0);
    });

    it('ignores neighbours beyond maxDistanceM', () => {
        const dims = computeWallMoveDimensions(hWall(2, 0, 4), [hWall(20, 0, 4)], { maxDistanceM: 8 });
        expect(dims).toHaveLength(0);
    });

    it('returns [] for a near-diagonal moving wall (no clean orthogonal translation)', () => {
        const diagonal: MoveWallSegment = { a: { x: 0, z: 0 }, b: { x: 5, z: 5 } };
        const dims = computeWallMoveDimensions(diagonal, [hWall(0, 0, 5), vWall(0, 0, 5)]);
        expect(dims).toHaveLength(0);
    });

    it('handles the empty neighbour set', () => {
        expect(computeWallMoveDimensions(hWall(2, 0, 4), [])).toEqual([]);
    });

    it('reports only one side when a parallel neighbour exists on just one side', () => {
        const dims = computeWallMoveDimensions(hWall(2, 0, 4), [hWall(0, 0, 4)]);
        expect(dims).toHaveLength(1);
        expect(dims[0].side).toBe('minus');
        expect(dims[0].distanceMm).toBe(2000);
    });
});
