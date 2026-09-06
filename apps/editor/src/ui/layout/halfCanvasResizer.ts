/**
 * halfCanvasResizer.ts — §SHELL-SPLIT-DRAG (founder 2026-09-06 · L-12980)
 *
 * Layer Affected:  UI — shell layout (L7)
 * File:            apps/editor/src/ui/layout/halfCanvasResizer.ts
 * Strategy:        STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §24.1 item 2 · §25.0
 * Contracts:       C06 §15 (float budget) · C59 §2 · C84 EI-9 (one owner per rule)
 * Issue log:       L-12980
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE FOUNDER ASKED FOR, AND WHERE THE PIXELS COME FROM
 * ─────────────────────────────────────────────────────────────────────────────
 * *"the user shall be able to DRAG THE WIDTH of the view left/right on demand —
 * we can do that on split view already — do it sound — the same (check if there
 * are any bugs)."* — with a screenshot of the PARCEL LAW tab: the 3-D view on the
 * left, the panel on the right, and a hard 50/50 edge between them that nothing
 * could move.
 *
 * That edge is not one element. It is TWO independent claimants of the same
 * boundary, and both have to move together or the drag tears:
 *
 *   · `#container` — the 3-D viewport. `WorkspaceController._applyLayout` writes
 *     `style.width = '50%'` for any mode whose registry row says `canvas: 'half'`.
 *   · `#anl-surface` (Analysis) / `#aud-stack` (Inspect) — `position: fixed;
 *     right: 0; width: 50%` in their own sheets.
 *
 * So this control writes BOTH, from ONE fraction, in one pass — which is exactly
 * what `SplitViewManager._applyDragRatio` does for `.svp-pane` + `#container`.
 * The founder's "the same" is honoured by SHARING THE ARITHMETIC
 * (`shellSplitRatio.ts`), not by copying the loop: the clamp now has one owner
 * instead of the two spellings that were already in the tree.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE DRAG IS COALESCED THROUGH THE FRAME SCHEDULER, AND THAT IS NOT POLISH
 * ─────────────────────────────────────────────────────────────────────────────
 * A `mousemove` on this divider changes the 3-D viewport's width. `#container`
 * carries a `ResizeObserver` (`DockingLayout.ts:143`) that calls
 * `triggerWindowResize()` AND `publishShellCanvasRegion()` on every observed
 * change, and the renderer re-allocates its drawing buffer behind that. Applying
 * one layout pass per raw pointer event therefore drives a renderer resize per
 * event. `SplitViewManager` already solved this — `getFrameScheduler()
 * .scheduleOnce('split-view-drag', …, 'overlay')` — and this file uses the same
 * primitive with its own reason string. P3 is respected: no `requestAnimationFrame`
 * here; the scheduler owns the only one.
 *
 * ⛔ NO STORE WRITES (P6), no THREE (P2), no `(window as any)` (P4) — the canvas
 * and the surface are both passed in or resolved by id, and every style this file
 * writes is RESTORED on dispose to the value it found, so a control that mounts
 * and unmounts with a tab can never leave the shell narrower than it started.
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';
import {
    SHELL_SPLIT_DEFAULT_RIGHT,
    SHELL_SPLIT_MAX_RIGHT,
    SHELL_SPLIT_MIN_RIGHT,
    clampSplitFraction,
    percent,
    rightFractionFromPointerX,
} from './shellSplitRatio';

/** `data-testid` on the drag handle. */
export const HALF_CANVAS_RESIZER_TESTID = 'half-canvas-resizer';

/**
 * Half-width of the transparent grab band, in px, either side of the seam.
 *
 * ⚠ THE SEAM ITSELF IS NOT DRAWN BY THIS FILE. `#anl-surface` already has
 * `border-left: 1px solid var(--app-border)`, and the founder's other 2026-09-06
 * instruction (§SEAM-HAIRLINE-WHITE, L-12966) was that a seam should be a hairline.
 * So the handle is INVISIBLE at rest and the existing 1 px border stays the line;
 * a hover/drag tint is the only paint, which is the `.svp-divider` idiom
 * (`styles/panels/splitView.ts:620-634`) rather than a new visual language.
 */
