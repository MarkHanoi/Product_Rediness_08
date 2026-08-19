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

/**
 * §LEVEL-STACK-LOCKS-VIEW-Y (L-1010) — the current VIEW-ONLY Y offset applied to
 * `obj` by the level-stack explode (0 when the stack is collapsed).
 *
 * The explode lifts a storey's roots by a pure view transform that is never
 * persisted. `obj.position.y` while exploded is therefore MODEL Y + this offset,
 * and anything that latches `position.y` as a durable value must subtract it.
 *
 * Returning a non-finite number (or throwing) means "I do not know", NOT "zero" —
 * the constraint refuses to lock rather than silently latch a contaminated Y.
 */
export type LevelExplodeOffsetProvider = (obj: THREE.Object3D) => number;

export class LevelPlaneConstraint {
    /**
     * The MODEL-space Y locked for the currently selected object — i.e. with any
     * level-stack explode offset already subtracted. null = no lock.
     *
     * §LEVEL-STACK-LOCKS-VIEW-Y (L-1010): this used to be `lockedY`, the RAW
     * `obj.position.y` at attach time. Selecting an element while the level stack
     * was exploded latched MODEL Y + explode offset and then re-asserted that
     * screen-space value on every `change` event and in `enforce()` — so when the
     * founder collapsed the stack, the collapse wrote the model Y back and this
     * constraint immediately hauled the element straight back up to its exploded
     * height, permanently. ("One slab stayed at its exploded height and never
     * comes back.") The lock is now a model value and the view offset is re-added
     * at enforcement time, so a collapse mid-selection lands correctly.
     */
    private lockedModelYValue: number | null = null;

    /** The object whose Y is currently locked. */
    private lockedObj: THREE.Object3D | null = null;

    /** Bound reference kept so we can removeEventListener on dispose. */
    private readonly boundOnChange: () => void;

    constructor(
        private readonly transformControls: TransformControls,
        /**
         * Injected rather than read off `window` so this L1 package keeps no
         * knowledge of who owns the explode. Defaults to "no offset", which is
         * the exact legacy behaviour for callers that do not supply one.
         */
        private readonly explodeOffsetOf: LevelExplodeOffsetProvider = () => 0,
    ) {
        this.boundOnChange = this.onTransformChange.bind(this);
        this.transformControls.addEventListener('change', this.boundOnChange);
    }

    /** The locked MODEL-space Y (explode offset excluded). null = no lock. */
    get lockedModelY(): number | null {
        return this.lockedModelYValue;
    }

    /**
     * The live view-space Y offset for `obj`, or `null` when it cannot be
     * determined. `null` is deliberately distinct from `0`: "the provider failed"
     * and "the stack is collapsed" are different facts and must not share a value.
     */
    private _offsetOf(obj: THREE.Object3D): number | null {
        let raw: number;
        try {
            raw = this.explodeOffsetOf(obj);
        } catch (err) {
            console.warn(
                `[LevelPlaneConstraint] level-explode offset provider threw for ` +
                `id="${obj.userData?.id ?? '?'}" — refusing to lock a Y that may be ` +
                `a view value. Vertical lock is INACTIVE for this selection.`, err,
            );
            return null;
        }
        if (typeof raw !== 'number' || !Number.isFinite(raw)) {
            console.warn(
                `[LevelPlaneConstraint] level-explode offset provider returned ` +
                `${String(raw)} for id="${obj.userData?.id ?? '?'}" — that is UNKNOWN, ` +
                `not zero. Refusing to lock. Vertical lock is INACTIVE for this selection.`,
            );
            return null;
        }
        return raw;
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
        // §LEVEL-STACK-LOCKS-VIEW-Y (L-1010) — subtract the level-stack explode
        // offset BEFORE latching, so the lock is a model value. A `null` offset is
        // "unknown", and an unknown offset means we cannot tell a model Y from a
        // screen Y — so we decline to lock rather than freeze the element at a
        // height the collapse can never undo.
        const offset = this._offsetOf(obj);
        if (offset === null) {
            this.lockedObj = null;
            this.lockedModelYValue = null;
            // We cannot compute a plane, so we must not WRITE one — but the
            // vertical-drag prohibition is not ours to relax either. Hide the Y
            // handle anyway: no affordance is the safe failure, whereas leaving it
            // visible would hand the user a free Y drag on exactly the elements we
            // just admitted we cannot reason about. Rotate still needs its ring.
            const mode = (this.transformControls as any).mode ?? 'translate';
            (this.transformControls as any).showY = (mode === 'rotate');
            return;
        }

        this.lockedObj = obj;
        this.lockedModelYValue = obj.position.y - offset;

        // Apply showY depending on current mode (hide in translate, show in rotate)
        this._applyModeConstraint();
        console.log(
            `[LevelPlaneConstraint] Locked model Y=${this.lockedModelYValue.toFixed(4)} ` +
            `(view Y=${obj.position.y.toFixed(4)}, level-explode offset=${offset.toFixed(4)}) ` +
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
        this.lockedModelYValue = null;

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
        this._clampToLevelPlane();
    }

    /**
     * §LEVEL-STACK-LOCKS-VIEW-Y (L-1010) — the single place the Y is written.
     *
     * The target is recomputed as `lockedModelY + CURRENT explode offset` rather
     * than replayed from a value captured at attach time. That is what makes a
     * collapse (or an explode) DURING a live selection land correctly: the model
     * plane is invariant, the view offset is read fresh, and the element tracks
     * the stack instead of being pinned to whatever height it happened to be at
     * when it was clicked.
     */
    private _clampToLevelPlane(): void {
        const obj = this.lockedObj;
        if (obj === null || this.lockedModelYValue === null) return;
        const mode = (this.transformControls as any).mode ?? 'translate';
        if (mode === 'rotate') return;
        const offset = this._offsetOf(obj);
        // Unknown offset: leave the element where it is rather than write a Y we
        // cannot justify. The warning in _offsetOf already said so.
        if (offset === null) return;
        obj.position.y = this.lockedModelYValue + offset;
    }

    /** True while the constraint is attached to an object. */
    get isActive(): boolean {
        return this.lockedObj !== null;
    }

    /** Tear down — remove the change listener. Call when the engine disposes. */
    dispose(): void {
        this.transformControls.removeEventListener('change', this.boundOnChange);
        this.lockedObj = null;
        this.lockedModelYValue = null;
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

        // Clamp Y position only in translate mode (handled inside).
        this._clampToLevelPlane();
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
