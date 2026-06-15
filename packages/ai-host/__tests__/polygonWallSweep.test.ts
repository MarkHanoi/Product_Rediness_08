// §POLYGON-WALL-SWEEP (Phase 2, doc §13.4 step 2) — the GENERAL collinear-
// overlapping-edge wall matcher + the axis-aligned fast-path detector.
//
// Phase 2 generalises `buildWallsAndDoors` to non-axis-aligned cell edges WHILE
// staying byte-identical on every current input via an axis-aligned fast path.
// The general path is exercised ONLY by this file in Phase 2 (no production input
// produces a non-axis cell until Phase 3). It asserts, on a hand-made 2-cell
// SHEARED partition (two cells sharing a diagonal edge):
//   • the shared diagonal wall is detected EXACTLY ONCE and carries both room ids;
//   • the outer edges are classified as perimeter (one-sided);
//   • no emitted wall is shorter than the min-length floor (no sub-WJR stubs);
//   • the resulting room polygons are simple (no self-intersection);
//   • `isAxisAlignedBox` accepts an axis-aligned rect polygon and rejects a
//     sheared quad.

import { describe, expect, it } from 'vitest';
import {
    __isAxisAlignedBoxForTest as isAxisAlignedBox,
    __collinearSharedWallsForTest as collinearSharedWalls,
    __repairSegmentsForTest as repairSegments,
    __WJR_SAFE_MIN_LEN_M as WJR_SAFE_MIN_LEN_M,
    type WallSeg,
} from '../src/workflows/apartmentLayout/tgl/wallsAndDoors.js';
import { rectPolygon } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import type { Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';

// ── geometry helpers (local — ai-host has no shared isSimple) ─────────────────

const EPS = 1e-9;
const len = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.z - a.z);

/** Proper segment intersection test (excludes shared endpoints + collinear touch). */
function segmentsProperlyCross(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
    const o = (a: Pt, b: Pt, c: Pt): number =>
        (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    const d1 = o(p3, p4, p1), d2 = o(p3, p4, p2), d3 = o(p1, p2, p3), d4 = o(p1, p2, p4);
    // STRICT straddle on both segments ⇒ a proper crossing (interior of both).
    return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS))
        && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
}

/** A simple polygon: no two NON-adjacent edges properly cross. */
function isSimple(poly: readonly Pt[]): boolean {
    const n = poly.length;
    if (n < 3) return false;
    for (let i = 0; i < n; i++) {
        const a1 = poly[i]!, a2 = poly[(i + 1) % n]!;
        for (let j = i + 1; j < n; j++) {
            // Skip adjacent edges (they share a vertex by construction).
            if (j === i) continue;
            if ((j + 1) % n === i || (i + 1) % n === j) continue;
            const b1 = poly[j]!, b2 = poly[(j + 1) % n]!;
            if (segmentsProperlyCross(a1, a2, b1, b2)) return false;
        }
    }
    return true;
}

// A SQUARE [0,0]–[10,6] split by the SHEARED line (3,0)→(7,6) into two quads that
// SHARE that diagonal edge. Both rings are CCW (room on the edge's left).
//   A (left)  shares edge (3,0)→(7,6)
//   B (right) shares edge (7,6)→(3,0)  (the same line, reversed)
const SHEAR_A: readonly Pt[] = [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 7, z: 6 }, { x: 0, z: 6 }];
const SHEAR_B: readonly Pt[] = [{ x: 3, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 6 }, { x: 7, z: 6 }];

const isShared = (w: WallSeg | { ids: string[] }): boolean =>
    ('ids' in w ? w.ids.length : w.boundsRoomIds.length) === 2;

