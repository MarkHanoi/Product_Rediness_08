// §WALL-SETOUT — pure set-out geometry unit tests (no browser).
import { describe, it, expect } from 'vitest';
import {
    computeSetOutDimensions,
    solveSetOutPoint,
    type SetOutSegment,
    type SetOutDimension,
} from '../src/engine/views/plantools/setOutDimensions';

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

    it('picks the NEAREST vertical wall on EACH side when several project onto the point', () => {
        // §WALL-SETOUT-4SIDE — point x=4.5 sees wall@5 to +X (0.5 m) and wall@0 to −X (4.5 m);
        // wall@10 (+X, 5.5 m) is the farther wall on the same side → dropped.
        const dims = computeSetOutDimensions({ x: 4.5, z: 2 }, [vWall(0, 0, 5), vWall(5, 0, 5), vWall(10, 0, 5)]);
        expect(dims).toHaveLength(2);
        const plus = dims.find((d) => d.side === '+x')!;
        const minus = dims.find((d) => d.side === '-x')!;
        expect(plus.distanceMm).toBe(500);   // wall at x=5 is nearest on +X
        expect(plus.to.x).toBe(5);
        expect(plus.role).toBe('primary');   // nearer side → primary (blue)
        expect(minus.distanceMm).toBe(4500); // wall at x=0 on −X
        expect(minus.role).toBe('secondary');// farther side → secondary (grey)
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

describe('computeSetOutDimensions — §WALL-SETOUT-4SIDE (four-side projection + roles)', () => {
    it('returns FOUR dims when a wall boxes the point on every side', () => {
        // Point (2,2) inside a 0..4 × 0..4 box of walls.
        const dims = computeSetOutDimensions({ x: 2, z: 2 }, [
            vWall(0, 0, 4),  // −X wall
            vWall(4, 0, 4),  // +X wall
            hWall(0, 0, 4),  // −Z wall
            hWall(4, 0, 4),  // +Z wall
        ]);
        expect(dims).toHaveLength(4);
        const bySide = Object.fromEntries(dims.map((d) => [d.side, d])) as Record<string, SetOutDimension>;
        expect(Object.keys(bySide).sort()).toEqual(['+x', '+z', '-x', '-z']);
        // Equidistant box → every distance is 2000 mm.
        for (const d of dims) expect(d.distanceMm).toBe(2000);
        // Symmetric distances → each axis' first-seen side is primary, the other secondary.
        expect(dims.filter((d) => d.role === 'primary')).toHaveLength(2);
        expect(dims.filter((d) => d.role === 'secondary')).toHaveLength(2);
        expect(dims.filter((d) => d.role === 'primary').map((d) => d.axis).sort()).toEqual(['x', 'z']);
    });

    it('returns fewer dims when a side is missing (only +X and +Z walls present)', () => {
        const dims = computeSetOutDimensions({ x: 1, z: 1 }, [vWall(4, 0, 5), hWall(4, 0, 5)]);
        expect(dims).toHaveLength(2);
        // Both are the nearer (only) wall on their axis → both primary.
        expect(dims.every((d) => d.role === 'primary')).toBe(true);
        expect(dims.map((d) => d.side).sort()).toEqual(['+x', '+z']);
    });

    it('tags the NEARER wall on an axis primary and the farther secondary', () => {
        // Two vertical walls on opposite sides at different distances.
        const dims = computeSetOutDimensions({ x: 3, z: 2 }, [vWall(1, 0, 5), vWall(7, 0, 5)]);
        expect(dims).toHaveLength(2);
        const near = dims.find((d) => d.role === 'primary')!;
        const far = dims.find((d) => d.role === 'secondary')!;
        expect(near.distanceMm).toBe(2000); // wall@1 → 2 m (nearer)
        expect(near.side).toBe('-x');
        expect(far.distanceMm).toBe(4000);  // wall@7 → 4 m (farther)
        expect(far.side).toBe('+x');
        // Primary comes first in the returned order.
        expect(dims[0].role).toBe('primary');
    });
});

describe('solveSetOutPoint — §WALL-SETOUT-TAB-INPUT (back-solve typed mm → point)', () => {
    it('moves the point along +X toward a wall so the set-out equals the typed mm', () => {
        // Wall on +X at x=5; point currently at x=2 (3 m off). Type 999 mm → x = 5 − 0.999.
        const dim = { axis: 'x' as const, side: '+x' as const, to: { x: 5, z: 2 } };
        const p = solveSetOutPoint({ x: 2, z: 2 }, dim, 999);
        expect(p.x).toBeCloseTo(4.001, 6);
        expect(p.z).toBe(2); // off-axis coordinate preserved
    });

    it('moves the point along −X (wall on the −X side keeps the point on that side)', () => {
        const dim = { axis: 'x' as const, side: '-x' as const, to: { x: 0, z: 2 } };
        const p = solveSetOutPoint({ x: 3, z: 2 }, dim, 1200);
        expect(p.x).toBeCloseTo(1.2, 6); // wall@0 + 1.2 m, still on +X of the wall
        expect(p.z).toBe(2);
    });

    it('moves along Z and preserves X; round-trips through computeSetOutDimensions', () => {
        const wall = hWall(0, 0, 10); // −Z wall relative to a point above it
        const dim = { axis: 'z' as const, side: '-z' as const, to: { x: 4, z: 0 } };
        const p = solveSetOutPoint({ x: 4, z: 3 }, dim, 800);
        expect(p.x).toBe(4);
        expect(p.z).toBeCloseTo(0.8, 6);
        // The recomputed set-out from the solved point equals the typed distance.
        const dims = computeSetOutDimensions(p, [wall]);
        expect(dims.find((d) => d.axis === 'z')!.distanceMm).toBe(800);
    });

    it('clamps non-finite / negative typed values to 0 (point lands on the wall)', () => {
        const dim = { axis: 'x' as const, side: '+x' as const, to: { x: 5, z: 2 } };
        expect(solveSetOutPoint({ x: 2, z: 2 }, dim, NaN).x).toBe(5);
        expect(solveSetOutPoint({ x: 2, z: 2 }, dim, -100).x).toBe(5);
    });
});
