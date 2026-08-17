/**
 * §L-926 — WELD AUTHORSHIP, MEASURED IN BOTH DIRECTIONS AT ONCE.
 *
 * WHY THIS FILE EXISTS AND WHY IT HOLDS BOTH CASES
 * ─────────────────────────────────────────────────────────────────────────────
 * `19ddf6bb` ("the re-weld stops moving the incumbent") shipped GREEN. It was
 * green because the suite it had to satisfy contained a CORNER-case assertion
 * and NO STEM-case assertion. Removing every partner entry therefore looked
 * like a clean fix, while it silently deleted the one direction of partner
 * adjustment that is MANDATORY: a T-stem following the host it terminates on.
 * The founder measured the consequence on the deployed build within the hour —
 * interior stems left 773 mm off their host, `§DIAG-ROOM-LOOP BREAK` ×3,
 * rooms 6 → 4, and `§OPENED-REGION` offering to CREATE a wall across the gap.
 *
 * So the two directions are pinned SIDE BY SIDE, in one file, deliberately:
 *   • §MEASURED-STEM-ORPHANED — the dependent that must follow and does not.
 *   • §L-922-CONTROL          — the incumbent that must NOT be dragged.
 * They can never again be traded off against one another by a change that only
 * looks at one of them, because one file fails whichever way you break it.
 *
 * ⚠ TWO MECHANISMS LIVE HERE AND THEY MUST NOT BE CONFLATED
 * ─────────────────────────────────────────────────────────────────────────────
 *   STEM authorship   — WHOSE ENDPOINT ABUTS WHOSE BODY (`classifyWeldAuthorship`),
 *                       decided from a band derived from the HOST'S THICKNESS.
 *                       Gates the DEPENDENT follow. Degree plays no part in it.
 *   CORNER authorship — HOW MANY WALLS MEET AT THE POINT (`isMutualCorner`),
 *                       decided from the stored `junctionDegree`, or MEASURED
 *                       when none is stored. Gates the MUTUAL-CORNER follow.
 *                       Thickness plays no part in it.
 * They are orthogonal, and §DISCRIMINATOR below asserts that orthogonality in
 * all four combinations. A change that makes one of them read the other's input
 * is the defect this comment exists to catch.
 *
 * ── THE ASSERTION HISTORY. READ IT BEFORE FLIPPING ANYTHING BACK ─────────────
 * These expectations have now flipped THREE times, and every flip was a founder
 * report on a deployed build. Anyone tempted to flip them a fourth time owes
 * the next reader the same paragraph.
 *
 *   ORIGINAL          the corner neighbour LENGTHENS to meet the mover.
 *   2026-08-15 §10.2.2  REVERSED IT: the incumbent is byte-identical, and a
 *                     corner that cannot be closed without lengthening it is
 *                     REFUSED (`INCUMBENT_EXTENSION_REQUIRED`). Cause: L-922 —
 *                     moving an INTERIOR wall dragged a PERIMETER baseline
 *                     2.19 m and re-seated three hosted doors by one delta, one
 *                     clamped from 0.541 to 0.000.
 *   2026-08-17 §10.6  RE-REVERSED IT for MUTUAL corners. Cause: the founder's
 *                     *"EVERYTHING WORKS — ONLY WHEN THE WALL SURPASSES THE
 *                     VERTEX IT CORRUPTS"*. Moving INWARDS lands the new corner
 *                     ON the neighbour's segment and needs nothing; moving
 *                     OUTWARDS lands it PAST the neighbour's end, which needs
 *                     the neighbour to LENGTHEN — exactly what §10.2.2 refused.
 *   2026-08-17 §10.6.3  KEYED IT ON DEGREE, not on the junction-type letter, and
 *                     MEASURES the degree when no record is stored.
 *
 * §10.2.2 WAS RIGHT ABOUT L-922 AND OVER-BROAD ABOUT DEGREE 2. L-922's bite was
 * a `T` at degree 3 — a third wall's authority was at stake. Nothing in the
 * engine could tell that apart from a 2-wall corner until the degree
 * discriminator was threaded, so the rule was written to the worst case and
 * caught the innocent case with it. The discriminator is now threaded; the two
 * cases are separated BY MEASUREMENT, and both are pinned below.
 *
 * ⭐ THE PROOF THAT §10.2.2 WAS NARROWED AND NOT DELETED: the two golden
 * `JSON.stringify` strings minted at `8b8be0e4` are still in this file, still
 * byte-for-byte, asserted against the SAME geometry — with a third wall present
 * so the junction is genuinely degree 3 (§DEGREE-3-GOLDEN). Only the DEGREE
 * changed, and the pre-§10.6 bytes come back exactly. If a future change makes
 * a degree-3 corner move, those two strings fail.
 *
 * THE CONTROLS ARE GOLDEN STRINGS, NOT FIELD ASSERTIONS. `JSON.stringify` of
 * the whole plan is pinned verbatim. A field-by-field control can be satisfied
 * by a plan that also grew a field; a byte string cannot. C83 §10.4 asks for
 * "byte-identical", so the control asserts exactly that word. The DEGREE-2 arms
 * additionally DERIVE their coordinates analytically (the arithmetic is written
 * out at each one) so that a golden string can never be re-baselined from an
 * implementation's output without someone contradicting the arithmetic next to
 * it.
 *
 * @file packages/geometry-wall/__tests__/L926StemFollowAuthorship.measure.test.ts
 */

import { describe, it, expect } from 'vitest';
import { COINCIDENT_M } from '@pryzm/geometry-kernel';
import {
  computeMoveReweldPlan,
  type ReweldBaseline,
} from '../src/WallMoveReweld';

