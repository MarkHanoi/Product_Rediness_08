// R2 proof suite for the wall.move ConsequencePlanner
// (docs/03-execution/plans/BIM30-REASONING-LOOP-PLAN.md · ADR-0322 §2/§5/§7).
//
// The two invariants that DEFINE R2's exit:
//   • G-REASON-02 determinism — plan() twice over the same state ⇒ byte-identical plan.
//   • Planner purity (the R2 half of G-REASON-01) — planning mutates NOTHING; deep-frozen
//     fixtures throw if written, so a stray write fails the test rather than passing silently.
// Plus the honesty properties: a refused opening surfaces WITH numbers; a stale/unrefreshed
// junction cache yields `undetermined`, never []; regeneration is a declared blind spot.

import { describe, it, expect } from 'vitest';
import { WallOccupancyStore } from '@pryzm/geometry-wall';
import type { WallData, WallBaseline } from '@pryzm/geometry-wall';
import type { JoinedWallsQuery } from '@pryzm/core-app-model';
import type { PlanningContext, ReadonlyStoreView } from '@pryzm/command-bus';
import type { ValidationResult, ConstraintContext } from '@pryzm/constraint-solver/compliance';
import {
  WallMoveConsequencePlanner,
  type WallMoveCommand,
  type JoinedWallsReader,
  type ViolationValidator,
} from '../src/engine/consequence/WallMoveConsequencePlanner';

// ── Fixtures ────────────────────────────────────────────────────────────────────────

const occupancy = new WallOccupancyStore();

/** A straight wall of the given length along +x at y=0 (XZ centreline length = length). */
function baseLineOfLength(len: number): WallBaseline {
  return [
    { x: 0, y: 0, z: 0 },
    { x: len, y: 0, z: 0 },
  ];
}

function makeWall(overrides: Partial<WallData> = {}): WallData {
  return {
    id: 'wall-1',
    type: 'wall',
    levelId: 'level-0',
    baseLine: baseLineOfLength(6),
    height: 3,
    thickness: 0.2,
    openings: [
      { id: 'op-1', type: 'door', offset: 2.0, width: 0.9, height: 2.1, sillHeight: 0, elementId: 'door-1' },
    ],
    ...overrides,
  } as WallData;
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
  return {
    getStore: (storeId) => (storeId in stores ? viewOf(stores[storeId]!) : undefined),
  };
}

function moveCmd(baseLine: WallBaseline, id = 'wall-1'): WallMoveCommand {
  return { type: 'wall.move', payload: { id, baseLine } };
}

/** A joinedTo reader that returns a positive answer for the given walls. */
const joinedReaderOk = (joins: readonly string[]): JoinedWallsReader => ({
  getJoinedWalls: (wallId): JoinedWallsQuery => ({ ok: true, wallId, joinedWallIds: joins }),
});

/** A joinedTo reader whose cache was never refreshed for this id — a typed refusal. */
const joinedReaderStale: JoinedWallsReader = {
  getJoinedWalls: (wallId): JoinedWallsQuery => ({
    ok: false,
    wallId,
    reason: 'wall-unknown-to-joinedTo-writer',
    detail: `joinedTo lookup for wall ${wallId}: no flush has covered this id — NO ANSWER, not "joins nothing".`,
  }),
};

// ── The two defining invariants ───────────────────────────────────────────────────────

describe('WallMoveConsequencePlanner — G-REASON-02 determinism', () => {
  it('produces a byte-identical plan for the same state + command, twice', async () => {
    const planner = new WallMoveConsequencePlanner({ occupancy, joinedWalls: joinedReaderOk(['wall-2', 'wall-3']) });
    const wall = makeWall();
    const ctx = makeContext({ wall: [wall] });
    const cmd = moveCmd(baseLineOfLength(4));

    const a = await planner.plan(cmd, ctx);
    const b = await planner.plan(cmd, ctx);

    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b)); // byte-identical, planId included
    expect(a.planId).toBe(b.planId);
  });
});

