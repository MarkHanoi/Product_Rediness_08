/**
 * mirrorFit — §FIX-SPLIT-3D-MIRROR (L-96) — C04 rendering.
 *
 * Pure geometry for the split-view 3D pane, which is a faithful MIRROR of the main
 * 3D viewport: every SVP frame the main 3D canvas (`window.pryzmCanvas`) is blitted
 * into the SVP canvas, so the pane always reflects the main 3D state (geometry, camera,
 * selection, edits) with no second renderer (two WebGPU devices would blank the canvas —
 * see SplitViewManager header).
 *
 * The previous mirror stretched the main canvas to fill the SVP pane (`drawImage(src,0,0,
 * bw,bh)`), distorting the view whenever the pane aspect ≠ the main-viewport aspect (the
 * founder's "visual drift"), and click-forwarding assumed that full-stretch mapping. This
 * module makes the mirror ASPECT-CORRECT (contain-fit / letterbox) and gives the click
 * path the EXACT inverse mapping, so a pick in the split 3D pane lands on the precise
 * main-canvas pixel under the cursor. Pure functions → unit-testable without a canvas.
 */

import { trace } from '@opentelemetry/api';

const _mirrorFitTracer = trace.getTracer('@pryzm/editor.mirror-fit', '0.1.0');

export interface ContainFit {
    /** Destination x offset (letterbox/pillarbox bar) in destination units. */
    dx: number;
    /** Destination y offset. */
    dy: number;
    /** Fitted image width in destination units. */
    dw: number;
    /** Fitted image height in destination units. */
    dh: number;
    /** Uniform scale applied to the source. */
    scale: number;
}

/**
 * Aspect-preserving "contain" fit of a `srcW×srcH` image centred inside a `dstW×dstH`
 * box (the CSS `object-fit: contain` rule). Returns the centred destination rect + the
 * uniform scale. Scale-invariant: only the two aspect ratios matter, so the same result
 * is valid whether the inputs are device pixels (the blit) or CSS pixels (the click map).
 *
 * P8: emits `pryzm.mirror.contain_fit`.
 */
export function computeContainFit(srcW: number, srcH: number, dstW: number, dstH: number): ContainFit {
    return _mirrorFitTracer.startActiveSpan('pryzm.mirror.contain_fit', (span) => {
        try {
            if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) {
                span.setAttribute('pryzm.mirror.degenerate', true);
                return { dx: 0, dy: 0, dw: Math.max(0, dstW), dh: Math.max(0, dstH), scale: 1 };
            }
            const scale = Math.min(dstW / srcW, dstH / srcH);
            const dw = srcW * scale;
            const dh = srcH * scale;
            const dx = (dstW - dw) / 2;
            const dy = (dstH - dh) / 2;
            span.setAttribute('pryzm.mirror.scale', scale);
            return { dx, dy, dw, dh, scale };
        } catch (err) {
            span.recordException(err as Error);
            throw err;
        } finally {
            span.end();
        }
    });
}

export interface SourceRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

/**
 * Map a point on the split-view 3D pane (pane-relative CSS px) to the equivalent CLIENT
 * coordinate on the main 3D canvas, accounting for the contain-fit letterbox. Returns
 * null when the point falls in a letterbox bar (outside the mirrored image), so a pick
 * there is correctly ignored rather than resolving to an edge pixel.
 *
 * @param cx,cy    Click position relative to the SVP canvas (CSS px).
 * @param svpW,svpH SVP canvas CSS size.
 * @param mainRect Live bounding rect of the main 3D canvas (CSS px, from getBoundingClientRect).
 *
 * P8: emits `pryzm.mirror.map_client_to_source`.
 */
export function mapMirrorClientToSourceClient(
    cx: number,
    cy: number,
    svpW: number,
    svpH: number,
    mainRect: SourceRect,
): { clientX: number; clientY: number } | null {
    return _mirrorFitTracer.startActiveSpan('pryzm.mirror.map_client_to_source', (span) => {
        try {
            if (svpW <= 0 || svpH <= 0 || mainRect.width <= 0 || mainRect.height <= 0) {
                span.setAttribute('pryzm.mirror.invalid_rect', true);
                return null;
            }
            // The mirror shows the main viewport (mainRect aspect) contain-fitted into the pane.
            const fit = computeContainFit(mainRect.width, mainRect.height, svpW, svpH);
            const fracX = (cx - fit.dx) / fit.dw;
            const fracY = (cy - fit.dy) / fit.dh;
            span.setAttribute('pryzm.mirror.frac_x', fracX);
            span.setAttribute('pryzm.mirror.frac_y', fracY);
            if (fracX < 0 || fracX > 1 || fracY < 0 || fracY > 1) {
                // Click landed in a letterbox bar — no mirrored pixel there.
                span.setAttribute('pryzm.mirror.in_letterbox', true);
                return null;
            }
            return {
                clientX: mainRect.left + fracX * mainRect.width,
                clientY: mainRect.top + fracY * mainRect.height,
            };
        } catch (err) {
            span.recordException(err as Error);
            return null;
        } finally {
            span.end();
        }
    });
}
