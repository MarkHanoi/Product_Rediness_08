/**
 * §B.4 — the SECOND site of the four-cause `null`, and the control for its removal.
 *
 * ════ WHAT THIS SUITE IS THE CONTROL FOR ═══════════════════════════════════════════════
 * `ConsequencePreviewService.preview()` returned `ConsequencePlan | null`, where the `null`
 * collapsed four structurally different causes (C78 §8.8 / U-INV-2). That was fixed first.
 * The L1 contract header (`packages/command-bus/src/consequence.ts`) named a SECOND site in
 * the same sentence — *"and `planNow`, which re-implements the same collapse"* — and C78 §8.8
 * names it again, by hand: *"`null` from `planNow()` (the same 4, re-implemented)"*.
 *
 * `ConfirmationFlow.planNow()` was that site. Its `null` reached the user as ONE sentence,
 * unconditionally: *"No consequence planner answers for '<type>'"* — the N4 claim, printed
 * for all of:
 *
 *   N1  no verb normaliser recognises the type   (no planner FAMILY exists — N4's OPPOSITE)
 *   N2/N3 the payload is malformed               (a fact about the CALLER, not about PRYZM)
 *   N4  the family exists, nothing is composed   (the only case the sentence described)
 *   N5  the planner threw                        (did not even reach the sentence — it
 *                                                 propagated as a rejected promise)
 *
 * ⚠ WHY THESE ASSERTIONS ARE ONLY WRITABLE NOW. The pre-fix behaviour could only be asserted
 * as *"`request()` came back refused"*, which every one of the five causes satisfied. A
 * control that cannot distinguish the cases it exists to distinguish is not a control. Every
 * `expect` below reads a TYPED field — `refusal.reason`, `refusal.subReason`,
 * `liveVerification.reason` — and the load-bearing ones are the DISCRIMINATION assertions
 * (`toBe`-different) rather than the per-case ones: a wiring that re-collapsed the causes
 * behind correct-looking types would pass the per-case assertions for whichever single value
 * it always returned, and fail these.
 *
 * DOM-free by construction, exactly like its subject: every collaborator is a double on the
 * INPUT side, and the REAL `ConfirmationFlow` is the object under test.
 *
 * @file apps/editor/src/ui/consequence/ConfirmationFlowTypedRefusal.test.ts
 *   Deliberately NOT in `apps/editor/__tests__/` — the root `tsconfig.json` `include` covers
 *   `apps/editor/src/{ui,engine,rendering,types}` and NOT the app-root `__tests__/` tree, so a
 *   suite there is executed by vitest and typechecked by nothing. Here it is both: collected
 *   by `apps/editor/vitest.config.ts`'s `src/**\/*.test.ts` pattern AND seen by tsc.
 */

import { describe, expect, it } from 'vitest';
import type {
  ConsequencePlan,
  ConsequencePlanner,
  PlanningContext,
} from '@pryzm/command-bus';
import type {
  NormalizerRule,
  PreviewCommand,
} from '@app/engine/consequence/ConsequencePreviewService';
import { ConfirmationFlow, type ConfirmationFlowDeps } from './ConfirmationFlow.js';

// ─── Doubles, all on the INPUT side ────────────────────────────────────────────────────

/**
 * A plan whose policy comes out `required` (it refuses something), so `request()` takes the
 * card path and `confirm()` has something real to bind — the shape a user actually approves.
 */
function planWithHash(planHash: string, stateHash: string): ConsequencePlan {
  return {
    planId: `plan-${planHash}`,
    planHash,
    stateHash,
    command: { type: 'wall.move', payload: { id: 'w1' } },
    direct: { kind: 'determined', elements: ['w1'] },
    indirect: { kind: 'determined', elements: [] },
    changed: ['w1'],
    excluded: [],
    topology: { added: [], removed: [], modified: [] },
    validation: { violationsCreated: [], violationsResolved: [] },
    regeneration: { required: [], skipped: [] },
    refused: [{ elementId: 'd1', reason: 'opening 1200 mm needs 1200 mm but only 400 mm remains' }],
    undetermined: [],
  };
}

/** `wall.move` normalises; nothing else does. A payload with no `id` is rejected — the N2/N3 arm. */
const WALL_MOVE_RULE: NormalizerRule = (command: PreviewCommand) => {
  const p = command.payload as { id?: unknown } | null | undefined;
  if (!p || typeof p !== 'object' || typeof p.id !== 'string') return null;
  return { type: 'wall.move', payload: p };
};

const REGISTRY: ReadonlyMap<string, NormalizerRule> = new Map([['wall.move', WALL_MOVE_RULE]]);

const CONTEXT = (): PlanningContext => ({ getStore: () => undefined });

const EXECUTOR: ConfirmationFlowDeps['executor'] = {
  execute: async () => ({ consequence: { kind: 'unplanned' } }) as never,
};

function flowWith(
  planners: ReadonlyMap<string, ConsequencePlanner<never>>,
  prompt?: ConfirmationFlowDeps['prompt'],
): ConfirmationFlow {
  return new ConfirmationFlow({
    planners,
    normalizers: REGISTRY,
    context: CONTEXT,
    executor: EXECUTOR,
    ...(prompt !== undefined ? { prompt } : {}),
  });
}

