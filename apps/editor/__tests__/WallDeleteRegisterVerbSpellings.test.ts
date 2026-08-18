/**
 * WALL-DELETE REGISTER-VERB SPELLINGS — the WALL (host-side) DELETE family reaches a
 * composed planner (C78 §1.1 · §5.1 · §19.1 · the bar-3 determination gate).
 *
 * ════ THE FAMILY, AND WHY IT IS ONE VERB ══════════════════════════════════════════════
 * ENUMERATED from the GENERATED register `docs/04-reference/API-VERB-REGISTER.md` — the
 * same file check-relationship-determination parses — filtered by that gate's own
 * `opClassOf`. Exactly three register verbs can remove a wall:
 *
 *   `wall.delete`         plugins/wall DeleteWall.ts, payload `{ id }`     ← THIS FAMILY
 *   `element.delete`      the generic TYPE-DISPATCHING legacy verb          ← excluded
 *   `element.deleteBatch` generic, and outside the gate's own denominator   ← excluded
 *
 * MEASURED ABSENT: `wall.batch.delete`, `wall.deleteBatch`, `walls.delete`, `wall.remove`.
 * So the family is ONE verb and the register spelling IS the semantic spelling — as it
 * already is for `wall.create` and `wall.move`. C78 §19.1 is satisfied by that one verb
 * landing, and this file asserts the exclusions explicitly so a later author cannot quietly
 * widen the family to the generic verbs.
 *
 * ════ WHAT IS REAL AND WHAT IS A DOUBLE (C72 §3.4) ════════════════════════════════════
 * REAL — the normaliser registry, the `WallDeleteConsequencePlanner`, and the plan it
 * computes. DOUBLE — the store views (input side) and the four INJECTED readers, which
 * exist precisely so the production singletons stay out of a node-env suite.
 *
 * ════ THE SEAM RULE ═══════════════════════════════════════════════════════════════════
 * Every double returns a RECORD or a typed QUERY RESULT, never a conclusion. The
 * `boundingWalls` double answers "which walls bound room R" (and can REFUSE); the planner
 * decides what that means for a delete. A double that returned "these rooms are affected"
 * would be handing the planner its own verdict — the defect C72 §3.4 forbids by name.
 */

import { describe, expect, it } from 'vitest';
import type { ConsequencePlanner, PlanningContext } from '@pryzm/command-bus';
import { WallDeleteConsequencePlanner } from '../src/engine/consequence/WallDeleteConsequencePlanner';
import {
  ConsequencePreviewService,
  normalizeConsequenceCommand,
  CONSEQUENCE_NORMALIZERS,
} from '../src/engine/consequence/ConsequencePreviewService';
import { planOnly } from './_previewPlanAdapter';
import type { PlanOnlyPreviewProvider } from './_previewPlanAdapter';

// ─── The closed union (C78 §8.1), transcribed ONCE so a new member cannot slip in ─────
const CLOSED_REASONS = [
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
] as const;

// ─── The world ────────────────────────────────────────────────────────────────────────

interface Opening {
  id: string;
  elementId: string;
  type: 'door' | 'window';
  offset: number;
  width: number;
}

interface Wall {
  id: string;
  type: 'wall';
  levelId: string;
  baseLine: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
  height: number;
  thickness: number;
  openings: Opening[];
  childrenIds?: string[];
}

/**
 * `wall-1` is the subject: 6 m on L1, hosting door-1 and win-1 in BOTH host-side records
 * (`childrenIds` and `openings[]` agree, which is the healthy case — the disagreement case
 * gets its own world below). `wall-2` is joined to it; `wall-3` is on the same level and is
 * NOT joined, so it can be reported as CHECKED-and-unaffected.
 */
