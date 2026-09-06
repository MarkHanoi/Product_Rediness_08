// buildConstraintSet — fold a sketch document + constraint store snapshot
// into a `ConstraintSet` the `@pryzm/constraint-solver` engine accepts (S52 D2).
//
// Variable naming follows the engine's defaults:
//   • point id `pt-N`        → variables `pt-N-x`, `pt-N-y`
//   • line  id `ln-N`        → endpoints `pt-A`, `pt-B`
//
// ═══════════════════════════════════════════════════════════════════════════
// §CURVE-TANGENT-LEG — how a SPLINE reaches the solver, with NO new kind
// ═══════════════════════════════════════════════════════════════════════════
//
// ⭐ **Spline control points need no wiring at all.** They are ordinary
//    `SketchPoint`s, so the loop below already emits `${id}-x` / `${id}-y` for
//    every one of them. A `fixed` pin on a control point is therefore a REAL
//    constraint on the curve, executable by the solver that ships today.
//
// ⭐ **Endpoint TANGENCY is expressible with the EXISTING `parallel` kind.**
//    `B′(0) = 3·(P1 − P0)` — a cubic Bézier's tangent at its start endpoint IS
//    the direction of its first control leg (proved in
//    `packages/geometry-kernel/__tests__/cubicBezier.test.ts`). So "this curve
//    leaves tangent to that line" is exactly "the leg `[cp0, cp1]` is parallel
//    to that line". This module registers those two legs as LINE-LIKE entries
//    in `lineEndpoints`, and `parallel` — which C74 §4.6.1 classifies as (b)
//    ENFORCEMENT, closed-form, one line fixed — does the rest.
//
//    ⛔ **This is deliberately NOT a `tangent` constraint kind.** C74 §4.6.1
//       lists `tangent` among the four (c) CANDIDATES, and §4.6.2b says they
//       stay UNPROVEN until a worked fixture shows no construction order
//       satisfies them sequentially. §4.1's MUST NOT is unlifted. Adding a
//       `tangent` member would be solver work taken on the argument that the
//       product category implies it — §5.f exactly.
//
// ⛔ **WHAT IS STILL NOT EXPRESSIBLE, BY NAME (C74 §4.6.3, C57 §1.9).**
//    • **`point-on-curve`** — no member of `ConstraintKind` (5 members:
//      `distance-pp` · `parallel` · `perpendicular` · `coincident-pp` ·
//      `fixed`), AND no member of the persisted `ProfileConstraintSchema.kind`
//      (12 members) either. It exists in NEITHER vocabulary, so there is
//      nothing to spell it with and nothing to evaluate it. It is genuinely
//      simultaneous — the curve parameter `t` is a second unknown moving with
//      the point — which is a (c) question, and (c) is unauthorised.
//    • **`tangent` AS A KIND** — persisted, zero executors (C74 §4.6.0's
//      measured table). Reachable ONLY through the leg construction above, and
//      ONLY at an endpoint. Tangency at an INTERIOR point of a span is not
//      expressible by this construction and is not expressible at all.
//    Neither may be authored: `ConstraintToolbar` refuses them by name and
//    names the live alternative.
//
// Pure — no THREE, no DOM, no `(window as any)`.

import type { ConstraintSet, SketchConstraint } from '@pryzm/constraint-solver';
import type { ConstraintSnapshot } from '../stores/constraintStore.js';
import type { SketchDocSnapshot } from '../stores/sketchDocStore.js';

export interface BuildOptions {
  /** Optional named parameter values used by `distance-pp` constraints
   *  authored with a string `value` (e.g. `"length"`). */
  readonly parameterValues?: Readonly<Record<string, number>>;
}

/**
 * §CURVE-TANGENT-LEG — the id of a spline's endpoint tangent leg.
 *
 * The `~` separator cannot appear in a `makeEntityId` output (`pt`/`ln`/`cir`/
 * `arc`/`spl` + `-` + base-36 digits), so a leg id can never collide with a
 * real entity id. ⛔ Callers must use THIS function rather than hand-spelling
 * the string: a hand-spelled id that drifts is an inert constraint with a
 * plausible name, which is the failure C74 §3.1 is about.
 *
 * `'start'` → `[cp0, cp1]`, `'end'` → `[cpLast, cpLast−1]`. Both are oriented
 * so the ON-CURVE endpoint comes FIRST, because `MockSolver`'s `parallel`
 * projector moves the SECOND endpoint of `l2` — i.e. it rotates the free
 * handle about the point the curve actually passes through.
 */
