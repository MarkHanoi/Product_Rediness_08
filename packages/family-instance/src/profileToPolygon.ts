// profileToPolygon — convert a `Profile` into the closed XZ polygon
// expected by `produceExtrude` / `produceRevolve`.
//
// v1 contract (plan §19.5 D2):
//   • The profile's `entities` list is an ordered list of `point`
//     entities.  Each point's `data` carries `x` and `z` numeric
//     coordinates in METRES.
//   • Lines / arcs / circles / splines and full constraint solving
//     are deferred to S57 once the AssumeFlat solver lands.
//
// We treat any non-`point` entity as a structural error (see
// PROFILE_NEEDS_SOLVER) so callers fail loudly rather than silently
// dropping geometry.  S57 will replace this function with a call into
// `@pryzm/constraint-solver`'s evaluator that resolves arc + line +
// spline entities into a flattened polyline.

import type { Profile } from '@pryzm/file-format';

export class ProfileEvalError extends Error {
  constructor(
    public readonly code:
      | 'profile-needs-solver'
      | 'profile-not-closed'
      | 'profile-too-few-points'
      | 'profile-non-finite-coord',
    message: string,
  ) {
    super(message);
    this.name = 'ProfileEvalError';
  }
}

export interface PolygonPoint {
  readonly x: number;
  readonly z: number;
}

const MIN_POINTS = 3;

/**
 * Walk the profile entities and emit a closed polygon in winding order.
 *
 * The polygon is returned WITHOUT a duplicated last==first vertex —
 * geometry-kernel producers handle the closing edge themselves.
 */
export function profileToPolygon(profile: Profile): PolygonPoint[] {
  if (profile.entities.length < MIN_POINTS) {
    throw new ProfileEvalError(
      'profile-too-few-points',
      `[profileToPolygon] profile ${profile.id} has ${profile.entities.length} entities; need at least ${MIN_POINTS} points to form a polygon.`,
    );
  }
  const points: PolygonPoint[] = [];
  for (const e of profile.entities) {
    if (e.kind !== 'point') {
      throw new ProfileEvalError(
        'profile-needs-solver',
        `[profileToPolygon] profile ${profile.id} contains a '${e.kind}' entity — v1 bake only supports profiles whose entities are all points (constraint solver lands in S57).`,
      );
    }
    const x = e.data.x;
    const z = e.data.z;
    if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) {
      throw new ProfileEvalError(
        'profile-non-finite-coord',
        `[profileToPolygon] profile ${profile.id} entity ${e.id} has non-finite coords (x=${String(x)}, z=${String(z)}).`,
      );
    }
    points.push({ x, z });
  }

  // Drop a duplicated trailing point if the author closed the loop
  // explicitly — geometry-kernel adds the closing edge itself.
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (points.length > MIN_POINTS && Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.z - last.z) < 1e-9) {
    points.pop();
  }
  if (points.length < MIN_POINTS) {
    throw new ProfileEvalError(
      'profile-too-few-points',
      `[profileToPolygon] profile ${profile.id} resolved to ${points.length} unique points; need at least ${MIN_POINTS}.`,
    );
  }
  return points;
}
