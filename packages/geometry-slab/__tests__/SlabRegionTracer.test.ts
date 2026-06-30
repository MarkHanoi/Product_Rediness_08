/**
 * §SLAB-REGION-CURVED tests — the slab "By Region" tracer must close a region
 * whose boundary includes a curved/filleted wall, and the resulting polygon must
 * follow the arc (not cut straight across it).
 */
import { describe, it, expect } from 'vitest';
import {
    wallPlanCenterline,
    findRegionAtPoint,
    buildClosedLoops,
    pointInPolygon,
    polygonArea,
    type RegionWallLike,
} from '../src/SlabRegionTracer';

/** Build a straight wall from (x0,z0)→(x1,z1). */
function wall(x0: number, z0: number, x1: number, z1: number): RegionWallLike {
    return { baseLine: [{ x: x0, z: z0 }, { x: x1, z: z1 }] };
}

/** Build a curved wall (quadratic Bézier) via a control point. */
function curvedWall(
    x0: number, z0: number, x1: number, z1: number,
    cx: number, cz: number, segments = 16,
): RegionWallLike {
    return {
        baseLine: [{ x: x0, z: z0 }, { x: x1, z: z1 }],
        curve: { control: { x: cx, z: cz }, segments },
    };
}

describe('wallPlanCenterline', () => {
    it('returns the two endpoints for a straight wall', () => {
        const pts = wallPlanCenterline([{ x: 0, z: 0 }, { x: 4, z: 0 }]);
        expect(pts).toEqual([{ x: 0, y: 0 }, { x: 4, y: 0 }]);
    });

    it('tessellates a curved wall into multiple chords that bow toward the control point', () => {
        // Arc from (0,0)→(4,0) bowing up to z=2 at the apex.
        const pts = wallPlanCenterline([{ x: 0, z: 0 }, { x: 4, z: 0 }], { control: { x: 2, z: 2 }, segments: 8 });
        expect(pts.length).toBeGreaterThan(3);
        // Endpoints preserved.
        expect(pts[0]).toEqual({ x: 0, y: 0 });
        expect(pts[pts.length - 1]).toEqual({ x: 4, y: 0 });
        // The apex sample must bow away from the straight chord (y > 0).
        const apex = pts[Math.floor(pts.length / 2)];
        expect(apex.y).toBeGreaterThan(0.5);
    });

    it('keeps each arc chord longer than the weld tolerance', () => {
        const pts = wallPlanCenterline([{ x: 0, z: 0 }, { x: 6, z: 0 }], { control: { x: 3, z: 1 }, segments: 16 });
        for (let i = 0; i + 1 < pts.length; i++) {
            const d = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
            expect(d).toBeGreaterThan(0.15);
        }
    });
});

describe('findRegionAtPoint — straight rooms (regression)', () => {
    it('closes a simple rectangular room and contains the centre point', () => {
        const walls = [
            wall(0, 0, 6, 0),
            wall(6, 0, 6, 4),
            wall(6, 4, 0, 4),
            wall(0, 4, 0, 0),
        ];
        const region = findRegionAtPoint(walls, 3, 2);
        expect(region).not.toBeNull();
        expect(region!.length).toBeGreaterThanOrEqual(4);
        expect(pointInPolygon({ x: 3, y: 2 }, region!)).toBe(true);
    });

    it('returns null when the click is outside every closed loop', () => {
        const walls = [
            wall(0, 0, 6, 0),
            wall(6, 0, 6, 4),
            wall(6, 4, 0, 4),
            wall(0, 4, 0, 0),
        ];
        expect(findRegionAtPoint(walls, 20, 20)).toBeNull();
    });
});

describe('§SLAB-REGION-CURVED — region bounded by a curved wall', () => {
    // L-shaped-ish room: three straight walls + one curved (filleted) wall on the
    // bottom-right boundary, bowing OUTWARD (away from the room interior).
    //   top:    (0,4) → (6,4)
    //   left:   (0,4) → (0,0)
    //   bottom: (0,0) → (4,0)
    //   curved: (4,0) → (6,4) bowing out via control (6,0)
    const walls = [
        wall(0, 4, 6, 4),
        wall(0, 4, 0, 0),
        wall(0, 0, 4, 0),
        curvedWall(4, 0, 6, 4, 6, 0, 16),
    ];

    it('closes the loop and contains an interior point', () => {
        const region = findRegionAtPoint(walls, 2, 2);
        expect(region).not.toBeNull();
        expect(pointInPolygon({ x: 2, y: 2 }, region!)).toBe(true);
    });

    it('produces a polygon that FOLLOWS the curve, not a straight chord', () => {
        const region = findRegionAtPoint(walls, 2, 2)!;
        // A straight-chord trace would have exactly 4 vertices. The curve adds
        // intermediate samples, so a curve-following region has noticeably more.
        expect(region.length).toBeGreaterThan(5);

        // The curved boundary bows out toward x>~5 between z=0 and z=4. Verify at
        // least one ring vertex lies on that bulge (x > 5, strictly inside the
        // z-span) — impossible for a straight (4,0)→(6,4) chord, whose x at the
        // mid-z is ~5.0 only at the single midpoint, never a run of samples.
        const onBulge = region.filter(
            (p) => p.x > 5.0 && p.y > 0.2 && p.y < 3.8,
        );
        expect(onBulge.length).toBeGreaterThan(1);
    });

    it('encloses MORE area than the straight-chord approximation (the bulge adds area)', () => {
        const curvedRegion = findRegionAtPoint(walls, 2, 2)!;
        const straightWalls = [
            wall(0, 4, 6, 4),
            wall(0, 4, 0, 0),
            wall(0, 0, 4, 0),
            wall(4, 0, 6, 4), // same endpoints, NO curve
        ];
        const straightRegion = findRegionAtPoint(straightWalls, 2, 2)!;
        expect(Math.abs(polygonArea(curvedRegion))).toBeGreaterThan(
            Math.abs(polygonArea(straightRegion)),
        );
    });
});

describe('buildClosedLoops — robustness', () => {
    it('welds near-coincident endpoints (within tolerance) so the room still closes', () => {
        // Corners offset by < 0.15 m — must still be treated as the same node.
        const segments: Array<[{ x: number; y: number }, { x: number; y: number }]> = [
            [{ x: 0, y: 0 }, { x: 4, y: 0 }],
            [{ x: 4.05, y: 0.02 }, { x: 4, y: 4 }],
            [{ x: 4.0, y: 4.04 }, { x: 0.03, y: 4 }],
            [{ x: 0, y: 4.02 }, { x: 0.01, y: 0.01 }],
        ];
        const loops = buildClosedLoops(segments);
        const containing = loops.filter((l) => pointInPolygon({ x: 2, y: 2 }, l));
        expect(containing.length).toBeGreaterThanOrEqual(1);
    });
});
