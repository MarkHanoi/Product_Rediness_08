// §FEAT-WALL-SIDE-FINISH — the founder's sentences, pinned.
//
// THE ASK, verbatim: *"I want the possibility to change the wall layer finish
// material on EACH SIDE of the wall … Plus this should be doable via AI chat,
// e.g. 'change / make all walls in room X finish wall Y', 'make all inner
// finishes walls in ground floor to X'."*
//
// ⭐ EVERY SENTENCE TEST HERE DRIVES THE REAL LADDER — `resolveCompoundUtterance`
// → `resolveUtterance` (tier 0/1) → `resolveNaturalLanguage` — and never a
// hand-built intent object. Production has NO AI upstream (`CF_WORKER_URL` /
// `ANTHROPIC_API_KEY` unset), so a capability that resolves only through the LLM
// planner does not work for the founder at all. COMMITTED ≠ REACHABLE: a green
// test on a hand-built intent proves the arm, not the sentence.
//
// MEASURED RED at base 6f751676 (the real ladder, this capability absent):
//   "make all inner finishes walls in ground floor to limewash"      → kind=miss
//   "change all walls in the kitchen finish plaster"                 → kind=miss
//   "make all inner finishes walls on the ground floor to plaster"   → kind=miss
//   "change the inner finish of all walls to microcement"            → kind=miss
//   "set all walls on level 2 finish tadelakt"                       → kind=miss
//   "make the selected walls finish venetian plaster"                → kind=miss
//   "change all outer finishes walls to clay plaster"                → kind=miss
//   "change all walls in the kitchen finish limewash"                → kind=miss
// A `miss` is precisely the outcome that falls through to an LLM that is not
// there, i.e. the founder gets nothing.

import { describe, it, expect } from 'vitest';
import {
  resolveUtterance,
  type ResolverContext,
  type ZeroTokenResolution,
} from '../src/intents/ZeroTokenResolver.js';
import { resolveNaturalLanguage } from '../src/intents/LocalNaturalLanguageResolver.js';
import { resolveCompoundUtterance } from '../src/intents/SemanticPlan.js';
import {
  WALL_SIDE_FINISH_EXAMPLES,
  WALL_SIDE_FINISH_NON_CLAIMS,
} from '../src/intents/WallSideFinishIntent.js';
import { EXECUTION_SPECS } from '../src/intents/CapabilityExecutionSpec.js';
import { resolveChatCapability } from '../src/capabilities/ChatCapabilityRegistry.js';
import type { ScopeDescriptor, ScopeResult } from '../src/intents/ScopeDescriptor.js';

let seq = 0;
function ctxOf(overrides: Partial<ResolverContext> = {}): ResolverContext {
  return {
    selection: [],
    levels: [
      { id: 'L0', name: 'Ground', elevation: 0 },
      { id: 'L1', name: 'Level 1', elevation: 3 },
      { id: 'L2', name: 'Level 2', elevation: 6 },
    ],
    activeLevelId: 'L0',
    mintId: () => `wsf-${++seq}`,
    ...overrides,
  } as ResolverContext;
}

/** A resolver that hands back `n` ids for whatever it is asked. */
function stubScope(n: number, diagnostic = 'Ground'): (d: ScopeDescriptor) => ScopeResult {
  return () => ({
    ids: Array.from({ length: n }, (_, i) => `w-${i}`),
    kindCounts: {},
    skipped: [],
    diagnostics: [diagnostic],
  });
}

/** THE REAL LADDER the bridge uses. Nothing here shortcuts to an arm. */
function resolveFull(utterance: string, ctx: ResolverContext): ZeroTokenResolution {
  const plan = resolveCompoundUtterance(utterance, ctx);
  if (plan !== null) return plan;
  const tier01 = resolveUtterance(utterance, ctx);
  if (tier01.kind !== 'miss') return tier01;
  const nl = resolveNaturalLanguage(utterance, ctx);
  if (nl.kind === 'resolved') return nl.resolution;
  return { kind: 'miss' };
}

