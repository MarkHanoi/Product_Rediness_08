// buildConstraintSet — fold a sketch document + constraint store snapshot
// into a `ConstraintSet` the `@pryzm/constraint-solver` engine accepts (S52 D2).
//
// Variable naming follows the engine's defaults:
//   • point id `pt-N`        → variables `pt-N-x`, `pt-N-y`
//   • line  id `ln-N`        → endpoints `pt-A`, `pt-B`
//
// Pure — no THREE, no DOM, no `(window as any)`. Free of side effects
// so tests can shovel it any pair of snapshots.

import type { ConstraintSet, SketchConstraint } from '@pryzm/constraint-solver';
import type { ConstraintSnapshot } from '../stores/constraintStore.js';
import type { SketchDocSnapshot } from '../stores/sketchDocStore.js';

export interface BuildOptions {
  /** Optional named parameter values used by `distance-pp` constraints
   *  authored with a string `value` (e.g. `"length"`). */
  readonly parameterValues?: Readonly<Record<string, number>>;
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

  return {
    variables,
    constraints: constraints.constraints,
    ...(opts.parameterValues !== undefined ? { parameterValues: opts.parameterValues } : {}),
    pointVariables,
    lineEndpoints,
  };
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
      return Boolean(doc.lineById[c.l1 as never]) && Boolean(doc.lineById[c.l2 as never]);
  }
}
