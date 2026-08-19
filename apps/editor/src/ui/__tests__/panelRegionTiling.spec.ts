/**
 * §UX1-PANEL-COLUMN — C06 §7.2, the no-overlap layout policy, measured.
 *
 * The founder's report included "one panel's close button sits on top of another
 * panel's content". That was arithmetic, not taste: the Buildable-envelope card was
 * TOP-anchored with `max-height: calc(100vh - 128px)` and the Site-analysis panel
 * BOTTOM-anchored with `calc(100vh - 32px)`, so on every viewport height they both
 * claimed the middle of the right edge.
 *
 * The fix makes the right edge a declared two-slot column that tiles at 50vh — and a
 * tiling only holds if four numbers stay consistent. Two ways it could silently break:
 *
 *   1. someone edits one offset and not the matching `calc()`;
 *   2. §UI-DENSITY-SCALE scales the px inside the `calc()` while the sibling offset
 *      token scales too but the CONSUMER's own literal does not — which is exactly why
 *      the four tokens are fenced with `@no-scale`.
 *
 * Both are asserted here, against the real `DESIGN_TOKENS` string and the real
 * `scaleCssText` transform. This spec exists because "the panels do not overlap" is a
 * claim that should be computed, not eyeballed once.
 */
import { describe, it, expect } from 'vitest';
import { DESIGN_TOKENS } from '../styles/tokens';
import { scaleCssText, UI_SCALE, MIN_TARGET_PX } from '../styles/uiScale';

/** Reads a single custom property's value out of a stylesheet string. */
function token(css: string, name: string): string {
    const m = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(css);
    if (!m) throw new Error(`token ${name} not found`);
    return m[1].trim();
}

/** Pulls the px number out of `88px` or `calc(50vh - 88px)`. */
function px(value: string): number {
    const m = /(-?\d*\.?\d+)px/.exec(value);
    if (!m) throw new Error(`no px length in "${value}"`);
    return Number.parseFloat(m[1]);
}

describe('§UX1-PANEL-COLUMN — the right edge tiles, it does not overlap', () => {
    it('the top slot ends exactly where the bottom slot begins (50vh)', () => {
        const top = px(token(DESIGN_TOKENS, '--pryzm-panel-col-top'));
        const topMax = token(DESIGN_TOKENS, '--pryzm-panel-col-max-height-top');
        const bottom = px(token(DESIGN_TOKENS, '--pryzm-panel-col-bottom'));
        const bottomMax = token(DESIGN_TOKENS, '--pryzm-panel-col-max-height-bottom');

        // Top panel:    [top, top + (50vh - top)]        = [top, 50vh]
        // Bottom panel: [100vh - bottom - (50vh - bottom), 100vh - bottom] = [50vh, …]
        expect(topMax).toContain('50vh');
        expect(bottomMax).toContain('50vh');
        expect(px(topMax), 'the top max-height must subtract the SAME offset the panel is anchored at')
            .toBe(top);
        expect(px(bottomMax), 'the bottom max-height must subtract the SAME offset the panel is anchored at')
            .toBe(bottom);
    });

    it('clears the two floating view bars above it (result toggle 64px, Forma sub-bar 108px)', () => {
        // The card used to be anchored at 108px — precisely the Forma sub-bar's own
        // offset. Anchoring a panel where a bar already is IS the overlap; this pins
        // that the column starts below both bars (each ~34px tall).
        expect(px(token(DESIGN_TOKENS, '--pryzm-panel-col-top'))).toBeGreaterThanOrEqual(108 + 34);
    });

    it('the four column tokens survive the density transform byte-identical (the @no-scale fence)', () => {
        const scaled = scaleCssText(DESIGN_TOKENS, UI_SCALE);
        for (const name of [
            '--pryzm-panel-col-top',
            '--pryzm-panel-col-max-height-top',
            '--pryzm-panel-col-bottom',
            '--pryzm-panel-col-max-height-bottom',
        ]) {
            expect(token(scaled, name), `${name} was scaled — the tiling arithmetic is now wrong`)
                .toBe(token(DESIGN_TOKENS, name));
        }
    });
});

describe('§UX1-PANEL-CHROME — smaller, but not below the accessibility floors', () => {
    it('panel widths came DOWN from the widest literal they replace (300px)', () => {
        const wide = px(token(scaleCssText(DESIGN_TOKENS, UI_SCALE), '--pryzm-panel-width-wide'));
        const std = px(token(scaleCssText(DESIGN_TOKENS, UI_SCALE), '--pryzm-panel-width'));
        // Effective (post-density) widths. The old cards were 300 / 240 / 232 px
        // inline literals that the density lever could not reach at all.
        expect(wide).toBeLessThan(300);
        expect(std).toBeLessThan(240);
    });

    it('the reopen pills keep a >= 24px hit target after the density transform (C43, WCAG 2.2 SC 2.5.8)', () => {
        // These pills are the ONLY route back to the panels this change closed, so
        // shrinking them below the target floor would turn a decluttering into an
        // accessibility regression. Hence the fence — asserted, not assumed.
        const scaled = scaleCssText(DESIGN_TOKENS, UI_SCALE);
        expect(px(token(scaled, '--pryzm-pill-min-height'))).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    });

    it('panel type stays at or above the 10px legibility floor after scaling', () => {
        const scaled = scaleCssText(DESIGN_TOKENS, UI_SCALE);
        for (const name of [
            '--pryzm-panel-font-size-title',
            '--pryzm-panel-font-size-body',
            '--pryzm-panel-font-size-meta',
            '--pryzm-pill-font-size',
        ]) {
            // The floor only applies because these token names contain `font-size`.
            // If someone renames one to `--pryzm-panel-title-size`, this fails — which
            // is the point: the transform keys the floor off the property NAME.
            expect(px(token(scaled, name)), `${name} scaled below the legibility floor`)
                .toBeGreaterThanOrEqual(10);
        }
    });

    it('the brand stays white + PRYZM purple, never black', () => {
        const surface = token(DESIGN_TOKENS, '--pryzm-panel-surface').toLowerCase();
        expect(surface).toBe('#ffffff');
        for (const name of ['--pryzm-panel-ink', '--pryzm-panel-ink-muted', '--pryzm-panel-ink-faint']) {
            const v = token(DESIGN_TOKENS, name).toLowerCase();
            expect(v, `${name} is pure black — brand forbids it`).not.toBe('#000000');
            expect(v).not.toBe('#000');
        }
    });
});
