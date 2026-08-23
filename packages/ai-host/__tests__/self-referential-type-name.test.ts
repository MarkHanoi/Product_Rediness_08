// @pryzm/ai-host — §FIX-SELF-REFERENTIAL-TYPE-NAME (L-10100) · lane RACTYPE12
// =============================================================================
//
// ⭐ THE FOUNDER'S SENTENCE, VERBATIM. He created a window type called
// **"Custom Window Type"** and typed:
//
//     "Make all windows Custom window type"
//
// and PRYZM answered:
//
//     "There is no window type called "type" in this project. The window types
//      here are: Single Pane (Default), … , Custom Window Type."
//
// A refusal that denies his type exists in the same sentence that lists it.
// Registration was FINE — the PARSE extracted `"type"` as the typeRef.
//
// ── THE MEASURED MECHANISM (2026-08-23, before the fix) ─────────────────────
//
//   1. `FilterScope.liftTypeFilter` anchored its right-hand noun on the SECOND
//      "window" — the one inside his TYPE NAME — making the candidate
//      adjective `"windows custom"`;
//   2. `resolveCatalogueRef`'s domain-noise list drops `window`/`windows`/
//      `type`, so `"windows custom"` reduces to `["custom"]` and resolved,
//      confidently, to "Custom Window Type";
//   3. the sentence was rewritten to `"make all window type"` and a bogus TYPE
//      FILTER attached to the scope — so even a correct typeRef would have
//      retyped only the windows that were ALREADY that type;
//   4. the grammar's optional `(?: types?)?` backtracked to empty so the
//      mandatory space could match, leaving typeRef = **`"type"`**.
//
// THREE families broke this way — **window, door AND wall** (wall being the
// founding incident's own grammar). slab / ceiling / stair / stair-railing
// survived ONLY because their domain-noise lists happen to omit the PLURAL.
// ⛔ An accident is not a guard, which is why this file pins all seven.
//
// ── WHAT IS PINNED, AND WHY IT IS THE CLASS AND NOT THE INSTANCE ────────────
//
// Any user-authored type name may contain the family noun, the word "type", or
// both — that is what a default name generator PRODUCES ("Custom Window Type",
// "Custom Slab Type"). So the assertions below are generated over EVERY
// catalogue family from one self-referential name each, in four phrasings, and
// the control (a plain built-in name) is asserted alongside so a fix that
// "passes by narrowing" fails here.

import { describe, expect, it } from 'vitest';
import {
  applySemanticIntent,
  resolveUtteranceIntent,
  type ResolverContext,
  type SemanticIntent,
} from '../src/intents/ZeroTokenResolver.js';
import { nearbyNames } from '../src/intents/CatalogueFamilies.js';
import { parseFilterClauses } from '../src/intents/FilterScope.js';
import {
  resolveCatalogueRef,
  resolveWindowSystemTypeRef,
  windowSystemTypeNames,
} from '@pryzm/command-registry';
import { windowSystemTypeStore } from '@pryzm/geometry-window';

// ─── The founder's project: a REAL custom window type in the REAL store ──────
//
// Cloned from a built-in rather than hand-built, so this pins the ladder the
// editor bridge actually injects (`resolveWindowSystemTypeRef` →
// `resolveCatalogueRef` over `windowSystemTypeStore`) and not a look-alike.
// §FAKE-MORE-CAPABLE-THAN-REAL — a fake built from the header cannot falsify
// the header.
const FOUNDER_WINDOW_TYPE = 'Custom Window Type';
windowSystemTypeStore.add({
  ...structuredClone(windowSystemTypeStore.getAll()[0]!),
  id: 'custom-window-type',
  name: FOUNDER_WINDOW_TYPE,
  isBuiltIn: false,
} as never);

/** A real built-in, READ from the store rather than transcribed — the window
 *  family's context injects the live catalogue, so its ids are the store's. */
const REAL_WINDOW_BUILT_IN = windowSystemTypeStore.getAll()
  .find((t) => t.name === 'Timber Casement')!;

const realWindowLookup = {
  resolve: (ref: string) => {
    const hit = resolveWindowSystemTypeRef(ref);
    return hit === null ? null : { id: hit.id, name: hit.name };
  },
  names: windowSystemTypeNames(),
};

/** A catalogue on the SAME `resolveCatalogueRef` ladder the chat bridge uses
 *  for the generic channel, with that family's domain-noise words. */
function catalogue(entries: readonly { id: string; name: string }[], noise: readonly string[]) {
  const reader = {
    getById: (id: string) => entries.find((e) => e.id === id),
    getAll: () => [...entries],
  };
  return {
    resolve: (ref: string) => {
      const hit = resolveCatalogueRef(reader as never, ref, { domainNoise: [...noise] });
      return hit.entry === null ? null : { id: hit.entry.id, name: hit.entry.name };
    },
    names: entries.map((e) => e.name),
  };
}

