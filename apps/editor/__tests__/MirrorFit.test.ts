// @vitest-environment happy-dom
//
// §FIX-SPLIT-3D-MIRROR (L-96) — the split-view 3D pane is a faithful, aspect-correct
// mirror of the main 3D viewport, and a pick in that pane maps to the EXACT main-canvas
// pixel under the cursor (so selection resolves the right element, no stale-anchor drift).
//
// Before this fix the mirror stretched the main canvas to fill the pane and the click
// path assumed that full-stretch mapping — so on any aspect mismatch the view was
// distorted and forwarded clicks landed on the wrong pixel. These pure-geometry helpers
// are the load-bearing part; this suite pins their exactness.

import { describe, it, expect } from 'vitest';
import { computeContainFit, mapMirrorClientToSourceClient } from '../src/engine/views/mirrorFit';

describe('§FIX-SPLIT-3D-MIRROR (L-96) — computeContainFit (aspect-correct letterbox)', () => {
    it('letterboxes a wide source in a square pane (bars top/bottom)', () => {
        const fit = computeContainFit(2000, 1000, 500, 500);
        expect(fit.scale).toBeCloseTo(0.25, 6);
        expect(fit.dw).toBeCloseTo(500, 6);
        expect(fit.dh).toBeCloseTo(250, 6);
        expect(fit.dx).toBeCloseTo(0, 6);
        expect(fit.dy).toBeCloseTo(125, 6);   // (500-250)/2
    });

    it('pillarboxes a tall source in a square pane (bars left/right)', () => {
        const fit = computeContainFit(1000, 2000, 500, 500);
        expect(fit.scale).toBeCloseTo(0.25, 6);
        expect(fit.dw).toBeCloseTo(250, 6);
        expect(fit.dh).toBeCloseTo(500, 6);
        expect(fit.dx).toBeCloseTo(125, 6);
        expect(fit.dy).toBeCloseTo(0, 6);
    });

    it('is degenerate-safe (zero/negative dims → no NaN)', () => {
        const fit = computeContainFit(0, 0, 500, 400);
        expect(Number.isFinite(fit.dx)).toBe(true);
        expect(Number.isFinite(fit.dw)).toBe(true);
    });
});

describe('§FIX-SPLIT-3D-MIRROR (L-96) — mapMirrorClientToSourceClient (exact inverse)', () => {
    const main = { left: 0, top: 0, width: 2000, height: 1000 };

    it('maps the centre of the mirrored image to the centre of the main canvas', () => {
        // Pane 500×500, wide main → letterbox dy=125, dh=250. Image centre = (250, 250).
        const p = mapMirrorClientToSourceClient(250, 250, 500, 500, main)!;
        expect(p).not.toBeNull();
        expect(p.clientX).toBeCloseTo(1000, 6);   // 0.5 · 2000
        expect(p.clientY).toBeCloseTo(500, 6);     // 0.5 · 1000
    });

    it('maps the top-left corner of the mirrored image to the main top-left', () => {
        // Image top-left = (dx, dy) = (0, 125).
        const p = mapMirrorClientToSourceClient(0, 125, 500, 500, main)!;
        expect(p.clientX).toBeCloseTo(0, 6);
        expect(p.clientY).toBeCloseTo(0, 6);
    });

    it('honours the live main-canvas rect offset (left/top)', () => {
        const offsetMain = { left: 300, top: 40, width: 2000, height: 1000 };
        const p = mapMirrorClientToSourceClient(250, 250, 500, 500, offsetMain)!;
        expect(p.clientX).toBeCloseTo(300 + 1000, 6);
        expect(p.clientY).toBeCloseTo(40 + 500, 6);
    });

    it('returns null for a click in a letterbox bar (no mirrored pixel there)', () => {
        // Top bar spans y ∈ [0,125); a click at y=50 has no source pixel.
        expect(mapMirrorClientToSourceClient(250, 50, 500, 500, main)).toBeNull();
        // Bottom bar y ∈ (375,500].
        expect(mapMirrorClientToSourceClient(250, 460, 500, 500, main)).toBeNull();
    });

    it('is a stable exact inverse across an aspect mismatch (quarter point round-trips)', () => {
        // Quarter across the mirrored image width, top edge.
        // dx=0, dw=500 → cx=125 ⇒ fracX=0.25; cy=dy=125 ⇒ fracY=0.
        const p = mapMirrorClientToSourceClient(125, 125, 500, 500, main)!;
        expect(p.clientX).toBeCloseTo(500, 6);   // 0.25 · 2000
        expect(p.clientY).toBeCloseTo(0, 6);
    });

    it('rejects invalid rects', () => {
        expect(mapMirrorClientToSourceClient(10, 10, 0, 500, main)).toBeNull();
        expect(mapMirrorClientToSourceClient(10, 10, 500, 500, { left: 0, top: 0, width: 0, height: 0 })).toBeNull();
    });
});
