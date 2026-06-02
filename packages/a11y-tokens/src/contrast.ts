// A.34.a — WCAG 2.2 contrast calculator.
//
// Pure: no DOM. Implements the WCAG relative-luminance formula + the
// (L_lighter + 0.05) / (L_darker + 0.05) contrast ratio. Returns the
// raw ratio so callers can compare against the thresholds in their own
// context (4.5:1 normal text · 3:1 large text · 7:1 AAA normal · 4.5:1
// AAA large).
//
// Strategic context: docs/02-decisions/contracts/C43-ACCESSIBILITY.md §1.5.

/** Parsed RGB triplet in 0..255. */
export interface Rgb {
    readonly r: number;
    readonly g: number;
    readonly b: number;
}

/**
 * Parse a `#RRGGBB` or `#RGB` hex string into Rgb. Throws on malformed
 * input (programmer error — token declarations are static).
 */
export function parseHexColor(hex: string): Rgb {
    let s = hex.trim();
    if (s.startsWith('#')) s = s.slice(1);
    if (s.length === 3) {
        s = s
            .split('')
            .map((c) => c + c)
            .join('');
    }
    if (s.length !== 6) {
        throw new Error(`parseHexColor: invalid hex "${hex}" — expected #RRGGBB or #RGB`);
    }
    const r = parseInt(s.slice(0, 2), 16);
    const g = parseInt(s.slice(2, 4), 16);
    const b = parseInt(s.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
        throw new Error(`parseHexColor: invalid hex "${hex}"`);
    }
    return { r, g, b };
}

/**
 * sRGB → linear-light component (the WCAG 2.x specification's formula).
 * `c` is the 0..255 sRGB channel value.
 */
function linearise(c: number): number {
    const cs = c / 255;
    return cs <= 0.03928 ? cs / 12.92 : ((cs + 0.055) / 1.055) ** 2.4;
}

/**
 * Relative luminance per WCAG 2.x. Returns a value in [0, 1] where
 * 0 = black and 1 = white.
 */
export function relativeLuminance(rgb: Rgb): number {
    const r = linearise(rgb.r);
    const g = linearise(rgb.g);
    const b = linearise(rgb.b);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG contrast ratio per the standard:
 *
 *   (L_lighter + 0.05) / (L_darker + 0.05)
 *
 * Result is in [1, 21]; identical colors yield 1, black/white yield 21.
 */
export function contrastRatio(foreground: string, background: string): number {
    const fg = relativeLuminance(parseHexColor(foreground));
    const bg = relativeLuminance(parseHexColor(background));
    const lighter = Math.max(fg, bg);
    const darker = Math.min(fg, bg);
    return (lighter + 0.05) / (darker + 0.05);
}

// ─────────────────────────────────────────────────────────────────────────────
// WCAG thresholds (per spec)
// ─────────────────────────────────────────────────────────────────────────────

export const WCAG_AA_NORMAL = 4.5;
export const WCAG_AA_LARGE = 3.0;
export const WCAG_AAA_NORMAL = 7.0;
export const WCAG_AAA_LARGE = 4.5;
/** Non-text UI controls (1.4.11). */
export const WCAG_AA_NON_TEXT = 3.0;

export type WcagLevel = 'AA' | 'AAA';
/**
 * 'normal' = body copy + form labels at default size
 * 'large'  = >= 18pt regular OR >= 14pt bold per WCAG 1.4.3
 * 'non-text' = icons + controls; threshold per WCAG 1.4.11
 */
export type TextSize = 'normal' | 'large' | 'non-text';

export interface ContrastCheckResult {
    readonly ratio: number;
    readonly threshold: number;
    readonly passes: boolean;
    readonly level: WcagLevel;
    readonly size: TextSize;
}

/**
 * Check whether a foreground / background pair meets a WCAG level for
 * the given text size. Returns the ratio + the threshold for telemetry.
 */
export function checkContrast(
    foreground: string,
    background: string,
    opts: { level: WcagLevel; size: TextSize },
): ContrastCheckResult {
    const ratio = contrastRatio(foreground, background);
    let threshold: number;
    if (opts.size === 'non-text') {
        threshold = WCAG_AA_NON_TEXT;
    } else if (opts.level === 'AA') {
        threshold = opts.size === 'normal' ? WCAG_AA_NORMAL : WCAG_AA_LARGE;
    } else {
        threshold = opts.size === 'normal' ? WCAG_AAA_NORMAL : WCAG_AAA_LARGE;
    }
    return {
        ratio,
        threshold,
        passes: ratio >= threshold - 1e-6,
        level: opts.level,
        size: opts.size,
    };
}
