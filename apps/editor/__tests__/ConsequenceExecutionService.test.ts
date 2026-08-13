/**
 * BIM30 R4 — EXECUTION CONSUMES THE PLAN, as an EXECUTED test.
 *
 * The certification gate (`check-execution-plan-agreement`, G-REASON-03) drives this
 * same service over the REAL bus, the REAL wall handler and the REAL WallStore. This
 * suite is the fast, hermetic complement: it pins the SHAPES the gate asserts, so a
 * refactor that changes an arm breaks here in seconds rather than in a certification
 * run — and it pins the two clauses C78 names by number.
 *
 * WHAT IS REAL HERE AND WHAT IS A DOUBLE, stated rather than implied:
 *   • REAL — `ConsequenceExecutionService` itself, in full: the binding check, the
 *     independent read-back, the reconciliation, and the verdict.
 *   • DOUBLE — the bus (records the dispatch and mutates the fake store, which is
 *     what makes read-back observable) and the planner (a deterministic stub, so the
 *     plan under test is exactly the plan the assertions describe).
 *
 * The doubles are on the INPUT side only. Nothing that decides an outcome is faked:
 * every assertion below reads a value the service computed.
 */

import { describe, expect, it } from 'vitest';
import type { ConsequencePlan, PlanningContext } from '@pryzm/command-bus';
import { ConsequenceExecutionService } from '../src/engine/consequence/ConsequenceExecutionService';

// ─── A minimal world: one mutable store, one bus that writes to it ─────────────

type Wall = { id: string; baseLine: [{ x: number; z: number }, { x: number; z: number }] };

function makeWorld() {
  const walls = new Map<string, Wall>();
  walls.set('w1', { id: 'w1', baseLine: [{ x: 0, z: 0 }, { x: 5, z: 0 }] });

  const context = (): PlanningContext => ({
    getStore: (id: string) =>
      id === 'wall'
        ? {
            getAll: () => [...walls.values()],
            getById: (wid: string) => walls.get(wid) ?? null,
          }
        : undefined,
  }) as unknown as PlanningContext;

  const dispatched: Array<{ type: string; plan?: ConsequencePlan }> = [];
  const bus = {
    // The double MUTATES: a read-back that never observes a change would pass
    // vacuously, and a vacuous pass is exactly what this suite must not produce.
    executeCommand: async (type: string, payload: unknown, opts?: { plan?: ConsequencePlan }) => {
      dispatched.push({ type, ...(opts?.plan ? { plan: opts.plan } : {}) });
      const p = payload as { wallId?: string; newBaseLine?: Wall['baseLine'] };
      if (p?.wallId && p.newBaseLine) {
        const w = walls.get(p.wallId);
        if (w) walls.set(p.wallId, { ...w, baseLine: p.newBaseLine });
      }
      return { id: 'evt-1', type, payload } as never;
    },
  };

  return { walls, context, bus, dispatched };
}

/**
 * FNV-1a, hex — the SAME shape the production planner's `stableStringify`-fed hash
 * has. The stub must produce a real hash and not, say, raw JSON: the §9.3 assertion
 * below is "this field contains a hash and not a sentence", and a double that emitted
 * a non-hash would fail that assertion for a reason that has nothing to do with the
 * code under test.
 */
