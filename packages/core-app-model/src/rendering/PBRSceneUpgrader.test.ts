/**
 * PBRSceneUpgrader unit tests — §PERF-TRAVERSE-RECOMPILE-SCOPE (lane PERF-TRAVERSE,
 * 2026-09-03).
 *
 * THE INVARIANT UNDER TEST: `material.needsUpdate = true` (observable as a
 * `material.version` bump) is set ONLY when a program-cache-key property actually
 * changed — the env-map binding or `toneMapped`. Everything else this pass writes
 * (envMapIntensity, roughness, metalness) is a per-frame uniform and must NOT
 * trigger a shader/PSO recompile.
 *
 * WHY IT MATTERS: the recorded 38.7 s project-open stall (4073-mesh building,
 * ADR-0076) was 4073 materials × unconditional `needsUpdate` × WebGPU PSO
 * recompile. On the Phase-5 real-WebGPU path (PascalSceneLighting,
 * `scene.environment = null`, no per-material env map, three's `toneMapped`
 * default of `true`) the pass must be recompile-free — and the load-bearing
 * case (an HDRI env map newly bound, a material authored `toneMapped: false`)
 * must STILL recompile. Both directions are pinned here so neither can rot
 * silently.
 *
 * Imports the module DIRECTLY (not via the rendering barrel, which pulls in
 * window-touching modules that throw under the node test env).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { PBRSceneUpgrader } from './PBRSceneUpgrader';

/** A scene of `n` meshes with fresh default MeshStandardMaterials (Phase-5 shape:
 *  toneMapped defaults true, no env map anywhere). */
function makeScene(n: number, mkMat?: (i: number) => THREE.MeshStandardMaterial): {
    scene: THREE.Scene;
    mats: THREE.MeshStandardMaterial[];
} {
    const scene = new THREE.Scene();
    const mats: THREE.MeshStandardMaterial[] = [];
    for (let i = 0; i < n; i++) {
        const mat = mkMat ? mkMat(i) : new THREE.MeshStandardMaterial();
        mats.push(mat);
        scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat));
    }
    return { scene, mats };
}

const versions = (mats: THREE.MeshStandardMaterial[]): number[] => mats.map((m) => m.version);

describe('PBRSceneUpgrader (§PERF-TRAVERSE-RECOMPILE-SCOPE)', () => {
    let upgrader: PBRSceneUpgrader;

    beforeEach(() => {
        upgrader = new PBRSceneUpgrader();
    });

    describe('apply() — recompile only on real program-cache-key change', () => {
        it('Phase-5 shape (no env map, default toneMapped) → ZERO recompiles, tuning still applied', () => {
            // This is the founder's 2026-09-03 boot: real-WebGPU, scene.environment
            // null, tier=cinematic → fullScenePbrTraverse=ON. The armed pass must be
            // uniform writes only.
            const { scene, mats } = makeScene(5);
            const before = versions(mats);

            upgrader.apply(scene);

            expect(versions(mats)).toEqual(before);           // no needsUpdate anywhere
            expect(upgrader.stats.recompiledMaterials).toBe(0);
            expect(upgrader.stats.totalMaterials).toBe(5);
            // The cosmetic upgrade itself still happened (mid-gloss floor 0.5).
            for (const mat of mats) expect(mat.envMapIntensity).toBeGreaterThanOrEqual(0.5);
        });

        it('a material authored toneMapped:false recompiles — and ONLY that one', () => {
            const { scene, mats } = makeScene(3, (i) =>
                new THREE.MeshStandardMaterial({ toneMapped: i !== 1 }));
            const before = versions(mats);

            upgrader.apply(scene);

            expect(mats[1].version).toBe(before[1] + 1);      // the real change recompiles
            expect(mats[1].toneMapped).toBe(true);
            expect(mats[0].version).toBe(before[0]);          // untouched peers do not
            expect(mats[2].version).toBe(before[2]);
            expect(upgrader.stats.recompiledMaterials).toBe(1);
        });

        it('a newly bound env map recompiles (the load-bearing HDRI/IBL case)', () => {
            const { scene, mats } = makeScene(2);
            const envMap = new THREE.Texture();
            const before = versions(mats);

            upgrader.apply(scene, envMap);

            for (let i = 0; i < mats.length; i++) {
                expect(mats[i].envMap).toBe(envMap);
                expect(mats[i].version).toBe(before[i] + 1);
            }
            expect(upgrader.stats.recompiledMaterials).toBe(2);
        });

        it('re-apply with the SAME env map is recompile-free (setHdriPreset same-preset path)', () => {
            const { scene, mats } = makeScene(2);
            const envMap = new THREE.Texture();
            upgrader.apply(scene, envMap);
            const after = versions(mats);

            upgrader.apply(scene, envMap);                    // second pass, identical binding

            expect(versions(mats)).toEqual(after);
            expect(upgrader.stats.recompiledMaterials).toBe(0); // fresh stats per apply()
        });

        it('glass gets its tuning (envMapIntensity 1.5 + roughness floor) without a recompile', () => {
            const { scene, mats } = makeScene(1, () =>
                new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.3, roughness: 0.0 }));
            const before = mats[0].version;

            upgrader.apply(scene);

            expect(mats[0].envMapIntensity).toBe(1.5);
            expect(mats[0].roughness).toBe(0.02);             // mirror-glass floor
            expect(mats[0].version).toBe(before);             // uniforms only — no recompile
            expect(upgrader.stats.glassMaterials).toBe(1);
        });
    });

    describe('upgradeNewMeshes() — the post-batch chunk path (§FIX-POST-BATCH-PBR-CHUNK funnel)', () => {
        it('Phase-5 shape → zero recompiles for a batch of new meshes', () => {
            const { scene } = makeScene(0);
            upgrader.apply(scene);                            // arm applied=true on empty scene (boot)

            const { mats } = makeScene(4);                    // "new" meshes (scene irrelevant here)
            const meshes = mats.map((m) => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m));
            const before = versions(mats);

            upgrader.upgradeNewMeshes(meshes);

            expect(versions(mats)).toEqual(before);
            for (const mat of mats) expect(mat.envMapIntensity).toBeGreaterThanOrEqual(0.5);
            expect(upgrader.stats.recompiledMaterials).toBe(0);
            expect(upgrader.stats.totalMaterials).toBe(4);    // accumulated by the chunk path
        });

        it('an env map newly bound on a chunk still recompiles that chunk', () => {
            const { scene } = makeScene(0);
            upgrader.apply(scene);
            const envMap = new THREE.Texture();

            const mat = new THREE.MeshStandardMaterial();
            const before = mat.version;
            upgrader.upgradeNewMeshes([new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat)], envMap);

            expect(mat.envMap).toBe(envMap);
            expect(mat.version).toBe(before + 1);
        });
    });

    describe('restore() — same changed-only rule in reverse', () => {
        it('after a no-env-map apply, restore is recompile-free', () => {
            const { scene, mats } = makeScene(3);
            upgrader.apply(scene);
            const before = versions(mats);

            upgrader.restore(scene);

            expect(versions(mats)).toEqual(before);
            for (const mat of mats) expect(mat.envMapIntensity).toBe(1); // three default restored
        });

        it('after an env-map apply, restore unbinds AND recompiles (load-bearing unbind)', () => {
            const { scene, mats } = makeScene(2);
            upgrader.apply(scene, new THREE.Texture());
            const before = versions(mats);

            upgrader.restore(scene);

            for (let i = 0; i < mats.length; i++) {
                expect(mats[i].envMap).toBeNull();
                expect(mats[i].version).toBe(before[i] + 1);
            }
        });
    });
});
