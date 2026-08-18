// @pryzm/ai-host — Local natural-language resolver (ADR-0313 §Natural-language layer).
//
// Sits BETWEEN the tier-0/1 deterministic grammar and the LLM fallback in the
// resolution ladder. Naturally-phrased, command-shaped utterances ("Hey, could
// you make this wall about three meters tall?") are understood LOCALLY — via
// normalization, filler stripping, number-word conversion, synonym mapping,
// bounded typo correction, and rule-scored intent classification — and reduced
// to the structured SemanticIntent IR defined in ZeroTokenResolver.ts.
//
// SEMANTICS ONLY: this layer never builds commands, never dispatches, never
// touches DOM/stores/network. `applySemanticIntent` (ZeroTokenResolver) stays
// the single authority for turning semantics into safe commands / local
// actions / honest refusals — the safety guards cannot diverge between the
// rigid grammar and the natural path.
//
// CONFIDENCE: every interpretation carries a bounded confidence in [0, 1] and
// an evidence list. Thresholds (CONFIDENCE_THRESHOLDS):
//   confidence ≥ resolve (0.75)      → resolve (destructive needs ≥ 0.85)
//   ≥ clarify (0.45), < resolve      → ONE concrete clarifying question
//   < clarify                        → miss → caller falls through to the LLM
// NEVER guess: a recognized intent with a missing amount becomes a
// clarification, not an invented value (§CONTEXT-DATA-HONESTY).
//
// CONVERSATION: a small explicit ConversationContext ({lastIntent,
// lastMeasurement, lastLevelId, lastReferencedElements, pendingIntent}) —
// NOT raw chat history — enables follow-ups ("Actually, make it 3.2m.").
// It can bias INTERPRETATION only; the injected editor state (selection,
// levels) always wins for TARGETING — a remembered element is never used in
// place of the live selection.
//
// P8: the entry point runs inside the existing bounded `pryzm.ai.chat.resolve`
// span with mode/kind/intent/confidence attributes. No raw user text is ever
// recorded on a span.

import { trace, type Tracer } from '@opentelemetry/api';
import { nonImperativeReason } from '../capabilities/CapabilityRefusal.js';
import {
  applySemanticIntent,
  boundedLevenshtein,
  findLevel,
  isProtectedFunctionWord,
  ladderGateReason,
  lengthToMeters,
  parseDuplicateLevelIntent,
  parseAddWallLayerIntent,
  parseGenerateBuildingIntent,
  parseApartmentLayoutIntent,
  parseFinishChainIntent,
  parseRoomFinishIntent,
  parseWindowsParametricIntent,
  parseWallColorIntent,
  parseWallRakeIntent,
  parseWallTypeIntent,
  parseWindowTypeIntent,
  parseDoorTypeIntent,
  type ResolverContext,
  type ResolverLevel,
  type ResolverSelection,
  type SemanticIntent,
  type WallPoint2,
  type ZeroTokenResolution,
} from './ZeroTokenResolver.js';
// §FEAT-BULK-DIMENSIONS (L-949) — the SHARED bulk-dimension parser, so the
// natural and rigid paths cannot understand "make all windows 2 meters height"
// differently (the same discipline as parseWallColorIntent above).
import { parseDimensionScopedIntent } from './DimensionFamilies.js';
// §FEAT-WALL-SIDE-FINISH — the SAME parser tier-0 uses, so the two tiers can
// never disagree about what a finish sentence means (the discipline above).
import { parseWallSideFinishIntent } from './WallSideFinishIntent.js';
import { resolveFinishRef } from './finishRef.js';

// ─── Public types ────────────────────────────────────────────────────────────

/** Small explicit cross-turn state — biases interpretation, never targeting. */
export interface ConversationContext {
  readonly lastIntent?: string;
  readonly lastMeasurement?: number;
  readonly lastLevelId?: string;
  readonly lastReferencedElements?: readonly ResolverSelection[];
  /** Set when the previous reply was a clarifying question awaiting a value. */
  readonly pendingIntent?: string;
  /** §FEAT-CHAT-FOLLOWUP — the SCOPE of the last set-wall-type, so
   *  "change all walls to X" → "actually use Y" retypes the same population.
   *  Biases interpretation only; targeting is re-read from the live editor. */
  readonly lastWallTypeScope?: 'all' | 'selection';
  /**
   * §GEN-OFFER (RAC U5c.3) — a SUGGESTION the assistant made that the user can
   * accept in one reply ("Level 2 duplicated. Re-detect rooms and furnish it?").
   *
   * It is a conversational offer and nothing more: it never mutates on its own,
   * it survives exactly one turn, and accepting it produces the ordinary
   * destructive intent, which still shows its own Confirm card. The alternative
   * — finishing the duplicated level automatically — would be a mutation the
   * user never asked for, on a command whose whole point is that it duplicates
   * and nothing else.
   */
  readonly pendingOffer?: 'finish-chain';
}

export interface NaturalLanguageContext extends ResolverContext {
  readonly conversation?: ConversationContext;
}

export type NaturalLanguageResolution =
  | {
      readonly kind: 'resolved';
      readonly intent: string;
      /** The safe application produced by applySemanticIntent (never a miss). */
      readonly resolution: Exclude<ZeroTokenResolution, { kind: 'miss' }>;
      /**
       * RAC U6 — the IR this layer understood, before it was applied. The plan
       * executor needs the MEANING of a clause (to sequence it), not only the
       * commands one clause produced in isolation; exposing what was already
       * computed is what lets a plan reuse this ladder instead of growing a
       * second one. `applySemanticIntent` remains the only authority that turns
       * it into commands.
       */
      readonly semanticIntent: SemanticIntent;
      readonly confidence: number;
      readonly evidence: readonly string[];
      readonly conversation: ConversationContext;
    }
  | {
      readonly kind: 'clarification';
      readonly intent: string;
      readonly question: string;
      readonly confidence: number;
      readonly evidence: readonly string[];
      readonly conversation: ConversationContext;
    }
  | {
      readonly kind: 'miss';
      readonly confidence: number;
      readonly evidence: readonly string[];
      readonly conversation: ConversationContext;
    };

/** Explicit, bounded thresholds (ADR-0313 §NL confidence). */
export const CONFIDENCE_THRESHOLDS = {
  /** Minimum confidence to resolve a non-destructive intent. */
  resolve: 0.75,
  /** Destructive intents (delete) need more evidence to even REACH the
   *  Confirm/Cancel card — below this they become a clarifying question. */
  resolveDestructive: 0.85,
  /** Below this the utterance is a miss and falls through to the LLM. */
  clarify: 0.45,
} as const;

// ─── Tracing (P8) — same bounded span name as the tier-0/1 resolver ──────────

const TRACER_NAME = '@pryzm/ai-host';
let cachedTracer: Tracer | null = null;
function tracer(): Tracer {
  cachedTracer ??= trace.getTracer(TRACER_NAME, '0.1.0');
  return cachedTracer;
}

// ─── Vocabulary ──────────────────────────────────────────────────────────────

const SMALL_NUMBERS: Readonly<Record<string, number>> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19,
};
const TENS_NUMBERS: Readonly<Record<string, number>> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
};
const ORDINALS: Readonly<Record<string, number>> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7,
  eighth: 8, ninth: 9, tenth: 10,
};

/** Token-level synonym map (applied before AND after typo correction). */
const NL_SYNONYMS: Readonly<Record<string, string>> = {
  // level words
  floor: 'level', floors: 'level', storey: 'level', storeys: 'level',
  story: 'level', stories: 'level',
  // deletion verbs
  remove: 'delete', removes: 'delete', removing: 'delete', erase: 'delete',
  trash: 'delete', discard: 'delete', eliminate: 'delete', del: 'delete',
  deleting: 'delete',
  // change verbs
  modify: 'change', adjust: 'change', alter: 'change', update: 'change',
  changing: 'change', setting: 'set', making: 'make', resize: 'change',
  // navigation verbs
  navigate: 'go', jump: 'go', head: 'go', going: 'go', 'switch': 'go',
  switching: 'go',
  // creation verbs
  creating: 'create', adding: 'add', drawing: 'draw', building: 'build',
  renaming: 'rename',
  // selection words
  selection: 'selected', chosen: 'selected', highlighted: 'selected',
  picked: 'selected',
};

