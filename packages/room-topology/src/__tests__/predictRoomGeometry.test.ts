// predictRoomGeometry — Phase 6b. Proves the contract stated in the module header:
// per-room determination, typed refusals (never a fabricated polygon), and determinism.

import { describe, it, expect } from 'vitest';
import {
  predictRoomGeometry,
  type PredictWall,
  type PredictRoom,
} from '../predictRoomGeometry';

// A 4×3 m rectangular room bounded by 4 walls. Area = 12 m².
//   w-n: (0,0)→(4,0)   w-e: (4,0)→(4,3)   w-s: (4,3)→(0,3)   w-w: (0,3)→(0,0)
const rectWalls = (): PredictWall[] => [
  { id: 'w-n', baseLine: [{ x: 0, z: 0 }, { x: 4, z: 0 }] },
  { id: 'w-e', baseLine: [{ x: 4, z: 0 }, { x: 4, z: 3 }] },
  { id: 'w-s', baseLine: [{ x: 4, z: 3 }, { x: 0, z: 3 }] },
  { id: 'w-w', baseLine: [{ x: 0, z: 3 }, { x: 0, z: 0 }] },
];

const kitchen = (area = 12): PredictRoom => ({
  id: 'room-kitchen',
  boundingWallIds: ['w-n', 'w-e', 'w-s', 'w-w'],
  computed: { area },
});

