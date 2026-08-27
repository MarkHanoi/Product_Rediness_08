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

/** Records every descriptor `applyExecutionSpec` asks the resolver for, so a
 *  test can prove WHICH scope kind reached `ctx.resolveScope` — the same
 *  proof style `opening-shape-chat-acceptance.test.ts` uses for the window
 *  orientation axis, mirrored here for §RACWALL128. */
function capturingScope(n: number, diagnostic = 'facade'): {
  calls: ScopeDescriptor[];
  resolve: (d: ScopeDescriptor) => ScopeResult;
} {
  const calls: ScopeDescriptor[] = [];
  return {
    calls,
    resolve: (d: ScopeDescriptor) => {
      calls.push(d);
      return {
        ids: Array.from({ length: n }, (_, i) => `w-${i}`),
        kindCounts: {},
        skipped: [],
        diagnostics: [diagnostic],
      };
    },
  };
}

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
    // §RACWALL128 — compass-scoped colour/rake asks stay with their grammars.
    'make all south-facing walls white': 'set-wall-color',
    'make all east-facing walls angled by 70 degrees': 'set-wall-rake',
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

// ─── §RACWALL128 — "change layer finish outside colour of all east-facing walls" ──
//
// The founder's ask for each cardinal orientation. MEASURED RED before this
// lane (2026-08-26, the real ladder at HEAD):
//   • grammar half — "change all east-facing walls exterior finish to clay
//     plaster" parsed with base='all': the compass adjective was SWALLOWED and
//     the ask silently widened to every wall in the project (C84 EI-2).
//   • spec half — an orientation scope that DID parse (prepositional phrase,
//     via the shared SpatialScopeTail) was refused by name:
//     `spatialKinds: ['level','room']` predated the orientation axis, so
//     applyExecutionSpec's guard declined it before ctx.resolveScope ever ran.
// The compass MATH is not this lane's: orientationFromNormal's ±45° quadrant
// and the true-north θ threading are @pryzm/spatial-index's, already shipped.

