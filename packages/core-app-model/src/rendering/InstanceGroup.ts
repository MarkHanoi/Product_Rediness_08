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
import { scheduleGpuRelease } from '@pryzm/renderer-three';

/**
 * Number of instance slots preallocated per InstanceGroup.
 *
 * ── §INSTANCE-GROUP-SPILL (L-1400) — WHAT THIS NUMBER IS, MEASURED ──────────
 * ⚠ It is **NOT** a GPU, driver or `THREE.InstancedMesh` limit. THREE stores the
 * per-instance matrices in an `InstancedBufferAttribute` whose only ceiling is
 * memory (tens of thousands of instances is routine), and WebGL2/WebGPU impose
 * no 512 on instance counts. **512 is an arbitrary constant** — its own doc
 * comment said *"Increase if projects exceed this per geometry type"*, which is
 * the tell: a real hardware limit is not something you raise.
 *
 * It is now a **SHARD SIZE, not a cap.** `InstancedElementRenderer` allocates a
 * further shard on the same (geometry × material × level) key when this one
 * fills, so the group's capacity is unbounded and the cost of exceeding 512 is
 * ONE extra draw call, not a lost element. Raising the literal was deliberately
 * NOT the fix: it moves the cliff, it does not remove it.
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

    /**
     * §INSTANCE-GROUP-SPILL (L-1400) — how many addInstance() calls this group has
     * had to refuse because every slot was taken. Kept so the number survives the
     * removal of the per-element `console.warn`; the renderer turns it into one
     * aggregated line rather than N.
     */
    private _refusedCount: number = 0;

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
                // §INSTANCE-GROUP-SPILL (L-1400). This USED to `console.warn` once per
                // refused element — the founder's load log carried 488 of these for a
                // 100-window storey (measured), each with its own stack frame, and the
                // flood is what hid the finding. It is now a SILENT, EXPECTED return:
                // `InstancedElementRenderer.register()` answers -1 by allocating another
                // shard on the same key, so a full group is normal control flow, not a
                // fault. The honest one-line report ("group X spilled to N shards") is
                // emitted by the renderer, ONCE PER SHARD, not once per element.
                //
                // ⛔ Do not reinstate a per-element log here: a refusal that the caller
                // handles is not a defect, and `refusedCount` below keeps the number
                // available to anyone who is actually diagnosing.
                this._refusedCount++;
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

    /** Total slot capacity of the underlying InstancedMesh (the shard size). */
    get capacity(): number {
        return this.mesh.instanceMatrix.count;
    }

    /** True when every slot is taken and the next addInstance() would be refused. */
    get isFull(): boolean {
        return this._freeSlots.length === 0 && this._nextSlot >= this.mesh.instanceMatrix.count;
    }

    /**
     * §INSTANCE-GROUP-SPILL (L-1400) — refusals seen by THIS group. Non-zero is
     * normal once the renderer is spilling; it is the count of instances that were
     * handed on to a sibling shard, NOT a count of lost elements.
     */
    get refusedCount(): number {
        return this._refusedCount;
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /**
     * Release the geometry held by the InstancedMesh.
     * IMPORTANT: remove the mesh from the scene BEFORE calling dispose().
     *
     * Note: Material is NOT disposed here — it may be shared with other
     * InstanceGroups.  Callers are responsible for material disposal.
     *
     * ── §GPU-RESOURCE-LIFETIME (ADR-0297, INVARIANT L2) ─────────────────────
     * WAS: `this.mesh.geometry.dispose()` — an IMMEDIATE, in-place release on
     * whatever tick the caller happened to run on. That is the exact ordering
     * ADR-0297 forbids, and this is the site the ADR's furniture fix could not
     * reach: `FurnitureFragmentBuilder.updateFurniture()` was migrated to
     * `detachAndReleaseChildren`, but a CHANGE_FURNITURE_TYPE re-registers the
     * element under a NEW geometry hash, so
     * `FurnitureInstanceBridge.register() → _releaseParts() →
     * InstancedElementRenderer.unregister() → _removeGroup() → InstanceGroup
     * .dispose()` destroyed the OLD group's index/vertex buffers synchronously,
     * inside the command's execute(). The next encoded frame then reached
     * `WebGPUBackend.draw`'s `this.get(index).buffer` with the record already
     * deleted:
     *   "setIndexBuffer … parameter 1 is not of type 'GPUBuffer'"
     * — the founder's exact hard stop, on the very path the ADR believed it had
     * closed. The same route is taken by every instanced element class (walls,
     * columns, beams, stair railings), which is why the defect reproduced on
     * UPDATE_STAIR_RAILING as well.
     *
     * NOW: the caller has already detached `mesh` from the scene (L2 (a)); the
     * buffer release is handed to the frame-boundary queue, which
     * `RenderPipelineManager.render()` drains before it encodes anything (L2 (b)).
     * Deferral is unconditionally safe here — the group is dead either way; only
     * the INSTANT of the free moves.
     */
    dispose(): void {
        scheduleGpuRelease(this.mesh.geometry);
        this._idToSlot.clear();
        this._freeSlots.length = 0;
        this._nextSlot = 0;
        this._refusedCount = 0;
    }
}
