// SplineTool — free-form curve authoring (C111 §9.6).
//
// The founder's requirement is *"ANY SHAPE LIKE RHINOCEROS"*, and the gesture
// Rhino's `InterpCrv` uses is the one implemented here: click the points the
// curve must PASS THROUGH, watch it update, click the last point again to
// finish. Esc cancels.
//
// ⭐ **WHY THROUGH-POINTS AND NOT CONTROL POINTS.** A cubic Bezier's interior
//    control points are OFF the curve; asking a person to place four handles,
//    two of which the curve misses, is an expert gesture for an editing pass,
//    not a drawing one. The conversion to the persisted form happens ONCE, in
//    `@pryzm/geometry-kernel`'s `catmullRomToCubicBezierChainXZ`, reached
//    through `ToolDeps.commitSpline` → `sketchDocStore.addSplineThroughPoints`.
//    Every control point it creates is an ordinary `SketchPoint` afterwards, so
//    the curve is fully editable AND fully constrainable the moment it exists.
//
// ⛔ **THIS TOOL COMPUTES NO CURVE.** The preview is drawn by sampling through
//    the same kernel functions the bake uses, so what the user sees and what
//    `profileToPolygon` evaluates cannot drift apart. A tool-local sampler
//    would be the "two copies, one tested, one shipped" defect (C74 §5.e).
//
// State machine:
//   idle          — preview empty.
//   drawing(pts)  — preview the curve through `pts` + the cursor.
//
// Finish: click within `FINISH_TOL_MM` of the last placed point.

import {
  catmullRomToCubicBezierChainXZ,
  sampleCubicBezierChainXZ,
  type Pt2,
} from '@pryzm/geometry-kernel';
import {
  EMPTY_PREVIEW,
  type PreviewLine,
  type PreviewPoint,
  type SketchTool,
  type ToolDeps,
  type ToolEvent,
  type ToolPreview,
} from './types.js';

/** Re-clicking the last point finishes the curve. Millimetres — a GESTURE
 *  band, not a geometric tolerance (C73 §2.1 keeps domain bands under their
 *  own owner), which is why it is named for the gesture and not for an
 *  epsilon. */
const FINISH_TOL_MM = 1;

/** The sketch works in millimetres, so the preview's chord tolerance is stated
 *  in millimetres too — passed explicitly rather than letting the kernel's
 *  metre default silently over-tessellate a preview by 1000x. */
const PREVIEW_CHORD_MM = 0.5;

const MIN_THROUGH_POINTS = 2;

export function createSplineTool(deps: ToolDeps): SketchTool {
  let through: PreviewPoint[] = [];

  function curvePreview(pts: readonly PreviewPoint[], hint: string): ToolPreview {
    if (pts.length < MIN_THROUGH_POINTS) {
      return Object.freeze({ previewLines: EMPTY_PREVIEW.previewLines, hint });
    }
    // ⭐ The SAME kernel path the bake takes — sampled here into short preview
    //    segments so no new preview primitive (and no second renderer) is
    //    needed for the curve.
    const chain = catmullRomToCubicBezierChainXZ(pts.map((p): Pt2 => [p.x, p.z]));
    const poly = sampleCubicBezierChainXZ(chain, PREVIEW_CHORD_MM);
    const lines: PreviewLine[] = [];
    for (let i = 1; i < poly.length; i++) {
      lines.push(Object.freeze({
        x1: poly[i - 1]![0], z1: poly[i - 1]![1],
        x2: poly[i]![0], z2: poly[i]![1],
      }));
    }
    return Object.freeze({
      previewLines: Object.freeze(lines) as readonly PreviewLine[],
      hint,
    });
  }

  function hintOnly(text: string): ToolPreview {
    return Object.freeze({ previewLines: EMPTY_PREVIEW.previewLines, hint: text });
  }

  function reset(): ToolPreview {
    through = [];
    return EMPTY_PREVIEW;
  }

  return {
    name: 'spline',
    handle(event: ToolEvent): ToolPreview {
      if (event.kind === 'cancel') return reset();

      const cursor: PreviewPoint = Object.freeze({ x: event.worldX, z: event.worldZ });

      if (event.kind === 'pointer-move') {
        if (through.length === 0) return hintOnly('Click the first curve point');
        return curvePreview(
          [...through, cursor],
          'Click to add a point · click the last point again to finish · Esc cancels',
        );
      }

      // pointer-down
      const last = through[through.length - 1];
      const isRepeat =
        last !== undefined && Math.hypot(cursor.x - last.x, cursor.z - last.z) <= FINISH_TOL_MM;

      if (!isRepeat) {
        through = [...through, cursor];
        if (through.length === 1) return hintOnly('Click the next curve point (Esc to cancel)');
        return curvePreview(
          through,
          'Click to add a point · click the last point again to finish · Esc cancels',
        );
      }

      // Finish. ⛔ A single point is not a curve; refusing to commit one is the
      // correct answer, and the state is kept so the user can carry on adding.
      if (through.length < MIN_THROUGH_POINTS) {
        return hintOnly('A curve needs at least 2 points — click somewhere else.');
      }
      if (!deps.commitSpline) throw new Error('SplineTool: ToolDeps.commitSpline is required.');
      deps.commitSpline(Object.freeze([...through]) as readonly PreviewPoint[]);
      reset();
      return hintOnly('Click the first curve point');
    },
    reset,
  };
}
