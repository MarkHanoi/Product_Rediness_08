// ADR-0313 §Capability-driven resolution — NATURAL-LANGUAGE ACCEPTANCE.
//
// One family of phrasings per capability, all of which must land on the SAME
// capability id. A capability is only as real as the sentences that reach it,
// so `check-chat-capability-coverage.ts` fails any capability this file does
// not name.
//
// Plus the adversarial half, which matters more: command-SHAPED utterances that
// must NOT mutate. "don't change the wall height", "I was thinking about
// changing the height" and "what would happen if…" all contain a clean
// set-height sentence, and two of the three previously resolved with high
// confidence. A resolver that acts on them is worse than one that understands
// less.

import { describe, it, expect } from 'vitest';
import {
  resolveUtterance,
  applySemanticIntent,
  type ResolverContext,
  type ZeroTokenResolution,
} from '../src/intents/ZeroTokenResolver.js';
import { resolveNaturalLanguage } from '../src/intents/LocalNaturalLanguageResolver.js';
import {
  allChatCapabilities,
  resolveChatCapability,
} from '../src/capabilities/ChatCapabilityRegistry.js';
import {
  resolveWallSystemTypeRef,
  type WallSystemTypeCatalogueReader,
} from '@pryzm/command-registry';

// ─── Context ─────────────────────────────────────────────────────────────────

// The REAL built-in wall types, verbatim from
// `packages/geometry-wall/src/WallSystemTypeStore.ts` — the en-dash and the
// dimension suffix are the whole reason the founder's "interior partition"
// needed a forgiving lookup, so a sanitised fixture would test nothing.
const WALL_TYPES = [
  { id: 'wt-monolithic', name: 'Monolithic (Default)' },
  { id: 'wt-interior-partition', name: 'Interior – Partition 100mm' },
  { id: 'wt-exterior-brick', name: 'Exterior – Brick 300mm' },
  { id: 'wt-exterior-concrete', name: 'Exterior – Concrete 250mm' },
  { id: 'wt-exposed-stone', name: 'Exposed Stone – Feature Wall 350mm' },
  { id: 'wt-timber-frame', name: 'Timber Frame – 200mm' },
  { id: 'wt-exposed-wooden-frames', name: 'Wooden Frames – Exposed Timber 296mm' },
];

/** Minimal catalogue reader — the read surface `resolveWallSystemTypeRef`
 *  declares. Only `id` and `name` participate in reference resolution. */
const catalogueReader = {
  getById: (id: string) => WALL_TYPES.find((t) => t.id === id),
  getAll: () => WALL_TYPES,
} as unknown as WallSystemTypeCatalogueReader;

let seq = 0;
const ctxOf =(overrides: Partial<ResolverContext> = {}): ResolverContext => ({
  selection: [],
  levels: [
    { id: 'L0', name: 'Level 0', elevation: 0 },
    { id: 'L1', name: 'Level 1', elevation: 3 },
    { id: 'L2', name: 'Level 2', elevation: 6 },
  ],
  activeLevelId: 'L0',
  mintId: () => `acc-${++seq}`,
  // The REAL lookup, not a re-implementation of it. This is the point of the
  // injection: `resolveWallSystemTypeRef` is the single authority on turning a
  // human type reference into a catalogue entry, and the acceptance test drives
  // the actual function against a stand-in catalogue reader. A local copy of
  // the precedence rules here would be a second source of truth inside the very
  // test that exists to prove there is only one.
  resolveWallSystemType: (ref) => {
    const hit = resolveWallSystemTypeRef(catalogueReader, ref);
    return hit === null ? null : { id: hit.id, name: hit.name };
  },
  wallSystemTypeNames: WALL_TYPES.map((t) => t.name),
  ...overrides,
});

const sel = (elementType: string, elementId = `${elementType}-1`) => ({
  selection: [{ elementId, elementType }],
});

/** Resolve through the FULL ladder the bridge uses: tier 0/1, then NL. */
function resolveFull(utterance: string, ctx: ResolverContext): ZeroTokenResolution {
  const tier01 = resolveUtterance(utterance, ctx);
  if (tier01.kind !== 'miss') return tier01;
  const nl = resolveNaturalLanguage(utterance, ctx);
  if (nl.kind === 'resolved') return nl.resolution;
  return { kind: 'miss' };
}

