/**
 * @file src/core/rendering/ClearcoatMaterialUpgrader.ts
 * @description Phase 1 — MeshPhysicalMaterial clearcoat / SSS upgrade.
 *
 * CONTRACT (01-BIM-ENGINE-CORE-CONTRACT §4.3, §5):
 *  - NEVER mutates ElementStore or semantic model state.
 *  - Operates exclusively on Three.js Mesh.material (projection layer).
 *  - Saves original materials per mesh slot; fully restores on restore().
 *  - Does NOT import @thatopen/* packages.
 *
 * Upgrade criteria (material classification):
 *  - METAL   (metalness ≥ 0.7)            → clearcoat 0.3, clearcoatRoughness 0.2
 *  - GLASS   (transparent, opacity < 0.5) → transmission 0.95, ior 1.52, thickness 0.5
 *  - POLISHED (roughness ≤ 0.18, non-metal, non-glass) → clearcoat 0.6, clearcoatRoughness 0.1
 *
 * Material sharing:
 *  - Multiple meshes can share the same THREE.Material instance.
 *  - We create one MeshPhysicalMaterial per unique original-material UUID to
 *    avoid redundant allocations while correctly replacing across all sharing meshes.
 *
 * Restore:
 *  - Reinstates the original material reference in every mesh slot that was upgraded.
 *  - Disposes each upgraded MeshPhysicalMaterial exactly once.
 */

import * as THREE from '@pryzm/renderer-three/three';

// ── Types ──────────────────────────────────────────────────────────────────

interface UpgradedSlot {
    mesh:             THREE.Mesh;
    slotIndex:        number;   // -1 = single material, ≥0 = array index
    originalMaterial: THREE.MeshStandardMaterial;
    upgradedMaterial: THREE.MeshPhysicalMaterial;
}

type MaterialCategory = 'metal' | 'glass' | 'polished' | 'none';

// ── Class ──────────────────────────────────────────────────────────────────

export class ClearcoatMaterialUpgrader {
    private _upgrades: UpgradedSlot[] = [];
    private _applied:  boolean         = false;

    // ── Getters ─────────────────────────────────────────────────────────────

    get applied(): boolean    { return this._applied; }
    get upgradeCount(): number { return this._upgrades.length; }

    // ── Public API ───────────────────────────────────────────────────────────

    /**
     * Walks the scene and upgrades eligible MeshStandardMaterial instances to
     * MeshPhysicalMaterial with clearcoat, transmission, or SSS properties.
     *
     * Idempotent: calling apply() a second time without restore() is a no-op.
     *
     * @param scene - Projection-layer THREE.Scene (never an OBC Entity or IFC model)
     */
    apply(scene: THREE.Scene): void {
        if (this._applied) return;

        // originalUUID → upgraded MeshPhysicalMaterial (shared upgrade instance)
        const upgradeCache = new Map<string, THREE.MeshPhysicalMaterial>();
        let count = 0;

        scene.traverse((obj) => {
            if (!(obj instanceof THREE.Mesh)) return;

            const mesh = obj as THREE.Mesh;

            if (Array.isArray(mesh.material)) {
                mesh.material.forEach((mat, idx) => {
                    if (mat instanceof THREE.MeshStandardMaterial) {
                        this._processSlot(mesh, mat, idx, upgradeCache) && count++;
                    }
                });
            } else if (mesh.material instanceof THREE.MeshStandardMaterial) {
                this._processSlot(mesh, mesh.material as THREE.MeshStandardMaterial, -1, upgradeCache) && count++;
            }
        });

        this._applied = true;
        console.log(
            '[ClearcoatMaterialUpgrader] Applied — upgraded',
            count, 'material slots /',
            upgradeCache.size, 'unique materials.',
        );
    }

