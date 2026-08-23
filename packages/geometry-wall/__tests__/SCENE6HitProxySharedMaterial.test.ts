// §SCENE6-PROXY-MAT-IS-ONE-MATERIAL (L-10003) — 364 material objects for one
// invisible box, and every one of them a shader compile on WebGPU.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHERE THE NUMBER CAME FROM
// ─────────────────────────────────────────────────────────────────────────────
//
// `SCENE6InstancingRejectCensus.measure.test.ts` (L-10000) measured a corpus of 364
// free-standing walls that is **100 % instanced** — the best case the instancing
// router can produce — and found the scene holding:
//
//     scene-meshes = 364
//     materials: 364 distinct INSTANCES for 1 distinct VISUAL SIGNATURE
//     mesh kinds: (unnamed)|-|MeshBasicMaterial ×364
//
// Every one of those is the §INSTANCED-SELECTION-FIX hit-proxy: an invisible
// BoxGeometry whose only job is to give `SelectionManager`'s raycast something to
// hit, because an instanced wall has no child mesh of its own. The geometry has to
// be per-wall (walls differ in length, height and thickness). ⛔ The MATERIAL did
// not, and was `new` anyway.
//
// ⭐ WHY IT MATTERS AT ALL. On WebGPU a material object is a node-material compile.
// `BatchCoordinator.ts` measures PSO compilation at ~3 ms per unique
// {shader, vertex-layout, render-state} tuple and names it as the seed of an
// 8 000 ms LONGTASK → device loss. 363 needless material objects is 363 needless
// compiles, paid on the instanced arm — the arm that is supposed to be the fast one.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⛔ WHY THIS PARTICULAR MATERIAL IS SAFE TO SHARE, AND A BODY MATERIAL IS NOT
// ─────────────────────────────────────────────────────────────────────────────
//
// This lane's standing rule is "do not compromise graphics", and material sharing is
// exactly where that rule bites: two walls sharing a body material means recolouring
// one recolours both. The hit proxy is the one case where the argument is airtight
// rather than merely probable — it is `colorWrite: false, depthWrite: false`, so it
// writes NOTHING to the colour buffer and NOTHING to the depth buffer. It carries no
// colour, no map, no per-wall state, and nothing ever mutates it. Sharing it is
// unobservable BY CONSTRUCTION, not by convention.
//
// Test 3 pins that argument as a property of the object rather than a claim in a
// comment: if a future edit gives this material an appearance, the sharing stops
// being safe and that test goes red.
//
// ⚠ Test 4 is the one that would have caught the naive version. Sharing WITHOUT
// `markSharedGpuResource` is WORSE than not sharing: `_disposeWallGroupChildren` →
// `detachAndReleaseChildren` → `scheduleGpuRelease(child, disposeMaterials = true)`
// frees a child's material on every rebuild, so the first wall to rebuild would
// destroy the material all its siblings still draw with — trading 363 compiles for
// the destroyed-GPU-resource fault class (ADR-0297 INVARIANT L1).

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { isSharedGpuResource, detachAndReleaseChildren } from '@pryzm/renderer-three';

import { WallFragmentBuilder } from '../src/WallFragmentBuilder';
import { WallInstanceBridge } from '../src/WallInstanceBridge';
import type { IInstancedRenderer } from '../src/IInstancedRenderer';
import { mk, specOf, levelProvider } from './support/wallJointHarness';

class NoopInstancedRenderer implements IInstancedRenderer {
    private readonly _ids = new Set<string>();
    register(elementId: string): void { this._ids.add(elementId); }
    updateTransform(): void { /* not measured here */ }
    unregister(elementId: string): void { this._ids.delete(elementId); }
    isRegistered(elementId: string): boolean { return this._ids.has(elementId); }
}

/** Builds `n` free-standing (⇒ instanced) walls and returns their proxy meshes. */
function buildInstancedWalls(n: number): { scene: THREE.Scene; proxies: THREE.Mesh[] } {
    const scene = new THREE.Scene();
    const builder = new WallFragmentBuilder(scene, levelProvider() as never);
    builder.setInstanceBridge(new WallInstanceBridge(new NoopInstancedRenderer()));

    // Deliberately DIFFERENT dimensions per wall: the proxy GEOMETRY must stay
    // per-wall, and a test where every wall is identical could not tell a shared
    // material from a shared everything.
    const walls = Array.from({ length: n }, (_, i) => mk([0, i * 4], [3 + i, i * 4]));
    builder.refreshV2Cache(walls.map(specOf));
    for (const w of walls) builder.buildWall(w, null, undefined, 0);

    const proxies: THREE.Mesh[] = [];
    scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && (m.userData as { role?: string }).role === 'hit-proxy') proxies.push(m);
    });
    return { scene, proxies };
}

describe('§SCENE6-PROXY-MAT-IS-ONE-MATERIAL (L-10003)', () => {

    it('1 every instanced wall gets a hit proxy — the mechanism is still there', () => {
        const { proxies } = buildInstancedWalls(8);
        // ⛔ Non-vacuity. If the proxy stopped being created, tests 2-4 would all pass
        // over an empty array and this file would silently measure nothing. It is also
        // the thing that makes an instanced wall SELECTABLE (§INSTANCED-SELECTION-FIX).
        expect(proxies).toHaveLength(8);
    });

    it('2 …and they all share ONE material object, while keeping their own geometry', () => {
        const { proxies } = buildInstancedWalls(8);

        const materials = new Set(proxies.map(p => p.material as THREE.Material));
        expect(materials.size).toBe(1);

        // The geometry must NOT be shared — these walls have different extents, and a
        // shared box would put every wall's hit target at the wrong size.
        const geometries = new Set(proxies.map(p => p.geometry));
        expect(geometries.size).toBe(8);
    });

    it('3 the shared material is UNOBSERVABLE — no colour write, no depth write', () => {
        const { proxies } = buildInstancedWalls(2);
        const mat = proxies[0]!.material as THREE.MeshBasicMaterial;

        // This is the whole safety argument for sharing, pinned as a property.
        expect(mat.colorWrite).toBe(false);
        expect(mat.depthWrite).toBe(false);
        // No appearance state that could bleed between walls.
        expect(mat.map).toBeNull();
    });

    it('4 it is stamped shared, so one wall\'s teardown cannot free its siblings\' material', () => {
        const { scene, proxies } = buildInstancedWalls(4);
        const mat = proxies[0]!.material as THREE.Material;

        expect(isSharedGpuResource(mat)).toBe(true);

        // Watch for the real thing: THREE.Material.dispose() fires a 'dispose' event.
        let disposed = 0;
        mat.addEventListener('dispose', () => { disposed++; });

        // Tear down ONE wall group exactly as _disposeWallGroupChildren does.
        const firstGroup = proxies[0]!.parent!;
        detachAndReleaseChildren(firstGroup as THREE.Group);

        // ⛔ The other three walls still draw with this material. Without the stamp
        // this count would be 1 and their hit proxies would be pointing at a freed
        // GPU resource.
        expect(disposed).toBe(0);
        expect(isSharedGpuResource(mat)).toBe(true);

        // And the surviving walls still hold the same live material.
        const survivors: THREE.Mesh[] = [];
        scene.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh && (m.userData as { role?: string }).role === 'hit-proxy') survivors.push(m);
        });
        expect(survivors.length).toBe(3);
        for (const s of survivors) expect(s.material).toBe(mat);
    });
});
