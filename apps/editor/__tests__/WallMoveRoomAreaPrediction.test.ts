// Phase 6b — the wall.move planner can now predict room areas, and ROOM_MIN_AREA can
// finally fire on a wall move.
//
// Two things are proven here that were BOTH broken before:
//   1. The room-boundary branch reads the CANONICAL `boundingWallIds`. It previously
//      scanned only `boundaryWallIds | wallIds | sourceWallIds` — none of which is on the
//      stored record (RoomDataSchema) — so it declared STALE_DERIVED_STATE for a linkage
//      that was present. The honest refusal for LINK-LESS rooms must still survive.
//   2. The violations branch cloned PRE-MOVE rooms into BOTH sides of the diff, so
//      ROOM_MIN_AREA (which reads `room.computed.area`) evaluated identical areas before
//      and after and could never fire on a wall move.
//
// The planner + the predictor are both pure and injected, so this suite runs in the plain
// node env with no window, no stores and no singletons.

import { describe, it, expect } from 'vitest';
import { predictRoomGeometry } from '@pryzm/room-topology';
import {
  WallMoveConsequencePlanner,
  type WallMoveCommand,
} from '../src/engine/consequence/WallMoveConsequencePlanner';

// ── Doubles ────────────────────────────────────────────────────────────────────────────

const noRefit = { planOpeningRefit: () => ({ relocations: [], refusals: [] }) } as never;

const makeContext = (stores: Record<string, unknown[]>) => ({
  getStore: (id: string) => {
    const items = stores[id];
    if (!items) return null;
    return {
      getAll: () => items,
      getById: (eid: string) => items.find((i) => (i as { id?: string }).id === eid) ?? null,
      filter: (fn: (x: unknown) => boolean) => items.filter(fn),
    };
  },
}) as never;

/**
 * A minimal stand-in for the real ROOM_MIN_AREA rule (constraint-solver is another
 * agent's territory and its engine touches window at module scope). It reads exactly what
 * the real rule reads — `room.computed.area` — against a per-occupancy minimum, so if the
 * after-clone still carried pre-move areas this test would fail for the same reason the
 * real engine does.
 */
const MIN_AREA_M2: Record<string, number> = { kitchen: 10 };
const roomMinAreaValidator = {
  validateAll: (ctx: { roomStore?: { getAll(): unknown[] } }) => {
    const out: { ruleId: string; elementId: string; message: string }[] = [];
    for (const r of ctx.roomStore?.getAll() ?? []) {
      const room = r as { id: string; name?: string; occupancyType?: string; computed?: { area?: number } };
      const min = MIN_AREA_M2[room.occupancyType ?? ''];
      if (min == null || typeof room.computed?.area !== 'number') continue;
      if (room.computed.area < min) {
        out.push({
          ruleId: 'ROOM_MIN_AREA',
          elementId: room.id,
          message: `${room.name} — area ${room.computed.area.toFixed(1)}m² is below minimum ${min}m²`,
        });
      }
    }
    return out;
  },
} as never;

// ── The scene: a 4.0 × 3.1 m kitchen, area 12.4 m², minimum 10 m² ─────────────────────
//
//   w-n (0,0)→(4,0) · w-e (4,0)→(4,3.1) · w-s (4,3.1)→(0,3.1) · w-w (0,3.1)→(0,0)
//
// Moving w-s (with its two neighbours following) from z=3.1 to z=2.7 gives 4.0 × 2.7 =
// 10.8 m² — still legal. Moving to z=2.4 gives 4.0 × 2.4 = 9.6 m² — BELOW the 10 m²
// minimum, so ROOM_MIN_AREA must appear in violationsCreated.

