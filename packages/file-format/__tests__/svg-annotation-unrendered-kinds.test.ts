/**
 * svg-annotation-unrendered-kinds.test.ts
 *
 * §FIX-PDF-STAMPS-A-MEANINGLESS-CROSS (L-5010/L-5011, lane ANNO15, founder 2026-08-22)
 *
 * `SVGCompositeRenderer` is the ONE producer of the annotation overlay that
 * `PdfExportService` embeds via svg2pdf — so its `switch (ann.type)` decides what
 * reaches the issued PDF.
 *
 * Its `default:` arm used to draw a 2 mm X at the annotation's first point, and it
 * is reached by FOUR REAL, PLACEABLE KINDS — `wall-tag`, `north-arrow`,
 * `scale-bar`, `matchline`. All four are drawn correctly by
 * `PlanViewAnnotationRenderer`, so the architect saw a north arrow on screen and
 * an X on the drawing they issued.
 *
 * ⭐ AN X IS A WRONG SYMBOL, NOT A DEGRADED ONE. On a construction drawing it is
 * indistinguishable from a centre-mark or a setting-out point. These pin that the
 * mark is gone AND that the omission is still reportable — "dropped it" and
 * "there was nothing to draw" must not share a value.
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

/** Minimal AnnotationElement-shaped fixture; only the fields the switch reads. */
function ann(type: string): never {
    return {
        id: `ann-${type}`,
        type,
        ownerViewId: 'v1',
        geometry2D: { modelPoints: [{ x: 1, y: 0, z: 1 }] },
        parameters: {},
        style: {},
    } as never;
}

/** The four kinds measured 2026-08-22 to reach the default arm. */
const UNRENDERED_TODAY = ['matchline', 'north-arrow', 'scale-bar', 'wall-tag'];

describe('SVGCompositeRenderer — the PDF no longer stamps a meaningless cross', () => {
    it('emits NO visible mark for a kind it cannot draw', () => {
        const svg = new SVGCompositeRenderer(VIEW_BOX)
            .setAnnotations([ann('north-arrow')])
            .renderToSVGString();

        // The old fallback was a <g> of two crossing <line> elements. Nothing
        // drawable may survive for an unrenderable kind.
        const annLayer = svg.slice(svg.indexOf('<g id="annotations"'));
        expect(annLayer).not.toMatch(/<line\b/);
        expect(annLayer).not.toMatch(/<path\b/);
        expect(annLayer).not.toMatch(/<text\b/);
    });

    it('leaves a diagnosable comment in the artefact naming the omitted kind', () => {
        const svg = new SVGCompositeRenderer(VIEW_BOX)
            .setAnnotations([ann('north-arrow')])
            .renderToSVGString();
        expect(svg).toContain('annotation kind "north-arrow" has no SVG renderer');
        expect(svg).toContain('L-5010');
        // A `--` inside an XML comment would corrupt the whole document.
        const comments = svg.match(/<!--[\s\S]*?-->/g) ?? [];
        for (const c of comments) expect(c.slice(4, -3)).not.toContain('--');
    });

    it('⭐ reports the omission — "dropped it" and "nothing to draw" are different values', () => {
        const dropped = new SVGCompositeRenderer(VIEW_BOX);
        dropped.setAnnotations(UNRENDERED_TODAY.map(ann));
        dropped.renderToSVGString();
        expect(dropped.unrenderedAnnotationKinds()).toEqual(UNRENDERED_TODAY);

        const clean = new SVGCompositeRenderer(VIEW_BOX);
        clean.setAnnotations([]);
        clean.renderToSVGString();
        expect(clean.unrenderedAnnotationKinds()).toEqual([]);
    });

    it('a kind the renderer DOES handle is drawn and is not reported as omitted', () => {
        const r = new SVGCompositeRenderer(VIEW_BOX);
        r.setAnnotations([
            {
                id: 'ann-text',
                type: 'text-note',
                ownerViewId: 'v1',
                geometry2D: { modelPoints: [{ x: 1, y: 0, z: 1 }] },
                parameters: { text: 'HELLO' },
                style: {},
            } as never,
        ]);
        const svg = r.renderToSVGString();
        expect(svg).toContain('HELLO');
        expect(r.unrenderedAnnotationKinds()).toEqual([]);
    });

    it('setAnnotations resets the report — a stale omission is itself a false claim', () => {
        const r = new SVGCompositeRenderer(VIEW_BOX);
        r.setAnnotations([ann('matchline')]);
        r.renderToSVGString();
        expect(r.unrenderedAnnotationKinds()).toEqual(['matchline']);

        r.setAnnotations([]);
        expect(r.unrenderedAnnotationKinds()).toEqual([]);
    });
});
