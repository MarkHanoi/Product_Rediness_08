// §G-NEW-05 undo round-trip pin for UpdateFloorBoundaryCommand.
//
// PURPOSE: assert BYTE-EQUAL restoration (JSON.stringify of the whole stored
// record — nested sketch, boundary and the metadata audit trail included) across
// execute → undo. Written and watched GREEN against the ORIGINAL
// structuredClone-snapshot undo before the command was migrated to
// produceWithPatches (Immer), so it measures RESTORATION, not implementation.
//
// WHY THIS FILE IS LOAD-BEARING: this command is the floor-finish half of
// §FINISH-FOLLOWS-WALL (C79 §4/§5) — the write-back that makes a hosted floor
// finish follow a moved or removed wall. It was wired into the finish-host-tracker
// path in 5b36fad5 and is founder-visible behaviour, not dormant code. Any undo
// regression here loses the user's pre-degradation sketch.
//
// Two store flavours are exercised deliberately:
//   • a CLONING store — mirrors the real `FloorStore` (getById/update deep-copy,
//     boundary deep-merged, metadata bumped unless preserveMetadata);
//   • a SHARED-REFERENCE store — getById hands back the internal record and
//     update stores what it is given, so ANY aliasing between the undo capture
//     and the record being mutated shows up as a "snapshot" that already moved.
//
// The `delete (updates as any).levelId` guard from the real store is reproduced
// verbatim in both doubles: it mutates the object the command hands the store,
// so a frozen `updates` would throw there rather than restore.

import { describe, it, expect } from 'vitest';
import { UpdateFloorBoundaryCommand, type UpdateFloorBoundaryPayload } from '../src/floors/UpdateFloorBoundaryCommand';
import type { CommandContext } from '../src/types';

const bytes = (v: unknown) => JSON.stringify(v);

function makeFloor(id: string) {
    return {
        id,
        type: 'floor',
        levelId: 'L0',
        name: 'Kitchen finish',
        boundary: {
            polygon: [
                { x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 },
            ],
            baseOffset: 0,
            thickness: 0.018,
            detectionMethod: 'from-room',
        },
        sketch: {
            outerLoop: {
                edges: [
                    { type: 'hostReference', hostId: 'w1', hostType: 'wall', reference: 'interiorFace', offset: 0, fallback: { start: { x: 0, z: 0 }, end: { x: 4, z: 0 } } },
                    { type: 'hostReference', hostId: 'w2', hostType: 'wall', reference: 'interiorFace', offset: 0, fallback: { start: { x: 4, z: 0 }, end: { x: 4, z: 3 } } },
                    { type: 'hostReference', hostId: 'w3', hostType: 'wall', reference: 'interiorFace', offset: 0, fallback: { start: { x: 4, z: 3 }, end: { x: 0, z: 3 } } },
                    { type: 'freeLine', start: { x: 0, z: 3 }, end: { x: 0, z: 0 } },
                ],
            },
            // Inner loops must survive an outer-loop rewrite untouched (C79 §4.3).
            innerLoops: [
                { edges: [{ type: 'freeLine', start: { x: 1, z: 1 }, end: { x: 2, z: 1 } }] },
            ],
        },
        layers: [{ id: 'ly1', materialId: 'oak', thickness: 0.018, function: 'finish' }],
        serviceHoles: [],
        coveredRoomIds: ['r1'],
        boundingWallIds: ['w1', 'w2', 'w3'],
        finishSpec: { exposedScreed: false, finishColor: '#D4C4A8' },
        properties: { custom: { nested: [1, 2, { deep: true }] } },
        ifcData: { guid: 'g-1', ifcClass: 'IfcCovering', predefinedType: 'FLOORING' },
        metadata: { createdAt: 1000, modifiedAt: 1000, createdBy: 'user-a', version: 3 },
    } as any;
}

/** The real FloorStore.update merge, reproduced. */
function mergeFloor(existing: any, updates: any, preserveMetadata: boolean) {
    if (updates.levelId && updates.levelId !== existing.levelId) {
        delete (updates as any).levelId;
    }
    const merged = structuredClone(existing);
    Object.assign(merged, updates);
    if (updates.boundary) {
        merged.boundary = { ...structuredClone(existing.boundary), ...updates.boundary };
    }
    if (!preserveMetadata) {
        merged.metadata = {
            ...merged.metadata,
            modifiedAt: (merged.metadata.modifiedAt ?? 0) + 1000,
            version: (merged.metadata.version ?? 0) + 1,
        };
    }
    return merged;
}

