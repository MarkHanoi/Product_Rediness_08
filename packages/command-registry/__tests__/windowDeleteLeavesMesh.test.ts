// §FIX-WINDOW-DELETE-LEAVES-MESH (L-308) — deleting a hosted window/door must
// dispose its 3D mesh, not just heal the wall opening.
//
// THE BUG (same family as L-298 — DELETE_ELEMENT cleanup incomplete for a hosted
// element): DeleteElementCommand's window branch removed the wall opening
// (wallStore.removeWindow) and unregistered the element, but NEVER removed the
// record from the EXTERNAL windowStore singleton. WindowBuilder is a pure
// windowStore subscriber that disposes a window's frame+glazing group ONLY on a
// windowStore 'remove' event — so the mesh floated on the now-solid wall forever.
// The door branch had the identical defect against doorStore/DoorBuilder.
//
// THE TEETH: this test wires a FAKE BUILDER that mirrors WindowBuilder /
// DoorBuilder's real subscription — it holds a live-mesh id on 'add'/'update' and
// DISPOSES it on 'remove'. Asserting the fake builder no longer holds the mesh is
// what discriminates "mesh actually disposed" from "record removed":
//   • On the OLD code, windowStore.remove(id) was never called, so no 'remove'
//     event fired and the fake builder STILL HELD the mesh → this assertion FAILS.
//   • A test that only checked the wallStore opening would PASS on the old code
//     (the opening removal always worked) — it would not catch the bug the founder
//     sees, which is the lingering MESH.
//
// Data/command test only (no THREE, no DOM): it drives the real DeleteElementCommand
// against the REAL windowStore/doorStore singletons + a faithful in-memory wallStore.

import { describe, it, expect, beforeEach } from 'vitest';
import { windowStore } from '@pryzm/geometry-window';
import { doorStore } from '@pryzm/geometry-door';
import { DeleteElementCommand } from '../src/walls/DeleteElementCommand';
import type { CommandContext } from '../src/types';

interface Opening {
    id: string; type: 'window' | 'door'; elementId: string;
    offset: number; width: number; height: number; sillHeight: number;
}
interface FakeWall {
    id: string; type: 'wall'; levelId: string;
    baseLine: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
    height: number; thickness: number; openings: Opening[]; childrenIds: string[];
}

function makeWall(id: string, lengthM: number): FakeWall {
    return {
        id, type: 'wall', levelId: 'L0',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: lengthM, y: 0, z: 0 }],
        height: 2.4, thickness: 0.2, openings: [], childrenIds: [],
    };
}

/**
 * Faithful wallStore double. Its internal window/door maps are SEPARATE from the
 * external windowStore/doorStore singletons — exactly the two-store reality the
 * bug lived in. removeWindow/removeDoor cascade to opening removal (as the real
 * WallStore does) but deliberately DO NOT touch the external singleton.
 */
