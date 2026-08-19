// @pryzm/ai-host — DimensionFamilies (§FEAT-BULK-DIMENSIONS, L-949)
// =============================================================================
//
// WHAT SHIPS HERE. The founder's ask, verbatim: *"I have requested the
// possibility to ask to bulk change any element (doors, windows, walls)
// dimensions (or multiple dims) — I want ALL elements dims to be able to be
// changed."* Concretely: "make all windows 2 meters height", "make all doors 2m
// wide by 1m high with 0.1 sill", "set all walls 3m high" — one or several
// dimensions, over a SCOPE (all / the selection / a level / a room), as ONE
// undoable gesture.
//
// ── THE THREE GATES THIS OPENS, AND WHY NONE OF THEM WAS A BUG ──────────────
//
//  1. `LocalNaturalLanguageResolver`'s `§FIX-CHAT-DIMENSION-ALL-SCOPE` guard.
//     Every dimension capability was SELECTION-scoped, so an all-scope sentence
//     used to be answered by mutating the SELECTION — "set all slabs thickness
//     to 0.2m" resized the one selected wall. The guard that stopped that is
//     CORRECT and is NOT deleted: it declines when there is no all-scope route.
//     What changes is that there now IS one, so the guard hands the sentence to
//     this family instead of dropping it (L-942: a refusing half and its escape
//     hatch ship together, or neither ships).
//  2. `ZeroTokenResolver`'s `needSelection('set-dimensions', …)`. Unchanged for
//     the selection form; the all-scope form no longer reaches it.
//  3. ADR-0314 D3 — "`set-dimensions` stays one-element-only (its contract is
//     one dispatch = one rebuild for one element)". That ruling STANDS. D2 is
//     the other half of it: "Where no batch command exists (dimensions across a
//     selection), the chat MAY fan out one command per element only with an
//     honest summary … **Fan-out is a stopgap; per-family batch commands are
//     the roadmap answer.**" This table is that roadmap answer. The ONE-DISPATCH
//     -ONE-REBUILD property is preserved PER ELEMENT — every requested dimension
//     for a given element rides ONE child command — and the stale-id hazard the
//     ruling exists to prevent is answered three ways:
//       • the target set is resolved ONCE, up front, through the injected scope
//         resolver, and the selection is never re-read per element;
//       • the payload has no unbounded `'all'` form (`requireResolvedIds`), so
//         the Confirm card states a REAL count before consent;
//       • an id the authoritative store no longer holds is REFUSED as a counted
//         skip with its reason, never repaired and never silently dropped
//         (C13 §3.12 §C13-STALE-AFTER-CLEAR, ADR-0299 §RECOVERY-MUST-REFUSE).
//
// ── WHAT A FAMILY MUST PROVE BEFORE IT IS LISTED ────────────────────────────
//
// TWO carriers, and each family declares which one it rides and WHICH FIELDS
// that carrier can really carry. A dimension a family's carrier cannot carry is
// REFUSED BY NAME with the route that can do it — never silently dropped, and
// never silently narrowed to the fields that happen to work (that is the
// partial-execution-presented-as-success dishonesty this resolver exists to
// prevent).
//
//   wall   → `wall.updateHeightBatch`  (SHIPPED 2026-08-11, VERBS-CMD, and DEAD
//            for want of a grammar ever since — `ChatCommandClassification`
//            recorded it as blocked on exactly "a project-scoped measurement
//            grammar". Bridges to `UpdateWallHeightCommand`, which already takes
//            `wallIds: string[]`, already writes the authoritative geometry
//            wallStore via `updateWall()`, already snapshots per wall, and
//            already lands as ONE history entry. Re-implementing it would be the
//            rival-primitive invention C16 forbids.)
//            FIELDS: height ONLY. See `carrierGap` for what that costs and what
//            the refusal says.
//   window,
//   door   → `element.updateDimensionsBatch` (§FEAT-BULK-DIMENSIONS) → composes
//            `UpdateElementParameterCommand` per element — the LIVE hosted-
//            opening route the property panel and the chat's own compound arm
//            already use (openings resolve to the wallStore and rebuild the host;
//            production-proven by the §FIX-CHAT-COMPOUND-DIMENSIONS repro),
//            never the detached plugin `window.setSize` / `door.setWidth` DTO
//            stores.
//            FIELDS: height, width (+ sillHeight for windows).
//
// DELIBERATELY ABSENT, each with the real reason (a family the chat cannot drive
// is said out loud, never silently missing):
//
//   • SLAB / ROOF thickness. The single form routes these to
//     `slab.updateDimensions` → UpdateSlabDimensionsCommand and `roof.update` →
//     UpdateRoofCommand — two more carriers, each with its own undo semantics
//     that a batch would have to compose correctly. They are out of THIS tranche
//     to bound it, not because the ask is wrong: "set all slabs thickness to
//     0.2m" is the very sentence the §FIX-CHAT-DIMENSION-ALL-SCOPE guard was
//     written about, and it is the next entry.
//   • CEILING height (`ceiling.update`) and STAIR width
//     (`stair.updateParameters`) — same shape, same reason.
//   • WALL thickness — see `carrierGap` on the wall family. The carrier that
//     exists carries height and nothing else, and inventing a second wall
//     dimension verb inside a chat tranche is how two sources of truth for one
//     ask get minted.
//   • The `exterior` / `interior` QUALIFIER ("raise all exterior walls to
//     3.2 m"). MEASURED and recorded in ChatCommandClassification:
//     `WallSystemType.function` carries the distinction, but
//     `resolveWallFunction` returns null for every type that declares none —
//     INCLUDING `wt-monolithic`, the default a user draws with — so "all
//     exterior walls" is usually an EMPTY set, not a wrong one. Silently
//     dropping the adjective would raise every wall in the building while the
//     user believed the ask was scoped, which is the worst available outcome.
//     The grammar therefore DOES NOT CLAIM a qualified sentence at all; it stays
//     a miss until a wall-FUNCTION ElementFilter can refuse an empty set out
//     loud.
//
// This module is PURE — tables and regexes. The scope resolver, the level list
// and the catalogues arrive through the injected ResolverContext, exactly as
// everywhere else.

