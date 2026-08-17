/**
 * WALL.CREATE REACHABILITY — the C70 §4.2 proof, as EXECUTED tests.
 *
 * ════ WHY THIS SUITE EXISTS, AND WHY THE OBVIOUS TEST WOULD BE WORTHLESS ══════════════
 * `WallCreateConsequencePlanner` was authored in 719409f1 with 38 passing tests and a
 * composition factory — and `createWallCreateConsequencePlanner()` had ZERO callers. All
 * three planner registries registered `wall.move` only. The machinery was present and the
 * capability was unreachable: the repository's own signature hazard (C70 §4.2,
 * "authored-but-unwired"), reproduced inside the flagship reasoning program.
 *
 * The lesson C70 §4.2 draws is that PRESENCE ≠ REACHABILITY. So a test asserting that the
 * factory is called, or that the map contains a `'wall.create'` key, would prove nothing
 * this suite is for: the planner was always constructible, and a map key is not a plan.
 * What has to be shown is that a `wall.create` DISPATCH — the same `(type, payload)` a tool
 * handler emits — comes back with a real answer from each of the three surfaces that
 * `wall.move` has. That is what is asserted below, on the REAL services:
 *
 *   1. PREVIEW      — ConsequencePreviewService.preview() returns a ConsequencePlan
 *   2. CONFIRMATION — ConfirmationFlow.request() returns a plan-bearing request with a
 *                     planHash, i.e. something a user could actually be asked to approve
 *   3. EXECUTION    — ConsequenceExecutionService.execute() BINDS that plan (proving the
 *                     executor can re-plan the family, not merely dispatch it)
 *
 * ════ WHAT IS REAL AND WHAT IS A DOUBLE ═══════════════════════════════════════════════
 *   • REAL — the `WallCreateConsequencePlanner` (constructed exactly as the production
 *     composition file constructs it, but with the injected collaborators OMITTED, which
 *     is a supported configuration: the planner answers with typed UNDETERMINED where a
 *     collaborator is absent, and that is itself part of its contract). REAL, too, are all
 *     three services and the shared normaliser registry — the objects under test.
 *   • DOUBLE — the store views and the bus. Both are on the INPUT side.
 *
 * The production composition files cannot be imported here: `wallCreatePlannerComposition`
 * pulls `constraintEngine`, which touches `window.*` at module scope and throws at
 * collection in a node env. That is precisely why the planner takes every collaborator by
 * injection. The REGISTRATION those files perform is verified separately, by source
 * inspection, in the final test — so the wiring claim rests on the file's actual text and
 * not on a mock of it.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConsequencePlan, ConsequencePlanner, PlanningContext } from '@pryzm/command-bus';
import { WallCreateConsequencePlanner } from '../src/engine/consequence/WallCreateConsequencePlanner';
import {
  ConsequencePreviewService,
  normalizeConsequenceCommand,
  CONSEQUENCE_NORMALIZERS,
} from '../src/engine/consequence/ConsequencePreviewService';
import { ConsequenceExecutionService } from '../src/engine/consequence/ConsequenceExecutionService';
import { ConfirmationFlow } from '../src/ui/consequence/ConfirmationFlow';
// §B.4 — `preview()` answers a typed `PreviewOutcome` now. This suite's subject is the
// PLANNER'S OUTPUT, so it reads the plan-only view; see the adapter's header for why that is
// legitimate HERE and not in a new suite. The assertion that is genuinely ABOUT the outcome
// type (the `roof.create` negative control) reads the union directly instead.
import { planOnly } from './_previewPlanAdapter';

// ─── The world: one level with a single existing wall ─────────────────────────────────

type Wall = {
  id: string;
  type: 'wall';
  levelId: string;
  baseLine: [{ x: number; z: number }, { x: number; z: number }];
  height: number;
  thickness: number;
  openings: never[];
};

function existingWall(): Wall {
  return {
    id: 'w1',
    type: 'wall',
    levelId: 'L1',
    baseLine: [{ x: 0, z: 0 }, { x: 5, z: 0 }],
    height: 3,
    thickness: 0.2,
    openings: [],
  };
}

function makeContext(walls: Map<string, Wall>): () => PlanningContext {
  return () =>
    ({
      getStore: (id: string) =>
        id === 'wall'
          ? {
              getAll: () => [...walls.values()],
              getById: (wid: string) => walls.get(wid) ?? null,
            }
          : undefined,
    }) as unknown as PlanningContext;
}

/**
 * The planner as the production factory builds it, minus the three injected collaborators.
 * Absent collaborators are a CONTRACTUAL configuration (each yields a typed UNDETERMINED),
 * not a stub — so the object under test is the shipped class with no behaviour replaced.
 */
