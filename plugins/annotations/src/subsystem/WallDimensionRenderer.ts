/**
 * WallDimensionRenderer — §DIM-II
 *
 * Revit-style 2D canvas drawing for linear dimension annotations.
 *
 * Anatomy of a Revit linear dimension (in plan view):
 *
 *       refA                           refB       ← wall face snap points
 *        |                              |
 *        |  (witness line A, solid)     |  (witness line B, solid)
 *        |                              |
 *   ─────┼──────────────────────────────┼─────    ← dimension line
 *   tick │◄────────  14550 mm  ────────►│ tick
 *   ─────┼──────────────────────────────┼─────
 *        |                              |           ← overshoot
 *
 * Rules:
 *   • Witness lines are solid (not dashed) with a small gap at the element
 *     end and a small overshoot past the dimension line.
 *   • Endpoints use filled diagonal tick marks (Revit default), not arrowheads.
 *   • Text sits centred on the dimension line inside a white-filled rectangle
 *     with a thin border, naturally covering the underlying line.
 *
 * CONTRACT COMPLIANCE:
 *   §01 §4   — Pure rendering utility; no side effects outside the canvas context
 *   §01 §5   — No DOM queries, no store access, no window.* access
 *   §05 §7.8 — No bim-* / @thatopen/ui elements
 *
 * CALLED BY: AnnotationRenderLayer._renderLinearDim()
 */

import { AnnotationStyle } from './AnnotationTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Tuning constants — match Revit's default dimension appearance
// ─────────────────────────────────────────────────────────────────────────────

/** Pixel gap between element reference point and the start of the witness line */
const WITNESS_GAP_PX = 5;

/** Pixel amount by which the witness line overshoots past the dimension line */
const WITNESS_OVERSHOOT_PX = 5;

/** Half-length of each diagonal tick mark in pixels */
const TICK_HALF_LEN_PX = 7;

/** Minimum rendered font size to keep text legible at any zoom */
const MIN_FONT_PX = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface DimScreenPoint {
    x: number;
    y: number;
    visible: boolean;
}

export interface WallDimRenderParams {
    /** Projected screen position of reference point A (wall face snap) */
    refA: DimScreenPoint;
    /** Projected screen position of reference point B (wall face snap) */
    refB: DimScreenPoint;
    /** Projected screen position of dimension line endpoint A (offset from refA) */
    dimA: DimScreenPoint;
    /** Projected screen position of dimension line endpoint B (offset from refB) */
    dimB: DimScreenPoint;
    /** Formatted measurement label, e.g. "14550 mm" */
    label: string;
    /** Merged annotation style */
    style: AnnotationStyle;
    /**
     * Whether the dim line is offset from the reference line.
     * When false (offset ≈ 0), witness lines are omitted.
     */
    hasOffset: boolean;
}

/**
 * §DIM-VI-3 — Parameters for a multi-segment (string) linear dimension.
 *
 * refs[i]  — projected reference point i (wall face snap)
 * dims[i]  — projected dimension line point i (ref offset perpendicularly)
 * labels   — N-1 per-segment labels, labels[i] spans refs[i]→refs[i+1]
 *
 * Lengths: refs.length === dims.length === labels.length + 1
 */
export interface WallDimStringRenderParams {
    /** All N projected reference points (first = leftmost, last = rightmost) */
    refs: DimScreenPoint[];
    /** All N projected dimension-line points (same order as refs) */
    dims: DimScreenPoint[];
    /** N-1 per-segment labels (one per adjacent ref pair) */
    labels: string[];
    /** Merged annotation style */
    style: AnnotationStyle;
    /**
     * Whether the dim line is offset from the reference line.
     * When false (offset ≈ 0), witness lines are omitted.
     */
    hasOffset: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Unit vector from (ax, ay) toward (bx, by). Returns {0,0} when degenerate. */
function unitDir(ax: number, ay: number, bx: number, by: number): { x: number; y: number } {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.5) return { x: 0, y: 0 };
    return { x: dx / len, y: dy / len };
}

/** Convert paper-space mm to screen pixels at 96 dpi */
function mmToPx(mm: number): number {
    return (mm / 25.4) * 96;
}

// ─────────────────────────────────────────────────────────────────────────────
// WallDimensionRenderer
// ─────────────────────────────────────────────────────────────────────────────