/** A planner registry holding one `wall.move` planner that answers with `plan`. */
function plannerAnswering(plan: ConsequencePlan): ReadonlyMap<string, ConsequencePlanner<never>> {
  return new Map([['wall.move', { plan: async () => plan }]]) as ReadonlyMap<
    string,
    ConsequencePlanner<never>
  >;
}

/** The `refused` arm's payload, narrowed. Throws (never silently passes) if the arm is wrong. */
async function refusalFrom(
  flow: ConfirmationFlow,
  command: PreviewCommand,
): Promise<{ kind: string; reason: string; subReason?: string; detail: string; message: string }> {
  const req = await flow.request(command);
  if (req.kind !== 'refused') {
    throw new Error(`expected the 'refused' arm for '${command.type}', got '${req.kind}'`);
  }
  return req.refusal;
}

const GOOD: PreviewCommand = { type: 'wall.move', payload: { id: 'w1' } };

// ─── 1. request() — the four causes are four VALUES ────────────────────────────────────

describe('§B.4 — ConfirmationFlow.request() carries the CAUSE it measured (C78 §8.4)', () => {
  it('N1 — an unrecognised verb is UNSUPPORTED_ELEMENT_TYPE / no-normalizer-for-verb', async () => {
    const refusal = await refusalFrom(flowWith(plannerAnswering(planWithHash('h1', 's1'))), {
      type: 'roof.move',
      payload: { id: 'r1' },
    });

    expect(refusal.kind).toBe('NO_PLAN_AVAILABLE');
    expect(refusal.reason).toBe('UNSUPPORTED_ELEMENT_TYPE');
    expect(refusal.subReason).toBe('no-normalizer-for-verb');
    // The typed fact reaches the DISPLAYED sentence, not only the object — the card renders
    // `message`, and a refusal whose reason never leaves the type is a reason nobody reads.
    expect(refusal.message).toContain('UNSUPPORTED_ELEMENT_TYPE');
    expect(refusal.message).toContain('no-normalizer-for-verb');
    // And it denies the reading the old blanket sentence invited.
    expect(refusal.message).toContain('NOT a claim that the operation would change nothing');
  });

  it('N2/N3 — a KNOWN verb with a malformed payload is INVALID_REQUEST (the CALLER, not PRYZM)', async () => {
    const refusal = await refusalFrom(flowWith(plannerAnswering(planWithHash('h1', 's1'))), {
      type: 'wall.move',
      payload: {},
    });

    expect(refusal.reason).toBe('INVALID_REQUEST');
    // INVALID_REQUEST is the one cause that is not a statement about the system's capability,
    // so it must NOT carry a capability sub-reason.
    expect(refusal.subReason).toBeUndefined();
    expect(refusal.detail).toContain('malformed');
  });

  it('N4 — a recognised verb with NO composed planner is ENGINE_NOT_AVAILABLE / no-planner-registered', async () => {
    const noPlanners = new Map<string, ConsequencePlanner<never>>();
    const refusal = await refusalFrom(flowWith(noPlanners), GOOD);

    expect(refusal.reason).toBe('ENGINE_NOT_AVAILABLE');
    expect(refusal.subReason).toBe('no-planner-registered');
    expect(refusal.message).toContain('ENGINE_NOT_AVAILABLE');
  });

  it('N5 — a planner that THROWS is reported as PLANNER_THREW, and request() RESOLVES', async () => {
    const throwing = new Map([
      ['wall.move', { plan: async () => { throw new Error('joined-wall scan exploded'); } }],
    ]) as ReadonlyMap<string, ConsequencePlanner<never>>;

    // The behaviour half: this used to REJECT. The composition site calls
    // `void flow.confirm(...)` from the card's click handler, so a rejection here became an
    // unhandled rejection and the card simply stopped responding.
    const refusal = await refusalFrom(flowWith(throwing), GOOD);

    expect(refusal.reason).toBe('PLANNER_THREW');
    // The thrown message survives into the detail — a caught throw that loses what was thrown
    // is a disappearance with extra steps.
    expect(refusal.detail).toContain('joined-wall scan exploded');
  });

  /**
   * ⭐ THE LOAD-BEARING ASSERTION. N1 and N4 are semantic OPPOSITES — "no such family exists"
   * versus "the family exists and nothing is composed to answer it" — and for the whole life
   * of the bare `null` they were the same value. Nothing else in this file would fail if a
   * rewiring re-collapsed the causes behind a correct-looking `PreviewOutcome`: the per-case
   * tests above would each pass for whichever single value it always produced. This one
   * cannot.
   */
  it('DISCRIMINATION — all four causes are DIFFERENT values, N1 and N4 above all', async () => {
    const withPlanner = flowWith(plannerAnswering(planWithHash('h1', 's1')));
    const withoutPlanner = flowWith(new Map<string, ConsequencePlanner<never>>());
    const throwing = flowWith(
      new Map([['wall.move', { plan: async () => { throw new Error('boom'); } }]]) as ReadonlyMap<
        string,
        ConsequencePlanner<never>
      >,
    );

    const n1 = await refusalFrom(withPlanner, { type: 'roof.move', payload: { id: 'r1' } });
    const n23 = await refusalFrom(withPlanner, { type: 'wall.move', payload: {} });
    const n4 = await refusalFrom(withoutPlanner, GOOD);
    const n5 = await refusalFrom(throwing, GOOD);

    const reasons = [n1.reason, n23.reason, n4.reason, n5.reason];
    expect(new Set(reasons).size).toBe(4);
    // Named explicitly, because "four distinct values" would also be satisfied by four WRONG
    // ones: the pair that matters is the pair that used to be identical.
    expect(n1.reason).not.toBe(n4.reason);
    expect(n1.subReason).not.toBe(n4.subReason);
  });

  it('CONTROL — a well-formed command with a composed planner still PLANS (no blanket refusal)', async () => {
    const req = await flowWith(plannerAnswering(planWithHash('h1', 's1'))).request(GOOD);

    // Proves the four refusals above are decisions, not a flow that refuses everything.
    expect(req.kind).toBe('pending');
    expect(req.kind === 'pending' ? req.plan.planHash : null).toBe('h1');
  });
});

