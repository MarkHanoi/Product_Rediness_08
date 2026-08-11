// RAC U9.2 — the SAFE DESTRUCTIVE tranche, pinned.
//
// What these tests exist to stop is not "delete is broken" — it is the four
// properties that make a destructive verb shippable at all quietly eroding:
// the Confirm card, the REAL count, the empty-scope refusal, and the single
// dispatch. Each has its own test, and each would be silently lost by an
// otherwise-reasonable refactor.

import { describe, it, expect } from 'vitest';
import {
  applySemanticIntent,
  resolveUtterance,
  type ResolverContext,
  type SemanticIntent,
} from '../src/intents/ZeroTokenResolver.js';
import { parseDeleteScopedIntent, DELETE_FAMILIES } from '../src/intents/DeleteFamilies.js';
import { EXECUTION_SPECS } from '../src/intents/CapabilityExecutionSpec.js';
import type { ScopeDescriptor, ScopeResult } from '../src/intents/ScopeDescriptor.js';

let seq = 0;
function ctxOf(overrides: Partial<ResolverContext> = {}): ResolverContext {
  return {
    selection: [],
    levels: [
      { id: 'L0', name: 'Level 0', elevation: 0 },
      { id: 'L1', name: 'Level 1', elevation: 3 },
      { id: 'L2', name: 'Level 2', elevation: 6 },
    ],
    activeLevelId: 'L0',
    mintId: () => `del-${++seq}`,
    ...overrides,
  } as ResolverContext;
}

/** A resolver that hands back `n` ids for whatever it is asked. */
function stubScope(n: number, diagnostic = 'Level 1'): (d: ScopeDescriptor) => ScopeResult {
  return () => ({
    ids: Array.from({ length: n }, (_, i) => `id-${i}`),
    kindCounts: {},
    skipped: [],
    diagnostics: [diagnostic],
  });
}

describe('RAC U9.2 — the delete families are GENERATED, not hand-written', () => {
  it('every family has an execution spec that is destructive AND count-bound', () => {
    for (const family of DELETE_FAMILIES) {
      const spec = EXECUTION_SPECS[family.intent];
      expect(spec, family.intent).toBeDefined();
      // The two halves of "safe destructive". Losing either one is the whole
      // reason this test exists: `destructive: false` drops the Confirm card,
      // and `requireResolvedIds: false` lets the card show no number.
      expect(spec.destructive, `${family.intent} must show a Confirm card`).toBe(true);
      expect(spec.requireResolvedIds, `${family.intent} must resolve a real count`).toBe(true);
      expect(spec.busCommand, family.intent).toBe('element.deleteBatch');
      expect(spec.idsField, family.intent).toBe('elementIds');
    }
  });
});

describe('RAC U9.2 — the grammar claims places, never guesses', () => {
  it('claims the project-wide, level, active-level and room forms', () => {
    const cases: ReadonlyArray<[string, string]> = [
      ['delete all furniture', 'delete-furniture-scoped'],
      ['delete all furniture in the kitchen', 'delete-furniture-scoped'],
      ['clear the furniture on this floor', 'delete-furniture-scoped'],
      ['remove every window on level 2', 'delete-windows-scoped'],
      ['delete all doors on level 2', 'delete-doors-scoped'],
      ['remove every column', 'delete-columns-scoped'],
    ];
    for (const [text, intent] of cases) {
      const si = parseDeleteScopedIntent(text, ctxOf());
      expect(si?.intent, text).toBe(intent);
    }
  });

  it('"on this floor" resolves to the ACTIVE level by NAME', () => {
    const si = parseDeleteScopedIntent('clear the furniture on this floor', ctxOf());
    expect(si).not.toBeNull();
    expect((si as { scope: unknown }).scope).toEqual({ kind: 'level', levelQuery: 'Level 0' });
  });

  it('"on this floor" is NOT claimed when the context has no active level', () => {
    // Failure and empty are the same value (§CONTEXT-DATA-HONESTY): without an
    // active level, "this floor" names nothing, and a destructive verb may not
    // pick one.
    const si = parseDeleteScopedIntent(
      'clear the furniture on this floor',
      ctxOf({ activeLevelId: undefined }),
    );
    expect(si).toBeNull();
  });

  it('an under-specified "delete the furniture" is NOT claimed', () => {
    expect(parseDeleteScopedIntent('delete the furniture', ctxOf())).toBeNull();
  });

  it('the SELECTION ask still belongs to delete-selected, not to a family', () => {
    // Two capabilities for one sentence is the defect the RAC registry exists
    // to remove; the scoped grammar deliberately declines these.
    expect(parseDeleteScopedIntent('delete the selected furniture', ctxOf())).toBeNull();
    const r = resolveUtterance('delete selected', ctxOf({
      selection: [{ elementId: 'w1', elementType: 'wall' }],
    }));
    expect(r.kind !== 'miss' && r.intent).toBe('delete-selected');
  });

  it('a FILTER composes with the place, with no grammar of its own', () => {
    const si = parseDeleteScopedIntent('delete all windows smaller than 2 m2 on level 2', ctxOf());
    expect(si?.intent).toBe('delete-windows-scoped');
    const scope = (si as { scope: { kind: string; base: unknown; filters: unknown[] } }).scope;
    expect(scope.kind).toBe('filter');
    expect(scope.base).toEqual({ kind: 'level', levelQuery: '2' });
    expect(scope.filters).toHaveLength(1);
  });
});

