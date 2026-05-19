// SectionViewRenderer — Canvas2D draw of a section-cut result (W-09).
//
// Spec: `phases/audits/PHASE-2-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md` §W-09.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// Pure imperative renderer over a `CanvasRenderingContext2D`-shaped target.
// No DOM dependency at construction — the target ctx is passed in.  This
// matches the plan-view renderer's separation between the host (which owns
// the DOM <canvas>) and the renderer (which owns drawing).
//
// Style:
//   • Cut edges:    thick (2px), stroke #111.
//   • Beyond edges: thin (0.5px), stroke #888.
//
// Coordinate system:
//   The producer emits 2D edges in section-screen coords (X = signed
//   distance along the section line, Y = world Z).  This renderer applies
//   a `worldToScreen` affine (computed from a viewport rect) so the result
//   fits a fixed-size canvas with positive-Y pointing UP (we flip the
//   canvas Y axis on draw).

import type { SectionCutResult } from '@pryzm/plugin-sdk';

export interface CanvasLike {
  readonly width: number;
  readonly height: number;
  getContext(kind: '2d'): {
    save(): void;
    restore(): void;
    clearRect(x: number, y: number, w: number, h: number): void;
    beginPath(): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    stroke(): void;
    fillRect(x: number, y: number, w: number, h: number): void;
    lineWidth: number;
    strokeStyle: string;
    fillStyle: string;
  } | null;
}

export interface SectionRenderViewport {
  /** Section-screen rect that maps to the full canvas. */
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface RenderStats {
  readonly cutDrawn: number;
  readonly beyondDrawn: number;
  readonly pixelsTouched: number;
}

const DEFAULT_VIEWPORT: SectionRenderViewport = { minX: -10, maxX: 10, minY: 0, maxY: 5 };

export class SectionViewRenderer {
  private viewport: SectionRenderViewport = DEFAULT_VIEWPORT;
  private lastStats: RenderStats = { cutDrawn: 0, beyondDrawn: 0, pixelsTouched: 0 };

  setViewport(v: SectionRenderViewport): void { this.viewport = v; }

  /** Draw the result into `target`.  Returns counts so tests can assert
   *  non-zero pixels were touched. */
  draw(target: CanvasLike, result: SectionCutResult): RenderStats {
    const ctx = target.getContext('2d');
    if (!ctx) {
      this.lastStats = { cutDrawn: 0, beyondDrawn: 0, pixelsTouched: 0 };
      return this.lastStats;
    }

    const W = target.width, H = target.height;
    const vw = this.viewport.maxX - this.viewport.minX;
    const vh = this.viewport.maxY - this.viewport.minY;
    if (vw <= 0 || vh <= 0 || W <= 0 || H <= 0) {
      this.lastStats = { cutDrawn: 0, beyondDrawn: 0, pixelsTouched: 0 };
      return this.lastStats;
    }

    const sx = W / vw;
    const sy = H / vh;
    const toX = (x: number): number => (x - this.viewport.minX) * sx;
    // Flip Y so positive world-Z draws upward on the canvas.
    const toY = (y: number): number => H - (y - this.viewport.minY) * sy;

    ctx.save();
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, W, H);

    // Beyond first (drawn under the cut edges).
    let beyondDrawn = 0;
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = '#888';
    ctx.beginPath();
    for (const e of result.beyondEdges) {
      ctx.moveTo(toX(e.a.x), toY(e.a.y));
      ctx.lineTo(toX(e.b.x), toY(e.b.y));
      beyondDrawn++;
    }
    ctx.stroke();

    let cutDrawn = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#111';
    ctx.beginPath();
    for (const e of result.cutEdges) {
      ctx.moveTo(toX(e.a.x), toY(e.a.y));
      ctx.lineTo(toX(e.b.x), toY(e.b.y));
      cutDrawn++;
    }
    ctx.stroke();

    ctx.restore();

    // Coarse pixels-touched estimate: each line ≈ length-in-pixels px.
    let pixelsTouched = 0;
    for (const e of result.cutEdges) {
      pixelsTouched += Math.hypot(toX(e.b.x) - toX(e.a.x), toY(e.b.y) - toY(e.a.y)) * 2;
    }
    for (const e of result.beyondEdges) {
      pixelsTouched += Math.hypot(toX(e.b.x) - toX(e.a.x), toY(e.b.y) - toY(e.a.y)) * 0.5;
    }
    this.lastStats = { cutDrawn, beyondDrawn, pixelsTouched: Math.round(pixelsTouched) };
    return this.lastStats;
  }

  snapshot(): RenderStats { return this.lastStats; }
}
