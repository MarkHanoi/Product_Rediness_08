// §SHEET-3D-CAPTURE-IS-NOT-A-DRAWING (L-1843)
//
// The founder: a {3D} viewport on a sheet rendered as a "near-black navy box".
//
// ROOT CAUSE pinned here. `_render3DCapture` decided whether the live renderer
// surface carried anything by walking its raw RGBA bytes and accepting the
// frame on `data[i] > 0` for ANY index — INCLUDING every 4th byte, the alpha
// channel. A WebGL canvas whose render pass was refused holds an opaque BLACK
// image: `(0,0,0,255)` repeated. Alpha 255 tripped the check on the very first
// pixel, so a frame with no content at all was accepted as content and blitted
// over a `#0f1520` fill — which is the navy the founder saw.
//
// The predicate could only ever have returned false for a fully TRANSPARENT
// surface, which is not what a cleared framebuffer looks like.
//
// These tests are written against the RGBA buffer rather than a canvas on
// purpose: happy-dom has no WebGL backend, so a canvas-level test could not
// produce the failing frame and would prove nothing.

import { describe, it, expect } from 'vitest';
import { rgbaHasColour } from './ViewportPreviewRenderer.js';

/** n pixels of a single RGBA colour. */
function pixels(n: number, r: number, g: number, b: number, a: number): Uint8ClampedArray {
    const out = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
        out[i * 4 + 0] = r;
        out[i * 4 + 1] = g;
        out[i * 4 + 2] = b;
        out[i * 4 + 3] = a;
    }
    return out;
}

describe('§SHEET-3D-CAPTURE-IS-NOT-A-DRAWING — blank detection (L-1843)', () => {
    it('REGRESSION: an OPAQUE BLACK frame is NOT content', () => {
        // The exact bug. Alpha=255 everywhere; the old predicate returned true.
        expect(rgbaHasColour(pixels(1024, 0, 0, 0, 255))).toBe(false);
    });

    it('a fully transparent frame is not content', () => {
        expect(rgbaHasColour(pixels(1024, 0, 0, 0, 0))).toBe(false);
    });

    it('alpha alone can never make a frame count as content', () => {
        // Sweep every alpha value against zero colour. Not one may pass.
        for (let a = 0; a <= 255; a += 5) {
            expect(rgbaHasColour(pixels(4, 0, 0, 0, a))).toBe(false);
        }
    });

    it('a genuinely rendered frame IS content', () => {
        expect(rgbaHasColour(pixels(64, 120, 140, 180, 255))).toBe(true);
    });

    it('detects content in a single coloured pixel among black ones', () => {
        const data = pixels(256, 0, 0, 0, 255);
        data[200 * 4 + 1] = 200;          // one green pixel
        expect(rgbaHasColour(data)).toBe(true);
    });

    it('near-black codec noise stays below the threshold', () => {
        // A dark-but-not-empty frame must not be discarded, but values at or
        // under the noise floor must not resurrect the original bug.
        expect(rgbaHasColour(pixels(64, 5, 5, 5, 255))).toBe(false);
        expect(rgbaHasColour(pixels(64, 30, 30, 30, 255))).toBe(true);
    });

    it('an empty buffer is not content', () => {
        expect(rgbaHasColour(new Uint8ClampedArray(0))).toBe(false);
    });
});
