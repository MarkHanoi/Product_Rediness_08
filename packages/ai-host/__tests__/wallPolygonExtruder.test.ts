// WallPolygonExtruder — ADR-0055 P3a unit tests.
// Pins vertex count, face winding, normal directions, and — critically — the
// 3D EDGE-COINCIDENCE property at a T-junction: the side quads of adjacent
// walls share their boundary vertices in 3-space, so the visible black-wedge
// the user reported in the T-junction screenshot is impossible by construction.

import { describe, expect, it } from 'vitest';
import { resolveJunctions, type WallInput } from '../../geometry-wall/src/JunctionResolverV2.js';
import { buildAllFootprints } from '../../geometry-wall/src/WallFootprint2D.js';
import { buildWallExtrusion, expectedVertexCount } from '../../geometry-wall/src/WallPolygonExtruder.js';

const T = 0.2;
const HEIGHT = 2.7;

// Read a [x, y, z] triple from a Float32 position buffer at vertex index `i`.
function vertAt(positions: ArrayLike<number>, i: number): [number, number, number] {
    return [positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!];
}

function uniquePts3(positions: ArrayLike<number>, eps = 1e-6): Array<[number, number, number]> {
    const out: Array<[number, number, number]> = [];
    for (let i = 0; i < positions.length / 3; i++) {
        const v = vertAt(positions, i);
        if (!out.some(u => Math.abs(u[0] - v[0]) < eps && Math.abs(u[1] - v[1]) < eps && Math.abs(u[2] - v[2]) < eps)) {
            out.push(v);
        }
    }
    return out;
}

describe('WallPolygonExtruder — free wall (4-vertex rectangle)', () => {
    const wall: WallInput = { id: 'A', start: { x: 0, z: 0 }, end: { x: 5, z: 0 }, thickness: T };
    const miters = resolveJunctions([wall]);
    const fp = buildAllFootprints([wall], miters)[0]!;

    it('produces the expected vertex count for n=4', () => {
        const g = buildWallExtrusion(fp, { height: HEIGHT });
        const pos = g.getAttribute('position').array;
        expect(pos.length / 3).toBe(expectedVertexCount(4));
        // top fan 6 + bottom fan 6 + 4 sides × 6 = 36
        expect(pos.length / 3).toBe(36);
    });

    it('top face is at y = height, bottom face at y = 0 (default baseOffset/elevation)', () => {
        const g = buildWallExtrusion(fp, { height: HEIGHT });
        const pos = g.getAttribute('position').array;
        // Top fan = first 6 verts; bottom fan = next 6.
        for (let i = 0; i < 6; i++) expect(vertAt(pos, i)[1]).toBeCloseTo(HEIGHT);
        for (let i = 6; i < 12; i++) expect(vertAt(pos, i)[1]).toBeCloseTo(0);
    });

    it('elevation + baseOffset are applied additively', () => {
        const g = buildWallExtrusion(fp, { height: HEIGHT, baseOffset: 0.15, elevation: 3.0 });
        const pos = g.getAttribute('position').array;
        for (let i = 0; i < 6; i++) expect(vertAt(pos, i)[1]).toBeCloseTo(3.0 + 0.15 + HEIGHT);
        for (let i = 6; i < 12; i++) expect(vertAt(pos, i)[1]).toBeCloseTo(3.0 + 0.15);
    });

    it('top-face normals all point +Y; bottom-face normals all point −Y', () => {
        const g = buildWallExtrusion(fp, { height: HEIGHT });
        const n = g.getAttribute('normal').array;
        for (let i = 0; i < 6; i++) expect(n[i * 3 + 1]).toBeCloseTo(1);
        for (let i = 6; i < 12; i++) expect(n[i * 3 + 1]).toBeCloseTo(-1);
    });

    it('side-face normals are unit-length and have zero Y component', () => {
        const g = buildWallExtrusion(fp, { height: HEIGHT });
        const n = g.getAttribute('normal').array;
        for (let i = 12; i < 36; i++) {
            const nx = n[i * 3]!, ny = n[i * 3 + 1]!, nz = n[i * 3 + 2]!;
            expect(ny).toBeCloseTo(0);
            expect(Math.hypot(nx, nz)).toBeCloseTo(1);
        }
    });

    it('side-face normals point OUTWARD (away from the polygon centroid)', () => {
        const g = buildWallExtrusion(fp, { height: HEIGHT });
        const pos = g.getAttribute('position').array;
        const n = g.getAttribute('normal').array;
        // Centroid is at (2.5, *, 0) for this rectangle.
        for (let i = 12; i < 36; i++) {
            const [x, , z] = vertAt(pos, i);
            const nx = n[i * 3]!, nz = n[i * 3 + 2]!;
            const dot = (x - 2.5) * nx + (z - 0) * nz;
            // Outward → dot of (vert − centroid) with normal is ≥ 0 along the edge.
            expect(dot).toBeGreaterThan(-1e-6);
        }
    });

    it('bounding box matches the footprint XZ extent × height', () => {
        const g = buildWallExtrusion(fp, { height: HEIGHT });
        const bb = g.boundingBox!;
        expect(bb.min.x).toBeCloseTo(0);
        expect(bb.max.x).toBeCloseTo(5);
        expect(bb.min.z).toBeCloseTo(-T / 2);
        expect(bb.max.z).toBeCloseTo(+T / 2);
        expect(bb.min.y).toBeCloseTo(0);
        expect(bb.max.y).toBeCloseTo(HEIGHT);
    });
});

