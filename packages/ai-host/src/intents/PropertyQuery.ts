// @pryzm/ai-host — PropertyQuery (§FEAT-RAC-PROPERTY-QUERY, L-2210)
// =============================================================================
//
// THE FOUNDER'S ASK, verbatim (2026-08-21): *"All dims and properties of all
// elements should be **queryable** and executable by RAC."*
//
// EXECUTABLE was largely built. QUERYABLE was **not built at all**, and this
// module is the missing half.
//
// ── THE MEASUREMENT THAT PRODUCED THIS FILE ─────────────────────────────────
//
// Measured 2026-08-21 on `main`, before this change:
//
//   1. `LocalNaturalLanguageResolver.ts:1428` turns EVERY interrogative into a
//      MISS by design — *"Questions are for the LLM — never misread 'how high is
//      this wall?' as a command to change it."* Correct, and only half a rule:
//      the other half (an ANSWER) was never written.
//   2. The rung below it, `QueryEngine.query()`, carries exactly SIX read-only
//      pattern blocks (`QueryEngine.ts:416, 429, 448, 475, 506, 526`): command
//      families, command help, model summary, decisions log, element COUNT and
//      level LIST. **Not one of them reads a property off an element.**
//   3. The rung below THAT — `LlmPlanner` — can only emit `SemanticIntent`s from
//      `allChatCapabilities()`, every one of which is an EXECUTION. A planner
//      whose entire legal output space is mutations cannot answer a question.
//   4. `SemanticQueryEngine` CAN read the model, and is reachable from exactly
//      ONE surface — `apps/editor/src/ui/dataworkbench/NLQueryPanel.ts:165`, the
//      Data Workbench. **The chat does not import it.** Its patterns are LIST /
//      COUNT / RELATIONSHIP; the only numeric ones are room-AREA thresholds,
//      which filter rather than report a value.
//
// So "how tall is this wall?" ended at `"I'm not sure how to help with that
// yet."` — the generic miss string. Not a refusal that names the gap; SILENCE,
// which is the defect class C74/C78 §1.4 name and the one this repository keeps
// re-finding.
//
// ── THE RULE THIS MODULE ESTABLISHES ────────────────────────────────────────
//
//   ⭐ **A property that is EXECUTABLE is QUERYABLE, by construction.**
//
// Every row below names the EXECUTE capability it mirrors, and its element
// kinds are READ OFF THAT CAPABILITY at call time (`queryableKinds`) rather than
// re-typed here. There is therefore no state in which the chat can SET a
// property on a kind but not REPORT it — the two claims are the same claim, and
// `propertyQueryMirrorsExecute.test.ts` executes the equality.
//
// That is deliberately the opposite of how `packages/input-host/src/operations/
// ElementCapabilities.ts` failed: it advertised Mirror/Offset/Scale on seven
// families whose commands are wall-only, because the claim and the code were two
// tables that had to agree and nothing made them.
//
// ── WHAT A READ MAY NEVER DO ────────────────────────────────────────────────
//
// §CONTEXT-DATA-HONESTY, in its measured form. THREE different facts arrive as
// the same `undefined` if you are careless, and each gets its own sentence:
//
//   · **UNREADABLE** — no reader is injected (headless, tests, a bridge that
//     failed to build one). The answer says the value could not be read. It is
//     NEVER reported as 0 and never as "no value".
//   · **NO SUCH ELEMENT** — the id is not in the authoritative store. Said, with
//     the id, because a stale selection is a real and different failure.
//   · **FIELD ABSENT ON THE RECORD** — the store holds the element and the
//     field is not on it. ⭐ This one is the most valuable answer in the file: a
//     field the WRITE claims to set and the READ cannot find is evidence the
//     write is landing somewhere nothing reads. The answer says so plainly
//     rather than inventing a number, and the discrepancy becomes a bug report
//     instead of a silent lie.
//
// ── WHY A READER IS INJECTED AND NOT IMPORTED ───────────────────────────────
//
// This module is PURE L2 — no DOM, no stores, no I/O — the same constraint the
// whole resolver lives under. The editor bridge owns the store access and hands
// in `ResolverContext.readProperty`, exactly as it already does for
// `visibility`, `rooms`, `catalogues` and `resolveScope`. Absence degrades to an
// honest "cannot read", never to a guess.
//
// ── WHY IT IS A TABLE AND NOT CASE ARMS ─────────────────────────────────────
//
// `applySemanticIntent`'s hand-written case-arm count is already OVER its
// declared ratchet (Gate 31 check 8, `MAX_RESOLVER_CASE_ARMS = 27`, measured 29).
// C67 §4 rule 5 and C68 §5.i ask for the shape used here anyway: membership
// routing before the switch, zero new case arms — the same seam the visibility,
// level-change and stair-shape families ride.
//
// P8: the exported functions carry the bounded `pryzm.ai.chat.query` span.

