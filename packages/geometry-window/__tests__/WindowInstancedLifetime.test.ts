/**
 * §INSTANCE-WINDOWS-DEFAULT-ON (L-1180) — the tests that had to exist BEFORE the
 * flag could be flipped.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 * `WindowBuilder._convertGroupToInstances` has been in the tree, complete and
 * gated OFF, for months, and NOT ONE test ever ran with the gate open. The
 * founder's project holds 3 304 windows at 12 meshes each = 39 648 meshes = 85%
 * of a 46 735-mesh scene, so this is the single largest instancing win available
 * — and also the largest blast radius. What blocked the flip was never the
 * collapse maths; it was that the DELETE path was unproven, and deleting an
 * instanced element is exactly where this subsystem has crashed before
 * (ADR-0297: `CHANGE_FURNITURE_TYPE` → "setIndexBuffer … parameter 1 is not of
 * type 'GPUBuffer'", and the identical crash on `UPDATE_STAIR_RAILING`).
 *
 * So these tests drive the REAL builder through a REAL rebuild with the flag in
 * its shipped state, and assert at the layer the founder experiences:
 *   • the collapse actually happens (12 meshes → 1), because a perf change that
 *     does not collapse is a no-op with extra risk;
 *   • deleting ONE window leaves the other N-1 DRAWABLE — group still in the
 *     scene, material not freed, instance count decremented by exactly one;
 *   • nothing is released on the mutation tick (ADR-0297 L2);
 *   • picking still resolves every window, because a 208× faster scene the
 *     founder cannot click is not a win;
 *   • the kill switch genuinely restores the pre-flip behaviour.
 *
 * COMMITTED ≠ REACHABLE: every assertion is read off the built scene graph and
 * the live instancing renderer after a real `rebuild()` — never off a pure
 * function's return value.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { drainGpuReleaseQueue, pendingGpuReleaseCount } from '@pryzm/renderer-three';
import {
    ElementInstanceBridge,
    instancedElementRenderer,
    isElementInstancingEnabled,
} from '@pryzm/core-app-model/rendering';
import { WindowBuilder } from '../src/WindowBuilder';

const WALL = {
    id: 'w1', levelId: 'L0', thickness: 0.2, height: 3, baseOffset: 0,
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }],
};

function win(id: string, offset: number) {
    return {
        id, wallId: 'w1', openingId: `o-${id}`,
        offset, width: 1.2, height: 1.4, sillHeight: 0.9,
        frameThickness: 0.05, frameDepth: 0.2, frameColor: '#e8e8e8',
        columnRatios: [1, 1], rowRatios: [1, 1],
        columnDividerThickness: 0.03, rowDividerThickness: 0.03,
        sill: true, sillDepth: 0.08, sillThickness: 0.03,
        glassOpacity: 0.3, windowType: 'single',
    };
}

const g = globalThis as {
    __pryzmElementInstancingV1?: boolean;
    __pryzmElementInstancing?: Record<string, boolean>;
};

interface Harness {
    scene: THREE.Scene;
    builder: WindowBuilder;
    rebuild(w: Record<string, unknown>): void;
    groupOf(id: string): THREE.Group | null;
    /** Real THREE.Mesh objects under a window's group (excludes the group itself). */
    meshesOf(id: string): THREE.Mesh[];
    instancedMeshes(): THREE.InstancedMesh[];
}

