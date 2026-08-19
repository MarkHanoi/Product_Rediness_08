/**
 * §FLOOR-REFUSAL-IS-FALSE (L-1014) — the floor tool refused a room that can be floored.
 *
 * FOUNDER (prod 2026-08-18), on a level `RoomDetectionEngine` reported ONE room on:
 *
 *   [CommandManager] REFUSED CREATE_FLOORS_BY_ROOM_TYPE: Every room on this level
 *   has a type that takes no floor finish (a stairwell, or circulation this
 *   pipeline finishes as one merged surface) — there is nothing here to floor.
 *
 * The room was not a stairwell and was not circulation. The sentence is FALSE
 * ABOUT HIS MODEL, and it is a refusal, so a legal operation was denied with an
 * untrue explanation.
 *
 * ROOT CAUSE. §FLOOR-DEFAULT-UNTYPED already established the right rule — "room
 * type chooses WHICH floor finish, not WHETHER one may exist" — and implemented
 * `_finishPlan` to default an UNTYPED room. But it tested untyped as `!occ`,
 * i.e. `undefined` / `''`. **The room store never emits either.**
 * `RoomDetectionEngine` stamps every detected room `occupancyType:'unclassified'`
 * — a real, non-empty string that is the vocabulary's OWN word for "no type
 * stated" (`RoomOccupancyType`'s last member, under the comment `── Default ──`).
 * So `typed` was true, `_finishCategory('unclassified')` found it in neither the
 * timber set nor the tile set, fell through the unlabelled `return null`, and the
 * room was reported to the user as a stairwell.
 *
 * The guarding test could not catch it: it built its "untyped" room by OMITTING
 * the field, a state production cannot produce. Committed ≠ reachable.
 *
 * SECOND, LARGER HALF. That same `return null` was the destination for every
 * canonical occupancy absent from the two hard-coded finish sets — `classroom`,
 * `patient-room`, `warehouse`, `restaurant`, `open-office` and ~30 more. A
 * classroom could not have a floor and was told it was a stairwell. "Type chooses
 * WHICH, not WHETHER" means an unmapped-but-known type takes the default too;
 * only DELIBERATE exclusions refuse, and those are now a named set rather than
 * whatever happens to be missing from a lookup table.
 */
import { describe, it, expect } from 'vitest';
import { CreateFloorsByRoomTypeCommand } from '../src/floors/CreateFloorsByRoomTypeCommand.js';

/** Minimal CommandContext with a room store, shaped like the production one. */
function makeContext(rooms: Array<Record<string, unknown>>) {
    return {
        stores: {
            roomStore: {
                getAll: () => rooms,
                getByLevel: (lvl: string) => rooms.filter((r) => r.levelId === lvl),
            },
        },
    } as never;
}

/** A room exactly as `RoomDetectionEngine` mints it: detected, bounded, untagged. */
function detectedRoom(occupancyType: string, id = 'room-1') {
    return {
        id,
        levelId: 'L0',
        name: 'Room',
        occupancyType,
        boundary: {
            polygon: [
                { x: 0, z: 0 },
                { x: 4, z: 0 },
                { x: 4, z: 3 },
                { x: 0, z: 3 },
            ],
        },
    };
}

