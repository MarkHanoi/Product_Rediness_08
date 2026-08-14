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

import { segmentsProperlyCross2D } from '@pryzm/geometry-kernel';

/** A ring vertex in ANY planar convention — `x`/`y` are simply the two axes. */
export interface RingPoint2D { x: number; y: number }

/**
 * Do segments `p1→p2` and `p3→p4` PROPERLY cross (shared endpoints excluded)?
 *
 * Exclusive on both parameters, because a closed ring's consecutive edges always
 * share an endpoint and a touch is not a crossing.
 *
 * §C73-SEGSEG-CANONICAL — delegates to the kernel's ONE segment/segment body
 * (strict-interior view: exact sign tests, no divide, no epsilon). The private
 * `1e-10` parallel guard and `1e-10` interior band this carried are RETIRED
 * (C73 §2.4): a crossing whose parameters sat inside the old band — within
 * 1e-10 of an endpoint — now reads as the proper crossing it geometrically is,
 * and near-parallel pairs are decided by exact sign rather than a private
 * threshold. The verdicts differ only on that measure-zero band, stated here
 * per §3.7 rather than smuggled in as a refactor.
 */
export function ringSegmentsProperlyCross(
  p1: RingPoint2D, p2: RingPoint2D,
  p3: RingPoint2D, p4: RingPoint2D,
): boolean {
  return segmentsProperlyCross2D(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y, p4.x, p4.y);
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
