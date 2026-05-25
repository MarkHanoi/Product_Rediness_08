/**
 * @file src/core/rendering/InstancedElementRenderer.ts
 *
 * InstancedElementRenderer — Phase 7 GPU Instancing coordinator.
 *
 * Groups elements by a geometry hash so that elements sharing the same
 * geometry (e.g. curtain wall panels of the same size, repeated structural
 * columns) are rendered as a single THREE.InstancedMesh draw call instead of
 * N individual draw calls.
 *
 * ## Usage lifecycle
 *
 *   1.  After a builder computes geometry for an element, call register().
 *       If a compatible InstanceGroup exists, the element is added as an
 *       instance (matrix update only — no new Mesh).
 *       If not, a new InstanceGroup + InstancedMesh is created and added to
 *       the scene.
 *
 *   2.  When an element's transform changes (but geometry is unchanged),
 *       call updateTransform() — O(1) matrix write, no GPU geometry rebuild.
 *
 *   3.  When an element is removed, call unregister() — the instance slot is
 *       zeroed and returned to the free list.
 *
 *   4.  When the scene is cleared (project close), call clear().
 *
 * ## Geometry hash
 *
 * The hash is a lightweight fingerprint:
 *   `{indexCount}_{vertexCount}_{x0}_{y0}_{z0}`
 *
 * Two geometries with the same vertex count, index count, and first vertex
 * position are assumed identical.  This covers the common case (same box
 * dimensions → same geometry) without a full buffer comparison.  Builders
 * that produce intentionally distinct geometries must ensure the first vertex
 * differs (which is automatic for differently-sized boxes).
 *
 * ## SelectionManager integration
 *
 * InstancedMesh does not support per-instance userData.  The standard pattern
 * (used by CurtainWallInstanceManager) is to store `instanceElementIds:
 * string[]` on the mesh's `userData`, keyed by slot index.  SelectionManager
 * can resolve `hit.instanceId` → element ID via that array.  This renderer
 * follows the same pattern: every InstancedMesh created here sets
 *   `mesh.userData.instanceElementIds = instanceGroup._idToSlot` (derived on
 *   each frame from the InstanceGroup's internal map via the exported helper).
 *
 * ## Contract compliance
 *   §01-BIM-ENGINE-CORE-CONTRACT §5 — no store reads or mutations.
 *   §02-BIM-SPATIAL-PROJECTION §8  — projection-layer helper; no semantic state.
 *   §03-BIM-SEMANTIC-MODEL         — geometry only, never read back into stores.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { InstanceGroup, INSTANCE_GROUP_MAX } from './InstanceGroup';

/**
 * A record stored for each registered element so we can find its group on
 * update/remove without a full Map scan.
 */
interface ElementRecord {
    groupKey: string;
    slot: number;
}

export class InstancedElementRenderer {

    private _scene: THREE.Scene | null = null;

    /**
     * geometry-hash → InstanceGroup.
     * One entry per unique geometry shape.
     */
    private _groups: Map<string, InstanceGroup> = new Map();

    /**
     * elementId → { groupKey, slot }
     * Allows O(1) lookup during updateTransform / unregister.
     */
    private _elements: Map<string, ElementRecord> = new Map();

    // ── Scene injection ───────────────────────────────────────────────────────

    /**
     * Inject the Three.js scene.  Must be called once before register().
     */
    setScene(scene: THREE.Scene): void {
        this._scene = scene;
    }

    // ── Core API ──────────────────────────────────────────────────────────────

