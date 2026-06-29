/**
 * FurnitureInstanceBridge characterization tests — ADR-0076 Axis 3
 * (§PERF-WEBGPU-FURNITURE-INSTANCING).
 *
 * These PROVE that routing a furniture item through the bridge preserves the two
 * instancing invariants the founder must see green before flipping the default
 * (`__pryzmFurnitureInstancingV1`):
 *
 *   (a) PER-ELEMENT PICK — the InstancedMesh group exposes
 *       userData.getInstanceElementId(slot) returning the FURNITURE id, the exact
 *       function SelectionManager resolves an instanced hit through. The furniture
 *       id is the per-instance pick id, so selecting an instanced furniture item
 *       resolves to that item — NOT the synthetic group id.
 *   (b) PER-LEVEL ISOLATE/VISIBILITY — the group carries userData.levelId,
 *       userData.elementType ('Furniture') and userData.isInstancedGroup, the exact
 *       keys ProjectVisibilitySection.applyLevelVisibility() matches.
 *
 * Plus: the feature flag is DEFAULT-OFF, and the synthetic group id is stamped so
 * GpuPickStrategy._buildElementRegistry includes the group in the id buffer.
 *
 * Imports modules DIRECTLY (not via the rendering barrel) to keep the node test
 * env free of window-touching siblings. THREE works under node vitest (see
 * ElementInstanceBridge.test.ts).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { InstancedElementRenderer } from './InstancedElementRenderer';
import {
    FurnitureInstanceBridge,
    isFurnitureInstancingEnabled,
} from './FurnitureInstanceBridge';

const g = globalThis as { __pryzmFurnitureInstancingV1?: boolean };

/**
 * Build a SINGLE-(geometry, material) furniture group — the eligible case: a flat
 * leaf (e.g. a rug / wall-art panel) that bakes to one InstancedMesh slot. A world
 * matrix positions the group; the bridge bakes the leaf into the group's local frame.
 *
 * `mat` is passed in so a test can SHARE one material across many rugs — the
 * dominant real case (the same generated rug placed once per room across every
 * floor) where identical (geometry, material) items collapse into ONE InstanceGroup.
 * The group key includes the material uuid, so distinct material instances split
 * into distinct groups (correct, but not what the collapse test wants).
 */
function rugGroup(mat: THREE.Material): THREE.Object3D {
    const root = new THREE.Group();
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.02, 0.8), mat);
    root.add(leaf);
    return root;
}

