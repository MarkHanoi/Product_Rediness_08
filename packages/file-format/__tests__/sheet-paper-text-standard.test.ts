/**
 * sheet-paper-text-standard.test.ts
 *
 * §SHEET-TEXT-IS-PAPER-LETTERING (L-10680/L-10681, lane PDFSHEET35, founder 2026-08-24)
 *
 * The founder: *"Exporting sheets to PDF — the text of the rooms, labels, is not
 * readable."* Every room label came out a dense dark smudge; the linework beside
 * it was clean.
 *
 * ⭐ THESE ASSERT MILLIMETRES, NOT THE EXISTENCE OF GLYPHS. A test that proved
 * `<text>` elements were emitted would have passed before the bug and after it —
 * the glyphs were always there, they were the wrong size and painted with a 1 mm
 * pen. The numbers below are the whole point:
 *
 *   · MEASURED BEFORE — room name `font-size="2.500"` in a 1-user-unit-per-mm
 *     document → a **1.79 mm cap height**; number 1.61 mm; area **1.43 mm**. The
 *     ISO 3098 nominal series starts at 1.8 mm, so all three were under the
 *     smallest height the standard admits.
 *   · MEASURED BEFORE — `<g id="annotations" … stroke="#1a2035">` with no
 *     `stroke-width` anywhere beneath it, so every glyph was stroked at SVG's
 *     initial `stroke-width: 1` = **one paper millimetre**, which svg2pdf.js
 *     reproduces as `fillThenStroke` + `setLineWidth(1.0)`. ISO 3098-0 type B
 *     puts lettering line width at d = 0.1 h; 1 mm on a 1.79 mm cap is 5.6 × that,
 *     applied on top of a solid fill.
 *   · MEASURED BEFORE — room-tag baselines advanced 1.00 em = **1.40 h exactly**,
 *     ISO's minimum with zero margin; with ±0.5 mm of stroke bleed per row the
 *     rows overlapped by 0.29 mm and merged.
 *
 * The standard they check did not exist when the bug was found — see
 * `SPEC-AUTODIMENSION` §12.14, written by this lane, and `PaperTextStandard.ts`.
 */

import { describe, it, expect } from 'vitest';
import { SVGCompositeRenderer, type SVGViewBox } from '../src/export/sheets/SVGCompositeRenderer';
import {
    CAP_HEIGHT_RATIO,
    MIN_PAPER_TEXT_HEIGHT_MM,
    DEFAULT_PAPER_TEXT_HEIGHT_MM,
    letteringHeightMm,
    emFromLetteringHeight,
    letteringHeightFromEm,
} from '../src/export/sheets/PaperTextStandard';

/**
 * The composer emits `width="<W>mm" … viewBox="0 0 <W> <H>"`, so ONE SVG USER
 * UNIT IS ONE PAPER MILLIMETRE. Every number below is therefore already in mm —
 * that identity is what made the 1 mm default stroke so destructive, and it is
 * asserted rather than assumed.
 */
const VIEW_BOX: SVGViewBox = { widthMm: 174.1, heightMm: 190.5, originX: 0, originZ: 0, scale: 100 };

function roomTag(style: Record<string, unknown> = {}): never {
    return {
        id: 'rt-1',
        type: 'room-tag',
        ownerViewId: 'vd-sys-plan-l0',
        geometry2D: { modelPoints: [{ x: 4, y: 0, z: 3 }], offset: 0 },
        parameters: { roomName: 'LIVING', roomNumber: '01', area: 18.4, areaLabel: '18.4 m²' },
        style,
    } as never;
}

/** Every `font-size="…"` in the emitted document, in paper mm. */
function fontSizesMm(svg: string): number[] {
    return [...svg.matchAll(/font-size="([\d.]+)"/g)].map(m => Number(m[1]));
}

/** Every `<text …>` baseline `y`, in paper mm, in document order. */
function textBaselinesMm(svg: string): number[] {
    return [...svg.matchAll(/<text\b[^>]*\sy="([\d.-]+)"/g)].map(m => Number(m[1]));
}