import type { ElementFilter, IntentScope, IntentSpatialScope } from './ScopeDescriptor.js';
import { parseFilterClauses } from './FilterScope.js';
import {
  SPATIAL_TAIL_SRC,
  joinTailPhrase,
  readSpatialTail,
} from './SpatialScopeTail.js';
import type {
  CapabilityExecutionSpec,
  SpecValueOutcome,
} from './CapabilityExecutionSpec.js';
import type { ResolverContext, SemanticIntent } from './ZeroTokenResolver.js';

// ─── The dimension vocabulary ────────────────────────────────────────────────

/** The dimension fields a bulk ask may carry. A CLOSED set: each one is a field
 *  whose SINGLE-element capability already proves it live for the kinds it is
 *  dispatched against (see `SINGLE_FORM_CAPABILITY`), so the batch can never
 *  accept what the single form refuses. */
export type DimensionKey = 'height' | 'width' | 'thickness' | 'sillHeight';

export const DIMENSION_KEYS: readonly DimensionKey[] = ['height', 'width', 'thickness', 'sillHeight'];

/** How each field is SPOKEN — "sill height", never "sillHeight". */
export const DIMENSION_LABEL: Readonly<Record<DimensionKey, string>> = {
  height: 'height',
  width: 'width',
  thickness: 'thickness',
  sillHeight: 'sill height',
};

/**
 * The SINGLE-form capability that owns each field's kind guard —
 * `capabilityTargetRefusal`'s subject in the one-element arm.
 *
 * THE RULE: a bulk ask may never reach an (element kind × dimension) pair the
 * ONE-ELEMENT ask would refuse. That is the §FIX-CHAT-COMPOUND-DIMENSIONS
 * all-or-nothing rule lifted from "one element" to "one family" — legitimate
 * here precisely because every element in a family's scope is the same kind.
 *
 * ⚠ WHY IT IS ENFORCED BY A TEST AND NOT BY CALLING THE REGISTRY HERE. This
 * module is imported BY `ChatCapabilityRegistry` (which generates the three
 * capabilities from the table below, one-way, exactly as it does for the delete
 * families). Importing the registry back would mint a module CYCLE, and a
 * barrel cycle in this package is how a `const` reads `undefined` at load and
 * the editor comes up white (§SCC-NO-BARREL-ACCESS-AT-MODULE-LOAD). So the
 * cross-check is a CONTROL rather than a runtime branch:
 * `__tests__/dimension-families.test.ts` asserts, for every family and every
 * field in its `carries`, that `capabilityAppliesTo(resolveChatCapability(
 * SINGLE_FORM_CAPABILITY[field]), family.elementKind)` is TRUE — so a target
 * removed from the single form turns this table red in the same run rather than
 * letting the batch quietly out-claim it.
 */
