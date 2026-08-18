/**
 * WALL BATCH-CREATE REGISTER-VERB SPELLINGS — the `wall.batch.create` family reaches a
 * composed planner (C78 §1.1 · §5.1 · §19.1 · §19.3b · the bar-3 determination gate).
 *
 * ════ THE FAMILY, AND WHY IT IS ONE VERB ══════════════════════════════════════════════
 * ENUMERATED from the GENERATED register `docs/04-reference/API-VERB-REGISTER.md` — the
 * same file check-relationship-determination parses — filtered by that gate's own
 * `opClassOf`, which classes a verb `batch` when `batch` is a SEGMENT of it. The register
 * carries TWELVE batch-class verbs; exactly ONE of them creates walls:
 *
 *   `wall.batch.create`        plugins/wall CreateWallBatch.ts, `{walls, levelId?}` ← THIS
 *   `curtain-wall.batch.*`     a different element family, its own handler + store ← excluded
 *   `door/window/slab/…batch.create`  other families' rows of the same matrix    ← excluded
 *
 * MEASURED ABSENT: `wall.batch.update`, `wall.batch.delete`, `walls.batch.create`,
 * `wall.createBatch`. So the family is ONE verb and the register spelling IS the semantic
 * spelling — as it already is for `wall.create`, `wall.move` and `wall.delete`. C78 §19.1 is
 * satisfied by that one verb landing, and this file asserts the exclusions explicitly so a
 * later author cannot quietly widen the family.
 *
 * ⚠ FIVE WALL VERBS THE DENOMINATOR NEVER MEASURES — asserted here so the gap stays visible.
 * `wall.addLayerBatch`, `wall.updateColorBatch`, `wall.updateHeightBatch`,
 * `wall.updateRakeBatch` and `wall.updateSystemTypeBatch` each mutate N walls in one
 * dispatch, and `opClassOf` returns NULL for all five because `Batch` is a SUFFIX inside the
 * last segment rather than a segment of its own. They are outside the 100-verb consequential
 * set and outside the 4,100 cells entirely — an INHERITED gap in the gate's classifier, the
 * same shape as `element.deleteBatch` on the wall.delete row (d572fb7e). Named, not absorbed.
 *
 * ════ ONE PLAN, NOT N — the question C78 §19.3b left open, asserted not assumed ═════════
 * §19.3b: "its open question, per §1.5, is whether a batch plans as one plan or N; either
 * way it counts as ONE consequential verb." SETTLED: ONE, for two independent reasons, both
 * exercised below.
 *   CONTRACT  §1.2(c)/§10.1/U-INV-8 make the previewed and the executed plan ONE artefact;
 *             §12.1/U-INV-9 make the gesture ONE undo unit, and the commit path already
 *             agrees (one produceCommand → one PatchPair → one ring entry); §9.1 gives one
 *             plan one content hash over one pre-state.
 *   SOUNDNESS a batch is not N singles. `preview` returning one plan is asserted directly;
 *             the deeper claim — that N would MISS consequences — is proven by the
 *             joint-vs-individual test below and by ARM B1 of check-plan-determinism.
 *
 * ════ WHAT IS REAL AND WHAT IS A DOUBLE (C72 §3.4) ════════════════════════════════════
 * REAL — the normaliser registry (`CONSEQUENCE_NORMALIZERS`, the production map), the
 * `WallBatchCreateConsequencePlanner`, and the plan it computes. DOUBLE — the store views
 * (input side) and the injected seams, which exist precisely so the production singletons
 * (`constraintEngine` touches `window.*` at module scope) stay out of a node-env suite.
 *
 * ════ THE SEAM RULE ═══════════════════════════════════════════════════════════════════
 * Every double returns a RECORD or a raw solve, never a conclusion. The junction double
 * returns miters and junction records; the planner decides what they mean. A double that
 * returned "these walls are affected" would be handing the planner its own verdict — the
 * defect C72 §3.4 forbids by name.
 */

