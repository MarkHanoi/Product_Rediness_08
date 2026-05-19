// edge-projection — pure classifier snapshot tests (S30).
//
// Spec: `phases/PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md` §S30.
//
// TEST STRATEGY
// ─────────────────────────────────────────────────────────────────────────────
// 1. Snapshot tests — committed baseline that CI hard-fails on drift.
// 2. Structural assertions — geometry invariants that don't rely on exact
//    floating-point values (pure snapshots can hide regressions in kind/count).
// 3. Interval helper unit tests — deterministic math, no Wall schema needed.
// 4. Node byte-identity note: vitest runs in Node; the browser worker must
//    produce the same output.  Both targets share this exact test file via
//    the browser test harness (see apps/bench/visual-diff.mjs).

import { describe, expect, it } from 'vitest';
import { Wall, Door, Window, createId } from '@pryzm/schemas';
import {
  projectWallEdges,
  _mergeIntervals,
  _invertIntervals,
  _groupByWall,
  type Edge2D,
} from '../src/edge-projection.js';

// ── Fixture helpers ──────────────────────────────────────────────────────────

function makeWall(overrides: Partial<Wall> = {}): Wall {
  return Wall.parse({
    id: createId('wall'),
    levelId: 'L1',
    baseLine: [
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
    ],
    height: 2.8,
    thickness: 0.2,
    baseOffset: 0,
    openings: [],
    ...overrides,
  });
}

function makeDoor(wallId: string, overrides: Partial<Door> = {}): Door {
  return Door.parse({
    id: createId('door'),
    levelId: 'L1',
    wallId,
    offset: 1.0,
    width: 0.9,
    height: 2.1,
    sillHeight: 0,
    ...overrides,
  });
}

function makeWindow(wallId: string, overrides: Partial<Window> = {}): Window {
  return Window.parse({
    id: createId('window'),
    levelId: 'L1',
    wallId,
    offset: 0.5,
    width: 1.2,
    height: 1.2,
    sillHeight: 0.9,
    ...overrides,
  });
}

// ── Interval helper tests ────────────────────────────────────────────────────

describe('_mergeIntervals', () => {
  it('empty input returns empty', () => {
    expect(_mergeIntervals([])).toEqual([]);
  });

  it('single interval passes through', () => {
    expect(_mergeIntervals([[1, 3]])).toEqual([[1, 3]]);
  });

  it('two non-overlapping intervals stay separate', () => {
    expect(_mergeIntervals([[1, 2], [3, 4]])).toEqual([[1, 2], [3, 4]]);
  });

  it('two overlapping intervals merge', () => {
    expect(_mergeIntervals([[1, 3], [2, 4]])).toEqual([[1, 4]]);
  });

  it('three intervals — first two merge, last stays separate', () => {
    expect(_mergeIntervals([[0, 2], [1, 3], [5, 7]])).toEqual([[0, 3], [5, 7]]);
  });

  it('touching intervals merge (shared endpoint)', () => {
    expect(_mergeIntervals([[0, 2], [2, 4]])).toEqual([[0, 4]]);
  });

  it('unsorted input is handled', () => {
    expect(_mergeIntervals([[3, 5], [0, 2], [1, 4]])).toEqual([[0, 5]]);
  });
});

describe('_invertIntervals', () => {
  it('no cuts → entire range is solid', () => {
    expect(_invertIntervals([], 0, 4)).toEqual([[0, 4]]);
  });

  it('one cut in the middle → two solid pieces', () => {
    expect(_invertIntervals([[1, 3]], 0, 4)).toEqual([[0, 1], [3, 4]]);
  });

  it('cut at start → one solid piece at the end', () => {
    expect(_invertIntervals([[0, 1]], 0, 4)).toEqual([[1, 4]]);
  });

  it('cut at end → one solid piece at the start', () => {
    expect(_invertIntervals([[3, 4]], 0, 4)).toEqual([[0, 3]]);
  });

  it('cut covers whole range → no solid', () => {
    expect(_invertIntervals([[0, 4]], 0, 4)).toEqual([]);
  });

  it('two cuts → three solid pieces', () => {
    expect(_invertIntervals([[1, 2], [3, 3.5]], 0, 4)).toEqual([
      [0, 1], [2, 3], [3.5, 4],
    ]);
  });
});

