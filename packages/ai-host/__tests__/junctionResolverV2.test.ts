// JunctionResolverV2 — Pascal-style miter trimming (ADR-0055 P1) unit tests.
// Pure module; imported via relative path because geometry-wall's barrel pulls
// in THREE/renderer-three which doesn't load in Node.

import { describe, expect, it } from 'vitest';
import {
    resolveJunctions, type WallInput, type Pt2, __internal,
} from '../../geometry-wall/src/JunctionResolverV2.js';
import { buildWallFootprint } from '../../geometry-wall/src/WallFootprint2D.js';

const close = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) < eps;
const closePt = (p: Pt2, q: Pt2, eps = 1e-6): boolean => close(p.x, q.x, eps) && close(p.z, q.z, eps);

describe('JunctionResolverV2 — geometry helpers', () => {
    it('intersectLines: perpendicular axes meet at origin', () => {
        const p = __internal.intersectLines({ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 1 });
        expect(p).not.toBeNull();
        expect(closePt(p!, { x: 0, z: 0 })).toBe(true);
    });

    it('intersectLines: parallel lines return null', () => {
        const p = __internal.intersectLines({ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 0 });
        expect(p).toBeNull();
    });

    it('projectOnSeg: midpoint projection', () => {
        const r = __internal.projectOnSeg({ x: 5, z: 1 }, { x: 0, z: 0 }, { x: 10, z: 0 });
        expect(r.t).toBeCloseTo(0.5);
        expect(closePt(r.foot, { x: 5, z: 0 })).toBe(true);
        expect(r.perpDist).toBeCloseTo(1);
    });

    it('leftPerp: rotates 90° CCW (x → +z)', () => {
        const p = __internal.leftPerp({ x: 1, z: 0 });
        expect(closePt(p, { x: 0, z: 1 })).toBe(true);
    });
});

// ─── L-junction (2 walls at 90°) ──────────────────────────────────────────────

describe('JunctionResolverV2 — L-junction (2 walls)', () => {
    const T = 0.2;          // wall thickness 200 mm
    const HALF = T / 2;

    // Wall A: (0,0)→(5,0). Wall B: (5,0)→(5,5). They share (5,0) — an L-corner.
    const walls: WallInput[] = [
        { id: 'A', start: { x: 0, z: 0 }, end: { x: 5, z: 0 }, thickness: T },
        { id: 'B', start: { x: 5, z: 0 }, end: { x: 5, z: 5 }, thickness: T },
    ];

    it('produces a miter for both walls at the shared corner', () => {
        const r = resolveJunctions(walls);
        expect(r).toHaveLength(2);
        const a = r.find(m => m.id === 'A')!;
        const b = r.find(m => m.id === 'B')!;
        // Wall A's END is at the junction; wall B's START is at the junction.
        expect(a.endLeft).toBeDefined();
        expect(a.endRight).toBeDefined();
        expect(b.startLeft).toBeDefined();
        expect(b.startRight).toBeDefined();
        // Pivot vertex at junction centre.
        expect(closePt(a.endPivot!, { x: 5, z: 0 })).toBe(true);
        expect(closePt(b.startPivot!, { x: 5, z: 0 })).toBe(true);
    });

    it('corners are edge-coincident (Pascal invariant): A.left == B.right at the inside corner', () => {
        const r = resolveJunctions(walls);
        const a = r.find(m => m.id === 'A')!;
        const b = r.find(m => m.id === 'B')!;
        // The SHARED corner: wall A's left side meets wall B's right side. By
        // construction these MUST be the same point (no void between them).
        // (Which side is "shared" depends on the CCW orientation; for this L it
        // is A.endLeft == B.startRight OR A.endRight == B.startLeft.)
        const matches =
            closePt(a.endLeft!,  b.startRight!) || closePt(a.endRight!, b.startLeft!);
        expect(matches).toBe(true);
    });

    it('inside-corner point is offset by exactly halfT from BOTH wall centerlines', () => {
        const r = resolveJunctions(walls);
        const a = r.find(m => m.id === 'A')!;
        // The inside corner sits at (5−halfT, +halfT) for wall A's left side (above A, left of B).
        // Wall A's centerline is z=0; inside-corner z = +halfT (above).
        // Wall B's centerline is x=5; inside-corner x = 5−halfT (left of B).
        const inside = closePt(a.endLeft!, { x: 5 - HALF, z: HALF })
                    || closePt(a.endRight!, { x: 5 - HALF, z: HALF });
        expect(inside).toBe(true);
    });
});

