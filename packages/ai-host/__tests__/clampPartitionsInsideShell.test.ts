// §SHELL-CONTAIN (2026-06-16) — clamp partition endpoints that lie OUTSIDE the shell ring
// back onto the perimeter, so no generated ground wall pokes past the shell (the founder's
// "walls going off the shell" defect). The weld only snaps endpoints WITHIN ~0.6 m of a
// shell wall; on a rotated plate a perimeter-terminating endpoint can sit ~0.9–1.2 m outside
// the drawn shell and survive. This is the containment backstop.

import { describe, expect, it } from 'vitest';
import { clampPartitionsInsideShell, type WeldWall, type XZ as WeldXZ } from '../src/workflows/houseLayout/weldPartitionsToShell.js';
import { checkShellContainment } from '../src/workflows/houseLayout/containmentChecks.js';

/** Square shell ring 0..10 (CCW), world metres. */
const SQUARE: WeldXZ[] = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }];

const w = (id: string, sx: number, sz: number, ex: number, ez: number): WeldWall =>
    ({ id, start: { x: sx, z: sz }, end: { x: ex, z: ez } });
const near = (a: WeldXZ, x: number, z: number, eps = 1e-6) => Math.abs(a.x - x) <= eps && Math.abs(a.z - z) <= eps;

describe('§SHELL-CONTAIN — clampPartitionsInsideShell', () => {
    it('an endpoint INSIDE the shell is untouched (and the whole wall is byte-identical)', () => {
        const inp = [w('p1', 2, 2, 8, 8)];
        const out = clampPartitionsInsideShell(inp, SQUARE);
        expect(out[0]!.start).toEqual({ x: 2, z: 2 });
        expect(out[0]!.end).toEqual({ x: 8, z: 8 });
    });

    it('an endpoint ON the perimeter is untouched (within tol of the boundary)', () => {
        const out = clampPartitionsInsideShell([w('p1', 0, 5, 5, 5)], SQUARE);
        expect(near(out[0]!.start, 0, 5)).toBe(true);   // on the left edge — kept
    });

    it('axis-aligned plate — every endpoint already inside ⇒ no-op (ids + coords preserved)', () => {
        const inp = [w('a', 1, 1, 9, 1), w('b', 5, 0, 5, 10)];
        const out = clampPartitionsInsideShell(inp, SQUARE);
        expect(out).toEqual(inp.map(p => ({ id: p.id, start: { ...p.start }, end: { ...p.end } })));
    });

    it('an endpoint OUTSIDE the shell is CLAMPED to the nearest boundary point', () => {
        // end at (13, 5) is 3 m PAST the right wall (x=10) → clamps to (10, 5).
        const out = clampPartitionsInsideShell([w('p1', 5, 5, 13, 5)], SQUARE);
        expect(near(out[0]!.start, 5, 5)).toBe(true);            // inside — kept
        expect(near(out[0]!.end, 10, 5)).toBe(true);             // clamped onto the right edge
    });

    it('the live defect — a perimeter-terminating endpoint ~1.1 m outside is pulled back ONTO the shell', () => {
        // The §DIAG-ROOM-LOOP "EXCEEDS hostSnap" residual: an endpoint 1.1 m past the top wall.
        const out = clampPartitionsInsideShell([w('part', 4, 4, 4, 11.1)], SQUARE);
        expect(near(out[0]!.end, 4, 10)).toBe(true);             // clamped to the top edge z=10
        // and it no longer extends past the shell
        expect(out[0]!.end.z).toBeLessThanOrEqual(10 + 1e-9);
    });

    it('NON-CONVEX (L-shape) — a point in the notch (outside the L) clamps to the L boundary', () => {
        // L-ring: a 10×10 square with the top-right 5×5 quadrant removed.
        const L: WeldXZ[] = [
            { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 5 },
            { x: 5, z: 5 }, { x: 5, z: 10 }, { x: 0, z: 10 },
        ];
        // (8, 8) is in the removed quadrant → OUTSIDE the L → must clamp onto the L boundary.
        const out = clampPartitionsInsideShell([w('p', 2, 2, 8, 8)], L);
        expect(near(out[0]!.start, 2, 2)).toBe(true);            // inside the L — kept
        // (8,8): nearest L edges are x=5 (z∈[5,10]) at dist 3 and z=5 (x∈[5,10]) at dist 3 → onto one of them
        const e = out[0]!.end;
        const onXEdge = Math.abs(e.x - 5) <= 1e-6 && e.z >= 5 - 1e-6 && e.z <= 10 + 1e-6;
        const onZEdge = Math.abs(e.z - 5) <= 1e-6 && e.x >= 5 - 1e-6 && e.x <= 10 + 1e-6;
        expect(onXEdge || onZEdge, `clamped end ${JSON.stringify(e)} should lie on the L notch boundary`).toBe(true);
    });

    it('degenerate ring (<3 verts) ⇒ pass-through copy (never throws)', () => {
        const out = clampPartitionsInsideShell([w('p', 0, 0, 99, 99)], [{ x: 0, z: 0 }, { x: 1, z: 0 }]);
        expect(out[0]!.end).toEqual({ x: 99, z: 99 });
    });
});

