// @vitest-environment happy-dom
//
// §FIX-FURNITURE-TYPE-LIST-AND-UNDO (L-68) — bug (2): the furniture type-swap was
// not restorable by Ctrl+Z. ChangeFurnitureTypeCommand mutates IN PLACE (stable
// id) but runs through the legacy CommandManager, which records NO ring-buffer
// entry. The unified undo (performUndoRedo) is RING-BUFFER-FIRST, so with no swap
// entry on the ring, the ring's TOP was the element's earlier CREATE — Ctrl+Z
// popped the CREATE (deleted the bed) and shadow-dropped the cm swap twin, so the
// original type was never restored (founder log: "skip remove — not found …",
// "ring-buffer applied … shadow-dropped cm entries:1").
//
// The fix: the element.changeType furniture branch pushes an invertible
// WHOLE-ELEMENT replace PatchPair (stable id) onto the ring buffer. This test
// exercises that exact patch shape end-to-end against the REAL RingBufferUndoStack,
// the REAL elementUndoStoreAdapter (via performUndo/performRedo → buildUndoStoreMap),
// and the REAL FurnitureStore — asserting undo restores the original type on the
// same element (never a phantom-id remove) and redo re-applies the swap.
//
// Maps to C03 §4.5–4.8 (undo architecture) + ADR-0105.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RingBufferUndoStack } from '@pryzm/runtime-undo-stack';
import { FurnitureStore } from '@pryzm/geometry-furniture';
import { toJsonPointer } from '@pryzm/command-bus';
import { performUndo, performRedo } from '../src/engine/undo/performUndoRedo';

/** Mirrors the EXACT ring-buffer push the element.changeType furniture branch
 *  performs: an invertible whole-element replace PatchPair (stable id). */
function pushFurnitureSwapPair(
    rb: RingBufferUndoStack,
    id: string,
    oldData: unknown,
    newData: unknown,
): void {
    const idPtr = toJsonPointer([id]);
    rb.push({
        forward: { ops: [{ op: 'replace', path: idPtr, value: newData }] },
        inverse: { ops: [{ op: 'replace', path: idPtr, value: oldData }] },
        affectedStores: ['furniture'],
    });
}

describe('furniture type-swap undo — §FIX-FURNITURE-TYPE-LIST-AND-UNDO (L-68)', () => {
    let store: FurnitureStore;
    let rb: RingBufferUndoStack;
    let dropSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        store = new FurnitureStore();
        rb = new RingBufferUndoStack();
        dropSpy = vi.fn(() => 1);
        (globalThis as any).commandManager = {
            canUndo: () => false,
            canRedo: () => false,
            undo: vi.fn(),
            redo: vi.fn(),
            dropEntriesForTargets: dropSpy,
        };
        (window as any).furnitureStore = store;
        (window as any).runtime = { bus: { ringBuffer: rb } };
    });

    afterEach(() => {
        delete (globalThis as any).commandManager;
        delete (window as any).furnitureStore;
        delete (window as any).runtime;
    });

    it('undo restores the original type IN PLACE (no "skip remove — not found"), redo re-applies', () => {
        const id = 'furniture_01KWKNVX';
        const bed: any = {
            id, type: 'furniture', furnitureType: 'bed', furnitureCategory: 'beds',
            position: { x: 1, y: 0, z: 2 }, rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
            width: 1.8, length: 2.0, height: 1.0, baseOffset: 0.2, levelId: 'L0',
            material: 'fabric', color: '#8899aa', mark: 'FU-FF-002', properties: {},
        };
        store.add(bed);

        // A PRIOR create entry on the ring (the element's creation). This is the
        // exact condition under which the pre-fix undo popped the CREATE instead of
        // the swap: the ring TOP was this add, not the (unrecorded) type-swap.
        rb.push({
            forward: { ops: [{ op: 'add', path: toJsonPointer([id]), value: bed }] },
            inverse: { ops: [{ op: 'remove', path: toJsonPointer([id]) }] },
            affectedStores: ['furniture'],
        });

        // The swap: mutate in place (mirror ChangeFurnitureTypeCommand) + push the
        // invertible replace pair (mirror the element.changeType furniture branch).
        const oldData = structuredClone(store.get(id));
        store.update(id, { ...(oldData as any), furnitureType: 'nordic_bed' });
        const newData = structuredClone(store.get(id));
        pushFurnitureSwapPair(rb, id, oldData, newData);

        expect(store.get(id)!.furnitureType).toBe('nordic_bed');

        // UNDO — restores the ORIGINAL type on the SAME element; does NOT delete it.
        performUndo();
        const afterUndo = store.get(id);
        expect(afterUndo).toBeDefined();                 // element NOT removed
        expect(afterUndo!.furnitureType).toBe('bed');    // original type restored
        // the cm swap twin is shadow-dropped so there is no phantom double-undo.
        expect(dropSpy).toHaveBeenCalledWith([id]);

        // REDO — re-applies the swap on the same id.
        performRedo();
        expect(store.get(id)!.furnitureType).toBe('nordic_bed');
    });

    it('a further undo then reverses the CREATE — swap and create are independent one-step undos', () => {
        const id = 'furniture_ABC';
        const sofa: any = {
            id, type: 'furniture', furnitureType: 'sofa_3seat', furnitureCategory: 'sofas',
            position: { x: 0, y: 0, z: 0 }, width: 2.55, length: 0.95, height: 0.85, levelId: 'L0',
            material: 'fabric', properties: {},
        };
        store.add(sofa);
        rb.push({
            forward: { ops: [{ op: 'add', path: toJsonPointer([id]), value: sofa }] },
            inverse: { ops: [{ op: 'remove', path: toJsonPointer([id]) }] },
            affectedStores: ['furniture'],
        });
        const oldData = structuredClone(store.get(id));
        store.update(id, { ...(oldData as any), furnitureType: 'sofa_2seat' });
        pushFurnitureSwapPair(rb, id, oldData, structuredClone(store.get(id)));

        performUndo(); // reverse the swap
        expect(store.get(id)!.furnitureType).toBe('sofa_3seat');
        performUndo(); // reverse the create
        expect(store.get(id)).toBeUndefined();
    });
});
