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
  lengthToMeters,
  parseWallTypeIntent,
  type ResolverContext,
  type ResolverLevel,
  type ResolverSelection,
  type SemanticIntent,
  type WallPoint2,
  type ZeroTokenResolution,
} from './ZeroTokenResolver.js';

// ─── Public types ────────────────────────────────────────────────────────────

/** Small explicit cross-turn state — biases interpretation, never targeting. */
export interface ConversationContext {
  readonly lastIntent?: string;
  readonly lastMeasurement?: number;
  readonly lastLevelId?: string;
  readonly lastReferencedElements?: readonly ResolverSelection[];
  /** Set when the previous reply was a clarifying question awaiting a value. */
  readonly pendingIntent?: string;
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
  'narrow', 'narrower', 'undo', 'redo', 'zoom', 'fit', 'frame', 'meter',
  'meters', 'metre', 'metres', 'millimeter', 'millimeters', 'millimetre',
  'millimetres', 'centimeter', 'centimeters', 'centimetre', 'centimetres',
  'upstairs', 'downstairs', 'ground', 'everything', 'ordinal', 'element',
  'elements',
];

const NL_ELEMENT_NOUNS: ReadonlySet<string> = new Set([
  'wall', 'walls', 'door', 'doors', 'window', 'windows', 'room', 'rooms',
  'slab', 'slabs', 'roof', 'roofs', 'stair', 'stairs', 'column', 'columns',
  'beam', 'beams', 'element', 'elements', 'item', 'items', 'object', 'objects',
]);

const SELECTION_REF_WORDS: ReadonlySet<string> = new Set([
  'this', 'that', 'it', 'these', 'those', 'selected', 'my', 'mine', 'current',
]);

const SET_VERBS: ReadonlySet<string> = new Set([
  'set', 'make', 'change', 'increase', 'raise', 'decrease', 'reduce',
  'lower', 'extend', 'shrink', 'bump',
]);

type SetIntentName = 'set-height' | 'set-thickness' | 'set-door-width' | 'set-sill-height';

const SET_INTENTS: ReadonlySet<string> = new Set([
  'set-height', 'set-thickness', 'set-door-width', 'set-sill-height',
] satisfies SetIntentName[]);

function isSetIntent(x: string): x is SetIntentName {
  return SET_INTENTS.has(x);
}

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
  const tokens = convertNumberWords(text.split(' ').filter((t) => t.length > 0)).map((tok) => {
    const syn = NL_SYNONYMS[tok];
    if (syn !== undefined) return syn;
    if (NL_VOCAB.includes(tok) || NL_ELEMENT_NOUNS.has(tok) || SELECTION_REF_WORDS.has(tok) || tok in ORDINALS) return tok;
    const fixed = typoCorrect(tok);
    if (fixed !== null) {
      typoCount += 1;
      return NL_SYNONYMS[fixed] ?? fixed;
    }
    return tok;
  });
  if (typoCount > 0) evidence.push(`typo-corrected:${typoCount}`);
  return { text: tokens.join(' '), plain, tokens, evidence, typoCount, revision };
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
  width: 'set-door-width',
  sill: 'set-sill-height',
};

const CLARIFY_QUESTIONS: Readonly<Record<string, string>> = {
  'set-height': 'What height should I set it to? For example "3m" or "2700mm".',
  'set-thickness': 'How thick should it be? For example "200mm" or "0.2m".',
  'set-door-width': 'What width should I set? For example "900mm".',
  'set-sill-height': 'What sill height should I set? For example "1m".',
};

const DIMENSION_LABEL: Readonly<Record<string, string>> = {
  'set-height': 'height',
  'set-thickness': 'thickness',
  'set-door-width': 'width',
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

  // Dimension setting (set-height / set-thickness / set-door-width / set-sill-height).
  const creationShape =
    e.determinerNew && (tokens.includes('create') || tokens.includes('draw') || tokens.includes('build') || tokens.includes('add') || tokens.includes('make'));
  if (e.dimension !== null && !creationShape) {
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
          : intent === 'set-door-width'
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

  // Follow-up: a value with NO dimension word — reuse the pending/last set-intent.
  if (e.dimension === null && e.measurements.length > 0 && e.coords === null) {
    const prior = conversation.pendingIntent ?? conversation.lastIntent;
    const value = e.measurements[0]!;
    if (prior !== undefined && isSetIntent(prior)) {
      const conf = Math.min(0.9, 0.85 + (n.revision ? 0.05 : 0));
      const si: SemanticIntent = prior === 'set-height'
        ? { intent: prior, value }
        : prior === 'set-thickness'
          ? { intent: prior, value }
          : prior === 'set-door-width'
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
  if (
    (tokens.includes('level') || tokens.includes('levels')) &&
    (tokens.includes('add') || tokens.includes('create') || tokens.includes('build') ||
      ((tokens.includes('new') || tokens.includes('another')) && e.hasSetVerb)) &&
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

  // set-wall-type (§FEAT-CHAT-WALL-TYPE). Parsed off `n.plain` — the type name
  // is user data and must not pass through the typo corrector — and by the SAME
  // function the tier-0 grammar uses, so the two paths cannot read the sentence
  // differently. Confidence is high because the shape is unambiguous: a scope
  // word, "walls", and a catalogue reference.
  const wallType = parseWallTypeIntent(n.plain);
  if (wallType !== null) {
    push({
      intent: 'set-wall-type',
      confidence: 0.92,
      evidence: ['verb:retype', 'noun:wall', `scope:${wallType.scope}`],
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
      return {
        lastIntent: resolution.intent,
        ...(measurement !== undefined ? { lastMeasurement: measurement } : {}),
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
          if (best.si !== undefined && confidence >= resolveFloor) {
            const applied = applySemanticIntent(best.si, ctx);
            const resolution: Exclude<ZeroTokenResolution, { kind: 'miss' }> =
              applied.kind === 'refusal' ? applied : { ...applied, tier: 'nl' as const };
            const si = best.si;
            const nextConversation: ConversationContext = {
              lastIntent: si.intent,
              ...(ctx.selection.length > 0 ? { lastReferencedElements: [...ctx.selection] } : {}),
              ...('value' in si ? { lastMeasurement: si.value } : conversation.lastMeasurement !== undefined ? { lastMeasurement: conversation.lastMeasurement } : {}),
              ...(applied.kind === 'local' && applied.action === 'setActiveLevel' && applied.levelId !== undefined
                ? { lastLevelId: applied.levelId }
                : conversation.lastLevelId !== undefined ? { lastLevelId: conversation.lastLevelId } : {}),
            };
            result = {
              kind: 'resolved',
              intent: si.intent,
              resolution,
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