function intentOf(r: ZeroTokenResolution): string | null {
  return r.kind === 'commands' || r.kind === 'local' || r.kind === 'refusal' ? r.intent : null;
}

// ─── Per-capability phrasing families ────────────────────────────────────────
//
// Each entry names the capability id (which is what the coverage gate greps
// for) and the context its examples need in order to be ACTED on rather than
// honestly refused.

interface AcceptanceCase {
  readonly id: string;
  readonly ctx: Partial<ResolverContext>;
  readonly phrasings: readonly string[];
}

const ACCEPTANCE: readonly AcceptanceCase[] = [
  { id: 'undo', ctx: {}, phrasings: ['undo', 'undo that', 'Actually, undo that.', 'go back'] },
  { id: 'redo', ctx: {}, phrasings: ['redo', 'redo that', 'do that again'] },
  {
    id: 'zoom-fit',
    ctx: {},
    phrasings: ['zoom to fit', 'fit the model', 'frame everything', 'zoom out so I can see everything'],
  },
  {
    id: 'zoom-selected',
    ctx: sel('wall'),
    phrasings: ['zoom to selection', 'frame selection', 'zoom to selected'],
  },
  {
    id: 'delete-selected',
    ctx: sel('door'),
    phrasings: [
      'delete selected',
      'remove those doors',
      "get rid of the doors I've selected",
      'please erase the selected door',
    ],
  },
  {
    id: 'set-height',
    ctx: sel('wall'),
    phrasings: [
      'set height to 3m',
      'make this 3m tall',
      'set the wall height to 3m',
      'could you make this wall three metres high?',
      'set height to 2700',
    ],
  },
  {
    id: 'set-thickness',
    ctx: sel('wall'),
    phrasings: [
      'set thickness to 200mm',
      'change the thickness to 0.2m',
      'make this wall 300mm thick',
    ],
  },
  {
    id: 'set-width',
    ctx: sel('door'),
    phrasings: [
      'set door width to 900mm',
      'set the door width to nine hundred millimeters',
      'change width to 850mm',
      'make the door 1m wide',
    ],
  },
  {
    id: 'set-roof-pitch',
    ctx: sel('roof'),
    phrasings: [
      'set the roof pitch to 30 degrees',
      'change pitch to 45',
      'could you set the roof pitch to 22.5 degrees?',
    ],
  },
  {
    id: 'set-room-number',
    ctx: sel('room'),
    phrasings: [
      'set the room number to 101',
      'change the room number to 2.04',
    ],
  },
  {
    id: 'set-sill-height',
    ctx: sel('window'),
    phrasings: ['set sill height to 1m', 'change the sill height to 900mm'],
  },
  {
    id: 'set-riser-height',
    ctx: sel('stair'),
    phrasings: [
      'set the riser height to 180mm',
      'change riser height to 0.175m',
      'Could you set the riser height to 175mm?',
    ],
  },
  {
    id: 'set-tread-depth',
    ctx: sel('stair'),
    phrasings: [
      'set the tread depth to 250mm',
      'change the tread depth to 0.28m',
      'please set the tread depth to 260mm',
    ],
  },
  {
    id: 'set-room-height-offset',
    ctx: sel('room'),
    phrasings: [
      'set the room height offset to 0.5m',
      'set the height offset to 200mm',
    ],
  },
  {
    id: 'set-wall-type',
    ctx: {},
    phrasings: [
      'make all walls interior partition',
      'change all walls to Interior – Partition 100mm',
      'convert every wall to interior partition',
      'set all the walls to interior partition',
      'Could you change all walls to interior partition, please?',
    ],
  },
  {
    id: 'set-wall-color',
    ctx: {},
    phrasings: [
      'make all walls white',
      'paint every wall light grey',
      'turn all walls beige',
      'Could you make all walls white, please?',
      'make all the walls #f4f1e8',
    ],
  },
  {
    id: 'go-to-level',
    ctx: {},
    phrasings: [
      'go to level 2',
      'switch to level 2',
      'take me to the second floor',
      'go to floor 2',
    ],
  },
  { id: 'add-level', ctx: {}, phrasings: ['add a level', 'add a level at 6m', 'could you add another floor?'] },
  {
    id: 'create-wall',
    ctx: {},
    phrasings: [
      'create a wall from (0,0) to (5,0)',
      'draw a wall from (0,0) to (5,0) height 3m',
      'please draw a wall from (0,0) to (5,0)',
    ],
  },
  {
    id: 'rename-room',
    ctx: sel('room'),
    phrasings: ['rename room to Kitchen', 'call this room the master bedroom'],
  },
];