function subject(overrides: Partial<Wall> = {}): Wall {
  return {
    id: 'wall-1',
    type: 'wall',
    levelId: 'L1',
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
    height: 2.7,
    thickness: 0.2,
    openings: [
      { id: 'op-d1', elementId: 'door-1', type: 'door', offset: 0.5, width: 0.9 },
      { id: 'op-w1', elementId: 'win-1', type: 'window', offset: 3.0, width: 1.2 },
    ],
    childrenIds: ['door-1', 'win-1'],
    ...overrides,
  };
}

function plainWall(id: string, levelId = 'L1'): Wall {
  return {
    id,
    type: 'wall',
    levelId,
    baseLine: [{ x: 6, y: 0, z: 0 }, { x: 6, y: 0, z: 4 }],
    height: 2.7,
    thickness: 0.2,
    openings: [],
    childrenIds: [],
  };
}

interface World {
  walls: Wall[];
  rooms: Record<string, unknown>[];
}

const freshWorld = (): World => ({
  walls: [subject(), plainWall('wall-2'), plainWall('wall-3')],
  rooms: [{ id: 'room-1' }, { id: 'room-2' }],
});

function contextFor(world: World): () => PlanningContext {
  return () =>
    ({
      getStore(storeId: string) {
        const items: Record<string, unknown>[] | undefined =
          storeId === 'wall'
            ? (world.walls as unknown as Record<string, unknown>[])
            : storeId === 'room'
              ? world.rooms
              : storeId === 'door' || storeId === 'window' || storeId === 'stair'
                ? []
                : undefined;
        if (!items) return undefined;
        return {
          getAll: () => items as readonly unknown[],
          getById: (id: string) => items.find((i) => i.id === id) ?? null,
        };
      },
    }) as unknown as PlanningContext;
}

// ─── The doubles: RECORDS and typed QUERY RESULTS, never verdicts ─────────────────────

/** `getJoinedWalls` as ADR-0321 types it: ok:true is a POSITIVE answer (empty included). */
const joinedWallsOk = {
  getJoinedWalls: (wallId: string) =>
    wallId === 'wall-1'
      ? ({ ok: true, wallId, joinedWallIds: ['wall-2'] } as const)
      : ({ ok: true, wallId, joinedWallIds: [] } as const),
};

/** `{ok:false}` — the junction writer has never covered this wall. NOT "joins nothing". */
const joinedWallsRefusing = {
  getJoinedWalls: (wallId: string) =>
    ({
      ok: false,
      wallId,
      reason: 'wall-unknown-to-joinedTo-writer',
      detail: `joinedTo lookup for wall ${wallId}: no flush has covered its level since load`,
    }) as const,
};

/** `getBoundingWalls` — room-1 IS bounded by wall-1; room-2 is not, and says so positively. */
const boundingWallsOk = {
  getBoundingWalls: (roomId: string) =>
    roomId === 'room-1'
      ? ({ ok: true, roomId, boundingWallIds: ['wall-1', 'wall-2'] } as const)
      : ({ ok: true, roomId, boundingWallIds: ['wall-3'] } as const),
};

const EDGES = [
  { id: 'e1', type: 'hosts', sourceId: 'wall-1', targetId: 'door-1' },
  { id: 'e2', type: 'boundedBy', sourceId: 'room-1', targetId: 'wall-1' },
  { id: 'e3', type: 'sitsOn', sourceId: 'wall-1', targetId: 'L1' },
];

/** Fires on any LEVEL carrying more than 2 walls — present before (3), absent after (2),
 *  so `violationsResolved` carries bytes on the default plan. */
const crowdedLevelValidator = {
  validateAll: (ctx: { wallStore: { getAll: () => Record<string, unknown>[] } }) =>
    ctx.wallStore.getAll().length > 2
      ? [{ ruleId: 'LEVEL_MAX_WALLS', elementId: 'L1', message: `level L1 carries ${ctx.wallStore.getAll().length} walls, above the 2 permitted` }]
      : [],
};

/** The mirror: fires only when the level has FEWER than 3 walls — so the delete CREATES it.
 *  A planner that only ever reported the flattering half would pass the test above and fail
 *  this one. */
