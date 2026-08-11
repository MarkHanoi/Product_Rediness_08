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
import { resolveCompoundUtterance } from '../src/intents/SemanticPlan.js';
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

/** Resolve through the FULL ladder the bridge uses: the §PLAN compound stage
 *  (which stands aside for every ordinary sentence), then tier 0/1, then NL. */
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

// ─── Per-capability phrasing families ────────────────────────────────────────
//
// Each entry names the capability id (which is what the coverage gate greps
// for) and the context its examples need in order to be ACTED on rather than
// honestly refused.

interface AcceptanceCase {
  readonly id: string;
  readonly ctx: Partial<ResolverContext>;
  readonly phrasings: readonly string[];
  /**
   * RAC U9.2 — this family's `ctx` injects a `resolveScope`. The GA gate reads
   * this file as literal text (it cannot import a vitest module), so it cannot
   * see a resolver built by a helper; this one word is how the suite tells it,
   * and it is what lets the gate execute spatially-scoped examples instead of
   * counting them all as "spatial scoping isn't wired into this chat context".
   */
  readonly scoped?: boolean;
}

/**
 * RAC U9.2 — the scoped-delete families need a resolver for EVERY scope form,
 * including bare "all": `requireResolvedIds` forbids the unbounded payload so
 * the Confirm card can state a real count. This stub returns three ids for any
 * descriptor, which is exactly what the acceptance question is — did the
 * sentence reach the capability with a resolvable scope — and nothing more.
 */
const deleteScopeCtx = (elementType: string): Partial<ResolverContext> => ({
  selection: [{ elementId: `${elementType}-1`, elementType }],
  resolveScope: (() => ({
    ids: [`${elementType}-1`, `${elementType}-2`, `${elementType}-3`],
    kindCounts: { [elementType]: 3 },
    skipped: [],
    diagnostics: ['Level 0'],
  })) as never,
});

/**
 * RAC U9.2 (gate closure) — a family whose ctx offers BOTH a selection of the
 * right kind and a scope resolver. It exists because the C68 §6.3-G2 check
 * executes a capability's own `examples`, and three wall capabilities declare
 * selection-form and level-form examples their family context could not
 * satisfy — so each was counted as "unresolved" while being perfectly correct
 * in the app. Widening the context is the fix the ratchet's own note asked
 * for; the all-scope phrasings below are unaffected by a selection being
 * present, because an 'all' sentence never consults it.
 */
const scopedSel = (elementType: string): Partial<ResolverContext> => ({
  selection: [{ elementId: `${elementType}-1`, elementType }],
  resolveScope: (() => ({
    ids: [`${elementType}-1`, `${elementType}-2`, `${elementType}-3`],
    kindCounts: { [elementType]: 3 },
    skipped: [],
    diagnostics: ['Level 0'],
  })) as never,
});

