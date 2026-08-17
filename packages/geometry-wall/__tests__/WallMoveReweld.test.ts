// §MOVE-REWELD (Phase C item 3) — unit tests for the pure re-weld engine.
//
// The measurement that motivates this engine is
// `WallMoveJunctionReweld.measure.test.ts` (the pinned defect: no re-weld
// mechanism exists for walls outside slab loops). These tests verify the
// engine itself: it proposes exactly the welds the founder promise needs, and
// REFUSES every configuration that burned a previous attempt
// (§CLAMP-COSHARE-WELD doubling, §POST-RESOLVE-OVEREXTEND spikes, degenerate
// stubs feeding the multi-cluster black-spike hole).

import { describe, it, expect } from 'vitest';
// ⚠ RECONCILED 2026-08-15 against C83 §10.2.2 (fix `19ddf6bb`). Seven tests in
// this file pinned the engine's ORIGINAL designed behaviour: the partner's
// welded endpoint pulled onto the moved wall's new line. The founder's
// §JOINT-AUTHORITY-IS-THE-INCUMBENT and the contract minted from it now forbid
// exactly that — *"A re-weld MUST NOT close a joint by moving a non-subject
// wall's baseline"* — because it is L-922: an interior wall was moved and the
// PERIMETER's baseline start shifted ~2.19 m, re-seating three hosted doors and
// clamping one to offset 0.000.
//
// Each reconciled test says so at its own site. NONE was deleted, and none was
// weakened to make a count go green: where a test's assertion is now forbidden
// it asserts the REFUSAL instead, and where a test had a still-true half (the
// moved host must not be shortened) that half is kept verbatim.
//
// ⚠⚠ RE-RECONCILED 2026-08-15 (§L-926, fix `bea6e819`). THE RECONCILIATION
// ABOVE WENT TOO FAR, AND THIS SUITE IS WHERE IT SHOWED. The C83 §10.2.2 rule
// is about a CORNER incumbent; it was applied to every partner, so the three
// T-JUNCTION tests below were rewritten to pin "the stem does not follow" —
// and a stem that does not follow its host is the founder's regression, logged
// as L-926 hours later (stems 773 mm off their host, rooms 6 → 4,
// §OPENED-REGION offering to build a wall across a gap the stem should simply
// have extended across).
//
// The reconciling rule is WELD AUTHORSHIP (C83 §10.6): the wall whose ENDPOINT
// terminates on the other's BODY is the DEPENDENT and follows; the wall whose
// endpoint sits at the other's ENDPOINT is the INCUMBENT and never moves. The
// corner tests in this file were always about incumbents and are untouched by
// the re-reconciliation. The T tests were always about dependents and are put
// back — with the host THICKNESS they were always missing, since that is what
// the discriminator is derived from and no verdict is possible without it.
//
// ⚠⚠⚠ RE-SCOPED 2026-08-17 (C83 §10.6.3 amendment, founder-directed at commit
// `55a2eda3`). READ THE WHOLE HISTORY BEFORE FLIPPING ANY NUMBER BELOW — these
// assertions have now been reversed THREE times and the only thing that keeps
// the next reversal honest is knowing what each one was actually about:
//
//   original       the neighbour LENGTHENS to reach the new corner.
//   2026-08-15     §10.2.2 reversed it: the incumbent is byte-identical.
//                  (Cause: L-922 — an INTERIOR move dragged a PERIMETER
//                  baseline 2.19 m and re-seated three hosted doors.)
//   2026-08-17     §10.6 re-reversed it for MUTUAL corners.
//   2026-08-17     §10.6.3 keyed it on junction DEGREE rather than the type
//                  letter, and made the follow symmetric.
//
// ⭐ §10.2.2 WAS RIGHT ABOUT L-922's T/degree-3 AND OVER-BROAD ABOUT DEGREE-2,
// because until the discriminator was threaded through `MoveReweldPartner`
// nothing could tell the two apart. The founder's report is the whole
// amendment: *"EVERYTHING WORKS — ONLY WHEN THE WALL SURPASSES THE VERTEX IT
// CORRUPTS: if the wall moves beyond the connected wall's second point then
// neither the slab nor the walls connect."* Inwards the new corner lands ON the
// neighbour's body and nothing had to move; outwards it lands PAST the
// neighbour's end, the neighbour must LENGTHEN, and INCUMBENT_EXTENSION_REQUIRED
// refused precisely that.
//
// THE LINE THAT NOW SEPARATES THEM IS PARTICIPANT COUNT, NOT NAMING:
//   degree 2  — the two walls jointly own the corner and nobody else has a
//               stake. The partner FOLLOWS: welded endpoint → the analytic
//               intersection of its OWN line with the mover's NEW line, FAR
//               endpoint byte-identical, direction unchanged. A PIVOT, in BOTH
//               directions (lengthening and shortening — an asymmetric follow
//               does not undo itself, §Z-5).
//   degree ≥3 — L-922's shape exactly. NEVER follows, stored or measured. Every
//               degree-3 fixture below exists to hold that line, and each one
//               was made degree 3 by ADDING A THIRD PARTICIPANT rather than by
//               relaxing what it asserts.
//
// WHAT THAT MEANT FOR EACH TEST, recorded so the next reader can tell a
// re-scope from a test bent to fit a bug:
//   • the four corner tests whose fixtures had exactly TWO walls were split —
//     two now assert the FOLLOW (they were pinning the superseded rule
//     directly), and two had a third wall added so their subject — the
//     incumbent's immunity — is still the thing under test;
//   • no expected number was flipped to chase green. Every new coordinate is
//     DERIVED from the fixture's own two lines and the arithmetic is shown at
//     the assertion;
//   • every follow arm additionally asserts the far endpoint is BYTE-identical,
//     the direction is unchanged, and the endpoints stayed on the partner's own
//     line — that trio IS §CLAMP-COSHARE-WELD's guarantee (a lateral slide of a
//     shared baseline is what doubled walls), restated for a pivot.
//
// THE LESSON THIS FILE NOW CARRIES: a suite that pins one side of a branch
// certifies a change that deletes the branch. Both directions are measured
// together in `L926StemFollowAuthorship.measure.test.ts`, and the load-bearing
// degree-3 refusal control lives in
// `command-registry/__tests__/wallMoveReweldSeam.test.ts`.
import {
  computeMoveReweld,
  computeMoveReweldPlan,
  type ReweldBaseline,
} from '../src/WallMoveReweld';
import { WallJoinResolver } from '../src/WallJoinResolver';
import type { WallData } from '../src/WallTypes';