    /**
     * Register (or update) an element for instanced rendering.
     *
     * If a group for the geometry's hash already exists, the element is added
     * as a new instance (or its matrix updated if already registered).
     * If no group exists, a new InstanceGroup + InstancedMesh is created and
     * added to the scene.
     *
     * @param elementId  Unique BIM element ID.
     * @param geometry   The element's THREE.BufferGeometry.
     * @param material   The element's THREE.Material.
     * @param matrix     World-space transform matrix for this instance.
     */
    register(
        elementId: string,
        geometry: THREE.BufferGeometry,
        material: THREE.Material,
        matrix: THREE.Matrix4,
        levelId?: string,
    ): void {
        const key = this._hashGeometry(geometry, material, levelId);

        // §WALL-AUDIT-2026-W7 (move-revert root cause):
        //
        //   _hashGeometry includes `material.uuid` in the group key. Builders
        //   that allocate a fresh THREE.Material on every rebuild (e.g.
        //   WallFragmentBuilder.buildWall → new MeshStandardMaterial) therefore
        //   produce a DIFFERENT key on every call — even when the wall has not
        //   moved. Without this guard the element is appended to a NEW group
        //   on the new key while the OLD slot in the OLD group is left in place
        //   at the old transform: a phantom wall persists at the pre-move
        //   position. The user perceives this as the wall "reverting" the
        //   moment any subsequent rebuild fires (a new element being added,
        //   a join recompute, an opening insert, etc.).
        //
        //   Fix: if this element is already registered under a DIFFERENT key,
        //   release its old slot first so the move actually reaches the GPU.
        const prev = this._elements.get(elementId);
        if (prev && prev.groupKey !== key) {
            const prevGroup = this._groups.get(prev.groupKey);
            if (prevGroup) {
                prevGroup.removeInstance(elementId);
                if (prevGroup.activeCount === 0) {
                    this._removeGroup(prev.groupKey, prevGroup);
                }
            }
            this._elements.delete(elementId);
        }

        // Ensure the group exists.
        if (!this._groups.has(key)) {
            const group = new InstanceGroup(geometry, material, INSTANCE_GROUP_MAX);
            group.mesh.name = `instanced-group-${key}`;

            // Store instanceElementIds on userData so SelectionManager can
            // map instanceId → elementId via:
            //   mesh.userData.instanceElementIds[hit.instanceId]
            // We expose a live reference; the InstanceGroup._idToSlot map is
            // private, so we provide a slot→id array rebuilt on demand.
            // We use a lazy getter so the array stays in sync.
            group.mesh.userData.getInstanceElementId = (slotIndex: number): string | undefined => {
                for (const [id, record] of this._elements.entries()) {
                    if (record.groupKey === key && record.slot === slotIndex) {
                        return id;
                    }
                }
                return undefined;
            };
            group.mesh.userData.elementType = 'InstancedElement';
            group.mesh.userData.isInstancedGroup = true;
            // §INSTANCED-LEVEL-VIS (2026-05-25) — stamp the group's levelId so the
            // Project Browser's hide-by-level (ProjectVisibilitySection.applyLevelVisibility,
            // which matches `obj.userData.levelId === levelId`) can hide instanced elements.
            // Without this, walls that qualify for GPU instancing (plain: no openings, not
            // curved, no joins) rendered via this InstancedMesh stayed visible when their
            // level was hidden — while curtain walls + non-instanced walls (which stamp
            // levelId on their group) hid correctly. SAFE: the group key
            // (`_hashGeometry(geometry, material, levelId)`) includes levelId, so EVERY
            // instance in this group is on the same level.
            if (levelId !== undefined) group.mesh.userData.levelId = levelId;

            if (this._scene) {
                this._scene.add(group.mesh);
            }
            this._groups.set(key, group);
        }

        const group = this._groups.get(key)!;
        const slot  = group.addInstance(elementId, matrix);

        if (slot >= 0) {
            this._elements.set(elementId, { groupKey: key, slot });
        }
    }

    /**
     * Update the world-space transform of a single instance.
     * Does NOT require a geometry rebuild — the GPU receives only the new
     * matrix, which costs ~4 floats × 16 = 64 bytes of bandwidth.
     *
     * No-op if elementId is not registered.
     */
    updateTransform(elementId: string, matrix: THREE.Matrix4): void {
        const record = this._elements.get(elementId);
        if (!record) return;
        const group = this._groups.get(record.groupKey);
        group?.setMatrix(elementId, matrix);
    }

    /**
     * Remove an element from instanced rendering.
     * The instance slot is zeroed (invisible) and returned to the free list.
     *
     * No-op if elementId is not registered.
     */
    unregister(elementId: string): void {
        const record = this._elements.get(elementId);
        if (!record) return;
        const group = this._groups.get(record.groupKey);
        group?.removeInstance(elementId);
        this._elements.delete(elementId);

        // Remove empty groups to free GPU memory.
        if (group && group.activeCount === 0) {
            this._removeGroup(record.groupKey, group);
        }
    }

    // ── Query ─────────────────────────────────────────────────────────────────

    /** Returns true if elementId is currently registered for instanced rendering. */
    isRegistered(elementId: string): boolean {
        return this._elements.has(elementId);
    }

    /** Total number of elements registered across all groups. */
    get totalInstances(): number {
        return this._elements.size;
    }

    /** Number of InstanceGroups (= distinct geometry types). */
    get groupCount(): number {
        return this._groups.size;
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /**
     * Remove all groups and dispose all GPU resources.
     * Call on project close to prevent memory leaks.
     */
    clear(): void {
        for (const [key, group] of this._groups.entries()) {
            this._removeGroup(key, group);
        }
        this._elements.clear();
        console.log('[InstancedElementRenderer] cleared');
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    /**
     * Remove a single group from the scene and dispose it.
     */
    private _removeGroup(key: string, group: InstanceGroup): void {
        if (this._scene) {
            this._scene.remove(group.mesh);
        }
        group.dispose();
        this._groups.delete(key);
    }

    /**
     * Compute a lightweight geometry+material fingerprint.
     *
     * Key format: `{indexCount}_{vertexCount}_{x0.3f}_{y0.3f}_{z0.3f}_{materialUuid}`
     *
     * Two geometries are assumed identical when they share the same vertex count,
     * index count, and first-vertex position — this is correct for all standard
     * box / cylinder / extrusion primitives of the same dimensions.
     *
     * Including the material UUID prevents cross-type collisions (e.g. a 1×1×1
     * glass box and a 1×1×1 frame box with different materials get separate groups).
     */
    private _hashGeometry(
        geometry: THREE.BufferGeometry,
        material: THREE.Material,
        levelId = 'default',
    ): string {
        const pos   = geometry.attributes.position;
        const idxCt = geometry.index?.count ?? 0;
        const vtxCt = pos?.count ?? 0;
        const x0    = pos ? pos.getX(0).toFixed(3) : '0';
        const y0    = pos ? pos.getY(0).toFixed(3) : '0';
        const z0    = pos ? pos.getZ(0).toFixed(3) : '0';
        return `${levelId}_${idxCt}_${vtxCt}_${x0}_${y0}_${z0}_${material.uuid}`;
    }
}

/** Module-level singleton — injected into EngineBootstrap and available as window.__instancedElementRenderer. */
export const instancedElementRenderer = new InstancedElementRenderer();
