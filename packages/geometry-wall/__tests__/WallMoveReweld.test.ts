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
import { computeMoveReweld, type ReweldBaseline } from '../src/WallMoveReweld';
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

  it('extends the partner welded endpoint to the new corner (6,0); far endpoint untouched', () => {
    const entries = computeMoveReweld(moved, [partnerA]);
    const eA = entries.find(e => e.wallId === 'A')!;
    expect(eA).toBeTruthy();
    expect(eA.newBaseLine[1]).toEqual({ x: 6, y: 0, z: 0 }); // welded end → corner
    expect(eA.newBaseLine[0]).toEqual({ x: 0, y: 0, z: 0 }); // far end NEVER moves
    expect(eA.prevBaseLine).toEqual(bl([0, 0], [5, 0]));     // prevState carried
  });

  it('GREEN RE-STATEMENT of the pinned defect: applying the entries closes the gap and the resolver re-mitres', () => {
    const entries = computeMoveReweld(moved, [partnerA]);
    const eA = entries.find(e => e.wallId === 'A')!;
    const a = wall('A', eA.newBaseLine, 0.2);
    const b = wall('B', moved.newBaseLine, 0.2);
    // (a) baseline gap closed:
    expect(distToLine(a.baseLine[1], b.baseLine[0], b.baseLine[1])).toBeLessThan(1e-9);
    // (b) mitre re-formed by the ordinary flush-time pass:
    const res = WallJoinResolver.resolveLevel([a, b], { snapRadius: 0.5 });
    expect(res.get('A')!.endMN).not.toBeNull();
    expect(res.get('B')!.startMN).not.toBeNull();
    const gap = Math.hypot(
      (res.get('A')!.baseLine[1] as any).x - (res.get('B')!.baseLine[0] as any).x,
      (res.get('A')!.baseLine[1] as any).z - (res.get('B')!.baseLine[0] as any).z,
    );
    expect(gap).toBeLessThan(1e-6);
  });

  it('diagonal move also seats the MOVED wall endpoint on the formed corner', () => {
    // B moves +1x, +0.5z: its start (6,0.5) is 0.5 short of the corner (6,0).
    const diag = { id: 'B', prevBaseLine: bl([5, 0], [5, 5]), newBaseLine: bl([6, 0.5], [6, 5.5]) };
    const entries = computeMoveReweld(diag, [partnerA]);
    const eA = entries.find(e => e.wallId === 'A')!;
    expect(eA.newBaseLine[1].x).toBeCloseTo(6, 9);
    expect(eA.newBaseLine[1].z).toBeCloseTo(0, 9);
    const eB = entries.find(e => e.wallId === 'B')!;
    expect(eB).toBeTruthy();
    expect(eB.newBaseLine[0].x).toBeCloseTo(6, 9);
    expect(eB.newBaseLine[0].z).toBeCloseTo(0, 9); // extended down to the corner
    expect(eB.newBaseLine[1]).toEqual({ x: 6, y: 0, z: 5.5 }); // far end untouched
  });
});

describe('computeMoveReweld — T-junction', () => {
  it('extends the stem start onto the moved host centreline', () => {
    // Host H(0,0)→(10,0) moves −1 m z; stem S start (5,0.1) was welded to its body.
    const moved = { id: 'H', prevBaseLine: bl([0, 0], [10, 0]), newBaseLine: bl([0, -1], [10, -1]) };
    const stem = { id: 'S', baseLine: bl([5, 0.1], [5, 4]) };
    const entries = computeMoveReweld(moved, [stem]);
    const eS = entries.find(e => e.wallId === 'S')!;
    expect(eS).toBeTruthy();
    expect(eS.newBaseLine[0].x).toBeCloseTo(5, 9);
    expect(eS.newBaseLine[0].z).toBeCloseTo(-1, 9); // onto new host centreline
    expect(eS.newBaseLine[1]).toEqual({ x: 5, y: 0, z: 4 }); // far end untouched
  });

  it('host is a NO-OP partner when the stem is what moved (no host endpoint was welded)', () => {
    const moved = { id: 'S', prevBaseLine: bl([5, 0.1], [5, 4]), newBaseLine: bl([7, 0.1], [7, 4]) };
    const host = { id: 'H', baseLine: bl([0, 0], [10, 0]) };
    // Host endpoints (0,0)/(10,0) are far from the stem's old segment → refuse.
    const entries = computeMoveReweld(moved, [host]);
    expect(entries.find(e => e.wallId === 'H')).toBeUndefined();
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

  it('never emits a lateral slide: every proposed endpoint lies ON the partner axis extension', () => {
    // §CLAMP-COSHARE-WELD: the doubling came from moving baselines laterally.
    const moved = { id: 'B', prevBaseLine: bl([5, 0], [5, 5]), newBaseLine: bl([6, 0], [6, 5]) };
    const entries = computeMoveReweld(moved, [partnerA]);
    const eA = entries.find(e => e.wallId === 'A')!;
    // A's axis is z=0; the proposed endpoint must stay on it.
    expect(distToLine(eA.newBaseLine[1], { x: 0, z: 0 }, { x: 5, z: 0 })).toBeLessThan(1e-9);
  });
});
