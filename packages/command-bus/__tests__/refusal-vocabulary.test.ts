/**
 * C78 §8 (Phase 3, L1 cornerstone) — proof of the consolidated refusal
 * vocabulary and the typed preview outcome.
 *
 * Four proofs, per the lane brief:
 *   1. EXHAUSTIVENESS — a switch over all ELEVEN `UndeterminedReason` members
 *      compiles with its `default` arm assigning to `never` (add or remove a
 *      member and this file stops compiling under tsc).
 *   2. SUB-REASON OWNERSHIP — every `UndeterminedSubReason` maps to exactly
 *      one parent member of the closed union (C78 §8.3), and the
 *      room-prediction bridge (§8.5) classifies all eight
 *      `RoomPredictionRefusal` literals without a default funnel — in
 *      particular, `COLLAPSED` and `STALE_DERIVED_STATE` can never print the
 *      same value again.
 *   3. THE FOUR RETIRED NULL CAUSES construct DISTINCT outcomes — N1 and N4
 *      (semantic opposites that used to be the same `null`) are distinct by
 *      construction; N2/N3 and N5 are distinct from both.
 *   4. PARITY PIN — `normalizeForParity` KEEPS `reason`/`subReason` on the
 *      consequence report (they are behavioural: same command + state must
 *      refuse for the same reason — parity.ts's C78 §8 block).
 *
 * NOTE ON TYPECHECK COVERAGE: as with consequence-types.test.ts, vitest's
 * transform does not enforce types; the type-level halves are verified by
 * `npx tsc --noEmit` over this file explicitly.
 */

import { describe, expect, it } from 'vitest';
import {
  UNDETERMINED_SUB_REASON_PARENT,
  classifyRoomPredictionRefusal,
  plannedOutcome,
  undeterminedOutcome,
  previewUnrecognisedVerb,
  previewInvalidRequest,
  previewPlannerNotComposed,
  previewPlannerThrew,
  normalizeForParity,
} from '../src/index.js';
import type {
  ConsequencePlan,
  ConsequenceReport,
  EventRecord,
  PlanBindingVerification,
  PlanStaleRefusal,
  PreviewOutcome,
  RoomPredictionRefusalLiteral,
  UndeterminedImpact,
  UndeterminedReason,
  UndeterminedSubReason,
} from '../src/index.js';

// ─── 1 · Exhaustiveness of the closed union of ELEVEN (C78 §8.1) ─────────────

/**
 * Compiles ONLY while the union has exactly these eleven arms: a twelfth
 * member makes `default` reachable with a non-never value; a removed member
 * makes its `case` a type error.
 */
function categorize(r: UndeterminedReason): 'capability' | 'request' | 'geometry' | 'relationship' | 'scope' | 'failure' {
  switch (r) {
    case 'NO_DEPENDENCY_INDEX':
    case 'ENGINE_NOT_AVAILABLE':
    case 'UNSUPPORTED_ELEMENT_TYPE':
    case 'STALE_DERIVED_STATE':
      return 'capability';
    case 'INVALID_REQUEST':
      return 'request';
    case 'GEOMETRY_UNPREDICTABLE':
    case 'TOPOLOGY_CHANGE_POSSIBLE':
      return 'geometry';
    case 'RELATIONSHIP_NOT_RECORDED':
    case 'RELATIONSHIP_NOT_READABLE':
      return 'relationship';
    case 'AGGREGATE_SCOPE_UNSUPPORTED':
      return 'scope';
    case 'PLANNER_THREW':
      return 'failure';
    default: {
      const exhausted: never = r;
      return exhausted;
    }
  }
}