export const RESIZER_HALF_WIDTH_PX = 6;

/**
 * §HALF-CANVAS-OWNS-THE-RIGHT-EDGE — the handle must sit ABOVE every surface that
 * can occupy the canvas region, or the pointer never reaches it.
 *
 * ⭐ MEASURED, not chosen: the Cesium container is `z-index: 15`
 * (`CesiumViewport.ts:472` `CESIUM_Z`), the site-authoring pane shell root is
 * `z-index: 14` (`SiteAuthoringPaneShell.ts`), and `#anl-surface` is `z-index: 50`
 * (`styles/panels/analysisSurface.ts`). 51 clears all three — including the panel,
 * deliberately: ~6 px of the band overlaps the panel's own left edge, and a handle
 * that stopped at the seam would be half a handle. It is transparent, so it hides
 * nothing; it only claims the pointer in a 13 px strip, which is what a resize
 * affordance is.
 */
export const RESIZER_Z_INDEX = 51;

export interface HalfCanvasResizerOptions {
    /** The fixed right-hand surface being resized (`#anl-surface`, `#aud-stack`). */
    readonly surface: HTMLElement;
    /** The canvas element id. Defaults to `'container'`. */
    readonly canvasId?: string;
    /** Where the handle is appended. Defaults to `document.body` (it is shell chrome). */
    readonly parent?: HTMLElement;
    /** Narrowest / widest the surface may become, as a fraction of the viewport. */
    readonly min?: number;
    readonly max?: number;
    /**
     * The fraction to open at. Defaults to the fraction this surface was last dragged
     * to in THIS session (see `rememberedFraction`), else 0.5.
     */
    readonly initialFraction?: number;
    /**
     * Called once per drag, on release — never per pointer event. Production passes
     * `publishShellCanvasRegion` so every canvas-anchored bar re-centres on the new
     * region; the `ResizeObserver` on `#container` does the same job, and calling both
     * is idempotent (it writes two CSS custom properties).
     */
    readonly onCommit?: () => void;
    /** Test seam. Defaults to `window.innerWidth`. */
    readonly viewportWidth?: () => number;
}

export interface HalfCanvasResizerHandle {
    /** The drag handle element. */
    readonly element: HTMLElement;
    /** The current right-hand fraction. */
    fraction(): number;
    /** Set it programmatically (clamped), and re-apply both widths. */
    setFraction(f: number): void;
    /** Re-write both widths from the current fraction — call after a mode re-apply. */
    reapply(): void;
    /** True while the pointer is down on the handle. */
    isDragging(): boolean;
    dispose(): void;
}

/**
 * The fraction each surface was last dragged to, keyed by its element id.
 *
 * ⚠ MODULE STATE, ON PURPOSE, and the precedent is `SplitViewManager._splitRatio`:
 * the Parcel Law tab tears its body down on every tab change, so a fraction owned by
 * the handle would reset to 50 % every time the founder left and came back. This is a
 * per-session memory of a layout gesture — not project data, so it is deliberately NOT
 * persisted to storage and NOT written to any store (P6).
 */
const rememberedFraction = new Map<string, number>();

/** What this session last knows about `surfaceId`'s width, or `null`. */
export function rememberedHalfCanvasFraction(surfaceId: string): number | null {
    return rememberedFraction.get(surfaceId) ?? null;
}

/** Forget every remembered fraction. Test hygiene only — nothing in production calls it. */
export function resetRememberedHalfCanvasFractions(): void {
    rememberedFraction.clear();
}

/**
 * Mount the drag handle on the left edge of `surface`.
 *
 * Never throws into its caller: the Analysis surface mounts this while becoming visible,
 * and a resizer that could throw would be able to take the whole panel down with it.
 */
