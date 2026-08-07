/**
 * mainRendererVisibility — §SVP-FITALL-MIRROR-STARVED (L-743) — C04.
 *
 * The founder: *"in the SPLIT VIEW, right-hand side, the Fit All doesn't work."*
 *
 * The split view's 3D pane has no camera and no renderer — it blits the MAIN 3D canvas.
 * PlanViewManager hid the main renderer container (`display:none`) whenever a Canvas2D
 * plan / elevation view was mounted, which is precisely the founder's layout, so the
 * mirror was starved of frames: Fit All moved the shared camera correctly and nothing on
 * screen changed.
 *
 * These pin the arbitration, not pixels: a consumer of the rendered pixels VETOES the
 * hide, and the hide resumes the moment the consumer goes away.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    shouldHideMainRenderer,
    mainRendererVisibility,
    MAIN_RENDERER_HIDE_CANVAS2D,
    MAIN_RENDERER_PIN_SVP_3D_MIRROR,
} from '../views/mainRendererVisibility';

describe('shouldHideMainRenderer — pure arbitration', () => {
    it('no reasons → visible', () => {
        expect(shouldHideMainRenderer(new Set(), new Set())).toBe(false);
    });

    it('a hide request with no consumer → hidden', () => {
        expect(shouldHideMainRenderer(new Set(['canvas2d-view']), new Set())).toBe(true);
    });

    it('a pin VETOES the hide — starving a live consumer is never a valid optimisation', () => {
        expect(shouldHideMainRenderer(new Set(['canvas2d-view']), new Set(['svp-3d-mirror']))).toBe(false);
    });

    it('a pin alone does not hide anything', () => {
        expect(shouldHideMainRenderer(new Set(), new Set(['svp-3d-mirror']))).toBe(false);
    });
});

describe('mainRendererVisibility — the founder\'s split-view sequence', () => {
    let container: HTMLElement;

    beforeEach(() => {
        mainRendererVisibility.reset();
        container = document.createElement('div');
        container.style.display = 'block';
        mainRendererVisibility.setContainer(container);
    });

    it('a Canvas2D view alone hides the main renderer (the cost optimisation still holds)', () => {
        mainRendererVisibility.requestHide(MAIN_RENDERER_HIDE_CANVAS2D);
        expect(container.style.display).toBe('none');
    });

    it('§FIX: with the split pane mirroring 3D, the Canvas2D view no longer starves it', () => {
        // Founder's sequence: elevation view is open (Canvas2D), then the right pane is
        // switched to "3D View" — the mirror needs live frames from the main canvas.
        mainRendererVisibility.requestHide(MAIN_RENDERER_HIDE_CANVAS2D);
        expect(container.style.display).toBe('none');

        mainRendererVisibility.pin(MAIN_RENDERER_PIN_SVP_3D_MIRROR);
        expect(mainRendererVisibility.isHidden).toBe(false);
        expect(container.style.display).toBe('block');   // original value restored, not blanked
    });

    it('order-independent: pinning first, then opening a Canvas2D view, still keeps it rendering', () => {
        mainRendererVisibility.pin(MAIN_RENDERER_PIN_SVP_3D_MIRROR);
        mainRendererVisibility.requestHide(MAIN_RENDERER_HIDE_CANVAS2D);
        expect(container.style.display).toBe('block');
    });

    it('switching the split pane back to a plan view releases the pin and the hide resumes', () => {
        mainRendererVisibility.requestHide(MAIN_RENDERER_HIDE_CANVAS2D);
        mainRendererVisibility.pin(MAIN_RENDERER_PIN_SVP_3D_MIRROR);
        mainRendererVisibility.unpin(MAIN_RENDERER_PIN_SVP_3D_MIRROR);
        expect(container.style.display).toBe('none');
    });

    it('leaving the Canvas2D view restores the container to its ORIGINAL display value', () => {
        mainRendererVisibility.requestHide(MAIN_RENDERER_HIDE_CANVAS2D);
        mainRendererVisibility.releaseHide(MAIN_RENDERER_HIDE_CANVAS2D);
        expect(container.style.display).toBe('block');
    });

    it('re-binding a different container releases the previous one — no stranded hidden node', () => {
        mainRendererVisibility.requestHide(MAIN_RENDERER_HIDE_CANVAS2D);
        expect(container.style.display).toBe('none');

        const next = document.createElement('div');
        next.style.display = 'flex';
        mainRendererVisibility.setContainer(next);

        expect(container.style.display).toBe('block');   // old one handed back intact
        expect(next.style.display).toBe('none');         // hide reason still standing
    });

    it('repeated requests are idempotent (reason-keyed, not counted)', () => {
        mainRendererVisibility.requestHide(MAIN_RENDERER_HIDE_CANVAS2D);
        mainRendererVisibility.requestHide(MAIN_RENDERER_HIDE_CANVAS2D);
        mainRendererVisibility.releaseHide(MAIN_RENDERER_HIDE_CANVAS2D);
        expect(container.style.display).toBe('block');
    });
});