function makeCtx(walls: FakeWall[]) {
    const byId = new Map(walls.map(w => [w.id, w]));
    const winIndex = new Map<string, { wallId: string; openingId: string; record: any }>();
    const doorIndex = new Map<string, { wallId: string; openingId: string; record: any }>();

    const wallStore = {
        getById: (id: string) => byId.get(id),
        getWindow: (id: string) => { const r = winIndex.get(id); return r ? { ...r.record } : undefined; },
        getDoor: (id: string) => { const r = doorIndex.get(id); return r ? { ...r.record } : undefined; },
        removeWindow: (id: string) => {
            const ref = winIndex.get(id);
            if (!ref) return;
            winIndex.delete(id);
            const w = byId.get(ref.wallId);
            if (w) w.openings = w.openings.filter(o => o.elementId !== id);
        },
        removeDoor: (id: string) => {
            const ref = doorIndex.get(id);
            if (!ref) return;
            doorIndex.delete(id);
            const w = byId.get(ref.wallId);
            if (w) w.openings = w.openings.filter(o => o.elementId !== id);
        },
        addWindow: (rec: any) => { winIndex.set(rec.id, { wallId: rec.wallId, openingId: rec.openingId, record: { ...rec } }); },
        addDoor: (rec: any) => { doorIndex.set(rec.id, { wallId: rec.wallId, openingId: rec.openingId, record: { ...rec } }); },
        restoreOpening: (wallId: string, opening: Opening) => {
            const w = byId.get(wallId);
            if (w && !w.openings.some(o => o.id === opening.id)) w.openings.push({ ...opening });
        },
        getAll: () => [...byId.values()],
        _hostWindow: (winId: string, wallId: string, op: Opening, record: any) =>
            winIndex.set(winId, { wallId, openingId: op.id, record: { id: winId, wallId, openingId: op.id, ...op, ...record } }),
        _hostDoor: (doorId: string, wallId: string, op: Opening, record: any) =>
            doorIndex.set(doorId, { wallId, openingId: op.id, record: { id: doorId, wallId, openingId: op.id, ...op, ...record } }),
    };
    const ctx = { stores: { wallStore }, bimManager: {} } as unknown as CommandContext;
    return { ctx, wallStore, byId };
}

/**
 * A stand-in for WindowBuilder / DoorBuilder: subscribes to the external store and
 * holds the set of live MESH ids, adding on 'add'/'update' and DISPOSING on
 * 'remove' — byte-for-byte the real builders' subscription contract.
 */
function fakeBuilder(store: {
    getAll: () => Array<{ id: string }>;
    subscribe: (l: (e: string, r: { id: string }) => void) => () => void;
}) {
    const meshes = new Set<string>();
    // Mirror WindowBuilder.activate()'s replay of already-stored records.
    for (const rec of store.getAll()) meshes.add(rec.id);
    const unsub = store.subscribe((event, rec) => {
        if (event === 'add' || event === 'update') meshes.add(rec.id);
        if (event === 'remove') meshes.delete(rec.id); // == Builder.dispose(rec.id)
    });
    return { meshes, unsub };
}

const WIN = { id: 'win-1', openingId: 'op-w1', wallId: 'w1', offset: 1.0, width: 1.0, height: 1.2, sillHeight: 0.9 };
const WIN_SIBLING = { id: 'win-2', openingId: 'op-w2', wallId: 'w1', offset: 3.0, width: 1.0, height: 1.2, sillHeight: 0.9 };
const DOOR = { id: 'door-1', openingId: 'op-d1', wallId: 'w1', offset: 5.0, width: 0.9, height: 2.1, sillHeight: 0 };

function cleanExternalStores() {
    for (const id of [WIN.id, WIN_SIBLING.id, DOOR.id]) {
        if (windowStore.has(id)) windowStore.remove(id);
        if (doorStore.has(id)) doorStore.remove(id);
    }
}

beforeEach(cleanExternalStores);