const wallsAt = (southZ: number) => [
  { id: 'w-n', levelId: 'L0', baseLine: [{ x: 0, z: 0 }, { x: 4, z: 0 }], openings: [] },
  { id: 'w-e', levelId: 'L0', baseLine: [{ x: 4, z: 0 }, { x: 4, z: southZ }], openings: [] },
  { id: 'w-s', levelId: 'L0', baseLine: [{ x: 4, z: 3.1 }, { x: 0, z: 3.1 }], openings: [] },
  { id: 'w-w', levelId: 'L0', baseLine: [{ x: 0, z: southZ }, { x: 0, z: 0 }], openings: [] },
];

const kitchenRoom = () => ({
  id: 'room-kitchen',
  type: 'room',
  levelId: 'L0',
  name: 'Kitchen',
  occupancyType: 'kitchen',
  boundingWallIds: ['w-n', 'w-e', 'w-s', 'w-w'],
  boundingSlabIds: [],
  boundingColumnIds: [],
  boundary: { polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3.1 }, { x: 0, z: 3.1 }], height: 2.7 },
  computed: { area: 12.4, grossArea: 12.4, perimeter: 14.2, volume: 33.48, centroid: { x: 2, z: 1.55 }, boundingBox: { minX: 0, minZ: 0, maxX: 4, maxZ: 3.1 } },
});

const moveSouthTo = (z: number): WallMoveCommand => ({
  type: 'wall.move',
  payload: { id: 'w-s', baseLine: [{ x: 4, z }, { x: 0, z }] as never },
});

const planner = () => new WallMoveConsequencePlanner({
  occupancy: noRefit,
  validator: roomMinAreaValidator,
  predictRoomGeometry,
});

// ── PART 1: the field-name defect ─────────────────────────────────────────────────────

describe('roomBoundaryBranch — canonical boundingWallIds', () => {
  it('DETERMINES membership from the canonical boundingWallIds', async () => {
    const plan = await planner().plan(
      moveSouthTo(2.7),
      makeContext({ wall: wallsAt(2.7), room: [kitchenRoom()] }),
    );
    expect(plan.changed).toContain('room-kitchen');
    // The old STALE_DERIVED_STATE "rooms carry no explicit wall linkage" refusal is GONE.
    expect(plan.undetermined.some((u) => u.detail?.includes('rooms carry no explicit wall linkage'))).toBe(false);
  });

  it('STILL refuses when rooms carry NO linkage array at all (the honest blind spot)', async () => {
    const linkless = { ...kitchenRoom() } as Record<string, unknown>;
    delete linkless.boundingWallIds;
    const plan = await planner().plan(
      moveSouthTo(2.7),
      makeContext({ wall: wallsAt(2.7), room: [linkless] }),
    );
    expect(plan.changed).not.toContain('room-kitchen');
    const blind = plan.undetermined.find((u) => u.detail?.includes('rooms carry no explicit wall linkage'));
    expect(blind).toBeDefined();
    expect(blind?.reason).toBe('STALE_DERIVED_STATE');
  });
});

// ── PART 2/3: predicted areas + ROOM_MIN_AREA on a wall move ──────────────────────────

