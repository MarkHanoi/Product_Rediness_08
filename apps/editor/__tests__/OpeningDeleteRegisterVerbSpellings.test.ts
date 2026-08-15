/**
 * OPENING-DELETE REGISTER-VERB SPELLINGS — the hosted-opening DELETE family reaches a
 * composed planner (C78 §1.1 · §5.1 · §19.1 · the bar-3 determination gate).
 *
 * ════ THE FAMILY, AND WHY IT LANDS WHOLE ══════════════════════════════════════════════
 * The C69 register carries TWO consequential `delete`-class verbs for wall-hosted
 * openings — `door.delete` (plugins/door DeleteDoorHandler, payload `{ doorId }`) and
 * `window.delete` (plugins/window DeleteWindowHandler, payload `{ windowId }`).
 * check-relationship-determination counted BOTH as silent-dispatch: no normaliser entry,
 * so every one of their 41 relationship cells yielded C78 §1.1's forbidden fourth answer
 * — no plan, no typed UNDETERMINED, no report.
 *
 * They name ONE atomic semantic operation (remove a hosted opening from whichever wall
 * records it in `openings[]`), differing only in which standalone store C15 §8.1's
 * dual-write also touches. C78 §19.1: the family is both verbs or neither, and this file
 * asserts both, plus the semantic `opening.delete` spelling the AI/parity surfaces use.
 *
 * ════ WHAT IS REAL AND WHAT IS A DOUBLE (C72 §3.4) ════════════════════════════════════
 * REAL — the normaliser registry, the `OpeningDeleteConsequencePlanner`, and the plan it
 * computes. DOUBLE — the store views (input side) and the two INJECTED seams the planner
 * declares (`relationships`, `validator`), which exist precisely so the production
 * singletons stay out of a node-env suite. Nothing supplies the answer under test; every
 * assertion below is over a value the planner derived.
 *
 * ════ THE SEAM RULE, STATED FOR THE ONE PLACE IT BITES HERE ═══════════════════════════
 * The `relationships` double returns RECORDED EDGES, not a conclusion. The planner
 * decides what an edge set MEANS (counterparts are affected; an EMPTY set is
 * RELATIONSHIP_NOT_RECORDED, not "unaffected"; an ABSENT reader is NO_DEPENDENCY_INDEX).
 * A double that returned "these elements are affected" would be handing the planner its
 * own verdict — the defect C72 §3.4 forbids by name.
 */

import { describe, expect, it } from 'vitest';
import type { ConsequencePlanner, PlanningContext } from '@pryzm/command-bus';
import { OpeningDeleteConsequencePlanner } from '../src/engine/consequence/OpeningDeleteConsequencePlanner';
import {
  ConsequencePreviewService,
  normalizeConsequenceCommand,
  CONSEQUENCE_NORMALIZERS,
} from '../src/engine/consequence/ConsequencePreviewService';

// ─── The world ────────────────────────────────────────────────────────────────────────

interface Opening {
  id: string;
  elementId: string;
  type: 'door' | 'window';
  offset: number;
  width: number;
  height: number;
  sillHeight: number;
}

interface Wall {
  id: string;
  type: 'wall';
  levelId: string;
  baseLine: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
  height: number;
  thickness: number;
  openings: Opening[];
}

/** 6 m wall hosting door-1 at [0.500, 1.400] and win-1 at [3.000, 4.200]. Two openings so
 *  that deleting either leaves a SIBLING to be reported as considered-and-unaffected —
 *  the positive verdict this family exists to make explicit. */
function hostWall(id = 'wall-1'): Wall {
  return {
    id,
    type: 'wall',
    levelId: 'L1',
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
    height: 2.7,
    thickness: 0.2,
    openings: [
      { id: 'op-d1', elementId: 'door-1', type: 'door', offset: 0.5, width: 0.9, height: 2.1, sillHeight: 0 },
      { id: 'op-w1', elementId: 'win-1', type: 'window', offset: 3.0, width: 1.2, height: 1.2, sillHeight: 0.9 },
    ],
  };
}

interface World {
  walls: Wall[];
  rooms: Record<string, unknown>[];
}

const freshWorld = (): World => ({ walls: [hostWall()], rooms: [] });

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

/** Recorded edges as the semantic graph holds them — the shape
 *  `semanticGraphManager.getRelationships` returns. */
const EDGES = [
  { id: 'e1', type: 'hostedBy', sourceId: 'door-1', targetId: 'wall-1' },
  { id: 'e2', type: 'hosts', sourceId: 'wall-1', targetId: 'door-1' },
];

