// triangulate — tuple-shaped ADAPTER over the canonical triangulation.
//
// §C73-TRIANGULATION-CANONICAL (GE-12): this file used to hold its own O(n²)
// Meisters ear clip — one of seven rival triangulation bodies the counting
// gate (`tools/ga-gate/check-triangulation-canonical.ts`) measured before the
// collapse. It is now a call site of the ONE body in
// `pure/triangulatePolygon.ts`; there is deliberately no arithmetic here.
//
// §3.7 behaviour notes, on the record:
//   • The old ear clip BAILED on "no ear found" and silently returned a
//     PARTIAL triangulation for near-degenerate/non-simple rings; the
//     canonical earcut instead recovers via its cure/split passes. A silently
//     partial roof cap was the worse behaviour; recovery is canonical.
//   • Orientation contract is unchanged: output triangles are positively
//     oriented in the (x, z) tuple plane (CCW from +Y) regardless of input
//     winding — the old body forced CCW itself; the canonical body
//     orientation-normalises on build.
//
// Returns `[i0, i1, i2]` triangles indexed into the input polygon.

import { triangulateRingOrdinates } from '../../../pure/triangulatePolygon.js';
import type { Pt } from './polygon.js';

/** Returns triangle index list `[[i0, i1, i2], …]` indexed into `pts`. */
export function triangulate(pts: readonly Pt[]): [number, number, number][] {
  const flat = triangulateRingOrdinates(
    pts.length,
    (i) => pts[i]![0],
    (i) => pts[i]![1],
  );
  const out: [number, number, number][] = [];
  for (let t = 0; t < flat.length; t += 3) {
    out.push([flat[t]!, flat[t + 1]!, flat[t + 2]!]);
  }
  return out;
}
