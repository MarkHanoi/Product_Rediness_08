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
  'sill', 'create', 'draw', 'add', 'make', 'set', 'change', 'rename', 'go',
  'to', 'from', 'tall', 'thick', 'undo', 'redo', 'zoom', 'fit', 'frame',
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
  | { readonly intent: 'set-door-width'; readonly value: number }
  | { readonly intent: 'set-sill-height'; readonly value: number }
  | { readonly intent: 'go-to-level'; readonly levelQuery: string }
  | { readonly intent: 'add-level'; readonly elevation?: number }
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
        if (!['element', 'item', 'object'].includes(wanted) && wanted !== sel.elementType) {
          return {
            kind: 'refusal', intent: 'delete-selected',
            reason: `You asked to delete a ${wanted}, but the selected element is a ${sel.elementType}. Nothing was deleted.`,
            suggestions: [`delete selected ${sel.elementType}`],
          };
        }
      }
      return {
        kind: 'commands', intent: 'delete-selected',
        summary: `Delete the selected ${sel.elementType}`,
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
      const sel = guard.sel;
      if (sel.elementType !== 'window') {
        return {
          kind: 'refusal', intent: 'set-sill-height',
          reason: `Sill height applies to windows, but the selected element is a ${sel.elementType}.`,
          suggestions: [],
        };
      }
      const sill = round3(si.value);
      return {
        kind: 'commands', intent: 'set-sill-height',
        summary: `Set the selected window's sill height to ${fmt(sill)}`,
        commands: [{ type: 'window.setSillHeight', payload: { windowId: sel.elementId, sillHeight: sill } }],
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
      const kindGuard = capabilityTargetRefusal('set-height', sel.elementType, 'height');
      if (kindGuard !== null) return kindGuard;
      const cmd: BusCommandRef =
        sel.elementType === 'wall'
          ? { type: 'wall.updateDimensions', payload: { wallId: sel.elementId, height } }
          : {
              type: 'element.updateParameters',
              payload: { elementId: sel.elementId, elementType: sel.elementType, parameters: { height } },
            };
      return {
        kind: 'commands', intent: 'set-height',
        summary: `Set the selected ${sel.elementType}'s height to ${fmt(height)}`,
        commands: [cmd], destructive: false,
      };
    }

    case 'set-thickness': {
      const guard = needSelection('set-thickness', ctx, 'set its thickness');
      if ('refusal' in guard) return guard.refusal;
      const sel = guard.sel;
      if (sel.elementType !== 'wall') {
        return {
          kind: 'refusal', intent: 'set-thickness',
          reason: `Thickness via chat currently supports walls; the selected element is a ${sel.elementType}.`,
          suggestions: [],
        };
      }
      const thickness = round3(si.value);
      return {
        kind: 'commands', intent: 'set-thickness',
        summary: `Set the selected wall's thickness to ${fmt(thickness)}`,
        commands: [{ type: 'wall.updateDimensions', payload: { wallId: sel.elementId, thickness } }],
        destructive: false,
      };
    }

    case 'set-door-width': {
      const guard = needSelection('set-door-width', ctx, 'set its width');
      if ('refusal' in guard) return guard.refusal;
      const sel = guard.sel;
      if (sel.elementType !== 'door') {
        return {
          kind: 'refusal', intent: 'set-door-width',
          reason: `Width via chat currently supports a selected door; the selected element is a ${sel.elementType}.`,
          suggestions: [],
        };
      }
      const width = round3(si.value);
      return {
        kind: 'commands', intent: 'set-door-width',
        summary: `Set the selected door's width to ${fmt(width)}`,
        commands: [{ type: 'door.setWidth', payload: { doorId: sel.elementId, width } }],
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

// NOTE: sill-height must run BEFORE plain height ("sill height" contains "height").
const matchSillHeight: Matcher = (text, ctx) => {
  const m = new RegExp(`^(?:set|change|make)(?: the)?(?: window)? sill height(?: to)? ${LEN_SRC}$`).exec(text);
  if (!m) return null;
  return applySemanticIntent({ intent: 'set-sill-height', value: toMeters(m[1]!, m[2]) }, ctx);
};

const matchHeight: Matcher = (text, ctx) => {
  const m =
    new RegExp(`^(?:set|change)(?: the)?(?: wall| selected)? height(?: of (?:this|the selection))?(?: to)? ${LEN_SRC}$`).exec(text)
    ?? new RegExp(`^make (?:this|the selection) ${LEN_SRC} (?:tall|high)$`).exec(text);
  if (!m) return null;
  return applySemanticIntent({ intent: 'set-height', value: toMeters(m[1]!, m[2]) }, ctx);
};

const matchThickness: Matcher = (text, ctx) => {
  const m =
    new RegExp(`^(?:set|change)(?: the)?(?: wall)? thickness(?: to)? ${LEN_SRC}$`).exec(text)
    ?? new RegExp(`^make (?:this|the selection) ${LEN_SRC} thick$`).exec(text);
  if (!m) return null;
  return applySemanticIntent({ intent: 'set-thickness', value: toMeters(m[1]!, m[2]) }, ctx);
};

const matchDoorWidth: Matcher = (text, ctx) => {
  const m = new RegExp(`^(?:set|change)(?: the)?(?: door)? width(?: to)? ${LEN_SRC}$`).exec(text);
  if (!m) return null;
  return applySemanticIntent({ intent: 'set-door-width', value: toMeters(m[1]!, m[2]) }, ctx);
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

const MATCHERS: readonly Matcher[] = [
  matchUndoRedo,
  matchZoom,
  matchDeleteSelected,
  // BEFORE the dimension matchers: "make all walls interior partition" must not
  // be nibbled at by "make this … " shapes.
  matchWallType,
  matchSillHeight,   // before matchHeight — "sill height" contains "height"
  matchHeight,
  matchThickness,
  matchDoorWidth,
  matchGoToLevel,
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