// ─── T-junction (3 walls — one passthrough, one abutting) ─────────────────────

describe('JunctionResolverV2 — T-junction (3 walls, passthrough trick)', () => {
    const T = 0.2;

    // Wall A: passthrough (0,0)→(10,0). Wall B abuts from above at (5,0)→(5,5).
    // Encoded by detecting that B's start lies on A's segment interior.
    const walls: WallInput[] = [
        { id: 'A', start: { x: 0, z: 0 }, end: { x: 10, z: 0 }, thickness: T },
        { id: 'B', start: { x: 5, z: 0 }, end: { x: 5, z:  5 }, thickness: T },
    ];

    it('detects A as a passthrough at B\'s start', () => {
        const j = __internal.detectJunctions(walls, { snapEpsilonM: 0.001, tProjectionEpsilonM: 0.001 });
        expect(j).toHaveLength(1);
        expect(j[0]!.passthroughWalls).toContain(0);  // A's index
        expect(j[0]!.realEndpoints).toHaveLength(1);  // B's start
    });

    it('B\'s start gets BOTH left and right corners (no void to fill)', () => {
        const r = resolveJunctions(walls);
        const b = r.find(m => m.id === 'B')!;
        expect(b.startLeft).toBeDefined();
        expect(b.startRight).toBeDefined();
        expect(b.startPivot).toBeDefined();
        expect(closePt(b.startPivot!, { x: 5, z: 0 })).toBe(true);
        // Inside corners sit on wall A's surface (at z=0±halfT for A's outward side
        // facing into B's body, i.e. z = +halfT since B goes upward).
        // Both corners lie at z = +halfT (the side of A facing B's body).
        expect(b.startLeft!.z).toBeCloseTo(T / 2);
        expect(b.startRight!.z).toBeCloseTo(T / 2);
        // The two corners straddle x=5 by ±halfT (B's width along A).
        const xs = [b.startLeft!.x, b.startRight!.x].sort((a, b) => a - b);
        expect(xs[0]).toBeCloseTo(5 - T / 2);
        expect(xs[1]).toBeCloseTo(5 + T / 2);
    });

    it('the passthrough wall A is NOT modified', () => {
        const r = resolveJunctions(walls);
        const a = r.find(m => m.id === 'A')!;
        expect(a.startLeft).toBeUndefined();
        expect(a.endLeft).toBeUndefined();
        expect(a.startPivot).toBeUndefined();
        expect(a.endPivot).toBeUndefined();
    });
});