describe('§RACWALL128 — the exterior finish of a compass facade', () => {
  const CARDINALS = [
    ['east', 'E'],
    ['west', 'W'],
    ['north', 'N'],
    ['south', 'S'],
  ] as const;

  for (const [word, letter] of CARDINALS) {
    it(`"change all ${word}-facing walls exterior finish to clay plaster" → orientation ${letter}, side exterior`, () => {
      const cap = capturingScope(4);
      const r = resolveFull(
        `change all ${word}-facing walls exterior finish to clay plaster`,
        ctxOf({ resolveScope: cap.resolve }),
      );
      expect(r.kind, `resolved as ${r.kind}`).toBe('commands');
      if (r.kind !== 'commands') return;
      const cmd = r.commands[0]!;
      expect(cmd.type).toBe('wall.setSideFinishBatch');
      const p = cmd.payload as Record<string, unknown>;
      expect(p['side']).toBe('exterior');
      // Resolved to the facade's ids by ctx.resolveScope — NOT left as 'all'.
      expect(p['wallIds']).toEqual(['w-0', 'w-1', 'w-2', 'w-3']);
      // An orientation scope asks no geometric room question.
      expect(p['roomScoped']).toBe(false);
      // ⭐ THE DESCRIPTOR IS THE PROOF the ask was not silently widened: the
      // resolver was asked for the COMPASS facade, not for 'all'.
      const o = cap.calls.find((d) => d.kind === 'orientation');
      expect(o, JSON.stringify(cap.calls)).toBeDefined();
      expect((o as { orientation: string }).orientation).toBe(letter);
    });
  }

  it('the prepositional spelling scopes identically — "change the exterior finish of all west-facing walls to limewash"', () => {
    const cap = capturingScope(2);
    const r = resolveFull(
      'change the exterior finish of all west-facing walls to limewash',
      ctxOf({ resolveScope: cap.resolve }),
    );
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect((r.commands[0]!.payload as Record<string, unknown>)['side']).toBe('exterior');
    const o = cap.calls.find((d) => d.kind === 'orientation');
    expect(o, JSON.stringify(cap.calls)).toBeDefined();
    expect((o as { orientation: string }).orientation).toBe('W');
  });

  it('"on the south facade" (facade noun, no adjective) scopes by orientation too', () => {
    const cap = capturingScope(3);
    const r = resolveFull(
      'make all walls on the south facade exterior finish plaster',
      ctxOf({ resolveScope: cap.resolve }),
    );
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    const o = cap.calls.find((d) => d.kind === 'orientation');
    expect(o, JSON.stringify(cap.calls)).toBeDefined();
    expect((o as { orientation: string }).orientation).toBe('S');
  });

  it('⛔ "these east-facing walls" is NOT claimed — orientation composes with ALL only', () => {
    // Mirrors wallSpatialScopeBase: an orientation against the live selection
    // is a contradiction, and a mass re-finish never guesses. The sentence must
    // not become a side-finish command over the selection or over 'all'.
    const cap = capturingScope(3);
    const r = resolveFull(
      'make these east-facing walls exterior finish plaster',
      ctxOf({ resolveScope: cap.resolve, selection: [{ elementId: 'w-sel', elementType: 'wall' }] as never }),
    );
    expect(intentOf(r)).not.toBe('set-wall-side-finish');
  });

  it('a non-compass "-facing" adjective stays inert — "street-facing" does not scope by orientation', () => {
    const cap = capturingScope(2);
    const r = resolveFull(
      'change all street-facing walls exterior finish to clay plaster',
      ctxOf({ resolveScope: cap.resolve }),
    );
    // Claimed (finish ask), but the unknown adjective is not a compass claim:
    // no orientation descriptor may be minted from it.
    expect(cap.calls.every((d) => d.kind !== 'orientation')).toBe(true);
  });
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

// ─────────────────────────────────────────────────────────────────────────────
// §RACSIDE144 — the founder's actual complaint: "I have a problem — I want to
// also change the INTERIOR wall finish, but this still would only change the
// outer finish." The command already carried a `side` parameter
// (`SetWallSideFinishBatchCommand`); what was missing was a GRAMMAR that could
// say "both" (it used to REFUSE outright on "inner and outer" — see the OLD
// `if (hasInner && hasOuter) return null;` this lane deleted) and a command
// that could carry it as ONE undo entry rather than two commands.
// ─────────────────────────────────────────────────────────────────────────────

describe('§RACSIDE144 — "both" is a real answer, never a decline', () => {
  it('"inner and outer" claims BOTH, explicitly, as ONE command', () => {
    const r = resolveFull(
      'change the finish of all west-facing walls to red paint, inner and outer',
      ctxOf({ resolveScope: stubScope(4) }),
    );
    expect(r.kind, `resolved as ${r.kind}`).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands).toHaveLength(1);
    const p = r.commands[0]!.payload as Record<string, unknown>;
    expect(p['side']).toBe('both');
    // The confirmation states BOTH sides, never the raw union literal.
    expect(r.summary).toContain('interior and exterior finish');
    // Explicit — no "this was a default" hint attached.
    expect(r.summary).not.toContain('the default here');
  });

  it('"both sides" (without the words inner/outer) claims BOTH too', () => {
    const r = resolveFull(
      'change all west-facing walls finish to clay plaster, both sides',
      ctxOf({ resolveScope: stubScope(2) }),
    );
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect((r.commands[0]!.payload as Record<string, unknown>)['side']).toBe('both');
  });

  it("⭐ THE HEADLINE ACCEPTANCE TEST — side + orientation + a reversed-word-order material, together", () => {
    // The founder's material picker shows "Paint · Pastel Green"; he types the
    // words in the OTHER order. `resolveFinishRef`'s catalogue-token tier is
    // bag-of-words, not positional, so this is not a new resolver — it is the
    // existing one, exercised through the fixed grammar.
    const cap = capturingScope(3);
    const r = resolveFull(
      'change outside and inside finish of all west-facing walls to green pastel paint',
      ctxOf({ resolveScope: cap.resolve }),
    );
    expect(r.kind, `resolved as ${r.kind}`).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands).toHaveLength(1); // ONE bus command — the undo entry stays singular.
    const p = r.commands[0]!.payload as Record<string, unknown>;
    expect(p['side']).toBe('both');
    const o = cap.calls.find((d) => d.kind === 'orientation');
    expect(o, JSON.stringify(cap.calls)).toBeDefined();
    expect((o as { orientation: string }).orientation).toBe('W');
    const finish = p['finish'] as Record<string, unknown>;
    expect(finish['materialId']).toBe('paint-pastel-green');
  });

  it('a ZERO-match compass scope is still a visible honest no-op with "both" requested', () => {
    const r = resolveFull(
      'change outside and inside finish of all west-facing walls to green pastel paint',
      ctxOf({ resolveScope: stubScope(0) }),
    );
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason.toLowerCase()).toContain('no walls');
    expect(r.reason.toLowerCase()).toContain('west');
  });
});

