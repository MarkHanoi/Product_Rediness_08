// Canvas2D backend — live (post-2B closeout / ADR-0029).
//
// Imperative draw against any `CanvasRenderingContext2D`-shape object.
// We intentionally type the `ctx` parameter as a structural minimum so
// the backend can drive both real DOM canvases and the
// `RecordingCanvasContext` test fixture in `tests/visual-diff/plan-view/`.
//
// L5 — depends on the Canvas2D shape; safe to use in browser; safe in
// Node tests when fed a structurally-equivalent recorder.

import type {
  BackendRenderOptions,
  Primitive,
  PrimitiveBackend,
  PrimitiveStream,
  Stroke,
  Fill,
} from '../types.js';

/** Structural minimum of `CanvasRenderingContext2D` we depend on.  Listed
 *  explicitly so the recording-canvas test fixture knows exactly which
 *  methods to record. */
export interface Canvas2DLike {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  globalAlpha: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  setLineDash(segments: readonly number[]): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean): void;
  stroke(): void;
  fill(): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  fillText(text: string, x: number, y: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
}

const DASH_PATTERNS: Record<string, readonly number[]> = {
  solid: [],
  dashed: [6, 4],
  dotted: [1, 3],
  centerline: [12, 4, 2, 4],
  phantom: [12, 4, 2, 4, 2, 4],
};

function applyStroke(ctx: Canvas2DLike, stroke: Stroke): void {
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.weight;
  ctx.setLineDash(DASH_PATTERNS[stroke.dash ?? 'solid'] ?? []);
}

function applyFill(ctx: Canvas2DLike, fill: Fill): void {
  ctx.fillStyle = fill.color;
  ctx.globalAlpha = fill.opacity ?? 1;
}

function drawPrimitive(ctx: Canvas2DLike, p: Primitive): void {
  switch (p.kind) {
    case 'line': {
      applyStroke(ctx, p.stroke);
      ctx.beginPath();
      ctx.moveTo(p.a.x, p.a.y);
      ctx.lineTo(p.b.x, p.b.y);
      ctx.stroke();
      return;
    }
    case 'polyline': {
      if (p.points.length < 2) return;
      applyStroke(ctx, p.stroke);
      ctx.beginPath();
      ctx.moveTo(p.points[0]!.x, p.points[0]!.y);
      for (let i = 1; i < p.points.length; i++) ctx.lineTo(p.points[i]!.x, p.points[i]!.y);
      ctx.stroke();
      return;
    }
    case 'polygon': {
      if (p.outer.length < 3) return;
      ctx.beginPath();
      ctx.moveTo(p.outer[0]!.x, p.outer[0]!.y);
      for (let i = 1; i < p.outer.length; i++) ctx.lineTo(p.outer[i]!.x, p.outer[i]!.y);
      ctx.closePath();
      if (p.holes) {
        for (const hole of p.holes) {
          if (hole.length < 3) continue;
          ctx.moveTo(hole[0]!.x, hole[0]!.y);
          for (let i = 1; i < hole.length; i++) ctx.lineTo(hole[i]!.x, hole[i]!.y);
          ctx.closePath();
        }
      }
      if (p.fill) {
        applyFill(ctx, p.fill);
        ctx.fill();
      }
      if (p.stroke) {
        applyStroke(ctx, p.stroke);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      return;
    }
    case 'arc': {
      applyStroke(ctx, p.stroke);
      ctx.beginPath();
      ctx.arc(p.center.x, p.center.y, p.radius, p.startAngle, p.endAngle);
      ctx.stroke();
      return;
    }
    case 'text': {
      ctx.save();
      applyFill(ctx, p.fill);
      ctx.font = `${p.fontSizePx}px ${p.fontFamily ?? 'sans-serif'}`;
      ctx.textAlign = p.textAlign ?? 'left';
      ctx.textBaseline = p.textBaseline ?? 'alphabetic';
      ctx.translate(p.anchor.x, p.anchor.y);
      if (p.rotation) ctx.rotate(p.rotation);
      ctx.fillText(p.text, 0, 0);
      ctx.globalAlpha = 1;
      ctx.restore();
      return;
    }
    case 'hatch': {
      // Hatch is a polygon-clipped line family.  S31-bis ships a
      // *visual-only* hatch (parallel lines at the requested angle and
      // spacing) — true clipping waits for the polygon-intersection
      // utility at S37.  The visual is good enough for the recording-
      // canvas equivalence harness.
      ctx.save();
      applyStroke(ctx, p.stroke);
      const xs = p.outer.map((v) => v.x);
      const ys = p.outer.map((v) => v.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      ctx.translate(cx, cy);
      ctx.rotate(p.angle);
      const half = Math.hypot(maxX - minX, maxY - minY) / 2;
      for (let y = -half; y <= half; y += p.spacingPx) {
        ctx.beginPath();
        ctx.moveTo(-half, y);
        ctx.lineTo(half, y);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
  }
}

export class Canvas2DBackend implements PrimitiveBackend<void> {
  readonly id = 'canvas2d';
  constructor(private readonly ctx: Canvas2DLike) {}

  render(stream: PrimitiveStream, options: BackendRenderOptions): void {
    if (options.background !== undefined) {
      this.ctx.save();
      this.ctx.fillStyle = options.background;
      this.ctx.fillRect(0, 0, options.widthPx, options.heightPx);
      this.ctx.restore();
    } else {
      this.ctx.clearRect(0, 0, options.widthPx, options.heightPx);
    }
    for (const p of stream) drawPrimitive(this.ctx, p);
  }
}
