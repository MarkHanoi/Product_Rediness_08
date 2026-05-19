// FilletTool — round the corner between two intersecting line segments (S53 D1).
//
// Two-click flow:
//   1. Pick line A   → preview highlights A.
//   2. Pick line B   → if A & B share an endpoint OR meet at a finite
//                       intersection point, compute the fillet arc with
//                       the supplied radius, trim both lines, and commit
//                       the arc.
//
// Geometry — for two lines meeting at point `O` with unit direction
// vectors `u` and `v` pointing away from `O` along each line, the
// fillet arc of radius `r` has centre `C = O + r/sin(θ/2) * bisector`
// where `θ` is the angle between `u` and `v`. The tangent points
// land `r/tan(θ/2)` along each line from `O`.
//
// LIMITATIONS — this tool requires:
//   • both segments to be straight lines (other entities are ignored),
//   • the lines to actually intersect (parallel lines are rejected),
//   • the requested radius to fit inside both segments.
//
// The Trim/extend variant (extending lines that don't currently meet)
// lands at S55 alongside the parameter-binding work.

import type { SketchEntity, SketchLine, SketchPoint } from '../entities.js';
import { hitTest } from '../hitTest.js';
import {
  EMPTY_PREVIEW,
  type CommittedId,
  type SketchTool,
  type ToolDeps,
  type ToolEvent,
  type ToolPreview,
} from './types.js';

export interface FilletDeps extends ToolDeps {
  /** Live entity list. */
  readonly entitiesNow: () => readonly SketchEntity[];
  /** Tolerance in mm for hit-tests. */
  readonly defaultTolMm: () => number;
  /** Fillet radius supplier — usually a `prompt()` wrapper. */
  readonly radiusMm: () => number;
}

type FilletState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'first-set'; readonly firstId: CommittedId };

const IDLE: FilletState = Object.freeze({ phase: 'idle' });

export function createFilletTool(deps: FilletDeps): SketchTool {
  let state: FilletState = IDLE;

  function hint(text: string): ToolPreview {
    return Object.freeze({ previewLines: EMPTY_PREVIEW.previewLines, hint: text });
  }

  function findLine(id: CommittedId): SketchLine | null {
    for (const e of deps.entitiesNow()) {
      if (e.kind === 'line' && (e as SketchLine).id === id) return e as SketchLine;
    }
    return null;
  }

  function pointById(id: string): SketchPoint | null {
    for (const e of deps.entitiesNow()) {
      if (e.kind === 'point' && e.id === (id as never)) return e as SketchPoint;
    }
    return null;
  }

  function pickLine(event: ToolEvent): CommittedId | null {
    const r = deps.defaultTolMm();
    const h = hitTest({
      x: event.worldX,
      z: event.worldZ,
      entities: deps.entitiesNow(),
      tolMm: r,
    });
    if (h.kind === 'line' && h.id) return h.id as string;
    return null;
  }

  return {
    name: 'fillet',
    handle(event: ToolEvent): ToolPreview {
      if (event.kind === 'cancel') {
        state = IDLE;
        return EMPTY_PREVIEW;
      }
      if (event.kind === 'pointer-move') {
        return hint(state.phase === 'idle' ? 'Click first line' : 'Click second line');
      }
      const id = pickLine(event);
      if (!id) return hint('Miss — click directly on a line.');
      if (state.phase === 'idle') {
        state = { phase: 'first-set', firstId: id };
        return hint('Click second line');
      }
      if (id === state.firstId) return hint('Pick a different second line.');
      const a = findLine(state.firstId);
      const b = findLine(id);
      if (!a || !b) {
        state = IDLE;
        return hint('Selection invalid — pick two existing lines.');
      }
      try {
        applyFillet(deps, a, b, deps.radiusMm(), pointById);
      } catch (err) {
        state = IDLE;
        return hint((err as Error).message);
      }
      state = IDLE;
      return hint('Click first line');
    },
    reset(): ToolPreview {
      state = IDLE;
      return EMPTY_PREVIEW;
    },
  };
}

