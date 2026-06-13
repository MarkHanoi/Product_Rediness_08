// §RECTIFY-SHELL-PROJECT (multi-storey room-merge cure, 2026-06-09; ADR-0063 §8.5).
//
// Proves the by-construction cure for the rotated/sheared-plate room-merge: after the
// interior is tiled inside the rectified bbox (§RECTIFY-QUAD), partition endpoints that
// land on the bbox edge are projected OUTWARD onto the REAL shell polygon so they meet
// the executor's perimeter ring (built from the same real shell) within the RoomDetection
// node grid. Also proves the HARD SAFETY GATE: axis-aligned + apartment plates (no
// rectify) are BYTE-IDENTICAL (same reference returned, no move).
//
// Pure L2 — no THREE / DOM / I/O; runs in the default node env.

import { describe, expect, it } from 'vitest';
import {
    projectPartitionEndpointsToShell,
    rectifyConvexQuad,
    polygonBBox,
    principalAxisAngle,
    rotatePoly,
    type Pt,
} from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';

interface XYmm { x: number; y: number }
interface TestWall { start: XYmm; end: XYmm; isExternal?: boolean }

/** m→mm point in the LayoutOption frame (plan-y = world-z). */
const pmm = (xM: number, zM: number): XYmm => ({ x: xM * 1000, y: zM * 1000 });

/** Distance (m) from a point {x,z} to the closed polygon ring. */
function distToRing(p: Pt, poly: readonly Pt[]): number {
    let best = Infinity;
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        const dx = b.x - a.x, dz = b.z - a.z;
        const len2 = dx * dx + dz * dz;
        let t = len2 > 0 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
        if (d < best) best = d;
    }
    return best;
}

