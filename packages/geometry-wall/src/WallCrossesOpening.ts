/**
 * WallCrossesOpening — §C83-S1, the wall-side mirror of `canPlace`.
 *
 * ── THE DEFECT THIS CLOSES (founder report, live build a75e8e1e) ──────────────
 * "also the wall can be placed in front of a door still: which it should not".
 *
 * `WallOccupancyStore.canPlace()` refuses an OPENING that overlaps another
 * OPENING on the same wall — the console proves it fires:
 *
 *   [WallOccupancyStore] CONFLICT: new=[3.590,4.516]m vs existing 254e1386…
 *   [3.005,3.931]m on wall wall_01M0027RDCJAMTZRY3CFWZC2T8
 *
 * But `canPlace(wall, offset, width)` takes ONE wall and compares against THAT
 * wall's own `openings[]`. A NEW WALL arriving at an existing wall that already
 * holds a door is not expressible in it, and every one of its ~12 production
 * call sites is on the opening side. Nothing anywhere asked the wall-side
 * question. This module asks it.
 *
 * ── THE CLASSIFICATION, AND WHY IT IS NOT A PREFERENCE ────────────────────────
 * C83 §1.1 — **IMPOSSIBLE**. A wall's solid says "material here"; an opening
 * says "void here". They are two mutually exclusive claims about one volume.
 * There is no site, no typology and no client brief under which it becomes
 * correct, so the rule may REFUSE rather than merely advise (C83 §1.2). Per
 * C83 §1.4 the refusal joins `CanPlaceRefusalCode` — it is the same question
 * asked from the other side, not a rival vocabulary — as
 * `OCC_CROSSES_HOSTED_OPENING`.
 *
 * ── THE GEOMETRY, STATED HONESTLY (a wall is not a line) ──────────────────────
 * The naive test is "does the new wall's CENTRELINE pass through the opening's
 * interval?". That is wrong in the direction that matters: a 0.3 m wall whose
 * centreline clears a door jamb by 0.1 m still drives 50 mm of solid through
 * the door. So the test clips the HOST's centreline segment against the
 * candidate's FOOTPRINT RECTANGLE (centreline swept ±thickness/2), yielding an
 * INTERVAL of host stations, never a point. That interval is then compared with
 * the host's occupied spans on exactly the convention `canPlace` already uses.
 *
 * Two deliberate CONSERVATISMS, named rather than hidden — both push toward
 * FEWER findings, which is the correct direction for a rule that refuses
 * (C83 §5, false positives are the primary risk):
 *
 *  1. The host's OWN half-thickness is not added to the interval. Including it
 *     would widen the station range by (hostThickness/2)·|cot θ| — exactly ZERO
 *     for the perpendicular case that dominates real plans, and a small
 *     widening for oblique ones. Narrower means a grazing oblique wall is not
 *     refused; that is the side to err on.
 *  2. A NEAR-PARALLEL relationship is never a violation. Two walls running
 *     along each other are not "crossing", the 1-D station model does not
 *     describe their interaction, and forcing it to would make the longest,
 *     loudest findings the least trustworthy ones. It is reported as
 *     UNDETERMINED when the bodies actually overlap, and silently ignored when
 *     they do not.
 *
 * ── TOLERANCES ARE CONSUMED, NEVER MINTED (C73 §2.2) ──────────────────────────
 * Every comparison below imports its role from `@pryzm/geometry-kernel`:
 *   • `isNumericallyZero` (EPSILON_ZERO, dimensionless) — degenerate-length and
 *     degenerate-divisor guards. The clip's denominators are dot products of
 *     UN-NORMALISED deltas, so the question is zero-of-arithmetic (C73 §2.4).
 *   • `isParallel` (PARALLEL_RAD) — applied to the cross product of two UNIT
 *     direction vectors, which is the role's declared input.
 *   • `COINCIDENT_M` — "do these two station intervals actually overlap?", the
 *     identical question and identical comparison direction `canPlace` already
 *     answers with it, so a wall touching an opening edge is NOT a violation
 *     for the same reason two openings may share a frame edge.
 * A raw literal here would immediately regress `check-epsilon-policy`, drained
 * to E2 258 / E5 99 the same day (`3a7e2c50`).
 *
 * PURE: no store, no window, no THREE, no DOM, no clock, no random. Every
 * input is a parameter. That is what lets the editor (L7), the command
 * registry (L2) and the consequence planner all call the SAME predicate
 * instead of each growing a copy — the drift C83 §8.0 forbids by name.
 *
 * @file packages/geometry-wall/src/WallCrossesOpening.ts
 */

