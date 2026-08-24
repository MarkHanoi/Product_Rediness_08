/**
 * viewportScaleResolution.test.ts
 *
 * §SHEET-ONE-SCALE-RESOLUTION (L-10682, lane PDFSHEET35, founder 2026-08-24)
 *
 * The founder: *"I select a view placed on the sheet and CAN'T CHANGE THE SCALE."*
 *
 * ⭐ The control was never missing — `SheetEditorSidebar` has dispatched
 * `UpdateViewportScaleCommand` since ADR-0340, and there are two more scale
 * controls besides. What was missing was AGREEMENT ABOUT THE DEFAULT, measured
 * 2026-08-24 for a viewport whose `scale` is `undefined`:
 *
 *   · READERS defaulted to 50 — the sidebar dropdown, the on-canvas chip bar,
 *     the focus toolbar, and the `1:N` label under the viewport.
 *   · RENDERERS defaulted to 100 — `composeSheetViewport`, `composeForPlacement`,
 *     the PDF, and the resize-handle crop maths.
 *
 * So the viewport drew at 1:100 and printed "1:50" on itself, and the sidebar's
 * `if (n !== (vp.scale ?? 50))` guard meant **choosing the value it was already
 * showing dispatched nothing at all**. These assert the NUMBER, because "a scale
 * control exists" was true throughout the defect.
 */

import { describe, it, expect } from 'vitest';
import { resolveViewportScale } from '../SheetDefinitionTypes.js';

describe('§SHEET-ONE-SCALE-RESOLUTION — one default, not two', () => {

    it('⭐ an unscaled viewport resolves to 100 — NOT 50, which is what the labels said', () => {
        expect(resolveViewportScale({}, null)).toBe(100);
        expect(resolveViewportScale(undefined, undefined)).toBe(100);
        expect(resolveViewportScale({ scale: undefined }, { output: {} })).toBe(100);
    });

    it('⭐ the viewport override wins — this is what "change the scale" has to move', () => {
        expect(resolveViewportScale({ scale: 50 }, { output: { scale: 100 } })).toBe(50);
        expect(resolveViewportScale({ scale: 20 }, null)).toBe(20);
    });

    it('the VIEW\'s authored output scale is inherited when the viewport has none (the documented rule)', () => {
        expect(resolveViewportScale({}, { output: { scale: 200 } })).toBe(200);
        expect(resolveViewportScale(null, { output: { scale: 25 } })).toBe(25);
    });

    it('⛔ a nonsense stored scale never reaches the composer as a divisor', () => {
        // `widthMm = extentM * 1000 / scale` — a 0 or negative denominator emits
        // an infinite or inverted viewBox, which is a blank page, not a drawing.
        for (const bad of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(resolveViewportScale({ scale: bad }, null)).toBe(100);
        }
        expect(resolveViewportScale({ scale: 0 }, { output: { scale: 50 } })).toBe(50);
    });

    it('⭐⭐ the LABEL and the GEOMETRY cannot disagree — same input, same number', () => {
        // The whole defect in one assertion: every surface now asks this
        // function, so there is no second default left to drift.
        const vp = { scale: undefined as number | undefined };
        const view = { output: { scale: undefined as number | undefined } };
        const labelSide = resolveViewportScale(vp, view);
        const geometrySide = resolveViewportScale(vp, view);
        expect(labelSide).toBe(geometrySide);
        expect(labelSide).toBe(100);
        // BEFORE: labelSide was 50 and geometrySide was 100.
        expect(labelSide).not.toBe(50);
    });
});