describe('§FLOOR-REFUSAL-IS-FALSE (L-1014) — a refusal must be true about the model', () => {
    it("THE FOUNDER CASE: one detected, untagged room ('unclassified') is floorable", () => {
        const cmd = new CreateFloorsByRoomTypeCommand('L0');
        const v = cmd.canExecute(makeContext([detectedRoom('unclassified')]));
        expect(v.ok).toBe(true);
    });

    it("'unclassified' is the store's own word for untyped — it must behave exactly like an absent type", () => {
        const cmd = new CreateFloorsByRoomTypeCommand('L0');
        const absent = { ...detectedRoom('x') } as Record<string, unknown>;
        delete absent.occupancyType;
        expect(cmd.canExecute(makeContext([absent])).ok)
            .toBe(cmd.canExecute(makeContext([detectedRoom('unclassified')])).ok);
    });

    it('a KNOWN type with no explicit finish mapping still gets a floor — type chooses WHICH, not WHETHER', () => {
        // None of these are in TIMBER_TYPES or TILE_TYPES. Every one of them was
        // refused with the "stairwell or circulation" sentence.
        for (const occ of [
            'classroom', 'laboratory', 'lecture-hall', 'library', 'staff-room',
            'patient-room', 'consultation-room', 'waiting-room', 'pharmacy',
            'open-office', 'meeting-room', 'reception', 'breakout',
            'retail-floor', 'stockroom', 'changing-room',
            'restaurant', 'bar', 'function-room', 'spa',
            'warehouse', 'loading-bay', 'plant-room', 'electrical-room',
            'foyer', 'prayer-room', 'atrium',
        ]) {
            const cmd = new CreateFloorsByRoomTypeCommand('L0');
            expect(cmd.canExecute(makeContext([detectedRoom(occ)])).ok, `${occ} must be floorable`).toBe(true);
        }
    });

    it('the DELIBERATE exclusions still refuse — the fix has not defaulted everything', () => {
        // A stairwell's slab IS the void the stair punched; a finish there covers the hole.
        const stair = new CreateFloorsByRoomTypeCommand('L0');
        expect(stair.canExecute(makeContext([detectedRoom('stairwell')])).ok).toBe(false);

        // Circulation under skipCirculation is laid as one merged surface by the
        // resi pipeline (§RESI-CORRIDOR-FINISH-NO-DOUBLE).
        const corr = new CreateFloorsByRoomTypeCommand('L0', undefined, undefined, { skipCirculation: true });
        expect(corr.canExecute(makeContext([detectedRoom('corridor')])).ok).toBe(false);

        // …but WITHOUT skipCirculation a corridor is floorable (apartment pipeline).
        const corr2 = new CreateFloorsByRoomTypeCommand('L0');
        expect(corr2.canExecute(makeContext([detectedRoom('corridor')])).ok).toBe(true);
    });

    it('the canonical stairwell token is excluded — not merely absent from a lookup table', () => {
        // 'stairwell' is the RoomOccupancyType member. The old code excluded it
        // only by accident (it was missing from both finish sets), which is why
        // widening the default would silently have started flooring stair voids.
        const cmd = new CreateFloorsByRoomTypeCommand('L0');
        const v = cmd.canExecute(makeContext([detectedRoom('stairwell')]));
        expect(v.ok).toBe(false);
        expect(v.reason).toMatch(/stairwell/i);
    });

    it('when it DOES refuse, the reason names the types it actually found', () => {
        const cmd = new CreateFloorsByRoomTypeCommand('L0');
        const v = cmd.canExecute(makeContext([
            detectedRoom('stairwell', 'r1'),
            detectedRoom('stairwell', 'r2'),
        ]));
        expect(v.ok).toBe(false);
        // The old sentence asserted "a stairwell, or circulation…" as a guess.
        // It must now report what is actually on the level.
        expect(v.reason).toContain('stairwell');
        expect(v.reason).toContain('2');
    });

    it('type matching is case-insensitive, matching its sibling floorFinish resolver', () => {
        const cmd = new CreateFloorsByRoomTypeCommand('L0');
        expect(cmd.canExecute(makeContext([detectedRoom('Kitchen')])).ok).toBe(true);
        const s = new CreateFloorsByRoomTypeCommand('L0');
        expect(s.canExecute(makeContext([detectedRoom('Stairwell')])).ok).toBe(false);
    });

    it('a level with genuinely no bounded room still says THAT, not the type sentence', () => {
        const cmd = new CreateFloorsByRoomTypeCommand('L0');
        const v = cmd.canExecute(makeContext([]));
        expect(v.ok).toBe(false);
        expect(v.reason).toMatch(/no rooms with a boundary/i);
    });
});