export const SINGLE_FORM_CAPABILITY: Readonly<Record<DimensionKey, string>> = {
  height: 'set-height',
  width: 'set-width',
  thickness: 'set-thickness',
  sillHeight: 'set-sill-height',
};

/** The dimensions a sentence asked for, in metres. */
export type DimensionAsk = Partial<Record<DimensionKey, number>>;

// ─── The table ───────────────────────────────────────────────────────────────

/** The intents generated from this table. */
export type DimensionFamilyIntentId =
  | 'set-wall-dimensions'
  | 'set-window-dimensions'
  | 'set-door-dimensions';

export interface DimensionFamily {
  readonly intent: DimensionFamilyIntentId;
  /** The element kind, normalized — also the singular noun the grammar matches. */
  readonly elementKind: string;
  /** Extra nouns the grammar accepts. */
  readonly nounAliases: readonly string[];
  /** The plural spoken in cards and summaries. */
  readonly nounPlural: string;
  /** The ONE batch bus command, and the payload field carrying the id list. */
  readonly busCommand: string;
  readonly idsField: string;
  /** The fields THIS FAMILY'S CARRIER can really carry. A requested field
   *  outside this set is refused BY NAME (see `carrierGap`), never dropped. */
  readonly carries: readonly DimensionKey[];
  /** For a field the carrier cannot carry: the honest sentence naming the route
   *  that CAN do it. Absent ⇒ the generic "no bulk route" copy. */
  readonly carrierGap?: Partial<Record<DimensionKey, string>>;
  /** Builds the family's bus payload from the resolved ask. */
  readonly payload: (ask: DimensionAsk) => Readonly<Record<string, unknown>>;
  readonly noSelectionReason: string;
  readonly mismatchPrefix: string;
  readonly suggestions: readonly string[];
  /** The command route that proves the claim — quoted in the registry's
   *  `commandProof` note, so the claim and its evidence live together. */
  readonly commandProof: { readonly file: string; readonly mustMention: readonly string[]; readonly note: string };
  readonly examples: readonly string[];
}

