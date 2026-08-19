// @pryzm/ai-host — CapabilityExecutionSpec (RAC Phase U4, the §56 scaling fix).
// =============================================================================
//
// WHY THIS EXISTS. Five of applySemanticIntent's case arms were near-identical
// transcriptions of ONE template: resolve the scope ("all" / the selection
// filtered to one element kind / a spatial ScopeDescriptor through the injected
// resolver), resolve the value against its declared value source (refusing by
// LISTING the real options, never guessing — §CONTEXT-DATA-HONESTY), then emit
// exactly one batch bus command with an honest scope label. Every new batch
// capability meant hand-copying ~60 lines of that template, which is the
// scaling wall U4 removes: a capability of this shape is now a TABLE ENTRY
// here plus its ChatCapabilityRegistry metadata — no new case arm.
//
// `applySemanticIntent` remains the ONE semantic authority: its switch routes
// every spec-driven intent to the single generic arm (`applyExecutionSpec`),
// and the SemanticIntent IR stays the boundary. This module is PURE — no DOM,
// no stores, no I/O; value resolvers are either pure tables (colorRef /
// finishRef / geometry-wall's exported rake bounds) or functions the caller
// injects via ResolverContext (the wall/window/door type catalogues).
//
// ── DELIBERATELY NOT SPEC-DRIVEN (the irregular arms stay hand-written) ──────
//
// • create-windows-parametric — creation, not mutation: two-mode payload
//   (count/spacing), stated-default sizing, overlap maths, Confirm-card
//   destructive flag. Its scope stage overlaps the template but the value and
//   payload stages share nothing with the batch-mutation shape.
// • duplicate-level / go-to-level / add-level — level-query resolution against
//   ctx.levels with all-or-nothing target semantics; no element scope at all.
// • set-rhino-material — whole-model reference content; no scope, a nullable
//   colour meaning "reset", and a bridge-side existence check.
// • create-wall — coordinate entry, not scoped mutation.
// • set-height/-thickness/-width/-sill/-riser/-tread/-room-height-offset,
//   set-dimensions, set-roof-pitch, set-room-number, rename-room,
//   delete-selected — the SELECTION-fan-out family (per-kind routing through
//   capabilityTargetRefusal, one command per selected element, compound-form
//   coupling); a different template, and one a later tranche could spec out
//   separately if a third instance of its shape ever appears.
// • undo/redo/zoom — local actions / trivial single commands.

import {
  isScopeError,
  type Compass4,
  type IntentScope,
  type IntentSpatialScope,
  type ScopeDescriptor,
} from './ScopeDescriptor.js';
import { describeFilters, filterRefusalCopy } from './FilterScope.js';
import { normalizeElementKind } from '../capabilities/ChatCapabilityRegistry.js';
import { exampleColorNames, resolveColorRef } from './colorRef.js';
import { finishRefusalCopy, resolveFinishRef } from './finishRef.js';
// §FEAT-CHAT-ROOM-OCCUPANCY — the room-use vocabulary, read off the same Zod
// enum RoomStore validates against (see roomOccupancyRef.ts's header).
import {
  allOccupancyNames,
  exampleOccupancyNames,
  resolveOccupancyRef,
  speakOccupancy,
} from './roomOccupancyRef.js';
// §L-905 — the auto-label rename plan (authored-name protection + next-free
// numbering), pure; consumed by set-room-occupancy's planFanOut.
import { planRoomOccupancyFanOut } from './roomAutoLabel.js';
// §FEAT-WALL-RAKE-BATCH — the rake bounds are the geometry package's exported
// constants, never re-typed (C65 §3.5: one policy, one place). Constants only;
// the purity note above still holds — no store instance is constructed here.
import { RAKE_MIN_DEG, RAKE_MAX_DEG } from '@pryzm/geometry-wall';
import {
  CATALOGUE_FAMILIES,
  catalogueFamilySpec,
  type CatalogueFamilyIntentId,
} from './CatalogueFamilies.js';
import {
  DELETE_FAMILIES,
  deleteFamilySpec,
  type DeleteFamilyIntentId,
} from './DeleteFamilies.js';
import {
  DIMENSION_FAMILIES,
  dimensionFamilySpec,
  type DimensionFamilyIntentId,
} from './DimensionFamilies.js';
import type {
  BusCommandRef,
  ResolverContext,
  SemanticApplication,
  SemanticIntent,
} from './ZeroTokenResolver.js';

// ─── The spec-driven intent universe ─────────────────────────────────────────

/** Compass letter → the word the summaries/refusals speak. */
export const COMPASS_WORD: Readonly<Record<Compass4, string>> = {
  N: 'north', S: 'south', E: 'east', W: 'west',
};

/** The intents executed by the generic arm. Adding an id here (plus its table
 *  entry below and its ChatCapabilityRegistry metadata) is the WHOLE resolver
 *  cost of a new batch-shaped capability. */
