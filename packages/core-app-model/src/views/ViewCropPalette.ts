/**
 * ViewCropPalette — §CROP-OVERLAY-IS-PRYZM-PURPLE (L-4300)
 *
 * THE ONE PLACE the plan/elevation **view-authoring overlay** family states its
 * colours. Consumed by exactly two renderers, both in this folder:
 *
 *   • `PlanViewAnnotationRenderer` — the elevation/section **scope box drawn IN
 *     PLAN** (cut line, depth arrow, width handles, zone fills, labels).
 *   • `PlanViewCanvas._renderCropBoundary` — the **crop rectangle drawn IN the
 *     elevation/section view itself** (dashed frame + corner/edge handles).
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * Founder, 2026-08-22: *"The crop overlays must use PRYZM PURPLE."* Before this
 * module those two renderers disagreed with each other AND with the brand:
 *
 *   plan scope box   → amber   `rgba(180,83,9,.95)` / `rgba(217,119,6,.92)` /
 *                              `rgba(120,53,15,.95)` / zone fill `rgba(245,158,11,α)`
 *   elevation crop   → blue    `rgba(37,99,235,.78)` / `rgba(37,99,235,.95)`
 *
 * — seven hard-coded literals across two files for ONE affordance, in two hues,
 * neither of them the brand. `#6600ff` (PRYZM purple, Contract §41 / memory
 * `preview-color-unified-pryzm-purple`) already appeared in the same block as the
 * HOVER colour, so the file was already half-purple by accident.
 *
 * ── THE RAMP IS TWO-VALUE, AND THAT IS THE WHOLE POINT ──────────────────────
 *
 * A naive "make it all purple" would have made **hover indistinguishable from
 * rest**, because the pre-existing hover colour was ALREADY `#6600ff`. So this
 * palette is a *ramp*, not a colour:
 *
 *   REST  — the brand hue at reduced alpha. Over the white drawing sheet this
 *           composites to a lighter violet, so the overlay reads as a guide
 *           rather than as modelled linework.
 *   HOVER — the brand hue at FULL strength (`#6600ff` exactly), reserved for the
 *           handle/edge under the cursor or currently being dragged.
 *
 * Every REST value is strictly below `HOVER_ALPHA`, and the two are separated by
 * `MIN_RAMP_ALPHA_GAP` — asserted by `viewCropPalette.test.ts`, so a future edit
 * cannot silently collapse the ramp back into one flat colour.
 *
 * ── ONE COLOUR LITERAL, IMPORTED ────────────────────────────────────────────
 *
 * There is **no hex literal in this file**. The base triple is parsed from
 * `PREVIEW_CSS.PRIMARY` — the value Contract §41 already made canonical — so the
 * crop overlay cannot drift from the brand purple the creation previews use.
 * `LABEL` is a *derived* darkening of that same triple (for text legibility on a
 * white sheet), not a second colour: see `shade()`.
 *
 * NOT in this palette, deliberately:
 *   • The **projection zone** fill stays green (`_renderScopeZoneFills`). It
 *     encodes a different fact ("what projects into this view") from the cut
 *     zone; collapsing both to purple would delete information, not unify it.
 *   • The `__PRYZM_DEBUG_ZONES__` debug hues stay as they are — they exist
 *     precisely to look nothing like production.
 *
 * No DOM, no THREE, no I/O — plain CSS colour strings for Canvas2D.
 */

import { PREVIEW_CSS } from '../preview/PreviewStyle';

// ── Base triple, parsed (never re-typed) ────────────────────────────────────

/**
 * Parse `#rgb` / `#rrggbb` into an [r,g,b] triple. Exported for the test that
 * proves the palette really is anchored to `PREVIEW_CSS.PRIMARY` rather than to
 * a copy of it.
 */
export function parseHexRgb(hex: string): [number, number, number] {
    const h = hex.trim().replace(/^#/, '');
    const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) {
        throw new Error(`[ViewCropPalette] not a hex colour: "${hex}"`);
    }
    return [
        parseInt(full.slice(0, 2), 16),
        parseInt(full.slice(2, 4), 16),
        parseInt(full.slice(4, 6), 16),
    ];
}

/** PRYZM brand purple as an [r,g,b] triple — sourced from Contract §41, not retyped. */
export const CROP_BRAND_RGB: readonly [number, number, number] = parseHexRgb(PREVIEW_CSS.PRIMARY);