describe('§RECTIFY-SHELL-PROJECT — projectPartitionEndpointsToShell', () => {
    // A freehand sheared quad (fill 0.75) — the founder's worst case: rectify fires and a
    // bbox-edge point diverges from the real ring by ~2.1 m (verified numerically).
    const freehandQuad: Pt[] = [
        { x: 0, z: 0 }, { x: 12, z: 1.5 }, { x: 13.5, z: 11 }, { x: 1.5, z: 9.5 },
    ];

    it('VERIFY the divergence: rectify fires and the bbox edge is ~2.1 m off the real ring', () => {
        const ang = principalAxisAngle(freehandQuad);
        // centroid pivot, rotate by -angle into the engine frame
        let cx = 0, cz = 0; for (const p of freehandQuad) { cx += p.x; cz += p.z; } cx /= 4; cz /= 4;
        const rotated = rotatePoly(freehandQuad, -ang, { x: cx, z: cz });
        const rectified = rectifyConvexQuad(rotated);
        // rectify FIRED → bbox ring (different from the real rotated quad)
        const bb = polygonBBox(rotated);
        expect(rectified).toHaveLength(4);
        // The far bbox corner is metres off the real sheared ring.
        const farCorner: Pt = { x: bb.x1, z: bb.z0 };
        const gap = distToRing(farCorner, rotated);
        expect(gap).toBeGreaterThan(1.5);   // the merge-causing divergence the weld can't bridge
    });

    it('projects a bbox-edge partition endpoint onto the REAL shell (within 20 mm of the ring)', () => {
        const ang = principalAxisAngle(freehandQuad);
        let cx = 0, cz = 0; for (const p of freehandQuad) { cx += p.x; cz += p.z; } cx /= 4; cz /= 4;
        const rotated = rotatePoly(freehandQuad, -ang, { x: cx, z: cz });
        const bb = polygonBBox(rotated);

        // A vertical interior partition tiled in the rectified bbox: both ends on the
        // top/bottom bbox edge at some interior x. This is exactly what subdivide emits.
        const xMid = (bb.x0 + bb.x1) / 2;
        const part: TestWall = {
            start: pmm(xMid, bb.z0),    // on the BOTTOM bbox edge
            end: pmm(xMid, bb.z1),      // on the TOP bbox edge
            isExternal: false,
        };
        const before = part;
        const [after] = projectPartitionEndpointsToShell([before], rotated) as TestWall[];

        // BOTH endpoints now land on the REAL rotated shell ring (within the detector grid).
        const sM: Pt = { x: after!.start.x / 1000, z: after!.start.y / 1000 };
        const eM: Pt = { x: after!.end.x / 1000, z: after!.end.y / 1000 };
        expect(distToRing(sM, rotated)).toBeLessThan(0.02);
        expect(distToRing(eM, rotated)).toBeLessThan(0.02);
        // The x is preserved (the vertical partition stays vertical → meets the perimeter
        // at the same plan position, not slid sideways).
        expect(sM.x).toBeCloseTo(xMid, 6);
        expect(eM.x).toBeCloseTo(xMid, 6);
    });

    it('§RECTIFY-PROJECT-CAP — closes a >3 m PERPENDICULAR gap the old 3.0 m cap rejected', () => {
        // A strongly-sheared parallelogram (fill 0.75 → rectifies): bottom edge (0,0)-(12,0),
        // top (4,8)-(16,8); the right edge (12,0)-(16,8) is the lower boundary for x∈[12,16].
        // A vertical partition at x=14 tiled across the bbox has its BOTTOM end on the bbox
        // bottom (z=0); the real shell's lower boundary there (the right edge) is at z=4 → the
        // INWARD up-cast must travel 4 m. The old maxMoveM=3.0 REJECTED that (stranding the
        // endpoint ~4 m off the shell → open seam → room merge, the founder's §RECTIFY defect);
        // the bbox-sized cap accepts it. (Engine-frame coords — no rotation needed for the unit.)
        const para: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 16, z: 8 }, { x: 4, z: 8 }];
        const part: TestWall = { start: pmm(14, 0), end: pmm(14, 8), isExternal: false };
        const [after] = projectPartitionEndpointsToShell([part], para) as TestWall[];
        const sM: Pt = { x: after!.start.x / 1000, z: after!.start.y / 1000 };
        // The bottom end now lands on the REAL shell (the right edge), having moved > 3 m.
        expect(distToRing(sM, para)).toBeLessThan(0.02);
        expect(sM.z).toBeGreaterThan(3.0);              // moved past the old cap (≈ 4 m)
        expect(sM.x).toBeCloseTo(14, 6);                // vertical partition stays vertical
        // The explicit opts.maxMoveM override still clamps (regression guard for the opt).
        const [clamped] = projectPartitionEndpointsToShell([part], para, { maxMoveM: 3.0 }) as TestWall[];
        expect(clamped!.start.y / 1000).toBeCloseTo(0, 6);   // 4 m > 3 m cap → NOT moved
    });

    it('leaves a GENUINELY INTERIOR endpoint (metres from any bbox edge) untouched', () => {
        const ang = principalAxisAngle(freehandQuad);
        let cx = 0, cz = 0; for (const p of freehandQuad) { cx += p.x; cz += p.z; } cx /= 4; cz /= 4;
        const rotated = rotatePoly(freehandQuad, -ang, { x: cx, z: cz });
        const bb = polygonBBox(rotated);

        // An interior junction at the bbox centre — far from every edge.
        const interior = pmm((bb.x0 + bb.x1) / 2, (bb.z0 + bb.z1) / 2);
        const part: TestWall = { start: interior, end: pmm(bb.x0, (bb.z0 + bb.z1) / 2), isExternal: false };
        const [after] = projectPartitionEndpointsToShell([part], rotated) as TestWall[];
        // The interior end is unchanged; only the bbox-left end (start of edge) moves.
        expect(after!.start).toEqual(interior);
    });

    // ── HARD SAFETY GATE (a): axis-aligned plate → BYTE-IDENTICAL ──────────────────
    it('axis-aligned rectangle does NOT rectify → walls returned UNCHANGED (same reference)', () => {
        const rect: Pt[] = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 8 }, { x: 0, z: 8 }];
        const walls: TestWall[] = [
            { start: pmm(5, 0), end: pmm(5, 8), isExternal: false },   // a partition ON the perimeter
            { start: pmm(0, 4), end: pmm(10, 4), isExternal: false },
        ];
        const out = projectPartitionEndpointsToShell(walls, rect);
        // Reference-identity: the helper short-circuits when the shell isn't rectified.
        expect(out).toBe(walls);
    });

    // ── HARD SAFETY GATE (b): apartment-class plates never rectify → unaffected ────
    it('apartment-class concave L-shape does NOT rectify → walls returned UNCHANGED', () => {
        const L: Pt[] = [
            { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 6 },
            { x: 6, z: 6 }, { x: 6, z: 10 }, { x: 0, z: 10 },
        ];
        const walls: TestWall[] = [{ start: pmm(3, 0), end: pmm(3, 10), isExternal: false }];
        expect(projectPartitionEndpointsToShell(walls, L)).toBe(walls);
    });

    it('a sub-fill sheared quad (below the 0.5 rectify floor) → walls UNCHANGED', () => {
        // bbox 14×6, quad area 24 → fill 0.286 < 0.5 → rectifyConvexQuad is a no-op.
        const thin: Pt[] = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 14, z: 6 }, { x: 10, z: 6 }];
        const walls: TestWall[] = [{ start: pmm(2, 0), end: pmm(12, 6), isExternal: false }];
        expect(projectPartitionEndpointsToShell(walls, thin)).toBe(walls);
    });

    it('NEVER moves an EXTERNAL/perimeter wall (would shift window offsets)', () => {
        const ang = principalAxisAngle(freehandQuad);
        let cx = 0, cz = 0; for (const p of freehandQuad) { cx += p.x; cz += p.z; } cx /= 4; cz /= 4;
        const rotated = rotatePoly(freehandQuad, -ang, { x: cx, z: cz });
        const bb = polygonBBox(rotated);
        // An external wall sitting on the bbox bottom edge — must pass through untouched.
        const ext: TestWall = { start: pmm(bb.x0, bb.z0), end: pmm(bb.x1, bb.z0), isExternal: true };
        const [after] = projectPartitionEndpointsToShell([ext], rotated) as TestWall[];
        expect(after!.start).toEqual(ext.start);
        expect(after!.end).toEqual(ext.end);
    });
});