function harness(withBridge = true): Harness {
    const wallStoreStub = {
        getById: () => WALL,
        getLevelById: () => ({ id: 'L0', elevation: 0 }),
    } as never;
    const scene = new THREE.Scene();
    const builder = new WindowBuilder(scene, wallStoreStub);
    if (withBridge) {
        // The bridge is the ENABLE-gate; the sub-boxes are registered into the
        // module-level `instancedElementRenderer` singleton directly, which is why
        // the singleton also needs this scene.
        builder.setInstanceBridge(new ElementInstanceBridge(instancedElementRenderer));
        instancedElementRenderer.setScene(scene);
    }
    return {
        scene,
        builder,
        rebuild: (w) => (builder as unknown as { rebuild(x: unknown): void }).rebuild(w),
        groupOf(id) {
            let found: THREE.Group | null = null;
            scene.traverse(o => { if (o.userData?.id === id && o !== scene) found = o as THREE.Group; });
            return found;
        },
        meshesOf(id) {
            const root = this.groupOf(id);
            if (!root) return [];
            const out: THREE.Mesh[] = [];
            root.traverse(o => { if (o instanceof THREE.Mesh) out.push(o); });
            return out;
        },
        instancedMeshes() {
            const out: THREE.InstancedMesh[] = [];
            scene.traverse(o => {
                if ((o as THREE.InstancedMesh).isInstancedMesh && o.userData?.isInstancedGroup) {
                    out.push(o as THREE.InstancedMesh);
                }
            });
            return out;
        },
    };
}

describe('§INSTANCE-WINDOWS — the shipped default', () => {
    beforeEach(() => {
        delete g.__pryzmElementInstancingV1;
        delete g.__pryzmElementInstancing;
        instancedElementRenderer.clear();
        drainGpuReleaseQueue();
    });
    afterEach(() => {
        delete g.__pryzmElementInstancingV1;
        delete g.__pryzmElementInstancing;
        instancedElementRenderer.clear();
        drainGpuReleaseQueue();
    });

    it('windows are ON by default; no other family is', () => {
        // The whole point of naming families: flipping windows must not drag along
        // five builders that have not been made safe.
        expect(isElementInstancingEnabled('window')).toBe(true);
        expect(isElementInstancingEnabled('column')).toBe(false);
        expect(isElementInstancingEnabled('beam')).toBe(false);
        expect(isElementInstancingEnabled('handrail')).toBe(false);
        expect(isElementInstancingEnabled('stairRailing')).toBe(false);

        // The LEGACY unnamed call is untouched — still master-only, still default OFF.
        expect(isElementInstancingEnabled()).toBe(false);
    });

    it('KILL SWITCH — __pryzmElementInstancingV1 = false turns windows off', () => {
        g.__pryzmElementInstancingV1 = false;
        expect(isElementInstancingEnabled('window')).toBe(false);
    });

    it('KILL SWITCH — per-family override turns ONLY windows off', () => {
        g.__pryzmElementInstancing = { window: false };
        expect(isElementInstancingEnabled('window')).toBe(false);
        expect(isElementInstancingEnabled('handrail')).toBe(false);   // still its own default
    });

    it('per-family override BEATS the master flag', () => {
        g.__pryzmElementInstancingV1 = false;
        g.__pryzmElementInstancing = { window: true };
        expect(isElementInstancingEnabled('window')).toBe(true);
    });

    it('master flag = true still turns the whole fleet on (unchanged behaviour)', () => {
        g.__pryzmElementInstancingV1 = true;
        expect(isElementInstancingEnabled('column')).toBe(true);
        expect(isElementInstancingEnabled('beam')).toBe(true);
    });
});

