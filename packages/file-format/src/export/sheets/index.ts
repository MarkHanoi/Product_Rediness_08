/**
 * @pryzm/file-format/sheets — the sheet-composition surface.
 *
 * §SHEET-ONE-VIEWPORT-PRODUCER (L-1630).
 *
 * WHY THIS SUBPATH EXISTS. The root `@pryzm/file-format` barrel pulls jsPDF,
 * jszip, pdfjs-dist and web-ifc into whatever imports it. The sheet EDITOR now
 * consumes the same viewport composer the exporters use (C06 §13.3 — one
 * producer per surface), and it must not drag the IFC/PDF toolchain into the
 * editor's lazy sheet chunk to do it. This subpath exposes composition only.
 *
 * Contract compliance:
 *   C06 §13.3 — one producer per surface: `composeViewportSvg` is THE producer
 *               of "a view rendered on a sheet", for every consumer.
 *   §05 §4    — pure string output; no DOM creation in this layer.
 */

export {
    composeViewportSvg,
    composeForPlacement,
    viewportPaperRect,
    DEFAULT_VIEWPORT_WIDTH_MM,
    DEFAULT_VIEWPORT_HEIGHT_MM,
} from './ViewportSvgComposer';
export type {
    ComposeViewportSvgOptions,
    ComposedViewportSvg,
    ViewportPaperRect,
} from './ViewportSvgComposer';

export { SVGCompositeRenderer } from './SVGCompositeRenderer';
export type { SVGViewBox, SVGPochePolygon, PochePolygon } from './SVGCompositeRenderer';

// §SHEET-TEXT-IS-PAPER-LETTERING (L-10680) — THE one definition of how tall
// annotation lettering is on an issued sheet. `AnnotationStyle.textSizeMm` is
// declared as a CAP HEIGHT (the CAD/ISO 3098 meaning) and SVG/PDF `font-size` is
// an EM; passing one straight to the other drew every annotation 28 % short.
// Exported so a second surface converts the same way instead of inventing a
// second ratio. Normative statement: SPEC-AUTODIMENSION §12.14.
export {
    CAP_HEIGHT_RATIO,
    MIN_PAPER_TEXT_HEIGHT_MM,
    DEFAULT_PAPER_TEXT_HEIGHT_MM,
    LINE_ADVANCE_RATIO,
    ISO_LETTERING_STROKE_RATIO,
    ISO_3098_HEIGHT_SERIES_MM,
    MIN_PAPER_TEXT_EM_MM,
    letteringHeightMm,
    emFromLetteringHeight,
    letteringHeightFromEm,
    subordinateEmMm,
    lineAdvanceFromEm,
} from './PaperTextStandard';

// §SHEET-CHROME-IS-NOT-THE-DRAWING (L-3804) — the screen-vs-print policy. The
// sheet editor (L7) and every export surface read the SAME policy from here, so
// an affordance cannot be chrome on one surface and ink on the other.
export { chromeFor } from './SheetRenderTarget';
export type { SheetRenderTarget, ViewportChrome } from './SheetRenderTarget';

// §SHEET-TITLE-BLOCK-HAS-A-SOURCE (L-3806) — THE one producer of title block
// field values, replacing the five-key map that was written inline in the panel
// and in three export services against a template declaring eleven fields.
export { resolveTitleBlockValues, resolveSheetScaleLabel } from './TitleBlockValues';
export type { TitleBlockContext, TitleBlockSheet } from './TitleBlockValues';

// §SHEET-RESIZE-IS-A-CROP (L-3809) — a viewport has no size of its own, so
// dragging its edge changes what it SHOWS, not how big the drawing is drawn.
// The inverse of the composer's framing arithmetic; keeps "1:N" true.
export {
    resizeCropByEdgeDelta,
    currentCropFromComposition,
    cropPaperSizeMm,
    mmToWorldM,
    MIN_CROP_EXTENT_M,
} from './ViewportResize';
export type { CropRectM, EdgeDeltaMm } from './ViewportResize';
