// FilletTool — round the corner between two intersecting line segments (S53 D1).
//
// Two-click flow:
//   1. Pick line A   → preview highlights A.
//   2. Pick line B   → if A & B share an endpoint OR cross at a point
//                       inside BOTH segments, compute the fillet arc
//                       with the supplied radius and commit it.
//
// It commits the ARC ONLY. This line used to read "trim both lines, and
// commit the arc"; no trim has ever been issued — `trimLine` is never
// called from this file — so the two segments keep their full length and
// run past the arc. That is a missing feature, stated rather than
// claimed, and it is a separate one from the extend gap below.
//
// Geometry — for two lines meeting at point `O` with unit direction
// vectors `u` and `v` pointing away from `O` along each line, the
// fillet arc of radius `r` has centre `C = O + r/sin(θ/2) * bisector`
// where `θ` is the angle between `u` and `v`. The tangent points
// land `r/tan(θ/2)` along each line from `O`.
//
// LIMITATIONS — this tool requires:
//   • both segments to be straight lines (other entities are ignored),
//   • the two segments to ACTUALLY TOUCH — at a shared endpoint, or at
//     a crossing that lies inside both. Segments whose extensions meet
//     somewhere neither of them reaches are REFUSED, with the distance
//     past each end measured and quoted (see §FILLET-SEGMENT-BOUNDS),
//   • the requested radius to fit inside the run of each segment that
//     actually leads away from the corner.
//
// ─── §FILLET-SEGMENT-BOUNDS (2026-08-17) — what this refusal replaced ─
// The LIMITATIONS list above used to claim the tool "requires the lines
// to actually intersect (parallel lines are rejected)". IT DID NOT.
// `findCommonOrIntersection` solved the INFINITE-line intersection with
// no segment-bounds check, so two non-parallel segments that never touch
// REPORTED SUCCESS: an arc tangent to a point beyond the end of a
// segment — in empty space — with neither line extended and the ordinary
// "Click first line" ready-hint returned. A wrong result and a correct
// one were indistinguishable to the user. Measured with A = (0,0)→(4,0)
// and B = (10,2)→(10,12): arc centre (8, 2) r = 2, tangent to A's line
// at x = 8 when A ends at x = 4; commitLine and trimLine both ZERO.
//
// Both routes to an off-segment tangent point are now closed, because
// the segment-bounds check alone closes only the first:
//   1. the CORNER out of reach — the infinite lines cross where neither
//      segment goes. Refused, quoting the overshoot past each end.
//   2. the TANGENT POINT out of reach — the corner is genuinely on both
//      segments (an X-crossing), but the radius pushes the tangent point
//      past the far end. The old fit test compared `t` against the WHOLE
//      segment length, which over-states the run available in the one
//      direction that matters; it now compares against the run from the
//      corner to the endpoint the arc is actually built toward.
//
// EXTENDING the segments to a virtual corner is a real capability and is
// still ABSENT: this tool refuses, it does not repair. That refusal is
// the honest reading of what it can do, not a stand-in for the extend
// variant — the user's route today is to redraw or trim the lines so
// they touch. Asserted in `__tests__/sketch/FilletTool.test.ts`,
// "segments that do NOT meet are REFUSED with the measured gap", which
// also carries the non-vacuity control (an X-crossing inside both
// segments must STILL fillet — a tool that refused everything would
// satisfy the refusal assertion on its own).

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
  // Parallel is now its OWN sentence. It used to read "parallel or do not
  // meet", which merged two different facts into one refusal and let the
  // non-meeting case go unnoticed — it never reached this branch at all.
  if (!corner) throw new Error('Lines are parallel — they never meet, so there is no corner to fillet.');
  // §FILLET-SEGMENT-BOUNDS route 1 — the corner is out of reach. Refuse, and
  // say by how much, per segment: a refusal naming one end tells the user to
  // fix half a problem.
  //
  // `1e-6` mm is the SAME coincidence epsilon `findCommonOrIntersection` uses
  // for a shared endpoint, and it is written as a literal on purpose. C73 §2 /
  // `check-epsilon-policy` E1 wants tolerances imported from one declared
  // policy module; `packages/geometry-kernel` does not export one yet, and
  // minting another private named tolerance here ratchets that gate the wrong
  // way — measured 2026-08-17, a `MEET_TOL_MM` const took it 318 → 319, exit 3.
  // So this reuses the file's existing definition rather than adding a rival
  // one, and moves to the policy module when there is one to move to.
  if (corner.beyondA > 1e-6 || corner.beyondB > 1e-6) {
    const parts: string[] = [];
    if (corner.beyondA > 1e-6) parts.push(`${corner.beyondA.toFixed(1)} mm past the end of the first line`);
    if (corner.beyondB > 1e-6) parts.push(`${corner.beyondB.toFixed(1)} mm past the end of the second`);
    throw new Error(
      `Lines do not meet — their extensions cross at a corner ${parts.join(' and ')}. ` +
      'Redraw or trim them so they touch, then fillet.',
    );
  }
  const farA = farther(a1, a2, corner);
  const farB = farther(b1, b2, corner);
  const ua = unitFrom(corner, farA);
  const ub = unitFrom(corner, farB);
  const cosT = ua.x * ub.x + ua.z * ub.z;
  const theta = Math.acos(Math.max(-1, Math.min(1, cosT)));
  if (theta < 1e-3 || theta > Math.PI - 1e-3) {
    throw new Error('Lines too colinear — fillet undefined.');
  }
  const t = radius / Math.tan(theta / 2);
  // §FILLET-SEGMENT-BOUNDS route 2 — the run that matters is from the CORNER
  // to the endpoint the arc is built toward, not the whole segment. For a
  // corner at a shared endpoint the two are equal; for an X-crossing the whole
  // length over-states it, and the tangent point lands off the segment again.
  const runA = Math.hypot(farA.x - corner.x, farA.z - corner.z);
  const runB = Math.hypot(farB.x - corner.x, farB.z - corner.z);
  if (t >= runA || t >= runB) {
    throw new Error(
      `Fillet radius too large — the tangent point would land ${t.toFixed(1)} mm from the corner, ` +
      `but only ${Math.min(runA, runB).toFixed(1)} mm of segment runs that way.`,
    );
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

/**
 * The corner two segments turn about, plus HOW FAR OUT OF REACH it is.
 *
 * `beyondA` / `beyondB` are 0 when the corner lies on that segment, and
 * otherwise the distance in mm from the corner to the nearer end of it. The
 * caller decides what to do with a non-zero value; this function does not
 * silently clamp, and it does not report reach it does not have.
 */
interface Corner {
  readonly x: number;
  readonly z: number;
  readonly beyondA: number;
  readonly beyondB: number;
}

function findCommonOrIntersection(
  a1: SketchPoint, a2: SketchPoint, b1: SketchPoint, b2: SketchPoint,
): Corner | null {
  for (const ap of [a1, a2]) for (const bp of [b1, b2]) {
    if (Math.hypot(ap.x - bp.x, ap.z - bp.z) < 1e-6) {
      return { x: ap.x, z: ap.z, beyondA: 0, beyondB: 0 };
    }
  }
  // Two-line intersection (handle parallel by determinant ≈ 0). This solves the
  // INFINITE lines, which is correct as far as it goes — what was missing is
  // that it says nothing about whether the SEGMENTS reach the answer. Both
  // parameters are therefore returned as distances, not discarded.
  const r = { x: a2.x - a1.x, z: a2.z - a1.z };
  const s = { x: b2.x - b1.x, z: b2.z - b1.z };
  const det = r.x * s.z - r.z * s.x;
  if (Math.abs(det) < 1e-9) return null;
  const dx = b1.x - a1.x;
  const dz = b1.z - a1.z;
  const t = (dx * s.z - dz * s.x) / det;   // param along A: a1 + r·t
  const u = (dx * r.z - dz * r.x) / det;   // param along B: b1 + s·u
  return {
    x: a1.x + r.x * t,
    z: a1.z + r.z * t,
    beyondA: overshootMm(t, Math.hypot(r.x, r.z)),
    beyondB: overshootMm(u, Math.hypot(s.x, s.z)),
  };
}

/** Distance in mm by which param `p` falls outside [0,1] on a segment of length `len`. */
function overshootMm(p: number, len: number): number {
  if (p < 0) return -p * len;
  if (p > 1) return (p - 1) * len;
  return 0;
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