describe('_groupByWall', () => {
  it('groups items by key', () => {
    const items = [
      { wallId: 'A', v: 1 },
      { wallId: 'B', v: 2 },
      { wallId: 'A', v: 3 },
    ];
    const map = _groupByWall(items, (i) => i.wallId);
    expect(map.get('A')).toHaveLength(2);
    expect(map.get('B')).toHaveLength(1);
  });
});

// ── Edge-projection structural tests ────────────────────────────────────────

describe('projectWallEdges — structural invariants', () => {
  it('wall below cut plane produces no edges', () => {
    const wall = makeWall({ baseLine: [{ x: 0, y: 10, z: 0 }, { x: 4, y: 10, z: 0 }] });
    const edges = projectWallEdges({ walls: [wall], doors: [], windows: [], levelZ: 0 });
    expect(edges).toHaveLength(0);
  });

  it('wall above cut plane produces no edges', () => {
    const wall = makeWall({
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
      baseOffset: 5,
      height: 2.8,
    });
    const edges = projectWallEdges({ walls: [wall], doors: [], windows: [], levelZ: 0 });
    expect(edges).toHaveLength(0);
  });

  it('simple wall produces outer + inner + 2 poche-boundary edges', () => {
    const wall = makeWall();
    const edges = projectWallEdges({ walls: [wall], doors: [], windows: [], levelZ: 0 });
    const kinds = edges.map((e) => e.kind);
    expect(kinds.filter((k) => k === 'wall-outer')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'wall-inner')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'poche-boundary')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'opening')).toHaveLength(0);
  });

  it('wall-outer line weight is 0.5', () => {
    const wall = makeWall();
    const edges = projectWallEdges({ walls: [wall], doors: [], windows: [], levelZ: 0 });
    const outer = edges.find((e) => e.kind === 'wall-outer')!;
    expect(outer.lineWeight).toBe(0.5);
  });

  it('wall-inner line weight is 0.25', () => {
    const wall = makeWall();
    const edges = projectWallEdges({ walls: [wall], doors: [], windows: [], levelZ: 0 });
    const inner = edges.find((e) => e.kind === 'wall-inner')!;
    expect(inner.lineWeight).toBe(0.25);
  });

  it('opening edge line weight is 0.1', () => {
    const wall = makeWall();
    const door = makeDoor(wall.id);
    const edges = projectWallEdges({ walls: [wall], doors: [door], windows: [], levelZ: 0 });
    const openingEdges = edges.filter((e) => e.kind === 'opening');
    expect(openingEdges.length).toBeGreaterThan(0);
    for (const e of openingEdges) {
      expect(e.lineWeight).toBe(0.1);
    }
  });

  it('door at sillHeight=0 intersecting cut plane creates opening', () => {
    const wall = makeWall();
    const door = makeDoor(wall.id, { offset: 1.0, width: 0.9, height: 2.1, sillHeight: 0 });
    const edges = projectWallEdges({ walls: [wall], doors: [door], windows: [], levelZ: 0 });
    expect(edges.some((e) => e.kind === 'opening')).toBe(true);
    // Should have 2 jamb edges (one at each side of the opening)
    expect(edges.filter((e) => e.kind === 'opening')).toHaveLength(2);
  });

  it('window above cut plane (sillHeight > cutHeight) does NOT create opening', () => {
    const wall = makeWall();
    // window sill at 1.2m, cut plane at 1.0m — window is above cut
    const win = makeWindow(wall.id, { sillHeight: 1.2, height: 1.2 });
    const edges = projectWallEdges({ walls: [wall], doors: [], windows: [win], levelZ: 0 });
    expect(edges.some((e) => e.kind === 'opening')).toBe(false);
  });

  it('window straddling cut plane creates opening', () => {
    const wall = makeWall();
    // window sill at 0.5m, height 1.0m → spans 0.5–1.5m; cut at 1.0m → intersects
    const win = makeWindow(wall.id, { sillHeight: 0.5, height: 1.0 });
    const edges = projectWallEdges({ walls: [wall], doors: [], windows: [win], levelZ: 0 });
    expect(edges.some((e) => e.kind === 'opening')).toBe(true);
  });

  it('door fully filled wall → creates two solid wall segments flanking the door', () => {
    const wall = makeWall();
    const door = makeDoor(wall.id, { offset: 1.0, width: 0.9, height: 2.1, sillHeight: 0 });
    const edges = projectWallEdges({ walls: [wall], doors: [door], windows: [], levelZ: 0 });
    expect(edges.filter((e) => e.kind === 'wall-outer')).toHaveLength(2);
    expect(edges.filter((e) => e.kind === 'wall-inner')).toHaveLength(2);
  });

  it('elementId on all edges matches wall.id', () => {
    const wall = makeWall();
    const edges = projectWallEdges({ walls: [wall], doors: [], windows: [], levelZ: 0 });
    for (const e of edges) {
      expect(e.elementId).toBe(wall.id);
    }
  });

  it('outer face is offset from baseline by +thickness/2 in left-normal direction', () => {
    const wall = makeWall({
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
      thickness: 0.2,
    });
    const edges = projectWallEdges({ walls: [wall], doors: [], windows: [], levelZ: 0 });
    const outer = edges.find((e) => e.kind === 'wall-outer')!;
    // wall along +X: left-normal is (nx=0, nz=1); outer face at plan-y = +0.1
    expect(outer.start.y).toBeCloseTo(0.1, 9);
    expect(outer.end.y).toBeCloseTo(0.1, 9);
  });

  it('inner face is offset from baseline by -thickness/2 in left-normal direction', () => {
    const wall = makeWall({
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
      thickness: 0.2,
    });
    const edges = projectWallEdges({ walls: [wall], doors: [], windows: [], levelZ: 0 });
    const inner = edges.find((e) => e.kind === 'wall-inner')!;
    // inner face at plan-y = -0.1
    expect(inner.start.y).toBeCloseTo(-0.1, 9);
    expect(inner.end.y).toBeCloseTo(-0.1, 9);
  });
});