import { trace, type Tracer } from '@opentelemetry/api';
import {
  capabilityAppliesTo,
  normalizeElementKind,
  resolveChatCapability,
} from '../capabilities/ChatCapabilityRegistry.js';
import { describeCapabilitiesFor } from '../capabilities/CapabilityRefusal.js';
import type {
  ResolverContext,
  SemanticApplication,
  SemanticIntent,
} from './ZeroTokenResolver.js';

const TRACER_NAME = '@pryzm/ai-host';
let cachedTracer: Tracer | null = null;
function tracer(): Tracer {
  cachedTracer ??= trace.getTracer(TRACER_NAME, '0.1.0');
  return cachedTracer;
}

// ─── What a reader may answer ────────────────────────────────────────────────

/**
 * The outcome of ONE property read against the authoritative store.
 *
 * A discriminated union rather than `number | null`, because the three failure
 * modes above are three different sentences and collapsing them is the exact
 * defect this module exists to avoid (§CONTEXT-DATA-HONESTY: failure and
 * emptiness are never the same value).
 */
export type PropertyReadOutcome =
  /** The store holds the element AND the field; `value` is what it holds. */
  | { readonly ok: true; readonly value: number }
  /** The authoritative store has no element with this id. */
  | { readonly ok: false; readonly reason: 'no-such-element' }
  /** The element exists; the named field is not on its record (or is not a
   *  finite number). ⭐ Evidence that a write claiming this field lands nowhere
   *  the read can see. */
  | { readonly ok: false; readonly reason: 'field-absent' };

/**
 * The INJECTED reader. `field` is the record field name — the same string the
 * EXECUTE route writes — so a read and a write can never be about different
 * fields by accident.
 */
export type PropertyReader = (
  elementId: string,
  elementType: string,
  field: string,
) => PropertyReadOutcome;

// ─── The unit vocabulary ─────────────────────────────────────────────────────

/**
 * How a value is SPOKEN. The store's own unit, never converted on the way out:
 * the product's lengths are metres, `Roof.pitch` is radians and the reveal
 * splays are degrees, and a reader that silently normalised them would be a
 * second unit authority.
 */
export type PropertyQueryUnit = 'metres' | 'degrees' | 'radians-as-degrees' | 'count';

// ─── The table ───────────────────────────────────────────────────────────────

export interface PropertyQueryRow {
  /** Stable id, and the value carried on the intent. */
  readonly id: string;
  /**
   * The EXECUTE capability this row MIRRORS. Its `targets` are this row's
   * element kinds — read at call time, never copied. A target removed from the
   * capability is removed from the query in the same commit.
   */
  readonly capabilityId: string;
  /** The canonical noun, as the grammar says it ("sill height"). */
  readonly noun: string;
  /** Other nouns meaning the same property. */
  readonly synonyms: readonly string[];
  /** Adjective forms for the "how X is …" shape ("tall", "high"). */
  readonly adjectives: readonly string[];
  /** The record field the read asks for — the SAME field the write sets. */
  readonly field: string;
  readonly unit: PropertyQueryUnit;
}

