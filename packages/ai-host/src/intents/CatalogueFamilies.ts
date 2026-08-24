// @pryzm/ai-host — CatalogueFamilies (RAC Phase U7.2)
// =============================================================================
//
// WHY THIS EXISTS. `set-window-type` and `set-door-type` are the SAME
// capability with a different noun: parse "change all <noun>s to <ref>",
// resolve <ref> through the ONE `resolveCatalogueRef` ladder, refuse by LISTING
// the real catalogue names, dispatch ONE batch verb. U4.3 already shared the
// GRAMMAR half (`makeHostedTypeParser`) and U4 already shared the EXECUTION half
// (`CapabilityExecutionSpec`), but the two halves were still stitched together
// by hand per family: an intent id in the union, a spec literal, a parse
// function, a matcher const, a matcher-list entry.
//
// This table is that stitching, done once. A catalogue family is now ONE entry:
// the element kind, its noun, the batch verb, the payload's id field, where its
// catalogue comes from, and the refusal copy. The spec and the grammar are
// GENERATED from it.
//
// ── WHAT A FAMILY MUST PROVE BEFORE IT IS LISTED (L-620) ────────────────────
//
// The plugin `*.setType` handlers are the anti-pattern: they `produceCommand`
// against DETACHED plugin DTO stores nothing renders, exports or persists — the
// slab one says so in its own header, and initBusHandlers records the
// founder-visible symptom of routing there ("slab not found: <id>"). A family
// belongs here only when its batch verb reaches the GEOMETRY store the builders
// read, through a command in `packages/command-registry`. Today:
//
//   window   → window.updateSystemTypeBatch  → UpdateWindowSystemTypeCommand
//   door     → door.updateSystemTypeBatch    → UpdateDoorSystemTypeCommand
//   slab     → slab.updateSystemTypeBatch    → UpdateSlabLayersCommand      (U7.2)
//   ceiling  → ceiling.updateSystemTypeBatch → UpdateCeilingLayersCommand   (U7.2)
//   stair    → stair.updateParameters        → UpdateStairParametersCommand (L-1441)
//   stair-railing → element.changeType       → UpdateStairRailingCommand    (L-1441)
//   lighting → element.changeType            → UpdateLightingParametersCommand
//                                                                          (L-10220)
//
// ⚠ THIS LIST IS HAND-MAINTAINED AND IT ROTTED ONCE ALREADY: the two stair rows
// shipped 2026-08-20 and were never added here, so a reader of this block on
// 2026-08-24 counted FOUR families against a table holding SIX. The table below
// is the authority; when they disagree, `CATALOGUE_FAMILIES.length` wins. The
// list survives because it names the ROUTE, which the table does not.
//
// WALL is deliberately NOT in this table. Its grammar is entangled with the
// colour and rake grammars that share the "make all walls …" opening and must
// be tried in a specific order, and its refusal copy is the founding incident's
// verbatim wording. Generalising it would be a rewrite of pinned copy for no
// new capability — it stays a hand-written spec entry, and this comment is the
// reason rather than an oversight.
//
// ── DELIBERATELY ABSENT — ⚠ RE-MEASURED 2026-08-19 (lane RAC1, C84 §4F.10) ──
//
// ⛔ FOUR OF THE FIVE REASONS BELOW HAD EXPIRED. They are corrected IN PLACE,
// each with its measurement date, because a comment block that justifies a
// refusal with facts that have since become false is the defect class this
// repository keeps re-producing — and this block was being read as current.
//
// ⭐ AND THE FRAMING WAS WRONG AT THE TOP. This list reads as "these families
// have no machinery". They do — and LIGHTING is the first one moved out of this
// block on the strength of that sentence alone (§FEAT-CHAT-LIGHTING-TYPES,
// L-10220, 2026-08-24). It cost a table row, a published-catalogue reader and a
// registry entry; no command, no store and no builder was touched. ⭐ The
// remaining bullets should be read as a QUEUE, not as a set of refusals.
// `element.changeType`
// (apps/editor/src/engine/initBusHandlers.ts:1518) routes SIXTEEN families —
// wall, furniture, floor, slab, door, window, ceiling, plumbing, stair,
// column, beam, stair-railing, HANDRAIL, roof, lighting, CURTAIN-WALL — each
// to the geometry store the builders and persistence read, each with
// ring-buffer undo parity, pinned by `elementChangeTypeCoverage.spec.ts:178`.
// What is missing is PUBLICATION to the chat, not implementation. That is a
// C84 EI-3 breach (what the UI offers, the pipeline must accept), and it is a
// much smaller and much lower-risk job than "build a capability".
//
//   • column, beam — ✅ REASON STILL HOLDS (2026-08-19). No named catalogue:
//     the "type" is a closed enum on the record (`profile` / `sectionType`),
//     so there are no catalogue NAMES for a refusal to list. Enum-driven type
//     changes are a different capability shape. **A catalogue must be MINTED
//     before either can join** — see C84 §4F.9 item 7.
//   • roof — ⚠ THE ENUM CLAIM WAS TRUE, THE "NO CATALOGUE" CLAIM WAS FALSE
//     (measured 2026-08-19). `roofType` is indeed an enum, but an 8-entry
//     `{id, name}` list ships at `ElementTypeCatalogRegistry.ts:115-124` and a
//     refusal CAN list it. Roof was grouped with column/beam in one sentence
//     covering three families whose truth values differ; the sentence is now
//     split, because a shared reason is how a false one survives.
//   • curtain-wall (the WALL type) — ⛔ THE REASON WAS FALSE, AND HAD BEEN
//     SINCE L-958 (measured 2026-08-19). It read "the only type is per-PANEL,
//     its command is marked ORPHANED, and `element.changeType` has no
//     curtain-wall branch". All three halves are wrong for the wall type:
//     `CurtainWallTypeStore` ships 20 `{id, name}` built-ins, the record
//     carries `systemTypeId`, and the branch is at `initBusHandlers.ts:2022`
//     (→ `UpdateCurtainWallCommand`, the geometry record the builders read).
//   • curtain-wall PANEL type — ✅ THIS is the genuinely orphaned one, and it
//     is A DIFFERENT SUBJECT from the row above. `PanelType` is a bare union
//     with no `{id, name}` store, and `ReplacePanelTypeCommand.ts:1` is
//     literally `TODO(E.5.x): ORPHANED`. ⛔ Do not re-conflate the two: the
//     wall type is READY and the panel type is NOT, and collapsing them is
//     exactly the error that kept the wall type dark for a release.
//   • floor — the count was stale: `floorSystemTypeStore` ships **22**
//     built-ins, not 14 (measured 2026-08-19). The live command
//     (`UpdateFloorLayersCommand`) and the `systemTypeId` field both exist, so
//     floor is READY. It stays out of THIS table only for the reason that was
//     always the real one: `floor` and `slab` are two element kinds users call
//     by the same word, and the disambiguation is a decision, not a coin-flip.
//   • furniture, plumbing — ✅ REASON STILL HOLDS (2026-08-19).
//     `ChangeFurnitureTypeCommand` / `UpdatePlumbingParametersCommand` are
//     live, but the catalogues are string UNIONS with no display names, so
//     `resolveCatalogueRef` (which needs `{id, name}`) has nothing to read and
//     a refusal could not list anything. ⛔ The answer is to MINT a catalogue,
//     never to narrow the user's vocabulary so the miss stops showing.
//   • ~~stair~~ — ⭐ **SHIPPED 2026-08-20 (L-1441, lane RAC2). It is in the
//     table now.** This bullet read *"NEARLY READY, blocked by ONE METHOD …
//     `StairTypeStore` exposes `get()` where `CatalogueReader` requires
//     `getById()`"*. The diagnosis was right and the CONCLUSION was wrong: the
//     missing adapter blocks `resolveCatalogueRef`, which blocks the EDITOR
//     bridge's catalogue channel — it never blocked the family. The published
//     `BUILT_IN_STAIR_TYPES` table is the same array that store is built from,
//     and reading it needs no adapter at all. ⛔ The `getById` adapter is still
//     worth doing (it is what lets a PROJECT-AUTHORED stair type resolve); it is
//     a follow-up, not a prerequisite. See `publishedCatalogues.ts`.
//   • ~~handrail~~ / stair-railing — ⭐ **THE STAIR-RAILING HALF SHIPPED
//     2026-08-20 (L-1441).** This bullet's reasoning was correct and has since
//     been ACTED ON: *"the chosen fix moves that projection BEHIND the bus verb
//     (mirroring `resolveStairRailingTypeFields`)"* is exactly what
//     §FEAT-HANDRAIL-TYPE-PROJECTION (L-1105) did, so BOTH branches of
//     `element.changeType` now resolve all thirteen fields from `newTypeId`
//     alone. That is what made the family a table row instead of a project.
//     ⚠ ONLY the stair-railing kind is claimed here. The STANDALONE `handrail`
//     (`handrailStore`) is a different element and is still absent — not
//     because it lacks machinery, but because "railing" names both and the
//     disambiguation is a decision, exactly as it is for floor vs slab.
//
// ⚠ PURITY, RESTATED HONESTLY (2026-08-20; re-counted 2026-08-24). This
// paragraph used to read "PURE — no DOM, no stores, no I/O", full stop. The
// stair families make that one word too strong: through `publishedCatalogues.ts`
// this module now READS three published L2 type tables (`BUILT_IN_STAIR_TYPES`,
// `handrailTypeStore`, `BUILT_IN_LIGHTING_TYPES`). Still
// no DOM, still no I/O, still no commands and still nothing written — but a
// claim of "no stores" that is not literally true is how a comment stops being
// evidence. Injected catalogues remain the PREFERRED channel and win whenever
// the bridge supplies one; the published tables are the honest floor beneath
// them, and `publishedCatalogues.ts` states the limit that creates.

