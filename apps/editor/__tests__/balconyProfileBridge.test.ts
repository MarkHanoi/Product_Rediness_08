// §FEAT-BALCONY-COMPOUND (L-5607) — the PROFILE-EDIT bridge's decision half.
//
// The founder: *"as we do with the edit profile feature, the user could after change
// the shape, and the floor finish and railings should adapt."*
//
// ⭐ WHAT IS TESTED HERE, AND WHY IT IS THE DECISION AND NOT THE DISPATCH.
// `decideBalconyProfileUpdate` is pure — a slab id plus an injected view of the model
// in, a decision out. Every genuinely tricky judgement lives in it: is this slab a
// balcony's plate or one of the OTHER members; does the legacy `{x, y}` polygon map to
// the balcony's `{x, y, z}` boundary correctly; is the host re-resolved rather than
// remembered; how many NEW railing ids does the new shape need. All four are the sort
// of thing that ships wrong and is discovered in a browser, so all four are pinned
// here where they can be run in a second.
//
// ⚠ WHAT IS **NOT** TESTED, AND IS NOT CLAIMED: that `bim-slab-updated` actually fires
// on a real Edit-Profile gesture, that the legacy stores this bridge reads are
// populated at that moment, or that the re-derived finish and railings reach a MESH.
// Those need a browser. `attachBalconyProfileBridge` is three lines around this
// function precisely so the untestable part is as small as possible.

import { describe, expect, it, vi } from 'vitest';
import {
  decideBalconyProfileUpdate,
  handleSlabUpdated,
  type BalconyProfileBridgeDeps,
} from '../src/engine/balconyProfileBridge.js';

const BALCONY = 'balcony_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const SLAB = 'slab_01ARZ3NDEKTSV4RRFFQ69G5FB0';
const FLOOR = 'floor_01ARZ3NDEKTSV4RRFFQ69G5FB1';
const RAILS = [
  'handrail_01ARZ3NDEKTSV4RRFFQ69G5FB2',
  'handrail_01ARZ3NDEKTSV4RRFFQ69G5FB3',
  'handrail_01ARZ3NDEKTSV4RRFFQ69G5FB4',
];
const HOST_WALL = 'wall_01ARZ3NDEKTSV4RRFFQ69G5FB6';

/**
 * The legacy slab polygon convention: `{x, y}` where **y carries world Z**. Getting
 * this wrong lays the balcony flat in the XY plane, which is why B-2 asserts the
 * mapping rather than trusting it.
 */
const DEFAULT_PLAN = [
  { x: 2, y: 0 },
  { x: 3, y: 0 },
  { x: 3, y: 0.5 },
  { x: 2, y: 0.5 },
];

function deps(over: Partial<BalconyProfileBridgeDeps> = {}): BalconyProfileBridgeDeps {
  let n = 0;
  return {
    balconies: () => [
      { id: BALCONY, childrenIds: [SLAB, FLOOR, ...RAILS], hostWallId: HOST_WALL },
    ],
    wallById: (id) =>
      id === HOST_WALL
        ? { id: HOST_WALL, baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }] }
        : undefined,
    slabPolygon: (id) => (id === SLAB ? DEFAULT_PLAN : undefined),
    dispatch: () => Promise.resolve(),
    mintRailingId: () => `handrail_MINTED_${++n}`,
    ...over,
  };
}

