/**
 * §PENS-ARE-PAPER-MM-LIKE-EVERY-OTHER-MARK (founder 2026-09-09 · L-13274 · C09 §4.6)
 *
 * THE ASK, VERBATIM:
 *   *"THE QUALITY ATM IS REALLY BAD - THE LINES ARE ALMOST NOT READIBLE"*
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ⭐⭐ THE PENS AND THE TAGS DISAGREED ABOUT WHAT A MILLIMETRE IS
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * A pen's `widthMm` is PAPER millimetres. Both stroke paths in `PlanViewCanvas` converted it
 * with a fixed `widthMm × 3.7795`, reading neither the view's drawing scale nor the canvas
 * zoom — so a 0.18 mm line was 0.68 CSS px at EVERY zoom, forever. Meanwhile every annotation
 * beside that linework already went through the full paper→world→screen chain in
 * `annotations/paperScale`. One rule, two implementations, in two neighbouring subsystems
 * ([[same-rule-two-implementations]]) — and the drawing's legibility fell in the gap.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ⛔ THE FIRST DRAFT OF THIS FIX WAS WRONG, AND TEN EXISTING ARMS CAUGHT IT
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Pure paper-faithfulness with no lower bound puts every width under the raster floor at low
 * zoom; `max(minStrokePx, …)` then clamps them onto each other and the ISO ladder collapses to
 * one width — **the exact L-288 defect, re-opened**. `CanvasHairlineFloor.test.ts` and
 * `PenWeightByFunction.test.ts` went red with "expected 1 to be less than 1", which is the
 * flattening speaking.
 *
 * ⭐ THE RECONCILIATION, AND WHY IT IS NOT A HEDGE. Measured:
 *
 *       0.09 mm × (96/25.4) = 0.340 CSS px × the L-288 backing scale of 3 = 1.02 DEVICE px
 *
 * `SCREEN_PX_PER_MM` is therefore not an arbitrary second authority — it is precisely THE
 * SCALE AT WHICH THE THINNEST RUNG OF THE ISO LADDER LANDS ON THE RASTER FLOOR, i.e. the
 * minimum scale at which the ladder is separable at all. Bounding the SCALE below by it gives
 * both properties at once: paper-faithful when zoomed in, ladder-whole when zoomed out.
 *
 * ⛔ SCALE-BOUND ≠ PEN-CLAMP. A floor applied per pen pushes rungs onto each other and
 * destroys hierarchy (L-288). A floor applied to the one scale factor moves the whole ladder
 * together and preserves every ratio exactly. Same word, opposite effect. Several arms below
 * exist only to fail if a later lane collapses the two.
 *
 * ✅ ESTABLISHES: paper-faithful above the bound; today's exact weights below it; the ladder's
 *    ratios invariant under zoom, under scale, and across the bound; honest degradation when
 *    the zoom cannot be derived at all.
 * ⛔ DOES NOT ESTABLISH: that any pixel is drawn, or that the founder's drawing now reads well.
 *    That needs a real screen — this pins the arithmetic it depends on.
 */

import { describe, expect, it } from 'vitest';
import { penMmToCanvasPx, minStrokePx } from './CanvasRenderScale';

/** The ISO pen ladder the drawing's hierarchy is built from. */
const LADDER = [0.09, 0.13, 0.18, 0.25, 0.35, 0.50] as const;

/** 96 DPI ÷ 25.4 — what the canvas used to multiply by unconditionally, now the lower bound. */
const LEGACY_PX_PER_MM = 96 / 25.4;

/** A zoom at which the paper-faithful term is the binding one (1:100 → 20 px/mm ≫ 3.7795). */
const ABOVE_FLOOR_ZOOM = 200;

describe('§PENS-ARE-PAPER-MM — paper-faithful above the ladder floor', () => {
    it('⭐ paper mm × denominator ÷ 1000 = world metres, then × zoom = pixels', () => {
        // 0.25 mm on paper at 1:100 is 25 mm = 0.025 m of building. At 200 px per world metre
        // that is exactly 5.0 px. No screen constant anywhere in that sentence.
        expect(penMmToCanvasPx(0.25, 100, ABOVE_FLOOR_ZOOM)).toBeCloseTo(5.0, 10);
        expect(penMmToCanvasPx(0.50, 100, ABOVE_FLOOR_ZOOM)).toBeCloseTo(10.0, 10);
    });

    it('⭐ THE FOUNDER-VISIBLE FACT — zooming in makes the linework grow with the building', () => {
        // This is the whole complaint. Under the fixed constant a 0.18 mm line stayed 0.68 CSS
        // px at every zoom: the building grew, the lines did not, and the drawing thinned into
        // grey the further you looked into it.
        const near = penMmToCanvasPx(0.18, 100, ABOVE_FLOOR_ZOOM);
        const nearer = penMmToCanvasPx(0.18, 100, ABOVE_FLOOR_ZOOM * 4);
        expect(nearer).toBeCloseTo(near * 4, 10);
        expect(near).toBeGreaterThan(0.18 * LEGACY_PX_PER_MM);
    });

    it('⭐ a 1:200 drawing draws HEAVIER than a 1:50 one at the same zoom — that is what scale means', () => {
        // The property the fixed constant could not express at all: it returned the same number
        // for every scale, so a site plan and a detail drew identical linework.
        const at50 = penMmToCanvasPx(0.25, 50, ABOVE_FLOOR_ZOOM);
        const at200 = penMmToCanvasPx(0.25, 200, ABOVE_FLOOR_ZOOM);
        expect(at200).toBeCloseTo(at50 * 4, 10);
    });
});