const BASE_ACCEPTANCE: readonly AcceptanceCase[] = [
  // ── RAC U9.2 — the SAFE DESTRUCTIVE tranche ─────────────────────────────
  {
    id: 'delete-furniture-scoped',
    ctx: deleteScopeCtx('furniture'),
    scoped: true,
    phrasings: [
      'delete all furniture in the kitchen',
      'clear the furniture on this floor',
      'remove all furniture',
      'delete every furnishing on level 2',
    ],
  },
  {
    id: 'delete-windows-scoped',
    ctx: deleteScopeCtx('window'),
    scoped: true,
    phrasings: [
      'remove every window on level 2',
      'delete all windows in the kitchen',
      'delete all windows',
    ],
  },
  {
    id: 'delete-doors-scoped',
    ctx: deleteScopeCtx('door'),
    scoped: true,
    phrasings: [
      'delete all doors on level 2',
      'remove every door in the kitchen',
    ],
  },
  {
    id: 'delete-columns-scoped',
    ctx: deleteScopeCtx('column'),
    scoped: true,
    phrasings: [
      'delete all columns on level 2',
      'remove every column',
    ],
  },
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
  // ── RAC U7.2 — the CATALOGUE FAMILIES (generated from CatalogueFamilies.ts)
  {
    id: 'set-slab-type',
    ctx: sel('slab'),
    phrasings: [
      'change all slabs to rc slab monolithic 200mm',
      'change the slab type to composite deck',
      'convert the selected slabs to insulated screed',
    ],
  },
  {
    id: 'set-ceiling-type',
    ctx: sel('ceiling'),
    phrasings: [
      'change all ceilings to plasterboard 12.5mm',
      'change the ceiling type to suspended act 600x600',
      'convert the selected ceilings to exposed concrete soffit',
    ],
  },
  // ── RAC U7.1 — the PROPERTY VOCABULARY families ─────────────────────────
  // These reach applySemanticIntent through the ONE generic property arm and
  // the ONE table-compiled grammar; nothing about them is hand-written.
  {
    id: 'set-depth',
    ctx: sel('beam'),
    phrasings: [
      'set the depth to 500mm',
      'set the beam depth to 500mm',
      'change the depth to 0.5m',
      'make this 500mm deep',
    ],
  },
  {
    id: 'set-length',
    ctx: sel('furniture'),
    phrasings: [
      'set the length to 2m',
      'change the length to 1.8m',
      'make this 2m long',
    ],
  },
  {
    id: 'set-base-offset',
    ctx: sel('slab'),
    phrasings: [
      'set the base offset to 150 mm',
      'change the base offset to -0.2m',
      'set the slab base offset to 0.3m',
    ],
  },
  // ── RAC U7.3 — the extension proof, exercised end to end ────────────────
  // Four properties whose ENTIRE implementation is a table row + registry
  // metadata. If the U7 claim were false, these phrasings would not resolve.
  {
    id: 'set-mullion-size',
    ctx: sel('curtain-wall'),
    phrasings: [
      'set the mullion size to 60mm',
      'change the mullion width to 0.08m',
      'set the curtain wall mullion size to 50mm',
    ],
  },
  {
    id: 'set-panel-thickness',
    ctx: sel('curtain-wall'),
    phrasings: [
      'set the panel thickness to 12mm',
      'change the glazing thickness to 0.024m',
      'set the curtain wall panel thickness to 20mm',
    ],
  },
  {
    id: 'set-baluster-spacing',
    ctx: sel('handrail'),
    phrasings: [
      'set the baluster spacing to 100mm',
      'change the baluster spacing to 0.12m',
    ],
  },
  {
    id: 'set-baluster-width',
    ctx: sel('handrail'),
    phrasings: [
      'set the baluster width to 40mm',
      'change the baluster thickness to 0.03m',
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
    ctx: scopedSel('wall'),
    scoped: true,
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
    ctx: scopedSel('wall'),
    scoped: true,
    phrasings: [
      'make all walls white',
      'paint every wall light grey',
      'turn all walls beige',
      'Could you make all walls white, please?',
      'make all the walls #f4f1e8',
    ],
  },
  {
    id: 'set-wall-rake',
    ctx: scopedSel('wall'),
    scoped: true,
    phrasings: [
      'make all walls angled by 120 degrees',
      'tilt all walls by 70',
      'rake every wall to 100°',
      'make all walls vertical',
      'Could you make all walls angled by 70 degrees, please?',
    ],
  },
  {
    id: 'create-windows-parametric',
    ctx: sel('wall'),
    phrasings: [
      'create a window in the middle of every wall segment',
      'create 2 windows in all the wall segments',
      'create a 1x2m window every 3 meters in all walls',
      'place a window in the middle of the selected walls',
    ],
  },
  {
    id: 'add-wall-layer',
    ctx: sel('wall'),
    phrasings: [
      'add a 10mm plaster layer to the inner side of the selected wall',
      'add a 12mm plasterboard layer to all walls',
      'add a 20mm limewash finish to the outer side of all walls',
      'add a layer of 10 mm plaster to the selected walls',
    ],
  },
  {
    id: 'set-window-type',
    // Selection-form phrasings need a selected window; the injected resolver is
    // exercised by the dedicated describe block below (raw-forward here).
    ctx: sel('window'),
    phrasings: [
      'change all windows to timber casement',
      'change the window type to steel crittal style',
      'convert the selected windows to upvc casement',
      'Could you change all windows to timber casement, please?',
    ],
  },
  {
    id: 'set-door-type',
    // §FEAT-DOOR-TYPE-BATCH (RAC U4.3) — the extension-proof capability.
    // Selection-form phrasings need a selected door; the injected resolver is
    // exercised by the dedicated describe block below (raw-forward here).
    ctx: sel('door'),
    phrasings: [
      'change all doors to white primed softwood',
      'change the door type to glazed timber',
      'convert the selected doors to fire door fd30',
      'Could you change all doors to white primed softwood, please?',
    ],
  },
  {
    id: 'set-rhino-material',
    ctx: {},
    phrasings: [
      'change all elements of the rhino model to white',
      'paint the rhino model white',
      'make the rhino model light grey',
      'turn the rhino model #f4f1e8',
      'reset the rhino model materials',
      'restore the rhino model colours',
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
  // "at 9m" not "at 6m": the acceptance context already has a level at 6 m, and
  // §FIX-CHAT-LEVEL-ELEVATION-CLASH now refuses an occupied elevation rather
  // than stacking a second level on top of it (founder P0, 2026-08-10).
  { id: 'add-level', ctx: {}, phrasings: ['add a level', 'add a level at 9m', 'could you add another floor?'] },
  {
    id: 'duplicate-level',
    ctx: {},
    phrasings: [
      'duplicate level 0 to level 1',
      'duplicate Level 0 to Levels 1 and 2',
      'copy level 0 onto level 2',
      'Could you duplicate level 0 to levels 1 and 2?',
    ],
  },
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
  {
    // §GEN-CHAT (RAC U5b.2) — whole-building generation, conversationally.
    id: 'generate-building',
    ctx: {},
    phrasings: [
      'generate a 3-storey residential building',
      'generate a 2-storey house',
      'generate an office building with 5 floors',
      'create a residential building with 2-bed and 3-bed apartments',
      'build a 4 storey residential building',
      'generate a house',
      'make a new office building',
      'could you generate a 3-storey residential building?',
    ],
  },
  {
    // §GEN-CHAT-APARTMENT (RAC U5b.2, founder P0) — filling the drawn shell.
    id: 'generate-apartment-layout',
    ctx: {},
    phrasings: [
      'create an apartment with 2 bedrooms and 1 bathroom',
      'create a 3 bedroom apartment',
      'generate a 2 bed apartment in this shell',
      'make a 3-bedroom apartment with 2 bathrooms',
      'create a 4 bedroom apartment with an en-suite',
      // THE FOUNDER'S SENTENCE, verbatim including the misspelling. This is the
      // regression: 2026-08-10 it returned "I'm not sure how to help with that
      // yet" while the layout engine had shipped months earlier.
      'Create 3 bedroom apparment',
      'create an apartment layout',
      'generate a 2 bedroom flat with an open-plan kitchen',
    ],
  },
];

// §GEN-ROOMS / §GEN-CHAIN (RAC U5c) — appended rather than inlined above so
// the two families sit next to the tests that pin their refusals.
const U5C_ACCEPTANCE: readonly AcceptanceCase[] = [
  {
    id: 'generate-room-finishes',
    ctx: {},
    phrasings: [
      'furnish all rooms',
      'add ceilings to every room',
      'add floor finishes to all rooms',
      'light all rooms',
      'furnish and light this floor',
      'furnish every floor',
      'add ceilings to level 1',
      'could you furnish all the rooms please?',
    ],
  },
  {
    id: 'finish-apartment-chain',
    ctx: {},
    phrasings: [
      'finish this apartment',
      'finish this floor',
      'generate and finish an apartment',
      'complete this apartment',
    ],
  },
];

// §PLAN (RAC U6) — compound sentences. The founder's five, verbatim.
const U6_ACCEPTANCE: readonly AcceptanceCase[] = [
  {
    id: 'execute-plan',
    ctx: {},
    phrasings: [
      'duplicate level 0 to level 1, then furnish it',
      'generate a 2-storey house and then furnish all rooms',
      'add a level at 9 m, then duplicate level 0 onto it',
      'make all walls white then add ceilings to every room',
      'create a 3 bedroom apartment, then light all rooms',
      // The same sentences in the shapes he actually types them.
      'first duplicate level 0 to level 1, then furnish it',
      'make all walls white. after that, add ceilings to every room',
    ],
  },
];

const ACCEPTANCE: readonly AcceptanceCase[] = [...BASE_ACCEPTANCE, ...U5C_ACCEPTANCE, ...U6_ACCEPTANCE];

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

  // ─── ADR-0315 U3 — the first LEVEL-scoped sentence ─────────────────────────

  it('"make all walls on level 2 white" resolves the scope ONCE through the injected resolver', () => {
    const resolveScope = (scope: { kind: string; levelQuery?: string; elementKind?: string }) => {
      expect(scope).toEqual({ kind: 'level', levelQuery: '2', elementKind: 'wall' });
      return {
        ids: ['w-a', 'w-b', 'w-c'],
        kindCounts: { wall: 3 },
        skipped: [],
        diagnostics: ['Level 2'],
      };
    };
    const r = resolveUtterance('make all walls on level 2 white', ctxOf({ resolveScope } as never));
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.intent).toBe('set-wall-color');
    expect(r.commands).toEqual([{
      type: 'wall.updateColorBatch',
      payload: { wallIds: ['w-a', 'w-b', 'w-c'], materialColor: '#ffffff' },
    }]);
    expect(r.summary).toContain('3 walls on Level 2');
  });

  it('level scope with NO injected resolver refuses honestly — never guesses "all"', () => {
    const r = resolveUtterance('make all walls on level 2 white', ctxOf());
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain("spatial scoping isn't wired");
  });

  it('an unknown level surfaces the resolver error verbatim (listing real levels)', () => {
    const resolveScope = () => ({ error: 'No level called "9" — the levels here are: Level 0, Level 1, Level 2.' });
    const r = resolveUtterance('make all walls on level 9 white', ctxOf({ resolveScope } as never));
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('No level called "9"');
  });

  it('an empty level (0 walls) refuses rather than dispatching an empty batch', () => {
    const resolveScope = () => ({ ids: [], kindCounts: {}, skipped: [], diagnostics: ['Level 2'] });
    const r = resolveUtterance('make all walls on level 2 white', ctxOf({ resolveScope } as never));
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('no walls on level');
  });

  it('the polite NL form reaches the same scoped intent', () => {
    const resolveScope = () => ({
      ids: ['w-a'], kindCounts: { wall: 1 }, skipped: [], diagnostics: ['Level 2'],
    });
    const r = resolveFull('Could you make all walls on level 2 white?', ctxOf({ resolveScope } as never));
    expect(intentOf(r)).toBe('set-wall-color');
    expect(r.kind).toBe('commands');
  });

  it('"paint all walls in the kitchen white" resolves a ROOM scope (U3 room arm)', () => {
    const resolveScope = (scope: { kind: string; roomRef?: string; elementKind?: string }) => {
      expect(scope).toEqual({ kind: 'room', roomRef: 'kitchen', elementKind: 'wall' });
      return { ids: ['w-k1', 'w-k2'], kindCounts: { wall: 2 }, skipped: [], diagnostics: ['Kitchen'] };
    };
    const r = resolveUtterance('paint all walls in the kitchen white', ctxOf({ resolveScope } as never));
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands).toEqual([{
      type: 'wall.updateColorBatch',
      payload: { wallIds: ['w-k1', 'w-k2'], materialColor: '#ffffff' },
    }]);
    expect(r.summary).toContain('2 walls bounding Kitchen');
  });

  it('an unknown room surfaces the resolver error verbatim', () => {
    const resolveScope = () => ({ error: 'No room called "spa" — the rooms here include: Kitchen, Living Room.' });
    const r = resolveUtterance('paint all walls in the spa white', ctxOf({ resolveScope } as never));
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('No room called "spa"');
  });

  it('"paint all walls in white" stays a plain colour connector — not a room called "white"', () => {
    const r = resolveUtterance('paint all walls in white', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.payload).toEqual({ wallIds: 'all', materialColor: '#ffffff' });
  });

  it('US spelling and "gray" resolve identically', () => {
    const r = resolveUtterance('paint all walls light gray', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.payload).toEqual({ wallIds: 'all', materialColor: '#cccccc' });
  });
});

