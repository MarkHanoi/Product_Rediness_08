/**
 * curvedWallTessellation — §FIX-CURVED-WALL-PRETRIM-FRAME (founder, 2026-08-07)
 *
 * THE REPORT (three times): a floor finish in a curved room shows a thin STRAIGHT
 * line cutting diagonally across one corner, inside the arc — while the curved
 * WALL beside it renders correctly.
 *
 * THE PROOF IT IS NOT THE FINISH: the log showed
 *   §DIAG-PARTITION-REACH reconnected guest=wall_X_c23.end onto host=wall_X_c22
 *   body — closed a 599mm dangling gap
 * `_c22` and `_c23` are ADJACENT TESSELLATION SEGMENTS OF ONE ARC. They are
 * emitted as `pts[i] → pts[i+1]` from a single polyline, so `_c22.end` IS
 * `_c23.start` by construction. Two of them being 599 mm apart is impossible
 * unless something downstream moved one — so the ROOM RING was already wrong
 * before any floor code ran. The finish reproduced it faithfully.
 *
 * ROOT CAUSE — a PRE-TRIM / POST-TRIM FRAME MISMATCH.
 * `RoomDetectionEngine` tessellated a curved wall like this:
 *     start   = wall.baseLine[0]      ← POST-trim (WallJoinResolver shortened it)
 *     end     = wall.baseLine[1]      ← POST-trim
 *     control = wall.curve.control    ← PRE-trim  (as the user authored it)
 * A quadratic Bézier through TRIMMED endpoints with an UNTRIMMED control point is
 * not the original arc restricted to the trimmed span — it is a DIFFERENT CURVE.
 * It agrees near the middle and diverges near the ends, which is exactly why the
 * founder sees a good arc with one bad corner. The mis-fitted tail then lands far
 * enough from its neighbour that `§DIAG-PARTITION-REACH` treats it as a dangling
 * partition end and drags it onto the nearest collinear host — which, for a
 * mis-fitted arc, is its own parent's previous sub-segment. That "recovery" is the
 * straight chord in the screenshot.
 *
 * THIS BUG WAS ALREADY SOLVED ONCE, ELSEWHERE. `WallFragmentBuilder`
 * (§V2-PRETRIM-FIX, 2026-05-27, also found by an architect screenshot) hit the
 * identical failure — post-trim endpoints mixed with a pre-trim frame producing
 * degenerate geometry — and fixed it by reading the archived pre-trim baseline
 * `wall._sourceBaseLine`. `RoomDetectionEngine` never adopted it. That is why the
 * 3D wall mesh draws the true arc while room detection walks a different one, and
 * therefore why the finish disagrees with the wall it sits against.
 *
 * THE FIX, in one sentence: tessellate the arc in the PRE-TRIM frame (the frame it
 * was authored in, so the curve is the real curve), then CLIP that polyline to the
 * post-trim span — rather than re-fitting a new Bézier through trimmed ends.
 *
 * Pure 2D/3D-agnostic maths: no THREE, no DOM, no store access, so it is unit
 * testable without a scene. (Span-free by the same precedent as the other pure
 * geometry helpers: the C10 §2 OTel gate scopes to `plugins/&#42;/src/handlers/`.)
 */

export interface TessPoint { x: number; y?: number; z: number }

/** Squared XZ distance — comparisons only, so the sqrt is not paid. */
function d2(a: TessPoint, b: TessPoint): number {
  const dx = a.x - b.x, dz = a.z - b.z;
  return dx * dx + dz * dz;
}

/**
 * The closest point to `p` on segment `a→b`, plus how far along it sits (`t`, 0..1)
 * and the squared distance. XZ only — walls are vertical extrusions.
 */
function closestOnSegment(p: TessPoint, a: TessPoint, b: TessPoint): { t: number; d2: number; x: number; z: number } {
  const abx = b.x - a.x, abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  if (len2 < 1e-18) return { t: 0, d2: d2(p, a), x: a.x, z: a.z };
  let t = ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = a.x + abx * t, z = a.z + abz * t;
  const dx = p.x - x, dz = p.z - z;
  return { t, d2: dx * dx + dz * dz, x, z };
}

/** Where a point projects onto a polyline: which segment, and how far along it. */
interface PolyProjection { segIdx: number; t: number; x: number; z: number; d2: number }

