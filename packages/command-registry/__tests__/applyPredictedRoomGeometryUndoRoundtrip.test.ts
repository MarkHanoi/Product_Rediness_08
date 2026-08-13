// §G-NEW-05 undo round-trip pin for ApplyPredictedRoomGeometryCommand.
//
// PURPOSE: this suite asserts BYTE-EQUAL restoration (JSON.stringify of the whole
// stored record, nested objects included) across execute → undo. It was written
// and watched GREEN against the ORIGINAL structuredClone-snapshot undo before the
// command was migrated to produceWithPatches (Immer), so it measures RESTORATION,
// not implementation: the patch-based undo must match the snapshot idiom's
// trivially-correct restore exactly, or this file fails.
//
// Two store flavours are exercised deliberately:
//   • a CLONING store (getById/update deep-copy) — the defensive shape the
//     existing stair suites use;
//   • a SHARED-REFERENCE store (getById returns the internal record, update
//     stores the given object) — the aggressive shape closest to the real
//     RoomStore, where any aliasing bug in the undo capture shows up as a
//     mutated "snapshot".

import { describe, it, expect } from 'vitest';
import {
    ApplyPredictedRoomGeometryCommand,
    type PredictedRoomGeometry,
} from '../src/rooms/ApplyPredictedRoomGeometryCommand';
import type { CommandContext } from '../src/types';

function makeRoom(id: string) {
    return {
        id,
        type: 'room',
        levelId: 'L0',
        name: 'Kitchen',
        roomNumber: '101',
        occupancyType: 'kitchen',
        boundingWallIds: ['w1', 'w2', 'w3', 'w4'],
        boundingSlabIds: [],
        boundingColumnIds: [],
        finishes: {
            floor: { material: 'oak', thickness: 0.018 },
            walls: [{ material: 'paint', colour: '#ffffff' }],
        },
        properties: { custom: { nested: [1, 2, { deep: true }] } },
        boundary: {
            polygon: [
                { x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 },
            ],
            height: 2.7,
            detectionMethod: 'manual-boundary',
        },
        computed: {
            area: 12,
            grossArea: 12,
            perimeter: 14,
            // Computed exactly as the command computes it (area * height) so an
            // identical prediction is BYTE-identical: 12 * 2.7 !== 32.4 in floats.
            volume: 12 * 2.7,
            centroid: { x: 2, z: 1.5 },
            boundingBox: { minX: 0, minZ: 0, maxX: 4, maxZ: 3 },
        },
        metadata: { createdAt: 1000, createdBy: 'user-a', modifiedAt: 1000, version: 3 },
    };
}

/** Defensive store: every read and write deep-copies (the stair-suite shape). */
function makeCloningRoomStore(...rooms: any[]) {
    const map = new Map<string, any>();
    for (const r of rooms) map.set(r.id, structuredClone(r));
    return {
        getById: (id: string) => {
            const r = map.get(id);
            return r ? structuredClone(r) : undefined;
        },
        update: (id: string, next: any) => {
            if (!map.has(id)) throw new Error(`no such room: ${id}`);
            map.set(id, structuredClone(next));
        },
        /** Raw internal record — what "the store holds" means in assertions. */
        raw: (id: string) => map.get(id),
    };
}

/** Aggressive store: shared references in and out (closest to the real RoomStore). */
function makeSharedRefRoomStore(...rooms: any[]) {
    const map = new Map<string, any>();
    for (const r of rooms) map.set(r.id, r);
    return {
        getById: (id: string) => map.get(id),
        update: (id: string, next: any) => {
            if (!map.has(id)) throw new Error(`no such room: ${id}`);
            map.set(id, next);
        },
        raw: (id: string) => map.get(id),
    };
}

function makeCtx(roomStore: any): CommandContext {
    return { stores: { roomStore } } as unknown as CommandContext;
}

const PREDICTED_R1: PredictedRoomGeometry = {
    elementId: 'r1',
    polygon: [
        { x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 3 }, { x: 0, z: 3 },
    ],
    area: 15,
    perimeter: 16,
    centroid: { x: 2.5, z: 1.5 },
    boundingBox: { minX: 0, minZ: 0, maxX: 5, maxZ: 3 },
};

const bytes = (v: unknown) => JSON.stringify(v);