export const DIMENSION_FAMILIES: readonly DimensionFamily[] = [
  {
    intent: 'set-wall-dimensions',
    elementKind: 'wall',
    nounAliases: [],
    nounPlural: 'walls',
    // The SHIPPED verb, dead for want of a grammar since 2026-08-11.
    busCommand: 'wall.updateHeightBatch',
    idsField: 'wallIds',
    carries: ['height'],
    carrierGap: {
      thickness:
        'there is no project-wide wall-thickness command yet — select the walls and say ' +
        '"set thickness to 200mm", which changes exactly the walls you picked',
      width:
        'a wall has no width; its plan dimension is THICKNESS and its run is set by moving its ends',
      sillHeight: 'a wall has no sill — only an opening (a window) does',
    },
    payload: (ask) => ({ height: ask.height }),
    noSelectionReason:
      'No walls are selected — select some walls, or say "set all walls 3m high" to raise the whole project.',
    mismatchPrefix: 'Wall dimensions apply to walls',
    suggestions: ['set all walls 3m high', 'make all walls 2.7 meters high'],
    commandProof: {
      file: 'plugins/wall/src/handlers/UpdateWallsHeightBatch.ts',
      mustMention: ['wallStore', 'UpdateWallHeightCommand'],
      note: "The handler resolves the scope against the authoritative geometry wallStore and dispatches the existing multi-wall UpdateWallHeightCommand (wallStore.updateWall → the renderers/projector/exporter read it), so the command's reachable set is walls only and its undo is the command's own per-wall snapshot restore.",
    },
    examples: [
      'set all walls 3m high',
      'make all walls 2.7 meters high',
      'set all walls height to 3m',
      'make the selected walls 3m high',
      'set all walls on level 2 to 3.2m high',
    ],
  },
  {
    intent: 'set-window-dimensions',
    elementKind: 'window',
    nounAliases: ['glazing unit'],
    nounPlural: 'windows',
    busCommand: 'element.updateDimensionsBatch',
    idsField: 'elementIds',
    carries: ['height', 'width', 'sillHeight'],
    carrierGap: {
      // Stated as a CAPABILITY fact, not a modelling one. `set-thickness` is
      // declared for wall / slab / roof and for nothing else, so the one-element
      // ask already refuses a window thickness; the batch may not out-claim it.
      thickness:
        'the one-element "set thickness" capability is declared for walls, slabs and roofs only, ' +
        'so I will not claim it in bulk either — the wall a window sits in is what carries a thickness',
    },
    payload: (ask) => ({ elementKind: 'window', dimensions: ask }),
    noSelectionReason:
      'No windows are selected — select some windows, or say "make all windows 2 meters height" to resize every window.',
    mismatchPrefix: 'Window dimensions apply to windows',
    suggestions: ['make all windows 2 meters height', 'make all windows 1m wide and 2m high'],
    commandProof: {
      file: 'packages/command-registry/src/generic/UpdateElementDimensionsBatchCommand.ts',
      mustMention: ['UpdateElementParameterCommand', 'elementKind', 'skipped'],
      note: "Per element it instantiates the LIVE UpdateElementParameterCommand with EVERY requested dimension in ONE parameters object (openings resolve to the wallStore and rebuild the host — the route §FIX-CHAT-COMPOUND-DIMENSIONS proved in production), and an id the store no longer holds becomes a counted skip with its reason rather than a silent shrink.",
    },
    examples: [
      'make all windows 2 meters height',
      'make all windows 2m high',
      'change all windows height to 2m',
      'make all windows 1m wide and 2m high',
      'make all windows 2 meters height, 1 meter width and 0.1 meters sill height',
    ],
  },
  {
    intent: 'set-door-dimensions',
    elementKind: 'door',
    nounAliases: [],
    nounPlural: 'doors',
    busCommand: 'element.updateDimensionsBatch',
    idsField: 'elementIds',
    // §FEAT-DOOR-SILL-DECLARED (2026-08-17) — sillHeight is CARRIED now. The
    // follow-up this block used to name is closed; the note is kept because the
    // REASONING is the load-bearing part, not the outcome.
    //
    // This family shipped carrying only height+width, and the refusal it gave for
    // a door sill was the CORRECT one: the gap was a DECLARATION gap, never a
    // modelling one, and the copy said so instead of inventing "a door has no
    // sill" — which would have been a false refusal shipped over a live field.
    //
    // MEASURED 2026-08-17, before the declaration moved (a capability that claims
    // a write it cannot perform is the defect this table exists to prevent):
    //   · `DoorData.sillHeight` is a REQUIRED nonnegative field (DoorTypes.ts:52);
    //   · `DoorBuilder` READS it — `elevation + door.sillHeight + door.height / 2`
    //     (DoorBuilder.ts:498), so a write moves real geometry;
    //   · the door property panel already edits it (DoorSection.ts, 0–0.5 m);
    //   · `UpdateElementParameterCommand.applyUpdate:487-492` routes 'door' to
    //     `store.updateDoor()` + `doorStore.update()`, passing parameters through
    //     generically exactly as its 'window' arm does — the SAME command this
    //     family's carrier composes;
    //   · `WallStore`'s header names `door.setSillHeight` among the paths BIM 2.0
    //     certification MEASURED.
    //
    // The store could always do it. `set-sill-height.targets` read ['window'], and
    // SINGLE_FORM_CAPABILITY forbids the batch out-claiming the single form, so
    // this family refused — correctly, on the declaration. That target list now
    // reads ['window','door'], so the refusal has no subject left and the founder's
    // literal "make all doors 2m wide by 1m high with 0.1 sill" resolves.
    //
    // ⛔ If a future edit narrows `set-sill-height.targets` back to windows, this
    // MUST return to carrierGap in the same commit — a family carrying a dimension
    // its single form refuses is exactly the out-claim the invariant forbids.
    carries: ['height', 'width', 'sillHeight'],
    carrierGap: {
      thickness:
        'the one-element "set thickness" capability is declared for walls, slabs and roofs only, ' +
        'so I will not claim it in bulk either — the wall a door sits in is what carries a thickness',
    },
    payload: (ask) => ({ elementKind: 'door', dimensions: ask }),
    noSelectionReason:
      'No doors are selected — select some doors, or say "make all doors 2m high" to resize every door.',
    mismatchPrefix: 'Door dimensions apply to doors',
    suggestions: ['make all doors 2m high', 'make all doors 0.9m wide and 2.1m high'],
    commandProof: {
      file: 'packages/command-registry/src/generic/UpdateElementDimensionsBatchCommand.ts',
      mustMention: ['UpdateElementParameterCommand', 'elementKind', 'skipped'],
      note: "The window family's twin, one noun over: per door it instantiates the LIVE UpdateElementParameterCommand with every requested dimension in ONE parameters object, and a stale id is a counted skip with its reason.",
    },
    examples: [
      'make all doors 2m high',
      'make all doors 0.9m wide and 2.1m high',
      'change all doors width to 900mm',
      'make the selected doors 2.1m high',
    ],
  },
];

