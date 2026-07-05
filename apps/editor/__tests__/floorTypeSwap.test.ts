// @vitest-environment happy-dom
//
// §FIX-FLOOR-TYPE-SWAP (L-106) — the floor-finish type swap was rejected with
// "floor.updateLayers: canExecute rejected — floor not found: <id>" even though
// the floor had just been created by the 3D FloorTool. Root cause: the property
// panel dispatched the 'floor.updateLayers' bus command, whose handler resolves
// the floor from the plugin Immer floor store — a DETACHED store that is EMPTY for
// FloorTool-created floors (FloorTool writes the LEGACY core-app-model FloorStore
// via cm.execute(CreateFloorCommand)). The fix routes the swap through the uniform
// 'element.changeType' command → UpdateFloorLayersCommand on the LEGACY FloorStore
// (the store the floor actually lives in), which fires 'bim-floor-updated' →
// FloorFragmentBuilder rebuilds the mesh with the new assembly.
//
// This suite proves BOTH halves:
//   (1) UpdateFloorLayersCommand FINDS the floor in the legacy FloorStore and
//       applies the new systemTypeId + layer stack + thickness (the core fix — no
//       more "floor not found").
//   (2) The invertible whole-element replace PatchPair the element.changeType floor
//       branch pushes onto the ring buffer makes the ring-first Ctrl+Z reverse THE
//       SWAP (not the element's earlier CREATE), and redo re-applies it — exercised
//       against the REAL RingBufferUndoStack + REAL elementUndoStoreAdapter (via
//       performUndo/performRedo) + REAL FloorStore.
//
// Maps to C03 §4.5–4.8 (undo architecture) + ADR-0105 (uniform element.changeType).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RingBufferUndoStack } from '@pryzm/runtime-undo-stack';
import { FloorStore } from '@pryzm/core-app-model/stores';
import { UpdateFloorLayersCommand } from '@pryzm/command-registry';
import { toJsonPointer } from '@pryzm/command-bus';
import { performUndo, performRedo } from '../src/engine/undo/performUndoRedo';

function makeFloor(id: string): any {
    return {
        id,
        type: 'floor',
        levelId: 'L0',
        parentId: 'L0',
        label: 'Floor-01',
        floorNumber: 'F.01',
        boundary: {
            polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }],
            baseOffset: 0,
            thickness: 0.015,
            detectionMethod: 'manual-polygon',
        },
        systemTypeId: undefined,
        layers: [{ name: 'Plain Finish', thickness: 0.015, function: 'finish', materialColor: '#D4C4A8' }],
        finishSpec: { finishColor: '#D4C4A8', finishPattern: 'none', exposedScreed: false },
        serviceHoles: [],
        coveredRoomIds: [],
        boundingWallIds: [],
        visible: true,
        opacity: 1,
        properties: {},
        ifcData: { guid: 'guid-' + id, ifcClass: 'IfcCovering', predefinedType: 'FLOORING' },
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'user', version: 1 },
    };
}

const OAK_LAYERS = [
    { name: 'Engineered Oak', thickness: 0.015, function: 'finish', materialColor: '#a9762f' },
    { name: 'Ply Backing', thickness: 0.010, function: 'substrate', materialColor: '#caa76a' },
];

describe('§FIX-FLOOR-TYPE-SWAP (L-106) — swap resolves against the legacy FloorStore', () => {
    it('UpdateFloorLayersCommand FINDS the floor and applies the new type/layers/thickness', () => {
        const store = new FloorStore();
        const id = 'floor-b13edb7e';
        store.add(makeFloor(id));

        // Sanity: the floor exists in the legacy store (the store the fix targets).
        expect(store.has(id)).toBe(true);

        const cmd = new UpdateFloorLayersCommand({
            floorId: id,
            systemTypeId: 'ft-engineered-oak',
            layers: OAK_LAYERS,
            thickness: 0.025,
        });

        // canExecute must NOT reject with "floor not found" — the core L-106 bug.
        const v = cmd.canExecute({ stores: { floorStore: store } } as any);
        expect(v.ok).toBe(true);

        const res = cmd.execute({ stores: { floorStore: store } } as any);
        expect(res.success).toBe(true);

        const after = store.getById(id)!;
        expect(after.systemTypeId).toBe('ft-engineered-oak');
        expect(after.layers).toHaveLength(2);
        expect(after.layers!.map(l => l.name)).toEqual(['Engineered Oak', 'Ply Backing']);
        // boundary.thickness follows the new assembly (layer sum = 25 mm).
        expect(after.boundary.thickness).toBeCloseTo(0.025, 6);
    });

    it('canExecute still rejects a genuinely-missing floor', () => {
        const store = new FloorStore();
        const cmd = new UpdateFloorLayersCommand({
            floorId: 'does-not-exist',
            systemTypeId: 'ft-oak',
            layers: OAK_LAYERS,
            thickness: 0.025,
        });
        const v = cmd.canExecute({ stores: { floorStore: store } } as any);
        expect(v.ok).toBe(false);
    });
});

