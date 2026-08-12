/**
 * BIM30 R1 — compile-level proof of the consequence contract's type surface
 * (ADR-0322 §1/§5/§6; ADR-0324 §1–2).
 *
 * Most of this file's value is at COMPILE time: every union arm is exercised
 * through exhaustive switches whose `default` arm assigns to `never`, so a
 * future arm added to (or removed from) `ImpactDetermination`,
 * `UndeterminedReason` or `ConfirmationRequirement` makes THIS FILE fail to
 * compile until the switch is updated. The `@ts-expect-error` blocks prove
 * the inverse: shapes the contract forbids (a bare array where determination
 * status is the question — ADR-0322 §5's signature defect) do not compile.
 *
 * The runtime assertions are deliberately thin — they exist so vitest
 * executes the switches over BOTH arms and the suite counts the proof.
 *
 * NOTE ON TYPECHECK COVERAGE: `packages/command-bus/tsconfig.json` includes
 * only `src/**`, so this file is compiled by vitest's transform (which does
 * not enforce types). The type-level guarantees are verified by running
 * `npx tsc --noEmit` over this file explicitly — see the R1 report. Keep the
 * `@ts-expect-error` lines accurate: under tsc they FAIL the build if the
 * error beneath them ever disappears.
 */

import { describe, expect, it } from 'vitest';
import type {
  CommandActor,
  CommandApproval,
  CommandExecutionContext,
  CommandOrigin,
  ConfirmationPolicy,
  ConfirmationRequirement,
  ConsequencePlan,
  ConsequencePlanner,
  ConsequenceReport,
  ImpactDetermination,
  PlanningContext,
  ReadonlyStoreView,
  UndeterminedImpact,
  UndeterminedReason,
} from '../src/index.js';

// ─── ImpactDetermination — the load-bearing union (ADR-0322 §5) ──────────────

/**
 * Exhaustive by construction: remove an arm's `case` and `d` is not `never`
 * in `default`, so the assignment below is a COMPILE ERROR.
 */
function describeDetermination(d: ImpactDetermination): string {
  switch (d.kind) {
    case 'determined':
      return `determined:${d.elements.length}`;
    case 'undetermined':
      return `undetermined:${d.reason}:${d.scope}`;
    default: {
      const exhausted: never = d;
      return exhausted;
    }
  }
}

/**
 * Same construction over the UNDETERMINED reasons — the C78 §8.1 consolidated
 * union, CLOSED at ELEVEN members (the ADR-0322 §5 four, spelled exactly as
 * before, plus the seven C78 §8.1 added: one promoted, six minted).
 */
function describeReason(r: UndeterminedReason): string {
  switch (r) {
    case 'NO_DEPENDENCY_INDEX':
      return 'substrate not landed';
    case 'ENGINE_NOT_AVAILABLE':
      return 'engine unreachable';
    case 'UNSUPPORTED_ELEMENT_TYPE':
      return 'no rule for this kind';
    case 'STALE_DERIVED_STATE':
      return 'derived state stale';
    case 'INVALID_REQUEST':
      return 'caller payload malformed';
    case 'GEOMETRY_UNPREDICTABLE':
      return 'prediction geometrically impossible';
    case 'TOPOLOGY_CHANGE_POSSIBLE':
      return 'may split or merge the dependent';
    case 'RELATIONSHIP_NOT_RECORDED':
      return 'no producer writes this relationship';
    case 'RELATIONSHIP_NOT_READABLE':
      return 'edge written but unreadable in the needed direction';
    case 'AGGREGATE_SCOPE_UNSUPPORTED':
      return 'level-global dependency; per-element edge cannot express it';
    case 'PLANNER_THREW':
      return 'planner raised; caught and reported';
    default: {
      const exhausted: never = r;
      return exhausted;
    }
  }
}

/** And over the confirmation ladder (ADR-0322 §10). */
function describeRequirement(c: ConfirmationRequirement): string {
  switch (c) {
    case 'none':
      return 'proceed';
    case 'recommended':
      return 'soft ask';
    case 'required':
      return 'hard ask';
    default: {
      const exhausted: never = c;
      return exhausted;
    }
  }
}

// ─── Forbidden shapes — must NOT compile ─────────────────────────────────────

// ADR-0322 §5: where determination status is the question, a bare array is
// unrepresentable. `[]` is only sayable through the `determined` arm.
// @ts-expect-error — a bare element array is not an ImpactDetermination
const _bareArrayForbidden: ImpactDetermination = [];

// @ts-expect-error — an undetermined cell MUST carry scope and reason
const _reasonlessForbidden: ImpactDetermination = { kind: 'undetermined' };

// @ts-expect-error — the reason vocabulary is closed (C78 §8.1 names eleven)
const _madeUpReason: UndeterminedReason = 'DONT_FEEL_LIKE_IT';

void _bareArrayForbidden;
void _reasonlessForbidden;
void _madeUpReason;

// ─── Every contract type is constructible (the full-plan fixture) ───────────

