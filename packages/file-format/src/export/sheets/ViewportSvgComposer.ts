/**
 * ViewportSvgComposer — §SHEET-ONE-VIEWPORT-PRODUCER (L-1630)
 *
 * THE ONE PRODUCER of "a view rendered on a sheet at a scale".
 *
 * ─── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 * The founder, 2026-08-21:
 *   "the most important is the view I place is NOT the real view — I need the
 *    real view, not an image. PDF creation works perfectly and actually renders
 *    the true view."
 *
 * Both halves of that sentence were true, and they were true for the SAME
 * reason: there were TWO producers for a viewport and they disagreed.
 *
 *   · The EXPORT surface composed cache → bounds → SVGCompositeRenderer and
 *     produced real vector linework. That is the PDF the founder praised.
 *   · The ON-SHEET surface called `viewportThumbnailRenderer.captureThumbnail()`
 *     and `drawImage()`d a bitmap. That is the blob the founder saw.
 *
 * And the export half was itself written TWICE — `PdfExportService` (bbox-driven,
 * correct) and `SheetExportService.exportToPrint` (originX/originZ hard-coded to
 * 0 and a fixed fraction of the paper, so it framed the drawing wrongly). Two
 * copies of a composition rule is how the third copy gets written.
 *
 * C06 §13.3 (one producer per surface) is therefore satisfied here by
 * SUBTRACTION, not by adding a renderer: this module is the only place that
 * knows how a cached TechnicalDrawing becomes a scaled, framed SVG, and every
 * consumer — PDF export, print export, and the sheet editor viewport — calls it.
 *
 * ─── WHY THE OUTPUT IS A STRING ────────────────────────────────────────────
 * Because the same bytes must satisfy three very different sinks: svg2pdf (which
 * wants an SVGSVGElement it can walk), a print layer, and the live sheet DOM.
 * A string is the only representation all three can consume without this module
 * knowing which one it is talking to — and it keeps §05 §4 (no DOM creation in
 * the export layer) intact. Vector, not raster, is the point: a 1:100 plan on A0
 * must stay crisp at any zoom, which a bitmap of any resolution cannot promise.
 *
 * Contract compliance:
 *   C06 §13.3 — one producer per surface.
 *   §01 §5    — geometry is read-only; no Three.js scene mutation.
 *   §05 §4    — pure string output; no DOM creation.
 *   §07       — client-side only; no server routes.
 *   P8        — every exported function carries an OpenTelemetry span.
 */

import { trace } from '@opentelemetry/api';

import { viewTechnicalDrawingCache } from '@pryzm/core-app-model/views';
import { TechnicalDrawingBounds } from '@pryzm/core-app-model/views';
import type { VGCategoryStyle } from '@pryzm/core-app-model';
import { annotationStore } from '@pryzm/plugin-annotations';
import type { AnnotationElement } from '@pryzm/plugin-annotations';

import { SVGCompositeRenderer } from './SVGCompositeRenderer';

const tracer = trace.getTracer('@pryzm/file-format');

// ── Layout constants ──────────────────────────────────────────────────────────

/** Minimum viewport paper-space width (mm) when the drawing is smaller. */
export const DEFAULT_VIEWPORT_WIDTH_MM = 120;
/** Minimum viewport paper-space height (mm) when the drawing is smaller. */
export const DEFAULT_VIEWPORT_HEIGHT_MM = 90;