function hashHex(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** A deterministic planner: the SAME state always yields the SAME plan+hash. */
function makePlanner(changed: string[], hashOf: (w: Wall | undefined) => string) {
  return {
    plan: async (_cmd: unknown, ctx: PlanningContext): Promise<ConsequencePlan> => {
      const wall = (ctx.getStore('wall')?.getById('w1') ?? undefined) as Wall | undefined;
      const h = hashOf(wall);
      return {
        planId: 'plan-1',
        planHash: h,
        stateHash: h,
        changed,
        undetermined: [
          {
            scope: 'regeneration of dependent elements',
            reason: 'NO_DEPENDENCY_INDEX',
            detail: 'the dependency substrate is not landed (roadmap Phase 5)',
          },
        ],
        refusals: [],
      } as unknown as ConsequencePlan;
    },
  };
}

const MOVE = {
  type: 'wall.updateBaseline',
  payload: { wallId: 'w1', newBaseLine: [{ x: 0, z: 1 }, { x: 5, z: 1 }] },
};

// ─── The loop: preview → execute → reconcile ───────────────────────────────────

describe('R4 — execution consumes the plan it previewed (C78 §10.1)', () => {
  it('binds the previewed plan, mutates, and reconciles predicted vs actual', async () => {
    const { context, bus, dispatched, walls } = makeWorld();
    // Hash covers the wall's own baseline — so it is stable across the PLAN and the
    // re-plan at execute time, and moves only when the wall does (clause 2 below).
    const planner = makePlanner(['w1'], (w) => hashHex(JSON.stringify(w?.baseLine ?? null)));
    const service = new ConsequenceExecutionService({
      bus: bus as never,
      planners: new Map([['wall.move', planner]]) as never,
      context,
      violations: () => [],
    });

    // PREVIEW — the plan is minted from the SAME planner execution will re-run.
    const plan = await planner.plan(MOVE, context());

    const before = JSON.stringify(walls.get('w1')!.baseLine);
    const { consequence } = await service.execute(MOVE as never, { plan });

    // The plan RODE the dispatch — this is what "execution consumes the plan"
    // means concretely: the bus saw the plan, not a re-derivation.
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]!.plan?.planHash).toBe(plan.planHash);

    // The mutation actually happened (no vacuous pass).
    expect(JSON.stringify(walls.get('w1')!.baseLine)).not.toBe(before);

    expect(consequence.kind).toBe('reconciled');
    if (consequence.kind !== 'reconciled') return;
    const r = consequence.report;

    // RECONCILIATION (C78 §11.1) — predicted vs actual, from an INDEPENDENT read-back.
    expect(r.actual.changed).toContain('w1');
    expect(r.predictedVsActual.unexpected).toEqual([]);
    expect(r.predictedVsActual.missing).toEqual([]);
    expect(r.divergence.kind).toBe('plan-agreed');

    // Every plan-time UNDETERMINED item is CARRIED, never scored and never dropped.
    expect(r.undeterminedOutcomes).toHaveLength(plan.undetermined.length);
    expect(r.undeterminedOutcomes[0]!.outcome).toBe('undetermined-at-plan-time');
  });

  it('reports divergence rather than absorbing it (C78 §11.2)', async () => {
    const { context, bus } = makeWorld();
    // The plan predicts a SECOND element will change. Nothing will touch it, so the
    // reconciliation must name it MISSING — the plan-fidelity failure class.
    const planner = makePlanner(['w1', 'ghost'], (w) => hashHex(JSON.stringify(w?.baseLine ?? null)));
    const service = new ConsequenceExecutionService({
      bus: bus as never,
      planners: new Map([['wall.move', planner]]) as never,
      context,
      violations: () => [],
    });

    const plan = await planner.plan(MOVE, context());
    const { consequence } = await service.execute(MOVE as never, { plan });

    expect(consequence.kind).toBe('reconciled');
    if (consequence.kind !== 'reconciled') return;
    const d = consequence.report.divergence;
    expect(d.kind).toBe('plan-fidelity-divergence');
    if (d.kind !== 'plan-fidelity-divergence') return;
    expect(d.missing).toContain('ghost');
  });
});

// ─── The typed-outcome half (C78 §10.2) ────────────────────────────────────────

