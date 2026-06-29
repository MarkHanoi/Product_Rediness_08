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
    // §FURNITURE-MULTIPART-INSTANCING — the bridge requires a STABLE source key
    // (furnitureType) for eligibility; FurnitureFragmentBuilder stamps it on the
    // built group + children, so mirror that here.
    root.userData.furnitureType = 'rug';
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.02, 0.8), mat);
    root.add(leaf);
    return root;
}

/**
 * §FURNITURE-MULTIPART-INSTANCING — a multi-material procedural item (the
 * dominant cost: sofa / kitchen / wardrobe / bed). Three DISTINCT materials in a
 * fixed local arrangement → three instanceable parts. `mats` is passed so a test
 * can SHARE one material set across many identical sofas (so corresponding parts
 * collapse into the same InstanceGroup). The local geometry sizes differ per part
 * so part groups never alias each other by geometry hash.
 */
function sofaGroup(mats?: {
    fabric: THREE.Material;
    wood: THREE.Material;
    metal: THREE.Material;
}): THREE.Object3D {
    const m = mats ?? {
        fabric: new THREE.MeshStandardMaterial({ color: '#3355aa' }),
        wood: new THREE.MeshStandardMaterial({ color: '#774422' }),
        metal: new THREE.MeshStandardMaterial({ color: '#888888' }),
    };
    const root = new THREE.Group();
    root.userData.furnitureType = 'sofa';
    // body (fabric)
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 0.9), m.fabric);
    body.position.set(0, 0.4, 0);
    root.add(body);
    // back cushion (fabric — same material as body → MERGES into the fabric part)
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 0.2), m.fabric);
    back.position.set(0, 0.9, -0.35);
    root.add(back);
    // frame rail (wood)
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.1, 1.0), m.wood);
    frame.position.set(0, 0.1, 0);
    root.add(frame);
    // legs (metal)
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.05), m.metal);
    legs.position.set(0.9, 0.05, 0.4);
    root.add(legs);
    return root;
}

function worldAt(x: number, z: number): THREE.Matrix4 {
    return new THREE.Matrix4().makeTranslation(x, 0, z);
}

