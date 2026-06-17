// §CONTAIN-CHECK (2026-06-16) — pure diagnostics for the queued "checker so we avoid walls
// going off the shell" + "windows beyond the corner". These REPORT violations and move no
// geometry; the fixers (clampPartitionsInsideShell + §WINDOW-CLEAR-WIDTH-CAP) own the repair.

import { describe, expect, it } from 'vitest';
import {
    checkShellContainment,
    checkWindowCornerOverflow,
    type ContainWall,
    type CheckWindow,
    type HostSegment,
    type XZ,
} from '../src/workflows/houseLayout/containmentChecks.js';

const SQUARE: XZ[] = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }];
const w = (id: string, sx: number, sz: number, ex: number, ez: number): ContainWall =>
    ({ id, start: { x: sx, z: sz }, end: { x: ex, z: ez } });

describe('§CONTAIN-CHECK — checkShellContainment', () => {
    it('all endpoints inside ⇒ clean report (count 0, maxOvershoot 0)', () => {
        const r = checkShellContainment([w('p1', 2, 2, 8, 8)], SQUARE);
        expect(r.count).toBe(0);
        expect(r.maxOvershootM).toBe(0);
        expect(r.violations).toEqual([]);
    });

    it('an endpoint on the perimeter is NOT flagged (within tol band)', () => {
        const r = checkShellContainment([w('p1', 0, 5, 5, 5)], SQUARE);
        expect(r.count).toBe(0);
    });

    it('an endpoint 3 m past the right wall is flagged with overshoot 3', () => {
        const r = checkShellContainment([w('p1', 5, 5, 13, 5)], SQUARE);
        expect(r.count).toBe(1);
        expect(r.violations[0]!.id).toBe('p1');
        expect(r.violations[0]!.end).toBe('end');
        expect(r.violations[0]!.overshootM).toBeCloseTo(3, 6);
        expect(r.maxOvershootM).toBeCloseTo(3, 6);
    });

    it('both endpoints outside ⇒ two violations; maxOvershoot is the worst', () => {
        // start 2 m left of x=0, end 5 m past x=10.
        const r = checkShellContainment([w('p', -2, 5, 15, 5)], SQUARE);
        expect(r.count).toBe(2);
        expect(r.maxOvershootM).toBeCloseTo(5, 6);
    });

    it('the live defect — perimeter-terminating endpoint ~1.1 m past the top is flagged', () => {
        const r = checkShellContainment([w('part', 4, 4, 4, 11.1)], SQUARE);
        expect(r.count).toBe(1);
        expect(r.violations[0]!.end).toBe('end');
        expect(r.violations[0]!.overshootM).toBeCloseTo(1.1, 6);
    });

    it('NON-CONVEX (L-shape) — a point in the removed notch is flagged as outside', () => {
        const L: XZ[] = [
            { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 5 },
            { x: 5, z: 5 }, { x: 5, z: 10 }, { x: 0, z: 10 },
        ];
        const r = checkShellContainment([w('p', 2, 2, 8, 8)], L);
        expect(r.count).toBe(1);          // (8,8) in the notch
        expect(r.violations[0]!.overshootM).toBeCloseTo(3, 6);   // 3 m from the nearest L edge
    });

    it('degenerate ring (<3 verts) ⇒ clean report (never throws)', () => {
        const r = checkShellContainment([w('p', 0, 0, 99, 99)], [{ x: 0, z: 0 }, { x: 1, z: 0 }]);
        expect(r.count).toBe(0);
    });
});

describe('§CONTAIN-CHECK — checkWindowCornerOverflow', () => {
    const seg = (id: string, sx: number, sz: number, ex: number, ez: number): HostSegment =>
        ({ id, start: { x: sx, z: sz }, end: { x: ex, z: ez } });
    const win = (id: string, hostWallId: string, offsetM: number, widthM: number): CheckWindow =>
        ({ id, hostWallId, offsetM, widthM });
    const SEG = [seg('wall1', 0, 0, 6, 0)];   // 6 m wall along +x

    it('a centred window well inside the wall ⇒ no violation', () => {
        const r = checkWindowCornerOverflow([win('win1', 'wall1', 3, 1.2)], SEG);
        expect(r.count).toBe(0);
        expect(r.maxOverflowM).toBe(0);
    });

    it('a window whose far edge runs past the end corner is flagged on the END side', () => {
        // offset 5.5, width 1.5 ⇒ run [4.75, 6.25]; wall len 6 ⇒ 0.25 m past the end.
        const r = checkWindowCornerOverflow([win('win1', 'wall1', 5.5, 1.5)], SEG);
        expect(r.count).toBe(1);
        expect(r.violations[0]!.side).toBe('end');
        expect(r.violations[0]!.overflowM).toBeCloseTo(0.25, 6);
    });

    it('a window whose near edge runs before the start corner is flagged on the START side', () => {
        // offset 0.3, width 1.2 ⇒ run [-0.3, 0.9] ⇒ 0.3 m before the start.
        const r = checkWindowCornerOverflow([win('win1', 'wall1', 0.3, 1.2)], SEG);
        expect(r.count).toBe(1);
        expect(r.violations[0]!.side).toBe('start');
        expect(r.violations[0]!.overflowM).toBeCloseTo(0.3, 6);
    });

    it('a window centred such that BOTH edges overflow ⇒ two violations', () => {
        // 2 m window on a 1 m wall, centred ⇒ run [-0.5, 1.5] on a len-1 wall.
        const r = checkWindowCornerOverflow([win('w', 'wall1', 0.5, 2)], [seg('wall1', 0, 0, 1, 0)]);
        expect(r.count).toBe(2);
        expect(r.maxOverflowM).toBeCloseTo(0.5, 6);
    });

    it('an unknown host wall is skipped (not this check\'s responsibility)', () => {
        const r = checkWindowCornerOverflow([win('w', 'ghost', 3, 5)], SEG);
        expect(r.count).toBe(0);
    });

    it('a tiny overflow within tol is NOT flagged', () => {
        // run [4.99, 6.01] on a len-6 wall, tol 0.02 ⇒ 0.01 overflow < tol ⇒ clean.
        const r = checkWindowCornerOverflow([win('w', 'wall1', 5.5, 1.02)], SEG, 0.02);
        expect(r.count).toBe(0);
    });
});