// ─── 2. confirm() — the hash sentinel is gone (C78 §9.3) ───────────────────────────────

describe('§B.4 / C78 §9.3 — an unverifiable re-plan is TYPED, never a hash-shaped sentence', () => {
  /**
   * A planner that answers once (so a plan can be shown and approved) and then THROWS (so the
   * confirm-time re-plan cannot be produced at all). This is the branch that used to mint
   * `'UNPLANNABLE'` into `livePlanHash` / `liveStateHash` — and since every consumer decides
   * staleness by comparing those two fields, a CAPABILITY GAP was reported to the user as
   * "the model moved under your plan": a statement about the world that was never measured.
   */
  function plannerThatDiesAfterFirstCall(
    plan: ConsequencePlan,
  ): ReadonlyMap<string, ConsequencePlanner<never>> {
    let calls = 0;
    return new Map([
      [
        'wall.move',
        {
          plan: async () => {
            calls += 1;
            if (calls > 1) throw new Error('the store view vanished');
            return plan;
          },
        },
      ],
    ]) as ReadonlyMap<string, ConsequencePlanner<never>>;
  }

  it('carries liveVerification.unverifiable with the reason — and NO sentinel in the hash fields', async () => {
    const shown = planWithHash('h-approved', 's-approved');
    const shownMessages: string[] = [];
    const flow = flowWith(plannerThatDiesAfterFirstCall(shown), {
      show: () => {},
      showRefusal: (message: string) => { shownMessages.push(message); },
      hide: () => {},
    });

    const req = await flow.request(GOOD);
    expect(req.kind).toBe('pending');

    const outcome = await flow.confirm('h-approved');
    expect(outcome.kind).toBe('approval-stale');
    if (outcome.kind !== 'approval-stale') return;
    const r = outcome.refusal;

    // The typed statement that the live hashes are NOT re-computations.
    expect(r.liveVerification.kind).toBe('unverifiable');
    expect(r.liveVerification.kind === 'unverifiable' ? r.liveVerification.reason : null).toBe(
      'PLANNER_THREW',
    );

    // ⭐ The sentinel is gone. Not "renamed" — the fields hold the APPROVED hashes, which is
    // the only honest thing available when no live re-computation happened.
    expect(r.livePlanHash).not.toBe('UNPLANNABLE');
    expect(r.liveStateHash).not.toBe('UNPLANNABLE');
    expect(r.livePlanHash).toBe('h-approved');
    expect(r.liveStateHash).toBe('s-approved');

    // And the sentence the user reads must not assert staleness it did not measure.
    expect(shownMessages).toHaveLength(1);
    expect(shownMessages[0]).toContain('PLANNER_THREW');
    expect(shownMessages[0]).toContain('NOT a claim that the model changed');
    expect(shownMessages[0]).not.toContain('The model changed while this was on screen');
  });

  it('CONTROL — a re-plan that SUCCEEDS and differs is still verified staleness', async () => {
    let calls = 0;
    const planners = new Map([
      [
        'wall.move',
        {
          plan: async () => {
            calls += 1;
            return calls > 1 ? planWithHash('h-moved', 's-moved') : planWithHash('h-shown', 's-shown');
          },
        },
      ],
    ]) as ReadonlyMap<string, ConsequencePlanner<never>>;
    const flow = flowWith(planners);

    await flow.request(GOOD);
    const outcome = await flow.confirm('h-shown');

    expect(outcome.kind).toBe('approval-stale');
    if (outcome.kind !== 'approval-stale') return;
    // Proves the arm above is a DECISION: the same code path reports `verified` when the
    // hashes really were re-computed, so `unverifiable` is not what this branch always says.
    expect(outcome.refusal.liveVerification.kind).toBe('verified');
    expect(outcome.refusal.livePlanHash).toBe('h-moved');
    expect(outcome.refusal.message).toContain('The model changed while this was on screen');
  });
});
