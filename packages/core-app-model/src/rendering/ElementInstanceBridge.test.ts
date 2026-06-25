/**
 * ElementInstanceBridge characterization tests — ADR-0076 Axis 3
 * (§PERF-WEBGPU-FRAGMENT).
 *
 * These PROVE that routing an element through the bridge preserves the two
 * instancing invariants the founder must see green before flipping the default:
 *
 *   (a) PER-ELEMENT PICK — the InstancedMesh group exposes
 *       userData.getInstanceElementId(slot) returning the right element id, the
 *       exact function SelectionManager calls on an instanced hit.
 *   (b) PER-LEVEL ISOLATE/VISIBILITY — the group carries userData.levelId,
 *       userData.elementType and userData.isInstancedGroup, the exact keys
 *       ProjectVisibilitySection.applyLevelVisibility() matches.
 *
 * Plus: the feature flag is DEFAULT-OFF.
 *
 * Imports modules DIRECTLY (not via the rendering barrel) to keep the node test
 * env free of window-touching siblings. THREE works under node vitest (see
 * scene-committer/InstancedMeshCoalescer.test.ts).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { InstancedElementRenderer } from './InstancedElementRenderer';
import {
    ElementInstanceBridge,
    isElementInstancingEnabled,
    type ElementInstanceTransform,
} from './ElementInstanceBridge';

const g = globalThis as { __pryzmElementInstancingV1?: boolean };

function tf(x: number, y: number, z: number): ElementInstanceTransform {
    return { centre: { x, y, z }, rotationY: 0, size: { x: 0.4, y: 3, z: 0.4 } };
}

/** Find the single InstancedMesh the renderer added to the scene. */
function findGroup(scene: THREE.Scene): THREE.InstancedMesh | undefined {
    let found: THREE.InstancedMesh | undefined;
    scene.traverse((o) => {
        if ((o as THREE.InstancedMesh).isInstancedMesh && o.userData?.isInstancedGroup) {
            found = o as THREE.InstancedMesh;
        }
    });
    return found;
}

