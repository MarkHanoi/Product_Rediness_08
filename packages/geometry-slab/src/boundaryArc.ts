/**
 * boundaryArc — §FEAT-BOUNDARY-CURVE-DRAW (2026-08-06)
 *
 * The ONE arc model for CURVED boundary drawing on slab-family elements (floor
 * finishes, ceilings, slabs). It is deliberately the WALL's arc model — a quadratic
 * Bézier through a user-clicked midpoint — reused, not reinvented:
 *
 *   • `WallPlanToolHandler` captures start → arc-midpoint → end and commits
 *     `WallCurve { control, segments }` where `control = 2·M − 0.5·(S + E)` (the
 *     control point that makes the Bézier pass through M at t = 0.5) and
 *     `segments = 16` (`ARC_SEGMENTS`).
 *   • `RoomDetectionEngine` / `SlabRegionTracer` / `PathResolver.toPolyline` all
 *     tessellate that same Bézier into polyline chords.
 *
 * Boundaries (FloorData / CeilingData / SlabData) are POLYGONS by schema; the
 * codebase's established way an arc enters a boundary is TESSELLATION into chords
 * (SlabRegionTracer §SLAB-REGION-CURVED, RoomDetectionEngine). So the curve drawing
 * mode appends the tessellated vertices to the polygon — no second arc
 * representation, no schema change (P5 untouched), and every downstream consumer
 * (builders, exports, the L-240 inner-face inset) works unchanged.
 *
 * Pure math — no THREE, no DOM, no store access (mirrors `floorFinishDefaults.ts`,
 * the package's precedent for a pure, span-free helper module).
 */

export interface ArcVertex2D { x: number; z: number }

/** The wall tool's arc tessellation density (WallPlanToolHandler `ARC_SEGMENTS`). */
export const BOUNDARY_ARC_SEGMENTS = 16;

/**
 * Quadratic-Bézier control point from three points, such that the curve passes
 * through `midThrough` at t = 0.5:  P(0.5) = 0.25·S + 0.5·C + 0.25·E = M
 * ⟹ C = 2·M − 0.5·(S + E).  Verbatim mirror of `WallPlanToolHandler._bezierControl`.
 */
export function bezierControlFromMidpoint(
  start: ArcVertex2D,
  midThrough: ArcVertex2D,
  end: ArcVertex2D,
): ArcVertex2D {
  return {
    x: 2 * midThrough.x - 0.5 * (start.x + end.x),
    z: 2 * midThrough.z - 0.5 * (start.z + end.z),
  };
}

/**
 * Tessellate the quadratic Bézier `start → control → end` into `segments` chords,
 * returning the sampled vertices EXCLUDING `start` (so the result can be appended
 * to a polygon whose last vertex is `start` without duplication). The sampling is
 * identical to `PathResolver.toPolyline({kind:'Arc'},…)` / `THREE.QuadraticBezierCurve3`:
 * p(t) = (1−t)²·S + 2(1−t)t·C + t²·E.
 */
export function tessellateArcSegment(
  start: ArcVertex2D,
  control: ArcVertex2D,
  end: ArcVertex2D,
  segments: number = BOUNDARY_ARC_SEGMENTS,
): ArcVertex2D[] {
  const n = Number.isFinite(segments) && segments >= 2 ? Math.min(256, Math.floor(segments)) : BOUNDARY_ARC_SEGMENTS;
  const out: ArcVertex2D[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const d = t * t;
    out.push({
      x: a * start.x + b * control.x + d * end.x,
      z: a * start.z + b * control.z + d * end.z,
    });
  }
  return out;
}

/**
 * Convenience: the tessellated arc from `start` THROUGH `midThrough` to `end`,
 * excluding `start` — the exact vertex run a curved boundary segment appends.
 */
export function arcSegmentThroughMidpoint(
  start: ArcVertex2D,
  midThrough: ArcVertex2D,
  end: ArcVertex2D,
  segments: number = BOUNDARY_ARC_SEGMENTS,
): ArcVertex2D[] {
  return tessellateArcSegment(start, bezierControlFromMidpoint(start, midThrough, end), end, segments);
}