function projectOntoPolyline(p: TessPoint, poly: readonly TessPoint[]): PolyProjection {
  let best: PolyProjection = { segIdx: 0, t: 0, x: poly[0]!.x, z: poly[0]!.z, d2: Infinity };
  for (let i = 0; i < poly.length - 1; i++) {
    const c = closestOnSegment(p, poly[i]!, poly[i + 1]!);
    if (c.d2 < best.d2) best = { segIdx: i, t: c.t, x: c.x, z: c.z, d2: c.d2 };
  }
  return best;
}

/**
 * Clip `poly` to the span between `from` and `to`, which are expected to lie ON (or
 * very near) the polyline — the post-trim endpoints of a wall whose arc was
 * tessellated in the pre-trim frame.
 *
 * The returned polyline:
 *   • STARTS exactly at `from` and ENDS exactly at `to` — so the wall still meets
 *     its neighbours at the junction points the resolver computed. The trim is
 *     honoured; only the SHAPE between the ends comes from the true arc.
 *   • keeps every original interior vertex between those two projections, so the
 *     curvature is the authored curvature, not a re-fit approximation.
 *
 * Degenerate inputs (fewer than 2 points, reversed projections, coincident ends)
 * fall back to a straight `from → to`, which is the pre-fix behaviour — a clip that
 * cannot be computed must not invent geometry.
 */
export function clipPolylineToSpan(
  poly: readonly TessPoint[],
  from: TessPoint,
  to: TessPoint,
): TessPoint[] {
  if (poly.length < 2) return [{ ...from }, { ...to }];

  const pFrom = projectOntoPolyline(from, poly);
  const pTo = projectOntoPolyline(to, poly);

  // Absolute position along the polyline, for ordering.
  const pos = (p: PolyProjection) => p.segIdx + p.t;
  if (pos(pTo) <= pos(pFrom)) return [{ ...from }, { ...to }];

  const out: TessPoint[] = [{ x: from.x, y: from.y, z: from.z }];
  // Interior vertices strictly between the two projections.
  for (let i = pFrom.segIdx + 1; i <= pTo.segIdx; i++) {
    const v = poly[i]!;
    // Skip a vertex that coincides with either clipped end (avoids zero-length segs).
    if (d2(v, from) < 1e-12 || d2(v, to) < 1e-12) continue;
    out.push({ x: v.x, y: v.y, z: v.z });
  }
  out.push({ x: to.x, y: to.y, z: to.z });
  return out;
}

/**
 * THE ONE curved-wall tessellation for topology.
 *
 * `sourceBaseLine` is the wall's PRE-trim baseline (`WallData._sourceBaseLine`,
 * archived by the join resolver); `baseLine` is the current POST-trim one. When no
 * source baseline exists — a freshly created wall that has never been trimmed —
 * pre-trim ≡ post-trim by construction and the result is bit-identical to the old
 * code, so untrimmed walls are provably unaffected.
 *
 * @param tessellate  Injected arc sampler (`PathResolver.toPolyline`), so this
 *                    module stays THREE-free and unit-testable.
 */
export function tessellateCurvedWallForTopology(
  args: {
    baseLine: readonly [TessPoint, TessPoint];
    sourceBaseLine?: readonly [TessPoint, TessPoint] | null;
    control: TessPoint;
    segments: number;
  },
  tessellate: (start: TessPoint, end: TessPoint, control: TessPoint, segments: number) => TessPoint[],
): TessPoint[] {
  const [postStart, postEnd] = args.baseLine;
  const preStart = args.sourceBaseLine?.[0] ?? postStart;
  const preEnd = args.sourceBaseLine?.[1] ?? postEnd;

  // Sample the arc in the frame it was AUTHORED in — this is the real curve.
  const full = tessellate(preStart, preEnd, args.control, args.segments);
  if (full.length < 2) return [{ ...postStart }, { ...postEnd }];

  // Untrimmed wall: nothing to clip, and clipping would only add float noise.
  const untrimmed = d2(preStart, postStart) < 1e-12 && d2(preEnd, postEnd) < 1e-12;
  if (untrimmed) return full;

  return clipPolylineToSpan(full, postStart, postEnd);
}

/**
 * §DIAG-PARTITION-REACH same-parent guard — strip the tessellation/split suffixes
 * to recover the WallStore id a sub-segment belongs to.
 *
 * Sub-segments are named `{id}_c{i}` (curve tessellation AND body-crossing splits)
 * and `{id}_c{i}_s{j}` (T-junction splits), so the suffix run is `/(_[cs]\d+)+$/` —
 * the same regex the room output uses to rebuild `boundingWallIds`.
 */
export function baseWallId(subSegmentId: string): string {
  return subSegmentId.replace(/(_[cs]\d+)+$/, '');
}