import {
  COINCIDENT_M,
  arePointsCoincident2D,
  isNumericallyZero,
  isParallel,
} from '@pryzm/geometry-kernel';
import type { WallData } from './WallTypes';
import type { CanPlaceRefusalCode } from './WallOccupancyStore';
import { wallOccupancyStore } from './WallOccupancyStore';

// ─── Inputs ───────────────────────────────────────────────────────────────────

/** A point in the world XZ plane. `y` carries level elevation and is unused here. */
export interface PlanPoint {
  readonly x: number;
  readonly y?: number;
  readonly z: number;
}

/**
 * The wall AS IT WOULD BE — a proposed create, or a proposed new baseline for
 * an existing wall. Deliberately NOT `WallData`: a wall that does not exist yet
 * has no id, no mark and no openings, and demanding them would force every
 * caller to fabricate a record (the failure-as-fabrication defect).
 */
export interface CandidateWall {
  /** Present for a MOVE (so the wall does not test against itself); absent for a CREATE. */
  readonly id?: string;
  readonly levelId: string;
  readonly baseLine: readonly [PlanPoint, PlanPoint];
  /** Metres. A wall is not a line — this is what makes the crossing an interval. */
  readonly thickness: number;
  /**
   * §PRE-WELD-TRANSIENT — where this wall is NOW, supplied only for a MOVE.
   *
   * ⚠ ADDED after an executed corpus run refuted the rule a SECOND time, and the
   * second refutation was subtler than the first. A wall move commits in two
   * commands: `UpdateWallBaselineCommand` moves the dragged wall, and
   * `CascadeWallBaselineCommand` then RE-WELDS its joined neighbours. Validation
   * runs at `canExecute` on the FIRST — so the neighbours are still standing at
   * their OLD, about-to-be-corrected geometry.
   *
   * MEASURED (`hostedOpeningHostMoveSeam` §Z-5): moving `w-north` back from z=6
   * to z=4 was refused for crossing a door on `w-west` at station 2.0–2.9 —
   * because `w-west` was momentarily still 6 m long. After the cascade it is 4 m,
   * the door relocates to the corner, and the two walls are joined again. **The
   * state the refusal described never persists.** Refusing on it would make every
   * carry-neighbours move refusable whenever a door sits near the moving corner.
   *
   * Supplying this lets the rule exclude hosts that are JOINED to the subject at
   * its current pose, on the honest ground that this same gesture is about to
   * re-weld them and their geometry is therefore not yet judgeable. Absent (a
   * CREATE) nothing is excluded — a new wall welds nothing.
   */
  readonly currentBaseLine?: readonly [PlanPoint, PlanPoint];
  /** Present ⇒ curved. The station model is chord-based, so this is UNDETERMINED, never guessed. */
  readonly curve?: unknown;
}

// ─── Outputs ──────────────────────────────────────────────────────────────────

