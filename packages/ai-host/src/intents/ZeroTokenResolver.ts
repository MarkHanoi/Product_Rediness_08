// @pryzm/ai-host — Zero-token chat command resolver (ADR-0313).
//
// Tier 0: deterministic grammar over normalized utterances → bus commands /
//         local actions / explicit refusals. 0 tokens.
// Tier 1: synonym + bounded-Levenshtein typo normalization, then tier 0 again.
//         0 tokens.
// NL layer (ADR-0313 §Natural language): LocalNaturalLanguageResolver reduces
//         naturally-phrased utterances to the SemanticIntent IR defined HERE,
//         and `applySemanticIntent` below remains the ONLY authority that
//         turns semantics into safe commands / local actions / refusals.
// Tier 2 (LLM fallback) is NOT here — a `miss` result is the seam where the
// caller falls through to the existing aiService path.
//
// PURITY: this module reads no DOM, no stores, does no I/O. The caller
// injects everything (selection, levels, id minter) via ResolverContext and
// executes the returned commands itself (P6: through the command bus).
//
// HONESTY (§CONTEXT-DATA-HONESTY): when an intent is RECOGNIZED but cannot be
// safely completed (no selection, unknown level, missing coordinates) the
// resolver returns `refusal` with a concrete human reason — never a guess,
// never a silent miss. `refusal` deliberately does NOT fall through to the
// LLM: guessing at a recognized-but-underspecified intent (especially a
// destructive one) is worse than saying why we stopped.
//
// P8: the exported entry points carry OTel spans (`pryzm.ai.chat.resolve`,
// `pryzm.ai.chat.dispatch`) — 2 bounded span names.

import { trace, type Tracer, type SpanOptions } from '@opentelemetry/api';
import {
  capabilityAppliesTo,
  normalizeElementKind,
  resolveChatCapability,
} from '../capabilities/ChatCapabilityRegistry.js';
import {
  describeCapabilitiesFor,
  descriptiveReportReason,
  propertyRemovalReason,
  visibilityMisreadReason,
} from '../capabilities/CapabilityRefusal.js';
// RAC U4 — the spec-driven capability interpreter: batch-shaped capabilities
// are TABLE ENTRIES in CapabilityExecutionSpec.ts, executed by the ONE generic
// arm below (the switch's default). applySemanticIntent remains the single
// semantic authority; the spec file holds data, not a second dispatcher.
import { applyExecutionSpec, type SpecDrivenIntent } from './CapabilityExecutionSpec.js';
// §FEAT-CHAT-TOOL-ACTIVATION (L-906) — "create a bed" activates the palette's
// own placement tool. The grammar's noun extraction and the local-action
// builder live in their own thin module; resolution against the REAL creation
// matrix + furniture catalogue happens editor-side (one ladder, C69).
import {
  applyActivatePlacement,
  parsePlacementRef,
  type PlacementLocalDispatch,
} from './PlacementActivation.js';
// §FEAT-CHAT-ROOM-OCCUPANCY — the GRAMMAR's room-use recognizer. Used only to
// decide whether an ambiguous utterance is claim-able; the authoritative
// resolution (and its refusal copy) belongs to the spec's value stage.
import { resolveOccupancyRef } from './roomOccupancyRef.js';
// §GATE-VIS-INTENT (VIS-CLASS) — the visibility family module. Value
// dependency runs ONE way (this file → VisibilityIntents); that module
// imports only TYPES back, so there is no load-order cycle.
import { applyVisibilityIntent, asVisibilityIntent } from './VisibilityIntents.js';
// §FEAT-RAC-PROPERTY-QUERY (L-2210) — the READ half of "all dims and properties
// should be queryable AND executable". Same seam as VisibilityIntents: the value
// dependency runs ONE way (this file → PropertyQuery), which imports only TYPES
// back, so there is no load-order cycle. Its element-kind lists are not its own
// either — every row reads them off the mirrored EXECUTE capability's `targets`,
// so a property the chat can SET is a property the chat can REPORT, by
// construction rather than by two tables agreeing.
import {
  applyPropertyQuery,
  asPropertyQueryIntent,
  matchPropertyQuery,
  type PropertyReader,
} from './PropertyQuery.js';
// §L-1032 — the LEVEL-CHANGE family module, on exactly the same seam as
// VisibilityIntents: the value dependency runs ONE way (this file → that
// module), which imports only TYPES back, so there is no load-order cycle. Its
// element-family table is not its own — it reads `LEVEL_CHANGE_VERBS` /
// `LEVEL_CHANGE_REFUSALS` out of `@pryzm/command-bus`, the L1 register the
// property panel and the L3 event bridge read too (C84 EI-9).
import {
  applyMoveToLevelIntent,
  asMoveToLevelIntent,
  levelChangeKnownKinds,
} from './LevelChangeIntents.js';
// RAC U7.2 — catalogue families (window / door / slab / ceiling) are TABLE
// ENTRIES: one record generates both the CapabilityExecutionSpec and the
// grammar below. Adding a family costs zero lines in this file.
import { CATALOGUE_FAMILIES, type CatalogueLookup } from './CatalogueFamilies.js';
// §FEAT-CHAT-BARE-TREAD (L-1443) — THE accept-set for stair geometry, shared
// with the sketch tool and the create command (StairGeometryLimits.ts, lane
// STAIR1). The chat speaks its refusal verbatim rather than re-phrasing a
// bound, so the two layers cannot drift about a number.
import { checkStairGeometry, resolveStairGeometryLimits } from '@pryzm/geometry-stair';
// §REFUSE-STAIR-SPAN / §REFUSE-STAIR-RUN (L-1444) — the two founder sentences
// the pipeline cannot build. Shipped as GRAMMAR + REFUSAL rather than left as
// a miss, because a miss says "I didn't understand" when the truth is
// "I understood exactly, and here is the command that does not exist".
import {
  applyStairPartRefusal,
  applyStairSpanRefusal,
  parseStairPartIntent,
  parseStairSpanIntent,
} from './StairNotYet.js';
// §FEAT-RAC-STAIR-SHAPE (L-1541) — the founder's "create stair in L shape …".
// ⭐ A FEATURE, not a third refusal: the shape axis SHIPPED on the tool (C98 §16,
// 2026-08-19) and was reachable from the palette and from nowhere else. Refusing
// it would have been C84 §4F.5's named "WRONG-REFUSAL DEFECT CLASS — a
// correct-looking refusal for a capability that EXISTS".
import {
  applyCreateStairShape,
  parseCreateStairShapeIntent,
} from './StairCreateShape.js';
// §REFUSE-RAC-REPLICATE (L-1542) — "create same stair in ground in level 1".
// Copy-by-reference has no command underneath it on ANY element kind (measured;
// see the module header's route table), so this is an honest refusal that
// resolves the level it CAN resolve and names the live floor-plate route.
import {
  applyReplicateElementRefusal,
  parseReplicateElementIntent,
} from './ElementReplication.js';
// RAC U9.2 — delete families (furniture / window / door / column) are TABLE
// ENTRIES on exactly the same seam: one record generates the spec AND the
// grammar. The only line this file spends on the whole family is the matcher
// below, which delegates to the generated parser.
import { parseDeleteScopedIntent, type DeleteFamilyIntentId } from './DeleteFamilies.js';
// §FEAT-BULK-DIMENSIONS (L-949) — the DIMENSION FAMILIES: shared grammar +
// generated specs, so the tier-0 path and the NL classifier read one parser.
import {
  parseDimensionScopedIntent,
  // §FIX-RAKE-SWALLOWED-AS-TYPE (L-1370) — the ONE rake/orientation word set,
  // IMPORTED rather than re-typed. The dimension grammar has declined these
  // since it was written ("a near-miss must never resolve as a resize:
  // rake/pitch carry numbers too"); the TYPE grammars below never did, which is
  // how "raked 90 dregress" was answered as a wall-type lookup.
  OTHER_CAPABILITY_WORD,
  type DimensionAsk,
} from './DimensionFamilies.js';
// §FIX-SCOPE-TAIL-ONE-PARSER (L-1201) — THE one place that decides whether a
// preposition phrase names a LEVEL or a ROOM. See that module's header for why
// three hand-written spellings of it existed and what each one cost.
import {
  parseTrailingSpatialScope,
  parseInlineSpatialPhrase,
  stripTrailingLevelNoun,
  // §FIX-RAKE-SCOPE-TAIL (L-1372) — the rake grammar carried the FOURTH
  // hand-written spelling of the scope tail, so "in level 3" resolved to a ROOM
  // called "level" there while it had already been fixed everywhere else.
  SPATIAL_TAIL_SRC,
  readSpatialTail,
  joinTailPhrase,
  // §RAC-APARTMENT-IN-ROOM (L-1641) — the span-returning trailing matcher, so
  // the apartment grammar can CONSUME its place phrase(s) through the ONE
  // shared parser instead of writing a fifth spelling of the tail.
  matchTrailingSpatialScope,
} from './SpatialScopeTail.js';
// §RAC-APARTMENT-IN-ROOM (L-1640) — THE room-number ladder (number tiers
// strictest-first, whole-name fallback with an ambiguity guard), shared with
// the editor bridge. Names drift from numbers (founder-observed), so display
// names never decide alone.
import { resolveSingleRoomRef, describeRoomRow } from './roomNumberMatch.js';
// RAC U7.1 — the property vocabulary: a chat-drivable panel field is a TABLE
// ENTRY in PropertyVocabulary.ts (noun + synonyms, the kinds that really accept
// it, the live route per kind, bounds), executed by the ONE generic property arm
// and matched by the ONE generic property grammar. Adding a property costs zero
// lines here — these four references are the whole resolver-side wiring.
import {
  applyPropertyIntent,
  asPropertyIntent,
  matchPropertyUtterance,
  type PropertyDrivenIntentId,
} from './PropertyVocabulary.js';
import { exampleColorNames, resolveColorRef } from './colorRef.js';
// resolveFinishRef is the GRAMMAR's finish recognizer (word-window scan);
// the refusal copy (exampleFinishNames) moved into CapabilityExecutionSpec.
import { finishRefCandidates, resolveFinishRef } from './finishRef.js';
// §FEAT-WALL-SIDE-FINISH — the per-side finish grammar, in its own pure module.
import { parseWallSideFinishIntent, LAYER_NOUN, type WallSideFinishIntent } from './WallSideFinishIntent';
// §FEAT-FLOOR-SURFACE-FINISH (L-1881) — the FLOOR twin, its own grammar for the
// reason recorded in that file: a floor has no interior/exterior side.
import { parseFloorFinishIntent, type FloorFinishIntent } from './FloorFinishIntent';
import {
  isScopeError,
  type Compass4,
  type ElementFilter,
  type IntentScope,
  type IntentSpatialScope,
  type ScopeDescriptor,
  type ScopeResult,
} from './ScopeDescriptor.js';
import { parseFilterClauses } from './FilterScope.js';
// §L-905 — the room snapshot row the auto-label rename decision reads; the
// decision itself lives in roomAutoLabel.ts (pure) and is exercised by the
// set-room-occupancy spec in CapabilityExecutionSpec.ts.
import type { RoomLabelRow } from './roomAutoLabel.js';

export type { RoomLabelRow } from './roomAutoLabel.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ResolverSelection {
  readonly elementId: string;
  readonly elementType: string; // normalized lowercase, e.g. 'wall' | 'door' | 'window' | 'room'
}

export interface ResolverLevel {
  readonly id: string;
  readonly name: string;
  readonly elevation?: number;
}

/** A wall system type as the resolver needs to see it — id for the payload,
 *  name for honest human copy. Deliberately structural, not the real
 *  `WallSystemType`: the resolver stays at L2 with no command-registry import. */
export interface ResolverWallSystemType {
  readonly id: string;
  readonly name: string;
}

export interface ResolverContext {
  /** Current selection (empty array = nothing selected). */
  readonly selection: readonly ResolverSelection[];
  readonly activeLevelId?: string;
  readonly levels: readonly ResolverLevel[];
  /** Id minter for commands whose payload REQUIRES an id (level.add). */
  readonly mintId: () => string;
  /**
   * §L-905 — a snapshot of the project's rooms (id, name, roomNumber, levelId),
   * injected by the editor so `set-room-occupancy` can decide the auto-label
   * rename PURELY (authored-name protection + next-free numbering live in
   * roomAutoLabel.ts). ABSENT means the label follow-through is silently off —
   * the capability degrades to occupancy-only, exactly its pre-L-905 shape, and
   * the reply then claims nothing about names.
   */
  readonly rooms?: readonly RoomLabelRow[];
  /**
   * §FEAT-CHAT-WALL-TYPE — the forgiving wall-type lookup, INJECTED.
   *
   * The value source for the `set-wall-type` capability's parameter is the
   * project's wall-type catalogue, and there is exactly ONE implementation of
   * that lookup: `resolveWallSystemTypeRef` in
   * `packages/command-registry/src/walls/UpdateWallsSystemTypeBatchCommand.ts`
   * (exact id → exact name → case-insensitive trimmed name). The resolver must
   * stay pure and must not import it, so the bridge injects it here. Writing a
   * second matcher inside the resolver would have re-created the two-sources-of-
   * truth defect this whole change exists to remove.
   *
   * When absent (headless/tests) the raw user string is forwarded and the
   * COMMAND does the resolution and the refusing — never a silent mismatch.
   */
  readonly resolveWallSystemType?: (ref: string) => ResolverWallSystemType | null;
  /** Catalogue names, so an unresolvable type refuses by LISTING the real
   *  options instead of inventing syntax (§CONTEXT-DATA-HONESTY). */
  readonly wallSystemTypeNames?: readonly string[];
  /** §FEAT-WINDOW-TYPE-BATCH — the window twin of the wall-type injection:
   *  `resolveWindowSystemTypeRef` (command-registry) via the bridge; the
   *  resolver stays pure. Absent ⇒ the raw ref is forwarded and the COMMAND
   *  resolves and refuses — never a silent mismatch. */
  readonly resolveWindowSystemType?: (ref: string) => ResolverWallSystemType | null;
  readonly windowSystemTypeNames?: readonly string[];
  /** §FEAT-DOOR-TYPE-BATCH (RAC U4.3) — the door twin of the window-type
   *  injection: `resolveDoorSystemTypeRef` (command-registry) via the bridge;
   *  the resolver stays pure. Absent ⇒ the raw ref is forwarded and the
   *  COMMAND resolves and refuses — never a silent mismatch. */
  readonly resolveDoorSystemType?: (ref: string) => ResolverWallSystemType | null;
  readonly doorSystemTypeNames?: readonly string[];
  /**
   * RAC U7.2 — the GENERIC catalogue channel, keyed by element kind. The three
   * named injections above predate it and stay for compatibility; every
   * catalogue family added from U7.2 on arrives here, so a new family costs
   * ZERO lines in this interface (the wall/window/door pattern would have cost
   * two fields each, forever). Same discipline as before: absent ⇒ the raw ref
   * is forwarded and the COMMAND resolves and refuses — never a silent
   * mismatch, never a guess.
   */
  readonly catalogues?: Readonly<Record<string, CatalogueLookup>>;
  /**
   * ADR-0315 U3.2 — the injected SCOPE RESOLVER (F2). Turns a ScopeDescriptor
   * into authoritative element ids ONCE, editor-side, over indexed paths
   * (storeRegistry / getByLevel / room predicates / θ-threaded facades). The
   * resolver stays pure; absence means scoped asks refuse honestly ("scope
   * resolution isn't available here"), never guess.
   */
  readonly resolveScope?: (scope: ScopeDescriptor) => ScopeResult;
  /**
   * §GATE-VIS-READONLY (VIS-CLASS, 2026-08-11) — the read-only visibility
   * question's DATA, injected as a snapshot by the bridge from
   * `runtime.visibility.intent` (the per-view `ViewVisibilityIntentStore`
   * composed in `composeRuntime` §4d-bis).
   *
   * ABSENT means UNREADABLE, and the answer says so — it is never conflated
   * with "nothing is hidden" (§CONTEXT-DATA-HONESTY: failure and empty are
   * different values). The resolver READS this and never writes anything.
   */
  readonly visibility?: VisibilityIntentSnapshot;
  /**
   * §FEAT-RAC-PROPERTY-QUERY (L-2210) — the injected AUTHORITATIVE-STORE READER
   * behind "how tall is this wall?".
   *
   * It reads the SAME record the matching write lands in, by the SAME field
   * name, which is the only thing that makes an answer a claim about what the
   * user will see rather than about a parallel copy. (This repository holds two
   * record worlds per family — the L0 Zod schema re-exported as the plugin DTO,
   * and the geometry / core-app-model record the fragment builders, the IFC
   * exporter and persistence actually read. `initBusHandlers.ts:1160-1168`
   * records what happens when a write picks the wrong one.)
   *
   * ABSENT means UNREADABLE and the answer says so — never conflated with "no
   * value" and never with 0 (§CONTEXT-DATA-HONESTY). The resolver READS this and
   * never writes anything.
   */
  readonly readProperty?: PropertyReader;
}

/** What the read-only visibility capability may truthfully report about the
 *  ACTIVE view. Counts, not ids: the snapshot answers "is anything hidden and
 *  how much", and says out loud what it cannot name. */
export interface VisibilityIntentSnapshot {
  /** Elements in the active view's wave-9 explicit hide set. */
  readonly hiddenCount: number;
  /** Wave-8 ad-hoc isolation — active even over an empty set (bug #8901). */
  readonly isolationActive: boolean;
  /** Elements inside the active isolation (0 when inactive OR empty-set). */
  readonly isolationCount: number;
}

export interface BusCommandRef {
  readonly type: string;
  readonly payload: Record<string, unknown>;
}

/**
 * §GATE-VIS-INTENT (VIS-CLASS) — 'applyVisibilityIntent' and 'answer' joined
 * 2026-08-11:
 *
 *  • 'applyVisibilityIntent' — the bridge dispatches the resolution's
 *    `visibility.busCommand` through `runtime.bus` (the handlers are registered
 *    by the COMPOSITION ROOT, composeRuntime §4d-bis, not by any handler file)
 *    and then projects the intent onto the scene, mirroring SpatialTree's
 *    write-then-project gesture. It is carried as a local action, not as
 *    `kind: 'commands'`, for two stated reasons: (1) the generic dispatch path
 *    appends "undo with Ctrl+Z", which is a LIE for visibility intents
 *    (`affectedStores: []` — no patches, no undo entry); (2) the coverage
 *    gate's registration scan reads handler FILES and cannot see compose-root
 *    registrations, so a truthful `busCommand` declaration would be reported
 *    as a phantom.
 *  • 'answer' — the READ-ONLY class (§GATE-QUERYENGINE-READ-ONLY): the summary
 *    IS the answer; the bridge dispatches NOTHING and mutates NOTHING.
 */
export type ZeroTokenLocalAction =
  | 'undo' | 'redo' | 'setActiveLevel' | 'applyVisibilityIntent' | 'answer'
  // §FEAT-CHAT-TOOL-ACTIVATION (L-906) — 'activateTool': the bridge resolves
  // `placement.itemRef` against the REAL creation matrix + furniture catalogue
  // (editor-side, ONE resolveCatalogueRef ladder) and activates the SAME
  // placement tool the palette button activates. Carried as a local action,
  // not `kind: 'commands'`: nothing is dispatched and nothing mutates — the
  // user places via the existing mouse preview, and the mutation flows
  // through the command path only when they click (P6, C83 §4.2).
  | 'activateTool';

/** The three compose-root-registered visibility intent commands the chat can
 *  reach today. `visibility.set.transparency` and `visibility.edge.toggle`
 *  exist too and are deliberately NOT claimed (no grammar, no capability). */
export type VisibilityIntentBusCommand =
  | 'visibility.hide.selection'
  | 'visibility.isolate.selection'
  | 'visibility.reveal.all';

/** The payload a 'applyVisibilityIntent' local action asks the bridge to
 *  dispatch. One command, ids explicit, so the bridge invents nothing. */
export interface VisibilityLocalDispatch {
  readonly busCommand: VisibilityIntentBusCommand;
  readonly elementIds: readonly string[];
}

export type ZeroTokenResolution =
  | {
      readonly kind: 'commands';
      readonly intent: string;
      readonly tier: 0 | 1 | 'nl';
      readonly summary: string;
      readonly commands: readonly BusCommandRef[];
      readonly destructive: boolean;
      /** §PLAN (RAC U6) — set only for a compound plan; see PlanReport. */
      readonly plan?: PlanReport;
    }
  | {
      readonly kind: 'local';
      readonly intent: string;
      readonly tier: 0 | 1 | 'nl';
      readonly summary: string;
      readonly action: ZeroTokenLocalAction;
      /** For setActiveLevel. */
      readonly levelId?: string;
      readonly levelName?: string;
      /** For applyVisibilityIntent — the ONE bus command the bridge dispatches. */
      readonly visibility?: VisibilityLocalDispatch;
      /** For activateTool (L-906) — the raw item reference the bridge resolves
       *  against the creation matrix + catalogue and activates. */
      readonly placement?: PlacementLocalDispatch;
    }
  | {
      readonly kind: 'refusal';
      readonly intent: string;
      readonly reason: string;
      readonly suggestions: readonly string[];
    }
  | { readonly kind: 'miss' };

// ─── Tracing (P8) ────────────────────────────────────────────────────────────

const TRACER_NAME = '@pryzm/ai-host';
let cachedTracer: Tracer | null = null;
function tracer(): Tracer {
  cachedTracer ??= trace.getTracer(TRACER_NAME, '0.1.0');
  return cachedTracer;
}

/** P8 span helper for the DISPATCH side — the editor bridge wraps its bus
 *  dispatch in this so the execution of a zero-token resolution is a span
 *  (`pryzm.ai.chat.dispatch`) even though the bridge lives in the app layer
 *  which does not depend on @opentelemetry/api directly. */
export function withChatDispatchSpan<T>(
  fn: () => T | Promise<T>,
  attrs?: SpanOptions['attributes'],
): T | Promise<T> {
  const spanOpts: SpanOptions = attrs !== undefined ? { attributes: attrs } : {};
  return tracer().startActiveSpan('pryzm.ai.chat.dispatch', spanOpts, async (span) => {
    try {
      const result = await fn();
      span.end();
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.end();
      throw err;
    }
  }) as T | Promise<T>;
}

// ─── Length parsing ──────────────────────────────────────────────────────────
//
// "3m" | "200mm" | "30cm" | "2.5" → meters. A bare number > 20 is treated as
// millimeters ("2700" → 2.7 m) because nobody asks for a 2700-meter wall;
// otherwise meters. (ADR-0313 §Units.)

const LEN_SRC = String.raw`(-?\d+(?:[.,]\d+)?)\s*(millimet(?:er|re)s?|centimet(?:er|re)s?|met(?:er|re)s?|mm|cm|m)?\b`;

function toMeters(valueStr: string, unit: string | undefined): number {
  const v = parseFloat(valueStr.replace(',', '.'));
  if (unit === undefined || unit === '') return v > 20 ? v / 1000 : v;
  if (unit.startsWith('mm') || unit.startsWith('millimet')) return v / 1000;
  if (unit.startsWith('cm') || unit.startsWith('centimet')) return v / 100;
  return v; // m / meter / metre
}

/** The ADR-0313 unit rule, exported for the NL layer (ONE source of truth):
 *  explicit mm/cm/m convert; a bare number > 20 is millimeters, else meters. */
export function lengthToMeters(valueStr: string, unit: string | undefined): number {
  return toMeters(valueStr, unit);
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

// ─── Normalization ───────────────────────────────────────────────────────────

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[!?.]+$/g, '')
    .replace(/^\s*(please|pls|hey|ok)\s+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Tier-1 vocabulary: synonyms + typo correction ───────────────────────────

const SYNONYMS: Readonly<Record<string, string>> = {
  remove: 'delete',
  erase: 'delete',
  del: 'delete',
  trash: 'delete',
  storey: 'level',
  story: 'level',
  floor: 'level',
  floors: 'levels',
  switch: 'go',
  jump: 'go',
  navigate: 'go',
  it: 'this',
  that: 'this',
  current: 'selected',
};

/** Words the grammar actually keys on — the typo-correction target set. */
const VOCAB: readonly string[] = [
  'delete', 'selected', 'selection', 'this', 'element', 'wall', 'door',
  'window', 'room', 'slab', 'roof', 'level', 'height', 'width', 'thickness',
  'sill', 'pitch', 'number', 'ceiling', 'stair', 'riser', 'tread', 'depth',
  'offset', 'create', 'draw', 'add',
  'make', 'set', 'change', 'rename', 'go',
  'to', 'from', 'tall', 'thick', 'wide', 'undo', 'redo', 'zoom', 'fit', 'frame',
  // §GATE-VIS-INTENT — the visibility vocabulary. Without these, the typo
  // corrector REWROTE the verbs ("hide it" → "wide this" at distance 1) and
  // the tier-1 forms could never reach the visibility grammars. Listed AFTER
  // 'wide' deliberately: ties (e.g. 'side', distance 1 to both 'wide' and
  // 'hide') keep resolving to the earlier entry, so no existing correction
  // changes.
  'hide', 'unhide', 'isolate', 'reveal', 'hidden', 'visible', 'isolation',
];

/**
 * §FIX-CHAT-STOPWORD-CORRECTION (founder P0, 2026-08-10, second repro).
 *
 * "Created Aparment with 2 bedrooms and 1 bathroom" was answered with
 * *"Nothing is selected — select an element first, then set its width."* The
 * sentence contains no width: bounded-Levenshtein typo correction rewrote the
 * FUNCTION WORD "with" into the domain term "width" (edit distance 1, and
 * "width" is in both correction vocabularies), after which the set-width
 * grammar claimed a past-tense sentence about something that had already
 * happened.
 *
 * The guard is surgical, and the asymmetry is the whole point: "aparment" →
 * "apartment" is exactly what tier-1 exists to do, while "with" → "width" is
 * never a repair — "with" is already a correctly spelled English word doing a
 * grammatical job. A token that IS a common function word is therefore
 * immutable, whatever its edit distance to a domain term. Only words with no
 * domain meaning of their own are listed: "this", "that", "set", "make",
 * "add", "high", "wide" and friends are real grammar vocabulary and are
 * deliberately absent.
 *
 * Shared by BOTH correctors (tier-1 here, and the NL layer's `typoCorrect`) so
 * the two tiers cannot disagree about what a word means.
 */
const PROTECTED_FUNCTION_WORDS: ReadonlySet<string> = new Set([
  'with', 'without', 'within', 'from', 'into', 'onto', 'upon', 'over',
  'under', 'above', 'below', 'between', 'through', 'during', 'after',
  'before', 'than', 'then', 'they', 'them', 'their', 'there', 'these',
  'those', 'here', 'what', 'when', 'where', 'which', 'while', 'whose',
  'will', 'would', 'could', 'should', 'shall', 'must', 'might', 'have',
  'having', 'been', 'being', 'does', 'doing', 'done', 'also', 'just',
  'only', 'very', 'some', 'such', 'same', 'each', 'every', 'many',
  'much', 'more', 'most', 'other', 'another', 'about', 'again',
  'against', 'because', 'both', 'once', 'ours', 'yours', 'your', 'mine',
  'like', 'want', 'need', 'please', 'thanks', 'thank', 'sure', 'okay',
  'yeah', 'well', 'still', 'even', 'ever', 'never', 'none', 'nothing',
  'something', 'anything', 'everything', 'somewhere', 'anywhere',
]);

/** True when a token is a correctly spelled English function word and must
 *  therefore never be rewritten into a domain term (§FIX-CHAT-STOPWORD-
 *  CORRECTION). Exported so the NL layer's corrector shares ONE list. */
export function isProtectedFunctionWord(token: string): boolean {
  return PROTECTED_FUNCTION_WORDS.has(token);
}

function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0]!;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
      if (curr[j]! < rowMin) rowMin = curr[j]!;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]!;
  }
  return prev[b.length]!;
}

/** Bounded Levenshtein distance (early exit above `max`), exported for the
 *  NL layer's typo correction — one implementation, two vocabularies. */
export function boundedLevenshtein(a: string, b: string, max: number): number {
  return levenshtein(a, b, max);
}

/** Synonym-map + typo-correct each token against the grammar vocabulary.
 *  Numbers, units and parenthesized coordinates pass through untouched. */
function tier1Normalize(text: string): string {
  return text
    .split(' ')
    .map((tok) => {
      const mapped = SYNONYMS[tok];
      if (mapped !== undefined) return mapped;
      if (VOCAB.includes(tok)) return tok;
      // §FIX-CHAT-STOPWORD-CORRECTION — "with" is not a misspelling of "width".
      if (isProtectedFunctionWord(tok)) return tok;
      if (/[\d(),]/.test(tok) || tok.length < 4) return tok; // numbers/short words: leave alone
      const budget = tok.length > 5 ? 2 : 1;
      let best: string | null = null;
      let bestD = budget + 1;
      for (const v of VOCAB) {
        const d = levenshtein(tok, v, budget);
        if (d < bestD) { bestD = d; best = v; }
      }
      return bestD <= budget && best !== null ? best : tok;
    })
    .join(' ');
}

// ─── Semantic intents — the shared IR (ADR-0313 §NL layer) ───────────────────
//
// The tier-0/1 grammar AND the NL layer both reduce utterances to this
// discriminated union; `applySemanticIntent` is the ONE place semantics become
// safe commands / local actions / refusals. The NL layer produces semantics
// ONLY — it never builds commands and never dispatches.

export interface WallPoint2 {
  readonly x: number;
  readonly z: number;
}

