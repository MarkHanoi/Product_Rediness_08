/**
 * §RACSIDE144 (L-12364) — "make all walls white paint" answered *"There is no
 * wall type called 'white paint' in this project… I searched compass
 * orientations, colours, levels, rooms or wall types."*
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * That refusal is TRUE about what ran and FALSE about what it implies: it
 * never tried the FINISH table at all, and "white paint" resolves cleanly to
 * `Paint · Matte White` in `finishRef.ts`. `QualifierAxes.ts` exists precisely
 * to catch this shape ("the resolver picks ONE axis, fails, and reports its
 * inventory as the whole vocabulary") — the 'finish' axis was simply missing
 * from its own table, a second instance of the module's own founding defect.
 *
 * This file drives a sentence that reaches `matchWallType`'s catch-all
 * DELIBERATELY (verb "switch" is in `WALL_TYPE_VERB` but not in
 * `WallSideFinishIntent`'s `FINISH_VERB`, so this specific phrasing is NOT
 * claimed by the fixed wall-finish grammar and is the genuine residual case
 * the finish axis exists for) — proving the axis fix independently of the
 * grammar fix in `wall-side-finish.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveUtterance,
  type ResolverContext,
  type ZeroTokenResolution,
} from '../src/intents/ZeroTokenResolver.js';
import { resolveNaturalLanguage } from '../src/intents/LocalNaturalLanguageResolver.js';
import { resolveCompoundUtterance } from '../src/intents/SemanticPlan.js';
import type { ScopeDescriptor, ScopeResult } from '../src/intents/ScopeDescriptor.js';

let seq = 0;
function ctxOf(overrides: Partial<ResolverContext> = {}): ResolverContext {
  return {
    selection: [],
    levels: [{ id: 'L0', name: 'Ground', elevation: 0 }],
    activeLevelId: 'L0',
    mintId: () => `rs144-${++seq}`,
    ...overrides,
  } as ResolverContext;
}

function stubScope(n: number): (d: ScopeDescriptor) => ScopeResult {
  return () => ({
    ids: Array.from({ length: n }, (_, i) => `w-${i}`),
    kindCounts: {},
    skipped: [],
    diagnostics: ['Ground'],
  });
}

function resolveFull(utterance: string, ctx: ResolverContext): ZeroTokenResolution {
  const plan = resolveCompoundUtterance(utterance, ctx);
  if (plan !== null) return plan;
  const tier01 = resolveUtterance(utterance, ctx);
  if (tier01.kind !== 'miss') return tier01;
  const nl = resolveNaturalLanguage(utterance, ctx);
  if (nl.kind === 'resolved') return nl.resolution;
  return { kind: 'miss' };
}

describe("§RACSIDE144 — the wall-TYPE refusal now honestly searches materials too", () => {
  it('"switch all walls to white paint" reaches set-wall-type, and its refusal REDIRECTS to the real finish', () => {
    const r = resolveFull(
      'switch all walls to white paint',
      ctxOf({ resolveScope: stubScope(3), resolveWallSystemType: () => null }),
    );
    expect(r.kind, `resolved as ${r.kind}`).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('white paint');
    // The redirect names the REAL material, not a generic "try again".
    expect(r.reason).toContain('Paint · Matte White');
    expect(r.reason.toLowerCase()).toContain('different property from the wall type');
  });

  it('a genuinely unresolvable word now lists FINISHES among the searched axes (was silently skipped before)', () => {
    const r = resolveFull(
      'switch all walls to unobtainium123',
      ctxOf({ resolveScope: stubScope(3), resolveWallSystemType: () => null }),
    );
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason.toLowerCase()).toContain('finishes');
  });
});