/** Defensive store — deep-copies on every read and write (the real FloorStore). */
function makeCloningFloorStore(...floors: any[]) {
    const map = new Map<string, any>();
    for (const f of floors) map.set(f.id, structuredClone(f));
    return {
        getById: (id: string) => {
            const f = map.get(id);
            return f ? structuredClone(f) : undefined;
        },
        update: (id: string, updates: any, preserveMetadata = false) => {
            const existing = map.get(id);
            if (!existing) return undefined;
            const merged = mergeFloor(existing, updates, preserveMetadata);
            map.set(id, structuredClone(merged));
            return structuredClone(merged);
        },
        raw: (id: string) => map.get(id),
    };
}

/** Aggressive store — shared references in and out. */
function makeSharedRefFloorStore(...floors: any[]) {
    const map = new Map<string, any>();
    for (const f of floors) map.set(f.id, f);
    return {
        getById: (id: string) => map.get(id),
        update: (id: string, updates: any, preserveMetadata = false) => {
            const existing = map.get(id);
            if (!existing) return undefined;
            const merged = mergeFloor(existing, updates, preserveMetadata);
            map.set(id, merged);
            return merged;
        },
        raw: (id: string) => map.get(id),
    };
}

function makeCtx(floorStore: any): CommandContext {
    return { stores: { floorStore } } as unknown as CommandContext;
}

/** Degradation payload: the same ring, hostReference edges collapsed to freeLine. */
function degradePayload(floorId = 'f1'): UpdateFloorBoundaryPayload {
    return {
        floorId,
        mode: 'degrade',
        cause: { wallId: 'w1', kind: 'wall-removed' },
        outerLoopEdges: [
            { type: 'freeLine', start: { x: 0, z: 0 }, end: { x: 4, z: 0 } },
            { type: 'freeLine', start: { x: 4, z: 0 }, end: { x: 4, z: 3 } },
            { type: 'freeLine', start: { x: 4, z: 3 }, end: { x: 0, z: 3 } },
            { type: 'freeLine', start: { x: 0, z: 3 }, end: { x: 0, z: 0 } },
        ] as any,
    };
}

function reprojectPayload(floorId = 'f1'): UpdateFloorBoundaryPayload {
    return {
        floorId,
        mode: 'reproject',
        cause: { wallId: 'w1', kind: 'wall-moved' },
        polygon: [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 3 }, { x: 0, z: 3 }],
        outerLoopEdges: [
            { type: 'hostReference', hostId: 'w1', hostType: 'wall', reference: 'interiorFace', offset: 0, fallback: { start: { x: 0, z: 0 }, end: { x: 6, z: 0 } } },
            { type: 'hostReference', hostId: 'w2', hostType: 'wall', reference: 'interiorFace', offset: 0, fallback: { start: { x: 6, z: 0 }, end: { x: 6, z: 3 } } },
            { type: 'hostReference', hostId: 'w3', hostType: 'wall', reference: 'interiorFace', offset: 0, fallback: { start: { x: 6, z: 3 }, end: { x: 0, z: 3 } } },
            { type: 'freeLine', start: { x: 0, z: 3 }, end: { x: 0, z: 0 } },
        ] as any,
    };
}

