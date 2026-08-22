// @vitest-environment happy-dom
//
// §SHEET-3D-LETTERBOX-IS-PAPER (L-3801) — the founder's black bars.
//
// The founder, 2026-08-21: *"the 3D viewport has black bars down both sides,
// visible in every sheet screenshot."*
//
// The bars were `#0f1520` — the colour of a 3D SCENE background — painted
// across the whole viewport rect before the aspect-preserving blit drew the
// capture centred inside it. The area beside a drawing on a sheet is not scene.
// It is PAPER, and painting it dark asserts that the view extends there and is
// empty.
//
// ⛔ THE FIX IS NOT TO STRETCH. A drawing whose proportions have been altered
// to fill a rectangle is a falsified drawing, so `fitLetterbox` is
// aspect-preserving by construction and this suite pins that first — before it
// pins the colour, because a white bar over a stretched image would be a
// regression wearing the fix's clothes.

import { describe, it, expect } from 'vitest';
import { fitLetterbox, viewportPreviewRenderer } from './ViewportPreviewRenderer';

describe('§SHEET-3D-LETTERBOX-IS-PAPER (L-3801) — fitLetterbox', () => {
    it('preserves the source aspect ratio — never stretches to fill', () => {
        // 16:9 capture into a 4:3 viewport.
        const fit = fitLetterbox(1600, 900, 120, 90);
        expect(fit.dw / fit.dh).toBeCloseTo(1600 / 900, 6);
    });

    it('bars a proportionally WIDER source top and bottom', () => {
        const fit = fitLetterbox(1600, 900, 120, 90);
        expect(fit.dw).toBeCloseTo(120, 6);   // spans the full width
        expect(fit.dh).toBeLessThan(90);      // short of the full height
        expect(fit.dx).toBeCloseTo(0, 6);
        expect(fit.dy).toBeGreaterThan(0);
        // Centred: equal bars, not flush to one edge.
        expect(fit.dy).toBeCloseTo((90 - fit.dh) / 2, 6);
    });

    it('bars a proportionally NARROWER source left and right', () => {
        // The founder reported bars "down both sides" — this branch.
        const fit = fitLetterbox(900, 1600, 120, 90);
        expect(fit.dh).toBeCloseTo(90, 6);    // spans the full height
        expect(fit.dw).toBeLessThan(120);
        expect(fit.dy).toBeCloseTo(0, 6);
        expect(fit.dx).toBeCloseTo((120 - fit.dw) / 2, 6);
    });

    it('reports ZERO bar fraction when the aspects already agree', () => {
        // The state the better fix (L-3802, capture at the viewport's aspect)
        // would produce. `barFraction` is what would prove it landed, so it has
        // to be exact at the fixed point, not merely small.
        const fit = fitLetterbox(1600, 900, 160, 90);
        expect(fit.barFraction).toBeCloseTo(0, 10);
        expect(fit.dx).toBeCloseTo(0, 10);
        expect(fit.dy).toBeCloseTo(0, 10);
        expect(fit.dw).toBeCloseTo(160, 10);
        expect(fit.dh).toBeCloseTo(90, 10);
    });

    it('reports the bar fraction as the share of the rect that is NOT drawing', () => {
        // 16:9 into 4:3: the image occupies 120 × 67.5 of a 120 × 90 rect.
        const fit = fitLetterbox(1600, 900, 120, 90);
        expect(fit.dh).toBeCloseTo(67.5, 6);
        expect(fit.barFraction).toBeCloseTo(1 - (120 * 67.5) / (120 * 90), 6);
        expect(fit.barFraction).toBeCloseTo(0.25, 6);
    });

    it('degenerate inputs fill the rect rather than emitting NaN geometry', () => {
        // A zero-width source is what a refused render pass leaves behind
        // (§SURFACE-WITH-NO-AREA-REFUSES-THE-PASS, L-1470). NaN dx/dw silently
        // paints nothing, which would read as the blank box this lineage of
        // defects keeps producing.
        for (const args of [
            [0, 900, 120, 90],
            [1600, 0, 120, 90],
            [1600, 900, 0, 90],
            [1600, 900, 120, 0],
            [Number.NaN, 900, 120, 90],
        ] as const) {
            const fit = fitLetterbox(...(args as unknown as [number, number, number, number]));
            expect(Number.isFinite(fit.dx)).toBe(true);
            expect(Number.isFinite(fit.dy)).toBe(true);
            expect(Number.isFinite(fit.dw)).toBe(true);
            expect(Number.isFinite(fit.dh)).toBe(true);
        }
    });
});

describe('§SHEET-3D-LETTERBOX-IS-PAPER (L-3801) — the bars are paper', () => {
    it('fills the viewport rect with paper white, never the scene navy', () => {
        // Drives the REAL private paint through a recording 2D context, because
        // the defect is a literal colour and the only honest proof is the
        // literal that reaches `fillStyle`. Asserting the exported constant
        // instead would pass while the paint used a different one.
        const fills: string[] = [];
        const ctx = {
            set fillStyle(v: string) { fills.push(v); },
            get fillStyle() { return fills[fills.length - 1] ?? ''; },
            fillRect:   () => {},
            drawImage:  () => {},
            measureText: () => ({ width: 10 }),
            fillText:   () => {},
            save:       () => {},
            restore:    () => {},
            beginPath:  () => {},
            roundRect:  () => {},
            fill:       () => {},
            set font(_v: string) {},
            set textAlign(_v: string) {},
            set textBaseline(_v: string) {},
            set globalAlpha(_v: number) {},
        };

        const src = { width: 1600, height: 900 } as HTMLCanvasElement;

        // The paint is private by design; the test reaches it through one
        // narrowly-scoped cast rather than widening the module's surface for a
        // test's benefit. Test files are outside the P4 cast gate's scope.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (viewportPreviewRenderer as any)._paint3DCapture(
            ctx as unknown as CanvasRenderingContext2D,
            { id: 'v1', name: '3D', viewType: '3d' },
            src,
            120,
            90,
            null,
        );

        expect(fills.length).toBeGreaterThan(0);
        // THE ASSERTION THAT MATTERS: the ground the capture sits on is paper.
        expect(fills[0]).toBe('#ffffff');
        // And the specific literal the founder was looking at is gone.
        expect(fills).not.toContain('#0f1520');
    });
});