const bl = (s: [number, number], e: [number, number]): ReweldBaseline =>
  [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }];

/** Perpendicular distance from a point to the INFINITE line through a,b. */
const distToLine = (
  p: { x: number; z: number },
  a: { x: number; z: number },
  b: { x: number; z: number },
): number => {
  const dx = b.x - a.x, dz = b.z - a.z;
  const L = Math.hypot(dx, dz) || 1;
  return Math.abs((p.x - a.x) * (-dz / L) + (p.z - a.z) * (dx / L));
};

const gap = (
  p: { x: number; z: number }, q: { x: number; z: number },
): number => Math.hypot(p.x - q.x, p.z - q.z);

const lengthOf = (b: ReweldBaseline): number => gap(b[0], b[1]);

/**
 * §10.6.2 condition 4's second half, as a number: the wall's own unit direction.
 * A PIVOT about a shared corner leaves this untouched; a translation or a
 * rotation does not. Asserted separately from the far endpoint because those
 * are two different halves of condition 4 and a bug can break either alone.
 */
const unitDir = (b: ReweldBaseline): { x: number; z: number } => {
  const dx = b[1].x - b[0].x, dz = b[1].z - b[0].z;
  const L = Math.hypot(dx, dz) || 1;
  return { x: dx / L, z: dz / L };
};

/** Every wall in both founder fixtures is the same 0.20 m family. */
const T = 0.2;

// ─────────────────────────────────────────────────────────────────────────────
// §MEASURED-STEM-ORPHANED — the direction `19ddf6bb` deleted
// ─────────────────────────────────────────────────────────────────────────────

