/**
 * §CROP-OVERLAY-IS-PRYZM-PURPLE (L-4300) + §CROP-HANDLE-IS-GRABBABLE (L-4302)
 *
 * WHAT THESE TESTS CAN AND CANNOT ESTABLISH — stated first, because this is a
 * COLOUR change and colour is exactly the class where arithmetic has been
 * contradicted by a screenshot before.
 *
 *   CAN: that every crop-overlay colour is the brand purple and nothing else;
 *        that REST and HOVER are DIFFERENT values separated by a real gap (the
 *        specific failure mode of "make it all purple" — the pre-existing hover
 *        colour was already `#6600ff`, so a flat purple deletes the hover state);
 *        that no amber/blue literal survives in either renderer;
 *        that the hit region is larger than the painted handle.
 *
 *   CANNOT: that the result LOOKS right on the founder's screen. Nothing here
 *        opens a browser. The falsification steps are in the ISSUE-LOG rows.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    CROP_INK,
    CROP_BRAND_RGB,
    CROP_HANDLE_DRAWN_PX,
    CROP_HANDLE_DRAWN_HOVER_PX,
    CROP_HANDLE_GRAB_PX,
    HOVER_ALPHA,
    MIN_RAMP_ALPHA_GAP,
    cropZoneFill,
    parseHexRgb,
} from '../ViewCropPalette';
import { PREVIEW_CSS } from '../../preview/PreviewStyle';

/** rgba(r, g, b, a) → [r,g,b,a]; throws on anything else. */
function readRgba(css: string): [number, number, number, number] {
    const m = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(css);
    if (!m) throw new Error(`not an rgba() string: "${css}"`);
    return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}

const RENDERER_SRC = readFileSync(
    resolve(__dirname, '../PlanViewAnnotationRenderer.ts'),
    'utf8',
);
const CANVAS_SRC = readFileSync(
    resolve(__dirname, '../PlanViewCanvas.ts'),
    'utf8',
);

describe('§CROP-OVERLAY-IS-PRYZM-PURPLE — the palette is anchored to the brand, not copied', () => {
    it('the base triple IS PREVIEW_CSS.PRIMARY, parsed — not a retyped literal', () => {
        expect(Array.from(CROP_BRAND_RGB)).toEqual(parseHexRgb(PREVIEW_CSS.PRIMARY));
        // Contract §41 / memory `preview-color-unified-pryzm-purple`: #6600FF.
        expect(Array.from(CROP_BRAND_RGB)).toEqual([102, 0, 255]);
    });

    it('contains NO hex literal of its own — every colour is derived', () => {
        const src = readFileSync(resolve(__dirname, '../ViewCropPalette.ts'), 'utf8');
        // Strip the doc comments, which quote the OLD amber/blue literals on purpose.
        const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        const hexes = code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
        // The only permitted literal is the white handle interior, which is not a hue.
        expect(hexes).toEqual(["#ffffff"]);
    });

    it('parseHexRgb handles #rgb, #rrggbb, and refuses anything else', () => {
        expect(parseHexRgb('#60f')).toEqual([102, 0, 255]);
        expect(parseHexRgb('6600ff')).toEqual([102, 0, 255]);
        expect(() => parseHexRgb('purple')).toThrow(/not a hex colour/);
    });

    it('every ink except the handle interior carries the brand hue exactly', () => {
        for (const key of ['EDGE', 'EDGE_ACTIVE', 'HOVER', 'GUIDE', 'SELECTED'] as const) {
            const [r, g, b] = readRgba(CROP_INK[key]);
            expect([r, g, b], key).toEqual(Array.from(CROP_BRAND_RGB));
        }
        expect(readRgba(cropZoneFill(0.105)).slice(0, 3)).toEqual(Array.from(CROP_BRAND_RGB));
    });

    it('label ink is a DARKENING of the brand hue, not a second colour', () => {
        // Same hue direction (b > r > g, and g === 0), just multiplied toward black.
        for (const key of ['LABEL', 'LABEL_SOFT'] as const) {
            const [r, g, b] = readRgba(CROP_INK[key]);
            expect(g, key).toBe(0);
            expect(b, key).toBeGreaterThan(r);
            expect(r, key).toBeLessThan(CROP_BRAND_RGB[0]);
            expect(b, key).toBeLessThan(CROP_BRAND_RGB[2]);
            // The ratio b/r is preserved from the brand triple (same hue).
            expect(b / r).toBeCloseTo(CROP_BRAND_RGB[2] / CROP_BRAND_RGB[0], 1);
        }
    });
});

