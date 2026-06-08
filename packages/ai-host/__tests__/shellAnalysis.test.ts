// Apartment Layout Generator — shell analysis contract tests (SPEC §5, A3).

import { describe, expect, it } from 'vitest';
import {
    analyseShell,
    wallsToPolygon,
    polygonAreaM2,
    classifyPerimeter,
    type ShellWallInput,
} from '../src/workflows/apartmentLayout/shellAnalysis.js';

// A 10 × 8 m rectangular shell (world X-Z). Walls given in mixed orientation to
// exercise the endpoint-chaining (not pre-ordered head-to-tail).
const NORTH: ShellWallInput = { id: 'n', baseLine: [{ x: 0, z: 0 }, { x: 10, z: 0 }] };
const EAST: ShellWallInput = { id: 'e', baseLine: [{ x: 10, z: 0 }, { x: 10, z: 8 }] };
const SOUTH: ShellWallInput = { id: 's', baseLine: [{ x: 10, z: 8 }, { x: 0, z: 8 }] };
const WEST: ShellWallInput = { id: 'w', baseLine: [{ x: 0, z: 8 }, { x: 0, z: 0 }] };

describe('wallsToPolygon + polygonAreaM2', () => {
    it('chains 4 walls into a 4-vertex ring and computes 80 m²', () => {
        const poly = wallsToPolygon([NORTH, EAST, SOUTH, WEST]);
        expect(poly).toHaveLength(4);
        expect(polygonAreaM2(poly)).toBeCloseTo(80, 5);
    });
    it('chains walls given out of order', () => {
        const poly = wallsToPolygon([NORTH, SOUTH, EAST, WEST]);
        expect(polygonAreaM2(poly)).toBeCloseTo(80, 5);
    });
});

describe('classifyPerimeter (§PERIMETER-CLASS — Phase 1 / v3.0 §2)', () => {
    const ring = (pts: Array<[number, number]>) => pts.map(([x, z]) => ({ x, z }));

    it('a 10×8 rectangle is CONVEX-RECT (4 corners, 0 reflex)', () => {
        const c = classifyPerimeter(ring([[0, 0], [10, 0], [10, 8], [0, 8]]));
        expect(c.class).toBe('CONVEX-RECT');
        expect(c.corners).toBe(4);
        expect(c.reflexCorners).toBe(0);
        expect(c.aspect).toBeCloseTo(1.25, 5);
    });

    it('a very elongated 30×8 rectangle is CONVEX-POLY (aspect > 3:1)', () => {
        const c = classifyPerimeter(ring([[0, 0], [30, 0], [30, 8], [0, 8]]));
        expect(c.class).toBe('CONVEX-POLY');
        expect(c.reflexCorners).toBe(0);
        expect(c.aspect).toBeCloseTo(3.75, 5);
    });

    it('collinear edge vertices are simplified away (still CONVEX-RECT)', () => {
        // A midpoint vertex on the north edge must not be counted as a corner.
        const c = classifyPerimeter(ring([[0, 0], [5, 0], [10, 0], [10, 8], [0, 8]]));
        expect(c.class).toBe('CONVEX-RECT');
        expect(c.corners).toBe(4);
    });

    it('an L-shape has exactly 1 reflex corner → L-SHAPE', () => {
        const c = classifyPerimeter(ring([[0, 0], [10, 0], [10, 4], [4, 4], [4, 8], [0, 8]]));
        expect(c.class).toBe('L-SHAPE');
        expect(c.reflexCorners).toBe(1);
    });

    it('a U-shape (top notch) has 2 reflex corners → T-U-SHAPE', () => {
        const c = classifyPerimeter(ring([[0, 0], [10, 0], [10, 8], [6.5, 8], [6.5, 3], [3.5, 3], [3.5, 8], [0, 8]]));
        expect(c.class).toBe('T-U-SHAPE');
        expect(c.reflexCorners).toBe(2);
    });
});

describe('analyseShell (SPEC §5 face classification)', () => {
    const analysis = analyseShell([NORTH, EAST, SOUTH, WEST], {
        entranceWallId: 'n',
        windowCountByWall: { s: 2, e: 1 },          // south = most windows, east = some, west = none
        orientationByWall: { n: 'N', e: 'E', s: 'S', w: 'W' },
    });

    it('derives area + bounding dimensions', () => {
        expect(analysis.netAreaM2).toBeCloseTo(80, 5);
        expect(analysis.widthM).toBeCloseTo(10, 5);
        expect(analysis.depthM).toBeCloseTo(8, 5);
    });

    it('classifies entrance-side / best-light / secondary-light / blind', () => {
        const cls = (id: string) => analysis.faces.find(f => f.wallId === id)!.class;
        expect(cls('n')).toBe('entrance-side'); // hosts the door
        expect(cls('s')).toBe('best-light');    // 2 windows (max)
        expect(cls('e')).toBe('secondary-light'); // 1 window
        expect(cls('w')).toBe('blind');         // no windows
    });

    it('carries SL-3 orientation through to each face', () => {
        expect(analysis.faces.find(f => f.wallId === 's')!.orientation).toBe('S');
    });
});
