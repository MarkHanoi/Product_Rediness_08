// GR-10 (`[]`-means-unknown ledger · C75 §1.4 · C78 §1.4/§8.1 · C71 §4.4) —
// the LIVE reconcile (setOut / reconcileDimensions) stops treating walls whose
// opening sets were never recorded as opening-less.
//
// Two seams, the same family as openingsUnrecordedHonesty.spec.ts (the button
// path, f1595c29):
//   · visibleElementIds — an unrecorded wall's hosted openings cannot be
//     enumerated into the visible set; the old `?? []` classed them INVISIBLE,
//     which is what let the reconcile orphan-delete real annotations.
//   · buildDimensionCandidates — the old `?? []` handed the engine "no
//     openings" about walls nobody measured.
// Every "unrecorded" assertion below fails against the `?? []` shape, which
// reported nothing and named nobody.

import { describe, it, expect, beforeEach, vi } from 'vitest';

let VIEW_DEF: Record<string, unknown>;
let WALLS: unknown[];
const wallStore = { getAll: () => WALLS };

vi.mock('@pryzm/core-app-model', async (orig) => {
  const actual = await orig<typeof import('@pryzm/core-app-model')>();
  return {
    ...actual,
    storeRegistry: { getStoreForType: (t: string) => (t === 'wall' ? wallStore : undefined) },
    viewDefinitionStore: { get: (id: string) => (id === 'v1' ? VIEW_DEF : undefined), has: () => true },
    elementCodeStore: { getCode: () => undefined },
    doorSystemTypeStore: { getById: () => undefined },
    windowSystemTypeStore: { getById: () => undefined },
  };
});

import { visibleElementIds } from '../setOut';
import { buildDimensionCandidates } from '../reconcileDimensions';

const WIN = { elementId: 'win_1', type: 'window', offset: 2, width: 1.2, height: 1.4, sillHeight: 0.9 };

const RECORDED = {
  id: 'w_recorded', levelId: 'L0', height: 3, thickness: 0.2,
  baseLine: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }],
  openings: [WIN],
};
const RECORDED_EMPTY = {
  id: 'w_empty', levelId: 'L0', height: 3, thickness: 0.2,
  baseLine: [{ x: 0, y: 0, z: 4 }, { x: 10, y: 0, z: 4 }],
  openings: [] as unknown[], // PRESENT and empty — a real "no openings" answer
};
// The opening set of this wall was NEVER RECORDED.
const UNRECORDED = {
  id: 'w_unrecorded', levelId: 'L0', height: 3, thickness: 0.2,
  baseLine: [{ x: 0, y: 0, z: 8 }, { x: 10, y: 0, z: 8 }],
};

const PLAN_VIEW = { id: 'v1', viewType: 'plan', spatial: { levelId: 'L0' }, output: { scale: 100 } };

beforeEach(() => {
  VIEW_DEF = PLAN_VIEW;
  WALLS = [RECORDED, RECORDED_EMPTY, UNRECORDED];
  (window as unknown as { wallStore: unknown }).wallStore = wallStore;
});

describe('visibleElementIds — unrecorded opening sets are NAMED, not classed invisible (GR-10)', () => {
  it('names the unrecorded wall; recorded openings still enumerate', () => {
    const unrecorded: string[] = [];
    const ids = visibleElementIds('v1', (id) => unrecorded.push(id))!;
    // The old `?? []` shape reported nothing here — this assertion fails against it.
    expect(unrecorded).toEqual(['w_unrecorded']);
    expect(ids.has('w_unrecorded')).toBe(true); // the WALL itself is visible
    expect(ids.has('win_1')).toBe(true);
  });

  it('negative control: a PRESENT empty opening set is NOT reported unrecorded', () => {
    const unrecorded: string[] = [];
    WALLS = [RECORDED, RECORDED_EMPTY];
    visibleElementIds('v1', (id) => unrecorded.push(id));
    expect(unrecorded).toEqual([]);
  });
});

describe('buildDimensionCandidates — unrecorded opening sets fire the refusal callback (GR-10)', () => {
  it('plan branch: reports the unrecorded wall; the recorded window still dimensions', () => {
    const unrecorded = new Set<string>();
    const out = buildDimensionCandidates(
      PLAN_VIEW as never,
      [RECORDED, UNRECORDED] as never,
      [{ id: 'L0', name: 'Ground', elevation: 0 }] as never,
      (id) => unrecorded.add(id),
    );
    // The old `?? []` shape never reported; this assertion fails against it.
    expect([...unrecorded]).toEqual(['w_unrecorded']);
    expect(out.length).toBeGreaterThan(0);
  });

  it('negative control: PRESENT empty opening sets fire nothing', () => {
    const unrecorded = new Set<string>();
    buildDimensionCandidates(
      PLAN_VIEW as never,
      [RECORDED, RECORDED_EMPTY] as never,
      [{ id: 'L0', name: 'Ground', elevation: 0 }] as never,
      (id) => unrecorded.add(id),
    );
    expect(unrecorded.size).toBe(0);
  });
});
