/**
 * §MESH110-DOOR-MERGE (L-11567 #1b) — THE MERGE STAGE of the 3D door.
 *
 * THE MEASUREMENT (§PERF105): a door was 13-15 meshes typical / ~30 worst
 * (3 hinges + 4 handle parts + 5 leaf parts + 3 stops + frame — every one its
 * own draw of identical material state), and the founder crossed the 1000-mesh
 * backend-swap arm with ONE door create (978 → 1005). This suite pins what the
 * merge stage may and may not change:
 *
 *   · the count: a `fine` single door is ≤ 6 meshes (before/after printed);
 *   · triangle-NEUTRAL: the merge concatenates, it never removes detail;
 *   · world geometry IDENTICAL: the group's world bounding box is the same
 *     merged or not — on a straight host AND on a curved one (rotation baked);
 *   · every material still reaches ≥ 1 mesh (the master-material contract);
 *   · the stamping contract survives per merged mesh: elementType Door/DoorLeaf
 *     by role, parentId/wallId/levelId, selectable:false, and the
 *     `skipInPlan` partition the plan projector reads;
 *   · the BUILD stage is untouched: `setMeshConsolidation(false)` yields the
 *     per-part structure the L-957 byte-identical digest pins.
 *
 * The build-stage pins (Door3dDetailLevel, DoorMeshSkipInPlan,
 * OpeningProfileDoorFrame, CurvedHost*, StraightHostDoorLeafByteIdentical)
 * opt out of the merge stage explicitly; this file is their merge-stage twin.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { viewDefinitionStore, DEFAULT_3D_VIEW_ID, initDefaultViewsManager } from '@pryzm/core-app-model';
import { DoorBuilder } from '../src/DoorBuilder';

const STRAIGHT_WALL = {
    id: 'w1', levelId: 'L0', thickness: 0.2, height: 3,
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
};
/** A curved host — arc control off the chord, the shape CurvedHost* tests use. */
const CURVED_WALL = {
    id: 'w2', levelId: 'L0', thickness: 0.2, height: 3,
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
    curveControl: { x: 3, y: 0, z: 2 },
};

function stubFor(wall: unknown) {
    return {
        getById: () => wall,
        getLevelById: () => ({ id: 'L0', elevation: 0 }),
    } as never;
}

const SINGLE = {
    id: 'd1', wallId: 'w1', openingId: 'o1',
    width: 0.9, height: 2.1, offset: 1.0, sillHeight: 0,
    doorType: 'single', hingesSide: 'left', handleSide: 'right', swingDirection: 'inward',
    frameColor: '#8b5a2b', leafColor: '#c8a165', handle: true, handleHeight: 1.05,
    threshold: true, thresholdHeight: 0.02, leafVisibleInPlan: false,
};
const DOUBLE = { ...SINGLE, id: 'd2', doorType: 'double', width: 1.8 };

type Lod = 'coarse' | 'medium' | 'fine';

function build(door: Record<string, unknown>, wall: unknown, lod: Lod, consolidate: boolean): THREE.Group {
    initDefaultViewsManager();
    viewDefinitionStore.update(DEFAULT_3D_VIEW_ID, { output: { detailLevel: lod } } as never);
    const scene = new THREE.Scene();
    const builder = new DoorBuilder(scene, stubFor(wall));
    builder.setMeshConsolidation(consolidate);
    (builder as unknown as { rebuild(d: unknown): void }).rebuild({ ...door, wallId: (wall as { id: string }).id });
    const group = scene.children.find((c) => c.userData?.id === door.id) as THREE.Group;
    expect(group, 'the door group was not added to the scene').toBeDefined();
    return group;
}

function meshes(o: THREE.Object3D): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    o.traverse((c) => { if ((c as THREE.Mesh).isMesh) out.push(c as THREE.Mesh); });
    return out;
}

function tris(o: THREE.Object3D): number {
    let t = 0;
    for (const m of meshes(o)) {
        const g = m.geometry;
        t += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    }
    return Math.round(t);
}

function worldBox(o: THREE.Object3D): THREE.Box3 {
    o.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(o);
}

const MERGED_CEILING = 6;

describe('§MESH110-DOOR-MERGE — the count', () => {
    it('a `fine` single door on a straight host is ≤ 6 meshes (was 13-15 typical)', () => {
        const before = meshes(build(SINGLE, STRAIGHT_WALL, 'fine', false)).length;
        const after  = meshes(build(SINGLE, STRAIGHT_WALL, 'fine', true)).length;
        process.stdout.write(`[MESH110-DOOR-MERGE] fine single straight: ${before} → ${after} meshes
`);
        expect(before, 'the build stage should still be the unmerged 13+ parts').toBeGreaterThan(10);
        expect(after).toBeLessThanOrEqual(MERGED_CEILING);
        expect(after).toBeLessThan(before);
    });

    it('a `fine` DOUBLE door (the ~20-mesh case) is ≤ 6 meshes too', () => {
        const before = meshes(build(DOUBLE, STRAIGHT_WALL, 'fine', false)).length;
        const after  = meshes(build(DOUBLE, STRAIGHT_WALL, 'fine', true)).length;
        process.stdout.write(`[MESH110-DOOR-MERGE] fine double straight: ${before} → ${after} meshes
`);
        expect(after).toBeLessThanOrEqual(MERGED_CEILING);
        expect(after).toBeLessThan(before);
    });

    it('medium and coarse never GROW under the merge', () => {
        for (const lod of ['coarse', 'medium'] as const) {
            const before = meshes(build(SINGLE, STRAIGHT_WALL, lod, false)).length;
            const after  = meshes(build(SINGLE, STRAIGHT_WALL, lod, true)).length;
            process.stdout.write(`[MESH110-DOOR-MERGE] ${lod} single straight: ${before} → ${after} meshes
`);
            expect(after).toBeLessThanOrEqual(before);
        }
    });
});

