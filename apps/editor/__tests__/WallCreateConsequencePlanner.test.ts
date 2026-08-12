// Phase 6c proof suite for the wall.create ConsequencePlanner
// (docs/03-execution/plans/BIM30-REASONING-LOOP-PLAN.md, golden-operation matrix row 2 ·
//  ADR-0322 §2/§5/§7).
//
// Mirrors the shape of WallMoveConsequencePlanner.test.ts, and adds the property that suite
// does not yet assert exhaustively:
//
//   ★ EVERY undetermined branch is tested TWICE — once with its dependency ABSENT (the
//     refusal MUST fire) and once with it PRESENT (the refusal MUST NOT fire). A refusal
//     nobody proved can fire is not a refusal; a refusal that fires unconditionally is not a
//     blind spot, it is a permanently broken branch. Both halves are required.
//
// The suite uses the REAL `resolveJunctionsWithRecords` (a pure function) rather than a
// double wherever the junction prediction itself is under test — a fake resolver would prove
// only that the planner can read a fake.

import { describe, it, expect } from 'vitest';
import { WallOccupancyStore, resolveJunctionsWithRecords } from '@pryzm/geometry-wall';
import type { WallData, WallBaseline } from '@pryzm/geometry-wall';
import type { PlanningContext, ReadonlyStoreView } from '@pryzm/command-bus';
import type { ValidationResult, ConstraintContext } from '@pryzm/constraint-solver/compliance';
import {
  WallCreateConsequencePlanner,
  type WallCreateCommand,
  type ViolationValidator,
} from '../src/engine/consequence/WallCreateConsequencePlanner';

// ── Fixtures ────────────────────────────────────────────────────────────────────────

const occupancy = new WallOccupancyStore();

const P = (x: number, z: number) => ({ x, y: 0, z });

