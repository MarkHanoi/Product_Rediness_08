// @vitest-environment happy-dom
/**
 * §GPU-RESOURCE-LIFETIME (ADR-0297, INVARIANT L2) — CurtainWallBuilder migration.
 *
 * `_disposeChildren` previously called safeDisposeGeometry/-Materials IN PLACE,
 * while every mesh was still parented to the scene (all three call sites detach
 * only AFTER it returns). A frame already encoded against those buffers then drew
 * destroyed resources — the "setIndexBuffer … parameter 1 is not of type
 * 'GPUBuffer'" class the founder hit on the furniture path.
 *
 * Now it SCHEDULES the release for the next frame boundary (pattern:
 * InstanceGroup.dispose()), preserving the §MI-07 / §PERF-2026-Q2-CW-CREATE
 * shared-resource guards (userData.sharedGeometry / sharedMaterial — the L1
 * ownership rule in its older per-mesh form).
 *
 * `_disposeChildren` is deliberately tested via the prototype: constructing a full
 * CurtainWallBuilder wires batchCoordinator callbacks and window globals that are
 * irrelevant to the lifetime rule under test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { drainGpuReleaseQueue, pendingGpuReleaseCount } from '@pryzm/renderer-three';
import { CurtainWallBuilder } from '../src/CurtainWallBuilder';

const disposeChildren: (group: THREE.Group) => void =
    (CurtainWallBuilder.prototype as unknown as { _disposeChildren(group: THREE.Group): void })
        ._disposeChildren;

function spiedMesh(shared: { geometry?: boolean; material?: boolean } = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const geoDispose = vi.fn();
    const matDispose = vi.fn();
    mesh.geometry.dispose = geoDispose;
    (mesh.material as THREE.Material).dispose = matDispose;
    if (shared.geometry) mesh.userData.sharedGeometry = true;
    if (shared.material) mesh.userData.sharedMaterial = true;
    return { mesh, geoDispose, matDispose };
}

describe('CurtainWallBuilder._disposeChildren — schedules, never disposes in place', () => {
    beforeEach(() => { drainGpuReleaseQueue(); });
    afterEach(() => { drainGpuReleaseQueue(); });

    it('disposes NOTHING on the mutation tick (the frame in flight stays safe)', () => {
        const group = new THREE.Group();
        const { mesh, geoDispose, matDispose } = spiedMesh();
        group.add(mesh);

        disposeChildren.call(null, group);

        expect(geoDispose).not.toHaveBeenCalled();
        expect(matDispose).not.toHaveBeenCalled();
        expect(pendingGpuReleaseCount()).toBeGreaterThan(0);
    });

    it('the frame-boundary drain then releases owned geometry + material exactly once', () => {
        const group = new THREE.Group();
        const { geoDispose, matDispose } = spiedMesh();
        group.add(group.children[0] ?? new THREE.Group()); // keep shape stable
        const owned = spiedMesh();
        group.add(owned.mesh);
        void geoDispose; void matDispose;

        disposeChildren.call(null, group);
        drainGpuReleaseQueue();

        expect(owned.geoDispose).toHaveBeenCalledTimes(1);
        expect(owned.matDispose).toHaveBeenCalledTimes(1);
        expect(pendingGpuReleaseCount()).toBe(0);
    });

    it('preserves the §MI-07 shared-resource guards: cache-owned mullion resources are never queued', () => {
        const group = new THREE.Group();
        const { mesh, geoDispose, matDispose } = spiedMesh({ geometry: true, material: true });
        group.add(mesh);

        disposeChildren.call(null, group);
        drainGpuReleaseQueue();

        // The mullion caches own these until builder.dispose() — an element rebuild
        // must not free them out from under every other wall (invariant L1).
        expect(geoDispose).not.toHaveBeenCalled();
        expect(matDispose).not.toHaveBeenCalled();
    });

    it('walks NESTED panel groups (§H29) — nested meshes are queued too', () => {
        const group = new THREE.Group();
        const panel = new THREE.Group();
        const { geoDispose } = ((): ReturnType<typeof spiedMesh> => {
            const s = spiedMesh();
            panel.add(s.mesh);
            return s;
        })();
        group.add(panel);

        disposeChildren.call(null, group);
        drainGpuReleaseQueue();

        expect(geoDispose).toHaveBeenCalledTimes(1);
    });

    it('handles material arrays per-material', () => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [
            new THREE.MeshBasicMaterial(),
            new THREE.MeshBasicMaterial(),
        ]);
        const d0 = vi.fn(); const d1 = vi.fn();
        (mesh.material as THREE.Material[])[0]!.dispose = d0;
        (mesh.material as THREE.Material[])[1]!.dispose = d1;
        mesh.geometry.dispose = vi.fn();
        const group = new THREE.Group();
        group.add(mesh);

        disposeChildren.call(null, group);
        drainGpuReleaseQueue();

        expect(d0).toHaveBeenCalledTimes(1);
        expect(d1).toHaveBeenCalledTimes(1);
    });
});