const underPopulatedValidator = {
  validateAll: (ctx: { wallStore: { getAll: () => Record<string, unknown>[] } }) =>
    ctx.wallStore.getAll().length < 3
      ? [{ ruleId: 'ROOM_NEEDS_ENCLOSURE', elementId: 'room-1', message: 'room-1 is no longer enclosed' }]
      : [],
};

const quietValidator = { validateAll: () => [] };

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Opts {
  joinedWalls?: any;
  omitJoinedWalls?: boolean;
  boundingWalls?: any;
  omitBoundingWalls?: boolean;
  relationships?: any;
  omitRelationships?: boolean;
  validator?: any;
  omitValidator?: boolean;
}

/** The REAL planner over injected doubles. Each `omit*` is an EXPLICIT absence — distinct
 *  from "not overridden", which `?? default` cannot express. */
function planner(opts: Opts = {}): WallDeleteConsequencePlanner {
  return new WallDeleteConsequencePlanner({
    ...(opts.omitJoinedWalls ? {} : { joinedWalls: (opts.joinedWalls ?? joinedWallsOk) as any }),
    ...(opts.omitBoundingWalls ? {} : { boundingWalls: (opts.boundingWalls ?? boundingWallsOk) as any }),
    ...(opts.omitRelationships ? {} : { relationships: (opts.relationships ?? { getRelationships: () => EDGES }) as any }),
    ...(opts.omitValidator ? {} : { validator: (opts.validator ?? crowdedLevelValidator) as any }),
  });
}

/** The REAL preview service over the REAL planner, keyed exactly as the composition keys it. */
function service(world: World, opts: Opts = {}): PlanOnlyPreviewProvider {
  const planners = new Map<string, ConsequencePlanner<never>>();
  planners.set('wall.delete', planner(opts) as unknown as ConsequencePlanner<never>);
  return planOnly(new ConsequencePreviewService(planners, contextFor(world)));
}

const CMD = { type: 'wall.delete', payload: { id: 'wall-1' } };

const reasonsOf = (p: any): string[] => (p.undetermined ?? []).map((u: any) => u.reason);
const scopedDetail = (p: any, needle: string): string =>
  (p.undetermined ?? []).find((u: any) => u.scope.includes(needle))?.detail ?? '';

// ══════════════════════════════════════════════════════════════════════════════════════

