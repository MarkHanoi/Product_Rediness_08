/**
 * L-944(a) — §GPU-RESOURCE-LIFETIME (ADR-0297 INVARIANT L2) for the WALL rebuild path.
 *
 * `UNDO: CASCADE_WALL_BASELINE` rebuilds every cascaded wall. The rebuild's first act
 * is `_disposeWallGroupChildren(wallGroup)`, which — before this change — ran
 *
 *     group.traverse(obj => { geometry.dispose(); material.dispose(); });
 *     group.clear();
 *
 * i.e. it DESTROYED the GPU buffers while every mesh was still parented to a group
 * that is still parented to the scene. That is the exact inverted ordering ADR-0297
 * INVARIANT L2 exists to forbid, and the same ordering that produced the founder's
 * `setIndexBuffer … parameter 1 is not of type 'GPUBuffer'` hard stop on the furniture
 * path. `detachAndReleaseChildren()` was written for precisely this and applied to
 * curtain-wall, slab, ceiling, stair, furniture, roof, column and InstanceGroup —
 * the wall builder, the busiest consumer of all, was skipped.
 *
 * `removeWallFragments()` is the sibling half: it detached correctly but released on
 * the mutation tick, which is a store-event tick and not a frame boundary.
 *
 * These tests assert ORDERING, not pixels — there is no WebGPU in vitest. What they
 * pin is the property the GPU cares about: at the instant a buffer is freed, nothing
 * the renderer can reach still references it, and that instant is the frame boundary.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { drainGpuReleaseQueue, pendingGpuReleaseCount } from '@pryzm/renderer-three';
import { WallFragmentBuilder } from '../src/WallFragmentBuilder';

function spiedMesh(): { mesh: THREE.Mesh; geoDispose: ReturnType<typeof vi.fn>; matDispose: ReturnType<typeof vi.fn> } {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const geoDispose = vi.fn();
    const matDispose = vi.fn();
    mesh.geometry.dispose = geoDispose;
    (mesh.material as THREE.Material).dispose = matDispose;
    return { mesh, geoDispose, matDispose };
}

/** `_disposeWallGroupChildren` reads nothing off the builder — a bare instance is enough. */
function armBuilder(): { scene: THREE.Scene; builder: any } {
    const scene = new THREE.Scene();
    return { scene, builder: new WallFragmentBuilder(scene as any, {} as any) };
}

describe('L-944(a) — WallFragmentBuilder: DETACH now, RELEASE at the boundary', () => {
    beforeEach(() => { drainGpuReleaseQueue(); });
    afterEach(() => { drainGpuReleaseQueue(); });

    function armWallGroup() {
        const { scene, builder } = armBuilder();
        const group = new THREE.Group();
        const body = spiedMesh();
        const overlay = spiedMesh();
        group.add(body.mesh);
        group.add(overlay.mesh);
        scene.add(group);
        return { scene, builder, group, body, overlay };
    }

    it('the rebuild disposes NOTHING on the mutation tick', () => {
        const { builder, group, body, overlay } = armWallGroup();

        builder._disposeWallGroupChildren(group);

        expect(body.geoDispose).not.toHaveBeenCalled();
        expect(overlay.geoDispose).not.toHaveBeenCalled();
        expect(pendingGpuReleaseCount()).toBeGreaterThan(0);
    });

    it('the group is EMPTY immediately — the rebuild can repopulate it on the same tick', () => {
        const { builder, group } = armWallGroup();

        builder._disposeWallGroupChildren(group);

        expect(group.children.length).toBe(0);
    });

    it('⭐ at the instant a buffer is released, the mesh is no longer reachable from the scene', () => {
        const { scene, builder, group, body } = armWallGroup();

        // The load-bearing assertion. The OLD code disposed inside `group.traverse()`
        // with `group` still a child of `scene`, so this read was `true` — a live,
        // scene-reachable mesh whose vertex buffer had just been destroyed.
        let reachableAtRelease: boolean | null = null;
        body.geoDispose.mockImplementation(() => {
            let node: THREE.Object3D | null = body.mesh;
            while (node) {
                if (node === scene) { reachableAtRelease = true; return; }
                node = node.parent;
            }
            reachableAtRelease = false;
        });

        builder._disposeWallGroupChildren(group);
        drainGpuReleaseQueue();

        expect(body.geoDispose).toHaveBeenCalledTimes(1);
        expect(reachableAtRelease).toBe(false);
    });

    it('the frame-boundary drain releases geometry AND material of every child, exactly once', () => {
        const { builder, group, body, overlay } = armWallGroup();

        builder._disposeWallGroupChildren(group);
        drainGpuReleaseQueue();

        expect(body.geoDispose).toHaveBeenCalledTimes(1);
        expect(body.matDispose).toHaveBeenCalledTimes(1);
        expect(overlay.geoDispose).toHaveBeenCalledTimes(1);
        expect(overlay.matDispose).toHaveBeenCalledTimes(1);
        expect(pendingGpuReleaseCount()).toBe(0);
    });

    it('an already-empty group queues nothing (no phantom queue growth per rebuild)', () => {
        const { builder } = armBuilder();
        builder._disposeWallGroupChildren(new THREE.Group());
        expect(pendingGpuReleaseCount()).toBe(0);
    });
});

describe('L-944(a) — RoomBoundingLineBuilder: the plan linework had the same inversion', () => {
    beforeEach(() => { drainGpuReleaseQueue(); });
    afterEach(() => { drainGpuReleaseQueue(); });

    async function armLineBuilder() {
        const { RoomBoundingLineBuilder } = await import('../src/RoomBoundingLineBuilder');
        const scene = new THREE.Scene();
        const builder = Object.create(RoomBoundingLineBuilder.prototype) as any;
        builder._scene = scene;
        builder._roots = new Map<string, THREE.Group>();
        const root = new THREE.Group();
        const marker = spiedMesh();
        root.add(marker.mesh);
        scene.add(root);
        builder._roots.set('rbl-1', root);
        return { scene, builder, root, marker };
    }

    it('_dispose releases NOTHING on the mutation tick', async () => {
        const { builder, marker } = await armLineBuilder();
        builder._dispose('rbl-1');
        expect(marker.geoDispose).not.toHaveBeenCalled();
        expect(pendingGpuReleaseCount()).toBeGreaterThan(0);
    });

    it('⭐ the root is detached from the scene BEFORE its buffers are released', async () => {
        const { scene, builder, root, marker } = await armLineBuilder();

        let reachableAtRelease: boolean | null = null;
        marker.geoDispose.mockImplementation(() => {
            reachableAtRelease = scene.children.includes(root);
        });

        builder._dispose('rbl-1');
        drainGpuReleaseQueue();

        expect(marker.geoDispose).toHaveBeenCalledTimes(1);
        expect(reachableAtRelease).toBe(false);
    });
});
