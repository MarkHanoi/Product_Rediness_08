/**
 * @file src/core/rendering/PBRSceneUpgrader.ts
 * @description Phase 1 — Full PBR material enforcement for the Three.js
 *   scene projection layer (Enscape + V-Ray benchmark target).
 *
 * CONTRACT (01-BIM-ENGINE-CORE-CONTRACT §4.3, §5):
 *  - NEVER mutates any ElementStore, WallStore, SlabStore, or any semantic
 *    state. Only the THREE.js projection layer is modified.
 *  - Materials are not replaced — only their PBR parameters are adjusted so
 *    the rendered output is physically plausible.
 *  - All changes are reversible via restore(). Original parameter snapshots
 *    are stored per-material UUID.
 *  - Does NOT import @thatopen/* packages.
 *
 * Gap addressed (Audit Section 2.4 — Materials):
 *   "Basic materials ❌ / Partial PBR ⚠️ / Full PBR ✅"
 *   The BIM authoring viewport uses MeshStandardMaterial throughout, but
 *   envMapIntensity is typically 0, clearcoat is unused, and roughness /
 *   metalness are not tuned for energy conservation in the context of HDRI
 *   lighting. This service traverses the scene and enforces physically-
 *   correct PBR defaults without replacing any material.
 *
 * PBR parameter strategy:
 *   - Metals   (metalness > 0.7): raise envMapIntensity to 1.2–1.5
 *   - Glass    (transparent, opacity < 0.4): apply IOR-based roughness floor
 *   - Rough    (roughness > 0.7, metalness < 0.1): moderate envMapIntensity
 *   - Mid-gloss (roughness 0.2–0.7): standard envMapIntensity 0.5
 *   - Polished (roughness < 0.2, not metal): envMapIntensity 0.8
 */

import * as THREE from '@pryzm/renderer-three/three';
// §PRYZM-PERF (INSTR1) — this pass has a RECORDED 38.7 s wall-clock on a real
// 4073-mesh building (RenderingPipelineCoordinator.ts:852, ADR-0076), which makes
// it the single largest named cost in the product — and nothing timed it at the
// point of use, so it could never be separated from the rest of a batch.
// §PERF-TRAVERSE-RECOMPILE-SCOPE (2026-09-03) — that recording is of the 2026-05
// unconditional-needsUpdate pass; see _tuneMaterial for why the cost was the PSO
// recompiles, not the traverse, and why `needsUpdate` is now changed-only.
import { bumpPerf, addPerfTime, isPerfOn, PERF_KEYS } from '@pryzm/frame-scheduler';

// ── Types ──────────────────────────────────────────────────────────────────

interface MaterialSnapshot {
    uuid:             string;
    envMapIntensity:  number;
    roughness:        number;
    metalness:        number;
    toneMapped:       boolean;
}

export interface PBRUpgradeStats {
    totalMeshes:       number;
    totalMaterials:    number;
    metalMaterials:    number;
    glassMaterials:    number;
    roughMaterials:    number;
    polishedMaterials: number;
    /**
     * §PERF-TRAVERSE-RECOMPILE-SCOPE (2026-09-03) — materials that were actually
     * marked `needsUpdate = true` this pass (env-map binding changed or `toneMapped`
     * flipped). Every other touched material received uniform-level writes only, which
     * cost no shader/PSO recompile. The 38.7 s the header cites was never the
     * traverse — it was 4073 materials × unconditional `needsUpdate` × WebGPU PSO
     * recompile. This counter is what makes "the pass ran but recompiled nothing"
     * a fact in the log rather than an inference.
     */
    recompiledMaterials: number;
}

// ── Class ─────────────────────────────────────────────────────────────────

export class PBRSceneUpgrader {
    private _snapshots = new Map<string, MaterialSnapshot>();
    private _isApplied = false;
    private _stats: PBRUpgradeStats = {
        totalMeshes: 0, totalMaterials: 0,
        metalMaterials: 0, glassMaterials: 0,
        roughMaterials: 0, polishedMaterials: 0,
        recompiledMaterials: 0,
    };

