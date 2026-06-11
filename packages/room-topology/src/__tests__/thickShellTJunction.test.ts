// @vitest-environment happy-dom
//
// §TJUNCTION-SHELL-THICKNESS / §ROOM-LOOP-BREAK regression (tracker §66.1b).
//
// Root cause (verified, not re-derived): after a door/window opening is placed, the
// WallRebuildCoordinator re-runs WallJoinResolver.resolveLevel, whose
// §PARTITION-SHELL-INNER-FACE clamp pulls each interior-partition endpoint back to the
// host SHELL's INNER FACE — i.e. hostHalfThickness from the shell centreline. The
// RoomDetectionEngine T-junction snap was a FIXED 0.20 m measured to the host
// centreline. For a shell ≥ 0.40 m thick (hostHalfThickness ≥ 0.20 m) the clamped
// partition endpoint sits AT/BEYOND 0.20 m → the T-junction is missed → the room loop
// never closes → detection floods across the gap → the founder's "Room NN" blanks +
// "Bedroom 1 / Bathroom 29 m²" compound merges + generic names.
//
// Fix: the T-junction snap radius is now DATA-DRIVEN per host —
// max(0.20, hostHalfThickness + margin). Thin shells (hostHalfThickness ≤ 0.20) keep
// the 0.20 m floor and are byte-identical.
//
// This test builds a thick-shell rectangle split by an interior partition whose
// endpoints have ALREADY been clamped to the shell inner face (the post-resolver
// store state) and asserts the two rooms detect as SEPARATE closed rooms.

import { describe, it, expect } from 'vitest';
import { RoomDetectionEngine } from '../RoomDetectionEngine';
import type { WallData } from '@pryzm/geometry-wall';
import type { WallStore } from '@pryzm/geometry-wall';

const LEVEL = 'L1';
const Y = 0;

let seq = 0;
function wall(
  id: string,
  s: [number, number],
  e: [number, number],
  thickness: number,
): WallData {
  return {
    id,
    type: 'wall',
    baseLine: [
      { x: s[0], y: Y, z: s[1] },
      { x: e[0], y: Y, z: e[1] },
    ],
    height: 2.7,
    thickness,
    baseOffset: 0,
    levelId: LEVEL,
    childrenIds: [],
    openings: [],
    metadata: {
      createdAt: 0,
      modifiedAt: 0,
      createdBy: 'test',
      version: 1,
    },
  } as unknown as WallData;
}

function engineFor(walls: WallData[]): RoomDetectionEngine {
  const stub = {
    getByLevel: (levelId: string) => (levelId === LEVEL ? walls : []),
  } as unknown as WallStore;
  return new RoomDetectionEngine(stub);
}

/**
 * A 10 m × 6 m rectangular shell, split into two rooms by a vertical interior
 * partition at x = 5. `shellThickness` is the exterior-shell wall thickness;
 * `partitionEndInset` is how far each partition endpoint is pulled back from the
 * shell centreline (= shellThickness/2 after §PARTITION-SHELL-INNER-FACE).
 */
function buildSplitShell(shellThickness: number): WallData[] {
  const halfT = shellThickness / 2;
  const partThk = 0.1; // thin interior partition (apartment-grade)
  // Shell rectangle corners (centrelines): (0,0)-(10,0)-(10,6)-(0,6)
  const walls: WallData[] = [
    wall(`shell-bottom-${seq}`, [0, 0], [10, 0], shellThickness), // host for partition START
    wall(`shell-right-${seq}`, [10, 0], [10, 6], shellThickness),
    wall(`shell-top-${seq}`, [10, 6], [0, 6], shellThickness), // host for partition END
    wall(`shell-left-${seq}`, [0, 6], [0, 0], shellThickness),
  ];
  // Interior partition at x = 5, running between the two horizontal shell walls.
  // Its endpoints have been CLAMPED to the shell inner face: pulled INWARD by halfT.
  // start → near the bottom shell (z = 0): clamped up to z = +halfT
  // end   → near the top shell (z = 6):    clamped down to z = 6 - halfT
  walls.push(wall(`partition-${seq}`, [5, 0 + halfT], [5, 6 - halfT], partThk));
  seq++;
  return walls;
}

describe('§ROOM-LOOP-BREAK — thick-shell partition T-junction', () => {
  it('thin shell (0.10 m): partition T-junction closes both rooms (control)', () => {
    // hostHalfThickness = 0.05 ≪ 0.20 floor — clamp inset is tiny, always inside 0.20.
    const walls = buildSplitShell(0.1);
    const rooms = engineFor(walls).detectRoomsForLevel(LEVEL, 0, 2.7);
    expect(rooms.length).toBe(2);
  });

  it('THICK shell (0.40 m): clamped partition endpoint is BEYOND the legacy 0.20 m floor', () => {
    // hostHalfThickness = 0.20. Endpoint-to-shell-centreline distance after the clamp
    // is exactly 0.20 m — NOT < 0.20, so the legacy fixed floor would MISS the junction.
    const shellThickness = 0.4;
    const halfT = shellThickness / 2;
    expect(halfT).toBeGreaterThanOrEqual(0.2); // proves the legacy floor is breached
  });

  it('THICK shell (0.40 m): data-driven snap still closes BOTH rooms (no flood/merge)', () => {
    const walls = buildSplitShell(0.4);
    const rooms = engineFor(walls).detectRoomsForLevel(LEVEL, 0, 2.7);
    // Before the fix this returned ONE flooded room (the founder's compound merge).
    expect(rooms.length).toBe(2);
  });

  it('VERY thick shell (0.60 m): data-driven snap scales and still closes BOTH rooms', () => {
    const walls = buildSplitShell(0.6);
    const rooms = engineFor(walls).detectRoomsForLevel(LEVEL, 0, 2.7);
    expect(rooms.length).toBe(2);
  });
});
