// RAC Phase U8 — FILTER scopes: the grammar, the composition, the honest
// refusals. (ADR-0315 §U8; C03 §semantic intents; §CONTEXT-DATA-HONESTY.)
//
// What these tests are FOR: the founder types a sentence with a number in it
// ("every wall thicker than 300 mm"), and three things must be true at once —
// the predicate is understood, it COMPOSES with the spatial scope words that
// already worked, and a predicate that matches nothing comes back quoting the
// real extremum instead of "no". The first two are pure and tested here
// directly; the third is tested through the generic arm with a stub resolver
// standing in for the editor-side store reads.

import { describe, it, expect } from 'vitest';
import {
  describeFilters,
  filterRefusalCopy,
  formatFilterValue,
  parseFilterClauses,
} from '../src/intents/FilterScope.js';
import type {
  ElementFilter,
  FilterStat,
  IntentFilterScope,
  PropertyFilter,
  ScopeDescriptor,
  ScopeResult,
} from '../src/intents/ScopeDescriptor.js';
import {
  applySemanticIntent,
  parseWallColorIntent,
  parseWallRakeIntent,
  parseWallTypeIntent,
  parseDoorTypeIntent,
  type ResolverContext,
} from '../src/intents/ZeroTokenResolver.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const LEVELS = [
  { id: 'L0', name: 'Level 0', elevation: 0 },
  { id: 'L1', name: 'Level 1', elevation: 3 },
  { id: 'L2', name: 'Level 2', elevation: 6 },
];

const WALL_TYPES = [
  { id: 'wt-int-part', name: 'Interior – Partition' },
  { id: 'wt-ext', name: 'Exterior – Brick' },
];

function ctx(over: Partial<ResolverContext> = {}): ResolverContext {
  return {
    selection: [],
    levels: LEVELS,
    resolveWallSystemType: (ref) =>
      WALL_TYPES.find((t) => t.id === ref || t.name.toLowerCase() === ref.toLowerCase()) ?? null,
    wallSystemTypeNames: WALL_TYPES.map((t) => t.name),
    ...over,
  } as ResolverContext;
}

/** A stub for the editor-side resolver: records what it was ASKED, answers
 *  with what the caller staged. The point of the stub is that the pure layer
 *  must never read a store — it only ever calls this. */
function stubScope(answer: ScopeResult): {
  resolveScope: (s: ScopeDescriptor) => ScopeResult;
  seen: ScopeDescriptor[];
} {
  const seen: ScopeDescriptor[] = [];
  return {
    seen,
    resolveScope: (s) => { seen.push(s); return answer; },
  };
}

const prop = (f: ElementFilter): PropertyFilter => f as PropertyFilter;

// ─── U8.1 — the grammar ──────────────────────────────────────────────────────

describe('U8.1 parseFilterClauses — comparative adjectives', () => {
  it('lifts "thicker than 300 mm" and converts to SI, keeping the spoken unit', () => {
    const r = parseFilterClauses('every wall thicker than 300 mm', 'wall');
    expect(r.filters).toHaveLength(1);
    expect(prop(r.filters[0]!)).toMatchObject({
      kind: 'property', property: 'thickness', op: 'gt', value: 0.3, unit: 'mm',
    });
    expect(r.stripped).toBe('every wall');
  });

  it('lifts "larger than 2 m²" as an AREA predicate', () => {
    const r = parseFilterClauses('all windows larger than 2 m²', 'window');
    expect(prop(r.filters[0]!)).toMatchObject({ property: 'area', op: 'gt', value: 2, unit: 'm2' });
    expect(r.stripped).toBe('all windows');
  });

  it('lifts "narrower than 900mm" as a WIDTH predicate', () => {
    const r = parseFilterClauses('all doors narrower than 900mm on level 2', 'door');
    expect(prop(r.filters[0]!)).toMatchObject({ property: 'width', op: 'lt', value: 0.9, unit: 'mm' });
    // The spatial phrase SURVIVES the lift — that is what makes composition free.
    expect(r.stripped).toBe('all doors on level 2');
  });

  it('understands the noun form, including "at least" and "below"', () => {
    expect(prop(parseFilterClauses('all walls with a height of at least 3 m', 'wall').filters[0]!))
      .toMatchObject({ property: 'height', op: 'gte', value: 3 });
    expect(prop(parseFilterClauses('all windows with a sill below 900 mm', 'window').filters[0]!))
      .toMatchObject({ property: 'sillHeight', op: 'lt', value: 0.9 });
  });

  it('understands a RANGE', () => {
    const f = prop(parseFilterClauses('all rooms with an area between 15 and 25 m²', 'room').filters[0]!);
    expect(f).toMatchObject({ property: 'area', op: 'between', value: 15, upper: 25 });
  });

  it('does NOT claim a unit that contradicts its property (§CONTEXT-DATA-HONESTY)', () => {
    // "larger than 2 m" for an area predicate is a coin-flip between area and
    // a linear dimension. A coin-flip is exactly what must not be minted.
    const r = parseFilterClauses('all windows larger than 2 m', 'window');
    expect(r.filters).toHaveLength(0);
    expect(r.stripped).toBe('all windows larger than 2 m');
  });

  it('lifts a TYPE adjective only when the injected catalogue claims it', () => {
    const known = parseFilterClauses(
      'make all interior – partition walls white', 'wall',
      (ref) => WALL_TYPES.find((t) => t.name.toLowerCase() === ref.toLowerCase()) ?? null,
    );
    expect(known.filters).toEqual([
      { kind: 'type', typeId: 'wt-int-part', label: 'Interior – Partition' },
    ]);
    expect(known.stripped).toBe('make all walls white');

    // "south-facing" is not a wall type — the words stay in the sentence and
    // the orientation grammar goes on reading them.
    const unknown = parseFilterClauses('make all south-facing walls white', 'wall', () => null);
    expect(unknown.filters).toHaveLength(0);
    expect(unknown.stripped).toBe('make all south-facing walls white');
  });

  it('lifts TWO predicates from one sentence', () => {
    const r = parseFilterClauses('all walls thicker than 200 mm and taller than 3 m', 'wall');
    expect(r.filters.map((f) => prop(f).property)).toEqual(['thickness', 'height']);
  });
});

