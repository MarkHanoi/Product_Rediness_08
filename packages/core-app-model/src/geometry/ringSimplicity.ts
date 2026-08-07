/**
 * ringSimplicity — is a closed planar ring SIMPLE (free of self-intersections)?
 *
 * §FIX-REGION-RING-PRETRIM-FRAME / ADR-0299 §RECOVERY-MUST-REFUSE (2026-08-07)
 *
 * WHY THIS EXISTS AS A SHARED MODULE. Ear-clipping triangulators
 * (`THREE.ShapeUtils.triangulateShape`, i.e. earcut) do not merely degrade on a
 * self-intersecting ring — their CONTRACT REQUIRES a simple one, and given a
 * crossing ring they emit triangles that fall OUTSIDE the polygon. On the
 * founder's roof-by-region slab (SB002, 77 vertices) that is exactly what the
 * dark wedges punched through the top surface were. A ring-simplicity predicate
 * is therefore a PRECONDITION CHECK for every consumer of that triangulator, not
 * a room-detection detail — so it lives at L3 where all of them can reach it.
 *
 * The maths (and the epsilons) are lifted verbatim from
 * `room-topology/src/RoomPolygonUtils.isSimple`, which now delegates here. That
 * function keeps its `RoomVertex {x, z}` signature; this one is stated in the
 * axis-neutral `{x, y}` form so a caller working in the OTHER convention — and
 * `SlabRegionTracer` / `SlabFragmentBuilder` both carry world-Z in `y` — does not
 * have to lie about its coordinates to use it. Mixing those two conventions has
 * already cost this investigation a debugging round; naming the axes `x`/`y`
 * "the two planar axes, in ring order" is what stops it costing another.
 *
 * Pure maths: no THREE, no DOM, no store access. (Span-free by the same
 * precedent as the other pure geometry helpers: the C10 §2 OTel gate scopes to
 * `plugins/&#42;/src/handlers/`.)
 */

/** A ring vertex in ANY planar convention — `x`/`y` are simply the two axes. */
export interface RingPoint2D { x: number; y: number }

/**
 * Do segments `p1→p2` and `p3→p4` PROPERLY cross (shared endpoints excluded)?
 *
 * Exclusive on both parameters, because a closed ring's consecutive edges always
 * share an endpoint and a touch is not a crossing.
 */
export function ringSegmentsProperlyCross(
  p1: RingPoint2D, p2: RingPoint2D,
  p3: RingPoint2D, p4: RingPoint2D,
): boolean {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y;

  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-10) return false; // parallel

  const dx = p3.x - p1.x, dy = p3.y - p1.y;
  const t = (dx * d2y - dy * d2x) / cross;
  const u = (dx * d1y - dy * d1x) / cross;

  return t > 1e-10 && t < 1 - 1e-10 && u > 1e-10 && u < 1 - 1e-10;
}

/**
 * The index pair of the FIRST self-crossing found, or `null` when the ring is
 * simple. Returning the pair rather than a bare boolean is deliberate: ADR-0299
 * §RECOVERY-MUST-REFUSE requires a refusal to REPORT what it refused, and "the
 * ring crosses itself" is not actionable while "edge 34 crosses edge 61" is.
 *
 * O(n²) — the same bound `RoomPolygonUtils.isSimple` has always run at, and slab
 * rings are capped well below the 256-vertex polygon limit.
 */
export function findRingSelfIntersection(
  ring: ReadonlyArray<RingPoint2D>,
): { i: number; j: number } | null {
  const n = ring.length;
  if (n < 3) return null;
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    for (let j = i + 2; j < n; j++) {
      if (j === n - 1 && i === 0) continue; // closing edge always touches the opening edge
      const j2 = (j + 1) % n;
      if (ringSegmentsProperlyCross(ring[i]!, ring[i2]!, ring[j]!, ring[j2]!)) {
        return { i, j };
      }
    }
  }
  return null;
}

/**
 * True when the closed ring has no self-intersections — earcut's precondition.
 *
 * A ring of fewer than 3 vertices is NOT simple: it is not a polygon at all, and
 * reporting `true` would let a degenerate ring through the very gate that exists
 * to stop degenerate rings. (This matches `RoomPolygonUtils.isSimple`.)
 */
export function isSimpleRing(ring: ReadonlyArray<RingPoint2D>): boolean {
  if (ring.length < 3) return false;
  return findRingSelfIntersection(ring) === null;
}
