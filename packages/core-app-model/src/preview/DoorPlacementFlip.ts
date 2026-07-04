/**
 * DoorPlacementFlip.ts — shared SPACE-to-flip state for door placement.
 *
 * §FEAT-DOOR-FLIP-ON-SPACE (L-92) — the door analogue of PrePlacementRotation
 * (ADR-0107). During door placement — in either the plan view (DoorPlanToolHandler)
 * or the 3D view (DoorTool) — pressing the SPACE key FLIPS the door preview,
 * cycling through ALL FOUR hosted-door configurations before commit:
 *
 *     swing INWARD  / OUTWARD  (which side of the wall the leaf opens to)
 *   × hinge LEFT    / RIGHT    (which jamb the hinge is on)
 *   = 4 states.
 *
 * This is the door-specific counterpart to the free 90° spin of
 * PrePlacementRotation. ADR-0107 deliberately excluded wall-hosted doors/windows
 * from PrePlacementRotation because for a hosted element "rotation" is not a free
 * yaw — it is the host-side flip (C15 hosted-element convention). This class
 * provides exactly that flip as a single source of truth so the plan-view and
 * 3D-view door tools behave identically.
 *
 * Each door tool:
 *   1. constructs one `DoorPlacementFlip` instance,
 *   2. advances it on SPACE — the plan handler advances from its overlay-routed
 *      `onKeyDown` (PlanToolHandler contract §21 §2: it must NOT attach its own DOM
 *      listener); the 3D tool `attach()`es a `document` keydown on activate and
 *      `detach()`es on deactivate,
 *   3. reads `swingDirection()` / `hingesSide()` into the `wall.opening.create`
 *      payload so the COMMITTED door carries the previewed configuration
 *      (P6 — configuration flows through the command, not a post-hoc store write),
 *   4. calls `reset()` on Esc / deactivate.
 *
 * The mapping matches the DoorOpening schema fields exactly
 * (`hingesSide: 'left' | 'right'`, `swingDirection: 'inward' | 'outward'`), which
 * DoorPlanSymbolBuilder reads to draw the swing arc + leaf.
 */

export type DoorSwingDirection = 'inward' | 'outward';
export type DoorHingeSide = 'left' | 'right';

export interface DoorFlipState {
    readonly swingDirection: DoorSwingDirection;
    readonly hingesSide: DoorHingeSide;
}

/**
 * The four door configurations, in cycle order. Advancing walks them in sequence
 * (inward-left → inward-right → outward-left → outward-right → inward-left …) so a
 * single repeated SPACE press visits every hand × swing combination and wraps.
 */
export const DOOR_FLIP_STATES: readonly DoorFlipState[] = [
    { swingDirection: 'inward',  hingesSide: 'left'  },
    { swingDirection: 'inward',  hingesSide: 'right' },
    { swingDirection: 'outward', hingesSide: 'left'  },
    { swingDirection: 'outward', hingesSide: 'right' },
];

export interface DoorPlacementFlipOptions {
    /**
     * Initial state index (0..3). Defaults to 0 (inward / left) — the same
     * default as the DoorOpening schema (`swingDirection: 'inward'`,
     * `hingesSide: 'left'`).
     */
    initialIndex?: number;
    /**
     * Called after the flip changes (a SPACE press). Tools use this to re-orient
     * the live preview and trigger a redraw / HUD update. Optional.
     */
    onChange?: (state: DoorFlipState) => void;
}

/**
 * Cyclic 4-state door flip (swing in/out × hinge left/right), advanced by the
 * SPACE key while a door placement preview is live.
 */
export class DoorPlacementFlip {
    private _index: number;
    private readonly _onChange?: (state: DoorFlipState) => void;
    private _keyHandler: ((e: KeyboardEvent) => void) | null = null;

    constructor(opts: DoorPlacementFlipOptions = {}) {
        this._index = normalizeIndex(opts.initialIndex ?? 0);
        this._onChange = opts.onChange;
    }

    /** Current 0..3 state index. */
    index(): number {
        return this._index;
    }

    /** Current { swingDirection, hingesSide } configuration. */
    state(): DoorFlipState {
        return DOOR_FLIP_STATES[this._index]!;
    }

    /** Current swing direction — read into the create-command payload. */
    swingDirection(): DoorSwingDirection {
        return this.state().swingDirection;
    }

    /** Current hinge side — read into the create-command payload. */
    hingesSide(): DoorHingeSide {
        return this.state().hingesSide;
    }

    /** Short HUD label for the current state, e.g. "In · Left". */
    label(): string {
        const s = this.state();
        const swing = s.swingDirection === 'inward' ? 'In' : 'Out';
        const hinge = s.hingesSide === 'left' ? 'Left' : 'Right';
        return `${swing} · ${hinge}`;
    }

    /** Advance to the next state (wraps 3 → 0). Returns the new state. */
    advance(): DoorFlipState {
        this._index = normalizeIndex(this._index + 1);
        const s = this.state();
        this._onChange?.(s);
        return s;
    }

    /** Reset to the first state (inward / left). Does NOT fire onChange. */
    reset(index = 0): void {
        this._index = normalizeIndex(index);
    }

    /**
     * Install a keydown listener (on `document`) that advances the flip when SPACE
     * is pressed. Idempotent. The listener:
     *   - ignores SPACE while focus is in a form field (input/select/textarea/
     *     contenteditable) so typing a dimension is unaffected,
     *   - calls `preventDefault()` so the page does not scroll and no other SPACE
     *     shortcut fires.
     *
     * Used by the 3D DoorTool (which owns its own DOM listeners). The plan handler
     * does NOT call this — it advances from its overlay-routed `onKeyDown`
     * (PlanToolHandler contract §21 §2). MUST be paired with `detach()`.
     */
    attach(): void {
        if (this._keyHandler) return;
        this._keyHandler = (e: KeyboardEvent) => {
            if (e.code !== 'Space' && e.key !== ' ' && e.key !== 'Spacebar') return;
            if (isFormFieldTarget(e.target)) return;
            e.preventDefault();
            e.stopPropagation();
            this.advance();
        };
        document.addEventListener('keydown', this._keyHandler, true);
    }

    /** Remove the keydown listener. Safe to call when not attached. */
    detach(): void {
        if (!this._keyHandler) return;
        document.removeEventListener('keydown', this._keyHandler, true);
        this._keyHandler = null;
    }
}

function normalizeIndex(i: number): number {
    const n = DOOR_FLIP_STATES.length;
    return ((Math.trunc(i) % n) + n) % n;
}

function isFormFieldTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toUpperCase();
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return true;
    if (el.isContentEditable) return true;
    return false;
}
