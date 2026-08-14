// §G-NEW-05 undo round-trip pin for UpdateCeilingBoundaryCommand.
//
// PURPOSE: assert BYTE-EQUAL restoration (JSON.stringify of the whole stored
// record — nested sketch, boundary and the metadata audit trail included) across
// execute → undo. Written and watched GREEN against the ORIGINAL
// structuredClone-snapshot undo before the command was migrated to
// produceWithPatches (Immer), so it measures RESTORATION, not implementation.
//
// The ceiling twin of `updateFloorBoundaryUndoRoundtrip.test.ts`, deliberately
// the same shape (C79 §3.4 / §7.4: per-path divergence between the two finish
// families is worse than uniform absence). This command is the ceiling half of
// §FINISH-FOLLOWS-WALL, wired into the finish-host-tracker path in 5b36fad5 —
// founder-visible behaviour, not dormant code.
//
// Two store flavours, as for floors: a CLONING store mirroring the real
// `CeilingStore`, and a SHARED-REFERENCE store where any aliasing between the
// undo capture and the mutated record shows up immediately.
//
// ⚠ THE `holeElements` GUARD IS THE POINT OF THE DOUBLE. `CeilingStore.update`
// does `delete (updates as any).holeElements` when the key is present, and
// `clone.boundary.polygon = ensureCCW(clone.boundary.polygon)` after
// Object.assign. Both MUTATE what the command hands the store, so an undo that
// passes a frozen record (e.g. an un-copied Immer result) throws there instead of
// restoring. Both are reproduced verbatim below so that failure is a red test,
// not a production incident.

import { describe, it, expect } from 'vitest';
import { UpdateCeilingBoundaryCommand, type UpdateCeilingBoundaryPayload } from '../src/ceilings/UpdateCeilingBoundaryCommand';
import type { CommandContext } from '../src/types';

const bytes = (v: unknown) => JSON.stringify(v);

function makeCeiling(id: string) {
    return {
        id,
        type: 'ceiling',
        levelId: 'L0',
        label: 'Kitchen ceiling',
        ceilingNumber: 'C-101',
        boundary: {
            polygon: [
                { x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 },
            ],
            height: 2.7,
            thickness: 0.012,
            baseOffset: 0,
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
            innerLoops: [
                { edges: [{ type: 'freeLine', start: { x: 1, z: 1 }, end: { x: 2, z: 1 } }] },
            ],
        },
        layers: [{ id: 'ly1', materialId: 'plaster', thickness: 0.012, function: 'finish' }],
        finishSpec: { finishColor: '#FFFFFF' },
        holeElements: [
            { id: 'h1', elementId: 'e-h1', subType: 'light-fixture', shape: 'circular', centerX: 2, centerZ: 1.5, radius: 0.1 },
        ],
        coveredRoomIds: ['r1'],
        boundingWallIds: ['w1', 'w2', 'w3'],
        visible: true,
        properties: { custom: { nested: [1, 2, { deep: true }] } },
        ifcData: { guid: 'g-1', ifcClass: 'IfcCovering', predefinedType: 'CEILING' },
        metadata: { createdAt: 1000, modifiedAt: 1000, createdBy: 'user-a', version: 3 },
    } as any;
}

/** The real CeilingStore.update merge, reproduced — guards included. */
function mergeCeiling(existing: any, updates: any, preserveMetadata: boolean) {
    if (updates.levelId && updates.levelId !== existing.levelId) {
        delete (updates as any).levelId;
    }
    // §CEILING-HOLE-API — mutates the caller's object. A frozen `updates` throws here.
    if ('holeElements' in updates) {
        delete (updates as any).holeElements;
    }
    const clone = structuredClone(existing);
    Object.assign(clone, updates);
    if (updates.boundary) {
        // ensureCCW returns a new array, but the ASSIGNMENT targets clone.boundary,
        // which is `updates.boundary` itself after Object.assign — frozen input throws.
        clone.boundary.polygon = clone.boundary.polygon.slice();
    }
    if (!preserveMetadata) {
        clone.metadata = {
            ...clone.metadata,
            modifiedAt: (clone.metadata.modifiedAt ?? 0) + 1000,
            version: (clone.metadata.version ?? 0) + 1,
        };
    }
    return clone;
}

function makeCloningCeilingStore(...ceilings: any[]) {
    const map = new Map<string, any>();
    for (const c of ceilings) map.set(c.id, structuredClone(c));
    return {
        getById: (id: string) => {
            const c = map.get(id);
            return c ? structuredClone(c) : undefined;
        },
        update: (id: string, updates: any, preserveMetadata = false) => {
            const existing = map.get(id);
            if (!existing) return undefined;
            const merged = mergeCeiling(existing, updates, preserveMetadata);
            map.set(id, structuredClone(merged));
            return structuredClone(merged);
        },
        raw: (id: string) => map.get(id),
    };
}

function makeSharedRefCeilingStore(...ceilings: any[]) {
    const map = new Map<string, any>();
    for (const c of ceilings) map.set(c.id, c);
    return {
        getById: (id: string) => map.get(id),
        update: (id: string, updates: any, preserveMetadata = false) => {
            const existing = map.get(id);
            if (!existing) return undefined;
            const merged = mergeCeiling(existing, updates, preserveMetadata);
            map.set(id, merged);
            return merged;
        },
        raw: (id: string) => map.get(id),
    };
}