describe('wall.delete — the normaliser registry (C78 §5, U-INV-5)', () => {
  it('maps wall.delete onto the semantic wall.delete, renaming the key and nothing else', () => {
    const out = normalizeConsequenceCommand({ type: 'wall.delete', payload: { id: 'wall-9' } } as any);
    expect(out).toEqual({ type: 'wall.delete', payload: { id: 'wall-9' } });
  });

  it('accepts the cross-cascade rule\'s wallId spelling — the SAME precedence wall-room.ts uses', () => {
    const out = normalizeConsequenceCommand({ type: 'wall.delete', payload: { wallId: 'wall-9' } } as any);
    expect(out).toEqual({ type: 'wall.delete', payload: { id: 'wall-9' } });
  });

  it('prefers wallId over id when a dispatch carries both, exactly as plugins/cross does', () => {
    // The cascade rule reads `payload.wallId ?? payload.id`. If this planner reversed the
    // precedence, one dispatch would name two different walls to two readers.
    const out = normalizeConsequenceCommand({
      type: 'wall.delete',
      payload: { wallId: 'wall-from-cascade', id: 'wall-from-handler' },
    } as any);
    expect(out).toEqual({ type: 'wall.delete', payload: { id: 'wall-from-cascade' } });
  });

  it('does NOT accept the chaos-fixture targetId spelling — no production dispatcher emits it', () => {
    expect(normalizeConsequenceCommand({ type: 'wall.delete', payload: { targetId: 'wall-9' } } as any)).toBeNull();
  });

  it('answers null — a capability gap, not a plan about an invented wall — when no id is carried', () => {
    expect(normalizeConsequenceCommand({ type: 'wall.delete', payload: {} } as any)).toBeNull();
    expect(normalizeConsequenceCommand({ type: 'wall.delete', payload: null } as any)).toBeNull();
  });

  it('lets an EMPTY-STRING id through, so the mirrored canExecute refusal stays reachable', () => {
    // Filtering it here would hide a real refusal branch behind a silent null.
    expect(normalizeConsequenceCommand({ type: 'wall.delete', payload: { id: '' } } as any))
      .toEqual({ type: 'wall.delete', payload: { id: '' } });
  });

  it('registers wall.delete — the one register verb of this family', () => {
    expect(CONSEQUENCE_NORMALIZERS.has('wall.delete')).toBe(true);
  });

  it('does NOT claim element.delete or element.deleteBatch — those are the generic type-dispatching verbs', () => {
    // Mapping them here would plan a WALL delete for a beam. The exclusion is asserted, not
    // merely intended, so widening the family becomes a visible test change.
    expect(CONSEQUENCE_NORMALIZERS.has('element.delete')).toBe(false);
    expect(CONSEQUENCE_NORMALIZERS.has('element.deleteBatch')).toBe(false);
  });

  it('does not invent the batch spellings the register measurably does not carry', () => {
    for (const absent of ['wall.batch.delete', 'wall.deleteBatch', 'walls.delete', 'wall.remove']) {
      expect(CONSEQUENCE_NORMALIZERS.has(absent)).toBe(false);
    }
  });
});

describe('wall.delete — the verb reaches ONE composed planner', () => {
  it('produces a plan through the REAL preview service', async () => {
    const plan = await service(freshWorld()).preview(CMD as any);
    expect(plan).not.toBeNull();
    expect(plan!.planId.startsWith('plan-wall.delete-')).toBe(true);
  });

  it('both payload spellings produce BYTE-IDENTICAL plans for one operation', async () => {
    const viaId = await service(freshWorld()).preview({ type: 'wall.delete', payload: { id: 'wall-1' } } as any);
    const viaWallId = await service(freshWorld()).preview({ type: 'wall.delete', payload: { wallId: 'wall-1' } } as any);
    expect(JSON.stringify(viaId)).toBe(JSON.stringify(viaWallId));
    expect(viaId!.planHash).toBe(viaWallId!.planHash);
  });
});

