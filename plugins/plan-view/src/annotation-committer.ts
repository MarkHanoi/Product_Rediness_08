// Plan-view annotation committer — Canvas2D draw (S32).
//
// Spec source:
//   • `docs/00_NEW_ARCHITECTURE/phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md`
//     §S32 (lines 396 – 599).
//   • Code-level ADR `docs/architecture/adr/0024-plan-view-annotation-pipeline.md`
//     §2 (layout/committer split) + §4 (font + line-weight policy).
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Pure draw — takes a layout (already in canvas CSS pixels) and a 2D
//   context, and issues `fillText` / `stroke` / `fill` calls.  No state
//   mutation; the only retained state is the constructor-time `ctx` ref
//   and the configured font family.
// • Caller MUST set the context to identity transform before invoking
//   `draw()` (the layout is in canvas CSS pixels, not world space).
//   The committer SAVE/RESTOREs around each annotation so it can locally
//   translate/rotate without bleeding into the next item.
// • Font family: `Inter, system-ui, sans-serif` — matches PRYZM 1's
//   plan-view text per Contract 44 G_text and ADR-0024 §4.

import type { AnnotationLayout } from './annotation-renderer.js';

// ── 2D context surface — subset we depend on ────────────────────────────────
//
// We narrow `CanvasRenderingContext2D` so the committer is callable with the
// renderer's `PlanRenderingContext2D` (host-side) AND with a fake context
// (tests).  Optional members are guarded at the call-site.

export interface AnnotationCommitContext2D {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  stroke(): void;
  fill(): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate?(angle: number): void;
  fillRect?(x: number, y: number, w: number, h: number): void;
  strokeRect?(x: number, y: number, w: number, h: number): void;
  fillText?(text: string, x: number, y: number, maxWidth?: number): void;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineCap?: CanvasLineCap;
  lineJoin?: CanvasLineJoin;
  font?: string;
  textBaseline?: CanvasTextBaseline;
  textAlign?: CanvasTextAlign;
  globalAlpha?: number;
}

export interface AnnotationCommitterOptions {
  /** CSS font family.  Default: `'Inter, system-ui, sans-serif'`. */
  readonly fontFamily?: string;
  /** Default text colour (per palette).  Default `'#0d2a4d'`. */
  readonly textColor?: string;
  /** Default leader stroke colour.  Default `'#000'`. */
  readonly leaderColor?: string;
  /** Default callout box stroke colour.  Default `'#000'`. */
  readonly calloutColor?: string;
}

const DEFAULTS = Object.freeze({
  fontFamily:    'Inter, system-ui, sans-serif',
  textColor:     '#0d2a4d',
  leaderColor:   '#000000',
  calloutColor:  '#000000',
  lineWidth:     0.5,
  arrowSize:     6,
});

export class AnnotationCommitter {
  private readonly fontFamily: string;
  private readonly textColor: string;
  private readonly leaderColor: string;
  private readonly calloutColor: string;

  constructor(
    private readonly ctx: AnnotationCommitContext2D,
    opts: AnnotationCommitterOptions = {},
  ) {
    this.fontFamily   = opts.fontFamily   ?? DEFAULTS.fontFamily;
    this.textColor    = opts.textColor    ?? DEFAULTS.textColor;
    this.leaderColor  = opts.leaderColor  ?? DEFAULTS.leaderColor;
    this.calloutColor = opts.calloutColor ?? DEFAULTS.calloutColor;
  }

  /**
   * Draw every annotation in `layouts` to the underlying 2D context.
   *
   * The committer dispatches on `layout.type` — order is preserved (which
   * matters for region fills under text labels: regions first in the input
   * stream paint under later text in the same array).
   */
  draw(layouts: readonly AnnotationLayout[]): void {
    for (const layout of layouts) {
      switch (layout.type) {
        case 'region':  if (layout.region)  this.drawRegion(layout.region);   break;
        case 'callout': if (layout.callout) this.drawCallout(layout.callout); break;
        case 'leader':  if (layout.leader)  this.drawLeader(layout.leader);   break;
        case 'text':    if (layout.text)    this.drawText(layout.text);       break;
      }
    }
  }

  // ── per-type draw primitives ──────────────────────────────────────────────

  private drawText(text: NonNullable<AnnotationLayout['text']>): void {
    const { ctx } = this;
    if (!ctx.fillText) return;
    ctx.save();
    ctx.translate(text.anchor[0], text.anchor[1]);
    if (ctx.rotate && text.angle !== 0) ctx.rotate(text.angle);
    ctx.font = `${text.fontWeight} ${text.fontSize}px ${this.fontFamily}`;
    ctx.fillStyle = this.textColor;
    if (ctx.textBaseline !== undefined) ctx.textBaseline = 'alphabetic';
    if (ctx.textAlign !== undefined)    ctx.textAlign = 'left';
    ctx.fillText(text.content, 0, 0);
    ctx.restore();
  }