const ALL_ELEVEN: readonly UndeterminedReason[] = [
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

// The union is CLOSED — a minted value outside it does not compile.
// @ts-expect-error — C78 §8.1: adding a member is a contract edit
const _outsideTheUnion: UndeterminedReason = 'VIBES_OFF';
void _outsideTheUnion;

// Sub-reasons are typed, closed, and not interchangeable with parents.
// @ts-expect-error — a parent member is not a sub-reason
const _parentAsSub: UndeterminedSubReason = 'GEOMETRY_UNPREDICTABLE';
void _parentAsSub;

// ─── Fixtures for the parity arm ─────────────────────────────────────────────

const collapsedRoom: UndeterminedImpact = {
  scope: 'predicted geometry of room-3',
  reason: 'GEOMETRY_UNPREDICTABLE',
  subReason: 'COLLAPSED',
  detail: 'the move collapses room-3 to near-zero area',
};

const plan: ConsequencePlan = {
  planId: 'plan-c78',
  planHash: 'h-plan',
  stateHash: 'h-state',
  command: { type: 'wall.move', payload: { id: 'wall-1', dx: 3 } },
  direct: { kind: 'determined', elements: ['wall-1'] },
  indirect: { kind: 'undetermined', ...collapsedRoom },
  changed: ['wall-1'],
  excluded: [],
  topology: { added: [], removed: [], modified: [] },
  validation: { violationsCreated: [], violationsResolved: [] },
  regeneration: { required: [], skipped: [] },
  refused: [],
  undetermined: [collapsedRoom],
};

const report: ConsequenceReport = {
  commandId: '01J00000000000000000000000',
  plan,
  actual: {
    changed: ['wall-1'],
    topology: { added: [], removed: [], modified: [] },
    regenerated: [],
  },
  predictedVsActual: { unexpected: [], missing: [], undeterminedResolved: [] },
  validation: { violationsCreated: [], violationsResolved: [] },
  provenance: { actor: { kind: 'human', id: 'user-1' } },
};

function makeRecord(): EventRecord<{ id: string; dx: number }> {
  return {
    id: '01J00000000000000000000001',
    type: 'wall.move',
    payload: { id: 'wall-1', dx: 3 },
    affectedStores: ['wall'],
    patches: [
      {
        storeKey: 'wall',
        forwardPatches: [],
        inversePatches: [],
        capturedAt: '2026-08-12T00:00:00.000Z',
      },
    ],
    audit: {
      actorId: 'user-1',
      projectId: 'proj-1',
      clientId: 'tab-1',
      timestamp: '2026-08-12T00:00:00.000Z',
    },
    forward: [],
    inverse: [],
    consequence: report,
  };
}

// ─── Runtime proofs ──────────────────────────────────────────────────────────

describe('C78 §8.1 — the closed union of eleven', () => {
  it('a default-as-never switch handles all eleven members', () => {
    expect(new Set(ALL_ELEVEN).size).toBe(11);
    for (const r of ALL_ELEVEN) {
      expect(typeof categorize(r)).toBe('string');
    }
  });

  it('the original four spellings are unchanged (non-breaking extension)', () => {
    for (const legacy of [
      'NO_DEPENDENCY_INDEX',
      'ENGINE_NOT_AVAILABLE',
      'UNSUPPORTED_ELEMENT_TYPE',
      'STALE_DERIVED_STATE',
    ] as const) {
      expect(ALL_ELEVEN).toContain(legacy);
    }
  });
});

describe('C78 §8.3 — every sub-reason maps to exactly one parent', () => {
  it('every entry of the ownership map points at a member of the closed union', () => {
    const subReasons = Object.keys(UNDETERMINED_SUB_REASON_PARENT) as UndeterminedSubReason[];
    expect(subReasons.length).toBe(10); // 7 room-prediction + 2 preview-entry + 1 joinedTo
    for (const sub of subReasons) {
      const parent = UNDETERMINED_SUB_REASON_PARENT[sub];
      expect(ALL_ELEVEN).toContain(parent);
    }
  });

  it('a Record over the closed key union IS "exactly one parent" — no key can be absent or doubled', () => {
    // Runtime restatement of the compile-time fact: each sub-reason appears
    // once as a key, so lookup is a function, not a relation.
    const entries = Object.entries(UNDETERMINED_SUB_REASON_PARENT);
    expect(new Set(entries.map(([k]) => k)).size).toBe(entries.length);
  });

  it('the eight RoomPredictionRefusal literals classify losslessly (§8.5 bridge, no default funnel)', () => {
    const eight: readonly RoomPredictionRefusalLiteral[] = [
      'NO_WALL_LINKAGE',
      'MISSING_BOUNDING_WALL',
      'CURVED_WALL_UNSUPPORTED',
      'DEGENERATE_BOUNDARY',
      'OPEN_LOOP',
      'SELF_INTERSECTING',
      'COLLAPSED',
      'TOPOLOGY_CHANGE_POSSIBLE',
    ];
    const classified = eight.map((r) => classifyRoomPredictionRefusal(r));

    // Eight in, eight DISTINCT (reason, subReason) pairs out — the 7-into-1
    // collapse is over.
    const printed = classified.map((c) => `${c.reason}/${c.subReason ?? '—'}`);
    expect(new Set(printed).size).toBe(8);

    // The C78 §8.2 target rows, verbatim:
    expect(classifyRoomPredictionRefusal('NO_WALL_LINKAGE')).toEqual({
      reason: 'RELATIONSHIP_NOT_RECORDED',
      subReason: 'NO_WALL_LINKAGE',
    });
    expect(classifyRoomPredictionRefusal('MISSING_BOUNDING_WALL')).toEqual({
      reason: 'RELATIONSHIP_NOT_RECORDED',
      subReason: 'MISSING_BOUNDING_WALL',
    });
    for (const geo of [
      'CURVED_WALL_UNSUPPORTED',
      'DEGENERATE_BOUNDARY',
      'OPEN_LOOP',
      'SELF_INTERSECTING',
      'COLLAPSED',
    ] as const) {
      expect(classifyRoomPredictionRefusal(geo)).toEqual({
        reason: 'GEOMETRY_UNPREDICTABLE',
        subReason: geo,
      });
    }
    // Promoted, not sub-reasoned: a determinate statement about topology.
    expect(classifyRoomPredictionRefusal('TOPOLOGY_CHANGE_POSSIBLE')).toEqual({
      reason: 'TOPOLOGY_CHANGE_POSSIBLE',
    });

    // The sentence the whole lane exists for: COLLAPSED and "stale cache"
    // never print the same value again.
    const collapsed = classifyRoomPredictionRefusal('COLLAPSED');
    expect(collapsed.reason).not.toBe('STALE_DERIVED_STATE');
    expect(collapsed.subReason).toBe('COLLAPSED');
  });
});

describe('C78 §8.8 — PreviewOutcome retires the four-cause null', () => {
  it('the four null causes construct four DISTINCT typed outcomes', () => {
    const n1 = previewUnrecognisedVerb('teleporter.engage');
    const n23 = previewInvalidRequest('wall.move', 'id is not a string');
    const n4 = previewPlannerNotComposed('wall.move');
    const n5 = previewPlannerThrew('wall.move', new Error('boom'));

    for (const o of [n1, n23, n4, n5]) {
      expect(o.kind).toBe('undetermined');
    }
    const keys = [n1, n23, n4, n5].map((o) =>
      o.kind === 'undetermined' ? `${o.reason}/${o.subReason ?? '—'}` : 'planned',
    );
    expect(new Set(keys).size).toBe(4);

    // N1 and N4 — the semantic opposites that used to be one `null` — carry
    // the exact C78 §8.2 classifications:
    expect(n1).toMatchObject({
      reason: 'UNSUPPORTED_ELEMENT_TYPE',
      subReason: 'no-normalizer-for-verb',
    });
    expect(n4).toMatchObject({
      reason: 'ENGINE_NOT_AVAILABLE',
      subReason: 'no-planner-registered',
    });
    expect(n23).toMatchObject({ reason: 'INVALID_REQUEST' });
    expect(n5).toMatchObject({ reason: 'PLANNER_THREW' });
    if (n5.kind === 'undetermined') {
      expect(n5.detail).toContain('boom'); // the producer's own words survive
    }
  });

  it('the planned arm carries the plan whole; the general constructor round-trips', () => {
    const planned: PreviewOutcome = plannedOutcome(plan);
    expect(planned.kind).toBe('planned');
    if (planned.kind === 'planned') expect(planned.plan).toBe(plan);

    const general = undeterminedOutcome(
      'AGGREGATE_SCOPE_UNSUPPORTED',
      'FIRE_COMPARTMENT_AREA takes the level as subject',
    );
    expect(general).toEqual({
      kind: 'undetermined',
      reason: 'AGGREGATE_SCOPE_UNSUPPORTED',
      detail: 'FIRE_COMPARTMENT_AREA takes the level as subject',
    });
    // No subReason supplied ⇒ the key is OMITTED, not set to undefined
    // (byte-identical wire encodings for producers that have no sub-reason).
    expect('subReason' in general).toBe(false);
  });

  it('a PreviewOutcome cannot be null and its undetermined arm cannot be reasonless', () => {
    // @ts-expect-error — null is not a PreviewOutcome; that is the point
    const _null: PreviewOutcome = null;
    void _null;
    // @ts-expect-error — the undetermined arm MUST carry reason and detail
    const _bare: PreviewOutcome = { kind: 'undetermined' };
    void _bare;
    expect(true).toBe(true);
  });
});

describe('C78 §9.3 — the sentinel successor field', () => {
  it('PlanBindingVerification types the two sentinel facts; hash fields stay hashes', () => {
    const unverifiable: PlanBindingVerification = {
      kind: 'unverifiable',
      reason: 'UNSUPPORTED_ELEMENT_TYPE', // 'UNVERIFIABLE:no-planner-for-type', typed
      subReason: 'no-normalizer-for-verb',
      detail: 'no planner family answers for door.move',
    };
    const refusal: PlanStaleRefusal = {
      kind: 'PLAN_STALE',
      stalePlan: plan,
      plannedPlanHash: 'h-plan',
      plannedStateHash: 'h-state',
      livePlanHash: 'h-live-plan',
      liveStateHash: 'h-live-state',
      liveVerification: unverifiable,
    };
    expect(refusal.liveVerification?.kind).toBe('unverifiable');

    // The field is OPTIONAL — every legacy producer keeps compiling:
    const legacy: PlanStaleRefusal = {
      kind: 'PLAN_STALE',
      stalePlan: plan,
      plannedPlanHash: 'h-plan',
      plannedStateHash: 'h-state',
      livePlanHash: 'h-live-plan',
      liveStateHash: 'h-live-state',
    };
    expect(legacy.liveVerification).toBeUndefined();

    // @ts-expect-error — the unverifiable arm MUST carry a typed reason
    const _reasonless: PlanBindingVerification = { kind: 'unverifiable' };
    void _reasonless;
  });
});

describe('G-REASON-04 parity — refusal reasons are behavioural and KEPT', () => {
  it('normalizeForParity keeps reason and subReason on the consequence report', () => {
    const normalized = normalizeForParity(makeRecord());

    expect(normalized.consequence).toBeDefined();
    // Provenance and commandId are the exclusion list — stripped:
    expect(normalized.consequence && 'provenance' in normalized.consequence).toBe(false);
    expect(normalized.consequence && 'commandId' in normalized.consequence).toBe(false);

    // The refusal vocabulary is behavioural — kept, verbatim:
    const kept = normalized.consequence?.plan.undetermined ?? [];
    expect(kept).toHaveLength(1);
    expect(kept[0]).toEqual(collapsedRoom);
    expect(kept[0]?.reason).toBe('GEOMETRY_UNPREDICTABLE');
    expect(kept[0]?.subReason).toBe('COLLAPSED');
  });

  it('two records differing ONLY in refusal reason do NOT normalize equal (the divergence parity must see)', () => {
    const a = makeRecord();
    const staleInstead: UndeterminedImpact = {
      scope: collapsedRoom.scope,
      reason: 'STALE_DERIVED_STATE',
      detail: collapsedRoom.detail,
    };
    const b: EventRecord<{ id: string; dx: number }> = {
      ...a,
      consequence: {
        ...report,
        plan: { ...plan, undetermined: [staleInstead] },
      },
    };
    expect(normalizeForParity(a)).not.toEqual(normalizeForParity(b));
  });
});