describe('capability acceptance — a family of phrasings per capability', () => {
  for (const c of ACCEPTANCE) {
    it(`${c.id}: every phrasing resolves to the same capability`, () => {
      for (const utterance of c.phrasings) {
        const r = resolveFull(utterance, ctxOf(c.ctx));
        expect(
          intentOf(r),
          `"${utterance}" resolved to ${JSON.stringify(r)} instead of ${c.id}`,
        ).toBe(c.id);
        // Acceptance means ACTED ON, not merely recognized: in the context each
        // family declares, none of these may be a refusal.
        expect(r.kind, `"${utterance}" was refused`).not.toBe('refusal');
      }
    });
  }

  it('every declared capability has an acceptance family (no capability ships untested)', () => {
    const tested = new Set(ACCEPTANCE.map((c) => c.id));
    const missing = allChatCapabilities().map((c) => c.id).filter((id) => !tested.has(id));
    expect(missing, `capabilities with no acceptance family: ${missing.join(', ')}`).toEqual([]);
  });

  it("every capability's own declared examples resolve to it", () => {
    // The registry's `examples` are what the coverage gate and the refusal
    // suggestions offer the user, so an example that does not work is a lie
    // shipped in the UI copy.
    const byId = new Map(ACCEPTANCE.map((c) => [c.id, c.ctx]));
    for (const cap of allChatCapabilities()) {
      for (const example of cap.examples) {
        const r = resolveFull(example, ctxOf(byId.get(cap.id) ?? {}));
        expect(intentOf(r), `example "${example}" of ${cap.id} resolved to ${intentOf(r)}`).toBe(cap.id);
      }
    }
  });
});

// ─── The founder's sentence, end to end ──────────────────────────────────────