describe('R4 — an unplanned execution is TYPED, never a degraded silent success (C78 §10.2)', () => {
  it('executing with no plan yields the typed absence, plus a real read-back', async () => {
    const { context, bus, walls } = makeWorld();
    const service = new ConsequenceExecutionService({
      bus: bus as never,
      planners: new Map() as never,
      context,
      violations: () => [],
    });

    const before = JSON.stringify(walls.get('w1')!.baseLine);
    const { consequence } = await service.execute(MOVE as never);

    // The command STILL RAN — a typed outcome is not a refusal.
    expect(JSON.stringify(walls.get('w1')!.baseLine)).not.toBe(before);

    expect(consequence.kind).toBe('unplanned');
    if (consequence.kind !== 'unplanned') return;
    // The prediction side says ABSENT, with the reason — never a prediction
    // reverse-engineered from what happened to change.
    expect(consequence.prediction.kind).toBe('absent');
    expect(consequence.prediction.reason).toBe('NO_PLAN_SUPPLIED');
    // Reality is still reported independently.
    expect(consequence.actual.changed).toContain('w1');
  });

  it('a stale plan is refused as typed PLAN_STALE and carried as evidence, not prediction', async () => {
    const { context, bus, walls } = makeWorld();
    const planner = makePlanner(['w1'], (w) => hashHex(JSON.stringify(w?.baseLine ?? null)));
    const service = new ConsequenceExecutionService({
      bus: bus as never,
      planners: new Map([['wall.move', planner]]) as never,
      context,
      violations: () => [],
    });

    const plan = await planner.plan(MOVE, context());
    // The model moves under the plan, in a way the planner CAN see.
    walls.set('w1', { id: 'w1', baseLine: [{ x: 9, z: 9 }, { x: 9, z: 9 }] });

    const { consequence } = await service.execute(MOVE as never, { plan });

    expect(consequence.kind).toBe('plan-stale');
    if (consequence.kind !== 'plan-stale') return;
    expect(consequence.refusal.kind).toBe('PLAN_STALE');
    // The stale plan is EVIDENCE — present, identified, and not claimed as the
    // prediction (there is no `report` on this arm at all, by construction).
    expect(consequence.refusal.stalePlan.planId).toBe(plan.planId);
    expect(consequence.refusal.plannedPlanHash).not.toBe(consequence.refusal.livePlanHash);
    // The live hashes here ARE real re-computations, and say so.
    expect(consequence.refusal.liveVerification?.kind).toBe('verified');
  });

  it('an UNVERIFIABLE binding names its reason in a typed field, never in a hash (C78 §9.3)', async () => {
    const { context, bus } = makeWorld();
    const planner = makePlanner(['w1'], (w) => hashHex(JSON.stringify(w?.baseLine ?? null)));
    const plan = await planner.plan(MOVE, context());

    // No planner composed ⇒ no live re-plan is possible ⇒ the binding cannot be
    // VERIFIED. That is a capability gap, and it must not be reported as staleness.
    const service = new ConsequenceExecutionService({
      bus: bus as never,
      planners: new Map() as never,
      context,
      violations: () => [],
    });

    const { consequence } = await service.execute(MOVE as never, { plan });

    expect(consequence.kind).toBe('plan-stale');
    if (consequence.kind !== 'plan-stale') return;
    const v = consequence.refusal.liveVerification;
    expect(v?.kind).toBe('unverifiable');
    if (v?.kind !== 'unverifiable') return;
    expect(v.reason).toBe('ENGINE_NOT_AVAILABLE');
    expect(v.subReason).toBe('no-planner-registered');

    // THE §9.3 RULE ITSELF: neither hash field carries a reason. Asserted
    // structurally (a hash is hex) rather than against the retired sentinel
    // spellings, which a rename would slip straight past.
    expect(consequence.refusal.livePlanHash).toMatch(/^[0-9a-f]+$/);
    expect(consequence.refusal.liveStateHash).toMatch(/^[0-9a-f]+$/);
  });
});

// ─── R5 — THE CONSEQUENCE REPORT ──────────────────────────────────────────────
//
// R5's exit condition is "completeness per the declared contract". Completeness is
// NOT "every field is populated" — a report that invented a value for a channel it
// could not measure would be worse than one that left it out. It is the C78 §1.4
// rule applied field by field: for every question the plan ASKED, the report answers
// with EITHER a measured value OR a typed UNDETERMINED, and the two are never the
// same value.
//
// The defect these tests pin was live in production until R5. `ConsequenceReport`
// declared `metrics` and `metricsUndetermined`; `ConsequenceReportView` rendered
// both; the executor set NEITHER. A real `wall.move` report came back with both
// `undefined`, which per the field's own contract asserts "this runtime has no
// metric read-back channel" — by SILENCE, which C78 §8.8 forbids in terms. The
// certification gate did not see it, because its metric clause drove the RENDERER
// over a hand-written literal that supplied `metrics` itself: it proved the renderer
// can draw a metric, never that the producer emits one.

