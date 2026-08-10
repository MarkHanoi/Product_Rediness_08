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
import { describeCapabilitiesFor } from '../capabilities/CapabilityRefusal.js';
import { exampleColorNames, resolveColorRef } from './colorRef.js';
import { isScopeError, type ScopeDescriptor, type ScopeResult } from './ScopeDescriptor.js';
// §FEAT-WALL-RAKE-BATCH — the rake bounds are the geometry package's exported
// constants, never re-typed (C65 §3.5: one policy, one place). Constants only;
// the purity note above still holds — no store instance is constructed here.
import { RAKE_MIN_DEG, RAKE_MAX_DEG } from '@pryzm/geometry-wall';

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
  /**
   * ADR-0315 U3.2 — the injected SCOPE RESOLVER (F2). Turns a ScopeDescriptor
   * into authoritative element ids ONCE, editor-side, over indexed paths
   * (storeRegistry / getByLevel / room predicates / θ-threaded facades). The
   * resolver stays pure; absence means scoped asks refuse honestly ("scope
   * resolution isn't available here"), never guess.
   */
  readonly resolveScope?: (scope: ScopeDescriptor) => ScopeResult;
}

export interface BusCommandRef {
  readonly type: string;
  readonly payload: Record<string, unknown>;
}

export type ZeroTokenLocalAction = 'undo' | 'redo' | 'setActiveLevel';

export type ZeroTokenResolution =
  | {
      readonly kind: 'commands';
      readonly intent: string;
      readonly tier: 0 | 1 | 'nl';
      readonly summary: string;
      readonly commands: readonly BusCommandRef[];
      readonly destructive: boolean;
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
];

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
  | { readonly intent: 'set-height'; readonly value: number }
  | { readonly intent: 'set-thickness'; readonly value: number }
  /** §FEAT-CHAT-SYMMETRY (2026-08-10) — ONE width intent for every element kind
   *  whose editor command really takes a width (door / window / stair), routed
   *  per kind in applySemanticIntent. The old id `set-door-width` encoded the
   *  accident that doors got wired first. */
  | { readonly intent: 'set-width'; readonly value: number }
  | { readonly intent: 'set-sill-height'; readonly value: number }
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
      readonly scope: 'all' | 'selection';
    }
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
       *  white" / "paint all walls in the kitchen white". Object forms are
       *  resolved by the injected ctx.resolveScope; absence refuses honestly. */
      readonly scope:
        | 'all'
        | 'selection'
        | { readonly kind: 'level'; readonly levelQuery: string }
        | { readonly kind: 'room'; readonly roomRef: string };
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
      readonly scope:
        | 'all'
        | 'selection'
        | { readonly kind: 'level'; readonly levelQuery: string }
        | { readonly kind: 'room'; readonly roomRef: string };
    };

/** applySemanticIntent's result — a resolution minus the tier stamp (the
 *  caller adds `tier: 0 | 1 | 'nl'` on non-refusal results). */
export type SemanticApplication =
  | {
      readonly kind: 'commands';
      readonly intent: string;
      readonly summary: string;
      readonly commands: readonly BusCommandRef[];
      readonly destructive: boolean;
    }
  | {
      readonly kind: 'local';
      readonly intent: string;
      readonly summary: string;
      readonly action: ZeroTokenLocalAction;
      readonly levelId?: string;
      readonly levelName?: string;
    }
  | {
      readonly kind: 'refusal';
      readonly intent: string;
      readonly reason: string;
      readonly suggestions: readonly string[];
    };

type MatchResult = SemanticApplication;

type Matcher = (text: string, ctx: ResolverContext) => MatchResult | null;

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

/**
 * Turn a SemanticIntent into a safe application: bus commands, a local
 * action, or an honest refusal. This is the SINGLE authority on the
 * semantics→command mapping — the tier-0/1 grammar and the NL layer both
 * funnel through it, so the safety guards (selection required, element-type
 * match, level exists, positive dimensions) can never diverge between the
 * rigid and natural paths. Pure; never dispatches (P6 is the caller's job).
 */