function wall(id: string, x1: number, z1: number, x2: number, z2: number, levelId = 'L0'): WallData {
  return {
    id,
    type: 'wall',
    levelId,
    baseLine: [P(x1, z1), P(x2, z2)] as unknown as WallBaseline,
    height: 3,
    thickness: 0.2,
    openings: [],
  } as unknown as WallData;
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

function viewOf(items: readonly unknown[]): ReadonlyStoreView {
  return {
    getAll: () => items,
    getById: (id) => (items as { id?: string }[]).find((i) => i.id === id) ?? null,
  };
}

function makeContext(stores: Record<string, readonly unknown[]>): PlanningContext {
  return { getStore: (storeId) => (storeId in stores ? viewOf(stores[storeId]!) : undefined) };
}

/** A create command with a branded-looking explicit id (so no placeholder path is taken). */
function createCmd(
  baseLine: readonly [ReturnType<typeof P>, ReturnType<typeof P>],
  overrides: Partial<WallCreateCommand['payload']> = {},
): WallCreateCommand {
  return {
    type: 'wall.create',
    payload: {
      id: 'wall-new',
      levelId: 'L0',
      thickness: 0.2,
      height: 3,
      baseLine: baseLine as unknown as WallBaseline,
      ...overrides,
    },
  };
}

/**
 * A square room L0 bounded by four walls, declared via the canonical `boundingWallIds`.
 * Corners (0,0) → (6,0) → (6,6) → (0,6).
 */
const ROOM_WALLS = [
  wall('w-south', 0, 0, 6, 0),
  wall('w-east', 6, 0, 6, 6),
  wall('w-north', 6, 6, 0, 6),
  wall('w-west', 0, 6, 0, 0),
];
const ROOM = {
  id: 'room-1',
  boundingWallIds: ['w-south', 'w-east', 'w-north', 'w-west'],
  computed: { area: 36 },
};

/** A partition driven straight THROUGH the room, crossing south and north. */
const THROUGH_ROOM = [P(3, -1), P(3, 7)] as const;
/** A wall well outside the room, crossing nothing. */
const AWAY = [P(20, 20), P(24, 20)] as const;

// ── The two defining invariants ───────────────────────────────────────────────────────

describe('WallCreateConsequencePlanner — G-REASON-02 determinism', () => {
  it('produces a byte-identical plan for the same state + command, twice', async () => {
    const planner = new WallCreateConsequencePlanner({
      resolveJunctions: resolveJunctionsWithRecords,
      occupancy,
      validator: fakeValidator(),
    });
    const ctx = makeContext({ wall: ROOM_WALLS, room: [ROOM] });
    const cmd = createCmd(THROUGH_ROOM);

    const a = await planner.plan(cmd, ctx);
    const b = await planner.plan(cmd, ctx);

    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b)); // byte-identical, planId included
    expect(a.planId).toBe(b.planId);
  });

  it('is insensitive to wall-store ORDER — the resolver is input-order dependent, the plan is not', async () => {
    const planner = new WallCreateConsequencePlanner({ resolveJunctions: resolveJunctionsWithRecords });
    const cmd = createCmd(THROUGH_ROOM);

    const forward = await planner.plan(cmd, makeContext({ wall: ROOM_WALLS, room: [ROOM] }));
    const reversed = await planner.plan(
      cmd,
      makeContext({ wall: [...ROOM_WALLS].reverse(), room: [ROOM] }),
    );

    // The junction prediction must not depend on store iteration order.
    expect(forward.topology.modified).toEqual(reversed.topology.modified);
    expect(forward.indirect).toEqual(reversed.indirect);
  });

  it('mints a STABLE placeholder id when the payload omits one — no random source', async () => {
    const planner = new WallCreateConsequencePlanner({ resolveJunctions: resolveJunctionsWithRecords });
    const cmd: WallCreateCommand = {
      type: 'wall.create',
      payload: { levelId: 'L0', thickness: 0.2, baseLine: THROUGH_ROOM as unknown as WallBaseline },
    };
    const ctx = makeContext({ wall: ROOM_WALLS, room: [ROOM] });

    const a = await planner.plan(cmd, ctx);
    const b = await planner.plan(cmd, ctx);
    expect(a.planId).toBe(b.planId);
    expect(a.topology.added[0]).toMatch(/^wall-pending-/);
    // …and the plan SAYS the identity is not knowable, rather than implying the placeholder
    // is the real id.
    expect(
      a.undetermined.some(
        (u) => /identity of the wall/i.test(u.scope) && u.reason === 'STALE_DERIVED_STATE',
      ),
    ).toBe(true);
  });
});

describe('WallCreateConsequencePlanner — purity (the R2/R3 half of G-REASON-01)', () => {
  it('a deep-frozen fixture would throw if written — positive control', () => {
    'use strict';
    const w = deepFreeze(wall('w-frozen', 0, 0, 3, 0));
    expect(Object.isFrozen(w)).toBe(true);
    expect(() => {
      (w as unknown as { height: number }).height = 99;
    }).toThrow();
  });

  it('planning mutates NOTHING — stores byte-identical before/after, frozen fixtures survive', async () => {
    const planner = new WallCreateConsequencePlanner({
      resolveJunctions: resolveJunctionsWithRecords,
      occupancy,
      validator: fakeValidator(),
    });
    const walls = ROOM_WALLS.map((w) => wall(w.id, w.baseLine[0].x, w.baseLine[0].z, w.baseLine[1].x, w.baseLine[1].z));
    const room = { id: 'room-1', boundingWallIds: ROOM.boundingWallIds, computed: { area: 36 } };
    const stores = { wall: walls, room: [room] };
    // Deep-freeze every fixture: any write the planner attempts throws, failing the test.
    walls.forEach(deepFreeze);
    deepFreeze(room);
    const before = JSON.stringify(stores);

    await expect(planner.plan(createCmd(THROUGH_ROOM), makeContext(stores))).resolves.toBeTruthy();

    expect(JSON.stringify(stores)).toBe(before);
    // The candidate was never appended to the live list.
    expect(stores.wall).toHaveLength(4);
  });
});

// ── Branch 1: junction (the pure before/after resolver diff) ──────────────────────────

