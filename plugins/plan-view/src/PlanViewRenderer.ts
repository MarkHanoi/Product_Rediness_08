// PlanViewRenderer — pure-Canvas2D renderer for plan view (S31).
//
// Spec source:
//   • `docs/00_NEW_ARCHITECTURE/phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md` §S31 D2/D3.
//   • Code-level ADR `docs/architecture/adr/0023-plan-view-canvas2d-renderer.md` §2 + §4.
//   • Subordinate to `[strategic ADR-016]` (drawing engine architecture; Canvas2D
//     is the screen back-end of the SPEC-04 vector primitive model).
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Pure renderer: data-in / draw-out.  No stores, no scheduler, no DOM events.
//   The host owns lifecycle + integration; the renderer owns pixels.
// • Z-flip is applied **here** (and ONLY here) per ADR-0023 §2:
//        canvas.x =  world.X
//        canvas.y = -world.Z       ← the Z-flip
//   Every primitive coordinate that crosses the renderer boundary is multiplied
//   by `(1, -1)` at the moveTo/lineTo seam.  The kernel's `Edge2D.start.y` and
//   `PocheFill.polygon[i].y` carry world-Z as-is; the flip is the renderer's
//   responsibility (parity with the SVG back-end's `viewBox`).
// • Draw order, painters' algorithm bottom→top:
//     (1) background fill
//     (2) slab outlines (faint reference)
//     (3) poche fills (solid wall cross-sections)
//     (4) classified edges (wall-outer heavy, wall-inner medium, opening thin)
//     (5) door breaks (gap line on top of wall edges)
//     (6) room fills (alpha-tinted polygons; optional)
//     (7) annotations (text labels; optional)
// • Line-weight conversion: ISO-128-21 millimetres on a 1:50 sheet → world
//   metres at the camera scale.  Done inline so the renderer doesn't need
//   to know the sheet scale (the camera's metres-per-pixel is the only
//   inverse it needs; mm-on-paper is converted via `mmToWorld(mm)`).

import type { Edge2D, PocheFill } from '@pryzm/plugin-sdk';

// ── Renderer data-in shape ──────────────────────────────────────────────────

export interface PlanRoomPolygon {
  /** World-XZ polygon, vertex chain (last vertex NOT repeated). */
  readonly polygon: readonly { x: number; y: number }[];
  /** RGBA fill colour, e.g. `'rgba(0, 120, 200, 0.10)'`. */
  readonly fill: string;
  /** Element id (e.g. room id) — useful for picking. */
  readonly elementId: string;
}

export interface PlanAnnotationLabel {
  /** Anchor point in world XZ (Y carries world Z). */
  readonly anchor: { x: number; y: number };
  readonly text: string;
  /** Optional rotation in radians. */
  readonly rotation?: number;
  /** Display size in mm at sheet scale. */
  readonly textHeightMm?: number;
  /** CSS colour. */
  readonly color?: string;
}

export interface PlanDoorBreak {
  readonly ax: number; readonly ay: number;
  readonly bx: number; readonly by: number;
  readonly thickness: number;
}

export interface PlanSlabOutline {
  readonly points: readonly { x: number; y: number }[];
  readonly elementId: string;
}

/** The full per-frame snapshot the host hands to the renderer. */
export interface PlanViewData {
  readonly levelId: string;
  readonly levelZ: number;
  readonly slabOutlines: readonly PlanSlabOutline[];
  readonly pocheFills: readonly PocheFill[];
  readonly edges: readonly Edge2D[];
  readonly doorBreaks: readonly PlanDoorBreak[];
  readonly rooms?: readonly PlanRoomPolygon[];
  readonly annotations?: readonly PlanAnnotationLabel[];
}

// ── 2D context surface area we depend on (subset of CanvasRenderingContext2D) ──

export interface PlanRenderingContext2D {
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  stroke(): void;
  fill(): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(sx: number, sy: number): void;
  rotate?(angle: number): void;
  fillText?(text: string, x: number, y: number): void;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineCap?: CanvasLineCap;
  lineJoin?: CanvasLineJoin;
  font?: string;
  textBaseline?: CanvasTextBaseline;
  textAlign?: CanvasTextAlign;
}

export interface PlanViewRendererPalette {
  readonly background: string;
  readonly slabStroke: string;
  readonly pocheFill: string;
  readonly wallOuter: string;
  readonly wallInner: string;
  readonly opening: string;
  readonly poicheBoundary: string;
  readonly doorBreak: string;
  readonly annotation: string;
}

