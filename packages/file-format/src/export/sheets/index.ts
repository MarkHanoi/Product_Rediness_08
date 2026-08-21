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
    DEFAULT_VIEWPORT_WIDTH_MM,
    DEFAULT_VIEWPORT_HEIGHT_MM,
} from './ViewportSvgComposer';
export type {
    ComposeViewportSvgOptions,
    ComposedViewportSvg,
} from './ViewportSvgComposer';

export { SVGCompositeRenderer } from './SVGCompositeRenderer';
export type { SVGViewBox, SVGPochePolygon, PochePolygon } from './SVGCompositeRenderer';
