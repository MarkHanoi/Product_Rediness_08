// SheetCamera — pan/zoom camera for the sheet editor (S37 / ADR-0031 /
// Phase 2C).
//
// Spec: `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §S37 D1
// line 250 — "the SheetCamera uses `pixelsPerMm` as the zoom unit
// (default: 2 px/mm = approximately 1:5 screen scale for A3 sheet)."
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// World units are MILLIMETRES on the sheet (matches `paper-size.ts`).
// Screen units are CSS pixels.  The Y axis on screen is the SAME
// orientation as the sheet's Y axis (paper origin = bottom-left), so
// the host's `applyTransform` flips Y at draw time — this camera
// itself only deals in `(x, y)` paper-mm coordinates.
//
// Convention:
//   `worldToScreen(x, y) → { x: panX + x*pixelsPerMm, y: panY + y*pixelsPerMm }`
//
// The Z-flip (paper-Y → canvas-Y) is the renderer's responsibility —
// `SheetEditorHost.render()` translates by `(0, canvas.height)` and
// scales by `(1, -1)` once before drawing the paper boundary.

export interface SheetScreenPoint { readonly x: number; readonly y: number }
export interface SheetPaperPoint  { readonly x: number; readonly y: number }

export interface SheetCameraOptions {
  panX?: number;
  panY?: number;
  /** Zoom unit — CSS pixels per millimetre on paper. */
  pixelsPerMm?: number;
  /** Called after any pan/zoom mutation.  Used by `SheetEditorHost` to
   *  flip the dirty flag and ask the FrameScheduler for one frame. */
  onDirty?: () => void;
}

export const SHEET_CAMERA_DEFAULT_PX_PER_MM = 2;
export const SHEET_CAMERA_MIN_PX_PER_MM = 1e-3;
export const SHEET_CAMERA_MAX_PX_PER_MM = 1e6;

export class SheetCamera {
  panX: number;
  panY: number;
  pixelsPerMm: number;
  onDirty: (() => void) | undefined;

  constructor(opts: SheetCameraOptions = {}) {
    this.panX = opts.panX ?? 0;
    this.panY = opts.panY ?? 0;
    this.pixelsPerMm = opts.pixelsPerMm ?? SHEET_CAMERA_DEFAULT_PX_PER_MM;
    this.onDirty = opts.onDirty;
  }

  /** Pan the camera by `dx, dy` screen pixels. */
  pan(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    this.panX += dx;
    this.panY += dy;
    this.fireDirty();
  }

  /** Zoom about a screen point so the paper coordinate under
   *  `(clientX, clientY)` stays fixed during the zoom. */
  zoomAt(clientX: number, clientY: number, factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return;
    const before = this.screenToPaper(clientX, clientY);
    this.pixelsPerMm *= factor;
    if (this.pixelsPerMm < SHEET_CAMERA_MIN_PX_PER_MM) this.pixelsPerMm = SHEET_CAMERA_MIN_PX_PER_MM;
    if (this.pixelsPerMm > SHEET_CAMERA_MAX_PX_PER_MM) this.pixelsPerMm = SHEET_CAMERA_MAX_PX_PER_MM;
    const after = this.screenToPaper(clientX, clientY);
    this.panX += (after.x - before.x) * this.pixelsPerMm;
    this.panY += (after.y - before.y) * this.pixelsPerMm;
    this.fireDirty();
  }

  /** Set absolute camera state in one call.  Fires `onDirty` at most once. */
  setState(state: Readonly<{ panX?: number; panY?: number; pixelsPerMm?: number }>): void {
    let changed = false;
    if (state.panX !== undefined && state.panX !== this.panX) { this.panX = state.panX; changed = true; }
    if (state.panY !== undefined && state.panY !== this.panY) { this.panY = state.panY; changed = true; }
    if (state.pixelsPerMm !== undefined && state.pixelsPerMm !== this.pixelsPerMm) {
      const v = state.pixelsPerMm;
      if (!Number.isFinite(v) || v <= 0) {
        throw new Error(`[sheet-camera] pixelsPerMm must be a positive finite number (got ${String(v)})`);
      }
      this.pixelsPerMm = Math.min(Math.max(v, SHEET_CAMERA_MIN_PX_PER_MM), SHEET_CAMERA_MAX_PX_PER_MM);
      changed = true;
    }
    if (changed) this.fireDirty();
  }

  /** Choose a `pixelsPerMm` and pan that fits a paper of `widthMm × heightMm`
   *  inside a viewport of `viewportPx × viewportPy` with a `marginPx`
   *  border.  Centres the paper in the viewport.  No-op if either
   *  dimension is zero. */
  fitToPaper(
    widthMm: number,
    heightMm: number,
    viewportPx: number,
    viewportPy: number,
    marginPx: number = 24,
  ): void {
    if (widthMm <= 0 || heightMm <= 0 || viewportPx <= 0 || viewportPy <= 0) return;
    const usableX = Math.max(viewportPx - marginPx * 2, 1);
    const usableY = Math.max(viewportPy - marginPx * 2, 1);
    const scaleX = usableX / widthMm;
    const scaleY = usableY / heightMm;
    const newScale = Math.min(scaleX, scaleY);
    this.pixelsPerMm = newScale;
    // Centre the paper in the viewport.
    this.panX = (viewportPx - widthMm * newScale) / 2;
    this.panY = (viewportPy - heightMm * newScale) / 2;
    this.fireDirty();
  }

  paperToScreen(x: number, y: number): SheetScreenPoint {
    return { x: this.panX + x * this.pixelsPerMm, y: this.panY + y * this.pixelsPerMm };
  }

  screenToPaper(x: number, y: number): SheetPaperPoint {
    if (this.pixelsPerMm === 0) return { x: 0, y: 0 };
    return { x: (x - this.panX) / this.pixelsPerMm, y: (y - this.panY) / this.pixelsPerMm };
  }

  private fireDirty(): void {
    if (this.onDirty) {
      try { this.onDirty(); }
      catch (err) {
        // Listener errors must not derail the camera.
        // eslint-disable-next-line no-console
        console.error('[sheet-camera] onDirty listener threw:', err);
      }
    }
  }
}
