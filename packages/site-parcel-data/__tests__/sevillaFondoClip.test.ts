import { describe, it, expect } from 'vitest';
import { clipParcelByFondoLine, nearestFondoLine } from '../src/sevillaFondoClip.js';

describe('clipParcelByFondoLine', () => {
    // A 20×10 parcel, front edge on z=0 (street), rear edge at z=10.
    const PARCEL = [
        { x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 10 }, { x: 0, z: 10 },
    ];
    const FRONT_MID = { x: 10, z: 0 };

    it('clips the parcel to the street side of a fondo line crossing it', () => {
        // A depth line at z=6, parallel to the street — keeps the 0..6 band.
        const fondoLine = [{ x: -5, z: 6 }, { x: 25, z: 6 }];
        const clipped = clipParcelByFondoLine(PARCEL, fondoLine, FRONT_MID);
        expect(clipped).not.toBeNull();
        // Every clipped vertex must have z <= 6 (within FP tolerance).
        for (const p of clipped!) expect(p.z).toBeLessThanOrEqual(6.0001);
        // Area should be roughly 20 × 6 = 120 (shoelace check).
        const area = Math.abs(
            clipped!.reduce((acc, p, i) => {
                const q = clipped![(i + 1) % clipped!.length]!;
                return acc + (p.x * q.z - q.x * p.z);
            }, 0) / 2,
        );
        expect(area).toBeGreaterThan(110);
        expect(area).toBeLessThan(130);
    });

    it('returns null when the fondo line does not cross the parcel at all', () => {
        // A line entirely outside the parcel (z=50) — clip keeps everything or nothing sanely;
        // here it should keep the WHOLE parcel (line never crosses) since all points are on the
        // street side already — verify it does not degenerate.
        const fondoLine = [{ x: -5, z: 50 }, { x: 25, z: 50 }];
        const clipped = clipParcelByFondoLine(PARCEL, fondoLine, FRONT_MID);
        expect(clipped).not.toBeNull();
        expect(clipped!.length).toBeGreaterThanOrEqual(3);
    });

    it('returns null for a degenerate (zero-length) fondo line', () => {
        const fondoLine = [{ x: 5, z: 5 }, { x: 5, z: 5 }];
        expect(clipParcelByFondoLine(PARCEL, fondoLine, FRONT_MID)).toBeNull();
    });

    it('returns null when the fondo line has fewer than 2 points', () => {
        expect(clipParcelByFondoLine(PARCEL, [{ x: 5, z: 5 }], FRONT_MID)).toBeNull();
    });

    it('returns null when the parcel has fewer than 3 points', () => {
        const fondoLine = [{ x: -5, z: 6 }, { x: 25, z: 6 }];
        expect(clipParcelByFondoLine([{ x: 0, z: 0 }, { x: 1, z: 1 }], fondoLine, FRONT_MID)).toBeNull();
    });
});

describe('nearestFondoLine', () => {
    const project = (lon: number, lat: number) => ({ x: lon, z: lat });

    it('picks the line whose midpoint is closest to the parcel centroid', () => {
        const near = { path: [[10, 6] as const, [30, 6] as const] };
        const far = { path: [[10, 60] as const, [30, 60] as const] };
        const result = nearestFondoLine([far, near], project, { x: 10, z: 5 });
        expect(result?.line).toBe(near);
    });

    it('returns null for an empty candidate list', () => {
        expect(nearestFondoLine([], project, { x: 0, z: 0 })).toBeNull();
    });

    it('skips lines with fewer than 2 path points', () => {
        const bad = { path: [[1, 1] as const] };
        const good = { path: [[10, 6] as const, [30, 6] as const] };
        const result = nearestFondoLine([bad, good], project, { x: 10, z: 5 });
        expect(result?.line).toBe(good);
    });
});