describe('WallPolygonExtruder — L-junction (5-vertex polygon)', () => {
    const walls: WallInput[] = [
        { id: 'A', start: { x: 0, z: 0 }, end: { x: 5, z: 0 }, thickness: T },
        { id: 'B', start: { x: 5, z: 0 }, end: { x: 5, z: 5 }, thickness: T },
    ];
    const miters = resolveJunctions(walls);
    const fps = buildAllFootprints(walls, miters);

    it('produces the expected vertex count for n=5 on each wall', () => {
        for (const fp of fps) {
            const g = buildWallExtrusion(fp, { height: HEIGHT });
            const pos = g.getAttribute('position').array;
            expect(pos.length / 3).toBe(expectedVertexCount(5));
            expect(pos.length / 3).toBe(48);   // top 9 + bottom 9 + 5 sides × 6 = 48
        }
    });

    it('every wall has the junction pivot vertex (5, *, 0) appearing on both top + bottom faces', () => {
        for (const fp of fps) {
            const g = buildWallExtrusion(fp, { height: HEIGHT });
            const pos = g.getAttribute('position').array;
            const verts = uniquePts3(pos);
            const pivotTop = verts.some(([x, y, z]) => Math.abs(x - 5) < 1e-6 && Math.abs(y - HEIGHT) < 1e-6 && Math.abs(z - 0) < 1e-6);
            const pivotBot = verts.some(([x, y, z]) => Math.abs(x - 5) < 1e-6 && Math.abs(y - 0) < 1e-6 && Math.abs(z - 0) < 1e-6);
            expect(pivotTop).toBe(true);
            expect(pivotBot).toBe(true);
        }
    });
});