const undetermined: UndeterminedImpact = {
  scope: 'regeneration of rooms adjacent to wall-42',
  reason: 'NO_DEPENDENCY_INDEX',
  detail: 'dependency wiring lands in roadmap Phase 5',
};

const plan: ConsequencePlan = {
  planId: 'plan-01',
  planHash: 'h-plan',
  stateHash: 'h-state',
  command: { type: 'wall.move', payload: { id: 'wall-42', dx: 0.3 } },
  direct: { kind: 'determined', elements: ['wall-42'] },
  indirect: { kind: 'undetermined', ...undetermined },
  changed: ['wall-42', 'door-7'],
  excluded: ['wall-9'],
  topology: { added: [], removed: [], modified: ['room-3'] },
  validation: {
    violationsCreated: [{ ruleId: 'MIN_ROOM_AREA', elementId: 'room-3' }],
    violationsResolved: [],
  },
  regeneration: {
    required: [],
    skipped: [{ id: 'room-3', reason: 'regeneration substrate not landed (Phase 5)' }],
  },
  refused: [
    {
      elementId: 'door-7',
      reason: 'door door-7 needs 0.900 m of wall length; the wall would be 0.500 m',
    },
  ],
  undetermined: [undetermined],
};

const actor: CommandActor = { kind: 'ai', id: 'agent-1' };
const origin: CommandOrigin = { surface: 'chat', proposalId: 'prop-9' };
const approval: CommandApproval = {
  proposalId: 'prop-9',
  approvedBy: 'user-7',
  rationale: 'reviewed the consequence card',
  confidence: 0.92,
};
const context: CommandExecutionContext = { actor, origin, approval };

const report: ConsequenceReport = {
  commandId: '01J0000000000000000000000',
  plan,
  actual: {
    changed: ['wall-42', 'door-7', 'room-3'],
    topology: { added: [], removed: [], modified: ['room-3'] },
    regenerated: [],
  },
  predictedVsActual: {
    unexpected: [],
    missing: [],
    undeterminedResolved: ['room-3'],
  },
  validation: {
    violationsCreated: [{ ruleId: 'MIN_ROOM_AREA', elementId: 'room-3' }],
    violationsResolved: [],
  },
  provenance: { actor, origin, approval },
};

const policy: ConfirmationPolicy = {
  requirement: 'required',
  reasons: ['changes_hosted_elements', 'impact_partially_undetermined'],
};

// A planner is implementable against the minimal PlanningContext alone.
const walMovePlanner: ConsequencePlanner<{ id: string; dx: number }> = {
  async plan(_command, ctx: PlanningContext): Promise<ConsequencePlan> {
    const walls: ReadonlyStoreView | undefined = ctx.getStore('wall');
    void walls?.getAll();
    void walls?.getById('wall-42');
    return plan;
  },
};

// ─── Runtime execution of the proofs ─────────────────────────────────────────

describe('consequence contract — union arms and constructibility (R1)', () => {
  it('ImpactDetermination switch covers both arms', () => {
    expect(describeDetermination({ kind: 'determined', elements: [] })).toBe('determined:0');
    expect(describeDetermination({ kind: 'undetermined', ...undetermined })).toBe(
      'undetermined:NO_DEPENDENCY_INDEX:regeneration of rooms adjacent to wall-42',
    );
  });

  it('all eleven UNDETERMINED reasons are distinct, handled arms (C78 §8.1)', () => {
    const reasons: readonly UndeterminedReason[] = [
      'NO_DEPENDENCY_INDEX',
      'ENGINE_NOT_AVAILABLE',
      'UNSUPPORTED_ELEMENT_TYPE',
      'STALE_DERIVED_STATE',
      'INVALID_REQUEST',
      'GEOMETRY_UNPREDICTABLE',
      'TOPOLOGY_CHANGE_POSSIBLE',
      'RELATIONSHIP_NOT_RECORDED',
      'RELATIONSHIP_NOT_READABLE',
      'AGGREGATE_SCOPE_UNSUPPORTED',
      'PLANNER_THREW',
    ];
    expect(new Set(reasons.map(describeReason)).size).toBe(11);
  });

  it('all three confirmation requirements are handled arms', () => {
    const levels: readonly ConfirmationRequirement[] = ['none', 'recommended', 'required'];
    expect(new Set(levels.map(describeRequirement)).size).toBe(3);
  });

  it('the full plan/report/policy fixtures hold together', async () => {
    // `untouched` is DERIVED, never persisted (ADR-0322 §6) — the plan and
    // report objects must not even have the key.
    expect('untouched' in plan).toBe(false);
    expect('untouched' in report.actual).toBe(false);
    expect(plan.excluded).toEqual(['wall-9']);
    expect(report.plan).toBe(plan);
    expect(policy.requirement).toBe('required');
    expect(context.actor.kind).toBe('ai');

    const produced = await walMovePlanner.plan(
      { id: 'wall-42', dx: 0.3 },
      { getStore: () => undefined },
    );
    expect(produced.planId).toBe('plan-01');
  });
});