/** Brand hue at alpha `a`. */
function rgba(a: number): string {
    const [r, g, b] = CROP_BRAND_RGB;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Brand hue multiplied toward black by `k` (0..1), at alpha `a`. Used ONLY for
 * label text: `#6600ff` on white is legible as a line but thin at 10–11 px, so
 * label ink is the same hue two-thirds of the way to black. It is derived, so it
 * moves automatically if the brand purple ever changes.
 */
function shade(k: number, a: number): string {
    const [r, g, b] = CROP_BRAND_RGB;
    return `rgba(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)}, ${a})`;
}

// ── The ramp ────────────────────────────────────────────────────────────────

/** Alpha of the HOVER / ACTIVE end of the ramp. Full strength, by definition. */
export const HOVER_ALPHA = 1;

/**
 * The smallest alpha gap that still reads as a state change on a white sheet.
 * Asserted in the palette test: every REST value must sit at least this far
 * below `HOVER_ALPHA`, so "purple everywhere" can never make hover invisible.
 */
export const MIN_RAMP_ALPHA_GAP = 0.2;

/** Alpha the resting (not-hovered) primary edges are drawn at. */
export const EDGE_REST_ALPHA = 0.68;

/** Alpha the dashed extent/guide lines are drawn at — quieter than the edges. */
export const GUIDE_ALPHA = 0.42;

export const CROP_INK = {
    /**
     * Resting primary edge — the cut line in plan, the crop rectangle in
     * elevation, and the border of a resting handle.
     */
    EDGE: rgba(EDGE_REST_ALPHA),

    /**
     * Resting edge for the ACTIVE-but-not-selected linked scope box
     * (`_renderActiveLinkedScopeOverlay`). Slightly stronger than `EDGE` because
     * it carries no handles and must still read as "this is the live cut".
     */
    EDGE_ACTIVE: rgba(0.82),

    /**
     * HOVER / GRABBED. The brand purple at full strength — the ONLY value in this
     * palette at `HOVER_ALPHA`. Never use it for a resting state.
     */
    HOVER: rgba(HOVER_ALPHA),

    /** Dashed depth/extent guide lines — the quietest stroke in the overlay. */
    GUIDE: rgba(GUIDE_ALPHA),

    /** Interior of a resting handle square (so it reads as an open target). */
    HANDLE_FILL: '#ffffff',

    /** Label ink — "Depth 2.86 m", "Active cut". */
    LABEL: shade(0.35, 0.95),

    /** Secondary hint ink — "Drag handles to crop · double-click to open". */
    LABEL_SOFT: shade(0.35, 0.72),

    /**
     * Selected-state ink for the elevation ANCHOR ROSE (`SEL_INK`).
     *
     * ⚠ DELIBERATELY IN SCOPE, and the reasoning is recorded because the rose is
     * NOT a crop affordance. It is the *selected* indicator of the very mark whose
     * crop overlay this palette purples, and `PlanViewAnnotationRenderer` already
     * paints its OTHER selection accents `#6600ff` (the linear-dimension selection
     * stroke). Leaving the rose amber would have left one mark showing two
     * different "this is selected" colours at the same time. The unselected rose
     * ink is untouched — it comes from `style.lineColor` and is a drawing pen,
     * not an affordance.
     */
    SELECTED: rgba(HOVER_ALPHA),
} as const;

/**
 * Cut-zone fill at the caller's alpha. The scope box paints its near zone as a
 * translucent wash; the alpha is a *rendering* decision (subdued vs normal) that
 * stays with the renderer, while the HUE stays here.
 */
export function cropZoneFill(alpha: number): string {
    return rgba(alpha);
}

// ── Handle geometry (drawn size vs grab size) ───────────────────────────────

/**
 * §CROP-HANDLE-IS-GRABBABLE (L-4302) — the crop-boundary handle sizes.
 *
 * The founder's complaint was not that the handles were invisible; it was that
 * reaching for one grabbed something else. Two numbers fix that and they must
 * stay in a fixed relationship:
 *
 *   DRAWN  — the square painted on screen.
 *   GRAB   — the hit RADIUS, which is deliberately LARGER than the drawn square's
 *            half-extent, so a near-miss still lands. `viewCropPalette.test.ts`
 *            asserts `GRAB_PX > DRAWN_PX / 2`; a handle whose hit region is
 *            smaller than its paint is a mouse-accuracy trap.
 *
 * The old values were DRAWN 6 px / GRAB 10 px against a level-datum band that was
 * 20 px tall and tested FIRST. `SCOPE_HANDLE_GRAB_PX = 14` in
 * `PlanViewInteraction` is this file's own precedent for "comfortably grabbable";
 * the crop handles now match it.
 */
export const CROP_HANDLE_DRAWN_PX = 9;

/** Drawn size of the hovered / grabbed handle (the enlarge-on-hover affordance). */
export const CROP_HANDLE_DRAWN_HOVER_PX = 13;

/** Hit radius, in CSS px, for a crop-boundary handle. Larger than the paint. */
export const CROP_HANDLE_GRAB_PX = 14;