// ─── §WALL-BODY-INNER-FACE — partition into a THICKER shell body ──────────────
// Residual of §ONE-FRAME-MINT (2026-06-18): the default-ON V2 pipeline builds the
// partition body from the un-clamped pre-trim baseline (the partition end welded ON
// the shell CENTRELINE). The ring sweep used to write a centreline PIVOT for the
// partition end → the footprint assembler extruded a solid tongue from the shell's
// INNER face down to its CENTRELINE, ~hostHalfThickness deep into/through the shell
// (the founder's "wall extruding wrong / 3D spike"). The fix SUPPRESSES that
// centreline pivot when the passthrough is materially thicker, so the partition
// footprint ends cleanly on the inner-face corners — bit-identical to the legacy
// WallJoinResolver inner-face clamp. Equal-thickness interior T/X junctions still get
// the pivot (proven by the T-junction suite above).
describe('JunctionResolverV2 — §WALL-BODY-INNER-FACE (partition → thicker shell)', () => {
    const TS = 0.20;   // shell thickness (200 mm) — passthrough
    const TP = 0.10;   // partition thickness (100 mm) — abutting
    // Shell S along x at z=0 (inner/room face at z=+0.10). Partition P runs in +z and
    // its joining end is welded to the shell CENTRELINE (z=0).
    const walls: WallInput[] = [
        { id: 'S', start: { x: -3, z: 0 }, end: { x: 3, z: 0 }, thickness: TS },
        { id: 'P', start: { x: 0, z: 3 }, end: { x: 0, z: 0 }, thickness: TP },
    ];

    it('SUPPRESSES the partition end pivot (no centreline tongue) when the host is thicker', () => {
        const r = resolveJunctions(walls);
        const p = r.find(m => m.id === 'P')!;
        // The partition END (z=0) is the joining end. Its corners land on the shell
        // INNER face (z=+halfT_shell = +0.10), but the centreline pivot is gone.
        expect(p.endLeft).toBeDefined();
        expect(p.endRight).toBeDefined();
        expect(p.endPivot).toBeUndefined();              // ← the fix: no centreline pivot
        expect(p.endLeft!.z).toBeCloseTo(TS / 2);        // both corners on the inner face
        expect(p.endRight!.z).toBeCloseTo(TS / 2);
    });

    it('the partition footprint ends ON the inner face (zero overhang past it)', () => {
        const r = resolveJunctions(walls);
        const p = r.find(m => m.id === 'P')!;
        const fp = buildWallFootprint(walls[1]!, p);
        const minZ = Math.min(...fp.polygon.map(pt => pt.z));
        // Inner face is at z=+0.10; without the fix minZ would be 0 (centreline) →
        // 100 mm overhang. With the fix minZ === inner face → 0 mm overhang.
        expect(minZ).toBeCloseTo(TS / 2);
    });

    it('equal-thickness partitions are UNAFFECTED (pivot retained, Pascal edge-coincidence)', () => {
        const equal: WallInput[] = [
            { id: 'S', start: { x: -3, z: 0 }, end: { x: 3, z: 0 }, thickness: TP },
            { id: 'P', start: { x: 0, z: 3 }, end: { x: 0, z: 0 }, thickness: TP },
        ];
        const r = resolveJunctions(equal);
        const p = r.find(m => m.id === 'P')!;
        expect(p.endPivot).toBeDefined();                // equal thickness → pivot stays
        expect(closePt(p.endPivot!, { x: 0, z: 0 })).toBe(true);
    });

    it('escape hatch __pryzmWallPartitionInnerFaceV2=false restores the legacy pivot', () => {
        const g = globalThis as { __pryzmWallPartitionInnerFaceV2?: boolean };
        const prev = g.__pryzmWallPartitionInnerFaceV2;
        g.__pryzmWallPartitionInnerFaceV2 = false;
        try {
            const r = resolveJunctions(walls);
            const p = r.find(m => m.id === 'P')!;
            expect(p.endPivot).toBeDefined();            // flag off → old behaviour (pivot present)
        } finally {
            if (prev === undefined) delete g.__pryzmWallPartitionInnerFaceV2;
            else g.__pryzmWallPartitionInnerFaceV2 = prev;
        }
    });
});

// ─── X-junction (4 walls, all real endpoints) ─────────────────────────────────

describe('JunctionResolverV2 — X-junction (4 walls)', () => {
    const T = 0.2;

    // Four walls fanning out CCW from origin along ±X / ±Z.
    const walls: WallInput[] = [
        { id: 'E', start: { x: 0, z: 0 }, end: { x: 5,  z: 0  }, thickness: T },
        { id: 'N', start: { x: 0, z: 0 }, end: { x: 0,  z: 5  }, thickness: T },
        { id: 'W', start: { x: 0, z: 0 }, end: { x: -5, z: 0  }, thickness: T },
        { id: 'S', start: { x: 0, z: 0 }, end: { x: 0,  z: -5 }, thickness: T },
    ];

    it('every wall start gets both corners + the same pivot at origin', () => {
        const r = resolveJunctions(walls);
        for (const m of r) {
            expect(m.startLeft).toBeDefined();
            expect(m.startRight).toBeDefined();
            expect(closePt(m.startPivot!, { x: 0, z: 0 })).toBe(true);
        }
    });

    it('each corner is offset by halfT from the junction (90° X)', () => {
        const r = resolveJunctions(walls);
        for (const m of r) {
            const dL = Math.hypot(m.startLeft!.x, m.startLeft!.z);
            const dR = Math.hypot(m.startRight!.x, m.startRight!.z);
            expect(dL).toBeCloseTo(T * Math.SQRT2 / 2);  // 45° offset by halfT in each axis → halfT*√2
            expect(dR).toBeCloseTo(T * Math.SQRT2 / 2);
        }
    });

    it('adjacent walls SHARE their boundary corner (Pascal invariant)', () => {
        const r = resolveJunctions(walls);
        const byId = new Map(r.map(m => [m.id, m]));
        // CCW order around origin: E (+X, angle 0), N (+Z, angle π/2), W (-X, π), S (-Z, -π/2).
        // E's LEFT (+Z side) meets N's RIGHT.  N's LEFT (-X side) meets W's RIGHT.  Etc.
        // (The exact mapping of left/right depends on CCW orientation; we just
        // assert that each adjacent pair has ONE shared corner.)
        const pairs: Array<readonly [string, string]> = [['E', 'N'], ['N', 'W'], ['W', 'S'], ['S', 'E']];
        for (const [a, b] of pairs) {
            const ma = byId.get(a)!, mb = byId.get(b)!;
            const corners = [ma.startLeft, ma.startRight];
            const others = [mb.startLeft, mb.startRight];
            const shared = corners.some(c => others.some(o => closePt(c!, o!)));
            expect(shared, `walls ${a} and ${b} must share a corner`).toBe(true);
        }
    });
});