describe('wall.delete — the determined cascade (C70 F-INV-2, C78 §6.4)', () => {
  it('never answers with an EMPTY cascade: the subject is always in topology.removed', async () => {
    const p = (await service(freshWorld()).preview(CMD as any))!;
    expect(p.topology.removed).toContain('wall-1');
    expect(p.topology.added).toEqual([]);
  });

  it('cascades the CHILDREN the commit path reads from childrenIds — into removed AND changed', async () => {
    const p = (await service(freshWorld()).preview(CMD as any))!;
    expect(p.topology.removed).toEqual(['door-1', 'wall-1', 'win-1']);
    expect(p.changed).toContain('door-1');
    expect(p.changed).toContain('win-1');
  });

  it('names the JOINED wall as changed and modified — its mitre re-resolves without this one', async () => {
    const p = (await service(freshWorld()).preview(CMD as any))!;
    expect(p.changed).toContain('wall-2');
    expect(p.topology.modified).toContain('wall-2');
  });

  it('names the BOUNDED room as changed and modified, from the recorded boundedBy edge', async () => {
    const p = (await service(freshWorld()).preview(CMD as any))!;
    expect(p.changed).toContain('room-1');
    expect(p.topology.modified).toContain('room-1');
  });

  it('reports the level sibling the junction index says is NOT joined as CHECKED-and-unaffected', async () => {
    // The positive verdict. DeleteElementCommand snapshots EVERY wall on the level for undo;
    // a planner that transcribed that scope would report wall-3 as affected.
    const p = (await service(freshWorld()).preview(CMD as any))!;
    expect(p.excluded).toContain('wall-3');
    expect(p.changed).not.toContain('wall-3');
  });

  it('reports the room the boundedBy reader positively excludes as CHECKED-and-unaffected', async () => {
    const p = (await service(freshWorld()).preview(CMD as any))!;
    expect(p.excluded).toContain('room-2');
    expect(p.changed).not.toContain('room-2');
  });

  it('DECLARES that the level-wide undo snapshot is not a cascade claim', async () => {
    const p = (await service(freshWorld()).preview(CMD as any))!;
    expect(scopedDetail(p, 'every OTHER wall on level L1')).toContain('NOT a claim that');
  });

  it('offers NO level-sibling verdict at all when the junction index could not answer', async () => {
    // The excluded set must rest on a positive reading, never on the absence of one.
    const p = (await service(freshWorld(), { joinedWalls: joinedWallsRefusing }))!;
    const plan = (await p.preview(CMD as any))!;
    expect(plan.excluded).not.toContain('wall-3');
    expect(scopedDetail(plan, 'every OTHER wall on level')).toBe('');
  });

  it('carries NO metric lines — the contract cannot type a determined absence — and DECLARES that', async () => {
    const p = (await service(freshWorld()).preview(CMD as any))!;
    expect('metrics' in (p as any)).toBe(false);
    const decl = (p as any).undetermined.find((u: any) => u.scope.includes('metric lines'));
    expect(decl?.reason).toBe('AGGREGATE_SCOPE_UNSUPPORTED');
    expect(decl?.detail).toContain('MetricTransition');
  });
});

describe('wall.delete — canExecute is MIRRORED VERBATIM: refuse, do not refit', () => {
  it('an empty id refuses with the handler\'s own sentence and plans NOTHING removed', async () => {
    const p = (await service(freshWorld()).preview({ type: 'wall.delete', payload: { id: '' } } as any))!;
    expect(p.refused.length).toBe(1);
    expect(p.refused[0]!.reason).toContain('cmd.id must be a non-empty string');
    expect(p.topology.removed).toEqual([]);
    expect(p.indirect.kind).toBe('undetermined');
  });

  it('a wall absent from the store refuses with BOTH commit paths\' sentences', async () => {
    const p = (await service(freshWorld()).preview({ type: 'wall.delete', payload: { id: 'wall-ghost' } } as any))!;
    expect(p.refused.length).toBe(1);
    expect(p.refused[0]!.reason).toContain('wall not found: wall-ghost');
    expect(p.refused[0]!.reason).toContain('not found in any store');
    expect(p.refused[0]!.elementId).toBe('wall-ghost');
  });

  it('REFUSE-NOT-REFIT: no fallback scan — a similar wall in the store is not touched', async () => {
    const p = (await service(freshWorld()).preview({ type: 'wall.delete', payload: { id: 'wall-11' } } as any))!;
    expect(p.topology.removed).toEqual([]);
    expect(p.changed).toEqual([]);
    // wall-1 exists and its id is a prefix of the requested one. Nothing may leak in.
    expect(JSON.stringify(p.topology)).not.toContain('wall-1"');
    expect(reasonsOf(p)).toContain('RELATIONSHIP_NOT_READABLE');
  });

  it('the missing wall is UNDETERMINED, never a determined no-op', async () => {
    const p = (await service(freshWorld()).preview({ type: 'wall.delete', payload: { id: 'wall-ghost' } } as any))!;
    const detail = (p.indirect as any).detail as string;
    expect(detail).toContain('SAME empty answer');
    expect((p.indirect as any).reason).toBe('RELATIONSHIP_NOT_READABLE');
  });

  it('does NOT refuse on dependency grounds — a wall with children, joins and rooms still PROCEEDS', async () => {
    // Measured: no commit path declines a wall delete because it hosts openings, is joined,
    // or bounds a room. A planner that invented such a refusal would refuse deletes the
    // product performs every day.
    const p = (await service(freshWorld()).preview(CMD as any))!;
    expect(p.refused).toEqual([]);
    expect(p.topology.removed).toContain('wall-1');
  });
});