describe('RAC U9.2 — the Confirm card states a REAL count and the kinds', () => {
  it('the founder sentence produces the card copy verbatim', () => {
    const r = applySemanticIntent(
      { intent: 'delete-furniture-scoped', scope: { kind: 'level', levelQuery: '1' } } as SemanticIntent,
      ctxOf({ resolveScope: stubScope(42, 'Level 1') }),
    );
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.summary).toBe('This deletes all 42 furniture items on Level 1. Nothing else changes.');
    expect(r.destructive).toBe(true);
    // ONE dispatch — the provable half of "one undo entry".
    expect(r.commands).toHaveLength(1);
    expect(r.commands[0]!.type).toBe('element.deleteBatch');
    expect((r.commands[0]!.payload as { elementIds: string[] }).elementIds).toHaveLength(42);
  });

  it('the plural is the FAMILY\'s, never "furnitures"', () => {
    const r = applySemanticIntent(
      { intent: 'delete-furniture-scoped', scope: 'all' } as SemanticIntent,
      ctxOf({ resolveScope: stubScope(3) }),
    );
    expect(r.kind === 'commands' && r.summary).toContain('3 furniture items');
    expect(r.kind === 'commands' && r.summary).not.toContain('furnitures');
  });

  it('a project-wide delete NEVER forwards the unbounded \'all\' payload', () => {
    const r = applySemanticIntent(
      { intent: 'delete-windows-scoped', scope: 'all' } as SemanticIntent,
      ctxOf({ resolveScope: stubScope(7) }),
    );
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    const ids = (r.commands[0]!.payload as { elementIds: unknown }).elementIds;
    expect(ids).not.toBe('all');
    expect(Array.isArray(ids) && ids.length).toBe(7);
  });
});

describe('RAC U9.2 — refusals rather than cheerful no-ops', () => {
  it('an EMPTY scope refuses and names the place', () => {
    const empty: (d: ScopeDescriptor) => ScopeResult =
      () => ({ ids: [], kindCounts: {}, skipped: [], diagnostics: ['Level 2'] });
    const r = applySemanticIntent(
      { intent: 'delete-windows-scoped', scope: { kind: 'level', levelQuery: '2' } } as SemanticIntent,
      ctxOf({ resolveScope: empty }),
    );
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('level 2');
    expect(r.reason).toContain('nothing was changed');
  });

  it('an UNRESOLVABLE scope quotes the resolver\'s own copy', () => {
    const err: (d: ScopeDescriptor) => ScopeResult =
      () => ({ error: 'No level called "9" — the levels here are: Level 0, Level 1, Level 2.' });
    const r = applySemanticIntent(
      { intent: 'delete-doors-scoped', scope: { kind: 'level', levelQuery: '9' } } as SemanticIntent,
      ctxOf({ resolveScope: err }),
    );
    expect(r.kind === 'refusal' && r.reason).toContain('Level 2');
  });

  it('NO scope resolver refuses rather than widening to the whole project', () => {
    // The dangerous failure this guards: silently treating an unresolvable
    // "all" as "every element", and deleting the model.
    const r = applySemanticIntent(
      { intent: 'delete-columns-scoped', scope: 'all' } as SemanticIntent,
      ctxOf(),
    );
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain("won't run a delete without telling you how many first");
  });
});