import type {
  CapabilityExecutionSpec,
  SpecValueOutcome,
} from './CapabilityExecutionSpec.js';
import type { ResolverContext } from './ZeroTokenResolver.js';
// §FEAT-CHAT-STAIR-TYPES (L-1441) — the PUBLISHED L2 type tables, read (never
// transcribed) so a stair/railing type reference resolves even though the
// editor bridge's catalogue channel carries only slab + ceiling today. See
// that module's header for why forwarding a raw ref would be unsafe here.
import {
  publishedLightingTypeCatalogue,
  publishedRailingTypeCatalogue,
  publishedStairTypeCatalogue,
} from './publishedCatalogues.js';

/** The intents generated from this table. */
export type CatalogueFamilyIntentId =
  | 'set-window-type'
  | 'set-door-type'
  | 'set-slab-type'
  | 'set-ceiling-type'
  // §FEAT-CHAT-STAIR-TYPES (L-1441) — the founder's "Make all the stairs type X"
  // and "Make all the stair railings type X". TWO families, not one: a stair
  // and its railings are different elements with different stores, different
  // commands and different catalogues, and the two sentences differ by one
  // word. See the table rows for the collision guard that keeps them apart.
  | 'set-stair-railing-type'
  | 'set-stair-type'
  // §FEAT-CHAT-LIGHTING-TYPES (L-10220) — the founder's *"change all lightings
  // in ground level to X"*. The FIRST family added after the block above
  // corrected its own framing: lighting was never missing machinery, only
  // PUBLICATION. See the table row for what that turned out to cost.
  | 'set-lighting-type';

