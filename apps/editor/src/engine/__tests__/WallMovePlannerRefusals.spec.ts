/**
 * WallMovePlannerRefusals — the MIGRATED home of SpeculativeEngine's 6
 * `semanticReadRefusal` tests (BIM30 R3, ADR-0323 disposition ladder).
 *
 * SpeculativeEngine's preview path is retired; its `SemanticReadRefusal` idiom — the rule
 * that **"I found nothing" and "I could not look" must never be the same value** — was
 * generalised into the consequence contract's `ImpactDetermination` /
 * `UndeterminedImpact` (packages/command-bus/src/consequence.ts) and is now expressed by
 * the `wall.move` planner's branches. These tests pin that distinction on its new owner:
 *
 *   SpeculativeEngine (retired)            →  WallMoveConsequencePlanner (here)
 *   ───────────────────────────────────────────────────────────────────────────
 *   §1 graph-absent  (could not look)      →  junction: no joinedWalls reader
 *                                             → undetermined ENGINE_NOT_AVAILABLE
 *   §2 method-absent (installed, no answer)→  junction: probe.ok=false
 *                                             → undetermined ENGINE_NOT_AVAILABLE (detail carried)
 *   §3 engine absent (validation)          →  violations: no validator
 *                                             → undetermined ENGINE_NOT_AVAILABLE
 *   §4 query-threw   (read raised)         →  violations: validator throws
 *                                             → undetermined ENGINE_NOT_AVAILABLE
 *   §5 found nothing ≠ could not look      →  junction: probe.ok=true, ids=[]
 *                                             → DETERMINED empty, NOT undetermined
 *   §6 found edges                         →  junction: probe.ok=true, ids=[…]
 *                                             → DETERMINED, ids in changed + topology.modified
 *
 * The load-bearing assertions (as in the original) are the ones that demand the
 * UNDETERMINED declaration NAME ITS REASON — an implementation that returned `[]` for a
 * branch it could not answer cannot satisfy them.
 */

import { describe, it, expect } from 'vitest';
import {
  WallMoveConsequencePlanner,
  type WallMoveCommand,
  type WallMovePlannerDeps,
} from '../consequence/WallMoveConsequencePlanner';
import type { PlanningContext, ReadonlyStoreView } from '@pryzm/command-bus';

// ── Fakes ──────────────────────────────────────────────────────────────────────

const WALL = {
  id: 'wall-1',
  baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
  levelId: 'L0',
  openings: [],
};

const TARGET_BASELINE = [{ x: 0.3, y: 0, z: 0 }, { x: 5.3, y: 0, z: 0 }];

function command(): WallMoveCommand {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { type: 'wall.move', payload: { id: 'wall-1', baseLine: TARGET_BASELINE as any } };
}

/** A PlanningContext whose wall store holds WALL; no room store (room branch stays undetermined). */
function context(): PlanningContext {
  const wallView: ReadonlyStoreView = {
    getAll: () => [WALL],
    getById: (id) => (id === WALL.id ? WALL : null),
  };
  return { getStore: (id) => (id === 'wall' ? wallView : undefined) };
}

/** Opening-refit seed that always fits (empty plan) — isolates the branch under test. */
const okOccupancy = { planOpeningRefit: () => ({ ok: true, refusals: [], relocations: [] }) };

function planner(deps: Partial<WallMovePlannerDeps>): WallMoveConsequencePlanner {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new WallMoveConsequencePlanner({ occupancy: okOccupancy as any, ...deps } as any);
}

const junctionUndetermined = (u: { scope: string }): boolean => /junction/i.test(u.scope);

// ── §1  Junction engine absent — could not look ─────────────────────────────────

