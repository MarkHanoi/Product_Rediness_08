/**
 * ViewportResize — §SHEET-RESIZE-IS-A-CROP (L-3809)
 *
 * Dragging a viewport's edge, expressed as the only thing it can honestly mean.
 *
 * ─── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 * The founder, 2026-08-22, among six sheet requests: *"select a viewport → see
 * its properties → change the scale there → **resize it** → crop it in place."*
 *
 * Resize was the one item of the six that was genuinely ABSENT — and absent in
 * the most misleading way available. Measured:
 *
 *   grep -rn "sh-resize-handle"
 *     → 9 hits, ALL in apps/editor/src/ui/styles/panels/sheetEditor.ts
 *       (a base class + eight compass cursor rules). ZERO DOM producers.
 *
 * The stylesheet described eight resize handles in full. Nothing had ever
 * created an element to wear them [authored-but-unwired]. To anyone reading the
 * CSS the feature was present; to the founder it did not exist.
 *
 * ─── ⭐ WHAT RESIZING A VIEWPORT ACTUALLY MEANS ────────────────────────────
 * A viewport HAS NO SIZE OF ITS OWN. `ViewportSvgComposer` says so directly: it
 * is exactly as big as the drawing it shows, at the scale it shows it at. So a
 * handle cannot simply set a width — it has to change something that DETERMINES
 * the width, and there are only three candidates:
 *
 *   1. **Change the scale.** Rejected. That control already exists, and
 *      dragging a corner would land on scales no drafter would choose (1:63).
 *   2. **Stretch the linework into the new rectangle.** Rejected outright: it
 *      falsifies the drawing and makes the printed `1:N` a lie. ADR-0340
 *      already records this rejection for *"clamp the oversized viewport to the
 *      sheet"* — same reasoning, same answer.
 *   3. **Change what the viewport SHOWS.** ⭐ Correct, and already a
 *      first-class, undoable, persisted concept: `crop` (L-1840).
 *
 * So RESIZE IS CROP, expressed as a gesture instead of as four numbers. The
 * paper size follows, because paper size is a FUNCTION of crop and scale. This
 * module is the inverse of the composer's framing arithmetic and lives beside
 * it for that reason.
 *
 * ─── WHY PAPER-MM EDGE DELTAS, AND NOT PIXELS OR SCREEN COORDINATES ────────
 * Because the y-flip is not this module's decision. The sheet canvas measures
 * from the bottom-left, the composed SVG measures world Z downward from its top
 * edge, and the DOM measures from the top-left. A function that accepted screen
 * coordinates would have to know which of the three it was being handed, and
 * that is exactly the confusion that put every PDF viewport off by half its own
 * size (§SHEET-PDF-PLACES-THE-VIEWPORT, L-1874).
 *
 * So the caller — which owns a coordinate system — states how far each EDGE
 * moved, in paper millimetres, in the one direction that edge can move. This
 * module converts mm to metres and applies them. `viewportPaperRect` made the
 * same choice for the same reason.
 *
 * Contract compliance:
 *   C03    — produces a value for `SetViewportCropCommand`; mutates nothing.
 *   §05 §4 — pure arithmetic; no DOM, no store reads, no I/O.
 *   P8     — every exported function carries an OpenTelemetry span.
 */

import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('@pryzm/file-format');

/** A drawing-space rectangle in metres — the shape `SheetViewport.crop` holds. */
export interface CropRectM {
    minX: number;
    minZ: number;
    maxX: number;
    maxZ: number;
}

/**
 * How far each edge moved, in PAPER MILLIMETRES.
 *
 * Signs are stated per edge rather than as a vector, because each edge moves
 * along one axis and a shared sign convention is what a reader gets wrong:
 *
 *   · `leftMm`   — POSITIVE moves the left edge RIGHT (the viewport shrinks).
 *   · `rightMm`  — POSITIVE moves the right edge RIGHT (the viewport grows).
 *   · `topMm`    — POSITIVE moves the top edge DOWN (the viewport shrinks).
 *   · `bottomMm` — POSITIVE moves the bottom edge DOWN (the viewport grows).
 *
 * Omitted edges do not move, which is how one handle drives one or two edges
 * (a `--se` corner passes `rightMm` and `bottomMm`; an `--e` edge passes only
 * `rightMm`).
 */
export interface EdgeDeltaMm {
    readonly leftMm?: number;
    readonly rightMm?: number;
    readonly topMm?: number;
    readonly bottomMm?: number;
}

/**
 * The smallest crop a drag may produce, in metres.
 *
 * A gesture crosses zero on its way to inverted, and both are shapes the
 * composer REFUSES as `'bad-crop'` (`_isUsableCrop`). Rather than emit one and
 * let the composition fail, a drag that would collapse the viewport is refused
 * HERE and the previous crop stands — so the drag visibly stops at the floor
 * instead of the drawing vanishing.
 *
 * 0.05 m is 50 mm of building: below that there is nothing legible to frame at
 * any drawing scale.
 */
export const MIN_CROP_EXTENT_M = 0.05;

/**
 * Tolerance on the floor comparison, in metres (1 micrometre).
 *
 * ⚠ FOUND BY A TEST THAT ASSERTED THE EXACT BOUNDARY, AND IT WAS A REAL DEFECT,
 * not a test artefact. Shrinking a 6 m crop to exactly `MIN_CROP_EXTENT_M`
 * requires a 119 mm drag; `6 - (119 × 50 / 1000)` evaluates to
 * `0.04999999999999982` in IEEE-754, which is BELOW 0.05, so the last legal
 * drag of the gesture was REFUSED and the viewport stopped a hair short of the
 * floor it is allowed to reach.
 *
 * The floor is a design decision about legibility, measured in centimetres.
 * Letting binary floating-point representation decide which side of it a drag
 * falls on makes the limit unpredictable and scale-dependent — the same drag
 * succeeds at 1:50 and fails at 1:100. A micrometre is far below any distance
 * this product means anything at, and far above the representation error.
 */
