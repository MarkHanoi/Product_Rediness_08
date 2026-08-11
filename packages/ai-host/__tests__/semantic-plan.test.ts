// §PLAN (RAC U6) — the compound-sentence executor.
//
// The founder's five sentences, the guards a plan must NOT be able to bypass,
// and the undo arithmetic. A plan is an ordered list of ordinary intents: if it
// can reach a capability that the same clause typed alone could not, or claim
// one undo for a three-command sequence, it is worse than not having it.

import { describe, it, expect } from 'vitest';
import {
  applySemanticIntent,
  resolveUtterance,
  type BusCommandRef,
  type ResolverContext,
  type SemanticIntent,
} from '../src/intents/ZeroTokenResolver.js';
import {
  parsePlanIntent,
  resolveCompoundUtterance,
  splitPlanClauses,
} from '../src/intents/SemanticPlan.js';

let seq = 0;
const ctxOf = (overrides: Partial<ResolverContext> = {}): ResolverContext => ({
  selection: [],
  levels: [
    { id: 'L0', name: 'Level 0', elevation: 0 },
    { id: 'L1', name: 'Level 1', elevation: 3 },
    { id: 'L2', name: 'Level 2', elevation: 6 },
  ],
  activeLevelId: 'L0',
  mintId: () => `plan-level-${++seq}`,
  ...overrides,
});

function planOf(utterance: string, ctx: ResolverContext = ctxOf()) {
  const parsed = parsePlanIntent(utterance, ctx);
  expect(parsed.kind, `"${utterance}" did not parse as a plan: ${JSON.stringify(parsed)}`).toBe('plan');
  if (parsed.kind !== 'plan') throw new Error('unreachable');
  return parsed.intent;
}

function appliedPlan(utterance: string, ctx: ResolverContext = ctxOf()) {
  const r = applySemanticIntent(planOf(utterance, ctx), ctx);
  expect(r.kind, `"${utterance}" → ${JSON.stringify(r)}`).toBe('commands');
  if (r.kind !== 'commands') throw new Error('unreachable');
  expect(r.plan, 'a plan application must carry its PlanReport').toBeDefined();
  return r;
}

const types = (cmds: readonly BusCommandRef[]): string[] => cmds.map((c) => c.type);

// ─── The splitter ────────────────────────────────────────────────────────────

describe('§PLAN — splitting on EXPLICIT sequencing connectives only', () => {
  it('splits on then / , then / and then / after that / first…then', () => {
    expect(splitPlanClauses('duplicate level 0 to level 1, then furnish it'))
      .toEqual(['duplicate level 0 to level 1', 'furnish it']);
    expect(splitPlanClauses('make all walls white then add ceilings to every room'))
      .toEqual(['make all walls white', 'add ceilings to every room']);
    expect(splitPlanClauses('generate a 2-storey house and then furnish all rooms'))
      .toEqual(['generate a 2-storey house', 'furnish all rooms']);
    expect(splitPlanClauses('add a level at 9m. after that, duplicate level 0 onto it'))
      .toEqual(['add a level at 9m', 'duplicate level 0 onto it']);
    expect(splitPlanClauses('first duplicate level 0 to level 1, then furnish it'))
      .toEqual(['duplicate level 0 to level 1', 'furnish it']);
  });

  it('NEVER splits on a bare "and" — it is a noun conjunction here', () => {
    expect(splitPlanClauses('furnish the kitchen and the living room')).toEqual([]);
    expect(splitPlanClauses('furnish and light this floor')).toEqual([]);
    expect(splitPlanClauses('make all walls white')).toEqual([]);
  });

  it('a trailing connective with nothing after it is not a plan', () => {
    expect(parsePlanIntent('make all walls white then', ctxOf()).kind).toBe('not-a-plan');
  });
});

// ─── The founder's sentences ─────────────────────────────────────────────────