/** One proposed wall × one existing hosted opening, with BOTH intervals. */
export interface WallCrossingViolation {
  readonly hostWallId: string;
  readonly openingId: string;
  /** The door/window ELEMENT id — what the user selected when they placed it. */
  readonly openingElementId: string;
  readonly openingType: 'window' | 'door';
  /** `[start, end]` of the opening along the host centreline, metres. */
  readonly openingSpanM: readonly [number, number];
  /** `[start, end]` the candidate's FOOTPRINT occupies on the host centreline, metres. */
  readonly crossingSpanM: readonly [number, number];
  /** Length of the shared interval, metres. Carried so the sentence names it. */
  readonly overlapM: number;
}

/**
 * A question this rule could not answer. Per C83 §5.3 an unanswerable question
 * produces NO finding — never a clear pass, never a guess. It is reported so a
 * caller can declare the blind spot rather than inherit it as silence.
 */
export interface WallCrossingUndetermined {
  readonly hostWallId: string;
  readonly reason:
    | 'CURVED_CANDIDATE'
    | 'CURVED_HOST'
    | 'NEAR_PARALLEL_OVERLAP'
    | 'DEGENERATE_CANDIDATE';
  readonly detail: string;
}

/**
 * A concrete alternative position — C83 §4's "resolution offer". Never a guess:
 * every offer below has been re-run through the WHOLE predicate against every
 * wall on the level and came back clean (C83 §4.1: "an offer that would itself
 * violate a rule cannot be presented").
 */
export interface WallCrossingOffer {
  /** Signed metres along the HOST wall's direction. Negative ⇒ toward the host's start. */
  readonly shiftM: number;
  /** Unit shift direction in world XZ, so a caller applies it without re-deriving it. */
  readonly direction: { readonly x: number; readonly z: number };
  /** The candidate's baseLine after the shift — ready to dispatch. */
  readonly baseLine: readonly [PlanPoint, PlanPoint];
  /** Human wording, e.g. "0.62 m back along the host wall". */
  readonly label: string;
}

export interface WallPlacementVerdict {
  /** false ⇒ at least one violation. The command MUST NOT execute (C83 §1.1). */
  readonly valid: boolean;
  readonly code?: CanPlaceRefusalCode;
  readonly violations: readonly WallCrossingViolation[];
  readonly undetermined: readonly WallCrossingUndetermined[];
  /** Empty when no alternative can be DEFENDED — never a nearest-fit guess (C83 §4.2). */
  readonly offers: readonly WallCrossingOffer[];
  /** The user-facing sentence, carrying the code and BOTH intervals. Absent when valid. */
  readonly reason?: string;
}

// ─── Vector helpers (local, pure, no tuning constants) ────────────────────────

interface V2 {
  readonly x: number;
  readonly z: number;
}

const sub = (a: PlanPoint | V2, b: PlanPoint | V2): V2 => ({ x: a.x - b.x, z: a.z - b.z });
const dot = (a: V2, b: V2): number => a.x * b.x + a.z * b.z;
const cross2 = (a: V2, b: V2): number => a.x * b.z - a.z * b.x;
const len = (a: V2): number => Math.hypot(a.x, a.z);

// ─── The crossing interval ────────────────────────────────────────────────────

/**
 * Clip the host centreline segment `q → q2` against the candidate's footprint
 * rectangle, returning the station interval `[s0, s1]` in metres from the host's
 * start, or `null` when the segment misses the rectangle entirely.
 *
 * The rectangle is the intersection of four half-planes — two along the
 * candidate axis (0 ≤ t ≤ L) and two across it (|n| ≤ thickness/2) — so this is
 * an ordinary parametric clip. Choosing the clip over an
 * "intersect-then-widen-by-thickness/sin θ" formula is deliberate: the latter
 * divides by sin θ and detonates as the walls approach parallel, exactly where
 * a refusal is least trustworthy. The clip has no such divisor.
 */