export type SpecDrivenIntentId =
  | 'set-wall-type'
  | 'set-wall-color'
  | 'set-wall-rake'
  | 'set-window-type'
  | 'set-door-type'
  // RAC U7.2 — the two catalogue families added as TABLE ENTRIES in
  // CatalogueFamilies.ts; nothing about them is written here by hand.
  | 'set-slab-type'
  | 'set-ceiling-type'
  // RAC U9.2 — the SAFE DESTRUCTIVE tranche, generated from DeleteFamilies.ts.
  // Nothing about them is written here by hand either; what makes them
  // different from every spec above is `destructive: true` +
  // `requireResolvedIds: true`, both set by the generator.
  | DeleteFamilyIntentId
  // §FEAT-BULK-DIMENSIONS (L-949) — the founder's "I want ALL elements dims to
  // be able to be changed", generated from DimensionFamilies.ts. What makes
  // these different from every spec above is that the VALUE is a set of
  // measurements rather than one reference, and that they are the first
  // non-delete specs to carry `destructive: true` + `requireResolvedIds: true`
  // — a mass RESIZE is not a gesture whose extent is obvious from the sentence,
  // so the Confirm card must state a real count before consent.
  | DimensionFamilyIntentId
  | 'add-wall-layer'
  // §FEAT-WALL-SIDE-FINISH — the founder's per-side finish ask. Sibling of
  // 'add-wall-layer', NOT a replacement: that one ADDS a construction layer
  // and moves wall.thickness; this changes appearance only and never moves
  // the wall. Both remain correct for their own ask.
  | 'set-wall-side-finish'
  // §FEAT-CHAT-ROOM-OCCUPANCY — the founder's "a bathroom in room 001". The
  // FIRST fan-out spec (`fanOutPerId`): the vocabulary and the scope stage are
  // the template's, but the bus verb it drives is singular, so see that flag's
  // doc for why this is N commands instead of one and what would make it one.
  | 'set-room-occupancy';

export type SpecDrivenIntent = Extract<SemanticIntent, { intent: SpecDrivenIntentId }>;

/** The scope forms a spec-driven intent may carry. Which forms a given
 *  capability's GRAMMAR can produce is that intent's business; the generic arm
 *  handles the superset with one implementation. RAC U8.1 added the `filter`
 *  arm — a base scope narrowed by predicates — and every capability got it for
 *  free, because the arm handles the superset. */
export type SpecScope = IntentScope;

// ─── The spec ────────────────────────────────────────────────────────────────

/** The value stage's outcome: an honest refusal (listing real options), or the
 *  resolved payload fields plus the summary builder. */
export type SpecValueOutcome =
  | {
      readonly refusal: {
        readonly reason: string;
        readonly suggestions: readonly string[];
      };
    }
  | {
      /** Value fields merged into the bus payload AFTER the ids field. */
      readonly payload: Readonly<Record<string, unknown>>;
      /** Builds the honest summary from the resolved scope label ("every wall
       *  in the project" / "3 selected walls" / "all 3 walls on Level 2") and
       *  the skip-notes tail (" (2× curtain-wall skipped: …)" or ''). */
      readonly summary: (scopeLabel: string, notesTail: string) => string;
    };

/**
 * One batch-shaped capability, as data. Scope discipline, refusal copy and the
 * payload/summary construction are all pinned byte-for-byte by the acceptance
 * suite — the generic arm interprets this record instead of a hand-written arm
 * re-stating it.
 */