describe('§INSTANCE-WINDOWS — the collapse actually happens', () => {
    beforeEach(() => { instancedElementRenderer.clear(); drainGpuReleaseQueue(); });
    afterEach(() => {
        delete g.__pryzmElementInstancing;
        instancedElementRenderer.clear();
        drainGpuReleaseQueue();
    });

    it('ON (default): one window collapses to a SINGLE hit-proxy mesh', () => {
        const h = harness();
        h.rebuild(win('win-1', 2));

        const meshes = h.meshesOf('win-1');
        // 12 real sub-meshes at `fine` LOD → 1 invisible hit-proxy.
        expect(meshes).toHaveLength(1);
        expect(meshes[0].userData?.role).toBe('hit-proxy');
        expect(h.instancedMeshes().length).toBeGreaterThan(0);
    });

    it('OFF: the SAME window keeps its real sub-meshes — the control', () => {
        // A control that cannot fail is not a control: this proves the 1-mesh
        // reading above is caused by instancing and not by the harness quietly
        // failing to build anything.
        g.__pryzmElementInstancing = { window: false };
        const h = harness();
        h.rebuild(win('win-1', 2));

        const meshes = h.meshesOf('win-1');
        expect(meshes.length).toBeGreaterThan(1);
        expect(meshes.some(m => m.userData?.role === 'hit-proxy')).toBe(false);
        expect(h.instancedMeshes()).toHaveLength(0);
    });

    it('MEASURED before/after — 20 identical windows, mesh count and group count', () => {
        const N = 20;

        g.__pryzmElementInstancing = { window: false };
        const off = harness();
        for (let i = 0; i < N; i++) off.rebuild(win(`w-${i}`, 1 + i * 1.5));
        let offMeshes = 0;
        off.scene.traverse(o => { if (o instanceof THREE.Mesh) offMeshes++; });

        delete g.__pryzmElementInstancing;
        instancedElementRenderer.clear();
        const on = harness();
        for (let i = 0; i < N; i++) on.rebuild(win(`w-${i}`, 1 + i * 1.5));
        let onMeshes = 0;
        on.scene.traverse(o => {
            // Count the instanced groups as the draw calls they are, not per instance.
            if (o instanceof THREE.Mesh) onMeshes++;
        });

        // The headline: per-window mesh count collapses from ~12 to 1 hit-proxy,
        // plus a small fixed number of shared InstancedMeshes for the whole set.
        expect(offMeshes).toBeGreaterThan(N * 5);
        expect(onMeshes).toBeLessThan(offMeshes / 2);
        // And the instanced groups are SHARED across all 20 windows — that is the
        // draw-call win. Far fewer groups than windows.
        expect(on.instancedMeshes().length).toBeLessThan(N);
    });
});

