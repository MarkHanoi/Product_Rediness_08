/**
 * OPENING.MOVE REACHABILITY — the C70 §4.2 proof for the THIRD matrix row, as EXECUTED tests.
 *
 * ════ WHY THIS SUITE EXISTS ═══════════════════════════════════════════════════════════
 * C70 §4.2: "Machinery present ≠ capability reachable — the reachability question is the one
 * to ask." `WallCreateConsequencePlanner` was authored with 38 passing tests, a composition
 * factory, and ZERO callers; the capability was unreachable while every artefact said
 * otherwise. This suite refuses to repeat that for `opening.move`.
 *
 * A test asserting the planner is constructible, or that a map holds an `'opening.move'` key,
 * would prove nothing: the planner was always constructible and a map key is not a plan. What
 * is asserted below is that an OPENING-MOVE DISPATCH — the same `(type, payload)` the live
 * `door.setOffset` / `window.setOffset` bus verbs carry — comes back with a real answer from
 * each of the three surfaces `wall.move` has:
 *
 *   1. PREVIEW      — ConsequencePreviewService.preview() returns a ConsequencePlan
 *   2. CONFIRMATION — ConfirmationFlow.request() returns a plan-bearing request with a
 *                     planHash, i.e. something a user could actually be asked to approve
 *   3. EXECUTION    — ConsequenceExecutionService.execute() BINDS that plan
 *
 * ════ AND THE REFUSAL SHAPES, WHICH ARE THE POINT OF THIS ROW ═════════════════════════
 * C70 F-INV-3 binds this planner: refit where it fits, refuse naming BOTH numbers where it
 * does not, never delete a hosted element to make room. Reachability alone would not prove
 * any of that, so the refusal shapes are asserted directly — including the negative claim
 * (nothing is ever removed), which is the clause most likely to be violated by a future
 * "helpful" fix.
 *
 * ════ WHAT IS REAL AND WHAT IS A DOUBLE ═══════════════════════════════════════════════
 *   • REAL — the `OpeningMoveConsequencePlanner`, and the REAL `wallOccupancyStore` from
 *     @pryzm/geometry-wall as both the clamp and the collision seam. That store is a pure
 *     query object with no window coupling, so the fit and occupancy verdicts under test are
 *     the PRODUCTION rules, not a restatement of them. REAL, too, are all three services and
 *     the shared normaliser registry.
 *   • DOUBLE — the store views, the bus, and the validator. All on the INPUT side.
 *
 * The production composition file cannot be imported here: `openingMovePlannerComposition`
 * pulls `constraintEngine`, which touches `window.*` at module scope and throws at collection
 * in a node env. That is precisely why the planner takes every collaborator by injection. The
 * REGISTRATION those files perform is verified separately, by source inspection, in the final
 * block — so the wiring claim rests on the files' actual text and not on a mock of it.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConsequencePlan, ConsequencePlanner, PlanningContext } from '@pryzm/command-bus';
import { UNDETERMINED_SUB_REASON_PARENT } from '@pryzm/command-bus';
import { wallOccupancyStore } from '@pryzm/geometry-wall';
import { OpeningMoveConsequencePlanner } from '../src/engine/consequence/OpeningMoveConsequencePlanner';
import {
  ConsequencePreviewService,
  normalizeConsequenceCommand,
  CONSEQUENCE_NORMALIZERS,
} from '../src/engine/consequence/ConsequencePreviewService';
import { ConsequenceExecutionService } from '../src/engine/consequence/ConsequenceExecutionService';
import { ConfirmationFlow } from '../src/ui/consequence/ConfirmationFlow';
// §B.4 — `preview()` answers a typed `PreviewOutcome` now. This suite's subject is the
// PLANNER'S OUTPUT, so it reads the plan-only view; see the adapter's header for why that is
// legitimate HERE and not in a new suite. The two assertions that are genuinely ABOUT the
// outcome type (the `roof.create` negative controls) read the union directly instead.
import { planOnly, type PlanOnlyPreviewProvider } from './_previewPlanAdapter';

// ─── The world: one 6 m wall hosting a 0.9 m door and a 1.2 m window ──────────────────

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

/**
 * A 6 m wall, 2.7 m tall. `door-1` occupies [0.500, 1.400]; `win-1` occupies [3.000, 4.200].
 * The gap between them is [1.400, 3.000] — 1.6 m of clear span, which is what makes both a
 * clean move and a colliding move expressible on ONE fixture.
 */