export type SemanticIntent =
  | { readonly intent: 'undo' }
  | { readonly intent: 'redo' }
  | { readonly intent: 'zoom-fit' }
  | { readonly intent: 'zoom-selected' }
  | { readonly intent: 'delete-selected'; readonly noun?: string }
  /**
   * §GATE-VIS-INTENT (VIS-CLASS, 2026-08-11) — the visibility-intent family.
   * SELECTION-scoped by grammar, deliberately: "hide all walls", "hide level
   * 2" and "isolate level 2" stay honest MISSES so they reach the LIVE legacy
   * QueryEngine visibility handlers (`pryzm-visibility-command` →
   * UnifiedBrowserPanel) — see applyVisibilityIntent's header for the routing
   * evidence. `noun` is the element noun the user said, guarded against the
   * selection exactly like delete-selected.
   */
  | { readonly intent: 'hide-selection'; readonly noun?: string }
  | { readonly intent: 'isolate-selection'; readonly noun?: string }
  /** `onlySelection` marks a PER-ELEMENT unhide ask ("unhide this wall"),
   *  which has NO bus carrier (`visibility.unhide.selection` is not a
   *  registered command) and is refused honestly, offering "reveal all". */
  | { readonly intent: 'reveal-all'; readonly onlySelection?: true }
  /** §GATE-QUERYENGINE-READ-ONLY — the read-only visibility question. */
  | { readonly intent: 'visibility-query'; readonly topic: 'hidden' | 'levels' }
  /** §FEAT-RAC-PROPERTY-QUERY (L-2210) — the read-only DIMENSION question. The
   *  second member of the read-only class, and the one the founder's "all dims
   *  and properties should be QUERYABLE" names. `property` is a
   *  `PROPERTY_QUERY_ROWS` id; the row's element kinds are the mirrored EXECUTE
   *  capability's `targets`, so ask-ability and set-ability are ONE claim. */
  | { readonly intent: 'property-query'; readonly property: string }
  | { readonly intent: 'set-height'; readonly value: number }
  | { readonly intent: 'set-thickness'; readonly value: number }
  /** §FEAT-CHAT-SYMMETRY (2026-08-10) — ONE width intent for every element kind
   *  whose editor command really takes a width (door / window / stair), routed
   *  per kind in applySemanticIntent. The old id `set-door-width` encoded the
   *  accident that doors got wired first. */
  | { readonly intent: 'set-width'; readonly value: number }
  | { readonly intent: 'set-sill-height'; readonly value: number }
  /** RAC U7.1 — every PROPERTY VOCABULARY entry, as one intent shape. Which
   *  ids exist, which element kinds each reaches, its live route per kind and
   *  its bounds are all declared in PropertyVocabulary.ts; this union member is
   *  the only line the IR spends on the whole family, however many properties
   *  the table grows to. */
  // ⭐ §FEAT-REVEAL-DIRECTION-RAC (L-3414) — `string` joined `number` here because the
  // vocabulary gained its first ENUM property. Every numeric row is unaffected: the enum
  // arm in `applyPropertyIntent` returns before any stage that reads it as a quantity.
  | { readonly intent: PropertyDrivenIntentId; readonly value: number | string }
  /** ADR-0315 P1 — stair riser height, on the LIVE stair.updateParameters
   *  carrier (STAIR_CONSTRAINTS-validated by the command). */
  | { readonly intent: 'set-riser-height'; readonly value: number }
  /** ADR-0315 P1 — stair tread depth ("going"), same live carrier. Tread
   *  COUNT deliberately does not exist: UpdateStairParametersCommand has no
   *  numRisers field, so that ask has no live route (G-class gap). */
  | { readonly intent: 'set-tread-depth'; readonly value: number }
  /** ADR-0315 P1 — room height offset, on the LIVE room.setHeightOffset
   *  commandManager bridge (range-guarded [-10, 10] m by the handler). */
  | { readonly intent: 'set-room-height-offset'; readonly value: number }
  /** §FEAT-CHAT-SYMMETRY — roof pitch in DEGREES as architects say it; the
   *  command (`roof.setPitch`) takes radians and the conversion lives in ONE
   *  place, applySemanticIntent. */
  | { readonly intent: 'set-roof-pitch'; readonly degrees: number }
  /** §FEAT-CHAT-SYMMETRY — room number, the sibling of rename-room. */
  | { readonly intent: 'set-room-number'; readonly number?: string }
  /**
   * §FEAT-CHAT-ROOM-OCCUPANCY — a room's USE (the Room Schedule's OCCUPANCY
   * column), the founder's "i want a bathroom in the room 001".
   *
   * SPEC-DRIVEN: executed by `applyExecutionSpec`'s fan-out arm through the
   * `default:` route, so it adds NO case arm here. `occupancyRef` is the raw
   * spoken word — resolution against the canonical vocabulary happens in the
   * spec's value stage, never in the grammar, so one utterance shape and one
   * refusal copy serve every room use.
   */
  | {
      readonly intent: 'set-room-occupancy';
      readonly occupancyRef: string;
      readonly scope?: IntentScope;
    }
  /**
   * §FEAT-CHAT-TOOL-ACTIVATION (L-906) — "create a bed" / "place a sofa" /
   * "add a wardrobe": activate the SAME placement tool the palette button
   * activates, for ALL placeable elements. `itemRef` is the RAW spoken noun —
   * resolution against the creation matrix + furniture catalogue happens in
   * the editor bridge through the ONE resolveCatalogueRef ladder (C69), never
   * in the grammar. Routed through the `default:` arm — no new case arm
   * (coverage-gate check 8, 27/27).
   */
  | { readonly intent: 'activate-placement'; readonly itemRef: string }
  /**
   * §FIX-CHAT-COMPOUND-DIMENSIONS (2026-08-10) — live production repro.
   *
   * "Make this window 2 meters height, 2 meters width and 0.1 meters sill
   * height" must become ONE dispatch carrying all the values, never a sequence
   * of per-parameter commands. Window/door openings are RE-MINTED with new ids
   * when their host wall rebuilds — which the FIRST dimension change triggers —
   * so any later command in a sequence would address a dead id
   * ("window not found: b0a84065-…", reported by the founder on build
   * 70667276). One command = one rebuild = no stale-id window, and one undo.
   *
   * Every field is guarded by the capability that owns it (set-height /
   * set-width / set-thickness / set-sill-height), so the compound form can
   * never claim a property the single form would refuse.
   */
  | {
      readonly intent: 'set-dimensions';
      readonly height?: number;
      readonly width?: number;
      readonly thickness?: number;
      readonly sillHeight?: number;
    }
  /** RAC U9.2 — the SAFE DESTRUCTIVE tranche: scoped deletion, one union
   *  member for the whole family however many kinds DeleteFamilies.ts lists.
   *  It carries only a scope, because a delete has no value to resolve; what
   *  makes it safe is declared in the table (Confirm card + a REAL resolved
   *  count), not here. */
  | { readonly intent: DeleteFamilyIntentId; readonly scope: IntentScope }
  | { readonly intent: 'go-to-level'; readonly levelQuery: string }
  | { readonly intent: 'add-level'; readonly elevation?: number }
  /**
   * ADR-0315 U5a — "Duplicate the ground floor to levels 2, 3 and 4."
   *
   * Rides the SHIPPED DuplicateFloorPlanCommand (deterministic dup-ids, full
   * undo, validated) whose only blocker was "needs a target-level picker" —
   * which conversation is. The honest report matters: the command clones
   * walls+openings+doors+windows, slabs, columns and furniture; it does NOT
   * clone rooms, room-bounding lines, ceilings, roofs, stairs, curtain walls
   * or lighting — the summary says so out loud.
   */
  | {
      readonly intent: 'duplicate-level';
      readonly sourceQuery: string;
      readonly targetQueries: readonly string[];
    }
  /**
   * §L-1032 — "move the slab to level 2" / "change this wall's level to Ground"
   * / "move slab from Level 1 to Level 2" (the founder's three phrasings).
   *
   * The FAMILY table is `LEVEL_CHANGE_VERBS` / `LEVEL_CHANGE_REFUSALS` in
   * `@pryzm/command-bus`; the arm is `LevelChangeIntents.applyMoveToLevelIntent`
   * and it answers THREE ways — dispatch, the family's declared refusal
   * (a door belongs to its host wall), or an honest "I don't know" for a family
   * in neither table.
   */
  | {
      readonly intent: 'move-to-level';
      /** The DESTINATION, as said. Resolved by `findLevel` — the same authority
       *  `go-to-level` and `duplicate-level` use; never a second matcher. */
      readonly levelQuery: string;
      /** A STATED origin ("…from Level 1"). It is not a filter: the selection
       *  carries no level, so the arm resolves it, reports it as the user's own
       *  statement, and never claims to have verified it. */
      readonly fromLevelQuery?: string;
      /** The element noun the user said ("slab"), if any. It decides the family
       *  verdict BEFORE the selection is consulted, so "move this door to level
       *  2" answers why a door has no storey even with nothing selected. */
      readonly nounRef?: string;
      /** The user said "all"/"every". The arm moves the SELECTION and nothing
       *  else, so this REFUSES by name rather than quietly narrowing the ask —
       *  reading "all walls" as "the one selected wall" and reporting success is
       *  the §L-995…L-998 over-claim. */
      readonly projectScopeAsked?: true;
    }
  | {
      readonly intent: 'create-wall';
      readonly start?: WallPoint2;
      readonly end?: WallPoint2;
      readonly height?: number;
      readonly thickness?: number;
    }
  | { readonly intent: 'rename-room'; readonly name?: string }
  /**
   * §FEAT-CHAT-WALL-TYPE — "make all walls interior partition".
   *
   * The capability whose absence proved the point: `wall.updateSystemTypeBatch`
   * shipped in c1902a5a, the chat shipped in 48750f9c, and the founder's
   * sentence reached neither. `scope` is explicit because "all walls" and "the
   * selected walls" are genuinely different asks and guessing between them on a
   * project-wide retype is not acceptable.
   */
  | {
      readonly intent: 'set-wall-type';
      /** Type id OR name, as the user said it — resolved by the injected
       *  `ctx.resolveWallSystemType`, or by the command when absent. */
      readonly typeRef: string;
      /** RAC U8.1 widened this to the full `IntentScope`: spatial and FILTER
       *  scopes ("all walls thicker than 300 mm on level 2") are handled by
       *  the ONE generic arm, so a capability gains them without a case arm. */
      readonly scope: IntentScope;
    }
  /**
   * §FEAT-WALL-SIDE-FINISH — the founder's "change / make all walls in room X
   * finish wall Y" and "make all inner finishes walls in ground floor to X".
   *
   * `side` is the SEMANTIC side (the axis WallLayerFunction already declares),
   * never the geometric frontSide/backSide — those have zero writers repo-wide.
   * The shape is declared in WallSideFinishIntent.ts and re-stated here only
   * because this union is spelled out literally (same as the dimension family).
   */
  | WallSideFinishIntent
  /**
   * §FEAT-FLOOR-SURFACE-FINISH (L-1881) — the founder's "finish to wooden
   * parquet" (2026-08-21), which the product answered *"Floor surface finish
   * isn't connected to chat yet"*. That refusal was honest; this is the route.
   * Declared in FloorFinishIntent.ts and re-stated here only because this union
   * is spelled out literally.
   */
  | FloorFinishIntent
  /**
   * §FEAT-WALL-COLOR-BATCH (ADR-0314) — "make all walls white".
   *
   * The founder's declared next ask after the type batch, and the GAP-C case
   * study: the batch primitive (`wall.updateColorBatch`) had to be BUILT — the
   * shapely `wall.bulkSetVisuals` writes a detached DTO store nothing renders.
   * Same explicit-scope discipline as `set-wall-type`: "all/every" ⇒ project,
   * "these/selected" ⇒ selection, no scope word ⇒ never claimed.
   */
  | {
      readonly intent: 'set-wall-color';
      /** Colour name ("white", "light grey") or '#hex', resolved by the ONE
       *  colour table in colorRef.ts inside applySemanticIntent. */
      readonly colorRef: string;
      /** ADR-0315 U3 — spatially scoped consumers: "make all walls on level 2
       *  white" / "paint all walls in the kitchen white" / "paint all
       *  south-facing walls white". RAC U8.1 adds the FILTER arm: "paint all
       *  walls thicker than 300 mm on level 2 white". Object forms are
       *  resolved by the injected ctx.resolveScope; absence refuses honestly. */
      readonly scope: IntentScope;
    }
  /**
   * §FEAT-RHINO-CHAT-MATERIAL — "change all elements of the rhino model to
   * white" / "reset the rhino model materials".
   *
   * The imported Rhino model is REFERENCE content: THREE meshes in a tagged
   * scene group, not elements in any geometry store — so this does not ride a
   * per-element command family. It dispatches the app-registered
   * `rhino.setMaterial` / `rhino.resetMaterial` bridges (initBusHandlers.ts),
   * which apply ONE shared override material across the model (or restore the
   * as-imported materials) as a single undoable commandManager entry. The
   * bridge reports honestly via 'pryzm-rhino-material-report' — including
   * "no Rhino model is imported", which the pure resolver cannot know.
   */
  | {
      readonly intent: 'set-rhino-material';
      /** Colour name / '#hex' (the ONE table in colorRef.ts), or null to
       *  restore the model's original (as-imported) materials. */
      readonly colorRef: string | null;
    }
  /**
   * §FEAT-WALL-RAKE-BATCH (ADR-0315, founder ask #1) — "make the selected
   * walls angled by 70" / "make all walls on the ground floor angled by 60" /
   * "make all walls angled by 120 degrees" / "make all walls vertical".
   *
   * Dispatches `wall.updateRakeBatch` (ONE undo entry). Per-wall refusals —
   * curved / layered / opening-hosting walls cannot lean — are judged by the
   * COMMAND through geometry-wall's `rakeAuthorability` single gate and
   * reported honestly ("Raked N of M — K skipped"); the resolver owns only
   * the phrase→angle mapping and the range refusal.
   */
  | {
      readonly intent: 'set-wall-rake';
      /** Target lean in degrees; 90 = vertical. Range [RAKE_MIN_DEG, RAKE_MAX_DEG]. */
      readonly angleDeg: number;
      /**
       * §FIX-RAKE-UNIT-UNRECOGNISED (L-1371) — the UNIT the user typed that this
       * grammar does not know ("raked 90 **dregress**"). Present ⇒ the sentence
       * is RECOGNISED-BUT-UNDERSPECIFIED and the value stage refuses by NAMING
       * it, instead of the sentence falling through to the wall-type grammar and
       * being answered as a catalogue miss. Absent ⇒ the unit was `°`/degrees/
       * deg or omitted, and `angleDeg` is authoritative.
       */
      readonly unitRef?: string | undefined;
      /** RAC U8.1 — the full IntentScope (spatial + filter), one generic arm. */
      readonly scope: IntentScope;
    }
  /**
   * §FEAT-SLAB-TYPE-BATCH / §FEAT-CEILING-TYPE-BATCH (RAC U7.2) — "change all
   * slabs to RC 250" / "change all ceilings to suspended act 600x600". Both
   * are CATALOGUE FAMILY table entries (CatalogueFamilies.ts): the spec, the
   * grammar and the refusal copy are generated, and each dispatches ONE batch
   * verb whose children are the live layer commands against the geometry
   * stores the builders read — never a plugin DTO store (L-620).
   */
  | {
      readonly intent: 'set-slab-type' | 'set-ceiling-type';
      readonly typeRef: string;
      readonly scope: IntentScope;
    }
  /**
   * §FEAT-CHAT-STAIR-TYPES (L-1441) — the founder's *"Make all the stairs type
   * X"* and *"Make all the stair railings type X"*. TWO families sharing one
   * arm shape, and the pair is the point: a stair and its railings are
   * different elements with different stores, different commands and different
   * catalogues, separated in the user's sentence by ONE WORD. The grammar's
   * collision guard lives on the table row (CatalogueFamilies.ts), where the
   * route it protects is declared.
   *
   * ⚠ Unlike the four rows above, these FAN OUT: neither
   * `stair.updateParameters` nor `element.changeType` has a batch twin, so N
   * stairs are N undo steps and `dispatchCommands` says so out loud. The trade
   * is disclosed on `CatalogueFamily.fanOutPerId`.
   */
  | {
      readonly intent: 'set-stair-type' | 'set-stair-railing-type';
      readonly typeRef: string;
      readonly scope: IntentScope;
    }
  /**
   * §FEAT-CHAT-LIGHTING-TYPES (L-10220) — the founder's *"change all lightings
   * in ground level to X"*.
   *
   * Same arm shape, same table, same fan-out trade as the stair pair:
   * `element.changeType` has no batch twin, so N fixtures are N undo steps and
   * `dispatchCommands` says so out loud.
   *
   * ⭐ The LEVEL half of his sentence is why this entry is worth reading. It
   * was not a lighting gap — the shared scope tail had never been wired into
   * this table's grammar factory at all, so "in ground level" leaked into the
   * type reference for every catalogue family. See §FIX-HOSTED-TYPE-SCOPE-TAIL
   * in `makeHostedTypeParser`.
   */
  | {
      readonly intent: 'set-lighting-type';
      readonly typeRef: string;
      readonly scope: IntentScope;
    }
  /**
   * §REFUSE-STAIR-SPAN (L-1444) — "create a stair from ground to level 5
   * connected to this wall — in L shape". Parsed IN ORDER TO REFUSE
   * ACCURATELY: every clause it understood is named back to the user, so the
   * reply proves it was read rather than merely rejected. See StairNotYet.ts
   * for the three measured blockers.
   */
  | {
      readonly intent: 'create-stair-span';
      /** The level RANGE, when the sentence carried one. The first grammar in
       *  this package to read a range at all — see LEVEL_RANGE_RE. */
      readonly fromLevel?: string;
      readonly toLevel?: string;
      /** The selection reference ("this", "selected"), when it carried one. */
      readonly anchorRef?: string;
      /** 'I' | 'L' | 'U', when the sentence named a shape. */
      readonly shape?: string;
    }
  /**
   * §FEAT-RAC-STAIR-SHAPE (L-1541) — "create a stair in L shape" and its
   * family, INCLUDING the founder's "…aligned to the selected wall".
   *
   * ⭐ The one stair-creation sentence shape that is HONOURED rather than
   * refused: it arms the same tool, with the same shape, that the Create
   * palette's L-Shape button arms. `anchorRef` is carried ONLY so the reply can
   * say out loud which clause it did not apply — C67 §4 rule 20 makes the
   * alignment NOT BUILT, and 20.b forbids guessing a position from a selection.
   */
  | {
      readonly intent: 'create-stair-shape';
      /** The TOOL's shape axis — 'I' | 'L' | 'U' | 'C' (`StairShapeChoice`),
       *  which is NOT the command's `StairShape`. See StairCreateShape.ts. */
      readonly shape: 'I' | 'L' | 'U' | 'C';
      /** The alignment clause, in the user's own words, when one was said. */
      readonly anchorRef?: string;
    }
  /**
   * §REFUSE-RAC-REPLICATE (L-1542) — "create same stair in ground in level 1".
   * COPY BY REFERENCE, parsed in order to refuse accurately: the target level
   * is RESOLVED (so the reply proves it read the sentence) even though the
   * copy itself has no command on any element kind.
   */
  | {
      readonly intent: 'replicate-element';
      readonly elementKind: string;
      readonly sourceLevelQuery?: string;
      readonly targetLevelQuery?: string;
    }
  /**
   * §REFUSE-STAIR-RUN (L-1444) — "change first run of all stairs to X meters".
   * ⭐ The vocabulary cannot address a COMPONENT of an element at all today,
   * only whole elements; this arm is where that is said out loud.
   */
  | {
      readonly intent: 'set-stair-part';
      readonly partRef: string;
    }
  /**
   * §FEAT-WINDOW-TYPE-BATCH (ADR-0315, founder ask #4) — "change the window
   * type to Steel Crittal Style" / "change all windows to timber casement".
   * Dispatches `window.updateSystemTypeBatch` (ONE undo entry; children are
   * the L-620-proven UpdateWindowSystemTypeCommand against the geometry
   * windowStore — never the detached plugin `window.setType`).
   */
  | {
      readonly intent: 'set-window-type';
      /** Type id OR name, as the user said it — resolved by the injected
       *  `ctx.resolveWindowSystemType`, or by the command when absent. */
      readonly typeRef: string;
      /** RAC U8.1 — the full IntentScope (spatial + filter). */
      readonly scope: IntentScope;
    }
  /**
   * §FEAT-DOOR-TYPE-BATCH (RAC U4.3, the §56 extension proof) — "change the
   * door type to …" / "change all doors to …". Dispatches
   * `door.updateSystemTypeBatch` (ONE undo entry; children are the
   * L-620-proven UpdateDoorSystemTypeCommand against the geometry doorStore —
   * never the detached plugin `door.setType`). On the resolver side this
   * capability is METADATA ONLY: a CapabilityExecutionSpec table entry
   * executed by the ONE generic arm — no case code exists for it.
   */
  | {
      readonly intent: 'set-door-type';
      /** Type id OR name, as the user said it — resolved by the injected
       *  `ctx.resolveDoorSystemType`, or by the command when absent. */
      readonly typeRef: string;
      /** RAC U8.1 — the full IntentScope (spatial + filter). */
      readonly scope: IntentScope;
    }
  /**
   * §FEAT-BULK-DIMENSIONS (L-949) — the founder's ask, verbatim: "bulk change
   * any element (doors, windows, walls) dimensions (or multiple dims)".
   * "make all windows 2 meters height" / "make all doors 2m wide by 1m high
   * with 0.1 sill" / "set all walls 3m high".
   *
   * A DIMENSION FAMILY table entry (DimensionFamilies.ts): the spec, the
   * grammar and every refusal are GENERATED, so on the resolver side this is
   * METADATA ONLY — no case arm exists for it (C67 §4.5). Each family dispatches
   * ONE batch verb, and `dims` carries EVERY requested field so that one
   * element gets one dispatch and one rebuild — ADR-0314 D3's contract kept, at
   * batch scale, which is what D2 called "the roadmap answer".
   */
  | {
      // §FEAT-CHAT-STAIR-WIDTH (L-1442) adds the stair. ⚠ This list is spelled
      // out rather than taking `DimensionFamilyIntentId` because the arm's OTHER
      // fields (`dims`, `scope`) are declared here and the table is imported for
      // its VALUES, not its types — but it must move in lock-step with
      // `DIMENSION_FAMILIES`, and `dimension-families.test.ts` asserts exactly
      // that by driving every family's own `examples` through this arm.
      readonly intent:
        | 'set-wall-dimensions' | 'set-window-dimensions' | 'set-door-dimensions'
        | 'set-stair-dimensions';
      /** The requested dimensions in METRES. One or several; a field the
       *  family's carrier cannot carry is REFUSED BY NAME in the value stage,
       *  never silently dropped. */
      readonly dims: DimensionAsk;
      /** RAC U8.1 — the full IntentScope (spatial + filter). */
      readonly scope: IntentScope;
    }
  /**
   * §FEAT-WINDOW-PARAMETRIC-CREATE (ADR-0315, founder ask #3) — "create a
   * window in the middle of every wall segment" / "create a 1x2m window every
   * 3 meters in the walls on the ground floor". Dispatches
   * `window.parametricCreate` (ONE undo entry; children are the proven
   * CreateWallOpeningCommand with the §OCCUPANCY gate; §WINDOW-CORNER-OVERFLOW
   * capping). destructive:true so the bridge shows the Confirm card before a
   * mass creation; the command's report gives the exact created/skipped
   * counts afterwards.
   */
  | {
      readonly intent: 'create-windows-parametric';
      readonly mode:
        | { readonly kind: 'count'; readonly count: number }
        | { readonly kind: 'spacing'; readonly spacingM: number };
      /** Window size in metres; null = the stated defaults (1 × 1.2m). */
      readonly widthM: number | null;
      readonly heightM: number | null;
      readonly scope:
        | 'all'
        | 'selection'
        | { readonly kind: 'level'; readonly levelQuery: string };
    }
  /**
   * §FEAT-WALL-LAYER-ADD-BATCH (ADR-0315, founder ask #2) — "add a 10mm
   * plaster finish to the inner side of the selected wall". Dispatches
   * `wall.addLayerBatch` (ONE undo entry; instance-scoped, raked walls skip
   * with the L-812 gate's reason). The finish vocabulary is the ONE table in
   * finishRef.ts; thickness/finish may arrive null from a loose sentence and
   * refuse honestly in the apply arm — a recognized-but-underspecified layer
   * ask must never fall through to the LLM.
   */
  | {
      readonly intent: 'add-wall-layer';
      readonly side: 'interior' | 'exterior';
      /** Layer thickness in metres, or null when the sentence named none. */
      readonly thicknessM: number | null;
      /** Finish reference ("plaster"), or null when none was recognized. */
      readonly finishRef: string | null;
      /** RAC U8.1 — the full IntentScope (spatial + filter). */
      readonly scope: IntentScope;
    }
  /**
   * §GEN-CHAT (RAC U5b.2, Dimension B) — "generate a 3-storey residential
   * building" / "generate a 2-storey house" / "generate an office building
   * with 5 floors" (+ optional apartment-mix hints: "with 2-bed and 3-bed
   * apartments").
   *
   * Open language in, HARD STOPPERS at the execution layer (founder doctrine):
   * the resolver never narrows what may be asked — it maps the sentence to ONE
   * `generation.building` bus command, and the SAME controllers/executors the
   * onboarding modal drives enforce the gates (§GEN-MAXHEIGHT-GATE quoting
   * real numbers, §RESI-ZERO-APARTMENTS-REFUSE, per-cell rejects) under the
   * `beginBuildingGeneration` lease (ONE coalesced undo). destructive:true so
   * the bridge shows the Confirm card before a whole building is generated;
   * the honest engine report arrives via 'pryzm-generation-report'.
   */
  | {
      readonly intent: 'generate-building';
      readonly typology: 'residential-building' | 'house' | 'office';
      /** TOTAL storey count asked for (ground included), or null when the
       *  sentence named none — the summary then STATES the default used. */
      readonly floors: number | null;
      /** Optional T1–T4 apartment-mix hints (residential only). */
      readonly mix?: { readonly T1?: boolean; readonly T2?: boolean; readonly T3?: boolean; readonly T4?: boolean };
      /** Optional roof-form hint (house only): "with a flat roof". */
      readonly roofKind?: 'flat' | 'gable' | 'hip';
    }
  /**
   * §GEN-CHAT-APARTMENT (RAC U5b.2, founder P0 2026-08-10) — "create a 3
   * bedroom apartment" / "generate a 2-bed apartment in this shell" / "make a
   * 3-bedroom apartment with 2 bathrooms".
   *
   * DISTINCT FROM `generate-building`: this lays a plan out INSIDE the walls
   * already drawn on the active level — it is the apartment-layout engine's
   * `ApartmentProgram`, not a new envelope. The founder typed
   * "Create 3 bedroom apparment" (his spelling) and got "I'm not sure how to
   * help with that yet"; the noun matcher is typo-tolerant for exactly that
   * reason. Building words ("building", "block", "tower", a storey count) are
   * REFUSED here and belong to `generate-building` instead.
   *
   * Open language in, HARD STOPPERS at the execution layer: the shell read
   * (≥3 exterior walls), the too-small-for-N-bedrooms refusal and the dropped
   * -room reasons are all the ENGINE's own, relayed verbatim through
   * 'pryzm-generation-report'. The resolver rules only on what it can know
   * purely (a bedroom count must be a whole number ≥ 1).
   */
  | {
      readonly intent: 'generate-apartment-layout';
      /** Bedrooms asked for, or null when the sentence named none (the
       *  summary then STATES the default programme the engine will use). */
      readonly bedrooms: number | null;
      /** Bathrooms asked for, or null when unstated. */
      readonly bathrooms: number | null;
      /** "with an en-suite" / "master en-suite". */
      readonly masterEnSuite: boolean;
      /** "open-plan kitchen/living". */
      readonly openPlanKitchenDining: boolean;
      /** §RAC-APARTMENT-IN-ROOM (L-1642) — "2 en-suite bathrooms" / "two
       *  en-suites"; 'each-bedroom' for "an en-suite in every bedroom". null
       *  when unstated (the legacy masterEnSuite boolean then governs). */
      readonly enSuiteCount: number | 'each-bedroom' | null;
      /** §RAC-APARTMENT-IN-ROOM (L-1643) — "open(ed) kitchen + living" — the
       *  TRUE fused great room, distinct from openPlanKitchenDining. */
      readonly openPlanKitchenLiving: boolean;
      /** §RAC-APARTMENT-IN-ROOM (L-1640/L-1641/L-1644) — where to generate.
       *  Read ONLY through SpatialScopeTail (C67 §4 rule 16). null = the
       *  active level's exterior shell (the legacy whole-level behaviour).
       *  A room scope may carry the level qualifier the founder speaks with
       *  it ("on room 00-001 in ground level"). */
      readonly scope:
        | { readonly kind: 'room'; readonly roomRef: string; readonly levelQuery?: string }
        | { readonly kind: 'level'; readonly levelQuery: string }
        | null;
    }
  /**
   * §GEN-ROOMS (RAC U5c.1) — the ROOM-SCALE engines by sentence: "furnish all
   * rooms", "add ceilings to every room", "add floor finishes to all rooms",
   * "light all rooms", "furnish and light this floor", "furnish every floor".
   *
   * These four engines (D-CE ceilings, the room-type floor-finish pass, D-FLE
   * furniture, D-LE lighting) have shipped for months behind console entries
   * and panel leaves. Chat drives the SAME triggers — no second pipeline.
   *
   * GRANULARITY IS A HARD STOPPER, not a language limit. Every one of these
   * engines reads "every qualifying room on ONE level" and has no per-room
   * entry point, so a room-scoped or selection-scoped ask is RECOGNIZED and
   * then refused with that reason rather than silently widened to the level
   * (which would furnish the whole flat when the user said "the kitchen").
   * Only furnishing has an every-floor driver (`triggerFurnishAllFloors`); the
   * other three refuse an all-levels ask by naming that gap.
   */
  | {
      readonly intent: 'generate-room-finishes';
      /** Engines to run, in the pipeline's own order. */
      readonly steps: readonly RoomFinishStep[];
      readonly scope:
        | 'active-level'
        | 'all-levels'
        | { readonly kind: 'level'; readonly levelQuery: string }
        | { readonly kind: 'room'; readonly roomRef: string }
        | 'selection';
    }
  /**
   * §GEN-CHAIN (RAC U5c.2) — "finish this apartment" / "furnish and light the
   * whole building": the proven auto-chain as a conversational flow.
   *
   * The chain itself is ALREADY WIRED in the editor (apartment.layout-executed
   * → ceilings + floor finishes; ceiling.layout-executed → furnish;
   * furnish.layout-executed → lighting, each link with its own §CHAIN-TIMEOUT
   * fallback). This intent starts it and REPORTS it — it does not re-implement
   * it and it must never double-fire a link.
   *
   * `withLayout` distinguishes the two real asks: "generate and finish an
   * apartment" re-plans the shell first (the apartment engine, whose own
   * `apartment.layout-executed` starts the chain), while "finish this
   * apartment" leaves the existing rooms alone and runs only the finishing
   * stages over them.
   */
  | {
      readonly intent: 'finish-apartment-chain';
      readonly withLayout: boolean;
      readonly scope:
        | 'active-level'
        | { readonly kind: 'level'; readonly levelQuery: string };
    }
  /**
   * §PLAN (RAC U6) — a COMPOUND sentence: "duplicate level 0 to level 1, then
   * furnish it" / "make all walls white then add ceilings to every room".
   *
   * The IR is deliberately the thinnest thing that can be true: an ORDERED list
   * of ordinary SemanticIntents, each one produced by the SAME single-intent
   * ladder (tier 0 → tier 1 → NL) from its own clause, plus the user's own
   * words for that clause so every refusal can quote the sentence he typed. No
   * capability has a plan-specific grammar; a plan is a sequence of the
   * capabilities that already exist, and nothing else.
   *
   * WHY VALIDATION LIVES IN THE APPLY ARM, NOT THE PARSER. Every clause is
   * re-applied here, in order, against a context that carries forward what the
   * earlier steps will create (the ONE projection: a level a step adds). If any
   * clause refuses, the WHOLE plan refuses naming the step, its words and the
   * engine's reason — a plan the user never confirmed must never half-run, and
   * a plan may never reach a capability a single sentence would be refused for.
   */
  | {
      readonly intent: 'execute-plan';
      /** The steps, in the order the user said them. */
      readonly steps: readonly SemanticIntent[];
      /** The user's own clause text, 1:1 with `steps` — quoted verbatim in the
       *  Confirm card and in every refusal. */
      readonly clauses: readonly string[];
    };

/** §PLAN (RAC U6) — what ONE step of a confirmed plan is, as the Confirm card
 *  and the dispatcher need to see it. `commandCount` slices the plan's flat
 *  `commands` array back into steps so the bridge can dispatch step by step and
 *  stop where a step fails. */
export interface PlanStepReport {
  /** 1-based, as the card and the refusals speak ("step 2"). */
  readonly index: number;
  /** The user's own words for this clause. */
  readonly clause: string;
  readonly intent: string;
  /** The step's OWN summary, from its own capability's apply arm. */
  readonly summary: string;
  readonly commandCount: number;
  readonly destructive: boolean;
  /** Real undo entries this step costs, or null when only the engine knows
   *  (a chain whose stages each open their own batch). */
  readonly undoEntries: number | null;
  /** Why the count is what it is, when it is not simply "one per command". */
  readonly undoNote?: string;
}

/** §PLAN (RAC U6) — the plan metadata carried alongside the flat command list. */
export interface PlanReport {
  readonly steps: readonly PlanStepReport[];
  /** The TRUTHFUL undo cost sentence ("3 steps — Ctrl+Z three times").
   *  ADR-0314: runBatch is undo-NEUTRAL, so N commands are N undo entries and
   *  a plan may never claim one undo for a multi-command sequence. */
  readonly undoCost: string;
  /** Honest caveats the Confirm card must show (e.g. a generation step whose
   *  shipped auto-chain already runs a later step's engine). */
  readonly notes: readonly string[];
}

/** The room-scale engines, in the order the shipped pipeline runs them
 *  (§GEN-ROOMS). Exported so the capability registry, the parsers and the
 *  editor seam all name the same four steps. */
export type RoomFinishStep = 'ceilings' | 'floors' | 'furnish' | 'lighting';

/** Human labels for the four steps — ONE table, used by every summary and
 *  refusal so the transcript never invents a synonym. */
export const ROOM_FINISH_LABELS: Readonly<Record<RoomFinishStep, string>> = {
  ceilings: 'ceilings',
  floors: 'floor finishes',
  furnish: 'furniture',
  lighting: 'lighting',
};

/** Pipeline order — the order the shipped auto-chain fires them in. */
const ROOM_FINISH_ORDER: readonly RoomFinishStep[] = ['ceilings', 'floors', 'furnish', 'lighting'];

/** applySemanticIntent's result — a resolution minus the tier stamp (the
 *  caller adds `tier: 0 | 1 | 'nl'` on non-refusal results). */
export type SemanticApplication =
  | {
      readonly kind: 'commands';
      readonly intent: string;
      readonly summary: string;
      readonly commands: readonly BusCommandRef[];
      readonly destructive: boolean;
      /** §PLAN (RAC U6) — present ONLY for `execute-plan`: the step boundaries,
       *  per-step summaries and the truthful undo cost. Its absence is what
       *  tells the bridge this is an ordinary single-intent dispatch. */
      readonly plan?: PlanReport;
    }
  | {
      readonly kind: 'local';
      readonly intent: string;
      readonly summary: string;
      readonly action: ZeroTokenLocalAction;
      readonly levelId?: string;
      readonly levelName?: string;
      readonly visibility?: VisibilityLocalDispatch;
      /** For activateTool (L-906) — see ZeroTokenResolution's local member. */
      readonly placement?: PlacementLocalDispatch;
    }
  | {
      readonly kind: 'refusal';
      readonly intent: string;
      readonly reason: string;
      readonly suggestions: readonly string[];
    };

/**
 * A tier-0/1 grammar matcher: does this normalized utterance belong to my
 * capability, and if so what are its entities?
 *
 * RAC U6 — matchers return the SemanticIntent, not the application. They used
 * to end with `applySemanticIntent(si, ctx)` each, which made the grammar
 * reachable ONLY as "understand and apply in one step" and left the plan
 * executor with no way to obtain "what does this clause MEAN?" without a second
 * grammar. `runGrammar` now applies, once, for all of them — the header comment
 * above ("the matchers … parse its entities into a SemanticIntent;
 * applySemanticIntent owns the semantics→command mapping") finally describes
 * the code. `ctx` stays in the signature because a matcher may need project
 * facts to decide whether it CLAIMS at all (matchGoToLevel checks level names).
 */
type Matcher = (text: string, ctx: ResolverContext) => SemanticIntent | null;

const ELEMENT_NOUNS = new Set([
  'wall', 'walls', 'door', 'doors', 'window', 'windows', 'room', 'rooms',
  'slab', 'slabs', 'roof', 'roofs', 'stair', 'stairs', 'column', 'columns',
  'beam', 'beams', 'element', 'elements', 'item', 'items', 'object', 'objects',
]);

function singular(noun: string): string {
  return noun.endsWith('s') ? noun.slice(0, -1) : noun;
}

function fmt(n: number): string {
  return `${round3(n)} m`;
}

/** "ceilings, furniture and lighting" — the ONE list joiner the room-scale
 *  summaries and refusals share (§GEN-ROOMS). */
