// §FEAT-FLOOR-SURFACE-FINISH (L-1880..L-1884) — the founder's sentence, pinned.
//
// THE ASK, verbatim (2026-08-21): *"How can I use one of the newly floor finishes
// created? I tried this in RAC: **finish to wooden parquet** — PRYZM AI: Floor
// surface finish isn't connected to chat yet. I can change floor level."*
//
// ⭐ EVERY SENTENCE TEST HERE DRIVES THE REAL LADDER — `resolveCompoundUtterance`
// → `resolveUtterance` (tier 0/1) → `resolveNaturalLanguage` — and never a
// hand-built intent object. Production has NO AI upstream (`CF_WORKER_URL` /
// `ANTHROPIC_API_KEY` unset), so a capability that resolves only through the LLM
// planner does not work for the founder at all. §COMMITTED-IS-NOT-REACHABLE: a
// green test on a hand-built intent proves the arm, not the sentence.
//
// MEASURED RED at base 701713e6 (the real ladder, this capability absent):
//   "make all floors oak chevron"                     → kind=miss
//   "change all floors to oak chevron"                → kind=miss
//   "set all floors on level 2 to walnut herringbone" → kind=miss
//   "make the living room floor oak chevron"          → kind=miss
//   "lay oak chevron on all floors"                   → kind=miss
//   "finish to wooden parquet" (floor selected)       → capability-gap refusal
// The last one is the founder's own transcript: an HONEST refusal, and still
// nothing he could use.

import { describe, it, expect } from 'vitest';
import {
  resolveUtterance,
  type ResolverContext,
  type ZeroTokenResolution,
} from '../src/intents/ZeroTokenResolver.js';
import { resolveNaturalLanguage } from '../src/intents/LocalNaturalLanguageResolver.js';
import { resolveCompoundUtterance } from '../src/intents/SemanticPlan.js';
import {
  FLOOR_FINISH_EXAMPLES,
  FLOOR_FINISH_NON_CLAIMS,
} from '../src/intents/FloorFinishIntent.js';
import { EXECUTION_SPECS } from '../src/intents/CapabilityExecutionSpec.js';
import { resolveChatCapability } from '../src/capabilities/ChatCapabilityRegistry.js';
import { capabilityGapRefusal } from '../src/capabilities/CapabilityRefusal.js';
import { resolveFinishRef, finishRefusalCopy } from '../src/intents/finishRef.js';
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
    mintId: () => `ff-${++seq}`,
    ...overrides,
  } as ResolverContext;
}