/** Count InstancedElementRenderer groups on a given level. */
function countGroups(scene: THREE.Scene, levelId?: string): number {
    let n = 0;
    scene.traverse((o) => {
        if ((o as THREE.InstancedMesh).isInstancedMesh && o.userData?.isInstancedGroup) {
            if (levelId === undefined || o.userData.levelId === levelId) n++;
        }
    });
    return n;
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

        it('a multi-material item with a stable source key IS instanced (multi-part)', () => {
            // §FURNITURE-MULTIPART-INSTANCING — the dominant case. A sofa carries a
            // stable furnitureType source key, so it instances as several parts.
            const ok = bridge.register('sofa-A', 'level-1', sofaGroup(), worldAt(0, 0));
            expect(ok).toBe(true);
            expect(bridge.isInstanced('sofa-A')).toBe(true);
        });

        it('a multi-material item with NO stable source key is INELIGIBLE (unique one-off)', () => {
            // No furnitureType stamped → no stable source key → stays on fragment path.
            const root = new THREE.Group();
            root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
                new THREE.MeshStandardMaterial({ color: '#111' })));
            root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
                new THREE.MeshStandardMaterial({ color: '#eee' })));
            const ok = bridge.register('oneoff-A', 'level-1', root, worldAt(0, 0));
            expect(ok).toBe(false);
            expect(bridge.isInstanced('oneoff-A')).toBe(false);
        });

        it('a glb_import with no stable glb key is INELIGIBLE (arbitrary-material one-off)', () => {
            const root = new THREE.Group();
            root.userData.furnitureType = 'glb_import';
            root.userData.modelId = 'model-default'; // not a stable per-source key
            root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
                new THREE.MeshStandardMaterial({ color: '#222' })));
            const ok = bridge.register('glb-A', 'level-1', root, worldAt(0, 0));
            expect(ok).toBe(false);
            expect(bridge.isInstanced('glb-A')).toBe(false);
        });

        it('a glb_import WITH a stable glb key IS instanced', () => {
            const root = new THREE.Group();
            root.userData.furnitureType = 'glb_import';
            root.userData.glbKey = 'chair-oak-v2';
            root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
                new THREE.MeshStandardMaterial({ color: '#222' })));
            const ok = bridge.register('glb-A', 'level-1', root, worldAt(0, 0));
            expect(ok).toBe(true);
            expect(bridge.isInstanced('glb-A')).toBe(true);
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

    describe('§FURNITURE-MULTIPART-INSTANCING — multi-material items', () => {
        /** Shared sofa material set so corresponding parts of identical sofas collapse. */
        let sofaMats: { fabric: THREE.Material; wood: THREE.Material; metal: THREE.Material };
        beforeEach(() => {
            sofaMats = {
                fabric: new THREE.MeshStandardMaterial({ color: '#3355aa' }),
                wood: new THREE.MeshStandardMaterial({ color: '#774422' }),
                metal: new THREE.MeshStandardMaterial({ color: '#888888' }),
            };
        });

        it('one multi-material sofa registers M part-groups (one per distinct material)', () => {
            // sofa has 3 distinct materials (fabric/wood/metal); same-material leaves
            // merge, so the part set is exactly 3.
            bridge.register('sofa-A', 'level-1', sofaGroup(sofaMats), worldAt(0, 0));
            expect(countGroups(scene)).toBe(3);
            // Three part-slots, one furniture element.
            expect(renderer.totalInstances).toBe(3);
            expect(bridge.isInstanced('sofa-A')).toBe(true);
        });

        it('N identical sofas → M instanced groups of N (the draw-call collapse)', () => {
            const N = 6;
            for (let i = 0; i < N; i++) {
                bridge.register(`sofa-${i}`, 'level-1', sofaGroup(sofaMats), worldAt(i * 3, 0));
            }
            // 3 part-groups total, not 3 × N individual meshes.
            expect(countGroups(scene)).toBe(3);
            // 3 parts × N items = 3N slots across the 3 groups.
            expect(renderer.totalInstances).toBe(3 * N);
        });

        it('pick from ANY part resolves to the one furniture element id', () => {
            bridge.register('sofa-A', 'level-1', sofaGroup(sofaMats), worldAt(0, 0));
            bridge.register('sofa-B', 'level-1', sofaGroup(sofaMats), worldAt(3, 0));

            // Across ALL part-groups, every occupied slot must resolve to a real sofa id.
            const resolved = new Set<string>();
            scene.traverse((o) => {
                const im = o as THREE.InstancedMesh;
                if (!im.isInstancedMesh || !o.userData?.isInstancedGroup) return;
                const getSlots = o.userData.getOccupiedInstanceSlots as () => readonly number[];
                const getId = o.userData.getInstanceElementId as (s: number) => string | undefined;
                for (const slot of getSlots()) {
                    const id = getId(slot);
                    if (id !== undefined) resolved.add(id);
                    // Never the synthetic part storage key.
                    expect(id?.includes('#part')).toBe(false);
                }
            });
            // Only the two REAL furniture ids surface as pick ids — never a part key.
            expect(resolved).toEqual(new Set(['sofa-A', 'sofa-B']));
        });

        it('level-isolate hides ALL of an item\'s parts together (every part-group on the level)', () => {
            bridge.register('sofa-A', 'level-7', sofaGroup(sofaMats), worldAt(0, 0));
            // Every part-group carries the furniture\'s real levelId so a level hide
            // (ProjectVisibilitySection matches userData.levelId) toggles them as a set.
            expect(countGroups(scene, 'level-7')).toBe(3);
            scene.traverse((o) => {
                if ((o as THREE.InstancedMesh).isInstancedMesh && o.userData?.isInstancedGroup) {
                    expect(o.userData.levelId).toBe('level-7');
                    expect(o.userData.elementType).toBe('Furniture');
                }
            });
        });

        it('unregister frees ALL of the item\'s part slots', () => {
            bridge.register('sofa-A', 'level-1', sofaGroup(sofaMats), worldAt(0, 0));
            expect(renderer.totalInstances).toBe(3);
            bridge.unregister('sofa-A');
            expect(renderer.totalInstances).toBe(0);
            expect(bridge.isInstanced('sofa-A')).toBe(false);
        });

        it('updateTransform moves every part of the item together', () => {
            // Read every part\'s OBB centre BEFORE the move, then assert each part
            // shifted by exactly the world delta (+10 X). Per-part centres include
            // the part\'s LOCAL offset, so we compare the shift, not an absolute.
            const before = new Map<string, number>();
            const sampleCentres = (out: Map<string, number>): number => {
                let count = 0;
                scene.traverse((o) => {
                    const im = o as THREE.InstancedMesh;
                    if (!im.isInstancedMesh || !o.userData?.isInstancedGroup) return;
                    const getSlots = o.userData.getOccupiedInstanceSlots as () => readonly number[];
                    const getId = o.userData.getInstanceElementId as (s: number) => string | undefined;
                    const getObb = o.userData.getInstanceObb as (s: number) => { center: { x: number } } | undefined;
                    for (const slot of getSlots()) {
                        if (getId(slot) === 'sofa-A') {
                            out.set(o.userData.id as string, getObb(slot)!.center.x);
                            count++;
                        }
                    }
                });
                return count;
            };
            bridge.register('sofa-A', 'level-1', sofaGroup(sofaMats), worldAt(0, 0));
            expect(sampleCentres(before)).toBe(3);

            bridge.updateTransform('sofa-A', worldAt(10, 0));
            const after = new Map<string, number>();
            expect(sampleCentres(after)).toBe(3);
            // Every part shifted by exactly +10 in X — all parts moved together.
            for (const [groupId, x0] of before) {
                expect(after.get(groupId)! - x0).toBeCloseTo(10, 3);
            }
        });

        it('mixing single-material rugs and multi-material sofas keeps both streams correct', () => {
            bridge.register('rug-A', 'level-1', rugGroup(rugMat), worldAt(0, 0));
            bridge.register('rug-B', 'level-1', rugGroup(rugMat), worldAt(2, 0));
            bridge.register('sofa-A', 'level-1', sofaGroup(sofaMats), worldAt(5, 0));
            // 1 rug group (2 rugs) + 3 sofa part-groups = 4 groups.
            expect(countGroups(scene)).toBe(4);
            // 2 rug slots + 3 sofa part slots.
            expect(renderer.totalInstances).toBe(5);
        });
    });
});
