// PRYZM 2 — Canvas2D DimensionCommitter (S34 Track C / Phase 2B Supplement §A4).
//
// Spec source:
//   • `docs/00_NEW_ARCHITECTURE/phases/PHASE-2B-SUPPLEMENT-AUTODIM-VIEWTEMPLATE.md` §A4
//
// LAYER PURITY (CI Gate L5)
// ─────────────────────────────────────────────────────────────────────────────
// L5 — allowed to use Canvas2D.  ZERO `three`, `@thatopen/*`, `web-ifc*`
// imports.  This file may be loaded in browsers and in Node-with-canvas-shim
// test harnesses.  The unit test suite verifies a Node-load works against a
// hand-rolled `CanvasRenderingContext2D` spy without any three / DOM polyfill.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • `commitDimensions(ctx, evaluated, strings, scale, viewTransform)`:
//     – `ctx`           : a Canvas2D rendering context (or a structurally-
//                         compatible spy in tests).
//     – `evaluated`     : the EvaluatedDimension[] from the kernel evaluator.
//     – `strings`       : Map<id → DimensionString> for style lookup.
//     – `scale`         : pixels-per-mm at current zoom (sheet-mm style sizes
//                         are multiplied by this to convert to pixels).
//     – `viewTransform` : DOMMatrix mapping world-mm → pixel space.
// • For each evaluated dimension this draws (in z-order):
//     1. Witness lines (light)
//     2. Dimension line (heavy)
//     3. Arrowheads / ticks at each end
//     4. Dimension text (rotated for vertical orientation)
//     5. Override-flag underline (orange, only if `isFlagged`).
// • Always wraps in `ctx.save()` / `ctx.restore()` so the caller's transform
//   and styles are not mutated.
//
// EXIT CRITERIA (S34 supplement §A4)
// ─────────────────────────────────────────────────────────────────────────────
// • All 5 ArrowheadStyle values render (`tick`, `open-arrow`, `filled-arrow`,
//   `dot`, `none`).
// • Override flag visible when `isFlagged === true`.
// • `ctx.save` / `ctx.restore` paired (state isolation).
// • Renders in pure Node test harness with hand-rolled spy ctx — no THREE,
//   no DOM, no canvas-package native dep.

import type {
  ArrowheadStyle,
  DimensionString,
  EvaluatedDimension,
} from '@pryzm/schemas/annotation/dimension';

// ── Canvas2D context surface we actually use ──────────────────────────────
//
// Kept intentionally narrow so unit tests can pass a hand-rolled spy without
// implementing the full DOM Canvas2D surface (or pulling `node-canvas`).

export interface Canvas2DLike {
  save(): void;
  restore(): void;
  setTransform(matrix: { a: number; b: number; c: number; d: number; e: number; f: number }): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  closePath(): void;
  stroke(): void;
  fill(): void;
  fillText(text: string, x: number, y: number): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  setLineDash(segments: readonly number[]): void;
  strokeStyle: string;
  fillStyle: string;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
}