describe('WallMoveConsequencePlanner — purity (R2 half of G-REASON-01)', () => {
  it('a deep-frozen fixture would throw if written — positive control', () => {
    'use strict';
    const wall = deepFreeze(makeWall());
    expect(Object.isFrozen(wall)).toBe(true);
    expect(() => {
      (wall as unknown as { height: number }).height = 99;
    }).toThrow();
  });

  it('planning mutates NOTHING — stores byte-identical before/after', async () => {
    const planner = new WallMoveConsequencePlanner({
      occupancy,
      joinedWalls: joinedReaderOk(['wall-2']),
      validator: fakeValidator(),
    });
    const wall = makeWall();
    const room = { id: 'room-1', boundaryWallIds: ['wall-1'] };
    const stores = { wall: [wall], room: [room] };
    // Deep-freeze every fixture: any write the planner attempts throws, failing the test.
    deepFreeze(wall);
    deepFreeze(room);
    const before = JSON.stringify(stores);

    const ctx = makeContext(stores);
    await expect(planner.plan(moveCmd(baseLineOfLength(2.5)), ctx)).resolves.toBeTruthy();

    expect(JSON.stringify(stores)).toBe(before);
  });
});

// ── Honesty properties ────────────────────────────────────────────────────────────────

describe('WallMoveConsequencePlanner — opening-refit (wraps planOpeningRefit)', () => {
  it('refuses an opening that no longer fits, WITH both numbers', async () => {
    const planner = new WallMoveConsequencePlanner({ occupancy });
    const wall = makeWall(); // 0.9 m door at offset 2 on a 6 m wall
    const ctx = makeContext({ wall: [wall] });

    // Shrink the wall to 0.5 m — the 0.9 m door cannot exist at any offset.
    const plan = await planner.plan(moveCmd(baseLineOfLength(0.5)), ctx);

    expect(plan.refused.length).toBe(1);
    const r = plan.refused[0]!;
    expect(r.elementId).toBe('door-1');
    // Both quantities are named in the sentence (required 0.900 m vs available 0.500 m).
    expect(r.reason).toMatch(/0\.900 m of wall length/);
    expect(r.reason).toMatch(/0\.500 m/);
    // A refused opening is neither changed nor excluded.
    expect(plan.changed).not.toContain('door-1');
    expect(plan.excluded).not.toContain('door-1');
  });

  it('relocates an opening that still fits → changed; a fully-fitting one → excluded', async () => {
    const planner = new WallMoveConsequencePlanner({ occupancy });
    const wall = makeWall();
    const ctx = makeContext({ wall: [wall] });

    // 4 m: door [2.0, 2.9] still fits in place → excluded.
    const fits = await planner.plan(moveCmd(baseLineOfLength(4)), ctx);
    expect(fits.excluded).toContain('door-1');
    expect(fits.changed).not.toContain('door-1');
    expect(fits.refused).toHaveLength(0);

    // 2.5 m: door [2.0, 2.9] overflows → clamp offset (size preserved) → relocation → changed.
    const moves = await planner.plan(moveCmd(baseLineOfLength(2.5)), ctx);
    expect(moves.changed).toContain('door-1');
    expect(moves.excluded).not.toContain('door-1');
    expect(moves.refused).toHaveLength(0);
  });
});

describe('WallMoveConsequencePlanner — junction branch (FAILURE ≠ EMPTINESS)', () => {
  it('a covered wall reports its joined walls as changed + topology-modified', async () => {
    const planner = new WallMoveConsequencePlanner({ occupancy, joinedWalls: joinedReaderOk(['wall-2', 'wall-3']) });
    const ctx = makeContext({ wall: [makeWall()] });
    const plan = await planner.plan(moveCmd(baseLineOfLength(4)), ctx);

    expect(plan.changed).toEqual(expect.arrayContaining(['wall-2', 'wall-3']));
    expect(plan.topology.modified).toEqual(expect.arrayContaining(['wall-2', 'wall-3']));
    expect(plan.undetermined.some((u) => u.scope.includes('junction'))).toBe(false);
  });

  it('a stale/unrefreshed cache yields undetermined{ENGINE_NOT_AVAILABLE} — never []', async () => {
    const planner = new WallMoveConsequencePlanner({ occupancy, joinedWalls: joinedReaderStale });
    const ctx = makeContext({ wall: [makeWall()] });
    const plan = await planner.plan(moveCmd(baseLineOfLength(4)), ctx);

    const junction = plan.undetermined.find((u) => u.scope.includes('junction'));
    expect(junction).toBeDefined();
    expect(junction!.reason).toBe('ENGINE_NOT_AVAILABLE');
    // The moved wall is the only changed wall — no joined walls silently added or omitted.
    expect(plan.changed).toEqual(['wall-1']);
  });

  it('an absent junction reader is also an honest undetermined, not silence', async () => {
    const planner = new WallMoveConsequencePlanner({ occupancy });
    const ctx = makeContext({ wall: [makeWall()] });
    const plan = await planner.plan(moveCmd(baseLineOfLength(4)), ctx);
    expect(plan.undetermined.some((u) => u.scope.includes('junction') && u.reason === 'ENGINE_NOT_AVAILABLE')).toBe(true);
  });
});