function realCreatePlanner(): ConsequencePlanner<never> {
  return new WallCreateConsequencePlanner({}) as unknown as ConsequencePlanner<never>;
}

function plannerRegistry(): ReadonlyMap<string, ConsequencePlanner<never>> {
  return new Map<string, ConsequencePlanner<never>>([['wall.create', realCreatePlanner()]]);
}

/** A dispatch exactly as a wall tool emits it (`CreateWallPayload`). */
const CREATE_DISPATCH = {
  type: 'wall.create',
  payload: {
    levelId: 'L1',
    baseLine: [{ x: 0, z: 0 }, { x: 0, z: 4 }],
    height: 3,
    thickness: 0.2,
  },
} as const;

// ─── 0. The normaliser — the chokepoint that made the map's genericity nominal ─────────

describe('wall.create normalisation (the former chokepoint)', () => {
  it('the SHARED registry recognises wall.create and forms a semantic command', () => {
    const semantic = normalizeConsequenceCommand(CREATE_DISPATCH);
    expect(semantic).not.toBeNull();
    expect(semantic?.type).toBe('wall.create');
  });

  it('still recognises both wall.move verbs — widening did not drop the first family', () => {
    expect(
      normalizeConsequenceCommand({
        type: 'wall.updateBaseline',
        payload: { wallId: 'w1', newBaseLine: [{ x: 0, z: 0 }, { x: 9, z: 0 }] },
      })?.type,
    ).toBe('wall.move');
    expect(
      normalizeConsequenceCommand({
        type: 'wall.move',
        payload: { id: 'w1', baseLine: [{ x: 0, z: 0 }, { x: 9, z: 0 }] },
      })?.type,
    ).toBe('wall.move');
  });

  it('an unknown verb is still null — the typed no-normalizer-for-verb path is intact', () => {
    expect(normalizeConsequenceCommand({ type: 'roof.create', payload: {} })).toBeNull();
  });

  it('the registry is a MAP, not a chain of ifs — a third family needs no service edit', () => {
    // U-INV-5 / C78 §5: genericity is a property of the LOOKUP. If this is a map, adding
    // `opening.move` is an entry; if it were hard-coded branches, it would be a service edit.
    expect(CONSEQUENCE_NORMALIZERS.has('wall.create')).toBe(true);
    expect(CONSEQUENCE_NORMALIZERS.has('wall.move')).toBe(true);
    expect(typeof CONSEQUENCE_NORMALIZERS.get('wall.create')).toBe('function');
  });
});

// ─── 1. PREVIEW ───────────────────────────────────────────────────────────────────────