describe('§FIX-FLOOR-TYPE-SWAP (L-106) — ring-buffer undo/redo parity', () => {
    let store: FloorStore;
    let rb: RingBufferUndoStack;
    let dropSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        store = new FloorStore();
        rb = new RingBufferUndoStack();
        dropSpy = vi.fn(() => 1);
        (globalThis as any).commandManager = {
            canUndo: () => false,
            canRedo: () => false,
            undo: vi.fn(),
            redo: vi.fn(),
            dropEntriesForTargets: dropSpy,
        };
        (window as any).floorStore = store;
        (window as any).runtime = { bus: { ringBuffer: rb } };
    });

    afterEach(() => {
        delete (globalThis as any).commandManager;
        delete (window as any).floorStore;
        delete (window as any).runtime;
    });

    it('undo reverses the SWAP in place (floor not deleted), redo re-applies', () => {
        const id = 'floor_01KWKNVX';
        store.add(makeFloor(id));

        // Prior CREATE entry on the ring — the exact condition under which a naive
        // (cm-only) swap undo pops the CREATE instead of the swap.
        rb.push({
            forward: { ops: [{ op: 'add', path: toJsonPointer([id]), value: store.getById(id) }] },
            inverse: { ops: [{ op: 'remove', path: toJsonPointer([id]) }] },
            affectedStores: ['floor'],
        });

        // The swap: mutate in place (mirror UpdateFloorLayersCommand) + push the
        // invertible replace pair (mirror the element.changeType floor branch).
        const oldData = structuredClone(store.getById(id));
        store.update(id, { systemTypeId: 'ft-engineered-oak', layers: OAK_LAYERS as any, boundary: { ...(oldData as any).boundary, thickness: 0.025 } });
        const newData = structuredClone(store.getById(id));
        rb.push({
            forward: { ops: [{ op: 'replace', path: toJsonPointer([id]), value: newData }] },
            inverse: { ops: [{ op: 'replace', path: toJsonPointer([id]), value: oldData }] },
            affectedStores: ['floor'],
        });

        expect(store.getById(id)!.systemTypeId).toBe('ft-engineered-oak');

        // UNDO — restores the ORIGINAL type on the SAME element; does NOT delete it.
        performUndo();
        const afterUndo = store.getById(id);
        expect(afterUndo).toBeDefined();
        expect(afterUndo!.systemTypeId).toBeUndefined();
        expect(afterUndo!.layers!.map(l => l.name)).toEqual(['Plain Finish']);
        expect(dropSpy).toHaveBeenCalledWith([id]);

        // REDO — re-applies the swap on the same id.
        performRedo();
        expect(store.getById(id)!.systemTypeId).toBe('ft-engineered-oak');
    });

    it('a further undo then reverses the CREATE — swap and create are independent one-step undos', () => {
        const id = 'floor_ABC';
        store.add(makeFloor(id));
        rb.push({
            forward: { ops: [{ op: 'add', path: toJsonPointer([id]), value: store.getById(id) }] },
            inverse: { ops: [{ op: 'remove', path: toJsonPointer([id]) }] },
            affectedStores: ['floor'],
        });
        const oldData = structuredClone(store.getById(id));
        store.update(id, { systemTypeId: 'ft-oak', layers: OAK_LAYERS as any });
        rb.push({
            forward: { ops: [{ op: 'replace', path: toJsonPointer([id]), value: structuredClone(store.getById(id)) }] },
            inverse: { ops: [{ op: 'replace', path: toJsonPointer([id]), value: oldData }] },
            affectedStores: ['floor'],
        });

        performUndo(); // reverse the swap
        expect(store.getById(id)!.systemTypeId).toBeUndefined();
        performUndo(); // reverse the create
        expect(store.getById(id)).toBeUndefined();
    });
});