describe('WallMoveConsequencePlanner — impact-determination refusals (migrated from SpeculativeEngine W2-3)', () => {
  it('§1 declares UNDETERMINED (by reason) when no joinedWalls reader is composed', async () => {
    const plan = await planner({ joinedWalls: undefined }).plan(command(), context());

    const j = plan.undetermined.find(junctionUndetermined);
    expect(j).toBeDefined();
    expect(j!.reason).toBe('ENGINE_NOT_AVAILABLE');
    expect(j!.scope).toContain('wall-1');
    // Never a bare empty set masquerading as "no junctions".
    expect(plan.indirect.kind).toBe('undetermined');
  });

  // ── §2  Junction reader present but cannot answer ─────────────────────────────

  it('§2 declares UNDETERMINED with the reader\'s own detail when the joinedTo writer has not covered the wall', async () => {
    const joinedWalls = {
      getJoinedWalls: (wallId: string) => ({
        ok: false as const,
        wallId,
        reason: 'wall-unknown-to-joinedTo-writer' as const,
        detail: 'no flush has covered wall-1 since load',
      }),
    };
    const plan = await planner({ joinedWalls }).plan(command(), context());

    const j = plan.undetermined.find(junctionUndetermined);
    expect(j).toBeDefined();
    expect(j!.reason).toBe('ENGINE_NOT_AVAILABLE');
    expect(j!.detail).toContain('no flush has covered wall-1');
  });

  // ── §3  Validation engine absent ──────────────────────────────────────────────

  it('§3 declares UNDETERMINED (by reason) when no constraint validator is composed', async () => {
    const plan = await planner({ validator: undefined }).plan(command(), context());

    const v = plan.undetermined.find((u) => /constraint validation/i.test(u.scope));
    expect(v).toBeDefined();
    expect(v!.reason).toBe('ENGINE_NOT_AVAILABLE');
    // An unanswered validation branch is never an empty (clean) violation delta.
    expect(plan.validation.violationsCreated).toEqual([]);
    expect(plan.validation.violationsResolved).toEqual([]);
  });

  // ── §4  Validation query throws ───────────────────────────────────────────────

  it('§4 declares UNDETERMINED when the validator throws — a read that could not run, not an empty delta', async () => {
    const validator = { validateAll: () => { throw new Error('index corrupt'); } };
    const plan = await planner({ validator }).plan(command(), context());

    const v = plan.undetermined.find((u) => /constraint validation/i.test(u.scope));
    expect(v).toBeDefined();
    expect(v!.reason).toBe('ENGINE_NOT_AVAILABLE');
    expect(plan.validation.violationsCreated).toEqual([]);
  });

  // ── §5  Found nothing ≠ could not look ────────────────────────────────────────

  it('§5 distinguishes "joins nothing" (DETERMINED empty) from "could not read" (undetermined)', async () => {
    const joinedWalls = {
      getJoinedWalls: (wallId: string) => ({ ok: true as const, wallId, joinedWallIds: [] as string[] }),
    };
    const plan = await planner({ joinedWalls }).plan(command(), context());

    // The junction question WAS answered — empty, but answered. It must NOT appear as an
    // undetermined blind spot (the exact conflation this test family exists to forbid).
    expect(plan.undetermined.find(junctionUndetermined)).toBeUndefined();
    // …and no phantom junction elements leaked into the change set.
    expect(plan.topology.modified).toEqual([]);
  });

  // ── §6  Found edges ───────────────────────────────────────────────────────────

  it('§6 reports the joined walls as DETERMINED — in changed and topology.modified', async () => {
    const joinedWalls = {
      getJoinedWalls: (wallId: string) => ({ ok: true as const, wallId, joinedWallIds: ['wall-2', 'wall-3'] }),
    };
    const plan = await planner({ joinedWalls }).plan(command(), context());

    expect(plan.undetermined.find(junctionUndetermined)).toBeUndefined();
    expect([...plan.topology.modified].sort()).toEqual(['wall-2', 'wall-3']);
    expect(plan.changed).toEqual(expect.arrayContaining(['wall-2', 'wall-3']));
  });
});
