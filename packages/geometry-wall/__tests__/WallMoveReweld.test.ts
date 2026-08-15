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

  // RECONCILED (was: "extends the partner welded endpoint to the new corner").
  // A is (0,0)→(5,0) and the new corner is (6,0) — ONE METRE PAST A's end. The
  // old engine lengthened A to reach it. C83 §10.2.2 forbids moving a
  // non-subject baseline, so the joint is refused and the refusal carries the
  // distance. The incumbent is not touched, which is the whole point.
  it('§C83-10.2.2: a corner PAST the incumbent\'s end is REFUSED, not reached by lengthening it', () => {
    const plan = computeMoveReweldPlan(moved, [partnerA]);
    expect(plan.entries.find(e => e.wallId === 'A')).toBeUndefined();
    expect(plan.refusals).toHaveLength(1);
    expect(plan.refusals[0]!.partnerId).toBe('A');
    expect(plan.refusals[0]!.reason).toBe('INCUMBENT_EXTENSION_REQUIRED');
    expect(plan.refusals[0]!.beyondMm).toBe(1000); // exactly the 1 m overshoot
  });

  // RECONCILED (was: "GREEN RE-STATEMENT … applying the entries closes the gap").
  // The old test proved the gap closes AFTER A is lengthened. It cannot be
  // restated as-is, because closing it that way is now the defect. What IS
  // restated — and it is the honest half — is that the engine proposes NOTHING
  // for A, so A's resolved geometry is byte-identical (C83 §10.4) and the
  // corner is left open for the GESTURE to refuse (C83 §10.3), not for the
  // engine to paper over.
  it('§C83-10.4: the incumbent\'s geometry is byte-identical, and the open corner is not papered over', () => {
    const plan = computeMoveReweldPlan(moved, [partnerA]);
    expect(plan.entries.find(e => e.wallId === 'A')).toBeUndefined();

    // Resolve A exactly as it stood: unchanged in, unchanged out.
    const a = wall('A', bl([0, 0], [5, 0]), 0.2);
    const b = wall('B', moved.newBaseLine, 0.2);
    const before = JSON.stringify(a.baseLine);
    const res = WallJoinResolver.resolveLevel([a, b], { snapRadius: 0.5 });
    expect(JSON.stringify(a.baseLine)).toBe(before);
    void res;
    // The gap is REAL and is reported, not silently welded shut.
    expect(plan.refusals.map(r => r.partnerId)).toEqual(['A']);
  });

  // RECONCILED (was: "diagonal move also seats the MOVED wall endpoint").
  // Same geometry as above: the corner (6,0) lies past A's end, so there is no
  // joint to form and the SUBJECT must not be seated onto a point hanging off
  // the end of the incumbent either. The subject's own adaptation is still
  // alive and is proved positively by the test that follows.
  it('§C83-10.2.2: with the corner past the incumbent, NEITHER wall is re-baselined', () => {
    const diag = { id: 'B', prevBaseLine: bl([5, 0], [5, 5]), newBaseLine: bl([6, 0.5], [6, 5.5]) };
    const plan = computeMoveReweldPlan(diag, [partnerA]);
    expect(plan.entries).toEqual([]);
    expect(plan.refusals[0]!.reason).toBe('INCUMBENT_EXTENSION_REQUIRED');
  });

  // NEW, and it is the positive half the reconciliation owes: §10.1 says the
  // newcomer ADAPTS to the incumbent. When the corner lands ON the incumbent's
  // body, the SUBJECT is re-seated onto it and the incumbent never moves. This
  // is the capability that must survive the §10.2.2 restriction, so it is
  // asserted rather than assumed.
  it('§C83-10.1: when the corner lands ON the incumbent\'s body, the SUBJECT adapts and the incumbent does not move', () => {
    // A is welded to B's OLD start at (5,0) and runs on to x=10, so the new
    // corner (6,0) falls INSIDE A's body rather than past its end.
    const longA = { id: 'A', baseLine: bl([5, 0], [10, 0]) };
    const diag = { id: 'B', prevBaseLine: bl([5, 0], [5, 5]), newBaseLine: bl([6, 0.5], [6, 5.5]) };
    const plan = computeMoveReweldPlan(diag, [longA]);

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
  // RECONCILED (was: "extends the stem start onto the moved host centreline").
  // THIS IS L-922'S EXACT SHAPE, in miniature. The host moves and the STEM — a
  // wall the user never touched, already correctly joined, therefore the
  // incumbent — was dragged 1.1 m to chase it. In production that stem was a
  // perimeter carrying three doors, and dragging it re-seated all three by the
  // same delta and clamped one to offset 0.000 (C83 §10.2.4). Refused now.
  it('§C83-10.2.2: the stem is an INCUMBENT — a moving host does not drag it onto its new centreline', () => {
    const moved = { id: 'H', prevBaseLine: bl([0, 0], [10, 0]), newBaseLine: bl([0, -1], [10, -1]) };
    const stem = { id: 'S', baseLine: bl([5, 0.1], [5, 4]) };
    const plan = computeMoveReweldPlan(moved, [stem]);
    expect(plan.entries.find(e => e.wallId === 'S')).toBeUndefined();
    expect(plan.refusals).toHaveLength(1);
    expect(plan.refusals[0]!.partnerId).toBe('S');
    expect(plan.refusals[0]!.reason).toBe('INCUMBENT_EXTENSION_REQUIRED');
    // 1.1 m: from the stem's start at z=0.1 down to the host's new z=−1.
    expect(plan.refusals[0]!.beyondMm).toBe(1100);
  });

  it('host is a NO-OP partner when the stem is what moved (no host endpoint was welded)', () => {
    const moved = { id: 'S', prevBaseLine: bl([5, 0.1], [5, 4]), newBaseLine: bl([7, 0.1], [7, 4]) };
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
    const moved = { id: 'H', prevBaseLine: bl([0, 0], [10, 0]), newBaseLine: bl([0, -1], [10, -1]) };
    const stem = { id: 'S', baseLine: bl([9, 0.1], [9, 4]) };
    const plan = computeMoveReweldPlan(moved, [stem]);
    // ── THE STILL-TRUE HALF, KEPT VERBATIM ────────────────────────────────
    // §L-872's guard protects the MOVED HOST from being shortened onto a stem's
    // foot. That is about the SUBJECT, not an incumbent, so §10.2.2 does not
    // touch it and it must keep holding. This is the assertion the guard exists
    // for and it is unchanged.
    expect(plan.entries.find(e => e.wallId === 'H')).toBeUndefined(); // host NEVER shortened
    // ── THE HALF §C83-10.2.2 REVERSES ─────────────────────────────────────
    // "the stem follows the host" was the other assertion. The stem is the
    // incumbent; it no longer follows, and the refusal says so.
    expect(plan.entries.find(e => e.wallId === 'S')).toBeUndefined();
    expect(plan.refusals[0]!.reason).toBe('INCUMBENT_EXTENSION_REQUIRED');
  });

  // RECONCILED (was: "§L-872 CONTROL: the L-corner seat still fires"). The
  // control's PURPOSE — proving the T-SEAT-GUARD does not over-suppress the
  // subject's own seat — is preserved, but its fixture had the corner past A's
  // end. Given a full-length incumbent the seat fires exactly as before, which
  // is what the control was really asserting.
  it('§L-872 CONTROL: the subject\'s own seat still fires against a full-length incumbent', () => {
    const diag = { id: 'B', prevBaseLine: bl([5, 0], [5, 5]), newBaseLine: bl([6, 0.5], [6, 5.5]) };
    const longA = { id: 'A', baseLine: bl([5, 0], [10, 0]) };
    const plan = computeMoveReweldPlan(diag, [longA]);
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
  it('§C83-10.2.2 (supersedes §CLAMP-COSHARE-WELD): NO partner baseline is ever proposed', () => {
    const moved = { id: 'B', prevBaseLine: bl([5, 0], [5, 5]), newBaseLine: bl([6, 0], [6, 5]) };
    const longA = { id: 'A', baseLine: bl([5, 0], [10, 0]) };
    for (const partner of [partnerA, longA]) {
      const plan = computeMoveReweldPlan(moved, [partner]);
      expect(plan.entries.every(e => e.wallId === 'B')).toBe(true);
    }
    // And the subject's own seat, when it fires, still lies on the incumbent's
    // axis — the anti-skew property the old assertion actually cared about.
    const plan = computeMoveReweldPlan(moved, [longA]);
    for (const e of plan.entries) {
      const onAxis = Math.min(
        distToLine(e.newBaseLine[0], { x: 5, z: 0 }, { x: 10, z: 0 }),
        distToLine(e.newBaseLine[1], { x: 5, z: 0 }, { x: 10, z: 0 }),
      );
      expect(onAxis).toBeLessThan(1e-9);
    }
  });
});