describe('WallCreateConsequencePlanner — junction branch', () => {
  it('predicts the walls a NOT-YET-EXISTING wall will join, from geometry alone', async () => {
    const planner = new WallCreateConsequencePlanner({ resolveJunctions: resolveJunctionsWithRecords });
    // A new wall from the room's SE corner (6,0) heading east — joins w-south and w-east.
    const ctx = makeContext({ wall: ROOM_WALLS, room: [ROOM] });
    const plan = await planner.plan(createCmd([P(6, 0), P(10, 0)] as const), ctx);

    expect(plan.indirect.kind).toBe('determined');
    const touched = plan.indirect.kind === 'determined' ? plan.indirect.elements : [];
    expect(touched).toEqual(expect.arrayContaining(['w-south', 'w-east']));
    // The joined walls are reported as topology-MODIFIED…
    expect(plan.topology.modified).toEqual(expect.arrayContaining(['w-south', 'w-east']));
    // …and the newcomer as topology-ADDED, never as modified (the two arms must not overlap).
    expect(plan.topology.added).toEqual(['wall-new']);
    expect(plan.topology.modified).not.toContain('wall-new');
  });

  it('a wall that touches nothing is DETERMINED-empty — a real answer, not a blind spot', async () => {
    const planner = new WallCreateConsequencePlanner({ resolveJunctions: resolveJunctionsWithRecords });
    const ctx = makeContext({ wall: ROOM_WALLS, room: [ROOM] });
    const plan = await planner.plan(createCmd(AWAY), ctx);

    // "Found nothing" ≠ "could not look": no junction entry in undetermined at all.
    expect(plan.undetermined.some((u) => /junction/i.test(u.scope))).toBe(false);
    expect(plan.topology.modified).toEqual([]);
    // The newcomer is still the added element.
    expect(plan.topology.added).toEqual(['wall-new']);
  });

  it('a resolver that THROWS is undetermined{ENGINE_NOT_AVAILABLE}, not "joins nothing"', async () => {
    const planner = new WallCreateConsequencePlanner({
      resolveJunctions: () => {
        throw new Error('solve failed');
      },
    });
    const ctx = makeContext({ wall: ROOM_WALLS, room: [ROOM] });
    const plan = await planner.plan(createCmd(THROUGH_ROOM), ctx);

    const j = plan.undetermined.find((u) => /junction/i.test(u.scope));
    expect(j).toBeDefined();
    expect(j!.reason).toBe('ENGINE_NOT_AVAILABLE');
    expect(plan.topology.modified).toEqual([]);
  });

  // ── §CREATE-BODY-CROSS — the resolver's blind spot, named rather than reported as empty ──
  //
  // MEASURED against `resolveJunctionsWithRecords` directly:
  //   body×body X crossing            → junctions: []      (NOT detected)
  //   endpoint landing on a body      → junctions: [T]     (detected)
  //   partition flush to the walls    → junctions: [T, T]  (detected)
  //   the same partition overshooting → junctions: []      (NOT detected)
  //
  // The resolver is right for its own purpose (an X crossing has no mitre to cut), but an
  // empty result therefore means EITHER "touches nothing" OR "passes straight through", and
  // those must never print the same value. These two tests pin both halves.

  it('FLUSH: a partition whose endpoints land ON the room walls is DETERMINED — two T-junctions', async () => {
    const planner = new WallCreateConsequencePlanner({ resolveJunctions: resolveJunctionsWithRecords });
    const ctx = makeContext({ wall: ROOM_WALLS, room: [ROOM] });
    // (3,0) → (3,6): both endpoints sit on w-south and w-north.
    const plan = await planner.plan(createCmd([P(3, 0), P(3, 6)] as const), ctx);

    expect(plan.indirect.kind).toBe('determined');
    expect(plan.topology.modified).toEqual(expect.arrayContaining(['w-south', 'w-north']));
    // The junction question was ANSWERED — no junction blind spot of any kind.
    expect(plan.undetermined.some((u) => /junction/i.test(u.scope))).toBe(false);
  });

  it('THROUGH: a partition that OVERSHOOTS is neither empty nor silent — the blind spot is named', async () => {
    const planner = new WallCreateConsequencePlanner({ resolveJunctions: resolveJunctionsWithRecords });
    const ctx = makeContext({ wall: ROOM_WALLS, room: [ROOM] });
    // (3,-1) → (3,7): crosses w-south and w-north mid-body; the resolver detects NOTHING.
    const plan = await planner.plan(createCmd(THROUGH_ROOM), ctx);

    // 1) NOT an empty claim — the crossed walls are reported as affected.
    expect(plan.topology.modified).toEqual(expect.arrayContaining(['w-south', 'w-north']));
    expect(plan.changed).toEqual(expect.arrayContaining(['w-south', 'w-north']));

    // 2) NOT silent — the exact refusal fires, with its reason from the fixed union.
    const x = plan.undetermined.find((u) => /crosses the BODY/i.test(u.scope));
    expect(x).toBeDefined();
    expect(x!.reason).toBe('ENGINE_NOT_AVAILABLE');
    expect(x!.scope).toContain('w-north');
    expect(x!.scope).toContain('w-south');
    expect(x!.detail).toMatch(/clusters ENDPOINTS/);

    // 3) The contradiction that motivated this fix is gone: the room branch says the wall
    //    splits room-1, and the junction branch no longer says it touches nothing.
    expect(plan.changed).toContain('room-1');
  });

  it('THROUGH: the crossing refusal does NOT fire when the new wall crosses no body', async () => {
    const planner = new WallCreateConsequencePlanner({ resolveJunctions: resolveJunctionsWithRecords });
    const ctx = makeContext({ wall: ROOM_WALLS, room: [ROOM] });
    const plan = await planner.plan(createCmd(AWAY), ctx);
    expect(plan.undetermined.find((u) => /crosses the BODY/i.test(u.scope))).toBeUndefined();
  });

  it('only same-LEVEL walls are solved — a wall on another level never fabricates a junction', async () => {
    const planner = new WallCreateConsequencePlanner({ resolveJunctions: resolveJunctionsWithRecords });
    // An L1 wall sharing the newcomer's exact endpoint. It must NOT be reported as joined.
    const otherLevel = wall('w-upstairs', 6, 0, 10, 0, 'L1');
    const ctx = makeContext({ wall: [...ROOM_WALLS, otherLevel], room: [ROOM] });
    const plan = await planner.plan(createCmd([P(6, 0), P(10, 0)] as const), ctx);

    expect(plan.changed).not.toContain('w-upstairs');
    expect(plan.topology.modified).not.toContain('w-upstairs');
  });
});

