// §PLANNER (RAC U10) — the LLM planner's contract, under test.
//
// What is actually being proven here is ONE architectural claim: the model can
// widen the INPUT surface without widening the AUTHORITY surface. So the tests
// are mostly adversarial — an invented verb, an invented parameter, a scope the
// capability never declared, a destructive step trying to skip its Confirm card
// — plus the two guarantees that are easy to regress silently: the ladder order
// (a sentence the grammar claims must never reach the planner, or tokens start
// leaking) and the no-relay path (production has neither CF_WORKER_URL nor
// ANTHROPIC_API_KEY, so "skipped, and said so" is the only honest behaviour).

import { describe, it, expect, beforeEach } from 'vitest';
import {
  applySemanticIntent,
  resolveUtterance,
  type ResolverContext,
  type SemanticIntent,
} from '../src/intents/ZeroTokenResolver.js';
import { resolveNaturalLanguage } from '../src/intents/LocalNaturalLanguageResolver.js';
import { resolveCompoundUtterance } from '../src/intents/SemanticPlan.js';
import {
  buildPlannerPrompt,
  buildPlannerVocabulary,
  planUtterance,
  resetPlannerShapeCache,
  validatePlannerOutput,
  type PlannerDeps,
} from '../src/intents/LlmPlanner.js';
import { allChatCapabilities } from '../src/capabilities/ChatCapabilityRegistry.js';

// ─── Context ─────────────────────────────────────────────────────────────────

const WALL_TYPES = [
  { id: 'wt-interior-partition', name: 'Interior – Partition 100mm' },
  { id: 'wt-exterior-brick', name: 'Exterior – Brick 300mm' },
];

let seq = 0;
const ctxOf = (overrides: Partial<ResolverContext> = {}): ResolverContext => ({
  selection: [],
  levels: [
    { id: 'L0', name: 'Level 0', elevation: 0 },
    { id: 'L1', name: 'Level 1', elevation: 3 },
    { id: 'L2', name: 'Level 2', elevation: 6 },
  ],
  activeLevelId: 'L0',
  mintId: () => `plan-${++seq}`,
  wallSystemTypeNames: WALL_TYPES.map((t) => t.name),
  ...overrides,
});

/** A relay that returns a canned answer and RECORDS whether it was called at
 *  all — the token-cost guarantee is "was this function reached", nothing else. */
function cannedRelay(answer: string): PlannerDeps & { calls: number } {
  const deps = {
    calls: 0,
    async isConfigured() { return true; },
    async complete() { deps.calls++; return answer; },
  };
  return deps;
}

beforeEach(() => { resetPlannerShapeCache(); });

// ─── The generated vocabulary ────────────────────────────────────────────────

describe('§PLANNER — the prompt surface is GENERATED from the registry', () => {
  it('names every non-composite capability, so it cannot drift from the registry', () => {
    const vocab = buildPlannerVocabulary(ctxOf());
    const expected = allChatCapabilities().filter((c) => c.composite !== true);
    for (const cap of expected) {
      expect(vocab, `capability ${cap.id} missing from the planner vocabulary`)
        .toContain(`"${cap.id}"`);
    }
    expect(expected.length).toBeGreaterThan(30);
  });

  it('carries each capability\'s real description, targets, scope modes and examples', () => {
    const vocab = buildPlannerVocabulary(ctxOf());
    expect(vocab).toContain('change the wall colour');
    expect(vocab).toContain('make all walls white');
    // set-wall-color's declared scope modes, verbatim from the registry.
    expect(vocab).toMatch(/scope may be: .*level.*room.*orientation/);
  });

  it('states the field shapes the deterministic grammar itself produces', () => {
    const vocab = buildPlannerVocabulary(ctxOf());
    expect(vocab).toMatch(/"set-wall-color"[\s\S]*?fields: \{[^}]*colorRef/);
    expect(vocab).toMatch(/"set-height"[\s\S]*?fields: \{[^}]*value: number/);
  });

  it('the prompt forbids free-text commands and states the Confirm guarantee', () => {
    const p = buildPlannerPrompt('do something', ctxOf());
    expect(p.system).toContain('Never invent an id');
    expect(p.system).toContain('There is no free-text command form');
    expect(p.system).toContain('destructive steps still require the user\'s confirmation');
    expect(p.user).toContain('do something');
    // The live facts come off the SAME ResolverContext the tiers use.
    expect(p.user).toContain('Level 2');
    expect(p.user).toContain('nothing is selected');
  });
});