/** Fires on any wall carrying MORE than one opening. Present BEFORE the delete (two
 *  openings) and absent AFTER (one), so `violationsResolved` carries bytes — the delete
 *  row's mirror of the create row's `violationsCreated`. */
const twoOpeningsValidator = {
  validateAll: (ctx: { wallStore: { getAll: () => unknown[] } }) =>
    (ctx.wallStore.getAll() as { id: string; openings?: unknown[] }[])
      .filter((w) => (w.openings?.length ?? 0) > 1)
      .map((w) => ({
        ruleId: 'WALL_MAX_OPENINGS',
        elementId: w.id,
        message: `wall ${w.id} carries ${w.openings?.length ?? 0} openings, above the 1 permitted`,
      })),
};

function buildService(
  world: World,
  opts?: {
    relationships?: { getRelationships: (id: string) => readonly { type?: string; sourceId?: string; targetId?: string }[] };
    omitRelationships?: boolean;
    validator?: { validateAll: (c: never) => { ruleId: string; elementId: string; message: string }[] };
    omitValidator?: boolean;
    normalizers?: typeof CONSEQUENCE_NORMALIZERS;
  },
): ConsequencePreviewService {
  const planner = new OpeningDeleteConsequencePlanner({
    ...(opts?.omitRelationships
      ? {}
      : { relationships: opts?.relationships ?? { getRelationships: () => EDGES } }),
    ...(opts?.omitValidator
      ? {}
      : { validator: (opts?.validator ?? twoOpeningsValidator) as never }),
  });
  const planners = new Map<string, ConsequencePlanner<never>>();
  planners.set('opening.delete', planner as unknown as ConsequencePlanner<never>);
  return new ConsequencePreviewService(planners, contextFor(world), opts?.normalizers);
}