/** Fallback poche VG style — used when the viewport has no VG model bound. */
const DEFAULT_POCHE_VG = { fillColor: '#333333', transparency: 0 } as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ComposeViewportSvgOptions {
    /** ViewDefinition id whose cached TechnicalDrawing should be composed. */
    viewId: string;
    /** Drawing scale denominator (e.g. 100 for 1:100). Default 100. */
    scale?: number;
    /** Minimum paper-space width in mm. Default `DEFAULT_VIEWPORT_WIDTH_MM`. */
    minWidthMm?: number;
    /** Minimum paper-space height in mm. Default `DEFAULT_VIEWPORT_HEIGHT_MM`. */
    minHeightMm?: number;
    /** Padding around the drawing content, in drawing-space metres. Default 0.5. */
    paddingM?: number;
    /** VG style driving wall poche fill. Defaults to solid dark grey. */
    pocheStyle?: VGCategoryStyle;
    /**
     * Annotation overlay elements. Omit to read `annotationStore.getByView(viewId)`,
     * which is what every production consumer wants; pass explicitly only to
     * compose a viewport whose annotations are not (yet) in the store.
     */
    annotations?: AnnotationElement[];
    /**
     * §SHEET-VIEWPORT-CROP (L-1840) — frame the composition to an explicit
     * drawing-space rectangle, in METRES (world X / world Z): the same frame
     * `TechnicalDrawingBounds.compute()` reports.
     *
     * When supplied this REPLACES content-bounds framing outright. No padding is
     * added and the `minWidthMm` / `minHeightMm` floors are NOT applied — a crop
     * is an exact statement about what the drawing shows, and quietly growing the
     * frame to a minimum would un-crop it while still reporting success.
     *
     * Linework outside the rectangle needs no explicit clip path: the emitted SVG
     * root carries a `viewBox`, and an outermost `<svg>` clips to its viewport by
     * default.
     */
    cropWorldM?: { minX: number; minZ: number; maxX: number; maxZ: number };
}

export interface ComposedViewportSvg {
    /** True when a real drawing was composed; false when `svg` is empty. */
    resolved: boolean;
    /**
     * Why composition did or did not produce content. Consumers use this to pick
     * an honest placeholder rather than rendering an empty frame as if it were
     * the drawing — [context-data-honesty]: "no drawing yet" and "the drawing is
     * empty" must not present as the same thing.
     */
    reason: 'ok' | 'no-drawing' | 'no-bounds' | 'bad-crop';
    /** Standalone SVG document (with XML prolog). Empty string when unresolved. */
    svg: string;
    /** Paper-space width in mm the SVG was laid out for. */
    widthMm: number;
    /** Paper-space height in mm the SVG was laid out for. */
    heightMm: number;
    /** Drawing-space X mapped to the SVG left edge. */
    originX: number;
    /** Drawing-space Z mapped to the SVG top edge. */
    originZ: number;
    /** Scale denominator used. */
    scale: number;
    /** Number of projection line segments composed. */
    lineCount: number;
    /** Number of poche polygons composed. */
    pocheCount: number;
    /** Number of annotation elements composed. */
    annotationCount: number;
    /**
     * True when framing came from an explicit `cropWorldM` rather than the
     * drawing's own content bounds. Consumers that print "fit" affordances need
     * to know which of the two framings produced the result.
     */
    cropped: boolean;
}

// ── The producer ──────────────────────────────────────────────────────────────

/**
 * Compose the cached TechnicalDrawing for `viewId` into a complete, scaled,
 * standalone SVG document.
 *
 * Framing is driven by the drawing's own content bounds (`TechnicalDrawingBounds`),
 * never by a hard-coded fraction of the paper: at 1:100 a 12 m façade is 120 mm of
 * paper and must be laid out as 120 mm, or the linework is silently rescaled and
 * the drawing stops being a drawing.
 *
 * Returns `resolved: false` (with an empty `svg`) when there is no cached drawing
 * or the drawing has no measurable content. Callers MUST branch on that rather
 * than rendering the empty result — an empty frame presented as the view is the
 * same lie as a bitmap presented as the view.
 */
