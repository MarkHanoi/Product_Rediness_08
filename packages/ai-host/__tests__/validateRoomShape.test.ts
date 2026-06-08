// D2.1 — `validateRoomShape` pure validator tests
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29
// §9.2 D2.6 "Per validator: contradictory layout → HARD; borderline → SOFT;
// ideal → clean pass").

import { describe, expect, it } from 'vitest';
import { validateRoomShape, validateAllRoomShapes, type RoomShape } from
    '../src/workflows/apartmentLayout/dimensions/validateRoomShape.js';
import type { RoomType } from '../src/workflows/apartmentLayout/types.js';

const room = (type: RoomType, w: number, h: number, id = 't', name?: string): RoomShape => ({
    id, type,
    ...(name !== undefined ? { name } : {}),
    rect: { x0: 0, z0: 0, x1: w, z1: h },
});

describe('validateRoomShape — D2.1 pre-furnishing shape validator', () => {
    describe('ideal cases pass cleanly', () => {
        it('a typical living room (4 × 5 = 20 m²) is admissible with no findings', () => {
            const v = validateRoomShape(room('living', 4, 5));
            expect(v.admissible).toBe(true);
            expect(v.hardFindings.length).toBe(0);
            expect(v.softFindings.length).toBe(0);
        });

        it('a typical master bedroom (3.5 × 4 = 14 m²) is admissible', () => {
            const v = validateRoomShape(room('master', 3.5, 4));
            expect(v.admissible).toBe(true);
            expect(v.hardFindings.length).toBe(0);
        });

        it('a typical bathroom (2 × 2.5 = 5 m²) is admissible', () => {
            const v = validateRoomShape(room('bathroom', 2, 2.5));
            expect(v.admissible).toBe(true);
        });
    });

    describe('§5.5 "20 m² bathroom is a planning failure"', () => {
        it('rejects a 20 m² bathroom with HARD areaHardMax finding', () => {
            const v = validateRoomShape(room('bathroom', 4, 5));   // 20 m²
            expect(v.admissible).toBe(false);
            expect(v.hardFindings.some(f => f.metric === 'areaHardMax')).toBe(true);
        });

        it('accepts a 6 m² bathroom (above comfortable but below hard max)', () => {
            const v = validateRoomShape(room('bathroom', 2, 3));   // 6 m²
            expect(v.admissible).toBe(true);
        });
    });

    describe('§5.5 tunnel-room rejection (G4 aspect)', () => {
        it('rejects the canonical 1.1 m × 5 m tunnel bathroom with widthMin AND aspect HARD findings', () => {
            const v = validateRoomShape(room('bathroom', 1.1, 5));
            expect(v.admissible).toBe(false);
            // Two HARD findings: widthMin (1.1 < 1.5) + aspect (5/1.1 = 4.55 > 3.5).
            expect(v.hardFindings.some(f => f.metric === 'widthMin')).toBe(true);
            expect(v.hardFindings.some(f => f.metric === 'aspectHardMax')).toBe(true);
        });

        it('soft-penalises a borderline-tunnel bedroom (1:2.4 aspect)', () => {
            // bedroom widthMin = 2.6 → use 2.6 × 6.5 = 16.9 m², aspect 2.5
            const v = validateRoomShape(room('bedroom', 2.6, 6.5));
            // Aspect 2.5 > soft max 2.2 < hard max 3.0 — soft penalty only.
            expect(v.admissible).toBe(true);
            expect(v.softFindings.some(f => f.metric === 'aspectSoftMax')).toBe(true);
            expect(v.hardFindings.length).toBe(0);
        });
    });

    describe('§5.9 corridor envelope', () => {
        it('rejects a 2 m-wide corridor as HARD widthHardMax', () => {
            const v = validateRoomShape(room('corridor', 2, 4));
            expect(v.admissible).toBe(false);
            expect(v.hardFindings.some(f => f.metric === 'widthHardMax')).toBe(true);
        });

        it('rejects a 15 m-long corridor as HARD lengthHardMax', () => {
            const v = validateRoomShape(room('corridor', 1.2, 15));
            expect(v.admissible).toBe(false);
            expect(v.hardFindings.some(f => f.metric === 'lengthHardMax')).toBe(true);
        });

        it('accepts a 1.2 × 6 m corridor', () => {
            const v = validateRoomShape(room('corridor', 1.2, 6));
            expect(v.admissible).toBe(true);
        });
    });

    describe('§5.1 living-room minima', () => {
        it('rejects a living room narrower than 3.2 m', () => {
            const v = validateRoomShape(room('living', 3.0, 5));
            expect(v.admissible).toBe(false);
            expect(v.hardFindings.some(f => f.metric === 'widthMin')).toBe(true);
        });

        it('rejects a living room with area < 14 m²', () => {
            const v = validateRoomShape(room('living', 3.2, 4));   // 12.8 m²
            expect(v.admissible).toBe(false);
            expect(v.hardFindings.some(f => f.metric === 'areaMin')).toBe(true);
        });
    });

    describe('G6 usable-wall floor', () => {
        it('rejects a master bedroom whose longest wall < 1.8 m wardrobe requirement', () => {
            // Master needs minShortSide 2.75 — but we test G6 specifically with a
            // square-ish 1.5 × 1.5 = 2.25 m² that fails widthMin AND usableWallMin.
            const v = validateRoomShape(room('master', 1.5, 1.5));
            expect(v.admissible).toBe(false);
            expect(v.hardFindings.some(f => f.metric === 'widthMin')).toBe(true);
            expect(v.hardFindings.some(f => f.metric === 'usableWallMin')).toBe(true);
        });
    });

    describe('degenerate / pathological input', () => {
        it('rejects a zero-width rectangle', () => {
            const v = validateRoomShape(room('living', 0, 5));
            expect(v.admissible).toBe(false);
            expect(v.hardFindings[0]?.metric).toBe('degenerate');
        });

        it('rejects a negative-area rectangle', () => {
            const v = validateRoomShape({
                id: 'x', type: 'living',
                rect: { x0: 5, z0: 0, x1: 0, z1: 5 },
            });
            expect(v.admissible).toBe(false);
        });
    });
});

