// @pryzm/ai-host — capability-aware refusals (ADR-0313 §Capability-driven resolution)
// =============================================================================
//
// Replaces "I'm not sure how to help with that yet."
//
// That sentence was the whole reported defect. It is indistinguishable from
// three completely different situations, and the user cannot tell which one
// they are in:
//
//   CLARIFICATION — understood, one parameter missing. "Make the wall taller"
//                   → ask for the height. Already implemented by the NL layer;
//                   named here so the three states are enumerated in one place.
//   REFUSAL       — understood, and we know we cannot do it. "Paint the wall
//                   blue" is not a failure of language understanding; wall
//                   colour is simply not connected to chat. The honest answer
//                   names the gap AND what is connected. Generated HERE, from
//                   the capability registry, so the offer is always the set the
//                   resolver will actually honour.
//   MISS          — not understood as a command at all → the LLM tier.
//
// §CONTEXT-DATA-HONESTY: a refusal and a success never look the same, and a
// refusal never silently degrades into a miss. Equally, a MISS must never be
// dressed up as a refusal: an utterance we did not understand gets the LLM, not
// a confident-sounding list of unrelated abilities. `capabilityGapRefusal`
// therefore fires only when it can name BOTH a concrete element kind AND a
// concrete unconnected topic, in an IMPERATIVE utterance.
//
// PURITY: no DOM, no stores, no I/O. Same contract as the resolvers.

import {
  capabilitiesForElement,
  normalizeElementKind,
  PROBE_ELEMENT_KINDS,
  type ChatCapability,
} from './ChatCapabilityRegistry.js';

// ─── The three states, named ─────────────────────────────────────────────────

/** The resolution states the chat distinguishes. Exported so the bridge and the
 *  tests refer to the same vocabulary rather than re-deriving it from `kind`. */
export type ChatResolutionState = 'clarification' | 'refusal' | 'miss';

// ─── Non-imperative detection (the adversarial guard) ────────────────────────
//
// "don't change the wall height", "I was thinking about changing the height",
// "what would happen if I made this taller?" all contain a perfectly good
// command shape and MUST NOT mutate. Two of the three would otherwise reach the
// NL classifier's set-height branch with high confidence.
//
// This runs on the RAW utterance, BEFORE any filler stripping — because the
// filler stripper deliberately removes "I would like to", and a hypothetical
// marker looks a lot like politeness once it is gone.

