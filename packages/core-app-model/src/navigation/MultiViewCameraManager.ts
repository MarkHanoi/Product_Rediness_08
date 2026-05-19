/**
 * @file src/core/navigation/MultiViewCameraManager.ts
 *
 * MultiViewCameraManager — dedicated camera-state slots per view type.
 *
 * ## Goal (Phase 4 — Task 4.1)
 *
 * Revit-style "camera per view": switching between 3D, floor-plan, and
 * section views is a **pointer swap** — the incoming view's pre-cached
 * camera state is applied instantly, rather than recomputing position,
 * target, and distance from scene bounds on every entry.
 *
 * ## Design
 *
 * The PRYZM world maintains a single `OBC.OrthoPerspectiveCamera` instance
 * (OBC design constraint). MultiViewCameraManager stores an independent
 * `CameraState` record for each of the three canonical view *slots*
 * (perspective / plan / section).  On `switchTo()`:
 *
 *   1. The departing slot's current camera position + target are saved.
 *   2. If the arriving slot has a saved state, it is restored immediately
 *      without any scene-bounds computation.
 *   3. If the arriving slot has never been visited, a one-time default
 *      framing is computed from the supplied `SceneBoundsCache` and cached —
 *      so subsequent entries to that slot are also instant.
 *
 * ## Contract compliance
 *
 *   01-BIM-ENGINE-CORE §5  — No side effects on stores, builders, or graph.
 *   02-BIM-SPATIAL-PROJECTION §1 — BimManager remains the spatial authority;
 *     this class only reads scene bounds, never level elevations.
 *   04-BIM-AI-MODIFICATION-PROTOCOL — Navigation layer only; no cross-layer
 *     mutations.
 *
 * Phase 4 Performance — Task 4.1.
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';

// ── View slot types ───────────────────────────────────────────────────────────

/** The three canonical view-type slots managed by MultiViewCameraManager. */
export type CameraSlot = 'perspective' | 'plan' | 'section';

/**
 * Serialisable camera state for a view slot.
 * Position and target are stored in world space.
 */
export interface CameraState {
    position: THREE.Vector3;
    target: THREE.Vector3;
    /** Orthographic zoom level (used when the camera is in Orthographic mode). */
    zoom: number;
    /** True once the slot has been populated with real data. */
    hasState: boolean;
}

// ── Default framing helpers ───────────────────────────────────────────────────

const DEFAULT_PLAN_DISTANCE = 40;   // metres above scene centre — plan view default
const DEFAULT_3D_DISTANCE   = 60;   // metres from scene centre — 3D view default

function defaultState(): CameraState {
    return {
        position: new THREE.Vector3(),
        target:   new THREE.Vector3(),
        zoom:     1,
        hasState: false,
    };
}

// ── MultiViewCameraManager ────────────────────────────────────────────────────

/**
 * Manages per-slot camera states for the three canonical PRYZM view types.
 *
 * Injected into ViewController via `setMultiViewCameraManager()`. The
 * controller calls `saveSlot()` before deactivating a view and `restoreSlot()`
 * when activating the next view.
 */
export class MultiViewCameraManager {

    private readonly _slots: Record<CameraSlot, CameraState> = {
        perspective: defaultState(),
        plan:        defaultState(),
        section:     defaultState(),
    };

    private _activeSlot: CameraSlot = 'perspective';

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Returns the currently-active slot identifier.
     */
    get activeSlot(): CameraSlot {
        return this._activeSlot;
    }

