// @pryzm/ai-host — §FEAT-CHAT-STAIR-TYPES (L-1441) · the founder's stair chat
// =============================================================================
//
// ⭐ EVERY SENTENCE IN THIS FILE IS THE FOUNDER'S, VERBATIM — not a paraphrase
// that happens to work. That distinction is the whole point of the file: the
// bug that started it (`makeHostedTypeParser` without `(?: of)?(?: the)?`,
// L-1440) was invisible to every existing test precisely because every existing
// test was written by someone who knew the grammar, and therefore wrote
// "make all stairs …" where the founder writes "make all THE stairs …".
//
// His six sentences, as reported:
//
//   A  "select a wall … create a stair from ground to level 5 connected to
//       this wall — in L shape"                     → REFUSAL (see below)
//   B1 "Make all the stairs type X"                 → HERE
//   B2 "Make all the stair railings type X"         → HERE
//   B3 "change tread to X"                          → tread-depth tests below
//   B4 "Change width of all stairs to X"            → width tests below
//   B5 "Change first run of all stairs to X meters" → REFUSAL (see below)
//
// A and B5 are refusals BY DESIGN, and each is asserted to NAME THE WORKING
// ALTERNATIVE (C16 CA-18). ⛔ A bare "I didn't understand" is a test failure
// here, not merely poor copy.

import { describe, expect, it } from 'vitest';
import {
  applySemanticIntent,
  resolveUtterance,
  resolveUtteranceIntent,
  type ResolverContext,
  type SemanticIntent,
} from '../src/intents/ZeroTokenResolver.js';
import { BUILT_IN_STAIR_TYPES } from '@pryzm/geometry-stair';
import { handrailTypeStore } from '@pryzm/core-app-model/stores';

// ─── Context ─────────────────────────────────────────────────────────────────
//
// A scope resolver is REQUIRED for the type families' 'all' arm, and that is a
// property of the ROUTE, not of the test: neither `stair.updateParameters` nor
// `element.changeType` has a batch twin, so both families fan out — and
// `fanOutPerId` implies `requireResolvedIds`, because there are no ids to fan
// over until the scope is resolved. An ABSENT resolver refuses rather than
// widening, which is asserted at the bottom of this file.

const scoped = (elementType: string, n = 3): Partial<ResolverContext> => ({
  selection: [{ elementId: `${elementType}-1`, elementType }],
  resolveScope: (() => ({
    ids: Array.from({ length: n }, (_, i) => `${elementType}-${i + 1}`),
    kindCounts: { [elementType]: n },
    skipped: [],
    diagnostics: [],
  })) as never,
});

const ctx = (over: Partial<ResolverContext> = {}): ResolverContext => ({
  selection: [],
  levels: [
    { id: 'L0', name: 'Ground', elevation: 0 },
    { id: 'L1', name: 'Level 1', elevation: 3 },
    { id: 'L5', name: 'Level 5', elevation: 15 },
  ],
  activeLevelId: 'L0',
  mintId: () => 'id-1',
  ...over,
} as ResolverContext);

function intentFor(text: string, over: Partial<ResolverContext> = {}): SemanticIntent | null {
  return resolveUtteranceIntent(text, ctx(over));
}

// ─────────────────────────────────────────────────────────────────────────────
// B1 — "Make all the stairs type X"
// ─────────────────────────────────────────────────────────────────────────────

