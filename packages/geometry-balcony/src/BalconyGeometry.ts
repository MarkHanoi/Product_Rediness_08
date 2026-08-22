// BalconyGeometry — the host rectangle, and the MEASURED free-edge rule.
//
// §FEAT-BALCONY-COMPOUND (L-5600) · C103 §3 + §4 · ADR-0333 §4
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ THE FREE-EDGE RULE IS NOT NEW. IT IS EXTRACTED, NOT INVENTED.
// ═══════════════════════════════════════════════════════════════════════════════
// `ResidentialBuildingExecutor._createBalconies` has shipped this rule for months
// (§RESI-BALCONY, 2026-06-24). Its own comment states it exactly:
//
//     "3-edge glass guard (the outer U): inner-a→outer-a, outer-a→outer-b,
//      outer-b→inner-b. The wall-facing edge (inner-a→inner-b) stays OPEN as the
//      access from the room."
//
// That is the whole answer to *"which edges get a railing?"*, and re-deriving it
// here from first principles would have produced a SECOND rule that agrees today
// and diverges later — this repo's most-repeated defect. So the rule is lifted
// verbatim; only its EXPRESSION changes, and the change is the point:
//
//   · the executor's version is INDEX-BASED. It knows the wall-facing edge is
//     edge 0 because it just built the rectangle in that order.
//   · this version is MEASURED. An edge is a HOST edge iff both its endpoints lie
//     on the host wall's centreline segment, within tolerance.
//
// ⚠ WHY THE MEASURED FORM IS REQUIRED HERE AND THE INDEXED FORM IS NOT ENOUGH.
// The founder's request includes *"the user could after change the shape [with edit
// profile], and the floor finish and railings should adapt."* A vertex drag can
// insert, delete and RENUMBER edges. An index recorded at creation would then name
// a different edge — and the visible failure is a railing drawn across the doorway
// while the open side faces the drop. A stored index is a derived value stored;
// C84 §8.i is the clause that exists because a derived value stopped following its
// input. Measuring cannot go stale, so nothing is stored.
//
// PURE: no THREE, no DOM, no store, no id minting, no schema parse.

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm-geometry-balcony');

/** A point on the balcony's plan outline. World XZ, `y` carrying the level datum. */
export interface BalconyVertex {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A 2-D plan point. */
export interface PlanPoint {
  readonly x: number;
  readonly z: number;
}

/** The host wall's CENTRELINE as this package needs to read it. */
export interface HostWallSegment {
  readonly a: PlanPoint;
  readonly b: PlanPoint;
}

/**
 * One edge of the balcony boundary.
 *
 * `index` is the index of the edge's FIRST vertex in the boundary array, and it is
 * reported for diagnostics and tests only — nothing stores it. See the header.
 */
export interface BalconyEdge {
  readonly index: number;
  readonly a: BalconyVertex;
  readonly b: BalconyVertex;
  /** Plan length, metres. */
  readonly length: number;
}

/**
 * How close an edge endpoint must be to the host wall's centreline to count as
 * lying ON it, in metres.
 *
 * ⭐ NOT A BALCONY DIMENSION — a COINCIDENCE TOLERANCE, which is why it is here and
 * not in `BalconyDimensions`. It is sized to swallow half of a thick wall
 * (0.4 m walls exist) plus authoring noise, because `balconyRectangle()` puts the
 * inner edge ON the centreline while a hand-dragged inner edge may sit anywhere
 * inside the wall's footprint and must still read as "against the wall".
 *
 * ⚠ A user who drags the inner edge CLEAR of the wall (further than this) gets a
 * railing on that edge. That is correct, not a bug: the balcony is no longer against
 * the wall there, so the free perimeter genuinely includes it. It is called out here
 * because it is the one behaviour of this rule that surprises on first sight.
 */
export const HOST_EDGE_TOLERANCE_M = 0.25;

/** Shortest distance from a plan point to a plan SEGMENT, in metres. */
export function distanceToSegment(p: PlanPoint, a: PlanPoint, b: PlanPoint): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-12) return Math.hypot(p.x - a.x, p.z - a.z);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