export interface ViewTransformMatrix {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

// ── Defaults ───────────────────────────────────────────────────────────────

const DIM_LINE_COLOUR = '#000000';
const DIM_TEXT_COLOUR = '#000000';
const FLAG_COLOUR = '#CC4400';
const DIM_TEXT_HEIGHT_MM = 2.5;
const TEXT_GAP_MM = 1.5;            // Gap between dim line and text baseline.
const TICK_LEN_MM = 2;              // Architectural tick total length.
const ARROW_LEN_MM = 3;             // Open / filled arrow body length.
const ARROW_HALF_MM = 1.0;          // Half-width of arrow at base.
const DOT_RADIUS_MM = 0.6;
const DEFAULT_DIM_WEIGHT_MM = 0.18;
const TICK_WEIGHT_MM = 0.25;
const FLAG_UNDERLINE_HALF_MM = 5;

// ── Public entry point ─────────────────────────────────────────────────────

export function commitDimensions(
  ctx: Canvas2DLike,
  evaluated: readonly EvaluatedDimension[],
  strings: ReadonlyMap<string, DimensionString>,
  scale: number,
  viewTransform: ViewTransformMatrix,
): void {
  ctx.save();
  ctx.setTransform(viewTransform);

  for (const dim of evaluated) {
    const str = strings.get(dim.id as string);
    if (!str) continue;

    drawWitnessLines(ctx, dim, str, scale);
    drawDimensionLine(ctx, dim, str, scale);
    drawArrowheads(ctx, dim, str, scale);
    drawDimensionText(ctx, dim, str, scale);
    if (dim.isFlagged) drawOverrideFlag(ctx, dim, scale);
  }

  ctx.restore();
}

// ── Dimension line (heavy) ────────────────────────────────────────────────

function drawDimensionLine(
  ctx: Canvas2DLike,
  dim: EvaluatedDimension,
  str: DimensionString,
  scale: number,
): void {
  ctx.beginPath();
  ctx.strokeStyle = DIM_LINE_COLOUR;
  ctx.lineWidth = DEFAULT_DIM_WEIGHT_MM * scale;
  ctx.setLineDash([]);

  if (str.orientation === 'horizontal') {
    ctx.moveTo(dim.p1World[0], dim.lineY);
    ctx.lineTo(dim.p2World[0], dim.lineY);
  } else if (str.orientation === 'vertical') {
    ctx.moveTo(dim.lineY, dim.p1World[1]);
    ctx.lineTo(dim.lineY, dim.p2World[1]);
  } else {
    // 'aligned': line directly between the two anchored points (offset already
    // baked into the witness endpoints — keep dim line on the geometry axis).
    ctx.moveTo(dim.p1World[0], dim.p1World[1]);
    ctx.lineTo(dim.p2World[0], dim.p2World[1]);
  }

  ctx.stroke();
}

// ── Witness lines (light) ─────────────────────────────────────────────────

function drawWitnessLines(
  ctx: Canvas2DLike,
  dim: EvaluatedDimension,
  str: DimensionString,
  scale: number,
): void {
  ctx.beginPath();
  ctx.strokeStyle = DIM_LINE_COLOUR;
  ctx.lineWidth = (str.witnessLines?.weight ?? DEFAULT_DIM_WEIGHT_MM) * scale;
  ctx.setLineDash([]);

  ctx.moveTo(dim.p1World[0], dim.p1World[1]);
  ctx.lineTo(dim.witnessP1[0], dim.witnessP1[1]);

  ctx.moveTo(dim.p2World[0], dim.p2World[1]);
  ctx.lineTo(dim.witnessP2[0], dim.witnessP2[1]);

  ctx.stroke();
}

// ── Arrowheads — all 5 styles ─────────────────────────────────────────────

function drawArrowheads(
  ctx: Canvas2DLike,
  dim: EvaluatedDimension,
  str: DimensionString,
  scale: number,
): void {
  const style: ArrowheadStyle = str.arrowheads ?? 'tick';
  if (style === 'none') return;

  // Anchor positions on the dim line + outward direction along it.
  const [a, b, dirX, dirY] = computeDimLineEndpoints(dim, str);

  switch (style) {
    case 'tick':
      drawTick(ctx, a[0], a[1], dirX, dirY, scale);
      drawTick(ctx, b[0], b[1], dirX, dirY, scale);
      break;
    case 'open-arrow':
      drawOpenArrow(ctx, a[0], a[1], dirX, dirY, scale);
      drawOpenArrow(ctx, b[0], b[1], -dirX, -dirY, scale);
      break;
    case 'filled-arrow':
      drawFilledArrow(ctx, a[0], a[1], dirX, dirY, scale);
      drawFilledArrow(ctx, b[0], b[1], -dirX, -dirY, scale);
      break;
    case 'dot':
      drawDot(ctx, a[0], a[1], scale);
      drawDot(ctx, b[0], b[1], scale);
      break;
  }
}

function computeDimLineEndpoints(
  dim: EvaluatedDimension,
  str: DimensionString,
): [readonly [number, number], readonly [number, number], number, number] {
  if (str.orientation === 'horizontal') {
    const a: [number, number] = [dim.p1World[0], dim.lineY];
    const b: [number, number] = [dim.p2World[0], dim.lineY];
    return [a, b, 1, 0];
  }
  if (str.orientation === 'vertical') {
    const a: [number, number] = [dim.lineY, dim.p1World[1]];
    const b: [number, number] = [dim.lineY, dim.p2World[1]];
    return [a, b, 0, 1];
  }
  // 'aligned' / 'angular' — direction is the unit vector p1 → p2.
  const dx = dim.p2World[0] - dim.p1World[0];
  const dy = dim.p2World[1] - dim.p1World[1];
  const len = Math.hypot(dx, dy) || 1;
  return [dim.p1World, dim.p2World, dx / len, dy / len];
}

function drawTick(
  ctx: Canvas2DLike,
  x: number,
  y: number,
  _dirX: number,
  _dirY: number,
  scale: number,
): void {
  // Architectural tick: 45°-rotated dash centered on the anchor.
  const half = (TICK_LEN_MM / 2) * scale;
  ctx.beginPath();
  ctx.strokeStyle = DIM_LINE_COLOUR;
  ctx.lineWidth = TICK_WEIGHT_MM * scale;
  ctx.setLineDash([]);
  ctx.moveTo(x - half, y - half);
  ctx.lineTo(x + half, y + half);
  ctx.stroke();
}

function drawOpenArrow(
  ctx: Canvas2DLike,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  scale: number,
): void {
  // Open chevron pointing outward (in the +dir direction).
  const len = ARROW_LEN_MM * scale;
  const half = ARROW_HALF_MM * scale;
  // Perpendicular to dir.
  const px = -dirY;
  const py = dirX;
  // Tail back from anchor by `len` along -dir.
  const tailX = x - dirX * len;
  const tailY = y - dirY * len;

  ctx.beginPath();
  ctx.strokeStyle = DIM_LINE_COLOUR;
  ctx.lineWidth = TICK_WEIGHT_MM * scale;
  ctx.setLineDash([]);
  ctx.moveTo(tailX + px * half, tailY + py * half);
  ctx.lineTo(x, y);
  ctx.lineTo(tailX - px * half, tailY - py * half);
  ctx.stroke();
}

function drawFilledArrow(
  ctx: Canvas2DLike,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  scale: number,
): void {
  const len = ARROW_LEN_MM * scale;
  const half = ARROW_HALF_MM * scale;
  const px = -dirY;
  const py = dirX;
  const tailX = x - dirX * len;
  const tailY = y - dirY * len;

  ctx.beginPath();
  ctx.fillStyle = DIM_LINE_COLOUR;
  ctx.moveTo(x, y);
  ctx.lineTo(tailX + px * half, tailY + py * half);
  ctx.lineTo(tailX - px * half, tailY - py * half);
  ctx.closePath();
  ctx.fill();
}

function drawDot(
  ctx: Canvas2DLike,
  x: number,
  y: number,
  scale: number,
): void {
  const r = DOT_RADIUS_MM * scale;
  ctx.beginPath();
  ctx.fillStyle = DIM_LINE_COLOUR;
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// ── Dimension text ────────────────────────────────────────────────────────

function drawDimensionText(
  ctx: Canvas2DLike,
  dim: EvaluatedDimension,
  str: DimensionString,
  scale: number,
): void {
  const midX = (dim.p1World[0] + dim.p2World[0]) / 2;
  const midY = (dim.p1World[1] + dim.p2World[1]) / 2;

  ctx.font = `${DIM_TEXT_HEIGHT_MM * scale}px Inter, Arial, sans-serif`;
  ctx.fillStyle = dim.isFlagged ? FLAG_COLOUR : DIM_TEXT_COLOUR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  if (str.orientation === 'horizontal') {
    ctx.fillText(dim.valueText, midX, dim.lineY - TEXT_GAP_MM * scale);
    return;
  }
  if (str.orientation === 'vertical') {
    // Rotate text -90° so it reads bottom-up along the dim line.
    ctx.save();
    ctx.translate(dim.lineY - TEXT_GAP_MM * scale, midY);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(dim.valueText, 0, 0);
    ctx.restore();
    return;
  }
  // 'aligned' / 'angular' — text along the geometry axis.
  ctx.fillText(dim.valueText, midX, midY);
}

// ── Override flag (orange underline) ──────────────────────────────────────

function drawOverrideFlag(
  ctx: Canvas2DLike,
  dim: EvaluatedDimension,
  scale: number,
): void {
  const midX = (dim.p1World[0] + dim.p2World[0]) / 2;
  const half = FLAG_UNDERLINE_HALF_MM * scale;

  ctx.beginPath();
  ctx.strokeStyle = FLAG_COLOUR;
  ctx.lineWidth = 0.5 * scale;
  ctx.setLineDash([]);
  ctx.moveTo(midX - half, dim.lineY - 0.5 * scale);
  ctx.lineTo(midX + half, dim.lineY - 0.5 * scale);
  ctx.stroke();
}