// ─── ADR-0315 U5a — conversational level duplication ─────────────────────────

describe('duplicate-level — the shipped DuplicateFloorPlanCommand, conversationally', () => {
  it('resolves source and multiple targets to ids and dispatches ONE command', () => {
    const r = resolveUtterance('duplicate level 0 to levels 1 and 2', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.intent).toBe('duplicate-level');
    expect(r.commands).toEqual([{
      type: 'level.duplicate-floor-plan',
      payload: { sourceLevelId: 'L0', targetLevelIds: ['L1', 'L2'] },
    }]);
    // Consequential blast radius → the Confirm/Cancel card.
    expect(r.destructive).toBe(true);
    // The HONEST report: what is NOT cloned is said out loud, pre-confirmation.
    expect(r.summary).toContain('NOT copied');
    expect(r.summary).toContain('rooms');
  });

  it('an unresolvable TARGET refuses whole — never a partial duplication', () => {
    const r = resolveUtterance('duplicate level 0 to levels 1 and 9', ctxOf());
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('"9"');
    expect(r.reason).toContain('nothing was duplicated');
  });

  it('self-duplication refuses', () => {
    const r = resolveUtterance('duplicate level 1 to level 1', ctxOf());
    expect(r.kind).toBe('refusal');
  });

  it('an element-noun source is NOT claimed ("copy this wall to level 2" stays a miss here)', () => {
    const r = resolveUtterance('copy this wall to level 2', ctxOf(sel('wall')));
    expect(intentOf(r)).not.toBe('duplicate-level');
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
    // §FIX-CHAT-VISIBILITY-MISREAD (RAC U9 P0, found by the U10 drain). The
    // worst misread measured: a READ-ONLY question silently RESIZED GEOMETRY.
    // "highlight walls taller than 3m" resolved to set-height and dispatched
    // wall.updateDimensions on the selected wall — the U8 filter vocabulary
    // ("taller than 3m") is exactly what the dimension family looks for, and
    // nothing in the ladder cared that the verb was about VISIBILITY.
    'highlight walls taller than 3m',
    'isolate doors higher than 2 meters',
    'show me walls thicker than 300mm',
    'hide all doors narrower than 900mm',
    // The same shape one step further out: a query verb plus a delete noun.
    // U9.2 shipped scoped deletion, so "find all furniture in the kitchen" is
    // now one word away from deleting it.
    'find all furniture in the kitchen',
    'count the windows on level 2',
    // §FIX-CHAT-REPORT-PASTEBACK (founder P0, 2026-08-10, reproduced twice on
    // the live deploy). The founder pasted the assistant's OWN report back into
    // the chat and the ladder CREATED A LEVEL from it — twice, stacking two
    // levels at 6.000 m. These are the exact strings, verbatim.
    'Built 6 floors — 18 apartments, 3 per apartment floor on average (apartments 72% of the plate)',
    'Built 6 floors',
    '3 per apartment floor on average',
    'Done — undo with Ctrl+Z. (resolved without AI tokens)',
    'Created 3 rooms and 12 walls',
    'Furnished 22 of 24 rooms',
    // §FIX-CHAT-STOPWORD-CORRECTION — the SECOND founder repro. This was
    // answered with "Nothing is selected — select an element first, then set
    // its width": tier-1 rewrote the function word "with" into "width".
    'Created Aparment with 2 bedrooms and 1 bathroom',
  ])('"%s" produces no command and no local action', (utterance) => {
    const ctx = ctxOf(sel('wall'));
    expect(mutating(resolveUtterance(utterance, ctx)), 'tier 0/1 mutated').toBe(false);
    const nl = resolveNaturalLanguage(utterance, ctx);
    expect(nl.kind === 'resolved' && mutating(nl.resolution), 'NL layer mutated').toBe(false);
  });

  it('§FIX-CHAT-REPORT-PASTEBACK — the report line is a MISS on every rung of the ladder', () => {
    // Not merely non-mutating: it must not be RECOGNIZED at all, on tier 0, on
    // the tier-1 typo path, or by the NL classifier at any confidence. A
    // clarification ("which level did you mean?") would be almost as wrong —
    // the user did not ask for anything.
    const line =
      'Built 6 floors — 18 apartments, 3 per apartment floor on average (apartments 72% of the plate)';
    const ctx = ctxOf();
    expect(resolveUtterance(line, ctx).kind, 'tier 0/1 claimed the report').toBe('miss');
    expect(resolveNaturalLanguage(line, ctx).kind, 'NL claimed the report').toBe('miss');
    expect(resolveFull(line, ctx).kind).toBe('miss');
  });

  it('§FIX-CHAT-STOPWORD-CORRECTION — "with" is never corrected into "width"', () => {
    // The founder's sentence must be a MISS on every rung — not a set-width
    // refusal, which is what shipped.
    const line = 'Created Aparment with 2 bedrooms and 1 bathroom';
    const ctx = ctxOf(sel('wall'));
    expect(resolveUtterance(line, ctx).kind, 'tier 0/1 claimed it').toBe('miss');
    expect(resolveNaturalLanguage(line, ctx).kind, 'NL claimed it').toBe('miss');
    expect(intentOf(resolveFull(line, ctx))).not.toBe('set-width');
    // And the sentence the founder MEANT works, bathrooms included.
    const r = resolveFull('create an apartment with 2 bedrooms and 1 bathroom', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.intent).toBe('generate-apartment-layout');
    expect(r.commands[0]!.payload).toMatchObject({ bedrooms: 2, bathrooms: 1 });
    // The typo tolerance that DOES belong to tier 1 is untouched.
    expect(intentOf(resolveFull('create an aparment with 2 bedrooms', ctxOf())))
      .toBe('generate-apartment-layout');
  });

  it('§FIX-CHAT-REPORT-PASTEBACK — the guard does not swallow real imperatives', () => {
    // The gate claims past-tense OPENERS and report SHAPE only; every live
    // creation sentence still lands.
    for (const [u, id] of [
      ['add a level', 'add-level'],
      ['create a new level at 9m', 'add-level'],
      ['make all walls white', 'set-wall-color'],
      ['generate a 3-storey residential building', 'generate-building'],
    ] as const) {
      expect(intentOf(resolveFull(u, ctxOf())), `"${u}" stopped resolving`).toBe(id);
    }
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

// ─── §FIX-CHAT-LEVEL-ELEVATION-CLASH (founder P0) ────────────────────────────

describe('add-level never silently stacks two levels at one elevation', () => {
  it('refuses an occupied elevation, quoting the occupant and the next free one', () => {
    // The live defect created L1786395410745 @ 6.000 m and then a SECOND level
    // at the same 6.000 m, with no warning of any kind.
    const r = resolveFull('add a level at 6m', ctxOf());
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.intent).toBe('add-level');
    expect(r.reason).toContain('Level 2 is already at 6 m');
    expect(r.reason).toContain('nothing was added');
    expect(r.reason).toContain('add a level at 9 m');
    expect(r.reason).toContain('duplicate level 2');
  });

  it('a free elevation still adds, and the default keeps climbing', () => {
    const explicit = resolveFull('add a level at 9m', ctxOf());
    expect(explicit.kind).toBe('commands');
    if (explicit.kind !== 'commands') return;
    expect(explicit.commands[0]!.payload['elevation']).toBe(9);
    const dflt = resolveFull('add a level', ctxOf());
    expect(dflt.kind).toBe('commands');
    if (dflt.kind !== 'commands') return;
    expect(dflt.commands[0]!.payload['elevation']).toBe(9);
  });
});

// ─── §GEN-ROOMS / §GEN-CHAIN (RAC U5c) — granularity is a hard stopper ───────

describe('§GEN-ROOMS — the room-scale engines, and what they honestly cannot do', () => {
  it('"furnish all rooms" runs the furnish engine on the active level, and SAYS it also lights', () => {
    const r = resolveFull('furnish all rooms', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.intent).toBe('generate-room-finishes');
    expect(r.commands[0]!.type).toBe('generation.rooms');
    expect(r.commands[0]!.payload).toMatchObject({ steps: ['furnish'], levelId: 'L0' });
    // §FURNISH-ALWAYS-LIGHTS is a shipped cascade the user did not ask for —
    // a surprise is a small dishonesty, so the Confirm card states it.
    expect(r.summary).toContain('auto-lights');
    expect(r.destructive).toBe(true);
  });

  it('"furnish and light this floor" is ONE ask with both engines, in pipeline order', () => {
    const r = resolveFull('furnish and light this floor', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.payload['steps']).toEqual(['furnish', 'lighting']);
  });

  it('"add ceilings to level 1" targets the NAMED level, not the active one', () => {
    const r = resolveFull('add ceilings to level 1', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.payload).toMatchObject({ steps: ['ceilings'], levelId: 'L1' });
  });

  it('a room-scoped ask is RECOGNIZED and refused with the engine\'s real granularity', () => {
    // Never widened to the level: "furnish the kitchen" must not furnish the
    // bedrooms too, and must not pretend it did only the kitchen.
    const r = resolveFull('furnish the kitchen', ctxOf());
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.intent).toBe('generate-room-finishes');
    expect(r.reason).toContain('whole level at a time');
    expect(r.reason).toContain('kitchen');
    expect(r.reason).toContain('Nothing was changed');
  });

  it('every-floor asks are honest about which engine actually has that driver', () => {
    const furnish = resolveFull('furnish every floor', ctxOf());
    expect(furnish.kind).toBe('commands');
    if (furnish.kind === 'commands') {
      expect(furnish.commands[0]!.payload).toMatchObject({ allLevels: true });
    }
    const ceilings = resolveFull('add ceilings to every floor', ctxOf());
    expect(ceilings.kind).toBe('refusal');
    if (ceilings.kind !== 'refusal') return;
    expect(ceilings.reason).toContain('Only furnishing has an every-floor driver');
    expect(ceilings.reason).toContain('Nothing was changed');
  });

  it('an unknown level refuses by LISTING the real ones', () => {
    const r = resolveFull('furnish level 9', ctxOf());
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('Level 0, Level 1, Level 2');
  });
});

describe('§GEN-CHAIN — the finishing chain as a conversational flow', () => {
  it('"finish this apartment" names every stage in the Confirm card, in order', () => {
    const r = resolveFull('finish this apartment', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.intent).toBe('finish-apartment-chain');
    expect(r.commands[0]!.type).toBe('generation.finish-chain');
    expect(r.commands[0]!.payload).toMatchObject({ withLayout: false, levelId: 'L0' });
    // The user is authorising a multi-stage mutation — the card must say what
    // the stages are BEFORE it runs.
    expect(r.summary).toContain('ceilings, floor finishes, furniture, then lighting');
    expect(r.summary).toContain('rooms it cannot complete are named');
    expect(r.destructive).toBe(true);
  });

  it('"generate and finish an apartment" re-plans first; "finish" alone never does', () => {
    const withLayout = resolveFull('generate and finish an apartment', ctxOf());
    expect(withLayout.kind).toBe('commands');
    if (withLayout.kind === 'commands') {
      expect(withLayout.commands[0]!.payload['withLayout']).toBe(true);
      expect(withLayout.summary).toContain('lay out the apartment');
    }
    const without = resolveFull('finish this floor', ctxOf());
    expect(without.kind).toBe('commands');
    if (without.kind === 'commands') {
      expect(without.commands[0]!.payload['withLayout']).toBe(false);
    }
  });

  it('§GEN-OFFER (U5c.3) — the post-duplicate offer is accepted in one reply, never automatic', () => {
    // Without an open offer a bare "yes" means nothing and must stay a miss —
    // otherwise the word would be a loaded gun pointing at the last intent.
    expect(resolveFull('yes', ctxOf()).kind).toBe('miss');
    expect(resolveNaturalLanguage('yes', ctxOf()).kind).toBe('miss');
    // With the offer open it becomes the finishing chain — and the chain is
    // destructive, so the Confirm card still stands between "yes" and the model.
    for (const reply of ['yes', 'yes please', 'go ahead', 'do it', 'sure']) {
      const nl = resolveNaturalLanguage(reply, {
        ...ctxOf(),
        conversation: { lastIntent: 'duplicate-level', pendingOffer: 'finish-chain' },
      });
      expect(nl.kind, `"${reply}" was not accepted`).toBe('resolved');
      if (nl.kind !== 'resolved') continue;
      expect(nl.intent).toBe('finish-apartment-chain');
      expect(nl.resolution.kind === 'commands' && nl.resolution.destructive).toBe(true);
      // The offer is spent: the next turn carries no pendingOffer.
      expect(nl.conversation.pendingOffer).toBeUndefined();
    }
  });

  it('the chain outranks the single-stage grammar when both shapes match', () => {
    expect(intentOf(resolveFull('finish this apartment and light it', ctxOf())))
      .toBe('finish-apartment-chain');
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
    // Still a miss, and must stay one: this is a QUALITATIVE ask ("feel more
    // spacious") with no programme in it, so there is nothing to dispatch.
    expect(resolveFull('make this apartment feel more spacious', ctxOf(sel('wall'))).kind).toBe('miss');
    // "generate an apartment layout" was asserted here as a MISS until
    // §GEN-CHAT-APARTMENT (RAC U5b.2). It is no longer one — deliberately.
    // The apartment-layout engine had shipped months before the chat could
    // reach it, which is precisely the c1902a5a failure the capability
    // coverage gate exists to prevent, and the founder hit it live on
    // 2026-08-10 ("Create 3 bedroom apparment" → "I'm not sure how to help
    // with that yet"). The assertion moved to the capability's acceptance
    // family above rather than being deleted, so the sentence is still pinned.
    expect(resolveFull('generate an apartment layout', ctxOf()).kind).toBe('commands');
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

describe('§FEAT-WALL-RAKE-BATCH — "make all walls angled by 120 degrees"', () => {
  it('reaches wall.updateRakeBatch with scope all and the parsed angle', () => {
    const r = resolveUtterance('make all walls angled by 120 degrees', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.intent).toBe('set-wall-rake');
    expect(r.tier).toBe(0);
    expect(r.commands).toEqual([
      { type: 'wall.updateRakeBatch', payload: { wallIds: 'all', rakeAngleDeg: 120 } },
    ]);
    expect(r.destructive).toBe(false);
    expect(r.summary).toContain('every wall in the project');
  });

  it('"make the selected walls angled by 70" scopes to the SELECTION walls only', () => {
    const ctx = ctxOf({
      selection: [
        { elementId: 'w1', elementType: 'wall' },
        { elementId: 'w2', elementType: 'wall' },
        { elementId: 'd1', elementType: 'door' },
      ],
    });
    const r = resolveUtterance('make the selected walls angled by 70', ctx);
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.payload).toEqual({ wallIds: ['w1', 'w2'], rakeAngleDeg: 70 });
  });

  it('"make all walls vertical" means 90 degrees', () => {
    const r = resolveUtterance('make all walls vertical', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.payload).toEqual({ wallIds: 'all', rakeAngleDeg: 90 });
    expect(r.summary).toContain('(vertical)');
  });

  it('an out-of-range angle refuses with the geometry package\'s REAL bounds — a parse, never a miss', () => {
    const r = resolveUtterance('make all walls angled by 200 degrees', ctxOf());
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.intent).toBe('set-wall-rake');
    expect(r.reason).toContain('15');
    expect(r.reason).toContain('165');
  });

  it('level scope resolves ONCE through the injected resolver ("on the ground floor")', () => {
    const resolveScope = (scope: { kind: string; levelQuery?: string; elementKind?: string }) => {
      expect(scope).toEqual({ kind: 'level', levelQuery: 'ground floor', elementKind: 'wall' });
      return { ids: ['w-a', 'w-b'], kindCounts: { wall: 2 }, skipped: [], diagnostics: ['Ground Floor'] };
    };
    const r = resolveUtterance('tilt all walls on the ground floor by 60 degrees', ctxOf({ resolveScope } as never));
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands).toEqual([{
      type: 'wall.updateRakeBatch',
      payload: { wallIds: ['w-a', 'w-b'], rakeAngleDeg: 60 },
    }]);
    expect(r.summary).toContain('2 walls on Ground Floor');
  });

  it('level scope with NO injected resolver refuses honestly — never guesses "all"', () => {
    const r = resolveUtterance('tilt all walls on level 2 by 60 degrees', ctxOf());
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain("spatial scoping isn't wired");
  });

  it('selection scope with no walls selected refuses and names what IS selected', () => {
    const r = resolveUtterance('make these walls angled by 70', ctxOf(sel('door')));
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('door');
    expect(r.reason).toContain('Nothing was changed');
  });

  it('grammar ordering holds — rake never steals colour/type/height sentences and vice versa', () => {
    expect(intentOf(resolveUtterance('make all walls white', ctxOf()))).toBe('set-wall-color');
    expect(intentOf(resolveUtterance('make all walls interior partition', ctxOf()))).toBe('set-wall-type');
    const rake = resolveUtterance('make all walls angled by 70', ctxOf());
    expect(intentOf(rake)).toBe('set-wall-rake');
    expect(rake.kind).toBe('commands');
  });
});

describe('§FEAT-WINDOW-TYPE-BATCH — "change the window type to …"', () => {
  const windowCtx = {
    resolveWindowSystemType: (ref: string) =>
      /timber casement/i.test(ref) ? { id: 'wt-timber-casement', name: 'Timber Casement' } : null,
    windowSystemTypeNames: ['Single Pane (Default)', 'Timber Casement', 'Steel Crittal Style'],
  };

  it('"change all windows to timber casement" reaches window.updateSystemTypeBatch, resolved to the id', () => {
    const r = resolveUtterance('change all windows to timber casement', ctxOf(windowCtx as never));
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.intent).toBe('set-window-type');
    expect(r.commands).toEqual([{
      type: 'window.updateSystemTypeBatch',
      payload: { windowIds: 'all', systemType: 'wt-timber-casement' },
    }]);
    expect(r.summary).toContain('every window in the project');
    expect(r.summary).toContain('Timber Casement');
  });

  it("the founder's singular form scopes to the SELECTED window", () => {
    const ctx = ctxOf({ ...(windowCtx as object), ...sel('window', 'win-9') } as never);
    const r = resolveUtterance('change the window type to timber casement', ctx);
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.payload).toEqual({ windowIds: ['win-9'], systemType: 'wt-timber-casement' });
  });

  it('an unknown type refuses by LISTING the real window catalogue', () => {
    const r = resolveUtterance('change all windows to bay window deluxe', ctxOf(windowCtx as never));
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.intent).toBe('set-window-type');
    expect(r.reason).toContain('Timber Casement');
    expect(r.reason).toContain('Steel Crittal Style');
  });

  it('without the injected resolver the raw ref is FORWARDED — the command owns the refusal', () => {
    const r = resolveUtterance('change all windows to timber casement', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.payload).toEqual({ windowIds: 'all', systemType: 'timber casement' });
  });

  it('selection scope with no window selected refuses and names what IS selected', () => {
    const r = resolveUtterance('convert the selected windows to timber casement', ctxOf({ ...(windowCtx as object), ...sel('wall') } as never));
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('wall');
    expect(r.reason).toContain('Nothing was changed');
  });

  it('dimension sentences are NEVER claimed as a type ask', () => {
    const r = resolveUtterance('make all windows 1m wide', ctxOf(sel('window')));
    expect(intentOf(r)).not.toBe('set-window-type');
  });
});

