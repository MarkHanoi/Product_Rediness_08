/**
 * §SELECT-INSTANCED-PICK — InstancedElementRenderer pick + highlight contract.
 *
 * FIX #1 (GPU pick): the group must carry a STABLE synthetic userData.id so
 *   GpuPickStrategy._buildElementRegistry (keyed by userData.id) includes it and
 *   syncPickScene renders it into the id buffer. It must ALSO expose the per-
 *   instance helpers (getOccupiedInstanceSlots / getInstanceElementId) so the GPU
 *   path resolves the PER-INSTANCE element id — never the synthetic group id.
 *
 * FIX #5 (highlight): the group must expose per-instance OBBs via
 *   getInstanceObb(slot) so an instanced-only element gets a real selection
 *   highlight instead of the faint AABB fallback box.
 *
 * Imports the module directly (not via the rendering barrel) to keep the node
 * vitest env free of window-touching siblings.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { InstancedElementRenderer } from './InstancedElementRenderer';

function box(): THREE.BufferGeometry {
    return new THREE.BoxGeometry(0.4, 3, 0.4);
}

function findGroup(scene: THREE.Scene): THREE.InstancedMesh {
    let found: THREE.InstancedMesh | undefined;
    scene.traverse((o) => {
        if ((o as THREE.InstancedMesh).isInstancedMesh && o.userData?.isInstancedGroup) {
            found = o as THREE.InstancedMesh;
        }
    });
    if (!found) throw new Error('no instanced group in scene');
    return found;
}

describe('InstancedElementRenderer — §SELECT-INSTANCED-PICK', () => {
    let scene: THREE.Scene;
    let renderer: InstancedElementRenderer;
    let mat: THREE.MeshStandardMaterial;

    beforeEach(() => {
        scene = new THREE.Scene();
        renderer = new InstancedElementRenderer();
        renderer.setScene(scene);
        mat = new THREE.MeshStandardMaterial({ color: '#cccccc' });
    });

    describe('FIX #1 — group is GPU-pickable and resolves the per-instance element id', () => {
        it('stamps a STABLE synthetic userData.id so the element registry includes the group', () => {
            const m = new THREE.Matrix4().makeTranslation(0, 1.5, 0);
            renderer.register('col-A', box(), mat, m, 'level-1', 'column');
            const group = findGroup(scene);

            // The synthetic id is the hosting handle GpuPickStrategy keys on.
            expect(typeof group.userData.id).toBe('string');
            expect((group.userData.id as string).startsWith('instanced-group-')).toBe(true);
            expect(group.userData.isInstancedGroup).toBe(true);

            // Stable: a second register on the same group does not churn the id.
            const id1 = group.userData.id;
            renderer.register('col-B', box(), mat, new THREE.Matrix4().makeTranslation(2, 1.5, 0), 'level-1', 'column');
            expect(findGroup(scene).userData.id).toBe(id1);
        });

        it('getOccupiedInstanceSlots() + getInstanceElementId(slot) resolve each instance', () => {
            renderer.register('col-A', box(), mat, new THREE.Matrix4().makeTranslation(0, 1.5, 0), 'level-1', 'column');
            renderer.register('col-B', box(), mat, new THREE.Matrix4().makeTranslation(2, 1.5, 0), 'level-1', 'column');
            renderer.register('col-C', box(), mat, new THREE.Matrix4().makeTranslation(4, 1.5, 0), 'level-1', 'column');
            const group = findGroup(scene);

            const slots = (group.userData.getOccupiedInstanceSlots as () => readonly number[])();
            const getId = group.userData.getInstanceElementId as (s: number) => string | undefined;
            expect(slots.length).toBe(3);

            const resolved = new Set(slots.map((s) => getId(s)));
            expect(resolved).toEqual(new Set(['col-A', 'col-B', 'col-C']));
            // The resolved selection is a per-INSTANCE element id, never the group id.
            expect(resolved.has(group.userData.id as string)).toBe(false);
        });

        it('a freed slot stops resolving to the removed element', () => {
            renderer.register('col-A', box(), mat, new THREE.Matrix4().makeTranslation(0, 1.5, 0), 'level-1', 'column');
            renderer.register('col-B', box(), mat, new THREE.Matrix4().makeTranslation(2, 1.5, 0), 'level-1', 'column');
            const group = findGroup(scene);
            const getId = group.userData.getInstanceElementId as (s: number) => string | undefined;

            renderer.unregister('col-A');
            const slots = (group.userData.getOccupiedInstanceSlots as () => readonly number[])();
            const live = slots.map(getId);
            expect(live).toContain('col-B');
            expect(live).not.toContain('col-A');
        });
    });

    describe('FIX #5 — per-instance OBB for the selection highlight', () => {
        it('getInstanceObb(slot) returns the instance world-space oriented box', () => {
            // Column box 0.4 × 3 × 0.4, translated to (5, 1.5, 0).
            const m = new THREE.Matrix4().makeTranslation(5, 1.5, 0);
            renderer.register('col-A', box(), mat, m, 'level-1', 'column');
            const group = findGroup(scene);

            const slots = (group.userData.getOccupiedInstanceSlots as () => readonly number[])();
            const getObb = group.userData.getInstanceObb as (s: number) => {
                center: { x: number; y: number; z: number };
                size: { x: number; y: number; z: number };
                quaternion: { x: number; y: number; z: number; w: number };
            } | undefined;

            const obb = getObb(slots[0]!);
            expect(obb).toBeDefined();
            // Box geometry is centred at local origin → world centre = translation.
            expect(obb!.center.x).toBeCloseTo(5, 5);
            expect(obb!.center.y).toBeCloseTo(1.5, 5);
            expect(obb!.center.z).toBeCloseTo(0, 5);
            // Extents are the box dimensions.
            expect(obb!.size.x).toBeCloseTo(0.4, 5);
            expect(obb!.size.y).toBeCloseTo(3, 5);
            expect(obb!.size.z).toBeCloseTo(0.4, 5);
        });

        it('the OBB tracks updateTransform so the highlight follows a move', () => {
            renderer.register('col-A', box(), mat, new THREE.Matrix4().makeTranslation(0, 1.5, 0), 'level-1', 'column');
            const group = findGroup(scene);
            const getObb = group.userData.getInstanceObb as (s: number) => { center: { x: number } } | undefined;
            const slots = (group.userData.getOccupiedInstanceSlots as () => readonly number[])();

            renderer.updateTransform('col-A', new THREE.Matrix4().makeTranslation(9, 1.5, 0));
            expect(getObb(slots[0]!)!.center.x).toBeCloseTo(9, 5);
        });
    });
});
