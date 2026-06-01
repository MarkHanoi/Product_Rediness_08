// C29 / C24 — Sheet composition primitives (sheet-α-1).
//
// Viewport: pure data + small geometry helpers for a rectangular region of a
// sheet bound to a model view (plan / elevation / section / detail / 3d /
// schedule).
//
// LAYER PURITY: L2 (drawing-primitives). No I/O, no THREE, no DOM.
//
// COORDINATE CONVENTION: sheet origin is the BOTTOM-LEFT corner of the paper
// with +y pointing UP — per architectural drawing convention. All values are
// in millimetres on the sheet.

/**
 * Axis-aligned rectangular region on a sheet, in mm. `(xMm, yMm)` is the
 * lower-left corner; the rectangle extends `+widthMm` along +x and
 * `+heightMm` along +y.
 */
export interface ViewportBounds {
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

/**
 * A single viewport — a rectangular cutout on a sheet bound to a named
 * model view. `scale` is the model-units-per-sheet-mm ratio (e.g. `50`
 * means 1mm of paper represents 50mm of model — i.e. 1:50). `sourceRef`
 * is an opaque identifier (level id / room id / sheet id / etc.) resolved
 * by the sheet engine downstream.
 */
export interface Viewport {
  readonly id: string;
  readonly bounds: ViewportBounds;
  readonly scale: number;
  readonly viewType: 'plan' | 'elevation' | 'section' | 'detail' | '3d' | 'schedule';
  readonly sourceRef: string;
  readonly label?: string;
}

/** Area in mm² of the viewport's bounds rectangle. */
export function viewportArea(vp: Viewport): number {
  return vp.bounds.widthMm * vp.bounds.heightMm;
}

/**
 * Inclusive point-in-rectangle test. A point exactly on the edge is
 * considered contained.
 */
export function viewportBoundsContain(
  bounds: ViewportBounds,
  xMm: number,
  yMm: number,
): boolean {
  return (
    xMm >= bounds.xMm &&
    xMm <= bounds.xMm + bounds.widthMm &&
    yMm >= bounds.yMm &&
    yMm <= bounds.yMm + bounds.heightMm
  );
}

/**
 * Strict rectangle-overlap test. Two rectangles that merely abut (share a
 * single edge with zero overlap area) are NOT considered overlapping.
 */
export function viewportBoundsOverlap(a: ViewportBounds, b: ViewportBounds): boolean {
  const aRight = a.xMm + a.widthMm;
  const aTop = a.yMm + a.heightMm;
  const bRight = b.xMm + b.widthMm;
  const bTop = b.yMm + b.heightMm;
  return a.xMm < bRight && aRight > b.xMm && a.yMm < bTop && aTop > b.yMm;
}