describe('predictRoomGeometry', () => {
  it('recomputes area when a bounding wall moves inward (the founder scenario)', () => {
    // Move the south wall from z=3 to z=2.2 → the room becomes 4 × 2.2 = 8.8 m².
    // The two side walls must follow, or the ring would not close — so this move is
    // expressed as the three baselines that actually change. The predictor is called
    // for the ONE moved wall; the others are supplied at their post-move baselines,
    // which is exactly how the planner feeds it (candidate wall set + proposed move).
    const walls: PredictWall[] = [
      { id: 'w-n', baseLine: [{ x: 0, z: 0 }, { x: 4, z: 0 }] },
      { id: 'w-e', baseLine: [{ x: 4, z: 0 }, { x: 4, z: 2.2 }] },
      { id: 'w-s', baseLine: [{ x: 4, z: 3 }, { x: 0, z: 3 }] }, // stale; overridden by `move`
      { id: 'w-w', baseLine: [{ x: 0, z: 2.2 }, { x: 0, z: 0 }] },
    ];
    const res = predictRoomGeometry(
      walls,
      { wallId: 'w-s', baseLine: [{ x: 4, z: 2.2 }, { x: 0, z: 2.2 }] },
      [kitchen(12)],
    );

    expect(res.anyStructuralLink).toBe(true);
    expect(res.rooms).toHaveLength(1);
    const r = res.rooms[0];
    if (r.kind !== 'determined') throw new Error(`expected determined, got ${r.reason}: ${r.detail}`);
    expect(r.area).toBeCloseTo(8.8, 9);          // 4.0 m × 2.2 m, computed by hand
    expect(r.areaBefore).toBe(12);
    expect(r.areaDelta).toBeCloseTo(-3.2, 9);
    expect(r.perimeter).toBeCloseTo(12.4, 9);    // 2×(4 + 2.2)
    expect(r.polygon).toHaveLength(4);
  });

  it('is deterministic — same inputs twice produce identical output', () => {
    const call = () => predictRoomGeometry(
      rectWalls(),
      { wallId: 'w-n', baseLine: [{ x: 0, z: 0 }, { x: 4, z: 0 }] },
      [kitchen()],
    );
    expect(JSON.stringify(call())).toBe(JSON.stringify(call()));
  });

  it('omits rooms that do not declare the moved wall', () => {
    const other: PredictRoom = { id: 'room-other', boundingWallIds: ['w-x'], computed: { area: 5 } };
    const res = predictRoomGeometry(rectWalls(), { wallId: 'w-n', baseLine: [{ x: 0, z: 0 }, { x: 4, z: 0 }] }, [other]);
    expect(res.anyStructuralLink).toBe(true);
    expect(res.rooms).toHaveLength(0);
  });

  it('reports anyStructuralLink=false when NO room carries a linkage array', () => {
    const res = predictRoomGeometry(rectWalls(), { wallId: 'w-n', baseLine: [{ x: 0, z: 0 }, { x: 4, z: 0 }] }, [
      { id: 'room-linkless', computed: { area: 9 } },
    ]);
    expect(res.anyStructuralLink).toBe(false);
    expect(res.rooms).toHaveLength(0);
  });

  it('refuses OPEN_LOOP rather than fabricating a polygon when the move opens a gap', () => {
    // Move the north wall away in +x, leaving both its ends detached.
    const res = predictRoomGeometry(
      rectWalls(),
      { wallId: 'w-n', baseLine: [{ x: 10, z: 0 }, { x: 14, z: 0 }] },
      [kitchen()],
    );
    const r = res.rooms[0];
    expect(r.kind).toBe('undetermined');
    if (r.kind === 'undetermined') {
      expect(r.reason).toBe('OPEN_LOOP');
      expect(r.areaBefore).toBe(12);
    }
  });

  it('refuses MISSING_BOUNDING_WALL when a declared wall is absent from the wall set', () => {
    const res = predictRoomGeometry(
      rectWalls().filter((w) => w.id !== 'w-e'),
      { wallId: 'w-n', baseLine: [{ x: 0, z: 0 }, { x: 4, z: 0 }] },
      [kitchen()],
    );
    const r = res.rooms[0];
    expect(r.kind === 'undetermined' && r.reason).toBe('MISSING_BOUNDING_WALL');
  });

  it('refuses CURVED_WALL_UNSUPPORTED rather than approximating an arc as a chord', () => {
    const walls = rectWalls();
    walls[1] = { ...walls[1], curve: { control: { x: 5, z: 1.5 }, segments: 16 } };
    const res = predictRoomGeometry(walls, { wallId: 'w-n', baseLine: [{ x: 0, z: 0 }, { x: 4, z: 0 }] }, [kitchen()]);
    const r = res.rooms[0];
    expect(r.kind === 'undetermined' && r.reason).toBe('CURVED_WALL_UNSUPPORTED');
  });

  it('refuses TOPOLOGY_CHANGE_POSSIBLE when the moved baseline is driven through the room', () => {
    // Drag the north wall across the interior so it properly crosses both side walls.
    const res = predictRoomGeometry(
      rectWalls(),
      { wallId: 'w-n', baseLine: [{ x: -1, z: 1.5 }, { x: 5, z: 1.5 }] },
      [kitchen()],
    );
    const r = res.rooms[0];
    expect(r.kind === 'undetermined' && r.reason).toBe('TOPOLOGY_CHANGE_POSSIBLE');
  });

  it('refuses DEGENERATE_BOUNDARY when fewer than 3 usable segments remain', () => {
    const res = predictRoomGeometry(
      [{ id: 'w-a', baseLine: [{ x: 0, z: 0 }, { x: 1, z: 0 }] }],
      { wallId: 'w-a', baseLine: [{ x: 0, z: 0 }, { x: 1, z: 0 }] },
      [{ id: 'r', boundingWallIds: ['w-a'], computed: { area: 1 } }],
    );
    expect(res.rooms[0].kind === 'undetermined' && (res.rooms[0] as { reason: string }).reason)
      .toBe('DEGENERATE_BOUNDARY');
  });

  it('accepts the tolerated `boundaryWallIds` alias used by import DTOs', () => {
    const res = predictRoomGeometry(
      rectWalls(),
      { wallId: 'w-n', baseLine: [{ x: 0, z: 0 }, { x: 4, z: 0 }] },
      [{ id: 'r-dto', boundaryWallIds: ['w-n', 'w-e', 'w-s', 'w-w'] }],
    );
    const r = res.rooms[0];
    expect(r.kind).toBe('determined');
    if (r.kind === 'determined') {
      expect(r.area).toBeCloseTo(12, 9);
      expect(r.areaBefore).toBeUndefined();
      expect(r.areaDelta).toBeUndefined();
    }
  });

  it('does not mutate its inputs', () => {
    const walls = rectWalls();
    const rooms = [kitchen()];
    const snapshot = JSON.stringify({ walls, rooms });
    predictRoomGeometry(walls, { wallId: 'w-n', baseLine: [{ x: 0, z: -1 }, { x: 4, z: -1 }] }, rooms);
    expect(JSON.stringify({ walls, rooms })).toBe(snapshot);
  });
});
