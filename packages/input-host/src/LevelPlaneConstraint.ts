/**
 * LevelPlaneConstraint
 *
 * Prevents any BIM element from being moved vertically (Y-axis) via the
 * TransformControls gizmo. In PRYZM, vertical positioning is governed by the
 * Level system — elements belong to a level and their Y coordinate is derived
 * from that level's elevation. Users must change an element's level through the
 * Level panel, not by dragging.
 *
 * Strategy:
 *  1. `attach(obj)` — capture the element's current world Y as the immutable
 *     locked plane. Hide the Y gizmo handle so no vertical affordance is shown.
 *  2. `change` listener (frame-by-frame) — continuously snap obj.position.y back
 *     to lockedY while the user is dragging. This eliminates any visible drift.
 *  3. `enforce()` — called once more from the dragging-changed (drag-end) handler
 *     as a final guarantee, in case the change listener missed the very last frame.
 *  4. `detach()` — restore showY, clear the locked Y. Called on deselect.
 *
 * Element exclusions:
 *  • Doors / windows   — handled by HostedElementDragController (1-D along wall).
 *    The caller (SelectionManager) must skip `attach()` for these types.
 *  • All other semantic types (wall, slab, furniture, column, beam, stairs,
 *    curtain wall, ramp, railing, opening, …) receive the constraint.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { TransformControls } from '@pryzm/renderer-three';

export class LevelPlaneConstraint {
    /** The Y value locked for the currently selected object. null = no lock. */
    private lockedY: number | null = null;

    /** The object whose Y is currently locked. */
    private lockedObj: THREE.Object3D | null = null;

    /** Bound reference kept so we can removeEventListener on dispose. */
    private readonly boundOnChange: () => void;

    constructor(private readonly transformControls: TransformControls) {
        this.boundOnChange = this.onTransformChange.bind(this);
        this.transformControls.addEventListener('change', this.boundOnChange);
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Activate the level-plane constraint for `obj`.
     *
     * Must be called AFTER `transformControls.attach(obj)` so that
     * showY=false takes effect on the freshly-attached gizmo.
     *
     * @param obj  The selected scene object (must NOT be a door or window).
     */
    attach(obj: THREE.Object3D): void {
        this.lockedObj = obj;
        this.lockedY   = obj.position.y;

        // Apply showY depending on current mode (hide in translate, show in rotate)
        this._applyModeConstraint();
        console.log(
            `[LevelPlaneConstraint] Locked Y=${this.lockedY.toFixed(4)} ` +
            `for element "${obj.userData?.elementType ?? obj.name}" ` +
            `id="${obj.userData?.id ?? '?'}"`
        );
    }

    /**
     * Release the constraint and restore the Y gizmo handle.
     * Call on element deselect.
     */
    detach(): void {
        this.lockedObj = null;
        this.lockedY   = null;

        // Restore the Y handle so the next element (or HostedElementDragController)
        // can configure it as appropriate.
        (this.transformControls as any).showY = true;
    }

    /**
     * Hard-snap the object Y back to lockedY.
     *
     * Call from the `dragging-changed` (drag-end) handler as a final guarantee.
     * The per-frame `change` listener handles real-time clamping; this call
     * protects against any frame where the browser batched the last change tick
     * before firing dragging-changed.
     * Only applies in translate mode — rotation must not clamp position.
     */
    enforce(): void {
        if (this.lockedObj !== null && this.lockedY !== null) {
            const mode = (this.transformControls as any).mode ?? 'translate';
            if (mode !== 'rotate') {
                this.lockedObj.position.y = this.lockedY;
            }
        }
    }

    /** True while the constraint is attached to an object. */
    get isActive(): boolean {
        return this.lockedObj !== null;
    }

    /** Tear down — remove the change listener. Call when the engine disposes. */
    dispose(): void {
        this.transformControls.removeEventListener('change', this.boundOnChange);
        this.lockedObj = null;
        this.lockedY   = null;
    }

    // ── Private ───────────────────────────────────────────────────────────────

    /**
     * Real-time change handler — fires on every TransformControls 'change' event
     * including mode switches (setMode triggers 'change'). Keeps showY and the
     * Y position clamp in sync with the current mode.
     *
     * In translate mode: hide Y handle, clamp position.y to locked value.
     * In rotate mode:    show Y ring (horizontal rotation), skip position clamp.
     */
    private onTransformChange(): void {
        // Keep showY consistent whenever mode may have changed
        this._applyModeConstraint();

        // Clamp Y position only in translate mode
        const mode = (this.transformControls as any).mode ?? 'translate';
        if (mode !== 'rotate' && this.lockedObj !== null && this.lockedY !== null) {
            this.lockedObj.position.y = this.lockedY;
        }
    }

    /**
     * Sync the Y gizmo handle visibility with the current TransformControls mode.
     *   translate → showY=false (no vertical drag)
     *   rotate    → showY=true  (horizontal spin ring must be visible)
     */
    private _applyModeConstraint(): void {
        if (this.lockedObj === null) return;
        const mode = (this.transformControls as any).mode ?? 'translate';
        (this.transformControls as any).showY = (mode === 'rotate');
    }
}
