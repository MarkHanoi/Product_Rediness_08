// @vitest-environment happy-dom
//
// §STAIR-3D-MOVE (2026-06-11) — unit test for MoveStairCommand.
//
// happy-dom env: importing @pryzm/command-registry transitively loads
// @pryzm/core-app-model, whose ViewRenderCache attaches window listeners at
// module load — so the test needs a DOM `window`, not the editor's default
// node env.
// Verifies the command that PERSISTS a 3D-gizmo stair move: it must translate
// the stair's world anchors (startPosition + flight startOverride + landing
// center) by the dragged delta, route the mutation through the store (P6), and
// restore the exact pre-move state on undo. The 3D mesh rebuilds from these
// fields (StairMeshBuilder reads startPosition/overrides), so translating them
// is what makes the move survive deselect/reselect + save/reload.

import { describe, it, expect } from 'vitest';
import { MoveStairCommand } from '@pryzm/command-registry';
import type { StairData } from '@pryzm/geometry-stair';

/** A minimal stair store stub exposing only the methods MoveStairCommand calls. */
class StairStoreStub {
    private map = new Map<string, StairData>();
    add(s: StairData) { this.map.set(s.id, structuredClone(s)); }
    get(id: string) { return this.map.get(id); }
    getById(id: string) { return this.map.get(id); }
    update(id: string, updates: Partial<StairData>) {
        const cur = this.map.get(id);
        if (!cur) return undefined;
        const next = { ...cur, ...updates } as StairData;
        this.map.set(id, structuredClone(next));
        return next;
    }
    restoreSnapshot(s: StairData) { this.map.set(s.id, structuredClone(s)); }
}

function makeStair(): StairData {
    return {
        id: 'stair-1',
        type: 'stair',
        levelId: 'L0',
        baseLevelId: 'L0',
        topLevelId: 'L1',
        baseOffset: 0,
        topOffset: 0,
        shape: 'L',
        startPosition: { x: 10, y: 0, z: 20 },
        width: 1.0,
        riserHeight: 0.17,
        treadDepth: 0.28,
        riserCount: 16,
        flights: [
            { direction: { x: 1, y: 0, z: 0 }, riserCount: 8 },
            { direction: { x: 0, y: 0, z: 1 }, riserCount: 8, startOverride: { x: 12, y: 0, z: 20 } },
        ],
        landings: [{ depth: 1.0, center: { x: 12, y: 0, z: 20 } }],
        properties: {
            riserVisible: true, nosingType: 'standard', nosingDepth: 0.025,
            stringerType: 'none', handrailLeft: true, handrailRight: true, handrailHeight: 1.05,
        },
        parameters: {},
        metadata: { createdAt: '', modifiedAt: '', version: 1, source: 'user' },
    };
}

function makeCtx(store: StairStoreStub) {
    // Cast — the command only touches ctx.stores.stairStore.
    return { stores: { stairStore: store } } as unknown as Parameters<MoveStairCommand['execute']>[0];
}

describe('MoveStairCommand', () => {
    it('translates startPosition, flight overrides and landing centres by the delta (XZ)', () => {
        const store = new StairStoreStub();
        store.add(makeStair());
        const cmd = new MoveStairCommand({ stairId: 'stair-1', delta: { x: 3, y: 0, z: -5 } });

        expect(cmd.canExecute(makeCtx(store)).ok).toBe(true);
        const res = cmd.execute(makeCtx(store));
        expect(res.success).toBe(true);

        const moved = store.get('stair-1')!;
        expect(moved.startPosition).toEqual({ x: 13, y: 0, z: 15 });
        expect(moved.flights[1].startOverride).toEqual({ x: 15, y: 0, z: 15 });
        expect(moved.landings[0].center).toEqual({ x: 15, y: 0, z: 15 });
        // First flight has no override — left untouched.
        expect(moved.flights[0].startOverride).toBeUndefined();
    });

    it('undo restores the exact pre-move anchors', () => {
        const store = new StairStoreStub();
        store.add(makeStair());
        const cmd = new MoveStairCommand({ stairId: 'stair-1', delta: { x: 3, y: 0, z: -5 } });

        cmd.execute(makeCtx(store));
        const undo = cmd.undo(makeCtx(store));
        expect(undo.success).toBe(true);

        const restored = store.get('stair-1')!;
        expect(restored.startPosition).toEqual({ x: 10, y: 0, z: 20 });
        expect(restored.flights[1].startOverride).toEqual({ x: 12, y: 0, z: 20 });
        expect(restored.landings[0].center).toEqual({ x: 12, y: 0, z: 20 });
    });

    it('rejects a non-finite delta and a missing stair', () => {
        const store = new StairStoreStub();
        store.add(makeStair());
        expect(new MoveStairCommand({ stairId: 'stair-1', delta: { x: NaN, z: 0 } }).canExecute(makeCtx(store)).ok).toBe(false);
        expect(new MoveStairCommand({ stairId: 'nope', delta: { x: 1, z: 1 } }).canExecute(makeCtx(store)).ok).toBe(false);
    });

    it('defaults delta.y to 0 (level-plane move)', () => {
        const store = new StairStoreStub();
        store.add(makeStair());
        const cmd = new MoveStairCommand({ stairId: 'stair-1', delta: { x: 1, z: 1 } });
        cmd.execute(makeCtx(store));
        expect(store.get('stair-1')!.startPosition.y).toBe(0);
    });
});