describe('§FEAT-DOOR-TYPE-BATCH (RAC U4.3) — "change the door type to …" (the extension proof)', () => {
  const doorCtx = {
    resolveDoorSystemType: (ref: string) =>
      /white primed/i.test(ref) ? { id: 'dt-white-primed', name: 'White Primed Softwood' } : null,
    doorSystemTypeNames: ['Solid Timber (Default)', 'White Primed Softwood', 'Fire Door FD30'],
  };

  it('"change all doors to white primed softwood" reaches door.updateSystemTypeBatch, resolved to the id', () => {
    const r = resolveUtterance('change all doors to white primed softwood', ctxOf(doorCtx as never));
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.intent).toBe('set-door-type');
    expect(r.commands).toEqual([{
      type: 'door.updateSystemTypeBatch',
      payload: { doorIds: 'all', systemType: 'dt-white-primed' },
    }]);
    expect(r.summary).toContain('every door in the project');
    expect(r.summary).toContain('White Primed Softwood');
  });

  it("the founder's singular form scopes to the SELECTED door", () => {
    const ctx = ctxOf({ ...(doorCtx as object), ...sel('door', 'door-3') } as never);
    const r = resolveUtterance('change the door type to white primed softwood', ctx);
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.payload).toEqual({ doorIds: ['door-3'], systemType: 'dt-white-primed' });
  });

  it('an unknown type refuses by LISTING the real door catalogue', () => {
    const r = resolveUtterance('change all doors to barn door deluxe', ctxOf(doorCtx as never));
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.intent).toBe('set-door-type');
    expect(r.reason).toContain('Solid Timber (Default)');
    expect(r.reason).toContain('Fire Door FD30');
  });

  it('without the injected resolver the raw ref is FORWARDED — the command owns the refusal', () => {
    const r = resolveUtterance('change all doors to white primed softwood', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.payload).toEqual({ doorIds: 'all', systemType: 'white primed softwood' });
  });

  it('selection scope with no door selected refuses and names what IS selected', () => {
    const r = resolveUtterance('convert the selected doors to white primed softwood', ctxOf({ ...(doorCtx as object), ...sel('wall') } as never));
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('wall');
    expect(r.reason).toContain('Nothing was changed');
  });

  it('dimension and swing sentences are NEVER claimed as a type ask', () => {
    expect(intentOf(resolveUtterance('make all doors 1m wide', ctxOf(sel('door'))))).not.toBe('set-door-type');
    expect(intentOf(resolveUtterance('change all doors to left swing', ctxOf(sel('door'))))).not.toBe('set-door-type');
  });
});