    /**
     * Restores every mesh slot to its original MeshStandardMaterial.
     * Disposes the upgraded MeshPhysicalMaterial instances.
     */
    restore(): void {
        if (!this._applied) return;

        // Restore originals
        for (const u of this._upgrades) {
            if (!u.mesh) continue;
            if (u.slotIndex === -1) {
                u.mesh.material = u.originalMaterial;
            } else {
                (u.mesh.material as THREE.Material[])[u.slotIndex] = u.originalMaterial;
            }
        }

        // Dispose upgraded materials exactly once per UUID
        const disposed = new Set<string>();
        for (const u of this._upgrades) {
            if (!disposed.has(u.upgradedMaterial.uuid)) {
                u.upgradedMaterial.dispose();
                disposed.add(u.upgradedMaterial.uuid);
            }
        }

        this._upgrades = [];
        this._applied  = false;
        console.log('[ClearcoatMaterialUpgrader] Restored original materials.');
    }

    dispose(): void {
        this.restore();
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private _processSlot(
        mesh:          THREE.Mesh,
        stdMat:        THREE.MeshStandardMaterial,
        slotIndex:     number,
        upgradeCache:  Map<string, THREE.MeshPhysicalMaterial>,
    ): boolean {
        // Skip if already a MeshPhysicalMaterial (nothing to do)
        if (stdMat instanceof THREE.MeshPhysicalMaterial) return false;

        const category = this._classify(stdMat);
        if (category === 'none') return false;

        let upgraded = upgradeCache.get(stdMat.uuid);
        if (!upgraded) {
            upgraded = this._buildPhysical(stdMat, category);
            upgradeCache.set(stdMat.uuid, upgraded);
        }

        // Replace material reference on the mesh
        if (slotIndex === -1) {
            mesh.material = upgraded;
        } else {
            (mesh.material as THREE.Material[])[slotIndex] = upgraded;
        }

        this._upgrades.push({
            mesh,
            slotIndex,
            originalMaterial: stdMat,
            upgradedMaterial:  upgraded,
        });

        return true;
    }

    private _classify(mat: THREE.MeshStandardMaterial): MaterialCategory {
        if (mat.metalness >= 0.7) return 'metal';
        if (mat.transparent && mat.opacity < 0.5) return 'glass';
        if (mat.roughness <= 0.18 && !mat.transparent) return 'polished';
        return 'none';
    }

    private _buildPhysical(
        src:      THREE.MeshStandardMaterial,
        category: MaterialCategory,
    ): THREE.MeshPhysicalMaterial {
        const base: THREE.MeshPhysicalMaterialParameters = {
            // ── Copy all MeshStandardMaterial properties ──
            color:               src.color.clone(),
            map:                 src.map,
            roughness:           src.roughness,
            metalness:           src.metalness,
            roughnessMap:        src.roughnessMap,
            metalnessMap:        src.metalnessMap,
            envMap:              src.envMap,
            envMapIntensity:     src.envMapIntensity,
            transparent:         src.transparent,
            opacity:             src.opacity,
            alphaTest:           src.alphaTest,
            side:                src.side,
            depthTest:           src.depthTest,
            depthWrite:          src.depthWrite,
            normalMap:           src.normalMap,
            normalScale:         src.normalScale?.clone(),
            aoMap:               src.aoMap,
            aoMapIntensity:      src.aoMapIntensity,
            emissive:            src.emissive.clone(),
            emissiveMap:         src.emissiveMap,
            emissiveIntensity:   src.emissiveIntensity,
            lightMap:            src.lightMap,
            lightMapIntensity:   src.lightMapIntensity,
            displacementMap:     src.displacementMap,
            displacementScale:   src.displacementScale,
            displacementBias:    src.displacementBias,
            alphaMap:            src.alphaMap,
            wireframe:           src.wireframe,
            flatShading:         src.flatShading,
            vertexColors:        src.vertexColors,
        };

        // ── Apply category-specific physical properties ──
        switch (category) {
            case 'metal':
                base.clearcoat          = 0.3;
                base.clearcoatRoughness = 0.2;
                break;

            case 'glass':
                base.transmission = 0.95;
                base.ior          = 1.52;
                base.thickness    = 0.5;
                base.roughness    = Math.max(src.roughness, 0.02);
                // Glass must be transparent
                base.transparent  = true;
                base.opacity      = src.opacity < 0.01 ? 0.01 : src.opacity;
                break;

            case 'polished':
                base.clearcoat          = 0.6;
                base.clearcoatRoughness = 0.1;
                break;
        }

        return new THREE.MeshPhysicalMaterial(base);
    }
}