function clipHostAgainstCandidateFootprint(
  q: PlanPoint,
  q2: PlanPoint,
  aStart: PlanPoint,
  axis: V2,
  axisLenM: number,
  normal: V2,
  halfThicknessM: number,
): readonly [number, number] | null {
  const d = sub(q2, q);
  const hostLenM = len(d);
  if (isNumericallyZero(hostLenM)) return null;

  const rel = sub(q, aStart);

  // Each half-plane as f(u) = f0 + u·fd ≤ 0.
  const alongAtQ = dot(rel, axis);
  const alongPerU = dot(d, axis);
  const acrossAtQ = dot(rel, normal);
  const acrossPerU = dot(d, normal);

  const planes: readonly (readonly [number, number])[] = [
    [-alongAtQ, -alongPerU], //   -(t)            ≤ 0   ⇒ t ≥ 0
    [alongAtQ - axisLenM, alongPerU], //  t - L    ≤ 0   ⇒ t ≤ L
    [acrossAtQ - halfThicknessM, acrossPerU], //  n - h ≤ 0
    [-acrossAtQ - halfThicknessM, -acrossPerU], // -n - h ≤ 0
  ];

  let u0 = 0;
  let u1 = 1;
  for (const [f0, fd] of planes) {
    if (isNumericallyZero(fd)) {
      // Parallel to this boundary: either wholly inside or wholly outside.
      // `> 0` (strict) so a segment lying exactly ON the boundary is treated as
      // inside — the COINCIDENT_M overlap test downstream is what decides
      // whether that grazing contact matters, and it must not be pre-empted here.
      if (f0 > 0) return null;
      continue;
    }
    const u = -f0 / fd;
    if (fd > 0) {
      if (u < u1) u1 = u;
    } else if (u > u0) {
      u0 = u;
    }
    if (u0 > u1) return null;
  }

  return [u0 * hostLenM, u1 * hostLenM];
}

// ─── The predicate ────────────────────────────────────────────────────────────

/**
 * Which existing hosted openings would the candidate wall drive through?
 *
 * Scoped to the candidate's OWN level: a wall on level 1 cannot occupy a door
 * on level 0, and comparing across levels would fabricate violations at every
 * storey of a stacked building. `walls` may contain any levels; the filter is
 * here so no caller has to remember it.
 *
 * Determined-empty IS an answer: "this wall crosses nothing that is occupied"
 * is a real, positive verdict, and it is returned as `violations: []` with an
 * empty `undetermined` — never confused with "could not check".
 */