/** Typo-correction target set: everything the classifiers key on. */
const NL_VOCAB: readonly string[] = [
  'delete', 'remove', 'erase', 'selected', 'selection', 'this', 'that',
  'these', 'those', 'wall', 'walls', 'door', 'doors', 'window', 'windows',
  'room', 'rooms', 'slab', 'slabs', 'roof', 'stair', 'stairs', 'column',
  'columns', 'level', 'levels', 'floor', 'floors', 'storey', 'height',
  'width', 'thickness', 'sill', 'create', 'draw', 'build', 'add', 'make',
  'set', 'change', 'increase', 'raise', 'decrease', 'reduce', 'lower',
  'rename', 'call', 'go', 'tall', 'taller', 'high', 'higher', 'short',
  'shorter', 'thick', 'thicker', 'thin', 'thinner', 'wide', 'wider',
  'narrow', 'narrower', 'pitch', 'degree', 'degrees', 'number', 'ceiling',
  'riser', 'tread', 'depth', 'offset',
  'undo', 'redo', 'zoom', 'fit', 'frame', 'meter',
  'meters', 'metre', 'metres', 'millimeter', 'millimeters', 'millimetre',
  'millimetres', 'centimeter', 'centimeters', 'centimetre', 'centimetres',
  'upstairs', 'downstairs', 'ground', 'everything', 'ordinal', 'element',
  'elements',
];

const NL_ELEMENT_NOUNS: ReadonlySet<string> = new Set([
  'wall', 'walls', 'door', 'doors', 'window', 'windows', 'room', 'rooms',
  'slab', 'slabs', 'roof', 'roofs', 'stair', 'stairs', 'column', 'columns',
  'beam', 'beams', 'ceiling', 'ceilings',
  'element', 'elements', 'item', 'items', 'object', 'objects',
]);

const SELECTION_REF_WORDS: ReadonlySet<string> = new Set([
  'this', 'that', 'it', 'these', 'those', 'selected', 'my', 'mine', 'current',
]);

const SET_VERBS: ReadonlySet<string> = new Set([
  'set', 'make', 'change', 'increase', 'raise', 'decrease', 'reduce',
  'lower', 'extend', 'shrink', 'bump',
]);

type SetIntentName = 'set-height' | 'set-thickness' | 'set-width' | 'set-sill-height';

const SET_INTENTS: ReadonlySet<string> = new Set([
  'set-height', 'set-thickness', 'set-width', 'set-sill-height',
] satisfies SetIntentName[]);

function isSetIntent(x: string): x is SetIntentName {
  return SET_INTENTS.has(x);
}

/** §GEN-OFFER (RAC U5c.3) — one-reply acceptance of an open offer. Checked
 *  against `plain` (filler-stripped), so "yes please" and "ok, go ahead" land. */
const AFFIRMATIVE_RE =
  /^(?:yes|yep|yeah|yup|sure|ok|okay|go ahead|do it|do that|please do|go for it|sounds good|lets do (?:it|that)|absolutely|definitely)\b/;

const INTERROGATIVES: ReadonlySet<string> = new Set([
  'what', 'whats', 'how', 'why', 'where', 'which', 'who', 'whose', 'when',
  'is', 'are', 'was', 'were', 'does', 'did', 'tell', 'explain', 'describe',
  'list', 'count',
]);

// ─── Normalization ───────────────────────────────────────────────────────────

