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

/**
 * §FEAT-RAC-PROPERTY-QUERY (L-2210) — a selection PLUS a readable record.
 *
 * A named helper rather than an inline object literal on purpose: the GA gate
 * reads this file as literal text (`tools/ga-gate/lib/acceptanceCorpus.ts`) and
 * recognises a family's selection only in the `ctx: helper('kind')` shape. An
 * object literal here would make the gate believe the family declares NO
 * selection and report every example as "refused: nothing is selected" — the
 * harness measuring itself, which is the same finding that added
 * `GATE_STUB_SCOPE` and the rooms fixture to that gate.
 */
const readable = (elementType: string, value = 3.2) => ({
  ...sel(elementType),
  readProperty: () => ({ ok: true as const, value }),
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
  // ── §FEAT-BULK-DIMENSIONS (L-949) — the founder's bulk-dimension tranche ──
  //
  // "I have requested the possibility to ask to bulk change any element (doors,
  // windows, walls) dimensions (or multiple dims)." Every one of these was a
  // MISS or a "Nothing is selected" refusal before this capability existed —
  // and a miss falls through to an LLM that production does not have
  // configured, so a miss here is the founder seeing "I'm not sure how to help
  // with that yet".
  {
    id: 'set-window-dimensions',
    ctx: scopedSel('window'),
    scoped: true,
    phrasings: [
      'make all windows 2 meters height',
      'make all windows 2m high',
      'change all windows height to 2m',
      'make all windows 1m wide and 2m high',
      'make all windows 2 meters height, 1 meter width and 0.1 meters sill height',
      'make the selected windows 2m high',
      'set all windows on level 2 to 2m high',
    ],
  },
  {
    id: 'set-door-dimensions',
    ctx: scopedSel('door'),
    scoped: true,
    phrasings: [
      'make all doors 2m high',
      'make all doors 0.9m wide and 2.1m high',
      'change all doors width to 900mm',
      'make the selected doors 2.1m high',
    ],
  },
  // ── §CHAT-OPENING-SHAPE (L-10945) — the opening-PROFILE families ──────────
  //
  // §HONESTY65-CHAT-AXIS-TESTS (L-11153): both capabilities shipped with a
  // dedicated acceptance file (opening-shape-chat-acceptance.test.ts, 31 tests)
  // and NO family HERE — so "every declared capability has an acceptance
  // family" went red the day they landed. These phrasings are drawn from that
  // file's green set; the deep grammar coverage (catalogue-first guard, the
  // door-cannot-be-circular refusal, orientation) stays there.
  {
    id: 'set-window-shape',
    ctx: scopedSel('window'),
    scoped: true,
    phrasings: [
      // THE FOUNDER'S SENTENCE, verbatim — the refusal that opened L-10945.
      'change all windows to segmental type',
      'change all windows to segmental',
      'make all windows arched',
      'make all windows circular',
      'change the shape of all windows to segmental',
      'change all windows to rectangular',
      'change all windows on level 2 to segmental',
    ],
  },
  {
    id: 'set-door-shape',
    ctx: scopedSel('door'),
    scoped: true,
    phrasings: [
      'change all doors to arched',
      'change all doors to segmental',
      'make all doors rectangular',
      'make all doors segmental',
    ],
  },
  {
    id: 'set-wall-dimensions',
    ctx: scopedSel('wall'),
    scoped: true,
    phrasings: [
      'set all walls 3m high',
      'make all walls 2.7 meters high',
      'set all walls height to 3m',
      'make the selected walls 3m high',
      'set all walls on level 2 to 3.2m high',
    ],
  },
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
    // §FEAT-CHAT-TOOL-ACTIVATION (L-906) — chat → TOOL ACTIVATION, never
    // chat → creation. The resolution is a LOCAL 'activateTool' action; the
    // editor bridge resolves the noun against the element-creation matrix +
    // furniture catalogue and activates the palette's own tool. Nothing is
    // created until the user clicks (C83 §4.3).
    id: 'activate-placement',
    ctx: {},
    phrasings: ['create a bed', 'place a sofa', 'create slab', 'add a wardrobe', 'put a table'],
  },
  {
    // §FEAT-RAC-STAIR-SHAPE (L-1541) — the stair SHAPE axis, reachable from
    // language for the first time. Like `activate-placement` it ACTIVATES: the
    // shape is published to the one StairToolConfigStore chokepoint and the
    // palette's own stair tool is armed, so nothing is created until the user
    // clicks (C83 §4.3).
    //
    // ⭐ EMPTY CONTEXT ON PURPOSE. The founder's sentence names "the selected
    // wall", but the capability must resolve with NOTHING selected too — the
    // alignment is disclosed as un-applied either way (C67 §4 rule 20 makes
    // selection-as-geometry NOT BUILT), so a selection must not be what decides
    // whether the shape is honoured.
    id: 'create-stair-shape',
    ctx: {},
    phrasings: [
      'create a stair in L shape',
      'create a stair in U shape',
      'create an L-shaped stair',
      'add a straight stair',
      'create a curved stair',
    ],
  },
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
  // ── §GATE-VIS-INTENT (VIS-CLASS) — the visibility family ──────────────────
  {
    id: 'hide-selection',
    ctx: sel('wall'),
    phrasings: [
      'hide this wall',
      'hide the selection',
      'hide the selected walls',
      'hide it',
      'hide the wall',
    ],
  },
  {
    id: 'isolate-selection',
    ctx: sel('room'),
    phrasings: [
      'isolate this room',
      'isolate the selection',
      'isolate selected elements',
      'isolate the room',
    ],
  },
  {
    id: 'reveal-all',
    ctx: {},
    phrasings: [
      'reveal all',
      'show everything',
      'unhide everything',
      'exit isolation',
      'reveal all hidden elements',
    ],
  },
  {
    id: 'visibility-query',
    // A READABLE snapshot, so the phrasings get a real answer rather than the
    // honest "can't read" fallback (both are non-refusals; this exercises the
    // counting arm too).
    ctx: { visibility: { hiddenCount: 2, isolationActive: false, isolationCount: 0 } },
    phrasings: [
      'what is hidden',
      "what's hidden in this view?",
      'which elements are hidden in this view',
      'list the hidden elements',
      'am I in isolation mode?',
      'what levels are visible',
    ],
  },
  {
    // §FEAT-RAC-PROPERTY-QUERY (L-2210) — the second read-only capability.
    //
    // ⭐ TWO OF THESE PHRASINGS WERE PINNED IN THE ADVERSARIAL BLOCK BELOW AND
    // MOVED HERE, DELIBERATELY. "how tall is the selected wall?" and "what is
    // the height of this wall?" were listed as sentences that must produce "no
    // command and no local action" — and the reason given was that a QUESTION
    // must never RESIZE anything. That reason is intact and still enforced: the
    // block's `mutating()` predicate now excludes the read-only `'answer'`
    // action explicitly (see its comment), so a question that ANSWERS passes and
    // a question that dispatches still fails. What changed is that there is now
    // an answer to give; before this capability the correct outcome for these
    // two sentences was silence, and silence was never the goal.
    id: 'property-query',
    // A READABLE record, so the phrasings exercise the real read arm rather than
    // the honest "cannot read" fallback (both are non-refusals; this one also
    // proves the value reaches the sentence).
    ctx: readable('wall'),
    phrasings: [
      'how tall is this wall',
      'how tall is the selected wall?',
      'what is the height of this wall?',
      'how thick is the selected wall',
      'what is the base offset of this wall',
      'tell me the height of this wall',
      'the thickness of this wall',
    ],
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
  // ── §FEAT-CHAT-STAIR-TYPES (L-1441) — the founder's two stair sentences ───
  //
  // ⭐ THE FIRST PHRASING IN EACH FAMILY IS HIS LITERAL, DEFINITE ARTICLE AND
  // ALL. "Make all THE stairs type X" is the sentence that did not parse, and
  // the reason was `makeHostedTypeParser`'s missing `(?: of)?(?: the)?` — a gap
  // that silently broke window, door, slab and ceiling too (L-1440). Keeping
  // his exact words here is what stops that regressing back to a paraphrase
  // that happens to work.
  {
    // §FEAT-CHAT-STAIR-WIDTH + §FIX-DIMENSION-PROPERTY-FIRST (L-1442).
    // ⭐ The first phrasing is the founder's literal, and its WORD ORDER is the
    // point: the property leads. That order was missing for walls, windows and
    // doors too, so the last two phrasings pin it for the OTHER families in the
    // same run — a family-local pin would have let the shared grammar regress
    // for everyone else.
    id: 'set-stair-dimensions',
    ctx: scopedSel('stair'),
    scoped: true,
    phrasings: [
      'change width of all stairs to 1.2 meters',
      'change the width of all stairs to 1.2m',
      'make all stairs 1.2m wide',
      'set all stairs width to 1100mm',
      'make the selected stairs 1.2m wide',
    ],
  },
  {
    // §CW90 item 5 — the founder's "make all curtain walls 5 meters height".
    id: 'set-curtain-wall-dimensions',
    ctx: scopedSel('curtain-wall'),
    scoped: true,
    phrasings: [
      'make all curtain walls 5 meters high',
      'change all curtain walls to 5 meters height',
      'set all curtain walls height to 4m',
      'make all curtain walls in ground level 5 meters high',
    ],
  },
  {
    id: 'set-stair-railing-type',
    // scopedSel, not sel: these families FAN OUT, and `fanOutPerId` implies
    // `requireResolvedIds` — there are no ids to fan over until the scope is
    // resolved, so an 'all' sentence needs the resolver. That is the same
    // reason the delete families need one, and it is a property of the ROUTE
    // (no batch verb exists), not of the sentence.
    ctx: scopedSel('stair-railing'),
    scoped: true,
    phrasings: [
      'make all the stair railings type frameless glass balustrade',
      'make all the stair railings frameless glass balustrade',
      'change all stair railings to stainless cable railing',
      'make the selected railings timber picket railing',
    ],
  },
  {
    id: 'set-stair-type',
    ctx: scopedSel('stair'),
    scoped: true,
    phrasings: [
      'make all the stairs type monolithic concrete',
      'make all the stairs monolithic concrete',
      'change all stairs to steel open riser',
      'change the stair type to timber closed string',
    ],
  },
  {
    // §FEAT-CHAT-LIGHTING-TYPES (L-10220) — the founder's lighting sentence and
    // its neighbours. `scopedSel`, not `sel`: this family fans out, so
    // `fanOutPerId` implies `requireResolvedIds` and an 'all' sentence needs a
    // resolver before there are ids to fan over.
    //
    // ⭐ The SECOND phrasing is the founder's literal, level scope and all. It
    // parsed as typeRef "in ground level to recessed downlight" at project-wide
    // scope before §FIX-HOSTED-TYPE-SCOPE-TAIL, so it belongs in the acceptance
    // corpus rather than only in the fix's own regression file.
    id: 'set-lighting-type',
    ctx: scopedSel('lighting'),
    scoped: true,
    phrasings: [
      'change all lights to pendant',
      'change all lightings in ground level to recessed downlight',
      'make all the lights linear pendant',
      'change the lighting type to brass arc floor lamp',
    ],
  },
  {
    // §CW90 item 5 — the founder's curtain-wall type sentence, level scope and
    // all. Fan-out family (element.changeType), so `scopedSel` like lighting.
    // "point-fixed glass" is deliberately a PARTIAL name: the published table's
    // full name resolves from a uniquely-matching few words on the fuzzy ladder.
    id: 'set-curtain-wall-type',
    ctx: scopedSel('curtain-wall'),
    scoped: true,
    phrasings: [
      'change all curtain walls to structural glazing',
      'change all curtain walls in ground level to storefront',
      'make all the curtain walls spider point-fixed',
      'change the curtain wall type to unitised bronze',
    ],
  },
  // §CWCHAT155 — the founder's four literal curtain-wall PARAMETER sentences,
  // verbatim. `scopedSel('curtain-wall')` injects BOTH a curtain-wall selection
  // and a `resolveScope` stub that answers every descriptor kind (level /
  // orientation / room) with three ids — exactly what these four sentences'
  // level and orientation scopes need to resolve to a real dispatch rather than
  // an honest "spatial scoping isn't wired" refusal.
  {
    id: 'set-curtain-wall-parameter',
    ctx: scopedSel('curtain-wall'),
    scoped: true,
    phrasings: [
      'make mullion size of all curtain walls in ground level to 0.06 meters',
      'set post spacing to 1.2 on the west facade',
      'change panel thickness of all curtain walls to 0.024',
      'set transom spacing to 4 m on level 3',
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
    // §CW90 item 5 — post spacing, riding wall.updateCurtainWall so the
    // gridSystem clears with the write (see PropertyVocabulary for why
    // element.updateParameters could not carry this honestly).
    id: 'set-post-spacing',
    ctx: sel('curtain-wall'),
    phrasings: [
      'set the post spacing to 1.5m',
      'change the post spacing to 1200mm',
      'set the curtain wall bay width to 1m',
    ],
  },
  {
    id: 'set-transom-spacing',
    ctx: sel('curtain-wall'),
    phrasings: [
      'set the transom spacing to 1.2m',
      'change the transom spacing to 900mm',
      'set the curtain wall bay height to 1.5m',
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
  // §PROP-OVERHANG (RAC VERBS-CAP) — the second roof verb reachable from
  // language. Before this row the chat reached exactly one of thirteen roof
  // verbs while the eave geometry was proven to 0.000 mm.
  {
    id: 'set-overhang',
    ctx: sel('roof'),
    phrasings: [
      'set the roof overhang to 300mm',
      'change the overhang to 0.5m',
      'set the eaves overhang to 450mm',
      'make the overhang 300mm',
    ],
  },
  // ── ⭐ §FEAT-WINDOW-REVEAL-RAC (L-3202 … L-3204) — the window reveal ────────
  //
  // The founder was told these were "not reachable by RAC at all". Each family
  // below is the sentence that now reaches the panel control of the same name.
  //
  // ⚠ THE ANGLE PHRASINGS ARE THE POINT OF THE `measure` AXIS. "set the jamb
  // splay to 20" and "…to 20 degrees" must both arrive as TWENTY, not as 20
  // metres and not as 0.02 — every other member of this vocabulary is a length
  // and `toMeters` would have read them that way.
  // ⭐ §FEAT-REVEAL-DIRECTION-RAC (L-3414) — the FIRST enum capability, so the phrasings
  // deliberately cover both the STORED words and the words an architect actually uses.
  // Every one of them must land the canonical value; the vocabulary's `enumSpoken` table
  // is the only mapping, so a synonym accepted here cannot be rejected downstream.
  {
    id: 'set-reveal-direction',
    ctx: sel('window'),
    phrasings: [
      'set the reveal direction to outdoor',
      'change the reveal direction to indoor',
      'set the reveal side to outside',
      'set the reveal face to interior',
    ],
  },
  {
    id: 'set-reveal-projection',
    ctx: sel('window'),
    phrasings: [
      'set the reveal projection to 100mm',
      'change the reveal projection to -50mm',
      'set the window projection to 0.12m',
      'set the reveal depth to 80mm',
    ],
  },
  {
    id: 'set-reveal-splay',
    ctx: sel('window'),
    phrasings: [
      'set the reveal splay to 15 degrees',
      'change the splay to 20',
      'set the reveal splay to 0',
      'set the splay angle to 12°',
    ],
  },
  {
    id: 'set-reveal-splay-head',
    ctx: sel('window'),
    phrasings: [
      'set the head splay to 20 degrees',
      'change the reveal splay head to 10',
    ],
  },
  {
    id: 'set-reveal-splay-sill',
    ctx: sel('window'),
    phrasings: [
      'set the sill splay to 20 degrees',
      'change the reveal splay sill to 10',
    ],
  },
  {
    id: 'set-reveal-splay-jambs',
    ctx: sel('window'),
    phrasings: [
      'set the jamb splay to 20 degrees',
      'change the splay jambs to 15',
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
    // §FEAT-CHAT-ROOM-OCCUPANCY — the founder's ask, verbatim: "i want a
    // bathroom in the room 001, a bedroom in room 002 and 003 and a living
    // room". `scoped` supplies the injected room resolver the named-room
    // phrasings go through; `ctx` supplies the selection the last one uses.
    id: 'set-room-occupancy',
    ctx: scopedSel('room'),
    scoped: true,
    phrasings: [
      'make room 001 a bathroom',
      'set room 002 to bedroom',
      'i want a bathroom in room 001',
      'room 003 is a living room',
      'make rooms 002 and 003 bedrooms',
      'set the occupancy to kitchen',
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
    // §FEAT-WALL-SIDE-FINISH — the founder's per-side finish ask. Every phrasing
    // below is a shape he actually used or an obvious neighbour of one; the
    // family exists so a regression in the grammar's ORDER (it sits BEFORE
    // matchWallType, deliberately) shows up here rather than in his hands.
    id: 'set-wall-side-finish',
    ctx: scopedSel('wall'),
    scoped: true,
    phrasings: [
      'make all inner finishes walls on the ground floor to plaster',
      'change all walls in the kitchen finish limewash',
      'change the inner finish of all walls to microcement',
      'change all outer finishes walls to clay plaster',
      'Could you make all inner finishes walls on the ground floor to plaster, please?',
    ],
  },
  {
    // §FEAT-FLOOR-SURFACE-FINISH (L-1881) — the floor twin of set-wall-side-finish.
    // The founder's own bare sentence ("finish to wooden parquet") is NOT here on
    // purpose: it is a REFUSAL by design — "wooden parquet" names no single
    // material and the honest answer lists the thirteen Parquet rows — and this
    // suite asserts acceptance, never refusal. It is pinned in floor-finish.test.ts
    // where the refusal's CONTENT can be asserted rather than merely its absence.
    id: 'set-floor-finish',
    ctx: scopedSel('floor'),
    scoped: true,
    phrasings: [
      'make all floors oak chevron',
      'change all floors to oak chevron',
      'set all floors on level 2 to walnut herringbone',
      'make the living room floor oak chevron',
      'lay oak chevron on all floors',
      'Could you make all floors oak chevron, please?',
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
    // §L-1032 — the founder's phrasings, with a SLAB selected because "move the
    // slab to level 2" is the sentence he wrote. The refused families (door,
    // window, room, stair, …) are pinned separately in moveToLevel.test.ts:
    // this family exists to prove the phrasings LAND, and that suite exists to
    // prove the refusals SPEAK.
    id: 'move-to-level',
    ctx: sel('slab'),
    phrasings: [
      'move the slab to level 2',
      'move slab from level 0 to level 2',
      'move this to level 2',
      "change this slab's level to level 1",
      'change the level of this slab to level 2',
      'put the slab on level 1',
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
    // §RAC-APARTMENT-IN-ROOM (L-1640..L-1644) — the ctx now carries the rooms
    // snapshot the bridge injects in production, so the per-room phrasings
    // resolve here the way they resolve live. The gate's family parser reads
    // only selectionKind/scoped from this object, so the richer ctx is
    // invisible to it (it has its own rooms fixture in gateCtx).
    id: 'generate-apartment-layout',
    ctx: {
      rooms: [
        { id: 'acc-room-1', name: 'Room 00-001', roomNumber: '00-001', levelId: 'L0', areaM2: 24 },
        { id: 'acc-room-2', name: 'Room 00-002', roomNumber: '00-002', levelId: 'L0', areaM2: 18 },
      ],
    },
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
      // §RAC-APARTMENT-IN-ROOM (rule 19.b) — the founder's SECOND literal,
      // word order, "+", "opened kitchen" and both place phrases included.
      'Create an apartment of 3 bedrooms with opened kitchen + living room and 2 en-suite bathrooms on room 00-001 in ground level',
      'create a 2 bedroom apartment in ground level',
      'create an apartment in room 001',
      'create a 3 bedroom apartment with an en-suite in every bedroom',
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

// §RAC-BUILD-FROM-ENVELOPE (L-13176) — the founder's "From Envelopes create
// walls, slabs, floors, ceilings, and roofs". Appended rather than inlined for
// the same reason U5C is: the family sits next to the block that pins its
// refusals and its three disambiguations.
const BUILD_FROM_ENVELOPE_ACCEPTANCE: readonly AcceptanceCase[] = [
  {
    id: 'build-from-envelope',
    ctx: {},
    phrasings: [
      // THE FOUNDER'S OWN TITLE FIRST, in his capitalisation. A paraphrase that
      // happens to work is not acceptance evidence (§RAC-APARTMENT-IN-ROOM
      // rule 19.b, applied here).
      'Create Walls and Slabs from Envelope',
      'create walls and slabs from my envelope',
      'create walls and slabs from envelope',
      // FOUNDER DOCTRINE — open language in. Several different phrasings must
      // reach the SAME capability; a magic phrase is the failure mode.
      'build the walls from my envelopes',
      'build my design',
      'build what i drew',
      'turn my envelopes into bim',
      'create bim from this design',
      'make it real',
      'make this real',
      // His full five-noun sentence. It RESOLVES (it is not refused): walls and
      // the floor plate are built, and floor finishes, ceilings and the roof are
      // named back in the summary rather than silently dropped.
      'create walls slabs floors ceilings and roofs from envelopes',
      // A place phrase naming the level being viewed — read through the ONE
      // shared SpatialScopeTail parser (C67 §4 rule 16), not a regex of its own.
      'build the walls from my envelope on level 0',
    ],
  },
];

const ACCEPTANCE: readonly AcceptanceCase[] = [
  ...BASE_ACCEPTANCE, ...U5C_ACCEPTANCE, ...U6_ACCEPTANCE, ...BUILD_FROM_ENVELOPE_ACCEPTANCE,
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
  /**
   * ⭐ §FEAT-RAC-PROPERTY-QUERY (L-2210) — `'answer'` IS EXCLUDED, AND THE
   * NARROWING IS THE POINT OF THE PREDICATE, NOT A HOLE IN IT.
   *
   * This block exists to prove that a sentence which is command-SHAPED never
   * MUTATES. `kind: 'local'` was a sound proxy for "mutates" while every local
   * action changed something — undo, redo, setActiveLevel, applyVisibilityIntent,
   * activateTool all do. `'answer'` does not: `ZeroTokenResolver.ts` declares it
   * as the READ-ONLY class (§GATE-QUERYENGINE-READ-ONLY) and the bridge's whole
   * handling of it is `case 'answer': break;`
   * (`apps/editor/src/ui/ai/ZeroTokenChatBridge.ts:1651`) — no dispatch, no store
   * write, no view change.
   *
   * So the predicate is narrowed to what it always meant. A question that
   * ANSWERS passes; a question that dispatches ANYTHING still fails, which is
   * the property every row below was written to defend. Note that the negation
   * and hypothetical rows are unaffected either way: they are stopped one rung
   * earlier by `nonImperativeReason`, before any grammar sees them.
   */
  const mutating = (r: ZeroTokenResolution): boolean =>
    r.kind === 'commands' || (r.kind === 'local' && r.action !== 'answer');

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
    // ⭐ §FEAT-RAC-PROPERTY-QUERY (L-2210) — KEPT HERE ON PURPOSE even though the
    // first two now ALSO appear in the `property-query` acceptance family above.
    // The two facts are different and both matter: the family proves the
    // question is ANSWERED, and these rows prove that answering it still
    // dispatches nothing. A capability that answers by resizing would pass the
    // family and fail here, which is exactly the separation this block is for.
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
    // §GATE-VIS-INTENT (VIS-CLASS) — the visibility capabilities' own pins:
    // command-shaped sentences aimed at hide / isolate / reveal-all /
    // visibility-query vocabulary that must never mutate (negations and
    // hypotheticals around the exact verbs the new grammars claim).
    "don't hide this wall",
    'never isolate the selection',
    'what would happen if I hide all the walls?',
    "don't reveal the hidden walls",
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
    // §RAC-BUILD-FROM-ENVELOPE (L-13176) — the SAME paste-back shape aimed at
    // the new capability, in the words its OWN report prints. A user who copies
    // the reply back into the chat must not build a second storey of walls on
    // top of the first.
    'Built 24 walls (18 shell + 6 partitions) and the floor plate from Level envelope',
    'Created 24 walls and 1 slab from your design',
    // Its negation and hypothetical: the verbs and the anchor are exactly the
    // ones the grammar claims, so these are the rows that would catch an opener
    // regex that forgot to anchor.
    "don't build walls from my envelope",
    'never build the walls from my design',
    'what would happen if I built walls from my envelope?',
    // §GATE-VIS-INTENT / C68 §5.j.1 — A VISIBILITY OPENER MAY NEVER REACH A
    // MUTATION, and this is the shape that would have: the sentence carries the
    // envelope anchor and a wall noun, which is everything the new grammar looks
    // for, and only the verb says it is about SEEING rather than BUILDING.
    'highlight the walls from my envelope',
    'show the walls from my design',
    'isolate everything I drew',
    // §FIX-CHAT-STOPWORD-CORRECTION — the SECOND founder repro. This was
    // answered with "Nothing is selected — select an element first, then set
    // its width": tier-1 rewrote the function word "with" into "width".
    'Created Aparment with 2 bedrooms and 1 bathroom',
    // §FIX-CHAT-PROPERTY-REMOVAL-IS-NOT-DELETE (RAC-FIX-1, scorecard §1.4).
    // MEASURED on main 2026-08-11:
    //   "remove the material from this wall"
    //     → commands[element.delete] intent=delete-selected
    // A question about a wall's MATERIAL routed to a DESTRUCTIVE DELETE of the
    // wall. The only thing in the way was the destructive Confirm card, which
    // is a mitigation, not a resolver guard. The object of "remove" is the
    // PROPERTY; "this wall" is what it is being removed FROM.
    'remove the material from this wall',
    'remove the colour from this wall',
    'clear the finish from this wall',
    'strip the texture from this wall',
    'get rid of the classification on this wall',
    // §PROP-OVERHANG (RAC VERBS-CAP) — the adversarial PIN for the new roof
    // capability. `set-overhang` is a measurement-carrying property, which is
    // the exact shape that misread "highlight walls taller than 3m" into a
    // resize: a READ verb plus a number. These three carry the capability's own
    // noun and must stay non-mutating.
    'what is the roof overhang?',
    'how big is the eaves overhang?',
    "don't change the roof overhang to 300mm",
    // The founder's own class: a REPORT paste-back quoting the number back.
    'Roof overhang: 300 mm',
    // §FEAT-CHAT-TOOL-ACTIVATION (L-906) — the placement grammar's own pins.
    // Tool ACTIVATION is a local action, so a misread here would arm a
    // placement tool off a report or a musing. The verb must be uncorrected,
    // imperative and OPENING: a past-tense paste-back ("created"), a
    // hypothetical and a mid-sentence verb must all stay misses.
    'I created a bed yesterday',
    'Created a bed and a sofa',
    'what if I place a sofa here?',
    'maybe we should add a wardrobe',
    // §L-1032 — the level-change grammar's own pins. `move-to-level` claims a
    // very common verb ("move"), so the negation / hypothetical / question /
    // paste-back shapes around it are the ones that would silently re-storey a
    // wall. The last two are the paste-back class: a report of a move already
    // made is not an instruction to make it again.
    "don't move the slab to level 2",
    'what would happen if I moved this wall to level 2?',
    'which level is this slab on?',
    'Moved the slab to Level 2',
    'maybe I should move this to level 2',
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

  // ─── §FIX-CHAT-HIDE-IS-NOT-NAVIGATE (RAC-FIX-1, scorecard §1.2) ───────────
  //
  // The founder's own MUTATE example. MEASURED on main 2026-08-11 by
  // `tools/rac-conformance/probe-categories-6-10.ts`:
  //
  //   LOCAL  7.5 hide level  "hide level 2"  → local intent=go-to-level action=setActiveLevel
  //   LOCAL  7.6 show level  "show level 2"  → local intent=go-to-level action=setActiveLevel
  //
  // Two OPPOSITE asks, one outcome, and it was neither of them: asking to hide
  // a level switched the camera to it and hid nothing, with no refusal.
  //
  // Both halves are pinned, and the SECOND half is why this is a describe block
  // rather than three more rows in the list above. A guard that made BOTH
  // sentences a miss would have "passed" the no-mutation test while destroying
  // `show level 2`, which is a real shipped capability. The control is the test.

  it('a HIDE ask never becomes a level switch', () => {
    for (const u of [
      'hide level 2',
      'hide all elements on level 2',
      'isolate level 2',
      'turn off level 2',
      'highlight level 2',
    ]) {
      const r = resolveFull(u, ctxOf());
      expect(intentOf(r), `"${u}" still resolves to a navigation`).not.toBe('go-to-level');
      expect(mutating(r), `"${u}" produced an action the user did not ask for`).toBe(false);
    }
  });

  it('CONTROL — "show level 2" still navigates, and the fix did not narrow it', () => {
    // The vocabulary must not shrink to make the test above pass (C67/C68:
    // open language, safety from rule gates — never from a smaller dictionary).
    for (const u of ['show level 2', 'go to level 2', 'open level 2', 'show me level 1']) {
      expect(intentOf(resolveFull(u, ctxOf())), `"${u}" stopped resolving`).toBe('go-to-level');
    }
  });

  it('CONTROL — real deletions still resolve after the property-removal guard', () => {
    for (const u of ['delete the selected wall', 'delete this wall', 'remove this wall']) {
      expect(intentOf(resolveFull(u, ctxOf(sel('wall')))), `"${u}" stopped resolving`)
        .toBe('delete-selected');
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
    // §FIX-RAKE-90-IS-VERTICAL (L-1373) — the card used to say "Lean … to 90°
    // (vertical)", whose verb contradicts its parenthesis. 90° IS VERTICAL in
    // this codebase, so the founder's "raked 90 degrees" STRAIGHTENS his walls;
    // the Confirm card now states the resulting orientation in words.
    expect(r.summary).toMatch(/VERTICAL/);
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
    // Asserts the INTENT — "it asks concretely for a thickness" — not one phrasing.
    // The copy was rewritten (L-1260..L-1263) to explain WHY a layer needs one
    // ("adding one makes the wall thicker"), which is strictly better and which the
    // literal 'how thick' could not survive. A test that pins prose blocks an
    // improvement to prose; this one pins the thing the test's own name claims.
    expect(r.reason).toMatch(/thick/i);
  });

  it('an unknown finish refuses by LISTING the real vocabulary', () => {
    const r = resolveUtterance('add a 10mm unobtainium layer to all walls', ctxOf());
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.intent).toBe('add-wall-layer');
    // The invariant is "it LISTS the real vocabulary and states its true size" —
    // which is what this test's own name claims. It must NOT pin a particular
    // member: `finishRefusalCopy` deliberately stopped reciting 39 nicknames
    // because, in its own words, "that list was the measurable lie: it read as an
    // inventory while 205 materials existed", so a founder who typed a name he was
    // LOOKING AT in the picker was told the product did not know it. It now names
    // the real total and eight live examples. Pinning 'limewash' asserted that one
    // arbitrary row stayed inside a sample of eight drawn from 205 — a fact about
    // the sample, not about the refusal.
    expect(r.reason).toMatch(/\b\d{2,}\s+materials\b/);   // states the REAL size
    expect(r.reason).toContain('including');              // and LISTS examples
    expect(r.reason).toContain('plaster');                // at least one real one
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

  // ─── §GEN-ON-BOUNDARY-LINE (L-7961 · C106 §7.2) ──────────────────────────
  //
  // ⭐ REACHABILITY, NOT EXISTENCE. These start from a SENTENCE and assert what
  // lands on the BUS. A test that called `resolveBoundaryLineFootprint` directly
  // would prove the resolver works and nothing about whether the founder can get
  // to it — which is the exact failure mode this whole lane was opened to fix
  // (C106 §7.2 had a working generator and no way to reach it from a boundary line).

  it('"on this boundary line" reaches the bus as a boundary-line footprint source', () => {
    const r = resolveUtterance(
      'create a 5-storey residential building on this boundary line',
      ctxOf(),
    );
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    // ONE command — still `generation.building`, still the single pipeline.
    expect(r.commands).toHaveLength(1);
    expect(r.commands[0]!.type).toBe('generation.building');
    expect(r.commands[0]!.payload).toEqual({
      typology: 'residential-building',
      floors: 5,
      footprintSource: 'boundary-line',
    });
  });

  it('a SELECTED boundary line rides the payload by id — the explicit pick wins', () => {
    const r = resolveUtterance(
      'generate a 5-storey residential building on the boundary line',
      ctxOf(sel('boundaryline', 'boundaryLine_01J9ABCDEF')),
    );
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.payload).toMatchObject({
      footprintSource: 'boundary-line',
      boundaryLineId: 'boundaryLine_01J9ABCDEF',
    });
  });

  it('⭐ a SELECTED line does NOT hijack a sentence that never mentioned one', () => {
    // THE SCOPE-DRIFT GUARD, and it is the assertion this feature most needed.
    //
    // A user who has just drawn a boundary line still HAS it selected. If selection
    // alone switched the footprint source, their next ordinary sentence would build
    // a different building from the one they asked for and say nothing about it.
    //
    // The rule this locks: THE SENTENCE decides the source; the SELECTION only
    // decides WHICH line, and only once the sentence has asked for one. Selection is
    // a side effect of having just drawn something — a weaker signal than words.
    const r = resolveUtterance(
      'generate a 3-storey residential building',
      ctxOf(sel('boundaryline', 'boundaryLine_UNMENTIONED')),
    );
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    // Byte-for-byte the pre-feature payload: neither new key may leak in.
    expect(r.commands[0]!.payload).toEqual({ typology: 'residential-building', floors: 3 });
  });

  it('the Confirm summary NAMES the boundary line, so the footprint is visible before building', () => {
    const r = resolveUtterance(
      'create a 5-storey residential building on this boundary line',
      ctxOf(),
    );
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.summary).toContain('boundary line');
    expect(r.summary).not.toContain('from the site boundary');
  });

  // ─── §ASK-FOOTPRINT (L-11066 / L-11200) — the parcel named OUT LOUD ──────
  //
  // The execution layer now ASKS "which footprint?" when the sentence is silent
  // and a usable boundary line exists on the active level. A user who said "on
  // the parcel" has already answered, so the sentence must reach the bus as an
  // EXPLICIT source — before this, "on the parcel" and saying nothing produced
  // byte-for-byte the same payload and the seam could not tell them apart.

  it('"on the site" / "on the parcel" / "across the whole plot" reach the bus as footprintSource:parcel', () => {
    const sentences = [
      'generate a 5-storey residential building on the site',
      'generate a 5-storey residential building on the parcel',
      'build a 4-storey residential building across the whole plot',
      'generate a 2-storey house on the site',
      'generate an office building with 5 floors on the plot',
    ];
    for (const s of sentences) {
      const r = resolveUtterance(s, ctxOf());
      expect(r.kind, s).toBe('commands');
      if (r.kind !== 'commands') continue;
      expect(r.commands[0]!.type, s).toBe('generation.building');
      expect(r.commands[0]!.payload, s).toMatchObject({ footprintSource: 'parcel' });
      expect(r.commands[0]!.payload, s).not.toHaveProperty('boundaryLineId');
      // The Confirm card says the sentence was heard, so no "which footprint?"
      // question is expected to follow it.
      expect(r.summary, s).toContain('as you asked');
    }
  });

  it('SILENCE stays silent — the plain sentence still carries NO footprintSource at all', () => {
    // The seam asks ONLY about silence, so silence must remain distinguishable.
    const r = resolveUtterance('generate a 5-storey residential building', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.payload).toEqual({ typology: 'residential-building', floors: 5 });
  });

  it('"on the site boundary" is still the BOUNDARY-LINE sentence — the two flags never both fire', () => {
    const r = resolveUtterance('create a 5-storey residential building on the site boundary', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.payload).toMatchObject({ footprintSource: 'boundary-line' });
  });

  it('"in a lot of …" does not fire the parcel signal — `lot` is deliberately not in the noun list', () => {
    const r = resolveUtterance('generate a 5-storey residential building in a lot of glass', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.payload).not.toHaveProperty('footprintSource');
  });

  // ─── §GEN-UNDO-IS-STAGED (L-10822) ───────────────────────────────────────
  it('the Confirm summary tells the truth about undo — staged, not one entry', () => {
    const r = resolveUtterance('generate a 5-storey residential building', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    // MEASURED: `beginBuildingGeneration` is an overlay/WebGL lease, not an undo
    // lease. Each finish stage dispatches its own runBatch → its own undo entry.
    // The old copy promised "as one coherent undo", which was false.
    expect(r.summary).not.toContain('one coherent undo');
    expect(r.summary).toContain('lighting');
    expect(r.summary).toContain('furniture');
  });

  // ─── §GEN-TYPOLOGY-NAMED (L-10821) — the founder's own sentence ───────────
  it('a building noun with NO typology REFUSES BY NAMING the missing word (was: silent miss)', () => {
    // The founder typed this. On HEAD it matched no typology, returned null from
    // every matcher, and the chat said "I'm not sure how to help with that yet"
    // while the parser knew exactly which token was absent.
    const r = resolveUtterance(
      'create the building from the photo suited to the given space: 5 story buildings',
      ctxOf(),
    );
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    // It names WHICH word is missing and lists the real options…
    expect(r.reason).toContain('WHICH KIND');
    expect(r.reason).toContain('residential building');
    expect(r.reason).toContain('house');
    expect(r.reason).toContain('office building');
    // …and it does NOT throw away the storey count he already gave.
    expect(r.reason).toContain('5');
    expect(r.suggestions).toContain('generate a 5-storey residential building');
  });

  it('the typology refusal never GUESSES — no generation.building command is emitted', () => {
    const r = resolveUtterance('create a 5 storey building', ctxOf());
    expect(r.kind).toBe('refusal');
    // A wrong building is worse than a question: nothing may be dispatched here.
    if (r.kind === 'commands') expect(r.commands).toHaveLength(0);
  });

  it('bare "create a 3 bedroom apartment" is NOT stolen by the generic building noun', () => {
    // `apartment` is deliberately excluded from the generic set: this sentence
    // belongs to generate-apartment-layout (fill the walls already drawn).
    const r = resolveUtterance('create a 3 bedroom apartment', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.type).toBe('generation.apartment');
  });

  // ─── §GEN-FACADE-INTENT (L-10823) — the founder's PHOTOGRAPH, in words ────
  //
  // He showed a 5-storey urban apartment block: arcaded ground floor with
  // shopfronts, rounded corners, deep continuous balconies, green glazed tile,
  // oxblood timber shutters, a glass-block stair core. Photo→façade extraction is
  // OUT OF SCOPE (that is GenRecon, not V1); these prove the DESCRIPTION works.

  it('an arcaded ground floor + balconies + a colour reach the payload as real fields', () => {
    const r = resolveUtterance(
      'create a 5-storey residential building with an arcaded ground floor, deep balconies and a green façade',
      ctxOf(),
    );
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    const payload = r.commands[0]!.payload as { facade?: Record<string, unknown> };
    // These four fields have existed on ResidentialBuildingRequest since
    // §RESI-PREVIEW-OPTIONS; the chat used to drop every one of them.
    expect(payload.facade).toMatchObject({ groundCommercialCurtain: true, balconies: true });
    expect(typeof payload.facade?.['facadeColor']).toBe('string');
  });

  it('⭐ what it CANNOT map is named BEFORE Confirm — and it still builds the rest', () => {
    // THE ASSERTION THIS WHOLE STAGE EXISTS FOR. Without it the generator would
    // build a plain block with an arcade and balconies, say "Built the residential
    // building", and never mention that rounded corners, glazed tile and shutters
    // were discarded — so the user would conclude it had tried and failed.
    const r = resolveUtterance(
      'create a 5-storey residential building with an arcaded ground floor, rounded corners, ' +
        'deep balconies, green glazed tile and timber shutters',
      ctxOf(),
    );
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;

    // It STILL BUILDS — a partial map is not a refusal.
    expect(r.commands[0]!.type).toBe('generation.building');
    const payload = r.commands[0]!.payload as { facadeUnavailable?: string[] };

    // …and it names each thing it cannot do, with the reason attached.
    expect(payload.facadeUnavailable).toEqual(
      expect.arrayContaining([
        expect.stringContaining('rounded corners'),
        expect.stringContaining('glazed-tile'),
        expect.stringContaining('shutters'),
      ]),
    );
    // Named on the CONFIRM CARD, not only afterwards: before is a choice, after is
    // an apology.
    expect(r.summary).toContain('rounded corners');
    expect(r.summary).toContain("I can't do 3 parts of that and I'll build the rest");
  });

  it('"without balconies" REMOVES them — negation is not swallowed by the noun', () => {
    const r = resolveUtterance('generate a 5-storey residential building without balconies', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    const payload = r.commands[0]!.payload as { facade?: Record<string, unknown> };
    expect(payload.facade).toMatchObject({ balconies: false });
  });

  it('a plain sentence carries NO facade keys at all (open language costs nothing)', () => {
    const r = resolveUtterance('generate a 4-storey residential building', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.payload).toEqual({ typology: 'residential-building', floors: 4 });
  });

  it('façade language is NOT claimed for a house or an office (no overclaimed fields)', () => {
    // The four fields are ResidentialBuildingRequest fields. Claiming them for
    // another typology would be the overclaimed-capability defect in miniature.
    const h = resolveUtterance('generate a 2-storey house with balconies', ctxOf());
    expect(h.kind).toBe('commands');
    if (h.kind !== 'commands') return;
    expect(h.commands[0]!.payload).not.toHaveProperty('facade');
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
    // §RAC-APARTMENT-IN-ROOM / L-911 (2026-08-21) — a STATED bedroom count now
    // rides with lockBedroomCount: the engine may not auto-grow a count the
    // user spoke (the plate-density round-up and §ENVELOPE-FIT-GROWTH stay on
    // only for UNSTATED programmes). These pins moved deliberately.
    expect(r.commands[0]!.payload).toEqual({ bedrooms: 3, lockBedroomCount: true });
  });

  it('bedrooms, bathrooms and the programme flags all reach the payload', () => {
    const r = resolveUtterance('make a 3-bedroom apartment with 2 bathrooms', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.payload).toEqual({ bedrooms: 3, bathrooms: 2, lockBedroomCount: true });

    const e = resolveUtterance('create a 4 bedroom apartment with an en-suite', ctxOf());
    expect(e.kind).toBe('commands');
    if (e.kind !== 'commands') return;
    expect(e.commands[0]!.payload).toEqual({ bedrooms: 4, masterEnSuite: true, lockBedroomCount: true });

    const o = resolveUtterance('generate a 2 bedroom flat with an open-plan kitchen', ctxOf());
    expect(o.kind).toBe('commands');
    if (o.kind !== 'commands') return;
    expect(o.commands[0]!.payload).toEqual({ bedrooms: 2, openPlanKitchenDining: true, lockBedroomCount: true });
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

// ─── §RAC-BUILD-FROM-ENVELOPE (L-13176) ──────────────────────────────────────
//
// The founder: "From Envelopes create walls, slabs, floors, ceilings, and
// roofs: 'Create Walls and Slabs from Envelope'".
//
// ⭐ WHAT THESE PINS ARE FOR. The capability sits between three LIVE
// neighbours that share its verbs — `generate-building` (create/build/make +
// house/office/building), `generate-apartment-layout` and
// `generate-room-finishes` — and C68 §5.j names the failure exactly: "a
// capability that claims a sentence it had no right to claim, and then
// confidently does the wrong thing", with 29 measured live instances. BOTH
// directions are asserted for each neighbour, because a one-way pin catches
// only half of a collision.
describe('RAC-BUILD-FROM-ENVELOPE — the founder "create walls and slabs from envelope"', () => {
  it('his own title dispatches ONE bus command, and it is the seam verb', () => {
    const r = resolveFull('Create Walls and Slabs from Envelope', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.intent).toBe('build-from-envelope');
    // ⛔ ONE command, and NOT a raw batch verb. `wall.batch.create` and
    // `slab.batch.create` are classified C — internal machinery, and C68 §5.b
    // makes the three declaration surfaces disjoint: naming either here would
    // put one verb on two of them and fail the coverage gate.
    expect(r.commands.map((c) => c.type)).toEqual(['generation.from-envelope']);
    // ⭐ §WHOSE-FOOTPRINT-IS-THE-SLAB (founder 2026-09-09 · L-13296) — `plateSource` is NEW here,
    // and these arms are AMENDED, not weakened. A slab between two storeys is either that storey's
    // FLOOR (cut from its own plate) or the lower storey's CEILING (cut from the plate below);
    // while the plates match they are the same slab, and the moment one steps back they are not.
    // The executor must be TOLD which ring to cut, or it holds a second default and PRYZM has two.
    // `this-level` is the behaviour every existing project was built with, which is exactly why it
    // is the back-compatible resolution of an ask that did not say.
    expect(r.commands[0]!.payload).toEqual({ parts: ['walls', 'floor-plate'], deferred: [], plateSource: 'this-level' });
    // C67 §4 rule 8 — the truthful undo cost is stated BEFORE consent.
    expect(r.destructive).toBe(true);
    // ⭐ THE COST IS COMPUTED FROM THE PARTS, AND THE PARTS ARE NAMED BESIDE IT.
    // This read the literal 'TWO undo steps, not one' while a parallel lane was
    // adding a third batch verb — a Confirm card understating undo depth is the
    // one place the understatement is acted on. Asserting the LIST as well as the
    // number is what stops the two drifting apart again.
    expect(r.summary).toContain('2 batch commands — walls and the floor plate — so 2 undo steps, not one');
  });

  it('OPEN LANGUAGE IN — several unrelated phrasings reach the same capability', () => {
    // Founder doctrine, recorded: RAC accepts open language; safety comes from
    // rule gates that refuse with both numbers, never from a magic phrase.
    for (const u of [
      'create walls and slabs from my envelope',
      'build the walls from my envelopes',
      'build what i drew',
      'turn my envelopes into bim',
      'create bim from this design',
      'make it real',
      'build my design',
    ]) {
      expect(intentOf(resolveFull(u, ctxOf())), u).toBe('build-from-envelope');
    }
  });

  it('his FIVE nouns are all answered — THREE built, two named as not built', () => {
    const r = resolveFull('create walls slabs floors ceilings and roofs from envelopes', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands[0]!.payload).toEqual({
      // ⭐ `ceilings` MOVED FROM `deferred` TO `parts` when §BIM-FROM-THE-DESIGN
      // taught the executor `ceiling.batch.create`. His sentence did not change;
      // what PRYZM can do about it did.
      parts: ['walls', 'floor-plate', 'ceilings'],
      // ⛔ "floors" beside "slabs" is the FINISH layer — his own list separates
      // them — so it is carried as deferred rather than silently absorbed into
      // the plate he already named. C84 EI-2: telling a user about one of the
      // two things he asked for is narrowing.
      deferred: ['floor-finishes', 'roof'],
      // §WHOSE-FOOTPRINT-IS-THE-SLAB (L-13296) — see the note on the first payload arm above.
      plateSource: 'this-level',
    });
    // Named BY NAME, with the reason and the LIVE route (C16 CA-18).
    expect(r.summary).toContain('does NOT build floor finishes and a roof');
    expect(r.summary).toContain('add floor finishes to all rooms');
    expect(r.summary).toContain('No space envelope carries a roof form');
  });

  it('⭐ an ask that names no WALLS builds those parts alone (§PART-ONLY-BUILDS L-13256)', () => {
    // ⛔ THIS ARM HAS NOW BEEN REVERSED TWICE, AND BOTH REVERSALS ARE THE SAME LESSON.
    // It first read "an ask for ONLY the things it cannot build" and asserted a REFUSAL —
    // correct while ceilings were unbuildable. When the executor learned
    // `ceiling.batch.create` it became "an ask that names no WALLS refuses", still a refusal,
    // on the then-true measurement that the executor rejected a walls-free plan. Both refusals
    // were derived from a CAPABILITY LIMIT, and each survived past the limit it described.
    // ⭐ The capability is now real, so the assertion follows it: ceilings build, the roof is
    // still named as not built, and NO walls are added to a sentence that did not ask for them.
    const r = resolveFull('create ceilings and a roof from my envelope', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.intent).toBe('build-from-envelope');
    expect(r.commands[0]!.payload).toEqual({ parts: ['ceilings'], deferred: ['roof'] });
    // The roof is STILL refused BY NAME with its live route — C16 CA-18.
    expect(r.summary).toContain('does NOT build a roof');
    expect(r.summary).toContain('No space envelope carries a roof form');
  });

  // ⭐⭐ §PART-ONLY-BUILDS (L-13256) — REVERSED ON THE FOUNDER'S REPORT.
  // This asserted a plate-only ask REFUSES, on the then-true measurement that the executor
  // refused a plan with no walls. He built 70 shell walls, asked *"Create slabs on envelope"*,
  // and was told to "ask for the walls too" — which would have re-dispatched a whole storey of
  // walls onto a level that already had his. The executor now builds a walls-free plan that
  // carries a plate, so the honest answer is a BUILD.
  it('⭐ a plate-only ask BUILDS the plate alone — walls are projected off, not silently added', () => {
    const r = resolveFull('create the slabs from my envelope', ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.commands.map((c) => c.type)).toEqual(['generation.from-envelope']);
    // ⛔ THE PART LIST IS THE SAFETY. `applyPartSelection` projects the walls off the plan for
    // this ask; without that, retiring the refusal would have built walls he did not name.
    expect(r.commands[0]!.payload).toEqual({ parts: ['floor-plate'], deferred: [], plateSource: 'this-level' });
  });

  it('a level other than the one being viewed refuses BY NAME, naming the switch', () => {
    // The builder lands on the ACTIVE level and creates no level. Building on a
    // different storey than the one named is the widening C68 §7.d forbids.
    const r = resolveFull('build the walls from my envelope on level 2', ctxOf());
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('Level 0');
    expect(r.reason).toContain('Level 2');
    expect(r.reason).toContain('this pass creates');
    // The level being VIEWED is honoured rather than refused.
    expect(intentOf(resolveFull('build the walls from my envelope on level 0', ctxOf())))
      .toBe('build-from-envelope');
  });

  it('an unknown level names the real ones instead of guessing', () => {
    const r = resolveFull('build the walls from my envelope on level 9', ctxOf());
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('Level 0, Level 1 and Level 2');
  });

  // ── The three neighbours, BOTH directions ──────────────────────────────────

  it('does not steal generate-building, and is not stolen by it', () => {
    // A building TYPOLOGY noun stands this grammar down, even with the anchor
    // present: `generate-building` BUILDS for that sentence today, and standing
    // in front of a path that works is the FIX-CHAT-HIDE-IS-NOT-NAVIGATE error.
    expect(intentOf(resolveFull('build a house from the envelope', ctxOf())))
      .toBe('generate-building');
    expect(intentOf(resolveFull('generate a 3-storey residential building', ctxOf())))
      .toBe('generate-building');
    // And the reverse: no envelope anchor ⇒ never ours; anchor ⇒ never theirs.
    expect(intentOf(resolveFull('create walls and slabs from my envelope', ctxOf())))
      .not.toBe('generate-building');
  });

  it('does not steal generate-apartment-layout, and is not stolen by it', () => {
    expect(intentOf(resolveFull('create a 3 bedroom apartment', ctxOf())))
      .toBe('generate-apartment-layout');
    expect(intentOf(resolveFull('build my design', ctxOf())))
      .not.toBe('generate-apartment-layout');
  });

  it('does not steal generate-room-finishes — which is the route its own refusal offers', () => {
    // The refusal above points the user at "add ceilings to every room". If this
    // grammar claimed that sentence, the refusal would be sending him in a
    // circle — the L-942 shape, one step removed.
    expect(intentOf(resolveFull('add ceilings to every room', ctxOf())))
      .toBe('generate-room-finishes');
    expect(intentOf(resolveFull('add ceilings to every room in my design', ctxOf())))
      .not.toBe('build-from-envelope');
  });

  it('does not steal create-wall (coordinates, and the word "from")', () => {
    expect(intentOf(resolveFull('create a wall from (0,0) to (5,0)', ctxOf())))
      .toBe('create-wall');
  });

  it('a VISIBILITY opener carrying the anchor never reaches the mutation (C68 5.j.1)', () => {
    for (const u of [
      'highlight the walls from my envelope',
      'show the walls from my design',
      'isolate everything I drew',
    ]) {
      const r = resolveFull(u, ctxOf());
      expect(r.kind === 'commands', u).toBe(false);
      expect(intentOf(r), u).not.toBe('build-from-envelope');
    }
  });

  it('the report paste-back MISSES rather than re-running the build (L-996 shape)', () => {
    for (const u of [
      'Built 24 walls (18 shell + 6 partitions) and the floor plate from Level envelope',
      'Created 24 walls and 1 slab from your design',
    ]) {
      expect(resolveFull(u, ctxOf()).kind, u).toBe('miss');
    }
  });

  it('the registry row and the resolver arm agree by construction — THE JOIN', () => {
    // C68 §5.f: the id the registry exposes must be the id an arm exists for. A
    // row whose intent nothing resolves is a pill that does nothing; an intent
    // no row declares is invisible to the "Chat can…" list, the refusal copy and
    // the LLM prompt vocabulary alike. Asserting the JOIN — not each half — is
    // what stops the two drifting apart.
    const cap = allChatCapabilities().find((c) => c.id === 'build-from-envelope');
    expect(cap, 'build-from-envelope is not in the capability registry').toBeDefined();
    if (cap === undefined) return;
    expect(cap.busCommand).toBe('generation.from-envelope');
    expect(cap.examples.length).toBeGreaterThan(0);
    const r = resolveFull(cap.examples[0]!, ctxOf());
    expect(r.kind).toBe('commands');
    if (r.kind !== 'commands') return;
    expect(r.intent).toBe(cap.id);
    expect(r.commands.map((c) => c.type)).toEqual([cap.busCommand]);
  });
});