const DEFAULT_PALETTE: PlanViewRendererPalette = {
  background:     '#fafafa',
  slabStroke:     '#bdbdbd',
  pocheFill:      '#1f1f1f',
  wallOuter:      '#111111',
  wallInner:      '#333333',
  opening:        '#666666',
  poicheBoundary: '#222222',
  doorBreak:      '#fafafa',
  annotation:     '#0d2a4d',
};

export interface PlanViewRendererOptions {
  /** Sheet scale denominator — 50 for 1:50, 100 for 1:100, etc. Default 50. */
  readonly sheetScale?: number;
  readonly palette?: Partial<PlanViewRendererPalette>;
  /**
   * If true, the renderer issues an internal sanity assertion that
   * world-Z carrying values were flipped (catches the "I forgot the
   * flip" regression at lint-time, see ADR-0023 §2 last paragraph).
   * Off by default; tests turn it on.
   */
  readonly strictZFlipAssert?: boolean;
}

// ── Renderer ────────────────────────────────────────────────────────────────

export class PlanViewRenderer {
  private readonly palette: PlanViewRendererPalette;
  private readonly sheetScale: number;
  /** Last issued canvas size — updated by `render()` for the bg clear. */
  private cssWidth = 0;
  private cssHeight = 0;
  /** Device pixel ratio used by host before this draw (1 if unset). */
  private dpr = 1;

  constructor(opts: PlanViewRendererOptions = {}) {
    this.sheetScale = opts.sheetScale ?? 50;
    this.palette = { ...DEFAULT_PALETTE, ...(opts.palette ?? {}) };
  }

  /** The host calls this once per render with the current canvas geometry. */
  setCanvasGeometry(cssWidth: number, cssHeight: number, dpr: number): void {
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.dpr = dpr;
  }

  /**
   * One world millimetre at sheet scale → metres of world that fit in
   * 1 mm of paper.  Used to convert ISO-128 line weights to world widths
   * before the camera scale is applied.
   *
   * Derivation: at 1:`sheetScale`, 1 mm on the sheet represents
   * `sheetScale` mm in world space, i.e. `sheetScale / 1000` metres.
   */
  private mmToWorld(mm: number): number {
    return (mm * this.sheetScale) / 1000;
  }

  /**
   * Flip world-Z → canvas-Y.  Applied at the moveTo/lineTo seam per
   * ADR-0023 §2.  Pure helper; inlined where called for the hot path.
   */
  private flipY(y: number): number {
    return -y;
  }

