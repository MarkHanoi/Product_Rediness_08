// plugins/cross/__tests__/handlers.test.ts — registration seam for the three
// cross-element cascade rules (PR-11).
//
// C70 §5.6: written RED first against the old `registerCrossHandlers`, which
// probed a `bus.registerCascade` surface that has NEVER existed on CommandBus
// and console.warn-ed itself into a silent no-op — the §10.2b coverage-lie
// shape PR-11 names.  The contract under test:
//
//   • handed the REAL CascadeRunner (via @pryzm/plugin-sdk — the registry the
//     BIM30 disposition docket §1 promotes as the R2 planner's cascade
//     branch), it registers all three rules and reports them, and a real
//     `wall.move` dispatched through that runner synthesises real
//     `room.recomputeBoundary` follow-ons (C74 §3.4: the fixture supplies the
//     room-lookup DEPENDENCY, never the synthesised commands under test);
//   • handed anything WITHOUT the runner surface (e.g. today's CommandBus),
//     it returns a typed CapabilityRefusal (C78/C80) — a VALUE carrying both
//     numbers and what it protects — never a silent void.

import { describe, expect, it, vi } from 'vitest';
import { CascadeRunner } from '@pryzm/plugin-sdk';
import {
  registerCrossHandlers,
  CROSS_COMMANDS,
  type CrossHandlerDeps,
} from '../src/handlers/index.js';

const deps: CrossHandlerDeps = {
  // slab→wall — not exercised by the wall.move dispatch below.
  wallsPinnedToSlab: () => [],
  // stair→handrail — not exercised either.
  handrailsOnStair: () => [],
  resampleHandrailPath: () => null,
  // wall→room — the dependency under injection: wall_A bounds two rooms.
  roomsAffectedByWall: (wallId: string) =>
    wallId === 'wall_A' ? ['room_1', 'room_2'] : [],
};

describe('registerCrossHandlers (PR-11 registration seam)', () => {
  it('registers all three rules on the real CascadeRunner and reports them', () => {
    const runner = new CascadeRunner();
    const result = registerCrossHandlers(runner, deps);
    expect(result.kind).toBe('registered');
    if (result.kind !== 'registered') throw new Error('unreachable');
    expect([...result.ruleKeys].sort()).toEqual([
      'cross.slab-wall',
      'cross.stair-handrail',
      'cross.wall-room',
    ]);
    for (const key of result.ruleKeys) expect(runner.has(key)).toBe(true);
  });

  it('a real wall.move dispatched through the runner synthesises room.recomputeBoundary per bounded room', () => {
    const runner = new CascadeRunner();
    const result = registerCrossHandlers(runner, deps);
    expect(result.kind).toBe('registered');

    const { commands, stats } = runner.dispatch(
      { type: 'wall.move', payload: { wallId: 'wall_A', delta: { x: 1, y: 0, z: 0 } } },
      { stores: {} },
    );

    const recomputes = commands.filter((c) => c.type === 'room.recomputeBoundary');
    expect(recomputes.map((c) => (c.payload as { roomId: string }).roomId).sort()).toEqual([
      'room_1',
      'room_2',
    ]);
    for (const c of recomputes) {
      expect(c.payload).toMatchObject({ cascadedFrom: 'wall.move', wallId: 'wall_A' });
    }
    // Root + two follow-ons, three distinct entities visited.
    expect(stats.commandsTotal).toBe(3);
    expect(stats.entitiesVisited).toBe(3);
  });

  it('a second call over the same runner is idempotent — reports alreadyRegistered, does not throw', () => {
    const runner = new CascadeRunner();
    registerCrossHandlers(runner, deps);
    const second = registerCrossHandlers(runner, deps);
    expect(second.kind).toBe('registered');
    if (second.kind !== 'registered') throw new Error('unreachable');
    expect(second.ruleKeys).toEqual([]);
    expect([...second.alreadyRegistered].sort()).toEqual([
      'cross.slab-wall',
      'cross.stair-handrail',
      'cross.wall-room',
    ]);
  });

  it('refuses with a TYPED CapabilityRefusal when handed a registry without the runner surface', () => {
    const warn = vi.spyOn(console, 'warn');
    // Today's CommandBus shape: no register()/has() cascade surface.
    const notARunner = { executeCommand: () => {} };
    const result = registerCrossHandlers(notARunner, deps);
    expect(result.kind).toBe('refused');
    if (result.kind !== 'refused') throw new Error('unreachable');
    expect(result.commandType).toBe(CROSS_COMMANDS.REGISTER_RULES);
    expect(result.reason).toBe('ENGINE_NOT_AVAILABLE');
    // C80 §1.4 — both numbers, and what the refusal protects.
    expect(result.asked).toBe(3);
    expect(result.unaccountedFor).toBe(3);
    expect(result.protects.length).toBeGreaterThan(0);
    expect(result.detail).toMatch(/3/);
    // The old silent-skip shape is dead: a refusal is a VALUE, not a warn.
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('refuses (not throws) on null/undefined registry', () => {
    for (const registry of [null, undefined]) {
      const result = registerCrossHandlers(registry, deps);
      expect(result.kind).toBe('refused');
    }
  });
});
