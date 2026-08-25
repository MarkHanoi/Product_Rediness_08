// §UX-COMPACT-TYPE-PILL (L-11131, lane UXPILL70) — the pure placement model behind the
// BUILDING TYPE pill. Node environment on purpose: the DOM half is proven in
// `onboardingCompactPill.test.ts` (happy-dom) against the REAL controller.

import { describe, it, expect } from 'vitest';
import { placeCompactPill, readShellCanvasSpan } from '../src/ui/onboarding/compactPillPlacement';

const BAR = { left: 500, right: 900, top: 50, bottom: 84 };
const CANVAS = { left: 0, right: 1440 };
const GAP = 6.8;
const GUTTER = 13.6;

describe('placeCompactPill — rule order', () => {
    it('no bar on screen => CENTRED (the band is empty, the pill takes its place)', () => {
        expect(placeCompactPill({ bar: null, canvas: CANVAS, pillWidth: 300, gap: GAP, gutter: GUTTER }))
            .toEqual({ kind: 'centred' });
    });

    it('an unmeasured pill (width 0) => CENTRED, never a NaN left', () => {
        expect(placeCompactPill({ bar: BAR, canvas: CANVAS, pillWidth: 0, gap: GAP, gutter: GUTTER }))
            .toEqual({ kind: 'centred' });
    });

    it('fits to the RIGHT => beside-right, one gap past the bar', () => {
        const p = placeCompactPill({ bar: BAR, canvas: CANVAS, pillWidth: 300, gap: GAP, gutter: GUTTER });
        expect(p).toEqual({ kind: 'beside-right', left: 900 + GAP });
    });

    it('right edge would breach the canvas gutter => falls to the LEFT of the bar', () => {
        // Split view: the canvas is the left 60% of a 1440 viewport; the bar sits right of
        // centre so that 300px + gap + gutter no longer fit on its right (832 + 320 > 864)
        // but do fit on its left (432 - 307 = 125 >= gutter).
        const canvas = { left: 0, right: 864 };
        const bar = { left: 432, right: 832, top: 50, bottom: 84 };
        const p = placeCompactPill({ bar, canvas, pillWidth: 300, gap: GAP, gutter: GUTTER });
        expect(p).toEqual({ kind: 'beside-left', left: 432 - GAP - 300 });
    });

    it('fits on NEITHER side => BELOW the bar, centred on it — never on top of it', () => {
        const canvas = { left: 0, right: 700 };
        const bar = { left: 150, right: 550, top: 50, bottom: 84 };
        const p = placeCompactPill({ bar, canvas, pillWidth: 300, gap: GAP, gutter: GUTTER });
        expect(p.kind).toBe('below');
        if (p.kind !== 'below') return;
        expect(p.top).toBe(84 + GAP);
        expect(p.left).toBeCloseTo(350 - 150, 6);
        // Inside the canvas gutter on both sides.
        expect(p.left).toBeGreaterThanOrEqual(GUTTER);
        expect(p.left + 300).toBeLessThanOrEqual(700 - GUTTER);
    });

    it('BELOW clamps into the canvas when the bar is off-centre', () => {
        // Bar hugging the left edge of a 480px canvas: right needs 200 + 6.8 + 320 + 13.6 = 540
        // (> 480), left needs -327 (< 0), and centred-on-bar would put the pill at
        // 100 - 160 = -60 — so the clamp must pull it back to the gutter.
        const canvas = { left: 0, right: 480 };
        const bar = { left: 0, right: 200, top: 50, bottom: 84 };
        const p = placeCompactPill({ bar, canvas, pillWidth: 320, gap: GAP, gutter: GUTTER });
        expect(p.kind).toBe('below');
        if (p.kind !== 'below') return;
        expect(p.left).toBe(GUTTER);
    });

    it('a degenerate bar rect (right <= left) reads as no bar', () => {
        expect(placeCompactPill({ bar: { left: 10, right: 10, top: 0, bottom: 0 }, canvas: CANVAS, pillWidth: 300, gap: GAP, gutter: GUTTER }))
            .toEqual({ kind: 'centred' });
    });
});

describe('readShellCanvasSpan — the two budget tokens, as the shell writes them', () => {
    it('defaults (50% / 100vw) => the whole viewport', () => {
        expect(readShellCanvasSpan('50%', '100vw', 1440)).toEqual({ left: 0, right: 1440 });
    });

    it('a measured split (30.000% / 60.000vw) => the left 60%', () => {
        const s = readShellCanvasSpan('30.000%', '60.000vw', 1440);
        expect(s.left).toBeCloseTo(0, 6);
        expect(s.right).toBeCloseTo(864, 6);
    });

    it('empty or garbage values fall back to the viewport rather than throwing', () => {
        expect(readShellCanvasSpan('', '', 1000)).toEqual({ left: 0, right: 1000 });
        expect(readShellCanvasSpan('calc(50% - 1px)', 'auto', 1000)).toEqual({ left: 0, right: 1000 });
    });

    it('px values are honoured as absolute', () => {
        expect(readShellCanvasSpan('400px', '600px', 1000)).toEqual({ left: 100, right: 700 });
    });
});