interface FamilyCase {
  readonly kind: string;
  /** The word(s) a user types — "stair railings", not "stair-railings". */
  readonly plural: string;
  readonly intent: string;
  /** The user-authored name that contains the family's own noun and "type". */
  readonly custom: { id: string; name: string };
  /** A plain built-in, the control: a fix that narrows the grammar breaks it. */
  readonly builtIn: { id: string; name: string };
  readonly noise: readonly string[];
}

const FAMILIES: readonly FamilyCase[] = [
  {
    kind: 'window',
    plural: 'windows',
    intent: 'set-window-type',
    custom: { id: 'custom-window-type', name: FOUNDER_WINDOW_TYPE },
    builtIn: { id: REAL_WINDOW_BUILT_IN.id, name: REAL_WINDOW_BUILT_IN.name },
    noise: ['window', 'windows', 'type', 'style', 'the', 'a'],
  },
  {
    kind: 'door',
    plural: 'doors',
    intent: 'set-door-type',
    custom: { id: 'custom-door-type', name: 'Custom Door Type' },
    builtIn: { id: 'd-flush', name: 'Flush Softwood' },
    noise: ['door', 'doors', 'type', 'style', 'the', 'a'],
  },
  {
    // ⭐ The sibling the founder ALSO has: lane LAYERMAT10 fixed this type's
    // property-panel dropdown the same day (98976574).
    kind: 'slab',
    plural: 'slabs',
    intent: 'set-slab-type',
    custom: { id: 'custom-slab-type', name: 'Custom Slab Type' },
    builtIn: { id: 's-rc', name: 'RC Slab Monolithic 200mm' },
    noise: ['slab'],
  },
  {
    kind: 'ceiling',
    plural: 'ceilings',
    intent: 'set-ceiling-type',
    custom: { id: 'custom-ceiling-type', name: 'Custom Ceiling Type' },
    builtIn: { id: 'c-pb', name: 'Plasterboard 12.5mm' },
    noise: ['ceiling'],
  },
  {
    kind: 'stair',
    plural: 'stairs',
    intent: 'set-stair-type',
    custom: { id: 'custom-stair-type', name: 'Custom Stair Type' },
    builtIn: { id: 'st-mono', name: 'Monolithic Concrete' },
    noise: ['stair'],
  },
  {
    kind: 'stair-railing',
    plural: 'stair railings',
    intent: 'set-stair-railing-type',
    custom: { id: 'custom-railing-type', name: 'Custom Railing Type' },
    builtIn: { id: 'r-glass', name: 'Frameless Glass Balustrade' },
    noise: ['railing'],
  },
  {
    // ⛔ NOT a catalogue-table family — a hand-written spec whose refusal copy
    // is the founding incident's verbatim wording. It broke identically, so it
    // is pinned identically.
    kind: 'wall',
    plural: 'walls',
    intent: 'set-wall-type',
    custom: { id: 'custom-wall-type', name: 'Custom Wall Type' },
    builtIn: { id: 'wa-int', name: 'Interior Partition 100mm' },
    noise: ['wall', 'walls', 'type', 'the', 'a'],
  },
];

function ctxFor(f: FamilyCase, entries?: readonly { id: string; name: string }[]): ResolverContext {
  const list = entries ?? [f.builtIn, f.custom];
  const lookup = f.kind === 'window' && entries === undefined
    ? realWindowLookup
    : catalogue(list, f.noise);
  const base: Record<string, unknown> = {
    selection: [],
    levels: [{ id: 'L0', name: 'Ground', elevation: 0 }],
    activeLevelId: 'L0',
    mintId: () => 'id-1',
    catalogues: { [f.kind]: lookup },
    resolveScope: () => ({
      ids: ['e-1', 'e-2'],
      kindCounts: { [f.kind]: 2 },
      skipped: [],
      diagnostics: [],
    }),
  };
  // The three families that predate the generic channel keep their named
  // fields — this is the injection `ZeroTokenChatBridge.buildContext` writes.
  if (f.kind === 'window') {
    base['resolveWindowSystemType'] = lookup.resolve;
    base['windowSystemTypeNames'] = lookup.names;
  }
  if (f.kind === 'door') {
    base['resolveDoorSystemType'] = lookup.resolve;
    base['doorSystemTypeNames'] = lookup.names;
  }
  if (f.kind === 'wall') {
    base['resolveWallSystemType'] = lookup.resolve;
    base['wallSystemTypeNames'] = lookup.names;
  }
  return base as unknown as ResolverContext;
}