describe('ApplyPredictedRoomGeometryCommand — undo restores the pre-execute record byte-equal', () => {
    it('(a) cloning store: execute changes geometry only; undo restores BYTE-EQUAL including nested objects', () => {
        const store = makeCloningRoomStore(makeRoom('r1'));
        const ctx = makeCtx(store);
        const before = bytes(store.raw('r1'));

        const cmd = new ApplyPredictedRoomGeometryCommand([PREDICTED_R1]);
        expect(cmd.canExecute(ctx).ok).toBe(true);
        const res = cmd.execute(ctx);
        expect(res.success).toBe(true);
        expect(res.affectedElementIds).toEqual(['r1']);
        expect(cmd.outcomes).toEqual([{ roomId: 'r1', outcome: 'applied' }]);

        // The write happened: geometry moved, semantics untouched.
        const after = store.raw('r1');
        expect(after.boundary.polygon).toEqual(PREDICTED_R1.polygon);
        expect(after.computed.area).toBe(15);
        expect(after.computed.volume).toBeCloseTo(15 * 2.7, 9);
        expect(after.name).toBe('Kitchen');
        expect(after.finishes).toEqual(makeRoom('r1').finishes);
        expect(after.boundary.detectionMethod).toBe('manual-boundary');
        expect(bytes(after)).not.toBe(before);

        // The round trip: undo must restore the record BYTE-EQUAL.
        expect(cmd.undo(ctx).success).toBe(true);
        expect(bytes(store.raw('r1'))).toBe(before);
    });

    it('(b) shared-reference store: undo is still byte-equal (no aliasing between the undo capture and the mutated record)', () => {
        const store = makeSharedRefRoomStore(makeRoom('r1'));
        const ctx = makeCtx(store);
        const before = bytes(store.raw('r1'));

        const cmd = new ApplyPredictedRoomGeometryCommand([PREDICTED_R1]);
        expect(cmd.execute(ctx).success).toBe(true);
        expect(bytes(store.raw('r1'))).not.toBe(before);

        expect(cmd.undo(ctx).success).toBe(true);
        expect(bytes(store.raw('r1'))).toBe(before);
    });

    it('(c) multi-room: only the changed room is written; undo restores EVERY written room byte-equal and leaves the identical one alone', () => {
        const r1 = makeRoom('r1');
        const r2 = { ...makeRoom('r2'), id: 'r2', name: 'Bedroom' };
        const store = makeCloningRoomStore(r1, r2);
        const ctx = makeCtx(store);
        const before1 = bytes(store.raw('r1'));
        const before2 = bytes(store.raw('r2'));

        // r2's "prediction" is byte-identical to its stored geometry → no write.
        const identicalR2: PredictedRoomGeometry = {
            elementId: 'r2',
            polygon: r2.boundary.polygon,
            area: r2.computed.area,
            perimeter: r2.computed.perimeter,
            centroid: r2.computed.centroid,
            boundingBox: r2.computed.boundingBox,
        };

        const cmd = new ApplyPredictedRoomGeometryCommand([PREDICTED_R1, identicalR2]);
        expect(cmd.execute(ctx).success).toBe(true);
        expect(cmd.outcomes).toEqual([
            { roomId: 'r1', outcome: 'applied' },
            { roomId: 'r2', outcome: 'already-identical' },
        ]);
        expect(bytes(store.raw('r2'))).toBe(before2); // never touched

        expect(cmd.undo(ctx).success).toBe(true);
        expect(bytes(store.raw('r1'))).toBe(before1);
        expect(bytes(store.raw('r2'))).toBe(before2);
    });

    it('(d) room-not-found is reported and undo of a nothing-written execute changes nothing', () => {
        const store = makeCloningRoomStore(makeRoom('r1'));
        const ctx = makeCtx(store);
        const before = bytes(store.raw('r1'));

        const ghost: PredictedRoomGeometry = { ...PREDICTED_R1, elementId: 'r-ghost' };
        const cmd = new ApplyPredictedRoomGeometryCommand([ghost]);
        expect(cmd.execute(ctx).success).toBe(true);
        expect(cmd.outcomes[0]).toMatchObject({ roomId: 'r-ghost', outcome: 'room-not-found' });

        expect(cmd.undo(ctx).success).toBe(true);
        expect(bytes(store.raw('r1'))).toBe(before);
        expect(store.raw('r-ghost')).toBeUndefined(); // never invented
    });
});