const bl = (s: [number, number], e: [number, number]): ReweldBaseline =>
  [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }];

const distToLine = (p: any, a: any, b: any): number => {
  const dx = b.x - a.x, dz = b.z - a.z;
  const L = Math.hypot(dx, dz) || 1;
  return Math.abs((p.x - a.x) * (-dz / L) + (p.z - a.z) * (dx / L));
};

/** Unit direction of a baseline — the quantity a PIVOT must leave unchanged. */
const unitDir = (b: ReweldBaseline): { x: number; z: number } => {
  const dx = b[1].x - b[0].x, dz = b[1].z - b[0].z;
  const L = Math.hypot(dx, dz);
  return { x: dx / L, z: dz / L };
};

const dist2D = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z);

let _seq = 0;
function wall(id: string, baseLine: ReweldBaseline, t: number): WallData {
  return {
    id, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
    baseLine: baseLine.map(p => ({ ...p })),
    _sourceBaseLine: baseLine.map(p => ({ ...p })),
    height: 3, thickness: t, baseOffset: 0, openings: [], metadata: { createdAt: ++_seq },
  } as any;
}

describe('computeMoveReweld — L-corner', () => {
  // A(0,0)→(5,0) joined to B at (5,0); B moves +1 m x → B'(6,0)→(6,5).
  const moved = { id: 'B', prevBaseLine: bl([5, 0], [5, 5]), newBaseLine: bl([6, 0], [6, 5]) };
  const partnerA = { id: 'A', baseLine: bl([0, 0], [5, 0]) };

  // ── THE THIRD PARTICIPANT ────────────────────────────────────────────────
  // C runs SOUTH out of the same point (5,0) that A and B meet at, so that
  // point has THREE walls on it and `measureJunctionDegree` reads 3. It is a
  // fixture element and nothing else: it is collinear with B's new line, so
  // `intersectLines` refuses it as near-parallel and it contributes no corner,
  // no entry and no refusal of its own. Its ONLY job is to make the junction
  // genuinely degree 3, which is what the tests that use it are about.
  const thirdAtCorner = { id: 'C', baseLine: bl([5, 0], [5, -4]) };

  // ⭐ RE-SCOPED 2026-08-17 §10.6.3 (was: "a corner PAST the incumbent's end is
  // REFUSED, not reached by lengthening it" — outcome (b), the test asserted
  // the superseded rule directly and is INVERTED).
  //
  // A and B are the only two walls at (5,0), so this is the founder's exact
  // report: B outruns A's second point and, before the amendment, nothing
  // connected. A is not an incumbent here — it is a CO-OWNER of the corner — so
  // it follows.
  //
  // THE EXPECTED CORNER IS DERIVED, NOT OBSERVED:
  //   A's own infinite line:  z = 0            (through (0,0) and (5,0))
  //   B's NEW infinite line:  x = 6            (through (6,0) and (6,5))
  //   ⇒ intersection = (6, 0), i.e. A lengthens by exactly the 1 m B moved.
  it('§C83-10.6.3: a 2-participant corner PAST the partner\'s end is FOLLOWED — the partner pivots and lengthens', () => {
    const plan = computeMoveReweldPlan(moved, [partnerA]);
    expect(plan.refusals).toEqual([]);

    const eA = plan.entries.find(e => e.wallId === 'A')!;
    expect(eA).toBeTruthy();
    expect(eA.role).toBe('mutual-corner');
    // The welded end goes to the derived intersection…
    expect(eA.newBaseLine[1]).toEqual({ x: 6, y: 0, z: 0 });
    // …and the FAR end is the pivot: byte-identical, §10.6.2 condition 4. This
    // is the assertion that separates the amendment from L-922, which moved
    // `baseLine[0]` — the datum every hosted opening's offset is measured from.
    expect(eA.newBaseLine[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(eA.prevBaseLine).toEqual([{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }]);

    // Direction unchanged, and BOTH endpoints still on A's own original line.
    // Together these are §CLAMP-COSHARE-WELD's guarantee restated for a pivot:
    // the scar was a shared baseline sliding SIDEWAYS, which doubled walls. An
    // axial lengthening about a fixed far endpoint cannot reopen it.
    expect(unitDir(eA.newBaseLine)).toEqual(unitDir(eA.prevBaseLine));
    for (const p of eA.newBaseLine) {
      expect(distToLine(p, { x: 0, z: 0 }, { x: 5, z: 0 })).toBeLessThan(1e-9);
    }
  });

  // ⭐ RE-SCOPED 2026-08-17 §10.6.3 — outcome (a): the SUBJECT of this test (an
  // incumbent's geometry is byte-identical, and the corner is reported rather
  // than papered over) is UNCHANGED by the amendment. Only its fixture had to
  // move: with two walls it is a mutual corner and follows, so the third
  // participant is added and the junction is genuinely degree 3 — L-922's own
  // shape, where the refusal is mandatory and is proven load-bearing.
  //
  // The 1 m overshoot number lived on the test above before the amendment and
  // is kept HERE, where a refusal still happens, rather than being deleted:
  //   corner (6,0) vs A's segment [(0,0),(5,0)] ⇒ 1.000 m past A's end.
  it('§C83-10.4 at degree 3: the incumbent\'s geometry is byte-identical, and the open corner is not papered over', () => {
    const plan = computeMoveReweldPlan(moved, [partnerA, thirdAtCorner]);
    expect(plan.entries.find(e => e.wallId === 'A')).toBeUndefined();
    expect(plan.refusals).toHaveLength(1);
    expect(plan.refusals[0]!.partnerId).toBe('A');
    expect(plan.refusals[0]!.reason).toBe('INCUMBENT_EXTENSION_REQUIRED');
    expect(plan.refusals[0]!.beyondMm).toBe(1000); // exactly the 1 m overshoot

    // Resolve A exactly as it stood: unchanged in, unchanged out.
    const a = wall('A', bl([0, 0], [5, 0]), 0.2);
    const b = wall('B', moved.newBaseLine, 0.2);
    const c = wall('C', bl([5, 0], [5, -4]), 0.2);
    const before = JSON.stringify(a.baseLine);
    const res = WallJoinResolver.resolveLevel([a, b, c], { snapRadius: 0.5 });
    expect(JSON.stringify(a.baseLine)).toBe(before);
    void res;
    // The gap is REAL and is reported, not silently welded shut.
    expect(plan.refusals.map(r => r.partnerId)).toEqual(['A']);
  });

  // ⭐ RE-SCOPED 2026-08-17 §10.6.3 (was: "with the corner past the incumbent,
  // NEITHER wall is re-baselined" — outcome (b), INVERTED). At two participants
  // the corner is closed from BOTH sides, and this is the assertion the founder's
  // report was missing: it is not enough to know where each wall SAT, the two
  // must actually MEET.
  //
  // DERIVED, from the fixture's own coordinates:
  //   A's line:      z = 0                    (through (0,0),(5,0))
  //   B's NEW line:  x = 6                    (through (6,0.5),(6,5.5))
  //   ⇒ shared corner = (6, 0). A's welded end (5,0) → (6,0); B's start
  //     (6,0.5) → (6,0), a 0.5 m seat along B's own line.
  it('§C83-10.6.3: the corner is CLOSED FROM BOTH SIDES — the partner pivots to it and the subject seats on it', () => {
    const diag = { id: 'B', prevBaseLine: bl([5, 0], [5, 5]), newBaseLine: bl([6, 0.5], [6, 5.5]) };
    const plan = computeMoveReweldPlan(diag, [partnerA]);
    expect(plan.refusals).toEqual([]);

    const eA = plan.entries.find(e => e.wallId === 'A')!;
    const eB = plan.entries.find(e => e.wallId === 'B')!;
    expect(eA).toBeTruthy();
    expect(eB).toBeTruthy();

    expect(eA.newBaseLine[1]).toEqual({ x: 6, y: 0, z: 0 });
    expect(eA.newBaseLine[0]).toEqual({ x: 0, y: 0, z: 0 }); // pivot, byte-identical
    expect(unitDir(eA.newBaseLine)).toEqual(unitDir(eA.prevBaseLine));

    expect(eB.newBaseLine[0].x).toBeCloseTo(6, 12);
    expect(eB.newBaseLine[0].z).toBeCloseTo(0, 12);
    expect(eB.newBaseLine[1]).toEqual({ x: 6, y: 0, z: 5.5 }); // subject's far end untouched

    // THE JOINT ACTUALLY CLOSES. Asserting the two coordinates separately is
    // what let a "connected" corner sit 773 mm open in L-926; assert the
    // coincidence itself.
    expect(dist2D(eA.newBaseLine[1], eB.newBaseLine[0])).toBeLessThan(1e-9);
  });

  // ⭐ RE-SCOPED 2026-08-17 §10.6.3 — outcome (a). SUBJECT UNCHANGED: §10.1 says
  // the newcomer ADAPTS to the incumbent and the incumbent never moves. That is
  // still exactly right at degree 3, and every assertion below is the original
  // one; only the third participant was added, because with two walls this same
  // geometry is now a mutual corner (the SHORTENING leg of the follow, pinned by
  // the closed-loop and round-trip tests instead).
  it('§C83-10.1 at degree 3: when the corner lands ON the incumbent\'s body, the SUBJECT adapts and the incumbent does not move', () => {
    // A is welded to B's OLD start at (5,0) and runs on to x=10, so the new
    // corner (6,0) falls INSIDE A's body rather than past its end.
    const longA = { id: 'A', baseLine: bl([5, 0], [10, 0]) };
    const diag = { id: 'B', prevBaseLine: bl([5, 0], [5, 5]), newBaseLine: bl([6, 0.5], [6, 5.5]) };
    const plan = computeMoveReweldPlan(diag, [longA, thirdAtCorner]);

    expect(plan.refusals).toEqual([]);
    // NOTHING is proposed for the incumbent…
    expect(plan.entries.find(e => e.wallId === 'A')).toBeUndefined();
    // …and the SUBJECT is seated on the corner it now forms.
    const eB = plan.entries.find(e => e.wallId === 'B')!;
    expect(eB).toBeTruthy();
    expect(eB.newBaseLine[0].x).toBeCloseTo(6, 9);
    expect(eB.newBaseLine[0].z).toBeCloseTo(0, 9);
    expect(eB.newBaseLine[1]).toEqual({ x: 6, y: 0, z: 5.5 }); // far end untouched
  });
});

describe('computeMoveReweld — T-junction', () => {
  // RE-RECONCILED §L-926 (was, at a248585d: "the stem is an INCUMBENT — a moving
  // host does not drag it onto its new centreline"; originally: "extends the
  // stem start onto the moved host centreline").
  //
  // THE MIDDLE VERSION HAD IT BACKWARDS, and this fixture is why. The stem's
  // START terminates ON the host's BODY, 5 m from either host end — it is the
  // DEPENDENT, not an incumbent. L-922's shape is the OPPOSITE assignment: there
  // the wall carrying the three doors was a perimeter whose ENDPOINT met the
  // moved wall's endpoint, i.e. a corner incumbent, and the corner tests above
  // pin that case. Conflating the two deleted the follow.
  //
  // The original assertion is therefore restored — with one correction it never
  // had: the stem returns to the FACE it was seated on (z = 0.1 = +t/2 off the
  // host centreline), not to the centreline. Its displacement is the host's own
  // 1.0 m; the 1.1 m the middle version pinned was the centreline distance, and
  // seating there would have lengthened a wall the user never touched by t/2.
  //
  // ⚠ UNTOUCHED by the 2026-08-17 §10.6.3 amendment, and that is worth stating:
  // a stem is classified by WELD AUTHORSHIP at step 1b and returns before the
  // corner machinery — and therefore before `isMutualCorner` — is ever reached.
  // Degree keys the CORNER branch only.
  it('§C83-10.6: the stem TERMINATES on the host body — it is the DEPENDENT and follows, at its own seating depth', () => {
    const moved = {
      id: 'H', prevBaseLine: bl([0, 0], [10, 0]), newBaseLine: bl([0, -1], [10, -1]),
      thickness: 0.2,
    };
    const stem = { id: 'S', baseLine: bl([5, 0.1], [5, 4]) };
    const plan = computeMoveReweldPlan(moved, [stem]);

    expect(plan.refusals).toEqual([]);
    const eS = plan.entries.find(e => e.wallId === 'S')!;
    expect(eS).toBeTruthy();
    // Seated back on the same face: 0.1 m off the host's NEW centreline (−1).
    // (`toBeCloseTo`, not `toEqual`: −1 + 0.1 is −0.8999999999999999 in binary
    // floating point. The seat is an offset construction, so it carries that
    // last-ulp noise honestly rather than being rounded to look tidy.)
    expect(eS.newBaseLine[0].x).toBe(5);
    expect(eS.newBaseLine[0].z).toBeCloseTo(-0.9, 12);
    // Axial only — far endpoint and direction untouched, and untouched EXACTLY:
    // this one is a copy, not a computation, so it must be byte-equal.
    expect(eS.newBaseLine[1]).toEqual({ x: 5, y: 0, z: 4 });
    // The host is NOT re-baselined onto its own stem's foot (§L-872).
    expect(plan.entries.find(e => e.wallId === 'H')).toBeUndefined();
  });

  // Unchanged by §L-926, and it is the ASYMMETRY the rule is made of: authorship
  // is not reciprocal. When the STEM is the subject, the host has no endpoint on
  // the stem's body, so there is no dependent to follow in that direction —
  // exactly as it should be, since the stem slides ALONG the host's face.
  it('host is a NO-OP partner when the stem is what moved (no host endpoint was welded)', () => {
    const moved = {
      id: 'S', prevBaseLine: bl([5, 0.1], [5, 4]), newBaseLine: bl([7, 0.1], [7, 4]),
      thickness: 0.2,
    };
    const host = { id: 'H', baseLine: bl([0, 0], [10, 0]) };
    // Host endpoints (0,0)/(10,0) are far from the stem's old segment → refuse.
    const entries = computeMoveReweld(moved, [host]);
    expect(entries.find(e => e.wallId === 'H')).toBeUndefined();
  });

  it('§L-872 T-SEAT-GUARD: a stem abutting NEAR the host end never shortens the moved host', () => {
    // Host H(0,0)→(10,0) moves −1 m z; stem S abuts the host BODY at x=9 — only
    // 1 m from the host's end. Pre-guard, the moved-wall seating loop snapped
    // the host's end endpoint onto the stem's foot (d=1 ≤ cap 1.5), silently
    // shortening the host to 9 m. The stem must still be re-welded; the host's
    // own baseline must come through byte-unchanged (no seat on a body corner).
    const moved = {
      id: 'H', prevBaseLine: bl([0, 0], [10, 0]), newBaseLine: bl([0, -1], [10, -1]),
      thickness: 0.2,
    };
    const stem = { id: 'S', baseLine: bl([9, 0.1], [9, 4]) };
    const plan = computeMoveReweldPlan(moved, [stem]);
    // ── THE STILL-TRUE HALF, KEPT VERBATIM ────────────────────────────────
    // §L-872's guard protects the MOVED HOST from being shortened onto a stem's
    // foot. That is about the SUBJECT, not an incumbent, so neither §10.2.2 nor
    // §10.6 touches it and it must keep holding. Under §10.6 it holds even more
    // strongly: a stem's foot is never offered as a corner for the host to seat
    // on at all, so there is nothing for the guard to catch.
    expect(plan.entries.find(e => e.wallId === 'H')).toBeUndefined(); // host NEVER shortened
    // ── RE-RECONCILED §L-926 ───────────────────────────────────────────────
    // "the stem follows the host" is the other assertion, and it is restored.
    // The stem's foot is 1.0 m from the host's END — a whole host thickness
    // clear of the 0.201 m stem band, so it is a stem and not a near-corner.
    // (0.15 m from the end would land in the AMBIGUOUS band and refuse; that
    // boundary is measured in L926StemFollowAuthorship.measure.test.ts.)
    const eS = plan.entries.find(e => e.wallId === 'S')!;
    expect(eS).toBeTruthy();
    expect(eS.newBaseLine[0].x).toBe(9);
    expect(eS.newBaseLine[0].z).toBeCloseTo(-0.9, 12);
    expect(eS.newBaseLine[1]).toEqual({ x: 9, y: 0, z: 4 });
    expect(plan.refusals).toEqual([]);
  });

  // RECONCILED (was: "§L-872 CONTROL: the L-corner seat still fires"). The
  // control's PURPOSE — proving the T-SEAT-GUARD does not over-suppress the
  // subject's own seat — is preserved, but its fixture had the corner past A's
  // end. Given a full-length incumbent the seat fires exactly as before, which
  // is what the control was really asserting.
  //
  // ⭐ RE-SCOPED 2026-08-17 §10.6.3 — outcome (a). ⚠ NAMING NOTE, because it
  // misleads: this control lives in the T-junction block but ITS FIXTURE IS NOT
  // A T. It is an L — B's welded endpoint sits at A's ENDPOINT (5,0), not on
  // A's body — and it always was; it is here because the guard it controls is
  // the T-SEAT-GUARD, not because the fixture has a stem. That is exactly why
  // it went red: two walls at one point is degree 2, so A followed. The word
  // "incumbent" in the title is only true at degree ≥3, so the third
  // participant is added and the control asserts what it always meant to.
  it('§L-872 CONTROL at degree 3: the subject\'s own seat still fires against a full-length incumbent', () => {
    const diag = { id: 'B', prevBaseLine: bl([5, 0], [5, 5]), newBaseLine: bl([6, 0.5], [6, 5.5]) };
    const longA = { id: 'A', baseLine: bl([5, 0], [10, 0]) };
    const thirdAtCorner = { id: 'C', baseLine: bl([5, 0], [5, -4]) };
    const plan = computeMoveReweldPlan(diag, [longA, thirdAtCorner]);
    const eB = plan.entries.find(e => e.wallId === 'B')!;
    expect(eB).toBeTruthy();
    expect(eB.newBaseLine[0].x).toBeCloseTo(6, 9);
    expect(eB.newBaseLine[0].z).toBeCloseTo(0, 9);
    expect(plan.entries.find(e => e.wallId === 'A')).toBeUndefined(); // §10.2.2
  });
});

describe('computeMoveReweld — refusals (the scars)', () => {
  const partnerA = { id: 'A', baseLine: bl([0, 0], [5, 0]) };

  it('refuses a wall that slid away ALONG ITS OWN AXIS (corner no longer on the moved segment)', () => {
    // B slides +2 m up its own axis: intersection with A's line is (5,0), which
    // B' no longer covers — extending A toward empty air would be wrong.
    const moved = { id: 'B', prevBaseLine: bl([5, 0], [5, 5]), newBaseLine: bl([5, 2], [5, 7]) };
    const entries = computeMoveReweld(moved, [partnerA]);
    expect(entries).toEqual([]);
  });

  it('refuses near-parallel partners (ill-conditioned intersection)', () => {
    // Partner almost parallel to the moved wall's new line.
    const moved = { id: 'B', prevBaseLine: bl([5, 0], [5, 5]), newBaseLine: bl([6, 0], [6, 5]) };
    const parallel = { id: 'P', baseLine: bl([5, 0.01], [5.02, 5]) }; // ~vertical, welded at old B
    const entries = computeMoveReweld(moved, [parallel]);
    expect(entries.find(e => e.wallId === 'P')).toBeUndefined();
  });

  it('refuses displacements beyond the cap (§POST-RESOLVE-OVEREXTEND)', () => {
    // Shallow-angle partner: a 1 m lateral move demands a >> 1.5 m extension.
    const moved = { id: 'B', prevBaseLine: bl([5, 0], [5, 5]), newBaseLine: bl([6, 0], [6, 5]) };
    // Partner at ~10° to the moved wall — extension ≈ 1/sin(10°) ≈ 5.8 m > cap 1.5.
    const shallow = { id: 'G', baseLine: bl([5 - 5 * Math.sin(0.175), -5 * Math.cos(0.175)], [5, 0]) };
    const entries = computeMoveReweld(moved, [shallow]);
    expect(entries.find(e => e.wallId === 'G')).toBeUndefined();
  });

  it('refuses a weld that would shrink the partner into a degenerate stub', () => {
    // Partner 0.6 m long ending at the old corner; the corner moves 0.5 m
    // TOWARD its far end → new length 0.1 < DEGENERATE_STUB_LENGTH (0.15).
    const moved = { id: 'B', prevBaseLine: bl([5, 0], [5, 5]), newBaseLine: bl([4.5, 0], [4.5, 5]) };
    const short = { id: 'K', baseLine: bl([4.4, 0], [5, 0]) };
    const entries = computeMoveReweld(moved, [short]);
    expect(entries.find(e => e.wallId === 'K')).toBeUndefined();
  });

  it('returns [] when the wall did not actually move', () => {
    const moved = { id: 'B', prevBaseLine: bl([5, 0], [5, 5]), newBaseLine: bl([5, 0], [5, 5]) };
    expect(computeMoveReweld(moved, [partnerA])).toEqual([]);
  });

  // RECONCILED (was: "never emits a lateral slide: every proposed endpoint lies
  // ON the partner axis extension"). §CLAMP-COSHARE-WELD guarded against
  // sliding a PARTNER's baseline sideways. §C83-10.2.2 supersedes it with a
  // strictly stronger guarantee — a partner's baseline is never proposed AT ALL,
  // laterally or otherwise — so the invariant is restated at that strength
  // rather than at the old one. `distToLine` stays in use below.
  // RE-SCOPED §L-926: the guarantee is about CORNER partners, which is what both
  // fixtures here are (each is welded exactly AT B's prev endpoint (5,0), i.e.
  // axial distance 0 from the host's end — an incumbent under any thickness).
  // Stating it unqualified is what let the T-stem follow be deleted, so the
  // scope is now in the title and the thickness is supplied so the authorship
  // branch is genuinely exercised rather than skipped for want of an input.
  //
  // ⭐ RE-SCOPED AGAIN 2026-08-17 §10.6.3 — outcome (a). "CORNER partner" was
  // still too broad by one axis: at degree 2 a corner partner is a CO-OWNER and
  // its baseline IS proposed, by design. The scar this test carries —
  // §CLAMP-COSHARE-WELD, where moving a shared baseline DOUBLED walls — is about
  // the INCUMBENT case, so the third participant is added and the fixture is
  // genuinely degree 3. The scar cannot be reopened by the degree-2 follow
  // either: that follow is a PIVOT about a byte-identical far endpoint along the
  // partner's own line, which is asserted directly in the L-corner block above —
  // the doubling came from a LATERAL slide, which no arm of this engine can now
  // produce.
  it('§C83-10.2.2 at degree 3 (supersedes §CLAMP-COSHARE-WELD): no INCUMBENT corner partner\'s baseline is ever proposed', () => {
    const moved = {
      id: 'B', prevBaseLine: bl([5, 0], [5, 5]), newBaseLine: bl([6, 0], [6, 5]),
      thickness: 0.2,
    };
    const longA = { id: 'A', baseLine: bl([5, 0], [10, 0]) };
    // Collinear with B's new line ⇒ contributes no corner of its own; it exists
    // only to put a THIRD wall on (5,0) so the junction is degree 3.
    const thirdAtCorner = { id: 'C', baseLine: bl([5, 0], [5, -4]) };
    for (const partner of [partnerA, longA]) {
      // Byte-identical is asserted POSITIVELY as well as by the absence of an
      // entry: an entry is not the only way a baseline could come back changed,
      // and this engine's contract is that it mutates none of its inputs.
      const before = JSON.stringify(partner.baseLine);
      const plan = computeMoveReweldPlan(moved, [partner, thirdAtCorner]);
      expect(plan.entries.every(e => e.wallId === 'B')).toBe(true);
      expect(JSON.stringify(partner.baseLine)).toBe(before);
    }
    // And the subject's own seat, when it fires, still lies on the incumbent's
    // axis — the anti-skew property the old assertion actually cared about.
    const plan = computeMoveReweldPlan(moved, [longA, thirdAtCorner]);
    for (const e of plan.entries) {
      const onAxis = Math.min(
        distToLine(e.newBaseLine[0], { x: 5, z: 0 }, { x: 10, z: 0 }),
        distToLine(e.newBaseLine[1], { x: 5, z: 0 }, { x: 10, z: 0 }),
      );
      expect(onAxis).toBeLessThan(1e-9);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NEW 2026-08-17 (§C83 §10.6.3) — THE FOUNDER'S ACTUAL REPORT, AS A FIXTURE.
//
// *"EVERYTHING WORKS — ONLY WHEN THE WALL SURPASSES THE VERTEX IT CORRUPTS: if
// the wall moves beyond the connected wall's second point then neither the slab
// nor the walls connect."*
//
// Every fixture above is an open pair or triple, and this family has a history
// of asserting where walls SAT while never asserting that the building still
// CLOSED — which is the property the founder was actually reporting on, and the
// one a slab needs (a slab is generated from a closed wall loop; an open loop is
// the "neither the slab nor the walls connect" half of the sentence).
// ─────────────────────────────────────────────────────────────────────────────
describe('computeMoveReweld — the closed loop (the founder\'s report)', () => {
  it('§C83-10.6.3: dragging one side of a closed room PAST both its neighbours\' ends leaves the loop CLOSED', () => {
    // A 6 × 4 room, wound consistently so consecutive baselines share a point:
    //   south (0,0)→(6,0) · east (6,0)→(6,4) · north (6,4)→(0,4) · west (0,4)→(0,0)
    // The user drags NORTH outward by 2 m: (6,4)→(0,4) becomes (6,6)→(0,6).
    // Both corners now land 2 m PAST the ends of east and west — the exact
    // gesture that was refused before the amendment, leaving two open corners.
    const south = { id: 'w-south', baseLine: bl([0, 0], [6, 0]) };
    const east = { id: 'w-east', baseLine: bl([6, 0], [6, 4]) };
    const west = { id: 'w-west', baseLine: bl([0, 4], [0, 0]) };
    const moved = {
      id: 'w-north',
      prevBaseLine: bl([6, 4], [0, 4]),
      newBaseLine: bl([6, 6], [0, 6]),
      thickness: 0.2,
    };

    const plan = computeMoveReweldPlan(moved, [south, east, west]);
    expect(plan.refusals).toEqual([]);

    // DERIVED CORNERS — each is the partner's OWN infinite line met with the
    // mover's NEW infinite line, and nothing else:
    //   east's line  x = 6  ∩  north's new line  z = 6   ⇒ (6, 6)
    //   west's line  x = 0  ∩  north's new line  z = 6   ⇒ (0, 6)
    const eEast = plan.entries.find(e => e.wallId === 'w-east')!;
    const eWest = plan.entries.find(e => e.wallId === 'w-west')!;
    expect(eEast).toBeTruthy();
    expect(eWest).toBeTruthy();
    expect(eEast.role).toBe('mutual-corner');
    expect(eWest.role).toBe('mutual-corner');

    // east pivots about its (6,0) end — which is byte-identical…
    expect(eEast.newBaseLine[0]).toEqual({ x: 6, y: 0, z: 0 });
    expect(eEast.newBaseLine[1]).toEqual({ x: 6, y: 0, z: 6 });
    // …and west pivots about its (0,0) end, which is its baseLine[1] here
    // (the loop's winding puts west's welded endpoint at index 0).
    expect(eWest.newBaseLine[1]).toEqual({ x: 0, y: 0, z: 0 });
    expect(eWest.newBaseLine[0]).toEqual({ x: 0, y: 0, z: 6 });
    // Directions unchanged — a pivot, never a rotation or a lateral slide.
    expect(unitDir(eEast.newBaseLine)).toEqual(unitDir(eEast.prevBaseLine));
    expect(unitDir(eWest.newBaseLine)).toEqual(unitDir(eWest.prevBaseLine));

    // SOUTH is 4 m away from the moved wall's old segment: it was never welded
    // to it, so it is not touched and does not appear.
    expect(plan.entries.find(e => e.wallId === 'w-south')).toBeUndefined();

    // ⭐ THE ASSERTION THIS FAMILY NEVER MADE: THE BUILDING STILL CLOSES.
    // Walk the loop with every proposed entry applied and require each corner
    // to be coincident. Before the amendment this walk had two 2 m gaps.
    const applied = (id: string, fallback: ReweldBaseline): ReweldBaseline => {
      const e = plan.entries.find(x => x.wallId === id);
      return (e ? e.newBaseLine : fallback) as ReweldBaseline;
    };
    const loop: ReweldBaseline[] = [
      applied('w-south', south.baseLine),
      applied('w-east', east.baseLine),
      applied('w-north', moved.newBaseLine),
      applied('w-west', west.baseLine),
    ];
    for (let i = 0; i < loop.length; i++) {
      const end = loop[i]![1];
      const nextStart = loop[(i + 1) % loop.length]![0];
      expect(dist2D(end, nextStart)).toBeLessThan(1e-9);
    }
  });
});