// ── Branch 2: opening-refit (a determined-empty POSITIVE answer) ──────────────────────

describe('WallCreateConsequencePlanner — opening-refit branch', () => {
  it('a new wall hosts no openings — determined-empty, and NOT declared a blind spot', async () => {
    const planner = new WallCreateConsequencePlanner({
      resolveJunctions: resolveJunctionsWithRecords,
      occupancy,
    });
    const ctx = makeContext({ wall: ROOM_WALLS, room: [ROOM] });
    const plan = await planner.plan(createCmd(THROUGH_ROOM), ctx);

    expect(plan.refused).toEqual([]);
    // The positive claim: no opening-refit blind spot is declared, because there is a real
    // answer ("a wall created by wall.create carries no openings").
    expect(plan.undetermined.some((u) => /opening|refit/i.test(u.scope))).toBe(false);
  });
});

// ── Branch 3: room partition ──────────────────────────────────────────────────────────

describe('WallCreateConsequencePlanner — room-partition branch', () => {
  it('a wall driven THROUGH a room reports it affected AND refuses to predict its geometry', async () => {
    const planner = new WallCreateConsequencePlanner({ resolveJunctions: resolveJunctionsWithRecords });
    const ctx = makeContext({ wall: ROOM_WALLS, room: [ROOM] });
    const plan = await planner.plan(createCmd(THROUGH_ROOM), ctx);

    // The room IS affected…
    expect(plan.changed).toContain('room-1');
    // …and its post-create geometry is explicitly NOT predicted. This pairing is the whole
    // point: "affected" without "and I cannot tell you the new area" would be an overstatement.
    const r = plan.undetermined.find((u) => u.scope.includes('room-1'));
    expect(r).toBeDefined();
    expect(r!.reason).toBe('NO_DEPENDENCY_INDEX');
    expect(r!.detail).toMatch(/SPLIT/);
  });

  it('a wall that crosses no room is DETERMINED to partition nothing', async () => {
    const planner = new WallCreateConsequencePlanner({ resolveJunctions: resolveJunctionsWithRecords });
    const ctx = makeContext({ wall: ROOM_WALLS, room: [ROOM] });
    const plan = await planner.plan(createCmd(AWAY), ctx);

    expect(plan.changed).not.toContain('room-1');
    // No room-partition blind spot: the question was asked and answered.
    expect(plan.undetermined.some((u) => /room-partition/i.test(u.scope))).toBe(false);
    expect(plan.undetermined.some((u) => u.scope.includes('room-1'))).toBe(false);
  });

  it('a wall merely TOUCHING a room boundary at an endpoint does not count as a partition', async () => {
    const planner = new WallCreateConsequencePlanner({ resolveJunctions: resolveJunctionsWithRecords });
    const ctx = makeContext({ wall: ROOM_WALLS, room: [ROOM] });
    // Runs outward from the SE corner — bounds/abuts, never crosses the interior.
    const plan = await planner.plan(createCmd([P(6, 0), P(10, 0)] as const), ctx);

    expect(plan.changed).not.toContain('room-1');
    expect(plan.undetermined.some((u) => u.scope.includes('room-1'))).toBe(false);
  });
});

