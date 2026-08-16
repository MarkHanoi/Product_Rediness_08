/**
 * §C73-P2S-CANONICAL — THE point-to-segment-distance predicate (C73 §3.1,
 * family "point-to-segment-distance"; gated by
 * `tools/ga-gate/check-predicate-canonical.ts`).
 *
 * `projectParamOnSegment` below is the canonical body: the projection parameter
 * `t`, clamped to [0,1]. Everything else in this file — squared distance, plain
 * distance, closest point, and the XZ/XY shape wrappers — is arithmetic ON TOP
 * of that one clamp, never a second copy of it.
 *
 * When this file was minted the gate measured **59 rival bodies across 53
 * files** carrying **14 DIFFERENT degenerate-segment conventions** between them.
 * That is not duplication, it is disagreement: the same question — "how far is
 * this point from this segment?" — answered fourteen ways in one repo.
 *
 * ── Why the CLAMP is the family's defining step (C73 §3.2, structural) ────────
 *
 * An UNCLAMPED `t` is the point-to-LINE question: it projects onto the infinite
 * line and has no notion of the segment ending. Clamping to [0,1] is exactly
 * what turns it into the point-to-SEGMENT question. The gate therefore counts
 * the clamped bodies and reports the unclamped ones as an ADJACENT family that
 * no collapse here can retire — the same cut `segmentIntersection.ts` makes
 * between the bounded segment/segment solve and the unbounded line/line one.
 *
 * ── The decided semantics (C73 §3.7 — a silent pick is a behaviour change
 *    shipped as a refactor, so every axis the rivals disagreed on is decided
 *    HERE, on the record) ─────────────────────────────────────────────────────
 *
 * 1. DEGENERATE-SEGMENT GUARD: **EXACT `lenSq > 0`, no epsilon** — and, as with
 *    the ray cast's absent guard, this is a theorem rather than a preference.
 *
 *    When `lenSq === 0` the segment IS the point `a`, and the distance from `p`
 *    to it is `|p − a|` — which is precisely what `t = 0` yields. The degenerate
 *    case therefore has a CORRECT ANSWER, not a refusal and not a band, so the
 *    guard needs no tolerance to be right. C73 §2.4 is satisfied without
 *    consuming a numeric epsilon at all, which is the strongest form of "the
 *    tolerance comes from the kernel or the predicate refuses".
 *
 *    This is a STRICT IMPROVEMENT on the 12 rivals that carried NO guard: they
 *    evaluate `0 / 0 = NaN` on a zero-length segment, `Math.max(0, Math.min(1,
 *    NaN))` is `NaN`, and the NaN then propagates silently into a distance
 *    comparison that reads false — a missed hit reported as a clean miss.
 *
 * 2. AN EPSILON GUARD ANSWERS A DIFFERENT QUESTION, AND DOES NOT MIGRATE HERE.
 *    `lenSq < ε` does not mean "avoid dividing by zero"; it means "this segment
 *    is TOO SHORT TO PROJECT ONTO", which is a DOMAIN BAND owned by the caller
 *    (C73 §2.1), not a zero-of-arithmetic guard. The rivals' bands span
 *    `1e-20` to `1e-3` ON THE SQUARED LENGTH — segment lengths from 0.1 nm to
 *    3.2 cm, SEVENTEEN ORDERS OF MAGNITUDE — so there is no single value this
 *    file could adopt that would not silently change behaviour somewhere.
 *
 *    ⚠ THEREFORE: a call site whose band is a REAL domain decision keeps it AT
 *    THE CALL SITE and composes — `lenSq(a,b) < myBand ? … : distance(…)` —
 *    exactly as `pointInPolygon.ts` keeps boundary-inclusive containment at the
 *    callers that own it. Folding such a band into the kernel would be the
 *    "150x tighter" near-miss BIM30-IMPLEMENTATION-ROADMAP §7B.5 records: a
 *    behaviour change disguised as a cleanup. Two live examples, measured, are
 *    named in the gate's output so neither is migrated by accident.
 *
 * 3. CLAMP CONVENTION: `t` is clamped to the CLOSED interval [0,1], so a point
 *    beyond either endpoint reports the distance to that ENDPOINT. Rivals spelt
 *    the clamp four ways (`Math.max(0, Math.min(1, t))`, `Math.min(1,
 *    Math.max(0, t))`, the `t < 0 ? 0 : t > 1 ? 1 : t` ternary, and an
 *    `if`-assignment pair); all four compute the same value for every non-NaN
 *    input, so this is a spelling collapse with no behavioural axis to decide.
 *
 * 4. PLANE / UNITS: dimensionless — any planar coordinate pair (plan x/z,
 *    screen x/y, east/north). The wrappers name the live conventions; exotic
 *    shapes call the ordinate form directly rather than minting a wrapper per
 *    naming fashion.
 *
 * 5. SQUARED vs PLAIN distance: both are exported, because the squared form is
 *    the one hot loops want (no `sqrt` per edge) and forcing them through the
 *    rooted form would be a performance regression that guarantees a rival gets
 *    re-minted. `distanceSq` is the primitive; `distance` is its `sqrt`.
 *
 * NOT PROVEN by this file: that every one of the 59 measured rivals is
 * behaviourally identical to it. They are not — see decision 2. The gate counts
 * them; the collapse is per-site work that must read each band before folding.
 *
 * PURE: no THREE, no DOM, no I/O — same rules as the rest of the kernel.
 *
 * @file packages/geometry-kernel/src/pure/pointToSegment.ts
 */

