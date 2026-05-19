// World ↔ canvas coordinate transform (S52 D1).
//
// World units: millimetres in the XZ plane.  +X right, +Z away.
// Canvas units: pixels.  (0, 0) top-left, +x right, +y down.
//
// View parameters:
//   • zoom:  pixels per millimetre.  Larger = zoom in.
//   • pan:   world coords (mm) at the canvas center.
//   • size:  canvas pixel dimensions.
//
// Transform: pixel_x = canvasW/2 + (worldX − panX) * zoom
//            pixel_y = canvasH/2 + (worldZ − panZ) * zoom
//
// (No sign flip on Z — the sketcher's "looking down at the floor"
// view treats +Z as towards the bottom of the screen, matching the
// IFC site-plan convention used by the rest of the app.)

export interface ViewState {
  /** Pixels per millimetre. */
  readonly zoom: number;
  /** World mm at the canvas center. */
  readonly panX: number;
  /** World mm at the canvas center. */
  readonly panZ: number;
  /** Canvas size in CSS pixels. */
  readonly canvasW: number;
  /** Canvas size in CSS pixels. */
  readonly canvasH: number;
}

export interface CanvasPoint {
  readonly px: number;
  readonly py: number;
}

export interface WorldPoint {
  readonly x: number;
  readonly z: number;
}

export function worldToCanvas(world: WorldPoint, view: ViewState): CanvasPoint {
  return {
    px: view.canvasW / 2 + (world.x - view.panX) * view.zoom,
    py: view.canvasH / 2 + (world.z - view.panZ) * view.zoom,
  };
}

export function canvasToWorld(canvas: CanvasPoint, view: ViewState): WorldPoint {
  if (view.zoom <= 0) {
    throw new Error(`canvasToWorld: zoom must be > 0 (got ${view.zoom}).`);
  }
  return {
    x: view.panX + (canvas.px - view.canvasW / 2) / view.zoom,
    z: view.panZ + (canvas.py - view.canvasH / 2) / view.zoom,
  };
}

/** Default view: 1 px = 1 mm, origin at canvas center. */
export function defaultView(canvasW: number, canvasH: number): ViewState {
  return {
    zoom: 1,
    panX: 0,
    panZ: 0,
    canvasW,
    canvasH,
  };
}