/**
 * Every edge of a boundary, in boundary order, as a closed ring.
 *
 * The boundary is an OPEN loop (the Slab / Pool / Balcony convention), so the last
 * edge closes it: `boundary[n-1] → boundary[0]`.
 */
export function balconyEdges(boundary: readonly BalconyVertex[]): readonly BalconyEdge[] {
  const n = boundary.length;
  const out: BalconyEdge[] = [];
  for (let i = 0; i < n; i++) {
    const a = boundary[i]!;
    const b = boundary[(i + 1) % n]!;
    out.push({ index: i, a, b, length: Math.hypot(b.x - a.x, b.z - a.z) });
  }
  return out;
}

/**
 * The FREE edges of a balcony — every boundary edge that is NOT against the host
 * wall. These, and only these, carry a railing.
 *
 * @param boundary  the balcony outline, OPEN loop, world XZ
 * @param host      the host wall's centreline, or `undefined` for a free-standing
 *                  balcony — which is railed ALL ROUND, because it has no side that
 *                  is protected by a building
 * @param tolerance coincidence tolerance in metres; see `HOST_EDGE_TOLERANCE_M`
 *
 * ⛔ It NEVER returns an empty array when the boundary is non-degenerate and the
 * host lies along a single edge, and it never returns every edge when a host is
 * given and one edge really is against it. Both of those are the failure the
 * `resolveFreeEdges` suite pins, because "all edges railed" and "no edges railed"
 * are the two silently-wrong outcomes — one seals the balcony off, the other leaves
 * an unguarded drop.
 */
export function resolveFreeEdges(
  boundary: readonly BalconyVertex[],
  host?: HostWallSegment,
  tolerance: number = HOST_EDGE_TOLERANCE_M,
): readonly BalconyEdge[] {
  return _tracer.startActiveSpan('pryzm.balcony.resolveFreeEdges', (span) => {
    try {
      const all = balconyEdges(boundary);
      span.setAttribute('pryzm.balcony.edgeCount', all.length);

      if (!host) {
        // No host = no protected side. A free-standing balcony (roof terrace, deck)
        // is railed all round. Reporting "no free edges" here would leave an
        // unguarded drop, so the absent host resolves to the SAFE answer, not the
        // convenient one.
        span.setAttribute('pryzm.balcony.hostKnown', false);
        span.setAttribute('pryzm.balcony.freeEdgeCount', all.length);
        return all;
      }

      span.setAttribute('pryzm.balcony.hostKnown', true);
      const free = all.filter((e) => {
        const aOn = distanceToSegment(e.a, host.a, host.b) <= tolerance;
        const bOn = distanceToSegment(e.b, host.a, host.b) <= tolerance;
        // BOTH endpoints — an edge that merely TOUCHES the wall at one corner (the
        // two side edges of the default rectangle do exactly that) still needs its
        // railing, and testing the midpoint alone would drop them.
        return !(aOn && bOn);
      });
      span.setAttribute('pryzm.balcony.freeEdgeCount', free.length);
      return free;
    } finally {
      span.end();
    }
  });
}

