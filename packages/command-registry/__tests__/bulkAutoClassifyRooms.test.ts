// §ROOMTYPE142 — content-based bulk room autofill (rename + reclassify).
//
// One command, one undo entry for the WHOLE batch (C16 §8.6), mirroring
// UpdateRoomFinishesBulkCommand (§RESI-FINISH-BULK) exactly: a faithful
// roomStore stub (getById / update / restoreSnapshot), no THREE, no DOM.
// The classifier itself (which rule matched a room's contents) is tested
// separately in packages/spatial-index/__tests__/RoomAutoFillClassifier.test.ts
// — this file only proves the COMMAND applies an already-decided patch list
// atomically and undoes it atomically.

import { describe, it, expect } from 'vitest';
import {
    BulkAutoClassifyRoomsCommand,
    type RoomAutoClassifyPatch,
} from '../src/rooms/BulkAutoClassifyRoomsCommand';
import type { CommandContext } from '../src/types';
import type { RoomData } from '@pryzm/room-topology';

function makeRoom(id: string, name: string, occupancyType: string): RoomData {
    return { id, type: 'room', levelId: 'L0', name, occupancyType } as unknown as RoomData;
}

function makeStore(initial: RoomData[]) {
    const rooms = new Map<string, RoomData>(initial.map((r) => [r.id, r]));
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

describe('BulkAutoClassifyRoomsCommand — §ROOMTYPE142', () => {
    it('applies N room name+occupancy patches in ONE execute pass (one update per room)', () => {
        const store = makeStore([
            makeRoom('r0', 'Room 00-001', 'unclassified'),
            makeRoom('r1', 'Room 00-002', 'unclassified'),
            makeRoom('r2', 'Room 00-003', 'unclassified'),
        ]);

        const patches: RoomAutoClassifyPatch[] = [
            { roomId: 'r0', name: 'Bedroom 01', occupancyType: 'bedroom' as never },
            { roomId: 'r1', name: 'Bathroom 01', occupancyType: 'bathroom' as never },
            { roomId: 'r2', name: 'Kitchen-Living 01', occupancyType: 'kitchen' as never },
        ];
        const cmd = new BulkAutoClassifyRoomsCommand(patches);
        const ctx = makeCtx(store);

        expect(cmd.canExecute(ctx).ok).toBe(true);
        const res = cmd.execute(ctx);
        expect(res.success).toBe(true);
        expect(res.affectedElementIds).toEqual(['r0', 'r1', 'r2']);
        expect(store.updateCalls()).toBe(3);
        expect(store.peek('r0')!.name).toBe('Bedroom 01');
        expect(store.peek('r0')!.occupancyType).toBe('bedroom');
        expect(store.peek('r1')!.name).toBe('Bathroom 01');
        expect(store.peek('r2')!.name).toBe('Kitchen-Living 01');
    });

    it('a SINGLE undo reverts ALL rooms to their pre-batch name+occupancy (C16 §8.6)', () => {
        const store = makeStore([
            makeRoom('r0', 'Room 00-001', 'unclassified'),
            makeRoom('r1', 'Room 00-002', 'unclassified'),
        ]);
        const cmd = new BulkAutoClassifyRoomsCommand([
            { roomId: 'r0', name: 'Bedroom 01', occupancyType: 'bedroom' as never },
            { roomId: 'r1', name: 'Living 01', occupancyType: 'living-room' as never },
        ]);
        const ctx = makeCtx(store);

        cmd.execute(ctx);
        expect(store.peek('r0')!.name).toBe('Bedroom 01');
        expect(store.peek('r1')!.name).toBe('Living 01');

        const undo = cmd.undo(ctx);
        expect(undo.success).toBe(true);
        // ONE Ctrl+Z restores every room's previous name AND occupancy.
        expect(store.peek('r0')!.name).toBe('Room 00-001');
        expect(store.peek('r0')!.occupancyType).toBe('unclassified');
        expect(store.peek('r1')!.name).toBe('Room 00-002');
        expect(store.peek('r1')!.occupancyType).toBe('unclassified');
    });

    it('is best-effort: skips a room that vanished between preview and apply', () => {
        const store = makeStore([makeRoom('r0', 'Room 00-001', 'unclassified')]); // r1 missing
        const cmd = new BulkAutoClassifyRoomsCommand([
            { roomId: 'r0', name: 'Bedroom 01', occupancyType: 'bedroom' as never },
            { roomId: 'r1', name: 'Kitchen 01', occupancyType: 'kitchen' as never }, // not in store
        ]);
        const res = cmd.execute(makeCtx(store));
        expect(res.success).toBe(true);
        expect(res.affectedElementIds).toEqual(['r0']);
        expect(cmd.vanished).toEqual(['r1']);
        expect(store.updateCalls()).toBe(1);
    });

    it('canExecute refuses an empty patch list and an all-missing target set (§CONTEXT-DATA-HONESTY)', () => {
        const store = makeStore([makeRoom('r0', 'Room 00-001', 'unclassified')]);
        expect(new BulkAutoClassifyRoomsCommand([]).canExecute(makeCtx(store)).ok).toBe(false);
        expect(
            new BulkAutoClassifyRoomsCommand([{ roomId: 'ghost', name: 'Bedroom 01', occupancyType: 'bedroom' as never }])
                .canExecute(makeCtx(store)).ok,
        ).toBe(false);
    });

    it('serialize/deserialize round-trips the patch list', () => {
        const patches: RoomAutoClassifyPatch[] = [
            { roomId: 'r0', name: 'Bedroom 01', occupancyType: 'bedroom' as never },
        ];
        const cmd = new BulkAutoClassifyRoomsCommand(patches);
        const roundTripped = BulkAutoClassifyRoomsCommand.deserialize(cmd.serialize());
        const store = makeStore([makeRoom('r0', 'Room 00-001', 'unclassified')]);
        const res = roundTripped.execute(makeCtx(store));
        expect(res.success).toBe(true);
        expect(store.peek('r0')!.name).toBe('Bedroom 01');
    });
});