describe('§MESH110-DOOR-MERGE — what the merge must NOT change', () => {
    it('is triangle-neutral: the merge concatenates, it never drops detail', () => {
        for (const lod of ['coarse', 'medium', 'fine'] as const) {
            expect(tris(build(SINGLE, STRAIGHT_WALL, lod, true)))
                .toBe(tris(build(SINGLE, STRAIGHT_WALL, lod, false)));
        }
        expect(tris(build(DOUBLE, STRAIGHT_WALL, 'fine', true)))
            .toBe(tris(build(DOUBLE, STRAIGHT_WALL, 'fine', false)));
    });

    it('world geometry is identical on a STRAIGHT host (local positions baked)', () => {
        const a = worldBox(build(SINGLE, STRAIGHT_WALL, 'fine', false));
        const b = worldBox(build(SINGLE, STRAIGHT_WALL, 'fine', true));
        expect(a.min.distanceTo(b.min)).toBeLessThan(1e-6);
        expect(a.max.distanceTo(b.max)).toBeLessThan(1e-6);
    });

    it('world geometry is identical on a CURVED host (a re-seated member bakes its rotation)', () => {
        const a = worldBox(build(SINGLE, CURVED_WALL, 'fine', false));
        const b = worldBox(build(SINGLE, CURVED_WALL, 'fine', true));
        expect(a.min.distanceTo(b.min)).toBeLessThan(1e-6);
        expect(a.max.distanceTo(b.max)).toBeLessThan(1e-6);
        // And the curved door actually merged something.
        expect(meshes(build(SINGLE, CURVED_WALL, 'fine', true)).length)
            .toBeLessThan(meshes(build(SINGLE, CURVED_WALL, 'fine', false)).length);
    });

    it('every material of the build stage still reaches ≥ 1 mesh after the merge', () => {
        const before = new Set(meshes(build(SINGLE, STRAIGHT_WALL, 'fine', false)).map((m) => (m.material as THREE.Material).uuid));
        const afterMeshes = meshes(build(SINGLE, STRAIGHT_WALL, 'fine', true));
        // Materials are cloned per door, so compare by COUNT of distinct materials, not uuid.
        const after = new Set(afterMeshes.map((m) => (m.material as THREE.Material).uuid));
        expect(after.size).toBe(before.size);
    });

    it('the stamping contract holds on every merged mesh — elementType by role, ids, selectable, skipInPlan', () => {
        const group = build(SINGLE, STRAIGHT_WALL, 'fine', true);
        const ms = meshes(group);
        expect(ms.length).toBeGreaterThan(0);
        for (const m of ms) {
            const ud = m.userData as Record<string, unknown>;
            const isLeaf = ud.role === 'doorLeaf';
            expect(ud.elementType).toBe(isLeaf ? 'DoorLeaf' : 'Door');
            expect(ud.parentId).toBe('d1');
            expect(ud.wallId).toBe('w1');
            expect(ud.levelId).toBe('L0');
            expect(ud.selectable).toBe(false);
            // leafVisibleInPlan=false → EVERY mesh, leaf included, is skipped in plan.
            expect(ud.skipInPlan).toBe(true);
        }
        // Exactly ONE leaf mesh survives the merge (the 5 rail-and-stile parts collapse).
        expect(ms.filter((m) => m.userData.role === 'doorLeaf')).toHaveLength(1);
        // And the escape hatch still routes per mesh: a leaf asked to show in plan projects.
        const shown = meshes(build({ ...SINGLE, leafVisibleInPlan: true }, STRAIGHT_WALL, 'fine', true));
        const leaf = shown.find((m) => m.userData.role === 'doorLeaf')!;
        expect(leaf.userData.skipInPlan).toBe(false);
        for (const m of shown) if (m.userData.role !== 'doorLeaf') expect(m.userData.skipInPlan).toBe(true);
    });

    it('merged meshes still resolve to the door by the ancestor walk selection uses', () => {
        const group = build(SINGLE, STRAIGHT_WALL, 'fine', true);
        for (const m of meshes(group)) {
            let o: THREE.Object3D | null = m;
            let id: string | undefined;
            while (o && !id) { id = o.userData?.id as string | undefined; o = o.parent; }
            expect(id).toBe('d1');
        }
    });
});

describe('§MESH110 / ADR-0297 L2 — dispose DETACHES before it RELEASES', () => {
    it('scene.remove(group) runs before any geometry.dispose()', () => {
        initDefaultViewsManager();
        viewDefinitionStore.update(DEFAULT_3D_VIEW_ID, { output: { detailLevel: 'fine' } } as never);
        const scene = new THREE.Scene();
        const builder = new DoorBuilder(scene, stubFor(STRAIGHT_WALL));
        (builder as unknown as { rebuild(d: unknown): void }).rebuild(SINGLE);
        const group = scene.children.find((c) => c.userData?.id === 'd1')!;

        const order: string[] = [];
        const origRemove = scene.remove.bind(scene);
        scene.remove = ((...objs: THREE.Object3D[]) => { order.push('remove'); return origRemove(...objs); }) as typeof scene.remove;
        for (const m of meshes(group)) {
            const orig = m.geometry.dispose.bind(m.geometry);
            m.geometry.dispose = () => { order.push('dispose'); orig(); };
        }

        (builder as unknown as { dispose(id: string): void }).dispose('d1');

        expect(order[0]).toBe('remove');
        expect(order.filter((x) => x === 'dispose').length).toBeGreaterThan(0);
        expect(order.indexOf('remove')).toBeLessThan(order.indexOf('dispose'));
    });
});
