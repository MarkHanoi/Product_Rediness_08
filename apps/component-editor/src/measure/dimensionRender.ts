// dimensionRender — draw placed dimensions onto the sketch canvas, to
// SPEC-AUTODIMENSION §12 (lane CE-VIEWS-AND-MEASURE).
//
// Split out of the canvas for the same reason `sketchRender.ts` was: the §13
// 300-LoC cap. Same shape as that file — every function takes the 2D context
// plus its data, no module state.
//
// ─── THE THREE §12 CLAUSES THIS FILE IS ACCOUNTABLE FOR ─────────────────────
//
// §12.11 LINEWEIGHT HIERARCHY — dimensions are THIN, and *"annotations must
//   never visually overpower cut walls"*. `sketchRender.drawEntities()` strokes
//   geometry at 1.5 px, so `DIM_LINE_WIDTH_PX` is 0.75 — strictly half, and
//   strictly less. `__tests__/measure/dimensionRender.test.ts` asserts the
//   INEQUALITY against the entity weight rather than the literal, so bumping
//   geometry weight later cannot silently invert the hierarchy.
//
// §12.14 LETTERING — text height is a PAPER dimension, INVARIANT under scale.
//   On a live canvas that means the value is lettered at a constant APPARENT
//   size and is NOT multiplied by the sketcher's zoom. It is FILLED, never
//   stroked (§12.14: *"emitting both is not 'bold' — it is a smear"*). Both
//   come from `annotationTextStandard.ts`.
//
// §12.10 ALIGNMENT — *"no floating annotations"*. The value sits ON the
//   dimension line at its midpoint, and the line sits at its string's standard
//   offset, so dimensions of the same rank land in one continuous band.
//
// LAYER — L7 chrome-side view code. No THREE, no rAF, no `(window as any)`.

import { worldToCanvas, type ViewState } from '../sketch/transform.js';
import type { SketchDocSnapshot } from '../stores/sketchDocStore.js';
import {
  capMmToEditorPx,
  DEFAULT_PAPER_TEXT_HEIGHT_MM,
  EDITOR_NOMINAL_PX_PER_PAPER_MM,
} from './annotationTextStandard.js';
import {
  dimensionGeometry,
  formatDimensionValue,
  type LinearDimension,
} from './dimension.js';

/** §12.11 — dimensions sit at the THIN end. Must stay below the 1.5 px that
 *  `sketchRender.drawEntities()` strokes geometry at. */
export const DIM_LINE_WIDTH_PX = 0.75;

/** Colour of a reporting-only dimension. */
export const DIM_COLOR = '#8fa8c8';
/** A DRIVING dimension is drawn in the PRYZM purple the rest of the app uses
 *  for authored intent, so the author can tell at a glance which numbers
 *  control the geometry and which merely report it. */
export const DIM_DRIVING_COLOR = '#6600FF';
const DIM_TEXT_COLOR = '#e8e8f0';
const DIM_TEXT_HALO = '#0a0a18';

/** Length of the oblique end tick, in pixels — a screen constant, like the
 *  lettering, because it is annotation and not geometry. */
const TICK_PX = 5;
/** Gap between the measured point and the start of its witness line, and the
 *  overshoot past the dimension line. Screen constants, per §12.10's
 *  "consistent offsets". */
const WITNESS_GAP_PX = 2;
const WITNESS_OVERSHOOT_PX = 4;

export interface DrawDimensionsOptions {
  /** Ids drawn in the selection colour. */
  readonly selectedIds?: ReadonlySet<string>;
  /** Screen px per paper mm. Defaults to the editor's nominal paper scale. */
  readonly pxPerPaperMm?: number;
}

/**
 * Draw every dimension of ONE work plane.
 *
 * `dimensions` must already be scoped to the active view — `dimensionStore`'s
 * snapshot carries `byView` precisely so a caller does not filter by hand and
 * accidentally paint the elevation's dimensions onto the plan.
 */