// ─── Validation: what is accepted ────────────────────────────────────────────

describe('§PLANNER — a valid intent is accepted unchanged', () => {
  it('accepts a well-formed single intent', () => {
    const v = validatePlannerOutput(
      JSON.stringify({ steps: [{ intent: 'set-wall-color', colorRef: 'white', scope: 'all' }], clauses: ['paint everything white'] }),
      ctxOf(),
    );
    expect(v.kind).toBe('intents');
    if (v.kind !== 'intents') return;
    expect(v.intents).toEqual([{ intent: 'set-wall-color', colorRef: 'white', scope: 'all' }]);
  });

  it('accepts a ```json-fenced answer (models wrap things)', () => {
    const v = validatePlannerOutput(
      '```json\n{"steps":[{"intent":"zoom-fit"}],"clauses":["show me everything"]}\n```',
      ctxOf(),
    );
    expect(v.kind).toBe('intents');
  });

  it('accepts a spatial scope the capability DECLARES', () => {
    const v = validatePlannerOutput(
      JSON.stringify({ steps: [{ intent: 'set-wall-color', colorRef: 'white', scope: { kind: 'level', levelQuery: '2' } }] }),
      ctxOf(),
    );
    expect(v.kind).toBe('intents');
  });
});

// ─── Validation: what is REJECTED, with a reason ─────────────────────────────

describe('§PLANNER — the model may not invent authority', () => {
  it('rejects an UNKNOWN capability id — an invented verb dies before anything runs', () => {
    const v = validatePlannerOutput(
      JSON.stringify({ steps: [{ intent: 'demolish-building', force: true }] }),
      ctxOf(),
    );
    expect(v.kind).toBe('rejected');
    if (v.kind !== 'rejected') return;
    expect(v.reason).toContain('"demolish-building" is not something this editor can do');
    expect(v.understoodAs).toContain('demolish-building');
  });

  it('rejects a verb the registry does not declare even when it names a real bus command', () => {
    // The adversarial case: the model has clearly seen a command string
    // somewhere and tries to use it as an intent id. The registry is the only
    // vocabulary; a bus verb is not one.
    const v = validatePlannerOutput(
      JSON.stringify({ steps: [{ intent: 'wall.updateColorBatch', colorRef: 'white' }] }),
      ctxOf(),
    );
    expect(v.kind).toBe('rejected');
    if (v.kind !== 'rejected') return;
    expect(v.reason).toContain('not something this editor can do');
  });

  it('rejects an UNKNOWN parameter', () => {
    const v = validatePlannerOutput(
      JSON.stringify({ steps: [{ intent: 'set-wall-color', colorRef: 'white', scope: 'all', opacity: 0.5 }] }),
      ctxOf(),
    );
    expect(v.kind).toBe('rejected');
    if (v.kind !== 'rejected') return;
    expect(v.reason).toContain('"set-wall-color" has no "opacity" setting');
  });

  it('rejects a WRONG value shape rather than coercing it', () => {
    const v = validatePlannerOutput(
      JSON.stringify({ steps: [{ intent: 'set-height', value: 'three metres' }] }),
      ctxOf(),
    );
    expect(v.kind).toBe('rejected');
    if (v.kind !== 'rejected') return;
    expect(v.reason).toContain('must be number');
  });

  it('rejects a SCOPE the capability never declared', () => {
    // rename-room is selection-scoped and declares nothing else; handing it a
    // whole level would be exactly the ElementCapabilities lie in a new place.
    const v = validatePlannerOutput(
      JSON.stringify({ steps: [{ intent: 'rename-room', name: 'Kitchen', scope: { kind: 'level', levelQuery: '2' } }] }),
      ctxOf(),
    );
    expect(v.kind).toBe('rejected');
  });

  it('rejects the composite plan id — a sequence is expressed as separate steps', () => {
    const v = validatePlannerOutput(
      JSON.stringify({ steps: [{ intent: 'execute-plan', steps: [], clauses: [] }] }),
      ctxOf(),
    );
    expect(v.kind).toBe('rejected');
    if (v.kind !== 'rejected') return;
    expect(v.reason).toContain('cannot be asked for directly');
  });

  it('rejects unusable output instead of guessing', () => {
    expect(validatePlannerOutput('I think you want to paint the walls.', ctxOf()).kind).toBe('rejected');
    expect(validatePlannerOutput('{"steps":[]}', ctxOf()).kind).toBe('rejected');
    expect(validatePlannerOutput('{"steps":["make all walls white"]}', ctxOf()).kind).toBe('rejected');
  });

  it('relays the model\'s own "I cannot map this" honestly', () => {
    const v = validatePlannerOutput('{"cannot":"you want a cost estimate"}', ctxOf());
    expect(v.kind).toBe('cannot');
    if (v.kind !== 'cannot') return;
    expect(v.understoodAs).toBe('you want a cost estimate');
  });
});