export function mountHalfCanvasResizer(opts: HalfCanvasResizerOptions): HalfCanvasResizerHandle {
    const surface = opts.surface;
    const surfaceId = surface.id || 'half-canvas-surface';
    const min = opts.min ?? SHELL_SPLIT_MIN_RIGHT;
    const max = opts.max ?? SHELL_SPLIT_MAX_RIGHT;
    const parent = opts.parent ?? document.body;
    const readViewportWidth = opts.viewportWidth
        ?? (() => (typeof window === 'undefined' ? 0 : window.innerWidth || 0));

    let fraction = clampSplitFraction(
        opts.initialFraction ?? rememberedFraction.get(surfaceId) ?? SHELL_SPLIT_DEFAULT_RIGHT,
        min,
        max,
    );

    const canvas = (): HTMLElement | null =>
        document.getElementById(opts.canvasId ?? 'container');

    const priorSurfaceWidth = surface.style.width;

    /**
     * ⭐ WHAT THIS HANDLE LAST WROTE TO `#container`, SO DISPOSE CAN CLEAR ONLY ITS OWN
     * MARKS. This is the crux of the file and it was got wrong once on the way here.
     *
     * `#container.style.width` has THREE writers and no protocol between them
     * (`halfCanvasSplitViewPolicy.ts` documents two of them; this handle is the third):
     *
     *   1. `WorkspaceController._applyLayout` — `'50%'` for a half-canvas mode, `''` for a
     *      full one. It runs BEFORE the `pryzm-workspace-mode` emit that hides this surface,
     *      so by the time `dispose()` runs the NEXT mode's width is already on the node.
     *   2. `SplitViewManager._buildDOM` — `'60%'` + a matching `max-width`, and
     *      `_applyLayout` can REOPEN that pane after switching the width (the 'reopen' arm).
     *   3. this handle.
     *
     * ⛔ SO "RESTORE WHAT I FOUND" IS WRONG, and specifically wrong in the direction that
     * costs the founder his viewport: mounting in Analysis records `'50%'`, and restoring
     * that on the way OUT would pin the Author-mode canvas at half width. Equally, blindly
     * clearing would wipe the 60 % a split pane had set one line earlier.
     *
     * The rule that is correct in every one of those cases: clear a property ONLY while it
     * still holds the exact string this handle last wrote. If anyone has written since, the
     * value is theirs and this file does not touch it.
     *
     * ⚠ `max-width` is the half that actually bites. `_applyLayout`'s full-canvas branch
     * clears `width` and says nothing about `max-width` — so a `max-width` left behind here
     * survives the mode switch and pins the canvas at the dragged fraction with no panel
     * beside it.
     */
    let wroteCanvasWidth: string | null = null;
    let wroteCanvasMaxWidth: string | null = null;

    // ── The handle ──────────────────────────────────────────────────────────────
    const handle = document.createElement('div');
    handle.id = `pryzm-half-canvas-resizer-${surfaceId}`;
    handle.className = 'hcr-handle';
    handle.setAttribute('data-testid', HALF_CANVAS_RESIZER_TESTID);
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', 'Drag to resize the view and the panel');
    handle.title = 'Drag to set how much of the screen the view and the panel take. '
        + 'Arrow keys move it 2% at a time; Home restores the 50/50.';
    Object.assign(handle.style, {
        position: 'fixed',
        top: '0',
        height: '100%',
        width: `${RESIZER_HALF_WIDTH_PX * 2 + 1}px`,
        // `right: <fraction>` puts the band's RIGHT edge on the seam; the negative margin
        // slides it back so the seam runs down the band's middle. Two plain property
        // assignments rather than a `calc()`, so the value survives every CSSOM this runs
        // under (happy-dom drops some `calc()` forms silently).
        marginRight: `-${RESIZER_HALF_WIDTH_PX}px`,
        zIndex: String(RESIZER_Z_INDEX),
        cursor: 'col-resize',
        background: 'transparent',
        userSelect: 'none',
        touchAction: 'none',
    } satisfies Partial<CSSStyleDeclaration>);

    let disposed = false;
    let dragging = false;
    let pendingFraction: number | null = null;
    let dragDispose: (() => void) | null = null;

    /** Write the ONE fraction to BOTH claimants of the boundary, plus the handle. */
    const apply = (): void => {
        if (disposed) return;
        const pct = percent(fraction);
        handle.style.right = pct;
        try {
            surface.style.width = pct;
        } catch { /* a surface removed mid-drag is not a reason to fail a drag */ }
        const c = canvas();
        if (c) {
            const canvasPct = percent(1 - fraction);
            c.style.width = canvasPct;
            // `#container` is `flex: 1 1 0` under the docking layout, so a width alone is
            // not binding — this is the same pair `SplitViewManager._buildDOM` writes, and
            // for the same measured reason.
            c.style.maxWidth = canvasPct;
            wroteCanvasWidth = canvasPct;
            wroteCanvasMaxWidth = canvasPct;
        }
    };

    const commit = (): void => {
        try { opts.onCommit?.(); } catch (e) {
            console.warn('[half-canvas-resizer] commit hook failed (non-fatal):', e);
        }
    };

    const onDown = (e: MouseEvent): void => {
        if (disposed) return;
        dragging = true;
        e.preventDefault();
        handle.setAttribute('data-dragging', 'true');
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
    };

    const onMove = (e: MouseEvent): void => {
        if (!dragging || disposed) return;
        pendingFraction = rightFractionFromPointerX(e.clientX, readViewportWidth(), {
            min, max, fallback: fraction,
        });
        // Coalesce: one layout pass per frame, not one per pointer event. See the header.
        if (dragDispose !== null) return;
        dragDispose = getFrameScheduler().scheduleOnce(
            'half-canvas-resize-drag',
            () => {
                dragDispose = null;
                const next = pendingFraction;
                pendingFraction = null;
                if (next == null || !dragging || disposed) return;
                fraction = next;
                apply();
            },
            'overlay',
        );
    };

    const onUp = (): void => {
        if (!dragging || disposed) return;
        dragging = false;
        handle.removeAttribute('data-dragging');
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        // Cancel the scheduled pass and apply the final position synchronously, so the
        // release lands where the pointer is rather than one frame behind it.
        if (dragDispose !== null) { dragDispose(); dragDispose = null; }
        if (pendingFraction != null) {
            fraction = pendingFraction;
            pendingFraction = null;
            apply();
        }
        rememberedFraction.set(surfaceId, fraction);
        commit();
    };

    /**
     * Keyboard parity (C43 / WCAG 2.2 — a pointer-only resize is unreachable). Arrow keys
     * move the seam 2 % per press; Home restores the 50/50 the mode declares.
     */
    const onKey = (e: KeyboardEvent): void => {
        if (disposed) return;
        let next: number | null = null;
        if (e.key === 'ArrowLeft') next = fraction + 0.02;   // the panel grows leftward
        else if (e.key === 'ArrowRight') next = fraction - 0.02;
        else if (e.key === 'Home') next = SHELL_SPLIT_DEFAULT_RIGHT;
        if (next == null) return;
        e.preventDefault();
        fraction = clampSplitFraction(next, min, max, fraction);
        apply();
        rememberedFraction.set(surfaceId, fraction);
        commit();
    };
    handle.tabIndex = 0;

    handle.addEventListener('mousedown', onDown);
    handle.addEventListener('keydown', onKey);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    parent.appendChild(handle);
    apply();

    return {
        element: handle,
        fraction: () => fraction,
        setFraction(f: number): void {
            if (disposed) return;
            fraction = clampSplitFraction(f, min, max, fraction);
            apply();
            rememberedFraction.set(surfaceId, fraction);
        },
        reapply: apply,
        isDragging: () => dragging,
        dispose(): void {
            if (disposed) return;
            disposed = true;
            if (dragDispose !== null) { dragDispose(); dragDispose = null; }
            handle.removeEventListener('mousedown', onDown);
            handle.removeEventListener('keydown', onKey);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            if (dragging) {
                dragging = false;
                document.body.style.userSelect = '';
                document.body.style.cursor = '';
            }
            // Clear only this handle's OWN marks — see `wroteCanvasWidth` above for the
            // three writers and for why "restore what I found" is the wrong rule here.
            const c = canvas();
            if (c) {
                if (wroteCanvasWidth !== null && c.style.width === wroteCanvasWidth) {
                    c.style.width = '';
                }
                if (wroteCanvasMaxWidth !== null && c.style.maxWidth === wroteCanvasMaxWidth) {
                    c.style.maxWidth = '';
                }
            }
            // The panel IS this handle's own surface, so its width is restored outright.
            surface.style.width = priorSurfaceWidth;
            handle.remove();
        },
    };
}
