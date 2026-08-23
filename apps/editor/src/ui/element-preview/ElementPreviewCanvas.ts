/**
 * ElementPreviewCanvas — §OPENING-SHOWROOM-PREVIEW (L-7720 … L-7728)
 * ===================================================================
 *
 * The mountable widget: a visible 2-D canvas the user can orbit, plus the label
 * strip under it. It owns NO WebGL context — it asks {@link ElementPreviewRenderer}
 * for a blit (see that file for the one-versus-many decision).
 *
 * ── THE PORT ────────────────────────────────────────────────────────────────
 *
 * `mountElementPreview(host, opts) -> ElementPreviewHandle { setSubject, dispose }`.
 * Three methods, no THREE types crossing the boundary, no renderer handle handed
 * out. A panel that wants a showroom needs to know nothing about rendering — the
 * shape `SheetEditorRendererBridge` established for the sheet editor.
 *
 * ── LIFECYCLE, AND IT IS PROVEN NOT ASSERTED ────────────────────────────────
 *
 * `dispose()` removes the listeners, drops the ResizeObserver and calls
 * `releasePreviewMount()`. When the last mounted preview disposes, the shared
 * context is released via `forceContextLoss()`. ⚠ Parking the context instead
 * would be the tempting optimisation and it is the wrong one: a retained context
 * still counts against the browser's live-context cap, and the entry the cap
 * evicts is the OLDEST — the main viewport.
 *
 * ── C43 / C06 ───────────────────────────────────────────────────────────────
 *
 * Keyboard-operable: the canvas is focusable and arrow keys orbit it, so the
 * showroom is not a mouse-only feature. `Home` restores the default view. It
 * carries a real `aria-label` describing what is drawn, because a canvas is
 * otherwise opaque to a screen reader.
 *
 * ── §BRAND ──────────────────────────────────────────────────────────────────
 * White ground, PRYZM purple `#6600FF` for focus and affordances. No black.
 */

import {
    requestPreviewDraw,
    acquirePreviewMount,
    releasePreviewMount,
    previewRigDiagnostics,
    DEFAULT_ORBIT,
    PITCH_LIMIT,
    type OrbitState,
    type PreviewDrawResult,
} from './ElementPreviewRenderer';
import type { PreviewSubject } from './OpeningPreviewSubject';

const PURPLE = '#6600FF';
const LINE = '#d8dce3';
const MUTED = '#5b6472';

/**
 * §OPENING-PREVIEW-HONEST-FAILURE (L-9600) — one sentence per NAMED cause.
 *
 * ⭐⭐ THE BUG THIS REPLACES, BECAUSE IT MUST NOT BE REINTRODUCED. The overlay used
 * to be driven by a pixel probe: 120 ms after mount, read the alpha of the target
 * canvas's top-left 8x8 pixels and, if none of them was opaque, declare *"this
 * browser did not provide a WebGL context."*
 *
 * That probe could not pass. The blit is LETTERBOXED — `drawImage(buf, dx, dy, s, s)`
 * with `s = min(w, h)` and `dx = (w - s) / 2` — so for the showroom's 516 x 172 CSS
 * box the picture starts 172 px from the left edge and the probe reads 164 px of
 * margin that `clearRect` had just wiped. Every pixel it sampled was transparent BY
 * CONSTRUCTION, on a perfect render, in every browser. The founder was shown a false
 * accusation of his own machine while his main viewport was rendering his model in
 * WebGL on the same GPU.
 *
 * Two further consequences, both of which the founder felt as "the preview is dead":
 *  - the overlay LATCHED (`firstDrawChecked`) and nothing ever cleared it, so a later
 *    successful frame could not take the message back down;
 *  - the overlay covers `inset: 0` and had NO `pointer-events: none`, so it swallowed
 *    every pointerdown — the orbit, the zoom and the drag hint that were all already
 *    implemented were unreachable behind it.
 *
 * ⛔ NEVER INFER A RENDER FAILURE FROM PIXELS. The renderer returns
 * {@link PreviewDrawResult} from the draw that actually ran; read that.
 */
const FAILURE_COPY: Record<Exclude<PreviewDrawResult, 'ok'>, string> = {
    'no-webgl':
        'The 3-D preview could not open a WebGL context on this machine. This is a limit of the ' +
        'preview, not of your model — every other control on this dialog still works, and the ' +
        'type you author here is unaffected.',
    'context-lost':
        'The 3-D preview lost its graphics context — usually a driver reset, or the browser ' +
        'reclaiming one. It rebuilds itself on the next change: edit any value, or press ' +
        'Reset view, to bring it back.',
    'no-2d-context':
        'This preview could not get a 2-D drawing surface from the browser. Nothing is wrong ' +
        'with WebGL or with your model; the rest of this dialog is unaffected.',
    'empty-subject':
        'Nothing to draw yet — this type has no members with a size. Set a width and a height ' +
        'below and the preview appears.',
};