describe('§FEAT-CHAT-WALL-TYPE — the sentence that started this', () => {
  it('"make all walls interior partition" reaches wall.updateSystemTypeBatch with scope all', () => {
    const r = resolveUtterance('make all walls interior partition', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.intent).toBe('set-wall-type');
    expect(r.tier).toBe(0);
    expect(r.commands).toEqual([
      {
        type: 'wall.updateSystemTypeBatch',
        // The NAME the user typed was resolved to the catalogue ID through the
        // injected forgiving lookup — the command receives an unambiguous id.
        payload: { wallIds: 'all', systemType: 'wt-interior-partition' },
      },
    ]);
    expect(r.destructive).toBe(false);
    expect(r.summary).toContain('every wall in the project');
    expect(r.summary).toContain('Interior – Partition 100mm');
  });

  it('the forgiving lookup accepts id, exact name, casing and word-subset alike', () => {
    for (const ref of [
      'wt-interior-partition',
      'Interior – Partition 100mm',
      'interior – partition 100mm',
      // §FIX-CHAT-TYPE-REF-TOO-STRICT — the founder's actual words. Without
      // tier 4 the user must reproduce an en-dash and "100mm" to be understood.
      'interior partition',
    ]) {
      const r = resolveUtterance(`change all walls to ${ref}`, ctxOf());
      expect(r.kind).toBe('commands');
      if (r.kind !== 'commands') continue;
      expect(r.commands[0]!.payload).toEqual({ wallIds: 'all', systemType: 'wt-interior-partition' });
    }
  });

  it('"change the selected walls to exterior brick" scopes to the SELECTION, never to all', () => {
    const ctx = ctxOf({
      selection: [
        { elementId: 'w1', elementType: 'wall' },
        { elementId: 'w2', elementType: 'wall' },
        { elementId: 'd1', elementType: 'door' },
      ],
    });
    const r = resolveUtterance('change these walls to exterior brick', ctx);
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    // The door in the selection is filtered out, not retyped and not an error.
    expect(r.commands[0]!.payload).toEqual({
      wallIds: ['w1', 'w2'],
      systemType: 'wt-exterior-brick',
    });
  });

  it('an unknown wall type refuses by LISTING the real ones (never a silent no-op)', () => {
    const r = resolveUtterance('make all walls double glazed titanium', ctxOf());
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('no wall type called');
    expect(r.reason).toContain('Interior – Partition 100mm');
    expect(r.reason).toContain('Exterior – Brick 300mm');
  });

  it('an AMBIGUOUS reference refuses rather than flipping a coin on the whole building', () => {
    // "timber" matches BOTH "Timber Frame – 200mm" and "Wooden Frames – Exposed
    // Timber 296mm". Picking one would silently retype a building with the
    // wrong assembly; tier 4 returns null and the refusal lists the options.
    const r = resolveUtterance('make all walls timber', ctxOf());
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('Timber Frame – 200mm');
    expect(r.reason).toContain('Wooden Frames – Exposed Timber 296mm');
  });

  it('selection scope with no walls selected refuses and names what IS selected', () => {
    const r = resolveUtterance('change these walls to interior partition', ctxOf(sel('door')));
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('door');
    expect(r.reason).toContain('Nothing was changed');
  });

  it('without an injected catalogue the RAW reference is forwarded — the command refuses, not the resolver', () => {
    // §CONTEXT-DATA-HONESTY: "I cannot read the catalogue" must not be reported
    // as "that type does not exist". With no lookup injected the resolver stays
    // silent about existence and lets the command's own resolveWallSystemTypeRef
    // decide.
    const ctx = ctxOf({ resolveWallSystemType: undefined, wallSystemTypeNames: undefined });
    const r = resolveUtterance('make all walls interior partition', ctx);
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.payload).toEqual({ wallIds: 'all', systemType: 'interior partition' });
  });

  it('"make all walls 3m tall" is a DIMENSION ask, never a retype', () => {
    const r = resolveFull('make all walls 3m tall', ctxOf(sel('wall')));
    expect(intentOf(r)).not.toBe('set-wall-type');
  });
});

// ─── §FEAT-WALL-COLOR-BATCH (ADR-0314) — the declared next sentence ──────────

describe('§FEAT-WALL-COLOR-BATCH — "make all walls white"', () => {
  it('reaches wall.updateColorBatch with scope all and the resolved hex', () => {
    const r = resolveUtterance('make all walls white', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.intent).toBe('set-wall-color');
    expect(r.tier).toBe(0);
    expect(r.commands).toEqual([
      { type: 'wall.updateColorBatch', payload: { wallIds: 'all', materialColor: '#ffffff' } },
    ]);
    expect(r.destructive).toBe(false);
    expect(r.summary).toContain('every wall in the project');
  });

  it('a colour ask never becomes a TYPE ask — the two grammars are ordered', () => {
    const r = resolveUtterance('make all walls white', ctxOf());
    expect(intentOf(r)).toBe('set-wall-color');
    // …and the reverse: a type ask never becomes a colour ask.
    const t = resolveUtterance('make all walls interior partition', ctxOf());
    expect(intentOf(t)).toBe('set-wall-type');
  });

  it('"paint the selected walls light grey" scopes to the SELECTION walls only', () => {
    const ctx = ctxOf({
      selection: [
        { elementId: 'w1', elementType: 'wall' },
        { elementId: 'w2', elementType: 'wall' },
        { elementId: 'd1', elementType: 'door' },
      ],
    });
    const r = resolveUtterance('paint the selected walls light grey', ctx);
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.payload).toEqual({ wallIds: ['w1', 'w2'], materialColor: '#cccccc' });
  });

  it('a hex literal passes through, 3-digit form expanded', () => {
    const r6 = resolveUtterance('make all walls #a1B2c3', ctxOf());
    expect(r6.kind).toBe('commands');
    if (r6.kind === 'commands') {
      expect(r6.commands[0]!.payload).toEqual({ wallIds: 'all', materialColor: '#a1b2c3' });
    }
    const r3 = resolveUtterance('make all walls #fff', ctxOf());
    expect(r3.kind).toBe('commands');
    if (r3.kind === 'commands') {
      expect(r3.commands[0]!.payload).toEqual({ wallIds: 'all', materialColor: '#ffffff' });
    }
  });

  it('an unknown colour with a PAINT verb refuses by listing real options — never falls into the type grammar', () => {
    const r = resolveUtterance('paint all walls vermilion', ctxOf());
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.intent).toBe('set-wall-color');
    expect(r.reason).toContain('white');
    expect(r.reason).toContain('#');
  });

  it('with a NON-colour verb an unknown word stays a type ask (which refuses with the catalogue)', () => {
    // "make all walls vermilion" cannot be proven a colour, so the type grammar
    // gets it and refuses with the real wall types — deterministic, not a coin.
    const r = resolveUtterance('make all walls vermilion', ctxOf());
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.intent).toBe('set-wall-type');
  });

  it('selection scope with no walls selected refuses and names what IS selected', () => {
    const r = resolveUtterance('paint these walls white', ctxOf(sel('door')));
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('door');
    expect(r.reason).toContain('Nothing was changed');
  });

  it('US spelling and "gray" resolve identically', () => {
    const r = resolveUtterance('paint all walls light gray', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.payload).toEqual({ wallIds: 'all', materialColor: '#cccccc' });
  });
});