describe('§FIX-WINDOW-DELETE-LEAVES-MESH — hosted WINDOW delete disposes the mesh', () => {
    function setup() {
        const winOp: Opening = { id: 'op-w1', type: 'window', elementId: 'win-1', offset: 1.0, width: 1.0, height: 1.2, sillHeight: 0.9 };
        const sibOp: Opening = { id: 'op-w2', type: 'window', elementId: 'win-2', offset: 3.0, width: 1.0, height: 1.2, sillHeight: 0.9 };
        const { ctx, wallStore, byId } = makeCtx([
            { ...makeWall('w1', 8), openings: [winOp, sibOp], childrenIds: ['win-1', 'win-2'] },
        ]);
        // External store (drives the mesh) + wallStore internal map, as the create path does.
        windowStore.add({ ...WIN });
        windowStore.add({ ...WIN_SIBLING });
        (wallStore as any)._hostWindow('win-1', 'w1', winOp, WIN);
        (wallStore as any)._hostWindow('win-2', 'w1', sibOp, WIN_SIBLING);
        const builder = fakeBuilder(windowStore);
        // The builder holds both meshes after the create replay.
        expect(builder.meshes.has('win-1')).toBe(true);
        return { ctx, byId, builder };
    }

    it('THE TOOTH: after delete the builder no longer holds the window mesh (mesh DISPOSED, not just record removed)', () => {
        const { ctx, byId, builder } = setup();
        const cmd = new DeleteElementCommand('win-1');
        expect(cmd.canExecute(ctx).ok).toBe(true);
        cmd.execute(ctx);

        // (a) THE DISCRIMINATOR — the fake builder (a windowStore subscriber, exactly
        //     like WindowBuilder) disposed the mesh because a 'remove' event fired.
        expect(builder.meshes.has('win-1')).toBe(false);
        // (b) The mesh-driving external record is gone…
        expect(windowStore.has('win-1')).toBe(false);
        // (c) …and the wall opening is gone (wall healed solid).
        expect(byId.get('w1')!.openings.some(o => o.elementId === 'win-1')).toBe(false);
        builder.unsub();
    });

    it('a SIBLING window on the SAME wall is untouched (mesh + record + opening survive)', () => {
        const { ctx, byId, builder } = setup();
        new DeleteElementCommand('win-1').execute(ctx);

        expect(builder.meshes.has('win-2')).toBe(true);
        expect(windowStore.has('win-2')).toBe(true);
        expect(byId.get('w1')!.openings.some(o => o.elementId === 'win-2')).toBe(true);
        builder.unsub();
    });

    it('ONE undo restores the mesh + record + opening (pre-delete state)', () => {
        const { ctx, byId, builder } = setup();
        const cmd = new DeleteElementCommand('win-1');
        cmd.execute(ctx);
        expect(builder.meshes.has('win-1')).toBe(false);

        cmd.undo(ctx);
        // Mesh rebuilt (builder received 'add'), record back, opening re-cut.
        expect(builder.meshes.has('win-1')).toBe(true);
        expect(windowStore.has('win-1')).toBe(true);
        expect(byId.get('w1')!.openings.some(o => o.elementId === 'win-1')).toBe(true);
        builder.unsub();
    });
});

describe('§FIX-WINDOW-DELETE-LEAVES-MESH — hosted DOOR delete disposes the leaf/frame mesh', () => {
    function setup() {
        const doorOp: Opening = { id: 'op-d1', type: 'door', elementId: 'door-1', offset: 5.0, width: 0.9, height: 2.1, sillHeight: 0 };
        const { ctx, wallStore, byId } = makeCtx([
            { ...makeWall('w1', 8), openings: [doorOp], childrenIds: ['door-1'] },
        ]);
        doorStore.add({ ...DOOR });
        (wallStore as any)._hostDoor('door-1', 'w1', doorOp, DOOR);
        const builder = fakeBuilder(doorStore);
        expect(builder.meshes.has('door-1')).toBe(true);
        return { ctx, byId, builder };
    }

    it('THE TOOTH: after delete the builder no longer holds the door mesh', () => {
        const { ctx, byId, builder } = setup();
        const cmd = new DeleteElementCommand('door-1');
        expect(cmd.canExecute(ctx).ok).toBe(true);
        cmd.execute(ctx);

        expect(builder.meshes.has('door-1')).toBe(false);
        expect(doorStore.has('door-1')).toBe(false);
        expect(byId.get('w1')!.openings.some(o => o.elementId === 'door-1')).toBe(false);
        builder.unsub();
    });

    it('ONE undo restores the door mesh + record + opening', () => {
        const { ctx, byId, builder } = setup();
        const cmd = new DeleteElementCommand('door-1');
        cmd.execute(ctx);
        expect(builder.meshes.has('door-1')).toBe(false);

        cmd.undo(ctx);
        expect(builder.meshes.has('door-1')).toBe(true);
        expect(doorStore.has('door-1')).toBe(true);
        expect(byId.get('w1')!.openings.some(o => o.elementId === 'door-1')).toBe(true);
        builder.unsub();
    });
});