export function composeViewportSvg(
    opts: ComposeViewportSvgOptions,
): ComposedViewportSvg {
    return tracer.startActiveSpan('pryzm.sheets.composeViewportSvg', (span): ComposedViewportSvg => {
        try {
            const scale = opts.scale ?? 100;
            const minW = opts.minWidthMm ?? DEFAULT_VIEWPORT_WIDTH_MM;
            const minH = opts.minHeightMm ?? DEFAULT_VIEWPORT_HEIGHT_MM;
            const paddingM = opts.paddingM ?? 0.5;

            span.setAttribute('pryzm.view_id', opts.viewId);
            span.setAttribute('pryzm.scale', scale);

            const empty = (reason: ComposedViewportSvg['reason']): ComposedViewportSvg => {
                span.setAttribute('pryzm.resolved', false);
                span.setAttribute('pryzm.reason', reason);
                return {
                    resolved: false,
                    reason,
                    svg: '',
                    widthMm: minW,
                    heightMm: minH,
                    originX: 0,
                    originZ: 0,
                    scale,
                    lineCount: 0,
                    pocheCount: 0,
                    annotationCount: 0,
                    cropped: false,
                };
            };

            const drawing = viewTechnicalDrawingCache.get(opts.viewId);
            if (!drawing) return empty('no-drawing');

            const bounds = TechnicalDrawingBounds.compute(drawing);
            if (!bounds) return empty('no-bounds');

            // §SHEET-VIEWPORT-CROP (L-1840) — an explicit crop SUBSTITUTES for
            // content-bounds framing. Both branches produce the same four numbers
            // the renderer needs (origin + paper size), so cropping costs one
            // branch here and nothing downstream.
            const crop = opts.cropWorldM;
            let widthMm: number;
            let heightMm: number;
            let originX: number;
            let originZ: number;
            let cropped = false;

            if (crop) {
                // A degenerate crop is REFUSED, never silently ignored. Falling
                // back to full bounds would render a correct-looking, uncropped
                // drawing and report `resolved: true` — the caller would have no
                // way to tell that the crop it asked for did not happen.
                if (!_isUsableCrop(crop)) return empty('bad-crop');
                originX  = crop.minX;
                originZ  = crop.minZ;
                widthMm  = (crop.maxX - crop.minX) * 1000 / scale;
                heightMm = (crop.maxZ - crop.minZ) * 1000 / scale;
                cropped  = true;
                span.setAttribute('pryzm.cropped', true);
            } else {
                const mm = TechnicalDrawingBounds.toMm(bounds, scale, paddingM);
                widthMm  = Math.max(mm.widthMm, minW);
                heightMm = Math.max(mm.heightMm, minH);
                originX  = bounds.minX - mm.padX;
                originZ  = bounds.minZ - mm.padZ;
            }

            const renderer = new SVGCompositeRenderer({
                originX,
                originZ,
                widthMm,
                heightMm,
                scale,
            });

            // Layer 1 — wall poche fills.
            renderer.buildWallPoche(
                drawing,
                (opts.pocheStyle ?? DEFAULT_POCHE_VG) as VGCategoryStyle,
                'A-WALL',
            );

            // Layer 2 + 3 — projection linework and AEC symbol linework. Both
            // arrive as LineSegments on the drawing; the renderer separates them
            // by layer name.
            renderer.setTechnicalDrawing(drawing);

            // Layer 4 — annotation overlay (dimensions, tags, grid bubbles, …).
            const annotations = opts.annotations ?? _readAnnotations(opts.viewId);
            renderer.setAnnotations(annotations);

            const svg = renderer.renderToSVGString();

            span.setAttribute('pryzm.resolved', true);
            span.setAttribute('pryzm.line_count', renderer.projectionLineCount);
            span.setAttribute('pryzm.width_mm', widthMm);
            span.setAttribute('pryzm.height_mm', heightMm);

            return {
                resolved: true,
                reason: 'ok',
                svg,
                widthMm,
                heightMm,
                originX,
                originZ,
                scale,
                lineCount: renderer.projectionLineCount,
                pocheCount: renderer.pochePolygons.length,
                annotationCount: annotations.length,
                cropped,
            };
        } finally {
            span.end();
        }
    });
}

