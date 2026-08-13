/**
 * §C73-PIP-CANONICAL — THE point-in-polygon predicate (C73 §3.1, family
 * "point-in-polygon"; gated by `tools/ga-gate/check-predicate-canonical.ts`).
 *
 * `pointInRingEvenOdd` below is deliberately the ONLY even-odd ray-cast body
 * in the production tree. Before this file existed the gate measured 51 rival
 * bodies across 48 files — 51 private definitions of "inside", with FOUR
 * different degenerate-divide conventions between them (`|| 1e-30`, `|| 1e-12`,
 * `|| 1e-9`, `+ 1e-30`/`+ 1e-12`, and bare). Every shape-specific entry point
 * here delegates to the one body; none of them re-implements the straddle test.
 *
 * ── The decided semantics (C73 §3.7 — a silent pick is a behaviour change
 *    shipped as a refactor, so each axis the rivals disagreed on is decided
 *    HERE, on the record) ─────────────────────────────────────────────────────
 *
 * 1. DEGENERATE-DIVIDE GUARD: NONE — and that is a theorem, not an omission.
 *    The x-interpolation divide `(xj - xi) * (py - yi) / (yj - yi)` executes
 *    only when the straddle test `(yi > py) !== (yj > py)` holds, and the
 *    straddle test holding implies `yi ≠ yj` EXACTLY (one side is > py, the
 *    other is ≤ py), so the divisor is structurally nonzero — `&&`
 *    short-circuits past every horizontal edge. C73 §2.4 ("the guard comes
 *    from EPSILON_ZERO or the predicate refuses") is satisfied vacuously:
 *    there is no reachable degenerate divide to guard. Of the rival
 *    conventions, every `|| eps` guard was DEAD CODE for exactly this reason,
 *    and every `+ eps` guard PERTURBED the crossing abscissa of every
 *    non-horizontal edge — a knife-edge query could flip on the size of a
 *    private epsilon. Canonical behaviour is the exact interpolation.
 *
 * 2. BOUNDARY: HALF-OPEN (even-odd). A point strictly inside returns true,
 *    strictly outside returns false; a point EXACTLY ON the boundary returns
 *    a deterministic but edge-dependent value (for an axis-aligned box, the
 *    min-x and min-y edges read inside, the max-x and max-y edges read
 *    outside — the classic PNPOLY rule, pinned by the oracle fixture). Rivals
 *    that needed boundary-INCLUSIVE containment composed this predicate with
 *    an explicit distance-to-edge band, and one rival (tgl `wallsAndDoors`)
 *    needs boundary-EXCLUSIVE and composes with an explicit on-boundary
 *    pre-check. Both compositions are CORRECT and stay at their call sites:
 *    the on-boundary test is the point-to-segment-distance family (C73 §3.1),
 *    which is NOT this family and must not be folded in here (§3.5, one
 *    family per PR). This predicate does not pretend to answer the boundary
 *    question; callers that care must ask it explicitly.
 *
 * 3. DEGENERATE RING (< 3 vertices): returns false. A ring with fewer than
 *    three vertices has no interior, so "not inside" is the CORRECT ANSWER to
 *    a well-posed question — not a failure encoded as a value (C73 §4.3 is
 *    about failure masquerading as emptiness; this is neither).
 *
 * 4. WINDING: orientation-independent. Even-odd parity is unchanged under
 *    ring reversal — CW and CCW rings give identical answers (oracle-pinned).
 *
 * 5. RING CONVENTION: open form (`ring[n-1]` implicitly closes to `ring[0]`).
 *    An explicitly closed ring (first vertex repeated at the end) also gives
 *    identical answers: the duplicate produces a zero-length edge, and a
 *    zero-length edge can never straddle (oracle-pinned).
 *
 * 6. PLANE / UNITS: dimensionless — works on any planar coordinate pair
 *    (plan x/z, screen x/y, east/north). The shape-specific wrappers name the
 *    live conventions; exotic shapes (tuples, {e,n}, linked structures) call
 *    `pointInRingEvenOdd` with their own accessors rather than minting a
 *    wrapper per naming fashion.
 *
 * 7. HOLES: even-odd over multiple rings is the XOR of the per-ring results —
 *    callers with hole rings fold `pointInRingEvenOdd` per ring; no second
 *    ray-cast body is ever needed for it.
 *
 * PURE: no THREE, no DOM, no I/O — same rules as the rest of the kernel.
 *
 * @file packages/geometry-kernel/src/pure/pointInPolygon.ts
 */

/** Reads one ordinate of ring vertex `i` — see {@link pointInRingEvenOdd}. */
export type RingOrdinateAt = (index: number) => number;

/**
 * THE even-odd ray cast (C73 §3.1 canonical body — the only straddle test in
 * the production tree). Accessor-based so every vertex shape in the estate
 * ({x,z}, {x,y}, {e,n}, [x,y] tuples, mm-scaled ints) uses the SAME body
 * instead of a per-shape copy.
 *
 * Semantics: half-open even-odd; no divide guard (see the header — the
 * straddle test makes the divisor structurally nonzero); `< 3` vertices reads
 * false; winding- and closure-convention independent.
 */
export function pointInRingEvenOdd(
  px: number,
  py: number,
  vertexCount: number,
  xAt: RingOrdinateAt,
  yAt: RingOrdinateAt,
): boolean {
  if (vertexCount < 3) return false;
  let inside = false;
  for (let i = 0, j = vertexCount - 1; i < vertexCount; j = i++) {
    const xi = xAt(i), yi = yAt(i);
    const xj = xAt(j), yj = yAt(j);
    const crosses = (yi > py) !== (yj > py)
      && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/**
 * Point-in-polygon on the plan XZ plane — the model-space convention
 * (rooms, slabs, shells, footprints all speak `{x, z}` metres).
 */
export function pointInPolygonXZ(
  px: number,
  pz: number,
  ring: ReadonlyArray<Readonly<{ x: number; z: number }>>,
): boolean {
  return pointInRingEvenOdd(px, pz, ring.length, (i) => ring[i]!.x, (i) => ring[i]!.z);
}

/**
 * Point-in-polygon on an XY pair — projected/screen-space consumers (the
 * hidden-line classifier's `Vec2`) and the slab-polygon convention where the
 * `y` field carries the Z ordinate (`SlabData.polygon`).
 */
export function pointInPolygonXY(
  px: number,
  py: number,
  ring: ReadonlyArray<Readonly<{ x: number; y: number }>>,
): boolean {
  return pointInRingEvenOdd(px, py, ring.length, (i) => ring[i]!.x, (i) => ring[i]!.y);
}
