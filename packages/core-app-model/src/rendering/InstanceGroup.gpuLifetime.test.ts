/**
 * §GPU-RESOURCE-LIFETIME (ADR-0297, INVARIANT L2) — the hole the ADR's furniture
 * fix could not reach.
 *
 * ADR-0297 migrated `FurnitureFragmentBuilder.updateFurniture()` to
 * `detachAndReleaseChildren`, and the founder's `CHANGE_FURNITURE_TYPE` crash
 * KEPT HAPPENING on the very next build (096e12b4):
 *
 *   [CommandManager] EXECUTE: CHANGE_FURNITURE_TYPE
 *   PIPELINE_FAILURE reason="Failed to execute 'setIndexBuffer' on
 *     'GPURenderPassEncoder': parameter 1 is not of type 'GPUBuffer'."
 *
 * Root cause: a type change re-registers the element under a NEW geometry hash, so
 *
 *   FurnitureInstanceBridge.register()
 *     → _releaseParts()
 *       → InstancedElementRenderer.unregister()
 *         → _removeGroup()            (activeCount hit 0)
 *           → InstanceGroup.dispose() → mesh.geometry.dispose()   ← IN PLACE
 *
 * destroyed the OLD group's index/vertex buffers SYNCHRONOUSLY, inside the
 * command's `execute()`. On the WebGPU backend `BufferGeometry.dispose()` deletes
 * the backend's per-attribute record immediately, and the next encoded frame
 * reaches `WebGPUBackend.draw`'s `this.get(index).buffer === undefined`.
 *
 * ADR-0297 enumerated element BUILDERS (its L-691 list). This site is not a
 * builder — it is the shared instancing renderer beneath ALL of them — which is
 * why the same defect reproduced on `UPDATE_STAIR_RAILING` and would reproduce on
 * walls, columns and beams.
 *
 * These tests pin INVARIANT L2 at this layer: nothing is released on the mutation
 * tick; the release happens at the frame boundary the render pipeline owns.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { drainGpuReleaseQueue, pendingGpuReleaseCount } from '@pryzm/renderer-three';
import { InstanceGroup } from './InstanceGroup';

describe('InstanceGroup.dispose — §GPU-RESOURCE-LIFETIME INVARIANT L2', () => {
    beforeEach(() => { drainGpuReleaseQueue(); });
    afterEach(() => { drainGpuReleaseQueue(); });

    it('does NOT destroy the geometry on the mutation tick', () => {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial();
        const spy = vi.spyOn(geometry, 'dispose');

        const group = new InstanceGroup(geometry, material, 8);
        group.addInstance('sofa-1', new THREE.Matrix4());

        group.dispose();

        // TOOTH: this was `geometry.dispose()` executed right here, inside
        // CHANGE_FURNITURE_TYPE's execute(), with no relationship to the frame.
        expect(spy).not.toHaveBeenCalled();
        expect(pendingGpuReleaseCount()).toBeGreaterThan(0);
    });

    it('releases the geometry at the frame boundary', () => {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial();
        const spy = vi.spyOn(geometry, 'dispose');

        const group = new InstanceGroup(geometry, material, 8);
        group.dispose();
        expect(spy).not.toHaveBeenCalled();

        // RenderPipelineManager.render() is the sole drain caller (C04 §2).
        drainGpuReleaseQueue();

        expect(spy).toHaveBeenCalledTimes(1);
        expect(pendingGpuReleaseCount()).toBe(0);
    });

    it('never releases the MATERIAL — it may be the canonical for other groups', () => {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial();
        const matSpy = vi.spyOn(material, 'dispose');

        new InstanceGroup(geometry, material, 8).dispose();
        drainGpuReleaseQueue();

        // INVARIANT L1 — SharedMaterialCache.dedupInstanceMaterial may have made this
        // the canonical material for an entire InstanceGroup covering many elements.
        expect(matSpy).not.toHaveBeenCalled();
    });

    it('still clears its slot bookkeeping immediately (only the GPU free is deferred)', () => {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial();
        const group = new InstanceGroup(geometry, material, 8);
        group.addInstance('sofa-1', new THREE.Matrix4());
        expect(group.activeCount).toBe(1);

        group.dispose();

        // Deferring the RELEASE must not defer the BOOKKEEPING — a stale slot map
        // would hand a reused slot to the next element.
        expect(group.activeCount).toBe(0);
    });
});