export function findWallOpeningCrossings(
  candidate: CandidateWall,
  walls: readonly WallData[],
): {
  readonly violations: readonly WallCrossingViolation[];
  readonly undetermined: readonly WallCrossingUndetermined[];
} {
  const violations: WallCrossingViolation[] = [];
  const undetermined: WallCrossingUndetermined[] = [];

  const a = candidate.baseLine[0];
  const b = candidate.baseLine[1];
  const ab = sub(b, a);
  const axisLenM = len(ab);

  if (isNumericallyZero(axisLenM)) {
    return {
      violations: [],
      undetermined: [
        {
          hostWallId: candidate.id ?? '(new wall)',
          reason: 'DEGENERATE_CANDIDATE',
          detail:
            'the proposed wall has no length, so it has no footprint to test against any ' +
            'opening. Nothing is claimed about which openings it would or would not cross.',
        },
      ],
    };
  }

  // A curved candidate is NOT tested against a chord. C83 §8 Slice 4 lists curved
  // hosts as out of scope precisely because the resolver is chord-based; the same
  // reasoning binds the candidate side, and guessing here would produce a
  // confident refusal about geometry the model did not evaluate.
  if (candidate.curve !== undefined && candidate.curve !== null) {
    return {
      violations: [],
      undetermined: [
        {
          hostWallId: candidate.id ?? '(new wall)',
          reason: 'CURVED_CANDIDATE',
          detail:
            'the proposed wall is curved. This rule measures a straight footprint against ' +
            'straight host centrelines; an arc would have to be tessellated and each segment ' +
            'tested. Whether this wall crosses a door or window is NOT checked — not "checked ' +
            'and clear".',
        },
      ],
    };
  }

  const axis: V2 = { x: ab.x / axisLenM, z: ab.z / axisLenM };
  const normal: V2 = { x: -axis.z, z: axis.x };
  const halfThicknessM = Math.max(0, candidate.thickness) / 2;

  // Deterministic host order — the store's iteration order is not contractually
  // stable, and an unstable finding order would make the rendered sentence (and
  // any hash over it) differ between two evaluations of the same model.
  const hosts = walls
    .filter((w) => w.levelId === candidate.levelId && w.id !== candidate.id)
    .slice()
    .sort((x, y) => String(x.id).localeCompare(String(y.id)));

  for (const host of hosts) {
    const openings = wallOccupancyStore.getOccupiedSpans(host);
    // A host with no openings cannot be violated. Skipping it before any geometry
    // keeps the common case (most walls hold nothing) free.
    if (openings.length === 0) continue;

    const hb = host.baseLine;
    if (!hb || !hb[0] || !hb[1]) continue;

    // ── §CORNER-JOIN-IS-NOT-A-CROSSING — a JOINED wall is never a violation ───
    //
    // ⚠ ADDED 2026-08-14 after this rule fired on a known-good fixture. C83
    // §5.1(4) requires a new rule to be run over existing corpora and says a rule
    // that fires on known-good output is REFUTED by that run, not tuned until it
    // passes. This is that refutation, and the fix is to the MODEL, not to a
    // threshold.
    //
    // MEASURED (`hostedOpeningHostMoveSeam` §Z-5, a closed rectangular room with a
    // door hard against a corner): moving `w-north` was refused because *"the door
    // occupies 2.000–2.900 m and this wall would occupy 1.900–2.100 m, overlapping
    // by 0.100 m"*. That overlap is REAL but it is not a wall driven through a
    // door — it is the MITRE ZONE. Two walls meeting at a corner necessarily
    // overlap by a half-thickness there; that is what a corner IS, and resolving
    // it is `JunctionResolverV2`'s job, not this rule's. Without this guard every
    // one of a rectangular room's four corners is a standing violation waiting for
    // an opening to be placed near it, and moving ANY wall of that room would be
    // refused — the "cries wolf, gets muted" failure C83 §5 opens with.
    //
    // This also restores the behaviour C83 §8 Slice 4 specified in the first
    // place — *"a wall merely touching an endpoint → zero, since
    // `segmentsProperlyCross` is deliberately strict"* — which the footprint clip
    // had silently dropped in exchange for thickness-awareness. Both are now kept.
    //
    // NARROW BY CONSTRUCTION: it skips only when an ENDPOINT IS SHARED. A wall
    // whose end butts into the MIDDLE of a host (a T-junction into a door) shares
    // no endpoint, is still fully tested, and is still refused — which is the
    // founder's actual case and the one that must not be weakened.
    const touchesEndpoint = (p: PlanPoint): boolean =>
      arePointsCoincident2D(p.x, p.z, hb[0].x, hb[0].z) ||
      arePointsCoincident2D(p.x, p.z, hb[1].x, hb[1].z);

    if (touchesEndpoint(a) || touchesEndpoint(b)) continue;

    // §PRE-WELD-TRANSIENT — the same exclusion, asked of where the wall IS rather
    // than where it is going. A host joined to the subject at its CURRENT pose is
    // about to be re-welded by the cascade half of this very gesture, so its
    // present geometry is a transient the rule must not judge. See
    // `CandidateWall.currentBaseLine` for the measured case this closes.
    const cur = candidate.currentBaseLine;
    if (cur && (touchesEndpoint(cur[0]) || touchesEndpoint(cur[1]))) continue;

    const span = clipHostAgainstCandidateFootprint(
      hb[0],
      hb[1],
      a,
      axis,
      axisLenM,
      normal,
      halfThicknessM,
    );
    if (span === null) continue;

    // The host is curved: its opening offsets are ARC-length stations while the
    // clip above produced CHORD stations. Comparing the two would be measuring
    // in two different units and calling the difference a violation.
    if (host.curve !== undefined && host.curve !== null) {
      undetermined.push({
        hostWallId: host.id,
        reason: 'CURVED_HOST',
        detail:
          `wall ${host.id} is curved, so its opening offsets are arc-length stations while ` +
          'this test produces chord stations. The two are not comparable, so whether the new ' +
          'wall crosses an opening on it is NOT determined.',
      });
      continue;
    }

    const hd = sub(hb[1], hb[0]);
    const hostLenM = len(hd);
    if (isNumericallyZero(hostLenM)) continue;
    const hostAxis: V2 = { x: hd.x / hostLenM, z: hd.z / hostLenM };

    // Near-parallel: see the module header. The bodies may genuinely overlap, but
    // "crossing at a station" is the wrong description of that, so it is declared
    // rather than refused.
    if (isParallel(cross2(axis, hostAxis))) {
      undetermined.push({
        hostWallId: host.id,
        reason: 'NEAR_PARALLEL_OVERLAP',
        detail:
          `the new wall runs parallel to wall ${host.id} and their footprints overlap over ` +
          `${(span[1] - span[0]).toFixed(3)} m. A parallel overlap is not a crossing at a ` +
          'station, so this rule does not judge it — it is reported, not refused.',
      });
      continue;
    }

    const [c0, c1] = span;
    for (const o of openings) {
      // The SAME overlap convention `canPlace` uses, to the same tolerance role:
      // touching edges are not an overlap. A wall stopping exactly at a door jamb
      // is legal for the same reason two windows may share a frame edge.
      const overlaps = c0 < o.endM - COINCIDENT_M && c1 > o.offsetM + COINCIDENT_M;
      if (!overlaps) continue;

      const rawOpening = (host.openings ?? []).find((x) => x.id === o.openingId);
      violations.push({
        hostWallId: host.id,
        openingId: o.openingId,
        openingElementId: rawOpening?.elementId ?? o.openingId,
        openingType: o.type,
        openingSpanM: [o.offsetM, o.endM],
        crossingSpanM: [c0, c1],
        overlapM: Math.min(c1, o.endM) - Math.max(c0, o.offsetM),
      });
    }
  }

  return { violations, undetermined };
}