export function splineTangentLegId(splineId: string, which: 'start' | 'end'): string {
  return `${splineId}~t${which === 'start' ? 'start' : 'end'}`;
}

/** Parse a tangent-leg id back into its spline id + end, or `null`. */
export function parseSplineTangentLegId(
  legId: string,
): { splineId: string; which: 'start' | 'end' } | null {
  const i = legId.lastIndexOf('~t');
  if (i <= 0) return null;
  const which = legId.slice(i + 2);
  if (which !== 'start' && which !== 'end') return null;
  return { splineId: legId.slice(0, i), which };
}

export function buildConstraintSet(
  doc: SketchDocSnapshot,
  constraints: ConstraintSnapshot,
  opts: BuildOptions = {},
): ConstraintSet {
  const variables: Record<string, number> = {};
  const pointVariables: Record<string, readonly [string, string]> = {};
  for (const point of Object.values(doc.pointById)) {
    const xVar = `${point.id}-x`;
    const yVar = `${point.id}-y`;
    variables[xVar] = point.x;
    variables[yVar] = point.z;
    pointVariables[point.id] = [xVar, yVar];
  }

  const lineEndpoints: Record<string, readonly [string, string]> = {};
  for (const line of Object.values(doc.lineById)) {
    lineEndpoints[line.id] = [line.p1, line.p2];
  }
  // §CURVE-TANGENT-LEG — two LINE-LIKE entries per spline. They are registered
  // unconditionally, not only when a constraint references them: the map is
  // the solver's dereferencing table, and a leg missing from it would make an
  // authored tangency silently fall back to the `${id}-p0` convention and
  // resolve to variables that do not exist.
  for (const spline of Object.values(doc.splineById)) {
    const cps = spline.controlPoints;
    const first = cps[0];
    const second = cps[1];
    const last = cps[cps.length - 1];
    const penultimate = cps[cps.length - 2];
    if (first && second) lineEndpoints[splineTangentLegId(spline.id, 'start')] = [first, second];
    if (last && penultimate) lineEndpoints[splineTangentLegId(spline.id, 'end')] = [last, penultimate];
  }

  return {
    variables,
    constraints: constraints.constraints,
    ...(opts.parameterValues !== undefined ? { parameterValues: opts.parameterValues } : {}),
    pointVariables,
    lineEndpoints,
  };
}

/** True iff `id` names something the solver can dereference as a line: a real
 *  `SketchLine`, or a spline endpoint tangent leg whose spline still exists
 *  with enough control points to form it. */
function isLineLike(id: string, doc: SketchDocSnapshot): boolean {
  if (doc.lineById[id as never]) return true;
  const leg = parseSplineTangentLegId(id);
  if (!leg) return false;
  const spline = doc.splineById[leg.splineId as never];
  // ⛔ `Boolean(spline) && spline.…` did NOT narrow — `noUncheckedIndexedAccess`
  //    keeps `spline` possibly-undefined through a `Boolean()` call, so this
  //    read was a latent TypeError on a constraint naming a DELETED spline,
  //    which is precisely the case this predicate exists to answer.
  if (spline === undefined) return false;
  // A leg needs two DISTINCT control points to have a direction at all; a
  // 1-point remnant is not line-like and must not resolve to variables.
  return spline.controlPoints.length >= 2;
}

/** Return true iff the constraint references entities that all exist
 *  in `doc`. The runner uses this to silently skip constraints whose
 *  underlying entities have just been deleted. */
export function constraintIsValidAgainst(
  c: SketchConstraint,
  doc: SketchDocSnapshot,
): boolean {
  switch (c.kind) {
    case 'fixed':
      return Boolean(doc.pointById[c.p as never]);
    case 'coincident-pp':
    case 'distance-pp':
      return Boolean(doc.pointById[c.p1 as never]) && Boolean(doc.pointById[c.p2 as never]);
    case 'parallel':
    case 'perpendicular':
      return isLineLike(c.l1, doc) && isLineLike(c.l2, doc);
  }
}
