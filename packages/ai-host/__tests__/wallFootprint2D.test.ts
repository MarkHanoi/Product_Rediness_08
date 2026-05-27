// WallFootprint2D — Pascal-style footprint polygon (ADR-0055 P2) unit tests.
// Asserts polygon shape (4/5/6 verts), CCW winding, the end-swap convention,
// and — most importantly — the EDGE-COINCIDENCE invariant: adjacent walls'
// polygons share their boundary vertices, so the L/T/X void disappears.

import { describe, expect, it } from 'vitest';
import { resolveJunctions, type WallInput, type Pt2 } from '../../geometry-wall/src/JunctionResolverV2.js';
import { buildAllFootprints, buildWallFootprint } from '../../geometry-wall/src/WallFootprint2D.js';

const closePt = (p: Pt2, q: Pt2, eps = 1e-6): boolean =>
    Math.abs(p.x - q.x) < eps && Math.abs(p.z - q.z) < eps;

/** Shoelace area — positive ⇒ CCW in plan-XZ when Y points up. */
function signedArea(poly: readonly Pt2[]): number {
    let s = 0;
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        s += a.x * b.z - b.x * a.z;
    }
    return s / 2;
}

const T = 0.2;
const HALF = T / 2;

// ─── Free wall (no junctions) — 4-vertex rectangle, square caps ──────────────

describe('WallFootprint2D — free wall (no junctions)', () => {
    const wall: WallInput = { id: 'A', start: { x: 0, z: 0 }, end: { x: 5, z: 0 }, thickness: T };

    it('produces a 4-vertex axis-aligned rectangle', () => {
        const fp = buildWallFootprint(wall, null);
        expect(fp.polygon).toHaveLength(4);
        const pts = fp.polygon;
        const xs = [...pts].map(p => p.x).sort((a, b) => a - b);
        const zs = [...pts].map(p => p.z).sort((a, b) => a - b);
        expect(xs[0]).toBeCloseTo(0);
        expect(xs[3]).toBeCloseTo(5);
        expect(zs[0]).toBeCloseTo(-HALF);
        expect(zs[3]).toBeCloseTo(+HALF);
    });

    it('is CCW (positive signed area)', () => {
        const fp = buildWallFootprint(wall, null);
        expect(signedArea(fp.polygon)).toBeGreaterThan(0);
    });
});

// ─── L-junction (2 walls @ 90°): the simplest case showing edge-coincidence ──

describe('WallFootprint2D — L-junction (90°)', () => {
    // Wall A: (0,0)→(5,0). Wall B: (5,0)→(5,5).
    const walls: WallInput[] = [
        { id: 'A', start: { x: 0, z: 0 }, end: { x: 5, z: 0 }, thickness: T },
        { id: 'B', start: { x: 5, z: 0 }, end: { x: 5, z: 5 }, thickness: T },
    ];

    it('wall A: 5-vertex polygon with end-pivot at (5,0); polygon is CCW', () => {
        const miters = resolveJunctions(walls);
        const fp = buildAllFootprints(walls, miters)[0]!;
        expect(fp.polygon).toHaveLength(5);
        // The end pivot vertex sits exactly on the junction centre.
        const hasPivot = fp.polygon.some(p => closePt(p, { x: 5, z: 0 }));
        expect(hasPivot).toBe(true);
        expect(signedArea(fp.polygon)).toBeGreaterThan(0);
    });

    it('wall B: 5-vertex polygon with start-pivot at (5,0); polygon is CCW', () => {
        const miters = resolveJunctions(walls);
        const fp = buildAllFootprints(walls, miters)[1]!;
        expect(fp.polygon).toHaveLength(5);
        const hasPivot = fp.polygon.some(p => closePt(p, { x: 5, z: 0 }));
        expect(hasPivot).toBe(true);
        expect(signedArea(fp.polygon)).toBeGreaterThan(0);
    });

    it('EDGE-COINCIDENCE: A & B share THREE vertices on the L-junction edge', () => {
        // Pascal invariant: at the junction, the inside corner, the pivot, and the
        // outside corner all appear in BOTH wall polygons. There is no void.
        const miters = resolveJunctions(walls);
        const [fpA, fpB] = buildAllFootprints(walls, miters);
        const sharedCount = fpA!.polygon.filter(p => fpB!.polygon.some(q => closePt(p, q))).length;
        expect(sharedCount).toBe(3);
        // Specifically: outside corner (5+halfT, -halfT), pivot (5, 0), inside corner (5-halfT, halfT).
        const expectAllPresent = (poly: readonly Pt2[]) => {
            expect(poly.some(p => closePt(p, { x: 5 + HALF, z: -HALF }))).toBe(true); // outside
            expect(poly.some(p => closePt(p, { x: 5,        z: 0     }))).toBe(true); // pivot
            expect(poly.some(p => closePt(p, { x: 5 - HALF, z: +HALF }))).toBe(true); // inside
        };
        expectAllPresent(fpA!.polygon);
        expectAllPresent(fpB!.polygon);
    });

    it('end-swap convention: wall A\'s INSIDE corner (top side) is stored as endLeft in wall-frame', () => {
        const miters = resolveJunctions(walls);
        const fp = buildAllFootprints(walls, miters)[0]!;
        // Wall A goes along +X with top side at +z. The inside corner of the L is at top-right of A,
        // i.e. on A's LEFT (wall-frame). The polygon should contain (5-halfT, +halfT) on its top edge.
        const insideCorner = fp.polygon.find(p => Math.abs(p.x - (5 - HALF)) < 1e-6 && Math.abs(p.z - HALF) < 1e-6);
        expect(insideCorner).toBeDefined();
    });
});

