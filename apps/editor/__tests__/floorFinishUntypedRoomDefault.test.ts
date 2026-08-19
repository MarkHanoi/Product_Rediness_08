// @vitest-environment happy-dom
//
// §FLOOR-DEFAULT-UNTYPED — room type chooses WHICH finish, not WHETHER a floor
// can exist.
//
// THE FOUNDER'S PROJECT: exactly ONE room, detected with a boundary, never
// tagged (`RoomTagAutoPopulator` produced 0 tags out of 1 live room). Asking for
// a floor finish hit `CreateFloorsByRoomTypeCommand.canExecute`:
//
//   rooms.filter(r => this._finishCategory(r.occupancyType) !== null)  →  []
//   → "No rooms with a floor-mappable type — run Auto-Organise (tag rooms) first."
//
// Requiring a room to be classified as a *kitchen* before it may have ANY floor
// answers a different question from the one the user asked. A single untyped
// room has an obvious honest answer: create a default finish and say which one
// was chosen.
//
// WHAT MUST NOT CHANGE, and is asserted below just as hard: the two exclusions
// that are DECISIONS rather than gaps — a `stair` room (its slab is the
// stairwell void) and, under `skipCirculation`, the resi corridors the merged
// pass owns. "Default the untyped" must not become "default everything".

import { describe, it, expect } from 'vitest';
import { CreateFloorsByRoomTypeCommand } from '@pryzm/command-registry';

const LEVEL_ID = 'L0';

/** A 4 m x 3 m room ring on the wall centrelines — what room detection makes. */
const CENTRELINE = [
    { x: 0, z: 0 },
    { x: 4, z: 0 },
    { x: 4, z: 3 },
    { x: 0, z: 3 },
];

const WALLS: any[] = [
    { id: 'w1', baseLine: [{ x: 0, z: 0 }, { x: 4, z: 0 }], thickness: 0.2 },
    { id: 'w2', baseLine: [{ x: 4, z: 0 }, { x: 4, z: 3 }], thickness: 0.2 },
    { id: 'w3', baseLine: [{ x: 4, z: 3 }, { x: 0, z: 3 }], thickness: 0.2 },
    { id: 'w4', baseLine: [{ x: 0, z: 3 }, { x: 0, z: 0 }], thickness: 0.2 },
];

interface RoomSpec { id: string; occupancyType?: string; name?: string }

function makeContext(roomSpecs: readonly RoomSpec[]) {
    const floors: any[] = [];
    const rooms = roomSpecs.map((r) => ({
        id: r.id,
        levelId: LEVEL_ID,
        ...(r.name !== undefined ? { name: r.name } : {}),
        ...(r.occupancyType !== undefined ? { occupancyType: r.occupancyType } : {}),
        boundary: { polygon: CENTRELINE.map((v) => ({ ...v })) },
        boundingWallIds: ['w1', 'w2', 'w3', 'w4'],
    }));
    return {
        ctx: {
            stores: {
                floorStore: {
                    add: (f: any) => { floors.push(f); },
                    getAll: () => floors,
                    getById: (id: string) => floors.find((f) => f.id === id),
                    remove: (id: string) => {
                        const i = floors.findIndex((f) => f.id === id);
                        if (i >= 0) floors.splice(i, 1);
                    },
                },
                roomStore: {
                    getByLevel: (lid: string) => (lid === LEVEL_ID ? rooms : []),
                    getAll: () => rooms,
                    getById: (id: string) => rooms.find((r) => r.id === id),
                },
                wallStore: {
                    getById: (id: string) => WALLS.find((w) => w.id === id),
                    getByLevel: () => WALLS,
                },
            },
            projectContext: { activeLevelId: LEVEL_ID },
            bimManager: {
                getLevelById: (id: string) => (id === LEVEL_ID ? { id: LEVEL_ID, elevation: 0 } : undefined),
                registerElement: () => { /* */ },
                unregisterElement: () => { /* */ },
            },
        } as any,
        floors,
    };
}

