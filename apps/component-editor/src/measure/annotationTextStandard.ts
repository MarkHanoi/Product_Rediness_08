// annotationTextStandard — SPEC-AUTODIMENSION §12.14 lettering, for the
// Family Creator's on-screen dimension text.
//
// ─── THIS IS A CITED RESTATEMENT, NOT A SECOND STANDARD, AND IT IS GATED ─────
// The canonical producer is `packages/file-format/src/export/sheets/
// PaperTextStandard.ts` (SPEC-AUTODIMENSION §12.14, lane PDFSHEET35, L-10680).
// It is a PURE LEAF MODULE — it imports nothing — so importing it would have
// been the right answer, and it was the first thing tried.
//
// It cannot be imported HERE for one measured reason: `@pryzm/file-format`'s
// `exports` map (its package.json) publishes exactly three entry points —
// `.`, `./sheets`, `./server`. There is no subpath that reaches the leaf. The
// only reachable door, `@pryzm/file-format/sheets`, is a BARREL that also
// re-exports `PdfExportService`, `DxfExportService` and `SVGCompositeRenderer`,
// whose own dependency closure includes `@pryzm/core-app-model` and
// `@pryzm/renderer-three`. This app's first-paint budget is 180 KB gzip —
// smaller than THREE's core alone — and `__tests__/quality-gates/
// bundle-budget.test.ts` builds the app for real and fails on it. Widening the
// exports map means editing a package.json, which this lane may not do.
//
// So the NUMBERS are restated here and the COPY IS GATED:
// `__tests__/measure/annotationTextStandard.test.ts` reads
// `PaperTextStandard.ts` off disk and asserts every constant below still
// matches its source. A drifting copy fails a test instead of quietly
// lettering the family editor differently from the sheets it prints onto.
// ⛔ Do not "simplify" that spec away — the copy is only safe while it exists.
//
// LAYER — L0-equivalent: pure constants + total functions. No DOM, no THREE.

/** Cap height ÷ em for the Arial/Helvetica metric family. `PaperTextStandard.ts`
 *  §CAP_HEIGHT_RATIO: Arial's capHeight is 1467/2048 = 0.71631. Handing a cap
 *  height straight to `font-size` under-draws every annotation by 28 %. */
export const CAP_HEIGHT_RATIO = 0.716;

/** §12.14 ABSOLUTE FLOOR — any annotation, any sheet. Below it the counters
 *  close under reproduction. A style asking for less is CLAMPED, not obeyed. */
export const MIN_PAPER_TEXT_HEIGHT_MM = 1.8;

/** §12.14 — the height of a DIMENSION VALUE on paper. */
export const DEFAULT_PAPER_TEXT_HEIGHT_MM = 2.5;

/** §12.14 — baseline-to-baseline advance, as a multiple of h (ISO 3098 wants ≥ 1.4 h). */
export const LINE_ADVANCE_RATIO = 1.5;

/**
 * The SCREEN floor, and it is NOT the same kind of thing as the paper floor.
 * `PaperTextStandard.ts` keeps this separately for exactly this reason: at a
 * fit-to-window scale the paper floor resolves to a few illegible pixels, so a
 * screen surface clamps in PIXELS as well as in millimetres.
 */
export const EDITOR_MIN_TEXT_PX = 6;

/**
 * Cap height (mm) → CSS `font-size` in millimetres.
 *
 * §12.14: *"h is a CAP HEIGHT, not an em, and the two are not
 * interchangeable."* This is the conversion that was missing when every
 * annotation shipped 28 % short.
 */
export function emFromLetteringHeight(capMm: number): number {
  return capMm / CAP_HEIGHT_RATIO;
}

/** Clamp a requested cap height to the §12.14 floor. */
export function letteringHeightMm(requestedMm?: number): number {
  const h = typeof requestedMm === 'number' && Number.isFinite(requestedMm)
    ? requestedMm
    : DEFAULT_PAPER_TEXT_HEIGHT_MM;
  return Math.max(MIN_PAPER_TEXT_HEIGHT_MM, h);
}

/**
 * Cap height (mm) → on-screen `font-size` in PIXELS at a given zoom.
 *
 * ⭐ §12.14: *"h is a PAPER dimension and is INVARIANT under drawing scale."*
 * Applied to a live canvas that means the OPPOSITE of what naive code does:
 * the text must NOT be drawn in model millimetres and scaled by the zoom,
 * because then zooming out shrinks the lettering to nothing. It is drawn at a
 * constant apparent size. `pxPerMm` here is therefore the surface's PAPER
 * scale — how many screen pixels represent one paper millimetre — and it is
 * deliberately NOT the sketcher's model zoom. The family editor has no sheet,
 * so it uses a fixed nominal paper scale, and dimension text is consequently
 * the same size at every zoom level. That is the §12.14 invariance, honoured.
 */
export function capMmToEditorPx(capMm: number, pxPerMm: number): number {
  const em = emFromLetteringHeight(letteringHeightMm(capMm));
  return Math.max(EDITOR_MIN_TEXT_PX, em * pxPerMm);
}

/**
 * The family editor's nominal paper scale, in screen px per paper mm.
 *
 * Chosen so a §12.14 2.5 mm dimension value renders at
 * `2.5 / 0.716 * 4 ≈ 14 px` — comfortably above `EDITOR_MIN_TEXT_PX` on a
 * standard display and matching the 12–14 px the rest of this app's chrome
 * already uses (see the HUD's `font:12px/1.4 monospace`).
 */
export const EDITOR_NOMINAL_PX_PER_PAPER_MM = 4;
