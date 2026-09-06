/**
 * shellSplitRatio.ts — §SHELL-SPLIT-DRAG (founder 2026-09-06 · STR §25 · L-12983)
 *
 * Layer Affected:  UI — shell layout (L7)
 * File:            apps/editor/src/ui/layout/shellSplitRatio.ts
 * Strategy:        STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §24.1 item 2 / §25
 * Contracts:       C06 §15 (float budget) · C59 §2 (one write path) · C84 EI-9 (one owner)
 * Issue log:       L-12983
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE FOUNDER ASKED FOR "THE SAME" DRAG, SO THIS IS THE SAME ARITHMETIC.
 * ─────────────────────────────────────────────────────────────────────────────
 * Founder, 2026-09-06: *"the user shall be able to DRAG THE WIDTH of the view
 * left/right on demand — we can do that on split view already — do it sound —
 * the same (check if there are any bugs)."*
 *
 * "The same" is a de-duplication instruction, not a copy instruction. There are
 * already TWO divider drags in this app and they disagree about the clamp:
 *
 *   · `SplitViewManager._onDividerMouseMove` — `Math.max(0.20, Math.min(0.65,
 *     (innerWidth - clientX) / innerWidth))`, on the RIGHT-hand fraction.
 *   · `SiteAuthoringPaneShell.onMove` — `clampFraction((clientX - rect.left) /
 *     rect.width)` with MIN 0.2 / MAX 0.8, on the LEFT-hand fraction.
 *
 * A THIRD hand-written clamp for the Analysis/Parcel-Law panel edge would have
 * been the third spelling of one rule, which is the C84 EI-9 defect this repo
 * pays for most often. So the arithmetic lives here ONCE, pure, and the callers
 * pass their own bounds — the bounds differ legitimately (a 2D/3D pane may go to
 * 80 %, a right-hand reading panel may not), the MATH does not.
 *
 * ⛔ PURE. No DOM, no THREE (P2), no rAF (P3), no `(window as any)` (P4), no
 * store writes (P6). Every function is total: a zero or NaN viewport width
 * returns the fallback rather than `Infinity`, because a divider that divides by
 * zero moves the whole viewport to one edge and the user cannot get it back.
 */

/**
 * The split-view clamp, verbatim from `SplitViewManager._onDividerMouseMove`.
 * The RIGHT-hand surface may take between a fifth and about two thirds.
 */
export const SHELL_SPLIT_MIN_RIGHT = 0.20;
export const SHELL_SPLIT_MAX_RIGHT = 0.65;

/** The half-canvas default — `workspaceModes.ts`'s `'half'` and `#anl-surface`'s `width: 50%`. */
export const SHELL_SPLIT_DEFAULT_RIGHT = 0.5;

/**
 * Clamp a fraction into `[min, max]`.
 *
 * ⚠ A non-finite input returns `fallback`, NOT `min`. `NaN` reaches here whenever a
 * pointer event is read against an unlaid-out element, and clamping it to the minimum
 * would silently collapse the panel to its narrowest — a layout that looks deliberate
 * and is not. Returning the caller's current value leaves the drag where it was.
 */
export function clampSplitFraction(
    f: number,
    min = SHELL_SPLIT_MIN_RIGHT,
    max = SHELL_SPLIT_MAX_RIGHT,
    fallback = SHELL_SPLIT_DEFAULT_RIGHT,
): number {
    if (!Number.isFinite(f)) return fallback;
    return Math.max(min, Math.min(max, f));
}

/**
 * The RIGHT-hand fraction a pointer at `clientX` implies, given a viewport `width`.
 *
 * This is `SplitViewManager`'s own expression — `(vw - e.clientX) / vw`, clamped —
 * lifted so both dividers and the Analysis panel edge compute it identically.
 *
 * `width <= 0` (a detached or not-yet-laid-out host; happy-dom reports 0 for every
 * element) returns `fallback`: "unmeasurable" is not "the user dragged to the edge".
 */
export function rightFractionFromPointerX(
    clientX: number,
    width: number,
    opts: { min?: number; max?: number; fallback?: number } = {},
): number {
    const fallback = opts.fallback ?? SHELL_SPLIT_DEFAULT_RIGHT;
    if (!Number.isFinite(width) || width <= 0) return fallback;
    if (!Number.isFinite(clientX)) return fallback;
    return clampSplitFraction(
        (width - clientX) / width,
        opts.min ?? SHELL_SPLIT_MIN_RIGHT,
        opts.max ?? SHELL_SPLIT_MAX_RIGHT,
        fallback,
    );
}

/**
 * The LEFT-hand fraction a pointer at `clientX` implies, measured from `left`.
 *
 * The pane shell's own expression (`(clientX - rect.left) / rect.width`), same
 * treatment. Kept as its OWN function rather than `1 - right`: the two dividers
 * measure from opposite origins (viewport vs host rect), and folding them into one
 * call with a flag is how the origin gets passed wrongly.
 */
export function leftFractionFromPointerX(
    clientX: number,
    rect: { left: number; width: number },
    opts: { min?: number; max?: number; fallback?: number } = {},
): number {
    const fallback = opts.fallback ?? SHELL_SPLIT_DEFAULT_RIGHT;
    if (!Number.isFinite(rect.width) || rect.width <= 0) return fallback;
    if (!Number.isFinite(clientX) || !Number.isFinite(rect.left)) return fallback;
    return clampSplitFraction(
        (clientX - rect.left) / rect.width,
        opts.min ?? SHELL_SPLIT_MIN_RIGHT,
        opts.max ?? SHELL_SPLIT_MAX_RIGHT,
        fallback,
    );
}

/** `0.4123` → `'41.23%'`. Two decimals, matching `_applyDragRatio`'s `toFixed(2)`. */
export function percent(f: number): string {
    return `${(f * 100).toFixed(2)}%`;
}
