/**
 * CanvasRenderScale — §FIX-PLAN-CANVAS-HAIRLINE-FLOOR (L-288)
 *
 * **THE DRAWING IS RIGHT AND THE SCREEN IS LYING.**
 *
 * L-277 built the zone ladder. L-285 added the FUNCTION axis. Both are correct in the pen table
 * and both are correct in EXPORT. And on a 1× display the user sees NEITHER, because
 * `PlanViewCanvas` floored every stroke at `hairline = max(0.5, 1/dpr)` — **1.0 CSS px at
 * dpr 1** — and at 96 DPI:
 *
 *     wall    PROJECTION  0.25 mm → 0.945 px  ─┐
 *     door    PROJECTION  0.18 mm → 0.680 px   ├─ ALL clamped to exactly 1 px. Identical.
 *     ceiling PROJECTION  0.13 mm → 0.491 px   │
 *     any     BEYOND      0.09 mm → 0.340 px  ─┘
 *
 * So on most laptops — and on most projectors — the entire PROJECTION tier and the whole BEYOND
 * tier rendered at ONE uniform width. The hierarchy the founder judges the product by was
 * invisible on the screen he judges it on.
 *
 * ═══ THE FIX IS THE RASTERISER, NOT THE PENS ═══
 *
 * *** THE PEN TABLE IS NOT TOUCHED. *** Inflating it would "fix" the screen by CORRUPTING THE
 * EXPORT, where the hierarchy is already right (at `EXPORT_DPI` those same pens are 2.95 px and
 * 2.07 px — cleanly distinct). The pens are correct paper widths; the screen simply did not have
 * the pixels to draw them. So we give it the pixels.
 *
 * The plan canvas now renders into a backing store of at least {@link MIN_LEGIBLE_BACKING_SCALE},
 * **independently of `devicePixelRatio`**. Nothing else changes: `lineWidth` is still the pen's
 * true width in CSS millimetre-derived pixels, the export path never sees this module, and the
 * only value that moves is the FLOOR — which drops from 1.0 CSS px to `1/scale` CSS px, i.e.
 * **exactly one device pixel**, which is the only floor that was ever physically justified.
 *
 * ═══ WHY OPTION (a), AND WHAT IT COSTS ═══
 *
 * The alternative was a display-only monotonic mm→px expansion applied at the stroke. It was
 * rejected: it makes the screen tell a *prettier lie* (a line whose weight is no longer its
 * weight), it needs a second, parallel width authority — the exact defect L-280 was spent
 * deleting — and it degrades the moment anyone zooms or exports a screenshot. Option (a) makes
 * the screen tell the TRUTH.
 *
 * COST: fill-rate, quadratic in the scale. At dpr 1 the backing store goes from 1× to 9× the CSS
 * pixel count. **That cost is already shipped and already bounded**: `MAX_BACKING_SCALE` is 4 —
 * this file inherits the pre-existing `MAX_PLAN_VIEW_CANVAS_DPR = 4` policy — so a dpr-4 machine
 * has ALWAYS rendered this canvas at 16×, on every viewport size the product supports. A 1×
 * machine at 9× is therefore strictly INSIDE an envelope the product already accepts, on the one
 * canvas in the app that is redrawn on interaction rather than at 60 fps.
 * (Honest limit: this is a pixel-count argument, not a benchmark on the founder's hardware.
 * If a large viewport ever proves too slow, the lever is `MAX_BACKING_SCALE`, and lowering it
 * makes the L-288 guard go red — which is the correct place to have that argument.)
 *
 * ═══ TWO FLOORS, NOT ONE ═══
 *
 * `hairline` used to mean two unrelated things at once, which is why L-288 could not be fixed in
 * place: it was BOTH the minimum stroke width AND the dash-pattern scale. They are now separate,
 * because they answer to different things:
 *
 *   • {@link minStrokePx} answers to the BACKING STORE — one device pixel is the thinnest mark
 *     the rasteriser can make, whatever the display is.
 *   • {@link dashScale} answers to the DISPLAY — dash *periods* are multi-pixel and were never
 *     the problem, so this keeps its old device-ratio behaviour EXACTLY and the drawing's dashes
 *     look identical to yesterday's.
 *
 * Contract compliance:
 *   Contract-23 §7   — the mm→px conversion; this module changes only the FLOOR, never the width
 *   Contract-23 §8   — the pen table is UNTOUCHED (see the export guard in the L-288 test)
 *   C09 §4.6.4       — the ladder must be strict ON SCREEN, not merely in millimetres
 *   P5/§05           — pure arithmetic: no DOM, no THREE, no I/O
 *
 * @module CanvasRenderScale
 */