/** A planner that PREDICTS a metric transition — so the report is obliged to answer. */
function makeMetricPlanner(hashOf: (w: Wall | undefined) => string) {
  return {
    plan: async (_cmd: unknown, ctx: PlanningContext): Promise<ConsequencePlan> => {
      const wall = (ctx.getStore('wall')?.getById('w1') ?? undefined) as Wall | undefined;
      const h = hashOf(wall);
      return {
        planId: 'plan-m', planHash: h, stateHash: h,
        changed: ['w1'],
        // THE QUESTION. A plan carrying this has asserted "room-k's area moves from
        // 12.4 to 10.8 m²"; the report owes an answer about whether it did.
        metrics: [{ elementId: 'room-k', metric: 'area', before: 12.4, after: 10.8, unit: 'm2' }],
        undetermined: [{
          scope: 'regeneration of dependent elements',
          reason: 'NO_DEPENDENCY_INDEX',
          detail: 'the dependency substrate is not landed (roadmap Phase 5)',
        }],
        refusals: [],
      } as unknown as ConsequencePlan;
    },
  };
}

describe('R5 — the report is COMPLETE: every question the plan asked gets an answer', () => {
  it('a real wall.move report carries predicted, actual and undetermined together', async () => {
    const { context, bus, walls } = makeWorld();
    const planner = makeMetricPlanner((w) => hashHex(JSON.stringify(w?.baseLine ?? null)));
    const service = new ConsequenceExecutionService({
      bus: bus as never,
      planners: new Map([['wall.move', planner]]) as never,
      context,
      violations: () => [],
      // A metric reader IS composed here: the runtime CAN answer, so the report must
      // carry the measured value — 10.9, deliberately NOT the predicted 10.8, so a
      // report that copied the plan's number instead of measuring fails this test.
      readMetrics: (predicted) => predicted.map((m) => ({ ...m, after: 10.9 })),
    });

    const plan = await planner.plan(MOVE, context());
    const before = JSON.stringify(walls.get('w1')!.baseLine);
    const { consequence } = await service.execute(MOVE as never, { plan });

    // No vacuous pass: the mutation happened.
    expect(JSON.stringify(walls.get('w1')!.baseLine)).not.toBe(before);
    expect(consequence.kind).toBe('reconciled');
    if (consequence.kind !== 'reconciled') return;
    const r = consequence.report;

    // ── PREDICTED — carried whole, never re-inferred (R5's "never a second pass") ──
    expect(r.plan.planHash).toBe(plan.planHash);
    expect(r.plan.metrics?.[0]).toMatchObject({ elementId: 'room-k', after: 10.8 });

    // ── ACTUAL — from the INDEPENDENT read-back, not from the plan ────────────────
    expect(r.actual.changed).toContain('w1');
    expect(r.metrics?.[0]?.after).toBe(10.9);
    // The measured value DIFFERS from the predicted one, which is the whole point of
    // measuring: if these were equal the test could not tell a read-back from a copy.
    expect(r.metrics?.[0]?.after).not.toBe(r.plan.metrics?.[0]?.after);
    // Answered, so NOT also claimed unmeasurable. Both present would be a channel
    // asserting it measured AND did not measure.
    expect(r.metricsUndetermined).toBeUndefined();

    // ── UNDETERMINED — carried, with its typed reason, never scored ───────────────
    expect(r.undeterminedOutcomes).toHaveLength(plan.undetermined.length);
    expect(r.undeterminedOutcomes![0]!.item.reason).toBe('NO_DEPENDENCY_INDEX');
    expect(r.undeterminedOutcomes![0]!.outcome).toBe('undetermined-at-plan-time');

    // ── DIVERGENCE — named, and here there is none to name ───────────────────────
    expect(r.divergence!.kind).toBe('plan-agreed');

    // ── THE COMPLETENESS RULE, stated as one assertion over the whole report ─────
    // Every plan item appears with an outcome; nothing the plan asked is unanswered.
    for (const item of r.plan.undetermined) {
      expect(r.undeterminedOutcomes!.some((o) => o.item.scope === item.scope)).toBe(true);
    }
  });

  it('an UNDETERMINED metric channel SURVIVES into the report instead of being dropped', async () => {
    const { context, bus } = makeWorld();
    const planner = makeMetricPlanner((w) => hashHex(JSON.stringify(w?.baseLine ?? null)));
    // NO `readMetrics` composed — the exact production shape that produced the
    // silently-absent report this test exists to forbid.
    const service = new ConsequenceExecutionService({
      bus: bus as never,
      planners: new Map([['wall.move', planner]]) as never,
      context,
      violations: () => [],
    });

    const plan = await planner.plan(MOVE, context());
    const { consequence } = await service.execute(MOVE as never, { plan });
    expect(consequence.kind).toBe('reconciled');
    if (consequence.kind !== 'reconciled') return;
    const r = consequence.report;

    // THE ASSERTION THAT WOULD HAVE FAILED BEFORE R5: the blind spot is NAMED.
    expect(r.metricsUndetermined).toBeDefined();
    expect(r.metricsUndetermined!.reason).toBe('ENGINE_NOT_AVAILABLE');
    // C78 §8.9 — an undetermined item names WHAT was not determined, not just a count.
    expect(r.metricsUndetermined!.scope).toContain('metric');

    // AND — the half that matters most — the unmeasured channel is NOT reported as
    // an empty list. `[]` is the DETERMINED claim "the read-back looked and no metric
    // moved"; emitting it here would be the known+unknown=[] defect wearing a number
    // (C78 §1.4), and it would read to a user as "nothing changed".
    expect(r.metrics).toBeUndefined();

    // The plan's own prediction is still carried beside the blind spot, so the user
    // can see WHAT was predicted and that it went unverified — not one or the other.
    expect(r.plan.metrics?.[0]?.after).toBe(10.8);

    // The report is otherwise complete: an unmeasurable channel does not degrade the
    // rest of the answer into silence.
    expect(r.actual.changed).toContain('w1');
    expect(r.undeterminedOutcomes).toHaveLength(plan.undetermined.length);
    expect(r.divergence!.kind).toBe('plan-agreed');
  });

  it('a metric reader that THROWS becomes a typed undetermined, never a swallowed error', async () => {
    const { context, bus } = makeWorld();
    const planner = makeMetricPlanner((w) => hashHex(JSON.stringify(w?.baseLine ?? null)));
    const service = new ConsequenceExecutionService({
      bus: bus as never,
      planners: new Map([['wall.move', planner]]) as never,
      context,
      violations: () => [],
      readMetrics: () => { throw new Error('area index offline'); },
    });

    const plan = await planner.plan(MOVE, context());
    const { consequence } = await service.execute(MOVE as never, { plan });
    expect(consequence.kind).toBe('reconciled');
    if (consequence.kind !== 'reconciled') return;
    const r = consequence.report;

    // A caught exception is UNDETERMINED, never determined-unaffected (C78 §1.4) —
    // and the producer's own message survives so the cause is diagnosable.
    expect(r.metricsUndetermined!.reason).toBe('ENGINE_NOT_AVAILABLE');
    expect(r.metricsUndetermined!.detail).toContain('area index offline');
    expect(r.metrics).toBeUndefined();
  });

  it('a plan that asked NO metric question leaves both fields absent — silence with nothing to say', async () => {
    const { context, bus } = makeWorld();
    // The ordinary planner: no `metrics` on the plan, so nothing was asked.
    const planner = makePlanner(['w1'], (w) => hashHex(JSON.stringify(w?.baseLine ?? null)));
    const service = new ConsequenceExecutionService({
      bus: bus as never,
      planners: new Map([['wall.move', planner]]) as never,
      context,
      violations: () => [],
    });

    const plan = await planner.plan(MOVE, context());
    const { consequence } = await service.execute(MOVE as never, { plan });
    expect(consequence.kind).toBe('reconciled');
    if (consequence.kind !== 'reconciled') return;
    const r = consequence.report;

    // BOTH absent is correct HERE and only here: absence is honest precisely because
    // `plan.metrics` is empty alongside it, so a reader can tell "no question was
    // asked" from "a question went unanswered" without guessing. This test exists so
    // a future fix that emits `metricsUndetermined` unconditionally — turning "there
    // was nothing to measure" into a reported blind spot — fails loudly.
    expect(r.metrics).toBeUndefined();
    expect(r.metricsUndetermined).toBeUndefined();
    expect((r.plan.metrics ?? []).length).toBe(0);
  });
});