export interface CapabilityExecutionSpec<I extends SpecDrivenIntent = SpecDrivenIntent> {
  /** The element kind this capability scopes over ('wall' | 'window' | 'door').
   *  Also the noun the scope labels and empty-scope refusals speak. */
  readonly elementKind: string;
  /** The batch bus command the capability dispatches — exactly one. */
  readonly busCommand: string;
  /** The payload field carrying `'all'` or the resolved id list. */
  readonly idsField: string;
  /** Refusal copy when the selection scope finds an EMPTY selection. */
  readonly noSelectionReason: string;
  /** Sentence head for a selection of the wrong kind(s) — completed as
   *  `${mismatchPrefix}, and the selection is ${kinds}. Nothing was changed.` */
  readonly mismatchPrefix: string;
  /** Suggestions offered by every scope-stage refusal. */
  readonly suggestions: readonly string[];
  /** Present iff the intent's grammar can produce spatial scopes. The string
   *  completes "… spatial scoping isn't wired into this chat context.
   *  I can ${spatialAbility}." */
  readonly spatialAbility?: string;
  /** Binds the intent's value fields to their value source — a pure table or
   *  an injected catalogue lookup — and builds payload + summary. */
  readonly resolveValue: (si: I, ctx: ResolverContext) => SpecValueOutcome;
  /** All current spec capabilities are reversible one-undo batches; kept
   *  explicit so a future destructive spec is a visible decision. */
  readonly destructive: boolean;
  /**
   * RAC U9.2 — the plural noun, when adding an "s" is wrong ("furnitures").
   * Absent ⇒ `${elementKind}s`, which is what every pre-U9 spec produced, so
   * the pinned acceptance copy is byte-identical.
   */
  readonly nounPlural?: string;
  /**
   * RAC U9.2 — forbid the unbounded `'all'` payload form.
   *
   * A non-destructive batch may send `idsField: 'all'` and let the command
   * enumerate: the outcome is one undo entry and an honest "Changed N of M"
   * report either way. A DESTRUCTIVE one may not, because the Confirm card is
   * shown BEFORE the command runs and "delete every window in the project"
   * with no number in it is a card that cannot be read. When this is set, an
   * `'all'` scope is resolved to real ids through `ctx.resolveScope` first —
   * and an ABSENT resolver refuses rather than widening, because widening is
   * exactly the failure the flag exists to prevent.
   */
  readonly requireResolvedIds?: boolean;
  /**
   * §FEAT-CHAT-ROOM-OCCUPANCY — emit ONE command PER resolved id instead of one
   * batch command, with `idsField` naming the SINGULAR payload field
   * (`'roomId'`, not `'roomIds'`).
   *
   * ⚠ THIS COSTS THE ONE-UNDO PROPERTY, AND THAT IS A DISCLOSED TRADE, NOT AN
   * OVERSIGHT. Every other spec in this table dispatches a single `*Batch`
   * verb, which is the ONLY thing that buys "one gesture = one undo entry"
   * (BatchCoordinator's own header: `runBatch` is undo-NEUTRAL). `room.setOccupancy`
   * is singular and there is no `room.setOccupancyBatch`, so N rooms are N
   * undo steps — which `dispatchCommands` already states out loud as
   * "undo with Ctrl+Z (N steps)", so the user is never misled about it.
   *
   * Minting the batch verb was deliberately NOT done in the same change: a new
   * bus verb requires a row in `docs/04-reference/API-VERB-REGISTER.md` or
   * `check-verb-register.ts` V1 hard-fails, and that register was being edited
   * by another lane at the time. Reusing the registered singular verb ships the
   * founder's sentence now; the batch verb is the follow-up that upgrades N
   * steps to one, and it changes only this flag and the table entry.
   *
   * Implies `requireResolvedIds`: fan-out over the unbounded `'all'` form is
   * not representable (there are no ids to fan over), so the spec resolves the
   * scope to real ids first and refuses if no resolver is injected.
   */
  readonly fanOutPerId?: true;
  /**
   * §FEAT-CHAT-ROOM-OCCUPANCY — the spatial scope kinds this capability really
   * accepts. Absent ⇒ all of them, which is what every pre-existing spec means.
   *
   * WHY IT EXISTS. The scope stage handles the SUPERSET (level / room /
   * orientation) with one implementation, so a new spec silently "honours"
   * scope kinds its grammar never produces and its declaration never claims.
   * For walls that is harmless breadth. For rooms it is WRONG: the editor's
   * orientation arm answers "facing south" with the WALLS that face south, so
   * `set-room-occupancy` scoped by orientation would fan `room.setOccupancy`
   * out over wall ids and refuse once per wall — reach that exists only as a
   * defect. C68 §6.3-G3 counts exactly this gap (arm reach minus declared
   * reach), and closing it here keeps the two honest in the direction that
   * makes the capability smaller and truer rather than merely quieter.
   */
  readonly spatialKinds?: readonly ('level' | 'room' | 'orientation')[];
  /**
   * §L-905 — a fan-out spec may PLAN its per-id commands instead of stamping
   * one identical payload per id: `set-room-occupancy` uses this to make the
   * room LABEL follow the use ("make room 003 a bedroom" also renames the
   * auto-default `Room 00-003` to `Bedroom 01`, in the SAME command so one
   * Ctrl+Z reverts both — C78 §12), while an AUTHORED name is protected and
   * the reply says so (C81 §2.2). The returned `notes` join the summary's
   * notes tail, so the reply states BOTH actions. Only consulted when
   * `fanOutPerId` is set; absent ⇒ the plain one-command-per-id stamp.
   */
  readonly planFanOut?: (
    ids: readonly string[],
    payload: Readonly<Record<string, unknown>>,
    ctx: ResolverContext,
  ) => {
    readonly commands: readonly BusCommandRef[];
    readonly notes: readonly string[];
  };
}

// ─── The table ───────────────────────────────────────────────────────────────

type SpecTable = {
  readonly [K in SpecDrivenIntentId]: CapabilityExecutionSpec<
    Extract<SpecDrivenIntent, { intent: K }>
  >;
};