/**
 * ⭐ EVERY ROW MIRRORS A LIVE EXECUTE CAPABILITY. There is deliberately NO row
 * for a property the chat cannot already set: a query that reports a value the
 * user then cannot change from the same surface is a worse experience than an
 * honest gap, and — more importantly — a row with no `capabilityId` would have
 * to hand-list its kinds, which is the drift this design removes.
 *
 * The properties NOT here are named in ADR-0345's matrix with their verdicts, so
 * the shortfall is countable rather than implied (C10).
 */
export const PROPERTY_QUERY_ROWS: readonly PropertyQueryRow[] = Object.freeze([
  {
    id: 'height',
    capabilityId: 'set-height',
    noun: 'height',
    synonyms: [],
    adjectives: ['tall', 'high'],
    field: 'height',
    unit: 'metres',
  },
  {
    id: 'width',
    capabilityId: 'set-width',
    noun: 'width',
    synonyms: [],
    adjectives: ['wide'],
    field: 'width',
    unit: 'metres',
  },
  {
    id: 'thickness',
    capabilityId: 'set-thickness',
    noun: 'thickness',
    synonyms: [],
    adjectives: ['thick'],
    field: 'thickness',
    unit: 'metres',
  },
  {
    id: 'sill-height',
    capabilityId: 'set-sill-height',
    noun: 'sill height',
    synonyms: ['sill'],
    adjectives: [],
    field: 'sillHeight',
    unit: 'metres',
  },
  {
    id: 'depth',
    capabilityId: 'set-depth',
    noun: 'depth',
    synonyms: ['section depth'],
    adjectives: ['deep'],
    field: 'depth',
    unit: 'metres',
  },
  {
    id: 'length',
    capabilityId: 'set-length',
    noun: 'length',
    synonyms: [],
    adjectives: ['long'],
    field: 'length',
    unit: 'metres',
  },
  {
    id: 'base-offset',
    capabilityId: 'set-base-offset',
    noun: 'base offset',
    synonyms: ['base elevation', 'offset from the level'],
    adjectives: [],
    field: 'baseOffset',
    unit: 'metres',
  },
  {
    id: 'riser-height',
    capabilityId: 'set-riser-height',
    noun: 'riser height',
    synonyms: ['rise'],
    adjectives: [],
    field: 'riserHeight',
    unit: 'metres',
  },
  {
    id: 'tread-depth',
    capabilityId: 'set-tread-depth',
    noun: 'tread depth',
    synonyms: ['tread', 'going'],
    adjectives: [],
    field: 'treadDepth',
    unit: 'metres',
  },
  {
    id: 'overhang',
    capabilityId: 'set-overhang',
    noun: 'overhang',
    synonyms: ['eaves overhang', 'eave overhang', 'roof overhang', 'eaves'],
    adjectives: [],
    field: 'overhang',
    unit: 'metres',
  },
  {
    id: 'mullion-size',
    capabilityId: 'set-mullion-size',
    noun: 'mullion size',
    synonyms: ['mullion width'],
    adjectives: [],
    field: 'mullionSize',
    unit: 'metres',
  },
  {
    id: 'panel-thickness',
    capabilityId: 'set-panel-thickness',
    noun: 'panel thickness',
    synonyms: ['glazing thickness'],
    adjectives: [],
    field: 'panelThickness',
    unit: 'metres',
  },
  {
    id: 'baluster-spacing',
    capabilityId: 'set-baluster-spacing',
    noun: 'baluster spacing',
    synonyms: ['spacing between balusters'],
    adjectives: [],
    field: 'balusterSpacing',
    unit: 'metres',
  },
  {
    id: 'baluster-width',
    capabilityId: 'set-baluster-width',
    noun: 'baluster width',
    synonyms: ['baluster thickness'],
    adjectives: [],
    field: 'balusterWidth',
    unit: 'metres',
  },
  {
    id: 'room-height-offset',
    capabilityId: 'set-room-height-offset',
    noun: 'height offset',
    synonyms: ['room height offset', 'ceiling offset'],
    adjectives: [],
    field: 'heightOffset',
    unit: 'metres',
  },
  {
    /**
     * ⚠ THE ONE ROW WHOSE UNIT IS NOT METRES, and it is declared rather than
     * hidden. `RoofData.pitch` is RADIANS in the record (`Roof.ts:73`,
     * `.min(0).max(π/2 − 0.001)`) while the chat's `set-roof-pitch` speaks
     * DEGREES and converts on the way in. A read that printed the raw radian
     * would answer "0.524" to "what is the roof pitch?" — technically the stored
     * value and useless as an answer — so the conversion is declared on the row
     * and applied in ONE place (`speak`), the mirror of the write's conversion.
     */
    id: 'roof-pitch',
    capabilityId: 'set-roof-pitch',
    noun: 'pitch',
    synonyms: ['roof pitch', 'slope'],
    adjectives: [],
    field: 'pitch',
    unit: 'radians-as-degrees',
  },
]);