// ─── The offer ────────────────────────────────────────────────────────────────

/** Merge the occupied spans into the CLEAR intervals of `[0, hostLenM]`. */
function clearIntervals(
  occupied: readonly { readonly offsetM: number; readonly endM: number }[],
  hostLenM: number,
): readonly (readonly [number, number])[] {
  const sorted = occupied.slice().sort((p, q) => p.offsetM - q.offsetM);
  const out: [number, number][] = [];
  let cursor = 0;
  for (const s of sorted) {
    if (s.offsetM > cursor) out.push([cursor, s.offsetM]);
    cursor = Math.max(cursor, s.endM);
  }
  if (cursor < hostLenM) out.push([cursor, hostLenM]);
  return out;
}

/**
 * The founder asked for a way forward — *"do you want to move the wall upwards
 * or backwards?"* — not a wall of "no". This computes it, or computes nothing.
 *
 * ── WHAT MAKES AN OFFER DEFENSIBLE ────────────────────────────────────────────
 * Sliding the candidate ALONG the host's own direction by δ moves its crossing
 * station on that host by exactly δ and changes no angle. That is an exact
 * relation, not an approximation, which is the whole reason this particular
 * alternative can be offered at all.
 *
 * ── WHEN NOTHING IS OFFERED, AND WHY THAT IS THE FEATURE ──────────────────────
 * C83 §4.2's MUST NOT: *never offer a candidate you cannot defend.* An offer
 * carries an implicit claim that the alternative is valid, and a guessed offset
 * that lands on another opening spends the user's trust in one click. So this
 * returns `[]` — refuse with the reason, offer nothing — whenever:
 *
 *   • more than one host wall is violated (a shift along host A moves the
 *     station on host B by a different amount; no single δ is defensible);
 *   • anything came back UNDETERMINED (a shift validated against a model with a
 *     hole in it is not validated);
 *   • no clear interval on the host is wide enough to hold the crossing;
 *   • the shifted candidate fails the FULL predicate against EVERY wall on the
 *     level — including walls it did not previously touch, which a shift can
 *     newly reach.
 */