describe('§FEAT-WALL-LAYER-ADD-BATCH — "add a 10mm plaster layer …"', () => {
  it('the canonical sentence resolves side, thickness (mm→m), finish and selection scope', () => {
    const r = resolveUtterance(
      'add a 10mm plaster layer to the inner side of the selected wall',
      ctxOf(sel('wall', 'w-7')),
    );
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.intent).toBe('add-wall-layer');
    expect(r.commands).toEqual([{
      type: 'wall.addLayerBatch',
      payload: {
        wallIds: ['w-7'], side: 'interior', thickness: 0.01,
        name: 'Plaster · Skim Coat (Painted)', materialColor: '#f5f5f0', materialId: 'gypsum-skim',
      },
    }]);
    expect(r.destructive).toBe(false);
  });

  it("the founder's loose word order still parses (thickness after finish, 'mms')", () => {
    const r = resolveUtterance(
      'add a finish layer on the inner side of the selected wall with 10 mms thickness of plaster',
      ctxOf(sel('wall', 'w-7')),
    );
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    const payload = r.commands[0]!.payload as { thickness: number; materialId: string; side: string };
    expect(payload.thickness).toBe(0.01);
    expect(payload.materialId).toBe('gypsum-skim');
    expect(payload.side).toBe('interior');
  });

  it('"outer side" maps to exterior; "all walls" maps to the all scope', () => {
    const r = resolveUtterance('add a 20mm limewash finish to the outer side of all walls', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.payload).toMatchObject({ wallIds: 'all', side: 'exterior', thickness: 0.02, materialId: 'paint-limewash-cream' });
  });

  it('missing thickness CLAIMS and asks concretely — never a silent miss to the LLM', () => {
    const r = resolveUtterance('add a plaster layer to the selected wall', ctxOf(sel('wall')));
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.intent).toBe('add-wall-layer');
    expect(r.reason).toContain('how thick');
  });

  it('an unknown finish refuses by LISTING the real vocabulary', () => {
    const r = resolveUtterance('add a 10mm unobtainium layer to all walls', ctxOf());
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.intent).toBe('add-wall-layer');
    expect(r.reason).toContain('plaster');
    expect(r.reason).toContain('limewash');
  });

  it('selection scope with no wall selected refuses and names what IS selected', () => {
    const r = resolveUtterance('add a 10mm plaster layer to the selected walls', ctxOf(sel('door')));
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('door');
  });

  it('no scope word ⇒ no claim (same discipline as every wall batch)', () => {
    const r = resolveUtterance('add a 10mm plaster layer to walls', ctxOf());
    expect(intentOf(r)).not.toBe('add-wall-layer');
  });
});