// ─── Oblique angle (60°) — non-perpendicular L ───────────────────────────────

describe('JunctionResolverV2 — oblique L-junction (60° / 120°)', () => {
    const T = 0.2;
    // Wall A horizontal +X. Wall B departs at 60° from the SAME endpoint.
    const a60 = (60 * Math.PI) / 180;
    const walls: WallInput[] = [
        { id: 'A', start: { x: 0, z: 0 }, end: { x: 5, z: 0 }, thickness: T },
        { id: 'B', start: { x: 5, z: 0 }, end: { x: 5 + 5 * Math.cos(a60), z: 5 * Math.sin(a60) }, thickness: T },
    ];

    it('produces non-degenerate corners + shared inside corner', () => {
        const r = resolveJunctions(walls);
        const a = r.find(m => m.id === 'A')!;
        const b = r.find(m => m.id === 'B')!;
        expect(a.endLeft).toBeDefined();
        expect(b.startRight).toBeDefined();
        // Pascal invariant: one of A's end corners equals one of B's start corners.
        const matches =
            closePt(a.endLeft!,  b.startRight!) || closePt(a.endLeft!,  b.startLeft!) ||
            closePt(a.endRight!, b.startRight!) || closePt(a.endRight!, b.startLeft!);
        expect(matches).toBe(true);
    });
});

// ─── Parallel guard — two collinear walls (degenerate) ───────────────────────

describe('JunctionResolverV2 — parallel guard', () => {
    const T = 0.2;
    // Two collinear walls meeting end-to-end. The miter is degenerate (lines
    // are parallel), so the resolver should NOT produce corners — it falls back
    // to perpendicular caps (no corners attached).
    const walls: WallInput[] = [
        { id: 'A', start: { x: 0, z: 0 }, end: { x: 5,  z: 0 }, thickness: T },
        { id: 'B', start: { x: 5, z: 0 }, end: { x: 10, z: 0 }, thickness: T },
    ];

    it('does not crash; produces no corners (parallel directions cancel)', () => {
        const r = resolveJunctions(walls);
        // The junction exists but the two directions are opposite (collinear).
        // After CCW sort the two entries are diametrically opposite; the intersect
        // of curr.leftEdge ∩ next.rightEdge is parallel → no corner attached.
        const a = r.find(m => m.id === 'A')!;
        const b = r.find(m => m.id === 'B')!;
        expect(a.endLeft).toBeUndefined();
        expect(a.endRight).toBeUndefined();
        expect(b.startLeft).toBeUndefined();
        expect(b.startRight).toBeUndefined();
    });
});

// ─── Determinism ──────────────────────────────────────────────────────────────

describe('JunctionResolverV2 — determinism', () => {
    it('two runs over the same input produce byte-identical output', () => {
        const T = 0.2;
        const walls: WallInput[] = [
            { id: 'A', start: { x: 0, z: 0 }, end: { x: 5, z: 0 }, thickness: T },
            { id: 'B', start: { x: 5, z: 0 }, end: { x: 5, z: 5 }, thickness: T },
            { id: 'C', start: { x: 5, z: 5 }, end: { x: 0, z: 5 }, thickness: T },
            { id: 'D', start: { x: 0, z: 5 }, end: { x: 0, z: 0 }, thickness: T },
        ];
        expect(JSON.stringify(resolveJunctions(walls))).toEqual(JSON.stringify(resolveJunctions(walls)));
    });
});