describe('§MEASURED-STEM-ORPHANED — a T-stem follows the host it terminates on', () => {
  /**
   * FOUNDER FIXTURE 1 — the 773 mm case, reproduced to the millimetre.
   *
   * A perimeter run along z=0 (part of the rectangle) with an interior wall
   * welded to its BODY at mid-span, seated on the host's CENTRELINE. The user
   * moves the perimeter run 0.773 m perpendicular (outward). The stem's foot is
   * a DEPENDENT: its endpoint terminates on the host's body, 4 m from either of
   * the host's own endpoints, so no reading of the geometry makes it a corner
   * incumbent. It must follow. It does not.
   */
  const hostA = {
    id: 'H-perimeter',
    prevBaseLine: bl([0, 0], [8, 0]),
    newBaseLine: bl([0, -0.773], [8, -0.773]),
    thickness: T,
  };
  const stemA = { id: 'S-interior', baseLine: bl([4, 0], [4, 5]) };

  it('773 mm class: the stem FOLLOWS its host — orphan distance 773 mm -> 0 mm', () => {
    const plan = computeMoveReweldPlan(hostA, [stemA]);

    // BEFORE (`8b8be0e4`, measured on the deployed build): no entry for the
    // stem, and a refusal reading INCUMBENT_EXTENSION_REQUIRED / beyondMm 773 —
    // a wall that TERMINATES ON THE HOST'S BODY classified as a corner
    // incumbent. That misclassification WAS the defect, and the refusal's own
    // number was the founder's 773 mm, arriving by exactly his geometry.
    // AFTER: the authorship branch reads the abutment as a dependent.
    expect(plan.refusals).toEqual([]);

    const eS = plan.entries.find(e => e.wallId === 'S-interior')!;
    expect(eS).toBeTruthy();
    // The MECHANISM, named: the host's thickness put the foot on the BODY.
    expect(eS.role).toBe('dependent-stem');

    // The foot is ON the host's new centreline: it was seated on the centreline
    // (offset 0), so it comes back to the centreline. 773 mm -> 0 mm.
    const orphanAfterM = distToLine(
      eS.newBaseLine[0], hostA.newBaseLine[0], hostA.newBaseLine[1],
    );
    expect(orphanAfterM).toBeCloseTo(0, 9);
    const orphanBeforeM = distToLine(
      stemA.baseLine[0], hostA.newBaseLine[0], hostA.newBaseLine[1],
    );
    expect(orphanBeforeM).toBeCloseTo(0.773, 9); // the number the founder read

    // AXIAL, and only axial: the far endpoint and the direction are untouched.
    expect(eS.newBaseLine[1]).toEqual({ x: 4, y: 0, z: 5 });
    expect(eS.newBaseLine[0].x).toBeCloseTo(4, 9);     // no lateral slide
    expect(eS.newBaseLine[0].z).toBeCloseTo(-0.773, 9);
    // prevBaseLine is the stem AS IT STOOD — the undo datum, unrounded.
    expect(eS.prevBaseLine).toEqual([{ x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 5 }]);
  });

  it('773 mm class: the host itself is NOT re-baselined — a stem never shortens its host (§L-872)', () => {
    const plan = computeMoveReweldPlan(hostA, [stemA]);
    expect(plan.entries.find(e => e.wallId === 'H-perimeter')).toBeUndefined();
    expect(plan.entries).toHaveLength(1); // the stem, and nothing else
  });

  /**
   * ── RE-SCOPED 2026-08-17 (§C83 §10.6.3). OUTCOME (b): THE SUBJECT SURVIVES,
   *    THE VERDICT INVERTS, AND WHAT IS AT STAKE IS NOW SMALLER AND NAMED. ──
   *
   * WAS: *"with NO host thickness the engine refuses to guess authorship and
   * stays at 19ddf6bb"* — asserting `entries === []` plus
   * `INCUMBENT_EXTENSION_REQUIRED / 773`.
   *
   * The half that is STILL TRUE and is still the subject of this test: with no
   * thickness there is no declared band, so STEM authorship is UNANSWERABLE and
   * the engine does not guess it. The partner falls through to the corner path
   * exactly as it did at `19ddf6bb`, and its entry says `mutual-corner`, NOT
   * `dependent-stem` — the engine never claims to have identified a stem it
   * could not measure.
   *
   * The half that INVERTED: the corner path itself no longer refuses at
   * degree 2. So "no thickness" no longer costs the whole follow. What it costs
   * now is exactly one thing, and this test measures it: THE SEAT DEPTH. A
   * face-seated stem is seated on the host's CENTRELINE instead of its FACE,
   * because the face is a thickness fact and the thickness was not supplied.
   * That is a 100 mm error on a 200 mm wall, not an orphaned wall — the missing
   * input is still paid for, and still in the conservative direction, but the
   * price is now bounded by t/2 rather than by the whole gesture.
   */
  it('773 mm class: with NO host thickness authorship is UNANSWERABLE — the partner still follows, as a degree-2 MUTUAL CORNER, never as a claimed stem', () => {
    // C73 §2.2 — the band is derived from the host's thickness and never minted
    // at the call site. Absent that input the STEM question cannot be asked.
    const { thickness: _omitted, ...hostNoThickness } = hostA;
    const plan = computeMoveReweldPlan(hostNoThickness, [stemA]);

    expect(plan.refusals).toEqual([]);
    expect(plan.entries).toHaveLength(1); // the partner; the host is untouched
    const eS = plan.entries[0]!;
    expect(eS.wallId).toBe('S-interior');
    // ⭐ THE ENGINE DOES NOT CLAIM A STEM IT COULD NOT MEASURE.
    expect(eS.role).toBe('mutual-corner');

    // DERIVED, not read back. The partner's own infinite line runs through
    // (4,0) and (4,5)  ⇒  x = 4.
    // The mover's NEW infinite line runs through (0,-0.773) and (8,-0.773)
    //                                            ⇒  z = -0.773.
    // Intersection: (4, -0.773).
    expect(eS.newBaseLine[0].x).toBeCloseTo(4, 9);
    expect(eS.newBaseLine[0].z).toBeCloseTo(-0.773, 9);
    // §10.6.2 condition 4: FAR endpoint byte-identical, direction unchanged.
    expect(eS.newBaseLine[1]).toEqual({ x: 4, y: 0, z: 5 });
    expect(unitDir(eS.newBaseLine)).toEqual(unitDir(stemA.baseLine));

    // This fixture is CENTRELINE-seated (offset 0), so centreline seating and
    // face seating coincide and the two paths agree to the last bit.
    const withThickness = computeMoveReweldPlan(hostA, [stemA]).entries[0]!;
    expect(eS.newBaseLine[0]).toEqual(withThickness.newBaseLine[0]);
    expect(withThickness.role).toBe('dependent-stem'); // …but NOT on the mechanism
  });

  /**
   * FOUNDER FIXTURE 2 — the second reproduction: the 0.20 m × 2.80 m wall
   * family with a 2.27 m gap, all-T interior connections, where Room 00-005
   * (50.6 m²) merged into its neighbour and §OPENED-REGION offered to create a
   * wall along the gap.
   *
   * This stem is seated on the host's FACE (z = +0.10 = +t/2), not its
   * centreline — which is how the founder's interior walls are actually built,
   * and which is why the fix must PRESERVE the seating depth rather than pick a
   * universal answer. Both seatings are measured here so the fix cannot satisfy
   * one by breaking the other.
   */
  const hostB = {
    id: 'H-perimeter-2',
    prevBaseLine: bl([0, 0], [6, 0]),
    newBaseLine: bl([0, -2.27], [6, -2.27]),
    thickness: T,
  };
  const stemB = { id: 'S-interior-2', baseLine: bl([3, 0.1], [3, 2.9]) }; // 2.80 m long

  it('2.27 m gap class: a FACE-seated stem comes back to the FACE, not to the centreline', () => {
    const plan = computeMoveReweldPlan(hostB, [stemB]);
    expect(plan.refusals).toEqual([]);
    const eS = plan.entries.find(e => e.wallId === 'S-interior-2')!;
    expect(eS).toBeTruthy();

    // BEFORE (`8b8be0e4`): no entry; refusal INCUMBENT_EXTENSION_REQUIRED with
    // beyondMm 2370 = the 2.27 m host move PLUS the 0.10 m the stem already
    // stood off the host's centreline. That 2370 is the tell: the engine was
    // measuring to the CENTRELINE while the founder was looking at the FACE.
    //
    // AFTER: the seating depth is measured off the PRE-move geometry (+0.10 m =
    // +t/2, i.e. the face) and reproduced against the POST-move centreline. So
    // the stem's own displacement is the host's own 2.27 m — NOT 2.37 m, which
    // is what centreline-seating would silently have added.
    expect(distToLine(eS.newBaseLine[0], hostB.newBaseLine[0], hostB.newBaseLine[1]))
      .toBeCloseTo(T / 2, 9);
    expect(gap(eS.newBaseLine[0], stemB.baseLine[0])).toBeCloseTo(2.27, 9);
    expect(eS.newBaseLine[0].z).toBeCloseTo(-2.17, 9);
  });

  /**
   * ── ADDED 2026-08-17 alongside the §10.6.3 re-scope. ─────────────────────
   * The paragraph above is the WHOLE remaining cost of a missing thickness, so
   * it is measured rather than asserted in prose. Same fixture, same gesture;
   * the only input removed is the host's thickness.
   */
  it('2.27 m gap class: WITHOUT the host thickness the same FACE-seated stem is seated on the CENTRELINE — the 100 mm a missing input now costs, in full', () => {
    const { thickness: _omitted, ...hostBNoThickness } = hostB;
    const plan = computeMoveReweldPlan(hostBNoThickness, [stemB]);
    expect(plan.refusals).toEqual([]);
    const eS = plan.entries.find(e => e.wallId === 'S-interior-2')!;
    expect(eS.role).toBe('mutual-corner'); // corner path: no band, no stem claim

    // DERIVED. Partner's own line through (3,0.1),(3,2.9) ⇒ x = 3.
    // Mover's NEW line through (0,-2.27),(6,-2.27)        ⇒ z = -2.27.
    // Intersection (3, -2.27) — the CENTRELINE, 0.10 m past the near FACE at
    // z = -2.27 + 0.10 = -2.17 where the with-thickness path seats it.
    expect(eS.newBaseLine[0].x).toBeCloseTo(3, 9);
    expect(eS.newBaseLine[0].z).toBeCloseTo(-2.27, 9);
    expect(distToLine(eS.newBaseLine[0], hostB.newBaseLine[0], hostB.newBaseLine[1]))
      .toBeCloseTo(0, 9);                                 // ON the centreline
    expect(gap(eS.newBaseLine[0], stemB.baseLine[0])).toBeCloseTo(2.37, 9);
    // …i.e. exactly t/2 further than the thickness-aware answer, and no more.
    const seated = computeMoveReweldPlan(hostB, [stemB])
      .entries.find(e => e.wallId === 'S-interior-2')!;
    expect(gap(eS.newBaseLine[0], seated.newBaseLine[0])).toBeCloseTo(T / 2, 9);
    // Condition 4 still holds on the degraded path.
    expect(eS.newBaseLine[1]).toEqual({ x: 3, y: 0, z: 2.9 });
    expect(unitDir(eS.newBaseLine)).toEqual(unitDir(stemB.baseLine));
  });

  it('2.27 m gap class: the stem EXTENDS 2.80 m -> 5.07 m, far endpoint fixed', () => {
    const plan = computeMoveReweldPlan(hostB, [stemB]);
    const eS = plan.entries.find(e => e.wallId === 'S-interior-2')!;

    const lengthBeforeM = lengthOf(stemB.baseLine);
    const lengthAfterM = lengthOf(eS.newBaseLine);
    expect(lengthBeforeM).toBeCloseTo(2.8, 9);
    // *"in this case it is NOT NECESSARY [to create a wall] — the interior walls
    // should simply EXTEND."* 2.80 + 2.27 = 5.07 m.
    expect(lengthAfterM).toBeCloseTo(5.07, 9);
    expect(lengthAfterM - lengthBeforeM).toBeCloseTo(2.27, 9);
    // The far endpoint never moves, in either state.
    expect(eS.newBaseLine[1]).toEqual({ x: 3, y: 0, z: 2.9 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §L-926-NAMED-REFUSALS — the two ways a follow must NOT be completed
// ─────────────────────────────────────────────────────────────────────────────

describe('§L-926-NAMED-REFUSALS — a follow that would wreck the stem refuses BY NAME', () => {
    // Raised at L-925's request. It verified that the MOVED wall's own seat path
    // cannot emit a reversing baseline (index-preserving writes + nearest-endpoint
    // routing + a 0.15 m floor) but noted there is no NAMED refusal to catch a
    // future change that breaks the invariant — a structural protection nobody
    // can see fail is one nobody notices losing. The DEPENDENT path is new code
    // and gets both refusals named, reachable, and asserted here.

    it('STEM_REVERSAL: a seat past the stem\'s far end refuses instead of flipping the wall', () => {
        // Stem (5,0.1)→(5,0.5); the host rises to z=0.6, so the seat at its own
        // depth lands at z=0.7 — 0.2 m PAST the far endpoint. Completing it would
        // hand back a wall pointing the other way.
        const host = {
            id: 'H', prevBaseLine: bl([0, 0], [10, 0]), newBaseLine: bl([0, 0.6], [10, 0.6]),
            thickness: T,
        };
        const stem = { id: 'S', baseLine: bl([5, 0.1], [5, 0.5]) };
        const plan = computeMoveReweldPlan(host, [stem]);
        expect(plan.entries).toEqual([]);
        expect(plan.refusals).toHaveLength(1);
        expect(plan.refusals[0]!.reason).toBe('STEM_REVERSAL');
        expect(plan.refusals[0]!.beyondMm).toBe(200); // how far past the far end
        expect(plan.refusals[0]!.limitMm).toBe(0);
    });

    it('STEM_COLLAPSE: a seat that shortens the stem below the buildable floor refuses', () => {
        // Same stem; the host rises to z=0.3, so the seat lands at z=0.4 and the
        // stem would come out 100 mm long — under DEGENERATE_STUB_LENGTH (150 mm),
        // which is the multi-cluster black-spike hole. Never manufacture a stub.
        const host = {
            id: 'H', prevBaseLine: bl([0, 0], [10, 0]), newBaseLine: bl([0, 0.3], [10, 0.3]),
            thickness: T,
        };
        const stem = { id: 'S', baseLine: bl([5, 0.1], [5, 0.5]) };
        const plan = computeMoveReweldPlan(host, [stem]);
        expect(plan.entries).toEqual([]);
        expect(plan.refusals).toHaveLength(1);
        expect(plan.refusals[0]!.reason).toBe('STEM_COLLAPSE');
        expect(plan.refusals[0]!.beyondMm).toBe(100);  // the length it would be
        expect(plan.refusals[0]!.limitMm).toBe(150);   // the floor it must clear
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §L-922-CONTROL — the corner axis, now keyed on DEGREE (C83 §10.6.3)
// ─────────────────────────────────────────────────────────────────────────────

describe('§L-922-CONTROL — a DEGREE-≥3 incumbent is byte-identical; a DEGREE-2 co-owner PIVOTS', () => {
  /**
   * The production shape of L-922: an interior wall B moves and A — a perimeter
   * carrying three hosted doors — shares a corner with it. A's endpoint sits AT
   * B's endpoint.
   *
   * ⚠ WHAT MAKES A THE INCUMBENT IS **NOT** THAT GEOMETRY. It is that a THIRD
   * wall also meets there, so A's endpoint is not A-and-B's to move. In L-922
   * that third wall existed (the junction was a `T`, degree 3) and the fixture
   * below did not model it — which is why, for two days, this file proved a
   * degree-3 rule with a degree-2 picture. The fixture is now split:
   *
   *   §DEGREE-3-GOLDEN  a third wall meets at the corner ⇒ A is an INCUMBENT ⇒
   *                     both original golden strings hold, byte for byte.
   *   §DEGREE-2         only A and B meet there ⇒ they CO-OWN the corner ⇒ A
   *                     pivots its welded end onto the analytic intersection,
   *                     far end fixed, direction unchanged.
   */
  const movedB = { id: 'B', prevBaseLine: bl([5, 0], [5, 5]), newBaseLine: bl([6, 0], [6, 5]) };

  /**
   * The third participant. A wall continuing straight DOWN from the corner
   * (5,0) — the commonest real degree-3 shape there is: a partition tee-ing
   * into a run. Its only job here is to be countable: it is collinear with B's
   * new line, so `intersectLines` refuses it as near-parallel and it proposes
   * nothing of its own. What it changes is the COUNT at (5,0), from 2 to 3.
   */
  const thirdC = { id: 'C', baseLine: bl([5, 0], [5, -4]) };

  // ── §DEGREE-3-GOLDEN — the pre-§10.6 bytes, unchanged, on both goldens ─────

  it('§DEGREE-3-GOLDEN / STORED: corner PAST the incumbent\'s end, junctionDegree 3 ⇒ refusal, nothing proposed (§C83-10.2.2 verbatim)', () => {
    const partnerA = { id: 'A', baseLine: bl([0, 0], [5, 0]), junctionDegree: 3 };
    // ⭐ THIS STRING IS THE ONE MINTED AT `8b8be0e4`, UNEDITED. beyondMm 1000 is
    // the corner (6,0) falling 1.000 m past A's own end at (5,0).
    expect(JSON.stringify(computeMoveReweldPlan(movedB, [partnerA]))).toBe(
      '{"entries":[],"refusals":[{"partnerId":"A","reason":"INCUMBENT_EXTENSION_REQUIRED","beyondMm":1000}]}',
    );
  });

  it('§DEGREE-3-GOLDEN / MEASURED: the same corner with a real third wall present ⇒ the same bytes, with no stored record at all', () => {
    // No `junctionDegree` anywhere: the degree is COUNTED at the pre-move welded
    // point (5,0), where B, A and C all have an endpoint ⇒ 3.
    const partnerA = { id: 'A', baseLine: bl([0, 0], [5, 0]) };
    expect(JSON.stringify(computeMoveReweldPlan(movedB, [partnerA, thirdC]))).toBe(
      '{"entries":[],"refusals":[{"partnerId":"A","reason":"INCUMBENT_EXTENSION_REQUIRED","beyondMm":1000}]}',
    );
  });

  it('§DEGREE-3-GOLDEN: corner ON the incumbent\'s body, degree 3 ⇒ the SUBJECT adapts, alone (§C83-10.1 verbatim)', () => {
    const diagB = { id: 'B', prevBaseLine: bl([5, 0], [5, 5]), newBaseLine: bl([6, 0.5], [6, 5.5]) };
    const longA = { id: 'A', baseLine: bl([5, 0], [10, 0]), junctionDegree: 3 };
    // ⭐ ALSO THE ORIGINAL STRING, UNEDITED: one entry, for the SUBJECT B only.
    expect(JSON.stringify(computeMoveReweldPlan(diagB, [longA]))).toBe(
      '{"entries":[{"wallId":"B","newBaseLine":[{"x":6,"y":0,"z":0},{"x":6,"y":0,"z":5.5}],'
      + '"prevBaseLine":[{"x":6,"y":0,"z":0.5},{"x":6,"y":0,"z":5.5}]}],"refusals":[]}',
    );
  });

  // ── §DEGREE-2 — the founder's *"when the wall surpasses the vertex"* ───────

  /**
   * OUTCOME (b), INVERTED. This test asserted §10.2.2 by name and by number:
   * `entries: []` + `INCUMBENT_EXTENSION_REQUIRED / 1000`. Those exact bytes now
   * live one describe-block up, under the degree-3 fixture they were always
   * about. What is asserted here is the OTHER half of the discriminator.
   *
   * This is the OUTWARD leg of the founder's report — *"if the wall moves beyond
   * the connected wall's second point then neither the slab nor the walls
   * connect"*. The corner lands PAST A's end, so closing it LENGTHENS A, which
   * is precisely what the refusal above forbids and precisely what a co-owner
   * of the corner must do.
   */
  it('§DEGREE-2: corner PAST the partner\'s end ⇒ the partner LENGTHENS onto the analytic corner (5 m -> 6 m), far end fixed', () => {
    const partnerA = { id: 'A', baseLine: bl([0, 0], [5, 0]) };
    const plan = computeMoveReweldPlan(movedB, [partnerA]);

    expect(plan.refusals).toEqual([]);
    expect(plan.entries).toHaveLength(1); // A; B's end is already AT the corner
    const eA = plan.entries[0]!;
    expect(eA.wallId).toBe('A');
    expect(eA.role).toBe('mutual-corner');

    // ── THE ARITHMETIC, DERIVED FROM THE FIXTURE'S OWN COORDINATES ──────────
    // A's own infinite line runs through (0,0) and (5,0)        ⇒  z = 0.
    // B's NEW infinite line runs through (6,0) and (6,5)        ⇒  x = 6.
    // Their intersection is therefore exactly (6, 0), which is 1.000 m beyond
    // A's own end at (5,0) — the same 1000 mm the degree-3 arm REFUSES.
    expect(eA.newBaseLine[1]).toEqual({ x: 6, y: 0, z: 0 });

    // §10.6.2 condition 4 — a PIVOT, not a translation:
    expect(eA.newBaseLine[0]).toEqual(partnerA.baseLine[0]);  // FAR end, byte-identical
    expect(unitDir(eA.newBaseLine)).toEqual(unitDir(partnerA.baseLine)); // direction
    expect(lengthOf(partnerA.baseLine)).toBeCloseTo(5, 9);
    expect(lengthOf(eA.newBaseLine)).toBeCloseTo(6, 9);       // it LENGTHENED

    // ⭐ AND THE CORNER IS ACTUALLY CLOSED — the assertion this family kept
    // omitting. Both walls' welded ends are the same model point.
    expect(gap(eA.newBaseLine[1], movedB.newBaseLine[0])).toBeLessThanOrEqual(COINCIDENT_M);

    // Byte pin, derived above and only then written down.
    expect(JSON.stringify(plan)).toBe(
      '{"entries":[{"wallId":"A","newBaseLine":[{"x":0,"y":0,"z":0},{"x":6,"y":0,"z":0}],'
      + '"prevBaseLine":[{"x":0,"y":0,"z":0},{"x":5,"y":0,"z":0}],"role":"mutual-corner"}],'
      + '"refusals":[]}',
    );
  });

  /**
   * OUTCOME (b), INVERTED. Was *"corner ON the incumbent's body ⇒ the SUBJECT
   * adapts, ALONE"*. At degree 2 nobody is alone: the corner is co-owned, so
   * both walls meet at it.
   *
   * ⚠ THIS IS THE RETURN LEG, AND IT IS WHY THE MUTUAL BLOCK SITS BEFORE THE
   * `beyond` TEST RATHER THAN INSIDE IT. Drag out (previous test) and the corner
   * lands PAST A's end — A lengthens. Drag back (here) and it lands ON A's body
   * — if that took the incumbent-preserving path, A would keep the metre it
   * gained and leave a stub poking past the corner (`§Z-5`, measured). A gesture
   * that does not undo itself is not a gesture, so the follow is symmetric:
   * SHORTENING is asserted here with the same force as lengthening above.
   */
  it('§DEGREE-2: corner ON the partner\'s body ⇒ the partner SHORTENS to the same corner (5 m -> 4 m) — the follow is symmetric', () => {
    const diagB = { id: 'B', prevBaseLine: bl([5, 0], [5, 5]), newBaseLine: bl([6, 0.5], [6, 5.5]) };
    const longA = { id: 'A', baseLine: bl([5, 0], [10, 0]) };
    const plan = computeMoveReweldPlan(diagB, [longA]);

    expect(plan.refusals).toEqual([]);
    expect(plan.entries).toHaveLength(2); // the co-owner AND the subject
    const eA = plan.entries.find(e => e.wallId === 'A')!;
    const eB = plan.entries.find(e => e.wallId === 'B')!;
    expect(eA.role).toBe('mutual-corner');
    expect(eB.role).toBeUndefined(); // the subject's own seat carries no role

    // ── THE ARITHMETIC ─────────────────────────────────────────────────────
    // A's own infinite line runs through (5,0) and (10,0)   ⇒  z = 0.
    // B's NEW infinite line runs through (6,0.5) and (6,5.5) ⇒  x = 6.
    // Intersection (6, 0). It lies ON A's existing segment (5 ≤ 6 ≤ 10), so
    // reaching it SHORTENS A by 1.000 m. B's own start (6,0.5) is 0.500 m from
    // it along B, so B LENGTHENS by that much to meet it.
    expect(eA.newBaseLine[0]).toEqual({ x: 6, y: 0, z: 0 });
    expect(eB.newBaseLine[0]).toEqual({ x: 6, y: 0, z: 0 });

    // §10.6.2 condition 4, on the co-owner:
    expect(eA.newBaseLine[1]).toEqual(longA.baseLine[1]);      // FAR end fixed
    expect(unitDir(eA.newBaseLine)).toEqual(unitDir(longA.baseLine));
    expect(lengthOf(longA.baseLine)).toBeCloseTo(5, 9);
    expect(lengthOf(eA.newBaseLine)).toBeCloseTo(4, 9);        // it SHORTENED
    // …and on the subject:
    expect(eB.newBaseLine[1]).toEqual(diagB.newBaseLine[1]);
    expect(lengthOf(eB.newBaseLine)).toBeCloseTo(5.5, 9);

    // THE CORNER IS CLOSED — both ends land on the same model point.
    expect(gap(eA.newBaseLine[0], eB.newBaseLine[0])).toBeLessThanOrEqual(COINCIDENT_M);

    // Byte pin.
    expect(JSON.stringify(plan)).toBe(
      '{"entries":['
      + '{"wallId":"A","newBaseLine":[{"x":6,"y":0,"z":0},{"x":10,"y":0,"z":0}],'
      + '"prevBaseLine":[{"x":5,"y":0,"z":0},{"x":10,"y":0,"z":0}],"role":"mutual-corner"},'
      + '{"wallId":"B","newBaseLine":[{"x":6,"y":0,"z":0},{"x":6,"y":0,"z":5.5}],'
      + '"prevBaseLine":[{"x":6,"y":0,"z":0.5},{"x":6,"y":0,"z":5.5}]}'
      + '],"refusals":[]}',
    );
  });

  /**
   * §DISCRIMINATOR — OUTCOME (b), WIDENED.
   *
   * Was: *"the discriminator is WHOSE ENDPOINT ABUTS WHOSE BODY — opposite
   * geometry, opposite verdict"*, asserted as follow-vs-refuse. Post-§10.6.3
   * that single sentence names only ONE of the two discriminators, and reading
   * the verdict off it alone is what would let the two mechanisms be conflated.
   * There are two, they are orthogonal, and all four combinations are asserted:
   *
   *                       │ endpoint on the host's BODY │ endpoint at its END
   *   ────────────────────┼─────────────────────────────┼────────────────────
   *   degree 2            │ FOLLOW as dependent-stem    │ FOLLOW as mutual-corner
   *   degree 3            │ FOLLOW as dependent-stem    │ REFUSE (incumbent)
   *
   * The load-bearing cell is the bottom-left one: STEM FOLLOW IS NOT DEGREE-
   * KEYED. Two partitions tee-ing into the same host at the same point are both
   * that host's dependents and both must follow it; making the L-922 degree
   * guard apply to stems would re-open the 773 mm orphan through the back door.
   */
  it('§DISCRIMINATOR: authorship picks the MECHANISM (stem vs corner); degree gates the CORNER follow ONLY', () => {
    // Corner partner: A's welded endpoint (5,0) sits ON B's prev endpoint (5,0).
    const partnerA = { id: 'A', baseLine: bl([0, 0], [5, 0]) };
    const cornerAxialM = Math.hypot(5 - 5, 0 - 0);
    expect(cornerAxialM).toBe(0); // AT the endpoint ⇒ corner authorship

    // Stem partner: S's welded endpoint (4,0) sits 4 m along H's BODY, 4 m from
    // either end ⇒ stem authorship. Two configurations four orders of magnitude
    // apart in this one measure.
    const stemAxialM = 4;
    expect(stemAxialM).toBeGreaterThan(cornerAxialM + T); // one host thickness clear

    const stemHost = {
      id: 'H', prevBaseLine: bl([0, 0], [8, 0]), newBaseLine: bl([0, -0.773], [8, -0.773]),
      thickness: T,
    };
    const stemS = { id: 'S', baseLine: bl([4, 0], [4, 5]) };
    /** A SECOND stem into the same host at the same foot ⇒ degree 3 there. */
    const stemS2 = { id: 'S2', baseLine: bl([4, 0], [4, -3]) };

    // ── ROW 1: degree 2 ────────────────────────────────────────────────────
    const corner2 = computeMoveReweldPlan({ ...movedB, thickness: T }, [partnerA]);
    expect(corner2.refusals).toEqual([]);
    expect(corner2.entries.find(e => e.wallId === 'A')!.role).toBe('mutual-corner');

    const stem2 = computeMoveReweldPlan(stemHost, [stemS]);
    expect(stem2.refusals).toEqual([]);
    expect(stem2.entries.find(e => e.wallId === 'S')!.role).toBe('dependent-stem');

    // ── ROW 2: degree 3 — and ONLY the corner cell changes ──────────────────
    const corner3 = computeMoveReweldPlan({ ...movedB, thickness: T }, [partnerA, thirdC]);
    expect(corner3.entries.find(e => e.wallId === 'A')).toBeUndefined(); // NOT dragged
    expect(corner3.refusals[0]!.partnerId).toBe('A');
    expect(corner3.refusals[0]!.reason).toBe('INCUMBENT_EXTENSION_REQUIRED');

    const stem3 = computeMoveReweldPlan(stemHost, [stemS, stemS2]);
    expect(stem3.refusals).toEqual([]);
    // ⭐ BOTH dependents follow. Degree does not gate this mechanism.
    expect(stem3.entries.find(e => e.wallId === 'S')!.role).toBe('dependent-stem');
    expect(stem3.entries.find(e => e.wallId === 'S2')!.role).toBe('dependent-stem');
    // Same host, same seat line z = -0.773; each keeps its own far endpoint.
    expect(stem3.entries.find(e => e.wallId === 'S')!.newBaseLine[0].z).toBeCloseTo(-0.773, 9);
    expect(stem3.entries.find(e => e.wallId === 'S2')!.newBaseLine[0].z).toBeCloseTo(-0.773, 9);
    expect(stem3.entries.find(e => e.wallId === 'S')!.newBaseLine[1]).toEqual({ x: 4, y: 0, z: 5 });
    expect(stem3.entries.find(e => e.wallId === 'S2')!.newBaseLine[1]).toEqual({ x: 4, y: 0, z: -3 });
  });

  it('the AMBIGUOUS BAND between them refuses with BOTH numbers rather than guessing (C83 §10.3)', () => {
    // The stem's foot sits 0.15 m from the host's end: past the corner band
    // (t/2 = 0.10 m) but inside the stem band (t = 0.20 m). A corner and a stem
    // are the same picture there and they follow in OPPOSITE directions, so the
    // one thing that must not happen is a choice.
    const host = {
      id: 'H', prevBaseLine: bl([0, 0], [8, 0]), newBaseLine: bl([0, -0.5], [8, -0.5]),
      thickness: T,
    };
    const near = { id: 'N', baseLine: bl([7.85, 0], [7.85, 3]) };
    const plan = computeMoveReweldPlan(host, [near]);
    expect(plan.entries).toEqual([]);
    expect(plan.refusals).toHaveLength(1);
    expect(plan.refusals[0]!.reason).toBe('AMBIGUOUS_WELD_AUTHORSHIP');
    expect(plan.refusals[0]!.beyondMm).toBe(150);  // measured from the host's end
    expect(plan.refusals[0]!.limitMm).toBe(201);   // the band it had to clear

    // ⚠ NOTE, so §10.6.3 is not misread: the ambiguity is decided BEFORE any
    // degree question and outranks it. This junction is degree 2, and it still
    // refuses — a co-owner whose MECHANISM is unknown is not followed either.
  });

  /**
   * OUTCOME (b), INVERTED — but the SUBJECT is untouched and must stay that way.
   *
   * L-919's scar: a camera-derived tolerance used in model space, so the same
   * two walls classified differently at two zoom levels. What this test proves
   * is that the CLASSIFICATION BANDS move with the WALL and not with the CAMERA.
   * That is unchanged by §10.6.3 and is asserted exactly as before. What changed
   * is only the observable used to READ the classification: a corner verdict at
   * degree 2 now shows up as a `mutual-corner` entry instead of a refusal, so
   * the test reads the role rather than the refusal reason.
   */
  it('the band edges are derived from the HOST\'s thickness, not from the camera-aware snap radius', () => {
    const near = { id: 'N', baseLine: bl([7.85, 0], [7.85, 3]) };
    const thinHost = {
      id: 'H', prevBaseLine: bl([0, 0], [8, 0]), newBaseLine: bl([0, -0.5], [8, -0.5]),
      thickness: T,
    };
    // Same abutment at 0.15 m, same weldTol, but a THICKER host: 0.40 m moves
    // the stem band to 0.401 m and the corner band to 0.201 m, so 0.15 m is now
    // inside the corner band and reads as a CORNER. Nothing about the camera
    // changed; the wall did.
    const thickHost = { ...thinHost, thickness: 0.4 };

    // ── THE ONE INPUT THAT MOVES THE VERDICT IS THE WALL'S OWN THICKNESS ────
    expect(computeMoveReweldPlan(thinHost, [near]).refusals[0]!.reason)
      .toBe('AMBIGUOUS_WELD_AUTHORSHIP');                       // 0.20 m host
    const thick = computeMoveReweldPlan(thickHost, [near]);      // 0.40 m host
    expect(thick.refusals).toEqual([]);
    const eN = thick.entries.find(e => e.wallId === 'N')!;
    expect(eN.role).toBe('mutual-corner');   // ⇐ classified CORNER by thickness

    // DERIVED. N's own line through (7.85,0),(7.85,3) ⇒ x = 7.85.
    // H's NEW line through (0,-0.5),(8,-0.5)          ⇒ z = -0.5.
    // Intersection (7.85, -0.5).
    expect(eN.newBaseLine[0]).toEqual({ x: 7.85, y: 0, z: -0.5 });
    expect(eN.newBaseLine[1]).toEqual({ x: 7.85, y: 0, z: 3 }); // FAR end fixed
    expect(unitDir(eN.newBaseLine)).toEqual(unitDir(near.baseLine));
    // The subject trims its own end 0.15 m back to the same point, so the corner
    // closes rather than crossing.
    const eH = thick.entries.find(e => e.wallId === 'H')!;
    expect(eH.newBaseLine[1]).toEqual({ x: 7.85, y: 0, z: -0.5 });
    expect(gap(eH.newBaseLine[1], eN.newBaseLine[0])).toBeLessThanOrEqual(COINCIDENT_M);

    // ── AND THE SNAP RADIUS GENUINELY DOES NOT MOVE THE BAND: double it ─────
    const wideThick = computeMoveReweldPlan(thickHost, [near], { weldTol: 1.0 });
    expect(wideThick.refusals).toEqual([]);
    expect(wideThick.entries.find(e => e.wallId === 'N')!.role).toBe('mutual-corner');
    expect(wideThick.entries.find(e => e.wallId === 'N')!.newBaseLine[0])
      .toEqual({ x: 7.85, y: 0, z: -0.5 });     // identical point at 2× the tol
    const wideThin = computeMoveReweldPlan(thinHost, [near], { weldTol: 1.0 });
    expect(wideThin.refusals[0]!.reason).toBe('AMBIGUOUS_WELD_AUTHORSHIP');
    expect(wideThin.refusals[0]!.limitMm).toBe(201); // the band, in mm, unmoved
    const wideStem = computeMoveReweldPlan(
      { id: 'H', prevBaseLine: bl([0, 0], [8, 0]), newBaseLine: bl([0, -0.773], [8, -0.773]), thickness: T },
      [{ id: 'S', baseLine: bl([4, 0], [4, 5]) }],
      { weldTol: 1.0 },
    );
    expect(wideStem.entries.find(e => e.wallId === 'S')!.role).toBe('dependent-stem');

    // ⚠ SCOPE, STATED SO IT IS NOT OVER-READ. This asserts camera-independence
    // of the AUTHORSHIP BANDS only. `measureJunctionDegree` — the §10.6.3
    // fallback used when no `junctionDegree` is stored — counts participants
    // within `weldTol`, and `weldTol` IS the camera-aware radius. That is not
    // L-919 reopening: "how many walls meet here" has no thickness-derived
    // answer, only a proximity one, and it is the SAME radius that already
    // decides "was this welded here at all" one step earlier, so a wall the
    // engine declines to count is a wall it also declines to re-weld. It is
    // nonetheless the one camera-aware input left in a follow decision, and it
    // is deliberately NOT pinned green here — see the lane report.
  });
});