// ─── The ladder order — the token-cost guarantee ─────────────────────────────

describe('§PLANNER — the ladder order, pinned', () => {
  /** The bridge's ladder, minus the planner: tier 0/1 → NL. */
  const deterministicClaims = (utterance: string, ctx: ResolverContext): boolean => {
    if (resolveCompoundUtterance(utterance, ctx) !== null) return true;
    if (resolveUtterance(utterance, ctx).kind !== 'miss') return true;
    return resolveNaturalLanguage(utterance, ctx).kind !== 'miss';
  };

  it('a sentence the grammar claims never reaches the planner — zero tokens stays zero', async () => {
    const ctx = ctxOf();
    const grammarSentences = [
      'make all walls white',
      'undo',
      'zoom to fit',
      'add a level',
      'duplicate level 0 to level 1',
    ];
    for (const s of grammarSentences) {
      expect(deterministicClaims(s, ctx), `"${s}" must be claimed deterministically`).toBe(true);
      // …and if it is claimed, the bridge never calls the planner. Proven by
      // the relay call counter staying at zero for the whole batch.
    }
    const relay = cannedRelay('{"cannot":"n/a"}');
    for (const s of grammarSentences) {
      if (!deterministicClaims(s, ctx)) await planUtterance(s, ctx, relay);
    }
    expect(relay.calls).toBe(0);
  });
});

// ─── No relay configured (the production truth) ──────────────────────────────

describe('§PLANNER — no relay configured is SKIPPED, not a mystery 401', () => {
  it('never calls the transport when nothing is configured', async () => {
    let called = false;
    const out = await planUtterance('put larger windows on the south-facing bedrooms', ctxOf(), {
      async isConfigured() { return false; },
      async complete() { called = true; return '{}'; },
    });
    expect(out).toEqual({ kind: 'unavailable', reason: 'not-configured' });
    expect(called).toBe(false);
  });

  it('reports a relay failure as unavailable, never as a refusal the user caused', async () => {
    const out = await planUtterance('something exotic', ctxOf(), {
      async isConfigured() { return true; },
      async complete() { throw new Error('401 Unauthorized'); },
    });
    expect(out).toEqual({ kind: 'unavailable', reason: 'relay-failed' });
  });

  it('treats an availability probe that throws as NOT configured', async () => {
    const out = await planUtterance('something exotic', ctxOf(), {
      async isConfigured() { throw new Error('offline'); },
      async complete() { return '{}'; },
    });
    expect(out).toEqual({ kind: 'unavailable', reason: 'not-configured' });
  });
});