export function computeWallCrossingOffers(
  candidate: CandidateWall,
  walls: readonly WallData[],
  violations: readonly WallCrossingViolation[],
  undetermined: readonly WallCrossingUndetermined[],
): readonly WallCrossingOffer[] {
  if (violations.length === 0) return [];
  if (undetermined.length > 0) return [];

  const hostIds = new Set(violations.map((v) => v.hostWallId));
  if (hostIds.size !== 1) return [];

  const hostId = violations[0].hostWallId;
  const host = walls.find((w) => w.id === hostId);
  if (!host || !host.baseLine?.[0] || !host.baseLine?.[1]) return [];

  const hd = sub(host.baseLine[1], host.baseLine[0]);
  const hostLenM = len(hd);
  if (isNumericallyZero(hostLenM)) return [];
  const hostAxis: V2 = { x: hd.x / hostLenM, z: hd.z / hostLenM };

  // Every violation on this host shares one crossing interval (it is a property
  // of the candidate × host pair, not of the opening), so the first carries it.
  const [c0, c1] = violations[0].crossingSpanM;
  const widthM = c1 - c0;

  const gaps = clearIntervals(wallOccupancyStore.getOccupiedSpans(host), hostLenM);

  // Feasible shifts: δ such that [c0+δ, c1+δ] sits inside a gap with a
  // COINCIDENT_M margin at both ends, so the result is clear of the jambs by
  // more than the tolerance that decides overlap — an offer that lands exactly
  // ON the tolerance is an offer that may or may not be refused next frame.
  const feasible: number[] = [];
  for (const [g0, g1] of gaps) {
    const lo = g0 + COINCIDENT_M - c0;
    const hi = g1 - COINCIDENT_M - c1;
    if (hi < lo) continue; // gap too narrow for this crossing
    if (g1 - g0 < widthM + 2 * COINCIDENT_M) continue;
    // The δ in [lo, hi] closest to zero — the smallest move that works.
    feasible.push(lo > 0 ? lo : hi < 0 ? hi : 0);
  }

  const back = feasible.filter((d) => d < 0).sort((p, q) => q - p)[0];
  const along = feasible.filter((d) => d > 0).sort((p, q) => p - q)[0];

  const out: WallCrossingOffer[] = [];
  for (const delta of [back, along]) {
    if (delta === undefined) continue;
    const shifted: CandidateWall = {
      ...candidate,
      baseLine: [
        {
          ...candidate.baseLine[0],
          x: candidate.baseLine[0].x + hostAxis.x * delta,
          z: candidate.baseLine[0].z + hostAxis.z * delta,
        },
        {
          ...candidate.baseLine[1],
          x: candidate.baseLine[1].x + hostAxis.x * delta,
          z: candidate.baseLine[1].z + hostAxis.z * delta,
        },
      ],
    };
    // Re-run the WHOLE predicate. An offer is a claim of validity, and the only
    // honest basis for that claim is the same test that refused the original.
    const check = findWallOpeningCrossings(shifted, walls);
    if (check.violations.length > 0 || check.undetermined.length > 0) continue;

    out.push({
      shiftM: delta,
      direction: delta < 0 ? { x: -hostAxis.x, z: -hostAxis.z } : { x: hostAxis.x, z: hostAxis.z },
      baseLine: shifted.baseLine,
      label:
        `${Math.abs(delta).toFixed(2)} m ` +
        (delta < 0 ? 'back along the host wall' : 'further along the host wall'),
    });
  }
  return out;
}