describe('§INSTANCE-WINDOWS — the DELETE path (ADR-0297, the crash shape)', () => {
    beforeEach(() => { instancedElementRenderer.clear(); drainGpuReleaseQueue(); });
    afterEach(() => { instancedElementRenderer.clear(); drainGpuReleaseQueue(); });

    it('THE CRASH PATH — delete 1 of 12, the other 11 still render with a LIVE material', () => {
        const N = 12;
        const h = harness();
        for (let i = 0; i < N; i++) h.rebuild(win(`w-${i}`, 1 + i * 2));

        const groupsBefore = h.instancedMeshes();
        expect(groupsBefore.length).toBeGreaterThan(0);
        const instancesBefore = instancedElementRenderer.totalInstances;
        const perWindow = instancesBefore / N;
        expect(perWindow).toBeGreaterThan(1);          // a window really is many sub-boxes

        // Spy on EVERY material bound by a live instanced group. These are the
        // canonical shared materials — freeing one blanks every window using it.
        const spies = groupsBefore.map(m => vi.spyOn(m.material as THREE.Material, 'dispose'));

        // Delete window 0 — the one that arrived FIRST, so it is the element whose
        // materials were elected canonical for the whole group. This is the worst
        // case, not a random one.
        (h.builder as unknown as { dispose(id: string): void })['dispose']('w-0');
        drainGpuReleaseQueue();

        // Its own group is gone from the scene…
        expect(h.groupOf('w-0')).toBeNull();

        // …the other 11 are still there and still instanced…
        for (let i = 1; i < N; i++) expect(h.groupOf(`w-${i}`)).not.toBeNull();
        expect(h.instancedMeshes().length).toBeGreaterThan(0);

        // …exactly one window's worth of slots was released, no more…
        expect(instancedElementRenderer.totalInstances).toBe(instancesBefore - perWindow);

        // …and NOT ONE of the shared materials was freed out from under them.
        //
        // ⚠ HONEST SCOPE — MEASURED, and it changes what this line is worth.
        // I disabled the L1 stamp in SharedMaterialCache and re-ran this test: it
        // STILL PASSED. So this assertion is NOT what proves the L1 fix, and
        // saying it were would be a circular proof of exactly the kind this lane
        // was warned about. The reason it cannot bite is that
        // `WindowBuilder.dispose()` already frees only the hit-proxy's throwaway
        // material and deliberately skips the shared frame/glass ones — windows
        // were the careful builder all along.
        //
        // What this line IS worth: a REGRESSION GUARD pinning that discipline. The
        // moment anyone "tidies" dispose() into a blanket
        // `detachAndReleaseChildren(group)` — the obvious, ADR-endorsed-looking
        // refactor, whose default is disposeMaterials = true — this goes red.
        //
        // The watched-red proof of the L1 fix itself lives at the layer the fix is
        // made: packages/core-app-model/src/rendering/SharedMaterialCache.gpuOwnership.test.ts
        // (5 of its 8 assertions failed before the stamp existed), plus the
        // cross-family test below, which DOES bite here.
        for (const s of spies) expect(s).not.toHaveBeenCalled();
    });

    it('CROSS-FAMILY — a window teardown must not free the canonical a WALL is drawing with', () => {
        // This is the window-side L1 exposure that is live TODAY, and it is not on
        // the delete path at all — it is on project close.
        //
        // Walls instance BY DEFAULT (they are the one family that always has), and
        // every register() routes through `dedupInstanceMaterial`. A wall material
        // and a window frame material with the same visual signature — same colour,
        // roughness, metalness; '#e8e8e8' standard is an entirely ordinary wall
        // colour — therefore collapse onto ONE canonical object. Whichever element
        // arrived FIRST owns it as far as its builder is concerned.
        //
        // So when `WindowBuilder.deactivate()` frees its `_sharedFrameMats` (it
        // does, by design, to avoid leaking across project close/reopen), it can be
        // freeing the material an InstancedMesh full of WALLS is still bound to.
        // Neither builder is being careless; they simply cannot see each other.
        // That is precisely why ADR-0297 puts ownership ON THE RESOURCE at the
        // cache, and not in a per-builder membership test: "it is not in MY cache"
        // is only evidence of ignorance about the other caches.
        const h = harness();
        h.rebuild(win('w-0', 2));           // window frame material elected canonical

        // A wall arrives with its own fresh, identical-looking material and is
        // swapped onto that same canonical.
        const wallMat = new THREE.MeshStandardMaterial({ color: '#e8e8e8' });
        instancedElementRenderer.register(
            'wall-1', new THREE.BoxGeometry(1, 1, 1), wallMat,
            new THREE.Matrix4().makeTranslation(0, 0, 5),
            'L0', 'Wall', 'wall-1',
        );

        const wallGroup = h.instancedMeshes().find(m => m.userData?.isInstancedGroup);
        expect(wallGroup).toBeTruthy();
        const canonicals = h.instancedMeshes().map(m => m.material as THREE.Material);
        const spies = canonicals.map(m => vi.spyOn(m, 'dispose'));

        // Project close: the window builder tears itself down and frees its shared
        // material caches.
        (h.builder as unknown as { deactivate(): void }).deactivate();
        drainGpuReleaseQueue();

        // Nothing an InstanceGroup is still bound to may have been freed.
        for (const s of spies) expect(s).not.toHaveBeenCalled();
    });

    it('releases NOTHING on the mutation tick (ADR-0297 INVARIANT L2)', () => {
        const h = harness();
        h.rebuild(win('w-0', 2));
        h.rebuild(win('w-1', 6));
        drainGpuReleaseQueue();

        const proxy = h.meshesOf('w-0')[0];
        const geoSpy = vi.spyOn(proxy.geometry, 'dispose');

        (h.builder as unknown as { dispose(id: string): void })['dispose']('w-0');

        // Detached NOW, freed LATER — the frame owner decides when memory goes.
        expect(h.groupOf('w-0')).toBeNull();
        expect(geoSpy).not.toHaveBeenCalled();
        expect(pendingGpuReleaseCount()).toBeGreaterThan(0);

        drainGpuReleaseQueue();
        expect(geoSpy).toHaveBeenCalled();
    });

    it('deleting EVERY window leaves no orphan instance slots', () => {
        const N = 6;
        const h = harness();
        for (let i = 0; i < N; i++) h.rebuild(win(`w-${i}`, 1 + i * 2));
        expect(instancedElementRenderer.totalInstances).toBeGreaterThan(0);

        for (let i = 0; i < N; i++) {
            (h.builder as unknown as { dispose(id: string): void })['dispose'](`w-${i}`);
        }
        drainGpuReleaseQueue();

        expect(instancedElementRenderer.totalInstances).toBe(0);
    });

    it('a REBUILD (move) does not strand the old slots — count stays flat', () => {
        // The §WALL-AUDIT-2026-W7 shape: a rebuild under a new key leaving the old
        // slot drawing at the old transform (a phantom window).
        const h = harness();
        h.rebuild(win('w-0', 2));
        const after1 = instancedElementRenderer.totalInstances;

        h.rebuild(win('w-0', 9));            // same id, moved
        drainGpuReleaseQueue();

        expect(instancedElementRenderer.totalInstances).toBe(after1);
        expect(h.groupOf('w-0')).not.toBeNull();
    });
});