const BY_ID: ReadonlyMap<string, PropertyQueryRow> = new Map(
  PROPERTY_QUERY_ROWS.map((r) => [r.id, r]),
);

/** Every row — for the registry, the gate and the specs. */
export function allPropertyQueryRows(): readonly PropertyQueryRow[] {
  return PROPERTY_QUERY_ROWS;
}

export function propertyQueryRow(id: string): PropertyQueryRow | null {
  return BY_ID.get(id) ?? null;
}

/**
 * ⭐ THE EQUALITY THAT MAKES THE CLAIM TRUE. The kinds a property may be ASKED
 * about are the kinds the mirrored EXECUTE capability declares — read from the
 * registry, never restated. An unknown capability id yields the EMPTY set, so a
 * row that loses its twin refuses everything rather than claiming everything.
 */
export function queryableKinds(row: PropertyQueryRow): readonly string[] {
  const cap = resolveChatCapability(row.capabilityId);
  if (cap === null) return [];
  const t = cap.targets;
  return typeof t === 'string' ? [] : t;
}

// ─── The intent ──────────────────────────────────────────────────────────────

export interface PropertyQueryIntent {
  readonly intent: 'property-query';
  /** A `PROPERTY_QUERY_ROWS` id. */
  readonly property: string;
}

/** Membership test for `applySemanticIntent`'s pre-switch routing. */
export function asPropertyQueryIntent(si: SemanticIntent): PropertyQueryIntent | null {
  return si.intent === 'property-query' ? (si as PropertyQueryIntent) : null;
}

// ─── The ONE grammar ─────────────────────────────────────────────────────────
//
// Generated FROM the table, so a new row arrives with its phrasings. THREE
// interrogative shapes and one bare-noun shape, all of which are read-only by
// construction: none of them may carry a measurement, so no dimension matcher's
// sentence can be claimed here and none of these can reach a mutation.
//
//   "how tall is this wall"                     ← adjectival
//   "what is the sill height of the selection"  ← named, with a subject tail
//   "what's the overhang"                       ← named, bare
//   "the height of this wall"                   ← bare noun

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The subject a question may name — always the SELECTION, never a free id.
 *  Chat acts on what is selected (the `selection.select` refusal says so), and
 *  a grammar that accepted "wall 7" would need an id resolver that does not
 *  exist. An element noun is allowed and IGNORED for targeting: it is the
 *  user's way of saying what they think they picked, and the kind guard below
 *  is what decides. */
const SUBJECT_TAIL = String.raw`(?: (?:of|on|for))?(?: (?:this|these|those|the|its|it))?` +
  String.raw`(?: (?:selected|selection|current))?` +
  String.raw`(?: [a-z][a-z-]*(?: wall)?)?`;

interface CompiledQuery {
  readonly id: string;
  readonly patterns: readonly RegExp[];
}

