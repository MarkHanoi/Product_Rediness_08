// @vitest-environment happy-dom
/**
 * sheet-export-carries-dimensions.test.ts
 *
 * §W4B-EXPORT (Wave 4b, 2026-08-31) — REFUTATION, with the executed read the
 * claim it refutes never had.
 *
 * ─── THE CLAIM ─────────────────────────────────────────────────────────────
 * The 2026-08-29 element-creation audit graded `annotation` PARTIAL with
 * `exports` as its FIRST failing link, on this evidence:
 *
 *   "no IFC/PDF/DXF surface carries an annotation; four negative greps over
 *    four directories confirmed to exist, plus no AnnotationReader"
 *
 * and stated the consequence in §3.1 as a headline:
 *
 *   "Annotations and dimensions do not export at all — a sheet exported to PDF
 *    carries no dimensions."
 *
 * ─── WHY IT IS FALSE ───────────────────────────────────────────────────────
 * The search was for an `AnnotationReader` under `export/ifc/readers/`. That is
 * a NAME-shaped search, and it is looking on the wrong surface: an annotation
 * is paper-space documentation, so its export surface is the SHEET (PDF/DXF),
 * not the 3-D model file. Searching for the CAPABILITY finds two live paths:
 *
 *   · DXF — `AnnotationDxfBridge` (`export/sheets/AnnotationDxfBridge.ts`),
 *     called from `DxfExportService.ts:406` on the real export.
 *   · PDF — `SVGCompositeRenderer`, fed by `composeViewportSvg`
 *     (`ViewportSvgComposer.ts:252` `renderer.setAnnotations(...)`), whose own
 *     header calls it "the ONE producer of the annotation overlay that
 *     `PdfExportService` embeds via svg2pdf".
 *
 * ⭐ This file asserts the POSITIVE. `svg-annotation-unrendered-kinds.test.ts`
 * already pins the four kinds that do NOT render (`matchline`, `north-arrow`,
 * `scale-bar`, `wall-tag`) — but a list of what is missing is not proof that
 * anything is present, and no test asserted that a dimension survives. Without
 * that, "dimensions export" rested on reading a `switch`. Now it is executed.
 */

import { describe, it, expect } from 'vitest';
import { SVGCompositeRenderer, type SVGViewBox } from '../src/export/sheets/SVGCompositeRenderer';

const VIEW_BOX: SVGViewBox = {
    widthMm: 210,
    heightMm: 297,
    originX: 0,
    originZ: 0,
    scale: 50,
};

/**
 * The annotation layer ONLY, or '' when the renderer emitted none.
 *
 * ⚠ Scoping matters and the CONTROL below is what proved it: the raw SVG root
 * carries `xmlns="http://www.w3.org/2000/svg"`, so a bare
 * `expect(svg).toContain('2000')` for a 2 m dimension passes on EVERY document,
 * annotation or not. That assertion was written, the control failed it, and it
 * was tightened to this. A test that cannot fail is not evidence.
 */
function annotationLayer(svg: string): string {
    const i = svg.indexOf('<g id="annotations"');
    return i < 0 ? '' : svg.slice(i);
}

/** A 2-metre linear dimension, the shape `plugins/annotations` stores. */
function linearDim(id = 'dim-1') {
    return {
        id,
        type: 'linear-dim',
        ownerViewId: 'v1',
        geometry2D: { modelPoints: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }] },
        parameters: {},
        style: {},
    } as never;
}

describe('§W4B — a sheet exported to PDF DOES carry dimensions', () => {
    it('⭐ a linear dimension emits real drawable geometry into the export artefact', () => {
        const svg = new SVGCompositeRenderer(VIEW_BOX)
            .setAnnotations([linearDim()])
            .renderToSVGString();

        const annLayer = annotationLayer(svg);

        // Dimension line + extension lines are <line>; the measured value is <text>.
        expect(annLayer).toMatch(/<line\b/);
        expect(annLayer).toMatch(/<text\b/);
    });

    it('⭐ the dimension carries its MEASURED VALUE — 2 m must appear as 2000 mm', () => {
        // A dimension line with no number is not a dimension. This is the
        // assertion that separates "something was drawn" from "the drawing
        // states the measurement", which is the whole point of the family.
        const svg = new SVGCompositeRenderer(VIEW_BOX)
            .setAnnotations([linearDim()])
            .renderToSVGString();

        expect(annotationLayer(svg)).toContain('2000');
    });

    it('dimension kinds are NOT in the unrendered set — the negative half, executed', () => {
        const r = new SVGCompositeRenderer(VIEW_BOX);
        r.setAnnotations([linearDim()]);
        r.renderToSVGString();

        // `unrenderedAnnotationKinds()` is the renderer's own honesty channel:
        // it reports kinds it DROPPED. A dimension must never appear in it.
        expect(r.unrenderedAnnotationKinds()).not.toContain('linear-dim');
        expect(r.unrenderedAnnotationKinds()).toHaveLength(0);
    });

    it('⭐ CONTROL — the assertions above fail for a kind that genuinely does not render', () => {
        // Without this, the tests above could pass against a renderer that drew
        // a mark for literally anything. `north-arrow` is measured-unrendered by
        // the sibling suite, so it must produce no drawable mark AND must be
        // reported as dropped.
        const r = new SVGCompositeRenderer(VIEW_BOX);
        r.setAnnotations([{ ...(linearDim('na-1') as object), type: 'north-arrow' } as never]);
        const svg = r.renderToSVGString();

        const annLayer = svg.slice(svg.indexOf('<g id="annotations"'));
        expect(annLayer).not.toMatch(/<line\b/);
        expect(r.unrenderedAnnotationKinds()).toContain('north-arrow');
    });

    it('⭐ CONTROL — an empty annotation set produces no dimension text', () => {
        // "dropped it" and "there was nothing to draw" must not share a value.
        const r = new SVGCompositeRenderer(VIEW_BOX);
        r.setAnnotations([]);
        const svg = r.renderToSVGString();

        expect(annotationLayer(svg)).not.toContain('2000');
        expect(r.unrenderedAnnotationKinds()).toHaveLength(0);
    });
});