    /**
     * §PERF-TRAVERSE-RECOMPILE-SCOPE (lane PERF-TRAVERSE, 2026-09-03) — apply the
     * category tuning to one material, marking `needsUpdate` ONLY when a
     * PROGRAM-CACHE-KEY property actually changed.
     *
     * WHY: `needsUpdate = true` bumps `material.version`, which forces a full shader
     * program (WebGL) / PSO (WebGPU) rebuild. The recorded 38.7 s (4073-mesh building,
     * ADR-0076) was exactly this: every MeshStandardMaterial in the scene marked dirty
     * unconditionally, then trickling through per-material recompiles. But of the five
     * properties this pass writes, only TWO are program-cache keys in three:
     *   - `envMap` binding (presence/identity — changes the lighting node graph),
     *   - `toneMapped` (part of the output/tonemapping program key).
     * `envMapIntensity`, `roughness`, `metalness` are per-frame UNIFORMS — writing them
     * costs no recompile and needs no `needsUpdate`.
     *
     * On the Phase-5 real-WebGPU path (PascalSceneLighting; `scene.environment = null`,
     * no per-material envMap ever passed) and with three's `toneMapped` default of
     * `true`, this makes the whole armed cinematic pass RECOMPILE-FREE: uniform writes
     * only, ~ms even if the scene were at the 1500-mesh cinematic ceiling. The
     * load-bearing case — an HDRI env map newly bound or a material authored with
     * `toneMapped = false` — still recompiles, exactly as it must.
     * (Scene-level `scene.environment` changes need no help from this pass: both
     * renderers detect a materialProperties/render-object cache-key change themselves.)
     *
     * Returns true when the material was marked for recompile.
     */
    private _tuneMaterial(
        mat: THREE.MeshStandardMaterial,
        envMap: THREE.Texture | null | undefined,
        stats: PBRUpgradeStats,
    ): boolean {
        // Apply HDRI env map if provided — a program-cache-key change ONLY when the
        // binding actually changes identity (null→tex, or a different texture).
        let pipelineDirty = false;
        if (envMap && mat.envMap !== envMap) {
            mat.envMap = envMap;
            pipelineDirty = true;
        }

        // ── Category-based PBR upgrade (uniform-level writes) ──────────────
        const isGlass    = mat.transparent && mat.opacity < 0.5;
        const isMetal    = mat.metalness > 0.7;
        const isRough    = mat.roughness > 0.7 && !isMetal;
        const isPolished = mat.roughness < 0.2 && !isMetal;

        if (isGlass) {
            // Glass: IOR-correct minimum roughness + high env reflection
            mat.envMapIntensity = 1.5;
            if (mat.roughness < 0.02) mat.roughness = 0.02; // Avoid perfect mirror glass
            stats.glassMaterials++;
        } else if (isMetal) {
            // Metals: high env intensity for sharp reflections
            mat.envMapIntensity = Math.max(mat.envMapIntensity, 1.2);
            stats.metalMaterials++;
        } else if (isRough) {
            // Rough dielectrics (concrete, plaster, fabric): moderate env
            mat.envMapIntensity = Math.max(mat.envMapIntensity, 0.3);
            stats.roughMaterials++;
        } else if (isPolished) {
            // Polished dielectrics (marble, polished wood): decent env
            mat.envMapIntensity = Math.max(mat.envMapIntensity, 0.8);
            stats.polishedMaterials++;
        } else {
            // Mid-gloss: balanced env intensity
            mat.envMapIntensity = Math.max(mat.envMapIntensity, 0.5);
        }

        // toneMapped is a program-cache key — flip (and recompile) only when it is
        // actually false. three's MeshStandardMaterial default is true, so on
        // unexceptional scenes this never dirties anything.
        if (!mat.toneMapped) {
            mat.toneMapped = true;
            pipelineDirty = true;
        }

        if (pipelineDirty) {
            mat.needsUpdate = true;
            stats.recompiledMaterials++;
        }
        return pipelineDirty;
    }

    get applied(): boolean  { return this._isApplied; }
    get stats(): PBRUpgradeStats { return { ...this._stats }; }

    /**
     * Traverses the scene and upgrades all MeshStandardMaterial instances
     * to physically-correct PBR parameters.
     *
     * Call restore() to undo all changes.
     *
     * @param scene  - Main THREE.Scene (projection layer only)
     * @param envMap - Optional: an HDRI-derived env map to set on all materials
     *                 (pass scene.environment after applying HDRI)
     */
    apply(scene: THREE.Scene, envMap?: THREE.Texture | null): void {
        // §PRYZM-PERF (INSTR1) — the 38.7 s pass, timed at the point of use.
        // `isPerfOn()` is read ONCE here rather than per-traversed-node: this method
        // walks the whole scene, so a per-node flag check would be the one place the
        // instrument could plausibly show up in its own measurement.
        const _perfOn = isPerfOn();
        const _t0 = _perfOn ? performance.now() : 0;
        bumpPerf(PERF_KEYS.TRAVERSE_PBR_UPGRADER);

        const stats: PBRUpgradeStats = {
            totalMeshes: 0, totalMaterials: 0,
            metalMaterials: 0, glassMaterials: 0,
            roughMaterials: 0, polishedMaterials: 0,
            recompiledMaterials: 0,
        };

        const visited = new Set<string>();

        scene.traverse((obj) => {
            if (!(obj instanceof THREE.Mesh)) return;
            stats.totalMeshes++;

            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];

            for (const mat of mats) {
                if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
                if (visited.has(mat.uuid)) continue;
                visited.add(mat.uuid);

                stats.totalMaterials++;

                // Snapshot original values for restore()
                if (!this._snapshots.has(mat.uuid)) {
                    this._snapshots.set(mat.uuid, {
                        uuid:            mat.uuid,
                        envMapIntensity: mat.envMapIntensity,
                        roughness:       mat.roughness,
                        metalness:       mat.metalness,
                        toneMapped:      mat.toneMapped,
                    });
                }

                // §PERF-TRAVERSE-RECOMPILE-SCOPE — uniform-level tuning always; a
                // needsUpdate recompile ONLY when env-map binding / toneMapped
                // actually changed (see _tuneMaterial for why that is sufficient).
                this._tuneMaterial(mat, envMap, stats);
            }
        });