export function drawDimensions(
  ctx: CanvasRenderingContext2D,
  doc: SketchDocSnapshot,
  dimensions: readonly LinearDimension[],
  view: ViewState,
  opts: DrawDimensionsOptions = {},
): void {
  if (dimensions.length === 0) return;
  const selected = opts.selectedIds ?? EMPTY_SET;
  const pxPerPaperMm = opts.pxPerPaperMm ?? EDITOR_NOMINAL_PX_PER_PAPER_MM;
  const fontPx = capMmToEditorPx(DEFAULT_PAPER_TEXT_HEIGHT_MM, pxPerPaperMm);

  const prevWidth = ctx.lineWidth;
  ctx.lineWidth = DIM_LINE_WIDTH_PX;

  for (const dim of dimensions) {
    const geo = dimensionGeometry(doc, dim);
    // A dimension whose points were deleted, or whose points are coincident,
    // draws NOTHING rather than a NaN streak. It is still in the store — the
    // author can see it is gone from the drawing and delete it deliberately.
    if (!geo) continue;

    const stroke = selected.has(dim.id)
      ? SELECTION_COLOR
      : dim.drivingConstraintId !== null
        ? DIM_DRIVING_COLOR
        : DIM_COLOR;
    ctx.strokeStyle = stroke;

    const a = worldToCanvas(geo.a, view);
    const b = worldToCanvas(geo.b, view);
    const la = worldToCanvas(geo.lineA, view);
    const lb = worldToCanvas(geo.lineB, view);

    drawWitness(ctx, a, la);
    drawWitness(ctx, b, lb);

    ctx.beginPath();
    ctx.moveTo(la.px, la.py);
    ctx.lineTo(lb.px, lb.py);
    ctx.stroke();

    drawTick(ctx, la, lb);
    drawTick(ctx, lb, la);

    const mid = worldToCanvas(geo.textAt, view);
    letterValue(ctx, formatDimensionValue(geo.mm), mid, la, lb, fontPx);
  }

  ctx.lineWidth = prevWidth;
}

interface Px {
  readonly px: number;
  readonly py: number;
}

const EMPTY_SET: ReadonlySet<string> = new Set();
const SELECTION_COLOR = '#00aaff';

/** Witness line: starts a small gap off the measured point and overshoots the
 *  dimension line, which is how a drafted witness line reads. */
function drawWitness(ctx: CanvasRenderingContext2D, from: Px, to: Px): void {
  const dx = to.px - from.px;
  const dy = to.py - from.py;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const ux = dx / len;
  const uy = dy / len;
  ctx.beginPath();
  ctx.moveTo(from.px + ux * WITNESS_GAP_PX, from.py + uy * WITNESS_GAP_PX);
  ctx.lineTo(to.px + ux * WITNESS_OVERSHOOT_PX, to.py + uy * WITNESS_OVERSHOOT_PX);
  ctx.stroke();
}

/** Oblique 45° architectural tick at `at`, oriented by the line `at → toward`. */
function drawTick(ctx: CanvasRenderingContext2D, at: Px, toward: Px): void {
  const dx = toward.px - at.px;
  const dy = toward.py - at.py;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const ux = dx / len;
  const uy = dy / len;
  // Rotate the direction by 45° to get the oblique tick axis.
  const k = Math.SQRT1_2;
  const tx = (ux - uy) * k;
  const ty = (ux + uy) * k;
  ctx.beginPath();
  ctx.moveTo(at.px - tx * TICK_PX, at.py - ty * TICK_PX);
  ctx.lineTo(at.px + tx * TICK_PX, at.py + ty * TICK_PX);
  ctx.stroke();
}

/**
 * Letter the value on the dimension line. §12.14: FILLED, never stroked — the
 * halo below is a background pass drawn UNDER the fill so the number stays
 * readable over grid lines; it is not a stroke on the letterform.
 */
function letterValue(
  ctx: CanvasRenderingContext2D,
  text: string,
  at: Px,
  la: Px,
  lb: Px,
  fontPx: number,
): void {
  ctx.save();
  ctx.font = `${fontPx.toFixed(2)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Read along the dimension line, never upside-down.
  let angle = Math.atan2(lb.py - la.py, lb.px - la.px);
  if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;
  ctx.translate(at.px, at.py);
  ctx.rotate(angle);
  const w = ctx.measureText(text).width;
  ctx.fillStyle = DIM_TEXT_HALO;
  ctx.fillRect(-w / 2 - 3, -fontPx * 0.7, w + 6, fontPx * 1.4);
  ctx.fillStyle = DIM_TEXT_COLOR;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}
