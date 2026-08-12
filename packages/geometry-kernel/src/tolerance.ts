/**
 * §C73-EPSILON-POLICY — THE declared tolerance policy (C73 §2.1–§2.5).
 *
 * This module is the ONE place a general-purpose geometric tolerance is
 * declared. Before it existed, `check-epsilon-policy` measured 271 rival
 * declarations (file × NAME) outside the kernel, across ~50 distinct numeric
 * values spanning three orders of magnitude — every one of them a private
 * definition of "the same place". The kernel, the layer that OWNS geometry,
 * exported none, so every consumer formed its own. This file ends that: new
 * or modified geometric predicates CONSUME these constants (C73 §2.2); they
 * do not invent a literal at the call site.
 *
 * ── How the values were chosen — canonicalised, not invented ────────────────
 * Grounded in the measured value histogram of C73 §0.1 (first, hand-recorded
 * cut: `1e-6×49, 0.05×24, 0.001×21, 1e-9×18, …`), as re-derived by
 * `npx tsx tools/ga-gate/check-epsilon-policy.ts` (2026-08-12 reading:
 * `1e-6×45, 0.05×20, 0.001×18, 1e-9×15, …` — per §0.1's amendment the gate is
 * the authority for the NUMBER, §0.1 for the ORDERING, and both agree on both
 * orderings used here). Where two live conventions
 * genuinely conflict for the same role, the TIGHTER one is canon — C73 §2.5 /
 * gate arm E4 permit a declared tolerance to SHRINK but never widen, so
 * starting tight is the only choice that does not fight the ratchet later.
 * The looser rival is recorded below as a named migration hazard.
 *
 * ── Migration hazards — the looser live conventions, on the record ──────────
 *   • NUMERIC-ZERO: `1e-6` (×45, the modal value repo-wide — e.g. the tgl/
 *     apartment-layout `EPS` family and `approxEq`'s default in
 *     `math/scalar.ts`) is 1000× LOOSER than the `1e-9` canonised here.
 *     A site migrating from a 1e-6 zero-guard onto `EPSILON_ZERO` TIGHTENS its
 *     predicate: values in (1e-9, 1e-6] stop reading as zero. That is usually
 *     the intended direction (fewer false "degenerate" verdicts), but each
 *     migration must look at its own site — per C73 §3.5, one family per PR,
 *     never a mass sweep.
 *   • COINCIDENCE: `0.05` m (×20 — e.g. adjacency/snap bands) is 50× LOOSER
 *     than the `0.001` m canonised here. Most 0.05 m sites are DOMAIN BANDS
 *     (snap radii, adjacency search) rather than identity tests, and per
 *     C73 §2.1 domain bands stay under their own domain owner — do NOT fold
 *     them onto `COINCIDENT_M`; only true "same point" tests migrate.
 *
 * ── What stays OUT of this module (C73 §2.1) ─────────────────────────────────
 * Domain bands are not epsilons: `defaultJunctionBandM` (0.20 m wall-junction
 * band, geometry-wall) and `CENTROID_MATCH_RADIUS` (2.0 m room-identity
 * radius, room-topology) are correct where they are, under their own owners.
 *
 * ── The ratchet (E4) ─────────────────────────────────────────────────────────
 * These values may only SHRINK or stay. Widening one changes what "the same
 * place" means for every consumer, invisibly at the site that widens it —
 * a widening must be an explicit, argued change to this module, never a quiet
 * edit to make a test or artefact pass (C73 §2.5, §7.d).
 *
 * PURE: no THREE, no DOM, no I/O — same rules as the rest of the kernel.
 *
 * @file packages/geometry-kernel/src/tolerance.ts
 */

/**
 * NUMERIC-ZERO epsilon — **dimensionless**.
 *
 * "Equal" at this tolerance means: a raw floating-point magnitude is
 * indistinguishable from zero for the purpose of a degenerate-case guard —
 * a near-zero edge length before a divide, a determinant before a line–line
 * intersection, a normalisation denominator. It carries NO unit: it guards
 * arithmetic, not model-space distance (a model-space "same point" question
 * uses `COINCIDENT_M` instead).
 *
 * Consumed by: degenerate-divide guards in geometric predicates — first
 * consumer is `pure/polygonOffset.ts` (zero-length edge rejection). Per
 * C73 §2.4, a degenerate-divide guard comes from HERE or the predicate
 * refuses; `|| 1e-12`-style per-call-site guards are the defect this ends.
 *
 * Value: canon is the TIGHTER of the two live numeric-zero conventions
 * (`1e-9` ×15 vs `1e-6` ×45 in the measured histogram — the kernel's own
 * guard code already predominantly uses 1e-9). See the module header for the
 * 1e-6 migration hazard.
 */