export const EXECUTION_SPECS: SpecTable = {
  /**
   * §FEAT-CHAT-WALL-TYPE — "make all walls interior partition". The type
   * reference resolves through the INJECTED `ctx.resolveWallSystemType` (one
   * implementation: `resolveWallSystemTypeRef` in command-registry). Absent
   * injection forwards the raw string and the COMMAND does the resolution and
   * the refusing — never a silent mismatch.
   */
  'set-wall-type': {
    elementKind: 'wall',
    busCommand: 'wall.updateSystemTypeBatch',
    idsField: 'wallIds',
    noSelectionReason:
      'No walls are selected — select some walls, or say "change all walls to …" to retype the whole project.',
    mismatchPrefix: 'Wall types apply to walls',
    suggestions: ['change all walls to interior partition'],
    resolveValue: (si, ctx) => {
      let systemType = si.typeRef;
      let typeLabel = `"${si.typeRef}"`;
      if (ctx.resolveWallSystemType !== undefined) {
        const hit = ctx.resolveWallSystemType(si.typeRef);
        if (hit === null) {
          const names = ctx.wallSystemTypeNames ?? [];
          return {
            refusal: {
              reason: names.length === 0
                ? `I could not find a wall type called "${si.typeRef}" in this project.`
                : `There is no wall type called "${si.typeRef}" in this project. The wall types here are: ${names.join(', ')}.`,
              suggestions: names.slice(0, 2).map((n) => `change all walls to ${n.toLowerCase()}`),
            },
          };
        }
        systemType = hit.id;
        typeLabel = `"${hit.name}"`;
      }
      return {
        payload: { systemType },
        summary: (scopeLabel) => `Change ${scopeLabel} to ${typeLabel}`,
      };
    },
    // NOT destructive. A retype is one undo entry, it deletes nothing, and
    // the command already reports "Changed N of M — K skipped: <reason>"
    // per §CONTEXT-DATA-HONESTY. Gating it behind a Confirm card would put
    // a modal in front of the founder's exact sentence for no safety gain;
    // the reversible-and-reported path is the honest one.
    destructive: false,
  },

  /**
   * §FEAT-WALL-COLOR-BATCH (ADR-0314) — "make all walls white". ONE colour
   * table (colorRef.ts): a name or '#hex'; anything else refuses by LISTING
   * real options, never by guessing (§CONTEXT-DATA-HONESTY).
   */
  'set-wall-color': {
    elementKind: 'wall',
    busCommand: 'wall.updateColorBatch',
    idsField: 'wallIds',
    noSelectionReason:
      'No walls are selected — select some walls, or say "make all walls white" to recolour the whole project.',
    mismatchPrefix: 'Wall colour applies to walls',
    suggestions: ['make all walls white'],
    spatialAbility: 'change all walls or the selected walls',
    resolveValue: (si) => {
      const color = resolveColorRef(si.colorRef);
      if (color === null) {
        return {
          refusal: {
            reason:
              `I don't know the colour "${si.colorRef}". I understand names like ` +
              `${exampleColorNames().join(', ')} — or an exact hex value like #f4f1e8.`,
            suggestions: ['make all walls white', 'make all walls #f4f1e8'],
          },
        };
      }
      return {
        payload: { materialColor: color.hex },
        summary: (scopeLabel, notesTail) => `Paint ${scopeLabel} ${color.label}${notesTail}`,
      };
    },
    // NOT destructive — one undo entry, deletes nothing, and the command
    // reports "Recoloured N of M — K skipped" (same policy as set-wall-type).
    destructive: false,
  },

  /**
   * §FEAT-WALL-RAKE-BATCH — "make all walls angled by 70 degrees". Range
   * refusal with the geometry package's REAL bounds (never re-typed).
   * Per-wall shape refusals (curved / layered / hosting openings) belong to
   * the command's rakeAuthorability pass and arrive in its honest report.
   */
  'set-wall-rake': {
    elementKind: 'wall',
    busCommand: 'wall.updateRakeBatch',
    idsField: 'wallIds',
    noSelectionReason:
      'No walls are selected — select some walls, or say "make all walls angled by 70 degrees".',
    mismatchPrefix: 'The wall angle applies to walls',
    suggestions: ['make all walls angled by 70 degrees'],
    spatialAbility: 'angle all walls or the selected walls',
    resolveValue: (si) => {
      const deg = si.angleDeg;
      if (!Number.isFinite(deg) || deg < RAKE_MIN_DEG || deg > RAKE_MAX_DEG) {
        return {
          refusal: {
            reason:
              `A wall can lean between ${RAKE_MIN_DEG}° and ${RAKE_MAX_DEG}° ` +
              `(90° = vertical); ${deg}° is outside that range.`,
            suggestions: ['make all walls angled by 70 degrees', 'make all walls vertical'],
          },
        };
      }
      return {
        payload: { rakeAngleDeg: deg },
        summary: (scopeLabel, notesTail) =>
          `Lean ${scopeLabel} to ${deg}°${deg === 90 ? ' (vertical)' : ''}${notesTail}`,
      };
    },
    // NOT destructive — one undo entry, deletes nothing, and the command
    // reports "Raked N of M — K skipped" (same policy as the colour batch).
    destructive: false,
  },

  // ── RAC U7.2 — the CATALOGUE FAMILIES, generated ──────────────────────────
  //
  // window / door / slab / ceiling are ONE capability with four nouns: parse
  // "change all <noun>s to <ref>", resolve <ref> through the injected lookup
  // (the ONE `resolveCatalogueRef` ladder, editor-side), refuse by LISTING the
  // project's real type names, dispatch ONE batch verb. `catalogueFamilySpec`
  // builds each spec from its CatalogueFamilies.ts entry, so a fifth family is
  // a table row — not a spec literal, not a parser, not a matcher.
  //
  // The window and door literals that stood here were byte-identical to what
  // the factory produces (the acceptance suite pins the copy, and it did not
  // move); wall stays hand-written for the reason recorded in that table.
  // `Object.fromEntries` widens the key to `string`, which cannot satisfy the
  // exhaustive mapped type — the double cast is the seam where a GENERATED
  // family re-enters the hand-declared table. The generation is still checked:
  // `CatalogueFamilyIntentId` is a subset of `SpecDrivenIntentId` (a family id
  // absent from the union fails to compile), and the registry test asserts a
  // capability exists for every family.
  ...(Object.fromEntries(
    CATALOGUE_FAMILIES.map((f) => [f.intent, catalogueFamilySpec(f)]),
  ) as unknown as Pick<SpecTable, CatalogueFamilyIntentId>),

  // ── RAC U9.2 — the DELETE FAMILIES, generated ─────────────────────────────
  //
  // Scoped deletion ("delete all furniture in the kitchen"), which the chat
  // could not say at all: `delete-selected` only ever meant the thing already
  // clicked. Same generation seam as the catalogue families above, and the
  // same double check on it — `DeleteFamilyIntentId` is a subset of
  // `SpecDrivenIntentId`, and the registry test asserts a capability exists
  // for every family. What the generator ADDS is the safety contract these
  // are the first capabilities to need: `destructive: true` (Confirm card) and
  // `requireResolvedIds: true` (the card's number is a real count, never the
  // unbounded 'all' form). Both are set in ONE place — DeleteFamilies.ts —
  // so a fifth deletable kind cannot arrive without them.
  ...(Object.fromEntries(
    DELETE_FAMILIES.map((f) => [f.intent, deleteFamilySpec(f)]),
  ) as unknown as Pick<SpecTable, DeleteFamilyIntentId>),

  // ── §FEAT-BULK-DIMENSIONS (L-949) — the DIMENSION FAMILIES, generated ─────
  //
  // "make all windows 2 meters height" / "make all doors 2m wide by 1m high
  // with 0.1 sill" / "set all walls 3m high" — one or several dimensions over a
  // scope, as ONE undoable gesture. The chat could say NONE of these: every
  // dimension capability was selection-scoped and single-element, and the
  // all-scope guard in LocalNaturalLanguageResolver declined the sentence
  // rather than resize whatever happened to be selected.
  //
  // Same generation seam as the catalogue and delete families, and the same
  // double check on it — `DimensionFamilyIntentId` is a subset of
  // `SpecDrivenIntentId` (a family id absent from the union fails to compile),
  // and the registry test asserts a capability exists for every family. What
  // the generator ADDS is the (element kind x dimension) honesty contract: the
  // value stage consults the SINGLE form's own registry guard before accepting a
  // field, and refuses BY NAME any field this family's ONE batch verb cannot
  // carry. Both live in ONE place — DimensionFamilies.ts — so a fourth family
  // cannot arrive without them.
  ...(Object.fromEntries(
    DIMENSION_FAMILIES.map((f) => [f.intent, dimensionFamilySpec(f)]),
  ) as unknown as Pick<SpecTable, DimensionFamilyIntentId>),

  /**
   * §FEAT-WALL-LAYER-ADD-BATCH — "add a 10mm plaster layer to the inner side
   * of the selected wall". Honest completeness refusals: the intent is CLAIMED
   * even when thickness or finish is missing, so the answer is a concrete ask,
   * never an LLM guess. ONE finish table (finishRef.ts) — unknown names refuse
   * by LISTING real options, never by guessing (§CONTEXT-DATA-HONESTY).
   */
  /**
   * §FEAT-WALL-SIDE-FINISH — "change all walls in the kitchen finish plaster" /
   * "make all inner finishes walls in ground floor to limewash".
   *
   * ONE finish table (finishRef.ts, shared with add-wall-layer) — unknown names
   * refuse by LISTING real options, never by guessing (§CONTEXT-DATA-HONESTY).
   *
   * `roomScoped` is carried into the payload because the ROOM scope is the one
   * request shape that asks a GEOMETRIC question ("the face looking INTO room
   * X"). For a partition, BOTH faces are interior and which one faces the named
   * room is frontSide/backSide — never written in this build. The handler turns
   * that flag into per-wall bounding-room counts and the command refuses those
   * walls by name. The flag is computed HERE because `si.scope` is the only
   * place the scope KIND still exists; by the time the handler runs it has been
   * resolved to a flat id list.
   */
  'set-wall-side-finish': {
    elementKind: 'wall',
    busCommand: 'wall.setSideFinishBatch',
    idsField: 'wallIds',
    noSelectionReason:
      'No walls are selected — select some walls, or say "make all inner finishes walls on the ground floor to plaster".',
    mismatchPrefix: 'Wall finishes apply to walls',
    suggestions: [
      'make all inner finishes walls on the ground floor to plaster',
      'change all walls in the kitchen finish limewash',
    ],
    spatialAbility: 'change all walls, the walls on a level, or the walls in a room',
    spatialKinds: ['level', 'room'],
    resolveValue: (si) => {
      // §FIX-FINISH-VOCABULARY-IS-THE-CATALOGUE (L-1262) — ONE refusal copy,
      // stating the REAL vocabulary size and naming the candidates when the
      // words matched several. The old copy listed 39 nicknames as though they
      // were the inventory while 205 materials existed.
      const finish = si.finishRef === null ? null : resolveFinishRef(si.finishRef);
      if (finish === null) {
        return {
          refusal: {
            reason: finishRefusalCopy(si.finishRef),
            suggestions: ['make all inner finishes walls on the ground floor to plaster'],
          },
        };
      }
      const base = si.scope !== 'all' && si.scope !== 'selection' && si.scope.kind === 'filter'
        ? si.scope.base
        : si.scope;
      const roomScoped = base !== 'all' && base !== 'selection' && base.kind === 'room';
      return {
        payload: {
          side: si.side,
          finish: {
            materialId: finish.materialId,
            materialColor: finish.materialColor,
            materialName: finish.name,
          },
          roomScoped,
        },
        summary: (scopeLabel, notesTail) =>
          `Set the ${si.side} finish of ${scopeLabel} to ${finish.name}${notesTail}`,
      };
    },
    // NOT destructive — one undo entry, deletes nothing, moves nothing, and the
    // command reports "Set the … finish on N of M walls — K skipped".
    destructive: false,
  },

  'add-wall-layer': {
    elementKind: 'wall',
    busCommand: 'wall.addLayerBatch',
    idsField: 'wallIds',
    noSelectionReason:
      'No walls are selected — select a wall, or say "add a 10mm plaster layer to all walls".',
    mismatchPrefix: 'Finish layers apply to walls',
    suggestions: ['add a 10mm plaster layer to the inner side of the selected wall'],
    // §FIX-LAYER-SCOPE-UNDECLARED (L-1263) — the grammar can now produce these,
    // so the arm may honour them. Declared NARROW: a wall layer has no facade
    // orientation reading the grammar can produce.
    spatialAbility: 'add a layer to all walls, the selected walls, the walls on a level, or the walls in a room',
    spatialKinds: ['level', 'room'],
    resolveValue: (si) => {
      if (si.thicknessM === null) {
        // ⭐ §FIX-LAYER-ASK-REPAINTED (L-1260) — WHY THIS REFUSES RATHER THAN
        //   DEFAULTING, decided by MEASUREMENT and not by preference.
        //
        //   The founder's *"make all walls interior layer finish X"* names no
        //   thickness, and a layer MOVES `wall.thickness`. Option (b) — take a
        //   declared per-finish default from the catalogue — was checked and is
        //   NOT AVAILABLE: `MaterialRecord` carries id, label, category, color,
        //   metalness, roughness, opacity, transparent, textureUrl, source —
        //   and **no thickness field at all** (`packages/schemas/src/materials/
        //   materialRecord.ts`). A 10 mm invented here would be a number with no
        //   source, silently thickening every wall in the building by it.
        //
        //   So it refuses, and per C16 CA-18 it names the LIVE ALTERNATIVE —
        //   including the appearance-only sibling, which is very likely what a
        //   user who omitted the thickness actually wanted.
        return {
          refusal: {
            reason:
              'A finish LAYER has a thickness, and adding one makes the wall thicker — so I ' +
              'will not guess it. Say "add a 10mm plaster layer to all walls". If you meant to ' +
              'change how the wall LOOKS without making it thicker, say "make all walls ' +
              'interior finish plaster" instead.',
            suggestions: [
              'add a 10mm plaster layer to all walls',
              'make all walls interior finish plaster',
            ],
          },
        };
      }
      const finish = si.finishRef === null ? null : resolveFinishRef(si.finishRef);
      if (finish === null) {
        return {
          refusal: {
            reason: finishRefusalCopy(si.finishRef),
            suggestions: ['add a 10mm plaster layer to all walls'],
          },
        };
      }
      const thicknessM = si.thicknessM;
      const mm = Number((thicknessM * 1000).toFixed(3));
      return {
        payload: {
          side: si.side,
          thickness: thicknessM,
          name: finish.name,
          materialColor: finish.materialColor,
          materialId: finish.materialId,
        },
        // ⛔ §FIX-LAYER-ASK-REPAINTED (L-1260) — THE CARD MUST SAY THE WALL GETS
        //   THICKER, AND BY HOW MUCH. This capability's entire difference from
        //   `set-wall-side-finish` is that it MOVES `wall.thickness`
        //   (§03-WALL-THICKNESS-CONTRACT §1), and the old summary — "Add a 10mm
        //   plaster layer to the interior side of every wall" — never said so.
        //   A user reading it could reasonably believe he was choosing a
        //   surface. Silently thickening every wall in a building is the worst
        //   outcome available here, so the consequence is stated BEFORE consent,
        //   not discovered afterwards in a dimension.
        summary: (scopeLabel) =>
          `Add a ${mm}mm ${finish.name} layer to the ${si.side} side of ${scopeLabel} — ` +
          `this makes each of those walls ${mm}mm thicker.`,
      };
    },
    // NOT destructive — one undo entry; the command reports "Added … to
    // N of M walls — K skipped" (raked walls skip with the gate's reason).
    destructive: false,
  },

  /**
   * §FEAT-CHAT-ROOM-OCCUPANCY — the founder's sentence, verbatim: "i want a
   * bathroom in the room 001". Assigns a room's USE, the field the Room
   * Schedule shows as OCCUPANCY and every row of the founder's screenshot
   * carried as `unclassified`.
   *
   * The value resolves through `roomOccupancyRef`, whose vocabulary IS the Zod
   * enum `RoomStore.update()` validates against — so the chat can never accept
   * a word the store then rejects. An unknown word refuses by LISTING real
   * options and changes nothing (§CONTEXT-DATA-HONESTY); it never guesses,
   * because a confidently wrong room assignment is worse than a question.
   *
   * Scope: the SELECTION, or the U3 room reference ("room 001"). Deliberately
   * NOT `'all'` — "make every room in the project a bathroom" is not a sentence
   * with a correct answer, and omitting it also keeps the mass-edit gate's
   * one-command rule inapplicable to a fan-out spec.
   */
  'set-room-occupancy': {
    elementKind: 'room',
    busCommand: 'room.setOccupancy',
    // SINGULAR — this is a fan-out spec; see `fanOutPerId`.
    idsField: 'roomId',
    noSelectionReason:
      'No room is selected — select a room, or name it, as in "make room 001 a bathroom".',
    mismatchPrefix: 'Room use applies to rooms',
    suggestions: ['make room 001 a bathroom', 'set room 002 to bedroom'],
    spatialAbility: 'set the use of the selected room, or of a room you name — "make room 001 a bathroom"',
    resolveValue: (si) => {
      const occupancy = resolveOccupancyRef(si.occupancyRef);
      if (occupancy === null) {
        return {
          refusal: {
            reason:
              `I don't know the room use "${si.occupancyRef}". I understand uses like ` +
              `${exampleOccupancyNames().join(', ')} — there are ` +
              `${allOccupancyNames().length} in total, and nothing was changed.`,
            suggestions: ['make room 001 a bathroom', 'set room 002 to bedroom'],
          },
        };
      }
      return {
        // The handler's payload field is `occupancy` (SetRoomOccupancyPayload);
        // it maps '' / undefined to 'unclassified' and forwards the rest to
        // SetRoomOccupancyCommand, which writes RoomData.occupancyType.
        payload: { occupancy },
        summary: (scopeLabel, notesTail) =>
          `Set ${scopeLabel} to ${speakOccupancy(occupancy)}${notesTail}`,
      };
    },
    // NOT destructive: it deletes nothing and every step is undoable
    // (SetRoomOccupancyCommand snapshots the WHOLE RoomData before writing,
    // because occupancy also drives colour and finish defaults).
    destructive: false,
    // One `room.setOccupancy` per resolved room — see the flag's doc for the
    // disclosed undo-granularity trade and the batch verb that closes it.
    fanOutPerId: true,
    // §L-905 — the LABEL follows the use. Auto-default names (`Room 00-003`,
    // matched against the RoomNumbering minting pattern exactly) rename to
    // `Bedroom 01` (next free index on the level) IN THE SAME `room.rename`
    // command as the occupancy, so each room stays one undo step; authored
    // names are kept and the note says so. No snapshot ⇒ occupancy-only,
    // the pre-L-905 shape. Decision logic: roomAutoLabel.ts (pure, tested).
    planFanOut: (ids, payload, ctx) =>
      planRoomOccupancyFanOut(ids, String(payload['occupancy'] ?? ''), ctx.rooms),
    // ROOM ONLY. A room has no facade orientation, and "rooms on level 2" is a
    // real ask this capability's grammar cannot yet produce — so neither is
    // claimed, and the arm refuses both instead of quietly honouring them.
    spatialKinds: ['room'],
  },

};