const COMPILED: readonly CompiledQuery[] = PROPERTY_QUERY_ROWS.map((row) => {
  const nounGroup = [row.noun, ...row.synonyms].map(escapeRe).join('|');
  const patterns: RegExp[] = [
    // "what is the sill height of this window" / "what's the overhang"
    new RegExp(String.raw`^what(?:'s| is| are) (?:the )?(?:${nounGroup})${SUBJECT_TAIL}$`),
    // "the height of this wall"
    new RegExp(String.raw`^(?:the )?(?:${nounGroup}) (?:of|on) (?:this|the|these)${SUBJECT_TAIL}$`),
    // "tell me the height of this wall" / "show me the width"
    new RegExp(String.raw`^(?:tell|show) me (?:the )?(?:${nounGroup})${SUBJECT_TAIL}$`),
  ];
  if (row.adjectives.length > 0) {
    const adj = row.adjectives.map(escapeRe).join('|');
    // "how tall is this wall"
    patterns.push(new RegExp(String.raw`^how (?:${adj}) (?:is|are)${SUBJECT_TAIL}$`));
  }
  return { id: row.id, patterns };
});

/**
 * The ONE query matcher. Returns the row id claimed, or null.
 *
 * ⚠ ORDER MATTERS, and it is handled by SPECIFICITY, not by luck. "sill height"
 * and "height" both end in the word `height`; the compiled patterns anchor with
 * `^…$` and the noun alternation is exact, so "what is the sill height" can only
 * match the `sill-height` row — the `height` row's pattern requires the noun to
 * follow "the" directly. `propertyQueryGrammar.test.ts` pins both directions.
 */
export function matchPropertyQuery(text: string): string | null {
  // Longest noun first, so a compound noun is never split by its own suffix.
  for (const c of COMPILED_BY_SPECIFICITY) {
    for (const re of c.patterns) {
      if (re.test(text)) return c.id;
    }
  }
  return null;
}

const COMPILED_BY_SPECIFICITY: readonly CompiledQuery[] = [...COMPILED].sort((a, b) => {
  const na = (BY_ID.get(a.id)?.noun ?? '').length;
  const nb = (BY_ID.get(b.id)?.noun ?? '').length;
  return nb - na;
});

// ─── The ONE read arm ────────────────────────────────────────────────────────

type Refusal = Extract<SemanticApplication, { kind: 'refusal' }>;

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** The value, in the unit a human uses. The ONLY conversion site. */
function speak(row: PropertyQueryRow, raw: number): string {
  switch (row.unit) {
    case 'metres':
      return `${round3(raw)} m`;
    case 'degrees':
      return `${round3(raw)}°`;
    case 'radians-as-degrees':
      return `${round3((raw * 180) / Math.PI)}°`;
    case 'count':
      return `${raw}`;
  }
}

/**
 * The ONE executor for the read-only property family. Routed from
 * `applySemanticIntent` by membership, before the switch.
 *
 * ⛔ IT MUTATES NOTHING. The returned action is `'answer'` — the read-only class
 * `visibility-query` established (§GATE-QUERYENGINE-READ-ONLY) — and the bridge's
 * `case 'answer': break;` dispatches no command. That is why this family is
 * allowed to claim interrogatives at all: the guard that turns every question
 * into a miss exists to stop a question MUTATING, and a read cannot.
 *
 * Stage order mirrors `applyPropertyIntent`, the write twin, so the two agree
 * about what a legal subject is: selection guard → kind guard → read → speak.
 */
export function applyPropertyQuery(
  si: PropertyQueryIntent,
  ctx: ResolverContext,
): SemanticApplication {
  return tracer().startActiveSpan('pryzm.ai.chat.query', (span) => {
    try {
      span.setAttribute('pryzm.ai.chat.query.property', si.property);
      const result = readAndAnswer(si, ctx);
      span.setAttribute('pryzm.ai.chat.query.kind', result.kind);
      span.end();
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.end();
      throw err;
    }
  });
}

/** How many elements a single answer will enumerate before summarising. A cap,
 *  not a limit on what was read: the count reported is always the REAL count. */
const MAX_ENUMERATED = 8;

