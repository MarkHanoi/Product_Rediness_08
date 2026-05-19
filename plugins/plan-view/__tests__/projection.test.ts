// projection unit tests (S29 / ADR-0028).

import { describe, expect, it } from 'vitest';
import { Wall, Slab, Door, createId } from '@pryzm/plugin-sdk';
import { projectPlanScene } from '../src/projection.js';

function wallOnLevel(levelId: string, opts: Partial<{ a: { x: number; y: number; z: number }; b: { x: number; y: number; z: number }; thickness: number; openings: Wall['openings'] }> = {}): Wall {
  const wallId = createId('wall');
  const a = opts.a ?? { x: 0, y: 0, z: 0 };
  const b = opts.b ?? { x: 4, y: 0, z: 0 };
  const openings = opts.openings ?? [];
  return Wall.parse({
    id: wallId,
    levelId,
    baseLine: [a, b],
    thickness: opts.thickness ?? 0.2,
    openings,
    childrenIds: openings.map((o) => o.elementId),
  });
}

function slabOnLevel(levelId: string): Slab {
  return Slab.parse({
    id: createId('slab'),
    levelId,
    boundary: [
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 0, z: 0 },
      { x: 5, y: 0, z: 4 },
      { x: 0, y: 0, z: 4 },
    ],
  });
}

describe('projectPlanScene', () => {
  it('returns empty scene for empty input', () => {
    const out = projectPlanScene({ walls: [], slabs: [], doors: [], levelId: 'L1' });
    expect(out.wallSegments).toHaveLength(0);
    expect(out.slabOutlines).toHaveLength(0);
    expect(out.doorBreaks).toHaveLength(0);
  });

  it('filters walls by levelId', () => {
    const w1 = wallOnLevel('L1');
    const w2 = wallOnLevel('L2');
    const out = projectPlanScene({ walls: [w1, w2], slabs: [], doors: [], levelId: 'L1' });
    expect(out.wallSegments).toHaveLength(1);
    expect(out.wallSegments[0]!.elementId).toBe(w1.id);
  });

  it('emits wall segments with XZ→XY mapping and thickness', () => {
    const w = wallOnLevel('L1', {
      a: { x: 1, y: 0, z: 2 },
      b: { x: 5, y: 0, z: 7 },
      thickness: 0.3,
    });
    const out = projectPlanScene({ walls: [w], slabs: [], doors: [], levelId: 'L1' });
    expect(out.wallSegments[0]).toMatchObject({
      ax: 1, ay: 2, bx: 5, by: 7, thickness: 0.3, kind: 'wall',
    });
  });

  it('filters slabs by levelId and emits XZ→XY polygon points', () => {
    const sA = slabOnLevel('L1');
    const sB = slabOnLevel('L2');
    const out = projectPlanScene({ walls: [], slabs: [sA, sB], doors: [], levelId: 'L1' });
    expect(out.slabOutlines).toHaveLength(1);
    expect(out.slabOutlines[0]!.points).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 4 },
      { x: 0, y: 4 },
    ]);
  });

  it('emits a door break that lies along the host wall baseline', () => {
    const wallId = createId('wall');
    const doorElementId = createId('door');
    const opening = {
      id: 'op1',
      type: 'door' as const,
      doorType: 'single' as const,
      offset: 1.0,
      width: 0.9,
      height: 2.1,
      sillHeight: 0,
      elementId: doorElementId,
    };
    const wall = Wall.parse({
      id: wallId,
      levelId: 'L1',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
      thickness: 0.2,
      openings: [opening],
      childrenIds: [doorElementId],
    });
    const door = Door.parse({
      id: doorElementId,
      wallId,
      openingId: 'op1',
      width: 0.9,
      offset: 1.0,
    });
    const out = projectPlanScene({ walls: [wall], slabs: [], doors: [door], levelId: 'L1' });
    expect(out.doorBreaks).toHaveLength(1);
    expect(out.doorBreaks[0]).toMatchObject({
      kind: 'door-break',
      ax: 1, ay: 0,
      bx: 1.9, by: 0,
      thickness: 0.2,
    });
  });

  it('skips door whose host wall is unknown', () => {
    const door = Door.parse({
      wallId: createId('wall'),
      openingId: 'op1',
      width: 0.9,
      offset: 1.0,
    });
    const out = projectPlanScene({ walls: [], slabs: [], doors: [door], levelId: 'L1' });
    expect(out.doorBreaks).toHaveLength(0);
  });

  it('clamps the door break to the host wall length', () => {
    const wallId = createId('wall');
    const doorElementId = createId('door');
    const opening = {
      id: 'op1',
      type: 'door' as const,
      offset: 4.5,
      width: 1.5,
      height: 2.1,
      sillHeight: 0,
      elementId: doorElementId,
    };
    const wall = Wall.parse({
      id: wallId,
      levelId: 'L1',
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
      thickness: 0.2,
      openings: [opening],
      childrenIds: [doorElementId],
    });
    const door = Door.parse({ id: doorElementId, wallId, openingId: 'op1', offset: 4.5, width: 1.5 });
    const out = projectPlanScene({ walls: [wall], slabs: [], doors: [door], levelId: 'L1' });
    expect(out.doorBreaks[0]!.bx).toBeCloseTo(5, 6);
  });
});
