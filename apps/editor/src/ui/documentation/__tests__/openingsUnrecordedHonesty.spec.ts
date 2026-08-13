// GR-10 (`[]`-means-unknown ledger, C75 §1.4 · C78 §8.1 · C71 §4.4) — the
// documentation surfaces stop forging "no openings" out of "openings never
// recorded".
//
// Three seams, one family: applyAutoDimensions (plan dims),
// applyElevationAutoDimensions (elevation dims) and autoTagActiveView
// (door/window tags) all read `wall.openings ?? []`, so a wall whose opening
// set was NEVER RECORDED silently produced a drawing with no opening
// dimensions / no tags — indistinguishable from a genuinely opening-less wall.
// Every "unrecorded" assertion below fails against the `?? []` shape, which
// reported nothing and named nobody.

import { describe, it, expect } from 'vitest';
import { buildElevationSnapshot } from '../applyElevationAutoDimensions';
import { buildEvalSnapshot } from '../applyAutoDimensions';
import { openingTargets } from '../autoTagActiveView';

const FRONT = {
  hWorldAxis: 'x' as const,
  hSign: 1 as const,
  right: { x: 1, z: 0 },
  normal: { x: 0, z: 1 },
};
const LEVELS = [{ id: 'L0', name: 'Ground', elevation: 0 }];

const RECORDED = {
  id: 'w_recorded', levelId: 'L0', height: 3, thickness: 0.2,
  baseLine: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }] as const,
  openings: [
    { elementId: 'win_1', type: 'window' as const, offset: 2, width: 1.5, height: 1.5, sillHeight: 0.9 },
  ],
};
const RECORDED_EMPTY = {
  id: 'w_empty', levelId: 'L0', height: 3, thickness: 0.2,
  baseLine: [{ x: 0, y: 0, z: -0.1 }, { x: 10, y: 0, z: -0.1 }] as const,
  openings: [] as const, // PRESENT and empty — a real "no openings" answer
};
// The opening set of this wall was NEVER RECORDED.
const UNRECORDED = {
  id: 'w_unrecorded', levelId: 'L0', height: 3, thickness: 0.2,
  baseLine: [{ x: 0, y: 0, z: 0.1 }, { x: 10, y: 0, z: 0.1 }] as const,
};

describe('buildElevationSnapshot — unrecorded opening sets are NAMED, never zero (GR-10)', () => {
  it('names the unrecorded façade wall; its extent still measures; others still dimension', () => {
    const built = buildElevationSnapshot([RECORDED, UNRECORDED] as never, LEVELS, FRONT)!;
    expect(built).not.toBeNull();
    // The old `?? []` shape returned openingsUnrecordedWallIds-less output with
    // w_unrecorded silently contributing "no openings".
    expect(built.openingsUnrecordedWallIds).toEqual(['w_unrecorded']);
    expect(built.snapshot.openings.map((o) => o.id)).toEqual(['win_1']);
    // Geometry stays real: both walls span the extent.
    expect(built.snapshot.hMin).toBe(0);
    expect(built.snapshot.hMax).toBe(10);
  });

  it('negative control: a PRESENT empty opening set is NOT reported unrecorded', () => {
    const built = buildElevationSnapshot([RECORDED, RECORDED_EMPTY] as never, LEVELS, FRONT)!;
    expect(built.openingsUnrecordedWallIds).toEqual([]);
  });
});

describe('buildEvalSnapshot — unrecorded opening sets fire the refusal callback (GR-10)', () => {
  it('reports the unrecorded wall and keeps its geometry; no phantom doors/windows', () => {
    const unrecorded: string[] = [];
    const snap = buildEvalSnapshot([RECORDED, UNRECORDED] as never, 'L0', (id) => unrecorded.push(id));
    // The old `?? []` shape never reported; this assertion fails against it.
    expect(unrecorded).toEqual(['w_unrecorded']);
    expect(snap.walls.has('w_unrecorded')).toBe(true); // run geometry is real
    expect(snap.windows.has('win_1')).toBe(true);
    expect(snap.windows.size).toBe(1);
  });

  it('negative control: a PRESENT empty opening set does not fire the callback', () => {
    const unrecorded: string[] = [];
    buildEvalSnapshot([RECORDED_EMPTY] as never, 'L0', (id) => unrecorded.push(id));
    expect(unrecorded).toEqual([]);
  });
});

describe('openingTargets — a wall with an unrecorded opening set refuses its tags, visibly (GR-10)', () => {
  const anchorOf = (): null => null;
  const categories = new Set(['door', 'window']) as never;

  it('fires the collector and yields NO targets for an unrecorded wall', () => {
    const collected: string[] = [];
    const out = openingTargets(
      {} as never, UNRECORDED as never, categories, 'type', anchorOf as never,
      (id) => collected.push(id),
    );
    expect(out).toEqual([]);
    // The old `?? []` shape yielded [] here too — but told NOBODY. The
    // collector call is the observable difference.
    expect(collected).toEqual(['w_unrecorded']);
  });

  it('negative control: a PRESENT empty opening set yields no targets AND no report', () => {
    const collected: string[] = [];
    const out = openingTargets(
      {} as never, RECORDED_EMPTY as never, categories, 'type', anchorOf as never,
      (id) => collected.push(id),
    );
    expect(out).toEqual([]);
    expect(collected).toEqual([]);
  });
});