export const EPSILON_ZERO = 1e-9;

/**
 * MODEL-SPACE COINCIDENCE tolerance — **metres**.
 *
 * "Equal" at this tolerance means: two model-space points closer than 1 mm
 * are THE SAME POINT — endpoint welding, vertex identity, "does this segment
 * end where that one starts". 1 mm is far below anything constructible in a
 * building model, and it is the modal metre-valued identity tolerance in the
 * measured histogram (`0.001` ×18).
 *
 * Consumed by: point/vertex identity predicates (weld, dedupe-as-identity,
 * endpoint matching). NOT for snap radii or adjacency search bands — those
 * are domain constants with their own owners (see module header). The looser
 * live 0.05 m convention is recorded above as a migration hazard.
 */
export const COINCIDENT_M = 0.001;

/**
 * PARALLELISM / COLLINEARITY tolerance — **radians** (for the small angles
 * this guards, sin θ ≈ θ, so it is applied interchangeably to an angle, to
 * the magnitude of a 2D cross product of unit vectors, or to a unit-vector
 * dot-with-perpendicular — all three read the same number at this scale).
 *
 * "Equal" at this tolerance means: two directions less than 1e-9 rad apart
 * are THE SAME DIRECTION — no unique miter/intersection point exists between
 * their supporting lines, and a predicate must take its collinear branch
 * rather than divide by a vanishing determinant.
 *
 * Consumed by: parallel/collinear branch selection in line-intersection
 * predicates (miter resolution, offset corner construction). The kernel's
 * live convention for this role is already 1e-9
 * (`producers/_internal/resolveMiters.ts`, `buildMiterPrism.ts`,
 * `projectCapVertex.ts`); this canonises it.
 */
export const PARALLEL_RAD = 1e-9;

// ─── Comparison helpers — the three roles, applied ───────────────────────────
//
// Plain functions, no classes (C79 consumes this module as "plain constants +
// small comparison helpers"). Each helper is the ONE way to ask its question so
// that the comparison DIRECTION is fixed here, once: all three use strict `<`,
// matching the first live consumer (`pure/polygonOffset.ts`'s
// `Math.abs(x) < EPSILON_ZERO` zero-length-edge rejection). A magnitude exactly
// AT the tolerance is NOT "the same" — the tolerance is the first
// distinguishable difference, not the last indistinguishable one. Sites that
// need `<=` are asking a different (domain-band) question and should not be on
// these helpers.

/**
 * Is `x` numerically zero — i.e. unsafe as a divisor / degenerate as a length?
 * Dimensionless (`EPSILON_ZERO`). Per C73 §2.4, THIS is where a
 * degenerate-divide guard comes from; `|| 1e-12`-style per-site guards are the
 * defect it replaces.
 */
export function isNumericallyZero(x: number): boolean {
  return Math.abs(x) < EPSILON_ZERO;
}

/**
 * Is a model-space separation of `distanceM` metres "the same point"
 * (`COINCIDENT_M`)? `distanceM` may be signed; the magnitude is compared.
 */
export function isCoincidentDistanceM(distanceM: number): boolean {
  return Math.abs(distanceM) < COINCIDENT_M;
}

/**
 * Are two model-space 2D points the same point (`COINCIDENT_M`, metres)?
 * Compared on squared distance — no sqrt, no intermediate rounding.
 * Axis names are deliberately neutral (`a`/`b` in plan coordinates); callers
 * in x/z plan space pass (x, z).
 */
export function arePointsCoincident2D(
  ax: number, ay: number, bx: number, by: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy < COINCIDENT_M * COINCIDENT_M;
}

/**
 * Are two directions the same direction (`PARALLEL_RAD`)? Accepts the small
 * quantity interchangeably as an angle in radians, the magnitude of a 2D cross
 * product of UNIT vectors, or a unit-vector dot-with-perpendicular — at this
 * scale (sin θ ≈ θ) all three read the same number. Callers passing a cross
 * product of NON-unit vectors must normalise first; this helper cannot tell.
 */
export function isParallel(angleOrUnitCrossMag: number): boolean {
  return Math.abs(angleOrUnitCrossMag) < PARALLEL_RAD;
}