describe('§FLOOR-DEFAULT-UNTYPED — ONE untyped room (the founder\'s project)', () => {
    it('is no longer REFUSED — a room with a boundary can have a floor', () => {
        const { ctx } = makeContext([{ id: 'room-1', name: 'Room' }]);
        const cmd = new CreateFloorsByRoomTypeCommand(LEVEL_ID);

        const v = cmd.canExecute(ctx);

        expect(v.ok).toBe(true);
    });

    it('CREATES the floor — the outcome the user asked for', () => {
        const { ctx, floors } = makeContext([{ id: 'room-1', name: 'Room' }]);
        const cmd = new CreateFloorsByRoomTypeCommand(LEVEL_ID);

        const r = cmd.execute(ctx);

        expect(r.success).toBe(true);
        expect(r.affectedElementIds.length).toBe(1);
        expect(floors).toHaveLength(1);
        expect(floors[0].hostRoomId).toBe('room-1');
    });

    it('gives it a NAMED, style-aware finish — not the flat fallback colour', () => {
        const { ctx, floors } = makeContext([{ id: 'room-1' }]);
        new CreateFloorsByRoomTypeCommand(LEVEL_ID, 'classic').execute(ctx);

        // The Classic brief's timber. A defaulted floor must still LOOK like a
        // floor; what makes it honest is the report, not an unfinished surface.
        expect(floors[0].finishSpec?.finishColor).toBeDefined();
        expect(String(floors[0].finishSpec?.materialName ?? ''))
            .toMatch(/walnut/i);
    });

    it('the RESULT SAYS which default it chose, and how to change it', () => {
        // The honesty half. A default the user is never told about is
        // indistinguishable from a considered choice.
        const { ctx } = makeContext([{ id: 'room-1' }]);
        const r = new CreateFloorsByRoomTypeCommand(LEVEL_ID, 'nordic').execute(ctx);

        const said = (r.info ?? []).join(' ');
        expect(said).toMatch(/no room type set/i);
        expect(said).toMatch(/Pale Ash \/ Birch Plank/);   // the finish, by name
        expect(said).toMatch(/Auto-Organise/);             // how to get tile instead
    });

    it('the note is UNGATED — it does not need the §DIAG flood-gate flag', () => {
        const g = globalThis as any;
        const before = { a: g.__pryzmLayoutDiag, b: g.__pryzmFloorDiag };
        delete g.__pryzmLayoutDiag;
        delete g.__pryzmFloorDiag;
        try {
            const { ctx } = makeContext([{ id: 'room-1' }]);
            const r = new CreateFloorsByRoomTypeCommand(LEVEL_ID).execute(ctx);
            expect((r.info ?? []).length).toBeGreaterThan(0);
        } finally {
            if (before.a !== undefined) g.__pryzmLayoutDiag = before.a;
            if (before.b !== undefined) g.__pryzmFloorDiag = before.b;
        }
    });
});

describe('§FLOOR-DEFAULT-UNTYPED — a TYPED room is unchanged', () => {
    it('a kitchen still gets tile, and NO default note is emitted', () => {
        const { ctx, floors } = makeContext([{ id: 'room-k', occupancyType: 'kitchen' }]);
        const r = new CreateFloorsByRoomTypeCommand(LEVEL_ID, 'nordic').execute(ctx);

        expect(floors).toHaveLength(1);
        expect(String(floors[0].finishSpec?.materialName ?? ''))
            .toMatch(/porcelain/i);
        // Nothing was defaulted, so nothing is claimed to have been.
        expect((r.info ?? []).join(' ')).not.toMatch(/no room type set/i);
    });

    it('a bedroom still gets timber', () => {
        const { ctx, floors } = makeContext([{ id: 'room-b', occupancyType: 'bedroom' }]);
        new CreateFloorsByRoomTypeCommand(LEVEL_ID, 'nordic').execute(ctx);

        expect(String(floors[0].finishSpec?.materialName ?? ''))
            .toMatch(/ash|birch|plank/i);
    });
});