// §DIAG-HOUSE-SHELL-CONTAINMENT (2026-07-01) — the executor's unconditional containment step
// (`HouseLayoutExecutor._containWithinShell`) clamps EVERY partition endpoint onto the shell on
// EVERY floor/path, then asserts no wall vertex remains outside via `checkShellContainment`.
// These tests exercise that exact clamp+validate invariant on an ANGLED (rotated, non-axis-
// aligned) plot — the founder's "rooms poke outside the shell on both floors" case — where the
// no-weld paths (ground engine-perimeter, upper bit-exact) previously left endpoints breaching.
describe('§DIAG-HOUSE-SHELL-CONTAINMENT — angled-plot containment invariant', () => {
    /** A ~45°-rotated square plot (the founder's angled plate), world metres. */
    const rot = Math.PI / 4;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const R = (x: number, z: number): WeldXZ => ({ x: x * cos - z * sin, z: x * sin + z * cos });
    const ANGLED: WeldXZ[] = [R(0, 0), R(10, 0), R(10, 10), R(0, 10)];

    it('rooms/partitions breaching the angled shell are ALL clipped back inside (zero residual)', () => {
        // Emulate the engine tiling partitions against the AXIS-ALIGNED bbox of the rotated
        // plate: several endpoints land OUTSIDE the true (rotated) footprint ring.
        const rooms: WeldWall[] = [
            // A room rect whose far corner pokes past the slanted edge (axis-aligned tiling).
            w('roomA', 2, 2, 11.5, 5),      // end well outside the rotated ring
            w('roomB', 5, 8, 9, 12.5),      // end past the top slanted edge
            w('divider', -1.5, 4, 6, 4),    // start pokes past the left slanted edge
            w('inside', 3, 3, 6, 6),        // genuinely interior — must stay put
        ];
        const before = checkShellContainment(rooms, ANGLED);
        expect(before.count, 'fixture must actually breach the shell').toBeGreaterThan(0);

        const contained = clampPartitionsInsideShell(rooms, ANGLED);
        const after = checkShellContainment(contained, ANGLED);
        // THE invariant: after containment, NO room/partition vertex lies outside the shell.
        expect(after.count).toBe(0);
        expect(after.maxOvershootM).toBeLessThanOrEqual(0.05 + 1e-6);
    });

    it('the genuinely-interior wall is left untouched by the containment clamp', () => {
        const contained = clampPartitionsInsideShell([w('inside', 3, 3, 6, 6)], ANGLED);
        expect(contained[0]!.start).toEqual({ x: 3, z: 3 });
        expect(contained[0]!.end).toEqual({ x: 6, z: 6 });
    });

    it('every clamped endpoint is inside-or-on the angled shell (validator agrees with clamp)', () => {
        // A dense fan of walls, half of them shooting outside in every direction.
        const walls: WeldWall[] = [];
        for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            walls.push(w(`ray${k}`, 5, 5, 5 + 12 * Math.cos(a), 5 + 12 * Math.sin(a)));
        }
        const contained = clampPartitionsInsideShell(walls, ANGLED);
        const report = checkShellContainment(contained, ANGLED);
        expect(report.count, `residual off-shell endpoints: ${JSON.stringify(report.violations)}`).toBe(0);
    });
});