// ─── The generic arm ─────────────────────────────────────────────────────────

type Refusal = Extract<SemanticApplication, { kind: 'refusal' }>;

/** The words a base scope is spoken as — shared by the summary label, the
 *  "spatial scoping isn't wired" refusal and the U8.3 filter refusal, so the
 *  three can never describe the same scope differently. */
function spatialPhrase(base: 'all' | 'selection' | IntentSpatialScope): string {
  if (base === 'all') return '';
  if (base === 'selection') return 'in the selection';
  return base.kind === 'level'
    ? `on level ${base.levelQuery}`
    : base.kind === 'room'
      ? `in the ${base.roomRef}`
      : `facing ${COMPASS_WORD[base.orientation]}`;
}

/** The ONE selection-scope refusal copy: empty selection vs wrong kind. */
function selectionRefusal(
  spec: CapabilityExecutionSpec<SpecDrivenIntent>,
  ctx: ResolverContext,
): string {
  const kinds = [...new Set(ctx.selection.map((s) => normalizeElementKind(s.elementType)))];
  return kinds.length === 0
    ? spec.noSelectionReason
    : `${spec.mismatchPrefix}, and the selection is ${kinds.join(' + ')}. Nothing was changed.`;
}

/**
 * The ONE generic executor for spec-driven batch capabilities, called from
 * `applySemanticIntent`'s switch (which remains the single semantic
 * authority). Stage order is the template's: scope first ("the selected walls"
 * must never silently become "all walls"), then value, then one bus command
 * with the honest scope label.
 */