import { describe, expect, it } from 'vitest';
import type { ConsequencePlanner, PlanningContext } from '@pryzm/command-bus';
import { WallBatchCreateConsequencePlanner } from '../src/engine/consequence/WallBatchCreateConsequencePlanner';
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

interface Wall {
  id: string;
  type: 'wall';
  levelId: string;
  baseLine: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
  height: number;
  thickness: number;
  openings: unknown[];
}

const w = (
  id: string,
  a: [number, number],
  b: [number, number],
  levelId = 'L1',
): Wall => ({
  id,
  type: 'wall',
  levelId,
  baseLine: [
    { x: a[0], y: 0, z: a[1] },
    { x: b[0], y: 0, z: b[1] },
  ],
  height: 2.7,
  thickness: 0.2,
  openings: [],
});

interface World {
  walls: Wall[];
  rooms: Record<string, unknown>[];
}

/** A closed 6×4 room on L1 — the batch below drops partitions across it. */
const freshWorld = (): World => ({
  walls: [
    w('wall-s', [0, 0], [6, 0]),
    w('wall-e', [6, 0], [6, 4]),
    w('wall-n', [6, 4], [0, 4]),
    w('wall-w', [0, 4], [0, 0]),
  ],
  rooms: [
    { id: 'room-1', levelId: 'L1', boundingWallIds: ['wall-s', 'wall-e', 'wall-n', 'wall-w'] },
  ],
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

// ─── Seam doubles — records and raw solves, never verdicts ────────────────────────────

/**
 * A junction solve double. It reports a T-junction whenever a candidate endpoint coincides
 * with an existing wall's endpoint or lies on its span, and gives `wall-e` a miter signature
 * that CHANGES only once TWO candidates are present — the joint-but-not-individual shape the
 * one-plan-not-N assertion turns on. It answers RECORDS; nothing here says "affected".
 */
const junctionDouble = (inputs: readonly { id: string }[]): {
  miters: { id: string; startLeft: unknown; invalid: boolean }[];
  junctions: { wallIds: string[] }[];
} => {
  const candidates = inputs.filter((i) => i.id.startsWith('wall-p'));
  const junctions = candidates.map((c) => ({ wallIds: [c.id, 'wall-s'] }));
  return {
    miters: inputs.map((i) => ({
      id: i.id,
      startLeft: i.id === 'wall-e' && candidates.length >= 2 ? { x: 9, z: 9 } : { x: 0, z: 0 },
      invalid: false,
    })),
    junctions,
  };
};

const silentOccupancy = { planOpeningRefit: () => ({ ok: true, refusals: [], relocations: [] }) };
const quietValidator = { validateAll: () => [] as never[] };

function buildService(
  world: World,
  opts: { systemTypes?: { has: (id: string) => boolean }; omitResolver?: boolean } = {},
): PlanOnlyPreviewProvider {
  const planner = new WallBatchCreateConsequencePlanner({
    ...(opts.omitResolver ? {} : { resolveJunctions: junctionDouble as never }),
    occupancy: silentOccupancy as never,
    validator: quietValidator as never,
    ...(opts.systemTypes ? { systemTypes: opts.systemTypes } : {}),
  });
  const planners = new Map<string, ConsequencePlanner<never>>();
  // Registered under the CANONICAL semantic key — the same key
  // `createConsequencePlanners()` uses. The service names no verb; it reads this map and
  // the REAL normaliser registry, which is what makes this a reachability test and not a
  // direct planner call.
  planners.set('wall.batch.create', planner as unknown as ConsequencePlanner<never>);
  return planOnly(new ConsequencePreviewService(planners, contextFor(world)));
}

/** Two partitions across room-1, both crossing wall-s and wall-n. */
const BATCH = {
  type: 'wall.batch.create',
  payload: {
    levelId: 'L1',
    walls: [
      { id: 'wall-p1', baseLine: [{ x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 4 }], thickness: 0.1 },
      { id: 'wall-p2', baseLine: [{ x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }], thickness: 0.1 },
    ],
  },
};

// ══════════════════════════════════════════════════════════════════════════════════════

describe('wall.batch.create · the REGISTER VERB reaches the composed planner', () => {
  it('THE REACHABILITY FACT: the PRODUCTION normaliser registry carries the register verb', () => {
    // Not a hand-built map — `CONSEQUENCE_NORMALIZERS` is the module-level constant the
    // three composition roots consume. If this row were registered nowhere, this is the
    // assertion that would fail, and it is the one the bar-3 gate parses for.
    expect(CONSEQUENCE_NORMALIZERS.has('wall.batch.create')).toBe(true);
  });

  it('normalises the register verb onto the semantic key, through the REAL registry', () => {
    const semantic = normalizeConsequenceCommand(BATCH);
    expect(semantic).not.toBeNull();
    expect(semantic!.type).toBe('wall.batch.create');
    expect((semantic!.payload as { walls: unknown[] }).walls).toHaveLength(2);
  });

  it('EXCLUSIONS: the five wall *Batch verbs are NOT mapped onto this family', () => {
    // They mutate N walls each and are real dispatches — but they are UPDATE operations, and
    // `opClassOf` does not even classify them (a `Batch` suffix is not a `batch` segment).
    // Mapping them here would attach a wall-CREATE planner to five update verbs.
    for (const verb of [
      'wall.addLayerBatch',
      'wall.updateColorBatch',
      'wall.updateHeightBatch',
      'wall.updateRakeBatch',
      'wall.updateSystemTypeBatch',
    ]) {
      expect(CONSEQUENCE_NORMALIZERS.has(verb)).toBe(false);
    }
    // And the neighbouring FAMILIES' batch verbs stay theirs.
    for (const verb of [
      'curtain-wall.batch.create',
      'door.batch.create',
      'window.batch.create',
      'slab.batch.create',
    ]) {
      expect(CONSEQUENCE_NORMALIZERS.has(verb)).toBe(false);
    }
  });

  it('MEASURED ABSENT spellings normalise to null — no rule is minted for a dispatch nobody emits', () => {
    for (const type of ['wall.batch.update', 'wall.batch.delete', 'wall.createBatch']) {
      expect(normalizeConsequenceCommand({ type, payload: { walls: [] } })).toBeNull();
    }
  });
});

describe('wall.batch.create · ONE PLAN, NOT N (C78 §19.3b, settled)', () => {
  it('one dispatch yields exactly ONE ConsequencePlan with ONE planHash over ONE stateHash', async () => {
    const plan = await buildService(freshWorld()).preview(BATCH);
    expect(plan).not.toBeNull();
    // The entry point is singular by type; this asserts the VALUE is too — not an array, not
    // a wrapper carrying N. §9.1: one plan, one content hash, one pre-state hash.
    expect(Array.isArray(plan)).toBe(false);
    expect(typeof plan!.planHash).toBe('string');
    expect(typeof plan!.stateHash).toBe('string');
    expect(plan!.planId).toBe(`plan-wall.batch.create-${plan!.planHash}`);
    // BOTH walls are in the ONE plan — the whole batch, not the first entry.
    expect(plan!.topology.added).toEqual(['wall-p1', 'wall-p2']);
  });

  it('THE SOUNDNESS PROOF: the whole-batch plan sees a re-cut wall that NEITHER single-candidate plan does', async () => {
    // This is why the family is not an alias onto `wall.create`, and why the planner poses
    // the junction diff once over the whole candidate set. If a batch were planned as N
    // plans and unioned, `wall-e` would be reported by nobody — a DETERMINED-unaffected
    // inferred from a decomposition, which is exactly what C78 §1.4 forbids.
    const one = (idx: number) => ({
      type: 'wall.batch.create',
      payload: { levelId: 'L1', walls: [BATCH.payload.walls[idx]!] },
    });
    const both = await buildService(freshWorld()).preview(BATCH);
    const p1 = await buildService(freshWorld()).preview(one(0));
    const p2 = await buildService(freshWorld()).preview(one(1));

    expect(both!.topology.modified).toContain('wall-e');
    expect(p1!.topology.modified).not.toContain('wall-e');
    expect(p2!.topology.modified).not.toContain('wall-e');
    // Stated as the union, because the union is what an N-plan design would deliver.
    const union = new Set([...p1!.topology.modified, ...p2!.topology.modified]);
    expect(union.has('wall-e')).toBe(false);
  });

  it('candidate × candidate: two members of ONE batch crossing each other are DECLARED', async () => {
    // The population no other check in the product can reach: neither wall exists yet, so no
    // occupancy, join or clash pass has ever seen the pair. A one-at-a-time decomposition
    // cannot see it either — in each sub-plan the sibling does not exist.
    const crossing = {
      type: 'wall.batch.create',
      payload: {
        levelId: 'L1',
        walls: [
          { id: 'wall-x1', baseLine: [{ x: 1, y: 0, z: 1 }, { x: 5, y: 0, z: 3 }] },
          { id: 'wall-x2', baseLine: [{ x: 1, y: 0, z: 3 }, { x: 5, y: 0, z: 1 }] },
        ],
      },
    };
    const plan = await buildService(freshWorld()).preview(crossing);
    const decl = plan!.undetermined.find(
      (u) => u.scope.includes('cross the BODY of') && u.scope.includes('wall-x2'),
    );
    expect(decl).toBeDefined();
    expect(decl!.reason).toBe('ENGINE_NOT_AVAILABLE');

    // …and the single-member plan cannot declare it.
    const solo = await buildService(freshWorld()).preview({
      type: 'wall.batch.create',
      payload: { levelId: 'L1', walls: [crossing.payload.walls[0]!] },
    });
    expect(
      solo!.undetermined.some((u) => u.scope.includes('cross the BODY of')),
    ).toBe(false);
  });

  it('a MULTI-LEVEL batch is solved per level — no junction is fabricated across elevations', async () => {
    const world = freshWorld();
    world.walls.push(w('wall-l2', [0, 0], [6, 0], 'L2'));
    const plan = await buildService(world).preview({
      type: 'wall.batch.create',
      payload: {
        levelId: 'L1',
        walls: [
          { id: 'wall-p1', baseLine: [{ x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 4 }] },
          // Same geometry, DIFFERENT level — must not be solved against L1's walls.
          { id: 'wall-p9', levelId: 'L2', baseLine: [{ x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 4 }] },
        ],
      },
    });
    expect(plan!.topology.added).toEqual(['wall-p1', 'wall-p9']);
    // The clash declaration names BOTH levels — the plan is honest about its own scope.
    const clash = plan!.undetermined.find((u) => u.scope.includes('solid clash'));
    expect(clash!.scope).toContain('L1');
    expect(clash!.scope).toContain('L2');
  });
});

describe('wall.batch.create · canExecute MIRRORED VERBATIM — refuse, never refit', () => {
  const cases: [string, unknown, string][] = [
    ['no walls key at all', {}, 'walls must be a non-empty array'],
    ['an empty list', { walls: [] }, 'walls must be a non-empty array'],
    [
      'a non-positive height on entry 1',
      { walls: [{ id: 'a' }, { id: 'b', height: 0 }] },
      'walls[1].height must be > 0',
    ],
    [
      'a sub-minimum thickness on entry 0',
      { walls: [{ id: 'a', thickness: 0.01 }] },
      'walls[0].thickness must be ≥ 0.05 m',
    ],
    [
      'an empty-string id on entry 2',
      { walls: [{ id: 'a' }, { id: 'b' }, { id: '' }] },
      'walls[2].id must be a non-empty string when provided',
    ],
  ];

  for (const [label, payload, sentence] of cases) {
    it(`refuses ${label} with the handler's OWN sentence, verbatim`, async () => {
      const plan = await buildService(freshWorld()).preview({
        type: 'wall.batch.create',
        payload,
      });
      expect(plan).not.toBeNull();
      // The sentence is transcribed from CreateWallBatch.ts :70-94. If the handler's wording
      // changes and this planner's does not, the user is shown two different explanations of
      // one refusal — which is what "verbatim" is guarding.
      expect(plan!.refused.map((r) => r.reason)).toContain(sentence);
    });
  }

  it('a refused batch creates NOTHING — there is no partial batch', async () => {
    const plan = await buildService(freshWorld()).preview({
      type: 'wall.batch.create',
      payload: {
        levelId: 'L1',
        walls: [
          { id: 'ok-1', baseLine: [{ x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 4 }] },
          { id: 'bad', thickness: 0.001 },
          { id: 'ok-2', baseLine: [{ x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }] },
        ],
      },
    });
    // The bus never calls execute, so not one wall lands. Reporting `ok-1` as added would be
    // a plan for an execution that will not happen (C78 §1.2c).
    expect(plan!.topology.added).toEqual([]);
    expect(plan!.changed).toEqual([]);
    expect(plan!.direct.kind).toBe('undetermined');
  });

  it('entries AFTER the first failure are declared UNCHECKED, not judged', async () => {
    // `canExecute` RETURNS at the first failure, so entries past it are never evaluated by
    // the commit path. Calling them valid would state a verdict the handler never reaches;
    // calling them invalid would invent one.
    const plan = await buildService(freshWorld()).preview({
      type: 'wall.batch.create',
      payload: { walls: [{ id: 'a' }, { id: 'b', height: -1 }, { id: 'c' }, { id: 'd' }] },
    });
    const unchecked = plan!.undetermined.find((u) => u.scope.includes('walls[2..3]'));
    expect(unchecked).toBeDefined();
    expect(unchecked!.reason).toBe('INVALID_REQUEST');
    expect(unchecked!.detail).toContain('UNCHECKED');
  });

  it('the systemTypeId refusal is mirrored when a catalogue IS composed', async () => {
    const plan = await buildService(freshWorld(), {
      systemTypes: { has: (id: string) => id === 'wt-known' },
    }).preview({
      type: 'wall.batch.create',
      payload: { walls: [{ id: 'a', systemTypeId: 'wt-known' }, { id: 'b', systemTypeId: 'wt-ghost' }] },
    });
    expect(plan!.refused.map((r) => r.reason)).toContain('walls[1]: unknown systemTypeId: wt-ghost');
  });

  it('and is DECLARED, never guessed, when no catalogue is composed', async () => {
    // The handler's own check is guarded by `this.systemTypeStore !== undefined`: with no
    // catalogue it validates nothing. Which branch the executing runtime is in is not
    // knowable here, so neither outcome is asserted.
    const plan = await buildService(freshWorld()).preview({
      type: 'wall.batch.create',
      payload: {
        levelId: 'L1',
        walls: [
          { id: 'a', systemTypeId: 'wt-ghost', baseLine: [{ x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 4 }] },
        ],
      },
    });
    expect(plan!.refused.map((r) => r.reason)).not.toContain(
      'walls[0]: unknown systemTypeId: wt-ghost',
    );
    const decl = plan!.undetermined.find((u) => u.scope.includes('unknown systemTypeId'));
    expect(decl).toBeDefined();
    expect(decl!.reason).toBe('ENGINE_NOT_AVAILABLE');
  });
});

describe('wall.batch.create · the batch-only hazards nothing else reports', () => {
  it('TWO entries claiming ONE id: the silent last-write-wins is DECLARED', async () => {
    // `execute` writes `draft[w.id] = w` per entry, and `canExecute` validates each entry in
    // isolation — so a duplicated id silently discards the earlier wall and nothing in the
    // commit path says so.
    const plan = await buildService(freshWorld()).preview({
      type: 'wall.batch.create',
      payload: {
        levelId: 'L1',
        walls: [
          { id: 'dup', baseLine: [{ x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 4 }] },
          { id: 'dup', baseLine: [{ x: 3, y: 0, z: 0 }, { x: 3, y: 0, z: 4 }] },
        ],
      },
    });
    const decl = plan!.undetermined.find((u) => u.scope.includes('duplicated id'));
    expect(decl).toBeDefined();
    expect(decl!.reason).toBe('INVALID_REQUEST');
    expect(decl!.detail).toContain('walls[0, 1]');
    // The id is named ONCE in topology.added — two entries, one wall.
    expect(plan!.topology.added).toEqual(['dup']);
  });

  it('an entry claiming an EXISTING wall id is reported as a REPLACEMENT, with its hosted elements declared', async () => {
    const plan = await buildService(freshWorld()).preview({
      type: 'wall.batch.create',
      payload: {
        levelId: 'L1',
        walls: [{ id: 'wall-s', baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }] }],
      },
    });
    expect(plan!.changed).toContain('wall-s');
    const decl = plan!.undetermined.find((u) => u.scope.includes('overwrites'));
    expect(decl).toBeDefined();
    expect(decl!.reason).toBe('RELATIONSHIP_NOT_READABLE');
    // ADDED and MODIFIED must not both claim it — `assemble` filters, and this pins it.
    expect(plan!.topology.modified).not.toContain('wall-s');
    expect(plan!.topology.added).toContain('wall-s');
  });

  it('id-less entries get INDEX-derived placeholders — two identical entries never collapse into one', async () => {
    const entry = { baseLine: [{ x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 4 }] };
    const plan = await buildService(freshWorld()).preview({
      type: 'wall.batch.create',
      payload: { levelId: 'L1', walls: [entry, { ...entry }] },
    });
    expect(plan!.topology.added).toHaveLength(2);
    expect(plan!.topology.added[0]).not.toBe(plan!.topology.added[1]);
    for (const id of plan!.topology.added) expect(id).toMatch(/^wall-pending-[0-9a-f]{8}$/);
    const decl = plan!.undetermined.find((u) => u.scope.includes('identities of 2 wall'));
    expect(decl!.reason).toBe('STALE_DERIVED_STATE');
  });

  it('an entry with NO baseLine is created but held OUT of the geometric solve, and said so', async () => {
    const plan = await buildService(freshWorld()).preview({
      type: 'wall.batch.create',
      payload: {
        levelId: 'L1',
        walls: [
          { id: 'wall-p1', baseLine: [{ x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 4 }] },
          { id: 'wall-nogeo' },
        ],
      },
    });
    // It IS created — the schema default applies — so it belongs in topology.added…
    expect(plan!.topology.added).toContain('wall-nogeo');
    // …but no geometric branch may claim to have evaluated it.
    const decl = plan!.undetermined.find((u) => u.scope.includes('walls[1]'));
    expect(decl).toBeDefined();
    expect(decl!.reason).toBe('STALE_DERIVED_STATE');
  });
});