describe('§FEAT-BALCONY-COMPOUND — the profile-edit bridge decides correctly', () => {
  it('B-1: a slab that belongs to NO balcony is left completely alone', () => {
    // The overwhelmingly common case: this listener fires on EVERY slab edit in the
    // project. It must be a cheap, total no-op for all of them.
    expect(decideBalconyProfileUpdate('slab_01ARZ3NDEKTSV4RRFFQ69G5FC9', deps())).toEqual({
      kind: 'not-a-balcony',
    });
  });

  it('B-2: ⭐ a balcony PLATE edit becomes an updateProfile — with the axes mapped right', () => {
    const d = decideBalconyProfileUpdate(SLAB, deps());
    expect(d.kind).toBe('update');
    if (d.kind !== 'update') return;

    expect(d.payload.balconyId).toBe(BALCONY);
    // The legacy `{x, y}` polygon (y = world Z) must land as `{x, y: datum, z}`.
    // A naive `{x: p.x, y: p.y, z: 0}` would lay the balcony flat in the XY plane —
    // a defect that looks like nothing in plan and like a wall in 3-D.
    expect(d.payload.boundary).toEqual([
      { x: 2, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
      { x: 3, y: 0, z: 0.5 },
      { x: 2, y: 0, z: 0.5 },
    ]);
  });

  it('B-3: ⭐ the HOST is RE-RESOLVED from the wall store, never remembered', () => {
    // The wall may have moved since the balcony was placed. The free-edge rule must be
    // measured against where the wall IS — the same reason there is no stored
    // `hostEdgeIndex`.
    const moved = decideBalconyProfileUpdate(
      SLAB,
      deps({
        wallById: () => ({ id: HOST_WALL, baseLine: [{ x: 0, z: 9 }, { x: 6, z: 9 }] }),
      }),
    );
    expect(moved.kind).toBe('update');
    if (moved.kind !== 'update') return;
    expect(moved.payload.hostSegment).toEqual({ a: { x: 0, z: 9 }, b: { x: 6, z: 9 } });
    // ...and because the wall is now 9 m away, NO edge of this ring is a host edge, so
    // the balcony needs FOUR rails and it has three — one new id.
    expect(moved.payload.addedRailingIds).toEqual(['handrail_MINTED_1']);
  });

  it('B-4: a reshape that keeps the edge count needs NO new ids — survivors are reused', () => {
    // This is the common case (dragging one vertex), and reusing the records is what
    // preserves the per-rail edits `UpdateBalconyProfileHandler` is careful about.
    const d = decideBalconyProfileUpdate(SLAB, deps());
    expect(d.kind).toBe('update');
    if (d.kind !== 'update') return;
    expect(d.payload.addedRailingIds).toBeUndefined();
  });

  it('B-5: an edit to a balcony MEMBER that is not the plate does NOT re-derive', () => {
    // A balcony owns exactly one slab. An event carrying any other member id means
    // something else changed, and re-deriving the compound from it would be wrong.
    expect(decideBalconyProfileUpdate(FLOOR, deps())).toEqual({
      kind: 'not-the-plate',
      balconyId: BALCONY,
    });
  });

  it('B-6: ⛔ an UNREADABLE polygon is refused — absent is not empty', () => {
    // [[context-data-honesty-family]]. Re-deriving from a guess would collapse a real
    // balcony to nothing, and the user would have no idea why.
    expect(decideBalconyProfileUpdate(SLAB, deps({ slabPolygon: () => undefined }))).toEqual({
      kind: 'no-polygon',
      balconyId: BALCONY,
    });
  });

  it('B-7: a DEGENERATE outline is refused before dispatch, not after', () => {
    // The same 0.01 m² floor `UpdateSlabPolygonCommand.canExecute` and the `Balcony`
    // schema both apply. Catching it here costs one rejected dispatch rather than an
    // exception the user meets seconds later with no context.
    const d = decideBalconyProfileUpdate(
      SLAB,
      deps({
        slabPolygon: () => [
          { x: 2, y: 0 },
          { x: 2.01, y: 0 },
          { x: 2.01, y: 0.01 },
        ],
      }),
    );
    expect(d).toEqual({ kind: 'degenerate', balconyId: BALCONY });
  });

  it('B-8: a balcony with NO host wall still updates — railed all round', () => {
    const d = decideBalconyProfileUpdate(
      SLAB,
      deps({
        balconies: () => [{ id: BALCONY, childrenIds: [SLAB, FLOOR, ...RAILS] }],
      }),
    );
    expect(d.kind).toBe('update');
    if (d.kind !== 'update') return;
    expect(d.payload.hostSegment).toBeUndefined();
    // Four free edges, three existing rails → exactly one new id. The SAFE answer.
    expect(d.payload.addedRailingIds).toEqual(['handrail_MINTED_1']);
  });

  it('B-9: handleSlabUpdated DISPATCHES exactly once, and only for a plate edit', () => {
    const dispatch = vi.fn(() => Promise.resolve());
    handleSlabUpdated(SLAB, deps({ dispatch }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]![0]).toBe('balcony.updateProfile');

    dispatch.mockClear();
    handleSlabUpdated(FLOOR, deps({ dispatch }));
    handleSlabUpdated('slab_01ARZ3NDEKTSV4RRFFQ69G5FC9', deps({ dispatch }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('B-10: a REJECTED updateProfile is reported, never swallowed', () => {
    // A compound whose members silently stopped following its plate is the C84 §8.i
    // defect, and a swallowed rejection is exactly how it would go unnoticed.
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    handleSlabUpdated(SLAB, deps({ dispatch: () => Promise.reject(new Error('nope')) }));
    return Promise.resolve().then(() => {
      expect(err).toHaveBeenCalled();
      err.mockRestore();
    });
  });
});
