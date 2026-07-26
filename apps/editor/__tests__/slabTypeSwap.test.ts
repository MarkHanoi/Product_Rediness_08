// @vitest-environment happy-dom
//
// §FIX-SLAB-TYPE-SWAP (mirrors §FIX-FLOOR-TYPE-SWAP L-106) + §FIX-SLAB-PARAM-WIPE.
//
// Three founder-reported slab property-editing bugs, all in the element-update /
// command-bus / store path (NOT stair geometry):
//
//  (1) Can't change slab TYPE, and (2) can't change material/layers: the property
//      panel dispatched 'slab.updateLayers' / 'slab.update', whose plugin-bus handlers
//      resolve the slab from the plugin Immer slab store — a DETACHED store that is
//      EMPTY for SlabTool-created slabs (the tool writes the LEGACY geometry SlabStore
//      via cm.execute). Result: canExecute rejected "slab not found: <id>". The fix
//      routes both through the uniform 'element.changeType' command →
//      UpdateSlabLayersCommand on the LEGACY SlabStore (the store the slab lives in),
//      which fires 'bim-slab-updated' → SlabFragmentBuilder rebuilds the mesh.
//
//  (3) Per-frame crash after a slab param update: UpdateElementParameterCommand passed
//      the raw partial parameter set ({ materialColor }) to SlabStore.update(), which
//      does a FULL REPLACE (not a partial merge like WallStore) — wiping the whole slab
//      record, including its id. The store then emitted a StoreChangeEvent with
//      elementId=undefined, crashing ViewDependencyTracker._onStoreEvent (.includes) and
//      DependencyResolver's cascade dispatcher (.substring) every rAF. The fix merges
//      the partial onto the existing record first (mirrors the furniture branch).
//
// Maps to C03 §4.5–4.8 (undo architecture) + ADR-0105 (uniform element.changeType) +
// C11 (element pipeline).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RingBufferUndoStack } from '@pryzm/runtime-undo-stack';
import { SlabStore } from '@pryzm/geometry-slab';
import { UpdateSlabLayersCommand } from '@pryzm/command-registry';
// §FIX-SLAB-PARAM-WIPE — import the command from source directly. In a git worktree the
// `@pryzm/*` package symlinks resolve to the MAIN checkout, so a barrel import would test
// the unpatched command; the relative path exercises the fix under test. At integration
// (merged to main) both paths resolve to the same file.
import { UpdateElementParameterCommand } from '../../../packages/command-registry/src/generic/UpdateElementParameterCommand';
import { toJsonPointer } from '@pryzm/command-bus';
import { performUndo, performRedo } from '../src/engine/undo/performUndoRedo';

function makeStore(): SlabStore {
    // SlabStore only reads projectContext.activeLevelId.
    return new SlabStore({ activeLevelId: 'L0' } as any);
}

function makeSlab(id: string): any {
    return {
        id,
        type: 'slab',
        levelId: 'L0',
        parentId: 'L0',
        position: { x: 0, y: 0, z: 0 },
        thickness: 0.2,
        polygon: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }],
        layers: [{ name: 'Plain Structure', function: 'structure', thickness: 0.2, materialColor: '#909090' }],
        properties: { mark: 'SB001' },
        ifcData: { guid: 'guid-' + id, ifcClass: 'IfcSlab' },
    };
}

const RC_LAYERS = [
    { name: 'RC Structure', function: 'structure', thickness: 0.2, materialColor: '#8a8a8a' },
    { name: 'Screed', function: 'screed', thickness: 0.05, materialColor: '#c8bfa8' },
];

describe('§FIX-SLAB-TYPE-SWAP — swap resolves against the legacy SlabStore', () => {
    it('UpdateSlabLayersCommand FINDS the slab and applies the new type/layers/thickness', () => {
        const store = makeStore();
        const id = 'slab-087803cd';
        store.add(makeSlab(id));

        // Sanity: the slab exists in the legacy store (the store the fix targets).
        expect(store.getById(id)).toBeDefined();

        const cmd = new UpdateSlabLayersCommand({
            slabId: id,
            systemTypeId: 'st-rc-screed',
            layers: RC_LAYERS as any,
            thickness: 0.25,
        });

        // canExecute must NOT reject with "slab not found" — the core founder bug.
        const v = cmd.canExecute({ stores: { slabStore: store } } as any);
        expect(v.ok).toBe(true);

        const res = cmd.execute({ stores: { slabStore: store } } as any);
        expect(res.success).toBe(true);

        const after = store.getById(id)! as any;
        expect(after.systemTypeId).toBe('st-rc-screed');
        expect(after.layers).toHaveLength(2);
        expect(after.layers.map((l: any) => l.name)).toEqual(['RC Structure', 'Screed']);
        expect(after.thickness).toBeCloseTo(0.25, 6);
        // The record is intact — id survived the update.
        expect(after.id).toBe(id);
    });

    it('canExecute still rejects a genuinely-missing slab', () => {
        const store = makeStore();
        const cmd = new UpdateSlabLayersCommand({
            slabId: 'does-not-exist',
            systemTypeId: 'st-rc',
            layers: RC_LAYERS as any,
            thickness: 0.25,
        });
        const v = cmd.canExecute({ stores: { slabStore: store } } as any);
        expect(v.ok).toBe(false);
    });
});