// ── Snapshot tests (committed baseline — CI hard-fails on drift) ─────────────
// IDs use the Crockford base-32 ULID format required by the Wall/Door/Window
// schemas: `<prefix>_` + exactly 26 chars from [0-9A-HJKMNP-TV-Z].

const W01 = 'wall_00000000000000000000000001' as const;
const W02 = 'wall_00000000000000000000000002' as const;
const W03 = 'wall_00000000000000000000000003' as const;
const W04 = 'wall_00000000000000000000000004' as const;
const W05 = 'wall_00000000000000000000000005' as const;
const W06 = 'wall_00000000000000000000000006' as const;
const W07 = 'wall_00000000000000000000000007' as const;
const W08 = 'wall_00000000000000000000000008' as const;
const D01 = 'door_00000000000000000000000001' as const;
const D02 = 'door_00000000000000000000000002' as const;
const V01 = 'window_00000000000000000000000001' as const;
const V02 = 'window_00000000000000000000000002' as const;

describe('projectWallEdges — snapshots', () => {
  it('fixture 1: single straight wall, no openings', () => {
    const wall = Wall.parse({
      id: W01,
      levelId: 'L1',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
      height: 3.0,
      thickness: 0.25,
      baseOffset: 0,
      openings: [],
    });
    const edges = projectWallEdges({ walls: [wall], doors: [], windows: [], levelZ: 0 });
    expect(edges).toMatchSnapshot();
  });

  it('fixture 2: wall with one door opening', () => {
    const wall = Wall.parse({
      id: W02,
      levelId: 'L1',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
      height: 3.0,
      thickness: 0.25,
      baseOffset: 0,
      openings: [],
    });
    const door = Door.parse({
      id: D01,
      levelId: 'L1',
      wallId: wall.id,
      offset: 1.5,
      width: 0.9,
      height: 2.1,
      sillHeight: 0,
    });
    const edges = projectWallEdges({ walls: [wall], doors: [door], windows: [], levelZ: 0 });
    expect(edges).toMatchSnapshot();
  });

  it('fixture 3: wall with window above cut plane (no opening)', () => {
    const wall = Wall.parse({
      id: W03,
      levelId: 'L1',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
      height: 3.0,
      thickness: 0.25,
      baseOffset: 0,
      openings: [],
    });
    const win = Window.parse({
      id: V01,
      levelId: 'L1',
      wallId: wall.id,
      offset: 1.0,
      width: 1.2,
      height: 1.2,
      sillHeight: 1.2, // above the 1m cut plane
    });
    const edges = projectWallEdges({ walls: [wall], doors: [], windows: [win], levelZ: 0 });
    expect(edges).toMatchSnapshot();
  });

  it('fixture 4: two perpendicular walls (L-junction)', () => {
    const wallA = Wall.parse({
      id: W04,
      levelId: 'L1',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
      height: 2.8,
      thickness: 0.2,
      baseOffset: 0,
      openings: [],
    });
    const wallB = Wall.parse({
      id: W05,
      levelId: 'L1',
      baseLine: [{ x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }],
      height: 2.8,
      thickness: 0.2,
      baseOffset: 0,
      openings: [],
    });
    const edges = projectWallEdges({
      walls: [wallA, wallB],
      doors: [],
      windows: [],
      levelZ: 0,
    });
    expect(edges).toMatchSnapshot();
  });

  it('fixture 5: door adjacent to wall start (opening starts at t=0)', () => {
    const wall = Wall.parse({
      id: W06,
      levelId: 'L1',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
      height: 3.0,
      thickness: 0.2,
      baseOffset: 0,
      openings: [],
    });
    const door = Door.parse({
      id: D02,
      levelId: 'L1',
      wallId: wall.id,
      offset: 0,
      width: 1.0,
      height: 2.1,
      sillHeight: 0,
    });
    const edges = projectWallEdges({ walls: [wall], doors: [door], windows: [], levelZ: 0 });
    expect(edges).toMatchSnapshot();
  });

  it('fixture 6: wall with inline opening (wall.openings array)', () => {
    const inlineDoorId = 'door_00000000000000000000000099';
    const wall = Wall.parse({
      id: W07,
      levelId: 'L1',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
      height: 3.0,
      thickness: 0.3,
      baseOffset: 0,
      childrenIds: [inlineDoorId],
      openings: [
        {
          id: 'op_00000000000000000000000001',
          type: 'door',
          offset: 2.0,
          width: 1.0,
          height: 2.1,
          sillHeight: 0,
          elementId: inlineDoorId,
        },
      ],
    });
    const edges = projectWallEdges({ walls: [wall], doors: [], windows: [], levelZ: 0 });
    expect(edges).toMatchSnapshot();
  });

  it('fixture 7: custom cut height (1.5m)', () => {
    const wall = Wall.parse({
      id: W08,
      levelId: 'L1',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
      height: 3.0,
      thickness: 0.2,
      baseOffset: 0,
      openings: [],
    });
    const win = Window.parse({
      id: V02,
      levelId: 'L1',
      wallId: wall.id,
      offset: 1.0,
      width: 1.2,
      height: 1.2,
      sillHeight: 1.0, // sill at 1.0m; at cutHeight=1.5m → 1.0+1.2=2.2m top; intersects
    });
    const edges = projectWallEdges({
      walls: [wall],
      doors: [],
      windows: [win],
      levelZ: 0,
      cutHeight: 1.5,
    });
    expect(edges).toMatchSnapshot();
  });
});