// ─── The rendered refusal ─────────────────────────────────────────────────────

/**
 * THE sentence a person reads. It NAMES the opening, carries BOTH intervals,
 * and — per C83 §4 — states the way forward when one exists.
 *
 * Built here, once, at the producer, for the reason `blockingItems` states for
 * the plan surface: *"a second formatter over the same quantities is a second
 * source of truth for a number the user will act on."* The plan card, the 3D
 * status overlay and the legacy command's `blockingIssues` all render THIS
 * string, so the three surfaces cannot drift into three different accounts of
 * one refusal.
 *
 * The code is carried INTO the text, exactly as `canPlaceRefusalText` does, so
 * the refusal stays attributable to its rule even where the sink takes only a
 * string.
 */
export function wallCrossesOpeningRefusalText(
  violations: readonly WallCrossingViolation[],
  offers: readonly WallCrossingOffer[] = [],
): string {
  if (violations.length === 0) return '';
  const code: CanPlaceRefusalCode = 'OCC_CROSSES_HOSTED_OPENING';

  const parts = violations.map((v) => {
    const [o0, o1] = v.openingSpanM;
    const [c0, c1] = v.crossingSpanM;
    return (
      `the ${v.openingType} ${v.openingElementId} on wall ${v.hostWallId} — that ` +
      `${v.openingType} occupies ${o0.toFixed(3)}–${o1.toFixed(3)} m along the wall and this ` +
      `wall would occupy ${c0.toFixed(3)}–${c1.toFixed(3)} m, overlapping by ` +
      `${v.overlapM.toFixed(3)} m`
    );
  });

  const head =
    violations.length === 1
      ? `this wall cannot be placed here: it would pass straight through ${parts[0]}.`
      : `this wall cannot be placed here: it would pass straight through ${violations.length} ` +
        `existing openings — ${parts.join('; ')}.`;

  const why =
    ' A wall and a door or window opening cannot occupy the same volume — the wall says ' +
    'solid, the opening says void, and the model cannot hold both.';

  // C83 §4.2 — the honest "I cannot offer one". Saying nothing here would read as
  // "there is no way to fix this", which is a different and false claim.
  const way =
    offers.length > 0
      ? ` Move it ${offers.map((o) => o.label).join(', or ')} — either position is clear.`
      : ' No clear position on that wall could be computed for it, so none is offered; ' +
        'move or resize it yourself, or move the opening first.';

  return `[${code}] ${head}${why}${way}`;
}

// ─── The one entry point every caller uses ────────────────────────────────────

/**
 * THE wall-side placement gate: predicate + offer + sentence, in one call.
 *
 * Callers (the plan tool, the 3D tool, the legacy `CreateWallCommand`, the
 * consequence planner) use THIS rather than assembling the three themselves —
 * assembling it four times is how four surfaces come to disagree about one
 * refusal, which is the defect C83 §4.1 spends a section on.
 *
 * UNDETERMINED never refuses (C83 §5.3). A candidate this rule could not judge
 * comes back `valid: true` with `undetermined` populated, so a caller that
 * wants to declare the blind spot can, and a caller that only gates on `valid`
 * lets the wall through rather than refusing on a question nobody answered.
 */
export function evaluateWallPlacement(
  candidate: CandidateWall,
  walls: readonly WallData[],
): WallPlacementVerdict {
  const { violations, undetermined } = findWallOpeningCrossings(candidate, walls);
  if (violations.length === 0) {
    return { valid: true, violations: [], undetermined, offers: [] };
  }
  const offers = computeWallCrossingOffers(candidate, walls, violations, undetermined);
  return {
    valid: false,
    code: 'OCC_CROSSES_HOSTED_OPENING',
    violations,
    undetermined,
    offers,
    reason: wallCrossesOpeningRefusalText(violations, offers),
  };
}