export interface ElementPreviewHandle {
    /** Swap what is drawn. Cheap when the subject key is unchanged. */
    setSubject: (subject: PreviewSubject) => void;
    /** Restore the default three-quarter view. */
    resetView: () => void;
    /**
     * The outcome of the most recent draw, or `null` before the first frame has run.
     * Exposed so a host panel can assert the preview is ALIVE rather than assume it —
     * the whole class of defect this widget's L-9600 correction exists to close.
     */
    lastDrawResult: () => PreviewDrawResult | null;
    /** Remove listeners and release the shared context when this was the last mount. */
    dispose: () => void;
    /** The root element, already appended to `host`. */
    readonly el: HTMLElement;
}

export interface ElementPreviewOptions {
    subject: PreviewSubject;
    /** CSS height of the canvas box. Width follows the container. */
    heightPx?: number;
}

/**
 * Mount a navigable 3-D showroom of `subject` inside `host`.
 *
 * Returns a handle even when WebGL is unavailable — in that case the box shows a
 * NAMED reason rather than staying blank, because "the preview failed" and "this
 * type has nothing to draw" must not look the same (§CONTEXT-DATA-HONESTY).
 */
export function mountElementPreview(
    host: HTMLElement,
    opts: ElementPreviewOptions,
): ElementPreviewHandle {
    let subject = opts.subject;
    const orbit: OrbitState = { ...DEFAULT_ORBIT };
    let disposed = false;
    let dragging = false;
    /** The outcome of the most recent draw. Exposed on the handle so a caller can act on it. */
    let lastResult: PreviewDrawResult | null = null;

    const root = document.createElement('div');
    root.className = 'epv-root';
    root.style.cssText = 'margin:0 0 14px;';

    const frame = document.createElement('div');
    frame.className = 'epv-frame';
    frame.style.cssText =
        'position:relative;border:1px solid ' + LINE + ';border-radius:10px;overflow:hidden;' +
        // A very soft neutral gradient reads as a studio sweep and keeps the
        // subject legible whatever its material. Never a black stage.
        'background:linear-gradient(160deg,#ffffff 0%,#f6f4ff 60%,#efeaff 100%);' +
        `height:${opts.heightPx ?? 168}px;`;

    const canvas = document.createElement('canvas');
    canvas.className = 'epv-canvas';
    canvas.tabIndex = 0;
    canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:grab;outline:none;touch-action:none;';
    canvas.setAttribute('role', 'img');

    const focusRing = () => { frame.style.boxShadow = `0 0 0 2px ${PURPLE}33`; frame.style.borderColor = PURPLE; };
    const blurRing = () => { frame.style.boxShadow = 'none'; frame.style.borderColor = LINE; };
    canvas.addEventListener('focus', focusRing);
    canvas.addEventListener('blur', blurRing);

    // The honest-failure overlay. Hidden unless a draw ACTUALLY reports a failure,
    // and re-hidden the moment one succeeds.
    //
    // ⛔ `pointer-events:none` IS LOAD-BEARING, not styling. Without it this element
    // covers the canvas edge to edge and eats every pointerdown, which is exactly how
    // a fully-implemented orbit ended up unreachable behind a message that should
    // never have been shown in the first place.
    const failure = document.createElement('div');
    failure.style.cssText =
        'position:absolute;inset:0;display:none;align-items:center;justify-content:center;' +
        'text-align:center;padding:16px;font-size:11.5px;line-height:1.45;color:' + MUTED + ';' +
        'pointer-events:none;background:rgba(255,255,255,.86);';
    failure.setAttribute('role', 'status');

    const hint = document.createElement('div');
    hint.style.cssText =
        'position:absolute;right:8px;bottom:6px;font-size:10px;color:' + MUTED + ';' +
        'background:rgba(255,255,255,.72);border-radius:999px;padding:2px 8px;pointer-events:none;';
    hint.textContent = 'drag to rotate · scroll to zoom';

    frame.append(canvas, failure, hint);

    const caption = document.createElement('div');
    caption.style.cssText = 'margin-top:6px;font-size:11px;color:' + MUTED + ';display:flex;gap:8px;align-items:center;';
    const captionText = document.createElement('span');
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.textContent = 'Reset view';
    resetBtn.style.cssText =
        'margin-left:auto;font:inherit;font-size:10.5px;padding:1px 8px;border:1px solid ' + LINE + ';' +
        'border-radius:999px;background:#fff;color:' + PURPLE + ';cursor:pointer;font-weight:600;';
    caption.append(captionText, resetBtn);

    root.append(frame, caption);
    host.appendChild(root);

    acquirePreviewMount();

    // ── sizing ───────────────────────────────────────────────────────────────
    function sizeCanvas(): void {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(frame.clientWidth, 1);
        const h = Math.max(frame.clientHeight, 1);
        const nw = Math.round(w * dpr);
        const nh = Math.round(h * dpr);
        if (canvas.width !== nw || canvas.height !== nh) {
            canvas.width = nw;
            canvas.height = nh;
        }
    }

    function describe(): void {
        captionText.textContent = subject.caption;
        canvas.setAttribute(
            'aria-label',
            `3-D preview: ${subject.caption}. ${subject.parts.length} parts. ` +
            'Use the arrow keys to rotate, plus and minus to zoom, Home to reset.',
        );
    }

    /**
     * §OPENING-PREVIEW-HONEST-FAILURE (L-9602) — the overlay is a FUNCTION of the
     * last draw's reported outcome, evaluated on every draw, exactly as
     * `GraphViewport` already does with `requestGraphDraw`'s `onProjected`.
     *
     * ⛔ It does not latch. A preview mounted into a still-detached panel legitimately
     * has no size on its first frame; latching that frame's answer is how a transient
     * condition became a permanent accusation.
     */
    function applyResult(result: PreviewDrawResult): void {
        if (disposed) return;
        lastResult = result;
        if (result === 'ok') {
            failure.style.display = 'none';
            hint.style.display = '';
            canvas.style.cursor = dragging ? 'grabbing' : 'grab';
            return;
        }
        let text = FAILURE_COPY[result];
        // The driver's own words, when there are any. "WebGL is unavailable" and
        // "too many live contexts" are different problems; only one of them is the
        // user's to act on, and hiding the difference is what sent this lane hunting
        // a GPU bug that did not exist.
        const diag = previewRigDiagnostics();
        if (result === 'no-webgl' && diag.lastFailure) {
            text += ` (the browser reported: ${diag.lastFailure})`;
        }
        failure.textContent = text;
        failure.style.display = 'flex';
        // `empty-subject` is not a failure of the viewport, so the navigation
        // affordance stays honest: there is simply nothing to rotate yet.
        hint.style.display = 'none';
        canvas.style.cursor = 'default';
    }

    function draw(): void {
        if (disposed) return;
        sizeCanvas();
        // The outcome comes from the draw that ACTUALLY RAN. Never from the pixels.
        requestPreviewDraw(subject, canvas, orbit, applyResult);
    }

    // ── orbit ────────────────────────────────────────────────────────────────
    let lastX = 0;
    let lastY = 0;

    canvas.addEventListener('pointerdown', (e) => {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        canvas.style.cursor = 'grabbing';
        canvas.setPointerCapture(e.pointerId);
        // The showroom lives inside a modal and inside the inspector; neither should
        // start a marquee or a viewport orbit because the user grabbed the preview.
        e.stopPropagation();
        e.preventDefault();
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        orbit.yaw -= (e.clientX - lastX) * 0.011;
        orbit.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, orbit.pitch + (e.clientY - lastY) * 0.009));
        lastX = e.clientX;
        lastY = e.clientY;
        e.stopPropagation();
        // One draw per frame regardless of how many pointermove events land in it.
        draw();
    });

    const endDrag = (e: PointerEvent): void => {
        if (!dragging) return;
        dragging = false;
        canvas.style.cursor = 'grab';
        try { canvas.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation();
        orbit.zoom = Math.max(0.45, Math.min(3, orbit.zoom * (e.deltaY > 0 ? 1.1 : 0.9)));
        draw();
    }, { passive: false });

    canvas.addEventListener('keydown', (e) => {
        let handled = true;
        switch (e.key) {
            case 'ArrowLeft':  orbit.yaw -= 0.15; break;
            case 'ArrowRight': orbit.yaw += 0.15; break;
            case 'ArrowUp':    orbit.pitch = Math.min(PITCH_LIMIT, orbit.pitch + 0.12); break;
            case 'ArrowDown':  orbit.pitch = Math.max(-PITCH_LIMIT, orbit.pitch - 0.12); break;
            case '+': case '=': orbit.zoom = Math.max(0.45, orbit.zoom * 0.9); break;
            case '-': case '_': orbit.zoom = Math.min(3, orbit.zoom * 1.1); break;
            case 'Home': Object.assign(orbit, DEFAULT_ORBIT); break;
            default: handled = false;
        }
        if (!handled) return;
        // ⚠ The dialog's own Escape/Enter/Tab handling must survive; only the keys
        // this widget actually consumes are swallowed.
        e.preventDefault();
        e.stopPropagation();
        draw();
    });

    resetBtn.addEventListener('click', () => {
        Object.assign(orbit, DEFAULT_ORBIT);
        draw();
    });

    // ── resize ───────────────────────────────────────────────────────────────
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => draw());
        ro.observe(frame);
    }

    // First paint. Whatever the outcome, `applyResult` will have said so by the time
    // the scheduled frame returns — there is no timer, no pixel read and no latch.
    describe();
    sizeCanvas();
    draw();

    return {
        el: root,
        lastDrawResult(): PreviewDrawResult | null {
            return lastResult;
        },
        setSubject(next: PreviewSubject): void {
            subject = next;
            describe();
            draw();
        },
        resetView(): void {
            Object.assign(orbit, DEFAULT_ORBIT);
            draw();
        },
        dispose(): void {
            if (disposed) return;
            disposed = true;
            ro?.disconnect();
            ro = null;
            root.remove();
            releasePreviewMount();
        },
    };
}
