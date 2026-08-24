/**
 * §DELETE-ONE-ROUTE (L-10813) — C94 §13 DELTA #2 / §TOBE.6 RM-9.
 *
 * ## THE DEFECT
 *
 * **Pressing Delete on a room did nothing, from either surface.** `DeleteElementCommand`
 * finds its target by probing ~16 stores, and `grep -c roomStore` on it returns **`0`**
 * — re-measured at `0589a36c` — so a room reached its terminal refusal, *"Element not
 * found in any store"*. C94 §6 has carried this since 2026-08-18.
 *
 * ⭐ The HONESTY half is already closed (`0589a36c`, §DELETE-MUST-ANSWER): both surfaces
 * now REPORT the refusal rather than swallowing it. So today the delete is a **loud
 * refusal** — better than a silent no-op, and still not a delete. These arms pin the
 * capability, not the reporting.
 *
 * ## THE FIRST ARM IS THE EVIDENCE, AND IT MUST KEEP PASSING
 *
 * Arm 1 asserts that `DeleteElementCommand` **still refuses** a room. That is not a
 * regression test for a bug — it is the *reason the route exists*, pinned so that a
 * future lane cannot "simplify" the resolver away on the belief that the general
 * command handles rooms. ⛔ C84 EI-4a forbids giving `DeleteElementCommand` a room arm:
 * one route per intent, and `DeleteRoomCommand` is the better command that already
 * existed.
 */

import { describe, it, expect } from 'vitest';
import { RoomStore } from '@pryzm/room-topology';
import { resolveDeleteCommand, hasSpecialisedDeleteCommand } from '../src/resolveDeleteCommand';
import { DeleteElementCommand } from '../src/walls/DeleteElementCommand';
import { DeleteRoomCommand } from '../src/rooms/DeleteRoomCommand';
import { DeleteOpeningCommand } from '../src/slabs/DeleteOpeningCommand';
import { DeleteLightingCommand } from '../src/lighting/DeleteLightingCommand';
import type { CommandContext } from '../src/types';

const LEVEL = 'L0';
const ROOM_ID = '746ae083-0000-4000-8000-000000000001';

const bimManagerStub = {
    getLevelById: (id: string) => (id === LEVEL ? { id, elevation: 0, height: 2.7 } : undefined),
    getLevels: () => [{ id: LEVEL, elevation: 0, height: 2.7 }],
    registerElement: () => {}, unregisterElement: () => {},
};

/** A real `RoomStore` holding one room the user has NAMED — the meaning under test. */
function harness() {
    const roomStore = new RoomStore(null, bimManagerStub as never);
    roomStore.add({
        id: ROOM_ID, type: 'room', levelId: LEVEL, parentId: LEVEL,
        name: 'Kitchen', roomNumber: '00-001',
        boundary: {
            polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }],
            height: 2.7, baseOffset: 0, detectionMethod: 'auto-topology',
        },
        boundingWallIds: ['w1', 'w2', 'w3', 'w4'],
        boundingSlabIds: [], boundingColumnIds: [],
        occupancyType: 'kitchen', finishes: {}, properties: {},
        computed: {
            area: 12, grossArea: 12, perimeter: 14, volume: 32.4,
            centroid: { x: 2, z: 1.5 },
            boundingBox: { minX: 0, minZ: 0, maxX: 4, maxZ: 3 },
        },
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'test', version: 1, detectionVersion: 1 },
    } as never);
    // `DeleteElementCommand` self-discovers by probing ~16 stores. The stub answers
    // every probe HONESTLY — "I do not hold this id" — so the command reaches its own
    // terminal refusal rather than throwing on a missing method. Enumerated from the
    // command itself (`grep -o 'wallStore\.[a-zA-Z]*'`) rather than guessed.
    const emptyWallStore = {
        getById: () => undefined, getAll: () => [], getByLevel: () => [],
        getDoor: () => undefined, getWindow: () => undefined,
        doors: () => [], windows: () => [],
        add: () => {}, remove: () => false,
        removeDoor: () => false, removeWindow: () => false, removeOpening: () => false,
    };
    const emptyStore = { getById: () => undefined, getAll: () => [], getByLevel: () => [], remove: () => false };
    const ctx = {
        stores: {
            roomStore,
            wallStore: emptyWallStore,
            slabStore: emptyStore, columnStore: emptyStore, beamStore: emptyStore,
            roofStore: emptyStore, floorStore: emptyStore, ceilingStore: emptyStore,
            stairStore: emptyStore, handrailStore: emptyStore, plumbingStore: emptyStore,
            curtainWallStore: emptyStore,
        },
        bimManager: bimManagerStub,
    } as unknown as CommandContext;
    return { roomStore, ctx };
}