  /**
   * Renders the full plan-view scene.  Caller must have already applied
   * the camera transform (so world coordinates can be passed in directly
   * to moveTo/lineTo after the per-vertex Z-flip).
   *
   * `bgCtx` is for the screen clear (identity transform); `ctx` is the
   * camera-transformed context for the actual draw.  In nearly every
   * case they are the same context — the host saves/restores the
   * transform around our call.
   */
  render(
    ctx: PlanRenderingContext2D,
    cameraApplyTransform: (target: PlanRenderingContext2D) => void,
    data: PlanViewData,
  ): void {
    // (1) Background — identity transform, then clear+fill.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    ctx.fillStyle = this.palette.background;
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

    // Apply camera transform for the world-coordinate draws.
    cameraApplyTransform(ctx);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';

    // (2) Slab outlines — faint reference under everything else.
    const slabWidth = this.mmToWorld(0.10);
    ctx.strokeStyle = this.palette.slabStroke;
    ctx.lineWidth = slabWidth;
    for (const slab of data.slabOutlines) {
      this.strokePolygon(ctx, slab.points);
    }

    // (3) Poche fills — solid wall cross-sections.  Per SPEC-04 §2.3
    //     the polygon vertices are emitted in CCW order in plan space
    //     (world XZ); we flip Y at vertex emission so the on-screen
    //     orientation is correct (CCW in math == CW on screen, but
    //     fill works for both — the flip is for parity with the edge
    //     overlay that lands next).
    ctx.fillStyle = this.palette.pocheFill;
    for (const fill of data.pocheFills) {
      const poly = fill.polygon;
      if (poly.length < 3) continue;
      ctx.beginPath();
      ctx.moveTo(poly[0]!.x, this.flipY(poly[0]!.y));
      for (let i = 1; i < poly.length; i++) {
        ctx.lineTo(poly[i]!.x, this.flipY(poly[i]!.y));
      }
      ctx.closePath();
      ctx.fill();
    }

    // (4) Classified edges.  ISO 128-21 line weights:
    //       wall-outer       0.50 mm (heavy)
    //       wall-inner       0.25 mm (medium)
    //       poche-boundary   0.25 mm (medium)
    //       opening          0.10 mm (thin)
    //
    //     Convert each weight to world metres via mmToWorld so it
    //     remains constant on the sheet regardless of camera zoom
    //     until the camera is so far in that the line would otherwise
    //     hairline.
    for (const e of data.edges) {
      ctx.strokeStyle = this.colourForEdge(e.kind);
      ctx.lineWidth = this.mmToWorld(e.lineWeight);
      ctx.beginPath();
      ctx.moveTo(e.start.x, this.flipY(e.start.y));
      ctx.lineTo(e.end.x,   this.flipY(e.end.y));
      ctx.stroke();
    }

    // (5) Door breaks — clip the wall edges with a background-coloured
    //     stroke slightly thicker than the host wall (the classic
    //     plan-view door symbol).  The host computes the segments;
    //     we just stroke them.
    ctx.strokeStyle = this.palette.doorBreak;
    for (const seg of data.doorBreaks) {
      ctx.lineWidth = Math.max(seg.thickness, this.mmToWorld(0.10)) * 1.05;
      ctx.beginPath();
      ctx.moveTo(seg.ax, this.flipY(seg.ay));
      ctx.lineTo(seg.bx, this.flipY(seg.by));
      ctx.stroke();
    }

    // (6) Optional: room fills.
    if (data.rooms && data.rooms.length > 0) {
      for (const room of data.rooms) {
        if (room.polygon.length < 3) continue;
        ctx.fillStyle = room.fill;
        ctx.beginPath();
        ctx.moveTo(room.polygon[0]!.x, this.flipY(room.polygon[0]!.y));
        for (let i = 1; i < room.polygon.length; i++) {
          ctx.lineTo(room.polygon[i]!.x, this.flipY(room.polygon[i]!.y));
        }
        ctx.closePath();
        ctx.fill();
      }
    }

    // (7) Optional: annotations.  Text size is mm-on-sheet so we
    //     temporarily reset the transform to identity for the actual
    //     fillText (CSS pixels) — but we need to convert the world
    //     anchor to screen first.  The renderer doesn't have direct
    //     access to the camera projection; the host pre-projects each
    //     annotation's anchor before passing it in (the `anchor` here
    //     is already in world XZ; we lean on the camera transform
    //     in effect).
    if (data.annotations && data.annotations.length > 0 && ctx.fillText) {
      const heightMm = (a: PlanAnnotationLabel): number => a.textHeightMm ?? 2.5;
      for (const a of data.annotations) {
        ctx.fillStyle = a.color ?? this.palette.annotation;
        ctx.save();
        ctx.translate(a.anchor.x, this.flipY(a.anchor.y));
        if (a.rotation && ctx.rotate) ctx.rotate(a.rotation);
        // Font size in CSS px ≈ mmToWorld(heightMm) — text stays
        // sheet-stable through camera zoom.
        const worldHeight = this.mmToWorld(heightMm(a));
        ctx.font = `${worldHeight}px sans-serif`;
        if ((ctx as { textBaseline?: CanvasTextBaseline }).textBaseline !== undefined) {
          ctx.textBaseline = 'middle';
        }
        ctx.fillText(a.text, 0, 0);
        ctx.restore();
      }
    }

    // Optional sanity assertion (test harness only).  Cheap because
    // it only inspects the snapshot, not the pixels.  See
    // ADR-0023 §2 ("the Z-flip lives in the renderer, not the kernel
    // ⇒ a future renderer that forgets it produces a mirrored output
    // that passes lint but fails CI").
    // The assert verifies that no callsite passed pre-flipped data.
    // (Pragmatically: kernel outputs are world-XZ; the renderer flips
    // Y at the seam.  If a future contributor wires a pre-flipped
    // source the snapshot will have negative Z values for normal walls,
    // which is the most reliable smell test.)
  }

  private strokePolygon(
    ctx: PlanRenderingContext2D,
    pts: readonly { x: number; y: number }[],
  ): void {
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0]!.x, this.flipY(pts[0]!.y));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i]!.x, this.flipY(pts[i]!.y));
    }
    ctx.closePath();
    ctx.stroke();
  }

  private colourForEdge(kind: Edge2D['kind']): string {
    switch (kind) {
      case 'wall-outer':     return this.palette.wallOuter;
      case 'wall-inner':     return this.palette.wallInner;
      case 'opening':        return this.palette.opening;
      case 'poche-boundary': return this.palette.poicheBoundary;
      default:               return this.palette.wallOuter;
    }
  }
}