function joinLabels(items: readonly string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]!}`;
}

/** Resolve a level query (exact name, or a number matched against "Level N" /
 *  "LN" / "… N" naming) against the injected level list. Exported so the NL
 *  layer can pre-resolve ordinal words without duplicating the lookup. */
export function findLevel(
  query: string,
  levels: readonly ResolverLevel[],
): ResolverLevel | undefined {
  const q = query.trim().toLowerCase();
  const byName = levels.find((l) => l.name.toLowerCase() === q);
  if (byName !== undefined) return byName;
  if (/^\d+$/.test(q)) {
    return levels.find((l) => {
      const nm = l.name.toLowerCase();
      return nm === `level ${q}` || nm === `l${q}` || nm.endsWith(` ${q}`);
    });
  }
  // §RAC-APARTMENT-IN-ROOM (L-1641) — "ground" is a STOREY NAME (the same
  // SpatialScopeTail vocabulary that classifies "the ground floor" as a level):
  // resolve it by ELEVATION — exactly 0, else the lowest non-negative — the
  // convention RoomNumbering already encodes (prefix 00 = the elevation-sorted
  // ground). Level NAMES often stay "Level 0" while people say "ground", so a
  // name-only lookup refused a level every project has. Runs only after every
  // exact route failed, so it can only turn a miss into a hit.
  if (q === 'ground' || q === 'ground floor' || q === 'ground level' || q === 'the ground floor') {
    const withElev = levels.filter((l) => typeof l.elevation === 'number');
    const atZero = withElev.find((l) => Math.abs(l.elevation!) < 1e-6);
    if (atZero !== undefined) return atZero;
    const nonNeg = withElev
      .filter((l) => l.elevation! >= 0)
      .sort((a, b) => a.elevation! - b.elevation!);
    if (nonNeg.length > 0) return nonNeg[0];
  }
  // §FIX-SCOPE-TAIL-ONE-PARSER (L-1201) — LAST RESORT ONLY. The shared scope
  // tail hands the level phrase over WHOLE ("the ground floor", "2 floor")
  // rather than pre-stripping it, because the full phrase is what matches a
  // level literally named "Ground Floor" — and pre-stripping made that
  // unmatchable. Stripping is retried here, after every exact route has already
  // failed, so this can only ever turn a miss into a hit: no query that
  // resolved before resolves differently now.
  const stripped = stripTrailingLevelNoun(q);
  if (stripped.length > 0 && stripped !== q) return findLevel(stripped, levels);
  return undefined;
}

/**
 * The ONE target guard — "does this capability really apply to this element
 * kind?" — answered by the capability registry rather than by a hand-written
 * `!==` in each branch.
 *
 * This is the anti-`ElementCapabilities` measure in executable form: the same
 * `capabilityAppliesTo` that the coverage gate probes is the function that
 * decides at runtime, so a capability cannot advertise a target its resolver
 * then rejects (or reach a target it never declared). The refusal it produces
 * lists what IS possible for the kind the user actually has selected.
 */
function capabilityTargetRefusal(
  capabilityId: string,
  elementType: string,
  propertyLabel: string,
): Extract<SemanticApplication, { kind: 'refusal' }> | null {
  const cap = resolveChatCapability(capabilityId);
  if (cap === null || capabilityAppliesTo(cap, elementType)) return null;
  return {
    kind: 'refusal',
    intent: capabilityId,
    reason:
      `I can't set the ${propertyLabel} of a ${normalizeElementKind(elementType)} from chat — ` +
      `the command behind it has no route for that element type, so it would look like it worked ` +
      `and change nothing. ${describeCapabilitiesFor(elementType)}`,
    suggestions: [],
  };
}

/** Selection guard: intent needs exactly a selected element. */
function needSelection(intent: string, ctx: ResolverContext, verbHint: string):
  | { readonly sel: ResolverSelection }
  | { readonly refusal: Extract<ZeroTokenResolution, { kind: 'refusal' }> } {
  const sel = ctx.selection[0];
  if (sel === undefined) {
    return {
      refusal: {
        kind: 'refusal',
        intent,
        reason: `Nothing is selected — select an element first, then ${verbHint}.`,
        suggestions: [],
      },
    };
  }
  return { sel };
}

// ─── §GATE-VIS-INTENT (VIS-CLASS, 2026-08-11) — the visibility-intent family ──
//
// Its own module (`VisibilityIntents.ts`), like CapabilityExecutionSpec and
// PropertyVocabulary: the family's semantics, its honesty tail and the
// "hide level 2 stays legacy" routing decision (with evidence) live there.
// `applySemanticIntent` routes to it by table membership below — no new
// hand-written case arms (coverage-gate check 8).

/**
 * Turn a SemanticIntent into a safe application: bus commands, a local
 * action, or an honest refusal. This is the SINGLE authority on the
 * semantics→command mapping — the tier-0/1 grammar and the NL layer both
 * funnel through it, so the safety guards (selection required, element-type
 * match, level exists, positive dimensions) can never diverge between the
 * rigid and natural paths. Pure; never dispatches (P6 is the caller's job).
 */
