// §WALL-SETOUT — pure set-out geometry unit tests (no browser).
import { describe, it, expect } from 'vitest';
import { computeSetOutDimensions, type SetOutSegment } from '../src/engine/views/plantools/setOutDimensions';

/** A vertical wall (runs along Z) at x = X, spanning z0..z1. */
const vWall = (x: number, z0: number, z1: number): SetOutSegment => ({ a: { x, z: z0 }, b: { x, z: z1 } });
/** A horizontal wall (runs along X) at z = Z, spanning x0..x1. */
const hWall = (z: number, x0: number, x1: number): SetOutSegment => ({ a: { x: x0, z }, b: { x: x1, z } });

describe('computeSetOutDimensions — §WALL-SETOUT', () => {
    it('measures the perpendicular X distance to a vertical wall the point projects onto', () => {
        const dims = computeSetOutDimensions({ x: 3, z: 2 }, [vWall(0, 0, 5)]);
        expect(dims).toHaveLength(1);
        expect(dims[0].axis).toBe('x');
        expect(dims[0].distanceMm).toBe(3000);
        expect(dims[0].to).toEqual({ x: 0, z: 2 }); // foot of perpendicular on the wall
    });

    it('measures the perpendicular Z distance to a horizontal wall', () => {
        const dims = computeSetOutDimensions({ x: 2, z: 4 }, [hWall(0, 0, 5)]);
        expect(dims).toHaveLength(1);
        expect(dims[0].axis).toBe('z');
        expect(dims[0].distanceMm).toBe(4000);
        expect(dims[0].to).toEqual({ x: 2, z: 0 });
    });

    it('returns BOTH an X and a Z set-out when an L of walls surrounds the point', () => {
        const dims = computeSetOutDimensions({ x: 1.2, z: 0.8 }, [vWall(0, 0, 5), hWall(0, 0, 5)]);
        const axes = dims.map((d) => d.axis).sort();
        expect(axes).toEqual(['x', 'z']);
        expect(dims.find((d) => d.axis === 'x')!.distanceMm).toBe(1200);
        expect(dims.find((d) => d.axis === 'z')!.distanceMm).toBe(800);
    });

    it('picks the NEAREST vertical wall when several project onto the point', () => {
        const dims = computeSetOutDimensions({ x: 4.5, z: 2 }, [vWall(0, 0, 5), vWall(5, 0, 5), vWall(10, 0, 5)]);
        expect(dims).toHaveLength(1);
        expect(dims[0].distanceMm).toBe(500); // wall at x=5 is nearest (0.5 m)
        expect(dims[0].to.x).toBe(5);
    });

    it('does NOT dimension a wall the point is PAST (foot of perpendicular off the span)', () => {
        // point z=9 is beyond the wall's 0..5 z-span → no clean perpendicular.
        const dims = computeSetOutDimensions({ x: 3, z: 9 }, [vWall(0, 0, 5)]);
        expect(dims).toHaveLength(0);
    });

    it('ignores walls beyond maxDistanceM', () => {
        const dims = computeSetOutDimensions({ x: 20, z: 2 }, [vWall(0, 0, 5)], { maxDistanceM: 8 });
        expect(dims).toHaveLength(0);
    });

    it('skips skewed (non-axis-aligned) walls — no clean orthogonal set-out', () => {
        const diagonal: SetOutSegment = { a: { x: 0, z: 0 }, b: { x: 5, z: 5 } };
        const dims = computeSetOutDimensions({ x: 2, z: 2 }, [diagonal]);
        expect(dims).toHaveLength(0);
    });

    it('ignores degenerate (zero-length) walls and bad points', () => {
        expect(computeSetOutDimensions({ x: 1, z: 1 }, [{ a: { x: 0, z: 0 }, b: { x: 0, z: 0 } }])).toHaveLength(0);
        expect(computeSetOutDimensions({ x: NaN, z: 1 }, [vWall(0, 0, 5)])).toHaveLength(0);
    });

    it('handles the empty wall set', () => {
        expect(computeSetOutDimensions({ x: 1, z: 1 }, [])).toEqual([]);
    });
});
