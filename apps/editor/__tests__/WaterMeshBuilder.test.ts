// §POOL95 — THE WATER BODY IS ACTUALLY BUILT, AND IT LOOKS LIKE WATER.
//
// ═══════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS AT THE BUILDER AND NOT AT THE BUS
// ═══════════════════════════════════════════════════════════════════════════════
// `PoolAndSlabUpdateReachTheRenderStore.test.ts` ARM 7 proves the EVENT is emitted
// with the right payload. That is a necessary proof and it is not a sufficient one:
// this repository's most expensive repeated lesson is §COMMITTED-IS-NOT-REACHABLE —
// four fixes in one session that ran nowhere, all of them green at the layer below
// the one the user experiences. An event nothing draws is exactly that shape, and
// it is the shape the water was in before this lane (a REAL, COMMITTED, INVISIBLE
// record, with the bridge printing "the basin renders and the water in it does not").
//
// So these assertions are made against the THREE object graph the renderer actually
// receives — geometry bounds, material flags, scene parentage and userData — not
// against the builder's return value, which is the seam and could agree with itself.

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WaterMeshBuilder, type WaterRenderInput } from '../src/engine/WaterMeshBuilder';

/** A 4 × 2 m pool. Datum y = 0, floor at −1.2, water surface at −0.1 (freeboard 0.1). */
const WATER: WaterRenderInput = {
    id: 'water-1',
    levelId: 'level-1',
    poolId: 'pool-1',
    boundary: [
        { x: 0, y: 0, z: 0 },
        { x: 4, y: 0, z: 0 },
        { x: 4, y: 0, z: 2 },
        { x: 0, y: 0, z: 2 },
    ],
    surfaceElevation: -0.1,
    bottomElevation: -1.2,
    color: '#2E86C1',
    opacity: 0.3,
};

function bodyOf(scene: THREE.Object3D, id = 'water-1'): THREE.Mesh {
    const group = scene.children.find(c => c.name === `water:${id}`) as THREE.Group | undefined;
    if (!group) throw new Error(`no water group for '${id}'`);
    const mesh = group.children.find(c => c.name === 'water-body') as THREE.Mesh | undefined;
    if (!mesh) throw new Error(`water group '${id}' has no body mesh`);
    return mesh;
}

