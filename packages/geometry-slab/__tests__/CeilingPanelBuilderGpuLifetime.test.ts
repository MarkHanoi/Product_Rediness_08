/**
 * §GPU-RESOURCE-LIFETIME (ADR-0297, INVARIANT L2) — CeilingPanelBuilder migration.
 *
 * The builder previously disposed each child's GPU buffers WHILE the mesh was
 * still parented to the scene (`_disposeObject(child)` before `root.remove` /
 * `scene.remove`). That is the exact inverted ordering behind the founder's
 * "setIndexBuffer … parameter 1 is not of type 'GPUBuffer'" hard stop on the
 * furniture path: a frame already encoded against those buffers draws after they
 * are destroyed.
 *
 * These tests assert the ORDERING, not pixels: a ceiling removal detaches on the
 * mutation tick and releases only at the frame boundary (drainGpuReleaseQueue —
 * called in production by RenderPipelineManager.render at the top of a frame).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { drainGpuReleaseQueue, pendingGpuReleaseCount } from '@pryzm/renderer-three';
import { CeilingPanelBuilder } from '../src/ceiling/CeilingPanelBuilder';

function meshWithSpies(): { mesh: THREE.Mesh; geoDispose: ReturnType<typeof vi.fn>; matDispose: ReturnType<typeof vi.fn> } {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const geoDispose = vi.fn();
    const matDispose = vi.fn();
    mesh.geometry.dispose = geoDispose;
    (mesh.material as THREE.Material).dispose = matDispose;
    return { mesh, geoDispose, matDispose };
}

describe('CeilingPanelBuilder — detach on the mutation tick, release at the frame boundary', () => {
    beforeEach(() => { drainGpuReleaseQueue(); });
    afterEach(() => { drainGpuReleaseQueue(); });

    function arm() {
        const scene = new THREE.Scene();
        const builder = new CeilingPanelBuilder(scene);
        const root = new THREE.Group();
        const { mesh, geoDispose, matDispose } = meshWithSpies();
        root.add(mesh);
        scene.add(root);
        (builder as unknown as { _ceilingRoots: Map<string, THREE.Group> })._ceilingRoots.set('c1', root);
        return { scene, builder, root, mesh, geoDispose, matDispose };
    }

    it('removeCeiling disposes NOTHING on the mutation tick', () => {
        const { builder, geoDispose, matDispose } = arm();

        builder.removeCeiling('c1');

        expect(geoDispose).not.toHaveBeenCalled();
        expect(matDispose).not.toHaveBeenCalled();
        expect(pendingGpuReleaseCount()).toBeGreaterThan(0);
    });

    it('removeCeiling detaches the root from the scene BEFORE the release drains', () => {
        const { scene, builder, root, mesh, geoDispose } = arm();

        let reachableAtDispose: boolean | null = null;
        geoDispose.mockImplementation(() => {
            // At the instant of GPU release, the subtree must no longer be
            // reachable from the scene (invariant L2(a)).
            reachableAtDispose = scene.children.includes(root);
            void mesh;
        });

        builder.removeCeiling('c1');
        drainGpuReleaseQueue();

        expect(geoDispose).toHaveBeenCalledTimes(1);
        expect(reachableAtDispose).toBe(false);
    });

    it('the frame-boundary drain releases geometry AND material exactly once', () => {
        const { builder, geoDispose, matDispose } = arm();

        builder.removeCeiling('c1');
        drainGpuReleaseQueue();

        expect(geoDispose).toHaveBeenCalledTimes(1);
        expect(matDispose).toHaveBeenCalledTimes(1);
        expect(pendingGpuReleaseCount()).toBe(0);
    });

    it('removeCeiling of an unknown id is a no-op (no phantom queue growth)', () => {
        const { builder } = arm();
        builder.removeCeiling('nope');
        expect(pendingGpuReleaseCount()).toBe(0);
    });
});