describe('§FEAT-WINDOW-PARAMETRIC-CREATE — "create a window in the middle of every wall segment"', () => {
  it('count mode, all scope, default size STATED in the Confirm summary', () => {
    const r = resolveUtterance('create a window in the middle of every wall segment', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.intent).toBe('create-windows-parametric');
    expect(r.commands).toEqual([{
      type: 'window.parametricCreate',
      payload: { wallIds: 'all', mode: { kind: 'count', count: 1 }, width: 1, height: 1.2, sillHeight: 0.9 },
    }]);
    expect(r.destructive).toBe(true);          // mass creation ⇒ Confirm card
    expect(r.summary).toContain('(default size)');
    expect(r.summary).toContain('skipped');
  });

  it('"create 2 windows in all the wall segments" carries the count', () => {
    const r = resolveUtterance('create 2 windows in all the wall segments', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect((r.commands[0]!.payload as { mode: unknown }).mode).toEqual({ kind: 'count', count: 2 });
  });

  it('the founder sentence: 1x2m window every 3 meters — spacing mode with the explicit size', () => {
    const r = resolveUtterance('create a 1x2m window every 3 meters in all walls', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.payload).toMatchObject({
      wallIds: 'all', mode: { kind: 'spacing', spacingM: 3 }, width: 1, height: 2,
    });
    expect(r.summary).not.toContain('(default size)');
  });

  it('level scope resolves through the injected resolver ("in the walls on the ground floor")', () => {
    const resolveScope = (scope: { kind: string; levelQuery?: string; elementKind?: string }) => {
      expect(scope.kind).toBe('level');
      expect(scope.elementKind).toBe('wall');
      return { ids: ['w-a', 'w-b'], kindCounts: { wall: 2 }, skipped: [], diagnostics: ['Ground Floor'] };
    };
    const r = resolveUtterance('create a 1x2m window every 3 meters in the walls on the ground floor', ctxOf({ resolveScope } as never));
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect((r.commands[0]!.payload as { wallIds: unknown }).wallIds).toEqual(['w-a', 'w-b']);
    expect(r.summary).toContain('Ground Floor');
  });

  it('spacing tighter than the window width refuses with the overlap reason', () => {
    const r = resolveUtterance('create a 2x1m window every 1 m in all walls', ctxOf());
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('overlap');
  });

  it('selection scope with no walls selected refuses and names what IS selected', () => {
    const r = resolveUtterance('place a window in the middle of the selected walls', ctxOf(sel('roof')));
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('roof');
  });

  it('"create a wall from (0,0) to (5,0)" is untouched — the window word is the claim', () => {
    const r = resolveUtterance('create a wall from (0,0) to (5,0)', ctxOf());
    expect(intentOf(r)).toBe('create-wall');
  });
});

describe('ADR-0315 U3 tail — the ORIENTATION scope arm ("all south-facing walls")', () => {
  const orient = (ids: string[]) => ({
    resolveScope: (scope: { kind: string; orientation?: string }) => {
      expect(scope).toEqual({ kind: 'orientation', orientation: 'S' });
      return { ids, kindCounts: { wall: ids.length }, skipped: [], diagnostics: ['south-facing exterior'] };
    },
  });

  it('"paint all south-facing walls white" resolves through the orientation arm', () => {
    const r = resolveUtterance('paint all south-facing walls white', ctxOf(orient(['w-s1', 'w-s2']) as never));
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.intent).toBe('set-wall-color');
    expect(r.commands).toEqual([{
      type: 'wall.updateColorBatch',
      payload: { wallIds: ['w-s1', 'w-s2'], materialColor: '#ffffff' },
    }]);
    expect(r.summary).toContain('2 south-facing exterior walls');
  });

  it('"make all south facing exterior walls angled by 70" rides the same arm into the rake batch', () => {
    const r = resolveUtterance('make all south facing exterior walls angled by 70', ctxOf(orient(['w-s1']) as never));
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.intent).toBe('set-wall-rake');
    expect(r.commands[0]!.payload).toEqual({ wallIds: ['w-s1'], rakeAngleDeg: 70 });
  });

  it('orientation with NO injected resolver refuses honestly — never guesses "all"', () => {
    const r = resolveUtterance('paint all south-facing walls white', ctxOf());
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('facing south');
  });

  it('the resolver error passes through verbatim (e.g. rooms not detected yet)', () => {
    const resolveScope = () => ({ error: 'No exterior walls could be classified yet — rooms define which walls are exterior, so detect rooms first.' });
    const r = resolveUtterance('paint all north-facing walls white', ctxOf({ resolveScope } as never));
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('detect rooms first');
  });

  it('orientation never composes with the selection scope — not claimed', () => {
    const r = resolveUtterance('paint the selected south-facing walls white', ctxOf(sel('wall')));
    expect(intentOf(r)).not.toBe('set-wall-color');
  });
});