describe("§PLAN — the founder's compound sentences", () => {
  it('"duplicate level 0 to level 1, then furnish it" — the pronoun is level 1', () => {
    const plan = planOf('duplicate level 0 to level 1, then furnish it');
    expect(plan.steps.map((s) => s.intent)).toEqual(['duplicate-level', 'generate-room-finishes']);
    const finish = plan.steps[1] as Extract<SemanticIntent, { intent: 'generate-room-finishes' }>;
    // "it" resolved to the level the FIRST step duplicates onto — not the
    // active level, and not a guess.
    expect(finish.scope).toEqual({ kind: 'level', levelQuery: '1' });
    const r = appliedPlan('duplicate level 0 to level 1, then furnish it');
    expect(types(r.commands)).toEqual(['level.duplicate-floor-plan', 'generation.rooms']);
    expect(r.commands[1]!.payload['levelId']).toBe('L1');
    expect(r.destructive).toBe(true);
  });

  it('"generate a 2-storey house and then furnish all rooms" keeps BOTH halves', () => {
    // Both halves are claimed WHOLE by token-based grammars on their own
    // (matchRoomFinishes and matchGenerateBuilding each match the full
    // sentence), so a "whole sentence wins" rule would silently drop one.
    const r = appliedPlan('generate a 2-storey house and then furnish all rooms');
    expect(types(r.commands)).toEqual(['generation.building', 'generation.rooms']);
    expect(r.commands[0]!.payload['typology']).toBe('house');
    expect(r.commands[0]!.payload['floors']).toBe(2);
    // …and the auto-chain caveat is STATED, not discovered afterwards.
    expect(r.plan!.notes.join(' ')).toContain('auto-chain');
  });

  it('"add a level at 9 m, then duplicate level 0 onto it" validates against the level step 1 will create', () => {
    const r = appliedPlan('add a level at 9 m, then duplicate level 0 onto it');
    expect(types(r.commands)).toEqual(['level.add', 'level.duplicate-floor-plan']);
    const added = r.commands[0]!.payload;
    expect(added['elevation']).toBe(9);
    // The duplicate targets the level the ADD step mints — same id, projected
    // from step 1's own payload rather than re-derived.
    expect(r.commands[1]!.payload['targetLevelIds']).toEqual([added['levelId']]);
    expect(r.commands[1]!.payload['sourceLevelId']).toBe('L0');
  });

  it('"make all walls white then add ceilings to every room"', () => {
    const r = appliedPlan('make all walls white then add ceilings to every room');
    expect(types(r.commands)).toEqual(['wall.updateColorBatch', 'generation.rooms']);
    expect(r.commands[0]!.payload).toEqual({ wallIds: 'all', materialColor: '#ffffff' });
    expect(r.commands[1]!.payload['steps']).toEqual(['ceilings']);
  });

  it('"create a 3 bedroom apartment, then light all rooms"', () => {
    const r = appliedPlan('create a 3 bedroom apartment, then light all rooms');
    expect(types(r.commands)).toEqual(['generation.apartment', 'generation.rooms']);
    expect(r.commands[0]!.payload['bedrooms']).toBe(3);
    expect(r.commands[1]!.payload['steps']).toEqual(['lighting']);
  });
});

// ─── The Confirm card ────────────────────────────────────────────────────────

describe('§PLAN — one card, the steps in order', () => {
  it('the summary enumerates every step with its OWN summary', () => {
    const r = appliedPlan('duplicate level 0 to level 1, then furnish it');
    expect(r.summary).toContain('2 steps');
    expect(r.summary).toContain('1. Duplicate Level 0');
    expect(r.summary).toContain('2. Run furniture');
    expect(r.plan!.steps.map((s) => s.index)).toEqual([1, 2]);
    expect(r.plan!.steps.map((s) => s.clause))
      .toEqual(['duplicate level 0 to level 1', 'furnish it']);
    // The step boundaries the dispatcher slices `commands` with.
    expect(r.plan!.steps.map((s) => s.commandCount)).toEqual([1, 1]);
  });

  it('the plan is destructive when ANY step is', () => {
    // Recolouring alone is not destructive; the ceiling run is.
    const white = resolveUtterance('make all walls white', ctxOf());
    expect(white.kind === 'commands' && white.destructive).toBe(false);
    const r = appliedPlan('make all walls white then add ceilings to every room');
    expect(r.destructive).toBe(true);
  });
});

// ─── U6.3 — undo truthfulness ────────────────────────────────────────────────

describe('§PLAN — the undo cost is the REAL one (ADR-0314)', () => {
  it('two single-command steps cost two undos, and say so', () => {
    const r = appliedPlan('make all walls white then add ceilings to every room');
    expect(r.plan!.undoCost).toBe('2 steps — Ctrl+Z twice');
    expect(r.summary).toContain('Ctrl+Z twice');
  });

  it('a step that runs several engines counts each engine', () => {
    // "furnish and light" is ONE room-scale step running TWO engines, and each
    // engine opens its own batch — so it is two undo entries, not one.
    const r = appliedPlan('make all walls white then furnish and light this floor');
    expect(r.plan!.steps[1]!.undoEntries).toBe(2);
    expect(r.plan!.undoCost).toBe('2 steps, 3 undo entries — Ctrl+Z three times');
  });

  it('a chain step admits that only the engines know the count', () => {
    const r = appliedPlan('make all walls white then finish this apartment');
    expect(r.plan!.steps[1]!.undoEntries).toBeNull();
    expect(r.plan!.undoCost).toContain('at least');
    expect(r.plan!.undoCost).toContain('each stage of the chain is its own undo entry');
    // NEVER "undo with Ctrl+Z" as if the whole plan were one entry.
    expect(r.plan!.undoCost).not.toMatch(/Ctrl\+Z once/);
  });

  it('a generation step is ONE entry — its lease coalesces the build', () => {
    const r = appliedPlan('generate a 2-storey house and then furnish all rooms');
    expect(r.plan!.steps[0]!.undoEntries).toBe(1);
    expect(r.plan!.steps[0]!.undoNote).toContain('lease');
  });
});