describe('§SHEET-TEXT-IS-PAPER-LETTERING — the sheet SVG is measured in millimetres', () => {

    it('the document really is 1 user unit = 1 mm, so every font-size below IS a paper size', () => {
        const svg = new SVGCompositeRenderer(VIEW_BOX).setAnnotations([roomTag()]).renderToSVGString();
        expect(svg).toContain('width="174.1mm"');
        expect(svg).toContain('height="190.5mm"');
        expect(svg).toContain('viewBox="0 0 174.100 190.500"');
    });

    // ── The stroke — the mechanism that produced the smudge ───────────────────

    it('⭐ NO <text> may inherit a stroke: the annotation group carries none, and every text says so', () => {
        const svg = new SVGCompositeRenderer(VIEW_BOX).setAnnotations([roomTag()]).renderToSVGString();

        const groupOpen = svg.match(/<g id="annotations"[^>]*>/)![0];
        // BEFORE: `<g id="annotations" fill="#1a2035" stroke="#1a2035" font-family=…>`
        expect(groupOpen, 'the annotation group must not paint a stroke onto its text').not.toContain('stroke=');

        const texts = [...svg.matchAll(/<text\b[^>]*>/g)].map(m => m[0]);
        expect(texts.length).toBeGreaterThan(0);
        for (const t of texts) {
            expect(t, `every <text> must refuse the pen explicitly: ${t}`).toContain('stroke="none"');
        }
    });

    it('⭐ no annotation text is left to SVG\'s initial stroke-width — 1 user unit here is 1 mm of ink', () => {
        const svg = new SVGCompositeRenderer(VIEW_BOX).setAnnotations([roomTag()]).renderToSVGString();
        // svg2pdf.js: `getTextRenderingMode` → fillThenStroke when a stroke is in
        // scope, then `setLineWidth(strokeWidth)` with the default 1.0. The only
        // safe state is no stroke in scope at all.
        const annLayer = svg.slice(svg.indexOf('<g id="annotations"'));
        const stroked = [...annLayer.matchAll(/<text\b[^>]*>/g)]
            .filter(m => !/stroke="none"/.test(m[0]));
        expect(stroked, 'a stroked glyph is a smear, not bold text').toEqual([]);
    });

    // ── The heights — the number the founder asked for ────────────────────────

    it('⭐ the room name draws a 2.500 mm CAP HEIGHT on paper (it drew 1.79 mm)', () => {
        const svg = new SVGCompositeRenderer(VIEW_BOX).setAnnotations([roomTag()]).renderToSVGString();
        const sizes = fontSizesMm(svg);
        expect(sizes.length).toBe(3); // name, number, area

        const capName = letteringHeightFromEm(sizes[0]);
        expect(capName).toBeCloseTo(DEFAULT_PAPER_TEXT_HEIGHT_MM, 3);
        // The value that produced the smudge, pinned so it cannot come back.
        expect(capName).not.toBeCloseTo(2.5 * CAP_HEIGHT_RATIO, 3); // 1.79 mm
    });

    it('⭐ NO row of a room label falls below the 1.8 mm ISO 3098 floor (the area line was 1.43 mm)', () => {
        const svg = new SVGCompositeRenderer(VIEW_BOX).setAnnotations([roomTag()]).renderToSVGString();
        const caps = fontSizesMm(svg).map(letteringHeightFromEm);
        expect(caps).toHaveLength(3);
        for (const c of caps) {
            expect(c, `cap height ${c.toFixed(3)} mm is below the ISO 3098 floor`)
                .toBeGreaterThanOrEqual(MIN_PAPER_TEXT_HEIGHT_MM - 1e-9);
        }
        // Measured after the fix: 2.500 / 2.250 / 2.000 mm.
        expect(caps.map(c => Number(c.toFixed(3)))).toEqual([2.5, 2.25, 2]);
    });

    it('⭐ a style asking for illegibly small lettering is CLAMPED, not obeyed', () => {
        const svg = new SVGCompositeRenderer(VIEW_BOX)
            .setAnnotations([roomTag({ textSizeMm: 0.4 })])
            .renderToSVGString();
        for (const c of fontSizesMm(svg).map(letteringHeightFromEm)) {
            expect(c).toBeGreaterThanOrEqual(MIN_PAPER_TEXT_HEIGHT_MM - 1e-9);
        }
    });

    it('a LARGER declared height is honoured — the floor is a floor, not a fixed size', () => {
        const svg = new SVGCompositeRenderer(VIEW_BOX)
            .setAnnotations([roomTag({ textSizeMm: 5 })])
            .renderToSVGString();
        expect(letteringHeightFromEm(fontSizesMm(svg)[0])).toBeCloseTo(5, 3);
    });

    // ── The leading — why three legible lines still merged ────────────────────

    it('⭐ baseline advance clears ISO 3098-0 type B (b ≥ 1.4 h) — it sat EXACTLY on it', () => {
        const svg = new SVGCompositeRenderer(VIEW_BOX).setAnnotations([roomTag()]).renderToSVGString();
        const ys = textBaselinesMm(svg);
        expect(ys).toHaveLength(3);

        const h = letteringHeightFromEm(fontSizesMm(svg)[0]); // 2.5 mm
        const advances = [ys[1] - ys[0], ys[2] - ys[1]];
        for (const a of advances) {
            expect(a / h, `advance ${a.toFixed(3)} mm is ${(a / h).toFixed(3)} h`)
                .toBeGreaterThanOrEqual(1.4);
        }
        // BEFORE: 2.500 mm over a 1.79 mm cap = 1.397 h, i.e. on the limit.
        expect(advances[0]).toBeGreaterThan(2.5);
    });

    it('the label block stays CENTRED on the room centroid as rows drop out (§12.5)', () => {
        const three = new SVGCompositeRenderer(VIEW_BOX).setAnnotations([roomTag()]).renderToSVGString();
        const one = new SVGCompositeRenderer(VIEW_BOX).setAnnotations([{
            id: 'rt-2', type: 'room-tag', ownerViewId: 'v',
            geometry2D: { modelPoints: [{ x: 4, y: 0, z: 3 }], offset: 0 },
            parameters: { roomName: 'LIVING' }, style: {},
        } as never]).renderToSVGString();

        const threeYs = textBaselinesMm(three);
        const midOfThree = (threeYs[0] + threeYs[2]) / 2;
        const soleY = textBaselinesMm(one)[0];
        // Both blocks are centred about the same centroid; baselines sit half a
        // cap height below the row centre, so the two agree to well under a mm.
        expect(Math.abs(midOfThree - soleY)).toBeLessThan(0.6);
    });

    // ── The invariant that makes it PAPER space ───────────────────────────────

    it('⭐⭐ cap height is INVARIANT under drawing scale — 1:50 and 1:100 letter identically', () => {
        const at100 = new SVGCompositeRenderer({ ...VIEW_BOX, scale: 100 })
            .setAnnotations([roomTag()]).renderToSVGString();
        const at50 = new SVGCompositeRenderer({ ...VIEW_BOX, scale: 50 })
            .setAnnotations([roomTag()]).renderToSVGString();
        // This is the definition of "sized in paper space, not model space": the
        // drawing halves, the lettering does not move at all.
        expect(fontSizesMm(at50)).toEqual(fontSizesMm(at100));
        expect(letteringHeightFromEm(fontSizesMm(at50)[0])).toBeCloseTo(2.5, 3);
    });

    // ── Every other annotation kind that carries text ─────────────────────────

    it('⭐ THE SWEEP — no text-bearing annotation kind letters below the floor', () => {
        const at = (x: number) => ({ modelPoints: [{ x, y: 0, z: 2 }, { x: x + 4, y: 0, z: 2 }], offset: 0.5 });
        const kinds: [string, Record<string, unknown>][] = [
            ['linear-dim',        {}],
            ['angular-dim',       {}],
            ['radius-dim',        {}],
            ['slope-dim',         { slopeRatio: '1:10' }],
            ['text-note',         { text: 'NOTE\nSECOND LINE' }],
            ['tag',               { cachedLabel: 'W-01' }],
            ['spot-elevation',    { elevation: 3.2 }],
            ['keynote',           { keynoteKey: 'K3' }],
            ['door-tag',          { typeMark: 'D01', width: 0.9, height: 2.1 }],
            ['window-tag',        { typeMark: 'W01', width: 1.2, height: 1.5 }],
            ['level-tag',         { levelName: 'L0', elevation: 0 }],
            ['grid-bubble',       { gridName: 'A' }],
            ['section-mark',      { detailRef: '1', sheetRef: 'A-201' }],
            ['elevation-mark',    { detailRef: '2', sheetRef: 'A-301' }],
            ['callout-detail',    { detailRef: '3', sheetRef: 'A-501' }],
            ['room-tag',          { roomName: 'WC', roomNumber: '02', areaLabel: '3.1 m²' }],
            ['level-datum-line',  { levelName: 'L1', elevation: 3 }],
            ['section-grid-line', { gridName: 'B' }],
            ['roof-slope-arrow',  { slopeRatio: '1:40' }],
        ];

        const anns = kinds.map(([type, parameters], i) => ({
            id: `a${i}`, type, ownerViewId: 'v',
            geometry2D: { ...at(i * 6), modelPoints: [...at(i * 6).modelPoints, { x: i * 6 + 2, y: 0, z: 5 }] },
            parameters, style: {},
        } as never));

        const r = new SVGCompositeRenderer(VIEW_BOX);
        const svg = r.setAnnotations(anns).renderToSVGString();

        // Nothing silently dropped — an omitted kind would hide an unmeasured one.
        expect(r.unrenderedAnnotationKinds()).toEqual([]);

        const caps = fontSizesMm(svg).map(letteringHeightFromEm);
        expect(caps.length).toBeGreaterThanOrEqual(kinds.length);
        const under = caps.filter(c => c < MIN_PAPER_TEXT_HEIGHT_MM - 1e-9);
        expect(under, `${under.length} annotation rows letter below 1.8 mm`).toEqual([]);

        // And not one of them may be stroked.
        const stroked = [...svg.matchAll(/<text\b[^>]*>/g)].filter(m => !/stroke="none"/.test(m[0]));
        expect(stroked).toEqual([]);
    });
});

