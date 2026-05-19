// poche — pure poche-fill snapshot tests (S30).
//
// Spec: `phases/PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md` §S30.
// SPEC-04 §2.3 — hatch alignment rule verified in structural tests.
//
// TEST STRATEGY
// ─────────────────────────────────────────────────────────────────────────────
// 1. Snapshot tests — committed baseline; CI hard-fails on any diff.
// 2. Structural assertions — polygon closure, vertex count, hatch-angle
//    correctness (SPEC-04 §2.3).
// 3. Node byte-identity: vitest runs in Node; the browser worker uses the
//    same module.  Both targets share this test file.

import { describe, expect, it } from 'vitest';
import { Wall, Door, Window, createId } from '@pryzm/schemas';
import { computePocheFills } from '../src/poche.js';

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

// ── Structural invariant tests ───────────────────────────────────────────────

describe('computePocheFills — structural invariants', () => {
  it('wall below cut plane produces no fills', () => {
    const wall = makeWall({
      baseLine: [{ x: 0, y: 10, z: 0 }, { x: 4, y: 10, z: 0 }],
    });
    const fills = computePocheFills({ walls: [wall], doors: [], windows: [], levelZ: 0 });
    expect(fills).toHaveLength(0);
  });

  it('simple wall produces exactly one fill', () => {
    const wall = makeWall();
    const fills = computePocheFills({ walls: [wall], doors: [], windows: [], levelZ: 0 });
    expect(fills).toHaveLength(1);
  });

  it('fill polygon has exactly 4 vertices', () => {
    const wall = makeWall();
    const fills = computePocheFills({ walls: [wall], doors: [], windows: [], levelZ: 0 });
    expect(fills[0]!.polygon).toHaveLength(4);
  });

  it('fill polygon is NOT repeated-close (last vertex ≠ first vertex)', () => {
    const wall = makeWall();
    const fills = computePocheFills({ walls: [wall], doors: [], windows: [], levelZ: 0 });
    const p = fills[0]!.polygon;
    const first = p[0]!;
    const last = p[p.length - 1]!;
    // For a wall along +X, first = {x:0, y:+halfT}, last = {x:0, y:-halfT}.
    // x is the same (both at wall start) but y differs → polygon is open (not repeated-closed).
    expect(last.y).not.toBeCloseTo(first.y, 9);
  });

  it('SPEC-04 §2.3: hatchAngle matches wall baseline angle (wall along X → 0°)', () => {
    const wall = makeWall({
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
    });
    const fills = computePocheFills({ walls: [wall], doors: [], windows: [], levelZ: 0 });
    expect(fills[0]!.hatchAngle).toBeCloseTo(0, 9);
  });

  it('SPEC-04 §2.3: hatchAngle for wall along +Z axis is 90°', () => {
    const wall = makeWall({
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 4 }],
    });
    const fills = computePocheFills({ walls: [wall], doors: [], windows: [], levelZ: 0 });
    expect(fills[0]!.hatchAngle).toBeCloseTo(90, 9);
  });

  it('SPEC-04 §2.3: hatchAngle for diagonal wall is 45°', () => {
    const wall = makeWall({
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }],
    });
    const fills = computePocheFills({ walls: [wall], doors: [], windows: [], levelZ: 0 });
    expect(fills[0]!.hatchAngle).toBeCloseTo(45, 9);
  });

  it('door at cut plane splits wall into two fills', () => {
    const wall = makeWall();
    const door = makeDoor(wall.id, { offset: 1.5, width: 0.9, height: 2.1, sillHeight: 0 });
    const fills = computePocheFills({ walls: [wall], doors: [door], windows: [], levelZ: 0 });
    expect(fills).toHaveLength(2);
  });

  it('window above cut plane (sill > cutHeight) does NOT split the fill', () => {
    const wall = makeWall();
    const win = makeWindow(wall.id, { sillHeight: 1.2, height: 1.2 });
    const fills = computePocheFills({ walls: [wall], doors: [], windows: [win], levelZ: 0 });
    expect(fills).toHaveLength(1);
  });

  it('window straddling cut plane splits the fill', () => {
    const wall = makeWall();
    const win = makeWindow(wall.id, { sillHeight: 0.5, height: 1.0 });
    const fills = computePocheFills({ walls: [wall], doors: [], windows: [win], levelZ: 0 });
    expect(fills).toHaveLength(2);
  });

  it('polygon vertices span the expected plan area (wall along X, thickness 0.2)', () => {
    const wall = makeWall({
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
      thickness: 0.2,
    });
    const fills = computePocheFills({ walls: [wall], doors: [], windows: [], levelZ: 0 });
    const poly = fills[0]!.polygon;
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    // X spans 0–4
    expect(Math.min(...xs)).toBeCloseTo(0, 9);
    expect(Math.max(...xs)).toBeCloseTo(4, 9);
    // Y spans -0.1 to +0.1 (halfT = 0.1)
    expect(Math.min(...ys)).toBeCloseTo(-0.1, 9);
    expect(Math.max(...ys)).toBeCloseTo(0.1, 9);
  });

  it('elementId matches wall.id', () => {
    const wall = makeWall();
    const fills = computePocheFills({ walls: [wall], doors: [], windows: [], levelZ: 0 });
    expect(fills[0]!.elementId).toBe(wall.id);
  });
});

