/**
 * @file apps/editor/src/ui/styles/uiScale.ts
 *
 * §UI-DENSITY-SCALE — the SINGLE authority for PRYZM chrome density.
 *
 * ── The problem this solves ──────────────────────────────────────────────────
 * The founder asked for the UI to read "15–20% smaller", i.e. as though the
 * browser were at 80–85% zoom.  Three routes were possible:
 *
 *   A. `zoom` / `transform: scale()` on a chrome root.  REJECTED — there is no
 *      single chrome root (215 `position: fixed` rules in apps/editor/src/ui
 *      make most panels siblings of the viewport, not children of a wrapper),
 *      and any scaled subtree that reaches a <canvas> desynchronises CSS pixels
 *      from the drawing buffer.  This codebase measurably depends on that ratio
 *      (§SELECT-PICK-RESOLUTION logs `viewport=… pick:rendered=…` on every GPU
 *      pick), so the failure mode is silent mis-selection, not a visible break.
 *
 *   B. Full rem migration.  REJECTED for now — 17,195 px literals vs 1,093 rem
 *      across 819 files in apps/editor/src/ui alone.  Weeks of churn.
 *
 *   C. A declared density token applied at the ONE existing CSS choke point.
 *      CHOSEN.  `AppTheme.injectAppTheme()` is already the sole runtime CSS
 *      injection point (CONTRACT §05 §2.1); every panel stylesheet in
 *      `styles/panels/*.ts` is concatenated through it.  Scaling that assembled
 *      string in one place turns density into a one-line lever.
 *
 * ── Why a transform and not hand-edited values ───────────────────────────────
 * A previous density pass hand-multiplied token values by 0.9 (`10.8px` = 12 ×
 * 0.9, `279px` = 310 × 0.9, `153px` = 170 × 0.9) and left `--app-ui-scale: 0.9`
 * DECLARED BUT NEVER REFERENCED — a dead token beside baked-in constants.  That
 * is the repo's recurring "same policy in several places, drifting" defect.
 * This module makes `--app-ui-scale` the real and only authority: changing
 * {@link UI_SCALE} below is the entire change.  0.85 → 0.80 is one character.
 *
 * ── What is deliberately NOT scaled ──────────────────────────────────────────
 *   · selectors and at-rule preludes — so `@media (max-width: 1024px)`
 *     breakpoints keep measuring real viewport pixels and do not drift;
 *   · hairlines (|v| ≤ {@link HAIRLINE_MAX_PX}) — a 1px border at 0.85 renders
 *     as a blurry sub-pixel smear on non-integer-DPI displays;
 *   · anything between `@no-scale:start` / `@no-scale:end` markers — used to
 *     fence <canvas> boxes, whose CSS size must stay in true device pixels;
 *   · `url(...)` values — data URIs must survive byte-identical.
 *
 * ── Accessibility floors (C43, WCAG 2.2 AA) ──────────────────────────────────
 * Density fights accessibility, so two floors clamp the transform:
 *   · {@link MIN_TARGET_PX} (24, SC 2.5.8) — a box that met the target floor
 *     before MUST still meet it after.  Scaling never pushes a ≥24px dimension
 *     below 24px.  This does not inflate anything already under 24px: it only
 *     guarantees this change introduces no new breach.
 *   · {@link MIN_FONT_PX} (10) — text stays legible.
 * Both are declared here, once, and are asserted by the spec beside this file.
 *
 * @see ./AppTheme.ts  — the sole injection point that applies this transform
 * @see ./tokens.ts    — publishes UI_SCALE as the `--app-ui-scale` custom property
 */

/**
 * THE density lever.  1 = today's size; 0.85 = 15% smaller; 0.80 = 20% smaller.
 *
 * Default 0.85 rather than 0.80: the founder offered "20% or maybe 15%", and 15%
 * is the reversible direction.  At 0.85 no control in the injected stylesheet
 * lands under the 24px target floor by scaling alone, so nothing needs a
 * special-case exemption — and special cases are exactly what fragments a single
 * authority.  Going to 0.80 afterwards is a one-line edit here.
 */
export const UI_SCALE = 0.85;

/** WCAG 2.2 AA SC 2.5.8 minimum target size, in CSS px.  A hard floor. */
export const MIN_TARGET_PX = 24;

/** Smallest font-size the transform will produce, in CSS px. */
export const MIN_FONT_PX = 10;

/**
 * Lengths at or below this are hairlines (borders, outlines, 1px rules) and are
 * left untouched — scaling them produces sub-pixel blur rather than density.
 */
export const HAIRLINE_MAX_PX = 2;

/** Opens a region the transform must copy through verbatim. */
export const NO_SCALE_OPEN = '@no-scale:start';
/** Closes a {@link NO_SCALE_OPEN} region. */
export const NO_SCALE_CLOSE = '@no-scale:end';

/**
 * Properties whose px values are structural rather than perceptual density.
 * Borders and outlines keep their crispness; `stroke-width` is geometry.
 */
