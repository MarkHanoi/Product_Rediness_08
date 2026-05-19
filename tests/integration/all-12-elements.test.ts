// 12-element integration smoke (S14-T9).
//
// Spec: `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` §S14.  Walks
// the full element family — wall, slab, door, window, roof,
// curtainwall, grid, column, beam, stair, handrail, ceiling — and
// asserts each kernel producer yields a descriptor that satisfies
// `assertValidDescriptor`.  The intent is breadth-of-coverage, not
// depth: per-family invariants live in the family-specific
// robustness suites.

import { describe, expect, it } from 'vitest';
import {
  produceWall,
  produceSlab,
  produceDoor,
  produceWindow,
  produceRoof,
  produceCurtainWall,
  produceGrid,
  produceColumn,
  produceBeam,
  produceStair,
  produceHandrail,
  produceCeiling,
  assertValidDescriptor,
  NO_JOINS,
  type DoorWorldPlacement,
  type WindowWorldPlacement,
} from '@pryzm/geometry-kernel';
import {
  Wall, Slab, Door, Window, Roof, CurtainWall, Grid,
  Column, Beam, Stair, Handrail, Ceiling, createId,
} from '@pryzm/schemas';

const PLACEMENT_DOOR: DoorWorldPlacement = Object.freeze({
  axis: { x: 1, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  origin: { x: 0, y: 0, z: 0 },
  wallThickness: 0.1,
});
const PLACEMENT_WINDOW: WindowWorldPlacement = Object.freeze({
  axis: { x: 1, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  origin: { x: 0, y: 1, z: 0 },
  wallThickness: 0.1,
});

describe('S14-T9 — 12-element producer smoke', () => {
  it('wall (1) yields a valid descriptor', () => {
    const wall = Wall.parse({ id: createId('wall') });
    const d = produceWall(wall, NO_JOINS, 0);
    assertValidDescriptor(d);
    expect(d.position.length).toBeGreaterThan(0);
  });

  it('slab (2) yields a valid descriptor', () => {
    const slab = Slab.parse({ id: createId('slab') });
    const d = produceSlab(slab, NO_JOINS, 0);
    assertValidDescriptor(d);
    expect(d.position.length).toBeGreaterThan(0);
  });

  it('door (3) yields a valid descriptor', () => {
    const door = Door.parse({
      id: createId('door'),
      wallId: createId('wall'),
      openingId: 'op_1',
    });
    const d = produceDoor(door, PLACEMENT_DOOR);
    assertValidDescriptor(d);
    expect(d.materialKeys.length).toBeGreaterThan(0);
  });

  it('window (4) yields a valid descriptor', () => {
    const win = Window.parse({
      id: createId('window'),
      wallId: createId('wall'),
      openingId: 'op_1',
    });
    const d = produceWindow(win, PLACEMENT_WINDOW);
    assertValidDescriptor(d);
    expect(d.materialKeys.length).toBeGreaterThan(0);
  });

  it('roof (5) yields a valid descriptor', () => {
    const roof = Roof.parse({ id: createId('roof') });
    const d = produceRoof(roof, NO_JOINS, 0);
    assertValidDescriptor(d);
    expect(d.position.length).toBeGreaterThan(0);
  });

  it('curtain wall (6) yields a valid descriptor', () => {
    const cw = CurtainWall.parse({ id: createId('curtainwall') });
    const d = produceCurtainWall(cw, NO_JOINS, 0);
    assertValidDescriptor(d);
    expect(d.position.length).toBeGreaterThan(0);
  });

  it('grid (7) yields a valid descriptor', () => {
    const grid = Grid.parse({
      id: createId('grid'),
      lines: [
        {
          id: 'A', label: 'A', kind: 'linear',
          start: { x: 0, y: 0, z: 0 },
          end: { x: 10, y: 0, z: 0 },
        },
      ],
    });
    const d = produceGrid(grid, NO_JOINS, 0);
    assertValidDescriptor(d);
    expect(d.position.length).toBeGreaterThan(0);
  });

  it('column (8) yields a valid descriptor', () => {
    const column = Column.parse({ id: createId('column') });
    const d = produceColumn(column, NO_JOINS, 0);
    assertValidDescriptor(d);
    expect(d.position.length).toBeGreaterThan(0);
  });

  it('beam (9) yields a valid descriptor', () => {
    const beam = Beam.parse({ id: createId('beam') });
    const d = produceBeam(beam, NO_JOINS, 0);
    assertValidDescriptor(d);
    expect(d.position.length).toBeGreaterThan(0);
  });

  it('stair (10) yields a valid descriptor', () => {
    const stair = Stair.parse({
      id: createId('stair'),
      levelId: 'level:0', topLevelId: 'level:1',
    });
    const d = produceStair(stair, NO_JOINS, 0);
    assertValidDescriptor(d);
    expect(d.position.length).toBeGreaterThan(0);
  });

  it('handrail (11) yields a valid descriptor', () => {
    const handrail = Handrail.parse({ id: createId('handrail') });
    const d = produceHandrail(handrail, NO_JOINS, 0);
    assertValidDescriptor(d);
    expect(d.position.length).toBeGreaterThan(0);
  });

  it('ceiling (12) yields a valid descriptor', () => {
    const ceiling = Ceiling.parse({ id: createId('ceiling') });
    const d = produceCeiling(ceiling, NO_JOINS, 0);
    assertValidDescriptor(d);
    expect(d.position.length).toBeGreaterThan(0);
  });
});