/**
 * THE clamped projection parameter (C73 §3.1 canonical body — the only
 * clamped-t projection in the kernel).
 *
 * Returns `t ∈ [0,1]` such that `a + t·(b − a)` is the closest point of the
 * SEGMENT `a→b` to `p`. A degenerate segment (`a === b`) returns `0`, which
 * names the point `a` — the exact answer, not a fallback (see header, 1).
 */
export function projectParamOnSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  // EXACT, deliberately not an epsilon. `lenSq === 0` ⇒ the segment is the
  // point `a` ⇒ t = 0 is the correct answer, so no tolerance is needed to be
  // right, and no rival's private band is silently adopted.
  if (!(lenSq > 0)) return 0;
  const t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** The closest point of the SEGMENT `a→b` to `p`, as an `{x, y}` pair. */
export function closestPointOnSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): { x: number; y: number } {
  const t = projectParamOnSegment(px, py, ax, ay, bx, by);
  return { x: ax + t * (bx - ax), y: ay + t * (by - ay) };
}

/**
 * SQUARED distance from `p` to the SEGMENT `a→b`. The primitive — hot loops
 * that only compare distances should use this and never pay a `sqrt` per edge.
 */
export function distanceSqPointToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const t = projectParamOnSegment(px, py, ax, ay, bx, by);
  const ex = px - (ax + t * (bx - ax));
  const ey = py - (ay + t * (by - ay));
  return ex * ex + ey * ey;
}

/** Distance from `p` to the SEGMENT `a→b`. */
export function distancePointToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  return Math.sqrt(distanceSqPointToSegment(px, py, ax, ay, bx, by));
}

/**
 * Distance from `p` to the segment `a→b` on the plan XZ plane — the model-space
 * convention (rooms, slabs, shells, footprints all speak `{x, z}` metres).
 */
export function distancePointToSegmentXZ(
  p: Readonly<{ x: number; z: number }>,
  a: Readonly<{ x: number; z: number }>,
  b: Readonly<{ x: number; z: number }>,
): number {
  return distancePointToSegment(p.x, p.z, a.x, a.z, b.x, b.z);
}

/** Distance from `p` to the segment `a→b` on an XY pair (screen/projected). */
export function distancePointToSegmentXY(
  p: Readonly<{ x: number; y: number }>,
  a: Readonly<{ x: number; y: number }>,
  b: Readonly<{ x: number; y: number }>,
): number {
  return distancePointToSegment(p.x, p.y, a.x, a.y, b.x, b.y);
}

/**
 * Minimum distance from `p` to a RING's edges (closing edge included) — the
 * shape almost every rival actually wanted, hoisted here so the loop is not
 * re-minted per caller. Accessor-based, so any vertex shape reads one body.
 * A ring with fewer than 2 vertices has no edge; `Infinity` is the honest
 * "there is nothing to be near", not a zero that reads as "touching".
 */
export function distancePointToRing(
  px: number, py: number,
  vertexCount: number,
  xAt: (i: number) => number,
  yAt: (i: number) => number,
): number {
  if (vertexCount < 2) return Infinity;
  let best = Infinity;
  for (let i = 0; i < vertexCount; i++) {
    const j = (i + 1) % vertexCount;
    const d = distanceSqPointToSegment(px, py, xAt(i), yAt(i), xAt(j), yAt(j));
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