// ─── T-junction (3 walls — passthrough A + abutting B) ───────────────────────

describe('WallFootprint2D — T-junction (passthrough)', () => {
    const walls: WallInput[] = [
        { id: 'A', start: { x: 0, z: 0 }, end: { x: 10, z: 0 }, thickness: T },
        { id: 'B', start: { x: 5, z: 0 }, end: { x: 5,  z: 5 }, thickness: T },
    ];

    it('passthrough wall A retains its 4-vertex rectangle (NOT modified)', () => {
        const miters = resolveJunctions(walls);
        const fpA = buildAllFootprints(walls, miters)[0]!;
        expect(fpA.polygon).toHaveLength(4);
    });

    it('abutting wall B gets a 5-vertex polygon hinging on (5,0); BOTH corners sit on A\'s face', () => {
        const miters = resolveJunctions(walls);
        const fpB = buildAllFootprints(walls, miters)[1]!;
        expect(fpB.polygon).toHaveLength(5);
        // pivot at (5, 0)
        expect(fpB.polygon.some(p => closePt(p, { x: 5, z: 0 }))).toBe(true);
        // BOTH start corners sit on A's TOP face (z = +halfT, the side facing B's body).
        const startCornersOnAtop = fpB.polygon.filter(p => Math.abs(p.z - HALF) < 1e-6);
        expect(startCornersOnAtop).toHaveLength(2);
        const xs = startCornersOnAtop.map(p => p.x).sort((a, b) => a - b);
        expect(xs[0]).toBeCloseTo(5 - HALF);
        expect(xs[1]).toBeCloseTo(5 + HALF);
    });

    it('EDGE-COINCIDENCE: B\'s start corners lie on A\'s top edge (perfect butt-joint)', () => {
        const miters = resolveJunctions(walls);
        const [fpA, fpB] = buildAllFootprints(walls, miters);
        // A is a rectangle whose top edge is the segment z = +halfT, x ∈ [0,10].
        // B's start corners must lie on that segment.
        const bStartCorners = fpB!.polygon.filter(p => Math.abs(p.z - HALF) < 1e-6);
        for (const p of bStartCorners) {
            // The point lies in A's polygon footprint band (top side).
            expect(p.z).toBeCloseTo(HALF);
            expect(p.x).toBeGreaterThanOrEqual(0);
            expect(p.x).toBeLessThanOrEqual(10);
        }
        expect(fpA!.polygon).toHaveLength(4); // unchanged
    });
});

// ─── X-junction (4 walls) ─────────────────────────────────────────────────────