describe('PaperTextStandard — the cap-height ↔ em conversion is the whole defect', () => {

    it('⭐ a declared "text height" round-trips to the SAME cap height it asked for', () => {
        for (const h of [1.8, 2.5, 3.5, 5, 7]) {
            expect(letteringHeightFromEm(emFromLetteringHeight(h))).toBeCloseTo(h, 9);
        }
    });

    it('⭐ passing textSizeMm straight to font-size loses 28 % — the measured undersize', () => {
        // What the renderer used to do, stated as arithmetic so the size of the
        // error is on the record: 2.5 mm asked for, 1.79 mm drawn.
        expect(letteringHeightFromEm(2.5)).toBeCloseTo(1.79, 2);
        expect(1 - CAP_HEIGHT_RATIO).toBeCloseTo(0.284, 3);
    });

    it('an absent style lands on the 2.5 mm default, never on zero', () => {
        expect(letteringHeightMm(undefined)).toBe(DEFAULT_PAPER_TEXT_HEIGHT_MM);
        expect(letteringHeightMm(0)).toBe(DEFAULT_PAPER_TEXT_HEIGHT_MM);
        expect(letteringHeightMm(Number.NaN)).toBe(DEFAULT_PAPER_TEXT_HEIGHT_MM);
    });

    it('the floor is the first member of the ISO 3098 nominal series', () => {
        expect(MIN_PAPER_TEXT_HEIGHT_MM).toBe(1.8);
        expect(letteringHeightMm(1.0)).toBe(1.8);
    });
});