const CROP_FLOOR_EPSILON_M = 1e-6;

/**
 * The world-space rectangle a composition currently frames.
 *
 * Derived from the composition rather than from the viewport, because an
 * UNCROPPED viewport has no `crop` field to read — it frames its drawing's
 * content bounds. Resizing such a viewport therefore CREATES a crop equal to
 * what it is showing right now, which is the "crop to what I am looking at is a
 * copy rather than a conversion" property ADR-0340 §3 established.
 *
 * `originX` / `originZ` are the world coordinates the composer maps to the SVG's
 * left and top edges; the extents are the paper size converted back to metres.
 */
export function currentCropFromComposition(
    composed: { originX: number; originZ: number; widthMm: number; heightMm: number },
    scaleDenom: number,
): CropRectM | null {
    if (!(scaleDenom > 0) || !Number.isFinite(scaleDenom)) return null;
    if (!Number.isFinite(composed.originX) || !Number.isFinite(composed.originZ)) return null;
    if (!(composed.widthMm > 0) || !(composed.heightMm > 0)) return null;

    const wM = mmToWorldM(composed.widthMm, scaleDenom);
    const hM = mmToWorldM(composed.heightMm, scaleDenom);
    return {
        minX: composed.originX,
        minZ: composed.originZ,
        maxX: composed.originX + wM,
        maxZ: composed.originZ + hM,
    };
}

/**
 * Paper millimetres → drawing-space metres, at a scale denominator.
 *
 * The exact inverse of the composer's `worldM × 1000 / scaleDenom`. Exported
 * because the resize gesture and the composer must agree to the last decimal:
 * if they disagree, a viewport dragged to 120 mm composes at 119.4 mm and
 * creeps on every drag.
 */
export function mmToWorldM(mm: number, scaleDenom: number): number {
    return (mm * scaleDenom) / 1000;
}

/**
 * Apply an edge drag to a crop rectangle.
 *
 * Returns the new crop, or `null` when the drag would collapse or invert the
 * rectangle. `null` means REFUSED — the caller keeps the previous crop and
 * dispatches nothing. It deliberately does not clamp-and-succeed: a clamp that
 * reports success would let a drag report that it moved an edge it did not
 * move, and the viewport would silently stop tracking the cursor while the
 * command history filled with no-ops.
 */
export function resizeCropByEdgeDelta(
    current: CropRectM,
    scaleDenom: number,
    delta: EdgeDeltaMm,
): CropRectM | null {
    return tracer.startActiveSpan(
        'pryzm.sheets.resizeCropByEdgeDelta',
        (span): CropRectM | null => {
            try {
                span.setAttribute('pryzm.scale', scaleDenom);

                if (!(scaleDenom > 0) || !Number.isFinite(scaleDenom)) return _refuse(span, 'bad-scale');
                for (const v of [current.minX, current.minZ, current.maxX, current.maxZ]) {
                    if (!Number.isFinite(v)) return _refuse(span, 'bad-current');
                }

                // World Z increases DOWNWARD on paper: the composer maps
                // `originZ` to the SVG's TOP edge. So the top edge is `minZ` and
                // the bottom edge is `maxZ`. Getting this backwards mirrors the
                // drawing vertically, which is the defect class L-1874 records
                // for the drop handler.
                const next: CropRectM = {
                    minX: current.minX + mmToWorldM(delta.leftMm   ?? 0, scaleDenom),
                    maxX: current.maxX + mmToWorldM(delta.rightMm  ?? 0, scaleDenom),
                    minZ: current.minZ + mmToWorldM(delta.topMm    ?? 0, scaleDenom),
                    maxZ: current.maxZ + mmToWorldM(delta.bottomMm ?? 0, scaleDenom),
                };

                // Inclusive floor, epsilon-tolerant — see CROP_FLOOR_EPSILON_M.
                const floor = MIN_CROP_EXTENT_M - CROP_FLOOR_EPSILON_M;
                if (next.maxX - next.minX < floor) return _refuse(span, 'collapsed-x');
                if (next.maxZ - next.minZ < floor) return _refuse(span, 'collapsed-z');

                span.setAttribute('pryzm.cropped', true);
                return next;
            } finally {
                span.end();
            }
        },
    );
}

function _refuse(span: { setAttribute: (k: string, v: string) => void }, reason: string): null {
    span.setAttribute('pryzm.refused', reason);
    return null;
}

/**
 * The paper size a crop produces at a scale — what the viewport will measure
 * once the command lands.
 *
 * Exists so a drag can show the resulting size WHILE dragging without
 * re-composing the drawing, and so a test can assert that dragging an edge by
 * N mm actually changes the paper size by N mm. That assertion is the whole
 * point of the feature: a resize handle that stores a crop and does not change
 * the size the user sees is a lie.
 */
export function cropPaperSizeMm(
    crop: CropRectM,
    scaleDenom: number,
): { widthMm: number; heightMm: number } {
    return {
        widthMm:  ((crop.maxX - crop.minX) * 1000) / scaleDenom,
        heightMm: ((crop.maxZ - crop.minZ) * 1000) / scaleDenom,
    };
}
