/**
 * @file packages/constraint-solver/__tests__/support/complianceHarness.ts
 *
 * Shared fixture builders for the `./compliance` rule-family suites
 * (`ConstraintEngine.rules.test.ts` predates this file and keeps its own
 * copies; `ConstraintEngine.spatial.test.ts` and
 * `ConstraintEngine.physics.test.ts` use these).
 *
 * This module supplies the rules' INPUT only — plain objects exposing exactly
 * the methods the rules call (`getAll`, `getByLevel`, `getTotalAreaForLevel`,
 * `getRoomsAdjacentToWall`, `getLevels`). No rule logic lives here, no
 * `ValidationResult` is ever constructed here, and no expected message string
 * is stored here. Each consuming suite imports the REAL engine from
 * `../src/ConstraintEngine.js` itself — the binding to the subject stays in
 * the file that asserts on it, where C74 §3.5 says it must be visible.
 */

import { expect } from 'vitest';
import type { ValidationResult } from '../../src/ConstraintEngine.js';

/** The slice of the compliance engine the suites drive. */
export interface ComplianceEngine {
  validateAll(ctx: unknown): ValidationResult[];
}

export interface RoomFixture {
  id: string;
  name?: string;
  occupancyType: string;
  levelId?: string;
  /** Read only by ACOUSTIC_RT60_COURT's size guard. */
  volume?: number;
  computed: {
    area?: number;
    centroid?: { x: number; z: number };
    boundingBox?: { minX: number; maxX: number; minZ: number; maxZ: number };
  };
}

/** A context with every store absent; tests fill in only what they need. */
export function emptyContext(): Record<string, unknown> {
  return {
    roomStore: null,
    doorStore: null,
    windowStore: null,
    wallStore: null,
    stairStore: null,
    bimManager: null,
  };
}

export function contextWith(overrides: Record<string, unknown>): Record<string, unknown> {
  return { ...emptyContext(), ...overrides };
}

/**
 * A room store over a fixed room list. Every derived answer (`getByLevel`,
 * `getTotalAreaForLevel`) is computed from the same `rooms` array, so a test
 * cannot accidentally hand two rules two different models. `adjacency` maps
 * wallId → room ids for the wall-hop rules.
 */
export function roomStore(rooms: RoomFixture[], adjacency: Record<string, string[]> = {}) {
  return {
    getAll: () => rooms,
    getRoomsAdjacentToWall: (wallId: string) =>
      (adjacency[wallId] ?? []).map((id) => rooms.find((r) => r.id === id)).filter(Boolean),
    getByLevel: (levelId: string) => rooms.filter((r) => r.levelId === levelId),
    getTotalAreaForLevel: (levelId: string) =>
      rooms
        .filter((r) => r.levelId === levelId)
        .reduce((sum, r) => sum + (r.computed.area ?? 0), 0),
  };
}

/** The `bimManager` slice the level-scoped rules read. */
export function bimLevels(levels: Array<{ id: string; name?: string; elevation?: number }>) {
  return { getLevels: () => levels };
}

/** Every finding the REAL engine produced for one rule id, on this context. */
export function findingsFor(
  engine: ComplianceEngine,
  ruleId: string,
  ctx: Record<string, unknown>,
): ValidationResult[] {
  return engine.validateAll(ctx).filter((r) => r.ruleId === ruleId);
}

/** Exactly one finding, returned — the common form of a fires-once assertion. */
export function soleFinding(
  engine: ComplianceEngine,
  ruleId: string,
  ctx: Record<string, unknown>,
): ValidationResult {
  const found = findingsFor(engine, ruleId, ctx);
  expect(found, `expected exactly one ${ruleId} finding, got ${found.length}`).toHaveLength(1);
  return found[0]!;
}