// A wh-word or an explicit "tell me" opener is a question regardless of
// punctuation ("how tall is this wall").
const WH_OPENER =
  /^\s*(?:what|whats|what's|how|why|where|which|who|whose|when|tell|explain|describe)\b/i;

// An AUXILIARY opener ("is …", "do …", "should …") is only a question when it
// is punctuated as one. Without the question mark these are overwhelmingly
// imperatives — "do that again" is the redo phrasing the NL suite already
// covers, and treating it as interrogative silently broke redo. The narrower
// rule is the honest one: guess less, and let the '?' the user typed decide.
const AUX_OPENER =
  /^\s*(?:is|are|was|were|do|does|did|should|shall|has|have|am)\b/i;

const NEGATION =
  /\b(?:do ?n'?t|don t|does ?n'?t|did ?n'?t|do not|does not|never|no need to|rather not|instead of|without|stop|cancel|forget it|leave it|leave the|keep the)\b/i;

const HYPOTHETICAL =
  /\b(?:what would happen|what if|would it be possible|i was thinking|i am thinking|i'm thinking|im thinking|i was wondering|i am wondering|i'm wondering|thinking about|wondering about|considering|hypothetically|for example|suppose|imagine|in theory|might want|maybe i should|should i)\b/i;

// ─── Descriptive / report-shaped text — the paste-back guard ─────────────────
//
// §FIX-CHAT-REPORT-PASTEBACK (2026-08-10, founder P0, reproduced twice on the
// live deploy). The founder pasted the assistant's OWN report line back into
// the chat as a message —
//
//   "Built 6 floors — 18 apartments, 3 per apartment floor on average
//    (apartments 72% of the plate)"
//
// — and the ladder CREATED A LEVEL from it. The NL typo corrector rewrote
// "built" → "build" (distance 1 against the intent vocabulary), the synonym
// table rewrote "floors" → "level", and the add-level branch fired with the
// bare 6 read as an elevation: `Add "Level 1" at elevation 6 m`. Repeating the
// paste stacked a SECOND level at the same 6.000 m.
//
// A description of something that already happened is never an instruction.
// The gate lives HERE, at the ladder level, rather than inside the add-level
// grammar: every intent reachable by "a bare number + a noun" has the same
// weakness, and one gate that no grammar can bypass is the only honest fix.
// (The add-level grammar was hardened too — belt and braces — but the ladder
// gate is what generalises.)

/** Past-tense report verbs in OPENER position. None of these is ever an
 *  imperative form ("built" vs "build", "added" vs "add"), so claiming them
 *  costs the user no expressiveness. */
const PAST_TENSE_REPORT_OPENER =
  /^\s*(?:built|created|generated|added|duplicated|furnished|lit|placed|inserted|updated|changed|deleted|removed|renamed|painted|raked|drew|laid|done|finished|completed|applied|resolved|undid|redid|nothing was (?:changed|added|created))\b/i;

/** Report SHAPE anywhere in the text — statistics, percentages, and the chat's
 *  own transcript furniture. These are things our reports say, not things a
 *  user instructs with. */
const REPORT_SHAPE =
  /(?:\bon average\b|\d\s*%|\bof the plate\b|\bresolved without ai tokens\b|\bundo with ctrl\s*\+?\s*z\b|—\s*\d)/i;

/**
 * Why an utterance reads as a REPORT rather than an instruction, or `null`.
 * Exported so the tier-0/1 resolver and the NL layer share ONE definition —
 * a guard that only half the ladder honours is not a guard.
 */
export function descriptiveReportReason(raw: string): 'descriptive' | null {
  const text = raw.trim();
  if (text.length === 0) return null;
  if (PAST_TENSE_REPORT_OPENER.test(text)) return 'descriptive';
  if (REPORT_SHAPE.test(text)) return 'descriptive';
  return null;
}

/**
 * Why an utterance must NOT be executed even though it is command-shaped, or
 * `null` when it is a genuine imperative.
 *
 * An interrogative opener alone is not disqualifying when it is a polite
 * request ("can you make this wall 3m tall?") — the NL layer's filler stripper
 * already handles those, and they ARE imperatives. So the interrogative test
 * fires only for a genuine question: an opener with no polite-request shape.
 */
export function nonImperativeReason(
  raw: string,
): 'negated' | 'hypothetical' | 'interrogative' | 'descriptive' | null {
  const text = raw.toLowerCase().trim();
  if (text.length === 0) return null;
  if (descriptiveReportReason(raw) !== null) return 'descriptive';
  if (HYPOTHETICAL.test(text)) return 'hypothetical';
  if (NEGATION.test(text)) return 'negated';
  // "can/could/would you …" and "will you …" are requests, not questions.
  const politeRequest = /^\s*(?:can|could|would|will)\s+(?:you|we)\b/i.test(text) ||
    /^\s*(?:do|would)\s+you\s+mind\b/i.test(text);
  if (politeRequest) return null;
  if (WH_OPENER.test(text)) return 'interrogative';
  if (AUX_OPENER.test(text) && text.endsWith('?')) return 'interrogative';
  // A bare "can/could/would/will …" with a question mark and no "you" is a
  // capability question ("can walls be 3m tall?"), not an instruction.
  if (/^\s*(?:can|could|would|will|should)\b/i.test(text) && text.endsWith('?')) return 'interrogative';
  return null;
}

// ─── Topics the chat is known NOT to drive ───────────────────────────────────
//
// Each entry is a topic a user can reasonably ask for, that a bus command DOES
// implement, and that the chat deliberately does not reach yet. The matching
// commands are enumerated in `CHAT_UNAVAILABLE` with the same reasoning; this
// table is the LANGUAGE side of the same decision.
//
// A topic is listed here ONLY when the gap is real. Adding a topic for
// something the chat can already do would manufacture a false refusal, which is
// the same class of lie the registry exists to remove — so the invariant test
// asserts no topic word collides with a live capability's aliases.

export interface UnconnectedTopic {
  /** Sentence-initial label: "Door colour isn't connected to chat yet." */
  readonly label: string;
  readonly match: RegExp;
  /** The bus command(s) that DO implement it, for the CHAT_UNAVAILABLE cross-check. */
  readonly commands: readonly string[];
  /**
   * ADR-0314 — element kinds for which this topic is NO LONGER a gap because a
   * live capability now covers it. The topic must not fire for these kinds (a
   * refusal that denies a live ability is the manufactured-false-refusal lie),
   * and the alias-collision invariant test allows a shared word only when every
   * colliding capability's targets are excluded here.
   */
  readonly excludeKinds?: readonly string[];
}

const UNCONNECTED_TOPICS: readonly UnconnectedTopic[] = [
  {
    label: 'colour',
    match: /\b(?:colou?r|colou?rs|colou?red|paint|painted|painting|repaint|tint|shade)\b/,
    commands: ['wall.setColor', 'wall.updateColor'],
    // §FEAT-WALL-COLOR-BATCH — wall colour is live (set-wall-color →
    // wall.updateColorBatch); every OTHER kind's colour remains unconnected.
    excludeKinds: ['wall'],
  },
  {
    label: 'material',
    match: /\b(?:material|materials|finish|finishes|texture|textures|render|cladding|brickwork)\b/,
    commands: ['slab.setMaterial', 'roof.setMaterial', 'room.setMaterial'],
  },
  {
    label: 'position',
    match: /\b(?:move|moves|moving|reposition|relocate|shift|nudge|slide|drag)\b/,
    commands: ['wall.move', 'door.move', 'window.move', 'room.move'],
  },
  {
    label: 'rotation',
    match: /\b(?:rotate|rotates|rotating|rotation|turn|spin|orient)\b/,
    commands: ['wall.transform'],
  },
  {
    label: 'mirroring',
    match: /\b(?:mirror|mirrored|mirroring|flip|flipped)\b/,
    commands: ['wall.transform'],
  },
  {
    label: 'duplication',
    match: /\b(?:copy|copies|duplicate|duplicated|clone|cloned)\b/,
    commands: ['wall.transform'],
  },
  {
    label: 'openings',
    match: /\b(?:opening|openings|cut a hole|punch|hole in)\b/,
    commands: ['wall.createOpening', 'wall.opening.create'],
  },
  {
    label: 'transparency',
    match: /\b(?:opacity|transparent|transparency|translucent|glazing opacity)\b/,
    commands: ['wall.bulkSetVisuals'],
  },
];

/** Every topic label, for the invariant tests and the gate. */
export function unconnectedTopicLabels(): readonly string[] {
  return UNCONNECTED_TOPICS.map((t) => t.label);
}

/** The full topic table (ADR-0314) — the invariant test needs `excludeKinds`
 *  to allow a topic word to coexist with a live capability that covers only
 *  the excluded kinds. */
export function unconnectedTopics(): readonly UnconnectedTopic[] {
  return UNCONNECTED_TOPICS;
}

/** Every bus command an unconnected topic points at — cross-checked against
 *  `CHAT_UNAVAILABLE` so the language side and the command side agree. */
export function unconnectedTopicCommands(): readonly string[] {
  return [...new Set(UNCONNECTED_TOPICS.flatMap((t) => t.commands))];
}

// ─── Element-kind detection ──────────────────────────────────────────────────

const KIND_WORDS: ReadonlyMap<string, string> = new Map([
  ...PROBE_ELEMENT_KINDS.map((k) => [k, k] as const),
  ...PROBE_ELEMENT_KINDS.map((k) => [`${k}s`, k] as const),
  ['walls', 'wall'], ['doors', 'door'], ['windows', 'window'],
  ['stairs', 'stair'], ['curtainwall', 'curtain-wall'],
  ['ceilings', 'ceiling'], ['floors', 'floor'],
]);

function detectKind(text: string): string | null {
  for (const tok of text.split(/[^a-z-]+/)) {
    const hit = KIND_WORDS.get(tok);
    if (hit !== undefined) return hit;
  }
  return null;
}

// ─── Refusal generation ──────────────────────────────────────────────────────

/** The generated refusal, in the same shape the resolver's own refusals use. */
export interface CapabilityGapRefusal {
  readonly kind: 'refusal';
  readonly intent: string;
  readonly reason: string;
  readonly suggestions: readonly string[];
}

function joinHuman(items: readonly string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]!}`;
}

/**
 * The "what I CAN do" half — built from the registry, so it is impossible for
 * the chat to offer something it will then refuse. Property-setting capabilities
 * read as a list ("height, thickness and type"); actions are appended as their
 * own clause only when there are no properties to offer.
 */
export function describeCapabilitiesFor(elementKind: string): string {
  const kind = normalizeElementKind(elementKind);
  const caps: readonly ChatCapability[] = capabilitiesForElement(kind);
  const properties = caps
    .map((c) => c.refusalLabel)
    .filter((l): l is string => l !== undefined);
  if (properties.length > 0) {
    return `I can change ${kind} ${joinHuman(properties)}.`;
  }
  const actions = caps.filter((c) => c.refusalLabel === undefined).map((c) => c.description);
  if (actions.length > 0) {
    return `For a ${kind} I can ${joinHuman(actions)}.`;
  }
  return `I cannot change a ${kind} from chat yet.`;
}

/**
 * Turn an utterance the deterministic layers could not resolve into an HONEST
 * refusal that names the gap and what IS connected — or `null`, which means
 * MISS and the caller falls through to the LLM.
 *
 * Fires only when all four hold, because a refusal that guesses is worse than a
 * miss:
 *   1. the utterance is imperative (not a question, negation or hypothetical);
 *   2. it names a topic the chat is KNOWN not to drive (not merely unrecognized);
 *   3. an element kind is identifiable — from the words, else from the selection;
 *   4. that element kind has at least one live capability to offer instead.
 *
 * Condition 2 is what keeps "make it cozier" a miss: "cozier" is not a topic we
 * have a command for, so we do not know that we cannot do it — the LLM might.
 */
export function capabilityGapRefusal(
  utterance: string,
  selectedKinds: readonly string[],
): CapabilityGapRefusal | null {
  if (nonImperativeReason(utterance) !== null) return null;

  const text = utterance.toLowerCase();
  const kind = detectKind(text)
    ?? (selectedKinds[0] !== undefined ? normalizeElementKind(selectedKinds[0]) : null);
  if (kind === null) return null;

  // ADR-0314 — a topic that is LIVE for this kind (excludeKinds) must not
  // manufacture a refusal for it; the resolver already handles those asks.
  const topic = UNCONNECTED_TOPICS.find(
    (t) => t.match.test(text) && !(t.excludeKinds?.includes(kind) ?? false),
  );
  if (topic === undefined) return null;

  const caps = capabilitiesForElement(kind);
  if (caps.length === 0) return null;

  const noun = `${kind.charAt(0).toUpperCase()}${kind.slice(1)} ${topic.label}`;
  return {
    kind: 'refusal',
    intent: `capability-gap:${topic.label}`,
    reason: `${noun} isn't connected to chat yet. ${describeCapabilitiesFor(kind)}`,
    suggestions: caps
      .flatMap((c) => c.examples)
      .filter((ex) => ex.includes(kind) || caps.length === 1)
      .slice(0, 2),
  };
}
