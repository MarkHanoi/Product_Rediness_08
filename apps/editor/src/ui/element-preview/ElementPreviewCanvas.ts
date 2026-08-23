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
    DEFAULT_ORBIT,
    PITCH_LIMIT,
    type OrbitState,
} from './ElementPreviewRenderer';
import type { PreviewSubject } from './OpeningPreviewSubject';

const PURPLE = '#6600FF';
const LINE = '#d8dce3';
const MUTED = '#5b6472';

export interface ElementPreviewHandle {
    /** Swap what is drawn. Cheap when the subject key is unchanged. */
    setSubject: (subject: PreviewSubject) => void;
    /** Restore the default three-quarter view. */
    resetView: () => void;
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

    // The honest-failure overlay. Hidden unless a draw actually fails.
    const failure = document.createElement('div');
    failure.style.cssText =
        'position:absolute;inset:0;display:none;align-items:center;justify-content:center;' +
        'text-align:center;padding:16px;font-size:11.5px;line-height:1.45;color:' + MUTED + ';';
    failure.textContent =
        '3-D preview unavailable — this browser did not provide a WebGL context. ' +
        'Every other control on this dialog still works.';

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

    function draw(): void {
        if (disposed) return;
        sizeCanvas();
        requestPreviewDraw(subject, canvas, orbit);
        // The renderer reports failure through its return value inside the frame;
        // the cheapest honest signal here is whether a context could be made at all.
        // `requestPreviewDraw` is fire-and-forget, so the overlay is driven by the
        // first draw attempt below.
    }

    // ── orbit ────────────────────────────────────────────────────────────────
    let dragging = false;
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

    // First paint. If no context can be made the overlay says so, once.
    describe();
    sizeCanvas();
    let firstDrawChecked = false;
    function firstDraw(): void {
        draw();
        if (firstDrawChecked) return;
        firstDrawChecked = true;
        // Give the scheduled frame a chance to land, then check whether the canvas
        // received anything. A never-drawn canvas stays at its initial transparent
        // state, which is exactly what "no context" looks like.
        setTimeout(() => {
            if (disposed) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) { failure.style.display = 'flex'; hint.style.display = 'none'; return; }
            try {
                const px = ctx.getImageData(0, 0, Math.min(canvas.width, 8), Math.min(canvas.height, 8)).data;
                const anything = Array.from(px).some((v, i) => i % 4 === 3 && v > 0);
                if (!anything) {
                    // Nothing at all landed — including no alpha. Report it rather than
                    // leaving a blank purple-white box the user cannot interpret.
                    failure.style.display = 'flex';
                    hint.style.display = 'none';
                }
            } catch {
                /* getImageData can throw in restricted contexts; not a reason to shout */
            }
        }, 120);
    }
    firstDraw();

    return {
        el: root,
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