describe('wall.delete — the UNDETERMINED paths are typed, never silent (C78 §1.4, §8.1)', () => {
  const worlds: [string, Opts][] = [
    ['fully composed', {}],
    ['no junction reader', { omitJoinedWalls: true }],
    ['junction refuses', { joinedWalls: joinedWallsRefusing }],
    ['no boundedBy reader', { omitBoundingWalls: true }],
    ['no relationship reader', { omitRelationships: true }],
    ['empty relationship index', { relationships: { getRelationships: () => [] } }],
    ['no validator', { omitValidator: true }],
  ];

  it('every reason emitted on every path is a member of the CLOSED 11-member union', async () => {
    for (const [label, opts] of worlds) {
      const p = (await service(freshWorld(), opts).preview(CMD as any))!;
      for (const r of reasonsOf(p)) {
        expect(CLOSED_REASONS, `${label} emitted ${r}`).toContain(r as any);
      }
      expect((p as any).undetermined.length, label).toBeGreaterThan(0);
    }
  });

  it('an ABSENT junction reader is ENGINE_NOT_AVAILABLE — never "it joins nothing"', async () => {
    const p = (await service(freshWorld(), { omitJoinedWalls: true }).preview(CMD as any))!;
    expect(scopedDetail(p, 'junction / mitre')).toContain('not "it joins nothing"');
    expect(p.indirect.kind).toBe('undetermined');
  });

  it('a REFUSING junction reader forwards the probe\'s own detail, never a re-worded one', async () => {
    const p = (await service(freshWorld(), { joinedWalls: joinedWallsRefusing }).preview(CMD as any))!;
    expect(scopedDetail(p, 'junction / mitre')).toContain('no flush has covered its level since load');
  });

  it('an EMPTY-but-OK junction answer is DETERMINED — a positive answer, not a refusal (C71 §4.4)', async () => {
    // The distinction this reader exists for: {ok:true,[]} and {ok:false} must not collapse.
    const p = (await service(freshWorld(), {
      joinedWalls: { getJoinedWalls: (wallId: string) => ({ ok: true, wallId, joinedWallIds: [] }) },
    }).preview(CMD as any))!;
    expect(scopedDetail(p, 'junction / mitre')).toBe('');
    // …and with nothing joined, every other wall on the level is CHECKED-and-unaffected.
    expect(p.excluded).toContain('wall-2');
    expect(p.excluded).toContain('wall-3');
  });

  it('an ABSENT boundedBy reader is NO_DEPENDENCY_INDEX and names why a field scan is refused', async () => {
    const p = (await service(freshWorld(), { omitBoundingWalls: true }).preview(CMD as any))!;
    const d = scopedDetail(p, 'the rooms bounded by wall wall-1');
    expect(d).toContain('not "there are none"');
    expect(d).toContain('boundingWallIds');
    expect(p.excluded).not.toContain('room-2');
  });

  it('a room the boundedBy writer never covered is RELATIONSHIP_NOT_RECORDED, not unaffected', async () => {
    const p = (await service(freshWorld(), {
      boundingWalls: {
        getBoundingWalls: (roomId: string) => ({
          ok: false, roomId, reason: 'room-unknown-to-boundedBy-writer',
          detail: `boundedBy lookup for room ${roomId}: the graph holds no boundedBy edge`,
        }),
      },
    }).preview(CMD as any))!;
    const u = (p as any).undetermined.find((x: any) => x.scope.includes('room-1 is bounded by'));
    expect(u?.reason).toBe('RELATIONSHIP_NOT_RECORDED');
    expect(p.excluded).not.toContain('room-1');
    expect(p.excluded).not.toContain('room-2');
  });

  it('a room marked boundary-undetermined-after-element-delete is STALE_DERIVED_STATE', async () => {
    const p = (await service(freshWorld(), {
      boundingWalls: {
        getBoundingWalls: (roomId: string) => ({
          ok: false, roomId, reason: 'boundary-undetermined-after-element-delete',
          detail: 'a bounding element was DELETED and the boundary has not been re-derived since',
        }),
      },
    }).preview(CMD as any))!;
    const u = (p as any).undetermined.find((x: any) => x.scope.includes('room-1 is bounded by'));
    expect(u?.reason).toBe('STALE_DERIVED_STATE');
    expect(u?.detail).toContain('DELETED');
  });

  it('an affected room\'s GEOMETRY is TOPOLOGY_CHANGE_POSSIBLE — never a predicted polygon', async () => {
    const p = (await service(freshWorld()).preview(CMD as any))!;
    const u = (p as any).undetermined.find((x: any) => x.scope.includes('roomhood of room room-1'));
    expect(u?.reason).toBe('TOPOLOGY_CHANGE_POSSIBLE');
    expect(u?.detail).toContain('predictRoomGeometry');
  });

  it('a THROWING boundedBy reader is declared per room, not swallowed', async () => {
    const p = (await service(freshWorld(), {
      boundingWalls: { getBoundingWalls: () => { throw new Error('graph down'); } },
    }).preview(CMD as any))!;
    expect((p as any).undetermined.filter((u: any) => u.detail.includes('boundedBy reader threw')).length).toBe(2);
  });

  it('an ABSENT relationship reader is NO_DEPENDENCY_INDEX — never "there are none" (§1.4)', async () => {
    const p = (await service(freshWorld(), { omitRelationships: true }).preview(CMD as any))!;
    expect(scopedDetail(p, 'recorded graph relationships')).toContain('not "there are none"');
  });

  it('an EMPTY relationship index is RELATIONSHIP_NOT_RECORDED — an empty index is UNDETERMINED', async () => {
    const p = (await service(freshWorld(), { relationships: { getRelationships: () => [] } }).preview(CMD as any))!;
    const u = (p as any).undetermined.find((x: any) => x.scope.includes('recorded graph relationships'));
    expect(u?.reason).toBe('RELATIONSHIP_NOT_RECORDED');
    expect(u?.detail).toContain('never "unaffected"');
  });

  it('a THROWING relationship reader is declared, not swallowed', async () => {
    const p = (await service(freshWorld(), {
      relationships: { getRelationships: () => { throw new Error('index unavailable'); } },
    }).preview(CMD as any))!;
    expect(scopedDetail(p, 'recorded graph relationships')).toContain('threw');
  });

  it('an ABSENT validator is ENGINE_NOT_AVAILABLE and the validation section stays honestly empty', async () => {
    const p = (await service(freshWorld(), { omitValidator: true }).preview(CMD as any))!;
    expect(scopedDetail(p, 'constraint validation')).toContain('which it CREATES');
    expect(p.validation.violationsCreated).toEqual([]);
    expect(p.validation.violationsResolved).toEqual([]);
  });

  it('DECLARES the two-path cascade divergence rather than predicting which path runs', async () => {
    const p = (await service(freshWorld()).preview(CMD as any))!;
    const d = scopedDetail(p, 'which cascade the dispatched handler');
    expect(d).toContain('does NOT cascade');
    expect(d).toContain('wall-room.ts');
    expect(d).toContain('neither does both');
  });
});