function makeCtx(ceilingStore: any): CommandContext {
    return { stores: { ceilingStore } } as unknown as CommandContext;
}

function degradePayload(ceilingId = 'c1'): UpdateCeilingBoundaryPayload {
    return {
        ceilingId,
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

function reprojectPayload(ceilingId = 'c1'): UpdateCeilingBoundaryPayload {
    return {
        ceilingId,
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

describe('UpdateCeilingBoundaryCommand — undo restores the pre-execute record byte-equal', () => {
    it('(a) cloning store · degrade: execute rewrites the outer loop; undo restores BYTE-EQUAL (sketch, boundary, metadata)', () => {
        const store = makeCloningCeilingStore(makeCeiling('c1'));
        const ctx = makeCtx(store);
        const before = bytes(store.raw('c1'));

        const cmd = new UpdateCeilingBoundaryCommand(degradePayload());
        expect(cmd.nonUndoable).toBe(false);
        expect(cmd.canExecute(ctx).ok).toBe(true);

        const res = cmd.execute(ctx);
        expect(res.success).toBe(true);
        expect(res.affectedElementIds).toEqual(['c1']);

        const after = store.raw('c1');
        expect(after.sketch.outerLoop.edges.every((e: any) => e.type === 'freeLine')).toBe(true);
        expect(after.sketch.innerLoops).toEqual(makeCeiling('c1').sketch.innerLoops);
        expect(after.boundary.polygon).toEqual(makeCeiling('c1').boundary.polygon);
        expect(after.holeElements).toEqual(makeCeiling('c1').holeElements);
        expect(bytes(after)).not.toBe(before);

        expect(cmd.undo(ctx).success).toBe(true);
        expect(bytes(store.raw('c1'))).toBe(before);
    });

    it('(b) shared-reference store · degrade: undo is still byte-equal (no aliasing between capture and mutated record)', () => {
        const store = makeSharedRefCeilingStore(makeCeiling('c1'));
        const ctx = makeCtx(store);
        const before = bytes(store.raw('c1'));

        const cmd = new UpdateCeilingBoundaryCommand(degradePayload());
        expect(cmd.execute(ctx).success).toBe(true);
        expect(bytes(store.raw('c1'))).not.toBe(before);

        expect(cmd.undo(ctx).success).toBe(true);
        expect(bytes(store.raw('c1'))).toBe(before);
    });

    it('(c) the execute write never aliases the payload — mutating the payload edges afterwards cannot reach the store', () => {
        const store = makeSharedRefCeilingStore(makeCeiling('c1'));
        const ctx = makeCtx(store);
        const payload = degradePayload();
        const cmd = new UpdateCeilingBoundaryCommand(payload);
        expect(cmd.execute(ctx).success).toBe(true);
        const written = bytes(store.raw('c1'));

        (payload.outerLoopEdges as any)[0].start.x = 999;
        expect(bytes(store.raw('c1'))).toBe(written);
    });

    it('(d) reproject: boundary polygon AND sketch are rewritten; undo is the documented nonUndoable no-op', () => {
        const store = makeCloningCeilingStore(makeCeiling('c1'));
        const ctx = makeCtx(store);

        const cmd = new UpdateCeilingBoundaryCommand(reprojectPayload());
        expect(cmd.nonUndoable).toBe(true);
        expect(cmd.execute(ctx).success).toBe(true);

        const after = store.raw('c1');
        expect(after.boundary.polygon).toEqual(reprojectPayload().polygon);
        expect(after.boundary.height).toBe(2.7);           // untouched boundary fields survive
        expect(after.boundary.detectionMethod).toBe('from-room');
        expect(after.sketch.outerLoop.edges).toHaveLength(4);
        expect(after.sketch.innerLoops).toEqual(makeCeiling('c1').sketch.innerLoops);

        const postExecute = bytes(after);
        const undoRes = cmd.undo(ctx);
        expect(undoRes.success).toBe(true);
        expect(undoRes.affectedElementIds).toEqual([]);
        expect(bytes(store.raw('c1'))).toBe(postExecute);
    });

    it('(e) §NO-EMPTY-MEANS-UNKNOWN: a short edge payload is refused and the store is untouched', () => {
        const store = makeCloningCeilingStore(makeCeiling('c1'));
        const ctx = makeCtx(store);
        const before = bytes(store.raw('c1'));

        const cmd = new UpdateCeilingBoundaryCommand({
            ...degradePayload(),
            outerLoopEdges: [{ type: 'freeLine', start: { x: 0, z: 0 }, end: { x: 1, z: 0 } }] as any,
        });
        expect(cmd.canExecute(ctx).ok).toBe(false);
        const res = cmd.execute(ctx);
        expect(res.success).toBe(false);
        expect(res.error).toContain('refusing rather than writing an empty loop');
        expect(bytes(store.raw('c1'))).toBe(before);
    });

    it('(f) serialize() deep-copies the payload — the serialized form cannot be mutated through the command', () => {
        const payload = degradePayload();
        const cmd = new UpdateCeilingBoundaryCommand(payload);
        const ser = cmd.serialize();
        expect(bytes(ser.payload)).toBe(bytes(payload));
        (ser.payload as any).outerLoopEdges[0].start.x = 42;
        expect((payload.outerLoopEdges as any)[0].start.x).toBe(0);
    });
});