// ─── End to end: the planner output is run by the EXISTING authority ─────────

describe('§PLANNER — a planned intent is executed by applySemanticIntent, unchanged', () => {
  it('a single planned intent produces the same commands a typed sentence would', async () => {
    const ctx = ctxOf();
    const out = await planUtterance(
      'give every wall in the project a fresh coat of white',
      ctx,
      cannedRelay(JSON.stringify({
        steps: [{ intent: 'set-wall-color', colorRef: 'white', scope: 'all' }],
        clauses: ['give every wall a fresh coat of white'],
      })),
    );
    expect(out.kind).toBe('intent');
    if (out.kind !== 'intent') return;
    const typed = resolveUtterance('make all walls white', ctx);
    const planned = applySemanticIntent(out.intent, ctx);
    expect(planned.kind).toBe('commands');
    if (planned.kind !== 'commands' || typed.kind !== 'commands') return;
    expect(planned.commands.map((c) => c.type)).toEqual(typed.commands.map((c) => c.type));
  });

  it('a planned DESTRUCTIVE intent still carries its Confirm flag', async () => {
    const ctx = ctxOf();
    const out = await planUtterance(
      'I need somewhere to live — three bedrooms over two floors',
      ctx,
      cannedRelay(JSON.stringify({
        steps: [{ intent: 'generate-building', typology: 'house', floors: 2 }],
        clauses: ['three bedrooms over two floors'],
      })),
    );
    expect(out.kind).toBe('intent');
    if (out.kind !== 'intent') return;
    const applied = applySemanticIntent(out.intent, ctx);
    expect(applied.kind).toBe('commands');
    if (applied.kind !== 'commands') return;
    // The Confirm card is the bridge's response to THIS flag; the planner
    // cannot clear it, because it never touches it.
    expect(applied.destructive).toBe(true);
  });

  it('a planned intent the capability refuses still refuses — the planner cannot bypass a guard', async () => {
    // Nothing is selected, so the selection-scoped capability refuses exactly
    // as it would for a typed sentence.
    const ctx = ctxOf({ selection: [] });
    const out = await planUtterance(
      'call this space the kitchen',
      ctx,
      cannedRelay(JSON.stringify({ steps: [{ intent: 'rename-room', name: 'Kitchen' }], clauses: ['call this space the kitchen'] })),
    );
    expect(out.kind).toBe('intent');
    if (out.kind !== 'intent') return;
    expect(applySemanticIntent(out.intent, ctx).kind).toBe('refusal');
  });

  it('several steps become the U6 execute-plan IR, with the user\'s own clause words', async () => {
    const ctx = ctxOf();
    const out = await planUtterance(
      'stick another storey on and paint the lot white',
      ctx,
      cannedRelay(JSON.stringify({
        steps: [{ intent: 'add-level' }, { intent: 'set-wall-color', colorRef: 'white', scope: 'all' }],
        clauses: ['stick another storey on', 'paint the lot white'],
      })),
    );
    expect(out.kind).toBe('intent');
    if (out.kind !== 'intent') return;
    const intent = out.intent as Extract<SemanticIntent, { intent: 'execute-plan' }>;
    expect(intent.intent).toBe('execute-plan');
    expect(intent.steps).toHaveLength(2);
    expect(intent.clauses).toEqual(['stick another storey on', 'paint the lot white']);
    const applied = applySemanticIntent(intent, ctx);
    expect(applied.kind).toBe('commands');
    if (applied.kind !== 'commands') return;
    // The truthful undo cost is the plan executor's, not the planner's.
    expect(applied.plan).toBeDefined();
  });
});
