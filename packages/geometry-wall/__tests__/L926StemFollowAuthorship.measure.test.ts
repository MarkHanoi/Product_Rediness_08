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
 * STATE: first committed ALONE at `8b8be0e4`, BEFORE the fix, PASSING against
 * the deployed broken behaviour (stem orphaned by 773 mm / 2370 mm). The fix
 * commit flipped ONLY the §MEASURED-STEM-ORPHANED expectations — each one still
 * records the number it used to hold, next to the number it holds now. THE TWO
 * GOLDEN STRINGS BELOW WERE NOT TOUCHED, and that is the proof the L-922 fix
 * was not quietly reverted to buy the stem back.
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

  it('773 mm class: with NO host thickness the engine refuses to guess authorship and stays at 19ddf6bb', () => {
    // C73 §2.2 — the band is derived from the host's thickness and never minted
    // at the call site. Absent that input the question cannot be asked, so the
    // engine takes the incumbent-preserving branch rather than assuming one.
    // This is the conservative direction: a missing thickness costs a REPORTED
    // refusal, never a silent incumbent drag.
    const { thickness: _omitted, ...hostNoThickness } = hostA;
    const plan = computeMoveReweldPlan(hostNoThickness, [stemA]);
    expect(plan.entries).toEqual([]);
    expect(plan.refusals[0]!.reason).toBe('INCUMBENT_EXTENSION_REQUIRED');
    expect(plan.refusals[0]!.beyondMm).toBe(773);
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
    expect(Math.hypot(
      eS.newBaseLine[0].x - stemB.baseLine[0].x,
      eS.newBaseLine[0].z - stemB.baseLine[0].z,
    )).toBeCloseTo(2.27, 9);
    expect(eS.newBaseLine[0].z).toBeCloseTo(-2.17, 9);
  });

  it('2.27 m gap class: the stem EXTENDS 2.80 m -> 5.07 m, far endpoint fixed', () => {
    const plan = computeMoveReweldPlan(hostB, [stemB]);
    const eS = plan.entries.find(e => e.wallId === 'S-interior-2')!;

    const lengthBeforeM = Math.hypot(
      stemB.baseLine[1].x - stemB.baseLine[0].x,
      stemB.baseLine[1].z - stemB.baseLine[0].z,
    );
    const lengthAfterM = Math.hypot(
      eS.newBaseLine[1].x - eS.newBaseLine[0].x,
      eS.newBaseLine[1].z - eS.newBaseLine[0].z,
    );
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

  it('the discriminator is WHOSE ENDPOINT ABUTS WHOSE BODY — opposite geometry, opposite verdict', () => {
    // Corner partner: A's welded endpoint (5,0) sits ON B's prev endpoint (5,0).
    const partnerA = { id: 'A', baseLine: bl([0, 0], [5, 0]) };
    const cornerAxialM = Math.hypot(5 - 5, 0 - 0);
    expect(cornerAxialM).toBe(0); // AT the endpoint ⇒ incumbent

    // Stem partner: S's welded endpoint (4,0) sits 4 m along H's BODY, 4 m from
    // either end ⇒ dependent. Two configurations four orders of magnitude apart
    // in this one measure. At `8b8be0e4` the engine gave both the SAME verdict;
    // this test was written as an equality to say so, and is now an inequality.
    const stemAxialM = 4;
    expect(stemAxialM).toBeGreaterThan(cornerAxialM + T); // one host thickness clear

    const cornerPlan = computeMoveReweldPlan({ ...movedB, thickness: T }, [partnerA]);
    const stemPlan = computeMoveReweldPlan(
      { id: 'H', prevBaseLine: bl([0, 0], [8, 0]), newBaseLine: bl([0, -0.773], [8, -0.773]), thickness: T },
      [{ id: 'S', baseLine: bl([4, 0], [4, 5]) }],
    );

    // The incumbent is refused and not touched…
    expect(cornerPlan.entries.find(e => e.wallId === 'A')).toBeUndefined();
    expect(cornerPlan.refusals[0]!.reason).toBe('INCUMBENT_EXTENSION_REQUIRED');
    // …the dependent follows and is not refused.
    expect(stemPlan.entries.find(e => e.wallId === 'S')).toBeTruthy();
    expect(stemPlan.refusals).toEqual([]);
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
  });

  it('the band edges are derived from the HOST\'s thickness, not from the camera-aware snap radius', () => {
    // Same abutment at 0.15 m, same weldTol, but a THICKER host: 0.40 m moves
    // the stem band to 0.401 m and the corner band to 0.201 m, so 0.15 m is now
    // inside the corner band and reads as an incumbent. Nothing about the
    // camera changed; the wall did. L-919's bug was the opposite — the same two
    // walls classifying differently at two zoom levels.
    const thickHost = {
      id: 'H', prevBaseLine: bl([0, 0], [8, 0]), newBaseLine: bl([0, -0.5], [8, -0.5]),
      thickness: 0.4,
    };
    const near = { id: 'N', baseLine: bl([7.85, 0], [7.85, 3]) };
    const plan = computeMoveReweldPlan(thickHost, [near]);
    expect(plan.entries).toEqual([]);
    expect(plan.refusals[0]!.reason).toBe('INCUMBENT_EXTENSION_REQUIRED');

    // And the snap radius genuinely does NOT move the verdict: double it.
    const wide = computeMoveReweldPlan(thickHost, [near], { weldTol: 1.0 });
    expect(wide.refusals[0]!.reason).toBe('INCUMBENT_EXTENSION_REQUIRED');
    const wideStem = computeMoveReweldPlan(
      { id: 'H', prevBaseLine: bl([0, 0], [8, 0]), newBaseLine: bl([0, -0.773], [8, -0.773]), thickness: T },
      [{ id: 'S', baseLine: bl([4, 0], [4, 5]) }],
      { weldTol: 1.0 },
    );
    expect(wideStem.entries.find(e => e.wallId === 'S')).toBeTruthy();
  });
});