const CONTRACTIONS: readonly (readonly [RegExp, string])[] = [
  [/\bi've\b/g, 'i have'],
  [/\bi'd\b/g, 'i would'],
  [/\bi'm\b/g, 'i am'],
  [/\byou've\b/g, 'you have'],
  [/\bit's\b/g, 'it is'],
  [/\bthat's\b/g, 'that is'],
  [/\blet's\b/g, 'lets'],
  [/\bdon't\b/g, 'do not'],
  [/\bcan't\b/g, 'can not'],
  [/\bwon't\b/g, 'will not'],
];

const LEADING_FILLER: readonly RegExp[] = [
  /^(?:please|pls|plz|hey|hi|hello|ok|okay|so|well|now|kindly|thanks|thank you|actually|instead|wait|just|maybe|perhaps|also|then|next|and|um|umm|uh)\s+/,
  /^(?:can|could|would|will) (?:you|we)(?: please| kindly| just| maybe)?\s+/,
  /^(?:would|do) you mind\s+/,
  /^(?:i would (?:like|love|prefer)(?: you)?(?: to)?|i want(?: you)?(?: to)?|i need(?: you)?(?: to)?|i wish to|is it possible to|it would be (?:great|nice) if you(?: could)?|lets|do me a favou?r and|go ahead and|be so kind and)\s+/,
  /^(?:you (?:should|could|can))\s+/,
];

const TRAILING_FILLER =
  /\s+(?:please|pls|thanks|thank you|for me|for us|if you can|if possible|now|too|as well|ok|okay)$/;

/** Multi-word phrase canonicalization (order matters). */
const PHRASE_MAP: readonly (readonly [RegExp, string])[] = [
  [/\bget rid of\b/g, 'delete'],
  [/\bthrow away\b/g, 'delete'],
  [/\btake away\b/g, 'delete'],
  [/\btake (?:me|us) (?:back )?to\b/g, 'go to'],
  [/\bbring (?:me|us) to\b/g, 'go to'],
  [/\bmove (?:me|us) to\b/g, 'go to'],
  [/\bgo (?:back|up|down) to\b/g, 'go to'],
  [/\bgo back(?:wards)?\b/g, 'undo'],
  [/\btake (?:that|it) back\b/g, 'undo'],
  [/\breverse (?:that|it|this)\b/g, 'undo'],
  [/\brevert(?: that| it| this)?\b/g, 'undo'],
  [/\bdo (?:that|it) again\b/g, 'redo'],
];

interface Normalized {
  readonly text: string;
  /**
   * Filler-stripped and phrase-canonicalized, but BEFORE token synonym mapping
   * and typo correction. Free-text values live here intact.
   *
   * A wall type name is user data, not vocabulary: "Interior – Partition 100mm"
   * survives here, whereas `text` has already run every token through the
   * synonym table and a Levenshtein corrector aimed at the intent vocabulary,
   * which is free to rewrite an unfamiliar product name into something that
   * scores close. Parsing catalogue references off `text` would corrupt exactly
   * the values the user has to type most precisely.
   */
  readonly plain: string;
  readonly tokens: readonly string[];
  readonly evidence: string[];
  readonly typoCount: number;
  /**
   * §FIX-CHAT-REPORT-PASTEBACK — token indices the Levenshtein corrector
   * REWROTE. The founder's report line reached add-level because "built" was
   * corrected into the creation verb "build": typo correction may repair a
   * word the user meant, but it must never MANUFACTURE the imperative that
   * authorises a mutation. Grammars that key on a verb consult this set.
   */
  readonly corrected: ReadonlySet<number>;
  /** "actually / instead / no wait" — the user is revising the last ask. */
  readonly revision: boolean;
}

function convertNumberWords(tokens: readonly string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i]!;
    let value: number | null = null;
    let next = i + 1;
    if (t in TENS_NUMBERS) {
      value = TENS_NUMBERS[t]!;
      const u = tokens[next];
      if (u !== undefined && u in SMALL_NUMBERS && SMALL_NUMBERS[u]! < 10) {
        value += SMALL_NUMBERS[u]!;
        next += 1;
      }
    } else if (t in SMALL_NUMBERS) {
      value = SMALL_NUMBERS[t]!;
    }
    if (value !== null) {
      const scale = tokens[next];
      if (scale === 'hundred') { value *= 100; next += 1; }
      else if (scale === 'thousand') { value *= 1000; next += 1; }
      out.push(String(value));
      i = next;
      continue;
    }
    out.push(t);
    i += 1;
  }
  // Merge passes: "3 point 5" → "3.5"; "3 and a half" → "3.5"; "half a" → "0.5".
  const merged: string[] = [];
  for (let j = 0; j < out.length; j++) {
    const a = out[j]!;
    if (/^\d+$/.test(a) && out[j + 1] === 'point' && /^\d+$/.test(out[j + 2] ?? '')) {
      merged.push(`${a}.${out[j + 2]!}`);
      j += 2;
      continue;
    }
    if (/^\d+(?:\.\d+)?$/.test(a) && out[j + 1] === 'and' && out[j + 2] === 'a' && out[j + 3] === 'half') {
      merged.push(String(parseFloat(a) + 0.5));
      j += 3;
      continue;
    }
    if (a === 'half' && out[j + 1] === 'a') {
      merged.push('0.5');
      j += 1;
      continue;
    }
    merged.push(a);
  }
  return merged;
}

function typoCorrect(tok: string): string | null {
  if (tok.length < 4 || /[\d(),.]/.test(tok)) return null;
  // §FIX-CHAT-STOPWORD-CORRECTION (founder P0) — a correctly spelled English
  // function word is never a misspelled domain term. "with" → "width" put the
  // set-width grammar on a sentence with no width in it. ONE shared list with
  // the tier-1 corrector.
  if (isProtectedFunctionWord(tok)) return null;
  const budget = tok.length > 5 ? 2 : 1;
  let best: string | null = null;
  let bestD = budget + 1;
  for (const v of NL_VOCAB) {
    const d = boundedLevenshtein(tok, v, budget);
    if (d < bestD) { bestD = d; best = v; }
  }
  return bestD <= budget && bestD > 0 && best !== null ? best : null;
}

function normalizeNatural(raw: string): Normalized {
  const evidence: string[] = [];
  let text = raw
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[!?]/g, ' ')
    .replace(/\.(?!\d)/g, ' ')
    .replace(/,(?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [re, sub] of CONTRACTIONS) text = text.replace(re, sub);
  const revision = /^(?:actually|instead|no wait|wait|on second thought)\b/.test(text);
  if (revision) evidence.push('revision-marker');
  // Leading + trailing politeness/filler.
  let changed = true;
  while (changed) {
    changed = false;
    for (const re of LEADING_FILLER) {
      if (re.test(text)) {
        text = text.replace(re, '').trim();
        changed = true;
        if (!evidence.includes('filler-stripped')) evidence.push('filler-stripped');
      }
    }
    if (TRAILING_FILLER.test(text)) {
      text = text.replace(TRAILING_FILLER, '').trim();
      changed = true;
      if (!evidence.includes('filler-stripped')) evidence.push('filler-stripped');
    }
  }
  // Phrase canonicalization.
  for (const [re, sub] of PHRASE_MAP) {
    if (re.test(text)) {
      re.lastIndex = 0;
      text = text.replace(re, sub);
      evidence.push(`phrase:${sub}`);
    }
    re.lastIndex = 0;
  }
  const plain = text;
  // Tokens → number words → synonyms → typo correction → synonyms again.
  let typoCount = 0;
  const corrected = new Set<number>();
  const tokens = convertNumberWords(text.split(' ').filter((t) => t.length > 0)).map((tok, i) => {
    const syn = NL_SYNONYMS[tok];
    if (syn !== undefined) return syn;
    if (NL_VOCAB.includes(tok) || NL_ELEMENT_NOUNS.has(tok) || SELECTION_REF_WORDS.has(tok) || tok in ORDINALS) return tok;
    const fixed = typoCorrect(tok);
    if (fixed !== null) {
      typoCount += 1;
      corrected.add(i);
      return NL_SYNONYMS[fixed] ?? fixed;
    }
    return tok;
  });
  if (typoCount > 0) evidence.push(`typo-corrected:${typoCount}`);
  return { text: tokens.join(' '), plain, tokens, evidence, typoCount, revision, corrected };
}

// ─── Entity extraction ───────────────────────────────────────────────────────

type Dimension = 'height' | 'thickness' | 'width' | 'sill';

interface Entities {
  /** Absolute measurements in meters (level numbers / counts / coords excluded). */
  readonly measurements: readonly number[];
  /** A measurement was introduced with "by" — a relative delta, not absolute. */
  readonly relativeBy: boolean;
  readonly dimension: Dimension | null;
  /** Comparative form ("taller", "thicker") — a relative ask. */
  readonly relativeDim: boolean;
  readonly elementNoun: string | null; // singular
  readonly selectionRef: boolean;
  readonly levelQuery: string | null;
  readonly levelMentioned: boolean;
  readonly upDown: 'up' | 'down' | null;
  readonly coords: { readonly start: WallPoint2; readonly end: WallPoint2 } | null;
  /** "30 degrees" / "30°" — an angle, for set-roof-pitch. */
  readonly angleDeg: number | null;
  /**
   * §FIX-CHAT-COMPOUND-DIMENSIONS — explicit value↔dimension BINDINGS
   * ("2 meters height, 2 meters width and 0.1 meters sill height"). When two
   * or more distinct dimensions are bound, the utterance is a compound ask and
   * `measurements[0]` (first-number-wins) would silently mis-assign — the
   * founder's window got its SILL set to 2 m by that rule.
   */
  readonly bindings: readonly { readonly dim: Dimension; readonly value: number }[];
  readonly hasDeleteVerb: boolean;
  readonly hasNavVerb: boolean;
  readonly hasSetVerb: boolean;
  readonly determinerNew: boolean; // "a/another/new <element>" → creation, not mutation
}

const MEASURE_RE =
  /(-?\d+(?:\.\d+)?)\s*(millimet(?:er|re)s?|centimet(?:er|re)s?|met(?:er|re)s?|mm|cm|m)?(?![\w.])/g;

const COORDS_RE =
  /\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?\s*(?:to|->|-)\s*\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?/;

const HEIGHT_WORDS: ReadonlySet<string> = new Set(['height', 'heights', 'tall', 'high']);
const HEIGHT_REL: ReadonlySet<string> = new Set(['taller', 'higher', 'shorter', 'lower']);
const THICK_WORDS: ReadonlySet<string> = new Set(['thickness', 'thick']);
const THICK_REL: ReadonlySet<string> = new Set(['thicker', 'thinner']);
const WIDTH_WORDS: ReadonlySet<string> = new Set(['width', 'wide']);
const WIDTH_REL: ReadonlySet<string> = new Set(['wider', 'narrower']);

function findGroundLevel(levels: readonly ResolverLevel[]): ResolverLevel | undefined {
  return (
    levels.find((l) => l.name.toLowerCase().includes('ground')) ??
    levels.find((l) => l.elevation === 0) ??
    [...levels].sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0))[0]
  );
}

function extractEntities(n: Normalized, ctx: NaturalLanguageContext): Entities {
  const { text, tokens } = n;

  // Coordinates (create-wall) — excluded from measurement scanning.
  const coordMatch = COORDS_RE.exec(text);
  const coordSpan: readonly [number, number] | null =
    coordMatch !== null ? [coordMatch.index, coordMatch.index + coordMatch[0]!.length] : null;
  const coords =
    coordMatch !== null
      ? {
          start: { x: parseFloat(coordMatch[1]!), z: parseFloat(coordMatch[2]!) },
          end: { x: parseFloat(coordMatch[3]!), z: parseFloat(coordMatch[4]!) },
        }
      : null;

  // Level reference.
  let levelQuery: string | null = null;
  let upDown: 'up' | 'down' | null = null;
  const levelMentioned = tokens.includes('level') || tokens.includes('levels');
  const li = tokens.findIndex((t) => t === 'level' || t === 'levels');
  if (li >= 0) {
    const before = li > 0 ? tokens[li - 1]! : '';
    const after = tokens[li + 1];
    const ordBefore = ORDINALS[before] ?? (/^(\d+)(?:st|nd|rd|th)$/.exec(before)?.[1] ?? null);
    if (after !== undefined && /^\d+$/.test(after)) {
      levelQuery = after;
    } else if (ordBefore !== null) {
      levelQuery = String(ordBefore);
    } else if (before === 'ground' || after === 'ground') {
      const ground = findGroundLevel(ctx.levels);
      levelQuery = ground !== undefined ? ground.name : 'ground';
    } else if (after !== undefined && !NL_VOCAB.includes(after) && !SELECTION_REF_WORDS.has(after)) {
      // "go to level roof" — pass the name through for an honest lookup/refusal.
      const joined2 = tokens[li + 2] !== undefined ? `${after} ${tokens[li + 2]!}` : undefined;
      if (joined2 !== undefined && findLevel(joined2, ctx.levels) !== undefined) levelQuery = joined2;
      else levelQuery = after;
    }
  }
  if (tokens.includes('upstairs')) upDown = 'up';
  else if (tokens.includes('downstairs')) upDown = 'down';
  if (levelQuery === null && upDown !== null) {
    const sorted = [...ctx.levels].sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0));
    const idx = sorted.findIndex((l) => l.id === ctx.activeLevelId);
    if (idx >= 0) {
      const target = sorted[idx + (upDown === 'up' ? 1 : -1)];
      if (target !== undefined) levelQuery = target.name;
    }
  }

  // Measurements (meters; ADR bare-number rule via lengthToMeters).
  const measurements: number[] = [];
  let relativeBy = false;
  MEASURE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MEASURE_RE.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0]!.length;
    if (coordSpan !== null && start >= coordSpan[0] && end <= coordSpan[1]) continue;
    const beforeText = text.slice(0, start);
    const prevWord = /([a-z]+)\s*$/.exec(beforeText)?.[1] ?? '';
    if (prevWord === 'level' || prevWord === 'levels') continue;
    const hasUnit = m[2] !== undefined && m[2] !== '';
    if (!hasUnit) {
      const nextWord = /^\s*([a-z]+)/.exec(text.slice(end))?.[1] ?? '';
      if (NL_ELEMENT_NOUNS.has(nextWord)) continue; // a COUNT ("the 3 doors"), not a length
      if (levelQuery !== null && m[1] === levelQuery) continue;
    }
    if (prevWord === 'by') relativeBy = true;
    measurements.push(lengthToMeters(m[1]!, m[2]));
  }

  // Dimension words.
  let dimension: Dimension | null = null;
  let relativeDim = false;
  if (tokens.includes('sill')) dimension = 'sill';
  else if (tokens.some((t) => THICK_WORDS.has(t))) dimension = 'thickness';
  else if (tokens.some((t) => THICK_REL.has(t))) { dimension = 'thickness'; relativeDim = true; }
  else if (tokens.some((t) => WIDTH_WORDS.has(t))) dimension = 'width';
  else if (tokens.some((t) => WIDTH_REL.has(t))) { dimension = 'width'; relativeDim = true; }
  else if (tokens.some((t) => HEIGHT_WORDS.has(t))) dimension = 'height';
  else if (tokens.some((t) => HEIGHT_REL.has(t))) { dimension = 'height'; relativeDim = true; }

  // §FIX-CHAT-COMPOUND-DIMENSIONS — value↔dimension bindings, both orders:
  // "2 meters height" / "2m tall" AND "height 2m" / "sill height of 0.1m".
  const DIM_WORD = String.raw`(sill height|sill|height|tall|high|width|wide|thickness|thick)`;
  const UNIT = String.raw`(millimet(?:er|re)s?|centimet(?:er|re)s?|met(?:er|re)s?|mm|cm|m)?`;
  const toDim = (w: string): Dimension =>
    w.startsWith('sill') ? 'sill'
    : w === 'width' || w === 'wide' ? 'width'
    : w === 'thickness' || w === 'thick' ? 'thickness'
    : 'height';
  const bindings: { dim: Dimension; value: number }[] = [];
  const bound = new Set<Dimension>();
  const addBinding = (dimWord: string, num: string, unit: string | undefined): void => {
    const dim = toDim(dimWord);
    if (bound.has(dim)) return;
    bound.add(dim);
    bindings.push({ dim, value: lengthToMeters(num, unit) });
  };
  const VALUE_THEN_DIM = new RegExp(String.raw`(-?\d+(?:\.\d+)?)\s*${UNIT}\s+(?:in\s+|of\s+)?${DIM_WORD}\b`, 'g');
  const DIM_THEN_VALUE = new RegExp(String.raw`\b${DIM_WORD}\s*(?:of|to|at|=|:)?\s*(-?\d+(?:\.\d+)?)\s*${UNIT}(?![\w.])`, 'g');
  for (const m2 of text.matchAll(VALUE_THEN_DIM)) addBinding(m2[3]!, m2[1]!, m2[2]);
  for (const m2 of text.matchAll(DIM_THEN_VALUE)) addBinding(m2[1]!, m2[2]!, m2[3]);

  // Angle ("30 degrees", "30°") — for roof pitch.
  const angleMatch = /(-?\d+(?:\.\d+)?)\s*(?:°|degrees?|degs?)(?![a-z])/.exec(text);
  const angleDeg = angleMatch !== null ? parseFloat(angleMatch[1]!) : null;

  // Element noun / selection reference / verbs.
  const nounTok = tokens.find((t) => NL_ELEMENT_NOUNS.has(t)) ?? null;
  const elementNoun = nounTok !== null ? (nounTok.endsWith('s') ? nounTok.slice(0, -1) : nounTok) : null;
  const selectionRef =
    tokens.some((t) => SELECTION_REF_WORDS.has(t)) ||
    / i (?:have )?(?:selected|chosen|picked)/.test(` ${text}`);
  const nounIdx = nounTok !== null ? tokens.indexOf(nounTok) : -1;
  const determinerNew =
    nounIdx > 0 &&
    (['a', 'another', 'new'].includes(tokens[nounIdx - 1]!) ||
      (nounIdx > 1 && tokens[nounIdx - 2] === 'a' && tokens[nounIdx - 1] === 'new'));

  return {
    measurements,
    relativeBy,
    dimension,
    relativeDim,
    elementNoun,
    selectionRef,
    levelQuery,
    levelMentioned,
    upDown,
    coords,
    angleDeg,
    bindings,
    hasDeleteVerb: tokens.includes('delete'),
    hasNavVerb: tokens.includes('go') || tokens.includes('open'),
    hasSetVerb: tokens.some((t) => SET_VERBS.has(t)),
    determinerNew,
  };
}

// ─── Intent classification ───────────────────────────────────────────────────

interface Candidate {
  readonly intent: string;
  readonly confidence: number;
  readonly evidence: readonly string[];
  readonly si?: SemanticIntent;
  readonly question?: string;
}

const DIMENSION_INTENT: Readonly<Record<Dimension, SetIntentName>> = {
  height: 'set-height',
  thickness: 'set-thickness',
  width: 'set-width',
  sill: 'set-sill-height',
};

const CLARIFY_QUESTIONS: Readonly<Record<string, string>> = {
  'set-height': 'What height should I set it to? For example "3m" or "2700mm".',
  'set-thickness': 'How thick should it be? For example "200mm" or "0.2m".',
  'set-width': 'What width should I set? For example "900mm".',
  'set-sill-height': 'What sill height should I set? For example "1m".',
  'set-roof-pitch': 'What pitch should I set? For example "30 degrees".',
  'set-room-number': 'What room number should I set? For example "101".',
};

const DIMENSION_LABEL: Readonly<Record<string, string>> = {
  'set-height': 'height',
  'set-thickness': 'thickness',
  'set-width': 'width',
  'set-sill-height': 'sill height',
};

function classify(
  n: Normalized,
  e: Entities,
  ctx: NaturalLanguageContext,
): Candidate | null {
  const { tokens } = n;
  const conversation = ctx.conversation ?? {};
  const candidates: Candidate[] = [];
  const push = (c: Candidate): void => { candidates.push(c); };
  const short = tokens.length <= 3;

  // §GEN-OFFER (RAC U5c.3) — accepting the post-duplicate offer. A bare "yes"
  // is meaningless on its own and stays a miss; it becomes an intent ONLY
  // while an offer is open, and the intent it becomes is destructive, so the
  // Confirm card still stands between the word and the model.
  if (conversation.pendingOffer === 'finish-chain' && AFFIRMATIVE_RE.test(n.plain)) {
    push({
      intent: 'finish-apartment-chain',
      confidence: 0.95,
      evidence: ['offer:accepted'],
      si: { intent: 'finish-apartment-chain', withLayout: false, scope: 'active-level' },
    });
  }

  // undo / redo — natural variants already canonicalized by the phrase map.
  if (tokens.includes('undo')) {
    push({ intent: 'undo', confidence: short ? 0.95 : 0.85, evidence: ['verb:undo'], si: { intent: 'undo' } });
  } else if (tokens.includes('redo')) {
    push({ intent: 'redo', confidence: short ? 0.95 : 0.85, evidence: ['verb:redo'], si: { intent: 'redo' } });
  }

  // zoom / frame.
  if (tokens.includes('zoom') || tokens.includes('frame') || tokens.includes('fit')) {
    if (tokens.some((t) => t === 'selected' || t === 'this' || t === 'that' || t === 'it')) {
      push({ intent: 'zoom-selected', confidence: 0.9, evidence: ['verb:zoom', 'target:selection'], si: { intent: 'zoom-selected' } });
    } else if (tokens.some((t) => ['fit', 'all', 'everything', 'extents', 'model', 'view'].includes(t))) {
      push({ intent: 'zoom-fit', confidence: 0.9, evidence: ['verb:zoom', 'target:everything'], si: { intent: 'zoom-fit' } });
    }
  }

  // delete-selected (destructive — the strictest threshold applies later).
  if (e.hasDeleteVerb && !tokens.includes('level')) {
    const ev = ['verb:delete'];
    if (e.elementNoun !== null) ev.push(`noun:${e.elementNoun}`);
    if (e.selectionRef) ev.push('target:selection');
    if (e.elementNoun !== null && e.selectionRef) {
      push({ intent: 'delete-selected', confidence: 0.95, evidence: ev, si: { intent: 'delete-selected', noun: e.elementNoun } });
    } else if (e.elementNoun !== null) {
      push({ intent: 'delete-selected', confidence: 0.88, evidence: ev, si: { intent: 'delete-selected', noun: e.elementNoun } });
    } else if (e.selectionRef) {
      push({ intent: 'delete-selected', confidence: 0.88, evidence: ev, si: { intent: 'delete-selected' } });
    } else {
      push({
        intent: 'delete-selected', confidence: 0.5, evidence: ev,
        question: 'What should I delete? For example: "delete the selected wall".',
      });
    }
  }

  // §FEAT-BULK-DIMENSIONS (L-949) — THE ESCAPE HATCH the all-scope guard below
  // spent its whole life pointing at and never had (L-942). "make all windows 2
  // meters height" / "make all doors 2m wide by 1m high with 0.1 sill" / "set
  // all walls 3m high" are SCOPED asks, not selection asks, and they resolve
  // through the SHARED parser the tier-0 grammar uses — one reading of the
  // sentence, two entry points.
  //
  // Rank 0.96 is deliberate and load-bearing: it must outrank the compound
  // branch's 0.95, because a compound sentence carrying an ALL-SCOPE word
  // matches both shapes and only THIS one can honour the scope. Below that
  // rank the compound branch would win and the sentence would be answered by
  // resizing the selection — the exact §FIX-CHAT-DIMENSION-ALL-SCOPE defect.
  const bulkDims = parseDimensionScopedIntent(n.plain, ctx, lengthToMeters);
  if (bulkDims !== null) {
    push({
      intent: bulkDims.intent,
      confidence: 0.96,
      evidence: ['verb:resize', 'bulk-dimensions', `scope:${scopeTag((bulkDims as { scope?: unknown }).scope)}`],
      si: bulkDims,
    });
  }

  // §FIX-CHAT-COMPOUND-DIMENSIONS — "2 meters height, 2 meters width and 0.1
  // meters sill height" is ONE compound ask, resolved to ONE dispatch. It must
  // outrank (and suppress) the single-dimension branch, whose first-number-wins
  // rule mis-assigned the founder's 2 m to the sill.
  const creationShape =
    e.determinerNew && (tokens.includes('create') || tokens.includes('draw') || tokens.includes('build') || tokens.includes('add') || tokens.includes('make'));
  const compound = e.bindings.length >= 2 && !creationShape && e.coords === null;
  if (compound) {
    const si: SemanticIntent = { intent: 'set-dimensions' };
    const fields: Record<string, number> = {};
    for (const b of e.bindings) {
      const key = b.dim === 'sill' ? 'sillHeight' : b.dim;
      fields[key] = b.value;
    }
    push({
      intent: 'set-dimensions',
      confidence: 0.95,
      evidence: ['compound', ...e.bindings.map((b) => `bind:${b.dim}`)],
      si: { ...si, ...fields } as SemanticIntent,
    });
  }

  // Dimension setting (set-height / set-thickness / set-width / set-sill-height).
  //
  // §FIX-CHAT-DIMENSION-ALL-SCOPE (RAC U9, U10 drain). A sentence carrying an
  // explicit all-scope word is asking for something this SELECTION-scoped
  // branch cannot do. It used to claim anyway and quietly act on the SELECTION:
  // "set all slabs thickness to 0.2m" resized the one selected wall. Answering
  // a project-wide ask by mutating one element the user did not name is the
  // worst available outcome, so the branch declines.
  //
  // §FEAT-BULK-DIMENSIONS (L-949) — THE GUARD IS NOT DELETED AND MUST NOT BE.
  // What changed is that its decline is no longer the end of the road: the
  // families that DO have a project-wide route (wall / window / door) are
  // claimed above at 0.96, so this branch declining is now the correct handoff
  // rather than a dead end. A family with no bulk route (slab, roof, ceiling,
  // stair) still lands here and still declines — which is right, because
  // resizing the selection would still be the wrong answer to "all slabs".
  const allScopeWord = tokens.some((t) => t === 'all' || t === 'every' || t === 'each');
  if (e.dimension !== null && !creationShape && !compound && !allScopeWord) {
    const intent = DIMENSION_INTENT[e.dimension];
    const value = e.measurements[0];
    const ev = [`dimension:${e.dimension}`];
    if (e.selectionRef) ev.push('target:selection');
    if (e.elementNoun !== null) ev.push(`noun:${e.elementNoun}`);
    if (value !== undefined && !e.relativeBy) {
      ev.push('value:absolute');
      const conf = 0.9 + (e.selectionRef || e.elementNoun !== null ? 0.05 : 0);
      const si: SemanticIntent = intent === 'set-height'
        ? { intent, value }
        : intent === 'set-thickness'
          ? { intent, value }
          : intent === 'set-width'
            ? { intent, value }
            : { intent, value };
      push({ intent, confidence: conf, evidence: ev, si });
    } else if (value !== undefined && e.relativeBy) {
      ev.push('value:relative-delta');
      push({
        intent, confidence: 0.6, evidence: ev,
        question: `I can set an absolute ${DIMENSION_LABEL[intent]!}, but I don't know the current one from here — what should the new ${DIMENSION_LABEL[intent]!} be?`,
      });
    } else if (e.hasSetVerb || e.relativeDim) {
      ev.push('value:missing');
      push({ intent, confidence: 0.62, evidence: ev, question: CLARIFY_QUESTIONS[intent]! });
    }
  }

  // ADR-0315 P1 — stair riser height / tread depth and room height offset.
  // Each contains "height"/"offset" wording, so its candidate must OUTRANK the
  // generic dimension branch (which would read "riser height" as set-height):
  // 0.96 beats that branch's 0.95 ceiling.
  if (tokens.includes('riser') && !creationShape) {
    const value = e.measurements[0];
    if (value !== undefined && !e.relativeBy) {
      push({
        intent: 'set-riser-height', confidence: 0.96,
        evidence: ['dimension:riser-height', 'value:absolute'],
        si: { intent: 'set-riser-height', value },
      });
    } else if (e.hasSetVerb) {
      push({
        intent: 'set-riser-height', confidence: 0.62,
        evidence: ['dimension:riser-height', 'value:missing'],
        question: 'What riser height should I set? For example "180mm".',
      });
    }
  }
  if (tokens.includes('tread') && !creationShape) {
    const value = e.measurements[0];
    if (value !== undefined && !e.relativeBy) {
      push({
        intent: 'set-tread-depth', confidence: 0.96,
        evidence: ['dimension:tread-depth', 'value:absolute'],
        si: { intent: 'set-tread-depth', value },
      });
    } else if (e.hasSetVerb) {
      push({
        intent: 'set-tread-depth', confidence: 0.62,
        evidence: ['dimension:tread-depth', 'value:missing'],
        question: 'What tread depth should I set? For example "250mm".',
      });
    }
  }
  if (tokens.includes('offset') && tokens.includes('height') && !tokens.includes('base') && !creationShape) {
    const value = e.measurements[0];
    if (value !== undefined && !e.relativeBy) {
      push({
        intent: 'set-room-height-offset', confidence: 0.96,
        evidence: ['dimension:height-offset', 'value:absolute'],
        si: { intent: 'set-room-height-offset', value },
      });
    } else if (e.hasSetVerb) {
      push({
        intent: 'set-room-height-offset', confidence: 0.62,
        evidence: ['dimension:height-offset', 'value:missing'],
        question: 'What height offset should I set? For example "0.5m" or "-0.2m".',
      });
    }
  }

  // set-roof-pitch (§FEAT-CHAT-SYMMETRY). Degrees, never the length rule — a
  // bare "30" after the word "pitch" is 30°, not 30 mm.
  if (tokens.includes('pitch') && !creationShape) {
    const numTok = tokens.find((t) => /^-?\d+(?:\.\d+)?$/.test(t));
    const deg = e.angleDeg ?? (numTok !== undefined ? parseFloat(numTok) : null);
    const ev = ['dimension:pitch'];
    if (e.elementNoun !== null) ev.push(`noun:${e.elementNoun}`);
    if (deg !== null) {
      push({
        intent: 'set-roof-pitch',
        confidence: 0.9 + (e.selectionRef || e.elementNoun === 'roof' ? 0.05 : 0),
        evidence: [...ev, 'value:absolute'],
        si: { intent: 'set-roof-pitch', degrees: deg },
      });
    } else if (e.hasSetVerb) {
      push({ intent: 'set-roof-pitch', confidence: 0.62, evidence: [...ev, 'value:missing'], question: CLARIFY_QUESTIONS['set-roof-pitch']! });
    }
  }

  // set-room-number (§FEAT-CHAT-SYMMETRY). The value is user text off `plain`
  // (a room number like "2.04" must not be read as a measurement).
  if (tokens.includes('number') && (tokens.includes('room') || e.selectionRef)) {
    const m = /\bnumber\b(?:\s+(?:to|as))?\s+["']?([\w.-]+)["']?\s*$/.exec(n.plain);
    const num = m?.[1];
    if (num !== undefined && num.length > 0) {
      push({
        intent: 'set-room-number', confidence: 0.9,
        evidence: ['noun:room-number', 'value:present'],
        si: { intent: 'set-room-number', number: num },
      });
    } else if (e.hasSetVerb) {
      push({ intent: 'set-room-number', confidence: 0.6, evidence: ['noun:room-number', 'value:missing'], question: CLARIFY_QUESTIONS['set-room-number']! });
    }
  }

  // Follow-up: a value with NO dimension word — reuse the pending/last set-intent.
  if (e.dimension === null && e.measurements.length > 0 && e.coords === null
      && !tokens.includes('pitch') && !tokens.includes('number')) {
    const prior = conversation.pendingIntent ?? conversation.lastIntent;
    const value = e.measurements[0]!;
    if (prior !== undefined && isSetIntent(prior)) {
      const conf = Math.min(0.9, 0.85 + (n.revision ? 0.05 : 0));
      const si: SemanticIntent = prior === 'set-height'
        ? { intent: prior, value }
        : prior === 'set-thickness'
          ? { intent: prior, value }
          : prior === 'set-width'
            ? { intent: prior, value }
            : { intent: prior, value };
      push({
        intent: prior, confidence: conf,
        evidence: [`follow-up:${prior}`, 'value:absolute'],
        si,
      });
    } else if (e.hasSetVerb && e.selectionRef) {
      push({
        intent: 'set-height', confidence: 0.5,
        evidence: ['value:absolute', 'dimension:unknown'],
        question: `Should I set the height, the thickness, or the width to ${value} m? Tell me which.`,
      });
    }
  }

  // Follow-up: "go to level 2" → "actually level 3" / "actually 3".
  // A bare number re-targets the LAST level switch; a pending set-intent
  // clarification wins by confidence (its follow-up pushes higher above).
  if (
    conversation.lastIntent === 'go-to-level' &&
    e.dimension === null && e.coords === null && tokens.length <= 3 &&
    (conversation.pendingIntent === undefined || !isSetIntent(conversation.pendingIntent))
  ) {
    const numTok = tokens.find((t) => /^\d+$/.test(t));
    if (numTok !== undefined) {
      push({
        intent: 'go-to-level',
        confidence: n.revision ? 0.85 : 0.78,
        evidence: ['follow-up:go-to-level'],
        si: { intent: 'go-to-level', levelQuery: numTok },
      });
    }
  }

  // Follow-up: "change all walls to X" → "actually use Y" / "try Y" — reuse the
  // last wall-type SCOPE, resolve the new reference through the same injected
  // catalogue lookup (an unknown Y refuses by listing the real types).
  if (conversation.lastIntent === 'set-wall-type') {
    const m = /^(?:use|try|go with|make (?:it|them)|change (?:it|them) to|switch (?:it|them) to)\s+(.+)$/.exec(n.plain);
    const typeRef = m?.[1]?.trim().replace(/^["']|["']$/g, '');
    if (typeRef !== undefined && typeRef.length > 0) {
      push({
        intent: 'set-wall-type',
        confidence: n.revision ? 0.9 : 0.8,
        evidence: ['follow-up:set-wall-type', `scope:${conversation.lastWallTypeScope ?? 'all'}`],
        si: { intent: 'set-wall-type', typeRef, scope: conversation.lastWallTypeScope ?? 'all' },
      });
    }
  }

  // duplicate-level (ADR-0315 U5a) — parsed off `n.plain` by the SAME function
  // the tier-0 grammar uses; a level name is user data.
  const dupLevel = parseDuplicateLevelIntent(n.plain);
  if (dupLevel !== null) {
    push({
      intent: 'duplicate-level',
      confidence: 0.9,
      evidence: ['verb:duplicate', `targets:${dupLevel.targetQueries.length}`],
      si: dupLevel,
    });
  }

  // go-to-level.
  if (e.levelQuery !== null && (e.hasNavVerb || short)) {
    const ev = [`level:${e.upDown ?? 'explicit'}`];
    push({
      intent: 'go-to-level', confidence: e.hasNavVerb ? 0.9 : 0.8, evidence: ev,
      si: { intent: 'go-to-level', levelQuery: e.levelQuery },
    });
  } else if (e.levelQuery === null && (e.levelMentioned || e.upDown !== null) && e.hasNavVerb && !tokens.includes('add') && !tokens.includes('create')) {
    const names = ctx.levels.map((l) => l.name).join(', ');
    push({
      intent: 'go-to-level', confidence: 0.55, evidence: ['level:unresolved'],
      question: ctx.levels.length === 0
        ? 'No levels exist in this project yet — say "add a level" first.'
        : `Which level should I switch to? The levels here are: ${names}.`,
    });
  }

  // add-level.
  //
  // §FIX-CHAT-REPORT-PASTEBACK — the creation verb must be a REAL imperative:
  // an uncorrected token in opener position (index 0 or 1 after filler
  // stripping, which is where an instruction's verb lives). "Built 6 floors —
  // 18 apartments…" reached this branch because the corrector turned "built"
  // into "build" and the synonym table turned "floors" into "level"; a bare
  // "build" is no longer a trigger on its own for the same reason.
  const imperativeVerbAt = (words: readonly string[]): boolean =>
    tokens.some((t, i) => i <= 1 && words.includes(t) && !n.corrected.has(i));

  // §FIX-CHAT-ADDLEVEL-OVERCLAIM (RAC U9, found by the U10 drain). The token
  // "level"/"levels" ANYWHERE in the sentence was enough, so three ordinary
  // asks became "Add Level 2 at elevation 6 m":
  //
  //   "create floor plan view"        — "floor" is a level SYNONYM
  //   "create stairs between levels"  — the levels are the CONTEXT, not the object
  //   "create slabs in all levels"    — same, one noun further out
  //
  // In each, the thing being created is named and it is not a level. So the
  // object noun now has to BE the level: no other element noun may appear, and
  // the level word may not sit behind a preposition that makes it the setting
  // ("between levels", "in all levels", "on every floor") rather than the
  // object.
  const levelIsTheObject = ((): boolean => {
    // The object noun must BE the level. "floor" is the level's own synonym, so
    // it counts; "stairs" and "slabs" do not — those sentences create something
    // else and merely MENTION levels.
    const noun = e.elementNoun ?? null;
    if (noun !== null && noun !== 'level' && noun !== 'floor') return false;
    // A DOCUMENT noun means the ask is about a drawing, not the model:
    // "create floor plan view" is a view, and "floor" is doing adjective duty.
    if (tokens.some((t) => ['view', 'views', 'sheet', 'sheets', 'plan', 'plans',
      'schedule', 'schedules', 'drawing', 'drawings', 'elevation', 'section'].includes(t))) {
      return false;
    }
    const li = tokens.findIndex((t) => t === 'level' || t === 'levels');
    if (li <= 0) return li === 0;
    const before = tokens[li - 1]!;
    return !['between', 'in', 'on', 'across', 'all', 'every', 'each', 'both'].includes(before);
  })();

  // §FIX-CHAT-ADDLEVEL-COUNT — "create 10 levels at 3m" created ONE level at
  // elevation 10: the COUNT was read as the elevation, because the branch
  // simply took the first measurement it saw. Silently reinterpreting a count
  // as an elevation is the worst of the three options (the other two being
  // "make 10 levels" and "say you can't"). Until add-level takes a count, the
  // plural WITH a count is not claimed — the ask falls through and is answered
  // honestly instead of answered wrongly.
  const LEVEL_NOUNS = ['level', 'levels', 'floor', 'floors', 'storey', 'storeys', 'story', 'stories'];
  const countedPlural = tokens.some(
    (t, i) => /^\d+$/.test(t) && i + 1 < tokens.length && LEVEL_NOUNS.includes(tokens[i + 1]!),
  );

  if (
    (tokens.includes('level') || tokens.includes('levels')) &&
    levelIsTheObject &&
    !countedPlural &&
    (imperativeVerbAt(['add', 'create']) ||
      ((tokens.includes('new') || tokens.includes('another')) &&
        e.hasSetVerb &&
        imperativeVerbAt(['make', 'set', 'change', 'build', 'add', 'create']))) &&
    !e.hasNavVerb
  ) {
    const elevation = e.measurements[0];
    push({
      intent: 'add-level', confidence: 0.9, evidence: ['verb:add', 'noun:level'],
      si: { intent: 'add-level', ...(elevation !== undefined && !e.relativeBy ? { elevation } : {}) },
    });
  }

  // create-wall.
  if (
    e.elementNoun === 'wall' &&
    (tokens.includes('create') || tokens.includes('draw') || tokens.includes('build') ||
      ((tokens.includes('add') || tokens.includes('make')) && e.determinerNew))
  ) {
    const heightVal = e.dimension === 'height' ? e.measurements[0] : undefined;
    push({
      intent: 'create-wall',
      confidence: e.coords !== null ? 0.92 : 0.82,
      evidence: ['verb:create', 'noun:wall', e.coords !== null ? 'coords:present' : 'coords:missing'],
      si: {
        intent: 'create-wall',
        ...(e.coords !== null ? { start: e.coords.start, end: e.coords.end } : {}),
        ...(heightVal !== undefined ? { height: heightVal } : {}),
      },
    });
  }

  // set-wall-color (§FEAT-WALL-COLOR-BATCH, ADR-0314). Parsed off `n.plain`
  // for the same reason as wall types — a colour name is user data — and by
  // the SAME function the tier-0 grammar uses. It outranks the wall-type
  // candidate below (0.95 > 0.92): "make all walls white" matches both parsers'
  // shapes, and the colour reading is the resolvable one.
  // §FEAT-WALL-SIDE-FINISH — the founder's per-side finish ask. Pushed ABOVE
  // wall colour at 0.96 deliberately: "change all walls in the kitchen finish
  // plaster" also matches the COLOUR shape (with "plaster" read as a colour
  // name), and the finish reading is the one the user actually asked for.
  const wallSideFinish = parseWallSideFinishIntent(
    n.plain,
    (r) => resolveFinishRef(r) !== null,
    ctx.resolveWallSystemType,
  );
  if (wallSideFinish !== null) {
    push({
      intent: 'set-wall-side-finish',
      confidence: 0.96,
      evidence: ['verb:finish', 'noun:wall', `side:${wallSideFinish.side}`, `scope:${scopeTag(wallSideFinish.scope)}`],
      si: wallSideFinish,
    });
  }

  const wallColor = parseWallColorIntent(n.plain, ctx);
  if (wallColor !== null) {
    push({
      intent: 'set-wall-color',
      confidence: 0.95,
      evidence: ['verb:paint', 'noun:wall', `scope:${scopeTag(wallColor.scope)}`],
      si: wallColor,
    });
  }

  // set-wall-rake (§FEAT-WALL-RAKE-BATCH, ADR-0315) — same SHARED-parser
  // discipline and the same 0.95 rank as colour: "make all walls angled by 70
  // degrees" also matches the wall-type shape ("angled by 70 degrees" would be
  // read as a type name and refused with the catalogue), and the rake reading
  // is the resolvable one.
  const wallRake = parseWallRakeIntent(n.plain, ctx);
  if (wallRake !== null) {
    push({
      intent: 'set-wall-rake',
      confidence: 0.95,
      evidence: ['verb:rake', 'noun:wall', `scope:${scopeTag(wallRake.scope)}`],
      si: wallRake,
    });
  }

  // set-window-type (§FEAT-WINDOW-TYPE-BATCH) — shared parser, same rank.
  const windowType = parseWindowTypeIntent(n.plain, ctx);
  if (windowType !== null) {
    push({
      intent: 'set-window-type',
      confidence: 0.95,
      evidence: ['verb:change', 'noun:window', `scope:${scopeTag(windowType.scope)}`],
      si: windowType,
    });
  }

  // set-door-type (§FEAT-DOOR-TYPE-BATCH, RAC U4.3) — shared parser, same rank.
  const doorType = parseDoorTypeIntent(n.plain, ctx);
  if (doorType !== null) {
    push({
      intent: 'set-door-type',
      confidence: 0.95,
      evidence: ['verb:change', 'noun:door', `scope:${scopeTag(doorType.scope)}`],
      si: doorType,
    });
  }

  // add-wall-layer (§FEAT-WALL-LAYER-ADD-BATCH) — shared token-based parser,
  // same rank; claims even when underspecified so the honest ask wins.
  const wallLayer = parseAddWallLayerIntent(n.plain);
  if (wallLayer !== null) {
    push({
      intent: 'add-wall-layer',
      confidence: 0.95,
      evidence: ['verb:add', 'noun:layer', `scope:${scopeTag(wallLayer.scope)}`],
      si: wallLayer,
    });
  }

  // generate-building (§GEN-CHAT, RAC U5b.2) — shared parser off `n.plain`
  // (typology/mix words are user data), same 0.95 rank as the other shared
  // parsers; destructive resolution needs ≥0.85, which this clears — the
  // Confirm card is the safety net, not a lowered confidence.
  const genBuilding = parseGenerateBuildingIntent(n.plain);
  if (genBuilding !== null) {
    push({
      intent: 'generate-building',
      confidence: 0.95,
      evidence: ['verb:generate', `typology:${genBuilding.typology}`, `floors:${genBuilding.floors ?? 'default'}`],
      si: genBuilding,
    });
  }

  // generate-apartment-layout (§GEN-CHAT-APARTMENT, RAC U5b.2 founder P0) —
  // "create a 3 bedroom apparment". The tier-1 normalizer has already lowered
  // and de-punctuated the text; the noun matcher carries the spelling
  // tolerance, so a typo reaches the capability instead of the "I'm not sure
  // how to help with that yet" dead end the founder hit.
  const aptLayout = parseApartmentLayoutIntent(n.plain);
  if (aptLayout !== null) {
    push({
      intent: 'generate-apartment-layout',
      confidence: 0.95,
      evidence: ['verb:generate', 'noun:apartment', `bedrooms:${aptLayout.bedrooms ?? 'default'}`],
      si: aptLayout,
    });
  }

  // create-windows-parametric (§FEAT-WINDOW-PARAMETRIC-CREATE) — shared parser.
  // §GEN-CHAIN (RAC U5c.2) — the whole finishing flow. Ranked ABOVE the
  // room-scale parser (0.96 > 0.95) for the same reason the tier-0 matcher
  // runs first: "finish this apartment and light it" names a stage too, but
  // the user asked for the flow.
  const finishChain = parseFinishChainIntent(n.plain);
  if (finishChain !== null) {
    push({
      intent: 'finish-apartment-chain',
      confidence: 0.96,
      evidence: ['verb:finish', `layout:${finishChain.withLayout}`],
      si: finishChain,
    });
  }

  // §GEN-ROOMS (RAC U5c.1) — the four room-scale engines, shared parser.
  const roomFinish = parseRoomFinishIntent(n.plain);
  if (roomFinish !== null) {
    push({
      intent: 'generate-room-finishes',
      confidence: 0.95,
      evidence: [
        `steps:${roomFinish.steps.join('+')}`,
        `scope:${scopeTag(roomFinish.scope)}`,
      ],
      si: roomFinish,
    });
  }

  const winParam = parseWindowsParametricIntent(n.plain);
  if (winParam !== null) {
    push({
      intent: 'create-windows-parametric',
      confidence: 0.95,
      evidence: ['verb:create', 'noun:window', `scope:${scopeTag(winParam.scope)}`],
      si: winParam,
    });
  }

  // set-wall-type (§FEAT-CHAT-WALL-TYPE). Parsed off `n.plain` — the type name
  // is user data and must not pass through the typo corrector — and by the SAME
  // function the tier-0 grammar uses, so the two paths cannot read the sentence
  // differently. Confidence is high because the shape is unambiguous: a scope
  // word, "walls", and a catalogue reference.
  const wallType = parseWallTypeIntent(n.plain, ctx);
  if (wallType !== null && wallColor === null) {
    push({
      intent: 'set-wall-type',
      confidence: 0.92,
      evidence: ['verb:retype', 'noun:wall', `scope:${scopeTag(wallType.scope)}`],
      si: wallType,
    });
  }

  // rename-room.
  if (tokens.includes('rename') || (tokens.includes('call') && tokens.includes('room'))) {
    const nameMatch =
      /(?:\bto\b|\bas\b)\s+(.+)$/.exec(n.text) ??
      /\broom\b\s+(?:the\s+)?(.+)$/.exec(n.text); // "call this room the master bedroom"
    const name = nameMatch?.[1]?.trim();
    push({
      intent: 'rename-room',
      confidence: name !== undefined && name.length > 0 ? 0.9 : 0.8,
      evidence: ['verb:rename'],
      si: { intent: 'rename-room', ...(name !== undefined && name.length > 0 ? { name } : {}) },
    });
  }

  if (candidates.length === 0) return null;
  let best = candidates[0]!;
  for (const c of candidates) if (c.confidence > best.confidence) best = c;
  return best;
}

// ─── Conversation bookkeeping ────────────────────────────────────────────────

const PAYLOAD_MEASUREMENT_KEYS = ['height', 'thickness', 'width', 'sillHeight'] as const;

/**
 * Fold ANY successful zero-token resolution (tier 0/1 OR NL) into the
 * conversation context — the editor bridge calls this after the tier-0/1
 * path too, so "set height to 3m" followed by "actually, make it 3.2m"
 * works regardless of which tier understood the first message.
 */
export function noteResolution(
  prev: ConversationContext,
  resolution: ZeroTokenResolution,
): ConversationContext {
  switch (resolution.kind) {
    case 'commands': {
      let measurement: number | undefined;
      const payload = resolution.commands[0]?.payload;
      if (payload !== undefined) {
        for (const key of PAYLOAD_MEASUREMENT_KEYS) {
          const v = payload[key];
          if (typeof v === 'number') { measurement = v; break; }
        }
        const params = payload['parameters'];
        if (measurement === undefined && typeof params === 'object' && params !== null) {
          const h = (params as Record<string, unknown>)['height'];
          if (typeof h === 'number') measurement = h;
        }
      }
      // §FEAT-CHAT-FOLLOWUP — remember the wall-type scope so "actually use Y"
      // retypes the same population the user last named.
      let wallTypeScope: 'all' | 'selection' | undefined;
      if (resolution.intent === 'set-wall-type' && payload !== undefined) {
        wallTypeScope = payload['wallIds'] === 'all' ? 'all' : 'selection';
      }
      return {
        lastIntent: resolution.intent,
        ...(measurement !== undefined ? { lastMeasurement: measurement } : {}),
        ...(wallTypeScope !== undefined ? { lastWallTypeScope: wallTypeScope } : {}),
        ...(prev.lastLevelId !== undefined ? { lastLevelId: prev.lastLevelId } : {}),
      };
    }
    case 'local':
      return {
        lastIntent: resolution.intent,
        ...(resolution.action === 'setActiveLevel' && resolution.levelId !== undefined
          ? { lastLevelId: resolution.levelId }
          : prev.lastLevelId !== undefined ? { lastLevelId: prev.lastLevelId } : {}),
        ...(prev.lastMeasurement !== undefined ? { lastMeasurement: prev.lastMeasurement } : {}),
      };
    case 'refusal':
      return { ...prev, lastIntent: resolution.intent };
    case 'miss':
      return prev;
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Understand a naturally-phrased utterance LOCALLY (zero tokens) and reduce it
 * to a SemanticIntent, then let `applySemanticIntent` (the single authority)
 * turn it into a safe application. Returns:
 *  - `resolved`      — commands / local action / honest refusal + confidence
 *  - `clarification` — ONE concrete question (recognized but underspecified)
 *  - `miss`          — not confidently command-shaped → caller goes to the LLM
 *
 * Pure: no DOM, no stores, no network, no timers. Conversation context biases
 * interpretation only — the live editor state always wins for targeting.
 */
/** RAC U8.1 — ONE evidence tag for every scope form. The union widened from
 *  two string literals to spatial and FILTER descriptors, and a template
 *  literal over an object prints "[object Object]" — an evidence line that
 *  says nothing is worse than no line at all. */
function scopeTag(scope: unknown): string {
  if (typeof scope === 'string') return scope;
  if (typeof scope === 'object' && scope !== null && 'kind' in scope) {
    return String((scope as { kind: unknown }).kind);
  }
  return 'unknown';
}

export function resolveNaturalLanguage(
  utterance: string,
  ctx: NaturalLanguageContext,
): NaturalLanguageResolution {
  return tracer().startActiveSpan('pryzm.ai.chat.resolve', (span) => {
    try {
      span.setAttribute('pryzm.ai.chat.mode', 'local-natural-language');
      const conversation = ctx.conversation ?? {};
      const n = normalizeNatural(utterance);

      const miss = (extraEvidence: readonly string[], confidence = 0): NaturalLanguageResolution => ({
        kind: 'miss',
        confidence,
        evidence: [...n.evidence, ...extraEvidence],
        conversation,
      });

      let result: NaturalLanguageResolution;
      const first = n.tokens[0];
      // §FIX-CHAT-NON-IMPERATIVE (2026-08-10). Checked on the RAW utterance,
      // before filler stripping, because the stripper deliberately removes
      // "I would like to" — and once it is gone, "I was thinking about changing
      // the height" is indistinguishable from "change the height". Negations
      // and hypotheticals are command-SHAPED and must never mutate:
      //   "don't change the wall height"
      //   "I was thinking about changing the height"
      //   "what would happen if I made this taller?"
      // all previously reached the set-height branch. They are misses now — the
      // LLM can discuss them; the deterministic layer must not act on them.
      const nonImperative = nonImperativeReason(utterance);
      if (n.text.length === 0) {
        result = miss(['empty']);
      } else if (nonImperative !== null) {
        result = miss([nonImperative]);
      } else if (first !== undefined && INTERROGATIVES.has(first)) {
        // Questions are for the LLM — never misread "how high is this wall?"
        // as a command to change it.
        result = miss(['interrogative']);
      } else {
        const entities = extractEntities(n, ctx);
        const best = classify(n, entities, ctx);
        if (best === null) {
          result = miss(['no-intent-evidence']);
        } else {
          const confidence = Math.max(0, Math.min(1, best.confidence - n.typoCount * 0.04));
          const evidence = [...n.evidence, ...best.evidence];
          const resolveFloor =
            best.si?.intent === 'delete-selected'
              ? CONFIDENCE_THRESHOLDS.resolveDestructive
              : CONFIDENCE_THRESHOLDS.resolve;
          // §FIX-CHAT-VISIBILITY-MISREAD — the NL layer is where the founder's
          // "highlight walls taller than 3m" actually landed, so the ladder
          // gate has to hold here too, on the RAW utterance.
          // §FIX-CHAT-HIDE-IS-NOT-NAVIGATE / §FIX-CHAT-PROPERTY-REMOVAL-IS-NOT-
          // DELETE — the NL layer is where BOTH measured misreads actually
          // landed ("hide level 2" → go-to-level at 0.8; "remove the material
          // from this wall" → delete-selected at 0.95), so the shared ladder
          // gate has to hold here too, on the RAW utterance.
          const gate = best.si !== undefined ? ladderGateReason(utterance, best.si.intent) : null;
          if (gate !== null) {
            result = miss([gate === 'visibility' ? 'visibility-query' : 'property-not-element']);
          } else if (best.si !== undefined && confidence >= resolveFloor) {
            const applied = applySemanticIntent(best.si, ctx);
            const resolution: Exclude<ZeroTokenResolution, { kind: 'miss' }> =
              applied.kind === 'refusal' ? applied : { ...applied, tier: 'nl' as const };
            const si = best.si;
            const nextConversation: ConversationContext = {
              lastIntent: si.intent,
              ...(ctx.selection.length > 0 ? { lastReferencedElements: [...ctx.selection] } : {}),
              // RAC U8.1 — the scope union widened to IntentScope, but this
              // memory exists for the bare follow-up ("and the ones on level
              // 2?" is a NEW scope, not a remembered one). Only the two
              // scope-WORD forms are carried forward; a spatial or filtered
              // scope is deliberately not re-applied to the next sentence,
              // which would silently widen or narrow what the user asked.
              ...(si.intent === 'set-wall-type' && typeof si.scope === 'string'
                ? { lastWallTypeScope: si.scope }
                : {}),
              ...('value' in si ? { lastMeasurement: si.value } : conversation.lastMeasurement !== undefined ? { lastMeasurement: conversation.lastMeasurement } : {}),
              ...(applied.kind === 'local' && applied.action === 'setActiveLevel' && applied.levelId !== undefined
                ? { lastLevelId: applied.levelId }
                : conversation.lastLevelId !== undefined ? { lastLevelId: conversation.lastLevelId } : {}),
            };
            result = {
              kind: 'resolved',
              intent: si.intent,
              resolution,
              semanticIntent: si,
              confidence,
              evidence,
              conversation: nextConversation,
            };
          } else if (confidence >= CONFIDENCE_THRESHOLDS.clarify) {
            // Recognized but underspecified (or a destructive ask without
            // enough evidence) → ask, never guess.
            const question =
              best.question ??
              (best.si?.intent === 'delete-selected'
                ? 'Do you want me to delete the current selection? Say "delete selected" to confirm.'
                : CLARIFY_QUESTIONS[best.intent] ?? 'Can you give me a bit more detail?');
            result = {
              kind: 'clarification',
              intent: best.intent,
              question,
              confidence,
              evidence: [...evidence, 'clarify'],
              conversation: { ...conversation, lastIntent: best.intent, pendingIntent: best.intent },
            };
          } else {
            result = miss(['low-confidence', ...best.evidence], confidence);
          }
        }
      }

      span.setAttribute('pryzm.ai.chat.kind', result.kind);
      span.setAttribute('pryzm.ai.chat.confidence', result.confidence);
      if (result.kind !== 'miss') span.setAttribute('pryzm.ai.chat.intent', result.intent);
      span.end();
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.end();
      throw err;
    }
  });
}