function readAndAnswer(
  si: PropertyQueryIntent,
  ctx: ResolverContext,
): SemanticApplication {
  const row = propertyQueryRow(si.property);
  const refuse = (reason: string, suggestions: readonly string[] = []): Refusal => ({
    kind: 'refusal',
    intent: 'property-query',
    reason,
    suggestions,
  });
  const answer = (summary: string): SemanticApplication => ({
    kind: 'local',
    intent: 'property-query',
    action: 'answer',
    summary,
  });

  if (row === null) {
    // Unreachable through the grammar (which only ever emits table ids), so this
    // is the PLANNER's arm: it may name any capability id it likes and must be
    // refused by name rather than silently answered about something else.
    return refuse(
      `I do not have a property called "${si.property}" to read. ` +
      `I can report: ${PROPERTY_QUERY_ROWS.map((r) => r.noun).join(', ')}.`,
    );
  }

  const first = ctx.selection[0];
  if (first === undefined) {
    return refuse(
      `Nothing is selected — select an element first, then ask for its ${row.noun}.`,
    );
  }

  // ── Kind stage. The SAME registry guard the write uses, so "can I ask?" and
  // "can I set?" are one question (see this file's header).
  const cap = resolveChatCapability(row.capabilityId);
  for (const s of ctx.selection) {
    if (cap === null || !capabilityAppliesTo(cap, s.elementType)) {
      const kinds = queryableKinds(row);
      return refuse(
        `A ${normalizeElementKind(s.elementType)} has no ${row.noun} I can read. ` +
        (kinds.length > 0
          ? `I can report the ${row.noun} of: ${kinds.join(', ')}. `
          : '') +
        describeCapabilitiesFor(s.elementType),
      );
    }
  }

  // ── Read stage. An ABSENT reader is UNREADABLE, never "no value".
  const read = ctx.readProperty;
  if (read === undefined) {
    return answer(
      `I cannot read element properties in this chat context, so I will not guess the ` +
      `${row.noun}. Nothing was changed`,
    );
  }

  const values: string[] = [];
  const missingElements: string[] = [];
  const absentField: string[] = [];
  for (const s of ctx.selection) {
    const outcome = read(s.elementId, s.elementType, row.field);
    if (outcome.ok) {
      values.push(`${normalizeElementKind(s.elementType)} ${s.elementId}: ${speak(row, outcome.value)}`);
    } else if (outcome.reason === 'no-such-element') {
      missingElements.push(s.elementId);
    } else {
      absentField.push(`${normalizeElementKind(s.elementType)} ${s.elementId}`);
    }
  }

  // ⭐ THE MOST VALUABLE ANSWER IN THIS FILE. The registry says the WRITE reaches
  // this kind, and the authoritative record does not carry the field. Reporting
  // 0, or "no value", would hide the asymmetry; naming it turns a silent no-op
  // write into a bug the user can report.
  if (values.length === 0 && absentField.length > 0) {
    return answer(
      `I can set the ${row.noun} on ${absentField.length === 1 ? 'this element' : 'these elements'}, ` +
      `but the stored record carries no "${row.field}" to read back ` +
      `(${absentField.slice(0, MAX_ENUMERATED).join(', ')}). ` +
      `That asymmetry is worth reporting — a value I cannot read back is a value I cannot ` +
      `promise the edit landed on. Nothing was changed`,
    );
  }
  if (values.length === 0 && missingElements.length > 0) {
    return answer(
      `The selection points at ${missingElements.length} element(s) the model no longer holds ` +
      `(${missingElements.slice(0, MAX_ENUMERATED).join(', ')}), so there is no ${row.noun} to read. ` +
      `Re-select and ask again. Nothing was changed`,
    );
  }
  if (values.length === 0) {
    return answer(`I could not read a ${row.noun} for the selection. Nothing was changed`);
  }

  const shown = values.slice(0, MAX_ENUMERATED);
  const head = values.length === 1
    ? `The ${row.noun} is ${shown[0]!.slice(shown[0]!.indexOf(': ') + 2)}`
    : `${values.length} element(s) — ${row.noun}: ${shown.join(' · ')}` +
      (values.length > shown.length ? ` … and ${values.length - shown.length} more` : '');

  const caveats: string[] = [];
  if (missingElements.length > 0) {
    caveats.push(`${missingElements.length} selected element(s) are no longer in the model`);
  }
  if (absentField.length > 0) {
    caveats.push(`${absentField.length} carry no "${row.field}" on their stored record`);
  }
  return answer(caveats.length > 0 ? `${head} (${caveats.join('; ')})` : head);
}
