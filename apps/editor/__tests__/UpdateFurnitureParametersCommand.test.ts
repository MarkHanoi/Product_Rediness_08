// @vitest-environment happy-dom
//
// §FURNITURE-DRAG-ROTATION (founder 2026-06-19/20) — regression guard for the
// flagship "sofa rotates back to origin after I move it" bug.
//
// Root cause history: the gizmo drag-commit gated on a POSITION delta and sent only
// `position`, so a rotate-only drag never committed (rotation lost on rebuild) and a
// move-after-rotate committed position with the STALE store rotation → the mesh
// snapped back. The fix sends BOTH position and rotation through
// UpdateFurnitureParametersCommand. This test pins that command's contract: position
// AND rotation persist to the store, a rotate-only update preserves position, and undo
// restores the exact prior pose — the store fields the 3D mesh + plan projection read.
//
// happy-dom env: importing @pryzm/command-registry transitively loads
// @pryzm/core-app-model (ViewRenderCache attaches window listeners at module load).

import { describe, it, expect } from 'vitest';
import { UpdateFurnitureParametersCommand } from '@pryzm/command-registry';
import type { FurnitureData } from '@pryzm/geometry-furniture';

/** Minimal furniture store stub — exposes only get/update (what the command calls). */
class FurnitureStoreStub {
    private map = new Map<string, FurnitureData>();
    add(f: FurnitureData) { this.map.set(f.id, f); }
    get(id: string) { return this.map.get(id); }
    update(id: string, data: FurnitureData) { if (this.map.has(id)) this.map.set(id, data); }
}

function makeSofa(over: Partial<FurnitureData> = {}): FurnitureData {
    return {
        id: 'sofa-1',
        type: 'furniture',
        furnitureType: 'sofa',
        levelId: 'L0',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
        width: 2, length: 0.9, height: 0.8, baseOffset: 0,
        ...over,
    } as unknown as FurnitureData;
}

function makeCtx(store: FurnitureStoreStub) {
    return { stores: { furnitureStore: store } } as unknown as Parameters<UpdateFurnitureParametersCommand['execute']>[0];
}

/** THREE.Euler/Vector3 read back as .x/.y/.z. */
const xyz = (v: { x: number; y: number; z: number }) => ({ x: v.x, y: v.y, z: v.z });

describe('UpdateFurnitureParametersCommand — §FURNITURE-DRAG-ROTATION', () => {
    it('persists BOTH position and rotation (move + rotate in one commit)', () => {
        const store = new FurnitureStoreStub();
        store.add(makeSofa());
        const cmd = new UpdateFurnitureParametersCommand({
            id: 'sofa-1',
            position: { x: 5, y: 0, z: 3 },
            rotation: { x: 0, y: Math.PI / 2, z: 0 },
        });

        expect(cmd.canExecute(makeCtx(store)).ok).toBe(true);
        expect(cmd.execute(makeCtx(store)).success).toBe(true);

        const moved = store.get('sofa-1')!;
        expect(xyz(moved.position as any)).toEqual({ x: 5, y: 0, z: 3 });
        expect((moved.rotation as any).y).toBeCloseTo(Math.PI / 2, 6);
    });

    it('a rotate-only update keeps the existing position (the rotate-only drag case)', () => {
        const store = new FurnitureStoreStub();
        store.add(makeSofa({ position: { x: 7, y: 0, z: 1 } } as Partial<FurnitureData>));
        const cmd = new UpdateFurnitureParametersCommand({
            id: 'sofa-1',
            rotation: { x: 0, y: 0.5, z: 0 },
        });
        cmd.execute(makeCtx(store));

        const moved = store.get('sofa-1')!;
        // Position must be PRESERVED (not snapped to origin) when only rotation changes.
        expect(xyz(moved.position as any)).toEqual({ x: 7, y: 0, z: 1 });
        expect((moved.rotation as any).y).toBeCloseTo(0.5, 6);
    });

    it('undo restores the exact prior pose', () => {
        const store = new FurnitureStoreStub();
        store.add(makeSofa({ position: { x: 2, y: 0, z: 2 }, rotation: { x: 0, y: 1, z: 0, order: 'XYZ' } } as Partial<FurnitureData>));
        const cmd = new UpdateFurnitureParametersCommand({
            id: 'sofa-1',
            position: { x: 9, y: 0, z: 9 },
            rotation: { x: 0, y: 0, z: 0 },
        });
        cmd.execute(makeCtx(store));
        expect(cmd.undo(makeCtx(store)).success).toBe(true);

        const restored = store.get('sofa-1')!;
        expect(xyz(restored.position as any)).toEqual({ x: 2, y: 0, z: 2 });
        expect((restored.rotation as any).y).toBeCloseTo(1, 6);
    });

    it('rejects a missing furniture id', () => {
        const store = new FurnitureStoreStub();
        store.add(makeSofa());
        expect(new UpdateFurnitureParametersCommand({ id: 'nope', position: { x: 1, y: 0, z: 1 } }).canExecute(makeCtx(store)).ok).toBe(false);
    });
});
