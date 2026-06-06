// A.21.D15 (2026-06-06) — furniture/fixture vertical-placement datum tests.
//
// Pins the ONE rule: worldY = floorY + mountOffset, applied exactly once.
// Guards the "old bug" regression where wall-mounted items floated because the
// mount offset was double-counted (floor + 2 × offset).

import { describe, expect, it } from 'vitest';
import { furnitureWorldY } from '../src/furnitureElevation';

describe('furnitureWorldY (A.21.D15 datum contract)', () => {
    it('floor-standing item sits on the storey floor (offset 0)', () => {
        expect(furnitureWorldY(0, 0)).toBe(0);          // ground floor
        expect(furnitureWorldY(3.0, 0)).toBe(3.0);      // upper storey floor
    });

    it('wall-mounted item mounts at floor + its mount height — ONCE', () => {
        // ground floor, extractor at 1.5 m → 1.5 (NOT 3.0 = double-count)
        expect(furnitureWorldY(0, 1.5)).toBe(1.5);
        // ground floor, tv at 1.20 m → 1.20 (NOT 2.40)
        expect(furnitureWorldY(0, 1.2)).toBeCloseTo(1.2, 9);
        // ground floor, wall_unit at 1.45 m → 1.45 (NOT 2.90)
        expect(furnitureWorldY(0, 1.45)).toBeCloseTo(1.45, 9);
    });

    it('per-storey base elevation is carried — upper floors do NOT collapse to ground', () => {
        // 2nd storey floor at 3.0 m, wall mirror mounted 1.1 m above THAT floor.
        expect(furnitureWorldY(3.0, 1.1)).toBeCloseTo(4.1, 9);   // 3.0 + 1.1
        // 3rd storey floor at 6.0 m, ceiling-adjacent curtain rod 2.4 m above it.
        expect(furnitureWorldY(6.0, 2.4)).toBeCloseTo(8.4, 9);   // 6.0 + 2.4
        // Floor-standing bed on the 2nd storey: exactly the floor.
        expect(furnitureWorldY(3.0, 0)).toBe(3.0);
    });

    it('is null/undefined-safe (defaults to 0)', () => {
        expect(furnitureWorldY(undefined as unknown as number, 1.5)).toBe(1.5);
        expect(furnitureWorldY(3.0, undefined as unknown as number)).toBe(3.0);
    });
});
