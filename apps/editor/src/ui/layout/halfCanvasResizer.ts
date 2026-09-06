/**
 * halfCanvasResizer.ts — §SHELL-SPLIT-DRAG (founder 2026-09-06 · L-12983)
 *
 * Layer Affected:  UI — shell layout (L7)
 * File:            apps/editor/src/ui/layout/halfCanvasResizer.ts
 * Strategy:        STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §24.1 item 2 · §25.0
 * Contracts:       C06 §15 (float budget) · C59 §2 · C84 EI-9 (one owner per rule)
 * Issue log:       L-12983
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
 * That edge is not one element. It is TWO surfaces that have to move together or the
 * drag tears:
 *
 *   · the VIEW REGION (`#container` today) — sized by `viewRegionGeometry`, the ONE
 *     owner of its box (C59 §2 invariant 10 / §2.10, L-13030);
 *   · `#anl-surface` (Analysis) / `#aud-stack` (Inspect) — `position: fixed;
 *     right: 0; width: 50%` in their own sheets.
 *
 * ⭐ SO THIS CONTROL DECLARES ONE FRACTION AND WRITES ONE BOX. It calls
 * `setViewRegionPanelDrag(f)` — the panel's share of the shell — and the owner derives
 * the region's width (and, if a split is open, both pane boxes inside it) from that.
 * The surface's own width comes back from `viewRegionPanelWidth()`, so the two edges
 * are two renderings of ONE number and cannot disagree.
 *
 * ⛔ IT USED TO WRITE `#container.style.width` + `maxWidth` DIRECTLY, and was the third
 * of seven writers of that property. The bookkeeping that required — remembering the
 * exact strings it last wrote so `dispose()` could clear only its own marks — is gone
 * with the second owner; see `apply()`.
 *
 * The founder's "the same" is honoured by SHARING THE ARITHMETIC (`shellSplitRatio.ts`),
 * not by copying the loop: the clamp has one owner instead of the two spellings that
 * were already in the tree.
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
 * ⛔ NO STORE WRITES (P6), no THREE (P2), no `(window as any)` (P4) — this file writes
 * the SURFACE's own width and the handle's own position, and nothing else. The view
 * region is `viewRegionGeometry`'s, and releasing the drag on dispose returns it to
 * whatever the workspace mode claims, so a control that mounts and unmounts with a tab
 * can never leave the shell narrower than it started.
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';
// §VIEW-REGION-HAS-ONE-OWNER (C59 §2 invariant 10 / §2.10 · L-13030) — this handle is a
// CLAIMANT on the shell, not a writer of `#container`'s box. See `apply()` below.
import { setViewRegionPanelDrag, viewRegionPanelWidth } from './viewRegionGeometry';
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

    const priorSurfaceWidth = surface.style.width;

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

    /**
     * ⭐ §VIEW-REGION-HAS-ONE-OWNER (C59 §2 invariant 10 / §2.10 · L-13030) — THE DRAG
     * DECLARES THE PANEL'S SHARE. IT DOES NOT WRITE THE VIEW REGION'S BOX.
     *
     * ⛔ WHAT THIS REPLACED, AND WHY THE OLD SHAPE WAS UNFIXABLE IN PLACE. This function
     * used to write `#container.style.width` AND `maxWidth` itself, and `dispose()` had to
     * clear them only while they still held the exact string this handle last wrote —
     * because three other modules wrote the same two properties and "restore what I found"
     * and "clear everything" were each wrong in a different state. That whole apparatus was
     * a protocol substitute for an owner. With one owner there is no bookkeeping: the drag
     * sets the claim, and whoever declares the next claim (a mode switch) overrides it by
     * construction.
     *
     * The SURFACE's own width is still written here — that is the panel's own box, one
     * level down from the region, and the owner hands back the matching expression so the
     * two edges cannot disagree.
     */
    const apply = (): void => {
        if (disposed) return;
        setViewRegionPanelDrag(fraction);
        handle.style.right = percent(fraction);
        try {
            surface.style.width = viewRegionPanelWidth();
        } catch { /* a surface removed mid-drag is not a reason to fail a drag */ }
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
            // §VIEW-REGION-HAS-ONE-OWNER — release the DRAG OVERRIDE and the region falls
            // back to whatever the workspace mode currently claims. There is nothing to
            // "restore": this handle never held the region's box, so it cannot leave a mark
            // on it, which is the class of bug the old conditional-clear existed to survive.
            setViewRegionPanelDrag(null);
            // The panel IS this handle's own surface, so its width is restored outright.
            surface.style.width = priorSurfaceWidth;
            handle.remove();
        },
    };
}
