// Contract 44 — G2: cross-level structural elements MUST NOT bleed through.
//
// Spec: docs/00_NEW_ARCHITECTURE/phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md §S33 line 623.

import { describe, expect, it } from 'vitest';
import { Wall, Door, createId } from '@pryzm/schemas';
import { scopeToLevel, indexWallsById, levelOfDoor } from '@pryzm/plugin-plan-view';

function wall(levelId: string): Wall {
  return Wall.parse({
    id: createId('wall'),
    levelId,
    baseLine: [
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
    ],
    thickness: 0.2,
  });
}

function door(wallId: string): Door {
  return Door.parse({
    id: createId('door'),
    wallId,
    openingId: 'op1',
    width: 0.9,
    offset: 1.5,
  });
}

describe('Contract 44 — G2: structural / hosted elements respect the active level', () => {
  it('a door whose host wall is on L2 does NOT render in L1', () => {
    const wL1 = wall('L1');
    const wL2 = wall('L2');
    const dOnL2 = door(wL2.id);

    const wallsL1 = scopeToLevel([wL1, wL2], 'L1', (w) => w.levelId);
    const wallIdx = indexWallsById([wL1, wL2]);

    // Resolve each door's effective level via its host wall, then scope.
    const doorsScoped = [dOnL2].filter((d) => levelOfDoor(d.wallId, wallIdx) === 'L1');

    expect(wallsL1).toEqual([wL1]);
    expect(doorsScoped).toEqual([]);
  });

  it('an orphan door (host wall missing) is dropped — defence-in-depth', () => {
    const wL1 = wall('L1');
    const ghostWallId = createId('wall'); // schema-valid id, but no wall in the model
    const orphan = door(ghostWallId);
    const wallIdx = indexWallsById([wL1]);
    const filtered = [orphan].filter((d) => levelOfDoor(d.wallId, wallIdx) === 'L1');
    expect(filtered).toEqual([]);
  });
});