describe('§INSTANCE-WINDOWS — PICKING survives the flip', () => {
    beforeEach(() => { instancedElementRenderer.clear(); drainGpuReleaseQueue(); });
    afterEach(() => { instancedElementRenderer.clear(); drainGpuReleaseQueue(); });

    it('every instanced sub-box resolves back to its OWN window id', () => {
        // A 208x faster scene the founder cannot click is not a win. Each sub-box is
        // stored under `${win.id}#${i}` but carries pickId = win.id, so picking any
        // frame bar or pane must resolve to the one window element.
        const h = harness();
        h.rebuild(win('w-a', 2));
        h.rebuild(win('w-b', 8));

        const groups = h.instancedMeshes();
        expect(groups.length).toBeGreaterThan(0);

        const seen = new Set<string>();
        for (const gm of groups) {
            const resolve = gm.userData?.getInstanceElementId as
                | ((slot: number) => string | null | undefined)
                | undefined;
            expect(typeof resolve).toBe('function');
            for (let slot = 0; slot < gm.count; slot++) {
                const id = resolve!(slot);
                if (id) seen.add(id);
            }
        }
        // Both windows are reachable, and picking never invents a sub-box key.
        expect(seen.has('w-a')).toBe(true);
        expect(seen.has('w-b')).toBe(true);
        for (const id of seen) expect(id).not.toContain('#');
    });

    it('the hit-proxy remains raycastable so group selection still works', () => {
        const h = harness();
        h.rebuild(win('w-a', 2));
        h.scene.updateMatrixWorld(true);

        const proxy = h.meshesOf('w-a')[0];
        expect(proxy.userData?.role).toBe('hit-proxy');
        expect(proxy.visible).toBe(true);        // invisible to the EYE, not to the ray
        const mat = proxy.material as THREE.MeshBasicMaterial;
        expect(mat.colorWrite).toBe(false);      // …which is how it is imperceptible

        const raycaster = new THREE.Raycaster();
        const box = new THREE.Box3().setFromObject(proxy);
        const centre = box.getCenter(new THREE.Vector3());
        raycaster.set(
            new THREE.Vector3(centre.x, centre.y, centre.z + 20),
            new THREE.Vector3(0, 0, -1),
        );
        expect(raycaster.intersectObject(proxy, true).length).toBeGreaterThan(0);
    });
});