// ─── ADR-0314 §Selection batch — the chat sees the full multi-selection ──────

describe('multi-selection semantics (ADR-0314)', () => {
  const threeWalls = {
    selection: [
      { elementId: 'w1', elementType: 'wall' },
      { elementId: 'w2', elementType: 'wall' },
      { elementId: 'w3', elementType: 'wall' },
    ],
  };

  it('a dimension ask fans out one command per selected element, honestly summarized', () => {
    const r = resolveFull('set height to 3m', ctxOf(threeWalls));
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands).toEqual([
      { type: 'wall.updateDimensions', payload: { wallId: 'w1', height: 3 } },
      { type: 'wall.updateDimensions', payload: { wallId: 'w2', height: 3 } },
      { type: 'wall.updateDimensions', payload: { wallId: 'w3', height: 3 } },
    ]);
    expect(r.summary).toContain('3 selected');
  });

  it('a mixed selection with an inapplicable kind refuses WHOLE — all-or-nothing', () => {
    const ctx = ctxOf({
      selection: [
        { elementId: 'w1', elementType: 'wall' },
        { elementId: 'r1', elementType: 'room' },
      ],
    });
    const r = resolveFull('set height to 3m', ctx);
    expect(r.kind).toBe('refusal');
  });

  it('deleting with a noun refuses when ANY selected element mismatches', () => {
    const ctx = ctxOf({
      selection: [
        { elementId: 'w1', elementType: 'wall' },
        { elementId: 'd1', elementType: 'door' },
      ],
    });
    const r = resolveUtterance('delete selected walls', ctx);
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('Nothing was deleted');
  });

  it('the compound form stays one-element-only and says why', () => {
    const r = resolveFull('make this wall 3m tall and 300mm thick', ctxOf(threeWalls));
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('one selected element at a time');
  });
});

// ─── Adversarial: command-shaped but must NOT mutate ─────────────────────────

describe('adversarial — command-shaped utterances that must never mutate', () => {
  const mutating = (r: ZeroTokenResolution): boolean => r.kind === 'commands' || r.kind === 'local';

  it.each([
    // Negations.
    "don't change the wall height",
    'do not change the wall height',
    'never delete the selected wall',
    // Hypotheticals.
    'I was thinking about changing the height',
    'I was wondering about deleting these doors',
    'what would happen if I made this 3m tall?',
    'what if we changed all walls to interior partition?',
    'maybe I should set the height to 3m',
    // Questions.
    'how tall is the selected wall?',
    'what is the height of this wall?',
    'is this wall 3m tall?',
  ])('"%s" produces no command and no local action', (utterance) => {
    const ctx = ctxOf(sel('wall'));
    expect(mutating(resolveUtterance(utterance, ctx)), 'tier 0/1 mutated').toBe(false);
    const nl = resolveNaturalLanguage(utterance, ctx);
    expect(nl.kind === 'resolved' && mutating(nl.resolution), 'NL layer mutated').toBe(false);
  });

  it('the negation guard does not swallow ordinary polite requests', () => {
    // The guard must be narrow. "Could you…" / "Would you mind…" are requests,
    // not questions, and they were already the most common resolved phrasings.
    for (const u of [
      'could you make this wall 3m tall?',
      'Would you mind making this wall three meters high?',
      'can you delete the selected wall?',
    ]) {
      const nl = resolveNaturalLanguage(u, ctxOf(sel('wall')));
      expect(nl.kind, `"${u}" became ${nl.kind}`).toBe('resolved');
    }
  });
});