describe('§POOL95 — WaterMeshBuilder', () => {
    let scene: THREE.Scene;
    let builder: WaterMeshBuilder;

    beforeEach(() => {
        scene = new THREE.Scene();
        builder = new WaterMeshBuilder(scene);
    });

    it('W-1: builds ONE body, and its root is a DIRECT CHILD of the scene', () => {
        const outcome = builder.updateWater(WATER);
        expect(outcome.drew).toBe('volume');

        // ⭐ DIRECT CHILD IS A STRUCTURAL INVARIANT, NOT A STYLE CHOICE.
        // `LevelExplodeController._buildLevelGroups` buckets only DIRECT scene
        // children. The intuitive thing for an assembly member is to nest the water
        // under the pool's or the basin slab's group — and if you do, hide-by-level
        // still appears to work (`applyLevelVisibility` uses a deep `scene.traverse`)
        // while EXPLODE silently breaks: the basin lifts and the water stays at model
        // Y. The parent link is expressed by `userData.parentId`, never by nesting.
        const roots = scene.children.filter(c => c.name.startsWith('water:'));
        expect(roots).toHaveLength(1);
        expect(roots[0]!.parent).toBe(scene);
        expect(builder.count).toBe(1);
    });

    it('W-2: the body is TRANSPARENT at the AUTHORED opacity — never a hard-coded one', () => {
        builder.updateWater(WATER);
        const mat = bodyOf(scene).material as THREE.MeshStandardMaterial;

        expect(mat.transparent).toBe(true);
        expect(mat.opacity).toBeCloseTo(0.3, 5);           // the founder's 70% transparency
        expect(mat.depthWrite).toBe(false);
        expect(mat.side).toBe(THREE.DoubleSide);

        // ⭐ THE ASSERTION A HARD-CODED CONSTANT FAILS. Author a DIFFERENT opacity and
        // demand to see it. A builder carrying its own `0.3` passes every assertion
        // above and dies here — which is the L-127 defect in a renderer.
        builder.updateWater({ ...WATER, id: 'water-2', opacity: 0.85, color: '#00FF7F' });
        const other = bodyOf(scene, 'water-2').material as THREE.MeshStandardMaterial;
        expect(other.opacity).toBeCloseTo(0.85, 5);
        expect(other.color.getHexString().toLowerCase()).toBe('00ff7f');
    });

    it('W-3: the body spans EXACTLY bottomElevation → surfaceElevation, absolutely', () => {
        builder.updateWater(WATER);
        const mesh = bodyOf(scene);
        mesh.geometry.computeBoundingBox();
        const bb = mesh.geometry.boundingBox!;

        // ADR-0124 §4.1, measured on the actual geometry. The whole reason water is
        // its own family is that these two elevations are INDEPENDENT and ABSOLUTE.
        expect(bb.min.y).toBeCloseTo(-1.2, 5);
        expect(bb.max.y).toBeCloseTo(-0.1, 5);

        // ...and the plan extent is the boundary, so the water fills the basin
        // rather than floating in the middle of it.
        expect(bb.min.x).toBeCloseTo(0, 5);
        expect(bb.max.x).toBeCloseTo(4, 5);
        expect(bb.min.z).toBeCloseTo(0, 5);
        expect(bb.max.z).toBeCloseTo(2, 5);
    });

    it('W-4: LOWERING THE WATER MOVES THE SURFACE AND LEAVES THE FLOOR — the blue-slab refutation', () => {
        // ⭐ ADR-0124 §4.1 says: *"If that test can be made to pass with a blue slab,
        // this decision was wrong. It cannot."* This is that test at the MESH.
        // A slab is anchored by its top and grows DOWN by `thickness`, so lowering
        // its top moves the WHOLE body — its underside would rise with the surface.
        builder.updateWater(WATER);
        const high = bodyOf(scene).geometry.clone();
        high.computeBoundingBox();

        builder.updateWater({ ...WATER, surfaceElevation: -0.5 });   // drain it a bit
        const low = bodyOf(scene).geometry;
        low.computeBoundingBox();

        expect(low.boundingBox!.max.y).toBeCloseTo(-0.5, 5);   // the surface dropped
        expect(low.boundingBox!.min.y).toBeCloseTo(-1.2, 5);   // ...and the floor did NOT
        expect(low.boundingBox!.min.y).toBeCloseTo(high.boundingBox!.min.y, 5);
    });

    it('W-5: userData carries selection, level and the ASSEMBLY link', () => {
        builder.updateWater(WATER);
        const group = scene.children.find(c => c.name === 'water:water-1') as THREE.Group;
        const mesh = bodyOf(scene);

        expect(group.userData['elementType']).toBe('water');
        expect(group.userData['selectable']).toBe(true);
        // The key `applyLevelVisibility` matches on. Without it the water ignores
        // every level filter — it hangs in the air when its storey is hidden.
        expect(group.userData['levelId']).toBe('level-1');
        // ADR-0124 §3.1 — one thing to select, edit and delete: the POOL.
        expect(group.userData['parentId']).toBe('pool-1');

        // ⭐ `role: 'geometry'` IS LOAD-BEARING. `SelectionManager.PARENT_RESOLVED_ROLES`
        // is exactly ['geometry','mullion','panel']; any other value and a click on the
        // water resolves to nothing.
        expect(mesh.userData['role']).toBe('geometry');
        expect(mesh.userData['parentId']).toBe('water-1');
        expect(mesh.userData['selectable']).toBe(false);
    });

    it('W-6: IDEMPOTENT BY ID — ten updates leave ONE group, not eleven', () => {
        for (let i = 0; i < 10; i++) {
            builder.updateWater({ ...WATER, surfaceElevation: -0.1 - i * 0.01 });
        }
        // A `.updated` mirror that adds instead of replacing is a memory leak whose
        // symptom is that the water gets progressively MORE OPAQUE as translucent
        // prisms stack — a bug that looks like a material problem and is not.
        expect(scene.children.filter(c => c.name.startsWith('water:'))).toHaveLength(1);
        expect(builder.count).toBe(1);
    });

    it('W-7: REFUSES degenerate input BY NAME rather than drawing at the datum', () => {
        // §CONTEXT-DATA-HONESTY: failure and emptiness are never the same value. A
        // silent `?? 0` here would file an unmeasured body at the project datum,
        // which looks like a bug in the pool rather than a missing field upstream.
        const noElev = builder.updateWater({ ...WATER, id: 'w-a', surfaceElevation: undefined });
        expect(noElev.drew).toBe('nothing');
        expect(noElev.reason).toContain('refusing to guess');

        const inverted = builder.updateWater({ ...WATER, id: 'w-b', surfaceElevation: -1.5 });
        expect(inverted.drew).toBe('nothing');
        expect(inverted.reason).toContain('non-positive depth');

        const thin = builder.updateWater({ ...WATER, id: 'w-c', boundary: [{ x: 0, y: 0, z: 0 }] });
        expect(thin.drew).toBe('nothing');
        expect(thin.reason).toContain('at least 3');

        // Not one of the three drew anything.
        expect(scene.children.filter(c => c.name.startsWith('water:'))).toHaveLength(0);
    });

    it('W-8: remove and project-clear dispose the geometry and empty the scene', () => {
        builder.updateWater(WATER);
        const mesh = bodyOf(scene);
        let disposed = false;
        mesh.geometry.dispose = () => { disposed = true; };

        expect(builder.removeWater('water-1')).toBe(true);
        expect(disposed).toBe(true);
        expect(scene.children.filter(c => c.name.startsWith('water:'))).toHaveLength(0);
        // "gone" and "was never drawn" are different facts.
        expect(builder.removeWater('water-1')).toBe(false);

        // §C13 — the project-switch sweep verb, and it is NON-TERMINAL: the builder
        // must still draw the INCOMING project's pools (the L-224 distinction).
        builder.updateWater(WATER);
        builder.clearProjectGeometry();
        expect(builder.count).toBe(0);
        expect(builder.updateWater(WATER).drew).toBe('volume');
        expect(builder.count).toBe(1);
    });
});