const BY_INTENT: ReadonlyMap<DimensionFamilyIntentId, DimensionFamily> =
  new Map(DIMENSION_FAMILIES.map((f) => [f.intent, f]));

export function dimensionFamily(intent: string): DimensionFamily | null {
  return BY_INTENT.get(intent as DimensionFamilyIntentId) ?? null;
}

export function isDimensionFamilyIntentId(id: string): id is DimensionFamilyIntentId {
  return BY_INTENT.has(id as DimensionFamilyIntentId);
}

/** The element kinds a dimension family covers — for the registry's targets. */
export function dimensionFamilyTargets(intent: DimensionFamilyIntentId): readonly string[] {
  return [BY_INTENT.get(intent)!.elementKind];
}

// ─── The generated spec ──────────────────────────────────────────────────────

function fmt(n: number): string {
  return `${Math.round(n * 1000) / 1000} m`;
}

function joinWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]!}`;
}

/**
 * Build the family's `CapabilityExecutionSpec`.
 *
 * The value stage is where all the honesty lives, and it runs in ONE order for
 * every family:
 *
 *   1. NOTHING ASKED  ⇒ refuse with a concrete example. An empty ask is not a
 *      no-op that succeeds.
 *   2. THE FIELD SET  ⇒ `carries` is the intersection of what this family's ONE
 *      batch verb can carry and what the SINGLE form's registry targets allow
 *      (see `SINGLE_FORM_CAPABILITY` for why the second half is a control rather
 *      than a call). A field outside it is refused BY NAME, with the route that
 *      CAN do it. Applying the other fields and staying quiet about this one
 *      would be partial execution presented as success (ALL-OR-NOTHING, per
 *      element and therefore — since every element in a family scope is the same
 *      kind — per batch).
 *   3. SIGN  ⇒ a non-positive height/width/thickness is refused with the number
 *      the user said. `sillHeight` may be 0 (a floor-level opening) but not
 *      negative.
 *
 * `destructive: true` + `requireResolvedIds: true` are the two halves of a safe
 * mass edit, and neither is decoration. Resizing every window in a project is
 * not a gesture whose extent is obvious from the sentence, so the bridge draws a
 * Confirm card — and the card is required to state a REAL resolved count
 * ("This resizes all 42 windows in the project"), which is exactly what
 * `requireResolvedIds` guarantees by forbidding the unbounded `'all'` payload.
 * An absent scope resolver REFUSES rather than widening.
 */
export function dimensionFamilySpec(
  family: DimensionFamily,
): CapabilityExecutionSpec<{ intent: DimensionFamilyIntentId; dims: DimensionAsk; scope: never }> {
  return {
    elementKind: family.elementKind,
    busCommand: family.busCommand,
    idsField: family.idsField,
    nounPlural: family.nounPlural,
    noSelectionReason: family.noSelectionReason,
    mismatchPrefix: family.mismatchPrefix,
    suggestions: family.suggestions,
    spatialAbility:
      `resize all ${family.nounPlural}, the selected ones, or the ones on a level or in a room`,
    // The two halves of a safe mass edit — see the doc comment above.
    requireResolvedIds: true,
    destructive: true,
    // C68 §6.3-G3 — the arm handles the SUPERSET of spatial kinds with one
    // implementation, so a new spec silently "honours" kinds its grammar never
    // produces and its declaration never claims. Narrowed here to the two this
    // family really answers, which makes the capability SMALLER and TRUER
    // rather than merely quieter:
    //
    //   • LEVEL and ROOM are produced by the grammar above and resolve to
    //     elements of this family's own kind.
    //   • ORIENTATION is NOT. The editor's orientation arm answers "facing
    //     south" with the WALLS that face south, so a window or door family
    //     scoped that way would resize WALL ids — reach that exists only as a
    //     defect. For the WALL family it would at least address the right kind,
    //     but the grammar cannot produce it either ("set all south-facing walls
    //     3m high" is not claimed), and declaring reach no sentence can reach is
    //     the same lie in the other direction.
    spatialKinds: ['level', 'room'],
    resolveValue: (si, _ctx): SpecValueOutcome => {
      const ask = si.dims ?? {};
      const asked = DIMENSION_KEYS.filter((k) => typeof ask[k] === 'number' && Number.isFinite(ask[k]!));
      if (asked.length === 0) {
        return {
          refusal: {
            reason:
              `I need at least one dimension and a value — for example "${family.suggestions[0]}".`,
            suggestions: family.suggestions,
          },
        };
      }
      for (const key of asked) {
        // (2)+(3) the CARRIER's field set. `carries` is the intersection of what
        // this family's ONE batch verb can carry and what the SINGLE form's
        // registry targets allow — the second half pinned by the control named
        // on `SINGLE_FORM_CAPABILITY`, because re-checking it here would need a
        // module cycle. A field outside the set is refused BY NAME, never
        // dropped: applying the other fields and staying quiet about this one is
        // partial execution presented as success.
        if (!family.carries.includes(key)) {
          const gap = family.carrierGap?.[key];
          return {
            refusal: {
              reason:
                `I can change the ${joinWords(family.carries.map((k) => DIMENSION_LABEL[k]))} of ` +
                `every ${family.elementKind} in one go, but not the ${DIMENSION_LABEL[key]} — ` +
                `${gap ?? `there is no project-wide ${family.elementKind} ${DIMENSION_LABEL[key]} command yet`}. ` +
                `Nothing was changed.`,
              suggestions: family.suggestions,
            },
          };
        }
        // (4) sign.
        const value = ask[key]!;
        if (key === 'sillHeight' ? value < 0 : value <= 0) {
          return {
            refusal: {
              reason: key === 'sillHeight'
                ? `A sill height of ${fmt(value)} is not valid — it cannot be negative.`
                : `A ${DIMENSION_LABEL[key]} of ${fmt(value)} is not valid — it must be positive.`,
              suggestions: family.suggestions,
            },
          };
        }
      }
      const resolved: DimensionAsk = {};
      for (const key of asked) resolved[key] = Math.round(ask[key]! * 1000) / 1000;
      const parts = asked.map((k) => `${DIMENSION_LABEL[k]} ${fmt(resolved[k]!)}`);
      return {
        payload: family.payload(resolved),
        // The Confirm card's whole safety argument: it names the COUNT (which
        // `requireResolvedIds` guarantees is real), the KIND, and every field it
        // is about to write — and it ends by saying what does NOT change.
        summary: (scopeLabel, notesTail) =>
          `This sets ${scopeLabel} to ${joinWords(parts)}. Nothing else changes.${notesTail}`,
      };
    },
  } as CapabilityExecutionSpec<{ intent: DimensionFamilyIntentId; dims: DimensionAsk; scope: never }>;
}

// ─── The generated grammar ───────────────────────────────────────────────────
//
// One parser per family, from the table. THE SCOPE WORD IS REQUIRED and the
// ambiguous readings are NOT claimed — on a mass edit an unclaimed sentence
// falls through to an honest "I'm not sure", which is strictly better than a
// coin flip that resizes the whole building.
//
//   "make all windows 2 meters height"        → all (project-wide, count resolved)
//   "set all walls 3m high"                   → all
//   "set all walls height to 3m"              → all (property-first word order)
//   "make all doors 2m wide by 1m high        → all, THREE fields, ONE dispatch
//    with 0.1 sill"                             (…and the door family refuses the
//                                                sill by name — see carrierGap)
//   "make the selected windows 2m high"       → the selection
//   "set all windows on level 2 to 2m high"   → level 2
//   "change all windows in level 2 to 1.5     → level 2. ⭐ THE PREPOSITION DOES
//    meters wide"                               NOT DECIDE THE KIND — THE NOUN
//                                               DOES (L-1201, C67 §4.16). Until
//                                               2026-08-19 this sentence — the
//                                               founder's, verbatim — meant "a
//                                               ROOM called level", and leaked
//                                               its "2" into the value.
//   "make all windows in this floor 2m high"  → the ACTIVE level (HERE_RE)
//   "change all windows in the level to       → a ROOM named "Level". A level
//    1.5m wide"                                 noun with no level after it is
//                                               the noun used as a NAME, so such
//                                               a room stays addressable.
//   "make all windows in the kitchen 2m high" → the kitchen
//   "make the windows 2m high"                → NOT CLAIMED. "the" with no scope
//                                               word could mean the selection or
//                                               the project, and a mass resize
//                                               does not guess.
//   "raise all exterior walls to 3.2 m"       → NOT CLAIMED. The qualifier has no
//                                               resolver and MUST NOT be dropped;
//                                               see the header.
//
// ── WHAT KEEPS THIS OFF EVERY OTHER GRAMMAR ─────────────────────────────────
//
// A claim needs BOTH a scope word (or a selection word) AND at least one
// (number, dimension-word) BINDING. The type/colour/rake grammars carry no
// dimension binding ("timber casement", "white", "angled by 70 degrees"), the
// creation grammars use verbs this one does not accept ("create"/"add"/"draw"),
// and the single-element dimension matchers require the bare "this"/"the
// selection" forms this parser deliberately does not match. Rake and pitch words
// are additionally declined outright, so a near-miss can never be resolved as a
// resize.

const DIM_VERB = String.raw`(?:set|change|make|resize|update|adjust)`;
const SCOPE_ALL = String.raw`(?:all|every|each)`;
// NOT "this": "make this window 2m high" is a SINGLE-element ask that the
// existing matchers own, and a generic table must never quietly re-interpret a
// sentence that already resolves.
const SCOPE_SEL = String.raw`(?:these|those|selected)`;

/** The measurement source, byte-identical to the resolver's LEN_SRC — the unit
 *  rule itself stays in ONE place (`lengthToMeters`), which the caller applies
 *  to the captured groups. */
const LEN = String.raw`(-?\d+(?:[.,]\d+)?)\s*(millimet(?:er|re)s?|centimet(?:er|re)s?|met(?:er|re)s?|mm|cm|m)?\b`;

/** Dimension words, LONGEST FIRST so "sill height" never resolves as "height". */
const DIM_WORD_TO_KEY: readonly (readonly [string, DimensionKey])[] = [
  ['sill height', 'sillHeight'],
  ['sill', 'sillHeight'],
  ['thickness', 'thickness'],
  ['thick', 'thickness'],
  ['height', 'height'],
  ['high', 'height'],
  ['tall', 'height'],
  ['width', 'width'],
  ['wide', 'width'],
];

const DIM_WORD_SRC = DIM_WORD_TO_KEY.map(([w]) => w.replace(' ', String.raw`\s+`)).join('|');

/** "2 meters height" / "0.1 sill" — the value LEADS. */
const BINDING_VALUE_FIRST = new RegExp(
  String.raw`${LEN}\s*(?:in\s+|of\s+)?(${DIM_WORD_SRC})\b`,
  'g',
);
/** "height to 3m" / "width 900mm" — the dimension word LEADS. */
const BINDING_DIM_FIRST = new RegExp(
  String.raw`\b(${DIM_WORD_SRC})\b\s*(?:of|to|at|is|=|:)?\s*${LEN}`,
  'g',
);

function keyForWord(raw: string): DimensionKey | null {
  const w = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  for (const [word, key] of DIM_WORD_TO_KEY) if (word === w) return key;
  return null;
}

/**
 * Extract every (dimension, value) binding from the tail of a sentence, in both
 * word orders. THE FIRST reading of a given dimension wins — "2m high and 3m
 * high" is a sentence the user got wrong, and picking the later number silently
 * would be inventing an intent.
 *
 * Exported so the tier-0 grammar and the NL classifier share ONE extractor: the
 * natural and rigid paths cannot understand "2 meters height" differently.
 */
export function extractDimensionBindings(
  rest: string,
  toMeters: (value: string, unit: string | undefined) => number,
): DimensionAsk {
  const ask: DimensionAsk = {};
  const take = (key: DimensionKey, value: number): void => {
    if (ask[key] === undefined && Number.isFinite(value)) ask[key] = value;
  };
  BINDING_VALUE_FIRST.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BINDING_VALUE_FIRST.exec(rest)) !== null) {
    const key = keyForWord(m[3]!);
    if (key !== null) take(key, toMeters(m[1]!, m[2]));
  }
  BINDING_DIM_FIRST.lastIndex = 0;
  while ((m = BINDING_DIM_FIRST.exec(rest)) !== null) {
    const key = keyForWord(m[1]!);
    if (key !== null) take(key, toMeters(m[2]!, m[3]));
  }
  return ask;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Qualifiers with no resolver. Claiming a sentence carrying one would mean
 *  DROPPING it — see the header on `exterior`. */
const UNRESOLVED_QUALIFIER = /\b(?:exterior|external|interior|internal|outside|inside|load[- ]bearing|structural)\b/;

/** Words owned by another capability. A near-miss must never resolve as a
 *  resize: rake/pitch carry numbers too. */
const OTHER_CAPABILITY_WORD =
  /\b(?:angled?|tilted?|raked?|leaning|leant|slanted|vertical|upright|pitch|slope|degrees?|deg)\b/;

// §FIX-SCOPE-TAIL-ONE-PARSER (L-1201) — `HERE_RE` and the local `levelScope`
// used to live here. They are now `SpatialScopeTail.readSpatialTail`, shared
// with every other grammar that names a place, because THREE hand-written
// spellings of one scope tail is how the founder's "in level 2" came to mean
// "a room called level". See that module's header for the measurement.

interface CompiledDimensionFamily {
  readonly family: DimensionFamily;
  readonly re: RegExp;
}

const COMPILED: readonly CompiledDimensionFamily[] = DIMENSION_FAMILIES.map((family) => {
  const nouns = [family.elementKind, ...family.nounAliases]
    .map((n) => escapeRe(n.replace('-', ' ')))
    .join('|');
  return {
    family,
    re: new RegExp(
      // §FIX-SCOPE-TAIL-ONE-PARSER — ONE tail, from SpatialScopeTail.
      //
      // Two changes, both load-bearing:
      //  • the place tail is the SHARED `SPATIAL_TAIL_SRC` (groups 2/3/4), so
      //    `in` and `on` reach the same classifier and the level noun is
      //    consumed BEFORE the lazy phrase capture — which is what stopped
      //    "in level 2 width to 1.5m" leaking its "2" into the value and being
      //    read back as `width: 2` (the user had said 1.5).
      //  • the possessive moved from AFTER the tail (`(?:')?s?`, which ate the
      //    capture's trailing "s" and produced `roomRef: 'thi'` for "this
      //    floor") to the NOUN, which is where the apostrophe actually is.
      `^${DIM_VERB} (?:the )?(${SCOPE_ALL}|${SCOPE_SEL})(?: of)?(?: the)? (?:${nouns})s?(?:'s?)?` +
      SPATIAL_TAIL_SRC +
      `(?: (?:to|at|as|be|into))? (.+)$`,
    ),
  };
});