describe('§CROP-OVERLAY-IS-PRYZM-PURPLE — the ramp has TWO rungs, and cannot collapse', () => {
    it('HOVER is full strength and is the ONLY value at HOVER_ALPHA', () => {
        expect(readRgba(CROP_INK.HOVER)[3]).toBe(HOVER_ALPHA);
        expect(readRgba(CROP_INK.SELECTED)[3]).toBe(HOVER_ALPHA);   // selection, also full
        for (const key of ['EDGE', 'EDGE_ACTIVE', 'GUIDE'] as const) {
            expect(readRgba(CROP_INK[key])[3], key).toBeLessThan(HOVER_ALPHA);
        }
    });

    it('the resting EDGE sits a real distance below HOVER — this is the whole defect', () => {
        // Painting rest and hover the same purple would have been a REGRESSION dressed
        // as a brand fix: the pre-existing HOVER was already #6600ff.
        const rest = readRgba(CROP_INK.EDGE)[3];
        expect(HOVER_ALPHA - rest).toBeGreaterThanOrEqual(MIN_RAMP_ALPHA_GAP);
        expect(CROP_INK.EDGE).not.toBe(CROP_INK.HOVER);
    });

    it('GUIDE is quieter than EDGE, which is quieter than EDGE_ACTIVE', () => {
        const guide = readRgba(CROP_INK.GUIDE)[3];
        const edge = readRgba(CROP_INK.EDGE)[3];
        const active = readRgba(CROP_INK.EDGE_ACTIVE)[3];
        expect(guide).toBeLessThan(edge);
        expect(edge).toBeLessThan(active);
        expect(active).toBeLessThan(HOVER_ALPHA);
    });
});

describe('§CROP-OVERLAY-IS-PRYZM-PURPLE — no amber or blue survives in either renderer', () => {
    /** The exact literals the founder was looking at. */
    const RETIRED = [
        'rgba(180, 83, 9',      // plan scope accent (amber)
        'rgba(217, 119, 6',     // plan scope dashed guide (amber)
        'rgba(120, 53, 15',     // plan scope label ink (amber)
        'rgba(37, 99, 235',     // elevation crop rectangle (blue)
        '#f59e0b',              // selected anchor-rose sector (amber)
    ];

    it('PlanViewAnnotationRenderer no longer draws the scope box in amber', () => {
        // `rgba(245, 158, 11` (the amber zone wash) legitimately survives ONLY inside the
        // header comment that records what it used to be, so assert on CODE, not on the
        // whole file.
        const code = RENDERER_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        for (const lit of RETIRED) expect(code, lit).not.toContain(lit);
        expect(code).not.toContain('rgba(245, 158, 11');
    });

    it('PlanViewCanvas no longer draws the crop rectangle in blue', () => {
        const code = CANVAS_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        expect(code).not.toContain('rgba(37, 99, 235');
    });

    it('both renderers read the palette rather than restating a colour', () => {
        expect(RENDERER_SRC).toContain("from './ViewCropPalette'");
        expect(CANVAS_SRC).toContain("from './ViewCropPalette'");
    });

    it('the PROJECTION zone stays green — a different fact, not a branding miss', () => {
        // Deliberately NOT unified: green encodes "what projects into this view".
        expect(RENDERER_SRC).toContain('rgba(34, 197, 94');
    });
});

describe('§CROP-HANDLE-IS-GRABBABLE — the hit region is bigger than the paint', () => {
    it('grab radius exceeds the drawn handle half-extent (a near-miss still lands)', () => {
        expect(CROP_HANDLE_GRAB_PX).toBeGreaterThan(CROP_HANDLE_DRAWN_PX / 2);
        expect(CROP_HANDLE_GRAB_PX).toBeGreaterThan(CROP_HANDLE_DRAWN_HOVER_PX / 2);
    });

    it('hovering enlarges the handle', () => {
        expect(CROP_HANDLE_DRAWN_HOVER_PX).toBeGreaterThan(CROP_HANDLE_DRAWN_PX);
    });

    it('both are larger than the 6 px square / 10 px radius they replace', () => {
        expect(CROP_HANDLE_DRAWN_PX).toBeGreaterThan(6);
        expect(CROP_HANDLE_GRAB_PX).toBeGreaterThan(10);
    });

    it('the grab radius matches the plan-side scope handles (one affordance, one feel)', () => {
        // SCOPE_HANDLE_GRAB_PX = 14 in PlanViewInteraction — the file's own precedent for
        // "comfortably grabbable". The two halves of the crop affordance now agree.
        expect(CROP_HANDLE_GRAB_PX).toBe(14);
    });
});