// ─── §GEN-CHAT (RAC U5b.2) — conversational GENERATION ───────────────────────
//
// Two capabilities that are easy to confuse and must never be: one makes a NEW
// BUILDING from the site boundary, the other lays a plan into the walls that
// are ALREADY DRAWN. Everything below pins that boundary, the payloads the bus
// receives, and the refusals that quote each generator's OWN limits.

describe('§GEN-CHAT — "generate a 3-storey residential building"', () => {
  it('routes to ONE generation.building command with the typed payload', () => {
    const r = resolveUtterance('generate a 3-storey residential building', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands).toHaveLength(1);
    expect(r.commands[0]!.type).toBe('generation.building');
    expect(r.commands[0]!.payload).toEqual({ typology: 'residential-building', floors: 3 });
    // A whole building is consequential — the Confirm card states typology and
    // floors before anything is dispatched.
    expect(r.destructive).toBe(true);
    expect(r.summary).toContain('3-storey');
    expect(r.summary).toContain('residential building');
  });

  it('the house and office arms carry their own typology + floor count', () => {
    const h = resolveUtterance('generate a 2-storey house', ctxOf());
    expect(h.kind).toBe('commands');
    if (h.kind !== 'commands') return;
    expect(h.commands[0]!.payload).toEqual({ typology: 'house', floors: 2 });

    const o = resolveUtterance('generate an office building with 5 floors', ctxOf());
    expect(o.kind).toBe('commands');
    if (o.kind !== 'commands') return;
    expect(o.commands[0]!.payload).toEqual({ typology: 'office', floors: 5 });
  });

  it('apartment-mix hints reach the payload as T1–T4 flags', () => {
    const r = resolveUtterance('create a residential building with 2-bed and 3-bed apartments', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.payload).toMatchObject({
      typology: 'residential-building',
      typologies: { T1: false, T2: true, T3: true, T4: false },
    });
  });

  it('an unstated floor count STATES the default rather than inventing one', () => {
    const r = resolveUtterance('generate a house', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    // No `floors` key at all — the generator's own default applies, and the
    // summary says which one, so the Confirm card is never silently wrong.
    expect(r.commands[0]!.payload).toEqual({ typology: 'house' });
    expect(r.summary).toContain('default');
  });

  // ── The refusals quote each generator's REAL limit, with both numbers ──────
  it('a 6-storey house is refused with the house generator own range', () => {
    const r = resolveUtterance('generate a 6-storey house', ctxOf());
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('1–3 storeys');
    expect(r.reason).toContain('6');
    // …and points at the generator that CAN do it, rather than dead-ending.
    expect(r.suggestions.join(' ')).toContain('residential building');
  });

  it('a 1-storey residential building is refused (ground + at least 1 apartment floor)', () => {
    const r = resolveUtterance('generate a 1-storey residential building', ctxOf());
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('at least 2 storeys');
    expect(r.suggestions.join(' ')).toContain('house');
  });

  it('a 30-storey residential building and a 60-storey office are refused at their caps', () => {
    const resi = resolveUtterance('generate a 30-storey residential building', ctxOf());
    expect(resi.kind).toBe('refusal');
    if (resi.kind === 'refusal') expect(resi.reason).toContain('21 storeys');

    const office = resolveUtterance('generate a 60-storey office building', ctxOf());
    expect(office.kind).toBe('refusal');
    if (office.kind === 'refusal') expect(office.reason).toContain('40 storeys');
  });

  it('element-level sentences are NEVER claimed as generation', () => {
    // "make the house walls white" is a colour ask that happens to contain the
    // word "house"; "create a window …" is the parametric-window grammar.
    expect(intentOf(resolveFull('make the house walls white', ctxOf()))).not.toBe('generate-building');
    expect(intentOf(resolveFull('create a window in the middle of every wall segment', ctxOf())))
      .not.toBe('generate-building');
  });
});

describe('§GEN-CHAT-APARTMENT — "create a 3 bedroom apartment" (the founder P0)', () => {
  it('THE REGRESSION: the founder misspelling resolves instead of dead-ending', () => {
    // 2026-08-10, typed live: "Create 3 bedroom apparment" →
    // "I'm not sure how to help with that yet", while the apartment-layout
    // engine had been shipping for months. A capability that cannot be spelled
    // at is a capability that does not exist.
    const r = resolveFull('Create 3 bedroom apparment', ctxOf());
    expect(intentOf(r)).toBe('generate-apartment-layout');
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.type).toBe('generation.apartment');
    expect(r.commands[0]!.payload).toEqual({ bedrooms: 3 });
  });

  it('bedrooms, bathrooms and the programme flags all reach the payload', () => {
    const r = resolveUtterance('make a 3-bedroom apartment with 2 bathrooms', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.payload).toEqual({ bedrooms: 3, bathrooms: 2 });

    const e = resolveUtterance('create a 4 bedroom apartment with an en-suite', ctxOf());
    expect(e.kind).toBe('commands');
    if (e.kind !== 'commands') return;
    expect(e.commands[0]!.payload).toEqual({ bedrooms: 4, masterEnSuite: true });

    const o = resolveUtterance('generate a 2 bedroom flat with an open-plan kitchen', ctxOf());
    expect(o.kind).toBe('commands');
    if (o.kind !== 'commands') return;
    expect(o.commands[0]!.payload).toEqual({ bedrooms: 2, openPlanKitchenDining: true });
  });

  it('the Confirm card says it fills the EXISTING shell — not a new building', () => {
    const r = resolveUtterance('create a 3 bedroom apartment', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.summary).toContain('already drawn');
    expect(r.summary).toContain('EXISTING shell');
    expect(r.destructive).toBe(true);
  });

  it('the two generation grammars are DISJOINT — "apartment building" is a new envelope', () => {
    // The distinction the founder cares about: one fills what he drew, the
    // other puts up a tower. A sentence may only ever mean one of them.
    expect(intentOf(resolveFull('generate a 3-storey apartment building', ctxOf())))
      .toBe('generate-building');
    expect(intentOf(resolveFull('generate a 6 storey apartment block', ctxOf())))
      .toBe('generate-building');
    expect(intentOf(resolveFull('create a 3 bedroom apartment', ctxOf())))
      .toBe('generate-apartment-layout');
  });

  it('qualitative and element-level apartment sentences stay out of it', () => {
    // No programme to dispatch — the LLM seam stays open (unchanged behaviour).
    expect(resolveFull('make this apartment feel more spacious', ctxOf()).kind).toBe('miss');
    // A colour ask that happens to name the apartment.
    expect(intentOf(resolveFull('make the apartment walls white', ctxOf())))
      .not.toBe('generate-apartment-layout');
  });
});

