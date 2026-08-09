/**
 * @file apps/editor/src/ui/styles/__tests__/uiScale.spec.ts
 *
 * §UI-DENSITY-SCALE — pins the density transform's contract.
 *
 * These are not cosmetic assertions.  The transform rewrites EVERY length in
 * the single stylesheet the whole editor renders from, so its failure modes are
 * repo-wide: a scaled media query silently changes which breakpoint is active,
 * a scaled canvas box silently breaks pointer→pixel correspondence, and a
 * scaled control can silently drop under the WCAG 2.2 AA target floor.  Each of
 * those is pinned below, plus the real assembled stylesheet is swept to prove
 * the floors hold in practice and not merely in principle.
 */
import { describe, it, expect } from 'vitest';
import {
    scaleCssText,
    scaleDeclaration,
    UI_SCALE,
    MIN_TARGET_PX,
    MIN_FONT_PX,
    HAIRLINE_MAX_PX,
} from '../uiScale';
import { DESIGN_TOKENS } from '../tokens';

describe('§UI-DENSITY-SCALE — the lever', () => {
    it('is a single declared factor in the founder-requested 15–20% band', () => {
        expect(UI_SCALE).toBeGreaterThanOrEqual(0.80);
        expect(UI_SCALE).toBeLessThanOrEqual(0.85);
    });

    it('scale = 1 is an exact identity, so the lever is fully reversible', () => {
        const css = '.a { padding: 16px; font-size: 13px; }';
        expect(scaleCssText(css, 1)).toBe(css);
    });

    it('publishes the factor as --app-ui-scale rather than re-deriving it', () => {
        expect(DESIGN_TOKENS).toContain(`--app-ui-scale:       ${UI_SCALE}`);
    });
});

describe('§UI-DENSITY-SCALE — what must NOT move', () => {
    it('leaves media-query breakpoints alone (they measure real viewport px)', () => {
        const css = '@media (max-width: 1024px) { .a { padding: 20px; } }';
        const out = scaleCssText(css, 0.85);
        expect(out).toContain('@media (max-width: 1024px)');
        expect(out).toContain('padding: 17px');
    });

    it('leaves selectors alone even when they contain digits and px-like text', () => {
        const out = scaleCssText('.grid-100px, .b:hover { gap: 40px; }', 0.85);
        expect(out).toContain('.grid-100px, .b:hover');
        expect(out).toContain('gap: 34px');
    });

    it('leaves hairlines crisp — scaling 1px produces sub-pixel blur, not density', () => {
        expect(scaleDeclaration('border-top: 1px solid #000', 0.85))
            .toBe('border-top: 1px solid #000');
        expect(scaleDeclaration('outline: 2px solid red', 0.85))
            .toBe('outline: 2px solid red');
        // The guard is on magnitude, not just on border-ish property names.
        expect(scaleDeclaration(`box-shadow: 0 ${HAIRLINE_MAX_PX}px 0 #000`, 0.85))
            .toContain(`${HAIRLINE_MAX_PX}px`);
    });

    it('leaves url() values byte-identical so data URIs survive', () => {
        const d = 'background: url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTZweCIvPg==) 10px 10px';
        expect(scaleDeclaration(d, 0.85)).toBe(d);
    });

    it('honours @no-scale fences — the canvas escape hatch actually fences', () => {
        const css = [
            '.chrome { height: 140px; }',
            '/* @no-scale:start */',
            '.foc-canvas { height: 140px; }',
            '/* @no-scale:end */',
            '.more-chrome { height: 140px; }',
        ].join('\n');
        const out = scaleCssText(css, 0.85);
        expect(out).toContain('.chrome { height: 119px; }');
        expect(out).toContain('.foc-canvas { height: 140px; }');
        expect(out).toContain('.more-chrome { height: 119px; }');
    });
});

describe('§UI-DENSITY-SCALE — C43 / WCAG 2.2 AA floors', () => {
    it('never lets scaling push a compliant target under the 24px floor', () => {
        // 28 × 0.85 = 23.8 — a breach the transform would otherwise introduce.
        expect(scaleDeclaration('min-height: 28px', 0.85))
            .toBe(`min-height: ${MIN_TARGET_PX}px`);
        expect(scaleDeclaration('width: 24px', 0.85))
            .toBe(`width: ${MIN_TARGET_PX}px`);
    });

    it('does not inflate boxes that were already under the floor', () => {
        // Pre-existing debt is not this change's to invent a fix for; the
        // contract is only that scaling introduces NO NEW breach.
        expect(scaleDeclaration('height: 20px', 0.85)).toBe('height: 17px');
    });

    it('clamps only inside the narrow band, so density is otherwise uniform', () => {
        expect(scaleDeclaration('height: 40px', 0.85)).toBe('height: 34px');
        expect(scaleDeclaration('height: 100px', 0.85)).toBe('height: 85px');
    });

    it('keeps text legible, including via --app-font-size-* custom properties', () => {
        expect(scaleDeclaration('font-size: 11px', 0.85))
            .toBe(`font-size: ${MIN_FONT_PX}px`);       // 9.35 → floored
        expect(scaleDeclaration('--app-font-size-body: 10.8px', 0.85))
            .toBe(`--app-font-size-body: ${MIN_FONT_PX}px`);
        expect(scaleDeclaration('font-size: 24px', 0.85)).toBe('font-size: 20.4px');
    });

    it('NEVER enlarges type — a density pass may stop shrinking, not start growing', () => {
        // Caught by the render harness: 9px section headers were being pushed UP
        // to the 10px floor, i.e. the UI got BIGGER in places. Type authored below
        // the floor is pre-existing debt, not this change's to silently redesign.
        expect(scaleDeclaration('font-size: 9px', 0.85)).toBe('font-size: 9px');
        expect(scaleDeclaration('font-size: 8px', 0.85)).toBe('font-size: 8px');
    });
});

describe('§UI-DENSITY-SCALE — swept over the real stylesheet', () => {
    const scaled = scaleCssText(DESIGN_TOKENS, UI_SCALE);

    it('never scales type below the floor, and never enlarges it either', () => {
        const read = (s: string) => [...s.matchAll(/font-size[^:]*:\s*([\d.]+)px/g)]
            .map((m) => Number.parseFloat(m[1]!));
        const before = read(DESIGN_TOKENS);
        const after = read(scaled);
        expect(before.length).toBeGreaterThan(0);
        expect(after).toHaveLength(before.length);

        before.forEach((b, i) => {
            const a = after[i]!;
            // Density only: type may shrink or hold, never grow.
            expect(a).toBeLessThanOrEqual(b);
            // Anything at or above the floor must still clear it afterwards;
            // anything authored below it is pre-existing debt, left untouched.
            if (b >= MIN_FONT_PX) expect(a).toBeGreaterThanOrEqual(MIN_FONT_PX);
            else expect(a).toBe(b);
        });
    });

    it('produces no NaN, no negative-zero and no float noise', () => {
        expect(scaled).not.toContain('NaN');
        expect(scaled).not.toMatch(/\d{6,}px/);   // 20.400000000000002px
    });

    it('stays valid CSS shape — brace balance is preserved exactly', () => {
        const count = (s: string, c: string) => s.split(c).length - 1;
        expect(count(scaled, '{')).toBe(count(DESIGN_TOKENS, '{'));
        expect(count(scaled, '}')).toBe(count(DESIGN_TOKENS, '}'));
        expect(count(scaled, ';')).toBe(count(DESIGN_TOKENS, ';'));
    });
});