/**
 * Parse a scoped bulk-dimension sentence into its family intent, or null when no
 * family claims it. Filters are LIFTED FIRST (the U8.1 pre-strip), so "make all
 * windows smaller than 1 m² 1.2m high" composes with no extra grammar here.
 *
 * SHARED by the tier-0 grammar and the NL classifier — like
 * `parseWallColorIntent` — so the natural and rigid paths cannot understand the
 * same sentence differently.
 */
export function parseDimensionScopedIntent(
  text: string,
  ctx: ResolverContext | undefined,
  toMeters: (value: string, unit: string | undefined) => number,
): SemanticIntent | null {
  if (UNRESOLVED_QUALIFIER.test(text)) return null;
  if (OTHER_CAPABILITY_WORD.test(text)) return null;
  for (const { family, re } of COMPILED) {
    const lifted = parseFilterClauses(text, family.elementKind);
    const m = re.exec(lifted.stripped);
    if (m === null) continue;
    const scopeWord = m[1]!;
    // Groups 2/3/4 are `SPATIAL_TAIL_SRC`'s (leading level noun, phrase,
    // trailing level noun); group 5 is the value tail.
    const tail = readSpatialTail(m[2], joinTailPhrase(m[3], m[4]), ctx);
    const rest = m[5]!;

    const dims = extractDimensionBindings(rest, toMeters);
    // NO BINDING ⇒ this is not a dimension ask at all ("change all windows to
    // timber casement" lands here and must pass straight through).
    if (Object.keys(dims).length === 0) return null;

    const isAll = new RegExp(`^${SCOPE_ALL}$`).test(scopeWord);
    let base: 'all' | 'selection' | IntentSpatialScope;
    if (tail.kind === 'unusable') {
      // A place WAS named and cannot be resolved ("this floor" with no active
      // level). DECLINE — never fall back to 'all'. Widening a scope the user
      // deliberately restricted is exactly the mass-edit failure this family
      // exists to prevent (C68 §7.d).
      return null;
    } else if (tail.kind === 'scope') {
      // Spatial phrases compose with the ALL scope only — combining them with
      // "these/selected" would contradict the live selection, and that is not
      // claimed (the same ruling the colour and rake grammars made).
      if (!isAll) return null;
      base = tail.scope;
    } else {
      base = isAll ? 'all' : 'selection';
    }

    return {
      intent: family.intent,
      dims,
      scope: withDimensionFilters(base, lifted.filters),
    } as SemanticIntent;
  }
  return null;
}

function withDimensionFilters(
  base: 'all' | 'selection' | IntentSpatialScope,
  filters: readonly ElementFilter[],
): IntentScope {
  return filters.length === 0 ? base : { kind: 'filter', base, filters };
}