/** The catalogue lookup a family needs, however it was injected. */
export interface CatalogueLookup {
  readonly resolve: (ref: string) => { readonly id: string; readonly name: string } | null;
  readonly names: readonly string[];
  /**
   * §FEAT-CHAT-STAIR-TYPES (L-1441) — a limit on WHAT THIS SOURCE CAN SEE,
   * appended to the refusal that lists its names.
   *
   * ⭐ It exists because a lookup can be honest about "no type called X" and
   * still mislead: when the source is the BUILT-IN table rather than the
   * project's own store, "the stair types here are: …" is a claim about the
   * catalogue the chat can read, not about the project. Saying which one it is
   * costs a sentence and turns a wrong-looking refusal into a true one
   * (§CONTEXT-DATA-HONESTY — failure and empty are the same value, and so are
   * "absent from the project" and "absent from the source I could read").
   */
  readonly note?: string;
}

export interface CatalogueFamily {
  readonly intent: CatalogueFamilyIntentId;
  /** The element kind, normalized (also the noun the grammar matches on).
   *  A hyphen and a space are the same separator to the grammar, so
   *  `stair-railing` matches "stair railing" and "stair-railing" alike. */
  readonly elementKind: string;
  /** Extra nouns the grammar accepts for this family ("railing", "balustrade").
   *  §FEAT-CHAT-STAIR-TYPES — the first family whose element kind is NOT what a
   *  user calls it; the mechanism is `DIMENSION_FAMILIES.nounAliases`, adopted
   *  rather than re-invented. */
  readonly nounAliases?: readonly string[];
  /** The bus command, and the payload field carrying the id list — or, when
   *  `fanOutPerId` is set, the SINGULAR id field of a per-element verb. */
  readonly busCommand: string;
  readonly idsField: string;
  /**
   * §FEAT-CHAT-STAIR-TYPES (L-1441) — emit ONE command PER resolved id.
   *
   * ⚠ A DISCLOSED TRADE, exactly as `set-room-occupancy` disclosed it: N
   * elements are N undo steps, which `dispatchCommands` states out loud
   * ("undo with Ctrl+Z (N steps)"). The four pre-existing families each have a
   * real `*Batch` verb and keep one-undo; the stair families do NOT — measured
   * 2026-08-20, `stair.updateParameters` and `element.changeType` are both
   * singular and no `stair.updateSystemTypeBatch` exists.
   *
   * ⛔ The wrong fix would have been to route bulk stair type changes through a
   * generic batch verb that reaches the store WITHOUT the stair command's own
   * validation. Fanning out over the REGISTERED singular verb keeps every
   * element's write going through the command that owns its rules, and the
   * batch verb is the follow-up that upgrades N steps to one.
   */
  readonly fanOutPerId?: true;
  /**
   * Builds the value-stage payload from the RESOLVED catalogue id. Absent ⇒
   * `{ systemType: id }`, which is what all four `*.updateSystemTypeBatch`
   * families mean and what they shipped with, byte-identical.
   *
   * It exists because "change the type" is ONE user gesture carried by three
   * different payload shapes: `systemType` for the batch verbs, `updates.typeId`
   * for `stair.updateParameters`, `{elementType, newTypeId}` for
   * `element.changeType`. Encoding that in the table keeps the difference where
   * the route is declared instead of in a per-family branch downstream.
   */
  readonly typePayload?: (typeId: string) => Readonly<Record<string, unknown>>;
  /** The word used in refusal copy ("window type", "slab type"). */
  readonly typeNoun: string;
  /** The plural spoken in cards and summaries, where `${elementKind}s` is wrong
   *  ("stair railings", not "stair-railings"). */
  readonly nounPlural?: string;
  readonly noSelectionReason: string;
  readonly mismatchPrefix: string;
  readonly suggestions: readonly string[];
  /**
   * Where the catalogue comes from. The named legacy fields are kept for the
   * families that had them before the generic channel existed; everything new
   * arrives through `ctx.catalogues[elementKind]`, so a new family costs ZERO
   * lines in `ResolverContext`.
   */
  readonly lookup: (ctx: ResolverContext) => CatalogueLookup | null;
  /** Refs this family must never claim, with the capability that owns them
   *  ("change all doors to left swing" is a swing ask). */
  readonly rejectRef?: (ref: string) => boolean;
  /**
   * §FEAT-CHAT-LIGHTING-TYPES (L-10220) — the spatial scope kinds this family
   * can answer CORRECTLY, forwarded to `CapabilityExecutionSpec.spatialKinds`.
   *
   * ⭐ MEASURED, and it is a defect being closed rather than a preference.
   * `makeHostedTypeParser` passes `orientationWord: undefined` unconditionally,
   * so NO catalogue family's grammar can produce an orientation scope. The
   * generic arm honours it anyway — and the editor's orientation descriptor
   * carries no `elementKind`, so it answers "facing south" with the WALLS that
   * face south. A fan-out family then fans its per-element verb over WALL ids
   * and refuses once per wall: reach that exists only as a defect, which is the
   * exact wording `set-room-occupancy` used when it introduced the field.
   *
   * ⚠ Set on the three FAN-OUT rows only. window / door / slab / ceiling
   * declare `orientation` in `scopeModes` today and their batch commands filter
   * by id, so narrowing them is a separate, declared decision — not a side
   * effect of this one.
   */
  readonly spatialKinds?: readonly ('level' | 'room' | 'orientation')[];
}