/** A resolver that hands back `n` ids for whatever it is asked. */
function stubScope(n: number, diagnostic = 'Ground'): (d: ScopeDescriptor) => ScopeResult {
  return () => ({
    ids: Array.from({ length: n }, (_, i) => `f-${i}`),
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

const FLOOR_SELECTION = [{ elementId: 'f-sel', elementType: 'floor' }];

// ─────────────────────────────────────────────────────────────────────────────

describe('the floor-finish sentences, through the REAL zero-token ladder', () => {
  for (const text of FLOOR_FINISH_EXAMPLES) {
    it(`"${text}" → set-floor-finish (not a miss, not a refusal)`, () => {
      const r = resolveFull(
        text,
        ctxOf({ resolveScope: stubScope(5), selection: FLOOR_SELECTION as never }),
      );
      // NOT a miss — a miss is what falls through to an LLM production has not got.
      expect(r.kind, `"${text}" resolved as ${r.kind}`).toBe('commands');
      expect(intentOf(r)).toBe('set-floor-finish');
    });
  }

  it('dispatches floor.setFinishBatch with a RESOLVED finish and resolved ids', () => {
    const r = resolveFull('set all floors on level 2 to walnut herringbone', ctxOf({ resolveScope: stubScope(4, 'Level 2') }));
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    const cmd = r.commands[0]!;
    // ⛔ NEVER `floor.setMaterial` — that verb refuses by declaration
    // (§FIX-DEAD-VERB-REFUSE): it writes a detached plugin DTO store.
    expect(cmd.type).toBe('floor.setFinishBatch');
    const p = cmd.payload as Record<string, unknown>;
    // Resolved to the level's ids by ctx.resolveScope — NOT left as 'all'.
    expect(p['floorIds']).toEqual(['f-0', 'f-1', 'f-2', 'f-3']);
    // The VALUE arrives resolved; the command owns no name table.
    expect(p['finish']).toEqual({
      materialId: 'parquet-walnut-herringbone',
      materialColor: '#5a3a28',
      materialName: 'Parquet · Walnut Herringbone (70 × 280)',
    });
  });

  it("a room named WITHOUT a preposition still scopes to that room", () => {
    // "the living room floor" — no preposition, so the shared inline reader
    // cannot see it. `BARE_ROOM_FLOOR_RE` + `readSpatialTail` handle it.
    let asked: ScopeDescriptor | null = null;
    const r = resolveFull(
      'make the living room floor oak chevron',
      ctxOf({
        resolveScope: (d) => { asked = d; return stubScope(2)(d); },
      }),
    );
    expect(r.kind).toBe('commands');
    expect(asked).not.toBeNull();
    expect((asked as unknown as { kind: string; roomRef?: string }).kind).toBe('room');
    expect((asked as unknown as { roomRef?: string }).roomRef).toBe('living room');
  });

  it('"the GROUND floor" is a LEVEL, not a room called "ground"', () => {
    // The whole reason the bare-room arm routes through `readSpatialTail` rather
    // than treating its capture as a room directly (L-1201's ruling).
    let asked: ScopeDescriptor | null = null;
    const r = resolveFull(
      'make the ground floor oak chevron',
      ctxOf({ resolveScope: (d) => { asked = d; return stubScope(2)(d); } }),
    );
    expect(r.kind).toBe('commands');
    expect((asked as unknown as { kind: string }).kind).toBe('level');
  });
});

describe("§L-1880 — the founder's own words: \"finish to wooden parquet\"", () => {
  it('MEASURED: the loose alias arm used to answer it with PLAIN OAK — it no longer does', () => {
    // Before L-1880: `resolveFinishRef('wooden parquet')` → 'wood-oak', because no
    // master label contains "wooden" so the phrase fell to the loose alias arm,
    // where `'wooden parquet'.includes('wood')` is true for exactly one group. He
    // asked for PARQUET and would have been given flat oak, reported as success.
    expect(resolveFinishRef('wooden parquet')).toBeNull();
    // ⛔ AND VOCABULARY WAS NOT DELETED to achieve it — the guard is structural
    // ("a loose match may not drop a word the catalogue knows"), not a blocklist.
    expect(resolveFinishRef('wood')?.materialId).toBe('wood-oak');
    expect(resolveFinishRef('wood fibre insulation')?.materialId).toBe('insulation-wood-fibre');
    expect(resolveFinishRef('oak chevron')?.materialId).toBe('parquet-oak-chevron-45');
  });

  it('the refusal TEACHES from the word that did land, naming the real parquet rows', () => {
    const copy = finishRefusalCopy('wooden parquet');
    expect(copy).toContain('"parquet"');
    expect(copy).toContain('Parquet · Oak Herringbone');
    // The old copy listed plaster/plasterboard/gypsum — none of which he asked for.
    expect(copy).not.toContain('plasterboard');
  });

  it('with a FLOOR selected, his sentence reaches the capability and refuses by LISTING', () => {
    const r = resolveFull(
      'finish to wooden parquet',
      ctxOf({ selection: FLOOR_SELECTION as never, resolveScope: stubScope(1) }),
    );
    // It is claimed — so it is answered by the capability, not by a generic
    // "isn't connected to chat yet" that is now false.
    expect(intentOf(r)).toBe('set-floor-finish');
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('Parquet · Oak Herringbone');
  });

  it('naming ONE of the listed rows then works', () => {
    const r = resolveFull(
      'finish to oak chevron',
      ctxOf({ selection: FLOOR_SELECTION as never, resolveScope: stubScope(1) }),
    );
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.type).toBe('floor.setFinishBatch');
  });

  it('the SAME bare sentence with a WALL selected is NOT claimed by the floor grammar', () => {
    const r = resolveFull(
      'finish to oak chevron',
      ctxOf({ selection: [{ elementId: 'w1', elementType: 'wall' }] as never, resolveScope: stubScope(1) }),
    );
    expect(intentOf(r)).not.toBe('set-floor-finish');
  });
});

describe('what this grammar must NOT steal', () => {
  for (const text of FLOOR_FINISH_NON_CLAIMS) {
    it(`"${text}" is not claimed as set-floor-finish`, () => {
      const r = resolveFull(
        text,
        ctxOf({ resolveScope: stubScope(3), selection: FLOOR_SELECTION as never }),
      );
      expect(intentOf(r)).not.toBe('set-floor-finish');
    });
  }

  it('"finish this floor" still reaches the apartment CHAIN, which owns it', () => {
    const r = resolveFull('finish this floor', ctxOf({ resolveScope: stubScope(3) }));
    expect(intentOf(r)).toBe('finish-apartment-chain');
  });
});

describe('§L-1884 — the refusal table stops denying what the registry now offers', () => {
  it('"Floor surface finish isn\'t connected to chat yet" is no longer manufactured', () => {
    // The founder's exact transcript line came from `capabilityGapRefusal`. It was
    // TRUE when he typed it; it is FALSE now, and a refusal that denies a live
    // ability is the manufactured-false-refusal lie (ADR-0314).
    expect(capabilityGapRefusal('finish to wooden parquet', ['floor'])).toBeNull();
    expect(capabilityGapRefusal('change the floor material', ['floor'])).toBeNull();
  });

  it('...but a SLAB / ROOF finish is still an honest gap', () => {
    // Vocabulary is MOVED, never deleted (RAC free-form doctrine). floor-vs-slab
    // is a decision, not a coin-flip (CatalogueFamilies.ts), so slab is untouched.
    expect(capabilityGapRefusal('change the slab finish', ['slab'])).not.toBeNull();
    expect(capabilityGapRefusal('change the roof material', ['roof'])).not.toBeNull();
  });
});

describe('registry / spec agreement', () => {
  it('the capability is declared and its spec agrees with it', () => {
    const cap = resolveChatCapability('set-floor-finish');
    expect(cap).not.toBeNull();
    const spec = EXECUTION_SPECS['set-floor-finish'];
    expect(spec.busCommand).toBe(cap!.busCommand);
    expect(spec.elementKind).toBe('floor');
    expect(cap!.targets).toEqual(['floor']);
    // ⛔ The dead verb must never be what a capability dispatches.
    expect(spec.busCommand).not.toBe('floor.setMaterial');
  });
});