export function applySemanticIntent(si: SemanticIntent, ctx: ResolverContext): SemanticApplication {
  // §GATE-VIS-INTENT — table-membership routing, before the switch (like the
  // property vocabulary: a family, not four new hand-written case arms).
  const vis = asVisibilityIntent(si);
  if (vis !== null) return applyVisibilityIntent(vis, ctx);
  // §FEAT-RAC-PROPERTY-QUERY (L-2210) — the read-only property family, routed
  // the same way and for the same two reasons: it is a TABLE, not a case arm
  // (the hand-written arm count is already over its declared ratchet), and the
  // whole family shares one executor. It mutates NOTHING — `action: 'answer'`,
  // which the bridge answers with `break`.
  const pq = asPropertyQueryIntent(si);
  if (pq !== null) return applyPropertyQuery(pq, ctx);
  // §L-1032 — the level-change family, routed the same way and for the same
  // reason. `findLevel` is passed IN so the value dependency stays one-way; it
  // is this file's own function, so a level name means exactly what it means to
  // "go to level 2" (one level-name resolver, C84 EI-9).
  const mtl = asMoveToLevelIntent(si);
  if (mtl !== null) return applyMoveToLevelIntent(mtl, ctx, findLevel);
  // §FEAT-RAC-STAIR-SHAPE (L-1541) / §REFUSE-RAC-REPLICATE (L-1542) — routed
  // BEFORE the switch, and that placement is load-bearing rather than stylistic.
  //
  // ⭐ THE HAND-WRITTEN CASE-ARM RATCHET IS ALREADY OVER ITS BASELINE. Gate 31
  // check 8 (C68 §6.3-G5) counts `\n    case '<intent>':` in this file against
  // `MAX_RESOLVER_CASE_ARMS = 27`; measured 2026-08-20 the file carries **29** —
  // the two `create-stair-span` / `set-stair-part` arms took it past the line
  // and the baseline was never moved with them (recorded for the orchestrator,
  // NOT fixed here: raising a shrink-only ratchet is not this lane's to do, and
  // "a baseline is not permission" — C67 §4.9).
  //
  // So two more arms were not available, and that constraint pushed this family
  // onto the seam C67 §4 rule 5 and C68 §5.i ask for anyway: *"a capability of a
  // known shape is a TABLE ROW … zero new resolver case arms."* Membership
  // routing, exactly like the visibility and level-change families above.
  // `findLevel` is passed IN for the same reason it is there — one level-name
  // resolver for the whole package (C84 EI-9), never a second lookup.
  if (si.intent === 'create-stair-shape') return applyCreateStairShape(si, ctx);
  if (si.intent === 'replicate-element') return applyReplicateElementRefusal(si, ctx, findLevel);
  switch (si.intent) {
    case 'undo':
      return { kind: 'local', intent: 'undo', summary: 'Undid the last action', action: 'undo' };
    case 'redo':
      return { kind: 'local', intent: 'redo', summary: 'Redid the last undone action', action: 'redo' };

    case 'zoom-fit':
      return {
        kind: 'commands', intent: 'zoom-fit', summary: 'Zoomed to fit the model',
        commands: [{ type: 'zoom-fit', payload: {} }], destructive: false,
      };

    case 'zoom-selected': {
      if (ctx.selection.length === 0) {
        return {
          kind: 'refusal', intent: 'zoom-selected',
          reason: 'Nothing is selected to zoom to — select an element first, or say "zoom to fit".',
          suggestions: ['zoom to fit'],
        };
      }
      return {
        kind: 'commands', intent: 'zoom-selected', summary: 'Zoomed to the selection',
        commands: [{ type: 'zoom-selected', payload: {} }], destructive: false,
      };
    }

    case 'delete-selected': {
      const guard = needSelection('delete-selected', ctx, 'ask again');
      if ('refusal' in guard) return guard.refusal;
      const sel = guard.sel;
      if (si.noun !== undefined) {
        const wanted = singular(si.noun);
        if (!['element', 'item', 'object'].includes(wanted)) {
          // ADR-0314 §Selection batch — with a real multi-selection injected,
          // the noun must match EVERY selected element, not just the first: a
          // destructive "delete the selected walls" over a wall+door selection
          // must refuse whole, never delete the door as collateral.
          const mismatch = ctx.selection.find((s) => wanted !== s.elementType);
          if (mismatch !== undefined) {
            return {
              kind: 'refusal', intent: 'delete-selected',
              reason: `You asked to delete a ${wanted}, but the selected element is a ${mismatch.elementType}. Nothing was deleted.`,
              suggestions: [`delete selected ${mismatch.elementType}`],
            };
          }
        }
      }
      return {
        kind: 'commands', intent: 'delete-selected',
        summary: ctx.selection.length > 1
          ? `Delete the ${ctx.selection.length} selected elements`
          : `Delete the selected ${sel.elementType}`,
        commands: ctx.selection.map((s) => ({
          type: 'element.delete',
          payload: { elementId: s.elementId, elementType: s.elementType, source: 'AI_CHAT_ZERO_TOKEN' },
        })),
        destructive: true,
      };
    }

    case 'set-sill-height': {
      const guard = needSelection('set-sill-height', ctx, 'set its sill height');
      if ('refusal' in guard) return guard.refusal;
      // ADR-0314 §Selection batch — ALL-OR-NOTHING over the whole selection:
      // one non-window in the set refuses the whole ask (partial execution
      // presented as success is the §FIX-CHAT-COMPOUND-DIMENSIONS dishonesty).
      // §FEAT-DOOR-SILL-DECLARED (2026-08-17) — 'door' joins 'window' here, and this
      // guard is the reason the registry change alone was NOT the whole fix.
      //
      // `set-sill-height.targets` gained 'door', so `describeCapabilitiesFor('door')`
      // began OFFERING a door sill. This arm still refused every non-window, which
      // made the chat advertise an ability it then declined — the same defect shape
      // as a refusal naming an escape hatch that does not exist (§L-942). The
      // registry test `"the offer is generated from the registry, so it can never
      // offer a refused ability"` caught exactly that, by driving every declared
      // target through `applySemanticIntent` rather than reading the table. Kept as
      // ONE source of truth: the accepted kinds are READ from the capability's own
      // `targets`, so a future edit to the registry cannot silently desynchronise
      // from this guard again.
      //
      // A door sill is the THRESHOLD STEP, not a window concept borrowed: it is a
      // required `DoorData` field, `DoorBuilder` places the leaf at
      // `elevation + door.sillHeight + door.height / 2`, and the door panel edits it.
      // `targets` is `readonly string[] | 'global'`. 'global' means the capability
      // is not element-scoped at all, so there is no kind to refuse — narrowed
      // explicitly rather than cast, because a cast here would turn a future
      // 'global' into a silent accept-everything with no reader able to see it.
      const sillTargets = resolveChatCapability('set-sill-height')?.targets ?? ['window'];
      const SILL_KINDS: readonly string[] = sillTargets === 'global' ? [] : sillTargets;
      const nonSillKind = SILL_KINDS.length === 0
        ? undefined
        : ctx.selection.find((s) => !SILL_KINDS.includes(s.elementType));
      if (nonSillKind !== undefined) {
        return {
          kind: 'refusal', intent: 'set-sill-height',
          // ⚠ Pluralise EACH kind, then join. `join(' and ') + 's'` pluralises only
          // the LAST one — it shipped "window and doors" to users in 4b2fd142, and
          // read correctly only while the list held exactly one entry. Any
          // list-to-prose helper that appends a suffix after a join has this bug.
          reason: `Sill height applies to ${SILL_KINDS.map((k) => `${k}s`).join(' and ')}, but the selected element is a ${nonSillKind.elementType}.`,
          suggestions: [],
        };
      }
      const sill = round3(si.value);
      const n = ctx.selection.length;
      // §FIX-CHAT-DEAD-ROUTES: `window.setSillHeight` writes the detached
      // plugin DTO store. The LIVE route is the generic parameter command
      // (parameters.sillHeight → wallStore + host rebuild), production-proven
      // by the §FIX-CHAT-COMPOUND-DIMENSIONS founder repro.
      return {
        kind: 'commands', intent: 'set-sill-height',
        summary: n > 1
          ? `Set ${n} selected windows' sill height to ${fmt(sill)}`
          : `Set the selected window's sill height to ${fmt(sill)}`,
        commands: ctx.selection.map((s) => ({
          type: 'element.updateParameters',
          payload: { elementId: s.elementId, elementType: s.elementType, parameters: { sillHeight: sill } },
        })),
        destructive: false,
      };
    }

    // §REFUSE-STAIR-SPAN / §REFUSE-STAIR-RUN (L-1444) — the two refusal-only
    // capabilities. ⭐ A refusal is SHIPPED CODE here, not an absence: without
    // these arms both sentences are a MISS, and a miss falls through to an LLM
    // production does not have configured, so the founder sees "I'm not sure how
    // to help with that yet" — indistinguishable from a parse failure, when the
    // truth is far more specific and far more useful. The copy lives in
    // StairNotYet.ts alongside the measurements that justify it.
    case 'create-stair-span':
      return applyStairSpanRefusal(si, ctx);
    case 'set-stair-part':
      return applyStairPartRefusal(si, ctx);

    case 'set-riser-height':
    case 'set-tread-depth': {
      // ADR-0315 P1 — both ride the LIVE stair.updateParameters carrier.
      //
      // ⚠ THE COMMENT THAT USED TO BE HERE WAS HALF TRUE, AND THE HALF THAT WAS
      // FALSE IS THE ONE THAT MATTERED (measured 2026-08-20, L-1443). It read
      // *"the command validates against STAIR_CONSTRAINTS and refuses with the
      // real bound in the message, so the resolver only guards positivity."*
      // `UpdateStairParametersCommand.canExecute` validates riserHeight against
      // BOTH `MIN_RISER_HEIGHT` and `MAX_RISER_HEIGHT` (lines 83-88) — and
      // treadDepth against `MIN_TREAD_DEPTH` ONLY (line 107). **There is no
      // max-tread check on that path at all**, so "change tread to 500mm" was
      // written and reported as done.
      //
      // ⭐ THE FIX USES THE AUTHORITY'S OWN PREDICATE, NOT A SECOND OPINION.
      // `checkStairGeometry` (geometry-stair, L-1435 lane STAIR1) is THE
      // accept-set for stair geometry — its header states the rule: *"A layer
      // that wants to refuse MORE must say so in its own words and be recorded;
      // it may never disagree about THESE four."* The chat calls it and speaks
      // its `message` verbatim, so the chat's "no" and the authority's "no" are
      // the same sentence from the same source rather than two re-phrasings that
      // can drift.
      //
      // ⛔ ONLY THE TYPE-INDEPENDENT BOUND IS ENFORCED HERE, AND THAT IS A
      // MEASUREMENT, NOT A HEDGE. `resolveStairGeometryLimits` takes per-type
      // rules, and the built-in types really do LOOSEN the minima:
      // `timber-closed` and `residential-timber` declare `minTreadDepth: 0.220`
      // and `maxRiserHeight: 0.220` against defaults of 0.250 / 0.190. The
      // resolver sees `{elementId, elementType}` and NO typeId, so enforcing a
      // default minimum here would REFUSE a 230 mm tread that is legal on a
      // timber stair — a false refusal minted by a safety check, which is the
      // §CONTEXT-DATA-HONESTY failure wearing a helmet.
      //
      // `maxTreadDepth` is the one bound no type can move — the limits module
      // says so explicitly: *"A type may tighten (or loosen) tread and riser; it
      // has no say over max tread."* So it is exactly the bound the chat can
      // enforce without knowing the type, AND exactly the one the command
      // misses. The minima stay the command's job, where the typeId is in scope.
      //
      // ⭐ The structural fix is a `stairTypeIdOf` injection on ResolverContext
      // (the `resolveWallSystemType` precedent), which would let the chat resolve
      // real per-type limits. It is NOT done here: the injection site is the
      // editor bridge, outside this lane's seam, and a channel added with no
      // one filling it is authored-but-unwired. It is logged instead.
      const label = si.intent === 'set-riser-height' ? 'riser height' : 'tread depth';
      const guard = needSelection(si.intent, ctx, `set its ${label}`);
      if ('refusal' in guard) return guard.refusal;
      for (const s of ctx.selection) {
        const kindGuard = capabilityTargetRefusal(si.intent, s.elementType, label);
        if (kindGuard !== null) return kindGuard;
      }
      const value = round3(si.value);
      if (value <= 0) {
        return {
          kind: 'refusal', intent: si.intent,
          reason: `A ${label} of ${fmt(value)} is not valid — it must be positive.`,
          suggestions: [],
        };
      }
      if (si.intent === 'set-tread-depth') {
        const limits = resolveStairGeometryLimits();
        const tooDeep = checkStairGeometry({ treadDepth: value }, limits)
          .find((r) => r.code === 'STAIR-TREAD-TOO-DEEP');
        if (tooDeep !== undefined) {
          return {
            kind: 'refusal', intent: si.intent,
            // The authority's own sentence, verbatim — never re-phrased.
            reason:
              `${tooDeep.message}. Nothing was changed.`,
            suggestions: ['change tread to 280mm', 'set the tread depth to 300mm'],
          };
        }
      }
      const field = si.intent === 'set-riser-height' ? 'riserHeight' : 'treadDepth';
      const n = ctx.selection.length;
      return {
        kind: 'commands', intent: si.intent,
        summary: n > 1
          ? `Set ${n} selected stairs' ${label} to ${fmt(value)}`
          : `Set the selected stair's ${label} to ${fmt(value)}`,
        commands: ctx.selection.map((s) => (
          { type: 'stair.updateParameters', payload: { stairId: s.elementId, updates: { [field]: value } } }
        )),
        destructive: false,
      };
    }

    case 'set-room-height-offset': {
      const guard = needSelection('set-room-height-offset', ctx, 'set its height offset');
      if ('refusal' in guard) return guard.refusal;
      for (const s of ctx.selection) {
        const kindGuard = capabilityTargetRefusal('set-room-height-offset', s.elementType, 'height offset');
        if (kindGuard !== null) return kindGuard;
      }
      const offset = round3(si.value);
      // Mirrors the handler's own [-10, 10] m gate so the refusal can speak in
      // the unit the user typed rather than as a dispatch error.
      if (offset < -10 || offset > 10) {
        return {
          kind: 'refusal', intent: 'set-room-height-offset',
          reason: `A height offset of ${fmt(offset)} is not valid — it must be between -10 m and 10 m.`,
          suggestions: ['set the room height offset to 0.5m'],
        };
      }
      const n = ctx.selection.length;
      return {
        kind: 'commands', intent: 'set-room-height-offset',
        summary: n > 1
          ? `Set ${n} selected rooms' height offset to ${fmt(offset)}`
          : `Set the selected room's height offset to ${fmt(offset)}`,
        commands: ctx.selection.map((s) => (
          { type: 'room.setHeightOffset', payload: { roomId: s.elementId, heightOffset: offset } }
        )),
        destructive: false,
      };
    }

    case 'set-height': {
      const guard = needSelection('set-height', ctx, 'set its height');
      if ('refusal' in guard) return guard.refusal;
      const sel = guard.sel;
      const height = round3(si.value);
      if (height <= 0) {
        return {
          kind: 'refusal', intent: 'set-height',
          reason: `A height of ${fmt(height)} is not valid — it must be positive.`,
          suggestions: [],
        };
      }
      // §FIX-CHAT-HEIGHT-OVERCLAIM (2026-08-10). This used to accept ANY
      // element type and route the non-wall case to `element.updateParameters`.
      // That command's `resolveStore()` switch has a `default: return null`
      // arm, so a room / ceiling / floor / lighting selection dispatched a
      // command that resolved no store and changed nothing — the chat reported
      // success for a no-op. The claim is now bounded by what the command can
      // actually route, declared once in the capability registry.
      // ADR-0314 §Selection batch — every selected element must pass the
      // capability guard (all-or-nothing); then one command per element.
      for (const s of ctx.selection) {
        const kindGuard = capabilityTargetRefusal('set-height', s.elementType, 'height');
        if (kindGuard !== null) return kindGuard;
      }
      // Per-kind routing, PROVEN per route (commandProof): walls have a
      // dedicated dimension command, ceilings a dedicated height command
      // (§FEAT-CHAT-SYMMETRY — ceiling height used to be an honest refusal;
      // now it is wired to the command that really exists), everything else
      // goes through the generic parameter command whose store switch is the
      // ceiling on the claim.
      // §FIX-CHAT-DEAD-ROUTES: the ceiling route moved from `ceiling.setHeight`
      // (plugin DTO store, detached) to the LIVE legacy bridge ceiling.update →
      // UpdateCeilingCommand (ceilingStore; the soffit math reads
      // baseOffset + height − thickness).
      const cmdFor = (s: ResolverSelection): BusCommandRef => {
        const kind = normalizeElementKind(s.elementType);
        return kind === 'wall'
          ? { type: 'wall.updateDimensions', payload: { wallId: s.elementId, height } }
          : kind === 'ceiling'
            ? { type: 'ceiling.update', payload: { ceilingId: s.elementId, updates: { height } } }
            : {
                type: 'element.updateParameters',
                payload: { elementId: s.elementId, elementType: s.elementType, parameters: { height } },
              };
      };
      const n = ctx.selection.length;
      return {
        kind: 'commands', intent: 'set-height',
        summary: n > 1
          ? `Set ${n} selected elements' height to ${fmt(height)}`
          : `Set the selected ${sel.elementType}'s height to ${fmt(height)}`,
        commands: ctx.selection.map(cmdFor), destructive: false,
      };
    }

    case 'set-thickness': {
      const guard = needSelection('set-thickness', ctx, 'set its thickness');
      if ('refusal' in guard) return guard.refusal;
      const sel = guard.sel;
      // §FEAT-CHAT-SYMMETRY — the founding incident's other half: thickness
      // worked for walls only while slab.setThickness and roof.setThickness
      // sat registered and unreachable. The claim is bounded by the registry
      // (guard below) and each route by its own id-keyed command.
      for (const s of ctx.selection) {
        const kindGuard = capabilityTargetRefusal('set-thickness', s.elementType, 'thickness');
        if (kindGuard !== null) return kindGuard;
      }
      const thickness = round3(si.value);
      if (thickness <= 0) {
        return {
          kind: 'refusal', intent: 'set-thickness',
          reason: `A thickness of ${fmt(thickness)} is not valid — it must be positive.`,
          suggestions: [],
        };
      }
      const kind = normalizeElementKind(sel.elementType);
      // §FIX-CHAT-DEAD-ROUTES (ADR-0315 audit): `slab.setThickness` /
      // `roof.setThickness` are plugin handlers that produceCommand against the
      // DETACHED plugin DTO store — nothing in production reads it and no
      // committer bridges back (§FIX-MATERIAL-DEAD-DISPATCH, verified in
      // initBusHandlers). The LIVE routes are the legacy bridges the property
      // surfaces really use: slab.updateDimensions → UpdateSlabDimensionsCommand
      // → slabStore + rebuild, and roof.update → UpdateRoofCommand.
      const cmdFor = (s: ResolverSelection): BusCommandRef => {
        const k = normalizeElementKind(s.elementType);
        return k === 'slab'
          ? { type: 'slab.updateDimensions', payload: { slabId: s.elementId, thickness } }
          : k === 'roof'
            ? { type: 'roof.update', payload: { id: s.elementId, updates: { thickness } } }
            : { type: 'wall.updateDimensions', payload: { wallId: s.elementId, thickness } };
      };
      const n = ctx.selection.length;
      return {
        kind: 'commands', intent: 'set-thickness',
        summary: n > 1
          ? `Set ${n} selected elements' thickness to ${fmt(thickness)}`
          : `Set the selected ${kind}'s thickness to ${fmt(thickness)}`,
        commands: ctx.selection.map(cmdFor), destructive: false,
      };
    }

    case 'set-width': {
      const guard = needSelection('set-width', ctx, 'set its width');
      if ('refusal' in guard) return guard.refusal;
      const sel = guard.sel;
      for (const s of ctx.selection) {
        const kindGuard = capabilityTargetRefusal('set-width', s.elementType, 'width');
        if (kindGuard !== null) return kindGuard;
      }
      const width = round3(si.value);
      if (width <= 0) {
        return {
          kind: 'refusal', intent: 'set-width',
          reason: `A width of ${fmt(width)} is not valid — it must be positive.`,
          suggestions: [],
        };
      }
      const kind = normalizeElementKind(sel.elementType);
      // §FIX-CHAT-DEAD-ROUTES (ADR-0315 audit): `window.setSize` /
      // `door.setWidth` / `stair.setWidth` write the detached plugin DTO
      // stores. LIVE routes: hosted openings go through the generic parameter
      // command (→ wallStore + host rebuild — the same route the compound
      // §FIX-CHAT-COMPOUND-DIMENSIONS fix proved in production); stairs go
      // through stair.updateParameters → UpdateStairParametersCommand, which
      // validates against STAIR_CONSTRAINTS.
      const cmdFor = (s: ResolverSelection): BusCommandRef => {
        const k = normalizeElementKind(s.elementType);
        return k === 'stair'
          ? { type: 'stair.updateParameters', payload: { stairId: s.elementId, updates: { width } } }
          : {
              type: 'element.updateParameters',
              payload: { elementId: s.elementId, elementType: s.elementType, parameters: { width } },
            };
      };
      const n = ctx.selection.length;
      return {
        kind: 'commands', intent: 'set-width',
        summary: n > 1
          ? `Set ${n} selected elements' width to ${fmt(width)}`
          : `Set the selected ${kind}'s width to ${fmt(width)}`,
        commands: ctx.selection.map(cmdFor), destructive: false,
      };
    }

    case 'set-roof-pitch': {
      const guard = needSelection('set-roof-pitch', ctx, 'set its pitch');
      if ('refusal' in guard) return guard.refusal;
      for (const s of ctx.selection) {
        const kindGuard = capabilityTargetRefusal('set-roof-pitch', s.elementType, 'pitch');
        if (kindGuard !== null) return kindGuard;
      }
      const degrees = round3(si.degrees);
      // roof.setPitch validates [0, π/2); the degree bound here mirrors it so
      // the refusal can speak in the unit the user typed.
      if (degrees < 0 || degrees >= 90) {
        return {
          kind: 'refusal', intent: 'set-roof-pitch',
          reason: `A roof pitch of ${degrees}° is not valid — it must be between 0° and 89°.`,
          suggestions: ['set the roof pitch to 30 degrees'],
        };
      }
      // §FIX-CHAT-DEAD-ROUTES: `roof.setPitch` (radians, plugin DTO store) is
      // detached. The LIVE route is roof.update → UpdateRoofCommand, whose
      // `slope` is a GRADIENT (RoofGeometryBuilder: height = slope × distance),
      // so degrees convert via tan() — still exactly one conversion site.
      const slope = Math.round(Math.tan(degrees * Math.PI / 180) * 10000) / 10000;
      const n = ctx.selection.length;
      return {
        kind: 'commands', intent: 'set-roof-pitch',
        summary: n > 1
          ? `Set ${n} selected roofs' pitch to ${degrees}°`
          : `Set the selected roof's pitch to ${degrees}°`,
        commands: ctx.selection.map((s) => (
          { type: 'roof.update', payload: { id: s.elementId, updates: { slope } } }
        )),
        destructive: false,
      };
    }

    case 'set-dimensions': {
      const guard = needSelection('set-dimensions', ctx, 'set its dimensions');
      if ('refusal' in guard) return guard.refusal;
      // ADR-0314 D3 — the KIND-AGNOSTIC compound form stays ONE-element-only:
      // its whole §FIX-CHAT-COMPOUND-DIMENSIONS contract is one dispatch = one
      // rebuild for one element, and it has no way to know that a mixed
      // selection's elements even share a store. Refuse with the reason.
      //
      // §FIX-DIMENSION-REFUSAL-ADVERTISED-NOTHING (L-942, L-949). This refusal
      // used to end "Select one element, or change one dimension for all of
      // them" — and there was NO all-scope dimension capability, so the escape
      // hatch it offered did not exist. A refusing half whose remedy is
      // unreachable is a regression with a contract citation attached. The
      // remedy named below is now real: §FEAT-BULK-DIMENSIONS ships a
      // per-family batch (DimensionFamilies.ts), which is precisely what
      // ADR-0314 D2 called "the roadmap answer" to per-element fan-out.
      if (ctx.selection.length > 1) {
        const kinds = [...new Set(ctx.selection.map((s) => normalizeElementKind(s.elementType)))];
        const noun = kinds.length === 1 ? `${kinds[0]}s` : 'windows';
        return {
          kind: 'refusal', intent: 'set-dimensions',
          reason:
            `Changing several dimensions at once works on one selected element at a time — ` +
            `${ctx.selection.length} are selected, and nothing was changed. ` +
            `Select one element, or name the family and I'll do the whole set in one go — ` +
            `for example "make all ${noun} 2m high" (or "make the selected ${noun} 2m high").`,
          suggestions: [`make all ${noun} 2m high`, 'set height to 3m'],
        };
      }
      const sel = guard.sel;
      const kind = normalizeElementKind(sel.elementType);
      // Each field is owned by the capability that guards its single form —
      // the compound form must never accept what the single form refuses.
      const FIELD_CAP: Record<string, { cap: string; label: string }> = {
        height: { cap: 'set-height', label: 'height' },
        width: { cap: 'set-width', label: 'width' },
        thickness: { cap: 'set-thickness', label: 'thickness' },
        sillHeight: { cap: 'set-sill-height', label: 'sill height' },
      };
      const fields: { key: string; label: string; value: number }[] = [];
      for (const key of ['height', 'width', 'thickness', 'sillHeight'] as const) {
        const value = si[key];
        if (value === undefined) continue;
        const meta = FIELD_CAP[key]!;
        const kindGuard = capabilityTargetRefusal(meta.cap, sel.elementType, meta.label);
        // ALL-OR-NOTHING: one inapplicable property refuses the whole ask.
        // Applying the applicable half would be partial execution presented
        // as success — the exact dishonesty this resolver exists to prevent.
        if (kindGuard !== null) {
          return { ...kindGuard, intent: 'set-dimensions' };
        }
        if (key !== 'sillHeight' && round3(value) <= 0) {
          return {
            kind: 'refusal', intent: 'set-dimensions',
            reason: `A ${meta.label} of ${fmt(round3(value))} is not valid — it must be positive.`,
            suggestions: [],
          };
        }
        fields.push({ key, label: meta.label, value: round3(value) });
      }
      if (fields.length === 0) {
        return {
          kind: 'refusal', intent: 'set-dimensions',
          reason: 'I need at least one dimension and value — for example "set height to 3m".',
          suggestions: ['set height to 3m'],
        };
      }
      // ONE command per utterance (§FIX-CHAT-COMPOUND-DIMENSIONS): only routes
      // proven to apply every requested field in a single dispatch are used.
      let cmd: BusCommandRef;
      if (kind === 'wall') {
        // wall.updateDimensions carries height AND thickness in one payload
        // (width/sill were already refused for walls by the field guards).
        const payload: Record<string, unknown> = { wallId: sel.elementId };
        for (const f of fields) payload[f.key] = f.value;
        cmd = { type: 'wall.updateDimensions', payload };
      } else if (kind === 'window' || kind === 'door') {
        // element.updateParameters applies the whole parameter set to the
        // opening in one dispatch and one host-wall rebuild — the opening id
        // is only re-minted AFTER the values are applied, so there is no
        // dead-id window between parameters.
        const parameters: Record<string, number> = {};
        for (const f of fields) parameters[f.key] = f.value;
        cmd = {
          type: 'element.updateParameters',
          payload: { elementId: sel.elementId, elementType: sel.elementType, parameters },
        };
      } else if (fields.length === 1) {
        // A single field on any other kind: delegate to the owning single-form
        // intent so the routing (slab.setThickness, ceiling.setHeight, …) has
        // exactly one implementation.
        const f = fields[0]!;
        const single: SemanticIntent =
          f.key === 'height' ? { intent: 'set-height', value: f.value }
          : f.key === 'width' ? { intent: 'set-width', value: f.value }
          : f.key === 'thickness' ? { intent: 'set-thickness', value: f.value }
          : { intent: 'set-sill-height', value: f.value };
        return applySemanticIntent(single, ctx);
      } else {
        // No proven single command applies several dimensions to this kind in
        // one dispatch, and a command SEQUENCE dies on re-minted ids (the
        // founder's repro). Refusing with the reason is the honest answer.
        return {
          kind: 'refusal', intent: 'set-dimensions',
          reason:
            `I can only change one ${kind} property per message from chat — changing several ` +
            `dispatches separate commands, and a rebuild between them can invalidate the element. ` +
            `Ask for ${fields.map((f) => f.label).join(' and ')} one at a time.`,
          suggestions: [`set ${fields[0]!.label} to ${fields[0]!.value}m`],
        };
      }
      const parts = fields.map((f) => `${f.label} to ${fmt(f.value)}`);
      return {
        kind: 'commands', intent: 'set-dimensions',
        summary: `Set the selected ${kind}'s ${parts.join(', ')}`,
        commands: [cmd], destructive: false,
      };
    }

    case 'set-room-number': {
      const guard = needSelection('set-room-number', ctx, 'set its number');
      if ('refusal' in guard) return guard.refusal;
      if (ctx.selection.length > 1) {
        return {
          kind: 'refusal', intent: 'set-room-number',
          reason: `A room number goes on exactly one selected room — ${ctx.selection.length} elements are selected.`,
          suggestions: [],
        };
      }
      const sel = guard.sel;
      const kindGuard = capabilityTargetRefusal('set-room-number', sel.elementType, 'room number');
      if (kindGuard !== null) return kindGuard;
      const num = (si.number ?? '').trim();
      if (num.length === 0) {
        return {
          kind: 'refusal', intent: 'set-room-number',
          reason: 'I need the room number — try: set the room number to 101.',
          suggestions: ['set the room number to 101'],
        };
      }
      return {
        kind: 'commands', intent: 'set-room-number',
        summary: `Set the selected room's number to "${num}"`,
        commands: [{ type: 'room.setNumber', payload: { roomId: sel.elementId, number: num } }],
        destructive: false,
      };
    }

    case 'go-to-level': {
      const match = findLevel(si.levelQuery, ctx.levels);
      if (match === undefined) {
        const names = ctx.levels.map((l) => l.name).join(', ');
        return {
          kind: 'refusal', intent: 'go-to-level',
          reason: ctx.levels.length === 0
            ? 'No levels exist in this project yet — say "add a level" first.'
            : `No level called "${si.levelQuery}" — the levels here are: ${names}.`,
          suggestions: ctx.levels.slice(0, 3).map((l) => `go to ${l.name.toLowerCase()}`),
        };
      }
      return {
        kind: 'local', intent: 'go-to-level',
        summary: match.id === ctx.activeLevelId
          ? `${match.name} is already the active level`
          : `Switched the active level to ${match.name}`,
        action: 'setActiveLevel', levelId: match.id, levelName: match.name,
      };
    }

    case 'duplicate-level': {
      const names = ctx.levels.map((l) => l.name).join(', ');
      const source = findLevel(si.sourceQuery, ctx.levels);
      if (source === undefined) {
        return {
          kind: 'refusal', intent: 'duplicate-level',
          reason: ctx.levels.length === 0
            ? 'No levels exist in this project yet.'
            : `No level called "${si.sourceQuery}" to duplicate — the levels here are: ${names}.`,
          suggestions: ctx.levels.length > 1 ? [`duplicate ${ctx.levels[0]!.name.toLowerCase()} to ${ctx.levels[1]!.name.toLowerCase()}`] : [],
        };
      }
      if (si.targetQueries.length === 0) {
        return {
          kind: 'refusal', intent: 'duplicate-level',
          reason: `Which level(s) should I copy ${source.name} onto? The levels here are: ${names}.`,
          suggestions: [],
        };
      }
      const targets: ResolverLevel[] = [];
      for (const q of si.targetQueries) {
        const hit = findLevel(q, ctx.levels);
        if (hit === undefined) {
          // ALL-OR-NOTHING: one unresolvable target refuses the whole ask —
          // duplicating onto half the requested floors and reporting success
          // is the partial-execution dishonesty this resolver exists to stop.
          return {
            kind: 'refusal', intent: 'duplicate-level',
            reason: `No level called "${q}" — nothing was duplicated. The levels here are: ${names}.`,
            suggestions: [],
          };
        }
        if (hit.id === source.id) {
          return {
            kind: 'refusal', intent: 'duplicate-level',
            reason: `${source.name} cannot be duplicated onto itself. Nothing was duplicated.`,
            suggestions: [],
          };
        }
        if (!targets.some((t) => t.id === hit.id)) targets.push(hit);
      }
      return {
        kind: 'commands', intent: 'duplicate-level',
        summary:
          `Duplicate ${source.name}'s floor plan onto ${targets.map((t) => t.name).join(', ')} ` +
          `(walls with their doors/windows, slabs, columns and furniture — rooms, ceilings, ` +
          `roofs, stairs, curtain walls and lighting are NOT copied; re-detect rooms afterwards)`,
        commands: [{
          type: 'level.duplicate-floor-plan',
          payload: { sourceLevelId: source.id, targetLevelIds: targets.map((t) => t.id) },
        }],
        // Consequential blast radius (whole floors of new elements) — route it
        // through the existing Confirm/Cancel card the destructive flag drives.
        destructive: true,
      };
    }

    case 'add-level': {
      const levelId = ctx.mintId();
      const name = `Level ${ctx.levels.length}`;
      const elevations = ctx.levels.map((l) => l.elevation ?? 0);
      const maxElev = elevations.length > 0 ? Math.max(...elevations) : 0;
      const elevation = si.elevation !== undefined ? round3(si.elevation) : round3(maxElev + 3);
      // §FIX-CHAT-LEVEL-ELEVATION-CLASH (founder P0, 2026-08-10). The
      // paste-back defect created TWO levels at 6.000 m with no warning at all
      // — a silently stacked pair that renders as one floor and breaks every
      // level-scoped query downstream. Open language in, HARD STOPPER at the
      // execution layer: an occupied elevation refuses with the real occupant's
      // name and elevation and the next free elevation, never a silent stack.
      const EPS = 0.0005;
      const clash = ctx.levels.find(
        (l) => Math.abs(round3(l.elevation ?? 0) - elevation) < EPS,
      );
      if (clash !== undefined) {
        let free = round3(maxElev + 3);
        while (ctx.levels.some((l) => Math.abs(round3(l.elevation ?? 0) - free) < EPS)) {
          free = round3(free + 3);
        }
        return {
          kind: 'refusal', intent: 'add-level',
          reason:
            `${clash.name} is already at ${fmt(elevation)} — nothing was added, because two levels ` +
            `at the same elevation stack invisibly. Say "add a level at ${fmt(free)}", or ` +
            `"duplicate ${clash.name.toLowerCase()}" to copy its floor plan.`,
          suggestions: [`add a level at ${fmt(free)}`, `duplicate ${clash.name.toLowerCase()}`],
        };
      }
      return {
        kind: 'commands', intent: 'add-level',
        summary: `Add "${name}" at elevation ${fmt(elevation)}`,
        commands: [{ type: 'level.add', payload: { levelId, name, elevation, height: 3 } }],
        destructive: false,
      };
    }

    // §GEN-ROOMS (RAC U5c.1) — the four room-scale engines.
    case 'generate-room-finishes': {
      const steps = ROOM_FINISH_ORDER.filter((s) => si.steps.includes(s));
      if (steps.length === 0) {
        return {
          kind: 'refusal', intent: 'generate-room-finishes',
          reason: 'I did not catch which finish you want — ceilings, floor finishes, furniture or lighting.',
          suggestions: ['furnish all rooms', 'add ceilings to every room'],
        };
      }
      const named = joinLabels(steps.map((s) => ROOM_FINISH_LABELS[s]));
      // HARD STOPPER — engine granularity. Every one of these engines reads
      // "every qualifying room on ONE level"; there is no per-room entry
      // point. Widening "furnish the kitchen" to the whole level would furnish
      // rooms the user did not name, which is the over-claim this whole phase
      // exists to prevent.
      if (typeof si.scope === 'object' && si.scope.kind === 'room') {
        return {
          kind: 'refusal', intent: 'generate-room-finishes',
          reason:
            `The ${named} engine${steps.length > 1 ? 's run' : ' runs'} a whole level at a time — ` +
            `${steps.length > 1 ? 'they have' : 'it has'} no per-room entry point, so I cannot do ` +
            `just "${si.scope.roomRef}" without doing every room on the level. Nothing was changed.`,
          suggestions: ['furnish this floor', 'add ceilings to every room'],
        };
      }
      if (si.scope === 'selection') {
        return {
          kind: 'refusal', intent: 'generate-room-finishes',
          reason:
            `The ${named} engine${steps.length > 1 ? 's take' : ' takes'} a level, not a selection — ` +
            `${steps.length > 1 ? 'they read' : 'it reads'} every qualifying room on the level and ` +
            `ignore${steps.length > 1 ? '' : 's'} what happens to be selected. Nothing was changed.`,
          suggestions: ['furnish this floor'],
        };
      }
      // Only FURNISHING has a shipped every-floor driver
      // (triggerFurnishAllFloors, §FIX-FURNISH-ALL-FLOORS-COVERAGE). Claiming
      // an all-floors ceiling pass would be inventing a capability.
      if (si.scope === 'all-levels') {
        const unsupported = steps.filter((s) => s !== 'furnish');
        if (unsupported.length > 0) {
          return {
            kind: 'refusal', intent: 'generate-room-finishes',
            reason:
              `Only furnishing has an every-floor driver — ${joinLabels(unsupported.map((s) => ROOM_FINISH_LABELS[s]))} ` +
              `run one level at a time. Nothing was changed.`,
            suggestions: ['furnish every floor', `add ${ROOM_FINISH_LABELS[unsupported[0]!]} to this floor`],
          };
        }
        return {
          kind: 'commands', intent: 'generate-room-finishes',
          summary: 'Furnish every room on every floor (one pass per floor, each floor reported separately)',
          commands: [{ type: 'generation.rooms', payload: { steps, allLevels: true } }],
          destructive: true,
        };
      }
      let levelId: string | undefined;
      let levelLabel = 'this floor';
      if (typeof si.scope === 'object') {
        const lvl = findLevel(si.scope.levelQuery, ctx.levels);
        if (lvl === undefined) {
          return {
            kind: 'refusal', intent: 'generate-room-finishes',
            reason:
              `I could not find a level called "${si.scope.levelQuery}". ` +
              `The levels here are: ${ctx.levels.map((l) => l.name).join(', ')}.`,
            suggestions: [],
          };
        }
        levelId = lvl.id;
        levelLabel = lvl.name;
      } else if (ctx.activeLevelId !== undefined) {
        levelId = ctx.activeLevelId;
        levelLabel = ctx.levels.find((l) => l.id === ctx.activeLevelId)?.name ?? 'this floor';
      }
      return {
        kind: 'commands', intent: 'generate-room-finishes',
        summary:
          `Run ${named} on every qualifying room on ${levelLabel}` +
          (steps.includes('furnish') && !steps.includes('lighting')
            // §FURNISH-ALWAYS-LIGHTS — the shipped cascade lights after every
            // furnish run. Say so: a surprise is a small dishonesty.
            ? ' (furnishing also auto-lights the rooms — that cascade is always on)'
            : ''),
        commands: [{
          type: 'generation.rooms',
          payload: { steps, ...(levelId !== undefined ? { levelId } : {}) },
        }],
        destructive: true,
      };
    }

    // §GEN-CHAIN (RAC U5c.2) — the proven chain as a conversational flow.
    case 'finish-apartment-chain': {
      let levelId: string | undefined;
      let levelLabel = 'this floor';
      if (typeof si.scope === 'object') {
        const lvl = findLevel(si.scope.levelQuery, ctx.levels);
        if (lvl === undefined) {
          return {
            kind: 'refusal', intent: 'finish-apartment-chain',
            reason:
              `I could not find a level called "${si.scope.levelQuery}". ` +
              `The levels here are: ${ctx.levels.map((l) => l.name).join(', ')}.`,
            suggestions: [],
          };
        }
        levelId = lvl.id;
        levelLabel = lvl.name;
      } else if (ctx.activeLevelId !== undefined) {
        levelId = ctx.activeLevelId;
        levelLabel = ctx.levels.find((l) => l.id === ctx.activeLevelId)?.name ?? 'this floor';
      }
      // The Confirm card NAMES the steps, in order — the user is authorising a
      // multi-stage mutation and must know what the stages are before it runs.
      const stepList = si.withLayout
        ? 'lay out the apartment, then ceilings, floor finishes, furniture and lighting'
        : 'ceilings, floor finishes, furniture, then lighting';
      return {
        kind: 'commands', intent: 'finish-apartment-chain',
        summary:
          `Finish ${levelLabel} — ${stepList}, in that order. ` +
          `Each stage reports its own counts, and rooms it cannot complete are named with the engine's reason`,
        commands: [{
          type: 'generation.finish-chain',
          payload: { withLayout: si.withLayout, ...(levelId !== undefined ? { levelId } : {}) },
        }],
        destructive: true,
      };
    }

    case 'create-wall': {
      if (si.start === undefined || si.end === undefined) {
        return {
          kind: 'refusal', intent: 'create-wall',
          reason: 'I need start and end coordinates to place a wall from chat — or use the Wall tool to draw it.',
          suggestions: ['create a wall from (0,0) to (5,0)', 'create a wall from (0,0) to (5,0) height 3m'],
        };
      }
      const payload: Record<string, unknown> = {
        start: { x: si.start.x, z: si.start.z },
        end: { x: si.end.x, z: si.end.z },
      };
      if (ctx.activeLevelId !== undefined) payload['levelId'] = ctx.activeLevelId;
      if (si.height !== undefined) payload['height'] = round3(si.height);
      if (si.thickness !== undefined) payload['thickness'] = round3(si.thickness);
      return {
        kind: 'commands', intent: 'create-wall',
        summary: `Create a wall from (${si.start.x}, ${si.start.z}) to (${si.end.x}, ${si.end.z}) on the active level`,
        commands: [{ type: 'wall.create', payload }], destructive: false,
      };
    }

    case 'rename-room': {
      const guard = needSelection('rename-room', ctx, 'rename it');
      if ('refusal' in guard) return guard.refusal;
      if (ctx.selection.length > 1) {
        return {
          kind: 'refusal', intent: 'rename-room',
          reason: `Renaming needs exactly one selected room — ${ctx.selection.length} elements are selected.`,
          suggestions: [],
        };
      }
      const sel = guard.sel;
      if (sel.elementType !== 'room') {
        return {
          kind: 'refusal', intent: 'rename-room',
          reason: `Rename needs a selected room; the selected element is a ${sel.elementType}.`,
          suggestions: [],
        };
      }
      const rawName = (si.name ?? '').trim();
      if (rawName.length === 0) {
        return {
          kind: 'refusal', intent: 'rename-room',
          reason: 'I need the new name — try: rename room to Kitchen.',
          suggestions: ['rename room to Kitchen'],
        };
      }
      const name = rawName.replace(/\b\w/g, (c) => c.toUpperCase());
      return {
        kind: 'commands', intent: 'rename-room',
        summary: `Rename the selected room to "${name}"`,
        commands: [{ type: 'room.rename', payload: { roomId: sel.elementId, name } }],
        destructive: false,
      };
    }

    case 'create-windows-parametric': {
      // §FEAT-WINDOW-PARAMETRIC-CREATE — scope first (the batch-family shape).
      let wallIds: readonly string[] | 'all';
      let scopeLabelOverride: string | null = null;
      if (typeof si.scope === 'object') {
        if (ctx.resolveScope === undefined) {
          return {
            kind: 'refusal', intent: 'create-windows-parametric',
            reason:
              `I can't resolve "on level ${si.scope.levelQuery}" here — spatial scoping ` +
              `isn't wired into this chat context. I can place windows in all walls or the selected walls.`,
            suggestions: ['create a window in the middle of every wall segment'],
          };
        }
        const result = ctx.resolveScope({ kind: 'level', levelQuery: si.scope.levelQuery, elementKind: 'wall' });
        if (isScopeError(result)) {
          return { kind: 'refusal', intent: 'create-windows-parametric', reason: result.error, suggestions: ['create a window in the middle of every wall segment'] };
        }
        if (result.ids.length === 0) {
          return {
            kind: 'refusal', intent: 'create-windows-parametric',
            reason: `There are no walls on level ${si.scope.levelQuery} — nothing was created.`,
            suggestions: ['create a window in the middle of every wall segment'],
          };
        }
        wallIds = result.ids;
        const where = result.diagnostics[0] ?? si.scope.levelQuery;
        // ⭐ §FIX-WINDOW-CREATE-REACH — "every 2 m on level 2", taken literally,
        // puts windows in INTERIOR walls too, and this is a `destructive: true`
        // mass CREATION. There is no exterior/interior filter to apply: the
        // measured reason is recorded in DimensionFamilies' header —
        // `resolveWallFunction` returns null for `wt-monolithic`, the type a
        // user actually draws with, so "exterior walls" is usually an EMPTY set
        // rather than a wrong one, which is why the qualifier is REFUSED and not
        // silently dropped. The shell/exterior knowledge that does exist
        // (`workflows/apartmentLayout/windowEmission/shellWallMatch.ts`) takes a
        // caller-supplied `ShellWall[]` built by the layout pipeline; nothing in
        // `ResolverContext` can produce one, so it is NOT reachable from chat.
        // ⛔ Silently including interior walls behind a bare count is the worst
        // available outcome, so the Confirm card SAYS SO before he agrees.
        scopeLabelOverride =
          `the ${result.ids.length} wall${result.ids.length === 1 ? '' : 's'} on ${where} ` +
          `(every wall on that level, interior walls included)`;
      } else if (si.scope === 'selection') {
        const walls = ctx.selection.filter((s) => normalizeElementKind(s.elementType) === 'wall');
        if (walls.length === 0) {
          const kinds = [...new Set(ctx.selection.map((s) => normalizeElementKind(s.elementType)))];
          return {
            kind: 'refusal', intent: 'create-windows-parametric',
            reason: kinds.length === 0
              ? 'No walls are selected — select some walls, or say "create a window in the middle of every wall segment".'
              : `Windows go into walls, and the selection is ${kinds.join(' + ')}. Nothing was created.`,
            suggestions: ['create a window in the middle of every wall segment'],
          };
        }
        wallIds = walls.map((s) => s.elementId);
      } else {
        wallIds = 'all';
      }

      // Stated defaults, never silent ones (§CONTEXT-DATA-HONESTY): the
      // summary the Confirm card shows names the size it will build with.
      const width = si.widthM ?? 1.0;
      const height = si.heightM ?? 1.2;
      const sizeLabel = `${width}×${height}m${si.widthM === null ? ' (default size)' : ''}`;
      if (!(width > 0) || !(height > 0) || width > 10 || height > 10) {
        return {
          kind: 'refusal', intent: 'create-windows-parametric',
          reason: `A window must have a positive size in metres (got ${width}×${height}).`,
          suggestions: ['create a 1x2m window every 3 meters in all walls'],
        };
      }
      if (si.mode.kind === 'spacing' && si.mode.spacingM < width) {
        return {
          kind: 'refusal', intent: 'create-windows-parametric',
          reason:
            `Every ${si.mode.spacingM}m won't fit ${width}m-wide windows — the spacing must be ` +
            `at least the window width, or they would overlap.`,
          suggestions: ['create a 1x2m window every 3 meters in all walls'],
        };
      }

      const scopeLabel = scopeLabelOverride !== null
        ? scopeLabelOverride
        : wallIds === 'all'
          ? 'every wall in the project'
          : `${wallIds.length} selected wall${wallIds.length === 1 ? '' : 's'}`;
      const modeLabel = si.mode.kind === 'count'
        ? si.mode.count === 1 ? 'a window in the middle of' : `${si.mode.count} windows evenly across`
        : `a window every ${si.mode.spacingM}m along`;
      return {
        kind: 'commands', intent: 'create-windows-parametric',
        summary:
          `Create ${modeLabel} ${scopeLabel} — ${sizeLabel}, sill 0.9m. ` +
          `Walls that are too short, raked, or already occupied will be skipped and reported.`,
        commands: [{
          type: 'window.parametricCreate',
          payload: {
            wallIds: wallIds === 'all' ? 'all' : [...wallIds],
            mode: si.mode,
            width, height,
            sillHeight: 0.9,
          },
        }],
        // destructive:true = the bridge's Confirm card — a mass creation is
        // confirmed before it runs; ONE undo entry reverses all of it after.
        destructive: true,
      };
    }

    case 'set-rhino-material': {
      // §FEAT-RHINO-CHAT-MATERIAL — whole-model scope by construction: the
      // Rhino import is one reference model, not a set of store elements, so
      // there is no per-element narrowing to guess at. Existence of an
      // imported model is checked by the BRIDGE (which reports "no Rhino
      // model is imported" through 'pryzm-rhino-material-report'); the pure
      // resolver only owns the colour vocabulary.
      if (si.colorRef === null) {
        return {
          kind: 'commands', intent: 'set-rhino-material',
          summary: 'Restore the imported Rhino model’s original materials',
          commands: [{ type: 'rhino.resetMaterial', payload: {} }],
          destructive: false,
        };
      }
      const rhinoColor = resolveColorRef(si.colorRef);
      if (rhinoColor === null) {
        return {
          kind: 'refusal', intent: 'set-rhino-material',
          reason:
            `I don't know the colour "${si.colorRef}". I understand names like ` +
            `${exampleColorNames().join(', ')} — or an exact hex value like #f4f1e8.`,
          suggestions: ['make the rhino model white', 'reset the rhino model materials'],
        };
      }
      return {
        kind: 'commands', intent: 'set-rhino-material',
        summary: `Paint every element of the imported Rhino model ${rhinoColor.label}`,
        commands: [{ type: 'rhino.setMaterial', payload: { color: rhinoColor.hex } }],
        // NOT destructive — one undo entry, deletes nothing, and "reset the
        // rhino model materials" restores the as-imported look at any time.
        destructive: false,
      };
    }

    case 'generate-building': {
      // §GEN-CHAT (RAC U5b.2) — deliberately HAND-WRITTEN (like the creation
      // arms; see CapabilityExecutionSpec's header): generation is not a
      // batch-shaped capability. The resolver rules only on what it can know
      // purely (storey bounds each generator itself enforces, quoted with the
      // real numbers); site facts (boundary present, envelope height cap) are
      // ruled on by the SAME controllers the onboarding modal drives, and
      // their refusals come back verbatim via 'pryzm-generation-report'.
      const t = si.typology;
      const label = t === 'residential-building' ? 'residential building' : t === 'house' ? 'house' : 'office tower';
      if (si.floors !== null && (!Number.isInteger(si.floors) || si.floors < 1)) {
        return {
          kind: 'refusal', intent: 'generate-building',
          reason: `${si.floors} is not a buildable storey count — I need a whole number of floors (at least 1).`,
          suggestions: [`generate a 2-storey ${t === 'office' ? 'office building' : label}`],
        };
      }
      // Storey bounds — each generator's OWN limit, quoted honestly (the same
      // numbers the executors clamp/refuse at; never a silent clamp from chat).
      if (t === 'house' && si.floors !== null && si.floors > 3) {
        return {
          kind: 'refusal', intent: 'generate-building',
          reason: `The house generator builds 1–3 storeys — you asked for ${si.floors}. For more floors, ask for a residential building (up to 21 storeys).`,
          suggestions: ['generate a 3-storey house', `generate a ${si.floors}-storey residential building`],
        };
      }
      if (t === 'residential-building' && si.floors !== null && si.floors < 2) {
        return {
          kind: 'refusal', intent: 'generate-building',
          reason: `A multi-family residential building needs at least 2 storeys (ground + 1 apartment floor) — you asked for ${si.floors}. For a single storey, ask for a house.`,
          suggestions: ['generate a 2-storey residential building', 'generate a 1-storey house'],
        };
      }
      if (t === 'residential-building' && si.floors !== null && si.floors > 21) {
        return {
          kind: 'refusal', intent: 'generate-building',
          reason: `The residential generator builds up to 21 storeys (ground + 20 apartment floors) — you asked for ${si.floors}.`,
          suggestions: ['generate a 21-storey residential building'],
        };
      }
      if (t === 'office' && si.floors !== null && si.floors > 40) {
        return {
          kind: 'refusal', intent: 'generate-building',
          reason: `The office generator builds up to 40 storeys — you asked for ${si.floors}.`,
          suggestions: ['generate a 40-storey office building'],
        };
      }
      const mixEntries = si.mix !== undefined
        ? (['T1', 'T2', 'T3', 'T4'] as const).filter((k) => si.mix?.[k] === true)
        : [];
      const MIX_LABEL: Record<string, string> = { T1: '1-bed', T2: '2-bed', T3: '3-bed', T4: '4-bed' };
      const mixLabel = mixEntries.length > 0
        ? ` with ${mixEntries.map((k) => MIX_LABEL[k]).join(' + ')} apartments`
        : t === 'residential-building' ? ' with the default 2-bed + 3-bed mix' : '';
      const floorsLabel = si.floors !== null
        ? `${si.floors}-storey`
        : t === 'house' ? '2-storey (default)'
        : t === 'office' ? '40-storey (default)'
        : '6-storey (default: ground + 5)';
      const siteLabel = t === 'office'
        ? 'on the site (circular plate fitted inside the plot)'
        : 'from the site boundary';
      // Stated contract (the executors' real behaviour): generation ADDS new
      // levels/elements alongside what is drawn — it does not replace existing
      // work — and the whole build coalesces into ONE undo entry under the
      // beginBuildingGeneration lease. The height gate line is the doctrine's
      // hard stopper made visible before Confirm.
      const summary =
        `Generate a ${floorsLabel} ${label}${mixLabel} ${siteLabel} — ` +
        `it builds new levels and elements alongside what's drawn (nothing is replaced), as one coherent undo. ` +
        `The recorded envelope height cap is enforced before building.`;
      return {
        kind: 'commands', intent: 'generate-building',
        summary,
        commands: [{
          type: 'generation.building',
          payload: {
            typology: t,
            ...(si.floors !== null ? { floors: si.floors } : {}),
            ...(mixEntries.length > 0
              ? { typologies: { T1: si.mix?.T1 === true, T2: si.mix?.T2 === true, T3: si.mix?.T3 === true, T4: si.mix?.T4 === true } }
              : {}),
            ...(si.roofKind !== undefined && t === 'house' ? { roofKind: si.roofKind } : {}),
          },
        }],
        // A whole building is consequential — Confirm card before it runs.
        destructive: true,
      };
    }

    case 'generate-apartment-layout': {
      // §GEN-CHAT-APARTMENT (RAC U5b.2) — hand-written for the same reason the
      // generation arm is: an apartment layout is a whole-plan generation, not
      // a batch-shaped element edit. PURE rulings only — a bedroom/bathroom
      // count must be a whole number ≥ 1. Everything that depends on the SITE
      // (is there a closed shell at all? does 4 bedrooms fit this plate? which
      // rooms did the engine drop and why?) is ruled on by the SAME
      // apartment-layout pipeline the AI-panel leaf and
      // `pryzmGenerateApartmentLayout()` drive, and comes back verbatim.
      const badCount = (n: number | null): boolean =>
        n !== null && (!Number.isInteger(n) || n < 1);
      if (badCount(si.bedrooms)) {
        return {
          kind: 'refusal', intent: 'generate-apartment-layout',
          reason: `${si.bedrooms} is not a bedroom count I can plan — I need a whole number of bedrooms (at least 1).`,
          suggestions: ['create a 3 bedroom apartment', 'create a 2 bedroom apartment with 2 bathrooms'],
        };
      }
      if (badCount(si.bathrooms)) {
        return {
          kind: 'refusal', intent: 'generate-apartment-layout',
          reason: `${si.bathrooms} is not a bathroom count I can plan — I need a whole number of bathrooms (at least 1).`,
          suggestions: ['create a 3 bedroom apartment with 2 bathrooms'],
        };
      }
      // §RAC-APARTMENT-IN-ROOM (L-1642) — the stated en-suite count is a PURE
      // ruling: whole, non-negative, and never above a STATED bedroom count
      // (an en-suite pairs 1:1 with a bedroom — the refusal carries BOTH
      // numbers, founder doctrine). 'each-bedroom' resolves to the stated
      // count, or to the DEFAULT programme's when none was stated (and the
      // default is then locked and NAMED, so the distributive stays exact).
      if (typeof si.enSuiteCount === 'number' && (!Number.isInteger(si.enSuiteCount) || si.enSuiteCount < 0)) {
        return {
          kind: 'refusal', intent: 'generate-apartment-layout',
          reason: `${si.enSuiteCount} is not an en-suite count I can plan — I need a whole number.`,
          suggestions: ['create a 3 bedroom apartment with 2 en-suite bathrooms'],
        };
      }
      const enSuiteCount: number | null = si.enSuiteCount === 'each-bedroom'
        ? (si.bedrooms ?? APARTMENT_STATED_DEFAULT.bedrooms)
        : si.enSuiteCount;
      if (enSuiteCount !== null && si.bedrooms !== null && enSuiteCount > si.bedrooms) {
        return {
          kind: 'refusal', intent: 'generate-apartment-layout',
          reason:
            `you asked for ${enSuiteCount} en-suites across ${si.bedrooms} bedrooms — an en-suite ` +
            `pairs one-to-one with a bedroom, so ${si.bedrooms} bedroom${si.bedrooms === 1 ? '' : 's'} ` +
            `can host at most ${si.bedrooms}. Nothing was changed.`,
          suggestions: [`create a ${enSuiteCount} bedroom apartment with ${enSuiteCount} en-suites`],
        };
      }

      // §RAC-APARTMENT-IN-ROOM (L-1640/L-1641/L-1644) — resolve the stated
      // scope BEFORE the Confirm card, so consent is to the REAL room/level by
      // its real number and name, and every miss refuses quoting the project's
      // own labels (C67 §4 rule 6). The scope may arrive as a gate-injected
      // descriptor of another kind — refused by name, never absorbed.
      const sc = si.scope as
        | { kind?: string; roomRef?: string; levelQuery?: string }
        | null;
      const levelName = (id: string | undefined): string =>
        ctx.levels.find((l) => l.id === id)?.name ?? 'an unknown level';
      const levelNames = ctx.levels.map((l) => l.name).join(', ');
      const resolveStatedLevel = (q: string):
        | { level: ResolverLevel }
        | { refusal: Extract<SemanticApplication, { kind: 'refusal' }> } => {
        const level = findLevel(q, ctx.levels);
        if (level === undefined) {
          return {
            refusal: {
              kind: 'refusal', intent: 'generate-apartment-layout',
              reason: `I can't find a level "${q}" — the levels here are: ${levelNames}. Nothing was changed.`,
              suggestions: [],
            },
          };
        }
        if (ctx.activeLevelId !== undefined && level.id !== ctx.activeLevelId) {
          return {
            refusal: {
              kind: 'refusal', intent: 'generate-apartment-layout',
              reason:
                `the apartment engine lays out on the level you're viewing — you're on ` +
                `"${levelName(ctx.activeLevelId)}" and ${level.name} is a different level. ` +
                `Switch to ${level.name} and ask again. Nothing was changed.`,
              suggestions: [],
            },
          };
        }
        return { level };
      };

      let targetRoom: { id: string; roomNumber?: string; name?: string; levelId?: string; areaM2?: number } | null = null;
      let targetLevelId: string | null = null;
      if (sc !== null && sc.kind === 'level' && typeof sc.levelQuery === 'string') {
        const r = resolveStatedLevel(sc.levelQuery);
        if ('refusal' in r) return r.refusal;
        targetLevelId = r.level.id;
      } else if (sc !== null && sc.kind === 'room' && typeof sc.roomRef === 'string') {
        if (ctx.rooms === undefined) {
          // §1.1 property 2 — an absent service refuses honestly, never widens.
          return {
            kind: 'refusal', intent: 'generate-apartment-layout',
            reason:
              `I can't look up rooms in this context, so I can't lay out "${sc.roomRef}" safely. ` +
              `Nothing was changed.`,
            suggestions: [],
          };
        }
        const hit = resolveSingleRoomRef(sc.roomRef, ctx.rooms);
        if (hit.kind === 'ambiguous') {
          return { kind: 'refusal', intent: 'generate-apartment-layout', reason: hit.error, suggestions: [] };
        }
        if (hit.kind === 'none') {
          const labels = ctx.rooms
            .map((r) => describeRoomRow(r))
            .filter((n) => n.length > 0)
            .slice(0, 8);
          return {
            kind: 'refusal', intent: 'generate-apartment-layout',
            reason: labels.length === 0
              ? `There are no rooms in this project yet — detect rooms first. Nothing was changed.`
              : `I can't find a room "${sc.roomRef}". The rooms here are: ${labels.join(', ')}. Nothing was changed.`,
            suggestions: [],
          };
        }
        targetRoom = hit.room;
        // A level said WITH the room must be the room's own level.
        if (typeof sc.levelQuery === 'string') {
          const r = resolveStatedLevel(sc.levelQuery);
          if ('refusal' in r) return r.refusal;
          if (targetRoom.levelId !== undefined && targetRoom.levelId !== r.level.id) {
            return {
              kind: 'refusal', intent: 'generate-apartment-layout',
              reason:
                `room ${targetRoom.roomNumber ?? targetRoom.id} is on "${levelName(targetRoom.levelId)}", ` +
                `not "${r.level.name}". Nothing was changed.`,
              suggestions: [],
            };
          }
          targetLevelId = r.level.id;
        }
        // The engine builds on the level being viewed — a room elsewhere needs
        // the switch first (the generate-room-finishes granularity precedent:
        // refuse naming the gap, never silently widen or hop levels).
        if (
          targetRoom.levelId !== undefined && ctx.activeLevelId !== undefined &&
          targetRoom.levelId !== ctx.activeLevelId
        ) {
          return {
            kind: 'refusal', intent: 'generate-apartment-layout',
            reason:
              `room ${targetRoom.roomNumber ?? targetRoom.id} is on "${levelName(targetRoom.levelId)}" and ` +
              `you're viewing "${levelName(ctx.activeLevelId)}" — the apartment engine lays out on the ` +
              `level you're viewing. Switch to ${levelName(targetRoom.levelId)} and ask again. ` +
              `Nothing was changed.`,
            suggestions: [],
          };
        }
        targetLevelId = targetLevelId ?? targetRoom.levelId ?? ctx.activeLevelId ?? null;
      } else if (sc !== null) {
        return {
          kind: 'refusal', intent: 'generate-apartment-layout',
          reason:
            `I can lay an apartment out over the whole level, on one level by name, or inside one ` +
            `room by its number — not that scope. Nothing was changed.`,
          suggestions: ['create a 3 bedroom apartment in room 001'],
        };
      }

      // L-911 (C78 §1.2b) — an UNSTATED count is a default, and a default
      // presented as the user's request is failure-as-emptiness in the intent
      // layer. "the default programme" alone does not let anyone SEE what was
      // substituted, so the sentence names the numbers and invites the
      // correction before the Confirm card is signed.
      const bedLabel = si.bedrooms !== null
        ? `${si.bedrooms}-bedroom`
        : `apartment with the DEFAULT programme (${APARTMENT_STATED_DEFAULT.bedrooms} bedrooms, ` +
          `${APARTMENT_STATED_DEFAULT.bathrooms} bathroom) — say how many bedrooms you want and I'll use that instead`;
      // L-911 — the shared-bathroom default is NAMED when bedrooms were stated
      // but bathrooms were not (before this, an unstated bathroom count rode
      // silently on a stated-bedroom sentence).
      const bathLabel = si.bathrooms !== null
        ? `, ${si.bathrooms} bathroom${si.bathrooms === 1 ? '' : 's'}`
        : si.bedrooms !== null
          ? `, ${APARTMENT_STATED_DEFAULT.bathrooms} shared bathroom (the default — say a number to change it)`
          : '';
      const extras = [
        ...(enSuiteCount !== null && enSuiteCount > 0
          ? [`${enSuiteCount} en-suite bathroom${enSuiteCount === 1 ? '' : 's'} (one per bedroom, master first)`]
          : si.masterEnSuite ? ['a master en-suite'] : []),
        ...(si.openPlanKitchenLiving
          ? ['an open-plan kitchen + living (ONE fused great room — no separate kitchen or living room)']
          : si.openPlanKitchenDining ? ['an open-plan kitchen/dining'] : []),
      ];
      const extraLabel = extras.length > 0 ? `, with ${extras.join(' and ')}` : '';
      // The stated contract: this FILLS what is already drawn. Room scope names
      // the room by NUMBER + name + area and says what happens to its contents;
      // level scope names the level; the default is the active level's shell.
      const whereLabel = targetRoom !== null
        ? ` inside room ${targetRoom.roomNumber ?? targetRoom.id}` +
          `${targetRoom.name !== undefined && targetRoom.name.length > 0 ? ` ("${targetRoom.name}")` : ''}` +
          `${typeof targetRoom.areaM2 === 'number' ? `, ${Math.round(targetRoom.areaM2 * 10) / 10} m²` : ''}` +
          ` on ${levelName(targetLevelId ?? undefined)} — the room's existing walls are KEPT and its open ` +
          `area is subdivided into the new plan; anything already inside it (furniture, partitions) is ` +
          `built around, not removed`
        : targetLevelId !== null
          ? ` inside the walls already drawn on ${levelName(targetLevelId)} (the level you're viewing) — ` +
            `it fills the EXISTING shell (no new building, nothing outside the shell changes)`
          : ` inside the walls already drawn on this level — it fills the EXISTING shell (no new building, ` +
            `nothing outside the shell changes)`;
      const summary =
        `Lay out ${si.bedrooms !== null ? 'a ' : 'an '}${bedLabel}${bathLabel}${extraLabel}` +
        `${whereLabel}. If the shape can't take this programme, I'll say so rather than guess.`;
      return {
        kind: 'commands', intent: 'generate-apartment-layout',
        summary,
        commands: [{
          type: 'generation.apartment',
          payload: {
            ...(si.bedrooms !== null ? { bedrooms: si.bedrooms } : {}),
            ...(si.bathrooms !== null ? { bathrooms: si.bathrooms } : {}),
            ...(si.masterEnSuite || (enSuiteCount !== null && enSuiteCount > 0) ? { masterEnSuite: true } : {}),
            ...(si.openPlanKitchenDining && !si.openPlanKitchenLiving ? { openPlanKitchenDining: true } : {}),
            ...(enSuiteCount !== null ? { enSuiteCount } : {}),
            ...(si.openPlanKitchenLiving ? { openPlanKitchenLiving: true } : {}),
            // L-911 — a stated bedroom count is exact all the way down.
            ...(si.bedrooms !== null ? { lockBedroomCount: true } : {}),
            ...(targetRoom !== null
              ? {
                  roomId: targetRoom.id,
                  ...(targetRoom.roomNumber !== undefined ? { roomNumber: targetRoom.roomNumber } : {}),
                  ...(targetRoom.name !== undefined ? { roomName: targetRoom.name } : {}),
                }
              : {}),
            ...(targetLevelId !== null ? { levelId: targetLevelId } : {}),
          },
        }],
        // Generating a whole plan is consequential — Confirm card first.
        destructive: true,
      };
    }

    // §PLAN (RAC U6) — the compound sentence, executed as an ordered plan.
    case 'execute-plan':
      return applyPlan(si, ctx);

    // ── RAC U4 — the ONE generic arm ─────────────────────────────────────────
    // Every intent NOT hand-written above is a spec-driven batch capability:
    // the switch narrows `si` to SpecDrivenIntent here, and the generic
    // interpreter executes its CapabilityExecutionSpec table entry (scope
    // discipline, value-source refusals listing real options, one batch
    // command, honest scope label — byte-identical to the arms it replaced).
    // Adding a capability of this shape is a table entry + registry metadata,
    // never a new case arm (the §56 extension proof).
    //
    // ── RAC U7.1 — the OTHER generic arm ─────────────────────────────────────
    // A PROPERTY VOCABULARY entry (a panel field on the selection, per-kind
    // routes) is executed by applyPropertyIntent. Same discipline, different
    // template: the U4 spec arm emits ONE batch command over a scope, this one
    // fans a selection out per element on its own kind's route.
    default: {
      // §FEAT-CHAT-TOOL-ACTIVATION (L-906) — the placement family, routed by
      // intent id through the default arm (no new case arm; gate check 8).
      // Its whole application is one thin module: the raw noun becomes a
      // LOCAL activateTool action the editor bridge resolves and executes.
      if (si.intent === 'activate-placement') {
        return applyActivatePlacement(si);
      }
      const prop = asPropertyIntent(si);
      // The cast is the exhaustiveness the union can no longer express on its
      // own: two generic families now share the default arm, and only one of
      // them is spec-driven. `asPropertyIntent` decides which, by table
      // membership — never by shape-guessing.
      return prop !== null
        ? applyPropertyIntent(prop, ctx)
        : applyExecutionSpec(si as SpecDrivenIntent, ctx);
    }
  }
}

