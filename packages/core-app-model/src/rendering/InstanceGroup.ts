/**
 * @file src/core/rendering/InstanceGroup.ts
 *
 * InstanceGroup — Phase 7 GPU Instancing.
 *
 * Wraps a single THREE.InstancedMesh and manages the per-instance ID→slot
 * mapping.  All instances in a group share the same base geometry and material.
 *
 * ## Design contract
 *   • One InstanceGroup per distinct (geometry-hash, material-uuid) pair.
 *   • addInstance()    → O(1) matrix write + needsUpdate flag.
 *   • setMatrix()      → O(1) direct matrix write.
 *   • removeInstance() → O(1) zero-scale matrix (soft-delete; slot is reused
 *                        on the next addInstance() call to that elementId).
 *   • dispose()        → frees GPU geometry + material; caller removes mesh
 *                        from scene before calling.
 *
 * ## Thread safety
 *   Main thread only.  No async operations.
 *
 * ## Contract compliance
 *   §01-BIM-ENGINE-CORE-CONTRACT §5 — no store reads or mutations.
 *   §02-BIM-SPATIAL-PROJECTION §8  — projection-layer helper; no semantic state.
 *   §03-BIM-SEMANTIC-MODEL         — geometry only, never read back into stores.
 */

import * as THREE from '@pryzm/renderer-three/three';

/**
 * Maximum number of instances per InstanceGroup.
 * This is a preallocated GPU buffer size — actual instance count can be lower.
 * Increase if projects exceed this per geometry type.
 */
export const INSTANCE_GROUP_MAX = 512;

/**
 * A zero-scale matrix used to "park" an inactive (removed) instance slot
 * without actually resizing the InstancedMesh buffer.  The GPU skips
 * degenerate triangles produced by a zero-scale transform, so this is
 * effectively invisible at no extra fill-rate cost.
 */
const ZERO_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

export class InstanceGroup {

    /** The underlying GPU-instanced mesh, added to the scene by the caller. */
    readonly mesh: THREE.InstancedMesh;

    /** elementId → instance slot index */
    private _idToSlot: Map<string, number> = new Map();

    /** Slots that have been freed (soft-deleted) and can be reused. */
    private _freeSlots: number[] = [];

    /** Next slot to allocate when _freeSlots is empty. */
    private _nextSlot: number = 0;

    constructor(
        geometry: THREE.BufferGeometry,
        material: THREE.Material,
        maxInstances: number = INSTANCE_GROUP_MAX,
    ) {
        this.mesh = new THREE.InstancedMesh(geometry, material, maxInstances);
        this.mesh.count = 0;
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.castShadow    = true;
        this.mesh.receiveShadow = true;

        // Park all slots at zero scale so uninitialized slots are invisible.
        for (let i = 0; i < maxInstances; i++) {
            this.mesh.setMatrixAt(i, ZERO_MATRIX);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    // ── Instance management ───────────────────────────────────────────────────

    /**
     * Add (or replace) an instance for the given elementId.
     *
     * If the elementId already has a slot, the matrix is updated in-place
     * (idempotent — safe to call on every builder rebuild).
     * If no slot exists, the next free slot is allocated.
     *
     * Returns the slot index, or -1 if the group is full.
     */
    addInstance(elementId: string, matrix: THREE.Matrix4): number {
        // Update existing slot (idempotent path).
        const existing = this._idToSlot.get(elementId);
        if (existing !== undefined) {
            this.mesh.setMatrixAt(existing, matrix);
            this.mesh.instanceMatrix.needsUpdate = true;
            return existing;
        }

        // Allocate a new slot.
        let slot: number;
        if (this._freeSlots.length > 0) {
            slot = this._freeSlots.pop()!;
        } else {
            if (this._nextSlot >= this.mesh.instanceMatrix.count) {
                console.warn(
                    `[InstanceGroup] Group full (max ${this.mesh.instanceMatrix.count} instances).` +
                    ` Element "${elementId}" will not be instanced.`
                );
                return -1;
            }
            slot = this._nextSlot++;
        }

        this._idToSlot.set(elementId, slot);
        this.mesh.setMatrixAt(slot, matrix);

        // Keep mesh.count = highest occupied slot + 1 so THREE renders all
        // allocated instances.  This is a monotonic high-water mark.
        this.mesh.count = Math.max(this.mesh.count, slot + 1);
        this.mesh.instanceMatrix.needsUpdate = true;

        return slot;
    }

    /**
     * Update the transform of an existing instance.
     * No-op if the elementId has no registered slot.
     */
    setMatrix(elementId: string, matrix: THREE.Matrix4): void {
        const slot = this._idToSlot.get(elementId);
        if (slot === undefined) return;
        this.mesh.setMatrixAt(slot, matrix);
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    /**
     * Soft-delete an instance by zeroing its transform matrix.
     * The slot is returned to the free list for reuse.
     */
    removeInstance(elementId: string): void {
        const slot = this._idToSlot.get(elementId);
        if (slot === undefined) return;
        this.mesh.setMatrixAt(slot, ZERO_MATRIX);
        this.mesh.instanceMatrix.needsUpdate = true;
        this._idToSlot.delete(elementId);
        this._freeSlots.push(slot);
    }

    // ── Query ─────────────────────────────────────────────────────────────────

    /** Returns true if this group has a registered slot for the element. */
    hasInstance(elementId: string): boolean {
        return this._idToSlot.has(elementId);
    }

    /** Number of currently active (non-freed) instances. */
    get activeCount(): number {
        return this._idToSlot.size;
    }

    /** Total number of slots ever allocated (including freed ones). */
    get allocatedSlots(): number {
        return this._nextSlot;
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /**
     * Dispose the geometry and material held by the InstancedMesh.
     * IMPORTANT: remove the mesh from the scene BEFORE calling dispose().
     *
     * Note: Material is NOT disposed here — it may be shared with other
     * InstanceGroups.  Callers are responsible for material disposal.
     */
    dispose(): void {
        this.mesh.geometry.dispose();
        this._idToSlot.clear();
        this._freeSlots.length = 0;
        this._nextSlot = 0;
    }
}
