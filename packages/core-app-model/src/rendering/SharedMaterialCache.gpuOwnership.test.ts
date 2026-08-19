/**
 * §GPU-RESOURCE-LIFETIME (ADR-0297, INVARIANT L1 — OWNERSHIP) at the dedup chokepoint.
 *
 * ── The hole ADR-0297 NAMED but never closed ────────────────────────────────
 *
 * ADR-0297 §Context, third fault, verbatim:
 *
 *   "A third instance was latent: the builder disposed the very materials it had
 *    just handed to `_instanceBridge.register()`, which routes them through
 *    `SharedMaterialCache.dedupInstanceMaterial` — so the disposed material could
 *    be the CANONICAL material for an entire InstanceGroup."
 *
 * It was written down as latent and left open. It is not latent once element
 * instancing is switched ON: `dedupInstanceMaterial` elects the FIRST material it
 * sees for a visual signature as the canonical, and that canonical then backs
 * EVERY element in the group. The element that happened to arrive first still
 * believes it owns that material — so deleting THAT ONE ELEMENT frees the
 * material still bound by the InstancedMesh drawing the other N-1.
 *
 * ADR-0297's own prescription for this shape (safeDispose.ts, `detachAndReleaseChildren`):
 *
 *   "@param disposeMaterials false for builders that share materials across
 *    elements. Prefer `markSharedGpuResource` on the CACHE instead — it is not
 *    defeated by a builder forgetting the flag."
 *
 * That is exactly what these tests pin: ownership is recorded ON THE RESOURCE, at
 * the cache that hands it out, so no builder can free it by being careless — and
 * `resetSharedMaterialCache()` hands ownership BACK on project close so the
 * stamp cannot turn a bounded cache into an unbounded leak.
 *
 * Imports modules DIRECTLY (not via the rendering barrel) to keep the node test
 * env free of window-touching siblings — same rationale as SharedMaterialCache.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
    drainGpuReleaseQueue,
    isSharedGpuResource,
    safeDisposeMaterial,
    scheduleGpuRelease,
} from '@pryzm/renderer-three';
import { InstancedElementRenderer } from './InstancedElementRenderer';
import {
    dedupInstanceMaterial,
    resetSharedMaterialCache,
} from './SharedMaterialCache';

const g = globalThis as { __pryzmInstanceMaterialDedup?: boolean };

describe('SharedMaterialCache — §GPU-RESOURCE-LIFETIME INVARIANT L1 (ownership)', () => {
    beforeEach(() => {
        resetSharedMaterialCache();
        drainGpuReleaseQueue();
    });
    afterEach(() => {
        resetSharedMaterialCache();
        drainGpuReleaseQueue();
        delete g.__pryzmInstanceMaterialDedup;
    });

    it('stamps the canonical as cache-owned the moment it is elected', () => {
        const first = new THREE.MeshStandardMaterial({ color: '#8899aa' });
        expect(isSharedGpuResource(first)).toBe(false);   // nobody owns it yet

        const canonical = dedupInstanceMaterial(first);

        expect(canonical).toBe(first);                     // first of its kind IS the canonical
        expect(isSharedGpuResource(canonical)).toBe(true); // …and the cache now owns it
    });

    it('THE CRASH PATH — deleting the element that MINTED the canonical must not free it', () => {
        // Element A arrives first, so ITS material becomes the canonical for the
        // whole group. Element B (identical look, own object) is swapped onto it.
        const matA = new THREE.MeshStandardMaterial({ color: '#cccccc' });
        const matB = new THREE.MeshStandardMaterial({ color: '#cccccc' });

        const canonical = dedupInstanceMaterial(matA);
        expect(dedupInstanceMaterial(matB)).toBe(canonical);
        expect(canonical).toBe(matA);   // A's material now backs BOTH elements

        const disposeSpy = vi.spyOn(matA, 'dispose');

        // Element A is deleted. Its builder frees "its own" material — every builder
        // in the repo does exactly this (ColumnFragmentBuilder._disposeMesh →
        // scheduleGpuRelease(obj) disposes materials by default; WindowBuilder
        // .deactivate() → safeDisposeMaterial over its shared cache).
        safeDisposeMaterial(matA);
        drainGpuReleaseQueue();

        // TOOTH: without the L1 stamp this dispose() lands, and element B — still
        // drawn by the InstancedMesh bound to `canonical` — renders with a freed
        // material. On WebGPU that is `RenderObject.onMaterialDispose` →
        // the sibling `usedTimes` throw / a destroyed bind group mid-submit.
        expect(disposeSpy).not.toHaveBeenCalled();
    });

    it('the same protection survives the DEFERRED release route (scheduleGpuRelease)', () => {
        const shared = dedupInstanceMaterial(new THREE.MeshStandardMaterial({ color: '#204060' }));
        const disposeSpy = vi.spyOn(shared, 'dispose');

        // A builder tearing down a mesh whose material is the canonical. This is the
        // ColumnFragmentBuilder path exactly: scene.remove(mesh) then
        // scheduleGpuRelease(mesh) with disposeMaterials defaulting to TRUE.
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared);
        mesh.parent = null;
        scheduleGpuRelease(mesh);
        drainGpuReleaseQueue();

        expect(disposeSpy).not.toHaveBeenCalled();
    });

    it('a NON-canonical look-alike is still owned by its element and IS freed', () => {
        // The stamp must not over-reach: only the elected canonical is cache-owned.
        // The duplicate is orphaned the instant dedup swaps it out — nothing in the
        // scene references it, so its builder must still be able to reclaim it or we
        // have traded a crash for a leak.
        const first = new THREE.MeshStandardMaterial({ color: '#112233' });
        const duplicate = new THREE.MeshStandardMaterial({ color: '#112233' });
        dedupInstanceMaterial(first);
        expect(dedupInstanceMaterial(duplicate)).toBe(first);   // duplicate discarded

        const dupSpy = vi.spyOn(duplicate, 'dispose');
        safeDisposeMaterial(duplicate);

        expect(isSharedGpuResource(duplicate)).toBe(false);
        expect(dupSpy).toHaveBeenCalled();
    });

    it('a NON-eligible material (never cached) keeps its element ownership', () => {
        // ShaderMaterial has a null signature → never shared → never stamped.
        const exotic = new THREE.ShaderMaterial();
        expect(dedupInstanceMaterial(exotic)).toBe(exotic);
        expect(isSharedGpuResource(exotic)).toBe(false);

        const spy = vi.spyOn(exotic, 'dispose');
        safeDisposeMaterial(exotic);
        expect(spy).toHaveBeenCalled();
    });

    it('flag OFF (__pryzmInstanceMaterialDedup === false) stamps NOTHING', () => {
        // Exact pre-P6 behaviour: no dedup, therefore no shared ownership, therefore
        // builders keep disposing their own materials exactly as they always did.
        g.__pryzmInstanceMaterialDedup = false;
        const m = new THREE.MeshStandardMaterial({ color: '#abcdef' });
        expect(dedupInstanceMaterial(m)).toBe(m);
        expect(isSharedGpuResource(m)).toBe(false);

        const spy = vi.spyOn(m, 'dispose');
        safeDisposeMaterial(m);
        expect(spy).toHaveBeenCalled();
    });

    it('resetSharedMaterialCache() RETURNS ownership so the stamp cannot leak', () => {
        // The stamp lives in a WeakSet keyed on the material. If it were never
        // cleared, `deactivate()`/project-close teardown in every builder would
        // silently no-op forever and the canonical materials would be unreclaimable
        // — a bounded crash traded for an unbounded leak. Project close is exactly
        // the instant at which nothing in any scene still references them.
        const shared = dedupInstanceMaterial(new THREE.MeshStandardMaterial({ color: '#ff8800' }));
        expect(isSharedGpuResource(shared)).toBe(true);

        resetSharedMaterialCache();

        expect(isSharedGpuResource(shared)).toBe(false);
        const spy = vi.spyOn(shared, 'dispose');
        safeDisposeMaterial(shared);
        expect(spy).toHaveBeenCalled();        // reclaimable again
    });

    it('END TO END — N instanced elements, delete the FIRST, the other N-1 keep a live material', () => {
        // The founder's actual scenario, at the layer he experiences it: many
        // identical elements coalesced into one InstancedMesh, then one is deleted.
        const scene = new THREE.Scene();
        const renderer = new InstancedElementRenderer();
        renderer.setScene(scene);          // the renderer takes NO scene ctor arg
        const unitBox = new THREE.BoxGeometry(1, 1, 1);

        const mats: THREE.MeshStandardMaterial[] = [];
        for (let i = 0; i < 8; i++) {
            // Each element mints its OWN fresh-but-identical material, as every real
            // builder does.
            const m = new THREE.MeshStandardMaterial({ color: '#d0d0d0' });
            mats.push(m);
            renderer.register(
                `win-${i}`, unitBox, m,
                new THREE.Matrix4().makeTranslation(i * 2, 0, 0),
                'level-0', 'Window', `win-${i}`,
            );
        }

        // All eight collapsed onto ONE canonical → one group → one draw call.
        let groups = 0;
        scene.traverse((o) => {
            if ((o as THREE.InstancedMesh).isInstancedMesh && o.userData?.isInstancedGroup) groups++;
        });
        expect(groups).toBe(1);

        const canonical = mats[0];      // element 0 arrived first, so it was elected
        const disposeSpy = vi.spyOn(canonical, 'dispose');

        // Delete element 0 — slot released, then its builder frees its material.
        renderer.unregister('win-0');
        safeDisposeMaterial(canonical);
        drainGpuReleaseQueue();

        // The group is still there, still drawing the remaining seven…
        let live: THREE.InstancedMesh | null = null;
        scene.traverse((o) => {
            if ((o as THREE.InstancedMesh).isInstancedMesh && o.userData?.isInstancedGroup) {
                live = o as THREE.InstancedMesh;
            }
        });
        expect(live).not.toBeNull();

        // …and the material it is bound to was NOT freed out from under them.
        expect(disposeSpy).not.toHaveBeenCalled();
        expect((live as unknown as THREE.InstancedMesh).material).toBe(canonical);
    });
});