/**
 * §FIX-SELF-REFERENTIAL-TYPE-NAME (L-10100) — the listed type names that
 * OVERLAP an unresolved span, in either direction.
 *
 * Exported so the refusal copy and its test read the same function rather than
 * two spellings of "contains" (C84 EI-8a). Whole-word matching in BOTH
 * directions: a span the grammar under-extracted ("type") is found inside a
 * real name ("Custom Window Type"), and a span it over-extracted ("windows to
 * timber casement") is found to carry one ("Timber Casement"). An exact match
 * is never "nearby" — that case resolved and never reaches here.
 */
export function nearbyNames(names: readonly string[], ref: string): readonly string[] {
  const needle = ref.trim();
  if (needle.length === 0) return [];
  const wordish = (inner: string, outer: string): boolean => {
    // `\b` is only a boundary next to a WORD character — a name ending in ")"
    // ("Single Pane (Default)") would never match with it hard-coded on both
    // ends, so each edge is anchored only where it can be.
    const esc = inner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const left = /^\w/.test(inner) ? '\\b' : '';
    const right = /\w$/.test(inner) ? '\\b' : '';
    return new RegExp(`${left}${esc}${right}`, 'i').test(outer);
  };
  return names.filter(
    (n) =>
      n.trim().toLowerCase() !== needle.toLowerCase() &&
      (wordish(needle, n) || wordish(n, needle)),
  );
}

function generic(kind: string) {
  return (ctx: ResolverContext): CatalogueLookup | null => {
    const hit = ctx.catalogues?.[kind];
    return hit === undefined ? null : hit;
  };
}