// ─── U8.1 — composition with the shipped scopes ──────────────────────────────

describe('U8.1 filter × level × room × orientation compose', () => {
  it('paints filtered walls on a level', () => {
    const si = parseWallColorIntent('make all walls thicker than 300 mm on level 2 white', ctx());
    expect(si).not.toBeNull();
    const scope = si!.scope as IntentFilterScope;
    expect(scope.kind).toBe('filter');
    expect(scope.base).toEqual({ kind: 'level', levelQuery: '2' });
    expect(prop(scope.filters[0]!)).toMatchObject({ property: 'thickness', op: 'gt', value: 0.3 });
  });

  it('composes with ORIENTATION', () => {
    const si = parseWallColorIntent('paint all south-facing walls longer than 4 m white', ctx());
    const scope = si!.scope as IntentFilterScope;
    expect(scope.base).toEqual({ kind: 'orientation', orientation: 'S' });
    expect(prop(scope.filters[0]!).property).toBe('length');
  });

  it('composes with ROOM', () => {
    const si = parseWallColorIntent('paint all walls thinner than 150 mm in the kitchen white', ctx());
    const scope = si!.scope as IntentFilterScope;
    expect(scope.base).toEqual({ kind: 'room', roomRef: 'kitchen' });
  });

  it('composes with the RAKE grammar', () => {
    const si = parseWallRakeIntent('make all walls thicker than 200 mm angled by 70 degrees', ctx());
    expect(si!.angleDeg).toBe(70);
    expect((si!.scope as IntentFilterScope).kind).toBe('filter');
  });

  it('composes with the TYPE grammar and a TYPE predicate', () => {
    const si = parseWallTypeIntent('change all interior – partition walls to exterior – brick', ctx());
    const scope = si!.scope as IntentFilterScope;
    expect(si!.typeRef).toBe('exterior – brick');
    expect(scope.filters).toEqual([
      { kind: 'type', typeId: 'wt-int-part', label: 'Interior – Partition' },
    ]);
  });

  it('gives the hosted-type grammars level scope AND filters', () => {
    const si = parseDoorTypeIntent('change all doors narrower than 900 mm on level 2 to fire door', ctx());
    const scope = si!.scope as IntentFilterScope;
    expect(si!.typeRef).toBe('fire door');
    expect(scope.base).toEqual({ kind: 'level', levelQuery: '2' });
    expect(prop(scope.filters[0]!)).toMatchObject({ property: 'width', op: 'lt', value: 0.9 });
  });

  it('leaves an unfiltered sentence byte-identical to what U3 produced', () => {
    expect(parseWallColorIntent('make all walls on level 2 white', ctx())!.scope)
      .toEqual({ kind: 'level', levelQuery: '2' });
    expect(parseWallColorIntent('make all walls white', ctx())!.scope).toBe('all');
    expect(parseWallColorIntent('make the selected walls white', ctx())!.scope).toBe('selection');
  });
});

// ─── U8.2/U8.3 — resolution, summaries and refusals through the generic arm ──