// ─── Capability-aware refusals: the three states ─────────────────────────────

describe('the three states are distinguishable', () => {
  it('CLARIFICATION — understood, a parameter is missing', () => {
    const nl = resolveNaturalLanguage('make the wall taller', ctxOf(sel('wall')));
    expect(nl.kind).toBe('clarification');
    if (nl.kind !== 'clarification') return;
    expect(nl.question.toLowerCase()).toContain('height');
  });

  it('REFUSAL — understood, and we know we cannot safely do it', () => {
    const r = resolveUtterance('set sill height to 1m', ctxOf(sel('wall')));
    expect(r.kind).toBe('refusal');
  });

  it('MISS — not understood as a command, the LLM seam stays open', () => {
    expect(resolveFull('make this apartment feel more spacious', ctxOf(sel('wall'))).kind).toBe('miss');
    expect(resolveFull('generate an apartment layout', ctxOf()).kind).toBe('miss');
  });
});

// ─── §FIX-CHAT-HEIGHT-OVERCLAIM ──────────────────────────────────────────────

describe('set-height no longer over-claims element kinds', () => {
  it('refuses kinds element.updateParameters cannot route, instead of reporting a silent no-op', () => {
    // UpdateElementParameterCommand.resolveStore() has no case for these; its
    // default arm returns null, so the old behaviour dispatched a command that
    // changed nothing and the chat said "Done". (ceiling left this list on
    // 2026-08-10 — it now routes through its OWN command, ceiling.setHeight.)
    for (const kind of ['room', 'floor', 'lighting', 'plumbing']) {
      const r = resolveUtterance('set height to 3m', ctxOf(sel(kind)));
      expect(r.kind, `${kind} should refuse`).toBe('refusal');
      if (r.kind !== 'refusal') continue;
      expect(r.reason).toContain('change nothing');
    }
  });

  it('ceiling height routes through the LIVE ceiling.update bridge (§FIX-CHAT-DEAD-ROUTES)', () => {
    // ceiling.setHeight wrote the detached plugin DTO store; the live route is
    // the legacy ceiling.update bridge → UpdateCeilingCommand → ceilingStore.
    const r = resolveUtterance('set the ceiling height to 2.7m', ctxOf(sel('ceiling')));
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands).toEqual([
      { type: 'ceiling.update', payload: { ceilingId: 'ceiling-1', updates: { height: 2.7 } } },
    ]);
  });

  it('still accepts every kind the command CAN route', () => {
    const cap = resolveChatCapability('set-height');
    expect(cap).not.toBeNull();
    for (const kind of cap!.targets as readonly string[]) {
      const r = applySemanticIntent({ intent: 'set-height', value: 3 }, ctxOf(sel(kind)));
      expect(r.kind, `${kind} should be accepted`).toBe('commands');
    }
  });
});

// ─── §FEAT-CHAT-SYMMETRY — per-kind routing of the widened families ──────────