describe('WallMoveConsequencePlanner — regeneration (declared blind spot)', () => {
  it('always declares regeneration undetermined{NO_DEPENDENCY_INDEX} with the scope named', async () => {
    const planner = new WallMoveConsequencePlanner({ occupancy, joinedWalls: joinedReaderOk([]) });
    const ctx = makeContext({ wall: [makeWall()] });
    const plan = await planner.plan(moveCmd(baseLineOfLength(4)), ctx);

    const regen = plan.undetermined.find((u) => u.scope.startsWith('regeneration'));
    expect(regen).toBeDefined();
    expect(regen!.reason).toBe('NO_DEPENDENCY_INDEX');
    // Not faked as a determined-empty regeneration.
    expect(plan.regeneration.required).toEqual([]);
  });
});

describe('WallMoveConsequencePlanner — violations branch (mined SpeculativeEngine core)', () => {
  it('computes the before/after violation diff when a validator is composed', async () => {
    const planner = new WallMoveConsequencePlanner({ occupancy, validator: fakeValidator() });
    const ctx = makeContext({ wall: [makeWall()], room: [{ id: 'room-1' }] });
    const plan = await planner.plan(moveCmd(baseLineOfLength(4)), ctx);

    // fakeValidator emits a violation only in the AFTER state → created, none resolved.
    expect(plan.validation.violationsCreated).toEqual([
      { ruleId: 'MOCK_RULE', elementId: 'room-1', message: 'moved-into-violation' },
    ]);
    expect(plan.validation.violationsResolved).toEqual([]);
  });

  it('an absent validator yields undetermined{ENGINE_NOT_AVAILABLE}, not an empty delta claim', async () => {
    const planner = new WallMoveConsequencePlanner({ occupancy });
    const ctx = makeContext({ wall: [makeWall()] });
    const plan = await planner.plan(moveCmd(baseLineOfLength(4)), ctx);
    expect(plan.undetermined.some((u) => u.scope.includes('constraint validation') && u.reason === 'ENGINE_NOT_AVAILABLE')).toBe(true);
  });
});

describe('WallMoveConsequencePlanner — room-boundary branch', () => {
  it('determines rooms structurally linked to the wall as changed', async () => {
    const planner = new WallMoveConsequencePlanner({ occupancy });
    const ctx = makeContext({ wall: [makeWall()], room: [{ id: 'room-1', boundaryWallIds: ['wall-1'] }, { id: 'room-2', boundaryWallIds: ['wall-9'] }] });
    const plan = await planner.plan(moveCmd(baseLineOfLength(4)), ctx);
    expect(plan.changed).toContain('room-1');
    expect(plan.changed).not.toContain('room-2');
  });

  it('declares undetermined when rooms carry no wall linkage (observer blind spot)', async () => {
    const planner = new WallMoveConsequencePlanner({ occupancy });
    const ctx = makeContext({ wall: [makeWall()], room: [{ id: 'room-1' }] });
    const plan = await planner.plan(moveCmd(baseLineOfLength(4)), ctx);
    expect(plan.undetermined.some((u) => u.scope.includes('room-boundary') && u.reason === 'STALE_DERIVED_STATE')).toBe(true);
  });
});

// ── A fake validator: emits one violation only when wall-1 has moved (after state) ──────
function fakeValidator(): ViolationValidator {
  return {
    validateAll: (ctx: ConstraintContext): ValidationResult[] => {
      const wall = (ctx.wallStore.getAll() as { id: string; baseLine: WallBaseline }[]).find((w) => w.id === 'wall-1');
      const movedLen = wall ? Math.abs(wall.baseLine[1].x - wall.baseLine[0].x) : 0;
      // Original length is 6; any other length is the "after" snapshot.
      if (movedLen !== 6) {
        return [{ ruleId: 'MOCK_RULE', tier: 1, severity: 'warning', elementId: 'room-1', elementType: 'room', message: 'moved-into-violation' }];
      }
      return [];
    },
  };
}