    /**
     * Save the current OBC camera state into the specified slot.
     *
     * Call this **before** deactivating the outgoing view so the slot
     * records the user's last known camera position.
     */
    saveSlot(slot: CameraSlot, camera: OBC.OrthoPerspectiveCamera): void {
        try {
            const three = camera.three;
            if (!three) return;

            const controls = (camera as any).controls;
            const state = this._slots[slot];

            // NaN guard: if the camera position is not finite, skip the save.
            // An extreme zoom can corrupt camera-controls' internal state and
            // produce NaN; writing it would persist a black-screen state across
            // view switches.  Keeping the previous valid position is safer.
            const p = three.position;
            if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
                console.warn(
                    `[MultiViewCameraManager] saveSlot("${slot}") — camera position is NaN/Infinity ` +
                    `(${p.x}, ${p.y}, ${p.z}), skipping save to preserve last valid state`,
                );
                return;
            }

            state.position.copy(three.position);

            if (controls?.getTarget) {
                controls.getTarget(state.target);
            } else if ((three as any).target) {
                state.target.copy((three as any).target);
            } else {
                // Derive target from camera direction
                const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(three.quaternion);
                state.target.copy(three.position).addScaledVector(dir, DEFAULT_3D_DISTANCE);
            }

            state.zoom = (three as THREE.OrthographicCamera).zoom ?? 1;
            state.hasState = true;

            console.log(
                `[MultiViewCameraManager] Saved slot "${slot}" — ` +
                `pos(${state.position.x.toFixed(2)}, ${state.position.y.toFixed(2)}, ${state.position.z.toFixed(2)})`,
            );
        } catch (err: any) {
            console.warn(`[MultiViewCameraManager] saveSlot("${slot}") error:`, err?.message ?? err);
        }
    }

    /**
     * Restore a previously-saved slot onto the OBC camera.
     *
     * Returns `true` if a cached state was applied (no bounds recomputation
     * needed). Returns `false` if the slot was empty and the caller must
     * compute and apply default framing, then call `saveSlot()` to cache it.
     */
    restoreSlot(slot: CameraSlot, camera: OBC.OrthoPerspectiveCamera): boolean {
        const state = this._slots[slot];
        if (!state.hasState) {
            this._activeSlot = slot;
            return false;
        }

        // NaN guard: a previously-corrupted save (extreme zoom → NaN) must not
        // be applied to the camera.  Clearing the slot forces the caller to fall
        // back to scene-bounds framing, which always produces a valid position.
        const sp = state.position;
        if (!Number.isFinite(sp.x) || !Number.isFinite(sp.y) || !Number.isFinite(sp.z)) {
            console.warn(
                `[MultiViewCameraManager] restoreSlot("${slot}") — stored position is NaN/Infinity ` +
                `(${sp.x}, ${sp.y}, ${sp.z}), clearing slot and falling back to default framing`,
            );
            this._slots[slot] = defaultState();
            this._activeSlot = slot;
            return false;
        }

        try {
            const controls = (camera as any).controls;
            if (controls?.setLookAt) {
                controls.setLookAt(
                    state.position.x, state.position.y, state.position.z,
                    state.target.x,   state.target.y,   state.target.z,
                    false, // animate: false — instant switch
                );
            } else {
                camera.three.position.copy(state.position);
            }

            if ((camera.three as THREE.OrthographicCamera).isOrthographicCamera) {
                (camera.three as THREE.OrthographicCamera).zoom = state.zoom;
                camera.three.updateProjectionMatrix();
            }

            this._activeSlot = slot;

            console.log(
                `[MultiViewCameraManager] Restored slot "${slot}" — ` +
                `pos(${state.position.x.toFixed(2)}, ${state.position.y.toFixed(2)}, ${state.position.z.toFixed(2)})`,
            );
            return true;
        } catch (err: any) {
            console.warn(`[MultiViewCameraManager] restoreSlot("${slot}") error:`, err?.message ?? err);
            this._activeSlot = slot;
            return false;
        }
    }

    /**
     * Mark a slot as having no saved state.
     * Call on project load to ensure stale states from previous projects
     * are not applied to the new project's geometry.
     */
    clearSlot(slot: CameraSlot): void {
        this._slots[slot] = defaultState();
    }

    /**
     * Clear all slot states. Call on project load or clear.
     */
    clearAll(): void {
        this._slots.perspective = defaultState();
        this._slots.plan        = defaultState();
        this._slots.section     = defaultState();
    }

    /**
     * Apply a computed default plan-view camera state to the plan slot
     * without querying the OBC camera. Used when framing is computed
     * externally (e.g. by PlanViewService.applyFloorPlan) and the result
     * should be cached for future re-entries.
     */
    seedPlanSlot(position: THREE.Vector3, target: THREE.Vector3, zoom: number): void {
        const state = this._slots.plan;
        state.position.copy(position);
        state.target.copy(target);
        state.zoom     = zoom;
        state.hasState = true;

        console.log(
            `[MultiViewCameraManager] Seeded plan slot — ` +
            `pos(${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`,
        );
    }

    /**
     * Apply a computed default perspective camera state to the perspective slot.
     */
    seedPerspectiveSlot(position: THREE.Vector3, target: THREE.Vector3): void {
        const state = this._slots.perspective;
        state.position.copy(position);
        state.target.copy(target);
        state.zoom     = 1;
        state.hasState = true;
    }

    /**
     * Returns whether the given slot has a saved state (can be restored
     * without scene-bounds recomputation).
     */
    hasSlotState(slot: CameraSlot): boolean {
        return this._slots[slot].hasState;
    }

    /**
     * Readonly snapshot of a slot's state (for debugging / diagnostics).
     */
    getSlotSnapshot(slot: CameraSlot): Readonly<CameraState> {
        return this._slots[slot];
    }

    // ── Convenience helpers ───────────────────────────────────────────────────

    /**
     * Map a PRYZM ViewMode string to the corresponding CameraSlot.
     *
     *   '3D'      → 'perspective'
     *   'Top'     → 'plan'
     *   'Ceiling' → 'plan'
     *   'Section' → 'section'
     *   anything  → 'perspective'
     */
    static slotForViewMode(mode: string): CameraSlot {
        if (mode === 'Top' || mode === 'FloorPlan' || mode === 'Ceiling' || mode === 'ceiling-plan') return 'plan';
        if (mode === 'Section' || mode === 'Elevation') return 'section';
        return 'perspective';
    }

    /**
     * Default plan-view camera position directly above a target point.
     * Returns a position `DEFAULT_PLAN_DISTANCE` metres above target.
     */
    static defaultPlanPosition(target: THREE.Vector3): THREE.Vector3 {
        return new THREE.Vector3(target.x, target.y + DEFAULT_PLAN_DISTANCE, target.z);
    }
}
