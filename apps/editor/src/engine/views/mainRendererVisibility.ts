/**
 * mainRendererVisibility — §SVP-FITALL-MIRROR-STARVED (L-743) — C04 rendering.
 *
 * ## The bug this exists to fix
 *
 * The founder: *"in the SPLIT VIEW, right-hand side, the Fit All doesn't work."*
 *
 * The split view's right pane in 3D mode is **not a second viewport** — it has no camera
 * and no renderer. `SplitViewManager._render3dMirror()` blits the MAIN 3D canvas
 * (`window.pryzmCanvas`) into the pane every frame (two WebGPU devices would blank the
 * canvas; see the SplitViewManager header). Its only source of pixels is the main
 * renderer actually rendering.
 *
 * Meanwhile `PlanViewManager` — active whenever the LEFT/main pane shows a Canvas2D
 * plan / elevation / section view, which is the founder's exact scenario — sets the main
 * renderer's container to `display: none` as a cost optimisation. A canvas in a
 * `display:none` subtree has no layout box and is not composited, so the mirror blits a
 * stale (or empty) frame forever.
 *
 * Fit All then works PERFECTLY at the model level — `zoom-fit` → `zoomToAll()` moves the
 * shared OBC camera exactly as it does in full 3D — and changes nothing the user can see,
 * because no new frame is ever produced to mirror. "Fit All doesn't work" is really "the
 * mirror is starved".
 *
 * ## The fix
 *
 * Main-renderer visibility gets ONE owner instead of two callers racing on
 * `style.display`. Consumers declare intent:
 *
 *   - `requestHide(reason)` — "I am covering the viewport, you may stop rendering"
 *     (PlanViewManager, while a Canvas2D view is mounted).
 *   - `pin(reason)` — "I am CONSUMING the rendered pixels, you must keep rendering"
 *     (SplitViewManager, while the split pane mirrors the 3D canvas).
 *
 * A pin vetoes a hide. The renderer stays mounted and rendering underneath the Canvas2D
 * overlay that already covers it, so nothing new becomes visible in the main pane — only
 * the mirror gets live frames again.
 *
 * The decision is a pure function so it is unit-testable without a DOM.
 */

import { trace, SpanStatusCode } from '@opentelemetry/api';

const TRACER = trace.getTracer('@pryzm/editor.main-renderer-visibility', '0.1.0');

/**
 * Pure decision: should the main 3D renderer container be hidden?
 *
 * Hidden only when something asked to hide it AND nothing is consuming its pixels.
 * A pin always wins — starving a live consumer is never a valid optimisation.
 *
 * P8: emits `pryzm.main_renderer.should_hide`.
 */
export function shouldHideMainRenderer(
    hideReasons: ReadonlySet<string>,
    pinReasons: ReadonlySet<string>,
): boolean {
    const span = TRACER.startSpan('pryzm.main_renderer.should_hide');
    try {
        const hide = hideReasons.size > 0 && pinReasons.size === 0;
        span.setAttribute('pryzm.main_renderer.hide_reasons', hideReasons.size);
        span.setAttribute('pryzm.main_renderer.pin_reasons', pinReasons.size);
        span.setAttribute('pryzm.main_renderer.hidden', hide);
        span.setStatus({ code: SpanStatusCode.OK });
        return hide;
    } finally {
        span.end();
    }
}

/** Reason tags used across the editor. Kept here so both call sites agree. */
export const MAIN_RENDERER_HIDE_CANVAS2D = 'canvas2d-view';
export const MAIN_RENDERER_PIN_SVP_3D_MIRROR = 'svp-3d-mirror';

/**
 * Single owner of the main 3D renderer container's `display` style.
 *
 * Module singleton rather than a window global (P4). Both consumers are in
 * `apps/editor/src/engine/views/`, so a direct import is the correct seam.
 */
class MainRendererVisibility {
    private _container: HTMLElement | null = null;
    /** The container's own display value before we ever touched it. */
    private _restoreDisplay = '';
    private _captured = false;
    private readonly _hide = new Set<string>();
    private readonly _pin = new Set<string>();

    /** True when the container is currently hidden by this controller. */
    get isHidden(): boolean {
        return shouldHideMainRenderer(this._hide, this._pin);
    }

    /** Reason tags currently requesting a hide (diagnostics / tests). */
    get hideReasons(): ReadonlySet<string> { return this._hide; }
    /** Reason tags currently pinning the renderer visible (diagnostics / tests). */
    get pinReasons(): ReadonlySet<string> { return this._pin; }

    /**
     * Bind the container element. Safe to call repeatedly; re-binding a DIFFERENT element
     * restores the previous one first so no container is left stranded hidden.
     */
    setContainer(el: HTMLElement | null): void {
        if (el === this._container) return;
        if (this._container && this._captured) {
            this._container.style.display = this._restoreDisplay;
        }
        this._container = el;
        this._captured = false;
        this._restoreDisplay = '';
        this._apply();
    }

    requestHide(reason: string): void {
        this._hide.add(reason);
        this._apply();
    }

    releaseHide(reason: string): void {
        this._hide.delete(reason);
        this._apply();
    }

    /** Declare that something is consuming the rendered pixels — vetoes any hide. */
    pin(reason: string): void {
        this._pin.add(reason);
        this._apply();
    }

    unpin(reason: string): void {
        this._pin.delete(reason);
        this._apply();
    }

    /** Test seam — drop all reasons and unbind. */
    reset(): void {
        this._hide.clear();
        this._pin.clear();
        this.setContainer(null);
    }

    private _apply(): void {
        const el = this._container;
        if (!el) return;
        const hide = this.isHidden;
        if (hide) {
            if (!this._captured) {
                this._restoreDisplay = el.style.display;
                this._captured = true;
            }
            el.style.display = 'none';
        } else if (this._captured) {
            el.style.display = this._restoreDisplay;
            this._captured = false;
            this._restoreDisplay = '';
        }
    }
}

/** The one controller. */
export const mainRendererVisibility = new MainRendererVisibility();