function worldAt(x: number, z: number): THREE.Matrix4 {
    return new THREE.Matrix4().makeTranslation(x, 0, z);
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

/**
 * Mirror of SelectionManager._buildElementRegistry's §SELECT-INSTANCED-FURNITURE-PICK
 * index: map each occupied instance's element id → the hosting group. This is what
 * lets objectFor(furnitureId) resolve the group on the GPU pick path even though the
 * per-item furniture root is set visible=false (and so excluded from the cache).
 */
function instanceIdIndex(group: THREE.InstancedMesh): Map<string, THREE.InstancedMesh> {
    const out = new Map<string, THREE.InstancedMesh>();
    const getSlots = group.userData.getOccupiedInstanceSlots as () => readonly number[];
    const getId = group.userData.getInstanceElementId as (s: number) => string | undefined;
    for (const slot of getSlots()) {
        const id = getId(slot);
        if (id !== undefined) out.set(id, group);
    }
    return out;
}

describe('FurnitureInstanceBridge (§PERF-WEBGPU-FURNITURE-INSTANCING)', () => {
    let scene: THREE.Scene;
    let renderer: InstancedElementRenderer;
    let bridge: FurnitureInstanceBridge;
    /** Shared rug material so identical rugs collapse into ONE InstanceGroup. */
    let rugMat: THREE.MeshStandardMaterial;

    beforeEach(() => {
        scene = new THREE.Scene();
        renderer = new InstancedElementRenderer();
        renderer.setScene(scene);
        bridge = new FurnitureInstanceBridge(renderer);
        rugMat = new THREE.MeshStandardMaterial({ color: '#a08050' });
    });

    afterEach(() => {
        delete g.__pryzmFurnitureInstancingV1;
    });

    describe('feature flag — DEFAULT-OFF', () => {
        it('isFurnitureInstancingEnabled() is true ONLY for an explicit true', () => {
            expect(isFurnitureInstancingEnabled()).toBe(false);      // undefined
            g.__pryzmFurnitureInstancingV1 = false;
            expect(isFurnitureInstancingEnabled()).toBe(false);
            (g as { __pryzmFurnitureInstancingV1?: unknown }).__pryzmFurnitureInstancingV1 =
                1 as unknown as boolean;
            expect(isFurnitureInstancingEnabled()).toBe(false);      // truthy-but-not-true
            g.__pryzmFurnitureInstancingV1 = true;
            expect(isFurnitureInstancingEnabled()).toBe(true);       // ONLY explicit true
        });
    });

    describe('eligibility', () => {
        it('a single-material leaf is instanced (returns true)', () => {
            const ok = bridge.register('rug-A', 'level-1', rugGroup(rugMat), worldAt(0, 0));
            expect(ok).toBe(true);
            expect(bridge.isInstanced('rug-A')).toBe(true);
        });

        it('a multi-material group is INELIGIBLE (returns false, stays on fragment path)', () => {
            const root = new THREE.Group();
            root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
                new THREE.MeshStandardMaterial({ color: '#111' })));
            root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
                new THREE.MeshStandardMaterial({ color: '#eee' })));
            const ok = bridge.register('sofa-A', 'level-1', root, worldAt(0, 0));
            expect(ok).toBe(false);
            expect(bridge.isInstanced('sofa-A')).toBe(false);
        });
    });

    describe('(a) per-element PICK survives instancing — the furniture id is the pick id', () => {
        it('getInstanceElementId(slot) resolves each instance to its FURNITURE id', () => {
            bridge.register('rug-A', 'level-1', rugGroup(rugMat), worldAt(0, 0));
            bridge.register('rug-B', 'level-1', rugGroup(rugMat), worldAt(3, 0));
            bridge.register('rug-C', 'level-1', rugGroup(rugMat), worldAt(6, 0));

            const group = findGroup(scene)!;
            expect(group).toBeDefined();
            const getId = group.userData.getInstanceElementId as (slot: number) => string | undefined;
            expect(typeof getId).toBe('function');

            const resolved = [0, 1, 2].map(getId);
            expect(new Set(resolved)).toEqual(new Set(['rug-A', 'rug-B', 'rug-C']));
            // The resolved selection is the per-INSTANCE furniture id, NEVER the group id.
            expect(resolved).not.toContain(group.userData.id);
        });

        it('objectFor(furnitureId) resolves the hosting group (the SelectionManager registry fix)', () => {
            // This is the exact gap that broke instanced-furniture GPU selection: the
            // per-item furniture root is set visible=false when instanced, so only the
            // group is in the selectable cache — under its SYNTHETIC id. The registry
            // must also map each per-instance furniture id → the group so objectFor()
            // resolves on the GPU pick path. We reproduce that index here and assert it.
            bridge.register('rug-A', 'level-1', rugGroup(rugMat), worldAt(0, 0));
            bridge.register('rug-B', 'level-1', rugGroup(rugMat), worldAt(3, 0));
            const group = findGroup(scene)!;

            const index = instanceIdIndex(group);
            // Per-instance ids resolve to the group...
            expect(index.get('rug-A')).toBe(group);
            expect(index.get('rug-B')).toBe(group);
            // ...and the per-instance id is distinct from the synthetic group id.
            expect(index.has(group.userData.id as string)).toBe(false);
        });

        it('after removing one rug, the freed slot no longer resolves to it', () => {
            bridge.register('rug-A', 'level-1', rugGroup(rugMat), worldAt(0, 0));
            bridge.register('rug-B', 'level-1', rugGroup(rugMat), worldAt(3, 0));
            const group = findGroup(scene)!;

            bridge.unregister('rug-A');
            const index = instanceIdIndex(group);
            expect(index.has('rug-B')).toBe(true);
            expect(index.has('rug-A')).toBe(false);
        });
    });

    describe('(b) per-level ISOLATE / visibility + GPU-registry reachability', () => {
        it('group carries levelId, elementType=Furniture, isInstancedGroup and a synthetic id', () => {
            bridge.register('rug-A', 'level-7', rugGroup(rugMat), worldAt(0, 0));
            const group = findGroup(scene)!;
            expect(group.userData.levelId).toBe('level-7');
            expect(group.userData.elementType).toBe('Furniture');
            expect(group.userData.isInstancedGroup).toBe(true);
            // FIX #1 precondition: the synthetic id makes the group reachable through
            // _buildElementRegistry (keyed by userData.id) so it is drawn into the id buffer.
            expect(typeof group.userData.id).toBe('string');
            expect((group.userData.id as string).startsWith('instanced-group-')).toBe(true);
        });

        it('furniture on different levels lands in DIFFERENT groups (independent hide)', () => {
            bridge.register('rug-A', 'level-1', rugGroup(rugMat), worldAt(0, 0));
            bridge.register('rug-B', 'level-2', rugGroup(rugMat), worldAt(0, 0));

            const groups: THREE.InstancedMesh[] = [];
            scene.traverse((o) => {
                if ((o as THREE.InstancedMesh).isInstancedMesh && o.userData?.isInstancedGroup) {
                    groups.push(o as THREE.InstancedMesh);
                }
            });
            expect(groups.length).toBe(2);
            expect(groups.map((grp) => grp.userData.levelId).sort()).toEqual(['level-1', 'level-2']);
        });
    });

    describe('per-instance highlight OBB (FIX #5 — instanced furniture gets a real highlight)', () => {
        it('getInstanceObb(slot) returns the instance world-space oriented box', () => {
            bridge.register('rug-A', 'level-1', rugGroup(rugMat), worldAt(5, 2));
            const group = findGroup(scene)!;
            const getObb = group.userData.getInstanceObb as (s: number) => {
                center: { x: number; y: number; z: number };
                size: { x: number; y: number; z: number };
            } | undefined;
            const getSlots = group.userData.getOccupiedInstanceSlots as () => readonly number[];

            const obb = getObb(getSlots()[0]!);
            expect(obb).toBeDefined();
            // World centre = the group's world translation (leaf centred at local origin).
            expect(obb!.center.x).toBeCloseTo(5, 3);
            expect(obb!.center.z).toBeCloseTo(2, 3);
            // Extents are the baked rug dimensions.
            expect(obb!.size.x).toBeCloseTo(1.2, 3);
            expect(obb!.size.z).toBeCloseTo(0.8, 3);
        });
    });

    describe('draw-call collapse (the actual win)', () => {
        it('N identical rugs collapse into ONE InstancedMesh group', () => {
            for (let i = 0; i < 8; i++) {
                bridge.register(`rug-${i}`, 'level-1', rugGroup(rugMat), worldAt(i, 0));
            }
            let groupCount = 0;
            scene.traverse((o) => {
                if ((o as THREE.InstancedMesh).isInstancedMesh && o.userData?.isInstancedGroup) {
                    groupCount++;
                }
            });
            expect(groupCount).toBe(1);
            expect(renderer.totalInstances).toBe(8);
        });
    });
});
