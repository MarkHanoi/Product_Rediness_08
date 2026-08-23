/**
 * §OPENING-PREVIEW-HONEST-FAILURE (L-9600 … L-9603)
 * =================================================
 *
 * The founder's dialog said *"3-D preview unavailable — this browser did not
 * provide a WebGL context"* while his own viewport was rendering his model in
 * WebGL on the same GPU. The cause was NOT the GPU, the driver, the context cap or
 * a device loss: it was the DETECTOR.
 *
 * `ElementPreviewCanvas` inferred failure by sampling the alpha of the target
 * canvas's top-left 8x8 pixels 120 ms after mount. The blit is letterboxed —
 * `drawImage(buf, dx, dy, s, s)` with `s = min(w, h)`, `dx = (w - s) / 2` — so on
 * the showroom's 516 x 172 box the picture starts 172 px in and the probe read
 * 164 px of margin `clearRect` had just wiped. It returned "nothing here" on a
 * PERFECT render, latched, and then swallowed the orbit drags behind an overlay
 * that had no `pointer-events: none`.
 *
 * These tests pin the correction at the layer the founder experiences: the overlay
 * is a function of the RENDERER'S REPORTED OUTCOME, it names which failure
 * happened, it un-shows itself when a later frame succeeds, and it never blocks
 * the pointer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PreviewDrawResult } from '../ElementPreviewRenderer';
import type { PreviewSubject } from '../OpeningPreviewSubject';

/** The outcome the stubbed renderer will report for the next draw. */
let nextResult: PreviewDrawResult = 'ok';
let drawCalls = 0;

vi.mock('../ElementPreviewRenderer', () => ({
    DEFAULT_ORBIT: Object.freeze({ yaw: -0.62, pitch: 0.22, zoom: 1 }),
    PITCH_LIMIT: 1.35,
    acquirePreviewMount: () => {},
    releasePreviewMount: () => {},
    previewRigDiagnostics: () => ({
        held: false, lost: false, mounts: 0, contextLosses: 0,
        lastFailure: 'CONTEXT_LOST_WEBGL',
    }),
    // Synchronous on purpose: the real one goes through the frame scheduler, and
    // what is under test is the CONSUMER of the result, not the scheduling.
    requestPreviewDraw: (
        _s: PreviewSubject,
        _t: HTMLCanvasElement,
        _o: unknown,
        onResult?: (r: PreviewDrawResult) => void,
    ) => {
        drawCalls++;
        onResult?.(nextResult);
    },
}));

const { mountElementPreview } = await import('../ElementPreviewCanvas');

const SUBJECT: PreviewSubject = {
    key: 'test-subject-1',
    parts: [{ name: 'frame', size: [1, 1, 0.1], center: [0, 0.5, 0], materialId: 'wood-oak' }],
    extent: [1, 1, 0.1],
    caption: '1.00 × 1.00 m',
};

function overlayOf(host: HTMLElement): HTMLElement {
    // The failure overlay is the element carrying role="status" inside the frame.
    const el = host.querySelector('[role="status"]');
    expect(el, 'the honest-failure overlay must exist').not.toBeNull();
    return el as HTMLElement;
}

describe('§OPENING-PREVIEW-HONEST-FAILURE — the overlay reports, it does not guess', () => {
    let host: HTMLElement;

    beforeEach(() => {
        drawCalls = 0;
        nextResult = 'ok';
        host = document.createElement('div');
        document.body.appendChild(host);
    });
    afterEach(() => { host.remove(); });

    it('a SUCCESSFUL draw shows no failure message at all', () => {
        // ⭐ THE REGRESSION TEST FOR THE FOUNDER'S SCREENSHOT. Under the old pixel
        // probe this case produced the "did not provide a WebGL context" message,
        // because the pixels it sampled are transparent whenever the box is wider
        // than it is tall — which the showroom's box always is.
        const h = mountElementPreview(host, { subject: SUBJECT });
        expect(drawCalls).toBeGreaterThan(0);
        expect(h.lastDrawResult()).toBe('ok');
        expect(overlayOf(host).style.display).toBe('none');
        h.dispose();
    });

    it('the overlay NEVER blocks the pointer, even when it is showing', () => {
        // Without this the orbit, the zoom and the drag hint are unreachable behind
        // a message — which is how a fully-implemented navigation shipped dead.
        nextResult = 'no-webgl';
        const h = mountElementPreview(host, { subject: SUBJECT });
        const o = overlayOf(host);
        expect(o.style.display).toBe('flex');
        expect(o.style.pointerEvents).toBe('none');
        h.dispose();
    });

    it('NAMES which failure happened — the four causes are not one message', () => {
        const seen = new Map<PreviewDrawResult, string>();
        for (const r of ['no-webgl', 'context-lost', 'no-2d-context', 'empty-subject'] as const) {
            nextResult = r;
            const h = mountElementPreview(host, { subject: SUBJECT });
            seen.set(r, overlayOf(host).textContent ?? '');
            h.dispose();
        }
        const texts = [...seen.values()];
        expect(new Set(texts).size, 'each cause must read differently').toBe(4);
        // A lost context is RECOVERABLE and says so; "no WebGL" must not claim that.
        expect(seen.get('context-lost')).toMatch(/rebuilds itself/i);
        // "nothing to draw" must never read as "the renderer failed".
        expect(seen.get('empty-subject')).toMatch(/Nothing to draw/i);
        expect(seen.get('empty-subject')).not.toMatch(/WebGL/i);
        // A 2-D surface failure must not be blamed on WebGL — the old message's
        // second lie.
        expect(seen.get('no-2d-context')).toMatch(/Nothing is wrong.*WebGL/i);
    });

    it('carries the driver’s own words when there are any', () => {
        nextResult = 'no-webgl';
        const h = mountElementPreview(host, { subject: SUBJECT });
        expect(overlayOf(host).textContent).toContain('CONTEXT_LOST_WEBGL');
        h.dispose();
    });

    it('DOES NOT LATCH — a later successful frame takes the message back down', () => {
        // The old probe ran once and set a flag; a preview that failed its first frame
        // (a panel still detached, so the canvas had no size) stayed accusatory for the
        // life of the dialog even after it started rendering correctly.
        nextResult = 'no-webgl';
        const h = mountElementPreview(host, { subject: SUBJECT });
        expect(overlayOf(host).style.display).toBe('flex');

        nextResult = 'ok';
        h.resetView();
        expect(overlayOf(host).style.display).toBe('none');
        expect(h.lastDrawResult()).toBe('ok');
        h.dispose();
    });

    it('re-evaluates on every draw, in both directions', () => {
        const h = mountElementPreview(host, { subject: SUBJECT });
        expect(overlayOf(host).style.display).toBe('none');
        nextResult = 'context-lost';
        h.resetView();
        expect(overlayOf(host).style.display).toBe('flex');
        nextResult = 'ok';
        h.resetView();
        expect(overlayOf(host).style.display).toBe('none');
        h.dispose();
    });

    it('the navigation hint is visible exactly when navigation is possible', () => {
        const h = mountElementPreview(host, { subject: SUBJECT });
        const hint = host.querySelector('.epv-frame > div:last-child') as HTMLElement;
        expect(hint.textContent).toMatch(/drag to rotate/);
        expect(hint.style.display).not.toBe('none');
        nextResult = 'no-webgl';
        h.resetView();
        expect(hint.style.display).toBe('none');
        h.dispose();
    });
});