describe('validateAllRoomShapes — aggregate', () => {
    it('returns admissible=true when every room passes', () => {
        const layout: RoomShape[] = [
            room('living',  4, 5,   'L'),
            room('kitchen', 3, 3,   'K'),
            room('master',  3.5, 4, 'M'),
            room('corridor', 1.2, 5, 'C'),
        ];
        const v = validateAllRoomShapes(layout);
        expect(v.admissible).toBe(true);
        expect(v.hardFindings.length).toBe(0);
    });

    it('returns admissible=false when ANY room fails', () => {
        const layout: RoomShape[] = [
            room('living',  4, 5,    'L'),                     // ✓
            room('bathroom', 4, 5,   'B', 'XXL Bathroom'),     // ✗ 20 m²
        ];
        const v = validateAllRoomShapes(layout);
        expect(v.admissible).toBe(false);
        expect(v.hardFindings.some(f => f.roomId === 'B')).toBe(true);
        expect(v.hardFindings.some(f => f.roomId === 'L')).toBe(false);
    });

    it('accumulates soft findings across rooms (does not short-circuit)', () => {
        const layout: RoomShape[] = [
            // Slightly too long bedroom — soft length penalty.
            room('bedroom', 2.8, 5.6, 'B', 'long'),
            // Borderline aspect kitchen — soft aspect penalty.
            room('kitchen', 1.9, 5.5, 'K', 'galley'),
        ];
        const v = validateAllRoomShapes(layout);
        expect(v.softFindings.length).toBeGreaterThanOrEqual(2);
    });
});