describe('wall.move → predicted room area', () => {
  it('carries the BEFORE→AFTER area line (12.4 m² → 10.8 m²)', async () => {
    const plan = await planner().plan(
      moveSouthTo(2.7),
      makeContext({ wall: wallsAt(2.7), room: [kitchenRoom()] }),
    );
    const note = plan.regeneration.skipped.find((s) => s.id === 'room-kitchen');
    expect(note).toBeDefined();
    // 4.0 m × 2.7 m = 10.8 m², computed by hand; delta −1.6 m² from the stored 12.4.
    expect(note?.reason).toBe('area: 12.4 m² → 10.8 m² (-1.6 m²)');
    // Still legal — the minimum is 10 m².
    expect(plan.validation.violationsCreated.map((v) => v.ruleId)).not.toContain('ROOM_MIN_AREA');
  });

  it('FIRES ROOM_MIN_AREA when the predicted area crosses the minimum', async () => {
    const plan = await planner().plan(
      moveSouthTo(2.4),
      makeContext({ wall: wallsAt(2.4), room: [kitchenRoom()] }),
    );
    // 4.0 m × 2.4 m = 9.6 m², below the 10 m² minimum.
    expect(plan.regeneration.skipped.find((s) => s.id === 'room-kitchen')?.reason)
      .toBe('area: 12.4 m² → 9.6 m² (-2.8 m²)');
    const fired = plan.validation.violationsCreated.find((v) => v.ruleId === 'ROOM_MIN_AREA');
    expect(fired).toBeDefined();
    expect(fired?.elementId).toBe('room-kitchen');
    expect(fired?.message).toBe('Kitchen — area 9.6m² is below minimum 10m²');
  });

  it('does NOT fire before the fix would have — the pre-move area is never below the minimum', async () => {
    // Sanity: with the SAME scene and no move (baseline unchanged), no violation appears.
    const plan = await planner().plan(
      { type: 'wall.move', payload: { id: 'w-s', baseLine: [{ x: 4, z: 3.1 }, { x: 0, z: 3.1 }] as never } },
      makeContext({ wall: wallsAt(3.1), room: [kitchenRoom()] }),
    );
    expect(plan.validation.violationsCreated).toHaveLength(0);
    // 12.4 stored vs 12.4 predicted — the recompute agrees with the record.
    expect(plan.regeneration.skipped.find((s) => s.id === 'room-kitchen')?.reason)
      .toBe('area: 12.4 m² → 12.4 m² (+0.0 m²)');
  });

  it('is deterministic — the same inputs produce the same planHash twice', async () => {
    const run = () => planner().plan(moveSouthTo(2.4), makeContext({ wall: wallsAt(2.4), room: [kitchenRoom()] }));
    const [a, b] = await Promise.all([run(), run()]);
    expect(a.planHash).toBe(b.planHash);
    expect(a.planId).toBe(b.planId);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ── The unpredicted room must not read as "no violation" ──────────────────────────────

describe('unpredicted rooms', () => {
  it('declares a per-room UNDETERMINED and leaves the room UNCHANGED in the after-clone', async () => {
    // Drag w-s clean across the interior: the moved baseline crosses the two side walls,
    // so the predictor refuses with TOPOLOGY_CHANGE_POSSIBLE rather than inventing an area.
    const plan = await planner().plan(
      { type: 'wall.move', payload: { id: 'w-s', baseLine: [{ x: -1, z: 1.5 }, { x: 5, z: 1.5 }] as never } },
      makeContext({ wall: wallsAt(3.1), room: [kitchenRoom()] }),
    );
    const u = plan.undetermined.find((x) => x.scope.includes('predicted polygon + area of room room-kitchen'));
    expect(u).toBeDefined();
    expect(u?.detail).toContain('TOPOLOGY_CHANGE_POSSIBLE');
    expect(u?.detail).toContain('were NOT re-evaluated');
    // No fabricated area line, and no violation invented for a room we could not predict.
    expect(plan.regeneration.skipped.find((s) => s.id === 'room-kitchen')).toBeUndefined();
    expect(plan.validation.violationsCreated).toHaveLength(0);
    // Membership is still DETERMINED — we know the room is affected, we just cannot say how.
    expect(plan.changed).toContain('room-kitchen');
  });

  it('without a composed predictor: membership determined, geometry ENGINE_NOT_AVAILABLE', async () => {
    const bare = new WallMoveConsequencePlanner({ occupancy: noRefit, validator: roomMinAreaValidator });
    const plan = await bare.plan(moveSouthTo(2.4), makeContext({ wall: wallsAt(2.4), room: [kitchenRoom()] }));
    expect(plan.changed).toContain('room-kitchen');
    const u = plan.undetermined.find((x) => x.scope.includes('room polygon + area under the move'));
    expect(u?.reason).toBe('ENGINE_NOT_AVAILABLE');
    expect(plan.regeneration.skipped).toHaveLength(0);
    // Absent predictor ⇒ the after-clone rooms are untouched ⇒ no room-area violation delta.
    expect(plan.validation.violationsCreated).toHaveLength(0);
  });
});