// ─── §PLAN (RAC U6) — the plan executor ──────────────────────────────────────
//
// A plan is an ordered list of ORDINARY intents. This arm adds exactly three
// things a single sentence does not need, and nothing else:
//
//   1. ALL-OR-NOTHING VALIDATION. Every step is applied, in order, before a
//      single command is handed back. One refusing step refuses the whole plan,
//      quoting the step number, the user's own words and the capability's own
//      reason. Never half-run a plan the user never confirmed.
//   2. THE ONE PROJECTION. "Add a level at 9 m, then duplicate level 0 onto it"
//      validates step 2 against a level that does not exist yet. The projection
//      is derived from step 1's OWN produced `level.add` payload — never from a
//      re-derivation of the naming rule — and `add-level` is the ONLY intent
//      that projects anything. Everything else validates against the project as
//      it is.
//   3. TRUTHFUL UNDO COST. ADR-0314: `runBatch` is undo-NEUTRAL, so N commands
//      are N undo entries. A plan therefore costs the SUM of its steps, and it
//      says so. Claiming "one undo" for a three-step plan is the exact
//      dishonesty that ADR-0314 exists to record.
//
// The plan has no grammar of its own beyond the sequencing connective, no
// capability-specific knowledge, and no second dispatcher: every step's meaning
// is decided by the same `applySemanticIntent` call the same sentence typed
// alone would make.

/** Plans longer than this are refused rather than half-understood: past a
 *  handful of clauses the Confirm card stops being readable, and an unreadable
 *  card is consent nobody really gave. */
const PLAN_MAX_STEPS = 6;

const NUMBER_WORDS: readonly string[] = [
  'zero', 'once', 'twice', 'three times', 'four times', 'five times',
  'six times', 'seven times', 'eight times', 'nine times', 'ten times',
];

/** "Ctrl+Z twice" reads better than "Ctrl+Z 2 times", and past ten the digits
 *  are clearer than the words. */
function undoTimes(n: number): string {
  return n >= 1 && n < NUMBER_WORDS.length ? NUMBER_WORDS[n]! : `${n} times`;
}

/**
 * What ONE step really costs in undo entries.
 *
 * The default is the honest ADR-0314 rule: one entry per dispatched command.
 * The generation verbs are the declared exceptions, each for a reason that is
 * in the code they call:
 *  • generation.building / generation.apartment — the executors open the
 *    `beginBuildingGeneration` lease themselves, so the whole build coalesces
 *    into ONE entry (generationChatSeam.ts header).
 *  • generation.rooms — each engine opens its own batch, so k engines are k
 *    entries; an every-floor run is one per floor and only the run knows how
 *    many floors qualified (roomFinishChatSeam.ts).
 *  • generation.finish-chain — the chain's stages each own their entry, and how
 *    many stages actually ran is the engines' answer, not ours.
 */
function planStepUndoCost(
  commands: readonly BusCommandRef[],
): { readonly entries: number | null; readonly note?: string } {
  const only = commands.length === 1 ? commands[0] : undefined;
  if (only !== undefined) {
    switch (only.type) {
      case 'generation.building':
      case 'generation.apartment':
        return {
          entries: 1,
          note: 'the whole build coalesces into one entry under the generation lease',
        };
      case 'generation.rooms': {
        if (only.payload['allLevels'] === true) {
          return { entries: null, note: 'one entry per floor — the run reports how many floors it furnished' };
        }
        const steps = Array.isArray(only.payload['steps']) ? only.payload['steps'].length : 1;
        return steps > 1
          ? { entries: steps, note: 'each engine opens its own batch, so each is its own entry' }
          : { entries: steps };
      }
      case 'generation.finish-chain':
        return {
          entries: null,
          note: 'each stage of the chain is its own undo entry — the report names every stage that ran',
        };
      default:
        break;
    }
  }
  // ADR-0314, stated rather than assumed: N commands are N undo entries.
  return { entries: commands.length };
}

/** True for a step that GENERATES rooms, whose shipped auto-chain then finishes
 *  them by itself (apartment.layout-executed → ceilings + floor finishes →
 *  furniture → lighting). Used only to WARN — never to silently drop a step the
 *  user asked for. */
function generatesRooms(intent: string): boolean {
  return intent === 'generate-apartment-layout' || intent === 'generate-building';
}

function applyPlan(
  si: Extract<SemanticIntent, { intent: 'execute-plan' }>,
  ctx: ResolverContext,
): SemanticApplication {
  const refuse = (reason: string, suggestions: readonly string[] = []): SemanticApplication => ({
    kind: 'refusal', intent: 'execute-plan', reason, suggestions,
  });
  if (si.steps.length === 0) {
    return refuse('I did not find anything to do in that — say the steps separated by "then".');
  }
  if (si.steps.length === 1) {
    // A one-step "plan" is just a sentence; never wrap it in plan machinery.
    return applySemanticIntent(si.steps[0]!, ctx);
  }
  if (si.steps.length > PLAN_MAX_STEPS) {
    return refuse(
      `That is ${si.steps.length} steps in one sentence — I run up to ${PLAN_MAX_STEPS} so the ` +
      `confirmation stays readable. Nothing was changed; send it as two messages.`,
    );
  }

  let levels = ctx.levels;
  const stepReports: PlanStepReport[] = [];
  const commands: BusCommandRef[] = [];
  const notes: string[] = [];

  for (let i = 0; i < si.steps.length; i++) {
    const sub = si.steps[i]!;
    const clause = si.clauses[i]?.trim() ?? '';
    const where = `step ${i + 1}${clause.length > 0 ? ` — "${clause}"` : ''}`;
    if (sub.intent === 'execute-plan') {
      return refuse(`${where} is itself a plan — I run one plan at a time. Nothing was changed.`);
    }
    const applied = applySemanticIntent(sub, { ...ctx, levels });
    if (applied.kind === 'refusal') {
      // The step's OWN reason, verbatim — a plan may never soften or replace a
      // refusal the same sentence would get on its own. Only its "nothing was
      // changed" tail is dropped, because the plan says something stronger:
      // nothing ANYWHERE in the plan ran, including the steps before this one.
      const reason = applied.reason.replace(/\s*nothing was (?:changed|deleted|added|created)\.?\s*$/i, '');
      return refuse(`${where} — ${reason} Nothing in the plan was run.`, applied.suggestions);
    }
    if (applied.kind === 'local') {
      // undo / redo / switch level are view actions on the app, not model
      // mutations the plan can order and report on. Refusing is honest; faking
      // them into the command list would be a second dispatch path.
      return refuse(
        `${where} — "${applied.intent}" is something I do to the view, not a build step I can ` +
        `put in the middle of a plan. Nothing was changed; ask for it on its own.`,
      );
    }
    const cost = planStepUndoCost(applied.commands);
    stepReports.push({
      index: i + 1,
      clause,
      intent: applied.intent,
      summary: applied.summary,
      commandCount: applied.commands.length,
      destructive: applied.destructive,
      undoEntries: cost.entries,
      ...(cost.note !== undefined ? { undoNote: cost.note } : {}),
    });
    commands.push(...applied.commands);

    // ── The ONE projection ────────────────────────────────────────────────
    if (sub.intent === 'add-level') {
      const p = applied.commands.find((c) => c.type === 'level.add')?.payload;
      const id = p?.['levelId'];
      const name = p?.['name'];
      if (typeof id === 'string' && typeof name === 'string') {
        const elevation = p?.['elevation'];
        levels = [
          ...levels,
          { id, name, ...(typeof elevation === 'number' ? { elevation } : {}) },
        ];
      }
    }

    // Honest caveat, never a silent drop: the generators' shipped auto-chain
    // already runs the room-scale engines on what they generate, so a later
    // finishing step runs a second time over the same rooms.
    if (
      generatesRooms(applied.intent) &&
      si.steps.slice(i + 1).some((s) => s.intent === 'generate-room-finishes' || s.intent === 'finish-apartment-chain')
    ) {
      notes.push(
        `Step ${i + 1} generates rooms, and the shipped auto-chain already finishes them ` +
        `(ceilings → furniture → lighting). The finishing step after it runs a second time over the same rooms.`,
      );
    }
  }

  const totals = stepReports.map((s) => s.undoEntries);
  const known = totals.every((t): t is number => t !== null);
  const total = totals.reduce<number>((a, t) => a + (t ?? 0), 0);
  const undoCost = known
    ? `${stepReports.length} steps${total === stepReports.length ? '' : `, ${total} undo entries`} — Ctrl+Z ${undoTimes(total)}`
    : `${stepReports.length} steps, at least ${total} undo entries — Ctrl+Z steps back through them ` +
      `(${stepReports.filter((s) => s.undoEntries === null).map((s) => s.undoNote ?? 'the engine reports its own entries').join('; ')})`;

  return {
    kind: 'commands',
    intent: 'execute-plan',
    summary:
      `${stepReports.length} steps — ` +
      stepReports.map((s) => `${s.index}. ${s.summary}`).join(' · ') +
      `. ${undoCost}.` +
      (notes.length > 0 ? ` ${notes.join(' ')}` : ''),
    commands,
    // Destructive if ANY step is: the Confirm card is the weakest gate the plan
    // may have, never the weakest gate of its steps.
    destructive: stepReports.some((s) => s.destructive),
    plan: { steps: stepReports, undoCost, notes },
  };
}

// ─── Grammar (tier 0) ────────────────────────────────────────────────────────
//
// The matchers decide WHETHER a normalized utterance is claim-able and parse
// its entities into a SemanticIntent; applySemanticIntent (above) owns the
// semantics→command mapping and every safety guard.

const matchUndoRedo: Matcher = (text) => {
  if (/^undo( this| last( \w+)?)?$/.test(text)) {
    return { intent: 'undo' };
  }
  if (/^redo( this| last( \w+)?)?$/.test(text)) {
    return { intent: 'redo' };
  }
  return null;
};

const matchZoom: Matcher = (text) => {
  if (/^(zoom( to)? ?(fit|all|extents?)|fit (view|all|model|everything)|frame (all|model|everything))$/.test(text)) {
    return { intent: 'zoom-fit' };
  }
  if (/^(zoom( to| on)? (selected|selection|this)|frame (selected|selection|this))$/.test(text)) {
    return { intent: 'zoom-selected' };
  }
  return null;
};

const matchDeleteSelected: Matcher = (text) => {
  const m = /^delete (?:the )?(?:selected|selection|this)(?: (\w+))?$/.exec(text)
    ?? /^delete (?:the )?selected$/.exec(text);
  if (!m) return null;
  const noun = m[1];
  if (noun !== undefined && !ELEMENT_NOUNS.has(noun)) return null; // "delete this level" etc. — not this intent
  return { intent: 'delete-selected', ...(noun !== undefined ? { noun } : {}) };
};

// ─── §GATE-VIS-INTENT — the visibility grammars ──────────────────────────────
//
// SELECTION forms only, deliberately (see applyVisibilityIntent's header):
// "hide level 2", "hide all walls", "isolate level 2", "isolate doors higher
// than 2 meters" must all stay MISSES — the legacy QueryEngine visibility
// handlers serve them, and the 6b538355 regression set pins that. A bare
// SINGULAR noun ("hide the wall") is claimed and guarded against the
// selection; a bare PLURAL ("hide walls") is not, because it means the
// category, which is the legacy path's ask.

const VIS_SEL_REF = String.raw`(?:the )?(?:selected|selection|this|these|those)`;
const VIS_BARE_SINGULAR = String.raw`(?:the )?(wall|door|window|room|slab|roof|stair|column|beam|element|item|object)`;

const matchHideSelection: Matcher = (text) => {
  const m = new RegExp(String.raw`^hide ${VIS_SEL_REF}(?: (\w+))?$`).exec(text)
    ?? new RegExp(String.raw`^hide ${VIS_BARE_SINGULAR}$`).exec(text);
  if (!m) return null;
  const noun = m[1];
  if (noun !== undefined && !ELEMENT_NOUNS.has(noun)) return null; // "hide this level" — legacy path
  return { intent: 'hide-selection', ...(noun !== undefined ? { noun } : {}) };
};

const matchIsolateSelection: Matcher = (text) => {
  const m = new RegExp(String.raw`^isolate ${VIS_SEL_REF}(?: (\w+))?$`).exec(text)
    ?? new RegExp(String.raw`^isolate ${VIS_BARE_SINGULAR}$`).exec(text);
  if (!m) return null;
  const noun = m[1];
  if (noun !== undefined && !ELEMENT_NOUNS.has(noun)) return null; // "isolate this level" — legacy path
  return { intent: 'isolate-selection', ...(noun !== undefined ? { noun } : {}) };
};

const matchRevealAll: Matcher = (text) => {
  // "restore all" / "reset visibility" are deliberately NOT claimed — they are
  // the legacy QueryEngine restore vocabulary (and a live AIPanel pill).
  if (
    /^(?:reveal|unhide|show) (?:all|everything)(?: (?:hidden|again))?(?: ?(?:hidden )?elements)?$/.test(text)
    || /^reveal all hidden(?: elements)?$/.test(text)
    || /^(?:exit|end|clear|stop|cancel|leave) (?:the )?isolation(?: mode)?$/.test(text)
    || /^unisolate$/.test(text)
  ) {
    return { intent: 'reveal-all' };
  }
  // Per-element unhide has no bus carrier — claimed so it can be refused
  // HONESTLY (offering "reveal all") instead of falling to the LLM.
  const m = new RegExp(String.raw`^(?:unhide|reveal) ${VIS_SEL_REF}(?: (\w+))?$`).exec(text)
    ?? new RegExp(String.raw`^unhide ${VIS_BARE_SINGULAR}$`).exec(text);
  if (m) {
    const noun = m[1];
    if (noun !== undefined && !ELEMENT_NOUNS.has(noun)) return null;
    return { intent: 'reveal-all', onlySelection: true };
  }
  return null;
};

// §FEAT-RAC-PROPERTY-QUERY (L-2210) — the read-only DIMENSION question. The
// grammar itself is generated from `PROPERTY_QUERY_ROWS`, so a new queryable
// property costs ZERO lines here (the same discipline the delete, dimension and
// catalogue families already ride).
const matchPropertyQueryIntent: Matcher = (text) => {
  const property = matchPropertyQuery(text);
  return property === null ? null : { intent: 'property-query', property };
};

const matchVisibilityQuery: Matcher = (text) => {
  const TAIL = String.raw`(?: right now| here| in (?:this|the) view| currently)?`;
  if (
    new RegExp(String.raw`^what(?:'s| is) hidden${TAIL}$`).test(text)
    || new RegExp(String.raw`^(?:what|which) elements are hidden${TAIL}$`).test(text)
    || new RegExp(String.raw`^list (?:the )?hidden elements$`).test(text)
    || new RegExp(String.raw`^is anything hidden${TAIL}$`).test(text)
    || /^am i in isolation(?: mode)?$/.test(text)
  ) {
    return { intent: 'visibility-query', topic: 'hidden' };
  }
  // Specific-target questions ("is level 2 hidden?", "which walls are hidden
  // on level 2") are NOT claimed — the snapshot cannot answer them and a
  // count would not be the answer to the question asked.
  if (/^(?:what|which) levels are visible$/.test(text)) {
    return { intent: 'visibility-query', topic: 'levels' };
  }
  return null;
};

// ADR-0315 P1 — stair riser height / tread depth and room height offset.
// All three contain "height"/"depth" words, so they run BEFORE matchHeight.
const matchRiserHeight: Matcher = (text) => {
  const m = new RegExp(`^(?:set|change|make)(?: the)?(?: stair)? risers? height(?: to)? ${LEN_SRC}$`).exec(text);
  if (!m) return null;
  return { intent: 'set-riser-height', value: toMeters(m[1]!, m[2]) };
};

// ⭐ §FEAT-CHAT-BARE-TREAD (L-1443) — the founder types **"change tread to X"**,
// with no element noun and no dimension noun.
//
// This matcher required the literal "tread depth" or "going", so his sentence
// missed by ONE WORD and fell through to "I'm not sure how to help with that
// yet". The question the brief asked — *is a bare attribute sentence in scope?*
// — is answered YES here, and DELIBERATELY, for a reason that is specific to
// this word rather than a general relaxation:
//
//   • "tread" is UNAMBIGUOUS in this product's vocabulary. It names one thing on
//     one element kind, it is already in the resolver's typo-correction VOCAB,
//     and no other capability claims it.
//   • the sentence is SELECTION-scoped, so it cannot mass-edit anything: with
//     nothing selected `needSelection` refuses and NAMES what to do, and with a
//     non-stair selected `capabilityTargetRefusal` refuses by kind.
//
// ⛔ THE SAME IS NOT DONE FOR "riser". A bare "riser" is genuinely ambiguous
// between riser HEIGHT and riser COUNT — two different asks with two different
// units — and claiming it would mean guessing which. "riser height" keeps its
// noun, and a bare "riser" stays an honest miss. A relaxation that is safe for
// one word is not thereby safe for its neighbour.
const matchTreadDepth: Matcher = (text) => {
  const m = new RegExp(`^(?:set|change|make)(?: the)?(?: stair)? (?:tread depth|treads?|going)(?: to)? ${LEN_SRC}$`).exec(text);
  if (!m) return null;
  return { intent: 'set-tread-depth', value: toMeters(m[1]!, m[2]) };
};

const matchRoomHeightOffset: Matcher = (text) => {
  const m = new RegExp(`^(?:set|change|make)(?: the)?(?: room)? height offset(?: to)? ${LEN_SRC}$`).exec(text);
  if (!m) return null;
  return { intent: 'set-room-height-offset', value: toMeters(m[1]!, m[2]) };
};

// NOTE: sill-height must run BEFORE plain height ("sill height" contains "height").
const matchSillHeight: Matcher = (text) => {
  const m = new RegExp(`^(?:set|change|make)(?: the)?(?: window)? sill height(?: to)? ${LEN_SRC}$`).exec(text);
  if (!m) return null;
  return { intent: 'set-sill-height', value: toMeters(m[1]!, m[2]) };
};

// The optional element noun is deliberately broad ("set the ceiling height…",
// "set the slab thickness…"): WHICH kinds are legal is the registry guard's
// job inside applySemanticIntent, not the grammar's — a noun/selection mismatch
// gets an honest refusal, never a silent narrow miss.
const DIM_NOUN = String.raw`(?: wall| ceiling| slab| roof| door| window| stair| column| beam| selected)?`;

const matchHeight: Matcher = (text) => {
  const m =
    new RegExp(`^(?:set|change)(?: the)?${DIM_NOUN} height(?: of (?:this|the selection))?(?: to)? ${LEN_SRC}$`).exec(text)
    ?? new RegExp(`^make (?:this|the selection) ${LEN_SRC} (?:tall|high)$`).exec(text);
  if (!m) return null;
  return { intent: 'set-height', value: toMeters(m[1]!, m[2]) };
};

const matchThickness: Matcher = (text) => {
  const m =
    new RegExp(`^(?:set|change)(?: the)?${DIM_NOUN} thickness(?: to)? ${LEN_SRC}$`).exec(text)
    ?? new RegExp(`^make (?:this|the selection) ${LEN_SRC} thick$`).exec(text);
  if (!m) return null;
  return { intent: 'set-thickness', value: toMeters(m[1]!, m[2]) };
};

const matchWidth: Matcher = (text) => {
  const m =
    new RegExp(`^(?:set|change)(?: the)?${DIM_NOUN} width(?: to)? ${LEN_SRC}$`).exec(text)
    ?? new RegExp(`^make (?:this|the selection) ${LEN_SRC} wide$`).exec(text);
  if (!m) return null;
  return { intent: 'set-width', value: toMeters(m[1]!, m[2]) };
};

/**
 * RAC U7.1 — the ONE property matcher, compiled from the PROPERTY VOCABULARY.
 * Every entry's noun, synonyms, adjective forms and legal element nouns come
 * from the table, so a new property arrives with its phrasings and this
 * function never changes. The unit rule stays here (`toMeters`, ADR-0313
 * §Units): the table captures the digits, the resolver owns what they mean.
 */
const matchProperty: Matcher = (text) => {
  const hit = matchPropertyUtterance(text);
  if (hit === null) return null;
  // §FEAT-WINDOW-REVEAL-RAC (L-3202) — the table declares WHAT KIND of quantity
  // it captured; this line is where that declaration becomes a number.
  //
  // ⚠ `toMeters('15', undefined)` is 15 METRES. Before the reveal splays there
  // was no angle in this vocabulary and the conversion could be unconditional;
  // routing an angle through it would have sent "set the jamb splay to 15" to
  // the command as 15 — read by the C83 gate as 15° only by coincidence, and by
  // any millimetre-suffixed phrasing as 0.015. The measure is read from the
  // entry, never guessed from the unit suffix (an angle's suffix is optional).
  //
  // ⭐ §FEAT-REVEAL-DIRECTION-RAC (L-3414) — the ENUM arm, added for the same reason the
  // angle arm was: `toMeters('outdoor', undefined)` is NaN, and a NaN flowing on becomes a
  // refusal that names the wrong problem. The word is passed through VERBATIM and the
  // vocabulary's own `enumSpoken` table maps it — this line must not know the members, or
  // it becomes a second place a spelling can be accepted.
  return {
    intent: hit.id,
    value: hit.measure === 'enum'
      ? hit.raw
      : hit.measure === 'angle'
        ? parseFloat(hit.raw.replace(',', '.'))
        : toMeters(hit.raw, hit.unit),
  };
};

// §FEAT-CHAT-SYMMETRY — roof pitch, spoken in degrees.
const DEG_SRC = String.raw`(-?\d+(?:[.,]\d+)?)\s*(?:°|deg|degs|degree|degrees)?`;

const matchRoofPitch: Matcher = (text) => {
  const m = new RegExp(`^(?:set|change|make)(?: the)?(?: roof)? pitch(?: to)? ${DEG_SRC}$`).exec(text);
  if (!m) return null;
  return { intent: 'set-roof-pitch', degrees: parseFloat(m[1]!.replace(',', '.')) };
};