function intentOf(r: ZeroTokenResolution): string | null {
  return r.kind === 'commands' || r.kind === 'local' || r.kind === 'refusal' ? r.intent : null;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("THE FOUNDER'S SENTENCES, through the REAL zero-token ladder", () => {
  const SELECTION = [{ elementId: 'w-sel', elementType: 'wall' }];

  for (const text of WALL_SIDE_FINISH_EXAMPLES) {
    it(`"${text}" → set-wall-side-finish (not a miss, not a refusal)`, () => {
      const r = resolveFull(
        text,
        ctxOf({ resolveScope: stubScope(5), selection: SELECTION as never }),
      );
      // NOT a miss — a miss is what falls through to an LLM production has not got.
      expect(r.kind, `"${text}" resolved as ${r.kind}`).toBe('commands');
      expect(intentOf(r)).toBe('set-wall-side-finish');
    });
  }

  it("the founder's sentence #2 targets the GROUND level and the INNER side only", () => {
    const r = resolveFull(
      'make all inner finishes walls in ground floor to limewash',
      ctxOf({ resolveScope: stubScope(4) }),
    );
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    const cmd = r.commands[0]!;
    expect(cmd.type).toBe('wall.setSideFinishBatch');
    const p = cmd.payload as Record<string, unknown>;
    // The SEMANTIC side, resolved from the words the user typed.
    expect(p['side']).toBe('interior');
    // Resolved to the level's ids by ctx.resolveScope — NOT left as 'all'.
    expect(p['wallIds']).toEqual(['w-0', 'w-1', 'w-2', 'w-3']);
    // A LEVEL scope is not a room scope, so no geometric question is asked.
    expect(p['roomScoped']).toBe(false);
  });

  it("the founder's sentence #1 is a ROOM scope, and says so in the payload", () => {
    const r = resolveFull(
      'change all walls in the kitchen finish plaster',
      ctxOf({ resolveScope: stubScope(3) }),
    );
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    const p = r.commands[0]!.payload as Record<string, unknown>;
    expect(p['side']).toBe('interior');
    // ⭐ THE FLAG THAT MAKES THE REFUSAL POSSIBLE. Without it the handler cannot
    // know these ids came from a room, and a partition would be silently
    // re-finished on the wrong face.
    expect(p['roomScoped']).toBe(true);
  });

  it('an OUTER ask resolves to the exterior side, not the default', () => {
    const r = resolveFull(
      'change all outer finishes walls to clay plaster',
      ctxOf({ resolveScope: stubScope(2) }),
    );
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect((r.commands[0]!.payload as Record<string, unknown>)['side']).toBe('exterior');
  });

  it('the finish arrives RESOLVED — the command owns no name table', () => {
    const r = resolveFull(
      'make all inner finishes walls on the ground floor to plaster',
      ctxOf({ resolveScope: stubScope(2) }),
    );
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    const finish = (r.commands[0]!.payload as Record<string, unknown>)['finish'] as Record<string, unknown>;
    expect(finish['materialId']).toBe('gypsum-skim');
    expect(finish['materialColor']).toMatch(/^#[0-9a-f]{6}$/i);
    expect(typeof finish['materialName']).toBe('string');
  });
});

describe('AN UNKNOWN FINISH REFUSES BY LISTING REAL OPTIONS — never guesses', () => {
  it('claims the sentence and refuses, rather than missing into an absent LLM', () => {
    const r = resolveFull(
      'make all inner finishes walls on the ground floor to unobtainium',
      ctxOf({ resolveScope: stubScope(2) }),
    );
    // Claiming is the point: ADR-0313 HONESTY — recognised-but-underspecified
    // must never reach an LLM, and here there is no LLM to reach.
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason.toLowerCase()).toContain('unobtainium');
    // Real options, from the ONE finish table.
    expect(r.reason.toLowerCase()).toContain('plaster');
  });
});

describe('IT DOES NOT STEAL ITS NEIGHBOURS', () => {
  // A greedy finish grammar silently breaks three shipped capabilities, and the
  // breakage is invisible until a founder hits it.
  const EXPECTED: Readonly<Record<string, string>> = {
    'add a 10mm plaster layer to the inner side of the selected wall': 'add-wall-layer',
    'make all walls white': 'set-wall-color',
    'make all walls interior partition': 'set-wall-type',
    'make all walls 3m high': 'set-wall-dimensions',
  };

  for (const text of WALL_SIDE_FINISH_NON_CLAIMS) {
    it(`"${text}" still reaches ${EXPECTED[text]}`, () => {
      const r = resolveFull(
        text,
        ctxOf({
          resolveScope: stubScope(3),
          selection: [{ elementId: 'w-sel', elementType: 'wall' }] as never,
          resolveWallSystemType: (ref: string) =>
            /partition/i.test(ref) ? { id: 'wt-interior-partition', name: 'Interior – Partition 100mm' } : null,
        }),
      );
      expect(intentOf(r), `"${text}" was claimed by ${intentOf(r)}`).toBe(EXPECTED[text]);
    });
  }
});

describe('THE CAPABILITY IS DECLARED, not just implemented', () => {
  it('has an execution spec bound to the bus verb', () => {
    const spec = EXECUTION_SPECS['set-wall-side-finish'];
    expect(spec).toBeDefined();
    expect(spec!.busCommand).toBe('wall.setSideFinishBatch');
    expect(spec!.idsField).toBe('wallIds');
    expect(spec!.elementKind).toBe('wall');
    // NOT destructive: one undo entry, deletes nothing, and — unlike
    // add-wall-layer — moves nothing either.
    expect(spec!.destructive).toBe(false);
  });

  it('is discoverable in the capability registry (C67/C68)', () => {
    const cap = resolveChatCapability('set-wall-side-finish');
    expect(cap, 'set-wall-side-finish is not registered').toBeTruthy();
    expect(cap!.busCommand).toBe('wall.setSideFinishBatch');
    expect(cap!.targets).toContain('wall');
  });

  it('every declared example actually resolves to this capability', () => {
    const cap = resolveChatCapability('set-wall-side-finish')!;
    for (const ex of cap.examples ?? []) {
      const r = resolveFull(ex, ctxOf({ resolveScope: stubScope(3) }));
      expect(intentOf(r), `declared example "${ex}" resolved as ${intentOf(r)}`).toBe(
        'set-wall-side-finish',
      );
    }
  });
});