export const CATALOGUE_FAMILIES: readonly CatalogueFamily[] = [
  {
    intent: 'set-window-type',
    elementKind: 'window',
    busCommand: 'window.updateSystemTypeBatch',
    idsField: 'windowIds',
    typeNoun: 'window type',
    noSelectionReason:
      'No windows are selected — select a window, or say "change all windows to …" to retype every window.',
    mismatchPrefix: 'Window types apply to windows',
    suggestions: ['change all windows to timber casement'],
    lookup: (ctx) =>
      ctx.resolveWindowSystemType === undefined
        ? generic('window')(ctx)
        : { resolve: ctx.resolveWindowSystemType, names: ctx.windowSystemTypeNames ?? [] },
  },
  {
    intent: 'set-door-type',
    elementKind: 'door',
    busCommand: 'door.updateSystemTypeBatch',
    idsField: 'doorIds',
    typeNoun: 'door type',
    noSelectionReason:
      'No doors are selected — select a door, or say "change all doors to …" to retype every door.',
    mismatchPrefix: 'Door types apply to doors',
    suggestions: ['change all doors to white primed softwood'],
    lookup: (ctx) =>
      ctx.resolveDoorSystemType === undefined
        ? generic('door')(ctx)
        : { resolve: ctx.resolveDoorSystemType, names: ctx.doorSystemTypeNames ?? [] },
    // door.setSwing owns "change all doors to left swing".
    rejectRef: (ref) => /\bswings?\b/.test(ref),
  },
  {
    // §FEAT-SLAB-TYPE-BATCH (RAC U7.2) — "change all slabs to RC 250".
    // The catalogue (`slabSystemTypeStore`) ships four real assemblies; the
    // batch MATERIALISES the chosen type's layer stack and derived thickness
    // onto each slab through the live UpdateSlabLayersCommand.
    intent: 'set-slab-type',
    elementKind: 'slab',
    busCommand: 'slab.updateSystemTypeBatch',
    idsField: 'slabIds',
    typeNoun: 'slab type',
    noSelectionReason:
      'No slabs are selected — select a slab, or say "change all slabs to …" to retype every slab.',
    mismatchPrefix: 'Slab types apply to slabs',
    suggestions: ['change all slabs to rc slab monolithic 200mm'],
    lookup: generic('slab'),
  },
  {
    // §FEAT-CEILING-TYPE-BATCH (RAC U7.2) — "change all ceilings to suspended
    // act 600x600". Ten built-in assemblies; same materialisation discipline.
    intent: 'set-ceiling-type',
    elementKind: 'ceiling',
    busCommand: 'ceiling.updateSystemTypeBatch',
    idsField: 'ceilingIds',
    typeNoun: 'ceiling type',
    noSelectionReason:
      'No ceilings are selected — select a ceiling, or say "change all ceilings to …" to retype every ceiling.',
    mismatchPrefix: 'Ceiling types apply to ceilings',
    suggestions: ['change all ceilings to plasterboard 12.5mm'],
    lookup: generic('ceiling'),
    // ⛔ §FEAT-CHAT-LIGHTING-TYPES (L-10220) — THE COLLISION PUBLISHING LIGHTING
    // CREATES, guarded the same way the stair/railing one is.
    //
    // "change all ceiling lights to downlight" hits THIS row first: the grammar
    // matches "…all ceiling", finds no place phrase, and hands the rest over as
    // typeRef **"lights to downlight"** — a confident ceiling-type refusal over
    // a sentence about luminaires. Measured on this grammar 2026-08-24.
    //
    // The lighting row cannot claim it either (its nouns must follow the scope
    // word, and "ceiling" does not), so declining here makes the sentence a
    // MISS rather than a wrong answer. ⛔ That is the intended outcome: "ceiling
    // lights" is a real ask nothing serves yet, and a miss says so.
    rejectRef: (ref) => /^(?:lights?|lamps?|luminaires?|lighting|fixtures?)\b/i.test(ref),
  },
  // ─────────────────────────────────────────────────────────────────────────
  // §FEAT-CHAT-STAIR-TYPES (L-1441) — the founder's two sentences, verbatim:
  //   *"Make all the stairs type X"*  ·  *"Make all the stair railings type X"*
  //
  // ⭐⭐ THE RAILING ROW COMES FIRST, AND THE ORDER IS LOAD-BEARING.
  //
  // `CATALOGUE_FAMILY_MATCHERS` maps this array IN ORDER, and the stair
  // grammar's noun is `stairs?` — which matches the word "stair" inside
  // "stair railings". Measured on the founder's literal:
  //
  //   "make all the stair railings type flat bar"
  //     → the STAIR parser matches "…the stair", leaves " railings type flat
  //       bar" as the tail, and resolves typeRef = "railings type flat bar"
  //     → "There is no stair type called 'railings type flat bar'…"
  //
  // A confidently wrong catalogue refusal over a sentence that names a real
  // railing type. **That is the founding incident's exact shape** — the wall
  // TYPE grammar swallowing a RAKE sentence (§FIX-RAKE-SWALLOWED-AS-TYPE,
  // L-1370) — reproduced by two families instead of two capabilities.
  //
  // ⛔ ORDER ALONE IS NOT THE GUARD. Ordering fixes it only while the array
  // stays sorted, and an array whose correctness depends on a sort nobody
  // enforces is the "enumerated list that must be REMEMBERED" defect again. So
  // the stair row ALSO carries a `rejectRef` — the SAME mechanism `set-door-type`
  // already uses to keep "change all doors to left swing" out of the catalogue
  // — and `__tests__/stair-chat-acceptance.test.ts` pins both halves. Two
  // independent guards, because the collision is silent when either fails.
  //
  // ⭐⭐ THIRD RECURRENCE — §FIX-SELF-REFERENTIAL-TYPE-NAME (L-10100, lane
  // RACTYPE12, 2026-08-23). Same shape, new cause: the founder's TYPE NAME
  // CONTAINED THE GRAMMAR'S OWN NOUN. "Make all windows Custom window type"
  // made `liftTypeFilter` anchor on the SECOND "window" — the one inside his
  // type name — and the sentence reached this table as typeRef **"type"**,
  // earning a refusal that denied his type in the clause before the one that
  // listed it. window, door AND wall all failed; slab / ceiling / stair /
  // stair-railing survived only because their domain-noise lists happen to
  // omit the PLURAL. ⛔ THAT IS THE SAME "enumerated list that must be
  // REMEMBERED" defect this block already warns about, one layer down. The
  // guards now live in `FilterScope.liftTypeFilter` (mis-anchor refused +
  // longest catalogue claim wins), in `makeHostedTypeParser` (read the
  // sentence as typed FIRST) and in `nearbyNames` below (a refusal may not
  // deny a name it lists). See C68 §3.d.
  {
    intent: 'set-stair-railing-type',
    // storeRegistry registers this kind under exactly this key
    // (apps/editor initStores.ts:107 `r('stair-railing', …)`), so the 'all'
    // scope enumerates through the same path every other family uses.
    elementKind: 'stair-railing',
    // What users call them. ⚠ 'handrail' and 'guardrail' are NOT here: those
    // name the STANDALONE handrail family (`handrailStore`, a different
    // element with its own `element.changeType` branch). Claiming them would
    // silently retype the wrong elements — the floor/slab disambiguation
    // problem this table already refuses to coin-flip.
    nounAliases: ['stair railing', 'railing', 'balustrade', 'stair balustrade'],
    // §FIX-STAIR-RAILING-TYPE-PICKER — the ONE uniform type-swap surface, whose
    // stair-railing branch resolves all thirteen construction fields from
    // `newTypeId` ALONE via `resolveStairRailingTypeFields` (the projection the
    // panel and the chat now share, C84 EI-4a/EI-9). That is precisely what
    // makes this family chat-drivable: the chat forwards ONE id, never thirteen
    // re-derived numbers.
    busCommand: 'element.changeType',
    idsField: 'elementId',
    fanOutPerId: true,
    typePayload: (id) => ({ elementType: 'stair-railing', newTypeId: id }),
    typeNoun: 'railing type',
    nounPlural: 'stair railings',
    noSelectionReason:
      'No stair railings are selected — select a railing, or say "make all the stair railings frameless glass balustrade" to retype every one.',
    mismatchPrefix: 'Railing types apply to stair railings',
    suggestions: [
      'make all the stair railings frameless glass balustrade',
      'change all stair railings to stainless cable railing',
    ],
    lookup: (ctx) => generic('stair-railing')(ctx) ?? publishedRailingTypeCatalogue(),
    // ⛔ NOT orientation — a railing has no facade, and the arm's orientation
    // descriptor returns WALLS. See `CatalogueFamily.spatialKinds`.
    spatialKinds: ['level', 'room'],
  },
  {
    intent: 'set-stair-type',
    elementKind: 'stair',
    nounAliases: ['staircase', 'stair flight'],
    // ⭐ THE SINGULAR VERB, DELIBERATELY. `element.changeType`'s stair branch
    // and this verb reach the SAME command — that branch's own comment says so:
    // *"the SAME legacy command the plugin bridge already runs"*
    // (initBusHandlers.ts:1853). `stair.updateParameters` is chosen over
    // `element.changeType` because it is the route the single-element chat
    // capabilities (`set-riser-height`, `set-tread-depth`, `set-width`) already
    // use, so the bulk and the single ask cannot diverge in what they validate.
    busCommand: 'stair.updateParameters',
    idsField: 'stairId',
    fanOutPerId: true,
    // UpdateStairParametersCommand's own shape: it reads `updates.typeId`
    // (line 135) and then asks `stairTypeStore.resolveDefaults(typeId)` for the
    // type's parameter defaults (line 140-141) before rebuilding the geometry.
    typePayload: (id) => ({ updates: { typeId: id } }),
    typeNoun: 'stair type',
    noSelectionReason:
      'No stairs are selected — select a stair, or say "make all the stairs monolithic concrete" to retype every one.',
    mismatchPrefix: 'Stair types apply to stairs',
    suggestions: [
      'make all the stairs monolithic concrete',
      'change all stairs to steel open riser',
    ],
    lookup: (ctx) => generic('stair')(ctx) ?? publishedStairTypeCatalogue(),
    // ⛔ THE COLLISION GUARD — see the block comment above this pair. A ref that
    // BEGINS with a railing noun is a railing sentence this grammar mis-read;
    // declining it (rather than refusing) lets the railing family claim it.
    rejectRef: (ref) => /^(?:railings?|balustrades?|handrails?|guardrails?)\b/i.test(ref),
    spatialKinds: ['level', 'room'],
  },
  // ─────────────────────────────────────────────────────────────────────────
  // §FEAT-CHAT-LIGHTING-TYPES (L-10220) — the founder's sentence, verbatim:
  //   *"change all lightings in ground level to 'X'"*
  //
  // ⭐ THE MACHINERY WAS ALREADY THERE, EXACTLY AS THE HEADER SAYS. What this
  // row cost was one table entry, one published-catalogue reader and one
  // registry declaration. What it EXPOSED cost more, and is the finding:
  //
  //   ⛔ THE LEVEL SCOPE IN HIS SENTENCE DID NOT WORK FOR ANY FAMILY. This
  //   table's grammar factory carried the FIFTH hand-written spelling of the
  //   scope tail — `on` hard-wired to LEVEL, `in the` hard-wired to ROOM — so
  //   "in ground level" matched nothing at all and the phrase LEAKED INTO THE
  //   TYPE REF. window / door / slab / ceiling / stair / stair-railing were all
  //   broken the same way and nobody had reported it. Fixed for all seven at
  //   once in `makeHostedTypeParser` (§FIX-HOSTED-TYPE-SCOPE-TAIL), which is
  //   the shape this file already demands: extend the table, never special-case
  //   the newest row.
  //
  // ── WHY LIGHTING QUALIFIES WHERE column / beam DO NOT ───────────────────
  //
  // The rule at the top of this file is that a family needs a NAMED catalogue,
  // not a closed enum. Lighting looks like the enum case and is not:
  // `LightingFixtureType` IS a union, but `BUILT_IN_LIGHTING_TYPES`
  // (@pryzm/geometry-lighting) is a real `{id, name, description, mount}` table
  // over it — 12 named families + the 20 LOD-200 rows, by construction — and it
  // is the SAME table the properties-panel picker renders and the SAME one
  // `element.changeType`'s lighting branch validates against. column/beam have
  // no such table: their `profile`/`sectionType` is bare enum members with no
  // display names, so a refusal there could list nothing. MEASURED 2026-08-24.
  //
  // ── THE ROUTE, AND WHAT IT IS NOT ──────────────────────────────────────
  //
  // ⛔ NOT `lighting.setMaterial`, and not any `plugins/lighting` DTO verb.
  // Six lighting rows sit in `tools/ga-gate/mirror-debt.json` (`lighting.delete`
  // / `.setEmergency` / `.setIntensity` / `.setMaterial` / `.move` /
  // `.changeLevel`) — the plugin DTO channel, which nothing renders. This row
  // rides `element.changeType`, whose lighting branch REFUSES an id the
  // catalogue does not know and otherwise dispatches
  // `UpdateLightingParametersCommand`: `lightingStore.update(...)` followed by
  // an explicit `lightingFragmentBuilder.update(record)`, because a fixture's
  // whole geometry switches on its type. Pinned end-to-end by
  // `packages/command-registry/__tests__/lightingTypeSwap.test.ts`.
  {
    intent: 'set-lighting-type',
    // `storeRegistry` registers the lighting store under exactly this key
    // (apps/editor initStores.ts:127 `r('lighting', stores.lightingStore)`), so
    // both the 'all' and the LEVEL scope enumerate through the same path every
    // other family uses. Lighting records carry their own `levelId`, so the
    // bridge's level arm filters them directly — no host derivation.
    elementKind: 'lighting',
    // What users call them. The founder typed "lightings"; `(?:lighting)s?`
    // already covers that, and these are the words the rest of us use.
    nounAliases: ['light', 'light fixture', 'lighting fixture', 'lamp', 'luminaire'],
    busCommand: 'element.changeType',
    idsField: 'elementId',
    fanOutPerId: true,
    typePayload: (id) => ({ elementType: 'lighting', newTypeId: id }),
    typeNoun: 'lighting type',
    // ⚠ `${elementKind}s` would be "lightings" — the founder's own word, but not
    // one PRYZM should speak back at him in a summary. C78's rule: the product
    // reads the user's spelling and replies in the product's.
    nounPlural: 'lights',
    noSelectionReason:
      'No lights are selected — select a light, or say "change all lights to pendant" to retype every one.',
    mismatchPrefix: 'Lighting types apply to light fixtures',
    suggestions: [
      'change all lights to pendant',
      'change all lights in ground level to recessed downlight',
    ],
    // The generic channel first (a project catalogue always wins), then the
    // published table. Unlike stair this fallback carries NO limiting note, and
    // `publishedLightingTypeCatalogue`'s header states the measurement that
    // earns the difference: the set it can resolve is exactly the set the route
    // will accept.
    lookup: (ctx) => generic('lighting')(ctx) ?? publishedLightingTypeCatalogue(),
    // ⛔ ANOTHER CAPABILITY'S SENTENCES, declined rather than refused — the same
    // mechanism `set-door-type` uses for "left swing".
    //
    // "turn all the lights off" / "make all lights brighter" are switching and
    // dimming asks. Neither has a chat route yet (`lighting.setIntensity` is an
    // UNMIRRORED plugin DTO verb), so a MISS is the honest answer and a
    // catalogue refusal listing 32 fixture names would not be.
    //
    // ⭐ WHOLE-REF, NEVER A SUBSTRING, and that is load-bearing: two real
    // fixture names are "Emergency Downlight (Maintained)" and "Up/Down Wall
    // Sconce". A `\bdown\b` or `\bon\b` substring test would deny type names
    // this family exists to accept — the L-10100 rule (a refusal may not deny a
    // name it lists) applied one layer earlier, at the claim.
    rejectRef: (ref) =>
      /^(?:on|off|dim|dimmer|dimmed|bright|brighter|brightness|intensity)$/i.test(ref.trim()),
    spatialKinds: ['level', 'room'],
  },
];

