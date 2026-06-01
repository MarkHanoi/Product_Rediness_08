// PlanCamera — 2D pan/zoom camera for plan view.
//
// History:
//   • S29  — first cut (`code-level ADR docs/02-decisions/adrs/0028-plan-view-canvas-architecture.md`).
//   • S31  — added optional `onDirty` hook so the host can subscribe to
//            camera state changes without polling
//            (`code-level ADR docs/02-decisions/adrs/0023-plan-view-canvas2d-renderer.md` §3 + §4).
//
// World units are metres; screen units are CSS pixels.  The Z-flip
// (world-Z → canvas-Y) is **NOT** done here — it is the renderer's
// responsibility per ADR-0023 §2.  The camera deals only in `(x, z)`
// world coordinates passing them through `setTransform` unchanged so
// kernel-projected outputs keep parity with the SVG back-end's `viewBox`.
//
// Convention (unchanged from S29):
//   `worldToScreen(x, z) → { x: panX + x*scale, y: panY + z*scale }`

export interface PlanScreenPoint { readonly x: number; readonly y: number }
export interface PlanWorldPoint { readonly x: number; readonly z: number }

export interface CanvasContext2DLike {
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
}

export interface PlanCameraOptions {
  panX?: number;
  panY?: number;
  scale?: number;
  /**
   * Called after any pan/zoom mutation.  Used by `PlanViewCanvasHost` to
   * flip the dirty flag and ask the FrameScheduler for one frame.
   * Pure data — no DOM, no rAF — see ADR-0023 §4.
   */
  onDirty?: () => void;
}

export class PlanCamera {
  panX: number;
  panY: number;
  scale: number;
  /**
   * Optional dirty-listener hook.  Mutable so callers can wire it up
   * after construction (the host typically constructs the camera before
   * itself and binds the hook in its constructor body).
   */
  onDirty: (() => void) | undefined;

  constructor(opts: PlanCameraOptions = {}) {
    this.panX = opts.panX ?? 0;
    this.panY = opts.panY ?? 0;
    // 50 px/metre is a comfortable default for a typical residential plan.
    this.scale = opts.scale ?? 50;
    this.onDirty = opts.onDirty;
  }

  /** Translate the camera by `dx, dy` screen pixels. */
  pan(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    this.panX += dx;
    this.panY += dy;
    this.fireDirty();
  }

  /** Zoom by `factor` while keeping the world point under (clientX, clientY) fixed on screen. */
  zoomAt(clientX: number, clientY: number, factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return;
    const before = this.screenToWorld(clientX, clientY);
    this.scale *= factor;
    if (this.scale < 1e-3) this.scale = 1e-3;
    if (this.scale > 1e6) this.scale = 1e6;
    const after = this.screenToWorld(clientX, clientY);
    this.panX += (after.x - before.x) * this.scale;
    this.panY += (after.z - before.z) * this.scale;
    this.fireDirty();
  }

  /**
   * Set absolute camera state in one call.  Useful for fit-to-bounds
   * helpers and view-template restoration (S33).  Fires `onDirty` once.
   */
  setTransform(panX: number, panY: number, scale: number): void {
    if (this.panX === panX && this.panY === panY && this.scale === scale) return;
    this.panX = panX;
    this.panY = panY;
    this.scale = scale;
    this.fireDirty();
  }

  /** Apply this camera as the 2D context's transform. */
  applyTransform(ctx: CanvasContext2DLike): void {
    ctx.setTransform(this.scale, 0, 0, this.scale, this.panX, this.panY);
  }

  worldToScreen(x: number, z: number): PlanScreenPoint {
    return { x: this.panX + x * this.scale, y: this.panY + z * this.scale };
  }

  screenToWorld(sx: number, sy: number): PlanWorldPoint {
    return { x: (sx - this.panX) / this.scale, z: (sy - this.panY) / this.scale };
  }

  private fireDirty(): void {
    const hook = this.onDirty;
    if (hook) {
      try { hook(); }
      catch (err) {
        // Don't let a buggy listener crash a pan — the camera is hot path.
        // eslint-disable-next-line no-console
        console.error('[PlanCamera] onDirty listener threw:', err);
      }
    }
  }
}