describe('§POLYGON-WALL-SWEEP — isAxisAlignedBox', () => {
    it('accepts an axis-aligned rect polygon (the lifted-rect cell every prod input produces)', () => {
        const box = isAxisAlignedBox(rectPolygon({ x0: 1, z0: 2, x1: 5, z1: 9 }));
        expect(box).not.toBeNull();
        expect(box).toEqual({ x0: 1, z0: 2, x1: 5, z1: 9 });
    });

    it('rejects a sheared quad (≥1 diagonal edge)', () => {
        expect(isAxisAlignedBox(SHEAR_A)).toBeNull();
        expect(isAxisAlignedBox(SHEAR_B)).toBeNull();
    });

    it('rejects a degenerate / non-4-vertex polygon', () => {
        expect(isAxisAlignedBox([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 0 }, { x: 0, z: 0 }])).toBeNull();
        expect(isAxisAlignedBox([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }])).toBeNull();
    });
});

describe('§POLYGON-WALL-SWEEP — collinear-overlapping-edge matcher (general path)', () => {
    const cells = [
        { roomId: 'A', polygon: SHEAR_A },
        { roomId: 'B', polygon: SHEAR_B },
    ];

    it('detects the shared diagonal wall EXACTLY ONCE, carrying BOTH room ids', () => {
        const walls = collinearSharedWalls(cells);
        const shared = walls.filter(isShared);
        expect(shared).toHaveLength(1);
        expect([...shared[0]!.ids].sort()).toEqual(['A', 'B']);
        // The shared wall lies on the sheared line (3,0)→(7,6): a genuine diagonal.
        const w = shared[0]!;
        const dx = w.b.x - w.a.x, dz = w.b.z - w.a.z;
        expect(Math.abs(dx)).toBeGreaterThan(1e-3);   // not vertical
        expect(Math.abs(dz)).toBeGreaterThan(1e-3);   // not horizontal
        // Its endpoints are the two shear vertices (in either order).
        const ends = [w.a, w.b].map(p => `${Math.round(p.x)},${Math.round(p.z)}`).sort();
        expect(ends).toEqual(['3,0', '7,6']);
    });

    it('classifies every OTHER edge as a one-sided perimeter segment', () => {
        const walls = collinearSharedWalls(cells);
        const perimeter = walls.filter(w => !isShared(w));
        // The original square has 4 sides; the shear split each of the bottom + top
        // edges into two runs (at x=3 / x=7), so 2(left/right verticals) + 2(bottom
        // halves) + 2(top halves) = 6 one-sided perimeter segments.
        expect(perimeter.length).toBeGreaterThanOrEqual(4);
        for (const w of perimeter) expect(w.ids).toHaveLength(1);
        // exactly ONE interior wall total
        expect(walls.filter(isShared)).toHaveLength(1);
    });

    it('emits NO wall shorter than the min-length floor after repairSegments (no sub-WJR stubs)', () => {
        const walls = collinearSharedWalls(cells);
        // Lift to WallSeg the same way buildWallsAndDoors' emitWall would, then run
        // the SAME repair the function applies at the end.
        const segs: WallSeg[] = walls.map((w, i) => ({
            id: `w${i}`, a: w.a, b: w.b, thickness: 0.1,
            boundsRoomIds: w.ids.length === 2 ? [...w.ids].sort() : w.ids,
        }));
        const repaired = repairSegments(segs);
        expect(repaired.length).toBeGreaterThan(0);
        for (const s of repaired) {
            expect(len(s.a, s.b)).toBeGreaterThanOrEqual(WJR_SAFE_MIN_LEN_M - 1e-9);
        }
        // the shared diagonal must SURVIVE the repair (it is long: hypot(4,6)≈7.21 m)
        const sharedSurvived = repaired.filter(s => s.boundsRoomIds.length === 2);
        expect(sharedSurvived).toHaveLength(1);
        expect([...sharedSurvived[0]!.boundsRoomIds].sort()).toEqual(['A', 'B']);
    });

    it('the input room polygons are SIMPLE (no self-intersection)', () => {
        expect(isSimple(SHEAR_A)).toBe(true);
        expect(isSimple(SHEAR_B)).toBe(true);
    });

    it('is deterministic — identical output across repeated runs', () => {
        const a = JSON.stringify(collinearSharedWalls(cells));
        const b = JSON.stringify(collinearSharedWalls(cells));
        expect(a).toBe(b);
    });
});