const BY_INTENT: ReadonlyMap<CatalogueFamilyIntentId, CatalogueFamily> =
  new Map(CATALOGUE_FAMILIES.map((f) => [f.intent, f]));

export function catalogueFamily(intent: string): CatalogueFamily | null {
  return BY_INTENT.get(intent as CatalogueFamilyIntentId) ?? null;
}

/** The element kinds a catalogue family covers — for the registry's targets. */
export function catalogueFamilyTargets(intent: CatalogueFamilyIntentId): readonly string[] {
  return [BY_INTENT.get(intent)!.elementKind];
}

/**
 * Build the family's `CapabilityExecutionSpec` — the value stage is the ONE
 * shape every catalogue family shares: resolve through the injected lookup, and
 * refuse by LISTING the project's real type names (§CONTEXT-DATA-HONESTY).
 * Absent injection forwards the raw string and the COMMAND resolves and refuses
 * with the same honesty; never a silent mismatch, never a guess.
 */
export function catalogueFamilySpec(
  family: CatalogueFamily,
): CapabilityExecutionSpec<{ intent: CatalogueFamilyIntentId; typeRef: string; scope: never }> {
  return {
    elementKind: family.elementKind,
    busCommand: family.busCommand,
    idsField: family.idsField,
    ...(family.nounPlural !== undefined ? { nounPlural: family.nounPlural } : {}),
    noSelectionReason: family.noSelectionReason,
    mismatchPrefix: family.mismatchPrefix,
    suggestions: family.suggestions,
    destructive: false,
    ...(family.fanOutPerId === true ? { fanOutPerId: true as const } : {}),
    // §FEAT-CHAT-LIGHTING-TYPES (L-10220) — see `CatalogueFamily.spatialKinds`.
    ...(family.spatialKinds !== undefined ? { spatialKinds: family.spatialKinds } : {}),
    resolveValue: (si, ctx): SpecValueOutcome => {
      // §FEAT-CHAT-STAIR-TYPES — the payload shape is the FAMILY's, because
      // "change the type" is one gesture carried by three different payloads.
      const build = family.typePayload ?? ((id: string) => ({ systemType: id }));
      const lookup = family.lookup(ctx);
      if (lookup === null) {
        // ⚠ THE RAW-FORWARD ARM IS ONLY SAFE WHERE THE COMMAND RESOLVES. It is
        // for the four `*.updateSystemTypeBatch` families, whose commands run
        // `resolveCatalogueRef` themselves. A fan-out family has no such
        // command — see `publishedCatalogues.ts` for why the stair families
        // always have a lookup and therefore never reach this branch.
        return {
          payload: build(si.typeRef),
          summary: (scopeLabel) => `Change ${scopeLabel} to "${si.typeRef}"`,
        };
      }
      const hit = lookup.resolve(si.typeRef);
      if (hit === null) {
        // The source's own limit, when it has one — see `CatalogueLookup.note`.
        const noteTail = lookup.note === undefined ? '' : ` ${lookup.note}`;
        // ⭐⭐ §FIX-SELF-REFERENTIAL-TYPE-NAME (L-10100) — THE REFUSAL MAY NOT
        // CONTRADICT ITSELF. The founder was told
        //
        //   *"There is no window type called "type" in this project. The window
        //    types here are: … , Custom Window Type."*
        //
        // — his type does not exist, in the same sentence that lists it. That
        // is WORSE than a plain miss: it is a confident denial disproved by its
        // own next clause, and a user who believes it goes and re-creates a
        // type that was already there.
        //
        // The parse defect that produced this exact span is fixed twice over
        // upstream (`liftTypeFilter`, `makeHostedTypeParser`). ⛔ This is the
        // THIRD guard, and it is the one that generalises: whatever span a
        // future grammar mis-extracts, if a REAL type name contains it (or it
        // contains a real name) the copy says so and offers that type instead
        // of denying it. Word-boundary matching, so "type" finds "Custom Window
        // Type" and never "Typewriter Nook".
        const near = nearbyNames(lookup.names, si.typeRef);
        const plural = family.nounPlural ?? `${family.elementKind}s`;
        const listTail = lookup.names.length === 0
          ? ''
          : ` The ${family.typeNoun}s here are: ${lookup.names.join(', ')}.`;
        const head = near.length === 0
          ? (lookup.names.length === 0
              ? `I could not find a ${family.typeNoun} called "${si.typeRef}" in this project.`
              : `There is no ${family.typeNoun} called "${si.typeRef}" in this project.`)
          : near.length === 1
            ? `I could not read "${si.typeRef}" as a complete ${family.typeNoun} name. ` +
              `Did you mean "${near[0]!}"?`
            : `I could not read "${si.typeRef}" as a complete ${family.typeNoun} name. ` +
              `These contain it: ${near.map((n) => `"${n}"`).join(', ')} — name the one you mean.`;
        return {
          refusal: {
            reason: head + listTail + noteTail,
            // The near matches lead: they are the answer when there is one.
            suggestions: [...near, ...lookup.names]
              .filter((n, i, a) => a.indexOf(n) === i)
              .slice(0, 2)
              .map((n) => `change all ${plural} to ${n.toLowerCase()}`),
          },
        };
      }
      return {
        payload: build(hit.id),
        summary: (scopeLabel) => `Change ${scopeLabel} to "${hit.name}"`,
      };
    },
  } as CapabilityExecutionSpec<{ intent: CatalogueFamilyIntentId; typeRef: string; scope: never }>;
}