const NO_SCALE_PROPS = new Set([
    'border', 'border-width', 'border-top', 'border-right', 'border-bottom',
    'border-left', 'border-top-width', 'border-right-width',
    'border-bottom-width', 'border-left-width', 'border-block', 'border-inline',
    'outline', 'outline-width', 'stroke-width', 'background-image',
]);

/**
 * Properties that size a box.  If the authored value already satisfied
 * {@link MIN_TARGET_PX}, the scaled value is clamped so it still does.
 */
const BOX_SIZE_PROPS = new Set([
    'width', 'height', 'min-width', 'min-height', 'inline-size', 'block-size',
    'min-inline-size', 'min-block-size',
]);

/** Formats a scaled length, trimming float noise (`20.400000000000002` → `20.4`). */
function fmt(px: number): string {
    const rounded = Math.round(px * 100) / 100;
    return `${rounded}px`;
}

/** True when this property carries type size (covers `--app-font-size-*` too). */
function isFontSize(prop: string): boolean {
    return prop.includes('font-size') || prop === 'font';
}

/**
 * Scales every px length in a single `prop: value` declaration.
 *
 * Exported for the spec — the clamping rules are the accessibility contract and
 * are asserted directly rather than inferred from whole-stylesheet output.
 *
 * @param declaration a CSS declaration body, WITHOUT its terminating `;`
 * @param scale       density factor, normally {@link UI_SCALE}
 */
export function scaleDeclaration(declaration: string, scale: number): string {
    const colon = declaration.indexOf(':');
    if (colon === -1) return declaration;

    const prop = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration.slice(colon + 1);

    if (!prop || NO_SCALE_PROPS.has(prop)) return declaration;
    // Data URIs and asset references must survive byte-identical.
    if (value.includes('url(')) return declaration;

    const fontSize = isFontSize(prop);
    const boxSize = BOX_SIZE_PROPS.has(prop);

    const scaledValue = value.replace(
        /(-?\d*\.?\d+)px/g,
        (whole: string, raw: string): string => {
            const v = Number.parseFloat(raw);
            if (!Number.isFinite(v)) return whole;
            // Hairlines stay crisp — scaling them blurs rather than densifies.
            if (Math.abs(v) <= HAIRLINE_MAX_PX) return whole;

            let out = v * scale;

            // C43 / WCAG 2.2 AA SC 2.5.8 — never let scaling introduce a breach
            // of the 24px target floor.  Only bites in the narrow band
            // 24 ≤ v < 24/scale; boxes already under the floor are left as
            // authored (pre-existing debt is not this change's to invent).
            if (boxSize && v >= MIN_TARGET_PX && out < MIN_TARGET_PX) {
                out = MIN_TARGET_PX;
            }
            // Legibility floor.  Clamped to the AUTHORED size, never above it:
            // this is a density change, so text may stop shrinking but must never
            // start growing.  Type already authored below the floor (there is
            // some, e.g. 9px section headers) is pre-existing debt and is left
            // exactly as-is rather than silently redesigned.
            if (fontSize && out < MIN_FONT_PX) out = Math.min(MIN_FONT_PX, v);

            return fmt(out);
        },
    );

    return declaration.slice(0, colon + 1) + scaledValue;
}

/**
 * Applies the density scale to an assembled stylesheet.
 *
 * Pure string → string, so it is testable without a DOM and cheap enough to run
 * once at injection time (the stylesheet is ~23k lines and parsed once per
 * session behind `injectAppTheme()`'s idempotency guard).
 *
 * The scanner classifies each segment by its terminating delimiter: a segment
 * ending in `{` is a selector or at-rule prelude and is copied verbatim, so
 * media-query breakpoints never move.  A segment ending in `;` or `}` is a
 * declaration and is scaled.  Comments are opaque, except for the
 * {@link NO_SCALE_OPEN} / {@link NO_SCALE_CLOSE} markers.
 *
 * @param css   the concatenated stylesheet
 * @param scale density factor; `1` is an exact identity and short-circuits
 */
export function scaleCssText(css: string, scale: number = UI_SCALE): string {
    if (scale === 1) return css;

    let out = '';
    let i = 0;
    let segStart = 0;
    let noScaleDepth = 0;
    const n = css.length;

    /** Emits the pending segment, scaling it unless fenced or a selector. */
    const flush = (end: number, delim: string): void => {
        const segment = css.slice(segStart, end);
        out += (delim === '{' || noScaleDepth > 0)
            ? segment
            : scaleDeclaration(segment, scale);
        out += delim;
    };

    while (i < n) {
        // Comments are opaque; they may carry the no-scale fence markers.
        if (css[i] === '/' && css[i + 1] === '*') {
            const close = css.indexOf('*/', i + 2);
            const end = close === -1 ? n : close + 2;
            const comment = css.slice(i, end);
            if (comment.includes(NO_SCALE_OPEN)) noScaleDepth++;
            else if (comment.includes(NO_SCALE_CLOSE) && noScaleDepth > 0) noScaleDepth--;
            i = end;
            continue;
        }

        const ch = css[i];
        if (ch === ';' || ch === '{' || ch === '}') {
            flush(i, ch);
            i++;
            segStart = i;
            continue;
        }
        i++;
    }

    if (segStart < n) out += css.slice(segStart);
    return out;
}