// ─── §PLAN (RAC U6) — compound sentences, and what a plan may NOT do ─────────

describe('§PLAN — compound sentences run as one confirmed, ordered plan', () => {
  it("the founder's five sentences each produce the right steps, in order", () => {
    const cases: readonly (readonly [string, readonly string[]])[] = [
      ['duplicate level 0 to level 1, then furnish it',
        ['level.duplicate-floor-plan', 'generation.rooms']],
      ['generate a 2-storey house and then furnish all rooms',
        ['generation.building', 'generation.rooms']],
      ['add a level at 9 m, then duplicate level 0 onto it',
        ['level.add', 'level.duplicate-floor-plan']],
      ['make all walls white then add ceilings to every room',
        ['wall.updateColorBatch', 'generation.rooms']],
      ['create a 3 bedroom apartment, then light all rooms',
        ['generation.apartment', 'generation.rooms']],
    ];
    for (const [utterance, expected] of cases) {
      const r = resolveFull(utterance, ctxOf());
      expect(intentOf(r), utterance).toBe('execute-plan');
      if (r.kind !== 'commands') continue;
      expect(r.commands.map((c) => c.type), utterance).toEqual(expected);
      // Every plan carries its step boundaries and its REAL undo cost.
      expect(r.plan!.steps.map((s) => s.index)).toEqual([1, 2]);
      expect(r.plan!.undoCost, utterance).toMatch(/steps/);
    }
  });

  it('ADVERSARIAL: "and" as a NOUN conjunction is never split into steps', () => {
    // "furnish the kitchen and the living room" is ONE ask about two rooms.
    // Splitting it would manufacture a second step out of a noun phrase — and
    // the single-intent ladder already has the right answer (the engine runs a
    // whole level at a time), which a plan must not take away from it.
    const r = resolveFull('furnish the kitchen and the living room', ctxOf());
    expect(intentOf(r)).toBe('generate-room-finishes');
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('whole level at a time');
    // …and the two-engine form stays one step too.
    expect(intentOf(resolveFull('furnish and light this floor', ctxOf())))
      .toBe('generate-room-finishes');
  });

  it('ADVERSARIAL: a REPORT-shaped clause refuses the WHOLE plan', () => {
    // The founder's paste-back defect wearing a compound sentence: the report
    // opener is not in opener position of the UTTERANCE, so the whole-text
    // guard cannot see it. The per-clause guard can, and the plan dies whole.
    const r = resolveFull(
      'make all walls white, then Built 6 floors — 18 apartments, 3 per apartment floor on average',
      ctxOf(),
    );
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.intent).toBe('execute-plan');
    expect(r.reason).toContain('reads like a report');
  });

  it('a plan may never reach a gate a single sentence would hit', () => {
    // Each of these clauses is refused ALONE; inside a plan it refuses the
    // whole plan, with the capability's own words, and nothing runs.
    const cases: readonly (readonly [string, string])[] = [
      ['make all walls white, then furnish the kitchen', 'whole level at a time'],
      ['make all walls white, then duplicate level 0 to level 9', 'No level called "9"'],
      ['make all walls white, then make all walls double glazed titanium', 'no wall type called'],
      ['make all walls white, then add a level at 3m', 'already at 3 m'],
    ];
    for (const [utterance, needle] of cases) {
      const r = resolveFull(utterance, ctxOf());
      expect(r.kind, utterance).toBe('refusal');
      if (r.kind !== 'refusal') continue;
      expect(r.reason, utterance).toContain(needle);
      expect(r.reason, utterance).toContain('Nothing in the plan was run');
    }
  });

  it('U6.3 — the undo cost is the sum of the steps, never "one undo"', () => {
    const two = resolveFull('make all walls white then add ceilings to every room', ctxOf());
    expect(two.kind === 'commands' && two.plan!.undoCost).toBe('2 steps — Ctrl+Z twice');
    // Three steps, one of which runs two engines → four real undo entries.
    const three = resolveFull(
      'make all walls white, then add ceilings to every room, then furnish and light this floor',
      ctxOf(),
    );
    expect(three.kind === 'commands' && three.plan!.steps.length).toBe(3);
    expect(three.kind === 'commands' && three.plan!.undoCost)
      .toBe('3 steps, 4 undo entries — Ctrl+Z four times');
  });
});