function applyFillet(
  deps: FilletDeps,
  a: SketchLine,
  b: SketchLine,
  radius: number,
  pointById: (id: string) => SketchPoint | null,
): void {
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new Error('Fillet radius must be > 0.');
  }
  const a1 = pointById(a.p1 as string);
  const a2 = pointById(a.p2 as string);
  const b1 = pointById(b.p1 as string);
  const b2 = pointById(b.p2 as string);
  if (!a1 || !a2 || !b1 || !b2) throw new Error('Selected lines reference missing points.');

  const corner = findCommonOrIntersection(a1, a2, b1, b2);
  if (!corner) throw new Error('Lines are parallel or do not meet — cannot fillet.');
  const ua = unitFrom(corner, farther(a1, a2, corner));
  const ub = unitFrom(corner, farther(b1, b2, corner));
  const cosT = ua.x * ub.x + ua.z * ub.z;
  const theta = Math.acos(Math.max(-1, Math.min(1, cosT)));
  if (theta < 1e-3 || theta > Math.PI - 1e-3) {
    throw new Error('Lines too colinear — fillet undefined.');
  }
  const t = radius / Math.tan(theta / 2);
  const lenA = Math.hypot(a1.x - a2.x, a1.z - a2.z);
  const lenB = Math.hypot(b1.x - b2.x, b1.z - b2.z);
  if (t >= lenA || t >= lenB) {
    throw new Error('Fillet radius too large for one of the segments.');
  }
  const tangentA = { x: corner.x + ua.x * t, z: corner.z + ua.z * t };
  const tangentB = { x: corner.x + ub.x * t, z: corner.z + ub.z * t };
  const bisector = unitFrom({ x: 0, z: 0 }, { x: ua.x + ub.x, z: ua.z + ub.z });
  const cDist = radius / Math.sin(theta / 2);
  const cx = corner.x + bisector.x * cDist;
  const cz = corner.z + bisector.z * cDist;
  const startAngle = Math.atan2(tangentA.z - cz, tangentA.x - cx);
  const endAngle = Math.atan2(tangentB.z - cz, tangentB.x - cx);

  if (!deps.commitArc) throw new Error('FilletTool: ToolDeps.commitArc is required.');
  deps.commitArc({ cx, cz, radius, startAngle, endAngle });
}

function findCommonOrIntersection(
  a1: SketchPoint, a2: SketchPoint, b1: SketchPoint, b2: SketchPoint,
): { x: number; z: number } | null {
  for (const ap of [a1, a2]) for (const bp of [b1, b2]) {
    if (Math.hypot(ap.x - bp.x, ap.z - bp.z) < 1e-6) return { x: ap.x, z: ap.z };
  }
  // Two-line intersection (handle parallel by determinant ≈ 0).
  const r = { x: a2.x - a1.x, z: a2.z - a1.z };
  const s = { x: b2.x - b1.x, z: b2.z - b1.z };
  const det = r.x * s.z - r.z * s.x;
  if (Math.abs(det) < 1e-9) return null;
  const dx = b1.x - a1.x;
  const dz = b1.z - a1.z;
  const t = (dx * s.z - dz * s.x) / det;
  return { x: a1.x + r.x * t, z: a1.z + r.z * t };
}

function farther(p1: SketchPoint, p2: SketchPoint, ref: { x: number; z: number }): SketchPoint {
  const d1 = Math.hypot(p1.x - ref.x, p1.z - ref.z);
  const d2 = Math.hypot(p2.x - ref.x, p2.z - ref.z);
  return d1 >= d2 ? p1 : p2;
}

function unitFrom(o: { x: number; z: number }, p: { x: number; z: number }): { x: number; z: number } {
  const dx = p.x - o.x;
  const dz = p.z - o.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-12) return { x: 0, z: 0 };
  return { x: dx / len, z: dz / len };
}
