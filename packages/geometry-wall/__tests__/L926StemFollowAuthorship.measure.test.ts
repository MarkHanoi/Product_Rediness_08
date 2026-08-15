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
 * THE CONTROLS ARE GOLDEN STRINGS, NOT FIELD ASSERTIONS. `JSON.stringify` of
 * the whole plan is pinned verbatim. A field-by-field control can be satisfied
 * by a plan that also grew a field; a byte string cannot. C83 §10.4 asks for
 * "byte-identical", so the control asserts exactly that word.
 *
 * STATE AT THIS COMMIT: this file is committed ALONE, BEFORE the fix, and it
 * PASSES — every number below is today's measured, deployed, broken behaviour.
 * The fix commit flips ONLY the §MEASURED-STEM-ORPHANED expectations; the two
 * golden strings must survive it untouched, and that survival is the proof that
 * the L-922 fix was not reverted to buy the stem back.
 *
 * @file packages/geometry-wall/__tests__/L926StemFollowAuthorship.measure.test.ts
 */

import { describe, it, expect } from 'vitest';
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

/** Every wall in both founder fixtures is the same 0.20 m family. */
const T = 0.2;

// ─────────────────────────────────────────────────────────────────────────────
// §MEASURED-STEM-ORPHANED — the direction `19ddf6bb` deleted
// ─────────────────────────────────────────────────────────────────────────────

