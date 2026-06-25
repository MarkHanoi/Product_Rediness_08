/**
 * PrePlacementRotation.ts — shared SPACE-to-rotate state for one-click placement.
 *
 * Revit-style behaviour (founder directive 2026-06-23): during a single-click /
 * one-point element placement (furniture, plumbing fixtures, lighting, columns,
 * carousel object drops, …) the live preview/ghost can be rotated **before**
 * commit by pressing the SPACE key. Each press adds +90° (cumulative, mod 360)
 * about the world-up (Y) axis. The element is then created at that orientation
 * on the next click — so the user orients correctly BEFORE placement instead of
 * select-then-rotate AFTER placement.
 *
 * This is the SINGLE source of truth for the interaction so every one-click tool
 * behaves identically (Contract §41 §7 — Pre-placement rotation). Each tool:
 *   1. constructs one `PrePlacementRotation` instance,
 *   2. installs its keydown handler on `activate()` and removes it on
 *      `deactivate()` (so SPACE never leaks after Esc/commit and never scrolls
 *      the page — the handler calls `preventDefault()`),
 *   3. reads `rotationY()` (radians) in `onPointerMove` to spin the ghost and in
 *      the create-command payload's `rotation` field so the COMMITTED element
 *      carries the chosen orientation (P6 — rotation flows through the command,
 *      not a post-hoc store write),
 *   4. calls `reset()` after each commit if it wants the next placement to start
 *      from 0° (tools may instead keep the last orientation — both are valid).
 *
 * SCOPE: free-standing, point-placed elements only. Wall-hosted door/window
 * placement is deliberately excluded — there "rotation" means the host-wall side
 * / flip, not a free 90° spin (Contract §15). Those tools do not install this.
 *
 * The handler runs ONLY while the owning tool's placement preview is live, so
 * there is no global key capture and no interference with other shortcuts.
 */

const HALF_PI = Math.PI / 2;
const TAU = Math.PI * 2;

/** Default increment per SPACE press: 90° (Revit parity). */
export const PRE_PLACEMENT_ROTATION_STEP = HALF_PI;

export interface PrePlacementRotationOptions {
    /** Radians added per key press. Defaults to 90° (`PRE_PLACEMENT_ROTATION_STEP`). */
    step?: number;
    /**
     * Initial rotation in radians (e.g. a tool that wall-snaps may seed the
     * ghost's current facing so SPACE rotates relative to it).
     */
    initial?: number;
    /**
     * Called after the rotation changes (a SPACE press). Tools use this to
     * re-orient the live ghost and trigger a renderer redraw. Optional.
     */
    onChange?: (rotationY: number) => void;
}

/**
 * Cumulative pre-placement rotation about world-up (Y), advanced by the SPACE
 * key while a one-click placement preview is live.
 */
export class PrePlacementRotation {
    private _rotationY: number;
    private readonly _step: number;
    private readonly _onChange?: (rotationY: number) => void;
    private _keyHandler: ((e: KeyboardEvent) => void) | null = null;

    constructor(opts: PrePlacementRotationOptions = {}) {
        this._step = opts.step ?? PRE_PLACEMENT_ROTATION_STEP;
        this._rotationY = normalize(opts.initial ?? 0);
        this._onChange = opts.onChange;
    }

    /** Current rotation about Y, in radians, normalized to [0, 2π). */
    rotationY(): number {
        return this._rotationY;
    }

    /** Current rotation in whole degrees (for HUD text). */
    degrees(): number {
        return Math.round((this._rotationY * 180) / Math.PI) % 360;
    }

    /** Advance by one step (+90° by default). Returns the new rotation (rad). */
    advance(): number {
        this._rotationY = normalize(this._rotationY + this._step);
        this._onChange?.(this._rotationY);
        return this._rotationY;
    }

    /**
     * Set an explicit base rotation (radians) WITHOUT firing onChange — used by
     * wall-snapping tools that recompute the facing every pointer-move and want
     * the SPACE offset applied on top. Pass the snapped facing here, then read
     * `rotationY()`.
     */
    setBase(rad: number): void {
        this._rotationY = normalize(rad);
    }

    /** Reset to 0° (or the supplied radians). Does NOT fire onChange. */
    reset(rad = 0): void {
        this._rotationY = normalize(rad);
    }

    /**
     * Install a keydown listener (on `document`) that advances the rotation when
     * SPACE is pressed. Idempotent. The listener:
     *   - ignores SPACE while focus is in a form field (input/select/textarea/
     *     contenteditable) so typing a dimension is unaffected,
     *   - calls `preventDefault()` so the page does not scroll and no other
     *     SPACE shortcut fires.
     *
     * MUST be paired with `detach()` in the tool's `deactivate()` so the handler
     * never leaks after Esc / commit.
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

function normalize(rad: number): number {
    return ((rad % TAU) + TAU) % TAU;
}

function isFormFieldTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toUpperCase();
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return true;
    if (el.isContentEditable) return true;
    return false;
}