// ── Snapshot tests ───────────────────────────────────────────────────────────
// IDs use the Crockford base-32 ULID format: `<prefix>_` + 26 chars from [0-9A-HJKMNP-TV-Z].

const WP1 = 'wall_00000000000000000000000011' as const;
const WP2 = 'wall_00000000000000000000000012' as const;
const WP3 = 'wall_00000000000000000000000013' as const;
const WP4 = 'wall_00000000000000000000000014' as const;
const WP5 = 'wall_00000000000000000000000015' as const;
const WP6 = 'wall_00000000000000000000000016' as const;
const WP7 = 'wall_00000000000000000000000017' as const;
const DP1 = 'door_00000000000000000000000011' as const;
const DP2 = 'door_00000000000000000000000012' as const;
const VP1 = 'window_00000000000000000000000011' as const;

describe('computePocheFills — snapshots', () => {
  it('fixture 1: single straight wall, no openings', () => {
    const wall = Wall.parse({
      id: WP1,
      levelId: 'L1',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
      height: 3.0,
      thickness: 0.25,
      baseOffset: 0,
      openings: [],
    });
    const fills = computePocheFills({ walls: [wall], doors: [], windows: [], levelZ: 0 });
    expect(fills).toMatchSnapshot();
  });

  it('fixture 2: wall with door opening at mid-span', () => {
    const wall = Wall.parse({
      id: WP2,
      levelId: 'L1',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
      height: 3.0,
      thickness: 0.25,
      baseOffset: 0,
      openings: [],
    });
    const door = Door.parse({
      id: DP1,
      levelId: 'L1',
      wallId: wall.id,
      offset: 2.0,
      width: 0.9,
      height: 2.1,
      sillHeight: 0,
    });
    const fills = computePocheFills({ walls: [wall], doors: [door], windows: [], levelZ: 0 });
    expect(fills).toMatchSnapshot();
  });

  it('fixture 3: diagonal wall at 45° — hatch angle test', () => {
    const wall = Wall.parse({
      id: WP3,
      levelId: 'L1',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }],
      height: 3.0,
      thickness: 0.2,
      baseOffset: 0,
      openings: [],
    });
    const fills = computePocheFills({ walls: [wall], doors: [], windows: [], levelZ: 0 });
    expect(fills).toMatchSnapshot();
  });

  it('fixture 4: two walls with one shared door (only one wall has the door)', () => {
    const wallA = Wall.parse({
      id: WP4,
      levelId: 'L1',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
      height: 2.8,
      thickness: 0.2,
      baseOffset: 0,
      openings: [],
    });
    const wallB = Wall.parse({
      id: WP5,
      levelId: 'L1',
      baseLine: [{ x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }],
      height: 2.8,
      thickness: 0.2,
      baseOffset: 0,
      openings: [],
    });
    const door = Door.parse({
      id: DP2,
      levelId: 'L1',
      wallId: wallA.id,
      offset: 1.5,
      width: 0.9,
      height: 2.1,
      sillHeight: 0,
    });
    const fills = computePocheFills({ walls: [wallA, wallB], doors: [door], windows: [], levelZ: 0 });
    expect(fills).toMatchSnapshot();
  });

  it('fixture 5: custom cut height (2.0m) — window at sill 1.5m is intersected', () => {
    const wall = Wall.parse({
      id: WP6,
      levelId: 'L1',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
      height: 3.0,
      thickness: 0.2,
      baseOffset: 0,
      openings: [],
    });
    const win = Window.parse({
      id: VP1,
      levelId: 'L1',
      wallId: wall.id,
      offset: 1.0,
      width: 1.2,
      height: 1.0,
      sillHeight: 1.5, // sill at 1.5m, top at 2.5m; cut at 2.0m → intersects
    });
    const fills = computePocheFills({
      walls: [wall],
      doors: [],
      windows: [win],
      levelZ: 0,
      cutHeight: 2.0,
    });
    expect(fills).toMatchSnapshot();
  });

  it('fixture 6: wall with inline opening in openings array', () => {
    const inlineDoorId = 'door_00000000000000000000000099';
    const wall = Wall.parse({
      id: WP7,
      levelId: 'L1',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
      height: 3.0,
      thickness: 0.3,
      baseOffset: 0,
      childrenIds: [inlineDoorId],
      openings: [
        {
          id: 'op_poche_001',
          type: 'door',
          offset: 2.5,
          width: 1.0,
          height: 2.1,
          sillHeight: 0,
          elementId: inlineDoorId,
        },
      ],
    });
    const fills = computePocheFills({ walls: [wall], doors: [], windows: [], levelZ: 0 });
    expect(fills).toMatchSnapshot();
  });
});