import { SCREEN_PX_PER_MM } from './DrawingConstants';
import { THINNEST_SYSTEM_PEN_MM } from './PenWeightTable';

/**
 * The ceiling on the backing-store scale.
 *
 * Inherited, deliberately, from the pre-existing `MAX_PLAN_VIEW_CANVAS_DPR` — this is not a new
 * budget, it is the budget the product already spends on high-DPI machines. Keeping the two
 * equal is what makes "a 1× machine now costs what a 4× machine already cost" a true statement.
 */
export const MAX_BACKING_SCALE = 4;

/**
 * The smallest backing-store scale at which the THINNEST pen in the table still renders as a
 * real mark instead of being clamped onto the raster floor.
 *
 * DERIVED, never chosen: `ceil(1 / (thinnestPenMm × SCREEN_PX_PER_MM))`. With the table's
 * lightest pen at 0.09 mm ≈ 0.340 CSS px, that is `ceil(2.94) = 3`. Add a finer pen to the table
 * tomorrow and this rises to match it — which is the entire point of deriving it. A hand-typed
 * `3` here would silently re-introduce L-288 for exactly the new pen that motivated the change.
 */
export const MIN_LEGIBLE_BACKING_SCALE: number = Math.min(
    MAX_BACKING_SCALE,
    Math.ceil(1 / (THINNEST_SYSTEM_PEN_MM * SCREEN_PX_PER_MM)),
);

/**
 * The backing-store scale the plan canvas renders at.
 *
 * `clamp(max(devicePixelRatio, MIN_LEGIBLE_BACKING_SCALE), 1, MAX_BACKING_SCALE)`.
 *
 * NOTE it raises a dpr-2 display too (2 → 3): at scale 2 the floor is 0.5 CSS px, which still
 * clamps BEYOND (0.340) and ceiling PROJECTION (0.491) onto each other. L-288 is not a 1×
 * problem that happens to spare retina — it is a *raster-floor* problem that 1× makes worst.
 */
export function resolveCanvasRenderScale(devicePixelRatio: number | undefined): number {
    const dpr = Number.isFinite(devicePixelRatio) && (devicePixelRatio as number) > 0
        ? (devicePixelRatio as number)
        : 1;
    return Math.min(MAX_BACKING_SCALE, Math.max(1, dpr, MIN_LEGIBLE_BACKING_SCALE));
}

/**
 * The minimum stroke width, in CSS pixels, for a canvas rendering at `scale`.
 *
 * **Exactly ONE DEVICE PIXEL.** This is the only floor with a physical justification: it is the
 * thinnest mark the rasteriser can make. The old `max(0.5, 1/dpr)` was a floor of one device
 * pixel *or half a CSS pixel, whichever was coarser* — and that second clause is what flattened
 * the ladder, because it is a floor expressed in the units of the DRAWING rather than of the
 * DEVICE.
 */
export function minStrokePx(scale: number): number {
    return 1 / Math.max(1, scale);
}

/**
 * The dash-pattern scale — **unchanged from the pre-L-288 `hairline`**, and deliberately still a
 * function of the DISPLAY's ratio rather than the backing scale.
 *
 * Dash *periods* (`[4,3]`, `[8,4]`) are multi-pixel and were never clamped, so they were never
 * part of the L-288 defect. Tying them to the backing scale instead would have shrunk every dash
 * on a 1× screen by 3× as a side-effect of a line-WIDTH fix — a regression smuggled in by a
 * variable that meant two things.
 */
export function dashScale(devicePixelRatio: number | undefined): number {
    const dpr = Number.isFinite(devicePixelRatio) && (devicePixelRatio as number) > 0
        ? (devicePixelRatio as number)
        : 1;
    return Math.max(0.5, 1 / Math.max(dpr, 1));
}
