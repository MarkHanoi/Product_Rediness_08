/**
 * RendererSwapOverlay.spec.ts — §FEAT-SWAP-LOADING-OVERLAY (L-141)
 *
 * Verifies the show/hide + ref-count + finally-safety contract of the renderer
 * live-swap loading overlay. Pure DOM (happy-dom) — no engine/renderer imports.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    showRendererSwapOverlay,
    hideRendererSwapOverlay,
    __resetRendererSwapOverlayForTest,
} from '../RendererSwapOverlay';

const OVERLAY_ID = 'pryzm-renderer-swap-overlay';

function overlay(): HTMLElement | null {
    return document.getElementById(OVERLAY_ID);
}

describe('RendererSwapOverlay §FEAT-SWAP-LOADING-OVERLAY', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        __resetRendererSwapOverlayForTest();
    });
    afterEach(() => {
        __resetRendererSwapOverlayForTest();
        vi.useRealTimers();
    });

    it('shows a full-viewport overlay with the requested message', () => {
        expect(overlay()).toBeNull();
        showRendererSwapOverlay('Switching renderer…');
        const el = overlay();
        expect(el).not.toBeNull();
        expect(el!.style.display).toBe('flex');
        expect(el!.style.opacity).toBe('1');
        expect(el!.textContent).toContain('Switching renderer…');
    });

    it('updates the label per show() call (swap vs recovery messages)', () => {
        showRendererSwapOverlay('Switching renderer…');
        expect(overlay()!.textContent).toContain('Switching renderer…');
        showRendererSwapOverlay('Recovering renderer…');
        expect(overlay()!.textContent).toContain('Recovering renderer…');
    });

    it('hides after the fade once the single holder releases', () => {
        showRendererSwapOverlay();
        hideRendererSwapOverlay();
        const el = overlay()!;
        expect(el.style.opacity).toBe('0');
        // display flips to none only after the fade timer elapses.
        vi.advanceTimersByTime(500);
        expect(el.style.display).toBe('none');
    });

    it('ref-counts: overlay stays visible until BOTH holders release', () => {
        showRendererSwapOverlay('Switching renderer…');   // holder 1 (manual swap)
        showRendererSwapOverlay('Recovering renderer…');  // holder 2 (device-loss)
        const el = overlay()!;

        hideRendererSwapOverlay();          // release holder 2
        vi.advanceTimersByTime(500);
        expect(el.style.display).toBe('flex'); // still up — holder 1 remains

        hideRendererSwapOverlay();          // release holder 1
        expect(el.style.opacity).toBe('0');
        vi.advanceTimersByTime(500);
        expect(el.style.display).toBe('none');
    });

    it('over-calling hide never drives the count negative (stays hidden)', () => {
        showRendererSwapOverlay();
        hideRendererSwapOverlay();
        hideRendererSwapOverlay(); // extra hide — must not throw or wedge state
        vi.advanceTimersByTime(500);
        expect(overlay()!.style.display).toBe('none');

        // A subsequent show must still work (count was floored at 0, not negative).
        showRendererSwapOverlay();
        expect(overlay()!.style.display).toBe('flex');
    });

    it('safety backstop force-hides if a caller ever forgets its finally', () => {
        showRendererSwapOverlay();
        // No paired hide — simulate a swallowed finally. The backstop must clear it.
        vi.advanceTimersByTime(20_001);
        const el = overlay()!;
        expect(el.style.display).toBe('none');
    });
});