// ── Branch 5: violations ──────────────────────────────────────────────────────────────

describe('WallCreateConsequencePlanner — violations branch (add-shaped diff)', () => {
  it('computes the before/after violation diff when a validator is composed', async () => {
    const planner = new WallCreateConsequencePlanner({
      resolveJunctions: resolveJunctionsWithRecords,
      validator: fakeValidator(),
    });
    const ctx = makeContext({ wall: ROOM_WALLS, room: [ROOM] });
    const plan = await planner.plan(createCmd(THROUGH_ROOM), ctx);

    // fakeValidator fires only once the new wall is present in the AFTER clone.
    expect(plan.validation.violationsCreated).toEqual([
      { ruleId: 'MOCK_RULE', elementId: 'wall-new', message: 'wall-added-into-violation' },
    ]);
    expect(plan.validation.violationsResolved).toEqual([]);
  });

  it('a validator that THROWS is undetermined{ENGINE_NOT_AVAILABLE}, not a clean delta', async () => {
    const planner = new WallCreateConsequencePlanner({
      resolveJunctions: resolveJunctionsWithRecords,
      validator: {
        validateAll: () => {
          throw new Error('index corrupt');
        },
      },
    });
    const ctx = makeContext({ wall: ROOM_WALLS, room: [ROOM] });
    const plan = await planner.plan(createCmd(THROUGH_ROOM), ctx);

    const v = plan.undetermined.find((u) => /constraint validation/i.test(u.scope));
    expect(v).toBeDefined();
    expect(v!.reason).toBe('ENGINE_NOT_AVAILABLE');
    expect(plan.validation.violationsCreated).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════
// ★ THE LOAD-BEARING SUITE — every UNDETERMINED reason, proved BOTH ways.
//
// For each refusal: it MUST fire when its substrate is absent, and it MUST NOT fire when the
// substrate is present. A refusal only ever tested one way is either unproven or permanent.
// ═══════════════════════════════════════════════════════════════════════════════════════

/** Deps that make every OPTIONAL branch answerable, so absence is the only variable. */
const fullDeps = () => ({
  resolveJunctions: resolveJunctionsWithRecords,
  occupancy,
  validator: fakeValidator(),
});

const fullCtx = () => makeContext({ wall: ROOM_WALLS, room: [ROOM] });

describe('★ UNDETERMINED reasons — each proved to fire on absence AND to stay silent on presence', () => {
  // ── ENGINE_NOT_AVAILABLE · junction resolver ───────────────────────────────────────
  it('junction: FIRES with no resolver composed', async () => {
    const plan = await new WallCreateConsequencePlanner({ occupancy }).plan(
      createCmd(THROUGH_ROOM),
      fullCtx(),
    );
    const j = plan.undetermined.find((u) => /junction impact/i.test(u.scope));
    expect(j).toBeDefined();
    expect(j!.reason).toBe('ENGINE_NOT_AVAILABLE');
    // And the indirect reach is honestly undetermined, not a partial determined set.
    expect(plan.indirect.kind).toBe('undetermined');
  });

  it('junction: DOES NOT fire with the resolver composed', async () => {
    const plan = await new WallCreateConsequencePlanner(fullDeps()).plan(
      createCmd(THROUGH_ROOM),
      fullCtx(),
    );
    // The "engine absent" refusal specifically. (A body-crossing refusal MAY still be present
    // for this geometry — that is a different, narrower blind spot, asserted in its own test.)
    expect(plan.undetermined.find((u) => /junction impact/i.test(u.scope))).toBeUndefined();
  });

  // ── ENGINE_NOT_AVAILABLE · constraint validator ────────────────────────────────────
  it('violations: FIRES with no validator composed', async () => {
    const plan = await new WallCreateConsequencePlanner({
      resolveJunctions: resolveJunctionsWithRecords,
      occupancy,
    }).plan(createCmd(THROUGH_ROOM), fullCtx());
    const v = plan.undetermined.find((u) => /constraint validation/i.test(u.scope));
    expect(v).toBeDefined();
    expect(v!.reason).toBe('ENGINE_NOT_AVAILABLE');
    expect(plan.validation.violationsCreated).toEqual([]);
  });

  it('violations: DOES NOT fire with a validator composed', async () => {
    const plan = await new WallCreateConsequencePlanner(fullDeps()).plan(
      createCmd(THROUGH_ROOM),
      fullCtx(),
    );
    expect(plan.undetermined.find((u) => /constraint validation/i.test(u.scope))).toBeUndefined();
  });

  // ── STALE_DERIVED_STATE · room store view absent ───────────────────────────────────
  it('room-partition: FIRES when no room store view exists', async () => {
    const plan = await new WallCreateConsequencePlanner(fullDeps()).plan(
      createCmd(THROUGH_ROOM),
      makeContext({ wall: ROOM_WALLS }), // no 'room' store
    );
    const r = plan.undetermined.find((u) => /room-partition/i.test(u.scope));
    expect(r).toBeDefined();
    expect(r!.reason).toBe('STALE_DERIVED_STATE');
  });

  it('room-partition: DOES NOT fire when rooms are present and linked', async () => {
    const plan = await new WallCreateConsequencePlanner(fullDeps()).plan(
      createCmd(THROUGH_ROOM),
      fullCtx(),
    );
    expect(plan.undetermined.find((u) => /room-partition/i.test(u.scope))).toBeUndefined();
  });

  // ── STALE_DERIVED_STATE · rooms carry no wall linkage ──────────────────────────────
  it('room-partition: FIRES when rooms carry no wall linkage at all', async () => {
    const plan = await new WallCreateConsequencePlanner(fullDeps()).plan(
      createCmd(THROUGH_ROOM),
      makeContext({ wall: ROOM_WALLS, room: [{ id: 'room-1' }] }),
    );
    const r = plan.undetermined.find((u) => /room-partition/i.test(u.scope));
    expect(r).toBeDefined();
    expect(r!.reason).toBe('STALE_DERIVED_STATE');
    expect(r!.detail).toMatch(/ADR-0069/);
  });

  // ── NO_DEPENDENCY_INDEX · per-room split refusal ───────────────────────────────────
  it('room split: FIRES for a room the new wall crosses', async () => {
    const plan = await new WallCreateConsequencePlanner(fullDeps()).plan(
      createCmd(THROUGH_ROOM),
      fullCtx(),
    );
    const r = plan.undetermined.find((u) => u.scope.includes('room-1'));
    expect(r).toBeDefined();
    expect(r!.reason).toBe('NO_DEPENDENCY_INDEX');
  });

  it('room split: DOES NOT fire for a room the new wall does not cross', async () => {
    const plan = await new WallCreateConsequencePlanner(fullDeps()).plan(
      createCmd(AWAY),
      fullCtx(),
    );
    expect(plan.undetermined.find((u) => u.scope.includes('room-1'))).toBeUndefined();
  });

  // ── ENGINE_NOT_AVAILABLE · curved-wall mitre ───────────────────────────────────────
  it('curved mitre: FIRES for a curved newcomer', async () => {
    const plan = await new WallCreateConsequencePlanner(fullDeps()).plan(
      createCmd(THROUGH_ROOM, { curve: { control: { x: 3, y: 0, z: 3 }, segments: 8 } }),
      fullCtx(),
    );
    const c = plan.undetermined.find((u) => /mitre geometry/i.test(u.scope));
    expect(c).toBeDefined();
    expect(c!.reason).toBe('ENGINE_NOT_AVAILABLE');
  });

  it('curved mitre: DOES NOT fire for a straight newcomer', async () => {
    const plan = await new WallCreateConsequencePlanner(fullDeps()).plan(
      createCmd(THROUGH_ROOM),
      fullCtx(),
    );
    expect(plan.undetermined.find((u) => /mitre geometry/i.test(u.scope))).toBeUndefined();
  });

  // ── STALE_DERIVED_STATE · placeholder identity ─────────────────────────────────────
  it('identity: FIRES when the payload omits an id', async () => {
    const plan = await new WallCreateConsequencePlanner(fullDeps()).plan(
      {
        type: 'wall.create',
        payload: { levelId: 'L0', baseLine: THROUGH_ROOM as unknown as WallBaseline },
      },
      fullCtx(),
    );
    const i = plan.undetermined.find((u) => /identity of the wall/i.test(u.scope));
    expect(i).toBeDefined();
    expect(i!.reason).toBe('STALE_DERIVED_STATE');
  });

  it('identity: DOES NOT fire when the payload supplies an id', async () => {
    const plan = await new WallCreateConsequencePlanner(fullDeps()).plan(
      createCmd(THROUGH_ROOM),
      fullCtx(),
    );
    expect(plan.undetermined.find((u) => /identity of the wall/i.test(u.scope))).toBeUndefined();
  });

  // ── STALE_DERIVED_STATE · no baseLine supplied ─────────────────────────────────────
  it('geometry: FIRES when the payload carries no baseLine, and no branch invents one', async () => {
    const plan = await new WallCreateConsequencePlanner(fullDeps()).plan(
      { type: 'wall.create', payload: { id: 'wall-new', levelId: 'L0' } },
      fullCtx(),
    );
    const g = plan.undetermined.find((u) => /room-partition|junction/i.test(u.scope));
    expect(g).toBeDefined();
    expect(g!.reason).toBe('STALE_DERIVED_STATE');
    // Nothing geometric was claimed from a centreline nobody supplied.
    expect(plan.topology.modified).toEqual([]);
    expect(plan.validation.violationsCreated).toEqual([]);
    expect(plan.indirect.kind).toBe('undetermined');
  });

  it('geometry: DOES NOT fire when a baseLine is supplied', async () => {
    const plan = await new WallCreateConsequencePlanner(fullDeps()).plan(
      createCmd(THROUGH_ROOM),
      fullCtx(),
    );
    expect(
      plan.undetermined.some((u) => /no explicit baseLine/i.test(u.detail ?? '')),
    ).toBe(false);
  });

  // ── The two PERMANENT blind spots — declared unconditionally, and stated as such ────
  // These have no "does not fire" half BY CONSTRUCTION: no substrate exists that could
  // answer them today. That asymmetry is the point, and it is asserted rather than left
  // implicit, so the day a substrate lands this test fails and forces the branch to be
  // rewritten instead of silently over-refusing forever.
  it('regeneration: ALWAYS undetermined{NO_DEPENDENCY_INDEX} — and never faked as determined-empty', async () => {
    const plan = await new WallCreateConsequencePlanner(fullDeps()).plan(
      createCmd(THROUGH_ROOM),
      fullCtx(),
    );
    const r = plan.undetermined.find((u) => /^regeneration/.test(u.scope));
    expect(r).toBeDefined();
    expect(r!.reason).toBe('NO_DEPENDENCY_INDEX');
    // The reason getAffected is NOT consulted is carried in the plan, not just in a comment.
    expect(r!.detail).toMatch(/getAffected/);
    expect(plan.regeneration.required).toEqual([]);
    expect(plan.regeneration.skipped).toEqual([]);
  });

  it('wall-vs-wall clash: ALWAYS undetermined{ENGINE_NOT_AVAILABLE} — no substrate exists', async () => {
    const plan = await new WallCreateConsequencePlanner(fullDeps()).plan(
      createCmd(THROUGH_ROOM),
      fullCtx(),
    );
    const c = plan.undetermined.find((u) => /solid clash/i.test(u.scope));
    expect(c).toBeDefined();
    expect(c!.reason).toBe('ENGINE_NOT_AVAILABLE');
    expect(c!.detail).toMatch(/canPlace/);
  });
});

// ── Contract-level: the plan never claims completeness it does not have ────────────────

describe('WallCreateConsequencePlanner — plan-shape honesty', () => {
  it('never returns an empty undetermined array — at minimum the two permanent blind spots', async () => {
    const plan = await new WallCreateConsequencePlanner(fullDeps()).plan(
      createCmd(AWAY),
      fullCtx(),
    );
    // An empty `undetermined` is a claim that every branch ran (consequence.ts). Two branches
    // provably cannot, so this planner may never emit one.
    expect(plan.undetermined.length).toBeGreaterThanOrEqual(2);
  });

  it('every undetermined reason is a member of the fixed ADR-0322 §5 union', async () => {
    const allowed = new Set([
      'NO_DEPENDENCY_INDEX',
      'ENGINE_NOT_AVAILABLE',
      'UNSUPPORTED_ELEMENT_TYPE',
      'STALE_DERIVED_STATE',
    ]);
    for (const cmd of [createCmd(THROUGH_ROOM), createCmd(AWAY)]) {
      const plan = await new WallCreateConsequencePlanner({}).plan(cmd, fullCtx());
      for (const u of plan.undetermined) {
        expect(allowed.has(u.reason)).toBe(true);
        expect(u.scope.length).toBeGreaterThan(0);
      }
    }
  });

  it('constructs and runs with NO deps at all — every collaborator is genuinely optional', async () => {
    const plan = await new WallCreateConsequencePlanner().plan(createCmd(THROUGH_ROOM), fullCtx());
    expect(plan.planId).toMatch(/^plan-wall\.create-/);
    // With nothing composed, everything answerable-by-substrate is refused, and the newcomer
    // is still the one thing the plan can state directly.
    expect(plan.direct).toEqual({ kind: 'determined', elements: ['wall-new'] });
    expect(plan.indirect.kind).toBe('undetermined');
  });
});

// ── A fake validator: emits one violation only once 'wall-new' is in the wall store ────
function fakeValidator(): ViolationValidator {
  return {
    validateAll: (ctx: ConstraintContext): ValidationResult[] => {
      const walls = ctx.wallStore.getAll() as { id: string }[];
      if (walls.some((w) => w.id === 'wall-new')) {
        return [
          {
            ruleId: 'MOCK_RULE',
            tier: 1,
            severity: 'warning',
            elementId: 'wall-new',
            elementType: 'wall',
            message: 'wall-added-into-violation',
          },
        ];
      }
      return [];
    },
  };
}
