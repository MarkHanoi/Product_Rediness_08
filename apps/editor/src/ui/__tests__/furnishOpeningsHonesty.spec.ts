// GR-10 (`[]`-means-unknown ledger · C75 §1.4 · C78 §1.4/§8.1 · C71 §4.4) —
// the furnish executor stops furnishing a room AS IF a wall with an
// UNRECORDED opening set had no doors or windows.
//
// The old shape was `for (const op of w.openings ?? [])` inline in the
// executor's buildInput: an unrecorded wall contributed zero OpeningPoses,
// so the engine could place a wardrobe across a real door and the
// door-clearance validator had nothing to validate — the founder-reported
// failure this family exists to prevent. The differentiating assertions below
// fail against that shape: it reported nothing and named nobody.

import { describe, it, expect } from 'vitest';
import { openingPosesForWall } from '../furnish-layout/FurnishLayoutExecutor';

const NORMAL = { x: 0, z: 1 };
const BASE = [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }];

describe('openingPosesForWall — unrecorded opening sets are NAMED, never door-less (GR-10)', () => {
  it('an UNRECORDED opening set fires the callback and yields no poses', () => {
    const reported: string[] = [];
    const out = openingPosesForWall(
      { id: 'w_unrec', levelId: 'L0', baseLine: BASE } as never,
      NORMAL,
      (id) => reported.push(id),
    );
    expect(out.doors).toEqual([]);
    expect(out.windows).toEqual([]);
    // The old `?? []` also yielded nothing here — but told NOBODY. The
    // callback call is the observable difference; this fails against it.
    expect(reported).toEqual(['w_unrec']);
  });

  it('negative control: a PRESENT empty opening set yields no poses AND no report', () => {
    const reported: string[] = [];
    const out = openingPosesForWall(
      { id: 'w_empty', levelId: 'L0', baseLine: BASE, openings: [] } as never,
      NORMAL,
      (id) => reported.push(id),
    );
    expect(out.doors).toEqual([]);
    expect(reported).toEqual([]);
  });

  it('a recorded set still produces the real poses (door centred on offset+width/2)', () => {
    const out = openingPosesForWall(
      {
        id: 'w_rec', levelId: 'L0', baseLine: BASE,
        openings: [{ type: 'door', offset: 2, width: 1 }, { type: 'window', offset: 6, width: 1.2 }],
      } as never,
      NORMAL,
    );
    expect(out.doors.length).toBe(1);
    expect(out.windows.length).toBe(1);
    expect(out.doors[0]!.center.x).toBeCloseTo(2.5);
    expect(out.doors[0]!.normal).toEqual(NORMAL);
  });
});