function hostWall(): Wall {
  return {
    id: 'wall-1',
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

function makeContext(walls: Map<string, Wall>): () => PlanningContext {
  return () =>
    ({
      getStore: (id: string) => {
        const items: unknown[] | undefined =
          id === 'wall'
            ? [...walls.values()]
            : id === 'room' || id === 'door' || id === 'window' || id === 'stair'
              ? []
              : undefined;
        if (!items) return undefined;
        return {
          getAll: () => items,
          getById: (eid: string) => items.find((i) => (i as { id?: string }).id === eid) ?? null,
        };
      },
    }) as unknown as PlanningContext;
}

/**
 * The planner wired with the REAL occupancy store on both seams — exactly as
 * `openingMovePlannerComposition` wires it — and no validator. An absent validator is a
 * CONTRACTUAL configuration (it yields a typed UNDETERMINED), so nothing is stubbed out.
 */
function realPlanner(): ConsequencePlanner<never> {
  return new OpeningMoveConsequencePlanner({
    clamp: wallOccupancyStore,
    collision: wallOccupancyStore,
  }) as unknown as ConsequencePlanner<never>;
}

function plannerRegistry(): ReadonlyMap<string, ConsequencePlanner<never>> {
  return new Map<string, ConsequencePlanner<never>>([['opening.move', realPlanner()]]);
}

/** A dispatch exactly as the live door bridge emits it. The door slides 0.5 → 1.8 m: clear. */
const DOOR_DISPATCH = {
  type: 'door.setOffset',
  payload: { doorId: 'door-1', newOffset: 1.8, prevOffset: 0.5 },
} as const;

function svc(walls: Map<string, Wall>): PlanOnlyPreviewProvider {
  return planOnly(new ConsequencePreviewService(plannerRegistry(), makeContext(walls)));
}

function world(): Map<string, Wall> {
  return new Map([['wall-1', hostWall()]]);
}

// ─── 0. The normaliser — the chokepoint, widened for a third family ───────────────────

describe('opening.move normalisation (the shared registry, third row)', () => {
  it('door.setOffset normalises to the semantic opening.move', () => {
    const semantic = normalizeConsequenceCommand(DOOR_DISPATCH);
    expect(semantic).not.toBeNull();
    expect(semantic!.type).toBe('opening.move');
    expect(semantic!.payload).toMatchObject({ id: 'door-1', offset: 1.8, prevOffset: 0.5 });
  });

  it('window.setOffset normalises to the SAME semantic verb — one family, two spellings', () => {
    const semantic = normalizeConsequenceCommand({
      type: 'window.setOffset',
      payload: { windowId: 'win-1', newOffset: 2.0 },
    });
    expect(semantic!.type).toBe('opening.move');
    expect(semantic!.payload).toMatchObject({ id: 'win-1', offset: 2.0 });
  });

  it('the semantic verb dispatches directly too (the AI/parity surface path)', () => {
    expect(
      normalizeConsequenceCommand({ type: 'opening.move', payload: { id: 'door-1', offset: 1.8 } })!
        .type,
    ).toBe('opening.move');
  });

  it('wallId is forwarded when present and OMITTED when absent — never invented', () => {
    const withHost = normalizeConsequenceCommand({
      type: 'door.setOffset',
      payload: { doorId: 'door-1', newOffset: 1.8, wallId: 'wall-1' },
    });
    expect(withHost!.payload).toMatchObject({ wallId: 'wall-1' });
    // The live verbs do NOT carry wallId. Inventing one here would put the planner's
    // reverse-scan refusal path out of reach.
    expect(Object.keys(normalizeConsequenceCommand(DOOR_DISPATCH)!.payload as object)).not.toContain(
      'wallId',
    );
  });

  it('a payload with no numeric offset is null — not a command this family can answer', () => {
    expect(
      normalizeConsequenceCommand({ type: 'door.setOffset', payload: { doorId: 'door-1' } }),
    ).toBeNull();
    expect(
      normalizeConsequenceCommand({
        type: 'door.setOffset',
        payload: { doorId: 'door-1', newOffset: Number.NaN },
      }),
    ).toBeNull();
  });

  it('widening did not drop the first two families', () => {
    expect(
      normalizeConsequenceCommand({
        type: 'wall.updateBaseline',
        payload: { wallId: 'w1', newBaseLine: [{ x: 0, z: 0 }, { x: 9, z: 0 }] },
      })!.type,
    ).toBe('wall.move');
    expect(
      normalizeConsequenceCommand({ type: 'wall.create', payload: { levelId: 'L1' } })!.type,
    ).toBe('wall.create');
  });

  it('an unknown verb is still null — the typed no-normalizer-for-verb path is intact', () => {
    expect(normalizeConsequenceCommand({ type: 'roof.create', payload: {} })).toBeNull();
  });

  it('the registry is still a MAP — a FOURTH family needs no service edit either', () => {
    for (const k of ['wall.move', 'wall.create', 'opening.move', 'door.setOffset', 'window.setOffset']) {
      expect(CONSEQUENCE_NORMALIZERS.has(k)).toBe(true);
    }
  });
});

// ─── 1. PREVIEW ───────────────────────────────────────────────────────────────────────

describe('SURFACE 1 — preview answers for opening.move', () => {
  it('a door.setOffset dispatch produces a real ConsequencePlan (not null)', async () => {
    const plan = await svc(world()).preview(DOOR_DISPATCH);
    expect(plan).not.toBeNull();
    expect(typeof plan!.planHash).toBe('string');
    expect(plan!.planHash.length).toBeGreaterThan(0);
    expect(typeof plan!.stateHash).toBe('string');
    expect(plan!.planId.startsWith('plan-opening.move-')).toBe(true);
  });

  it('the plan is OPENING-shaped, not wall-shaped: the host is modified, nothing is added', async () => {
    const plan = (await svc(world()).preview(DOOR_DISPATCH))!;
    // A create plan populates topology.added; a wall-move plan never names an opening in
    // `changed`. Both halves together mean this cannot have been answered by another family.
    expect(plan.topology.added).toEqual([]);
    expect(plan.changed).toContain('door-1');
    expect(plan.changed).toContain('wall-1');
    expect(plan.topology.modified).toContain('wall-1');
  });

  it('the host is resolved by REVERSE SCAN when the payload carries no wallId', async () => {
    // The live verbs carry no wallId, so this is the production path — not an edge case.
    const plan = (await svc(world()).preview(DOOR_DISPATCH))!;
    expect(plan.changed).toContain('wall-1');
    expect(
      plan.undetermined.some((u) => u.reason === 'RELATIONSHIP_NOT_READABLE' && /host wall/.test(u.scope)),
    ).toBe(false);
  });

  it('the clear SIBLING is `excluded` — considered-and-determined-unchanged, not omitted', async () => {
    const plan = (await svc(world()).preview(DOOR_DISPATCH))!;
    // door-1 → [1.800, 2.700]; win-1 sits at [3.000, 4.200]. Clear, and CHECKED.
    expect(plan.excluded).toContain('win-1');
  });

  it('the offset transition is carried in the TYPED metric field, not in prose', async () => {
    const plan = (await svc(world()).preview(DOOR_DISPATCH))!;
    expect(plan.metrics).toEqual([
      { elementId: 'door-1', metric: 'offset', before: 0.5, after: 1.8, unit: 'm' },
    ]);
  });

  it('PURITY — previewing mutates nothing (G-REASON-01)', async () => {
    const walls = world();
    const before = JSON.stringify([...walls.values()]);
    await svc(walls).preview(DOOR_DISPATCH);
    expect(JSON.stringify([...walls.values()])).toBe(before);
  });

  it('DETERMINISM — two previews of one command agree byte-for-byte (G-REASON-02)', async () => {
    const s = svc(world());
    const a = await s.preview(DOOR_DISPATCH);
    const b = await s.preview(DOOR_DISPATCH);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('an unregistered family previews as a TYPED capability gap — reachability was ADDED, not blanket-granted', async () => {
    // §B.4 — read the RAW service, not the plan-only view. This assertion is the one place in
    // this suite whose subject IS the outcome type: it used to read `.toBeNull()`, and that
    // `null` was the same value the service returned for a malformed payload and for a family
    // that exists but is unwired. Asserting the reason is what makes it a control at all.
    const outcome = await new ConsequencePreviewService(
      plannerRegistry(),
      makeContext(world()),
    ).preview({ type: 'roof.create', payload: {} });

    expect(outcome.kind).toBe('undetermined');
    if (outcome.kind !== 'undetermined') return;
    expect(outcome.reason).toBe('UNSUPPORTED_ELEMENT_TYPE');
    expect(outcome.subReason).toBe('no-normalizer-for-verb');
  });
});

// ─── 1b. THE REFUSAL SHAPES — C70 F-INV-3 ─────────────────────────────────────────────

describe('C70 F-INV-3 — refit, refuse with BOTH numbers, never delete', () => {
  it('REFIT: an offset past the wall end is CLAMPED back inside, at the authored width', async () => {
    // door-1 is 0.9 m on a 6 m wall. Asking for 5.8 would put its right edge at 6.7 m.
    const plan = (await svc(world()).preview({
      type: 'door.setOffset',
      payload: { doorId: 'door-1', newOffset: 5.8, prevOffset: 0.5 },
    }))!;

    // It MOVES (the element is not refused) and it lands at the clamped offset 5.1 = 6 − 0.9.
    expect(plan.refused).toEqual([]);
    expect(plan.changed).toContain('door-1');
    expect(plan.metrics![0]!.after).toBeCloseTo(5.1, 6);
    // And the refit is DECLARED — a silent clamp would promise the requested offset and
    // commit a different one.
    const clampNote = plan.undetermined.find((u) => u.reason === 'GEOMETRY_UNPREDICTABLE');
    expect(clampNote).toBeDefined();
    expect(clampNote!.detail).toContain('5.800');
    expect(clampNote!.detail).toContain('5.100');
  });

  it('REFUSE (host fit): a door wider than its host is refused NAMING BOTH NUMBERS', async () => {
    const walls = world();
    // A 0.4 m stub wall cannot carry a 0.9 m door at any offset.
    const w = walls.get('wall-1')!;
    w.baseLine = [{ x: 0, y: 0, z: 0 }, { x: 0.4, y: 0, z: 0 }];

    const plan = (await svc(walls).preview(DOOR_DISPATCH))!;

    expect(plan.refused.length).toBeGreaterThan(0);
    const r = plan.refused.find((x) => x.elementId === 'door-1')!;
    expect(r).toBeDefined();
    // The RULE is named…
    expect(r.reason).toContain('C15 §5');
    expect(r.reason).toContain('F-INV-3');
    // …and BOTH numbers are in the sentence: what is needed, and what is available.
    expect(r.reason).toContain('0.900');
    expect(r.reason).toContain('0.400');
  });

  it('REFUSE (sibling collision): the overlap is refused NAMING BOTH SPANS', async () => {
    // door-1 → [3.400, 4.300] overlaps win-1 at [3.000, 4.200].
    const plan = (await svc(world()).preview({
      type: 'door.setOffset',
      payload: { doorId: 'door-1', newOffset: 3.4, prevOffset: 0.5 },
    }))!;

    const r = plan.refused.find((x) => x.elementId === 'door-1');
    expect(r).toBeDefined();
    expect(r!.reason).toContain('win-1');
    expect(r!.reason).toContain('3.400'); // the proposed span start
    expect(r!.reason).toContain('4.300'); // the proposed span end
    expect(r!.reason).toContain('3.000'); // the occupied span start
    expect(r!.reason).toContain('4.200'); // the occupied span end
  });

  it('a REFUSED move changes NOTHING — the plan does not promise a mutation it refuses', async () => {
    const plan = (await svc(world()).preview({
      type: 'door.setOffset',
      payload: { doorId: 'door-1', newOffset: 3.4, prevOffset: 0.5 },
    }))!;

    expect(plan.changed).toEqual([]);
    expect(plan.topology.modified).toEqual([]);
    // And no metric transition: nothing moves, so no quantity moves.
    expect(plan.metrics).toBeUndefined();
  });

  it('NEVER DELETE: no branch removes a hosted element, on ANY of the paths above', async () => {
    for (const offset of [1.8, 3.4, 5.8, -2, 99]) {
      const plan = (await svc(world()).preview({
        type: 'door.setOffset',
        payload: { doorId: 'door-1', newOffset: offset },
      }))!;
      // F-INV-3 clause 3. The sibling is never removed to make room, and neither is the
      // subject. This is structural — `assemble` hard-codes `removed: []` with no parameter
      // that could fill it — and the loop proves it across refit, refuse and clamp paths.
      expect(plan.topology.removed).toEqual([]);
      expect(plan.topology.added).toEqual([]);
    }
  });

  it('SELF-EXCLUSION: a small in-place nudge is not refused as a self-conflict', async () => {
    // §MOVE-EXCLUDE-SELF: [0.550, 1.450] overlaps door-1's OWN pre-move slot [0.500, 1.400].
    const plan = (await svc(world()).preview({
      type: 'door.setOffset',
      payload: { doorId: 'door-1', newOffset: 0.55, prevOffset: 0.5 },
    }))!;
    expect(plan.refused).toEqual([]);
    expect(plan.changed).toContain('door-1');
  });
});

// ─── 1c. THE UNDETERMINED VOCABULARY — every reason is a union member ─────────────────

describe('honest blind spots — the 11-reason union, never silence and never a guess', () => {
  const UNION = new Set([
    'NO_DEPENDENCY_INDEX', 'ENGINE_NOT_AVAILABLE', 'UNSUPPORTED_ELEMENT_TYPE',
    'STALE_DERIVED_STATE', 'INVALID_REQUEST', 'GEOMETRY_UNPREDICTABLE',
    'TOPOLOGY_CHANGE_POSSIBLE', 'RELATIONSHIP_NOT_RECORDED', 'RELATIONSHIP_NOT_READABLE',
    'AGGREGATE_SCOPE_UNSUPPORTED', 'PLANNER_THREW',
  ]);

  it('every undetermined entry on a happy-path plan uses a union member', async () => {
    const plan = (await svc(world()).preview(DOOR_DISPATCH))!;
    expect(plan.undetermined.length).toBeGreaterThan(0);
    for (const u of plan.undetermined) expect(UNION.has(u.reason)).toBe(true);
  });

  /**
   * C78 §8.3 — a sub-reason belongs to EXACTLY ONE parent, and
   * `UNDETERMINED_SUB_REASON_PARENT` is the single reviewable statement of that ownership.
   *
   * ⚠ THIS TEST EXISTS BECAUSE THE PLANNER FAILED IT. The reverse-scan-miss branch shipped
   * `RELATIONSHIP_NOT_READABLE` + `element-unknown-to-joinedTo-writer`, whose declared parent
   * is `RELATIONSHIP_NOT_RECORDED` — a producer contradicting the map that exists to make
   * sub-reasons auditable, and a sub-reason borrowed from a different family entirely
   * (core-app-model's wall↔wall `joinedTo` writer, which has nothing to say about host↔hosted
   * lookup). Fifty-two green tests did not catch it, because the vocabulary suite validates
   * the MAP and nothing validated the EMITTERS.
   *
   * So this asserts the pairing over EVERY branch this family can reach, including the
   * refusal and unresolvable-host paths — not just the happy one.
   */
  it('every {reason, subReason} pair a branch emits AGREES with the ownership map (C78 §8.3)', async () => {
    const dispatches = [
      DOOR_DISPATCH,                                                              // happy path
      { type: 'door.setOffset', payload: { doorId: 'ghost-9', newOffset: 1.0 } }, // host unresolvable
      { type: 'door.setOffset', payload: { doorId: 'door-1', newOffset: 3.4 } },  // sibling collision
      { type: 'door.setOffset', payload: { doorId: 'door-1', newOffset: 5.8 } },  // refit/clamp
      { type: 'opening.move', payload: { id: 'door-1', offset: 1.8, wallId: 'nope' } }, // bad host
    ];
    let seen = 0;
    for (const d of dispatches) {
      const plan = (await svc(world()).preview(d))!;
      for (const u of plan.undetermined) {
        seen++;
        if (u.subReason === undefined) continue;
        // A sub-reason may only travel beside the parent the map assigns it.
        expect(UNDETERMINED_SUB_REASON_PARENT[u.subReason]).toBe(u.reason);
      }
    }
    // The loop must actually have inspected entries — an empty sweep would pass vacuously,
    // which is the inert-arm defect in test clothing.
    expect(seen).toBeGreaterThan(10);
  });

  it('the FOUR C78 §6.4 dispositions are all declared — rooms, dual-store, regeneration', async () => {
    const plan = (await svc(world()).preview(DOOR_DISPATCH))!;
    const reasons = plan.undetermined.map((u) => u.reason);
    // (iii) rooms unaffected BY CONSTRUCTION — stated, not left as an absence.
    expect(reasons).toContain('AGGREGATE_SCOPE_UNSUPPORTED');
    // (iv) the C15 §8.1 dual-store row.
    expect(reasons).toContain('RELATIONSHIP_NOT_READABLE');
    // regeneration, the blind spot both wall rows also declare.
    expect(reasons).toContain('NO_DEPENDENCY_INDEX');
  });

  it('an UNHOSTED element refuses to answer rather than guessing a host', async () => {
    const plan = (await svc(world()).preview({
      type: 'door.setOffset',
      payload: { doorId: 'ghost-9', newOffset: 1.0 },
    }))!;
    const u = plan.undetermined.find((x) => x.reason === 'RELATIONSHIP_NOT_READABLE' && /host wall/.test(x.scope));
    expect(u).toBeDefined();
    expect(plan.changed).toEqual([]);
    expect(plan.indirect.kind).toBe('undetermined');
  });

  it('a WRONG named host is RELATIONSHIP_NOT_RECORDED — no silent fallback scan', async () => {
    const walls = world();
    walls.set('wall-2', { ...hostWall(), id: 'wall-2', openings: [] });
    const plan = (await svc(walls).preview({
      type: 'opening.move',
      payload: { id: 'door-1', offset: 1.8, wallId: 'wall-2' },
    }))!;
    const u = plan.undetermined.find((x) => x.reason === 'RELATIONSHIP_NOT_RECORDED');
    expect(u).toBeDefined();
    // The critical negative: it did NOT quietly re-host onto wall-1, which does contain door-1.
    expect(plan.changed).not.toContain('wall-1');
  });

  it('an AMBIGUOUS host (two walls claim the element) refuses rather than coin-flipping', async () => {
    const walls = world();
    walls.set('wall-2', { ...hostWall(), id: 'wall-2' });
    const plan = (await svc(walls).preview(DOOR_DISPATCH))!;
    const u = plan.undetermined.find(
      (x) => x.reason === 'RELATIONSHIP_NOT_READABLE' && /wall-1/.test(x.detail ?? '') && /wall-2/.test(x.detail ?? ''),
    );
    expect(u).toBeDefined();
    expect(plan.changed).toEqual([]);
  });

  it('ABSENT collaborators are ENGINE_NOT_AVAILABLE, never a silent pass', async () => {
    const bare = new Map<string, ConsequencePlanner<never>>([
      ['opening.move', new OpeningMoveConsequencePlanner({}) as unknown as ConsequencePlanner<never>],
    ]);
    const plan = (await planOnly(new ConsequencePreviewService(bare, makeContext(world()))).preview(
      DOOR_DISPATCH,
    ))!;
    const engineGaps = plan.undetermined.filter((u) => u.reason === 'ENGINE_NOT_AVAILABLE');
    // The clamp, the occupancy reader and the validator are all absent — three declared gaps.
    expect(engineGaps.length).toBeGreaterThanOrEqual(3);
    // And with the fit unverifiable, the move must NOT be reported as a confident success.
    expect(plan.refused).toEqual([]);
    expect(engineGaps.some((u) => /still fits/.test(u.scope))).toBe(true);
  });
});

// ─── 2. CONFIRMATION ──────────────────────────────────────────────────────────────────

describe('SURFACE 2 — the confirmation flow binds an opening.move plan', () => {
  function flowOver(walls: Map<string, Wall>): ConfirmationFlow {
    return new ConfirmationFlow({
      planners: plannerRegistry(),
      // §B.4 — the flow takes the normaliser REGISTRY, not a normalising function: a callback
      // returning `null` has already collapsed "no rule for this verb" into "the rule rejected
      // this payload" before the flow can type either.
      normalizers: CONSEQUENCE_NORMALIZERS,
      context: makeContext(walls),
      executor: { execute: async () => ({ consequence: { kind: 'unplanned' } }) as never } as never,
    });
  }

  it('request() returns a plan-bearing arm with a planHash a user could approve', async () => {
    const req = await flowOver(world()).request(DOOR_DISPATCH);
    expect(req.kind).toBe('pending');
    const plan = (req as { plan?: ConsequencePlan }).plan;
    expect(plan).toBeDefined();
    expect(typeof plan!.planHash).toBe('string');
    // The policy is computed FROM the plan — so an opening move is CLASSIFIED, not merely
    // planned.
    expect((req as { policy?: unknown }).policy).toBeDefined();
  });

  it('a family with NO planner still returns the no-planner arm — the negative control', async () => {
    const req = await flowOver(world()).request({ type: 'roof.create', payload: {} });
    expect(req.kind).toBe('refused');
    expect((req as { refusal?: { kind?: string } }).refusal?.kind).toBe('NO_PLAN_AVAILABLE');
  });
});

// ─── 3. EXECUTION ─────────────────────────────────────────────────────────────────────

describe('SURFACE 3 — the executor can BIND an opening.move plan', () => {
  function makeBus(walls: Map<string, Wall>) {
    const dispatched: string[] = [];
    return {
      dispatched,
      bus: {
        executeCommand: async (type: string, payload: unknown) => {
          dispatched.push(type);
          // A faithful-enough stand-in for the SetDoorOffsetCommand bridge: write the new
          // offset into the host's openings array, which is where C15 §8.1's first write goes.
          const p = payload as { doorId?: string; newOffset?: number };
          for (const w of walls.values()) {
            const o = w.openings.find((x) => x.elementId === p.doorId);
            if (o && typeof p.newOffset === 'number') o.offset = p.newOffset;
          }
          return { id: 'evt-1', type, payload } as never;
        },
      },
    };
  }

  it('a plan minted by preview is BOUND at execute — not refused as unverifiable', async () => {
    const walls = world();
    const context = makeContext(walls);
    const planners = plannerRegistry();
    const { bus, dispatched } = makeBus(walls);

    const plan = (await planOnly(new ConsequencePreviewService(planners, context)).preview(DOOR_DISPATCH))!;
    const svcE = new ConsequenceExecutionService({ bus, planners, context });
    const { consequence } = await svcE.execute(DOOR_DISPATCH, { plan });

    expect(dispatched).toContain('door.setOffset');
    // THE ASSERTION THAT MATTERS. A reconciled consequence proves the executor RE-PLANNED the
    // family over live pre-state and matched the hash — reachability, not registration.
    expect(consequence.kind).toBe('reconciled');
  });

  it('the executor re-plans opening.move rather than reporting a capability gap', async () => {
    const walls = world();
    const context = makeContext(walls);
    const planners = plannerRegistry();
    const { bus } = makeBus(walls);

    const plan = (await planOnly(new ConsequencePreviewService(planners, context)).preview(DOOR_DISPATCH))!;
    const svcE = new ConsequenceExecutionService({ bus, planners, context });
    const { consequence } = await svcE.execute(DOOR_DISPATCH, { plan });

    const serialised = JSON.stringify(consequence);
    expect(serialised).not.toContain('no-normalizer-for-verb');
    expect(serialised).not.toContain('no-planner-registered');
  });
});

// ─── 4. THE WIRING ITSELF ─────────────────────────────────────────────────────────────

describe('the shared factory registers opening.move, and no service was edited to do it', () => {
  const root = join(__dirname, '..', 'src');

  it('the ONE shared planner factory registers all three families', () => {
    const src = readFileSync(
      join(root, 'engine', 'consequence', 'consequencePreviewServiceComposition.ts'),
      'utf8',
    );
    expect(src).toContain('createOpeningMoveConsequencePlanner');
    expect(src).toMatch(/planners\.set\(\s*'opening\.move'/);
    expect(src).toMatch(/planners\.set\(\s*'wall\.create'/);
    expect(src).toMatch(/planners\.set\(\s*'wall\.move'/);
  });

  it('registration still happens in exactly ONE file — the drift that hid wall.create stays locked out', () => {
    for (const rel of [
      ['engine', 'consequence', 'consequenceExecutionServiceComposition.ts'],
      ['ui', 'consequence', 'confirmationFlowComposition.ts'],
    ]) {
      const src = readFileSync(join(root, ...rel), 'utf8');
      expect(src).toContain('createConsequencePlanners');
      expect(src).not.toMatch(/planners\.set\(/);
    }
  });

  /**
   * THE GENERICITY TEST, as an assertion rather than a claim.
   *
   * The brief for this row said: "If you find yourself editing the three composition services,
   * STOP — that means the genericity is still nominal and that is a FINDING worth more than
   * the feature." This test pins the result. The three SERVICE CLASSES must name no family:
   * no verb literal, no `opening.move`, no `wall.` branch. They take the registry and the
   * normaliser map and know nothing else. If a future row cannot be added without breaking
   * this test, the registry's genericity has regressed and the test says so before the row
   * lands.
   */
  it('the three SERVICES name no family — the third row needed no service edit', () => {
    const services = [
      ['engine', 'consequence', 'ConsequenceExecutionService.ts'],
      ['ui', 'consequence', 'ConfirmationFlow.ts'],
    ];
    for (const rel of services) {
      const src = readFileSync(join(root, ...rel), 'utf8');
      // Verb literals in EXECUTABLE positions. Comments legitimately discuss `wall.move` as
      // the worked example, so only quoted string literals are checked.
      const literals = [...src.matchAll(/['"`](opening\.move|door\.setOffset|window\.setOffset)['"`]/g)];
      expect(literals.map((m) => `${rel.join('/')}: ${m[0]}`)).toEqual([]);
    }
  });

  it('the normaliser REGISTRY holds the new rules — the extension point, not a service branch', () => {
    const src = readFileSync(
      join(root, 'engine', 'consequence', 'ConsequencePreviewService.ts'),
      'utf8',
    );
    // The rules are map ENTRIES. The service class below them must not BRANCH on any of them.
    //
    // Only EXECUTABLE positions are checked. The class's JSDoc legitimately cites
    // `'wall.move'` and `'wall.create'` as worked examples of what the map's keys look like —
    // documentation naming a family is not the same defect as code switching on one, and a
    // test that forbade both would push a future author to delete the explanation rather than
    // the coupling. So comments are stripped first, and what remains must name no family.
    const classBody = src.slice(src.indexOf('export class ConsequencePreviewService'));
    const executable = classBody
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    for (const verb of ['opening.move', 'door.setOffset', 'window.setOffset', 'wall.create', 'wall.move']) {
      expect(executable).not.toContain(verb);
    }
  });
});
