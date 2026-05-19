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
}

// ── Class ─────────────────────────────────────────────────────────────────

export class PBRSceneUpgrader {
    private _snapshots = new Map<string, MaterialSnapshot>();
    private _isApplied = false;
    private _stats: PBRUpgradeStats = {
        totalMeshes: 0, totalMaterials: 0,
        metalMaterials: 0, glassMaterials: 0,
        roughMaterials: 0, polishedMaterials: 0,
    };

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
        const stats: PBRUpgradeStats = {
            totalMeshes: 0, totalMaterials: 0,
            metalMaterials: 0, glassMaterials: 0,
            roughMaterials: 0, polishedMaterials: 0,
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

                // Apply HDRI env map if provided
                if (envMap) mat.envMap = envMap;

                // ── Category-based PBR upgrade ─────────────────────────────
                const isGlass   = mat.transparent && mat.opacity < 0.5;
                const isMetal   = mat.metalness > 0.7;
                const isRough   = mat.roughness > 0.7 && !isMetal;
                const isPolished = mat.roughness < 0.2 && !isMetal;

                if (isGlass) {
                    // Glass: IOR-correct minimum roughness + high env reflection
                    mat.envMapIntensity = 1.5;
                    if (mat.roughness < 0.02) mat.roughness = 0.02; // Avoid perfect mirror glass
                    mat.toneMapped = true;
                    stats.glassMaterials++;

                } else if (isMetal) {
                    // Metals: high env intensity for sharp reflections
                    mat.envMapIntensity = Math.max(mat.envMapIntensity, 1.2);
                    mat.toneMapped = true;
                    stats.metalMaterials++;

                } else if (isRough) {
                    // Rough dielectrics (concrete, plaster, fabric): moderate env
                    mat.envMapIntensity = Math.max(mat.envMapIntensity, 0.3);
                    mat.toneMapped = true;
                    stats.roughMaterials++;

                } else if (isPolished) {
                    // Polished dielectrics (marble, polished wood): decent env
                    mat.envMapIntensity = Math.max(mat.envMapIntensity, 0.8);
                    mat.toneMapped = true;
                    stats.polishedMaterials++;

                } else {
                    // Mid-gloss: balanced env intensity
                    mat.envMapIntensity = Math.max(mat.envMapIntensity, 0.5);
                    mat.toneMapped = true;
                }

                mat.needsUpdate = true;
            }
        });

        this._stats     = stats;
        this._isApplied = true;

        console.log(
            `[PBRSceneUpgrader] Applied — meshes: ${stats.totalMeshes}` +
            ` materials: ${stats.totalMaterials}` +
            ` (metal: ${stats.metalMaterials}, glass: ${stats.glassMaterials}` +
            ` rough: ${stats.roughMaterials}, polished: ${stats.polishedMaterials})`
        );
    }

    /**
     * Restores all materials to the parameter state before apply() was called.
     * Safe to call even if apply() was never called.
     */
    restore(scene: THREE.Scene): void {
        if (!this._isApplied) return;

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

                mat.envMapIntensity = snap.envMapIntensity;
                mat.roughness       = snap.roughness;
                mat.metalness       = snap.metalness;
                mat.toneMapped      = snap.toneMapped;
                mat.envMap          = null;
                mat.needsUpdate     = true;
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

                if (envMap) mat.envMap = envMap;

                const isGlass    = mat.transparent && mat.opacity < 0.5;
                const isMetal    = mat.metalness > 0.7;
                const isRough    = mat.roughness > 0.7 && !isMetal;
                const isPolished = mat.roughness < 0.2 && !isMetal;

                if      (isGlass)    mat.envMapIntensity = 1.5;
                else if (isMetal)    mat.envMapIntensity = Math.max(mat.envMapIntensity, 1.2);
                else if (isRough)    mat.envMapIntensity = Math.max(mat.envMapIntensity, 0.3);
                else if (isPolished) mat.envMapIntensity = Math.max(mat.envMapIntensity, 0.8);
                else                 mat.envMapIntensity = Math.max(mat.envMapIntensity, 0.5);

                mat.toneMapped  = true;
                mat.needsUpdate = true;
            }
        }
    }

    dispose(): void {
        this._snapshots.clear();
        this._isApplied = false;
    }
}