describe('wall.delete — the two host-side child records may DISAGREE (C78 §5.1)', () => {
  /** `openings[]` records win-1 but `childrenIds` does not — so the commit path's cascade
   *  never reaches it and it survives as an orphan row with live graph edges. */
  const divergentWorld = (): World => ({
    walls: [subject({ childrenIds: ['door-1'] }), plainWall('wall-2'), plainWall('wall-3')],
    rooms: [{ id: 'room-1' }, { id: 'room-2' }],
  });

  it('names the orphan by id rather than silently unioning the two records', async () => {
    const p = (await service(divergentWorld()).preview(CMD as any))!;
    const u = (p as any).undetermined.find((x: any) => x.scope.includes('absent from its childrenIds'));
    expect(u?.reason).toBe('RELATIONSHIP_NOT_RECORDED');
    expect(u?.scope).toContain('win-1');
  });

  it('the orphan is reported NEITHER as removed NOR as unaffected — the disagreement IS the answer', async () => {
    const p = (await service(divergentWorld()).preview(CMD as any))!;
    expect(p.topology.removed).not.toContain('win-1');
    expect(p.excluded).not.toContain('win-1');
    // …while the child both records agree on is still determined-removed.
    expect(p.topology.removed).toContain('door-1');
  });

  it('emits NO such declaration when the two records agree', async () => {
    const p = (await service(freshWorld()).preview(CMD as any))!;
    expect(scopedDetail(p, 'absent from its childrenIds')).toBe('');
  });
});