export function applyExecutionSpec(
  si: SpecDrivenIntent,
  ctx: ResolverContext,
): SemanticApplication {
  const spec = EXECUTION_SPECS[si.intent] as CapabilityExecutionSpec<SpecDrivenIntent>;
  const kind = spec.elementKind;
  /** The noun in the plural the capability speaks — "furniture", not
   *  "furnitures". Defaults to the pre-U9 `${kind}s`. */
  const plural = (n: number): string =>
    n === 1 ? kind : (spec.nounPlural ?? `${kind}s`);
  const refuse = (reason: string, suggestions: readonly string[] = spec.suggestions): Refusal => ({
    kind: 'refusal',
    intent: si.intent,
    reason,
    suggestions,
  });

  // ── Scope stage ────────────────────────────────────────────────────────────
  // Widened to the full SpecScope union: which forms a given intent's grammar
  // can produce is that intent's business; the arm handles the superset once.
  const scope = si.scope as SpecScope;
  let ids: readonly string[] | 'all';
  let scopeLabelOverride: string | null = null;
  const scopeNotes: string[] = [];
  if (typeof scope === 'object') {
    // ADR-0315 U3 — spatially scoped sentences ("on level 2" / "in the
    // kitchen" / "facing south"); RAC U8 — the same, narrowed by predicates
    // ("… larger than 2 m²"). Resolution happens ONCE through the injected
    // resolver; its absence refuses honestly, never guesses.
    const base: 'all' | 'selection' | IntentSpatialScope =
      scope.kind === 'filter' ? scope.base : scope;
    // §FEAT-CHAT-ROOM-OCCUPANCY — a spec may narrow the superset the arm
    // handles to the spatial kinds it can answer correctly. Refuses rather than
    // resolving a scope whose ids would be the wrong element kind entirely.
    if (
      base !== 'all' && base !== 'selection'
      && spec.spatialKinds !== undefined && !spec.spatialKinds.includes(base.kind)
    ) {
      return refuse(
        `I can't scope ${spec.nounPlural ?? `${kind}s`} that way. ` +
        `I can ${spec.spatialAbility ?? `change the selected ${kind}s`}.`,
      );
    }
    const basePhrase = spatialPhrase(base);
    const filterPhrase = scope.kind === 'filter' ? describeFilters(scope.filters) : '';
    const phrase = [basePhrase, filterPhrase].filter((p) => p.length > 0).join(' ');
    if (ctx.resolveScope === undefined) {
      return refuse(
        `I can't resolve "${phrase}" here — spatial scoping isn't wired ` +
        `into this chat context. I can ${spec.spatialAbility ?? `change all ${kind}s or the selected ${kind}s`}.`,
      );
    }
    // A filter over the SELECTION never bypasses the selection's own gate:
    // an empty or wrong-kind selection refuses with the capability's copy
    // BEFORE anything is filtered (a filtered sentence may never reach a
    // capability a plain one would be refused for).
    let baseDescriptor: ScopeDescriptor;
    if (base === 'selection') {
      const matches = ctx.selection.filter((s) => normalizeElementKind(s.elementType) === kind);
      if (matches.length === 0) return refuse(selectionRefusal(spec, ctx));
      baseDescriptor = { kind: 'ids', ids: matches.map((s) => s.elementId) };
    } else if (base === 'all') {
      baseDescriptor = { kind: 'all', elementKind: kind };
    } else if (base.kind === 'level') {
      baseDescriptor = { kind: 'level', levelQuery: base.levelQuery, elementKind: kind };
    } else if (base.kind === 'room') {
      baseDescriptor = { kind: 'room', roomRef: base.roomRef, elementKind: kind };
    } else {
      baseDescriptor = { kind: 'orientation', orientation: base.orientation };
    }
    const descriptor: ScopeDescriptor = scope.kind === 'filter'
      ? { kind: 'filter', base: baseDescriptor, filters: scope.filters, elementKind: kind }
      : baseDescriptor;
    const result = ctx.resolveScope(descriptor);
    if (isScopeError(result)) {
      return refuse(result.error);
    }
    if (result.ids.length === 0) {
      // U8.3 — a filter that matched nothing quotes the REAL extremum, so the
      // user learns the model instead of only hearing "no".
      return refuse(
        scope.kind === 'filter'
          ? filterRefusalCopy(kind, scope.filters, result.filterStats ?? [], basePhrase)
          : `There are no ${kind}s ${phrase} — nothing was changed.`,
      );
    }
    ids = result.ids;
    const where = result.diagnostics[0]
      ?? (basePhrase.length > 0 ? basePhrase.replace(/^on |^in the /, '') : '');
    const n = result.ids.length;
    const head = base === 'all' || base === 'selection'
      ? (base === 'all' ? `all ${n} ${plural(n)}` : `${n} selected ${plural(n)}`)
      : base.kind === 'orientation'
        ? `all ${n} ${where} ${plural(n)}`
        : `all ${n} ${plural(n)} ${base.kind === 'level' ? 'on' : 'bounding'} ${where}`;
    scopeLabelOverride = filterPhrase.length > 0 ? `${head} ${filterPhrase}` : head;
    for (const s of result.skipped) {
      scopeNotes.push(`${s.count}× ${s.kind} skipped: ${s.reason}`);
    }
  } else if (scope === 'selection') {
    const matches = ctx.selection.filter((s) => normalizeElementKind(s.elementType) === kind);
    if (matches.length === 0) return refuse(selectionRefusal(spec, ctx));
    ids = matches.map((s) => s.elementId);
  } else if (spec.requireResolvedIds === true || spec.fanOutPerId === true) {
    // RAC U9.2 — a destructive capability may not dispatch the unbounded
    // 'all' form: the Confirm card has to state a COUNT before the user
    // agrees to it. Resolve the project-wide scope to real ids here, and
    // refuse if the resolver is absent rather than silently widening.
    if (ctx.resolveScope === undefined) {
      return refuse(
        spec.fanOutPerId === true
          // §FEAT-CHAT-ROOM-OCCUPANCY — a fan-out spec has no unbounded form to
          // fall back to: with no resolver there are no ids to fan over, so it
          // refuses rather than widening (the same discipline, different reason
          // from the destructive one below — the delete copy would be a lie here).
          ? `I can't list every ${spec.nounPlural ?? `${kind}s`} here — scope resolution isn't wired ` +
            `into this chat context. Select the ${kind} you mean and say it again.`
          : `I can't count every ${kind} here — scope resolution isn't wired into this chat ` +
            `context, and I won't run a delete without telling you how many first.`,
      );
    }
    const result = ctx.resolveScope({ kind: 'all', elementKind: kind });
    if (isScopeError(result)) return refuse(result.error);
    if (result.ids.length === 0) {
      return refuse(`There are no ${spec.nounPlural ?? `${kind}s`} in this project — nothing was changed.`);
    }
    ids = result.ids;
    scopeLabelOverride = `all ${result.ids.length} ${plural(result.ids.length)} in the project`;
  } else {
    ids = 'all';
  }

  // ── Value stage ────────────────────────────────────────────────────────────
  const value = spec.resolveValue(si, ctx);
  if ('refusal' in value) {
    return refuse(value.refusal.reason, value.refusal.suggestions);
  }

  // ── Command + honest summary ───────────────────────────────────────────────
  const scopeLabel = scopeLabelOverride !== null
    ? scopeLabelOverride
    : ids === 'all'
      ? `every ${kind} in the project`
      : `${ids.length} selected ${plural(ids.length)}`;
  // §FEAT-CHAT-ROOM-OCCUPANCY — the fan-out form: one command per resolved id,
  // `idsField` naming the SINGULAR payload field. `ids` is guaranteed to be a
  // real array here because `fanOutPerId` takes the resolve-first branch above.
  // §L-905 — a spec with `planFanOut` decides its per-id commands itself (the
  // room auto-label rename); its notes join the summary's notes tail so the
  // reply states everything that will happen, not only the occupancy.
  let fanOutNotes: readonly string[] = [];
  let commands: readonly BusCommandRef[];
  if (spec.fanOutPerId === true && ids !== 'all') {
    if (spec.planFanOut !== undefined) {
      const plan = spec.planFanOut(ids, value.payload, ctx);
      commands = plan.commands;
      fanOutNotes = plan.notes;
    } else {
      commands = ids.map((id) => ({
        type: spec.busCommand,
        payload: { [spec.idsField]: id, ...value.payload },
      }));
    }
  } else {
    commands = [{
      type: spec.busCommand,
      payload: {
        [spec.idsField]: ids === 'all' ? 'all' : [...ids],
        ...value.payload,
      },
    }];
  }
  const allNotes = [...scopeNotes, ...fanOutNotes];
  const notesTail = allNotes.length > 0 ? ` (${allNotes.join(' · ')})` : '';
  return {
    kind: 'commands',
    intent: si.intent,
    summary: value.summary(scopeLabel, notesTail),
    commands,
    destructive: spec.destructive,
  };
}