export function applySemanticIntent(si: SemanticIntent, ctx: ResolverContext): SemanticApplication {
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
      const nonWindow = ctx.selection.find((s) => s.elementType !== 'window');
      if (nonWindow !== undefined) {
        return {
          kind: 'refusal', intent: 'set-sill-height',
          reason: `Sill height applies to windows, but the selected element is a ${nonWindow.elementType}.`,
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

    case 'set-riser-height':
    case 'set-tread-depth': {
      // ADR-0315 P1 — both ride the LIVE stair.updateParameters carrier; the
      // command validates against STAIR_CONSTRAINTS and refuses with the real
      // bound in the message, so the resolver only guards positivity.
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
      // ADR-0314 §Selection batch — the compound form stays ONE-element-only:
      // its whole §FIX-CHAT-COMPOUND-DIMENSIONS contract is one dispatch = one
      // rebuild for one element, and fanning that across a selection multiplies
      // the stale-id hazard it exists to prevent. Refuse with the reason.
      if (ctx.selection.length > 1) {
        return {
          kind: 'refusal', intent: 'set-dimensions',
          reason:
            `Changing several dimensions at once works on one selected element at a time — ` +
            `${ctx.selection.length} are selected. Select one element, or change one dimension for all of them.`,
          suggestions: ['set height to 3m'],
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
      return {
        kind: 'commands', intent: 'add-level',
        summary: `Add "${name}" at elevation ${fmt(elevation)}`,
        commands: [{ type: 'level.add', payload: { levelId, name, elevation, height: 3 } }],
        destructive: false,
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

    case 'set-wall-type': {
      // Scope first: "the selected walls" must never silently become "all walls".
      let wallIds: readonly string[] | 'all';
      if (si.scope === 'selection') {
        const walls = ctx.selection.filter((s) => normalizeElementKind(s.elementType) === 'wall');
        if (walls.length === 0) {
          const kinds = [...new Set(ctx.selection.map((s) => normalizeElementKind(s.elementType)))];
          return {
            kind: 'refusal', intent: 'set-wall-type',
            reason: kinds.length === 0
              ? 'No walls are selected — select some walls, or say "change all walls to …" to retype the whole project.'
              : `Wall types apply to walls, and the selection is ${kinds.join(' + ')}. Nothing was changed.`,
            suggestions: ['change all walls to interior partition'],
          };
        }
        wallIds = walls.map((s) => s.elementId);
      } else {
        wallIds = 'all';
      }

      // Resolve the type through the INJECTED lookup (one implementation —
      // `resolveWallSystemTypeRef`). Absent injection forwards the raw string
      // and the command refuses with the same honesty; it never guesses.
      let systemType = si.typeRef;
      let typeLabel = `"${si.typeRef}"`;
      if (ctx.resolveWallSystemType !== undefined) {
        const hit = ctx.resolveWallSystemType(si.typeRef);
        if (hit === null) {
          const names = ctx.wallSystemTypeNames ?? [];
          return {
            kind: 'refusal', intent: 'set-wall-type',
            reason: names.length === 0
              ? `I could not find a wall type called "${si.typeRef}" in this project.`
              : `There is no wall type called "${si.typeRef}" in this project. The wall types here are: ${names.join(', ')}.`,
            suggestions: names.slice(0, 2).map((n) => `change all walls to ${n.toLowerCase()}`),
          };
        }
        systemType = hit.id;
        typeLabel = `"${hit.name}"`;
      }

      const scopeLabel = wallIds === 'all'
        ? 'every wall in the project'
        : `${wallIds.length} selected wall${wallIds.length === 1 ? '' : 's'}`;
      return {
        kind: 'commands', intent: 'set-wall-type',
        summary: `Change ${scopeLabel} to ${typeLabel}`,
        commands: [{
          type: 'wall.updateSystemTypeBatch',
          payload: { wallIds: wallIds === 'all' ? 'all' : [...wallIds], systemType },
        }],
        // NOT destructive. A retype is one undo entry, it deletes nothing, and
        // the command already reports "Changed N of M — K skipped: <reason>"
        // per §CONTEXT-DATA-HONESTY. Gating it behind a Confirm card would put
        // a modal in front of the founder's exact sentence for no safety gain;
        // the reversible-and-reported path is the honest one.
        destructive: false,
      };
    }

    case 'set-wall-color': {
      // §FEAT-WALL-COLOR-BATCH (ADR-0314). Scope first, mirroring set-wall-type:
      // "the selected walls" must never silently become "all walls".
      let wallIds: readonly string[] | 'all';
      let scopeLabelOverride: string | null = null;
      const scopeNotes: string[] = [];
      if (typeof si.scope === 'object') {
        // ADR-0315 U3 — spatially scoped sentences ("on level 2" / "in the
        // kitchen"). Resolution happens ONCE through the injected resolver;
        // its absence refuses honestly, never guesses.
        const phrase = si.scope.kind === 'level'
          ? `on level ${si.scope.levelQuery}`
          : `in the ${si.scope.roomRef}`;
        if (ctx.resolveScope === undefined) {
          return {
            kind: 'refusal', intent: 'set-wall-color',
            reason:
              `I can't resolve "${phrase}" here — spatial scoping isn't wired ` +
              `into this chat context. I can change all walls or the selected walls.`,
            suggestions: ['make all walls white'],
          };
        }
        const descriptor: ScopeDescriptor = si.scope.kind === 'level'
          ? { kind: 'level', levelQuery: si.scope.levelQuery, elementKind: 'wall' }
          : { kind: 'room', roomRef: si.scope.roomRef, elementKind: 'wall' };
        const result = ctx.resolveScope(descriptor);
        if (isScopeError(result)) {
          return {
            kind: 'refusal', intent: 'set-wall-color',
            reason: result.error,
            suggestions: ['make all walls white'],
          };
        }
        if (result.ids.length === 0) {
          return {
            kind: 'refusal', intent: 'set-wall-color',
            reason: `There are no walls ${phrase} — nothing was changed.`,
            suggestions: ['make all walls white'],
          };
        }
        wallIds = result.ids;
        const where = result.diagnostics[0] ?? phrase.replace(/^on |^in the /, '');
        scopeLabelOverride = `all ${result.ids.length} wall${result.ids.length === 1 ? '' : 's'} ${si.scope.kind === 'level' ? 'on' : 'bounding'} ${where}`;
        for (const s of result.skipped) {
          scopeNotes.push(`${s.count}× ${s.kind} skipped: ${s.reason}`);
        }
      } else if (si.scope === 'selection') {
        const walls = ctx.selection.filter((s) => normalizeElementKind(s.elementType) === 'wall');
        if (walls.length === 0) {
          const kinds = [...new Set(ctx.selection.map((s) => normalizeElementKind(s.elementType)))];
          return {
            kind: 'refusal', intent: 'set-wall-color',
            reason: kinds.length === 0
              ? 'No walls are selected — select some walls, or say "make all walls white" to recolour the whole project.'
              : `Wall colour applies to walls, and the selection is ${kinds.join(' + ')}. Nothing was changed.`,
            suggestions: ['make all walls white'],
          };
        }
        wallIds = walls.map((s) => s.elementId);
      } else {
        wallIds = 'all';
      }

      // ONE colour table (colorRef.ts): a name or '#hex'; anything else refuses
      // by LISTING real options, never by guessing (§CONTEXT-DATA-HONESTY).
      const color = resolveColorRef(si.colorRef);
      if (color === null) {
        return {
          kind: 'refusal', intent: 'set-wall-color',
          reason:
            `I don't know the colour "${si.colorRef}". I understand names like ` +
            `${exampleColorNames().join(', ')} — or an exact hex value like #f4f1e8.`,
          suggestions: ['make all walls white', 'make all walls #f4f1e8'],
        };
      }

      const scopeLabel = scopeLabelOverride !== null
        ? scopeLabelOverride
        : wallIds === 'all'
          ? 'every wall in the project'
          : `${wallIds.length} selected wall${wallIds.length === 1 ? '' : 's'}`;
      const notesTail = scopeNotes.length > 0 ? ` (${scopeNotes.join(' · ')})` : '';
      return {
        kind: 'commands', intent: 'set-wall-color',
        summary: `Paint ${scopeLabel} ${color.label}${notesTail}`,
        commands: [{
          type: 'wall.updateColorBatch',
          payload: { wallIds: wallIds === 'all' ? 'all' : [...wallIds], materialColor: color.hex },
        }],
        // NOT destructive — one undo entry, deletes nothing, and the command
        // reports "Recoloured N of M — K skipped" (same policy as set-wall-type).
        destructive: false,
      };
    }

    case 'set-wall-rake': {
      // §FEAT-WALL-RAKE-BATCH — scope first, the exact set-wall-color shape:
      // "the selected walls" must never silently become "all walls".
      let wallIds: readonly string[] | 'all';
      let scopeLabelOverride: string | null = null;
      const scopeNotes: string[] = [];
      if (typeof si.scope === 'object') {
        const phrase = si.scope.kind === 'level'
          ? `on level ${si.scope.levelQuery}`
          : `in the ${si.scope.roomRef}`;
        if (ctx.resolveScope === undefined) {
          return {
            kind: 'refusal', intent: 'set-wall-rake',
            reason:
              `I can't resolve "${phrase}" here — spatial scoping isn't wired ` +
              `into this chat context. I can angle all walls or the selected walls.`,
            suggestions: ['make all walls angled by 70 degrees'],
          };
        }
        const descriptor: ScopeDescriptor = si.scope.kind === 'level'
          ? { kind: 'level', levelQuery: si.scope.levelQuery, elementKind: 'wall' }
          : { kind: 'room', roomRef: si.scope.roomRef, elementKind: 'wall' };
        const result = ctx.resolveScope(descriptor);
        if (isScopeError(result)) {
          return {
            kind: 'refusal', intent: 'set-wall-rake',
            reason: result.error,
            suggestions: ['make all walls angled by 70 degrees'],
          };
        }
        if (result.ids.length === 0) {
          return {
            kind: 'refusal', intent: 'set-wall-rake',
            reason: `There are no walls ${phrase} — nothing was changed.`,
            suggestions: ['make all walls angled by 70 degrees'],
          };
        }
        wallIds = result.ids;
        const where = result.diagnostics[0] ?? phrase.replace(/^on |^in the /, '');
        scopeLabelOverride = `all ${result.ids.length} wall${result.ids.length === 1 ? '' : 's'} ${si.scope.kind === 'level' ? 'on' : 'bounding'} ${where}`;
        for (const s of result.skipped) {
          scopeNotes.push(`${s.count}× ${s.kind} skipped: ${s.reason}`);
        }
      } else if (si.scope === 'selection') {
        const walls = ctx.selection.filter((s) => normalizeElementKind(s.elementType) === 'wall');
        if (walls.length === 0) {
          const kinds = [...new Set(ctx.selection.map((s) => normalizeElementKind(s.elementType)))];
          return {
            kind: 'refusal', intent: 'set-wall-rake',
            reason: kinds.length === 0
              ? 'No walls are selected — select some walls, or say "make all walls angled by 70 degrees".'
              : `The wall angle applies to walls, and the selection is ${kinds.join(' + ')}. Nothing was changed.`,
            suggestions: ['make all walls angled by 70 degrees'],
          };
        }
        wallIds = walls.map((s) => s.elementId);
      } else {
        wallIds = 'all';
      }

      // Range refusal with the geometry package's REAL bounds (never re-typed).
      // Per-wall shape refusals (curved / layered / hosting openings) belong to
      // the command's rakeAuthorability pass and arrive in its honest report.
      const deg = si.angleDeg;
      if (!Number.isFinite(deg) || deg < RAKE_MIN_DEG || deg > RAKE_MAX_DEG) {
        return {
          kind: 'refusal', intent: 'set-wall-rake',
          reason:
            `A wall can lean between ${RAKE_MIN_DEG}° and ${RAKE_MAX_DEG}° ` +
            `(90° = vertical); ${deg}° is outside that range.`,
          suggestions: ['make all walls angled by 70 degrees', 'make all walls vertical'],
        };
      }

      const scopeLabel = scopeLabelOverride !== null
        ? scopeLabelOverride
        : wallIds === 'all'
          ? 'every wall in the project'
          : `${wallIds.length} selected wall${wallIds.length === 1 ? '' : 's'}`;
      const notesTail = scopeNotes.length > 0 ? ` (${scopeNotes.join(' · ')})` : '';
      return {
        kind: 'commands', intent: 'set-wall-rake',
        summary: `Lean ${scopeLabel} to ${deg}°${deg === 90 ? ' (vertical)' : ''}${notesTail}`,
        commands: [{
          type: 'wall.updateRakeBatch',
          payload: { wallIds: wallIds === 'all' ? 'all' : [...wallIds], rakeAngleDeg: deg },
        }],
        // NOT destructive — one undo entry, deletes nothing, and the command
        // reports "Raked N of M — K skipped" (same policy as the colour batch).
        destructive: false,
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
  }
}

// ─── Grammar (tier 0) ────────────────────────────────────────────────────────
//
// The matchers decide WHETHER a normalized utterance is claim-able and parse
// its entities into a SemanticIntent; applySemanticIntent (above) owns the
// semantics→command mapping and every safety guard.

const matchUndoRedo: Matcher = (text, ctx) => {
  if (/^undo( this| last( \w+)?)?$/.test(text)) {
    return applySemanticIntent({ intent: 'undo' }, ctx);
  }
  if (/^redo( this| last( \w+)?)?$/.test(text)) {
    return applySemanticIntent({ intent: 'redo' }, ctx);
  }
  return null;
};

const matchZoom: Matcher = (text, ctx) => {
  if (/^(zoom( to)? ?(fit|all|extents?)|fit (view|all|model|everything)|frame (all|model|everything))$/.test(text)) {
    return applySemanticIntent({ intent: 'zoom-fit' }, ctx);
  }
  if (/^(zoom( to| on)? (selected|selection|this)|frame (selected|selection|this))$/.test(text)) {
    return applySemanticIntent({ intent: 'zoom-selected' }, ctx);
  }
  return null;
};

const matchDeleteSelected: Matcher = (text, ctx) => {
  const m = /^delete (?:the )?(?:selected|selection|this)(?: (\w+))?$/.exec(text)
    ?? /^delete (?:the )?selected$/.exec(text);
  if (!m) return null;
  const noun = m[1];
  if (noun !== undefined && !ELEMENT_NOUNS.has(noun)) return null; // "delete this level" etc. — not this intent
  return applySemanticIntent(
    { intent: 'delete-selected', ...(noun !== undefined ? { noun } : {}) },
    ctx,
  );
};

// ADR-0315 P1 — stair riser height / tread depth and room height offset.
// All three contain "height"/"depth" words, so they run BEFORE matchHeight.
const matchRiserHeight: Matcher = (text, ctx) => {
  const m = new RegExp(`^(?:set|change|make)(?: the)?(?: stair)? risers? height(?: to)? ${LEN_SRC}$`).exec(text);
  if (!m) return null;
  return applySemanticIntent({ intent: 'set-riser-height', value: toMeters(m[1]!, m[2]) }, ctx);
};

const matchTreadDepth: Matcher = (text, ctx) => {
  const m = new RegExp(`^(?:set|change|make)(?: the)?(?: stair)? (?:tread depth|going)(?: to)? ${LEN_SRC}$`).exec(text);
  if (!m) return null;
  return applySemanticIntent({ intent: 'set-tread-depth', value: toMeters(m[1]!, m[2]) }, ctx);
};

const matchRoomHeightOffset: Matcher = (text, ctx) => {
  const m = new RegExp(`^(?:set|change|make)(?: the)?(?: room)? height offset(?: to)? ${LEN_SRC}$`).exec(text);
  if (!m) return null;
  return applySemanticIntent({ intent: 'set-room-height-offset', value: toMeters(m[1]!, m[2]) }, ctx);
};

// NOTE: sill-height must run BEFORE plain height ("sill height" contains "height").
const matchSillHeight: Matcher = (text, ctx) => {
  const m = new RegExp(`^(?:set|change|make)(?: the)?(?: window)? sill height(?: to)? ${LEN_SRC}$`).exec(text);
  if (!m) return null;
  return applySemanticIntent({ intent: 'set-sill-height', value: toMeters(m[1]!, m[2]) }, ctx);
};

// The optional element noun is deliberately broad ("set the ceiling height…",
// "set the slab thickness…"): WHICH kinds are legal is the registry guard's
// job inside applySemanticIntent, not the grammar's — a noun/selection mismatch
// gets an honest refusal, never a silent narrow miss.
const DIM_NOUN = String.raw`(?: wall| ceiling| slab| roof| door| window| stair| column| beam| selected)?`;

const matchHeight: Matcher = (text, ctx) => {
  const m =
    new RegExp(`^(?:set|change)(?: the)?${DIM_NOUN} height(?: of (?:this|the selection))?(?: to)? ${LEN_SRC}$`).exec(text)
    ?? new RegExp(`^make (?:this|the selection) ${LEN_SRC} (?:tall|high)$`).exec(text);
  if (!m) return null;
  return applySemanticIntent({ intent: 'set-height', value: toMeters(m[1]!, m[2]) }, ctx);
};

const matchThickness: Matcher = (text, ctx) => {
  const m =
    new RegExp(`^(?:set|change)(?: the)?${DIM_NOUN} thickness(?: to)? ${LEN_SRC}$`).exec(text)
    ?? new RegExp(`^make (?:this|the selection) ${LEN_SRC} thick$`).exec(text);
  if (!m) return null;
  return applySemanticIntent({ intent: 'set-thickness', value: toMeters(m[1]!, m[2]) }, ctx);
};

const matchWidth: Matcher = (text, ctx) => {
  const m =
    new RegExp(`^(?:set|change)(?: the)?${DIM_NOUN} width(?: to)? ${LEN_SRC}$`).exec(text)
    ?? new RegExp(`^make (?:this|the selection) ${LEN_SRC} wide$`).exec(text);
  if (!m) return null;
  return applySemanticIntent({ intent: 'set-width', value: toMeters(m[1]!, m[2]) }, ctx);
};

// §FEAT-CHAT-SYMMETRY — roof pitch, spoken in degrees.
const DEG_SRC = String.raw`(-?\d+(?:[.,]\d+)?)\s*(?:°|deg|degs|degree|degrees)?`;

const matchRoofPitch: Matcher = (text, ctx) => {
  const m = new RegExp(`^(?:set|change|make)(?: the)?(?: roof)? pitch(?: to)? ${DEG_SRC}$`).exec(text);
  if (!m) return null;
  return applySemanticIntent(
    { intent: 'set-roof-pitch', degrees: parseFloat(m[1]!.replace(',', '.')) },
    ctx,
  );
};

const matchRoomNumber: Matcher = (text, ctx) => {
  const m = /^(?:set|change)(?: the)?(?: room)? number(?: to| as)? (.+)$/.exec(text);
  if (!m) return null;
  const num = m[1]!.trim().replace(/^["']|["']$/g, '');
  return applySemanticIntent(
    { intent: 'set-room-number', ...(num.length > 0 ? { number: num } : {}) },
    ctx,
  );
};

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
  return applySemanticIntent({ intent: 'go-to-level', levelQuery: target }, ctx);
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

const matchDuplicateLevel: Matcher = (text, ctx) => {
  const si = parseDuplicateLevelIntent(text);
  return si === null ? null : applySemanticIntent(si, ctx);
};

const matchAddLevel: Matcher = (text, ctx) => {
  const m = new RegExp(`^(?:add|create)(?: a| a new| new)? level(?: (?:at|@) ${LEN_SRC})?$`).exec(text);
  if (!m) return null;
  return applySemanticIntent(
    { intent: 'add-level', ...(m[1] !== undefined ? { elevation: toMeters(m[1], m[2]) } : {}) },
    ctx,
  );
};

const NUM = String.raw`(-?\d+(?:[.,]\d+)?)`;
const PT = String.raw`\(?\s*${NUM}\s*,\s*${NUM}\s*\)?`;

const matchCreateWall: Matcher = (text, ctx) => {
  const withCoords = new RegExp(
    `^(?:create|draw|add)(?: a| a new| new)? wall(?: from)? ${PT}\\s*(?:to|-|->)\\s*${PT}` +
    `(?:,? (?:with )?height(?: of)? ${LEN_SRC})?(?:,? (?:with )?thickness(?: of)? ${LEN_SRC})?$`,
  ).exec(text);
  if (withCoords) {
    const num = (s: string): number => parseFloat(s.replace(',', '.'));
    return applySemanticIntent(
      {
        intent: 'create-wall',
        start: { x: num(withCoords[1]!), z: num(withCoords[2]!) },
        end: { x: num(withCoords[3]!), z: num(withCoords[4]!) },
        ...(withCoords[5] !== undefined ? { height: toMeters(withCoords[5], withCoords[6]) } : {}),
        ...(withCoords[7] !== undefined ? { thickness: toMeters(withCoords[7], withCoords[8]) } : {}),
      },
      ctx,
    );
  }
  if (/^(?:create|draw|add)(?: a| a new| new)? wall(?: here)?$/.test(text)) {
    return applySemanticIntent({ intent: 'create-wall' }, ctx);
  }
  return null;
};

const matchRenameRoom: Matcher = (text, ctx) => {
  const m = /^(?:rename|call)(?: this| the| the selected)? room(?: to| as)? (?:"([^"]+)"|(.+))$/.exec(text);
  if (!m) return null;
  const rawName = (m[1] ?? m[2] ?? '').trim();
  return applySemanticIntent(
    { intent: 'rename-room', ...(rawName.length > 0 ? { name: rawName } : {}) },
    ctx,
  );
};

// §FEAT-CHAT-WALL-TYPE — "make all walls interior partition" and its family.
//
// The scope word is REQUIRED and never inferred: "all/every" ⇒ the whole
// project, "these/selected" ⇒ the selection. There is no third reading in which
// a bare "make walls interior partition" quietly retypes the building.
const WALL_SCOPE_ALL = String.raw`(?:all|every|each)`;
const WALL_SCOPE_SEL = String.raw`(?:these|those|selected|this)`;
const WALL_TYPE_VERB = String.raw`(?:make|change|set|switch|convert|turn|retype|update)`;

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
export function parseWallTypeIntent(text: string): Extract<SemanticIntent, { intent: 'set-wall-type' }> | null {
  const m = WALL_TYPE_RE.exec(text);
  if (!m) return null;
  const scopeWord = m[1]!;
  const typeRef = m[2]!.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ');
  if (typeRef.length === 0) return null;
  // "make all walls 3m tall" is a DIMENSION ask, not a type ask — never claim it.
  if (/\b(?:tall|high|thick|wide|taller|thicker|wider|height|thickness|width|long)\b/.test(typeRef)) return null;
  if (/^\d/.test(typeRef)) return null;
  return {
    intent: 'set-wall-type',
    typeRef,
    scope: new RegExp(`^${WALL_SCOPE_ALL}$`).test(scopeWord) ? 'all' : 'selection',
  };
}

const matchWallType: Matcher = (text, ctx) => {
  const si = parseWallTypeIntent(text);
  return si === null ? null : applySemanticIntent(si, ctx);
};

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

const WALL_COLOR_RE = new RegExp(
  `^${WALL_COLOR_VERB} (?:the )?(${WALL_SCOPE_ALL}|${WALL_SCOPE_SEL})(?: of)?(?: the)? walls?` +
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
export function parseWallColorIntent(text: string): Extract<SemanticIntent, { intent: 'set-wall-color' }> | null {
  const m = WALL_COLOR_RE.exec(text);
  if (!m) return null;
  const verb = m[1]!;
  const scopeWord = m[2]!;
  const levelQuery = m[3]?.trim();
  const roomRef = m[4]?.trim();
  const colorRef = m[5]!.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ');
  if (colorRef.length === 0) return null;
  const colorSpecificVerb = verb === 'paint' || verb.startsWith('colo');
  if (!colorSpecificVerb && resolveColorRef(colorRef) === null) return null;
  // Spatial phrases compose with the ALL scope ("all walls on level 2 / in
  // the kitchen"); combining them with "these/selected" would contradict the
  // live selection and is not claimed.
  const isAll = new RegExp(`^${WALL_SCOPE_ALL}$`).test(scopeWord);
  if (levelQuery !== undefined && levelQuery.length > 0) {
    if (!isAll) return null;
    return { intent: 'set-wall-color', colorRef, scope: { kind: 'level', levelQuery } };
  }
  if (roomRef !== undefined && roomRef.length > 0) {
    if (!isAll) return null;
    return { intent: 'set-wall-color', colorRef, scope: { kind: 'room', roomRef } };
  }
  return { intent: 'set-wall-color', colorRef, scope: isAll ? 'all' : 'selection' };
}

const matchWallColor: Matcher = (text, ctx) => {
  const si = parseWallColorIntent(text);
  return si === null ? null : applySemanticIntent(si, ctx);
};

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
// at; the spatial-scope captures are byte-identical to the colour grammar's.
const WALL_RAKE_SCOPE = String.raw`(?: on (?:the )?(?:levels?|floors?)?\s*([\w .-]+?)| in the ([\w .-]+?))?`;
const WALL_RAKE_ANGLE = String.raw`(?:by|to|at)? ?(-?\d+(?:\.\d+)?) ?(?:°|degrees?|deg)?`;

const WALL_RAKE_ADJ_RE = new RegExp(
  `^(?:make|set) (?:the )?(${WALL_SCOPE_ALL}|${WALL_SCOPE_SEL}) walls?${WALL_RAKE_SCOPE}` +
  ` (?:(?:angled|tilted|leaning|leant|raked|slanted) ${WALL_RAKE_ANGLE}|(vertical|upright|straight))$`,
);
const WALL_RAKE_VERB_RE = new RegExp(
  `^(?:angle|tilt|lean|rake|slant) (?:the )?(${WALL_SCOPE_ALL}|${WALL_SCOPE_SEL}) walls?${WALL_RAKE_SCOPE}` +
  ` ${WALL_RAKE_ANGLE}$`,
);

/**
 * Parse the rake family into the semantic intent — SHARED by the tier-0
 * grammar and the NL classifier, like `parseWallColorIntent`. Returns null
 * when no rake word appears; out-of-range ANGLES still parse (the apply arm
 * owns the range refusal, so "angled by 200" gets a real answer, not a miss).
 */
export function parseWallRakeIntent(text: string): Extract<SemanticIntent, { intent: 'set-wall-rake' }> | null {
  const adj = WALL_RAKE_ADJ_RE.exec(text);
  const verb = adj === null ? WALL_RAKE_VERB_RE.exec(text) : null;
  const m = adj ?? verb;
  if (!m) return null;
  const scopeWord = m[1]!;
  const levelQuery = m[2]?.trim();
  const roomRef = m[3]?.trim();
  const angleDeg = adj !== null && adj[5] !== undefined
    ? 90 // "vertical" / "upright" / "straight"
    : Number.parseFloat(m[4]!);
  if (!Number.isFinite(angleDeg)) return null;
  // Spatial phrases compose with the ALL scope only (same ruling as colour).
  const isAll = new RegExp(`^${WALL_SCOPE_ALL}$`).test(scopeWord);
  if (levelQuery !== undefined && levelQuery.length > 0) {
    if (!isAll) return null;
    return { intent: 'set-wall-rake', angleDeg, scope: { kind: 'level', levelQuery } };
  }
  if (roomRef !== undefined && roomRef.length > 0) {
    if (!isAll) return null;
    return { intent: 'set-wall-rake', angleDeg, scope: { kind: 'room', roomRef } };
  }
  return { intent: 'set-wall-rake', angleDeg, scope: isAll ? 'all' : 'selection' };
}

const matchWallRake: Matcher = (text, ctx) => {
  const si = parseWallRakeIntent(text);
  return si === null ? null : applySemanticIntent(si, ctx);
};

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

const matchRhinoMaterial: Matcher = (text, ctx) => {
  const si = parseRhinoMaterialIntent(text);
  return si === null ? null : applySemanticIntent(si, ctx);
};

const MATCHERS: readonly Matcher[] = [
  matchUndoRedo,
  matchZoom,
  matchDeleteSelected,
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
  matchWallType,
  matchRiserHeight,  // before matchHeight — "riser height" contains "height"
  matchTreadDepth,
  matchRoomHeightOffset, // before matchHeight — "height offset" contains "height"
  matchSillHeight,   // before matchHeight — "sill height" contains "height"
  matchHeight,
  matchThickness,
  matchWidth,
  matchRoofPitch,
  matchRoomNumber,
  matchGoToLevel,
  matchDuplicateLevel,
  matchAddLevel,
  matchCreateWall,
  matchRenameRoom,
];

function runGrammar(text: string, ctx: ResolverContext, tier: 0 | 1): ZeroTokenResolution | null {
  for (const matcher of MATCHERS) {
    const r = matcher(text, ctx);
    if (r !== null) {
      return r.kind === 'refusal' ? r : { ...r, tier };
    }
  }
  return null;
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
export function resolveUtterance(utterance: string, ctx: ResolverContext): ZeroTokenResolution {
  return tracer().startActiveSpan('pryzm.ai.chat.resolve', (span) => {
    try {
      const text = normalize(utterance);
      let result: ZeroTokenResolution;
      if (text.length === 0) {
        result = { kind: 'miss' };
      } else {
        // Tier 0 — exact grammar.
        let r = runGrammar(text, ctx, 0);
        // Tier 1 — synonym + typo normalization, then the same grammar.
        if (r === null) {
          const t1 = tier1Normalize(text);
          if (t1 !== text) r = runGrammar(t1, ctx, 1);
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