// ══════════════════════════════════════════════════════════════════════════════════════
describe('opening.delete — the normaliser registry (C78 §5, U-INV-5)', () => {
  it('maps door.delete onto the semantic opening.delete, renaming the key and nothing else', () => {
    const s = normalizeConsequenceCommand({ type: 'door.delete', payload: { doorId: 'door-1' } });
    expect(s).toEqual({ type: 'opening.delete', payload: { id: 'door-1', openingType: 'door' } });
  });

  it('maps window.delete onto the same semantic verb, with the kind taken from the VERB', () => {
    const s = normalizeConsequenceCommand({ type: 'window.delete', payload: { windowId: 'win-1' } });
    expect(s).toEqual({ type: 'opening.delete', payload: { id: 'win-1', openingType: 'window' } });
  });

  it('accepts the SEMANTIC spelling directly, so the AI/parity surfaces can address the family', () => {
    const s = normalizeConsequenceCommand({ type: 'opening.delete', payload: { id: 'door-1', openingType: 'door' } });
    expect(s).toEqual({ type: 'opening.delete', payload: { id: 'door-1', openingType: 'door' } });
  });

  it('forwards a host only when the payload actually carries one — it is never invented', () => {
    expect(normalizeConsequenceCommand({ type: 'door.delete', payload: { doorId: 'door-1' } }))
      .toEqual({ type: 'opening.delete', payload: { id: 'door-1', openingType: 'door' } });
    expect(normalizeConsequenceCommand({ type: 'door.delete', payload: { doorId: 'door-1', wallId: 'wall-1' } }))
      .toEqual({ type: 'opening.delete', payload: { id: 'door-1', wallId: 'wall-1', openingType: 'door' } });
  });

  it('answers null — a capability gap, not a plan about an invented element — when no id is carried', () => {
    expect(normalizeConsequenceCommand({ type: 'door.delete', payload: {} })).toBeNull();
    expect(normalizeConsequenceCommand({ type: 'window.delete', payload: { windowId: '' } })).toBeNull();
    expect(normalizeConsequenceCommand({ type: 'door.delete', payload: undefined })).toBeNull();
  });

  it('registers BOTH register verbs plus the semantic spelling — C78 §19.1, no partial family', () => {
    expect(CONSEQUENCE_NORMALIZERS.has('door.delete')).toBe(true);
    expect(CONSEQUENCE_NORMALIZERS.has('window.delete')).toBe(true);
    expect(CONSEQUENCE_NORMALIZERS.has('opening.delete')).toBe(true);
  });

  it('does NOT claim wall.delete or element.delete — those are different families, not this one', () => {
    expect(normalizeConsequenceCommand({ type: 'wall.delete', payload: { id: 'wall-1' } })).toBeNull();
    expect(normalizeConsequenceCommand({ type: 'element.delete', payload: { id: 'door-1' } })).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════
describe('opening.delete — every spelling reaches ONE composed planner', () => {
  it('door.delete and the semantic spelling produce BYTE-IDENTICAL plans for one operation', async () => {
    const viaDoor = await buildService(freshWorld()).preview({ type: 'door.delete', payload: { doorId: 'door-1' } });
    const viaSemantic = await buildService(freshWorld()).preview({
      type: 'opening.delete',
      payload: { id: 'door-1', openingType: 'door' },
    });
    expect(viaDoor).not.toBeNull();
    expect(JSON.stringify(viaDoor)).toBe(JSON.stringify(viaSemantic));
  });

  it('window.delete plans the sibling window through the same planner', async () => {
    const plan = await buildService(freshWorld()).preview({ type: 'window.delete', payload: { windowId: 'win-1' } });
    expect(plan).not.toBeNull();
    expect(plan!.topology.removed).toEqual(['win-1']);
    expect(plan!.planId.startsWith('plan-opening.delete-')).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════
describe('opening.delete — the determined cascade (C70 F-INV-2, C78 §6.4)', () => {
  it('never answers with an EMPTY cascade: the subject is always in topology.removed', async () => {
    const plan = await buildService(freshWorld()).preview({ type: 'door.delete', payload: { doorId: 'door-1' } });
    expect(plan!.topology.removed).toEqual(['door-1']);
    expect(plan!.topology.added).toEqual([]);
  });

  it('names the HOST as changed and modified — the opening record LIVES on the wall (C15 §1)', async () => {
    const plan = await buildService(freshWorld()).preview({ type: 'door.delete', payload: { doorId: 'door-1' } });
    expect(plan!.changed).toContain('wall-1');
    expect(plan!.topology.modified).toEqual(['wall-1']);
    expect(plan!.indirect).toEqual({ kind: 'determined', elements: ['wall-1'] });
  });

  it('reports the SIBLING as CHECKED-and-unaffected (excluded), never as an omission', async () => {
    const plan = await buildService(freshWorld()).preview({ type: 'door.delete', payload: { doorId: 'door-1' } });
    expect(plan!.excluded).toEqual(['win-1']);
  });

  it('carries NO metric lines — the contract cannot type a determined absence — and DECLARES that, never fabricating an after:0', async () => {
    // MetricTransition.after is a NON-optional number (packages/command-bus consequence.ts):
    // it can say "no prior value" (the create row's before: undefined) but not "ceases to
    // exist". The delete row therefore emits NO metric key at all — a fabricated after: 0
    // would print as a measured claim that the offset becomes zero — and declares the gap
    // as a typed entry naming the contract seam that would have to widen.
    const plan = await buildService(freshWorld()).preview({ type: 'door.delete', payload: { doorId: 'door-1' } });
    expect('metrics' in (plan as unknown as Record<string, unknown>)).toBe(false);
    const u = plan!.undetermined.find((x) => x.scope.includes('metric lines'));
    expect(u).toBeDefined();
    expect(u!.reason).toBe('AGGREGATE_SCOPE_UNSUPPORTED');
    expect(u!.detail).toContain('MetricTransition');
    expect(u!.detail).toContain('topology.removed');
  });

  it('REFUSES nothing — the array is structurally empty, because no commit path declines a hosted-opening delete', async () => {
    const plan = await buildService(freshWorld()).preview({ type: 'door.delete', payload: { doorId: 'door-1' } });
    expect(plan!.refused).toEqual([]);
  });

  it('resolves the host by REVERSE SCAN of the C15 §1 record, independent of wall-store order', async () => {
    const a: World = { walls: [hostWall('wall-1'), { ...hostWall('wall-2'), openings: [] }], rooms: [] };
    const b: World = { walls: [{ ...hostWall('wall-2'), openings: [] }, hostWall('wall-1')], rooms: [] };
    const p1 = await buildService(a).preview({ type: 'door.delete', payload: { doorId: 'door-1' } });
    const p2 = await buildService(b).preview({ type: 'door.delete', payload: { doorId: 'door-1' } });
    expect(p1!.changed).toEqual(p2!.changed);
    expect(p1!.topology).toEqual(p2!.topology);
    expect(p1!.excluded).toEqual(p2!.excluded);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════
describe('opening.delete — the UNDETERMINED paths are typed, never silent (C78 §1.4, §8.1)', () => {
  const CLOSED_UNION = [
    'NO_DEPENDENCY_INDEX', 'ENGINE_NOT_AVAILABLE', 'UNSUPPORTED_ELEMENT_TYPE', 'STALE_DERIVED_STATE',
    'INVALID_REQUEST', 'GEOMETRY_UNPREDICTABLE', 'TOPOLOGY_CHANGE_POSSIBLE', 'RELATIONSHIP_NOT_RECORDED',
    'RELATIONSHIP_NOT_READABLE', 'AGGREGATE_SCOPE_UNSUPPORTED', 'PLANNER_THREW',
  ];

  it('every reason emitted on every path is a member of the CLOSED 11-member union', async () => {
    const worlds: [string, World][] = [
      ['found', freshWorld()],
      ['absent', { walls: [{ ...hostWall(), openings: [] }], rooms: [] }],
    ];
    for (const [, w] of worlds) {
      const plan = await buildService(w).preview({ type: 'door.delete', payload: { doorId: 'door-1' } });
      for (const u of plan!.undetermined) expect(CLOSED_UNION).toContain(u.reason);
    }
  });

  it('an element no wall records is RELATIONSHIP_NOT_READABLE — never a determined no-op', async () => {
    const world: World = { walls: [{ ...hostWall(), openings: [] }], rooms: [] };
    const plan = await buildService(world).preview({ type: 'door.delete', payload: { doorId: 'door-1' } });
    expect(plan!.topology.removed).toEqual([]);
    expect(plan!.indirect.kind).toBe('undetermined');
    expect(plan!.undetermined.some((u) => u.reason === 'RELATIONSHIP_NOT_READABLE')).toBe(true);
  });

  it('a named-but-wrong host is RELATIONSHIP_NOT_RECORDED and does NOT fall back to a scan', async () => {
    const world: World = { walls: [hostWall('wall-1'), { ...hostWall('wall-2'), openings: [] }], rooms: [] };
    const plan = await buildService(world).preview({
      type: 'opening.delete',
      payload: { id: 'door-1', wallId: 'wall-2' },
    });
    expect(plan!.undetermined.some((u) => u.reason === 'RELATIONSHIP_NOT_RECORDED')).toBe(true);
    expect(plan!.changed).toEqual([]);
  });

  it('two walls claiming one opening is declared, not resolved by taking the first hit', async () => {
    const world: World = { walls: [hostWall('wall-1'), hostWall('wall-2')], rooms: [] };
    const plan = await buildService(world).preview({ type: 'door.delete', payload: { doorId: 'door-1' } });
    const u = plan!.undetermined.find((x) => x.reason === 'RELATIONSHIP_NOT_READABLE');
    expect(u).toBeDefined();
    expect(u!.detail).toContain('wall-1, wall-2');
    expect(plan!.topology.removed).toEqual([]);
  });

  it('an ABSENT relationship reader is NO_DEPENDENCY_INDEX — never "there are none" (§1.4)', async () => {
    const plan = await buildService(freshWorld(), { omitRelationships: true })
      .preview({ type: 'door.delete', payload: { doorId: 'door-1' } });
    const u = plan!.undetermined.find((x) => x.scope.includes('recorded graph relationships'));
    expect(u!.reason).toBe('NO_DEPENDENCY_INDEX');
  });

  it('an EMPTY relationship index is RELATIONSHIP_NOT_RECORDED — an empty index is UNDETERMINED, never unaffected', async () => {
    const plan = await buildService(freshWorld(), { relationships: { getRelationships: () => [] } })
      .preview({ type: 'door.delete', payload: { doorId: 'door-1' } });
    const u = plan!.undetermined.find((x) => x.scope.includes('recorded graph relationships'));
    expect(u!.reason).toBe('RELATIONSHIP_NOT_RECORDED');
  });

  it('a THROWING relationship reader is declared, not swallowed', async () => {
    const plan = await buildService(freshWorld(), {
      relationships: { getRelationships: () => { throw new Error('index unavailable'); } },
    }).preview({ type: 'door.delete', payload: { doorId: 'door-1' } });
    const u = plan!.undetermined.find((x) => x.scope.includes('recorded graph relationships'));
    expect(u!.reason).toBe('NO_DEPENDENCY_INDEX');
    expect(u!.detail).toContain('threw');
  });

  it('an ABSENT validator is ENGINE_NOT_AVAILABLE, and the validation section stays honestly empty', async () => {
    const plan = await buildService(freshWorld(), { omitValidator: true })
      .preview({ type: 'door.delete', payload: { doorId: 'door-1' } });
    expect(plan!.validation).toEqual({ violationsCreated: [], violationsResolved: [] });
    expect(plan!.undetermined.some((u) => u.reason === 'ENGINE_NOT_AVAILABLE')).toBe(true);
  });

  it('declares the DUAL-STORE handler divergence rather than predicting which path runs', async () => {
    const plan = await buildService(freshWorld()).preview({ type: 'door.delete', payload: { doorId: 'door-1' } });
    const u = plan!.undetermined.find((x) => x.scope.includes('dual-write'));
    expect(u).toBeDefined();
    expect(u!.reason).toBe('RELATIONSHIP_NOT_READABLE');
    expect(u!.detail).toContain('DeleteDoorHandler');
    expect(u!.detail).toContain('DeleteElementCommand');
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════
describe('opening.delete — recorded relationships drive discovery (C78 §5.1)', () => {
  it('counterparts of RECORDED edges land in changed, deduped against the host', async () => {
    const plan = await buildService(freshWorld(), {
      relationships: {
        getRelationships: () => [
          { id: 'e1', type: 'hostedBy', sourceId: 'door-1', targetId: 'wall-1' },
          { id: 'e3', type: 'connectedBy', sourceId: 'room-7', targetId: 'door-1' },
        ],
      },
    }).preview({ type: 'door.delete', payload: { doorId: 'door-1' } });
    expect(plan!.changed).toEqual(['door-1', 'room-7', 'wall-1']);
  });

  it('the subject itself is never double-counted as its own counterpart', async () => {
    const plan = await buildService(freshWorld(), {
      relationships: { getRelationships: () => [{ id: 'e', type: 'hostedBy', sourceId: 'door-1', targetId: 'door-1' }] },
    }).preview({ type: 'door.delete', payload: { doorId: 'door-1' } });
    expect(plan!.changed).toEqual(['door-1', 'wall-1']);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════
describe('opening.delete — the violation diff reports what the removal RESOLVES', () => {
  it('a violation present before and absent after lands in violationsResolved', async () => {
    const plan = await buildService(freshWorld()).preview({ type: 'door.delete', payload: { doorId: 'door-1' } });
    expect(plan!.validation.violationsResolved.map((v) => v.ruleId)).toEqual(['WALL_MAX_OPENINGS']);
    expect(plan!.validation.violationsCreated).toEqual([]);
  });

  it('and a delete that CREATES a violation is reported too — both halves, not just the flattering one', async () => {
    const egressValidator = {
      validateAll: (ctx: { wallStore: { getAll: () => unknown[] } }) =>
        (ctx.wallStore.getAll() as { id: string; openings?: { type?: string }[] }[])
          .filter((w) => !(w.openings ?? []).some((o) => o.type === 'door'))
          .map((w) => ({ ruleId: 'WALL_NEEDS_EGRESS', elementId: w.id, message: `wall ${w.id} has no door` })),
    };
    const plan = await buildService(freshWorld(), { validator: egressValidator as never })
      .preview({ type: 'door.delete', payload: { doorId: 'door-1' } });
    expect(plan!.validation.violationsCreated.map((v) => v.ruleId)).toEqual(['WALL_NEEDS_EGRESS']);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════
describe('opening.delete — purity and determinism (G-REASON-01, G-REASON-02 · C78 §7.6)', () => {
  it('planning MUTATES NOTHING — the world is byte-identical afterwards', async () => {
    const world = freshWorld();
    const before = JSON.stringify(world);
    await buildService(world).preview({ type: 'door.delete', payload: { doorId: 'door-1' } });
    expect(JSON.stringify(world)).toBe(before);
  });

  it('the same command over the same state plans BYTE-IDENTICALLY twice', async () => {
    const svc = buildService(freshWorld());
    const a = await svc.preview({ type: 'door.delete', payload: { doorId: 'door-1' } });
    const b = await svc.preview({ type: 'door.delete', payload: { doorId: 'door-1' } });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a!.planHash).toBe(b!.planHash);
  });

  it('a genuinely different state hashes differently — the arms above can SEE a difference', async () => {
    const moved = freshWorld();
    moved.walls[0]!.openings[0]!.offset = 2.5;
    const a = await buildService(freshWorld()).preview({ type: 'door.delete', payload: { doorId: 'door-1' } });
    const b = await buildService(moved).preview({ type: 'door.delete', payload: { doorId: 'door-1' } });
    expect(a!.planHash).not.toBe(b!.planHash);
    expect(a!.stateHash).not.toBe(b!.stateHash);
  });
});
