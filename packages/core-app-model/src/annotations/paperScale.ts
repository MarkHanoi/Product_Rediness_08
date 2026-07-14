// §FEAT-TAG-PAPER-SCALE-AND-SELECTABILITY (L-291) — AN ANNOTATION'S SIZE IS A PROPERTY OF
// THE PAPER, NOT OF THE MODEL AND NOT OF THE SCREEN.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THE BUG ACTUALLY WAS (it is not what it looked like)
// ─────────────────────────────────────────────────────────────────────────────
// The founder's tag bubbles were "the size of a room". The natural diagnosis is "they are
// sized in world metres". THEY WERE NOT. They were sized in SCREEN PIXELS:
//
//     const r = sizeStr ? 16 : 13;                       // ← screen px, fixed
//     const markPx = Math.max(7, mmToPx(style.textSizeMm) * 0.9);   // ← screen px, fixed
//
// A fixed SCREEN size is invariant under zoom — so when you zoom OUT, the building shrinks
// and the bubble does not. Relative to the plan it GROWS without limit, until a
// "Timber Casement" bubble is wider than the window it names. Same symptom as a world-metre
// literal, different mechanism, and a different fix: the size must be pinned to the PAPER
// and then travel through BOTH transforms.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE ONE RULE (C24)
// ─────────────────────────────────────────────────────────────────────────────
//     paper mm  ──(× view scale)──▶  world metres  ──(× zoom)──▶  screen pixels
//
//   • VIEW SCALE (1:50, 1:100) is a DRAWING decision. It fixes how many world metres one
//     sheet millimetre buys. It is the ONLY thing that changes a tag's world size.
//   • ZOOM is a MAGNIFIER. It changes how many screen pixels one world metre buys. It must
//     NEVER change a tag's size relative to the building — zooming is not a scale change.
//
// Get the second one backwards and the tag grows as you zoom out. That is the classic form
// of this bug, it is what shipped, and it looks perfectly fine in a single screenshot.
//
// THIS IS NOT A NEW IDEA. It is exactly `tierGapWorldM` (L-281), which pins the dimension
// tier gap to the paper and scales it by the view. Tags never got it. That is the
// one-consumer disease in yet another organ — so the mechanism lives HERE, once, and both
// consumers call it.

import { withAutoTagSpan } from './tracing.js';

/** The default drawing scale denominator when a view does not declare one (1:100). */
export const DEFAULT_SCALE_DENOMINATOR = 100;

/**
 * The PAPER geometry of a tag, in sheet millimetres. Every number here is a decision about
 * what a drawing should LOOK LIKE when printed, at any scale — which is the only kind of
 * number that belongs in an annotation's size. There is no world metre and no pixel here,
 * and there must never be one anywhere downstream.
 */
export const TAG_PAPER_MM = Object.freeze({
    /** Radius of the door/window bubble (⌀ 7 mm — the drafting-standard tag circle). */
    bubbleRadiusMm: 3.5,
    /** Height of the mark text inside the symbol. */
    markTextMm: 2.5,
    /** Height of the secondary W×H text under the divider. */
    sizeTextMm: 1.8,
    /** Padding between the text run and the symbol edge. */
    padMm: 1.0,
    /** Radius of the dot drawn where the leader touches the element. */
    leaderDotMm: 0.6,
    /** Room-tag name text height. */
    roomNameMm: 2.5,
    /** Room-tag area text height. */
    roomAreaMm: 2.0,
    /** Extra pick tolerance around a tag's symbol and leader (a leader is a hairline). */
    pickToleranceMm: 1.5,
});

/**
 * PAPER millimetres → WORLD metres, at a given drawing scale.
 *
 *   world_mm = paper_mm × scaleDenominator      (the definition of drawing scale, C24)
 *   world_m  = world_mm / 1000
 *
 * 3.5 mm at 1:100 → 0.35 m; at 1:50 → 0.175 m. The SAME rule `tierGapWorldM` uses for the
 * dimension tier gap — stated once, so a tag and a dimension can never disagree about what
 * a millimetre of paper is worth.
 */
export function paperMmToWorldM(paperMm: number, scaleDenominator: number): number {
    const denom = Number.isFinite(scaleDenominator) && scaleDenominator > 0
        ? scaleDenominator
        : DEFAULT_SCALE_DENOMINATOR;
    const mm = Number.isFinite(paperMm) && paperMm > 0 ? paperMm : 0;
    return (mm * denom) / 1000;
}

/**
 * PAPER millimetres → SCREEN pixels, through BOTH transforms.
 *
 * `pxPerWorldM` is the canvas's current zoom (pixels per world metre), which the renderer
 * derives from its own `worldToScreen` — so the tag is scaled by exactly the same factor as
 * the geometry it annotates, and therefore keeps a CONSTANT SIZE RELATIVE TO THE BUILDING at
 * every zoom level. That relative constancy IS "paper size", and it is the property the old
 * fixed-pixel code destroyed.
 *
 * P8 — opens `pryzm.autotag.anchor` (the sizing stage of the tag pipeline).
 */
export function paperMmToPx(
    paperMm: number,
    scaleDenominator: number,
    pxPerWorldM: number,
): number {
    const zoom = Number.isFinite(pxPerWorldM) && pxPerWorldM > 0 ? pxPerWorldM : 0;
    return paperMmToWorldM(paperMm, scaleDenominator) * zoom;
}

/**
 * The view's drawing-scale denominator (`output.customScale` wins over `output.scale`, per
 * `ViewOutputSettings`). A view with no opinion is 1:100 — stated, not silently assumed.
 *
 * P8 — opens a span so the resolved scale is observable per render pass.
 */
export function resolveScaleDenominator(
    output: { scale?: number; customScale?: number } | undefined,
): number {
    return withAutoTagSpan('anchor', (span) => {
        const denom = output?.customScale ?? output?.scale ?? DEFAULT_SCALE_DENOMINATOR;
        const safe = Number.isFinite(denom) && denom > 0 ? denom : DEFAULT_SCALE_DENOMINATOR;
        span.setAttribute('pryzm.autotag.scale_denominator', safe);
        return safe;
    });
}

/**
 * The canvas's current zoom in pixels-per-world-metre, derived from the SAME
 * `worldToScreen` the geometry is drawn with.
 *
 * Deriving it rather than passing it in is deliberate: the tag is then scaled by exactly the
 * transform its building is scaled by, and no third party can hand the renderer a zoom that
 * disagrees with the one on screen.
 */
export function pxPerWorldMetre(
    worldToScreen: (h: number, v: number) => { sx: number; sy: number },
): number {
    const a = worldToScreen(0, 0);
    const b = worldToScreen(1, 0);
    const px = Math.hypot(b.sx - a.sx, b.sy - a.sy);
    return Number.isFinite(px) && px > 0 ? px : 0;
}