const matchRoomNumber: Matcher = (text) => {
  const m = /^(?:set|change)(?: the)?(?: room)? number(?: to| as)? (.+)$/.exec(text);
  if (!m) return null;
  const num = m[1]!.trim().replace(/^["']|["']$/g, '');
  return { intent: 'set-room-number', ...(num.length > 0 ? { number: num } : {}) };
};

// §FEAT-CHAT-ROOM-OCCUPANCY — the founder's sentence and its family.
//
// Four shapes, ONE intent. `occupancyRef` is forwarded RAW: the spec's value
// stage owns resolution and the refusal copy, so the grammar never has two
// opinions about what a room use is.
//
// ── WHAT CLAIMS THE UTTERANCE (the anti-nibbling rule) ──────────────────────
//
// Shapes A–C name a ROOM explicitly ("room 001"), which is claim enough — an
// unknown use word must reach the value stage so the user gets the vocabulary
// listed back, not a blank "I'm not sure how to help with that". Shape D is the
// SELECTION form, and its bare variant ("make this a bathroom") is shaped like
// half the grammars in this file, so it claims ONLY when the word really
// resolves; the explicit variant ("set the occupancy to …") names the property
// and so claims unconditionally.
//
// A room reference becomes the U3 `{kind:'room', roomRef}` spatial scope — the
// SAME channel the wall-colour grammar uses for "in the kitchen" — so the
// editor's injected resolver does the store lookup and this module stays pure.

/** A room reference as spoken: "001", "00-001", "2", "kitchen", "002 and 003". */
const ROOM_REF_SRC = String.raw`([\w][\w .,&-]*?)`;
/** A room use as spoken — anything; the value stage decides if it is real. */
const OCCUPANCY_SRC = String.raw`(.+?)`;

/** "make room 001 a bathroom" · "set room 002 to bedroom" · "change rooms 002 and 003 into bedrooms" */
const ROOM_OCC_NAMED_RE = new RegExp(
  `^(?:make|set|change|turn|assign) (?:the )?rooms? ${ROOM_REF_SRC}` +
  ` (?:(?:in)?to |as |an? |the )+${OCCUPANCY_SRC}$`,
);
/** "i want a bathroom in room 001" · "put a bedroom in rooms 002 and 003" */
const ROOM_OCC_IN_RE = new RegExp(
  `^(?:i (?:want|need|would like) |please |can you |could you )*(?:put |add |make |place )?` +
  `(?:an? |the )?${OCCUPANCY_SRC} in (?:the )?rooms? ${ROOM_REF_SRC}$`,
);
/** "room 001 is a bathroom" · "room 002 should be a bedroom" */
const ROOM_OCC_IS_RE = new RegExp(
  `^(?:the )?rooms? ${ROOM_REF_SRC} (?:is|are|should be|becomes?|will be) (?:an? |the )?${OCCUPANCY_SRC}$`,
);
/** SELECTION, explicit property — claims even when the use word is unknown. */
const ROOM_OCC_PROP_RE =
  /^(?:set|change|make) (?:the |this |these )?(?:rooms? )?(?:occupancy|room use|use|usage|function|programme|program)(?: (?:to|as|into))? (?:an? |the )?(.+)$/;
/** "make rooms 002 and 003 bedrooms" — no connector; split by meaning. */
const ROOM_OCC_BARE_RE = /^(?:make|set|change|turn|assign) (?:the )?rooms? (.+)$/;
/** SELECTION, bare — claims ONLY when the use word resolves. */
const ROOM_OCC_SEL_RE =
  /^(?:make|set|change|turn) (?:this|these|it|them|the selection|the selected rooms?|the rooms?)(?: rooms?)?(?: (?:in)?to| as)? (?:an? |the )?(.+)$/;

/** Trim quotes/punctuation off a captured phrase. */
function cleanCapture(raw: string): string {
  return raw.trim().replace(/^["']|["']$/g, '').replace(/[.!?]+$/, '').trim();
}

const matchRoomOccupancy: Matcher = (text) => {
  const named = ROOM_OCC_NAMED_RE.exec(text) ?? ROOM_OCC_IS_RE.exec(text);
  if (named) {
    const roomRef = cleanCapture(named[1]!);
    const occupancyRef = cleanCapture(named[2]!);
    if (roomRef.length > 0 && occupancyRef.length > 0) {
      return { intent: 'set-room-occupancy', occupancyRef, scope: { kind: 'room', roomRef } };
    }
  }
  const inForm = ROOM_OCC_IN_RE.exec(text);
  if (inForm) {
    const occupancyRef = cleanCapture(inForm[1]!);
    const roomRef = cleanCapture(inForm[2]!);
    // The "X in room Y" shape overlaps every other "… in the <room>" grammar
    // in this file (wall colour, deletes). The use word must RESOLVE for this
    // to be a room-use sentence rather than "make all walls white in room 001".
    if (roomRef.length > 0 && resolveOccupancyRef(occupancyRef) !== null) {
      return { intent: 'set-room-occupancy', occupancyRef, scope: { kind: 'room', roomRef } };
    }
  }
  const prop = ROOM_OCC_PROP_RE.exec(text);
  if (prop) {
    const occupancyRef = cleanCapture(prop[1]!);
    // Named property ⇒ claim unconditionally, so an unknown word is REFUSED
    // with the vocabulary rather than silently missing.
    if (occupancyRef.length > 0) {
      return { intent: 'set-room-occupancy', occupancyRef, scope: 'selection' };
    }
  }
  // The CONNECTOR-LESS form: "make rooms 002 and 003 bedrooms". There is no
  // "to"/"as"/"a" to split on, so the split is found by MEANING — the longest
  // trailing phrase that resolves to a real room use wins, and the rest is the
  // room reference. Deliberately AFTER the explicit-property form above, or
  // "set the room use to kitchen" would be read as a room called "use to".
  const bare = ROOM_OCC_BARE_RE.exec(text);
  if (bare) {
    const words = cleanCapture(bare[1]!).split(/\s+/).filter((w) => w.length > 0);
    // i ascending ⇒ the LONGEST candidate use is tried first, so "living room"
    // is preferred over the bare "room" it ends with.
    for (let i = 1; i < words.length; i += 1) {
      const roomRef = cleanCapture(words.slice(0, i).join(' '));
      const occupancyRef = cleanCapture(words.slice(i).join(' '));
      if (roomRef.length > 0 && resolveOccupancyRef(occupancyRef) !== null) {
        return { intent: 'set-room-occupancy', occupancyRef, scope: { kind: 'room', roomRef } };
      }
    }
  }
  const sel = ROOM_OCC_SEL_RE.exec(text);
  if (sel) {
    const occupancyRef = cleanCapture(sel[1]!);
    if (occupancyRef.length > 0 && resolveOccupancyRef(occupancyRef) !== null) {
      return { intent: 'set-room-occupancy', occupancyRef, scope: 'selection' };
    }
  }
  return null;
};

// ─── §L-1032 — "move the slab to level 2" ────────────────────────────────────
//
// The founder's three phrasings, verbatim from the report:
//
//   "move the slab to level 2"            — FORM A, the move verb
//   "change this wall's level to Ground"   — FORM B, the possessive
//   "move slab from Level 1 to Level 2"    — FORM A with a STATED origin
//
// WHAT IT MUST NOT CLAIM, and how each is declined:
//
//   "move the wall 2m to the left"  — FORM A matches structurally, so the
//        DESTINATION must be level-shaped (it names a storey noun, is a bare
//        number, or resolves against the project's own level list) or this is a
//        miss. A miss is the right answer: it lets the `position` unconnected
//        topic answer honestly that planar moving is not connected, which is
//        still true. Claiming it would produce "No level called 'the left'".
//   "change the floor to oak"       — FORM B matches structurally ("floor to"),
//        so the HEAD must reduce to a real element reference (a known family
//        noun, or a demonstrative / "selected"). "the" reduces to nothing and
//        the sentence is declined, leaving the finish grammars untouched.
//   "move all walls to level 2"     — CLAIMED, and REFUSED by name. The arm
//        moves the SELECTION; silently re-reading "all" as "the selection" and
//        reporting success is precisely the over-claim §L-995…L-998 were.
//
// The level-name lookup is `findLevel` — the SAME authority `go-to-level` and
// `duplicate-level` use. There is no second level resolver here (C84 EI-9).
const MTL_LEVEL_NOUN = String.raw`(?:levels?|storeys?|stories|story|floors?)`;
const MTL_MOVE_VERB = String.raw`(?:move|put|send|relocate|transfer)`;
const MTL_EDIT_VERB = String.raw`(?:change|set|update|switch|reassign|move)`;

/** "change the level of this slab [from level 1] to level 2". */
const MTL_LEVEL_OF_RE = new RegExp(
  `^${MTL_EDIT_VERB}\\s+(?:the\\s+)?${MTL_LEVEL_NOUN}\\s+of\\s+(.+?)\\s+(?:from\\s+(.+?)\\s+)?to\\s+(.+)$`,
);
/** "change this wall's level [from level 1] to ground". */
const MTL_POSSESSIVE_RE = new RegExp(
  `^${MTL_EDIT_VERB}\\s+(.+?)(?:'s|s')?\\s+${MTL_LEVEL_NOUN}\\s+(?:from\\s+(.+?)\\s+)?to\\s+(.+)$`,
);
/** "move the slab [from level 1] to level 2". */
const MTL_MOVE_RE = new RegExp(
  `^${MTL_MOVE_VERB}\\s+(.*?)(?:\\s+from\\s+(.+?))?\\s+(?:on ?to|over to|up to|down to|into|onto|to|on)\\s+(.+)$`,
);

/** Words that carry no element identity — stripped before a head is read as a
 *  family noun. "elements" is here on purpose: "move the selected elements to
 *  level 2" names no family and must not be checked against one. */
const MTL_HEAD_NOISE =
  /\b(?:the|a|an|this|that|these|those|my|its|it|them|selected|selection|currently|of|element|elements|item|items|object|objects)\b/g;

/** Scope words the SELECTION cannot honour — see the header. */
const MTL_ALL_SCOPE = /\b(?:all|every|each|whole|entire)\b/;

/** A head that is a real element reference: a family noun, or a demonstrative
 *  that means "what is selected". Form B needs one; without it "change the
 *  floor to oak" would be read as a storey change. */
const MTL_DEMONSTRATIVE = /\b(?:this|that|these|those|it|them|selected|selection)\b/;

function mtlNoun(head: string): string | undefined {
  const cleaned = head
    .replace(MTL_HEAD_NOISE, ' ')
    .replace(MTL_ALL_SCOPE, ' ')
    .replace(/[^a-z\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length === 0) return undefined;
  // Multi-word families are hyphenated ("curtain wall" → "curtain-wall"), which
  // is the spelling `normalizeElementKind` and the register's `panelTypes`
  // already agree on. An unknown noun is simply IGNORED by the arm, never a
  // guess — the family verdict comes from the selection in that case.
  return singular(cleaned.replace(/\s+/g, '-'));
}

/** Strip a leading storey noun off a level reference ("level 2" → "2"). */
function mtlLevelQuery(raw: string): string {
  return raw
    .trim()
    .replace(/^the\s+/, '')
    .replace(new RegExp(`^${MTL_LEVEL_NOUN}\\s*`), '')
    .trim();
}

/**
 * Parse a level-change ask into the semantic intent — SHARED by the tier-0
 * grammar and (via `resolveUtteranceIntent`) the compound-plan executor, so the
 * rigid and natural paths cannot read the sentence differently.
 */
export function parseMoveToLevelIntent(
  text: string,
  ctx: ResolverContext,
): Extract<SemanticIntent, { intent: 'move-to-level' }> | null {
  const t = text.trim().replace(/[.?!]+$/, '');

  let head: string;
  let fromRaw: string | undefined;
  let destRaw: string;
  let form: 'move' | 'edit';

  const ofForm = MTL_LEVEL_OF_RE.exec(t);
  const possForm = ofForm === null ? MTL_POSSESSIVE_RE.exec(t) : null;
  const moveForm = ofForm === null && possForm === null ? MTL_MOVE_RE.exec(t) : null;

  if (ofForm !== null) {
    head = ofForm[1]!; fromRaw = ofForm[2]; destRaw = ofForm[3]!; form = 'edit';
  } else if (possForm !== null) {
    head = possForm[1]!; fromRaw = possForm[2]; destRaw = possForm[3]!; form = 'edit';
  } else if (moveForm !== null) {
    head = moveForm[1]!; fromRaw = moveForm[2]; destRaw = moveForm[3]!; form = 'move';
  } else {
    return null;
  }

  const levelQuery = mtlLevelQuery(destRaw);
  if (levelQuery.length === 0) return null;

  const noun = mtlNoun(head);

  const destNamesLevel = new RegExp(`(?:^|\\s)${MTL_LEVEL_NOUN}(?:\\s|$)`).test(destRaw);
  const destLooksLikeLevel =
    destNamesLevel || /^\d+$/.test(levelQuery) || findLevel(levelQuery, ctx.levels) !== undefined;

  if (form === 'edit') {
    // The sentence already carries the storey noun structurally, so what it
    // needs is proof that the storey noun is the SUBJECT and not the object:
    //
    //   "change this slab's level to level 1" — the head names a FAMILY. Claim.
    //   "change its level to level 2"         — the head is a demonstrative AND
    //                                           the destination is level-shaped.
    //                                           Claim.
    //   "change this floor to oak"            — bare demonstrative, and "oak" is
    //                                           no level. MISS, and the slab-type
    //                                           grammar gets the sentence.
    //
    // Measured 2026-08-19: without the second clause this parser claimed
    // "change this floor to oak" and refused it with "No level called oak" — a
    // manufactured refusal over a working catalogue ask.
    const namesFamily = noun !== undefined && levelChangeKnownKinds().includes(noun);
    if (!namesFamily && !(MTL_DEMONSTRATIVE.test(head) && destLooksLikeLevel)) return null;
  } else {
    // FORM A carries no storey noun of its own, so the DESTINATION has to be
    // level-shaped — matchGoToLevel's discipline, for the same reason.
    if (!destLooksLikeLevel) return null;
  }

  return {
    intent: 'move-to-level',
    levelQuery,
    ...(fromRaw !== undefined && mtlLevelQuery(fromRaw).length > 0
      ? { fromLevelQuery: mtlLevelQuery(fromRaw) }
      : {}),
    ...(noun !== undefined ? { nounRef: noun } : {}),
    ...(MTL_ALL_SCOPE.test(head) ? { projectScopeAsked: true } : {}),
  };
}

const matchMoveToLevel: Matcher = (text, ctx) => parseMoveToLevelIntent(text, ctx);

const matchGoToLevel: Matcher = (text, ctx) => {
  const m = /^(?:go to|open|show) (?:the )?(?:level|levels)?\s*(.+)$/.exec(text);
  if (!m) return null;
  let target = m[1]!.trim().replace(/^the /, '');
  // Only claim this utterance if it is level-shaped: "level ..." mentioned,
  // a bare number, or an exact level-name match. Otherwise it's a miss
  // ("show walls" must not become a level switch).
  const mentionedLevel = /(?:^|\s)levels?(?:\s|$)/.test(text);
  target = target.replace(/^levels?\s*/, '');
  const byName = ctx.levels.find((l) => l.name.toLowerCase() === target);
  if (byName === undefined && !mentionedLevel && !/^\d+$/.test(target)) return null;
  return { intent: 'go-to-level', levelQuery: target };
};

// ADR-0315 U5a — "duplicate the ground floor to levels 2, 3 and 4".
// Claims only level-shaped sources: an element noun in the source position
// ("copy this wall to …") is someone else's sentence and stays a miss.
// SHARED by the tier-0 grammar and the NL classifier (the parseWallTypeIntent
// pattern), so the rigid and natural paths cannot read the sentence differently.
export function parseDuplicateLevelIntent(
  text: string,
): Extract<SemanticIntent, { intent: 'duplicate-level' }> | null {
  const m = /^(?:duplicate|copy|replicate|clone)(?: the)? (?:(?:level|floor) )?(.+?) (?:to|onto) (?:the )?(.+?)[.?!]?$/.exec(text);
  if (!m) return null;
  const source = m[1]!.trim().replace(/^the /, '').replace(/^(?:level|floor)\s*/, '');
  if (/\b(?:walls?|doors?|windows?|rooms?|slabs?|roofs?|stairs?|columns?|beams?|elements?|furniture|selection|selected|this)\b/.test(source)) {
    return null;
  }
  const targetQueries = m[2]!
    .trim()
    .split(/\s*(?:,|\band\b|&)\s*/)
    .map((t) => t.trim().replace(/^(?:levels?|floors?)\s*/, ''))
    .filter((t) => t.length > 0);
  if (targetQueries.length === 0) return null;
  return { intent: 'duplicate-level', sourceQuery: source, targetQueries };
}

const matchDuplicateLevel: Matcher = (text) => parseDuplicateLevelIntent(text);

const matchAddLevel: Matcher = (text) => {
  const m = new RegExp(`^(?:add|create)(?: a| a new| new)? level(?: (?:at|@) ${LEN_SRC})?$`).exec(text);
  if (!m) return null;
  return { intent: 'add-level', ...(m[1] !== undefined ? { elevation: toMeters(m[1], m[2]) } : {}) };
};

const NUM = String.raw`(-?\d+(?:[.,]\d+)?)`;
const PT = String.raw`\(?\s*${NUM}\s*,\s*${NUM}\s*\)?`;

const matchCreateWall: Matcher = (text) => {
  const withCoords = new RegExp(
    `^(?:create|draw|add)(?: a| a new| new)? wall(?: from)? ${PT}\\s*(?:to|-|->)\\s*${PT}` +
    `(?:,? (?:with )?height(?: of)? ${LEN_SRC})?(?:,? (?:with )?thickness(?: of)? ${LEN_SRC})?$`,
  ).exec(text);
  if (withCoords) {
    const num = (s: string): number => parseFloat(s.replace(',', '.'));
    return {
      intent: 'create-wall',
      start: { x: num(withCoords[1]!), z: num(withCoords[2]!) },
      end: { x: num(withCoords[3]!), z: num(withCoords[4]!) },
      ...(withCoords[5] !== undefined ? { height: toMeters(withCoords[5], withCoords[6]) } : {}),
      ...(withCoords[7] !== undefined ? { thickness: toMeters(withCoords[7], withCoords[8]) } : {}),
    };
  }
  if (/^(?:create|draw|add)(?: a| a new| new)? wall(?: here)?$/.test(text)) {
    return { intent: 'create-wall' };
  }
  return null;
};

const matchRenameRoom: Matcher = (text) => {
  const m = /^(?:rename|call)(?: this| the| the selected)? room(?: to| as)? (?:"([^"]+)"|(.+))$/.exec(text);
  if (!m) return null;
  const rawName = (m[1] ?? m[2] ?? '').trim();
  return { intent: 'rename-room', ...(rawName.length > 0 ? { name: rawName } : {}) };
};

// §FEAT-CHAT-WALL-TYPE — "make all walls interior partition" and its family.
//
// The scope word is REQUIRED and never inferred: "all/every" ⇒ the whole
// project, "these/selected" ⇒ the selection. There is no third reading in which
// a bare "make walls interior partition" quietly retypes the building.
const WALL_SCOPE_ALL = String.raw`(?:all|every|each)`;
const WALL_SCOPE_SEL = String.raw`(?:these|those|selected|this)`;
const WALL_TYPE_VERB = String.raw`(?:make|change|set|switch|convert|turn|retype|update)`;

// ─── RAC U8.1 — the shared FILTER lift ───────────────────────────────────────
//
// Every batch grammar below runs against text that has already had its filter
// clauses LIFTED OUT (see FilterScope.ts for why that is a pre-strip and not
// six more capture groups per capability). The lift is the FIRST thing each
// parser does and `withFilters` is the LAST — so a filter composes with every
// scope form the grammar already understood, in either word order, with no
// per-capability code.
function withFilters(base: IntentScope, filters: readonly ElementFilter[]): IntentScope {
  if (filters.length === 0) return base;
  // `base` is never itself a filter here — the lift runs exactly once.
  return { kind: 'filter', base: base as 'all' | 'selection' | IntentSpatialScope, filters };
}

const WALL_TYPE_RE = new RegExp(
  `^${WALL_TYPE_VERB}(?: over)? (?:the )?(${WALL_SCOPE_ALL}|${WALL_SCOPE_SEL})(?: of)?(?: the)? walls?` +
  `(?: over)?(?: (?:to|into|as|be))? (?:the )?(?:wall )?(?:system )?(?:type )?(?:a |an |the )?(.+)$`,
);

/**
 * Parse "make all walls interior partition" and its family into the semantic
 * intent — SHARED by the tier-0 grammar and the NL classifier, so the natural
 * and rigid paths cannot understand the sentence differently.
 *
 * Returns null (a miss) rather than guessing when the scope word is absent:
 * "make walls interior partition" could mean the project or the selection, and
 * on a project-wide retype that is not a coin worth flipping.
 */
export function parseWallTypeIntent(
  text: string,
  ctx?: ResolverContext,
): Extract<SemanticIntent, { intent: 'set-wall-type' }> | null {
  const catalogue = ctx?.resolveWallSystemType;
  // ⭐⭐ §FIX-SELF-REFERENTIAL-TYPE-NAME (L-10100) — the wall twin of the guard
  // in `makeHostedTypeParser`, and NOT a precaution: measured 2026-08-23,
  // "make all walls Custom Wall Type" produced typeRef **"type"** here, on the
  // very grammar whose refusal copy is the founding incident's. See
  // `FilterScope.liftTypeFilter`'s header for the mechanism. Reading the
  // sentence exactly as typed wins whenever the project's own catalogue claims
  // the tail; everything else falls through to the filter-lifted path below,
  // byte-identical to before.
  const raw = wallTypeShape(text);
  if (raw !== null && catalogue !== undefined && catalogue(raw.typeRef) !== null) {
    return { intent: 'set-wall-type', typeRef: raw.typeRef, scope: raw.base };
  }
  const lifted = parseFilterClauses(text, 'wall', catalogue);
  const hit = lifted.stripped === text ? raw : wallTypeShape(lifted.stripped);
  if (hit === null) return null;
  return {
    intent: 'set-wall-type',
    typeRef: hit.typeRef,
    scope: withFilters(hit.base, lifted.filters),
  };
}

/** The wall-type GRAMMAR half, run against ONE spelling of the sentence — see
 *  `parseWallTypeIntent` for why the raw and the filter-lifted spellings are
 *  both offered to it, and `makeHostedTypeParser.runShape` for its twin. */
function wallTypeShape(text: string): { typeRef: string; base: 'all' | 'selection' } | null {
  const m = WALL_TYPE_RE.exec(text);
  if (!m) return null;
  const scopeWord = m[1]!;
  const typeRef = m[2]!.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ');
  if (typeRef.length === 0) return null;
  // "make all walls 3m tall" is a DIMENSION ask, not a type ask — never claim it.
  if (/\b(?:tall|high|thick|wide|taller|thicker|wider|height|thickness|width|long)\b/.test(typeRef)) return null;
  if (/^\d/.test(typeRef)) return null;
  // ⭐⭐ §FIX-RAKE-SWALLOWED-AS-TYPE (L-1370) — AND THE ASYMMETRY WAS THE PROOF.
  //
  // Founder-reported, production: he typed **"make all walls on level 3 raked 90
  // dregress"** (his typo for *degrees*) and the product answered
  //
  //   "There is no wall type called "on level 3 raked 90 dregres" in this
  //    project. The wall types here are: Monolithic (Default), … Try: "change
  //    all walls to monolithic (default)""
  //
  // A sentence carrying the word "raked" and a number, answered CONFIDENTLY as a
  // catalogue miss. The rake grammar declined it correctly (the unit is neither
  // recognised nor end-of-string), and this parser then swallowed the whole tail
  // as a type NAME. **Being confidently wrong is worse than refusing** (C68 §7).
  //
  // The line above proves this is a GAP, not a design: DIMENSION words were
  // already guarded here, and `DimensionFamilies` declines rake words for the
  // mirror-image reason — *"a near-miss must never resolve as a resize:
  // rake/pitch carry numbers too."* One grammar protected itself from the other;
  // the other did not reciprocate.
  //
  // ⛔ DERIVED, NOT TRANSCRIBED. This is the SAME `OTHER_CAPABILITY_WORD` the
  // dimension grammar tests — imported, so a word added there is a word declined
  // here, and `wall-rake-near-miss.test.ts` pins that equivalence rather than a
  // comment asking the next author to remember it (C84 EI-8a).
  //
  // Scoped to `typeRef`, exactly like the dimension guard beside it: what is
  // being judged is the CANDIDATE TYPE NAME, not the whole sentence.
  if (OTHER_CAPABILITY_WORD.test(typeRef)) return null;
  return {
    typeRef,
    base: new RegExp(`^${WALL_SCOPE_ALL}$`).test(scopeWord) ? 'all' : 'selection',
  };
}

const matchWallType: Matcher = (text, ctx) => parseWallTypeIntent(text, ctx);

// §FEAT-WALL-COLOR-BATCH (ADR-0314) — "make all walls white" and its family.
//
// Same explicit-scope discipline as the type grammar. The verb set adds
// paint/colour, which are colour-SPECIFIC: with those verbs an unresolvable
// colour still CLAIMS the utterance (the user unambiguously asked for colour,
// so the honest answer is a colour refusal listing real options, not a fall-
// through into the type grammar's "no such wall type" confusion). With the
// shared verbs (make/set/change/turn) the parser claims only what the colour
// table resolves, so "make all walls interior partition" still reaches the
// type matcher untouched.
const WALL_COLOR_VERB = String.raw`(make|paint|colou?r|set|change|turn)`;

const WALL_ORIENTATION_ADJ = String.raw`(?:(north|south|east|west)[- ]facing )?(?:exterior )?`;
const ORIENTATION_TO_COMPASS: Readonly<Record<string, Compass4>> = { north: 'N', south: 'S', east: 'E', west: 'W' };
// COMPASS_WORD lives in CapabilityExecutionSpec.ts now — the generic arm owns
// the orientation-phrase copy; the grammar only maps words → Compass4 above.

const WALL_COLOR_RE = new RegExp(
  `^${WALL_COLOR_VERB} (?:the )?(${WALL_SCOPE_ALL}|${WALL_SCOPE_SEL})(?: of)?(?: the)? ${WALL_ORIENTATION_ADJ}walls?` +
  // ADR-0315 U3 — optional LEVEL scope ("… on level 2 …") or ROOM scope
  // ("… in the kitchen …" — 'the' required, so the bare connector "in white"
  // stays a colour connector; a lookahead keeps "in the colour white" out).
  `(?: on (?:the )?(?:levels?|floors?)?\\s*([\\w .-]+?)| in the (?!colou?r )([\\w .-]+?))?` +
  `(?: (?:to|into|in|as|be))? (?:the )?(?:colou?r )?(.+)$`,
);

/**
 * Parse "make all walls white" / "paint the selected walls light grey" /
 * "make all walls on level 2 white" into the semantic intent — SHARED by the
 * tier-0 grammar and the NL classifier, like `parseWallTypeIntent`. Returns
 * null when the scope word is absent or (for the non-colour-specific verbs)
 * the trailing text is not a known colour.
 */
export function parseWallColorIntent(
  text: string,
  ctx?: ResolverContext,
): Extract<SemanticIntent, { intent: 'set-wall-color' }> | null {
  const lifted = parseFilterClauses(text, 'wall', ctx?.resolveWallSystemType);
  const m = WALL_COLOR_RE.exec(lifted.stripped);
  if (!m) return null;
  const verb = m[1]!;
  const scopeWord = m[2]!;
  const orientationWord = m[3];
  const levelQuery = m[4]?.trim();
  const roomRef = m[5]?.trim();
  const colorRef = m[6]!.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ');
  if (colorRef.length === 0) return null;
  const colorSpecificVerb = verb === 'paint' || verb.startsWith('colo');
  if (!colorSpecificVerb && resolveColorRef(colorRef) === null) return null;
  // ⭐ §FIX-RAKE-SWALLOWED-AS-TYPE (L-1370), the AUDIT arm — the colour grammar
  // swallowed the same near-miss one capability over, and it was found by
  // MEASUREMENT rather than by reasoning about the wall-type fix:
  //
  //   "paint all walls raked 90 dregress"
  //     → refusal set-wall-color, 'I don't know the colour "raked 90 dregress"'
  //
  // The colour-specific verbs (paint/colour) deliberately CLAIM an unresolvable
  // ref so an unknown colour gets a colour refusal listing real options — that
  // rule is right and is untouched. What it must not do is claim a ref whose
  // words belong to ANOTHER capability: "paint all walls angled by 70 degrees"
  // is a rake ask with the wrong verb, and answering it with a colour list is
  // the founder's defect wearing a different hat. The catalogue-style ordering
  // is preserved — a ref the COLOUR TABLE resolves still wins, so a colour that
  // one day contains one of these words keeps working.
  if (OTHER_CAPABILITY_WORD.test(colorRef) && resolveColorRef(colorRef) === null) return null;
  // Spatial phrases compose with the ALL scope ("all walls on level 2 / in
  // the kitchen" / "all south-facing walls"); combining them with
  // "these/selected" would contradict the live selection and is not claimed.
  const isAll = new RegExp(`^${WALL_SCOPE_ALL}$`).test(scopeWord);
  const base = wallScopeBase(isAll, orientationWord, levelQuery, roomRef);
  if (base === null) return null;
  return { intent: 'set-wall-color', colorRef, scope: withFilters(base, lifted.filters) };
}

/** The ONE mapping from the shared spatial captures (orientation / level /
 *  room, byte-identical across the colour and rake grammars) to the intent
 *  scope. Spatial phrases compose with the ALL scope only — combining them
 *  with "these/selected" would contradict the live selection, and that is not
 *  claimed. Returns null for that non-claim. */
function wallScopeBase(
  isAll: boolean,
  orientationWord: string | undefined,
  levelQuery: string | undefined,
  roomRef: string | undefined,
): 'all' | 'selection' | IntentSpatialScope | null {
  const spatial: IntentSpatialScope | undefined =
    levelQuery !== undefined && levelQuery.length > 0
      ? { kind: 'level', levelQuery }
      : roomRef !== undefined && roomRef.length > 0
        ? { kind: 'room', roomRef }
        : undefined;
  return wallSpatialScopeBase(isAll, orientationWord, spatial);
}

/** The same ruling, taking an ALREADY-CLASSIFIED spatial scope — what
 *  `SpatialScopeTail.readSpatialTail` hands back. `wallScopeBase` above is the
 *  string-captures shim for the grammars that still classify their own tail;
 *  both reach THIS function, so the ALL-scope-only rule has one statement. */
function wallSpatialScopeBase(
  isAll: boolean,
  orientationWord: string | undefined,
  spatial: IntentSpatialScope | undefined,
): 'all' | 'selection' | IntentSpatialScope | null {
  if (orientationWord !== undefined) {
    return isAll ? { kind: 'orientation', orientation: ORIENTATION_TO_COMPASS[orientationWord]! } : null;
  }
  if (spatial !== undefined) return isAll ? spatial : null;
  return isAll ? 'all' : 'selection';
}

const matchWallColor: Matcher = (text, ctx) => parseWallColorIntent(text, ctx);

// §FEAT-WALL-RAKE-BATCH (ADR-0315, founder ask #1) — "make all walls angled by
// 120 degrees" and its family.
//
// Two shapes share one intent:
//   • make/set + adjective — "make the selected walls angled by 70",
//     "set all walls on level 2 tilted to 60 degrees", "make all walls vertical";
//   • rake-verb-led — "tilt all walls by 70", "angle the selected walls to 100°",
//     "rake all walls in the kitchen by 75 degrees".
// The rake words (angled/tilted/leaning/raked/slanted + vertical/upright) are
// what claims the utterance, so the colour and type grammars are never nibbled
// at.
//
// ⭐ §FIX-RAKE-SCOPE-TAIL (L-1372) — THE FOURTH SPELLING OF THE SCOPE TAIL.
//
// The local `WALL_RAKE_SCOPE` stood here:
//
//   (?: on (?:the )?(?:levels?|floors?)?\s*([\w .-]+?)| in the ([\w .-]+?))?
//
// — `on` hard-wired to LEVEL and `in` hard-wired to ROOM, which is the exact
// defect L-1201 removed from the dimension and creation grammars and L-1261
// removed from the wall-finish grammar. **"make all walls in level 3 vertical"
// therefore read a ROOM called "level"** here while the identical phrase had
// been working for months elsewhere, and the founder's habitual preposition is
// the one that was broken. It now shares `SPATIAL_TAIL_SRC`, so there is no
// fifth spelling to fix next time.
//
// What that buys beyond `in`: `at`/`inside`/`within`, "this floor"/"the current
// level" (via the injected context), bare storey names ("the basement"), and
// the trailing-noun rejoin ("the ground floor" comes back WHOLE rather than as
// "ground"). What it does NOT change is how much is claimed — a sentence with
// no place phrase is still not claimed, and a place that cannot be resolved is
// DECLINED rather than widened to the whole project (C68 §7.d).
const WALL_RAKE_ANGLE = String.raw`(?:by|to|at)? ?(-?\d+(?:\.\d+)?) ?(?:°|º|degrees?|degs?|([a-z][\w-]*))?`;

const WALL_RAKE_ADJ_RE = new RegExp(
  `^(?:make|set) (?:the )?(${WALL_SCOPE_ALL}|${WALL_SCOPE_SEL}) ${WALL_ORIENTATION_ADJ}walls?${SPATIAL_TAIL_SRC}` +
  ` (?:(?:angled|tilted|leaning|leant|raked|slanted) ${WALL_RAKE_ANGLE}|(vertical|upright|straight))$`,
);
const WALL_RAKE_VERB_RE = new RegExp(
  `^(?:angle|tilt|lean|rake|slant) (?:the )?(${WALL_SCOPE_ALL}|${WALL_SCOPE_SEL}) ${WALL_ORIENTATION_ADJ}walls?${SPATIAL_TAIL_SRC}` +
  ` ${WALL_RAKE_ANGLE}$`,
);

/**
 * Parse the rake family into the semantic intent — SHARED by the tier-0
 * grammar and the NL classifier, like `parseWallColorIntent`. Returns null
 * when no rake word appears; out-of-range ANGLES still parse (the apply arm
 * owns the range refusal, so "angled by 200" gets a real answer, not a miss).
 *
 * ⭐⭐ §FIX-RAKE-UNIT-UNRECOGNISED (L-1371) — AND A BAD UNIT NOW REFUSES BY NAME.
 *
 * The founder typed **"make all walls on level 3 raked 90 dregress"**. The unit
 * was neither recognised nor absent, so the angle tail did not reach `$`, this
 * grammar DECLINED, and the sentence fell into the wall-TYPE grammar, which
 * answered *'There is no wall type called "on level 3 raked 90 dregres"'*.
 *
 * That sentence is **recognised-but-underspecified**: rake word ✓, number ✓,
 * unit unknown. `parseWallSideFinishIntent`'s UNRECOGNISED TAIL already carries
 * the house doctrine for exactly this state — CLAIM it, then refuse QUOTING WHAT
 * THE USER TYPED (*"I don't know the finish \"unobtainium\""*) rather than the
 * strictly weaker "tell me which finish", because the weaker copy makes the user
 * guess whether they were misheard or had simply omitted it. ADR-0313 HONESTY:
 * recognised-but-underspecified must never reach an LLM (and here there is none
 * to reach).
 *
 * So the unknown unit is CAPTURED and carried on the intent as `unitRef`; the
 * spec's value stage refuses by naming it and suggesting the correction.
 *
 * ⛔ THE UNIT IS NOT AUTO-CORRECTED, and the pattern is NOT widened to accept
 * typos. This drives a mass edit across every wall in a scope — a mass edit does
 * not guess, and a unit pattern that accepts "dregress" accepts the next typo
 * that means something else.
 */
export function parseWallRakeIntent(
  text: string,
  ctx?: ResolverContext,
): Extract<SemanticIntent, { intent: 'set-wall-rake' }> | null {
  const lifted = parseFilterClauses(text, 'wall', ctx?.resolveWallSystemType);
  const adj = WALL_RAKE_ADJ_RE.exec(lifted.stripped);
  const verb = adj === null ? WALL_RAKE_VERB_RE.exec(lifted.stripped) : null;
  const m = adj ?? verb;
  if (!m) return null;
  const scopeWord = m[1]!;
  const orientationWord = m[2];
  // Groups 3/4/5 are `SPATIAL_TAIL_SRC`'s (leading level noun, place phrase,
  // trailing level noun) — the SHARED tail, so "in level 3" and "on level 3"
  // are the same sentence here as they are everywhere else.
  const tail = readSpatialTail(m[3], joinTailPhrase(m[4], m[5]), ctx);
  // A place WAS named and cannot be turned into a scope ("this floor" with no
  // active level). DECLINE — never fall back to a wider scope. Widening a scope
  // the user deliberately restricted is the mass-edit failure the shared tail
  // exists to stop (C68 §7.d), and it is the same ruling the dimension families
  // already make.
  if (tail.kind === 'unusable') return null;
  const isVertical = adj !== null && adj[8] !== undefined;
  const angleDeg = isVertical
    ? 90 // "vertical" / "upright" / "straight"
    : Number.parseFloat(m[6]!);
  if (!Number.isFinite(angleDeg)) return null;
  // Group 7 — the unit the sentence carried that this grammar does not know.
  const unitRef = isVertical ? undefined : m[7];
  // Spatial phrases compose with the ALL scope only (same ruling as colour).
  const isAll = new RegExp(`^${WALL_SCOPE_ALL}$`).test(scopeWord);
  const base = wallSpatialScopeBase(
    isAll,
    orientationWord,
    tail.kind === 'scope' ? tail.scope : undefined,
  );
  if (base === null) return null;
  return {
    intent: 'set-wall-rake',
    angleDeg,
    unitRef,
    scope: withFilters(base, lifted.filters),
  };
}

const matchWallRake: Matcher = (text, ctx) => parseWallRakeIntent(text, ctx);

// §FEAT-WINDOW-TYPE-BATCH (ADR-0315, founder ask #4) — "change the window type
// to Steel Crittal Style" / "change all windows to timber casement".
//
// Two shapes share one intent:
//   • scope-worded — "change all windows to timber casement", "convert the
//     selected windows to upvc casement" (same explicit-scope discipline as
//     the wall-type grammar);
//   • the founder's literal singular — "change the window type to X": the
//     definite singular with the word "type" unambiguously means the SELECTED
//     window, so it maps to the selection scope.
// Same non-claim guards as parseWallTypeIntent: dimension words and leading
// digits are NEVER claimed, so "make all windows 1 m wide" stays a width ask.
// RAC U4.3 — the SHARED hosted-type grammar: window and door type-change
// sentences are the SAME two shapes with a different noun, so ONE parser
// factory serves both (grammar generalization; the APPLY side of each intent
// is a CapabilityExecutionSpec table entry riding the generic arm).
// ⭐⭐ §FIX-HOSTED-TYPE-SCOPE-PHRASING (L-1440, lane RAC2, 2026-08-20) — THE
// DEFINITE ARTICLE, AND WHY FIVE FAMILIES WERE BROKEN AT ONCE.
//
// The founder asked for stairs: **"Make all the stairs type X"**. Measured
// against this factory BEFORE the fix, the sentence did not parse — and the
// reason had nothing to do with stairs.
//
// The WALL type grammar (`WALL_TYPE_RE`, ~300 lines above) spells its scope
// phrase as
//
//     (?:the )?(all|every|each|…)(?: of)?(?: the)? walls?
//                                  ^^^^^^^^^^^^^^^^^^^^
//
// so "make ALL THE walls monolithic" and "make all OF THE walls …" both work.
// This factory — the one that serves window, door, slab and ceiling — spelled
// the SAME phrase as
//
//     (?:the )?(all|every|each|…)(?: selected)? <noun>s?
//
// with no `(?: of)?(?: the)?` at all. **So "make all THE windows type X",
// "…the doors…", "…the slabs…" and "…the ceilings…" have ALL been silently
// unclaimed since U4.3, and nobody reported it** — the founder happened to hit
// it on a family that did not exist yet, which is the only reason it surfaced.
//
// That is the same defect shape as §FIX-SCOPE-TAIL-ONE-PARSER: **two spellings
// of one concept, so fixing one leaves the next sentence broken in the other.**
// The scope phrase is now identical in both, and
// `__tests__/hosted-type-scope-parity.test.ts` asserts the two grammars accept
// the SAME scope phrasings rather than asking the next author to remember it
// (C84 EI-8a — a licensed copy is pinned by a TEST, never by a comment).
//
// Two smaller parities came with it, for the same reason:
//   • the leading ARTICLE on the type ref. The wall grammar strips
//     `(?:a |an |the )?`; this one did not, so "make all the stairs A
//     monolithic concrete" would have looked up a type called "a monolithic
//     concrete" and refused by listing the real ones — confidently wrong copy
//     over a sentence the wall grammar handles.
//   • MULTI-WORD and HYPHENATED nouns. `${noun}s?` interpolated the kind RAW,
//     so an element kind spelled `stair-railing` could never match the words a
//     user types ("stair railings"). `nounSrc` normalizes hyphen and space to
//     the same `[- ]` class, exactly as `DIMENSION_FAMILIES`' compiler already
//     does — derived from the existing precedent, not a new convention.
//
// ⛔ DO NOT re-diverge the verb sets in the same breath. The wall grammar also
// accepts `retype|update` and this one accepts `convert|swap`; unifying those
// would CLAIM sentences neither grammar claims today, which is a capability
// change wearing a refactor's clothes. It is recorded here as a known, stated
// difference rather than quietly fixed.

/** Escape a literal for embedding in a RegExp source. */
function escapeReSrc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** An element-kind noun as the GRAMMAR must spell it: hyphens and spaces are
 *  the same separator to a user ("stair-railing" ⇄ "stair railing"). */
function nounSrc(noun: string): string {
  return escapeReSrc(noun).replace(/(?:\\-|-|\s)+/g, '[- ]');
}

function makeHostedTypeParser(
  noun: string,
  catalogueOf: (ctx: ResolverContext) => ((ref: string) => { id: string; name: string } | null) | undefined,
  /** Extra nouns the grammar accepts for the same family ("railing" for
   *  `stair-railing`, "glazing unit" for `window`). */
  aliases: readonly string[] = [],
): (text: string, ctx?: ResolverContext) => { typeRef: string; scope: IntentScope } | null {
  const nouns = [noun, ...aliases].map(nounSrc).join('|');
  // ⭐⭐ §FIX-HOSTED-TYPE-SCOPE-TAIL (L-10220) — THE FIFTH SPELLING OF THE SCOPE
  // TAIL, and it was the one serving SIX families at once.
  //
  // This factory carried the pre-L-1201 hand-written tail:
  //
  //     (?: on (?:the )?(?:levels?|floors?)?\s*([\w .-]+?)| in the ([\w .-]+?))?
  //
  // — `on` hard-wired to LEVEL, `in the` hard-wired to ROOM, and `at` /
  // `inside` / `within` / a bare `in` not understood at all. Exactly the defect
  // L-1201 removed from the dimension grammars, L-1261 from the wall-finish
  // grammar and L-1372 from the rake grammar — whose own comment predicted this
  // one: *"so there is no fifth spelling to fix next time"*. There was one, here,
  // unnoticed, because nobody had typed the sentence that reaches it.
  //
  // MEASURED on the founder's literal, 2026-08-24, BEFORE this change:
  //
  //   "change all lightings in ground level to downlight"
  //     → the tail matches NOTHING ("in ground level" is not "in the …")
  //     → typeRef = "in ground level to downlight", scope = 'all'
  //     → "There is no lighting type called 'in ground level to downlight'…"
  //
  // A confident refusal over a real fixture name, AND a project-wide scope where
  // the user restricted to one level. The second half is the dangerous one: had
  // the ref resolved, the sentence would have retyped every light in the
  // building. **A level scope that silently widens is worse than no level scope.**
  //
  // It now shares `SPATIAL_TAIL_SRC`, so window / door / slab / ceiling / stair /
  // stair-railing / lighting all read a place phrase the same way every other
  // grammar in this package does. ⛔ The claim surface is NOT widened: a sentence
  // with no place phrase parses exactly as before, and an `unusable` place ("this
  // floor" with no active level) DECLINES rather than falling back to a wider
  // scope (C68 §7.d).
  const scopedRe = new RegExp(
    `^(?:change|set|make|convert|swap|turn) (?:the )?(${WALL_SCOPE_ALL}|${WALL_SCOPE_SEL})` +
    // §FIX-HOSTED-TYPE-SCOPE-PHRASING — byte-identical to WALL_TYPE_RE's.
    `(?: selected)?(?: of)?(?: the)? (?:${nouns})s?${SPATIAL_TAIL_SRC}` +
    // §FIX-HOSTED-TYPE-SCOPE-PHRASING — the leading article, as WALL_TYPE_RE
    // already strips it: "make all the stairs A monolithic concrete".
    `(?:'s)?(?: types?)?(?: (?:to|into|as|be))? (?:a |an |the )?(.+)$`,
  );
  // ⭐ THE SAME SHAPE WITHOUT A PLACE PHRASE — for the "longest catalogue claim
  // wins" arbitration below. The tail is OPTIONAL and the engine prefers to match
  // it, so a TYPE NAME carrying a preposition ("Pendant on Cable") would split
  // into a bogus room scope plus a truncated ref. C68 §3.d already rules on this
  // for the noun collision, and the ruling is the same here: the span the
  // project's catalogue AFFIRMATIVELY CLAIMS wins.
  const scopedNoTailRe = new RegExp(
    `^(?:change|set|make|convert|swap|turn) (?:the )?(${WALL_SCOPE_ALL}|${WALL_SCOPE_SEL})` +
    `(?: selected)?(?: of)?(?: the)? (?:${nouns})s?` +
    `(?:'s)?(?: types?)?(?: (?:to|into|as|be))? (?:a |an |the )?(.+)$`,
  );
  const singularRe = new RegExp(
    `^(?:change|set|swap) (?:the )?(?:${nouns})(?:'s)? type (?:to|into|as) (?:a |an |the )?(.+)$`,
  );
  /** The GRAMMAR half, run against ONE spelling of the sentence. Filters are
   *  the caller's business — this reads shape and nothing else, so the raw and
   *  the filter-lifted spellings cannot be understood differently. */
  const runShape = (
    source: string,
    catalogue: ((ref: string) => { id: string; name: string } | null) | undefined,
    ctx: ResolverContext | undefined,
  ): { typeRef: string; base: IntentScope } | null => {
    const clean = (raw: string): string =>
      raw.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ');
    let scoped = scopedRe.exec(source);
    // §FIX-HOSTED-TYPE-SCOPE-TAIL (L-10220) — a matched place phrase that leaves a
    // ref the catalogue does NOT know, where dropping the phrase leaves one it
    // DOES, was never a place phrase. This can only ADD a resolution: with no
    // catalogue injected, or with neither ref known, the tail reading stands.
    if (scoped !== null && scoped[3] !== undefined && catalogue !== undefined
        && catalogue(clean(scoped[5]!)) === null) {
      const flat = scopedNoTailRe.exec(source);
      if (flat !== null && catalogue(clean(flat[2]!)) !== null) scoped = flat;
    }
    const singular = scoped === null ? singularRe.exec(source) : null;
    if (scoped === null && singular === null) return null;
    // Groups 2/3/4 are `SPATIAL_TAIL_SRC`'s (leading level noun, place phrase,
    // trailing level noun) and group 5 is the type ref. `scopedNoTailRe` has no
    // tail groups at all, so its ref sits at group 2 and group 5 reads undefined.
    const typeRef = clean(
      scoped === null ? singular![1]! : (scoped[5] ?? scoped[2]!),
    );
    if (typeRef.length === 0) return null;
    // "make all windows 1m wide" is a DIMENSION ask, not a type ask — never claim it.
    // §FIX-CHAT-TYPEREF-SWALLOW (RAC U9, U10 drain): the list was missing the
    // NOUN forms, so "set all slabs thickness to 0.2m" was claimed with typeRef
    // "thickness to 0.2m" — and the SUMMARY said 'Change every slab in the
    // project to "thickness to 0.2m"' before the command refused. A summary
    // that states a falsehood is worse than a miss, whatever happens next.
    if (/\b(?:tall|high|wide|taller|wider|height|width|sill|deep|long|thick|thickness|depth|offset|elevation)\b/.test(typeRef)) return null;
    // §FIX-RAKE-SWALLOWED-AS-TYPE (L-1370) — the rake/orientation words used to
    // be FIVE of them hand-copied into the line above
    // (pitch|angle|angled|raked|tilted), and that copy was already incomplete:
    // "tilt", "lean", "leaning", "slanted", "vertical", "upright", "slope" and
    // "degrees" were all missing, so "change all doors to tilted 90 degrees"
    // was claimed as a door TYPE. The word set is now DERIVED from the one
    // definition (`DimensionFamilies.OTHER_CAPABILITY_WORD`), which is what
    // stops the next word being missing from a third list.
    if (OTHER_CAPABILITY_WORD.test(typeRef)) return null;
    if (/^\d/.test(typeRef)) return null;
    // §FIX-CHAT-TYPEREF-SWALLOW — "make all slabs blue" is a COLOUR ask. The
    // colour table decides, not a hand-listed set of colour words, and the
    // CATALOGUE gets the first say: a project whose slab type really is called
    // "Blue" keeps working, because only a ref the catalogue does NOT know is
    // handed to the colour test. Nothing is narrowed — an unknown NON-colour
    // ref still claims, and still earns the honest "there is no <noun> type
    // called X; the types here are …" refusal that lists the real names.
    if (resolveColorRef(typeRef) !== null) {
      if (catalogue === undefined || catalogue(typeRef) === null) return null;
    }
    if (scoped === null) return { typeRef, base: 'selection' };
    const isAll = new RegExp(`^${WALL_SCOPE_ALL}$`).test(scoped[1]!);
    // The SHARED classifier: the preposition never decides the scope KIND, the
    // NOUN does (SpatialScopeTail.ts). When `scopedNoTailRe` won there are no
    // tail groups, and `none` is exactly the right reading.
    const tail = scoped[5] === undefined
      ? { kind: 'none' as const }
      : readSpatialTail(scoped[2], joinTailPhrase(scoped[3], scoped[4]), ctx);
    // ⛔ A place WAS named and cannot be resolved ("this floor" with no active
    // level). DECLINE — never widen to the whole project (C68 §7.d).
    if (tail.kind === 'unusable') return null;
    const base = wallSpatialScopeBase(
      isAll,
      undefined,
      tail.kind === 'scope' ? tail.scope : undefined,
    );
    if (base === null) return null;
    return { typeRef, base };
  };
  return (text, ctx) => {
    const catalogue = ctx === undefined ? undefined : catalogueOf(ctx);
    // ⭐⭐ §FIX-SELF-REFERENTIAL-TYPE-NAME (L-10100) — THE CATALOGUE GETS THE
    // FIRST SAY, AS IT ALREADY DOES FOR COLOUR REFS TWENTY LINES ABOVE.
    //
    // The filter lift runs BEFORE the grammar, and a type name that contains
    // the family's own noun ("Custom Window Type") gives it a second, wrong
    // place to anchor: the founder's "make all windows custom window type" was
    // rewritten to "make all window type" and read as typeRef "type"
    // (MEASURED — `FilterScope.liftTypeFilter`'s header carries the trace).
    //
    // `liftTypeFilter` now refuses that mis-anchor structurally, and this is
    // the SECOND, INDEPENDENT guard the sibling table demands ("ordering fixes
    // it only while the array stays sorted"): read the sentence EXACTLY AS THE
    // USER TYPED IT first, and if the grammar's tail is a span the project's
    // catalogue AFFIRMATIVELY claims, that reading wins outright — no filter
    // lift, no keyword stripping, nothing to mis-anchor on.
    //
    // ⛔ It can only ADD resolutions, never remove one:
    //   • no catalogue injected ⇒ nothing to affirm ⇒ today's path, untouched;
    //   • a real filter clause ("all timber casement windows", "all windows
    //     wider than 1m") leaves the raw grammar either UNMATCHED or holding a
    //     tail the guards above decline, so the lift still runs;
    //   • only an EXACTLY-KNOWN type name short-circuits, which is the one
    //     reading that cannot be a mis-parse.
    const raw = runShape(text, catalogue, ctx);
    if (raw !== null && catalogue !== undefined && catalogue(raw.typeRef) !== null) {
      return { typeRef: raw.typeRef, scope: raw.base };
    }
    const lifted = parseFilterClauses(text, noun, catalogue);
    const hit = lifted.stripped === text ? raw : runShape(lifted.stripped, catalogue, ctx);
    if (hit === null) return null;
    return { typeRef: hit.typeRef, scope: withFilters(hit.base, lifted.filters) };
  };
}

/**
 * RAC U7.2 — one parser per CATALOGUE FAMILY, built from the table. The shapes
 * and the non-claim guards are the shared factory's; what a family contributes
 * is its noun, its catalogue and (optionally) the refs it must not claim. A new
 * family therefore arrives with its grammar and costs nothing here.
 */
const CATALOGUE_FAMILY_MATCHERS: readonly Matcher[] = CATALOGUE_FAMILIES.map((family) => {
  const shape = makeHostedTypeParser(family.elementKind, (c) => {
    const lookup = family.lookup(c);
    return lookup === null ? undefined : lookup.resolve;
  // §FEAT-CHAT-STAIR-TYPES (L-1441) — the family's own nouns. A user says
  // "stair railings", never "stair-railings", and the ORDER of this array is
  // load-bearing for the stair/railing collision — see CatalogueFamilies.ts.
  }, family.nounAliases ?? []);
  return (text, ctx): SemanticIntent | null => {
    const hit = shape(text, ctx);
    if (hit === null) return null;
    if (family.rejectRef?.(hit.typeRef) === true) return null;
    return { intent: family.intent, ...hit } as SemanticIntent;
  };
});

const parseWindowTypeShape = makeHostedTypeParser('window', (c) => c.resolveWindowSystemType);
const parseDoorTypeShape = makeHostedTypeParser('door', (c) => c.resolveDoorSystemType);

export function parseWindowTypeIntent(
  text: string,
  ctx?: ResolverContext,
): Extract<SemanticIntent, { intent: 'set-window-type' }> | null {
  const hit = parseWindowTypeShape(text, ctx);
  return hit === null ? null : { intent: 'set-window-type', ...hit };
}

// §FEAT-DOOR-TYPE-BATCH (RAC U4.3) — "change the door type to …" / "change
// all doors to …". Same shapes and guards via the shared factory; "swing"
// additionally never claims, so "change all doors to left swing" stays a
// swing ask (door.setSwing owns that verb).
export function parseDoorTypeIntent(
  text: string,
  ctx?: ResolverContext,
): Extract<SemanticIntent, { intent: 'set-door-type' }> | null {
  const hit = parseDoorTypeShape(text, ctx);
  if (hit === null) return null;
  if (/\bswings?\b/.test(hit.typeRef)) return null;
  return { intent: 'set-door-type', ...hit };
}



// §FEAT-WALL-LAYER-ADD-BATCH (ADR-0315, founder ask #2) — "add a 10mm plaster
// layer to the inner side of the selected wall" and its loose family.
//
// The founder's real sentences are word-order-free ("Add a finish layer on the
// inner side of paint … with 10mms thickness of plaster"), so this parser is
// TOKEN-BASED, not one rigid shape: it claims any "add …" sentence that names
// a layer/finish/coat AND wall(s) AND a scope word, then extracts side,
// thickness and finish independently. Missing thickness or finish still
// CLAIMS (the ask is unambiguously a layer ask) and the apply arm refuses
// with a concrete example — recognized-but-underspecified never reaches the
// LLM (ADR-0313 HONESTY note).
const WALL_LAYER_THICKNESS_RE = /(\d+(?:\.\d+)?)\s*(mm|cm|m)s?\b/;

export function parseAddWallLayerIntent(
  text: string,
  ctx?: ResolverContext,
): Extract<SemanticIntent, { intent: 'add-wall-layer' }> | null {
  // ⭐⭐ §FIX-LAYER-ASK-REPAINTED (L-1260) — THE VERB WAS NEVER THE DISCRIMINATOR.
  //
  // The founder wrote *"make all walls interior LAYER finish X"*. `^add` refused
  // it, the appearance-only sibling claimed it because it only declined on
  // `^add`, and he was told his walls had been re-finished. He asked for a
  // CONSTRUCTION LAYER — the one ask whose entire difference is that it MOVES
  // `wall.thickness` (§03-WALL-THICKNESS-CONTRACT §1) — and got a repaint,
  // reported as success. C84 EI-2, silent narrowing.
  //
  // The distinguishing token is the NOUN "layer"/"coat", not the verb. So the
  // shared verbs claim HERE when that noun is present, and `LAYER_NOUN` — the
  // SAME exported constant — is what makes the sibling stand aside. One test,
  // two grammars: no gap, and no sentence claimed by both.
  const explicitAdd = /^add\b/.test(text);
  const sharedVerb = /^(?:make|change|set|apply|update|turn|re-?finish)\b/.test(text);
  const namesLayer = LAYER_NOUN.test(text);
  if (!explicitAdd && !(sharedVerb && namesLayer)) return null;
  if (!/\b(?:layers?|finish(?:es)?|coat(?:ing)?s?)\b/.test(text)) return null;
  if (!/\bwalls?\b/.test(text)) return null;
  // Same explicit-scope discipline as every wall batch: no scope word, no claim.
  const isAll = new RegExp(String.raw`\b(?:${WALL_SCOPE_ALL})(?: the)? walls?\b`).test(text);
  const isSel = new RegExp(String.raw`\b(?:the )?(?:${WALL_SCOPE_SEL})(?: selected)? walls?\b`).test(text)
    || /\bthe selected walls?\b/.test(text);
  // §FIX-LAYER-SCOPE-UNDECLARED (L-1263) — the registry DECLARED
  // `scopeModes: ['all','selection','level','room','orientation']` for this
  // capability while the parser could only ever produce 'all' | 'selection'.
  // That is C68 §5.e read backwards: the arm honoured modes NO SENTENCE COULD
  // PRODUCE, so the declaration was a promise the grammar could not keep. The
  // shared inline place reader closes it — the same one the sibling uses, so
  // "in Level 1" cannot mean two things across two wall grammars.
  const place = parseInlineSpatialPhrase(text, ctx);
  if (place.kind === 'unusable') return null;
  const spatial = place.kind === 'scope' && !isSel ? place.scope : null;
  if (!isAll && !isSel && spatial === null) return null;

  const side: 'interior' | 'exterior' =
    /\b(?:outer|outside|exterior|external)\b/.test(text) ? 'exterior' : 'interior';

  const t = WALL_LAYER_THICKNESS_RE.exec(text);
  const thicknessM = t === null
    ? null
    : t[2] === 'mm' ? Number(t[1]) / 1000
    : t[2] === 'cm' ? Number(t[1]) / 100
    : Number(t[1]);

  // The finish is found by scanning the ONE vocabulary (finishRef aliases via
  // resolveFinishRef over shrinking word windows), so word order never
  // matters: "10mm plaster", "plaster with 10mm", "of plaster" all resolve.
  let finishRef: string | null = null;
  const words = text.replace(WALL_LAYER_THICKNESS_RE, ' ').split(/[^a-z-]+/).filter((w) => w.length > 2);
  outer:
  for (let span = 3; span >= 1; span--) {
    for (let i = 0; i + span <= words.length; i++) {
      const candidate = words.slice(i, i + span).join(' ');
      if (resolveFinishRef(candidate) !== null) { finishRef = candidate; break outer; }
    }
  }

  return {
    intent: 'add-wall-layer', side, thicknessM, finishRef,
    scope: spatial ?? (isAll ? 'all' : 'selection'),
  };
}

const matchAddWallLayer: Matcher = (text, ctx) => parseAddWallLayerIntent(text, ctx);

// §FEAT-WALL-SIDE-FINISH — the finish table is injected so the grammar module
// stays pure and `finishRef.ts` remains the ONE name->finish site.
const matchWallSideFinish: Matcher = (text, ctx) =>
  parseWallSideFinishIntent(text, (r) => resolveFinishRef(r) !== null, ctx?.resolveWallSystemType, ctx);

// §FEAT-FLOOR-SURFACE-FINISH (L-1881) — the floor twin. TWO predicates are
// injected, and they are not the same question: `resolvesFinish` answers "is this
// one material?", `namesFinish` answers "does the catalogue know this word at
// all?". "parquet" is FALSE for the first (thirteen rows — an ambiguity is a
// refusal, never a pick) and TRUE for the second, and it is the second that turns
// the founder's word into a refusal LISTING the thirteen instead of a generic miss.
const matchFloorFinish: Matcher = (text, ctx) =>
  parseFloorFinishIntent(
    text,
    (r) => resolveFinishRef(r) !== null,
    (r) => finishRefCandidates(r).length > 0,
    ctx,
  );

// §FEAT-WINDOW-PARAMETRIC-CREATE (ADR-0315, founder ask #3) — "create a window
// in the middle of every wall segment" / "create 2 windows in all the wall
// segments" / "create a 1x2m window every 3 meters in the walls on the ground
// floor".
//
// TOKEN-BASED like the layer parser: a creation verb + "window(s)" + "wall(s)/
// wall segments" + a scope word claims the utterance; size (WxH), spacing
// ("every 3 m") and count are extracted independently of word order. A level
// tail ("on the ground floor" / "on level 2") maps to the level scope.
const WINDOW_SIZE_RE = /(\d+(?:\.\d+)?)\s*(?:x|by|×)\s*(\d+(?:\.\d+)?)\s*(?:m|meters?|metres?)?\b/;
const WINDOW_SPACING_RE = /\bevery (\d+(?:\.\d+)?) ?(?:m|meters?|metres?)\b/;
const WINDOW_COUNT_WORDS: Readonly<Record<string, number>> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };

export function parseWindowsParametricIntent(
  text: string,
  ctx?: ResolverContext,
): Extract<SemanticIntent, { intent: 'create-windows-parametric' }> | null {
  // ── §FIX-WINDOW-CREATE-REACH (L-1201) — the founder's sentence, verbatim:
  //    **"Make windows every 2 meters in level 2"**. Measured before this
  //    change it returned `null`, and FOUR independent gates were each on their
  //    own sufficient to make that so. The capability behind them was complete.
  //
  //  1. VERB. The gate was `create|add|put|place`; he wrote "Make". The RESIZE
  //     grammar next door accepts `set|change|make|resize|update|adjust`, so
  //     his habitual verb reached the resizer and not the creator — one
  //     vocabulary split in two, which is the C84 EI-8/EI-9 breach that makes a
  //     shipped feature look missing.
  //     ⭐ `make` is accepted here ONLY with an unambiguous CREATION mode (an
  //     "every N m" spacing, or an explicit count of windows). Without that
  //     guard "make all windows 2m high" — a RESIZE — would be claimed by this
  //     grammar and would create a window in every wall in the project. The
  //     verb is shared; the CLAIM is not.
  //  2. HOST NOUN. The gate demanded the word "wall". Windows are definitionally
  //     hosted in walls, so requiring it is requiring the user to state a
  //     tautology — no one says "windows in the walls every 2 m". The gate is
  //     not deleted, it is REPLACED by the narrower one that was doing the real
  //     work: a target must still be named (all-walls / the selection / a
  //     level), and without one the sentence is still not claimed.
  //  3/4. SCOPE + PREPOSITION. `levelTail` required `on`; he wrote `in`. That is
  //     the same defect as §FIX-SCOPE-TAIL-ONE-PARSER in a second grammar, and
  //     it is why it is now resolved through the SHARED tail rather than a
  //     third hand-written regex.
  const explicitCreate = /^(?:create|add|put|place|install)\b/.test(text);
  const sharedVerb = /^make\b/.test(text);
  if (!explicitCreate && !sharedVerb) return null;
  if (!/\bwindows?\b/.test(text)) return null;

  // Size (strip it before spacing/count so "1x2m" digits are never re-read).
  const size = WINDOW_SIZE_RE.exec(text);
  const stripped = size === null ? text : text.replace(WINDOW_SIZE_RE, ' ');
  const widthM = size === null ? null : Number(size[1]);
  const heightM = size === null ? null : Number(size[2]);

  const spacing = WINDOW_SPACING_RE.exec(stripped);
  const countM =
    /^(?:create|add|put|place|install|make) (?:(\d+|a|an|one|two|three|four|five) )?windows?\b/
      .exec(stripped);
  // The shared verb needs a creation mode SAID OUT LOUD — see gate 1 above.
  if (!explicitCreate && spacing === null && countM?.[1] === undefined) return null;

  // Scope discipline: all / every-wall-segment / selected — or a place tail.
  const isAll = /\b(?:all|every|each)\b[^.]*\bwalls?(?:\b| segments?\b)|\bevery wall segment\b/.test(text);
  const isSel = /\b(?:the )?(?:selected|these|those|this) walls?\b/.test(text);
  // "in the ground-floor walls" — a level named ADJECTIVALLY, which no
  // preposition tail can see because the noun it modifies is "walls".
  const hyphenLevel = /\b(?:in|on) (?:the )?([\w]+)[- ]floor walls?\b/.exec(text);
  // ⛔ LEVEL ONLY. This capability DECLARES `scopeModes: ['all','selection',
  // 'level']` and Gate 31's symmetric arm caught it over-claiming 'room' once
  // already. The shared tail can now read a room out of "in the kitchen" — so
  // a room reading is DROPPED here rather than resolved, and the declaration
  // stays exactly as narrow as the resolver (C68 §7.d).
  const tail = hyphenLevel === null ? parseTrailingSpatialScope(text, ctx) : { kind: 'none' as const };
  const tailLevel = tail.kind === 'scope' && tail.scope.kind === 'level' ? tail.scope : null;
  if (!isAll && !isSel && tailLevel === null && hyphenLevel === null) return null;

  const mode: Extract<SemanticIntent, { intent: 'create-windows-parametric' }>['mode'] =
    spacing !== null
      ? { kind: 'spacing', spacingM: Number(spacing[1]) }
      : (() => {
          const word = countM?.[1];
          const count = word === undefined
            ? 1
            : /^\d+$/.test(word) ? Number(word) : (WINDOW_COUNT_WORDS[word] ?? 1);
          return { kind: 'count' as const, count };
        })();

  const scope: Extract<SemanticIntent, { intent: 'create-windows-parametric' }>['scope'] =
    hyphenLevel !== null
      ? { kind: 'level', levelQuery: hyphenLevel[1]! }
      : tailLevel !== null
        ? tailLevel
        : isSel ? 'selection' : 'all';

  return { intent: 'create-windows-parametric', mode, widthM, heightM, scope };
}

const matchWindowsParametric: Matcher = (text, ctx) => parseWindowsParametricIntent(text, ctx);

// §REFUSE-STAIR-SPAN / §REFUSE-STAIR-RUN (L-1444) — see StairNotYet.ts.
const matchStairSpan: Matcher = (text) => parseStairSpanIntent(text);
const matchStairPart: Matcher = (text) => parseStairPartIntent(text);

// §FEAT-RAC-STAIR-SHAPE (L-1541) — see StairCreateShape.ts.
const matchStairShape: Matcher = (text) => parseCreateStairShapeIntent(text);
// §REFUSE-RAC-REPLICATE (L-1542) — see ElementReplication.ts.
const matchReplicateElement: Matcher = (text) => parseReplicateElementIntent(text);

// §FEAT-RHINO-CHAT-MATERIAL — "change all elements of the rhino model to
// white" / "paint the rhino model white" / "reset the rhino model materials".
//
// Same verb discipline as the wall-colour grammar: paint/colour are colour-
// SPECIFIC verbs and claim the utterance even when the colour is unresolvable
// (an honest colour refusal listing real options); the shared verbs
// (make/set/change/turn) claim only what the colour table resolves. The
// grammar requires the word "rhino", so it can never collide with the wall
// matchers or the dimension shapes.
const RHINO_MATERIAL_RE = new RegExp(
  `^${WALL_COLOR_VERB} (?:all )?(?:of )?(?:the )?(?:elements? of )?(?:the )?rhino(?: model| import| geometry)?(?:s|'s)?` +
  `(?: elements?| meshes| objects)?(?: (?:to|into|in|as|be))?(?: the)?(?: colou?r)? (.+)$`,
);

const RHINO_RESET_RE =
  /^(?:reset|restore) (?:the )?rhino(?: model| import)?(?:s|'s)?(?: (?:original|imported))? (?:colou?rs?|materials?|appearance|look)$/;

/** Parse a Rhino-model recolour/reset sentence — exported for the NL layer,
 *  like `parseWallColorIntent`. Returns null when not claimed. */
export function parseRhinoMaterialIntent(
  text: string,
): Extract<SemanticIntent, { intent: 'set-rhino-material' }> | null {
  if (RHINO_RESET_RE.test(text)) {
    return { intent: 'set-rhino-material', colorRef: null };
  }
  const m = RHINO_MATERIAL_RE.exec(text);
  if (!m) return null;
  const verb = m[1]!;
  const colorRef = m[2]!.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ');
  if (colorRef.length === 0) return null;
  const colorSpecificVerb = verb === 'paint' || verb.startsWith('colo');
  if (!colorSpecificVerb && resolveColorRef(colorRef) === null) return null;
  return { intent: 'set-rhino-material', colorRef };
}

const matchRhinoMaterial: Matcher = (text) => parseRhinoMaterialIntent(text);

// RAC U9.2 — the SAFE DESTRUCTIVE tranche. Generated per family from
// DeleteFamilies.ts; the parser claims only unambiguous scopes, so an
// under-specified "delete the furniture" falls through to an honest
// "I'm not sure" rather than a coin flip on a destructive verb.
const matchDeleteScoped: Matcher = (text, ctx) => parseDeleteScopedIntent(text, ctx);

// §FEAT-BULK-DIMENSIONS (L-949) — "make all windows 2 meters height". The ONE
// parser, shared with the NL classifier; `toMeters` is handed in so the unit
// rule keeps exactly one implementation (ADR-0313 §Units).
const matchDimensionScoped: Matcher = (text, ctx) =>
  parseDimensionScopedIntent(text, ctx, toMeters);

// §GEN-CHAT (RAC U5b.2) — "generate a 3-storey residential building" /
// "generate a 2-storey house" / "generate an office building with 5 floors".
//
// TOKEN-BASED like the layer/window parsers: a creation verb + a BUILDING-
// typology noun claims the utterance; storeys, apartment mix and roof form are
// extracted independently of word order. Element nouns (wall/door/window/…)
// NEVER claim — "make the house walls white" stays a colour ask — and floors
// stay optional (the apply arm STATES the default the generator will use).
const GEN_BUILDING_VERB_RE = /^(?:generate|create|build|make)\b/;
const GEN_ELEMENT_NOUN_RE = /\b(?:walls?|doors?|windows?|slabs?|roofs?|stairs?|columns?|beams?|ceilings?|furniture)\b/;
const GEN_STOREY_WORDS: Readonly<Record<string, number>> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const GEN_FLOORS_RE =
  /(?:^|\s)(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[\s-](?:storeys?|stor(?:y|ies)|floors?|levels?)\b/;
const GEN_MIX_RE = /\b([1-4]|one|two|three|four)[\s-]bed(?:room)?s?\b|\bt([1-4])\b/g;
const GEN_ROOF_RE = /\b(flat|gable|hip)(?:ped)? roof\b/;

/** Parse a building-generation sentence into the semantic intent — SHARED by
 *  the tier-0 grammar and the NL classifier (the parseWallTypeIntent pattern).
 *  Returns null (a miss) when no building-typology noun appears. */
export function parseGenerateBuildingIntent(
  text: string,
): Extract<SemanticIntent, { intent: 'generate-building' }> | null {
  if (!GEN_BUILDING_VERB_RE.test(text)) return null;
  // Element-level asks are someone else's sentence ("make the house walls
  // white", "create a window …") — never claimed as generation.
  if (GEN_ELEMENT_NOUN_RE.test(text)) return null;
  // "make" claims only the creation shape ("make a house", "make me a new
  // office building") — "make the house white" is NOT a generation ask.
  if (/^make\b/.test(text) && !/^make (?:me )?(?:a|an|another|new)\b/.test(text)) return null;

  // Typology — office wins over the generic "building" word, residential wins
  // over "house" phrasings like "housing block" cannot occur (word-bounded).
  const typology: 'residential-building' | 'house' | 'office' | null =
    /\boffice\b/.test(text) ? 'office'
    : /\bresidential\b|\bapartment (?:building|block|tower)\b|\bblock of flats\b|\bmulti[\s-]family\b/.test(text) ? 'residential-building'
    : /\bhouse\b|\bvilla\b/.test(text) ? 'house'
    : null;
  if (typology === null) return null;

  const f = GEN_FLOORS_RE.exec(text);
  const floors = f === null
    ? null
    : /^\d+$/.test(f[1]!) ? Number(f[1]) : (GEN_STOREY_WORDS[f[1]!] ?? null);

  // Apartment-mix hints — residential only ("with 2-bed and 3-bed apartments").
  let mix: { T1?: boolean; T2?: boolean; T3?: boolean; T4?: boolean } | undefined;
  if (typology === 'residential-building') {
    const beds = new Set<number>();
    GEN_MIX_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = GEN_MIX_RE.exec(text)) !== null) {
      const word = m[1] ?? m[2]!;
      const n = /^\d$/.test(word) ? Number(word) : (GEN_STOREY_WORDS[word] ?? 0);
      if (n >= 1 && n <= 4) beds.add(n);
    }
    if (beds.size > 0) {
      mix = { T1: beds.has(1), T2: beds.has(2), T3: beds.has(3), T4: beds.has(4) };
    }
  }

  const roof = typology === 'house' ? GEN_ROOF_RE.exec(text) : null;
  const roofKind = roof === null ? undefined : (roof[1] as 'flat' | 'gable' | 'hip');

  return {
    intent: 'generate-building',
    typology,
    floors,
    ...(mix !== undefined ? { mix } : {}),
    ...(roofKind !== undefined ? { roofKind } : {}),
  };
}

const matchGenerateBuilding: Matcher = (text) => parseGenerateBuildingIntent(text);

// §GEN-CHAT-APARTMENT (RAC U5b.2, founder P0) — "create a 3 bedroom apartment"
// (fills the walls already drawn), as distinct from "generate a 3-storey
// apartment BUILDING" (a new envelope, matchGenerateBuilding's sentence).
//
// TYPO-TOLERANT NOUN, deliberately. The founder typed "Create 3 bedroom
// apparment" and the chat said "I'm not sure how to help with that yet" — a
// capability that exists but cannot be spelled at is a capability that does
// not exist. The alternation covers the doubled-p / dropped-t / Romance-
// language spellings people actually type; it costs nothing and it is the
// difference between the feature working and not.
const APT_VERB_RE = /^(?:generate|create|make|lay ?out|plan|design|draw)\b/;
// "aparments?" is the founder's own second-repro spelling ("Created Aparment
// with 2 bedrooms and 1 bathroom") — single p, dropped t. Added here for the
// same reason the rest of the alternation exists: a capability that cannot be
// spelled at is a capability that does not exist.
const APT_NOUN_RE = /\b(?:apartments?|appartments?|apparments?|aparments?|apartaments?|appartements?|apartmant?s?|flats?|dwellings?)\b/;
// Building words belong to `generate-building`: an apartment BUILDING/BLOCK/
// TOWER, or anything with a storey count, is a new envelope, not a plan laid
// into an existing shell.
const APT_BUILDING_RE = /\b(?:buildings?|blocks?|towers?|complex|storeys?|stor(?:y|ies)|floors?|levels?)\b/;
// L-911 (founder, 2026-08-14) — THE COUNT MUST SURVIVE THE SAME TYPOS THE NOUN
// DOES. He typed "CREATE 3 BEDRROM APPARMENT": the noun alternation above
// tolerated "apparment", but `bed(?:room)?s?` did NOT tolerate "bedrrom" — so
// the sentence resolved as an apartment ask with NO count, the editor spread
// the empty brief over DEFAULT_PROGRAM, and the chat announced "2 bedrooms"
// while he had asked for 3. Half-tolerance is worse than none: it produces a
// confident answer to a question nobody asked.
//
// The tolerance is bounded on purpose: "bed" must be followed by an OPTIONAL
// r-initial tail ("room", "rooms", "rrom", "rom", "roooms", " rooms"). "bed"
// alone and "beds" still match; "2 bedside tables" and "2 bedding sets" do NOT
// (no 'r' after the stem), so the count can never be invented from a furniture
// noun. Same shape for bathrooms ("bathrom", "bath rooms").
const APT_BEDROOMS_RE = /(?:^|\s)(\d{1,2}|one|two|three|four|five|six|seven|eight)[\s-]?bed(?:\s?r\w{0,5})?s?\b/;
const APT_BATHROOMS_RE = /(?:^|\s)(\d{1,2}|one|two|three|four|five|six)[\s-]?bath(?:\s?r\w{0,5})?s?\b/;
const APT_ENSUITE_RE = /\ben[\s-]?suites?\b/;
const APT_OPENPLAN_RE = /\bopen[\s-]?plan\b/;
// §RAC-APARTMENT-IN-ROOM (L-1642) — "2 en-suite bathrooms" / "two en-suites".
// The count sits IMMEDIATELY before the en-suite noun, so "3 bedroom … 2
// en-suite" can never cross-read. Note APT_BATHROOMS_RE cannot fire on
// "2 en-suite bathrooms" (no digit directly before "bath") — the en-suites ARE
// the stated wet rooms; the shared-bathroom count stays a NAMED default.
const APT_ENSUITE_COUNT_RE = /(?:^|\s)(\d{1,2}|one|two|three|four|five|six|seven|eight)[\s-]?en[\s-]?suites?\b/;
// "an en-suite in/for every bedroom" — distributive: one per bedroom.
const APT_ENSUITE_EVERY_RE = /\ben[\s-]?suites?\s+(?:in|for|to)\s+(?:every|each|all)\s+bed/;
// §RAC-APARTMENT-IN-ROOM (L-1643) — the TRUE fused ask, both word orders, the
// founder's "+" spelling included ("opened kitchen + living room").
const APT_OPEN_KL_RE =
  /\bopen(?:ed)?(?:[\s-]?plan)?[\s-]+(?:kitchen\s*(?:\+|and|&|\/|with|,)?\s*living(?:\s?room)?|living(?:\s?room)?\s*(?:\+|and|&|\/|with|,)?\s*kitchen)\b/;
// A "place" capture that is not a place: distributives ("every bedroom"),
// self-references to the shell being filled, and bare here-words. These strip
// silently (the sentence stays claimed with no scope) — they name the DEFAULT
// target, not a different one, so this is not a widen (C68 §7.d).
const APT_SCOPE_NOT_A_PLACE_RE =
  /^(?:(?:this|that|the|my|our)\s+)?(?:shells?|apartments?|flats?|units?|plans?|walls?)$|^(?:every|each|all)\b|^(?:it|here|there)$/;
// Building words inside a claimed "place" mean the sentence is about a NEW
// building envelope — never claimed here (it belongs to generate-building).
const APT_PLACE_BUILDING_RE = /\b(?:buildings?|blocks?|towers?|complex)\b/;

/**
 * L-911 — the programme the EDITOR falls back to when the sentence names no
 * count (`DEFAULT_PROGRAM`, apps/editor `layoutRequestPayload.ts`). The
 * resolver is L2 and cannot import an L7 constant, so it is restated here and
 * PINNED against the real one by `apps/editor/__tests__/
 * ApartmentBriefDefaultStated.test.ts` — the summary must never quote a
 * default the engine does not actually use.
 */
export const APARTMENT_STATED_DEFAULT = { bedrooms: 2, bathrooms: 1 } as const;

/** Parse an apartment-layout sentence into the semantic intent — SHARED by the
 *  tier-0 grammar and the NL classifier. Returns null (a miss) when no
 *  apartment noun appears, or when the sentence is about a BUILDING.
 *
 *  §RAC-APARTMENT-IN-ROOM (L-1640/L-1641, 2026-08-21) — trailing place phrases
 *  ("on room 00-001", "in ground level", or both) are read AND CONSUMED through
 *  the ONE shared SpatialScopeTail parser (C67 §4 rule 16) BEFORE the building
 *  guard runs — the old guard counted floors?/levels?/storeys? as building
 *  words, so "…in ground level" killed the whole parse, and a room qualifier
 *  was silently dropped (the rule-6/16 scope-widening this closes). The guard's
 *  real job survives on the REMAINDER: "generate a 3-storey apartment building"
 *  still declines here and stays generate-building's sentence. */
export function parseApartmentLayoutIntent(
  text: string,
  ctx?: ResolverContext,
): Extract<SemanticIntent, { intent: 'generate-apartment-layout' }> | null {
  if (!APT_VERB_RE.test(text)) return null;
  if (!APT_NOUN_RE.test(text)) return null;

  // Read up to TWO trailing place phrases (room + level, either order).
  let rest = text;
  let roomRef: string | null = null;
  let levelQuery: string | null = null;
  for (let i = 0; i < 2; i++) {
    const m = matchTrailingSpatialScope(rest, ctx);
    if (m === null) break;
    // Rule 16: a NAMED place that cannot become a scope declines the grammar —
    // never a silent fall-back to the whole level.
    if (m.reading.kind === 'unusable') return null;
    const scope = m.reading.scope;
    const before = rest.slice(0, m.start).trim();
    if (scope.kind === 'room') {
      const ref = scope.roomRef.trim();
      if (APT_SCOPE_NOT_A_PLACE_RE.test(ref)) { rest = before; continue; }
      if (APT_PLACE_BUILDING_RE.test(ref)) return null;
      if (roomRef !== null) return null;         // two room phrases — not claimable
      roomRef = ref;
    } else if (scope.kind === 'level') {
      if (levelQuery !== null) return null;      // two level phrases — not claimable
      levelQuery = scope.levelQuery;
    } else {
      return null;                               // an unexpected scope kind — decline
    }
    rest = before;
  }

  // Building words in the REMAINDER (a storey count, "apartment building")
  // belong to `generate-building` — the guard's original job, intact.
  if (APT_BUILDING_RE.test(rest)) return null;
  // Element-level asks are someone else's sentence ("make the apartment walls
  // white", "create a window in the apartment").
  if (GEN_ELEMENT_NOUN_RE.test(rest)) return null;
  // "make" claims only the creation shape — "make the apartment white" is a
  // colour ask, not a generation ask (the matchGenerateBuilding rule verbatim).
  if (/^make\b/.test(text) && !/^make (?:me )?(?:a|an|another|new|\d)/.test(text)) return null;

  const num = (m: RegExpExecArray | null): number | null => {
    if (m === null) return null;
    const w = m[1]!;
    return /^\d+$/.test(w) ? Number(w) : (GEN_STOREY_WORDS[w] ?? null);
  };
  // "an en-suite in every bedroom" — tested on the FULL text because the
  // distributive tail ("in every bedroom") was consumed by the scope reader.
  const enSuiteCount: number | 'each-bedroom' | null = APT_ENSUITE_EVERY_RE.test(text)
    ? 'each-bedroom'
    : num(APT_ENSUITE_COUNT_RE.exec(rest));
  const openPlanKitchenLiving = APT_OPEN_KL_RE.test(rest);
  return {
    intent: 'generate-apartment-layout',
    bedrooms: num(APT_BEDROOMS_RE.exec(rest)),
    bathrooms: num(APT_BATHROOMS_RE.exec(rest)),
    masterEnSuite: APT_ENSUITE_RE.test(rest) || enSuiteCount !== null,
    // The fused great room subsumes the dining-merge toggle — never both.
    openPlanKitchenDining: APT_OPENPLAN_RE.test(rest) && !openPlanKitchenLiving,
    enSuiteCount,
    openPlanKitchenLiving,
    scope: roomRef !== null
      ? { kind: 'room', roomRef, ...(levelQuery !== null ? { levelQuery } : {}) }
      : levelQuery !== null
        ? { kind: 'level', levelQuery }
        : null,
  };
}

const matchApartmentLayout: Matcher = (text, ctx) => parseApartmentLayoutIntent(text, ctx);

// ─── §GEN-ROOMS / §GEN-CHAIN (RAC U5c) — the room-scale grammar ──────────────
//
// SHARED by the tier-0 grammar and the NL classifier, like every other parser
// in this file: the two paths cannot read the same sentence differently.

/** Which engine each verb/noun family names. Order inside a value does not
 *  matter — applySemanticIntent re-sorts into pipeline order. */
const ROOM_FINISH_PATTERNS: readonly (readonly [RoomFinishStep, RegExp])[] = [
  ['ceilings', /\bceilings?\b|\bceil\b/],
  ['floors', /\bfloor (?:finish|finishes|covering|coverings)\b|\bfloor[\s-]?finish(?:es)?\b|\bflooring\b/],
  ['furnish', /\bfurnish(?:es|ing)?\b|\bfurnitures?\b|\bfurnished\b/],
  ['lighting', /\blights?\b|\blighting\b|\blight up\b|\billuminate\b/],
];

/** Verbs that authorise a room-scale run. "furnish"/"light" are themselves
 *  verbs, so a bare "furnish all rooms" needs no separate verb word. */
const ROOM_FINISH_VERB_RE =
  /^(?:add|create|place|put|apply|generate|make|run|do|furnish|light|finish|fit)\b/;

/** All-floors words vs this-floor words. "every room" is NOT an all-floors
 *  ask — the engines' natural unit IS "every room on the level", which is
 *  exactly what "all rooms" means to an architect standing on a floor. */
const ROOM_SCOPE_ALL_FLOORS_RE =
  /\b(?:every|all|each)\s+(?:floors?|levels?|storeys?|stor(?:y|ies))\b|\bwhole building\b|\bentire building\b|\ball floors\b/;
const ROOM_SCOPE_LEVEL_RE =
  /\b(?:on|to|for|in)\s+(?:the\s+)?(?:level|floor|storey)\s+([\w.-]+)\b|\b(?:level|floor|storey)\s+(\d+)\b/;
const ROOM_SCOPE_SELECTION_RE = /\b(?:selected|selection|these|those)\b/;
/** A NAMED room ("the kitchen", "every bedroom") — recognized so it can be
 *  refused with the engines' real granularity, never silently widened. */
const ROOM_SCOPE_ROOM_RE =
  /\b(?:the|this|that|every|each|all)\s+((?:master\s+)?(?:kitchen|bathroom|bedroom|living\s*room|dining\s*room|hallway|hall|corridor|study|office|wc|toilet|utility|storage|balcony|terrace)s?)\b/;

/**
 * Parse a room-scale finish sentence (§GEN-ROOMS, RAC U5c.1). Returns null
 * when no room-scale engine is named — the sentence then belongs to some other
 * grammar (or to the LLM).
 */
export function parseRoomFinishIntent(
  text: string,
): Extract<SemanticIntent, { intent: 'generate-room-finishes' }> | null {
  const steps = ROOM_FINISH_PATTERNS.filter(([, re]) => re.test(text)).map(([s]) => s);
  if (steps.length === 0) return null;
  if (!ROOM_FINISH_VERB_RE.test(text)) return null;
  // A room/level/finish NOUN must be present, so "make the lights white" (a
  // colour ask about a fixture) never lands here.
  if (!/\brooms?\b|\bfloors?\b|\blevels?\b|\bstoreys?\b|\bapartment\b|\bflat\b|\bhere\b|\bbuilding\b/.test(text)
      && ROOM_SCOPE_ROOM_RE.exec(text) === null) {
    return null;
  }
  // Element-level asks belong to the property grammars, not here.
  if (/\bwalls?\b|\bwindows?\b|\bdoors?\b|\bslabs?\b|\bstairs?\b|\bcolumns?\b/.test(text)) return null;
  // Colour/type words mean this is a property ask about a finish, not a run.
  if (/\bwhite\b|\bblack\b|\bcolou?r\b|\bpaint\b|#[0-9a-f]{3,6}\b/.test(text)) return null;

  const roomM = ROOM_SCOPE_ROOM_RE.exec(text);
  const scope: Extract<SemanticIntent, { intent: 'generate-room-finishes' }>['scope'] =
    roomM !== null
      ? { kind: 'room', roomRef: roomM[1]!.replace(/\s+/g, ' ').trim() }
      : ROOM_SCOPE_ALL_FLOORS_RE.test(text)
        ? 'all-levels'
        : (() => {
            const lm = ROOM_SCOPE_LEVEL_RE.exec(text);
            const q = lm?.[1] ?? lm?.[2];
            if (q !== undefined && !['this', 'the', 'active', 'current'].includes(q)) {
              return { kind: 'level' as const, levelQuery: q };
            }
            return ROOM_SCOPE_SELECTION_RE.test(text) && !/\bthese rooms?\b|\bthis floor\b/.test(text)
              ? 'selection' as const
              : 'active-level' as const;
          })();
  return { intent: 'generate-room-finishes', steps, scope };
}

/** "finish this apartment" / "furnish and light the whole building" /
 *  "generate and finish an apartment" (§GEN-CHAIN, RAC U5c.2). */
const CHAIN_RE =
  /\b(?:finish|complete|fit ?out|do everything (?:to|for))\b[^.]*\b(?:apartment|flat|floor|level|building|place|unit)\b/;
const CHAIN_WITH_LAYOUT_RE = /\b(?:generate|create|lay ?out|plan|design)\b/;

export function parseFinishChainIntent(
  text: string,
): Extract<SemanticIntent, { intent: 'finish-apartment-chain' }> | null {
  if (!CHAIN_RE.test(text)) return null;
  // "furnish and light …" alone is a two-step room-scale ask, not the chain;
  // the chain word ("finish"/"complete"/"fit out") is what claims here.
  const lm = ROOM_SCOPE_LEVEL_RE.exec(text);
  const q = lm?.[1] ?? lm?.[2];
  const scope: Extract<SemanticIntent, { intent: 'finish-apartment-chain' }>['scope'] =
    q !== undefined && !['this', 'the', 'active', 'current'].includes(q)
      ? { kind: 'level', levelQuery: q }
      : 'active-level';
  return { intent: 'finish-apartment-chain', withLayout: CHAIN_WITH_LAYOUT_RE.test(text), scope };
}

const matchFinishChain: Matcher = (text) => parseFinishChainIntent(text);

const matchRoomFinishes: Matcher = (text) => parseRoomFinishIntent(text);

// §FEAT-CHAT-TOOL-ACTIVATION (L-906) — "create a bed" → activate the palette's
// bed placement tool. LAST in the matcher list, so every existing creation
// sentence keeps its owner. The exclusion set is built FROM the tier-1
// `SYNONYMS` table (never a second hand-written list): a noun tier-1 rewrites
// into another grammar's word ("floor"/"storey" → "level") must stay a tier-0
// miss here, or "add a floor" would stop meaning add-level.
const PLACEMENT_EXCLUDED_NOUNS: ReadonlySet<string> = new Set([
  ...Object.keys(SYNONYMS),
  'level', 'levels',
]);
const matchActivatePlacement: Matcher = (text) => {
  const ref = parsePlacementRef(text, PLACEMENT_EXCLUDED_NOUNS);
  return ref === null ? null : { intent: 'activate-placement', itemRef: ref };
};

const MATCHERS: readonly Matcher[] = [
  matchUndoRedo,
  matchZoom,
  // §GATE-VIS-INTENT — the visibility family. BEFORE matchGoToLevel would be
  // enough ("show everything" vs "show level 2" are disjoint anyway); placed
  // here so a visibility verb is decided before any noun grammar can nibble.
  // The read-only query runs FIRST of the four: it claims only interrogative
  // shapes no imperative matcher wants.
  matchVisibilityQuery,
  // §FEAT-RAC-PROPERTY-QUERY (L-2210) — BESIDE matchVisibilityQuery, and for the
  // identical reason stated three lines above: it claims ONLY interrogative and
  // bare-noun shapes that carry NO measurement, so no imperative matcher wants
  // them and it cannot nibble at one. "make this wall 3m tall" has a number and
  // is therefore unclaimable here by construction, not by ordering luck.
  matchPropertyQueryIntent,
  matchHideSelection,
  matchIsolateSelection,
  matchRevealAll,
  matchDeleteSelected,
  // RAC U9.2 — AFTER matchDeleteSelected, deliberately: "delete the selected
  // window" already resolves and a generic table must never quietly
  // re-interpret a sentence that works. The two are disjoint by construction
  // anyway (matchDeleteSelected requires selected/selection/this and NO place
  // tail), and the ordering keeps it provably so.
  matchDeleteScoped,
  // BEFORE the wall matchers: any sentence naming the RHINO model is about
  // the imported reference model, never about walls (§FEAT-RHINO-CHAT-MATERIAL).
  matchRhinoMaterial,
  // BEFORE matchWallType: "make all walls white" is a COLOUR ask; the colour
  // parser claims only resolvable colours (or paint/colour verbs), so type
  // sentences pass through to matchWallType untouched.
  matchWallColor,
  // BEFORE the dimension matchers: "make all walls angled by 70" carries a bare
  // number the matchHeight family must never nibble at; the rake words are what
  // claims it (§FEAT-WALL-RAKE-BATCH).
  matchWallRake,
  // BEFORE the dimension matchers: "make all walls interior partition" must not
  // be nibbled at by "make this … " shapes.
  // §FEAT-WALL-SIDE-FINISH — BEFORE matchWallType, and that ORDER IS LOAD-BEARING.
  // "change all walls in the kitchen finish limewash" also matches the TYPE
  // shape (with "finish limewash" read as a type name), and the type matcher
  // would claim it first and refuse with the wall-type catalogue — measured.
  // Safe in the other direction because this parser claims ONLY a finish ask:
  // "make all walls interior partition" has no finish marker and "partition"
  // is not in the finish table, so it falls through to the type grammar. Both
  // directions are pinned in wall-side-finish.test.ts.
  // ⭐⭐ §FIX-LAYER-ASK-REPAINTED (L-1260) — THE TWO SIBLINGS NOW SIT TOGETHER,
  // AND BOTH MUST PRECEDE matchWallType.
  //
  // `matchAddWallLayer` used to sit ~25 entries further down, which was safe
  // only while it required a leading "add" that no other grammar could claim.
  // Now that it claims the SHARED verbs on the word "layer", it has to be
  // adjacent to the sibling that stands aside on the same word — measured:
  // with the side-finish parser declining and this matcher still downstream,
  // *"make all walls interior layer finish plaster"* fell through to
  // `matchWallType` and produced
  //   wall.updateSystemTypeBatch { systemType: "interior layer finish plaster" }
  // — a wall SYSTEM TYPE set to a sentence fragment, which is worse than the
  // repaint it replaced. A guard that only moves an ask from one wrong grammar
  // to another is not a fix; the two owners of the word must be neighbours.
  matchAddWallLayer,
  matchWallSideFinish,
  // §FEAT-FLOOR-SURFACE-FINISH (L-1881) — BESIDE the wall finish grammar, and
  // BEFORE `matchMoveToLevel` / the catalogue families, for the same reason the
  // wall pair sits here: "change all floors to oak chevron" carries a storey noun
  // and a "to X" tail, which the type/level grammars downstream would read as a
  // TYPE or a LEVEL reference and refuse with the wrong catalogue.
  //
  // ⛔ Safe in the other direction BY CONSTRUCTION, not by luck. This parser
  // claims only a sentence that NAMES A MATERIAL the catalogue knows, so
  // "finish this floor" (finish-apartment-chain, which owns the whole
  // generate→furnish→light chain) and "change this floor to level 1"
  // (move-to-level) are never claimed. Both are pinned as misses in
  // floor-finish.test.ts.
  matchFloorFinish,
  matchWallType,
  // Window types, same guards as wall types ("make all windows 1m wide" never
  // claimed); the word "windows"/"window type" keeps it off the wall grammars.
  // RAC U7.2 — every CATALOGUE FAMILY's type grammar, generated from the table
  // (window, door, slab, ceiling). They sit exactly where matchWindowType and
  // matchDoorType sat: after the wall grammars, before the dimension family.
  // §L-1032 — BEFORE the catalogue families, and the order is LOAD-BEARING.
  // MEASURED 2026-08-19: "change this slab's level to level 1" was claimed by
  // the SLAB catalogue grammar with `typeRef = "level to level 1"` — its scoped
  // shape reads `this` + `slab` + `'s` + everything after the next space as a
  // type name — and the reply refused with the slab-type catalogue. That is the
  // §FIX-CHAT-TYPEREF-SWALLOW shape again, and the founder's own possessive
  // phrasing walked straight into it.
  //
  // Safe in the other direction BY CONSTRUCTION, not by luck: this parser claims
  // only a sentence whose storey noun is IMMEDIATELY followed by "to" ("…'s
  // LEVEL TO x"), which no catalogue phrasing produces ("on level 2 to fire
  // doors" has "level 2 to", not "level to"), and only when the head names a
  // real element family or the destination resolves as a level. "change this
  // floor to oak", "change the slab type to concrete" and "change all doors on
  // level 2 to fire doors" are pinned as misses in moveToLevel.test.ts.
  matchMoveToLevel,
  // §REFUSE-STAIR-RUN (L-1444) — BEFORE the catalogue families and BEFORE
  // matchDimensionScoped, and the order is load-bearing in BOTH directions.
  //
  // "change first run of all stairs to 4 meters" carries a scope word, the
  // stair noun and a (number, unit) pair, so `matchDimensionScoped`'s
  // property-first shape would look at it — and find no dimension BINDING
  // ("run" is not a dimension word), so it returns null and the sentence would
  // have fallen through to a bare miss. Claiming it here turns that miss into
  // a refusal that names the gap AND the live alternatives (C16 CA-18).
  //
  // Safe in the other direction BY CONSTRUCTION: this parser declines every
  // part that already HAS a capability ("tread", "riser", "going" — see
  // OWNED_PART_RE), so "change tread to 280mm" reaches `matchTreadDepth`
  // untouched. Pinned in stair-chat-acceptance.test.ts, both ways.
  matchStairPart,
  ...CATALOGUE_FAMILY_MATCHERS,
  // "create a window in the middle of every wall segment" — BEFORE
  // matchCreateWall: both start with creation verbs, but this one requires the
  // word "window", which the wall grammar never carries.
  matchWindowsParametric,
  // §REFUSE-STAIR-SPAN (L-1444) — BEFORE the placement grammar at the bottom of
  // this list, which is the ONLY other claimant of a creation verb + stair noun.
  //
  // ⛔ It cannot steal "create a stair": `parsePlacementRef` owns that sentence
  // and ACTIVATES THE REAL TOOL, which works. This parser requires a level RANGE
  // or an anchor reference — the two things the pipeline cannot honour — so a
  // plain creation sentence has nothing for it to match. §FIX-PLACEMENT-OVERCLAIM
  // records eight pills lost to exactly this mistake; the guard is that the
  // grammar demands evidence of the UN-DOABLE ask, not merely of a stair.
  matchStairSpan,
  // §FEAT-RAC-STAIR-SHAPE (L-1541) — AFTER matchStairSpan, and the order is the
  // whole safety argument.
  //
  // ⭐ matchStairSpan claims a stair-creation sentence carrying a LEVEL RANGE or
  // a bare anchor, and its refusal is PINNED (C98 §L-1441.1.a) with §L-1441.4.a
  // explicitly forbidding it being softened into a partial result. Running the
  // shape grammar second means it can only ever pick up sentences that grammar
  // declined — it can never convert a pinned refusal into an activation.
  //
  // ⛔ It also cannot steal "create a stair": it REQUIRES a shape word, and the
  // plain sentence has none, so `parsePlacementRef` at the bottom of this list
  // keeps it and keeps activating the tool with its own default. Both directions
  // are pinned in stair-chat-acceptance.test.ts.
  //
  // ⚠ The two do overlap on ONE shape: "create a stair in L shape aligned to the
  // selected wall". matchStairSpan sees an anchor and would refuse it whole;
  // this grammar arms the L-shape tool and DISCLOSES the un-applied alignment.
  // The tie is broken in favour of the honoured half deliberately — refusing a
  // sentence whose main verb the product can serve is C84 §4F.5's wrong-refusal
  // defect. The disclosure is what keeps it from being C84 EI-2 narrowing, and
  // it is asserted, not assumed.
  matchStairShape,
  // §REFUSE-RAC-REPLICATE (L-1542) — BEFORE matchDuplicateLevel would be wrong
  // and BEFORE the placement grammar is required.
  //
  // It is disjoint from `duplicate-level` BY CONSTRUCTION, in both directions:
  // that parser declines every element-shaped source (its guard lists `stairs?`,
  // `walls?`, `columns?` …), and this one REQUIRES an element noun. So
  // "duplicate ground to level 1" keeps its live capability and "copy the
  // selected stair to level 1" — which used to be a bare miss — reaches a
  // refusal that names that live capability as the alternative.
  matchReplicateElement,
  // §FEAT-BULK-DIMENSIONS (L-949) — the bulk-dimension families. Placed AFTER
  // every type / colour / rake / layer / creation grammar above and BEFORE the
  // single-element dimension matchers below, and disjoint from both by
  // construction: it claims only a sentence carrying a SCOPE WORD, a family
  // NOUN and at least one (number, dimension-word) BINDING. The grammars above
  // carry no binding ("timber casement", "white", "angled by 70 degrees" — and
  // rake/pitch words are declined outright); the matchers below claim only the
  // bare "this" / "the selection" shapes this parser deliberately does not
  // match. The ordering makes that provable rather than merely true.
  matchDimensionScoped,
  // §GEN-CHAT (RAC U5b.2) — "generate a 3-storey residential building" /
  // "…house" / "…office building with 5 floors". BEFORE matchAddLevel and
  // matchCreateWall: those share the creation verbs, but generation requires a
  // building-typology noun neither of them carries (and element nouns never
  // claim here, so every element grammar above is untouched).
  //
  // matchApartmentLayout goes FIRST of the two: "create a 3 bedroom apartment"
  // fills the drawn shell, "generate a 3-storey apartment building" makes a new
  // envelope. The two grammars are already disjoint (the apartment parser
  // refuses every building word, the building parser needs one), so the order
  // is documentation of intent rather than a tie-break.
  // §GEN-CHAIN (RAC U5c.2) BEFORE §GEN-ROOMS: "finish this apartment and light
  // it" names a room-scale engine too, but the chain word is the stronger
  // claim — the user asked for the whole flow, not one stage of it.
  matchFinishChain,
  // §GEN-ROOMS (RAC U5c.1) — "furnish all rooms" / "add ceilings to every
  // room". BEFORE the apartment/building grammars: "furnish an apartment" is
  // a finishing ask over rooms that already exist, while "create a 3 bedroom
  // apartment" is a layout ask; the room grammar requires a finish ENGINE word
  // (ceiling / floor finish / furnish / light) that neither generator carries.
  matchRoomFinishes,
  matchApartmentLayout,
  matchGenerateBuilding,
  matchRiserHeight,  // before matchHeight — "riser height" contains "height"
  matchTreadDepth,
  matchRoomHeightOffset, // before matchHeight — "height offset" contains "height"
  matchSillHeight,   // before matchHeight — "sill height" contains "height"
  matchHeight,
  matchThickness,
  matchWidth,
  // RAC U7.1 — AFTER the hand-written dimension matchers, deliberately: those
  // three own their phrasings today, and a generic table must never quietly
  // re-interpret a sentence that already resolves. Everything the vocabulary
  // adds ("depth", "base offset", "length", …) is disjoint from them by
  // construction, and the ordering keeps it provably so.
  matchProperty,
  matchRoofPitch,
  matchRoomNumber,
  // §FEAT-CHAT-ROOM-OCCUPANCY — AFTER every wall matcher above (so
  // "make all walls white in the kitchen" is never re-read as a room use) and
  // AFTER matchRoomNumber (so "set the room number to 001" keeps its meaning).
  // Its own guards do the rest: the bare selection form claims only when the
  // use word resolves against the canonical vocabulary.
  matchRoomOccupancy,
  matchGoToLevel,
  matchDuplicateLevel,
  matchAddLevel,
  matchCreateWall,
  matchRenameRoom,
  // §FEAT-CHAT-TOOL-ACTIVATION (L-906) — LAST, deliberately: it claims only a
  // bare "create/place/add <noun-phrase>" that every richer grammar above has
  // already passed on. "create a wall" (create-wall), "add a level at 3m"
  // (add-level), "create a 3 bedroom apartment" (generation) and "create a
  // window in every wall segment" (parametric) are all untouched by
  // construction and by the ordering.
  matchActivatePlacement,
];

/**
 * The tier-0/1 grammar in INTENT mode: the first matcher that claims `text`
 * wins, and its SemanticIntent is returned unapplied. This is what the RAC U6
 * plan executor resolves each clause of a compound sentence with — the SAME
 * matcher list, in the SAME order, so a clause inside a plan can never be
 * understood differently from the same words typed alone.
 */
function runGrammarIntent(text: string, ctx: ResolverContext): SemanticIntent | null {
  for (const matcher of MATCHERS) {
    const si = matcher(text, ctx);
    if (si !== null) return si;
  }
  return null;
}

function runGrammar(text: string, ctx: ResolverContext, tier: 0 | 1): ZeroTokenResolution | null {
  const si = runGrammarIntent(text, ctx);
  if (si === null) return null;
  const r = applySemanticIntent(si, ctx);
  return r.kind === 'refusal' ? r : { ...r, tier };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Resolve a chat utterance to bus commands / a local action / a refusal — with
 * ZERO tokens. Returns `{ kind: 'miss' }` when the utterance is not
 * command-shaped; the caller may then fall through to the NL layer
 * (LocalNaturalLanguageResolver) and only after that to the LLM tier.
 *
 * Pure: the caller injects selection/levels and executes the result (P6).
 * P8: wrapped in the `pryzm.ai.chat.resolve` span.
 */
/**
 * RAC U6 — the tier-0/1 ladder in INTENT mode: normalize, run the grammar, and
 * on a miss run tier-1 normalization and the grammar again — exactly what
 * `resolveUtterance` does, stopping one step earlier (before
 * `applySemanticIntent`). Returns null when no matcher claims the text.
 *
 * The paste-back guard is applied HERE too, on the raw text, so a plan clause
 * cannot reach a grammar that the same words typed alone could not
 * (§FIX-CHAT-REPORT-PASTEBACK; a plan may never bypass a gate a single sentence
 * would hit). NOT spanned: it is a helper on the resolve path, and the caller's
 * `pryzm.ai.chat.resolve` span already covers the utterance.
 */
/**
 * THE LADDER GATES, in one place — the (utterance, intent) pairs no grammar on
 * any rung may claim, whatever its confidence. Exported so the tier-0/1 path,
 * the NL classifier and the plan executor consult ONE list; a gate that only
 * half the ladder honours is not a gate.
 *
 *  • 'visibility' — §FIX-CHAT-VISIBILITY-MISREAD and
 *    §FIX-CHAT-HIDE-IS-NOT-NAVIGATE. A visibility verb may claim only intents
 *    that change the view, and `hide`/`isolate`/`highlight` may claim none.
 *  • 'property-not-element' — §FIX-CHAT-PROPERTY-REMOVAL-IS-NOT-DELETE.
 *    "remove the material from this wall" resolved to `element.delete`. Scoped
 *    to the delete family: the guard exists to stop a PROPERTY ask reaching a
 *    DESTRUCTIVE intent, not to police every sentence containing "remove".
 */
export function ladderGateReason(
  utterance: string,
  intent: string,
): 'visibility' | 'property-not-element' | null {
  if (visibilityMisreadReason(utterance, intent) !== null) return 'visibility';
  if (
    (intent === 'delete-selected' || intent === 'delete-families') &&
    propertyRemovalReason(utterance) !== null
  ) {
    return 'property-not-element';
  }
  return null;
}

export function resolveUtteranceIntent(utterance: string, ctx: ResolverContext): SemanticIntent | null {
  const text = normalize(utterance);
  if (text.length === 0 || descriptiveReportReason(utterance) !== null) return null;
  // §FIX-CHAT-VISIBILITY-MISREAD — a visibility verb may reach a VIEW intent
  // and nothing else. "highlight walls taller than 3m" carried a height word
  // and a measurement, which was all the dimension family ever needed, and it
  // dispatched wall.updateDimensions on a read-only question.
  const claimed = (si: SemanticIntent | null): SemanticIntent | null =>
    si !== null && ladderGateReason(utterance, si.intent) !== null ? null : si;
  const t0 = claimed(runGrammarIntent(text, ctx));
  if (t0 !== null) return t0;
  const t1 = tier1Normalize(text);
  return t1 !== text ? claimed(runGrammarIntent(t1, ctx)) : null;
}

export function resolveUtterance(utterance: string, ctx: ResolverContext): ZeroTokenResolution {
  return tracer().startActiveSpan('pryzm.ai.chat.resolve', (span) => {
    try {
      const text = normalize(utterance);
      let result: ZeroTokenResolution;
      // §FIX-CHAT-REPORT-PASTEBACK — a DESCRIPTION of something that already
      // happened is never an instruction. Checked on the RAW utterance before
      // any normalization, and on BOTH tiers, so no grammar can be reached by
      // pasting the assistant's own report back into the chat.
      if (text.length === 0 || descriptiveReportReason(utterance) !== null) {
        result = { kind: 'miss' };
      } else {
        // Tier 0 — exact grammar.
        let r = runGrammar(text, ctx, 0);
        // Tier 1 — synonym + typo normalization, then the same grammar.
        if (r === null) {
          const t1 = tier1Normalize(text);
          if (t1 !== text) r = runGrammar(t1, ctx, 1);
        }
        // §FIX-CHAT-VISIBILITY-MISREAD — the same gate on the APPLIED path, so
        // the two entry points cannot disagree about what a visibility verb is
        // allowed to claim.
        if (r !== null && r.kind !== 'miss' && ladderGateReason(utterance, r.intent) !== null) {
          r = null;
        }
        result = r ?? { kind: 'miss' };
      }
      span.setAttribute('pryzm.ai.chat.kind', result.kind);
      if (result.kind === 'commands' || result.kind === 'local') {
        span.setAttribute('pryzm.ai.chat.intent', result.intent);
        span.setAttribute('pryzm.ai.chat.tier', result.tier);
      } else if (result.kind === 'refusal') {
        span.setAttribute('pryzm.ai.chat.intent', result.intent);
      }
      span.end();
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.end();
      throw err;
    }
  });
}