/**
 * §SHEET-PDF-PLACES-THE-VIEWPORT (L-1867) — THE ONE DEFINITION OF WHERE A
 * VIEWPORT SITS ON THE PAPER.
 *
 * ─── THE DEFECT ────────────────────────────────────────────────────────────
 * The founder, 2026-08-21: *"when printing in PDF doesn't render"*, with a
 * screenshot in which the South Elevation is nowhere near where he placed it.
 *
 * L-1630 unified the DRAWING: the sheet editor and `PdfExportService` both
 * compose through `composeViewportSvg`, and both get identical linework at
 * identical paper sizes. It did NOT unify the PAGE. The two surfaces read
 * `SheetViewport.position` in two different conventions:
 *
 *   · `SheetEditorPanel._buildViewportEl` — BOTTOM-LEFT CORNER. It renders
 *     `left = position.x`, `top = canvasH - position.y - height`, and the drop
 *     handler deliberately subtracts half the composed size so that dropping
 *     centres the drawing on the cursor and STORES a corner.
 *   · `PdfExportService` — CENTRE. `vpX = position.x - vpW/2`,
 *     `vpY = pH - (position.y + vpH/2)`, with a comment stating the field is
 *     the centre.
 *
 * `SheetDefinitionTypes` sided with the PDF ("Centre-point position of the
 * viewport"). Every writer in the product sides with the panel. So the field's
 * documentation was correct about nothing that writes it, and the PDF placed
 * every viewport off by half its own size in both axes — which for the
 * founder's 8020 mm elevation is four metres of paper.
 *
 * ─── THE RESOLUTION ────────────────────────────────────────────────────────
 * BOTTOM-LEFT CORNER wins, because it is what every producer already writes
 * and because re-pointing the writers would silently move every viewport on
 * every saved sheet. The doc comment was the wrong half and has been corrected
 * in place.
 *
 * Returning paper millimetres — not pixels and not jsPDF's top-down y — keeps
 * this free of any one surface's coordinate system. Each consumer applies its
 * own scale factor and, if it needs one, its own y-flip; neither of those is a
 * decision about WHERE the viewport is.
 */
export interface ViewportPaperRect {
    /** Distance from the paper's LEFT edge to the viewport's left edge (mm). */
    leftMm: number;
    /** Distance from the paper's BOTTOM edge to the viewport's bottom edge (mm). */
    bottomMm: number;
    widthMm: number;
    heightMm: number;
}

/**
 * Where `vp` sits on the paper, given the composition that produced its size.
 *
 * The size comes from the composition rather than from the viewport, because a
 * viewport has no size of its own: it is exactly as big as the drawing it shows
 * at the scale it shows it at. Passing the composition in (rather than
 * re-composing here) means the rect and the SVG can never be computed from two
 * different framings.
 */
export function viewportPaperRect(
    vp: { position: { x: number; y: number } },
    composed: Pick<ComposedViewportSvg, 'widthMm' | 'heightMm'>,
): ViewportPaperRect {
    return {
        leftMm:   vp.position.x,
        bottomMm: vp.position.y,
        widthMm:  composed.widthMm,
        heightMm: composed.heightMm,
    };
}

/**
 * Compose `vp` exactly as the sheet editor does — same scale default, same crop.
 *
 * Exists so an export surface cannot forget an option the on-screen surface
 * applies. `PdfExportService` composed without `cropWorldM`, so a viewport the
 * founder had cropped on the sheet exported UNCROPPED and at a different size —
 * the crop was honoured by one of the two consumers of the one producer, which
 * is the same class of divergence L-1630 was written to end.
 */
export function composeForPlacement(
    vp: { viewId: string; scale?: number | undefined; crop?: { minX: number; minZ: number; maxX: number; maxZ: number } | undefined },
    extra: Omit<ComposeViewportSvgOptions, 'viewId' | 'scale' | 'cropWorldM'> = {},
): ComposedViewportSvg {
    return composeViewportSvg({
        ...extra,
        viewId: vp.viewId,
        scale:  vp.scale ?? 100,
        ...(vp.crop ? { cropWorldM: vp.crop } : {}),
    });
}

/**
 * A crop is usable only when every bound is finite and both extents are
 * strictly positive. Zero-area and inverted rectangles are the two shapes a
 * drag gesture produces on its very first frame, so they are expected input,
 * not corruption — but they cannot be composed, and composing them anyway
 * would emit an SVG with a zero or negative viewBox.
 */
function _isUsableCrop(c: { minX: number; minZ: number; maxX: number; maxZ: number }): boolean {
    return Number.isFinite(c.minX) && Number.isFinite(c.minZ)
        && Number.isFinite(c.maxX) && Number.isFinite(c.maxZ)
        && c.maxX > c.minX && c.maxZ > c.minZ;
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Read the annotation overlay for a view. The store is optional at composition
 * time (a headless/test host may not have the annotations plugin state), and a
 * missing overlay must degrade to "no annotations", never to a thrown compose.
 */
function _readAnnotations(viewId: string): AnnotationElement[] {
    try {
        return annotationStore.getByView(viewId) ?? [];
    } catch (err) {
        console.warn('[ViewportSvgComposer] annotation read failed:', err);
        return [];
    }
}
