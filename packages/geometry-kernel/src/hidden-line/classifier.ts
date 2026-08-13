// Hidden-line classifier — kernel-pure (post-2B closeout / ADR-0030).
//
// Implementation strategy (S35-bis):
//   1. Sort edges back-to-front by `worldZFront` (deepest first).
//   2. For each edge, compute its midpoint and test it against every
//      occluder polygon (point-in-polygon, ray-cast).  If the midpoint
//      falls inside any occluder whose `worldZ` is in front of the
//      edge's `worldZFront`, classify as `'occluded'`.
//   3. Edges entirely behind `cutPlaneZ` ⇒ `'hidden'`.
//   4. Otherwise ⇒ `'visible'`.
//
// This is intentionally simple and CPU-bound — sufficient for the < 200
// edge plan-view "small" tier; will be replaced by WebGL2 occlusion
// queries at S37 and WebGPU compute post-GA per SPEC-30 §3.2.
//
// PURE: no THREE, no DOM, no Node-only globals.

import type {
  ClassifiedHiddenLineEdge,
  HiddenLineClassifierInput,
  OccluderPolygon,
  ProjectedEdge,
} from './types.js';
import type { Vec2 } from '@pryzm/drawing-primitives';
// §C73-PIP-CANONICAL — delegates to THE point-in-polygon body. The private copy
// that lived here carried a `+ 1e-12` divisor perturbation, which shifted every
// crossing abscissa by a private epsilon; the canonical body computes the exact
// interpolation (the straddle test makes the divisor structurally nonzero).
import { pointInPolygonXY } from '../pure/pointInPolygon.js';

function midpoint(e: ProjectedEdge): Vec2 {
  return { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
}

function isOccludedBy(edge: ProjectedEdge, occluder: OccluderPolygon): boolean {
  // Occluder must be in front of the edge to occlude it.
  if (occluder.worldZ <= edge.worldZFront) return false;
  const m = midpoint(edge);
  return pointInPolygonXY(m.x, m.y, occluder.outer);
}

export function classifyHiddenLines(
  input: HiddenLineClassifierInput,
): readonly ClassifiedHiddenLineEdge[] {
  const out: ClassifiedHiddenLineEdge[] = [];
  for (const edge of input.edges) {
    if (edge.worldZBack < input.cutPlaneZ && edge.worldZFront < input.cutPlaneZ) {
      out.push({ a: edge.a, b: edge.b, classification: 'hidden' });
      continue;
    }
    let occluded = false;
    for (const occ of input.occluders) {
      if (isOccludedBy(edge, occ)) { occluded = true; break; }
    }
    out.push({
      a: edge.a, b: edge.b,
      classification: occluded ? 'occluded' : 'visible',
    });
  }
  return out;
}