        this._stats     = stats;
        this._isApplied = true;

        if (_perfOn) addPerfTime(PERF_KEYS.PHASE_PBR_UPGRADE, performance.now() - _t0);

        console.log(
            `[PBRSceneUpgrader] Applied — meshes: ${stats.totalMeshes}` +
            ` materials: ${stats.totalMaterials}` +
            ` recompiles: ${stats.recompiledMaterials}` +
            ` (metal: ${stats.metalMaterials}, glass: ${stats.glassMaterials}` +
            ` rough: ${stats.roughMaterials}, polished: ${stats.polishedMaterials})` +
            ` §PERF-TRAVERSE-RECOMPILE-SCOPE`
        );
    }

    /**
     * Restores all materials to the parameter state before apply() was called.
     * Safe to call even if apply() was never called.
     */
    restore(scene: THREE.Scene): void {
        if (!this._isApplied) return;

        // The restore walk is a SECOND full traversal of the same scene — counted
        // under the same key so the report's traversal total is the true walk count.
        bumpPerf(PERF_KEYS.TRAVERSE_PBR_UPGRADER);

        const visited = new Set<string>();

        scene.traverse((obj) => {
            if (!(obj instanceof THREE.Mesh)) return;

            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (const mat of mats) {
                if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
                if (visited.has(mat.uuid)) continue;
                visited.add(mat.uuid);

                const snap = this._snapshots.get(mat.uuid);
                if (!snap) continue;

                // §PERF-TRAVERSE-RECOMPILE-SCOPE — mirror of _tuneMaterial: the three
                // scalar restores are uniform-level; only an actual envMap unbind or a
                // toneMapped flip is a program-cache-key change worth a recompile.
                mat.envMapIntensity = snap.envMapIntensity;
                mat.roughness       = snap.roughness;
                mat.metalness       = snap.metalness;
                let pipelineDirty = false;
                if (mat.toneMapped !== snap.toneMapped) {
                    mat.toneMapped = snap.toneMapped;
                    pipelineDirty = true;
                }
                if (mat.envMap !== null) {
                    mat.envMap = null;
                    pipelineDirty = true;
                }
                if (pipelineDirty) mat.needsUpdate = true;
            }
        });

        this._snapshots.clear();
        this._isApplied = false;

        console.log('[PBRSceneUpgrader] Materials restored to pre-upgrade state.');
    }

    /**
     * Re-applies PBR upgrade to newly added meshes (incremental update).
     * Call this after the DependencyResolver adds new geometry to the scene.
     *
     * @param meshes - Array of new Mesh objects to upgrade
     * @param envMap - Current HDRI env map (if active)
     */
    upgradeNewMeshes(meshes: THREE.Mesh[], envMap?: THREE.Texture | null): void {
        if (!this._isApplied) return;

        for (const mesh of meshes) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of mats) {
                if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
                if (this._snapshots.has(mat.uuid)) continue; // Already upgraded

                // Snapshot
                this._snapshots.set(mat.uuid, {
                    uuid:            mat.uuid,
                    envMapIntensity: mat.envMapIntensity,
                    roughness:       mat.roughness,
                    metalness:       mat.metalness,
                    toneMapped:      mat.toneMapped,
                });

                // §PERF-TRAVERSE-RECOMPILE-SCOPE — same changed-only recompile rule as
                // apply(): this is the path every post-batch chunk funnels through
                // (initScene §FIX-POST-BATCH-PBR-CHUNK), so it is where the per-chunk
                // "needsUpdate → PSO recompile" trickle is actually cut. Category
                // counters accumulate into _stats so the running totals stay honest.
                this._tuneMaterial(mat, envMap, this._stats);
                this._stats.totalMaterials++;
            }
        }
    }

    dispose(): void {
        this._snapshots.clear();
        this._isApplied = false;
    }
}