describe('§DELETE-ONE-ROUTE — the evidence that the room route is needed', () => {
    it('⛔ DeleteElementCommand still REFUSES a room — this is WHY, and it must not be "fixed" here', () => {
        const { roomStore, ctx } = harness();
        const result = new DeleteElementCommand(ROOM_ID).execute(ctx);

        expect(result.success).toBe(false);
        // The room is untouched — the refusal is a refusal, not a partial delete.
        expect(roomStore.getById(ROOM_ID)).toBeDefined();
        // ⛔ C84 EI-4a: the cure is a ROUTE to the better command, never a room arm here.
    });
});

describe('§DELETE-ONE-ROUTE — a room now has a route, and it is the sound command', () => {
    it('⭐ RED ON HEAD: resolves a room to DeleteRoomCommand', () => {
        expect(resolveDeleteCommand(ROOM_ID, 'room')).toBeInstanceOf(DeleteRoomCommand);
    });

    it('⭐⭐ RED ON HEAD: the routed delete actually REMOVES the room', () => {
        const { roomStore, ctx } = harness();
        expect(roomStore.getById(ROOM_ID)).toBeDefined();

        const result = resolveDeleteCommand(ROOM_ID, 'room').execute(ctx);

        expect(result.success).toBe(true);
        expect(roomStore.getById(ROOM_ID)).toBeUndefined();
    });

    it('⭐⭐ and ONE undo brings it back WITH ITS AUTHORED NAME — restore ⊇ write', () => {
        // C94 §1.2 / §10: DeleteRoomCommand snapshots the whole RoomData and restores
        // more than it removed. This arm is the free half of DELTA #2 — nothing new was
        // built for it; the sound command simply was not reachable from the UI.
        const { roomStore, ctx } = harness();
        const cmd = resolveDeleteCommand(ROOM_ID, 'room');
        cmd.execute(ctx);
        expect(roomStore.getById(ROOM_ID)).toBeUndefined();

        cmd.undo!(ctx);

        const back = roomStore.getById(ROOM_ID);
        expect(back).toBeDefined();
        expect(back!.name).toBe('Kitchen');
        expect(back!.roomNumber).toBe('00-001');
        expect(back!.occupancyType).toBe('kitchen');
    });
});

describe('§DELETE-ONE-ROUTE — it changes the answer for NO other family', () => {
    it('opening and lighting keep their existing specialised commands', () => {
        expect(resolveDeleteCommand('o1', 'opening')).toBeInstanceOf(DeleteOpeningCommand);
        expect(resolveDeleteCommand('l1', 'lighting')).toBeInstanceOf(DeleteLightingCommand);
    });

    it.each([
        ['wall'], ['slab'], ['column'], ['beam'], ['roof'], ['furniture'], ['stair'],
    ])('%s still falls through to the general store-probing command', tag => {
        expect(resolveDeleteCommand('x', tag)).toBeInstanceOf(DeleteElementCommand);
        expect(hasSpecialisedDeleteCommand(tag)).toBe(false);
    });

    it('an absent or empty tag falls through rather than refusing', () => {
        expect(resolveDeleteCommand('x')).toBeInstanceOf(DeleteElementCommand);
        expect(resolveDeleteCommand('x', '')).toBeInstanceOf(DeleteElementCommand);
    });

    it('⭐ INCONSISTENT CASING IS NORMALISED IN ONE PLACE — the trap BimService warned about', () => {
        // `SlabFragmentBuilder` mints `elementType: 'Slab'` while walls mint `'wall'`.
        // BimService's own comment forbids branching on that string locally; passing it
        // to the single authority is what makes that safe.
        expect(resolveDeleteCommand('s1', 'Slab')).toBeInstanceOf(DeleteElementCommand);
        expect(resolveDeleteCommand('r1', 'Room')).toBeInstanceOf(DeleteRoomCommand);
        expect(resolveDeleteCommand('r1', 'ROOM')).toBeInstanceOf(DeleteRoomCommand);
    });
});