describe('U8.2/U8.3 the filter reaches the resolver and the copy quotes it', () => {
  it('hands the injected resolver ONE filter descriptor carrying the element kind', () => {
    const stub = stubScope({
      ids: ['w1', 'w2'], kindCounts: { wall: 2 }, skipped: [], diagnostics: ['Level 2'],
    });
    const si = parseWallColorIntent('make all walls thicker than 300 mm on level 2 white', ctx())!;
    const out = applySemanticIntent(si, ctx({ resolveScope: stub.resolveScope }));
    expect(stub.seen).toHaveLength(1);
    expect(stub.seen[0]).toMatchObject({
      kind: 'filter',
      elementKind: 'wall',
      base: { kind: 'level', levelQuery: '2', elementKind: 'wall' },
    });
    expect(out.kind).toBe('commands');
    if (out.kind !== 'commands') return;
    // The summary QUOTES the filter — the user must be able to see what set
    // he is about to change before he confirms it.
    expect(out.summary).toBe('Paint all 2 walls on Level 2 thicker than 300 mm white');
    expect(out.commands[0]!.type).toBe('wall.updateColorBatch');
    expect(out.commands[0]!.payload).toMatchObject({ wallIds: ['w1', 'w2'] });
  });

  it('reports SKIPPED records with their reason in the summary tail', () => {
    const stub = stubScope({
      ids: ['w1'],
      kindCounts: { wall: 1 },
      skipped: [{ kind: 'wall', count: 3, reason: 'no recorded thickness' }],
      diagnostics: ['Level 2'],
      filterStats: [],
    });
    const si = parseWallColorIntent('make all walls thicker than 300 mm on level 2 white', ctx())!;
    const out = applySemanticIntent(si, ctx({ resolveScope: stub.resolveScope }));
    if (out.kind !== 'commands') throw new Error('expected commands');
    expect(out.summary).toContain('(3× wall skipped: no recorded thickness)');
  });

  it('REFUSES with the real extremum when nothing matches (the founder case)', () => {
    const stats: FilterStat[] = [{
      property: 'thickness', considered: 12, missing: 0,
      max: 0.25, min: 0.1, maxLabel: 'Interior – Partition', minLabel: 'Interior – Partition',
    }];
    const stub = stubScope({ ids: [], kindCounts: {}, skipped: [], diagnostics: [], filterStats: stats });
    const si = parseWallColorIntent('make all walls thicker than 300 mm white', ctx())!;
    const out = applySemanticIntent(si, ctx({ resolveScope: stub.resolveScope }));
    expect(out.kind).toBe('refusal');
    if (out.kind !== 'refusal') return;
    expect(out.reason).toBe(
      'No wall is thicker than 300 mm — the thickest is 250 mm (Interior – Partition). Nothing was changed.',
    );
  });

  it('says it could not CHECK when no record carried the property', () => {
    const stats: FilterStat[] = [{
      property: 'area', considered: 0, missing: 3,
      max: null, min: null, maxLabel: null, minLabel: null,
    }];
    expect(filterRefusalCopy('window', [
      { kind: 'property', property: 'area', op: 'gt', value: 2, unit: 'm2' },
    ], stats, 'on level 2')).toBe(
      'No window on level 2 is larger than 2 m² — and I could not check: ' +
      '3 windows have no recorded area. Nothing was changed.',
    );
  });

  it('a filtered SELECTION sentence hits the same empty-selection gate a plain one does', () => {
    // Founder doctrine: a filtered sentence may never bypass a gate a plain
    // one would hit. With nothing selected, the answer is the capability's
    // own no-selection copy — not "no wall matched your filter".
    const stub = stubScope({ ids: [], kindCounts: {}, skipped: [], diagnostics: [] });
    const si = parseWallColorIntent('make the selected walls thicker than 300 mm white', ctx())!;
    const out = applySemanticIntent(si, ctx({ resolveScope: stub.resolveScope, selection: [] }));
    expect(out.kind).toBe('refusal');
    if (out.kind !== 'refusal') return;
    expect(out.reason).toContain('No walls are selected');
    // The resolver was never called — the gate came first.
    expect(stub.seen).toHaveLength(0);
  });

  it('refuses honestly when spatial scoping is not wired at all', () => {
    const si = parseWallColorIntent('make all walls thicker than 300 mm white', ctx())!;
    const out = applySemanticIntent(si, ctx());
    expect(out.kind).toBe('refusal');
    if (out.kind !== 'refusal') return;
    expect(out.reason).toContain('thicker than 300 mm');
  });
});

// ─── Copy ────────────────────────────────────────────────────────────────────

describe('U8.3 copy quotes values in the unit the user spoke', () => {
  it('round-trips mm / m / m²', () => {
    expect(formatFilterValue(0.3, 'mm')).toBe('300 mm');
    expect(formatFilterValue(0.3, 'm')).toBe('0.3 m');
    expect(formatFilterValue(2, 'm2')).toBe('2 m²');
  });

  it('joins several predicates the way a person says them', () => {
    expect(describeFilters([
      { kind: 'property', property: 'thickness', op: 'gt', value: 0.2, unit: 'mm' },
      { kind: 'property', property: 'height', op: 'gt', value: 3, unit: 'm' },
      { kind: 'type', typeId: 'wt-int-part', label: 'Interior – Partition' },
    ])).toBe('thicker than 200 mm, taller than 3 m and of type "Interior – Partition"');
  });
});
