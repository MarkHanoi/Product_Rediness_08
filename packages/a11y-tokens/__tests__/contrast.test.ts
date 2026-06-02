// A.34.a — contrast calculator tests.

import { describe, expect, it } from 'vitest';
import {
    parseHexColor,
    relativeLuminance,
    contrastRatio,
    checkContrast,
    WCAG_AA_NORMAL,
    WCAG_AAA_NORMAL,
} from '../src/contrast.js';

describe('parseHexColor', () => {
    it('parses #RRGGBB', () => {
        expect(parseHexColor('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255 });
        expect(parseHexColor('#000000')).toEqual({ r: 0, g: 0, b: 0 });
        expect(parseHexColor('#6600FF')).toEqual({ r: 0x66, g: 0x00, b: 0xff });
    });

    it('parses #RGB shorthand', () => {
        expect(parseHexColor('#F0F')).toEqual({ r: 255, g: 0, b: 255 });
    });

    it('tolerates missing leading #', () => {
        expect(parseHexColor('FFFFFF')).toEqual({ r: 255, g: 255, b: 255 });
    });

    it('trims whitespace', () => {
        expect(parseHexColor('  #000000  ')).toEqual({ r: 0, g: 0, b: 0 });
    });

    it('throws on malformed input', () => {
        expect(() => parseHexColor('#GG0000')).toThrow();
        expect(() => parseHexColor('#FF')).toThrow();
        expect(() => parseHexColor('rebeccapurple')).toThrow();
    });
});

describe('relativeLuminance', () => {
    it('returns 1.0 for pure white', () => {
        expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1.0, 4);
    });

    it('returns 0 for pure black', () => {
        expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 4);
    });

    it('mid grey is in [0.2, 0.3]', () => {
        const grey = relativeLuminance({ r: 128, g: 128, b: 128 });
        expect(grey).toBeGreaterThan(0.2);
        expect(grey).toBeLessThan(0.3);
    });
});

describe('contrastRatio', () => {
    it('black on white → 21:1 (the maximum)', () => {
        expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    });

    it('white on black → 21:1 (symmetric)', () => {
        expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
    });

    it('identical colors → 1:1', () => {
        expect(contrastRatio('#888888', '#888888')).toBeCloseTo(1.0, 4);
    });

    it('the canonical body-on-paper pair (light grey on dark grey)', () => {
        // #F5F5FA on #14141C — body text on the panel surface.
        const ratio = contrastRatio('#F5F5FA', '#14141C');
        expect(ratio).toBeGreaterThan(WCAG_AAA_NORMAL); // AAA pass for text-dense surfaces
    });
});

describe('checkContrast', () => {
    it('AA normal pass: black on white', () => {
        const r = checkContrast('#000000', '#FFFFFF', { level: 'AA', size: 'normal' });
        expect(r.passes).toBe(true);
        expect(r.threshold).toBe(WCAG_AA_NORMAL);
    });

    it('AA normal fail: dark grey on lighter grey', () => {
        const r = checkContrast('#888888', '#777777', { level: 'AA', size: 'normal' });
        expect(r.passes).toBe(false);
    });

    it('AA large is more lenient than AA normal', () => {
        // 3.5:1 ratio passes large but not normal.
        const r1 = checkContrast('#717171', '#FFFFFF', { level: 'AA', size: 'normal' });
        const r2 = checkContrast('#717171', '#FFFFFF', { level: 'AA', size: 'large' });
        expect(r1.threshold).toBe(4.5);
        expect(r2.threshold).toBe(3.0);
    });

    it('AAA requires higher contrast than AA', () => {
        const aa = checkContrast('#5A5A5A', '#FFFFFF', { level: 'AA', size: 'normal' });
        const aaa = checkContrast('#5A5A5A', '#FFFFFF', { level: 'AAA', size: 'normal' });
        expect(aa.passes).toBe(true);
        // Same ratio, higher threshold → AAA likely fails or barely passes.
        if (aa.ratio < 7.0) {
            expect(aaa.passes).toBe(false);
        }
    });

    it('non-text threshold is 3:1', () => {
        const r = checkContrast('#888888', '#FFFFFF', { level: 'AA', size: 'non-text' });
        expect(r.threshold).toBe(3.0);
    });
});