/**
 * The DEFAULT balcony outline: a rectangle projecting from a host wall.
 *
 * Vertex order is `[innerLeft, innerRight, outerRight, outerLeft]`, so the HOST edge
 * is edge 0 and the outer U is edges 1..3 — the same ring the residential generator
 * builds (`[wia, wib, wob, woa]`). Winding is consistent with that generator, and no
 * consumer depends on the index because the free edges are measured.
 *
 * ⭐ THE INNER EDGE SITS ON THE WALL CENTRELINE, NOT ON ITS OUTER FACE, and that is
 * a decision rather than an oversight (ADR-0333 §5). A cantilever balcony slab is
 * structurally continuous with the floor plate it projects from, so overlapping the
 * wall by half its thickness is the correct solid. It also makes the host-edge test
 * EXACT for a freshly placed balcony instead of tolerance-dependent, and it means
 * this function needs to know nothing about wall thickness — which it has no
 * business knowing.
 *
 * @param host       the host wall's centreline segment
 * @param offset     arc length from `host.a` to the balcony's LEFT edge, in metres
 *                   (the §OPENING-OFFSET-LEFTEDGE-UNIFY convention)
 * @param width      clear span along the wall, in metres
 * @param projection depth away from the wall, in metres
 * @param outwardRef a plan point on the side the balcony must project TOWARDS —
 *                   in practice the user's cursor. ⛔ REQUIRED, and deliberately so:
 *                   a wall has two sides and this package cannot tell which one is
 *                   outdoors. The residential generator answers the same question
 *                   with the cell centre ("a backwards normal puts the balcony
 *                   INSIDE the building — spike risk"); guessing here would put the
 *                   balcony in the bedroom.
 * @param datumY     the level elevation carried on every vertex's `y`
 */
export function balconyRectangle(
  host: HostWallSegment,
  offset: number,
  width: number,
  projection: number,
  outwardRef: PlanPoint,
  datumY = 0,
): readonly BalconyVertex[] {
  return _tracer.startActiveSpan('pryzm.balcony.rectangle', (span) => {
    try {
      const dx = host.b.x - host.a.x;
      const dz = host.b.z - host.a.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-9) {
        throw new Error(
          '[balconyRectangle] host wall centreline is degenerate (zero length); ' +
            'a balcony cannot be hosted on a wall with no direction.',
        );
      }
      const ux = dx / len;
      const uz = dz / len;

      // Outward normal — chosen to point TOWARDS `outwardRef`, exactly as the
      // residential generator chooses it to point away from the cell centre.
      let nx = -uz;
      let nz = ux;
      const midX = host.a.x + ux * (offset + width / 2);
      const midZ = host.a.z + uz * (offset + width / 2);
      if ((outwardRef.x - midX) * nx + (outwardRef.z - midZ) * nz < 0) {
        nx = -nx;
        nz = -nz;
      }

      const innerLeft = { x: host.a.x + ux * offset, y: datumY, z: host.a.z + uz * offset };
      const innerRight = {
        x: host.a.x + ux * (offset + width),
        y: datumY,
        z: host.a.z + uz * (offset + width),
      };
      const outerRight = {
        x: innerRight.x + nx * projection,
        y: datumY,
        z: innerRight.z + nz * projection,
      };
      const outerLeft = {
        x: innerLeft.x + nx * projection,
        y: datumY,
        z: innerLeft.z + nz * projection,
      };

      span.setAttribute('pryzm.balcony.hostLength', len);
      return [innerLeft, innerRight, outerRight, outerLeft];
    } finally {
      span.end();
    }
  });
}

/**
 * Plan area of an OPEN loop in world XZ, via the shoelace formula. Metres².
 * Winding-independent (absolute value), so a CW or CCW balcony both measure positive.
 *
 * ⚠ This is the balcony's GROSS plan area and nothing else. It is deliberately NOT
 * offered as a contribution to any area STANDARD: `apps/editor/src/ui/analysis/
 * areaStandards.ts:168` records that IPMS "additionally requires balconies, terraces
 * and …" as a NAMED BLOCKER, and a number handed to a standard that has not decided
 * how to count it is worse than no number. Feeding this into an area standard is a
 * separate, deliberate piece of work (L-5613).
 */
export function balconyPlanArea(loop: readonly BalconyVertex[]): number {
  return _tracer.startActiveSpan('pryzm.balcony.planArea', (span) => {
    try {
      let a2 = 0;
      for (let i = 0; i < loop.length; i++) {
        const c = loop[i]!;
        const n = loop[(i + 1) % loop.length]!;
        a2 += c.x * n.z - n.x * c.z;
      }
      const area = Math.abs(a2 / 2);
      span.setAttribute('pryzm.balcony.planArea', area);
      return area;
    } finally {
      span.end();
    }
  });
}
