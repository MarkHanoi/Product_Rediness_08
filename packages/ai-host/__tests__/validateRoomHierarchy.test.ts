// G9 — `validateRoomHierarchy` pure validator tests.
//
// Closes the framework gap: layouts that PASS per-room G1-G6 but break
// architectural hierarchy invariants (master smaller than bedroom, kitchen
// larger than living, ensuite larger than main bath, corridor dominating
// habitable space, wc larger than bathroom).

import { describe, expect, it } from 'vitest';
import {
    validateRoomHierarchy,
} from '../src/workflows/apartmentLayout/dimensions/validateRoomHierarchy.js';
import type { RoomShape } from '../src/workflows/apartmentLayout/dimensions/validateRoomShape.js';
import type { RoomType } from '../src/workflows/apartmentLayout/types.js';

const room = (
    type: RoomType,
    areaM2: number,
    id?: string,
    name?: string,
): RoomShape => {
    const side = Math.sqrt(areaM2);
    return {
        id: id ?? `r_${type}_${areaM2}`,
        type,
        name,
        rect: { x0: 0, z0: 0, x1: side, z1: side },
    };
};

describe('validateRoomHierarchy — G9 hierarchy invariants', () => {
    describe('clean layouts pass with no findings', () => {
        it('a sound 2-bed apartment passes cleanly', () => {
            const rooms: RoomShape[] = [
                room('master', 14),
                room('bedroom', 11),
                room('living', 22),
                room('kitchen', 8),
                room('bathroom', 5),
                room('corridor', 4),
            ];
            const v = validateRoomHierarchy(rooms);
            expect(v.admissible).toBe(true);
            expect(v.hardFindings.length).toBe(0);
            expect(v.softFindings.length).toBe(0);
        });

        it('a studio (no bedrooms) trivially passes', () => {
            const rooms: RoomShape[] = [
                room('living', 18),
                room('kitchen', 6),
                room('bathroom', 4),
            ];
            const v = validateRoomHierarchy(rooms);
            expect(v.softFindings.length).toBe(0);
        });

        it('an empty apartment passes (no rooms = no hierarchy)', () => {
            const v = validateRoomHierarchy([]);
            expect(v.softFindings.length).toBe(0);
        });
    });

    describe('H1 — master smaller than bedroom', () => {
        it('flags a 12 m² master next to a 14 m² bedroom', () => {
            const rooms: RoomShape[] = [
                room('master', 12, 'm1', 'Master'),
                room('bedroom', 14, 'b1', 'Bedroom 1'),
                room('living', 20),
            ];
            const v = validateRoomHierarchy(rooms);
            const finding = v.softFindings.find(
                (f) => f.metric === 'masterSmallerThanBedroom',
            );
            expect(finding).toBeDefined();
            expect(finding?.roomId).toBe('m1');
            expect(finding?.delta).toBeGreaterThan(0);
        });

        it('does NOT flag when master IS the largest bedroom', () => {
            const rooms: RoomShape[] = [
                room('master', 16),
                room('bedroom', 12),
                room('bedroom', 11),
            ];
            const v = validateRoomHierarchy(rooms);
            const finding = v.softFindings.find(
                (f) => f.metric === 'masterSmallerThanBedroom',
            );
            expect(finding).toBeUndefined();
        });

        it('flags ONCE per offending bedroom pair', () => {
            const rooms: RoomShape[] = [
                room('master', 10),
                room('bedroom', 13),
                room('bedroom', 14),
            ];
            const v = validateRoomHierarchy(rooms);
            const matches = v.softFindings.filter(
                (f) => f.metric === 'masterSmallerThanBedroom',
            );
            expect(matches.length).toBe(2);
        });
    });

    describe('H2 — kitchen larger than living', () => {
        it('flags a 20 m² kitchen next to a 14 m² living', () => {
            const rooms: RoomShape[] = [
                room('living', 14),
                room('kitchen', 20, 'k1'),
                room('bedroom', 12),
            ];
            const v = validateRoomHierarchy(rooms);
            const finding = v.softFindings.find(
                (f) => f.metric === 'kitchenLargerThanLiving',
            );
            expect(finding).toBeDefined();
            expect(finding?.roomId).toBe('k1');
        });

        it('does NOT flag when living dominates', () => {
            const rooms: RoomShape[] = [
                room('living', 22),
                room('kitchen', 8),
            ];
            const v = validateRoomHierarchy(rooms);
            const finding = v.softFindings.find(
                (f) => f.metric === 'kitchenLargerThanLiving',
            );
            expect(finding).toBeUndefined();
        });

        it('flags every kitchen larger than the LARGEST living', () => {
            // Multiple kitchens (rare but possible in dual-key apartments).
            const rooms: RoomShape[] = [
                room('living', 18),
                room('kitchen', 20),
                room('kitchen', 22),
            ];
            const v = validateRoomHierarchy(rooms);
            const matches = v.softFindings.filter(
                (f) => f.metric === 'kitchenLargerThanLiving',
            );
            expect(matches.length).toBe(2);
        });
    });

    describe('H3 — ensuite larger than main bathroom', () => {
        it('flags a 7 m² ensuite next to a 4 m² main bath', () => {
            const rooms: RoomShape[] = [
                room('bathroom', 4),
                room('ensuite', 7, 'e1'),
            ];
            const v = validateRoomHierarchy(rooms);
            const finding = v.softFindings.find(
                (f) => f.metric === 'ensuiteLargerThanBathroom',
            );
            expect(finding).toBeDefined();
            expect(finding?.roomId).toBe('e1');
        });

        it('does NOT flag when ensuite ≤ bathroom', () => {
            const rooms: RoomShape[] = [
                room('bathroom', 6),
                room('ensuite', 4),
            ];
            const v = validateRoomHierarchy(rooms);
            expect(
                v.softFindings.find(
                    (f) => f.metric === 'ensuiteLargerThanBathroom',
                ),
            ).toBeUndefined();
        });

        it('does not flag when only ensuite exists (no bathroom comparison)', () => {
            const rooms: RoomShape[] = [room('ensuite', 8)];
            const v = validateRoomHierarchy(rooms);
            expect(
                v.softFindings.find(
                    (f) => f.metric === 'ensuiteLargerThanBathroom',
                ),
            ).toBeUndefined();
        });
    });

    describe('H4 — non-social room dominates the social zone', () => {
        it('flags a 40 m² master that dwarfs a 30 m² social zone', () => {
            const rooms: RoomShape[] = [
                room('living', 18),
                room('kitchen', 8),
                room('dining', 4),
                room('master', 40, 'm1'),
            ];
            const v = validateRoomHierarchy(rooms);
            const finding = v.softFindings.find(
                (f) => f.metric === 'nonSocialDominates',
            );
            expect(finding).toBeDefined();
            expect(finding?.roomId).toBe('m1');
        });

        it('passes when social zone is the largest aggregate', () => {
            const rooms: RoomShape[] = [
                room('living', 20),
                room('kitchen', 10),
                room('dining', 6),
                room('master', 14),
                room('bedroom', 12),
            ];
            const v = validateRoomHierarchy(rooms);
            expect(
                v.softFindings.find((f) => f.metric === 'nonSocialDominates'),
            ).toBeUndefined();
        });
    });

    describe('H5 — corridor larger than smallest bedroom', () => {
        it('flags a 14 m² corridor next to a 10 m² bedroom', () => {
            const rooms: RoomShape[] = [
                room('bedroom', 10),
                room('corridor', 14, 'c1'),
            ];
            const v = validateRoomHierarchy(rooms);
            const finding = v.softFindings.find(
                (f) => f.metric === 'corridorLargerThanBedroom',
            );
            expect(finding).toBeDefined();
            expect(finding?.roomId).toBe('c1');
        });

        it('does NOT flag a reasonable 4 m² corridor', () => {
            const rooms: RoomShape[] = [
                room('bedroom', 11),
                room('corridor', 4),
            ];
            const v = validateRoomHierarchy(rooms);
            expect(
                v.softFindings.find(
                    (f) => f.metric === 'corridorLargerThanBedroom',
                ),
            ).toBeUndefined();
        });
    });

    describe('H6 — wc larger than bathroom', () => {
        it('flags a 6 m² wc next to a 4 m² bathroom', () => {
            const rooms: RoomShape[] = [
                room('bathroom', 4),
                room('wc', 6, 'w1'),
            ];
            const v = validateRoomHierarchy(rooms);
            const finding = v.softFindings.find(
                (f) => f.metric === 'wcLargerThanBathroom',
            );
            expect(finding).toBeDefined();
            expect(finding?.roomId).toBe('w1');
        });

        it('does NOT flag a reasonable 2 m² wc', () => {
            const rooms: RoomShape[] = [
                room('bathroom', 5),
                room('wc', 2),
            ];
            const v = validateRoomHierarchy(rooms);
            expect(
                v.softFindings.find(
                    (f) => f.metric === 'wcLargerThanBathroom',
                ),
            ).toBeUndefined();
        });
    });

    describe('result shape', () => {
        it('NEVER produces hard findings — hierarchy is soft-only', () => {
            // Deliberately egregious layout.
            const rooms: RoomShape[] = [
                room('master', 6),       // < every bedroom
                room('bedroom', 18),
                room('bedroom', 16),
                room('kitchen', 30),     // > living
                room('living', 10),
                room('ensuite', 12),     // > bathroom
                room('bathroom', 4),
                room('corridor', 20),    // > every bedroom
                room('wc', 8),           // > bathroom
            ];
            const v = validateRoomHierarchy(rooms);
            expect(v.admissible).toBe(true);
            expect(v.hardFindings.length).toBe(0);
            expect(v.softFindings.length).toBeGreaterThan(0);
        });

        it('every soft finding has a metric, reason, and roomId', () => {
            const rooms: RoomShape[] = [
                room('master', 8),
                room('bedroom', 14),
            ];
            const v = validateRoomHierarchy(rooms);
            for (const f of v.softFindings) {
                expect(f.metric.length).toBeGreaterThan(0);
                expect(f.reason.length).toBeGreaterThan(0);
                expect(f.roomId.length).toBeGreaterThan(0);
                expect(f.delta).toBeGreaterThanOrEqual(0);
                expect(f.delta).toBeLessThanOrEqual(1);
            }
        });

        it('delta scales with shortfall magnitude', () => {
            // A master that's 50% the size of the bedroom should have a
            // bigger penalty than one that's 90% the size.
            const big = validateRoomHierarchy([
                room('master', 7),
                room('bedroom', 14),
            ]).softFindings.find(
                (f) => f.metric === 'masterSmallerThanBedroom',
            )!;
            const small = validateRoomHierarchy([
                room('master', 13),
                room('bedroom', 14),
            ]).softFindings.find(
                (f) => f.metric === 'masterSmallerThanBedroom',
            )!;
            expect(big.delta).toBeGreaterThan(small.delta);
        });
    });
});