describe('§FIX-SLAB-PARAM-WIPE — a material change must NOT wipe the slab record', () => {
    it('UpdateElementParameterCommand merges the partial onto the existing slab (id + polygon survive)', () => {
        const store = makeStore();
        const id = 'slab-087803cd';
        store.add(makeSlab(id));

        // Capture the store event the update emits — the crash was a downstream listener
        // reading `.includes`/`.substring` on an undefined elementId.
        const seenIds: unknown[] = [];
        const unsub = (store as any).subscribe?.((_evt: string, slab: any) => seenIds.push(slab?.id));

        const cmd = new UpdateElementParameterCommand({
            elementId: id,
            elementType: 'slab',
            parameters: { materialColor: '#df5d5d' },
        });
        const res = cmd.execute({ stores: { slabStore: store } } as any);
        expect(res.success).toBe(true);

        const after = store.getById(id)! as any;
        // The material was applied…
        expect(after.materialColor).toBe('#df5d5d');
        // …AND the record is still whole (the wipe would have left `{ materialColor }`).
        expect(after.id).toBe(id);
        expect(after.polygon).toHaveLength(4);
        expect(after.layers).toHaveLength(1);
        expect(after.thickness).toBe(0.2);

        // Every emitted event carried a defined id → no undefined-elementId crash.
        expect(seenIds.length).toBeGreaterThan(0);
        expect(seenIds.every(x => typeof x === 'string' && x.length > 0)).toBe(true);
        unsub?.();
    });
});

describe('§FIX-SLAB-TYPE-SWAP — ring-buffer undo/redo parity', () => {
    let store: SlabStore;
    let rb: RingBufferUndoStack;
    let dropSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        store = makeStore();
        rb = new RingBufferUndoStack();
        dropSpy = vi.fn(() => 1);
        (globalThis as any).commandManager = {
            canUndo: () => false,
            canRedo: () => false,
            undo: vi.fn(),
            redo: vi.fn(),
            dropEntriesForTargets: dropSpy,
        };
        (window as any).slabStore = store;
        (window as any).runtime = { bus: { ringBuffer: rb } };
    });

    afterEach(() => {
        delete (globalThis as any).commandManager;
        delete (window as any).slabStore;
        delete (window as any).runtime;
    });

    it('undo reverses the SWAP in place (slab not deleted), redo re-applies', () => {
        const id = 'slab_01KWKNVX';
        store.add(makeSlab(id));

        // Prior CREATE entry on the ring — the exact condition under which a naive
        // (cm-only) swap undo pops the CREATE instead of the swap.
        rb.push({
            forward: { ops: [{ op: 'add', path: toJsonPointer([id]), value: store.getById(id) }] },
            inverse: { ops: [{ op: 'remove', path: toJsonPointer([id]) }] },
            affectedStores: ['slab'],
        });

        // The swap: full-replace the record (mirror UpdateSlabLayersCommand) + push the
        // invertible replace pair (mirror the element.changeType slab branch).
        const oldData = structuredClone(store.getById(id)) as any;
        const swapped = structuredClone(oldData);
        swapped.systemTypeId = 'st-rc-screed';
        swapped.layers = RC_LAYERS;
        swapped.thickness = 0.25;
        store.update(id, swapped);
        const newData = structuredClone(store.getById(id));
        rb.push({
            forward: { ops: [{ op: 'replace', path: toJsonPointer([id]), value: newData }] },
            inverse: { ops: [{ op: 'replace', path: toJsonPointer([id]), value: oldData }] },
            affectedStores: ['slab'],
        });

        expect((store.getById(id)! as any).systemTypeId).toBe('st-rc-screed');

        // UNDO — restores the ORIGINAL type on the SAME element; does NOT delete it.
        performUndo();
        const afterUndo = store.getById(id) as any;
        expect(afterUndo).toBeDefined();
        expect(afterUndo.systemTypeId).toBeUndefined();
        expect(afterUndo.layers.map((l: any) => l.name)).toEqual(['Plain Structure']);
        expect(dropSpy).toHaveBeenCalledWith([id]);

        // REDO — re-applies the swap on the same id.
        performRedo();
        expect((store.getById(id)! as any).systemTypeId).toBe('st-rc-screed');
    });

    it('a further undo then reverses the CREATE — swap and create are independent one-step undos', () => {
        const id = 'slab_ABC';
        store.add(makeSlab(id));
        rb.push({
            forward: { ops: [{ op: 'add', path: toJsonPointer([id]), value: store.getById(id) }] },
            inverse: { ops: [{ op: 'remove', path: toJsonPointer([id]) }] },
            affectedStores: ['slab'],
        });
        const oldData = structuredClone(store.getById(id)) as any;
        const swapped = structuredClone(oldData);
        swapped.systemTypeId = 'st-rc';
        swapped.layers = RC_LAYERS;
        store.update(id, swapped);
        rb.push({
            forward: { ops: [{ op: 'replace', path: toJsonPointer([id]), value: structuredClone(store.getById(id)) }] },
            inverse: { ops: [{ op: 'replace', path: toJsonPointer([id]), value: oldData }] },
            affectedStores: ['slab'],
        });

        performUndo(); // reverse the swap
        expect((store.getById(id)! as any).systemTypeId).toBeUndefined();
        performUndo(); // reverse the create
        expect(store.getById(id)).toBeUndefined();
    });
});
