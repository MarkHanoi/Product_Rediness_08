// §RESI-FINISH-BULK (ADR-0087) — the residential generate authored room finishes
// with one UpdateRoomFinishesCommand PER ROOM (~250 commands → ~2883 store events
// → a ~19 s §E.1 CRDT blackout). UpdateRoomFinishesBulkCommand applies ALL room
// finishes in ONE command (one mutation pass, one undo entry).
//
// This is a DATA/COMMAND test (no THREE, no DOM) — it drives the command directly
// against a faithful roomStore stub that mirrors getById / update / restoreSnapshot.

import { describe, it, expect } from 'vitest';
import {
    UpdateRoomFinishesBulkCommand,
    type RoomFinishPatch,
} from '../src/rooms/UpdateRoomFinishesBulkCommand';
import type { CommandContext } from '../src/types';
import type { RoomData, RoomFinishes } from '@pryzm/room-topology';

/** A minimal RoomData carrying just the fields the bulk command touches. */
function makeRoom(id: string, finishes?: RoomFinishes): RoomData {
    return { id, type: 'room', levelId: 'L0', finishes } as unknown as RoomData;
}

/** A faithful in-memory roomStore stub: getById returns the live record; update
 *  replaces finishes (bumping a version like the real store); restoreSnapshot
 *  puts the captured pre-update record back. Counts update calls so we can assert
 *  exactly one mutation per room. */
function makeStore(initial: RoomData[]) {
    const rooms = new Map<string, RoomData>(initial.map(r => [r.id, r]));
    let updateCalls = 0;
    return {
        updateCalls: () => updateCalls,
        getById: (id: string) => rooms.get(id),
        update: (id: string, patch: Partial<RoomData>) => {
            const existing = rooms.get(id);
            if (!existing) return undefined;
            const next = { ...existing, ...patch } as RoomData;
            rooms.set(id, next);
            updateCalls++;
            return next;
        },
        restoreSnapshot: (snap: RoomData) => {
            if (!rooms.has(snap.id)) throw new Error(`room ${snap.id} not found`);
            rooms.set(snap.id, snap);
        },
        peek: (id: string) => rooms.get(id),
    };
}

function makeCtx(store: ReturnType<typeof makeStore>): CommandContext {
    return { stores: { roomStore: store } } as unknown as CommandContext;
}

const FINISH_A: RoomFinishes = { floor: { materialName: 'Oak' }, walls: { materialName: 'Paint A' } } as RoomFinishes;
const FINISH_B: RoomFinishes = { floor: { materialName: 'Tile' }, walls: { materialName: 'Paint B' } } as RoomFinishes;

describe('UpdateRoomFinishesBulkCommand — §RESI-FINISH-BULK', () => {
    it('applies N room finishes in ONE execute pass (one update per room)', () => {
        const r0 = makeRoom('r0');
        const r1 = makeRoom('r1');
        const r2 = makeRoom('r2');
        const store = makeStore([r0, r1, r2]);

        const patches: RoomFinishPatch[] = [
            { roomId: 'r0', finishes: FINISH_A },
            { roomId: 'r1', finishes: FINISH_B },
            { roomId: 'r2', finishes: FINISH_A },
        ];
        const cmd = new UpdateRoomFinishesBulkCommand(patches);

        expect(cmd.canExecute(makeCtx(store)).ok).toBe(true);
        const res = cmd.execute(makeCtx(store));
        expect(res.success).toBe(true);
        expect(res.affectedElementIds).toEqual(['r0', 'r1', 'r2']);
        // Exactly one mutation per room — no per-room command overhead multiplier.
        expect(store.updateCalls()).toBe(3);
        expect(store.peek('r0')!.finishes).toBe(FINISH_A);
        expect(store.peek('r1')!.finishes).toBe(FINISH_B);
        expect(store.peek('r2')!.finishes).toBe(FINISH_A);
    });

    it('a SINGLE undo reverts ALL rooms to their pre-bulk finishes', () => {
        const before0: RoomFinishes = { floor: { materialName: 'Original0' } } as RoomFinishes;
        const before1: RoomFinishes = { floor: { materialName: 'Original1' } } as RoomFinishes;
        const store = makeStore([makeRoom('r0', before0), makeRoom('r1', before1)]);

        const cmd = new UpdateRoomFinishesBulkCommand([
            { roomId: 'r0', finishes: FINISH_A },
            { roomId: 'r1', finishes: FINISH_B },
        ]);
        const ctx = makeCtx(store);

        cmd.execute(ctx);
        expect(store.peek('r0')!.finishes).toBe(FINISH_A);
        expect(store.peek('r1')!.finishes).toBe(FINISH_B);

        const undo = cmd.undo(ctx);
        expect(undo.success).toBe(true);
        // Both rooms restored in one undo.
        expect(store.peek('r0')!.finishes).toBe(before0);
        expect(store.peek('r1')!.finishes).toBe(before1);
    });

    it('is best-effort: skips a vanished room but applies the rest', () => {
        const store = makeStore([makeRoom('r0'), makeRoom('r2')]); // r1 missing
        const cmd = new UpdateRoomFinishesBulkCommand([
            { roomId: 'r0', finishes: FINISH_A },
            { roomId: 'r1', finishes: FINISH_B }, // not in store
            { roomId: 'r2', finishes: FINISH_A },
        ]);
        const res = cmd.execute(makeCtx(store));
        expect(res.success).toBe(true);
        expect(res.affectedElementIds).toEqual(['r0', 'r2']);
        expect(store.updateCalls()).toBe(2);
    });

    it('canExecute rejects an empty patch list and an all-missing target set', () => {
        const store = makeStore([makeRoom('r0')]);
        expect(new UpdateRoomFinishesBulkCommand([]).canExecute(makeCtx(store)).ok).toBe(false);
        expect(
            new UpdateRoomFinishesBulkCommand([{ roomId: 'ghost', finishes: FINISH_A }])
                .canExecute(makeCtx(store)).ok,
        ).toBe(false);
    });
});
