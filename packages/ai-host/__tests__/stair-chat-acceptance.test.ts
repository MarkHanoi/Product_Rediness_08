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

// ─────────────────────────────────────────────────────────────────────────────
// B3 — "change tread to X"   (a bare attribute sentence, no element noun)
// ─────────────────────────────────────────────────────────────────────────────

describe('B3 — "change tread to X"', () => {
  const withStair = { selection: [{ elementId: 's1', elementType: 'stair' }] };

  it('⭐ the founder\'s literal — bare "tread", missing by ONE word before L-1443', () => {
    const si = intentFor('change tread to 280mm', withStair);
    expect(si, 'bare "tread" is still a miss').not.toBeNull();
    expect(si!.intent).toBe('set-tread-depth');
    expect((si as { value: number }).value).toBeCloseTo(0.28, 6);
  });

  it('the phrasings that already worked still work — nothing was traded away', () => {
    for (const t of ['change tread depth to 280mm', 'set the tread depth to 0.3m', 'change the going to 280mm']) {
      const si = intentFor(t, withStair);
      expect(si, t).not.toBeNull();
      expect(si!.intent, t).toBe('set-tread-depth');
    }
  });

  it('dispatches the LIVE stair carrier for the selected stair', () => {
    const si = intentFor('change tread to 280mm', withStair)!;
    const app = applySemanticIntent(si, ctx(withStair));
    expect(app.kind, JSON.stringify(app)).toBe('commands');
    const c = (app as { commands: readonly { type: string; payload: Record<string, unknown> }[] }).commands[0]!;
    expect(c.type).toBe('stair.updateParameters');
    expect(c.payload['updates']).toEqual({ treadDepth: 0.28 });
  });

  it('⛔ a bare "riser" is deliberately NOT claimed — it is genuinely ambiguous', () => {
    // riser HEIGHT vs riser COUNT are two asks with two units. Claiming the
    // bare word would mean guessing which; the noun keeps its meaning.
    expect(intentFor('change riser to 5', withStair)).toBeNull();
    // …and the unambiguous form still resolves.
    expect(intentFor('change riser height to 175mm', withStair)!.intent).toBe('set-riser-height');
  });

  it('with NOTHING selected it refuses and NAMES what to do (C16 CA-18)', () => {
    const si = intentFor('change tread to 280mm', withStair)!;
    const app = applySemanticIntent(si, ctx());
    expect(app.kind).toBe('refusal');
    const reason = (app as { reason: string }).reason;
    expect(reason.length).toBeGreaterThan(30);
    expect(reason.toLowerCase()).toContain('select');
  });

  it('⭐ a max-tread violation is refused in the AUTHORITY own words', () => {
    // Measured: UpdateStairParametersCommand checks treadDepth against
    // MIN_TREAD_DEPTH only — there is NO max check on that path, so "change
    // tread to 500mm" was written and reported as done. `checkStairGeometry`
    // is THE accept-set and does refuse it; the chat speaks its message.
    const si = intentFor('change tread to 500mm', withStair)!;
    const app = applySemanticIntent(si, ctx(withStair));
    expect(app.kind, JSON.stringify(app)).toBe('refusal');
    const reason = (app as { reason: string }).reason;
    expect(reason).toContain('500mm');
    expect(reason).toContain('360mm');   // the published MAX_TREAD_DEPTH
    expect(reason).toContain('Nothing was changed');
  });

  it('⛔ the type-DEPENDENT minima are NOT enforced here — no false refusals', () => {
    // `timber-closed` and `residential-timber` declare minTreadDepth 0.220
    // against a default of 0.250, and the resolver cannot see a stair's type.
    // Refusing 230mm here would be a false refusal minted by a safety check.
    const si = intentFor('change tread to 230mm', withStair)!;
    const app = applySemanticIntent(si, ctx(withStair));
    expect(app.kind, 'a legal timber tread was refused').toBe('commands');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B4 — "Change width of all stairs to X"   (the property leads)
// ─────────────────────────────────────────────────────────────────────────────

describe('B4 — "Change width of all stairs to X"', () => {
  it('⭐ the founder literal WORD ORDER — property first — reaches the stair family', () => {
    const si = intentFor('change width of all stairs to 1.2 meters', scoped('stair'));
    expect(si, 'property-first order is still unclaimed').not.toBeNull();
    expect(si!.intent).toBe('set-stair-dimensions');
    expect((si as { dims: Record<string, number> }).dims).toEqual({ width: 1.2 });
    expect((si as { scope: unknown }).scope).toBe('all');
  });

  it('⭐ the SAME order now works for walls, windows and doors — it was missing for them too', () => {
    expect(intentFor('change the height of all windows to 2m', scoped('window'))!.intent)
      .toBe('set-window-dimensions');
    expect(intentFor('change width of all doors to 900mm', scoped('door'))!.intent)
      .toBe('set-door-dimensions');
    expect(intentFor('set the height of all walls to 3m', scoped('wall'))!.intent)
      .toBe('set-wall-dimensions');
  });

  it('⛔ ONE extractor — a compound property-first tail composes with no extra grammar', () => {
    const si = intentFor('change width of all doors to 0.9m and height to 2.1m', scoped('door'))!;
    expect((si as { dims: Record<string, number> }).dims).toEqual({ width: 0.9, height: 2.1 });
  });

  it('the noun-first order is untouched', () => {
    const si = intentFor('make all stairs 1.2m wide', scoped('stair'))!;
    expect(si.intent).toBe('set-stair-dimensions');
    expect((si as { dims: Record<string, number> }).dims).toEqual({ width: 1.2 });
  });

  it('the scope word is still REQUIRED in the property-first order', () => {
    expect(intentFor('change width of stairs to 1.2m', scoped('stair'))).toBeNull();
  });

  it('dispatches ONE batch command with the resolved ids, and confirms a real count', () => {
    const si = intentFor('change width of all stairs to 1.2 meters', scoped('stair'))!;
    const app = applySemanticIntent(si, ctx(scoped('stair')));
    expect(app.kind, JSON.stringify(app)).toBe('commands');
    const cmds = (app as { commands: readonly { type: string; payload: Record<string, unknown> }[] }).commands;
    expect(cmds).toHaveLength(1);
    expect(cmds[0]!.type).toBe('element.updateDimensionsBatch');
    expect(cmds[0]!.payload['elementKind']).toBe('stair');
    expect(cmds[0]!.payload['dimensions']).toEqual({ width: 1.2 });
    expect((cmds[0]!.payload['elementIds'] as string[]).length).toBe(3);
    expect((app as { destructive: boolean }).destructive).toBe(true);
    expect((app as { summary: string }).summary).toContain('3');
  });

  // ── ⭐⭐ THE OUT-CLAIM GUARD (L-1442) ──────────────────────────────────────
  it('⭐ a width the ONE-STAIR ask refuses is refused in BULK too, with both numbers', () => {
    // Measured: the generic batch carrier validates POSITIVITY only, while
    // UpdateStairParametersCommand enforces STAIR_CONSTRAINTS.MIN_WIDTH. Without
    // the family bounds, the same capability spoken over three stairs would
    // ACCEPT 0.1 m and report success.
    const si = intentFor('change width of all stairs to 0.1 meters', scoped('stair'))!;
    const app = applySemanticIntent(si, ctx(scoped('stair')));
    expect(app.kind, JSON.stringify(app)).toBe('refusal');
    const reason = (app as { reason: string }).reason;
    // ⭐ The refusal is `checkStairGeometry`'s OWN sentence, quoted — the same
    // authority CreateStairCommand and UpdateStairParametersCommand enforce —
    // so the chat's "no" and the command's "no" cannot drift into two texts.
    expect(reason).toContain('100mm');                 // what was asked
    expect(reason).toContain('900mm');                 // the published minimum
    expect(reason).toContain('Stair width');           // the predicate's wording
    expect(reason).toContain('refuses it too');        // why bulk declines as well
    expect(reason).toContain('Nothing was changed');
  });

  it('a legal width above the minimum is NOT refused', () => {
    const si = intentFor('change width of all stairs to 0.9 meters', scoped('stair'))!;
    expect(applySemanticIntent(si, ctx(scoped('stair'))).kind).toBe('commands');
  });

  it('a dimension a stair does not carry is refused BY NAME with the route that can do it', () => {
    const si = intentFor('make all stairs 3m high', scoped('stair'))!;
    const app = applySemanticIntent(si, ctx(scoped('stair')));
    expect(app.kind).toBe('refusal');
    const reason = (app as { reason: string }).reason;
    // Not "a stair has no height" — the honest reason is that its rise is the
    // distance between the levels it connects, and the reply names the two
    // things the user probably meant instead.
    expect(reason).toContain('riser height');
    expect(reason).toContain('level');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A — "create a stair from ground to level 5 connected to this wall — in L shape"
// ─────────────────────────────────────────────────────────────────────────────

describe('A — the multi-storey, wall-anchored stair: a REFUSAL that names the gap', () => {
  const FOUNDER_A = 'create a stair from ground to level 5 connected to this wall in L shape';
  const withWall = { selection: [{ elementId: 'w1', elementType: 'wall' }] };

  it('⭐ the founder literal is CLAIMED — it is never a bare miss', () => {
    const si = intentFor(FOUNDER_A, withWall);
    expect(si, 'the sentence falls through to a miss').not.toBeNull();
    expect(si!.intent).toBe('create-stair-span');
  });

  it('every clause it understood is read back — proving it was READ, not rejected', () => {
    const si = intentFor(FOUNDER_A, withWall)!;
    expect((si as { fromLevel?: string }).fromLevel).toBe('ground');
    expect((si as { toLevel?: string }).toLevel).toBe('level 5');
    expect((si as { anchorRef?: string }).anchorRef).toBe('this');
    expect((si as { shape?: string }).shape).toBe('L');
  });

  it('the refusal names the MULTI-STOREY gap, the ANCHOR gap, and the live alternative', () => {
    const si = intentFor(FOUNDER_A, withWall)!;
    const app = applySemanticIntent(si, ctx(withWall));
    expect(app.kind).toBe('refusal');
    const reason = (app as { reason: string }).reason;
    // the user own words, quoted back
    expect(reason).toContain('ground');
    expect(reason).toContain('level 5');
    expect(reason).toContain('L-shaped');
    // blocker 2 — one command, one stair, opening on the top level only
    expect(reason).toContain('more than one storey');
    expect(reason).toContain('TOP level');
    // blocker 1 — no geometry reaches the language layer
    expect(reason).toContain('start point');
    // nothing happened, said plainly
    expect(reason).toContain('Nothing was created');
    // ⭐ C16 CA-18 — the LIVE replacement, as a sentence he can type
    expect(reason).toContain('create a stair');
    expect(reason).toContain('make all the stairs monolithic concrete');
    expect((app as { suggestions: readonly string[] }).suggestions).toContain('create a stair');
  });

  it('⛔ it does NOT steal the plain creation sentence, which WORKS', () => {
    // `parsePlacementRef` owns "create a stair" and activates the real tool.
    // §FIX-PLACEMENT-OVERCLAIM records eight pills lost to exactly this mistake.
    const si = intentFor('create a stair');
    expect(si?.intent).not.toBe('create-stair-span');
    const r = resolveUtterance('create a stair', ctx());
    expect(r.kind).toBe('local');
    expect((r as { action: string }).action).toBe('activateTool');
  });

  it('a range with no stair noun, and a stair with no range or anchor, are both unclaimed', () => {
    expect(intentFor('create a window from ground to level 5')).toBeNull();
    expect(intentFor('create a stair in L shape')?.intent).not.toBe('create-stair-span');
  });

  it('the anchor clause ALONE is enough to claim — the range is not required', () => {
    const si = intentFor('create a stair connected to this wall', withWall);
    expect(si?.intent).toBe('create-stair-span');
    expect((si as { fromLevel?: string }).fromLevel).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B5 — "Change first run of all stairs to X meters"
// ─────────────────────────────────────────────────────────────────────────────

describe('B5 — a SUB-PART of an element: the vocabulary cannot address one', () => {
  const FOUNDER_B5 = 'change first run of all stairs to 4 meters';

  it('⭐ the founder literal is CLAIMED, not a bare miss', () => {
    const si = intentFor(FOUNDER_B5, scoped('stair'));
    expect(si, 'falls through to a miss').not.toBeNull();
    expect(si!.intent).toBe('set-stair-part');
    expect((si as { partRef: string }).partRef).toBe('first run');
  });

  it('⭐ the refusal states the GENERAL limit, not just this gap', () => {
    const si = intentFor(FOUNDER_B5, scoped('stair'))!;
    const app = applySemanticIntent(si, ctx(scoped('stair')));
    expect(app.kind).toBe('refusal');
    const reason = (app as { reason: string }).reason;
    expect(reason).toContain('first run');
    // The sentence worth more than the gap it explains.
    expect(reason).toContain('whole elements');
    expect(reason).toContain('not a part inside one');
    // ⛔ And it says out loud that it will NOT guess the step count — the
    // arithmetic is one line away and is deliberately not done.
    expect(reason).toContain('guess');
    expect(reason).toContain('Nothing was changed');
  });

  it('the refusal NAMES what genuinely works on the same elements (C16 CA-18)', () => {
    const si = intentFor(FOUNDER_B5, scoped('stair'))!;
    const reason = (applySemanticIntent(si, ctx(scoped('stair'))) as { reason: string }).reason;
    expect(reason).toContain('change width of all stairs to 1.2 meters');
    expect(reason).toContain('change tread to 280mm');
    expect(reason).toContain('make all the stairs monolithic concrete');
    // Railings ARE addressable — because they are separate ELEMENTS, not parts.
    expect(reason).toContain('stair railings');
  });

  it('⛔ it never steals a part that ALREADY has a live capability', () => {
    const withStair = { selection: [{ elementId: 's1', elementType: 'stair' }] };
    expect(intentFor('change tread to 280mm', withStair)!.intent).toBe('set-tread-depth');
    expect(intentFor('change the tread depth to 280mm', withStair)!.intent).toBe('set-tread-depth');
    expect(intentFor('change riser height to 175mm', withStair)!.intent).toBe('set-riser-height');
  });

  it('other un-addressable parts refuse the same way', () => {
    for (const t of [
      'change the landing of all stairs to 1.2 meters',
      'change second flight of all stairs to 3 meters',
      'set the stringer of all stairs to 50mm',
    ]) {
      expect(intentFor(t, scoped('stair'))?.intent, t).toBe('set-stair-part');
    }
  });

  it('the whole ladder answers rather than missing', () => {
    const r = resolveUtterance(FOUNDER_B5, ctx(scoped('stair')));
    expect(r.kind).toBe('refusal');
  });
});