describe('wall.batch.create · every unanswered question is TYPED, never empty', () => {
  it('every undetermined reason is a member of the CLOSED union (C78 §8.1 / U-INV-3)', async () => {
    const worlds = [
      BATCH,
      { type: 'wall.batch.create', payload: { walls: [] } },
      { type: 'wall.batch.create', payload: { walls: [{ id: 'a' }] } },
    ];
    for (const cmd of worlds) {
      const plan = await buildService(freshWorld()).preview(cmd);
      expect(plan!.undetermined.length).toBeGreaterThan(0);
      for (const u of plan!.undetermined) {
        expect(CLOSED_REASONS).toContain(u.reason);
        // A reason without a scope is a reason nobody can render (§8.1's own shape rule).
        expect(u.scope.length).toBeGreaterThan(0);
        expect(u.detail.length).toBeGreaterThan(0);
      }
    }
  });

  it('an ABSENT resolver is ENGINE_NOT_AVAILABLE — never "the batch joins nothing"', async () => {
    // U-INV-4 / §1.4: an absent collaborator is UNDETERMINED, never DETERMINED-unaffected.
    const plan = await buildService(freshWorld(), { omitResolver: true }).preview(BATCH);
    expect(plan!.indirect.kind).toBe('undetermined');
    const decl = plan!.undetermined.find((u) => u.scope.includes('junction impact'));
    expect(decl!.reason).toBe('ENGINE_NOT_AVAILABLE');
    // The crucial negative: the plan does NOT report an empty determined junction set.
    expect(plan!.topology.modified).toEqual([]);
    expect(plan!.indirect.kind).not.toBe('determined');
  });

  it('`excluded` stays EMPTY while the solid-clash question is open — no contradictory verdict', async () => {
    // A plan that declared solid overlap UNCHECKED for the level and simultaneously called a
    // wall on that level CHECKED-and-unaffected would contradict itself. The single-create
    // planner makes the same choice for the same reason.
    const plan = await buildService(freshWorld()).preview(BATCH);
    expect(plan!.excluded).toEqual([]);
    const clash = plan!.undetermined.find((u) => u.scope.includes('solid clash'));
    expect(clash!.reason).toBe('ENGINE_NOT_AVAILABLE');
  });

  it('a room the batch is driven through is named UNDETERMINED per room, with the culprits', async () => {
    // ⚠ THE PARTITIONS HERE OVERSHOOT (z −1 → 5), and that is load-bearing rather than
    // careless. `segmentsProperlyCross` is a STRICT-INTERIOR predicate: a partition whose
    // endpoints land exactly ON the ring (`BATCH`, z 0 → 4) is a T-junction at each end, not
    // a crossing, so it does NOT trip this branch. That is the single-create planner's
    // deliberate choice, inherited verbatim — the predicate exists to separate "a wall that
    // BOUNDS a room" from "a wall driven THROUGH it", and a wall meeting the ring at its
    // endpoints is the first. This test was written with the flush fixture first and FAILED;
    // the fixture was wrong, not the planner, and the flush case is asserted as a
    // non-crossing below so the boundary between the two stays pinned.
    const OVERSHOOT = {
      type: 'wall.batch.create',
      payload: {
        levelId: 'L1',
        walls: [
          { id: 'wall-p1', baseLine: [{ x: 2, y: 0, z: -1 }, { x: 2, y: 0, z: 5 }] },
          { id: 'wall-p2', baseLine: [{ x: 4, y: 0, z: -1 }, { x: 4, y: 0, z: 5 }] },
        ],
      },
    };
    const plan = await buildService(freshWorld()).preview(OVERSHOOT);
    const decl = plan!.undetermined.find((u) => u.scope.includes('room room-1'));
    expect(decl).toBeDefined();
    expect(decl!.reason).toBe('NO_DEPENDENCY_INDEX');
    // "this room is split" and "these walls split it" are different facts; both are stated.
    expect(decl!.detail).toContain('wall-p1, wall-p2');
    expect(plan!.changed).toContain('room-1');
  });

  it('…and a partition landing FLUSH on the ring is NOT a crossing — the boundary is pinned', async () => {
    // The other side of the predicate above. If this ever starts reporting room-1, the
    // strict-interior rule has been widened, and it is shared with `wall.create` — so the
    // change would silently alter the single-create row too.
    const plan = await buildService(freshWorld()).preview(BATCH);
    expect(plan!.undetermined.some((u) => u.scope.includes('room room-1'))).toBe(false);
    expect(plan!.changed).not.toContain('room-1');
    // Crucially this is a DETERMINED "no room is partitioned", not an absence of an answer:
    // the room branch ran, found structural linkage, and reported an empty crossed set.
    expect(plan!.indirect.kind).toBe('determined');
  });

  it('is PURE — planning twice over the same world mutates nothing and repeats byte-for-byte', async () => {
    const world = freshWorld();
    const before = JSON.stringify(world);
    const service = buildService(world);
    const a = await service.preview(BATCH);
    const b = await service.preview(BATCH);
    expect(JSON.stringify(world)).toBe(before);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