describe('symmetric routing — the same sentence drives the right per-kind command', () => {
  it('thickness routes wall / slab / roof to their LIVE commands (§FIX-CHAT-DEAD-ROUTES)', () => {
    const cases = [
      ['wall', 'wall.updateDimensions', { wallId: 'wall-1', thickness: 0.25 }],
      ['slab', 'slab.updateDimensions', { slabId: 'slab-1', thickness: 0.25 }],
      ['roof', 'roof.update', { id: 'roof-1', updates: { thickness: 0.25 } }],
    ] as const;
    for (const [kind, type, payload] of cases) {
      const r = resolveFull('set thickness to 250mm', ctxOf(sel(kind)));
      expect(r.kind, kind).toBe('commands');
      if (r.kind !== 'commands') continue;
      expect(r.commands).toEqual([{ type, payload }]);
    }
  });

  it('width routes openings through the live generic command, stairs through stair.updateParameters', () => {
    const cases = [
      ['door', 'element.updateParameters', { elementId: 'door-1', elementType: 'door', parameters: { width: 0.9 } }],
      ['window', 'element.updateParameters', { elementId: 'window-1', elementType: 'window', parameters: { width: 0.9 } }],
      ['stair', 'stair.updateParameters', { stairId: 'stair-1', updates: { width: 0.9 } }],
    ] as const;
    for (const [kind, type, payload] of cases) {
      const r = resolveFull('set width to 900mm', ctxOf(sel(kind)));
      expect(r.kind, kind).toBe('commands');
      if (r.kind !== 'commands') continue;
      expect(r.commands).toEqual([{ type, payload }]);
    }
  });

  it('roof pitch converts degrees to the GRADIENT slope roof.update takes (§FIX-CHAT-DEAD-ROUTES)', () => {
    // RoofGeometryBuilder: height = slope × distance — slope is rise/run, so
    // 30° → tan(30°) ≈ 0.5774. (roof.setPitch, which took radians, wrote the
    // detached plugin DTO store and is retired from chat dispatch.)
    const r = resolveFull('set the roof pitch to 30 degrees', ctxOf(sel('roof')));
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.type).toBe('roof.update');
    const p = r.commands[0]!.payload as { id: string; updates: { slope: number } };
    expect(p.id).toBe('roof-1');
    expect(p.updates.slope).toBeCloseTo(Math.tan(Math.PI / 6), 3);
  });

  it('roof pitch on a wall refuses honestly (the twin does not exist for walls)', () => {
    const r = resolveFull('set the pitch to 30 degrees', ctxOf(sel('wall')));
    expect(r.kind).toBe('refusal');
  });

  it('an out-of-range pitch refuses in the unit the user typed', () => {
    const r = resolveFull('set the roof pitch to 95 degrees', ctxOf(sel('roof')));
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('89');
  });

  it('room number dispatches room.setNumber', () => {
    const r = resolveFull('set the room number to 101', ctxOf(sel('room')));
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands).toEqual([{ type: 'room.setNumber', payload: { roomId: 'room-1', number: '101' } }]);
  });
});

// ─── §FIX-CHAT-COMPOUND-DIMENSIONS — the founder's window, verbatim ──────────

describe('compound dimensions resolve to ONE dispatch (live repro, build 70667276)', () => {
  it('the founder\'s exact sentence → one element.updateParameters carrying all three values', () => {
    const r = resolveFull(
      'Make this window 2 meters height, 2 meters width and 0.1 meters sill height',
      ctxOf(sel('window')),
    );
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.intent).toBe('set-dimensions');
    // ONE command. A sequence would dispatch into ids the first rebuild
    // re-minted ("window not found: b0a84065-…").
    expect(r.commands).toHaveLength(1);
    expect(r.commands[0]).toEqual({
      type: 'element.updateParameters',
      payload: {
        elementId: 'window-1',
        elementType: 'window',
        parameters: { height: 2, width: 2, sillHeight: 0.1 },
      },
    });
  });

  it('"make this wall 3m tall and 300mm thick" → one wall.updateDimensions', () => {
    const r = resolveFull('make this wall 3m tall and 300mm thick', ctxOf(sel('wall')));
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands).toEqual([
      { type: 'wall.updateDimensions', payload: { wallId: 'wall-1', height: 3, thickness: 0.3 } },
    ]);
  });

  it('a compound naming a property the kind does not have refuses WHOLE — no partial execution', () => {
    // Thickness does not apply to a window; applying height+width and skipping
    // thickness would be partial execution presented as success.
    const r = resolveFull('make this window 2m height and 300mm thickness', ctxOf(sel('window')));
    expect(r.kind).toBe('refusal');
  });

  it('a compound on a kind with no single multi-parameter command refuses with the reason', () => {
    // Slab: height routes via element.updateParameters, thickness via
    // slab.setThickness — no proven single dispatch carries both.
    const r = resolveFull('make this slab 300mm thick and 5m height', ctxOf(sel('slab')));
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('one');
  });
});