  private drawLeader(leader: NonNullable<AnnotationLayout['leader']>): void {
    const { ctx } = this;
    if (leader.points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = this.leaderColor;
    ctx.lineWidth = DEFAULTS.lineWidth;
    if (ctx.lineCap)  ctx.lineCap = 'round';
    if (ctx.lineJoin) ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(leader.points[0]![0], leader.points[0]![1]);
    for (let i = 1; i < leader.points.length; i++) {
      ctx.lineTo(leader.points[i]![0], leader.points[i]![1]);
    }
    ctx.stroke();
    // Arrowhead at the terminal segment.
    if (leader.points.length >= 2) {
      const prev = leader.points[leader.points.length - 2]!;
      this.drawArrowhead(leader.arrowHead, prev);
    }
    // Label at the first waypoint (small +4 / -4 offset for legibility,
    // matching PRYZM 1's plan view).
    if (ctx.fillText && leader.labelText.length > 0) {
      ctx.font = `normal 11px ${this.fontFamily}`;
      ctx.fillStyle = this.textColor;
      if (ctx.textBaseline !== undefined) ctx.textBaseline = 'alphabetic';
      ctx.fillText(leader.labelText, leader.labelAnchor[0] + 4, leader.labelAnchor[1] - 4);
    }
    ctx.restore();
  }

  private drawArrowhead(tip: [number, number], prev: [number, number]): void {
    const { ctx } = this;
    const angle = Math.atan2(tip[1] - prev[1], tip[0] - prev[0]);
    const size = DEFAULTS.arrowSize;
    ctx.save();
    ctx.translate(tip[0], tip[1]);
    if (ctx.rotate) ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size, -size / 3);
    ctx.lineTo(-size,  size / 3);
    ctx.closePath();
    ctx.fillStyle = this.leaderColor;
    ctx.fill();
    ctx.restore();
  }

  private drawCallout(callout: NonNullable<AnnotationLayout['callout']>): void {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = this.calloutColor;
    ctx.lineWidth = DEFAULTS.lineWidth;
    // Box.
    if (ctx.strokeRect) {
      ctx.strokeRect(callout.boxCorner[0], callout.boxCorner[1], callout.boxWidth, callout.boxHeight);
    } else {
      ctx.beginPath();
      ctx.moveTo(callout.boxCorner[0], callout.boxCorner[1]);
      ctx.lineTo(callout.boxCorner[0] + callout.boxWidth, callout.boxCorner[1]);
      ctx.lineTo(callout.boxCorner[0] + callout.boxWidth, callout.boxCorner[1] + callout.boxHeight);
      ctx.lineTo(callout.boxCorner[0], callout.boxCorner[1] + callout.boxHeight);
      ctx.closePath();
      ctx.stroke();
    }
    // Text inside the box.
    if (ctx.fillText) {
      ctx.font = `normal 11px ${this.fontFamily}`;
      ctx.fillStyle = this.calloutColor;
      if (ctx.textBaseline !== undefined) ctx.textBaseline = 'alphabetic';
      ctx.fillText(
        callout.text,
        callout.boxCorner[0] + 4,
        callout.boxCorner[1] + 14,
        Math.max(0, callout.boxWidth - 8),
      );
    }
    // Leader from box-bottom-centre to the leader terminator.
    ctx.beginPath();
    ctx.moveTo(
      callout.boxCorner[0] + callout.boxWidth / 2,
      callout.boxCorner[1] + callout.boxHeight,
    );
    ctx.lineTo(callout.leaderPoint[0], callout.leaderPoint[1]);
    ctx.stroke();
    ctx.restore();
  }

  private drawRegion(region: NonNullable<AnnotationLayout['region']>): void {
    const { ctx } = this;
    if (region.polygon.length < 3) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(region.polygon[0]![0], region.polygon[0]![1]);
    for (let i = 1; i < region.polygon.length; i++) {
      ctx.lineTo(region.polygon[i]![0], region.polygon[i]![1]);
    }
    ctx.closePath();
    if (ctx.globalAlpha !== undefined) ctx.globalAlpha = region.fillOpacity;
    ctx.fillStyle = region.fillColor;
    ctx.fill();
    if (ctx.globalAlpha !== undefined) ctx.globalAlpha = 1;
    ctx.strokeStyle = region.strokeColor;
    ctx.lineWidth = DEFAULTS.lineWidth;
    ctx.stroke();
    ctx.restore();
  }
}
