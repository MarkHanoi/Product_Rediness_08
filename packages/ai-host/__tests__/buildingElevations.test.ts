// DOC-AUTO DS3 — building elevation marks tests (2026-06-09).

import { describe, expect, it } from 'vitest';
import { computeBuildingElevationMarks } from '../src/workflows/houseLayout/buildingElevations.js';

// A 10 (x) × 8 (z) rectangle, min corner at origin.
const RECT = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 8 }, { x: 0, z: 8 }];

describe('DS3 — computeBuildingElevationMarks', () => {
    it('produces exactly 4 marks (N/S/E/W) from a rectangle', () => {
        const m = computeBuildingElevationMarks(RECT);
        expect(m).toHaveLength(4);
        expect(m.map(x => x.direction).sort()).toEqual(['E', 'N', 'S', 'W']);
    });

    it('places each mark OUTSIDE the correct façade by offsetM, looking INWARD', () => {
        const m = computeBuildingElevationMarks(RECT, { offsetM: 3 });
        const by = (d: string) => m.find(x => x.direction === d)!;
        // North = +Z façade (z=8); mark north of it (z=11), looks −Z.
        expect(by('N').anchor).toEqual({ x: 5, z: 11 });
        expect(by('N').facing).toEqual({ x: 0, z: -1 });
        // South = −Z (z=0); mark z=−3, looks +Z.
        expect(by('S').anchor).toEqual({ x: 5, z: -3 });
        expect(by('S').facing).toEqual({ x: 0, z: 1 });
        // East = +X (x=10); mark x=13, looks −X.
        expect(by('E').anchor).toEqual({ x: 13, z: 4 });
        expect(by('E').facing).toEqual({ x: -1, z: 0 });
        // West = −X (x=0); mark x=−3, looks +X.
        expect(by('W').anchor).toEqual({ x: -3, z: 4 });
        expect(by('W').facing).toEqual({ x: 1, z: 0 });
    });

    it('every facing is a unit inward normal and points toward the building centre', () => {
        const m = computeBuildingElevationMarks(RECT);
        const cx = 5, cz = 4;
        for (const mk of m) {
            expect(Math.hypot(mk.facing.x, mk.facing.z)).toBeCloseTo(1, 9);
            // facing dotted with (centre − anchor) must be positive (points inward).
            const toCentre = { x: cx - mk.anchor.x, z: cz - mk.anchor.z };
            expect(mk.facing.x * toCentre.x + mk.facing.z * toCentre.z).toBeGreaterThan(0);
        }
    });

    it('default offset is 3 m', () => {
        const m = computeBuildingElevationMarks(RECT);
        expect(m.find(x => x.direction === 'N')!.anchor.z).toBe(11); // 8 + 3
    });

    it('is deterministic + degenerate-safe (< 3 verts / zero-area → [])', () => {
        const a = computeBuildingElevationMarks(RECT);
        const b = computeBuildingElevationMarks(RECT);
        expect(a).toEqual(b);
        expect(computeBuildingElevationMarks([{ x: 0, z: 0 }, { x: 1, z: 1 }])).toEqual([]);
        expect(computeBuildingElevationMarks([{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 10, z: 0 }])).toEqual([]); // collinear → zero z-extent
    });
});