describe('UpdateFloorBoundaryCommand — undo restores the pre-execute record byte-equal', () => {
    it('(a) cloning store · degrade: execute rewrites the outer loop; undo restores BYTE-EQUAL (sketch, boundary, metadata)', () => {
        const store = makeCloningFloorStore(makeFloor('f1'));
        const ctx = makeCtx(store);
        const before = bytes(store.raw('f1'));

        const cmd = new UpdateFloorBoundaryCommand(degradePayload());
        expect(cmd.nonUndoable).toBe(false);
        expect(cmd.canExecute(ctx).ok).toBe(true);

        const res = cmd.execute(ctx);
        expect(res.success).toBe(true);
        expect(res.affectedElementIds).toEqual(['f1']);

        const after = store.raw('f1');
        expect(after.sketch.outerLoop.edges.every((e: any) => e.type === 'freeLine')).toBe(true);
        // Inner loops survive; boundary geometry is NOT moved by a degrade (C79 §4.1).
        expect(after.sketch.innerLoops).toEqual(makeFloor('f1').sketch.innerLoops);
        expect(after.boundary.polygon).toEqual(makeFloor('f1').boundary.polygon);
        expect(bytes(after)).not.toBe(before);

        expect(cmd.undo(ctx).success).toBe(true);
        expect(bytes(store.raw('f1'))).toBe(before);
    });

    it('(b) shared-reference store · degrade: undo is still byte-equal (no aliasing between capture and mutated record)', () => {
        const store = makeSharedRefFloorStore(makeFloor('f1'));
        const ctx = makeCtx(store);
        const before = bytes(store.raw('f1'));

        const cmd = new UpdateFloorBoundaryCommand(degradePayload());
        expect(cmd.execute(ctx).success).toBe(true);
        expect(bytes(store.raw('f1'))).not.toBe(before);

        expect(cmd.undo(ctx).success).toBe(true);
        expect(bytes(store.raw('f1'))).toBe(before);
    });

    it('(c) the execute write never aliases the payload — mutating the payload edges afterwards cannot reach the store', () => {
        const store = makeSharedRefFloorStore(makeFloor('f1'));
        const ctx = makeCtx(store);
        const payload = degradePayload();
        const cmd = new UpdateFloorBoundaryCommand(payload);
        expect(cmd.execute(ctx).success).toBe(true);
        const written = bytes(store.raw('f1'));

        (payload.outerLoopEdges as any)[0].start.x = 999;
        expect(bytes(store.raw('f1'))).toBe(written);
    });

    it('(d) reproject: boundary polygon AND sketch are rewritten; undo is the documented nonUndoable no-op', () => {
        const store = makeCloningFloorStore(makeFloor('f1'));
        const ctx = makeCtx(store);

        const cmd = new UpdateFloorBoundaryCommand(reprojectPayload());
        expect(cmd.nonUndoable).toBe(true);
        expect(cmd.execute(ctx).success).toBe(true);

        const after = store.raw('f1');
        expect(after.boundary.polygon).toEqual(reprojectPayload().polygon);
        expect(after.boundary.thickness).toBe(0.018);      // untouched boundary fields survive
        expect(after.boundary.detectionMethod).toBe('from-room');
        expect(after.sketch.outerLoop.edges).toHaveLength(4);
        expect(after.sketch.innerLoops).toEqual(makeFloor('f1').sketch.innerLoops);

        const postExecute = bytes(after);
        const undoRes = cmd.undo(ctx);
        expect(undoRes.success).toBe(true);
        expect(undoRes.affectedElementIds).toEqual([]);
        expect(bytes(store.raw('f1'))).toBe(postExecute);  // no-op, per C79 §5.1
    });

    it('(e) §NO-EMPTY-MEANS-UNKNOWN: a short edge payload is refused and the store is untouched', () => {
        const store = makeCloningFloorStore(makeFloor('f1'));
        const ctx = makeCtx(store);
        const before = bytes(store.raw('f1'));

        const cmd = new UpdateFloorBoundaryCommand({
            ...degradePayload(),
            outerLoopEdges: [{ type: 'freeLine', start: { x: 0, z: 0 }, end: { x: 1, z: 0 } }] as any,
        });
        expect(cmd.canExecute(ctx).ok).toBe(false);
        const res = cmd.execute(ctx);
        expect(res.success).toBe(false);
        expect(res.error).toContain('refusing rather than writing an empty loop');
        expect(bytes(store.raw('f1'))).toBe(before);
    });

    it('(f) serialize() deep-copies the payload — the serialized form cannot be mutated through the command', () => {
        const payload = degradePayload();
        const cmd = new UpdateFloorBoundaryCommand(payload);
        const ser = cmd.serialize();
        expect(bytes(ser.payload)).toBe(bytes(payload));
        (ser.payload as any).outerLoopEdges[0].start.x = 42;
        expect((payload.outerLoopEdges as any)[0].start.x).toBe(0);
    });
});