describe('§MEASURED-STEM-ORPHANED — a T-stem does not follow the host it terminates on', () => {
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
  };
  const stemA = { id: 'S-interior', baseLine: bl([4, 0], [4, 5]) };

  it('773 mm class: the stem is left EXACTLY the host displacement behind, and the engine calls it an incumbent', () => {
    const plan = computeMoveReweldPlan(hostA, [stemA]);

    // TODAY (broken): nothing is proposed for the stem at all.
    expect(plan.entries.find(e => e.wallId === 'S-interior')).toBeUndefined();

    // …and the reason given is INCUMBENT_EXTENSION_REQUIRED — the engine has
    // classified a wall that TERMINATES ON THE HOST'S BODY as a corner
    // incumbent. That misclassification IS the defect; the refusal's own
    // number is the founder's 773 mm, arriving here by exactly his geometry.
    expect(plan.refusals).toHaveLength(1);
    expect(plan.refusals[0]!.partnerId).toBe('S-interior');
    expect(plan.refusals[0]!.reason).toBe('INCUMBENT_EXTENSION_REQUIRED');
    expect(plan.refusals[0]!.beyondMm).toBe(773);

    // AFTER THE FIX this becomes 0 mm: the stem's foot is re-seated on the
    // host's new body along the stem's own line.
    const stemFoot = { x: stemA.baseLine[0].x, z: stemA.baseLine[0].z };
    const orphanM = distToLine(stemFoot, hostA.newBaseLine[0], hostA.newBaseLine[1]);
    expect(orphanM).toBeCloseTo(0.773, 9);
  });

  it('773 mm class: the host is not shortened either — the gesture produces NO plan at all', () => {
    const plan = computeMoveReweldPlan(hostA, [stemA]);
    expect(JSON.stringify(plan.entries)).toBe('[]');
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
  };
  const stemB = { id: 'S-interior-2', baseLine: bl([3, 0.1], [3, 2.9]) }; // 2.80 m long

  it('2.27 m gap class: a FACE-seated stem is orphaned by the full move plus its seating depth', () => {
    const plan = computeMoveReweldPlan(hostB, [stemB]);

    expect(plan.entries.find(e => e.wallId === 'S-interior-2')).toBeUndefined();
    expect(plan.refusals).toHaveLength(1);
    expect(plan.refusals[0]!.reason).toBe('INCUMBENT_EXTENSION_REQUIRED');
    // 2370 mm = the 2.27 m host move + the 0.10 m the stem already stood off
    // the host's centreline. The engine measures to the CENTRELINE; the founder
    // sees the gap to the FACE (2.27 m). Both numbers are recorded so the fix
    // can be judged against the right one: the stem was seated on the FACE and
    // must come back to the FACE, i.e. its own displacement is 2.27 m, not 2.37.
    expect(plan.refusals[0]!.beyondMm).toBe(2370);

    const foot = { x: stemB.baseLine[0].x, z: stemB.baseLine[0].z };
    expect(distToLine(foot, hostB.newBaseLine[0], hostB.newBaseLine[1])).toBeCloseTo(2.37, 9);
    // The seating depth that must be preserved: half the host's thickness.
    expect(distToLine(
      { x: stemB.baseLine[0].x, z: stemB.baseLine[0].z },
      hostB.prevBaseLine[0], hostB.prevBaseLine[1],
    )).toBeCloseTo(T / 2, 9);
  });

  it('2.27 m gap class: the stem keeps its ORIGINAL length — nothing extended, which is the founder\'s complaint verbatim', () => {
    const plan = computeMoveReweldPlan(hostB, [stemB]);
    expect(plan.entries).toEqual([]);
    const lengthM = Math.hypot(
      stemB.baseLine[1].x - stemB.baseLine[0].x,
      stemB.baseLine[1].z - stemB.baseLine[0].z,
    );
    expect(lengthM).toBeCloseTo(2.8, 9);
    // AFTER THE FIX: 2.80 + 2.27 = 5.07 m — *"the interior walls should simply
    // EXTEND"*. The far endpoint (3, 2.9) never moves, in either state.
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §L-922-CONTROL — the direction `19ddf6bb` got RIGHT, pinned as bytes
// ─────────────────────────────────────────────────────────────────────────────

describe('§L-922-CONTROL — the incumbent at a CORNER is byte-identical, before and after', () => {
  /**
   * The production shape of L-922: an interior wall B moves and A — a perimeter
   * carrying three hosted doors — shares a CORNER with it. A's endpoint sits AT
   * B's endpoint, so A is the INCUMBENT and its baseline datum is not ours to
   * move. Dragging it shifted three doors by one delta and clamped one to
   * offset 0.000.
   *
   * These two strings are the lane's tripwire. If a stem-follow implementation
   * changes either byte, it has reached the corner path, and the corner path is
   * where the doors live.
   */
  const movedB = { id: 'B', prevBaseLine: bl([5, 0], [5, 5]), newBaseLine: bl([6, 0], [6, 5]) };

  it('§C83-10.2.2 GOLDEN: corner PAST the incumbent\'s end ⇒ refusal, nothing proposed', () => {
    const partnerA = { id: 'A', baseLine: bl([0, 0], [5, 0]) };
    expect(JSON.stringify(computeMoveReweldPlan(movedB, [partnerA]))).toBe(
      '{"entries":[],"refusals":[{"partnerId":"A","reason":"INCUMBENT_EXTENSION_REQUIRED","beyondMm":1000}]}',
    );
  });

  it('§C83-10.1 GOLDEN: corner ON the incumbent\'s body ⇒ the SUBJECT adapts, alone', () => {
    const diagB = { id: 'B', prevBaseLine: bl([5, 0], [5, 5]), newBaseLine: bl([6, 0.5], [6, 5.5]) };
    const longA = { id: 'A', baseLine: bl([5, 0], [10, 0]) };
    expect(JSON.stringify(computeMoveReweldPlan(diagB, [longA]))).toBe(
      '{"entries":[{"wallId":"B","newBaseLine":[{"x":6,"y":0,"z":0},{"x":6,"y":0,"z":5.5}],'
      + '"prevBaseLine":[{"x":6,"y":0,"z":0.5},{"x":6,"y":0,"z":5.5}]}],"refusals":[]}',
    );
  });

  it('the discriminator is WHOSE ENDPOINT ABUTS WHOSE BODY — measured, and today unmeasured', () => {
    // Corner partner: A's welded endpoint (5,0) sits ON B's prev endpoint (5,0).
    const partnerA = { id: 'A', baseLine: bl([0, 0], [5, 0]) };
    const cornerAxialM = Math.hypot(5 - 5, 0 - 0);
    expect(cornerAxialM).toBe(0); // AT the endpoint ⇒ incumbent

    // Stem partner: S's welded endpoint (4,0) sits 4 m along H's BODY, 4 m from
    // either end ⇒ dependent. Two configurations three orders of magnitude
    // apart in this one measure, and today's engine gives both the same verdict.
    const stemAxialM = 4;
    expect(stemAxialM).toBeGreaterThan(cornerAxialM + 0.2); // one host thickness clear

    const cornerPlan = computeMoveReweldPlan(movedB, [partnerA]);
    const stemPlan = computeMoveReweldPlan(
      { id: 'H', prevBaseLine: bl([0, 0], [8, 0]), newBaseLine: bl([0, -0.773], [8, -0.773]) },
      [{ id: 'S', baseLine: bl([4, 0], [4, 5]) }],
    );
    // THE DEFECT, STATED AS AN EQUALITY: identical verdict, opposite geometry.
    expect(stemPlan.refusals[0]!.reason).toBe(cornerPlan.refusals[0]!.reason);
  });
});
