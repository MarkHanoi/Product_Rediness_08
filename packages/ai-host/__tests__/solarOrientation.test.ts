// A.21.D6 — climate-driven window orientation tests.

import { describe, expect, it } from 'vitest';
import {
    equatorFacingDir,
    outwardNormal,
    orientationFit,
    solarLengthMultiplier,
    type SolarBias,
} from '../src/workflows/apartmentLayout/windowEmission/solarOrientation.js';
import { emitWindowsForRoom } from '../src/workflows/apartmentLayout/windowEmission/emitWindows.js';
import type { ExternalWallSegment } from '../src/workflows/apartmentLayout/windowEmission/types.js';

describe('equatorFacingDir', () => {
    it('northern hemisphere faces South (+y in the emit frame)', () => {
        expect(equatorFacingDir(51)).toEqual({ x: 0, y: 1 });   // London
        expect(equatorFacingDir(37.9)).toEqual({ x: 0, y: 1 }); // Córdoba
    });
    it('southern hemisphere faces North (−y)', () => {
        expect(equatorFacingDir(-33.9)).toEqual({ x: 0, y: -1 }); // Sydney
    });
    it('the equatorial band has no preference', () => {
        expect(equatorFacingDir(0)).toBeNull();
        expect(equatorFacingDir(8)).toBeNull();
        expect(equatorFacingDir(Number.NaN)).toBeNull();
    });
});

describe('outwardNormal', () => {
    it('points AWAY from the room centroid', () => {
        // South wall of a room whose centre is to the north (smaller y).
        const n = outwardNormal({ x: 0, y: 1000 }, { x: 3000, y: 1000 }, { x: 1500, y: 500 });
        expect(n.x).toBeCloseTo(0, 6);
        expect(n.y).toBeCloseTo(1, 6); // outward = +y (south, away from the centre)
    });
    it('degenerate segment → zero vector', () => {
        expect(outwardNormal({ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    });
});

describe('orientationFit', () => {
    it('1 when the normal faces the sun, 0 when it faces away or side-on', () => {
        expect(orientationFit({ x: 0, y: 1 }, { x: 0, y: 1 })).toBeCloseTo(1, 6);
        expect(orientationFit({ x: 0, y: -1 }, { x: 0, y: 1 })).toBe(0);
        expect(orientationFit({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(0); // perpendicular
    });
});

describe('solarLengthMultiplier', () => {
    const south: SolarBias = { sunDir: { x: 0, y: 1 }, roomCentroidMm: { x: 1500, y: 500 }, weight: 0.6 };
    it('is 1 when no bias is supplied (no regression)', () => {
        expect(solarLengthMultiplier({ x: 0, y: 1000 }, { x: 3000, y: 1000 }, null)).toBe(1);
        expect(solarLengthMultiplier({ x: 0, y: 1000 }, { x: 3000, y: 1000 }, undefined)).toBe(1);
    });
    it('boosts a sun-facing wall and leaves an away-facing wall at 1', () => {
        // South wall (outward +y) faces the sun → 1 + 0.6.
        expect(solarLengthMultiplier({ x: 0, y: 1000 }, { x: 3000, y: 1000 }, south)).toBeCloseTo(1.6, 6);
        // North wall (outward −y) faces away → no boost.
        expect(solarLengthMultiplier({ x: 0, y: 0 }, { x: 3000, y: 0 }, south)).toBeCloseTo(1.0, 6);
    });
});

describe('emitWindowsForRoom — climate bias (A.21.D6)', () => {
    // A corner living room with TWO external walls:
    //   wall 0 = SOUTH (y=1000), shorter (3000 mm) — sun-facing (N. hemisphere)
    //   wall 1 = NORTH (y=0),    longer  (3500 mm) — away from the sun
    const southWall: ExternalWallSegment = { start: { x: 0, y: 1000 }, end: { x: 3000, y: 1000 }, wallIndex: 0 };
    const northWall: ExternalWallSegment = { start: { x: 0, y: 0 }, end: { x: 3500, y: 0 }, wallIndex: 1 };
    const walls = [southWall, northWall];

    it('WITHOUT bias picks the LONGEST wall (the north one)', () => {
        const [w] = emitWindowsForRoom('living', walls, 'Living');
        expect(w?.wallIndex).toBe(1); // longer north wall
    });

    it('WITH a northern-hemisphere bias picks the SUN-FACING (south) wall, even though it is shorter', () => {
        const solar: SolarBias = {
            sunDir: { x: 0, y: 1 },              // +y = South = equator-facing in N. hemisphere
            roomCentroidMm: { x: 1500, y: 500 }, // between the two walls
            weight: 0.6,
        };
        const [w] = emitWindowsForRoom('living', walls, 'Living', [], solar);
        expect(w?.wallIndex).toBe(0); // sun-facing south wall wins on score
    });

    it('a much longer wrong-facing wall still wins (orientation tunes, not overrides)', () => {
        // North wall now 6000 mm: 6000×1.0 = 6000 > 3000×1.6 = 4800 → north wins.
        const longNorth: ExternalWallSegment = { start: { x: 0, y: 0 }, end: { x: 6000, y: 0 }, wallIndex: 1 };
        const solar: SolarBias = { sunDir: { x: 0, y: 1 }, roomCentroidMm: { x: 1500, y: 500 }, weight: 0.6 };
        const [w] = emitWindowsForRoom('living', [southWall, longNorth], 'Living', [], solar);
        expect(w?.wallIndex).toBe(1);
    });
});