export class WallDimensionRenderer {
    /**
     * Draw a complete Revit-style linear dimension onto a 2D canvas context.
     *
     * Drawing order (so later passes occlude earlier ones):
     *   1. Witness lines (solid, gap + overshoot)
     *   2. Dimension line (solid)
     *   3. Tick marks at each endpoint
     *   4. Text box (white fill + border — covers the dimension line)
     *   5. Label text
     *
     * The caller must NOT wrap this in save/restore — the method manages its own.
     */
    static draw(ctx: CanvasRenderingContext2D, p: WallDimRenderParams): void {
        const { refA, refB, dimA, dimB, label, style, hasOffset } = p;

        if (!dimA.visible && !dimB.visible) return;

        const lw      = Math.max(0.5, mmToPx(style.lineWeight));
        const textPx  = Math.max(MIN_FONT_PX, mmToPx(style.textSizeMm));

        ctx.save();
        ctx.lineCap  = 'round';
        ctx.lineJoin = 'round';

        // 1 ── Witness lines
        if (hasOffset) {
            WallDimensionRenderer._drawWitnessLines(ctx, refA, refB, dimA, dimB, style.lineColor, lw);
        }

        // 2 ── Dimension line
        WallDimensionRenderer._drawDimLine(ctx, dimA, dimB, style.lineColor, lw);

        // 3 ── Tick marks (one at each end, oriented toward the other end)
        WallDimensionRenderer._drawTickMark(ctx, dimA, dimB, style.lineColor, lw);
        WallDimensionRenderer._drawTickMark(ctx, dimB, dimA, style.lineColor, lw);

        // 4 + 5 ── Text box + label (drawn last — white box interrupts the dim line)
        WallDimensionRenderer._drawLabel(ctx, dimA, dimB, label, style, textPx, lw);

        ctx.restore();
    }

    /**
     * §DIM-VI-3 — Draw a multi-segment (string) Revit-style linear dimension.
     *
     * Drawing order:
     *   1. Single continuous dimension line (dims[0] → dims[N-1])
     *   2. Witness lines at every ref point (including intermediate refs)
     *   3. Tick marks at the two outer dim endpoints only (dims[0] and dims[N-1])
     *   4. Per-segment text boxes + labels, each centred between adjacent dim points
     */
    static drawString(ctx: CanvasRenderingContext2D, p: WallDimStringRenderParams): void {
        const { refs, dims, labels, style, hasOffset } = p;
        if (refs.length < 2 || dims.length !== refs.length || labels.length !== refs.length - 1) return;

        const visible = dims.some(d => d.visible);
        if (!visible) return;

        const lw     = Math.max(0.5, mmToPx(style.lineWeight));
        const textPx = Math.max(MIN_FONT_PX, mmToPx(style.textSizeMm));

        ctx.save();
        ctx.lineCap  = 'round';
        ctx.lineJoin = 'round';

        // 1 ── Witness lines at every ref point
        if (hasOffset) {
            ctx.strokeStyle = style.lineColor;
            ctx.lineWidth   = lw;
            ctx.setLineDash([]);
            for (let i = 0; i < refs.length; i++) {
                WallDimensionRenderer._drawOneLine(ctx, refs[i]!, dims[i]!);
            }
        }

        // 2 ── Single dimension line spanning all dim points
        WallDimensionRenderer._drawDimLine(ctx, dims[0]!, dims[dims.length - 1]!, style.lineColor, lw);

        // 3 ── Tick marks only at the outermost endpoints
        WallDimensionRenderer._drawTickMark(ctx, dims[0]!,             dims[1]!,             style.lineColor, lw);
        WallDimensionRenderer._drawTickMark(ctx, dims[dims.length - 1]!, dims[dims.length - 2]!, style.lineColor, lw);

        // 4 ── Per-segment label boxes (drawn last — white boxes interrupt the dim line)
        for (let i = 0; i < labels.length; i++) {
            WallDimensionRenderer._drawLabel(ctx, dims[i]!, dims[i + 1]!, labels[i]!, style, textPx, lw);
        }

        ctx.restore();
    }

    // ── Drawing helpers ───────────────────────────────────────────────────────

    /**
     * Draw two solid witness lines connecting wall face snap points to the
     * dimension line, with a gap at the element end and an overshoot at the top.
     */
    private static _drawWitnessLines(
        ctx: CanvasRenderingContext2D,
        refA: DimScreenPoint,
        refB: DimScreenPoint,
        dimA: DimScreenPoint,
        dimB: DimScreenPoint,
        color: string,
        lw: number
    ): void {
        ctx.strokeStyle = color;
        ctx.lineWidth   = lw;
        ctx.setLineDash([]);

        WallDimensionRenderer._drawOneLine(ctx, refA, dimA);
        WallDimensionRenderer._drawOneLine(ctx, refB, dimB);
    }