describe('SURFACE 1 — preview answers for wall.create', () => {
  it('a wall.create dispatch produces a real ConsequencePlan (not null)', async () => {
    const walls = new Map([['w1', existingWall()]]);
    const svc = planOnly(new ConsequencePreviewService(plannerRegistry(), makeContext(walls)));

    const plan = await svc.preview(CREATE_DISPATCH);

    // The whole point: BEFORE this wiring, this was `null` — no normaliser, no planner.
    expect(plan).not.toBeNull();
    expect(typeof plan!.planHash).toBe('string');
    expect(plan!.planHash.length).toBeGreaterThan(0);
    expect(typeof plan!.stateHash).toBe('string');
  });

  it('the plan names the NEW wall as added — a create-shaped answer, not a move-shaped one', async () => {
    const walls = new Map([['w1', existingWall()]]);
    const svc = planOnly(new ConsequencePreviewService(plannerRegistry(), makeContext(walls)));

    const plan = (await svc.preview(CREATE_DISPATCH))!;

    // `topology.added` is where a newcomer belongs. A move plan never populates it, so
    // this assertion cannot pass by accidentally routing to the wall.move planner.
    expect(plan.topology.added.length).toBe(1);
    expect(plan.changed.length).toBeGreaterThan(0);
  });

  it('PURITY — previewing does not mutate the store (G-REASON-01)', async () => {
    const walls = new Map([['w1', existingWall()]]);
    const before = JSON.stringify([...walls.values()]);
    const svc = planOnly(new ConsequencePreviewService(plannerRegistry(), makeContext(walls)));

    await svc.preview(CREATE_DISPATCH);

    expect(walls.size).toBe(1);
    expect(JSON.stringify([...walls.values()])).toBe(before);
  });

  it('DETERMINISM — two previews of one command agree on planHash (G-REASON-02)', async () => {
    const walls = new Map([['w1', existingWall()]]);
    const svc = planOnly(new ConsequencePreviewService(plannerRegistry(), makeContext(walls)));

    const a = await svc.preview(CREATE_DISPATCH);
    const b = await svc.preview(CREATE_DISPATCH);

    expect(a!.planHash).toBe(b!.planHash);
  });

  it('an unregistered family previews as a TYPED capability gap — reachability was ADDED, not blanket-granted', async () => {
    const walls = new Map([['w1', existingWall()]]);
    // §B.4 — the RAW service, not the plan-only view: this assertion's subject IS the outcome
    // type. It read `.toBeNull()`, and that `null` was the same value the service returned for
    // a malformed payload and for a family that exists but is unwired. Naming the reason is
    // what makes it a control rather than a restatement of the defect.
    const svc = new ConsequencePreviewService(plannerRegistry(), makeContext(walls));

    const outcome = await svc.preview({ type: 'roof.create', payload: {} });

    expect(outcome.kind).toBe('undetermined');
    if (outcome.kind !== 'undetermined') return;
    expect(outcome.reason).toBe('UNSUPPORTED_ELEMENT_TYPE');
    expect(outcome.subReason).toBe('no-normalizer-for-verb');
  });
});

// ─── 2. CONFIRMATION ──────────────────────────────────────────────────────────────────

describe('SURFACE 2 — the confirmation flow binds a wall.create plan', () => {
  it('request() returns a plan-bearing arm with a planHash a user could approve', async () => {
    const walls = new Map([['w1', existingWall()]]);
    const flow = new ConfirmationFlow({
      planners: plannerRegistry(),
      normalizers: CONSEQUENCE_NORMALIZERS, // B.4: the REGISTRY, not a collapsing callback
      context: makeContext(walls),
      executor: {
        execute: async () => ({ consequence: { kind: 'unplanned' } }) as never,
      } as never,
    });

    const req = await flow.request(CREATE_DISPATCH);

    // `refused` (NoPlanRefusal) is the arm this whole task exists to eliminate for create.
    expect(req.kind).toBe('pending');
    const plan = (req as { plan?: ConsequencePlan }).plan;
    expect(plan).toBeDefined();
    expect(typeof plan!.planHash).toBe('string');
    // The policy is computed FROM the plan — so a create is classified, not merely planned.
    expect((req as { policy?: unknown }).policy).toBeDefined();
  });

  it('a family with NO planner still returns the no-planner arm — the negative control', async () => {
    const walls = new Map([['w1', existingWall()]]);
    const flow = new ConfirmationFlow({
      planners: plannerRegistry(),
      normalizers: CONSEQUENCE_NORMALIZERS, // B.4: the REGISTRY, not a collapsing callback
      context: makeContext(walls),
      executor: {
        execute: async () => ({ consequence: { kind: 'unplanned' } }) as never,
      } as never,
    });

    const req = await flow.request({ type: 'roof.create', payload: {} });

    // Proves the positive result above is not the flow saying "yes" to everything.
    expect(req.kind).toBe('refused');
    expect((req as { refusal?: { kind?: string } }).refusal?.kind).toBe('NO_PLAN_AVAILABLE');
  });
});

// ─── 3. EXECUTION ─────────────────────────────────────────────────────────────────────

