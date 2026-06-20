// @vitest-environment happy-dom
//
// §ELEMENT-SEMANTIC-AUDIT S4 (2026-06-20) — unit test for MovePlumbingCommand.
//
// happy-dom env: importing @pryzm/command-registry transitively loads
// @pryzm/core-app-model, whose ViewRenderCache attaches window listeners at module
// load — so the test needs a DOM `window`, not the editor's default node env.
//
// Verifies the command that makes a placed plumbing fixture movable: it must move the
// fixture's `position` to the new ABSOLUTE world point, translate any line-based
// start/end (bath) by the same delta so the fixture stays internally consistent, route
// the mutation through the store (P6), and restore the exact pre-move state on undo.

import { describe, it, expect } from 'vitest';
import { MovePlumbingCommand } from '@pryzm/command-registry';
import type { PlumbingFixtureData } from '@pryzm/geometry-plumbing';

/** Minimal Vector3-like — supports exactly the ops the command calls (clone/set). */
function vec(x: number, y: number, z: number) {
    return {
        x, y, z,
        clone() { return vec(this.x, this.y, this.z); },
        set(nx: number, ny: number, nz: number) { this.x = nx; this.y = ny; this.z = nz; return this; },
        copy(o: { x: number; y: number; z: number }) { this.x = o.x; this.y = o.y; this.z = o.z; return this; },
    };
}

/** A minimal plumbing store stub exposing only get/add (what the command calls). */
class PlumbingStoreStub {
    private map = new Map<string, PlumbingFixtureData>();
    add(f: PlumbingFixtureData) { this.map.set(f.id, f); }       // upsert (no clone — preserves the vec stub)
    get(id: string) { return this.map.get(id); }
}

function makeFixture(over: Partial<PlumbingFixtureData> = {}): PlumbingFixtureData {
    return {
        id: 'plumb-1',
        type: 'plumbing',
        fixtureType: 'toilet',
        levelId: 'L0',
        position: vec(10, 0, 20),
        width: 0.4, length: 0.6, height: 0.4, baseOffset: 0, color: '#ffffff',
        ...over,
    } as unknown as PlumbingFixtureData;
}

function makeCtx(store: PlumbingStoreStub) {
    return { stores: { plumbingStore: store } } as unknown as Parameters<MovePlumbingCommand['execute']>[0];
}

describe('MovePlumbingCommand', () => {
    it('moves the fixture position to the new absolute point', () => {
        const store = new PlumbingStoreStub();
        store.add(makeFixture());
        const cmd = new MovePlumbingCommand({ id: 'plumb-1', to: { x: 13, y: 0, z: 15 } });

        expect(cmd.canExecute(makeCtx(store)).ok).toBe(true);
        const res = cmd.execute(makeCtx(store));
        expect(res.success).toBe(true);

        const moved = store.get('plumb-1')!;
        expect({ x: moved.position.x, y: moved.position.y, z: moved.position.z }).toEqual({ x: 13, y: 0, z: 15 });
    });

    it('translates a line-based fixture start/end by the same delta (bath)', () => {
        const store = new PlumbingStoreStub();
        store.add(makeFixture({
            fixtureType: 'bath',
            startPoint: { x: 9, y: 0, z: 20 },
            endPoint: { x: 11, y: 0, z: 20 },
        } as Partial<PlumbingFixtureData>));
        const cmd = new MovePlumbingCommand({ id: 'plumb-1', to: { x: 13, y: 0, z: 15 } }); // delta = (+3,0,-5)
        cmd.execute(makeCtx(store));

        const moved = store.get('plumb-1')! as PlumbingFixtureData & {
            startPoint: { x: number; y: number; z: number }; endPoint: { x: number; y: number; z: number };
        };
        expect(moved.startPoint).toEqual({ x: 12, y: 0, z: 15 });
        expect(moved.endPoint).toEqual({ x: 14, y: 0, z: 15 });
    });

    it('undo restores the exact pre-move position', () => {
        const store = new PlumbingStoreStub();
        store.add(makeFixture());
        const cmd = new MovePlumbingCommand({ id: 'plumb-1', to: { x: 99, y: 1, z: -7 } });

        cmd.execute(makeCtx(store));
        const undo = cmd.undo(makeCtx(store));
        expect(undo.success).toBe(true);

        const restored = store.get('plumb-1')!;
        expect({ x: restored.position.x, y: restored.position.y, z: restored.position.z }).toEqual({ x: 10, y: 0, z: 20 });
    });

    it('rejects a missing fixture', () => {
        const store = new PlumbingStoreStub();
        store.add(makeFixture());
        expect(new MovePlumbingCommand({ id: 'nope', to: { x: 1, y: 0, z: 1 } }).canExecute(makeCtx(store)).ok).toBe(false);
    });
});