describe('wall.delete — the violation diff reports BOTH halves', () => {
  it('a violation present before and absent after lands in violationsResolved', async () => {
    const p = (await service(freshWorld()).preview(CMD as any))!;
    expect(p.validation.violationsResolved.map((v) => v.ruleId)).toContain('LEVEL_MAX_WALLS');
    expect(p.validation.violationsCreated).toEqual([]);
  });

  it('and a delete that CREATES a violation is reported too — not just the flattering half', async () => {
    const p = (await service(freshWorld(), { validator: underPopulatedValidator }).preview(CMD as any))!;
    expect(p.validation.violationsCreated.map((v) => v.ruleId)).toContain('ROOM_NEEDS_ENCLOSURE');
    expect(p.validation.violationsResolved).toEqual([]);
  });
});

describe('wall.delete — purity and determinism (G-REASON-01, G-REASON-02 · C78 §7.6)', () => {
  it('planning MUTATES NOTHING — the world is byte-identical afterwards', async () => {
    const world = freshWorld();
    const before = JSON.stringify(world);
    await service(world).preview(CMD as any);
    expect(JSON.stringify(world)).toBe(before);
  });

  it('the same command over the same state plans BYTE-IDENTICALLY twice', async () => {
    const svc = service(freshWorld());
    const a = await svc.preview(CMD as any);
    const b = await svc.preview(CMD as any);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a!.planHash).toBe(b!.planHash);
  });

  it('is independent of the wall-store iteration order', async () => {
    const w1 = freshWorld();
    const w2 = freshWorld();
    w2.walls.reverse();
    const a = (await service(w1).preview(CMD as any))!;
    const b = (await service(w2).preview(CMD as any))!;
    expect(JSON.stringify({ c: a.changed, e: a.excluded, t: a.topology, u: (a as any).undetermined }))
      .toBe(JSON.stringify({ c: b.changed, e: b.excluded, t: b.topology, u: (b as any).undetermined }));
  });

  it('is independent of the ROOM-store iteration order (the per-room loop sorts first)', async () => {
    const w1 = freshWorld();
    const w2 = freshWorld();
    w2.rooms.reverse();
    const a = (await service(w1).preview(CMD as any))!;
    const b = (await service(w2).preview(CMD as any))!;
    expect(JSON.stringify((a as any).undetermined)).toBe(JSON.stringify((b as any).undetermined));
  });

  it('a genuinely different state hashes differently — the arms above can SEE a difference', async () => {
    const other = freshWorld();
    other.walls.push(plainWall('wall-4'));
    const a = (await service(freshWorld()).preview(CMD as any))!;
    const b = (await service(other).preview(CMD as any))!;
    expect(a.planHash).not.toBe(b.planHash);
    expect(a.stateHash).not.toBe(b.stateHash);
  });
});