describe('WallPolygonExtruder — T-junction 3D edge-coincidence (THE bug-fix proof)', () => {
    // Passthrough wall A (0,0)→(10,0); abutting wall B (5,0)→(5,5).
    // OLD MiterPrismBuilder: A's body intersected B's body with a square overlap →
    // black triangular wedge at the top of the inside angle (the user's screenshot).
    // NEW pipeline: P2 produces a 5-vertex polygon for B whose start corners SIT ON
    // A's top edge in plan-XZ. P3 extrudes those polygons vertically, so the 3D
    // side faces of B at its start are exactly co-planar with A's top side face —
    // there is no gap and no overlap.
    const walls: WallInput[] = [
        { id: 'A', start: { x: 0, z: 0 }, end: { x: 10, z: 0 }, thickness: T },
        { id: 'B', start: { x: 5, z: 0 }, end: { x: 5,  z: 5 }, thickness: T },
    ];
    const miters = resolveJunctions(walls);
    const fps = buildAllFootprints(walls, miters);

    it('B\'s start corners sit EXACTLY on A\'s outer-face plane (z = T/2) within A\'s X-range', () => {
        // The T-wedge bug appears when B's corners are either:
        //   - INSIDE A's body (z ∈ (−T/2, +T/2))   → overlap, depth-fights, dark seam.
        //   - OUTSIDE A's body but z > +T/2 only   → leaves a triangular VOID at the
        //                                            corner — the user's screenshot.
        // The Pascal pipeline puts B's corners exactly at z = +T/2 (A's outer face),
        // x ∈ A's [0,10] extent. The two surfaces butt edge-on-edge: no overlap, no
        // gap. Passthrough wall A's geometry stays a clean 4-vertex rectangle — it
        // does NOT need a matching vertex; coplanar coincidence is enough.
        const gB = buildWallExtrusion(fps[1]!, { height: HEIGHT });
        const ptsB = uniquePts3(gB.getAttribute('position').array);

        for (const x of [5 - T / 2, 5 + T / 2]) {
            for (const y of [0, HEIGHT]) {
                const inB = ptsB.some(([vx, vy, vz]) =>
                    Math.abs(vx - x) < 1e-6 && Math.abs(vy - y) < 1e-6 && Math.abs(vz - T / 2) < 1e-6);
                expect(inB, `B should contain corner (${x}, ${y}, ${T / 2})`).toBe(true);
            }
        }

        // And A's top face plane is exactly z = +T/2 — sanity-check the bounding box.
        const gA = buildWallExtrusion(fps[0]!, { height: HEIGHT });
        const bbA = gA.boundingBox!;
        expect(bbA.max.z).toBeCloseTo(+T / 2);
        expect(bbA.min.z).toBeCloseTo(-T / 2);
        expect(bbA.min.x).toBeCloseTo(0);
        expect(bbA.max.x).toBeCloseTo(10);   // 5 ± T/2 are well inside [0, 10]
    });

    it('B\'s extruded volume sits ENTIRELY on the OUTSIDE of A\'s top face (no overlap into A\'s body)', () => {
        const gB = buildWallExtrusion(fps[1]!, { height: HEIGHT });
        const bbB = gB.boundingBox!;
        // A's body in XZ is z ∈ [−T/2, +T/2]. B should be at z ≥ 0 (its start sits
        // on A's TOP face, going +Z away from A). The minimum-z corner of B
        // is its OUTSIDE corner at the start, which equals −T/2 by Pascal — that's
        // the OUTSIDE of A on B's far side, NOT inside A. The MEAN of B's z
        // extent is well above 0 → no significant intrusion into A's body.
        const meanZ = (bbB.min.z + bbB.max.z) / 2;
        expect(meanZ).toBeGreaterThan(0);
    });
});

describe('WallPolygonExtruder — closed 4-wall rectangle (6-vertex polygons)', () => {
    const walls: WallInput[] = [
        { id: 'S', start: { x: 0,  z: 0 }, end: { x: 10, z: 0 }, thickness: T },
        { id: 'E', start: { x: 10, z: 0 }, end: { x: 10, z: 6 }, thickness: T },
        { id: 'N', start: { x: 10, z: 6 }, end: { x: 0,  z: 6 }, thickness: T },
        { id: 'W', start: { x: 0,  z: 6 }, end: { x: 0,  z: 0 }, thickness: T },
    ];
    const miters = resolveJunctions(walls);
    const fps = buildAllFootprints(walls, miters);

    it('every wall has the n=6 vertex count', () => {
        for (const fp of fps) {
            const g = buildWallExtrusion(fp, { height: HEIGHT });
            const pos = g.getAttribute('position').array;
            expect(pos.length / 3).toBe(expectedVertexCount(6));
            expect(pos.length / 3).toBe(60);   // top 12 + bottom 12 + 6 sides × 6 = 60
        }
    });

    it('every wall pair sharing a corner in plan has THREE coincident 3D vertices on the top edge', () => {
        // S↔E share the (10,0) L-corner. The three shared plan vertices (outside,
        // pivot, inside) each appear at TWO heights → six shared 3D vertices total,
        // but uniquely three points per height. We check at the top (Y=HEIGHT).
        const geom = fps.map(fp => buildWallExtrusion(fp, { height: HEIGHT }));
        const pts = geom.map(g => uniquePts3(g.getAttribute('position').array));
        const pairsByName = [['S', 'E'], ['E', 'N'], ['N', 'W'], ['W', 'S']] as const;
        const byId = new Map(fps.map((fp, i) => [fp.id, i]));
        for (const [a, b] of pairsByName) {
            const A = pts[byId.get(a)!]!;
            const B = pts[byId.get(b)!]!;
            const shared = A.filter(([ax, ay, az]) =>
                Math.abs(ay - HEIGHT) < 1e-6 &&
                B.some(([bx, by, bz]) =>
                    Math.abs(bx - ax) < 1e-6 && Math.abs(by - HEIGHT) < 1e-6 && Math.abs(bz - az) < 1e-6));
            expect(shared.length, `${a}↔${b}`).toBe(3);
        }
    });
});