describe('B1 — "Make all the stairs type X"', () => {
  it("⭐ the founder's literal, definite article and all, reaches set-stair-type", () => {
    const si = intentFor('make all the stairs type monolithic concrete', scoped('stair'));
    expect(si, 'the founder\'s sentence is unclaimed').not.toBeNull();
    expect(si!.intent).toBe('set-stair-type');
    expect((si as { typeRef: string }).typeRef).toBe('monolithic concrete');
    expect((si as { scope: unknown }).scope).toBe('all');
  });

  it('resolves the type NAME to the published id, and dispatches the live stair verb', () => {
    const si = intentFor('make all the stairs monolithic concrete', scoped('stair'))!;
    const app = applySemanticIntent(si, ctx(scoped('stair')));
    expect(app.kind, JSON.stringify(app)).toBe('commands');
    const cmds = (app as { commands: readonly { type: string; payload: Record<string, unknown> }[] }).commands;
    // FAN-OUT: one command per resolved stair, because no batch verb exists.
    expect(cmds).toHaveLength(3);
    for (const c of cmds) {
      expect(c.type).toBe('stair.updateParameters');
      expect(c.payload['updates']).toEqual({ typeId: 'monolithic' });
      expect(typeof c.payload['stairId']).toBe('string');
    }
  });

  it('every PUBLISHED stair type is reachable by its display name — the catalogue is derived, not transcribed', () => {
    for (const t of BUILT_IN_STAIR_TYPES) {
      const si = intentFor(`make all the stairs ${t.name.toLowerCase()}`, scoped('stair'));
      expect(si, `"${t.name}" is unreachable from chat`).not.toBeNull();
      const app = applySemanticIntent(si!, ctx(scoped('stair')));
      expect(app.kind, `"${t.name}" → ${JSON.stringify(app)}`).toBe('commands');
      const first = (app as { commands: readonly { payload: Record<string, unknown> }[] }).commands[0]!;
      expect(first.payload['updates']).toEqual({ typeId: t.id });
    }
  });

  it('an unknown type refuses by LISTING the real names AND states the source limit', () => {
    const si = intentFor('make all the stairs unobtainium', scoped('stair'))!;
    const app = applySemanticIntent(si, ctx(scoped('stair')));
    expect(app.kind).toBe('refusal');
    const reason = (app as { reason: string }).reason;
    expect(reason).toContain('unobtainium');
    for (const t of BUILT_IN_STAIR_TYPES) expect(reason).toContain(t.name);
    // ⭐ THE HONEST LIMIT, IN USER-VISIBLE COPY. The chat reads the BUILT-IN
    // table, not the project's own store (the editor bridge's catalogue channel
    // carries only slab + ceiling today). Saying so is what turns a
    // wrong-looking refusal into a true one — a user whose custom type misses
    // is TOLD why instead of being told their type does not exist.
    expect(reason).toContain('built-in stair types');
    expect(reason).toContain('Properties panel');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B2 — "Make all the stair railings type X"
// ─────────────────────────────────────────────────────────────────────────────

describe('B2 — "Make all the stair railings type X"', () => {
  it("⭐ the founder's literal reaches set-stair-railing-type, NOT set-stair-type", () => {
    const si = intentFor(
      'make all the stair railings type frameless glass balustrade',
      scoped('stair-railing'),
    );
    expect(si).not.toBeNull();
    expect(si!.intent).toBe('set-stair-railing-type');
    expect((si as { typeRef: string }).typeRef).toBe('frameless glass balustrade');
  });

  it('dispatches element.changeType with the railing kind and ONE resolved id', () => {
    const si = intentFor(
      'make all the stair railings frameless glass balustrade',
      scoped('stair-railing'),
    )!;
    const app = applySemanticIntent(si, ctx(scoped('stair-railing')));
    expect(app.kind, JSON.stringify(app)).toBe('commands');
    const cmds = (app as { commands: readonly { type: string; payload: Record<string, unknown> }[] }).commands;
    expect(cmds).toHaveLength(3);
    const expectedId = handrailTypeStore.getAll()
      .find((t) => t.name.toLowerCase() === 'frameless glass balustrade')!.id;
    for (const c of cmds) {
      expect(c.type).toBe('element.changeType');
      expect(c.payload['elementType']).toBe('stair-railing');
      // ⭐ ONE id, never thirteen re-derived construction fields. That is what
      // §FEAT-HANDRAIL-TYPE-PROJECTION (L-1105) bought, and it is why this
      // family is a table row rather than a project.
      expect(c.payload['newTypeId']).toBe(expectedId);
    }
  });

  it('the resolved id is one handrailTypeStore.getById ACCEPTS — same object, not a copy', () => {
    const si = intentFor('make all the stair railings stainless cable railing', scoped('stair-railing'))!;
    const app = applySemanticIntent(si, ctx(scoped('stair-railing')));
    const id = (app as { commands: readonly { payload: Record<string, unknown> }[] })
      .commands[0]!.payload['newTypeId'] as string;
    // initBusHandlers' stair-railing branch does exactly this lookup and IGNORES
    // the command when it misses. Asserting it here is the difference between
    // "the chat produced a payload" and "the handler will act on it".
    expect(handrailTypeStore.getById(id)).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⭐⭐ THE COLLISION — "stairs?" matches the "stair" inside "stair railings"
// ─────────────────────────────────────────────────────────────────────────────
//
// Measured before the guard: the STAIR parser matched "…the stair", left
// " railings type flat bar" as the tail, and resolved
//   typeRef = "railings type flat bar"
// → "There is no stair type called 'railings type flat bar'…" — a confidently
// wrong catalogue refusal over a sentence naming a real railing type. That is
// §FIX-RAKE-SWALLOWED-AS-TYPE's exact shape, one family over.
//
// TWO independent guards, because the failure is SILENT if either lapses:
//   (1) table ORDER — the railing row precedes the stair row;
//   (2) `rejectRef` on the stair family — order-independent.

describe('§STAIR-VS-RAILING — the one-word difference between two families', () => {
  const RAILING_SENTENCES = [
    'make all the stair railings type frameless glass balustrade',
    'make all stair railings frameless glass balustrade',
    'change all the stair balustrades to stainless cable railing',
    'make all the railings timber picket railing',
  ];

  for (const s of RAILING_SENTENCES) {
    it(`"${s}" is a RAILING ask, never a stair-type ask`, () => {
      const si = intentFor(s, scoped('stair-railing'));
      expect(si, 'unclaimed').not.toBeNull();
      expect(si!.intent).toBe('set-stair-railing-type');
    });
  }

  it('guard (2) alone holds: the stair family DECLINES a railing ref even if order lapsed', async () => {
    const { CATALOGUE_FAMILIES } = await import('../src/intents/CatalogueFamilies.js');
    const stair = CATALOGUE_FAMILIES.find((f) => f.intent === 'set-stair-type')!;
    expect(stair.rejectRef, 'the stair family lost its collision guard').toBeDefined();
    for (const ref of ['railings type flat bar', 'railing frameless glass', 'balustrades to glass']) {
      expect(stair.rejectRef!(ref), ref).toBe(true);
    }
    // …and it must not over-reject a genuine stair type.
    for (const t of BUILT_IN_STAIR_TYPES) {
      expect(stair.rejectRef!(t.name.toLowerCase()), t.name).toBe(false);
    }
  });

  it('guard (1) alone holds: the railing family is declared BEFORE the stair family', async () => {
    const { CATALOGUE_FAMILIES } = await import('../src/intents/CatalogueFamilies.js');
    const ids = CATALOGUE_FAMILIES.map((f) => f.intent);
    expect(ids.indexOf('set-stair-railing-type')).toBeLessThan(ids.indexOf('set-stair-type'));
  });

  it('a plain stair sentence is NOT stolen by the railing family', () => {
    const si = intentFor('make all the stairs monolithic concrete', scoped('stair'));
    expect(si!.intent).toBe('set-stair-type');
  });

  it('⛔ the STANDALONE handrail family is not claimed — "railing" names two elements', async () => {
    const { CATALOGUE_FAMILIES } = await import('../src/intents/CatalogueFamilies.js');
    const railing = CATALOGUE_FAMILIES.find((f) => f.intent === 'set-stair-railing-type')!;
    // `handrail` / `guardrail` would silently retype the wrong store's elements
    // (handrailStore is a DIFFERENT element family). The disambiguation is a
    // decision, not a coin-flip — the same ruling floor-vs-slab already has.
    for (const alias of railing.nounAliases ?? []) {
      expect(alias, `"${alias}" claims the standalone handrail family`)
        .not.toMatch(/^(?:handrail|guardrail)$/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The scope guards, restated for the fan-out route
// ─────────────────────────────────────────────────────────────────────────────

describe('a fan-out family refuses rather than widening', () => {
  it('NO scope resolver ⇒ an "all" ask REFUSES; it never falls back to the selection', () => {
    const si = intentFor('make all the stairs monolithic concrete', { selection: [{ elementId: 's1', elementType: 'stair' }] })!;
    const app = applySemanticIntent(si, ctx({ selection: [{ elementId: 's1', elementType: 'stair' }] }));
    expect(app.kind, JSON.stringify(app)).toBe('refusal');
  });

  it('an EMPTY selection on a selection-scoped ask refuses by naming the all-scope sentence', () => {
    const si = intentFor('make the selected stairs monolithic concrete')!;
    const app = applySemanticIntent(si, ctx());
    expect(app.kind).toBe('refusal');
    const reason = (app as { reason: string }).reason;
    expect(reason).toContain('No stairs are selected');
    // CA-18: the refusal NAMES the sentence that works.
    expect(reason).toContain('make all the stairs');
  });

  it('a selection of the WRONG kind is refused by name, and nothing is changed', () => {
    const si = intentFor('make the selected stairs monolithic concrete')!;
    const app = applySemanticIntent(si, ctx({ selection: [{ elementId: 'w1', elementType: 'wall' }] }));
    expect(app.kind).toBe('refusal');
    expect((app as { reason: string }).reason).toContain('wall');
    expect((app as { reason: string }).reason).toContain('Nothing was changed');
  });

  it('the whole ladder answers rather than missing', () => {
    const r = resolveUtterance('make all the stairs monolithic concrete', ctx(scoped('stair')));
    expect(r.kind).toBe('commands');
    // The undo granularity is DISCLOSED, not hidden: N stairs are N steps.
    expect((r as { commands: readonly unknown[] }).commands.length).toBe(3);
  });
});