describe('WallFootprint2D — X-junction', () => {
    const walls: WallInput[] = [
        { id: 'E', start: { x: 0, z: 0 }, end: { x: 5,  z: 0  }, thickness: T },
        { id: 'N', start: { x: 0, z: 0 }, end: { x: 0,  z: 5  }, thickness: T },
        { id: 'W', start: { x: 0, z: 0 }, end: { x: -5, z: 0  }, thickness: T },
        { id: 'S', start: { x: 0, z: 0 }, end: { x: 0,  z: -5 }, thickness: T },
    ];

    it('every wall gets a 5-vertex polygon (start at the X)', () => {
        const miters = resolveJunctions(walls);
        const fps = buildAllFootprints(walls, miters);
        for (const fp of fps) expect(fp.polygon).toHaveLength(5);
    });

    it('every wall polygon contains the X centre as its start pivot', () => {
        const miters = resolveJunctions(walls);
        const fps = buildAllFootprints(walls, miters);
        for (const fp of fps) expect(fp.polygon.some(p => closePt(p, { x: 0, z: 0 }))).toBe(true);
    });

    it('all four walls are CCW', () => {
        const miters = resolveJunctions(walls);
        const fps = buildAllFootprints(walls, miters);
        for (const fp of fps) expect(signedArea(fp.polygon)).toBeGreaterThan(0);
    });

    it('EDGE-COINCIDENCE: adjacent walls share 2 corners (inside + pivot) at the X', () => {
        const miters = resolveJunctions(walls);
        const fps = buildAllFootprints(walls, miters);
        const byId = new Map(fps.map(f => [f.id, f]));
        const pairs: Array<readonly [string, string]> = [['E', 'N'], ['N', 'W'], ['W', 'S'], ['S', 'E']];
        for (const [a, b] of pairs) {
            const A = byId.get(a)!, B = byId.get(b)!;
            const shared = A.polygon.filter(p => B.polygon.some(q => closePt(p, q))).length;
            expect(shared, `${a}↔${b}`).toBeGreaterThanOrEqual(2);
        }
    });
});

// ─── Closed rectangular room (4 walls forming a loop) ────────────────────────

describe('WallFootprint2D — closed 4-wall rectangle', () => {
    const walls: WallInput[] = [
        { id: 'S', start: { x: 0,  z: 0 }, end: { x: 10, z: 0 }, thickness: T },
        { id: 'E', start: { x: 10, z: 0 }, end: { x: 10, z: 6 }, thickness: T },
        { id: 'N', start: { x: 10, z: 6 }, end: { x: 0,  z: 6 }, thickness: T },
        { id: 'W', start: { x: 0,  z: 6 }, end: { x: 0,  z: 0 }, thickness: T },
    ];

    it('every wall is a 6-vertex polygon (both ends at L-junctions)', () => {
        const miters = resolveJunctions(walls);
        const fps = buildAllFootprints(walls, miters);
        for (const fp of fps) expect(fp.polygon).toHaveLength(6);
    });

    it('all CCW, all share 3 vertices with each adjacent wall — no void anywhere', () => {
        const miters = resolveJunctions(walls);
        const fps = buildAllFootprints(walls, miters);
        for (const fp of fps) expect(signedArea(fp.polygon)).toBeGreaterThan(0);
        const byId = new Map(fps.map(f => [f.id, f]));
        const pairs: Array<readonly [string, string]> = [['S', 'E'], ['E', 'N'], ['N', 'W'], ['W', 'S']];
        for (const [a, b] of pairs) {
            const A = byId.get(a)!, B = byId.get(b)!;
            const shared = A.polygon.filter(p => B.polygon.some(q => closePt(p, q))).length;
            expect(shared, `${a}↔${b}`).toBe(3);   // outside + pivot + inside
        }
    });
});

// ─── Determinism ──────────────────────────────────────────────────────────────

describe('WallFootprint2D — determinism', () => {
    it('two runs over the same input produce byte-identical polygons', () => {
        const walls: WallInput[] = [
            { id: 'A', start: { x: 0, z: 0 }, end: { x: 5, z: 0 }, thickness: T },
            { id: 'B', start: { x: 5, z: 0 }, end: { x: 5, z: 5 }, thickness: T },
            { id: 'C', start: { x: 5, z: 5 }, end: { x: 0, z: 5 }, thickness: T },
        ];
        const a = buildAllFootprints(walls, resolveJunctions(walls));
        const b = buildAllFootprints(walls, resolveJunctions(walls));
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });
});