function intentFor(text: string, f: FamilyCase): SemanticIntent | null {
  return resolveUtteranceIntent(text, ctxFor(f));
}

/** The resolved type id each family carries in its dispatched payload. */
function dispatchedTypeId(app: unknown): string | undefined {
  const cmds = (app as { commands?: readonly { payload: Record<string, unknown> }[] }).commands;
  const p = cmds?.[0]?.payload;
  if (p === undefined) return undefined;
  return (p['systemType']
    ?? p['newTypeId']
    ?? (p['updates'] as Record<string, unknown> | undefined)?.['typeId']) as string | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// A — the founder's literal, and the obvious variants
// ─────────────────────────────────────────────────────────────────────────────

describe("A — the founder's sentence", () => {
  const window = FAMILIES[0]!;

  it('⭐ "Make all windows Custom window type" resolves — not a refusal about "type"', () => {
    const si = intentFor('Make all windows Custom window type', window);
    expect(si, 'the founder\'s sentence is unclaimed').not.toBeNull();
    expect(si!.intent).toBe('set-window-type');
    // ⭐ THE SPAN. Before the fix this was the string "type".
    expect((si as { typeRef: string }).typeRef).toBe('custom window type');
    // ⭐ AND THE SCOPE. Before the fix it was a `{kind:'filter'}` scope carrying
    // a bogus type filter — so the sentence would have retyped only the windows
    // that were already Custom Window Type. Half the defect, and silent.
    expect((si as { scope: unknown }).scope).toBe('all');
  });

  it('dispatches the batch verb with the RESOLVED id', () => {
    const si = intentFor('Make all windows Custom window type', window)!;
    const app = applySemanticIntent(si, ctxFor(window));
    expect(app.kind, JSON.stringify(app)).toBe('commands');
    const cmds = (app as { commands: readonly { type: string }[] }).commands;
    expect(cmds[0]!.type).toBe('window.updateSystemTypeBatch');
    expect(dispatchedTypeId(app)).toBe('custom-window-type');
  });

  it('every obvious variant works — case, "to", and the definite article', () => {
    for (const s of [
      'Make all windows Custom window type',
      'Make all windows Custom Window Type',
      'make all windows custom window type',
      'MAKE ALL WINDOWS CUSTOM WINDOW TYPE',
      'change all windows to Custom Window Type',
      'change all windows to custom window type',
      'Make all the windows Custom Window Type',
      'set all windows to Custom Window Type',
    ]) {
      const si = intentFor(s, window);
      expect(si, `unclaimed: ${s}`).not.toBeNull();
      expect((si as { typeRef: string }).typeRef, s).toBe('custom window type');
      const app = applySemanticIntent(si!, ctxFor(window));
      expect(app.kind, `${s} → ${JSON.stringify(app)}`).toBe('commands');
      expect(dispatchedTypeId(app), s).toBe('custom-window-type');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B — the CLASS: every family, with a name containing its own noun and "type"
// ─────────────────────────────────────────────────────────────────────────────

describe('B — a self-referential type name, in every family', () => {
  for (const f of FAMILIES) {
    it(`${f.kind}: "make all ${f.plural} ${f.custom.name}" resolves to the type, at 'all' scope`, () => {
      for (const s of [
        `Make all ${f.plural} ${f.custom.name}`,
        `make all ${f.plural} ${f.custom.name.toLowerCase()}`,
        `change all ${f.plural} to ${f.custom.name}`,
        `Make all the ${f.plural} ${f.custom.name}`,
      ]) {
        const si = intentFor(s, f);
        expect(si, `unclaimed: ${s}`).not.toBeNull();
        expect(si!.intent, s).toBe(f.intent);
        expect((si as { typeRef: string }).typeRef, s).toBe(f.custom.name.toLowerCase());
        expect((si as { scope: unknown }).scope, `${s} — scope carries a bogus type filter`).toBe('all');
        const app = applySemanticIntent(si!, ctxFor(f));
        expect(app.kind, `${s} → ${JSON.stringify(app)}`).toBe('commands');
        expect(dispatchedTypeId(app), s).toBe(f.custom.id);
      }
    });

    it(`${f.kind}: the plain built-in name still works — the fix did not narrow the grammar`, () => {
      const s = `change all ${f.plural} to ${f.builtIn.name}`;
      const si = intentFor(s, f);
      expect(si, `unclaimed: ${s}`).not.toBeNull();
      const app = applySemanticIntent(si!, ctxFor(f));
      expect(app.kind, `${s} → ${JSON.stringify(app)}`).toBe('commands');
      expect(dispatchedTypeId(app), s).toBe(f.builtIn.id);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// C — the type FILTER still lifts, and now lifts the LONGEST catalogue claim
// ─────────────────────────────────────────────────────────────────────────────

describe('C — liftTypeFilter: mis-anchor refused, longest catalogue claim wins', () => {
  const window = FAMILIES[0]!;
  const lookup = catalogue([window.builtIn, window.custom], window.noise);

  it('⛔ a candidate that BEGINS with the family noun is a mis-anchor, never an adjective', () => {
    // The founder's sentence, at the layer that damaged it.
    const lifted = parseFilterClauses(
      'make all windows custom window type', 'window', lookup.resolve,
    );
    expect(lifted.stripped).toBe('make all windows custom window type');
    expect(lifted.filters).toEqual([]);
  });

  it('a REAL type adjective is still lifted, and the sentence still reads', () => {
    const lifted = parseFilterClauses(
      'change all timber casement windows to custom window type', 'window', lookup.resolve,
    );
    expect(lifted.stripped).toBe('change all windows to custom window type');
    expect(lifted.filters).toEqual([
      { kind: 'type', typeId: window.builtIn.id, label: 'Timber Casement' },
    ]);
  });

  it('⭐ the LONGEST span the catalogue claims wins — not the shortest prefix', () => {
    // "custom" alone resolves (the noise words drop out), so the old
    // lazy-shortest regex stopped there and left "type windows" behind.
    const lifted = parseFilterClauses(
      'change all custom window type windows to timber casement', 'window', lookup.resolve,
    );
    expect(lifted.stripped).toBe('change all windows to timber casement');
    expect(lifted.filters).toEqual([
      { kind: 'type', typeId: 'custom-window-type', label: 'Custom Window Type' },
    ]);
  });

  it('an unrecognised adjective leaves the sentence exactly as typed', () => {
    const lifted = parseFilterClauses(
      'make all south-facing windows custom window type', 'window', lookup.resolve,
    );
    expect(lifted.filters).toEqual([]);
    expect(lifted.stripped).toBe('make all south-facing windows custom window type');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D — ⛔ the refusal may never contradict itself
// ─────────────────────────────────────────────────────────────────────────────

describe('D — a refusal never denies a type it goes on to list', () => {
  it('nearbyNames matches in BOTH directions, and never an exact hit', () => {
    const names = ['Single Pane (Default)', 'Timber Casement', 'Custom Window Type'];
    // Under-extracted span, found INSIDE a real name.
    expect(nearbyNames(names, 'type')).toEqual(['Custom Window Type']);
    // Over-extracted span, CARRYING a real name.
    expect(nearbyNames(names, 'windows to timber casement')).toEqual(['Timber Casement']);
    // An exact match resolved and never reaches the refusal.
    expect(nearbyNames(names, 'Timber Casement')).toEqual([]);
    // A genuine miss stays a genuine miss.
    expect(nearbyNames(names, 'unobtainium')).toEqual([]);
    // A name ending in a non-word character is still findable.
    expect(nearbyNames(names, 'Single Pane (Default) glazing')).toEqual(['Single Pane (Default)']);
  });

  for (const f of FAMILIES) {
    it(`${f.kind}: an unresolved span a listed name CONTAINS is offered, not denied`, () => {
      // The exact shape the founder saw: the resolver is handed the span the
      // old grammar produced. Whatever a future grammar mis-extracts, the copy
      // may not say "there is no X called 'type'" next to a list containing it.
      const si = { intent: f.intent, typeRef: 'type', scope: 'all' } as unknown as SemanticIntent;
      const app = applySemanticIntent(si, ctxFor(f));
      expect(app.kind, JSON.stringify(app)).toBe('refusal');
      const reason = (app as { reason: string }).reason;
      expect(reason, reason).not.toContain(`called "type"`);
      expect(reason, reason).toContain(f.custom.name);
      expect(reason.toLowerCase(), reason).toContain('did you mean');
      // And the offered next step names the type, not an unrelated built-in.
      const suggestions = (app as { suggestions?: readonly string[] }).suggestions ?? [];
      expect(suggestions.join(' | ').toLowerCase(), reason).toContain(f.custom.name.toLowerCase());
    });
  }

  it('a genuine miss still refuses plainly, and still LISTS the real names', () => {
    const f = FAMILIES[0]!;
    const si = { intent: f.intent, typeRef: 'unobtainium', scope: 'all' } as unknown as SemanticIntent;
    const app = applySemanticIntent(si, ctxFor(f));
    expect(app.kind).toBe('refusal');
    const reason = (app as { reason: string }).reason;
    expect(reason).toContain('There is no window type called "unobtainium"');
    for (const n of realWindowLookup.names) expect(reason).toContain(n);
  });
});