    /** Draw a single witness line segment (with gap and overshoot) */
    private static _drawOneLine(
        ctx: CanvasRenderingContext2D,
        ref: DimScreenPoint,
        dim: DimScreenPoint
    ): void {
        const d = unitDir(ref.x, ref.y, dim.x, dim.y);
        if (d.x === 0 && d.y === 0) return;

        const startX = ref.x + d.x * WITNESS_GAP_PX;
        const startY = ref.y + d.y * WITNESS_GAP_PX;
        const endX   = dim.x + d.x * WITNESS_OVERSHOOT_PX;
        const endY   = dim.y + d.y * WITNESS_OVERSHOOT_PX;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
    }

    /** Draw the main dimension line connecting dimA to dimB */
    private static _drawDimLine(
        ctx: CanvasRenderingContext2D,
        dimA: DimScreenPoint,
        dimB: DimScreenPoint,
        color: string,
        lw: number
    ): void {
        ctx.strokeStyle = color;
        ctx.lineWidth   = lw;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(dimA.x, dimA.y);
        ctx.lineTo(dimB.x, dimB.y);
        ctx.stroke();
    }

    /**
     * Draw a filled diagonal tick mark at point `at`, oriented relative to the
     * dimension line direction from `at` toward `other`.
     *
     * Revit default tick geometry: a diagonal slash drawn at 45° to the dim line
     * so it crosses the endpoint, giving the characteristic "slash" look.
     */
    private static _drawTickMark(
        ctx: CanvasRenderingContext2D,
        at: DimScreenPoint,
        other: DimScreenPoint,
        color: string,
        lw: number
    ): void {
        const dir = unitDir(at.x, at.y, other.x, other.y);
        if (dir.x === 0 && dir.y === 0) return;

        // Perpendicular to dim line
        const perp = { x: -dir.y, y: dir.x };

        // 45° diagonal: one axis is the dim-line direction, the other is perp.
        // Start and end of the slash straddle the endpoint symmetrically.
        const tx1 = at.x + (dir.x + perp.x) * TICK_HALF_LEN_PX;
        const ty1 = at.y + (dir.y + perp.y) * TICK_HALF_LEN_PX;
        const tx2 = at.x - (dir.x + perp.x) * TICK_HALF_LEN_PX;
        const ty2 = at.y - (dir.y + perp.y) * TICK_HALF_LEN_PX;

        ctx.strokeStyle = color;
        ctx.lineWidth   = lw * 1.6;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(tx1, ty1);
        ctx.lineTo(tx2, ty2);
        ctx.stroke();
    }

    /**
     * Draw the dimension label centred horizontally on the midpoint of the
     * dimension line, offset perpendicularly above (or below when the line
     * points downward) so the label floats clear of the line — matching the
     * Revit plan-view convention where text sits above the dimension line.
     *
     * The dimension line itself remains unbroken. A white semi-transparent pill
     * sits behind the text for legibility against any background.
     */
    private static _drawLabel(
        ctx: CanvasRenderingContext2D,
        dimA: DimScreenPoint,
        dimB: DimScreenPoint,
        label: string,
        style: AnnotationStyle,
        textPx: number,
        _lw: number
    ): void {
        // Midpoint of the dimension line
        const mx = (dimA.x + dimB.x) * 0.5;
        const my = (dimA.y + dimB.y) * 0.5;

        // Perpendicular direction — choose the one pointing toward the top of
        // the screen (smaller y in canvas space) so text always reads above the line.
        const dx = dimB.x - dimA.x;
        const dy = dimB.y - dimA.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        let px = 0;
        let py = -1;   // default: straight up
        if (len > 0.5) {
            // Two perpendicular candidates: (-dy, dx) and (dy, -dx)
            px = -dy / len;
            py =  dx / len;
            // If this candidate points downward (py > 0), flip it
            if (py > 0) { px = -px; py = -py; }
        }

        // Offset the text centre above the line by slightly more than 1 text height
        const offset = textPx * 1.1;
        const tcx = mx + px * offset;
        const tcy = my + py * offset;

        ctx.font = `${textPx}px ${style.fontFamily}`;
        const tw   = ctx.measureText(label).width;
        const padH = 5;
        const padV = 2;
        const boxW = tw + padH * 2;
        const boxH = textPx + padV * 2;

        // White semi-transparent pill behind the text for legibility
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.setLineDash([]);
        if ((ctx as any).roundRect) {
            ctx.beginPath();
            (ctx as any).roundRect(tcx - boxW * 0.5, tcy - boxH * 0.5, boxW, boxH, 3);
            ctx.fill();
        } else {
            ctx.fillRect(tcx - boxW * 0.5, tcy - boxH * 0.5, boxW, boxH);
        }

        // Label text
        ctx.fillStyle    = style.textColor;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, tcx, tcy);
    }
}