describe('§FLOOR-DEFAULT-UNTYPED — the DELIBERATE exclusions survive', () => {
    it('a `stair` room is still NOT floored — its slab is the stairwell void', () => {
        // The regression that would turn a fix into a defect: defaulting
        // everything unmapped would cover the hole the stair punched.
        const { ctx, floors } = makeContext([{ id: 'room-s', occupancyType: 'stair' }]);
        const cmd = new CreateFloorsByRoomTypeCommand(LEVEL_ID);

        expect(cmd.canExecute(ctx).ok).toBe(false);
        cmd.execute(ctx);
        expect(floors).toHaveLength(0);
    });

    it('under skipCirculation, a corridor is still NOT floored (the resi merged pass owns it)', () => {
        const { ctx, floors } = makeContext([{ id: 'room-c', occupancyType: 'corridor' }]);
        const cmd = new CreateFloorsByRoomTypeCommand(LEVEL_ID, undefined, undefined, { skipCirculation: true });

        expect(cmd.canExecute(ctx).ok).toBe(false);
        cmd.execute(ctx);
        expect(floors).toHaveLength(0);
    });

    it('a level of ONLY excluded rooms refuses, and the reason names WHY', () => {
        const { ctx } = makeContext([{ id: 'room-s', occupancyType: 'stair' }]);
        const v = new CreateFloorsByRoomTypeCommand(LEVEL_ID).canExecute(ctx);

        expect(v.ok).toBe(false);
        // §FLOOR-REFUSAL-IS-FALSE (L-1014) — this used to assert the literal
        // phrase "nothing here to floor". That sentence was RETIRED because it
        // asserted a cause it had not measured: it told the founder his ONE
        // untagged room was "a stairwell, or circulation", which was false about
        // his model. The refusal now REPORTS WHAT IT FOUND. The intent of this
        // test — "the reason names WHY" — is unchanged and is asserted harder:
        // the excluded type itself must appear.
        expect(String(v.reason)).toMatch(/stair/i);
        expect(String(v.reason)).toMatch(/excluded/i);
    });

    it('the room store OWN untyped token (unclassified) is floorable - L-1014', () => {
        // THE GAP THIS FILE HAD. Every "untyped" fixture above builds its room by
        // OMITTING occupancyType. The room store never emits that:
        // RoomDetectionEngine stamps 'unclassified'. So this suite passed while
        // the founder was refused, which is why the defect shipped.
        const { ctx, floors } = makeContext([{ id: 'room-u', occupancyType: 'unclassified' }]);
        const cmd = new CreateFloorsByRoomTypeCommand(LEVEL_ID);
        expect(cmd.canExecute(ctx).ok).toBe(true);
        cmd.execute(ctx);
        expect(floors).toHaveLength(1);
    });

    it('a room with NO boundary still refuses with the boundary reason — unchanged', () => {
        const { ctx } = makeContext([]);
        const v = new CreateFloorsByRoomTypeCommand(LEVEL_ID).canExecute(ctx);

        expect(v.ok).toBe(false);
        expect(String(v.reason)).toMatch(/no rooms with a boundary/i);
    });
});

describe('§FLOOR-DEFAULT-UNTYPED — a MIXED level', () => {
    it('floors the kitchen AND the untyped room, and counts only the defaulted one', () => {
        const { ctx, floors } = makeContext([
            { id: 'room-k', occupancyType: 'kitchen' },
            { id: 'room-u' },
        ]);
        const r = new CreateFloorsByRoomTypeCommand(LEVEL_ID, 'nordic').execute(ctx);

        expect(floors).toHaveLength(2);
        // "1 room had no room type set" — singular, and one, not two.
        expect((r.info ?? []).join(' ')).toMatch(/^1 room had no room type set/);
    });
});