// ─── All-or-nothing + the guards ─────────────────────────────────────────────

describe('§PLAN — a failing clause refuses the WHOLE plan', () => {
  it('names the step, quotes the clause and keeps the capability\'s own reason', () => {
    const r = resolveCompoundUtterance('make all walls white, then furnish the kitchen', ctxOf());
    expect(r?.kind).toBe('refusal');
    if (r?.kind !== 'refusal') return;
    expect(r.reason).toContain('step 2');
    expect(r.reason).toContain('furnish the kitchen');
    // The engine-granularity reason, unedited — a plan may not soften it.
    expect(r.reason).toContain('whole level at a time');
    expect(r.reason).toContain('Nothing in the plan was run');
  });

  it('an unknown level in step 2 stops the plan BEFORE step 1 runs', () => {
    const r = resolveCompoundUtterance('make all walls white, then duplicate level 0 to level 9', ctxOf());
    expect(r?.kind).toBe('refusal');
    if (r?.kind !== 'refusal') return;
    expect(r.reason).toContain('No level called "9"');
    expect(r.reason).toContain('Nothing in the plan was run');
  });

  it('a REPORT-shaped clause refuses the whole plan (§FIX-CHAT-REPORT-PASTEBACK)', () => {
    // The founder's own paste-back defect, wearing a compound sentence: the
    // report clause is not in opener position, so the whole-utterance guard
    // does not see it. The per-clause guard does.
    const r = resolveCompoundUtterance(
      'make all walls white, then Built 6 floors — 18 apartments, 3 per apartment floor on average',
      ctxOf(),
    );
    expect(r?.kind).toBe('refusal');
    if (r?.kind !== 'refusal') return;
    expect(r.reason).toContain('reads like a report');
    expect(r.reason).toContain('did not run any of the other steps');
  });

  it('a NEGATED or hypothetical clause refuses the whole plan', () => {
    for (const utterance of [
      "make all walls white, then don't add ceilings to every room",
      'make all walls white, then what would happen if I furnished all rooms',
    ]) {
      const r = resolveCompoundUtterance(utterance, ctxOf());
      expect(r?.kind, utterance).toBe('refusal');
      if (r?.kind !== 'refusal') continue;
      expect(r.reason, utterance).toContain('not an instruction');
    }
  });

  it('a plan may not contain a local action (undo / level switch)', () => {
    const r = resolveCompoundUtterance('make all walls white then undo', ctxOf());
    expect(r?.kind).toBe('refusal');
    if (r?.kind !== 'refusal') return;
    expect(r.reason).toContain('not a build step');
  });

  it('more than six steps refuses rather than showing an unreadable card', () => {
    const long = Array.from({ length: 7 }, () => 'make all walls white').join(', then ');
    const r = resolveCompoundUtterance(long, ctxOf());
    expect(r?.kind).toBe('refusal');
    if (r?.kind !== 'refusal') return;
    expect(r.reason).toContain('7 steps');
    expect(r.reason).toContain('Nothing was changed');
  });
});

// ─── Not-a-plan: the single-intent ladder keeps what it owns ─────────────────

describe('§PLAN — never takes a sentence away from a capability that understands it', () => {
  it('"furnish the kitchen and the living room" is ONE ask, not two steps', () => {
    // The adversarial pin for "and": no sequencing connective, so no split —
    // and the single-intent ladder answers with the engine's real granularity.
    expect(resolveCompoundUtterance('furnish the kitchen and the living room', ctxOf())).toBeNull();
    const single = resolveUtterance('furnish the kitchen and the living room', ctxOf());
    expect(single.kind).toBe('refusal');
  });

  it('"furnish and light this floor" stays one two-engine ask', () => {
    expect(resolveCompoundUtterance('furnish and light this floor', ctxOf())).toBeNull();
  });

  it('a plain single sentence is not a plan', () => {
    expect(resolveCompoundUtterance('make all walls white', ctxOf())).toBeNull();
    expect(resolveCompoundUtterance('undo', ctxOf())).toBeNull();
  });

  it('an unresolvable second clause defers to a capability that claims the whole sentence', () => {
    // "furnish the kitchen and then the living room": the second clause means
    // nothing alone, but the room-scale grammar understands the whole sentence
    // and gives the better answer (the engine's granularity), so the plan
    // stands aside.
    expect(resolveCompoundUtterance('furnish the kitchen and then the living room', ctxOf())).toBeNull();
  });
});