describe('§RACSIDE144 — the bare form: default depends on SCOPE, and the confirmation SAYS which', () => {
  it('a bare COMPASS ask defaults EXTERIOR — the same side every shipped compass example already said', () => {
    const cap = capturingScope(4);
    const r = resolveFull(
      'change finish of all west-facing walls to clay plaster',
      ctxOf({ resolveScope: cap.resolve }),
    );
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect((r.commands[0]!.payload as Record<string, unknown>)['side']).toBe('exterior');
    // The default is STATED, not silent — the actual fix for the founder's surprise.
    expect(r.summary).toContain('exterior face only');
    expect(r.summary.toLowerCase()).toContain('inner and outer');
  });

  it('a bare NON-compass ask keeps the pre-existing INTERIOR default, unaffected', () => {
    const r = resolveFull(
      'change all walls in the kitchen finish plaster',
      ctxOf({ resolveScope: stubScope(3) }),
    );
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect((r.commands[0]!.payload as Record<string, unknown>)['side']).toBe('interior');
    expect(r.summary).toContain('interior face only');
  });

  it('an EXPLICIT side never carries the default hint', () => {
    const r = resolveFull(
      'change all east-facing walls exterior finish to clay plaster',
      ctxOf({ resolveScope: stubScope(4) }),
    );
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.summary).not.toContain('the default here');
  });
});

describe('§RACSIDE144 (L-12363) — a resolved, unambiguous finish name is enough on its own', () => {
  it('"make all walls white paint" — no "finish" word, no side word, still claims (not the wall-TYPE catch-all)', () => {
    const r = resolveFull('make all walls white paint', ctxOf({ resolveScope: stubScope(5) }));
    expect(r.kind, `resolved as ${r.kind}`).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.intent).toBe('set-wall-side-finish');
    const p = r.commands[0]!.payload as Record<string, unknown>;
    const finish = p['finish'] as Record<string, unknown>;
    expect(finish['materialId']).toBe('paint-matte-white');
    // Bare, non-compass ⇒ the pre-existing interior default, stated.
    expect(p['side']).toBe('interior');
  });

  it('a wall TYPE that collides with a finish name still wins the type grammar (defensive, not a live case today)', () => {
    // Measured: no wall-type catalogue name in this codebase collides with a
    // finish alias. This proves the PRECEDENCE holds if one ever does, rather
    // than asserting a case that cannot occur.
    const r = resolveFull(
      'make all walls white paint',
      ctxOf({
        resolveScope: stubScope(2),
        resolveWallSystemType: (ref: string) =>
          ref === 'white paint' ? { id: 'wt-white-paint', name: 'White Paint Wall Type' } : null,
      }),
    );
    expect(intentOf(r)).toBe('set-wall-type');
  });

  it('an AMBIGUOUS material still refuses by LISTING the real candidates, never guessing', () => {
    // "grey paint" matches five real rows (Pastel / Light / Mid / Slate /
    // Anthracite Grey) — measured against the real resolver, not assumed.
    const r = resolveFull(
      'change all walls finish to grey paint',
      ctxOf({ resolveScope: stubScope(3) }),
    );
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason.toLowerCase()).toContain('grey paint');
  });

  it('a genuine DATA GAP ("red pastel paint" — no such row) refuses honestly, never invents one', () => {
    const r = resolveFull(
      'change all walls finish to red pastel paint',
      ctxOf({ resolveScope: stubScope(3) }),
    );
    expect(r.kind).toBe('refusal');
  });
});