describe('§PENS-ARE-PAPER-MM — ⭐ the ladder floor IS the L-288 invariant, restated as a scale', () => {
    it('⛔ the thinnest ISO rung sits on the raster floor at the bound — the calibration itself', () => {
        // 0.09 mm at the bound is 0.340 CSS px, and × the L-288 backing scale of 3 that is 1.02
        // DEVICE px — one device pixel. THAT is why the legacy constant is the correct lower
        // bound rather than a leftover: it is the minimum scale at which the ladder separates.
        const thinnestAtFloor = penMmToCanvasPx(0.09, 100, 0);
        expect(thinnestAtFloor * 3).toBeGreaterThanOrEqual(1);
        expect(thinnestAtFloor * 3).toBeLessThan(1.1);
    });

    it("⛔ zoomed OUT, the drawing renders at exactly today's weights — the ladder never flattens", () => {
        // THE ARM THAT CAUGHT THE FIRST DRAFT. Unbounded paper-faithfulness put every rung
        // under the raster floor at low zoom, the caller's `max(minStrokePx, …)` clamped them
        // together, and ten existing L-288 / L-285 arms went red. Bounding the SCALE keeps them
        // whole and leaves the zoomed-out drawing byte-identical to today's.
        for (const mm of LADDER) {
            expect(penMmToCanvasPx(mm, 100, 0.5), `${mm} mm`)
                .toBeCloseTo(mm * LEGACY_PX_PER_MM, 10);
        }
    });

    it('the bound moves the WHOLE ladder, so no two rungs ever meet', () => {
        for (const zoom of [0, 0.5, 5, 40, 200, 2000]) {
            const px = LADDER.map((mm) => penMmToCanvasPx(mm, 100, zoom));
            for (let i = 1; i < px.length; i += 1) {
                expect(px[i]!, `zoom ${zoom}, rung ${LADDER[i]}`).toBeGreaterThan(px[i - 1]!);
            }
        }
    });
});

describe('§PENS-ARE-PAPER-MM — ⛔ the ladder is SCALED, never FLATTENED (the L-288 guarantee)', () => {
    it('⭐ every ratio is invariant under zoom — INCLUDING across the bound', () => {
        // L-288 flattened this ladder with a PER-PEN floor. The bound here is on the SCALE, so
        // it moves every rung together. If a later lane "simplifies" it into a per-pen clamp,
        // these ratios collapse toward 1 and this fails. — [[gate-blind-on-the-wrong-axis]]
        for (const zoom of [0, 0.5, 5, 40, 400, 4000]) {
            const px = LADDER.map((mm) => penMmToCanvasPx(mm, 100, zoom));
            for (let i = 1; i < LADDER.length; i += 1) {
                expect(px[i]! / px[0]!, `zoom ${zoom}, rung ${LADDER[i]}`)
                    .toBeCloseTo(LADDER[i]! / LADDER[0]!, 9);
            }
        }
    });

    it('every ratio is invariant under drawing scale too', () => {
        for (const denom of [20, 50, 100, 200, 500]) {
            const a = penMmToCanvasPx(0.50, denom, ABOVE_FLOOR_ZOOM);
            const b = penMmToCanvasPx(0.13, denom, ABOVE_FLOOR_ZOOM);
            expect(a / b, `1:${denom}`).toBeCloseTo(0.50 / 0.13, 9);
        }
    });

    it('⛔ the bound is on the SCALE, never on the pen — the two are not interchangeable', () => {
        // A per-pen clamp at `minStrokePx` would return the SAME number for 0.09 and 0.13 at
        // low zoom. The scale bound returns numbers in the ladder's own ratio, always.
        const thin = penMmToCanvasPx(0.09, 100, 0.5);
        const thick = penMmToCanvasPx(0.13, 100, 0.5);
        expect(thin).not.toBeCloseTo(thick, 6);
        expect(thick / thin).toBeCloseTo(0.13 / 0.09, 9);
        // And it does not usurp the caller's raster floor, which stays where L-288 put it.
        expect(minStrokePx(3)).toBeCloseTo(1 / 3, 10);
    });
});

describe('§PENS-ARE-PAPER-MM — an underivable zoom degrades honestly', () => {
    it('⭐ a zero / NaN zoom lands on the ladder floor, NOT on zero', () => {
        // [[context-data-honesty-family]] — failure and empty must not be the same value. A pen
        // resolving to 0 px would erase the drawing and look exactly like a hairline pen.
        for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(penMmToCanvasPx(0.25, 100, bad), String(bad))
                .toBeCloseTo(0.25 * LEGACY_PX_PER_MM, 10);
        }
    });

    it('a missing / absurd denominator falls back to 1:100 rather than erasing the line', () => {
        for (const bad of [0, -5, Number.NaN]) {
            expect(penMmToCanvasPx(0.25, bad, ABOVE_FLOOR_ZOOM), String(bad))
                .toBeCloseTo(penMmToCanvasPx(0.25, 100, ABOVE_FLOOR_ZOOM), 10);
        }
    });

    it('a zero-width pen is genuinely zero — it is not a failure to paper over', () => {
        expect(penMmToCanvasPx(0, 100, ABOVE_FLOOR_ZOOM)).toBe(0);
        expect(penMmToCanvasPx(Number.NaN, 100, ABOVE_FLOOR_ZOOM)).toBe(0);
    });
});
