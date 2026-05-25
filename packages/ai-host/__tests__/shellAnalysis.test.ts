// Apartment Layout Generator — shell analysis contract tests (SPEC §5, A3).

import { describe, expect, it } from 'vitest';
import {
    analyseShell,
    wallsToPolygon,
    polygonAreaM2,
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