describe('ElementInstanceBridge (ADR-0076 Axis 3 §PERF-WEBGPU-FRAGMENT)', () => {
    let scene: THREE.Scene;
    let renderer: InstancedElementRenderer;
    let bridge: ElementInstanceBridge;
    let mat: THREE.MeshStandardMaterial;

    beforeEach(() => {
        scene = new THREE.Scene();
        renderer = new InstancedElementRenderer();
        renderer.setScene(scene);
        bridge = new ElementInstanceBridge(renderer);
        // Shared material so same-level same-size columns land in ONE group.
        mat = new THREE.MeshStandardMaterial({ color: '#cccccc' });
    });

    afterEach(() => {
        delete g.__pryzmElementInstancingV1;
    });

    describe('feature flag — DEFAULT-OFF', () => {
        it('isElementInstancingEnabled() is false unless flag === true', () => {
            expect(isElementInstancingEnabled()).toBe(false);      // undefined
            g.__pryzmElementInstancingV1 = false;
            expect(isElementInstancingEnabled()).toBe(false);
            (g as { __pryzmElementInstancingV1?: unknown }).__pryzmElementInstancingV1 = 1 as unknown as boolean;
            expect(isElementInstancingEnabled()).toBe(false);      // truthy-but-not-true
            g.__pryzmElementInstancingV1 = true;
            expect(isElementInstancingEnabled()).toBe(true);       // ONLY explicit true
        });
    });

    describe('(a) per-element PICK survives instancing', () => {
        it('getInstanceElementId(slot) resolves each instance to its element id', () => {
            bridge.register('col-A', 'level-1', 'Column', tf(0, 1.5, 0), mat, 'box');
            bridge.register('col-B', 'level-1', 'Column', tf(2, 1.5, 0), mat, 'box');
            bridge.register('col-C', 'level-1', 'Column', tf(4, 1.5, 0), mat, 'box');

            const group = findGroup(scene)!;
            expect(group).toBeDefined();
            // The exact function SelectionManager calls on an instanced hit:
            const getId = group.userData.getInstanceElementId as (slot: number) => string | undefined;
            expect(typeof getId).toBe('function');

            // Three distinct columns share ONE group (same size+mat+level).
            const resolved = [0, 1, 2].map((slot) => getId(slot));
            expect(new Set(resolved)).toEqual(new Set(['col-A', 'col-B', 'col-C']));
            // Every active slot resolves to a real id (no undefined holes).
            expect(resolved.every((id) => id !== undefined)).toBe(true);
        });

        it('after removing one column, the freed slot no longer resolves to it', () => {
            bridge.register('col-A', 'level-1', 'Column', tf(0, 1.5, 0), mat, 'box');
            bridge.register('col-B', 'level-1', 'Column', tf(2, 1.5, 0), mat, 'box');
            const group = findGroup(scene)!;
            const getId = group.userData.getInstanceElementId as (s: number) => string | undefined;

            bridge.unregister('col-A');
            const stillThere = [0, 1].map(getId).filter(Boolean);
            expect(stillThere).toContain('col-B');
            expect(stillThere).not.toContain('col-A');
        });
    });

    describe('(b) per-level ISOLATE/visibility survives instancing', () => {
        it('group carries levelId, elementType and isInstancedGroup (the keys applyLevelVisibility matches)', () => {
            bridge.register('col-A', 'level-7', 'Column', tf(0, 1.5, 0), mat, 'box');
            const group = findGroup(scene)!;
            expect(group.userData.levelId).toBe('level-7');
            expect(group.userData.elementType).toBe('Column');
            expect(group.userData.isInstancedGroup).toBe(true);
        });

        it('columns on different levels land in DIFFERENT groups (so a level can be hidden independently)', () => {
            bridge.register('col-A', 'level-1', 'Column', tf(0, 1.5, 0), mat, 'box');
            bridge.register('col-B', 'level-2', 'Column', tf(0, 4.5, 0), mat, 'box');

            const groups: THREE.InstancedMesh[] = [];
            scene.traverse((o) => {
                if ((o as THREE.InstancedMesh).isInstancedMesh && o.userData?.isInstancedGroup) {
                    groups.push(o as THREE.InstancedMesh);
                }
            });
            expect(groups.length).toBe(2);
            const levels = groups.map((grp) => grp.userData.levelId).sort();
            expect(levels).toEqual(['level-1', 'level-2']);

            // Simulate ProjectVisibilitySection hiding level-1: only that group hides.
            for (const grp of groups) {
                if (grp.userData.levelId === 'level-1') grp.visible = false;
            }
            const l1 = groups.find((grp) => grp.userData.levelId === 'level-1')!;
            const l2 = groups.find((grp) => grp.userData.levelId === 'level-2')!;
            expect(l1.visible).toBe(false);
            expect(l2.visible).toBe(true);
        });
    });

    describe('draw-call collapse (the actual win)', () => {
        it('N same-(size,mat,level) columns collapse into ONE InstancedMesh group', () => {
            for (let i = 0; i < 10; i++) {
                bridge.register(`col-${i}`, 'level-1', 'Column', tf(i, 1.5, 0), mat, 'box');
            }
            let groupCount = 0;
            scene.traverse((o) => {
                if ((o as THREE.InstancedMesh).isInstancedMesh && o.userData?.isInstancedGroup) groupCount++;
            });
            expect(groupCount).toBe(1);           // 10 columns -> 1 draw call
            expect(renderer.totalInstances).toBe(10);
        });
    });

    describe('updateTransform — O(1) move keeps the same slot/id mapping', () => {
        it('moving a column does not change its element-id resolution', () => {
            bridge.register('col-A', 'level-1', 'Column', tf(0, 1.5, 0), mat, 'box');
            const group = findGroup(scene)!;
            const getId = group.userData.getInstanceElementId as (s: number) => string | undefined;
            const slotBefore = getId(0);
            bridge.updateTransform('col-A', tf(9, 1.5, 9));
            expect(getId(0)).toBe(slotBefore);
            expect(getId(0)).toBe('col-A');
        });
    });
});