describe('SURFACE 3 — the executor can BIND a wall.create plan', () => {
  function makeBus(walls: Map<string, Wall>) {
    const dispatched: string[] = [];
    return {
      dispatched,
      bus: {
        executeCommand: async (type: string, payload: unknown) => {
          dispatched.push(type);
          const p = payload as Partial<Wall>;
          const id = p.id ?? 'w-new';
          walls.set(id, { ...existingWall(), ...p, id } as Wall);
          return { id: 'evt-1', type, payload } as never;
        },
      },
    };
  }

  it('a plan minted by preview is BOUND at execute — not refused as unverifiable', async () => {
    const walls = new Map([['w1', existingWall()]]);
    const context = makeContext(walls);
    const planners = plannerRegistry();
    const { bus, dispatched } = makeBus(walls);

    // Mint the plan the way the confirmation flow does, then hand it to the executor.
    const plan = (await planOnly(new ConsequencePreviewService(planners, context)).preview(
      CREATE_DISPATCH,
    ))!;

    const svc = new ConsequenceExecutionService({ bus, planners, context });
    const { consequence } = await svc.execute(CREATE_DISPATCH, { plan });

    expect(dispatched).toContain('wall.create');

    // THE ASSERTION THAT MATTERS. Before the wiring, `normalizeToWallMove` returned null
    // for wall.create, so this path hit the `no-normalizer-for-verb` capability-gap arm
    // and the plan could never be bound. A reconciled consequence proves the executor
    // RE-PLANNED the family over live state and matched the hash — reachability, not
    // registration.
    expect(consequence.kind).toBe('reconciled');
  });

  it('the executor re-plans wall.create rather than reporting a capability gap', async () => {
    const walls = new Map([['w1', existingWall()]]);
    const context = makeContext(walls);
    const planners = plannerRegistry();
    const { bus } = makeBus(walls);

    const plan = (await planOnly(new ConsequencePreviewService(planners, context)).preview(
      CREATE_DISPATCH,
    ))!;
    const svc = new ConsequenceExecutionService({ bus, planners, context });
    const { consequence } = await svc.execute(CREATE_DISPATCH, { plan });

    // The typed capability-gap sub-reasons must NOT appear anywhere in the answer.
    const serialised = JSON.stringify(consequence);
    expect(serialised).not.toContain('no-normalizer-for-verb');
    expect(serialised).not.toContain('no-planner-registered');
  });
});

// ─── 4. THE WIRING ITSELF ─────────────────────────────────────────────────────────────

describe('the three composition roots register wall.create', () => {
  const root = join(__dirname, '..', 'src');

  /**
   * Source inspection, deliberately. The composition files import `constraintEngine`,
   * which touches `window.*` at module scope and throws on import in a node env — that is
   * the documented reason the composition sites are split from the planners at all. So the
   * REGISTRATION is verified against the files' actual text, while the BEHAVIOUR is
   * verified by the executed tests above. Neither half alone would be the proof.
   */
  it('the shared planner factory registers wall.create alongside wall.move', () => {
    const src = readFileSync(
      join(root, 'engine', 'consequence', 'consequencePreviewServiceComposition.ts'),
      'utf8',
    );
    expect(src).toContain('createWallCreateConsequencePlanner');
    expect(src).toMatch(/planners\.set\(\s*'wall\.create'/);
    expect(src).toMatch(/planners\.set\(\s*'wall\.move'/);
  });

  it('all three roots consume that ONE factory', () => {
    for (const rel of [
      ['engine', 'consequence', 'consequencePreviewServiceComposition.ts'],
      ['engine', 'consequence', 'consequenceExecutionServiceComposition.ts'],
      ['ui', 'consequence', 'confirmationFlowComposition.ts'],
    ]) {
      const src = readFileSync(join(root, ...rel), 'utf8');
      expect(src).toContain('createConsequencePlanners');
    }
  });

  it('registration happens in exactly ONE file — the drift that hid wall.create is locked out', () => {
    // The defect being locked out: THREE hand-built maps, each registering whatever its
    // author remembered. Partial registration was silent, which is how the create planner
    // came to be registered nowhere at all. The two CONSUMER roots must contain no
    // `planners.set` of their own; only the shared factory's file may.
    for (const rel of [
      ['engine', 'consequence', 'consequenceExecutionServiceComposition.ts'],
      ['ui', 'consequence', 'confirmationFlowComposition.ts'],
    ]) {
      const src = readFileSync(join(root, ...rel), 'utf8');
      expect(src).not.toMatch(/planners\.set\(/);
    }
  });
});
