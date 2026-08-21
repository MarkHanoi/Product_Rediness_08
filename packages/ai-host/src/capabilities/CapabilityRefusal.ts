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
  // §L-1032 added `moved`: `move-to-level` shipped an imperative "move …" and
  // the report line for it is "Moved the slab to Level 2". Without this, tier-1
  // typo correction is one edit away from rewriting the report's own past tense
  // back into the imperative — which is exactly the mechanism that turned
  // "Built 6 floors" into a created level (§FIX-CHAT-REPORT-PASTEBACK).
  /^\s*(?:built|created|generated|added|duplicated|furnished|lit|placed|inserted|updated|changed|deleted|removed|renamed|painted|raked|drew|laid|moved|done|finished|completed|applied|resolved|undid|redid|nothing was (?:changed|added|created))\b/i;

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

// ─── §FIX-CHAT-VISIBILITY-MISREAD (RAC U9, P0) ───────────────────────────────
//
// THE DEFECT, measured by the U10 drain: "highlight walls taller than 3m"
// resolved to set-height and DISPATCHED wall.updateDimensions. A read-only
// question about which walls are tall silently RESIZED one. "isolate doors
// higher than 2 meters" did the same.
//
// The mechanism is the U8 filter vocabulary meeting the dimension classifier:
// "taller than 3m" carries a height word and a measurement, which is all the
// dimension family ever needed, and nothing in the ladder cared that the verb
// was a VISIBILITY verb. This is the same family as the report-pasteback bug
// (§FIX-CHAT-REPORT-PASTEBACK) — an utterance that is command-SHAPED but is
// not the command it looks like — so the guard lives in the same place, at the
// LADDER level, where no grammar can bypass it.
//
// WHAT IT DOES NOT DO: it does not blanket-refuse visibility verbs. "show
// level 2" is a real, shipped ask (go-to-level), and "zoom to selection" opens
// with a view verb too. So the guard is not "a visibility opener claims
// nothing" — it is "a visibility opener may claim only intents that CHANGE THE
// VIEW", and every mutation is refused. When the chat grows real hide/isolate
// capabilities they join the allowlist below, and the day they do, this guard
// is what stops "isolate the tall doors" resizing one on the way there.

/** Verbs whose subject is what you can SEE, not what the model IS. */
const VISIBILITY_OPENER =
  /^\s*(?:please\s+)?(?:highlight|isolate|hide|unhide|reveal|select|filter|find|list|count|show(?:\s+me)?)\b/i;

/**
 * Intents a visibility/query opener MAY still reach: the ones that change the
 * view and nothing else. Everything absent from this set is a mutation as far
 * as this guard is concerned — which is the safe direction to be wrong in.
 */
const VISIBILITY_SAFE_INTENTS: ReadonlySet<string> = new Set([
  'go-to-level', 'zoom-fit', 'zoom-selected', 'undo', 'redo',
]);

/**
 * §GATE-VIS-INTENT (VIS-CLASS, 2026-08-11) — the REAL visibility capabilities,
 * registered against the composeRuntime §4d-bis intent path. This is the
 * "when the chat grows real hide/isolate capabilities they join the allowlist"
 * day the paragraph above promised: a `visibility-change` opener may now reach
 * EXACTLY these four intents and nothing else — so "isolate the tall doors"
 * still cannot resize one on the way there, which is what this guard is for.
 *
 * Everything these four do not claim (level hides, category hides, height
 * filters) still falls through as a MISS to the legacy QueryEngine handlers —
 * the fall-through remains the honest behaviour for the asks that only the
 * legacy path can serve.
 */
const VISIBILITY_CAPABILITY_INTENTS: ReadonlySet<string> = new Set([
  'hide-selection', 'isolate-selection', 'reveal-all', 'visibility-query',
]);

// ─── §FIX-CHAT-HIDE-IS-NOT-NAVIGATE (RAC-FIX-1, scorecard §1.2, founder P0) ──
//
// THE DEFECT, measured 2026-08-11 by `probe-categories-6-10.ts`:
//
//     LOCAL  7.5 hide level  "hide level 2"  → local intent=go-to-level action=setActiveLevel
//     LOCAL  7.6 show level  "show level 2"  → local intent=go-to-level action=setActiveLevel
//
// TWO OPPOSITE ASKS, ONE OUTCOME, AND IT IS NEITHER OF THEM. Asking to hide a
// level switched the camera to it and hid nothing, with no refusal.
//
// The cause is the allowlist directly above. `go-to-level` sits in
// VISIBILITY_SAFE_INTENTS so that "show level 2" keeps working, and the guard
// had no way to tell `show` from `hide`: `isVisibilityQueryOpener` answered a
// single boolean for both. That is defensible for `show` — "show me level 2"
// really is a navigation ask, and it is the shipped, working sentence. It is
// NOT defensible for `hide`.
//
// THE FIX IS A CLASS, NOT TWO PATCHES. The opener now resolves to one of three
// classes and the class decides what may be claimed:
//
//   'view-navigation'  show / reveal / go to / open / zoom — changing WHERE you
//                      are looking satisfies the ask. May reach the allowlist.
//   'visibility-change' hide / unhide / isolate / highlight / turn off — the ask
//                      is about WHAT IS DRAWN. Changing where the camera points
//                      can NEVER satisfy it, so this class may claim NOTHING
//                      from the view-navigation allowlist. Not go-to-level,
//                      not a nearest-live-intent guess. (§GATE-VIS-INTENT,
//                      2026-08-11: it may now reach the REAL visibility
//                      capabilities — VISIBILITY_CAPABILITY_INTENTS below —
//                      and still nothing else.)
//   'read-only-query'  select / filter / find / list / count — informational.
//                      Unchanged: may reach the allowlist.
//
// WHY 'visibility-change' FALLS THROUGH RATHER THAN REFUSING. The obvious
// alternative was an explicit refusal ("hiding isn't connected to chat yet").
// It would have been a LIE, and the audit has been wrong three times today by
// asserting absence without probing for it. `QueryEngine.ts:1339-1360` carries a
// LIVE handler for exactly this sentence — `/(?:hide|turn off) level[s]? (.+)/i`
// → `pryzm-visibility-command {action:'hide', target:'level'}` — and it has a
// real consumer at `apps/editor/src/ui/ViewBrowser/panels/UnifiedBrowserPanel.ts:154`.
// The ladder was not filling a gap; it was STANDING IN FRONT of the one path
// that does the right thing. A refusal here would have manufactured the false
// refusal that `capabilityGapRefusal`'s own header warns against — denying a
// live ability — and would have removed a working capability to close a bug.
//
// So the honest fix is: stop claiming it. `hide level 2` becomes a miss, and a
// miss reaches the handler that hides. What remains genuinely broken about that
// path — it is not undoable, not persisted and not synced — is
// `packages/visibility` work (scorecard §1.3, Agent B3), not resolver work, and
// it is NOT closed by this change.

/** Openers that are NEVER satisfied by changing what you are LOOKING AT. */
const VISIBILITY_CHANGE_OPENER =
  /^\s*(?:please\s+)?(?:hide|unhide|isolate|highlight|turn\s+off)\b/i;

/** Openers whose ask IS a camera/level move.
 *
 *  Deliberately only `show` and `reveal` — the two verbs that were ALREADY
 *  inside `VISIBILITY_OPENER`. `go to` / `open` / `zoom` were never gated by
 *  this guard, and adding them here would silently extend the guard's reach to
 *  sentences it has never judged. A fix for `hide` is not a licence to start
 *  policing `open`. */
const VIEW_NAVIGATION_OPENER = /^\s*(?:please\s+)?(?:show|reveal)\b/i;

/** Which of the three visibility-adjacent classes this utterance opens in. */
export type VisibilityAskClass = 'view-navigation' | 'visibility-change' | 'read-only-query';

/**
 * The read-only / visibility capability class, as a function of the utterance.
 * `null` means the sentence is not in this family at all.
 *
 * Order matters: `visibility-change` is tested FIRST, so a sentence that opens
 * with both a hide word and a show word ("hide everything and show level 2")
 * is classified by the ask that cannot be satisfied by navigation.
 */
export function visibilityAskClass(raw: string): VisibilityAskClass | null {
  const text = raw.trim();
  if (VISIBILITY_CHANGE_OPENER.test(text)) return 'visibility-change';
  if (VIEW_NAVIGATION_OPENER.test(text)) return 'view-navigation';
  if (VISIBILITY_OPENER.test(text)) return 'read-only-query';
  return null;
}

/** Does this utterance open with a verb about VISIBILITY rather than change?
 *  Unchanged in reach — `visibilityAskClass` splits what this returns true for,
 *  it does not widen it. */
export function isVisibilityQueryOpener(raw: string): boolean {
  return VISIBILITY_OPENER.test(raw.trim());
}

/**
 * Must this (utterance, intent) pair be refused because a visibility verb is
 * reaching for something that cannot satisfy it? Exported so the tier-0/1
 * resolver, the NL layer and the plan executor share ONE definition — a guard
 * only half the ladder honours is not a guard.
 */
/**
 * §GATE-VIS-INTENT — a bare-PLURAL "hide walls" / "isolate doors" is the
 * CATEGORY ask, owned by the legacy QueryEngine handlers
 * (`pryzm-visibility-command`). The grammars never claim it, but tier-1's
 * plural→singular typo repair rewrites "hide walls" → "hide wall", which the
 * bare-singular selection grammar WOULD claim — so the gate checks the RAW
 * utterance, where the plural is still visible. Explicit noun list, never a
 * generic `\w+s` (that would swallow "hide this").
 */
const VIS_BARE_PLURAL_CATEGORY =
  /^\s*(?:please\s+)?(?:hide|isolate)\s+(?:all\s+)?(?:the\s+)?(?:walls|doors|windows|rooms|slabs|roofs|stairs|columns|beams|ceilings|floors|elements|items|objects)\s*$/i;

export function visibilityMisreadReason(raw: string, intent: string): 'visibility' | null {
  const cls = visibilityAskClass(raw);
  if (cls === null) return null;
  if (VIS_BARE_PLURAL_CATEGORY.test(raw)) return 'visibility';
  // §FIX-CHAT-HIDE-IS-NOT-NAVIGATE + §GATE-VIS-INTENT — a `hide`/`isolate`
  // opener may reach ONLY the real visibility capabilities, never the
  // view-navigation allowlist ("hide level 2" must still not navigate).
  if (cls === 'visibility-change') {
    return VISIBILITY_CAPABILITY_INTENTS.has(intent) ? null : 'visibility';
  }
  // view-navigation and read-only-query openers keep their allowlist AND may
  // reach the visibility capabilities ("show everything" → reveal-all;
  // "list the hidden elements" → the read-only visibility-query).
  return VISIBILITY_SAFE_INTENTS.has(intent) || VISIBILITY_CAPABILITY_INTENTS.has(intent)
    ? null
    : 'visibility';
}

// ─── §FIX-CHAT-PROPERTY-REMOVAL-IS-NOT-DELETE (scorecard §1.4, P0) ──────────
//
// THE DEFECT, measured 2026-08-11:
//
//     COMMANDS  8.3  "remove the material from this wall"
//                    → commands[element.delete] intent=delete-selected
//
// A question about a wall's MATERIAL routed to a DESTRUCTIVE DELETE OF THE WALL.
// The only thing between the user and a deleted wall was the destructive Confirm
// card — a card that correctly says "delete", so a user who reads it is safe and
// a user who does not loses a wall by asking about its finish. A confirmation
// dialog is a mitigation, never a resolver guard (C68 §5.j).
//
// The mechanism: `LocalNaturalLanguageResolver` normalizes "remove" → "delete",
// then `hasDeleteVerb && elementNoun('wall') && selectionRef('this')` pushes
// `delete-selected` at confidence 0.95. Nothing looked at what the OBJECT of the
// verb was. In "remove the material from this wall", the object is `material`;
// `this wall` is the PREPOSITIONAL COMPLEMENT — the thing the property is being
// removed FROM, not the thing being removed.
//
// The gate is that grammatical fact, and it lives HERE, at the ladder level,
// rather than inside the delete matcher — because every intent reachable from
// "a delete verb plus an element noun" has the identical weakness, and one gate
// no grammar can bypass is the only honest fix (the same reasoning as
// §FIX-CHAT-REPORT-PASTEBACK).
//
// WHAT HAPPENS INSTEAD. The sentence becomes a miss at the delete branch and
// reaches `capabilityGapRefusal`, which already knows `material` is an
// UNCONNECTED_TOPIC and that the kind is `wall` — so the user gets
// "Wall material isn't connected to chat yet. I can change wall <live props>."
// An explicit refusal that names the gap AND what IS connected, which is what
// C68 §5.g asks for and strictly better than a destructive misread.
//
// VOCABULARY IS NOT NARROWED. "delete the selected wall", "remove all grids",
// "delete this room" are untouched — none of them has a PROPERTY word in object
// position. The guard fires only on `<removal verb> <property> from|of|on <…>`.

/** Property nouns a user can ask to remove FROM an element. Deliberately wider
 *  than the live capability set: the point is to recognise that the object is a
 *  PROPERTY, not to decide whether we can change it — `capabilityGapRefusal`
 *  owns that second question and answers it honestly. */
const PROPERTY_OBJECT_WORDS = [
  'colou?rs?', 'paint', 'tint', 'shade',
  'materials?', 'finish(?:es)?', 'textures?', 'cladding',
  'opacity', 'transparency',
  'heights?', 'thicknesss?', 'widths?', 'depths?', 'lengths?', 'sizes?',
  'types?', 'systems? types?', 'marks?', 'names?', 'numbers?',
  'classifications?', 'properties', 'property', 'parameters?', 'attributes?',
  'layers?', 'ratings?', 'offsets?', 'pitch',
].join('|');

/**
 * The verbs that mean "take this away". `remove` is the one that caused the
 * defect, but `delete`/`clear`/`strip`/`take off` reach the same branch and a
 * guard that only knew about `remove` would be a patch, not a class.
 */
const PROPERTY_REMOVAL_SHAPE = new RegExp(
  String.raw`^\s*(?:please\s+)?(?:remove|delete|clear|strip|take\s+off|get\s+rid\s+of)\s+` +
  String.raw`(?:the\s+|its\s+|all\s+(?:the\s+)?)?(?:${PROPERTY_OBJECT_WORDS})\b\s*` +
  String.raw`(?:from|of|on|for)\b`,
  'i',
);

/**
 * Is the OBJECT of this removal a PROPERTY rather than an element? Exported so
 * the tier-0 grammar and the NL classifier cannot disagree about what the user
 * asked to remove.
 */
export function propertyRemovalReason(raw: string): 'property-not-element' | null {
  return PROPERTY_REMOVAL_SHAPE.test(raw.trim()) ? 'property-not-element' : null;
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
    // §FIX-BARE-FINISH-SELF-CONTRADICTS (L-998) — SPLIT FROM 'finish', below.
    //
    // This entry used to match `finish|finishes|render|cladding` as well, and
    // carried NO `excludeKinds`. Founder-reported 2026-08-18: *"change wall finish
    // to plaster white"* was answered *"Wall material isn't connected to chat yet.
    // I can change wall height, thickness, base offset, type, colour, wall angle,
    // window creation, WALL SIDE FINISH and FINISH LAYER."* — a refusal that
    // advertises the capability it is refusing, in the same sentence.
    //
    // The list is not hand-written: `describeCapabilitiesFor` builds it from the
    // registry's `refusalLabel`s. So the contradiction was real and visible —
    // the TOPIC TABLE was denying what the REGISTRY was offering, which is the
    // manufactured-false-refusal lie this table's own header forbids.
    //
    // `material` itself stays a genuine gap for a wall: C85 §4 measures that
    // `materialId` cannot be set through any bus verb that reaches the authority.
    // So "change the wall material" is still refused honestly, and only the FINISH
    // vocabulary — which IS live — moves out.
    label: 'material',
    match: /\b(?:material|materials|texture|textures|brickwork)\b/,
    commands: ['slab.setMaterial', 'roof.setMaterial', 'room.setMaterial'],
    // §FEAT-FLOOR-SURFACE-FINISH (L-1884, 2026-08-21) — a FLOOR's material is now
    // live (`set-floor-finish` → `floor.setFinishBatch` → the geometry FloorStore),
    // so this topic must stop denying it. Leaving it would recreate
    // §FIX-BARE-FINISH-SELF-CONTRADICTS exactly: `describeCapabilitiesFor('floor')`
    // is GENERATED from the registry and now says "floor finish", so the refusal
    // would advertise the capability it was refusing, in its own sentence.
    // Every OTHER kind's material remains a real gap and is untouched.
    excludeKinds: ['floor'],
  },
  {
    // §FIX-BARE-FINISH-SELF-CONTRADICTS (L-998) — the finish vocabulary, which for
    // a WALL is live twice over: `set-wall-side-finish` → `wall.setSideFinishBatch`
    // and `add-wall-layer` → `wall.addLayerBatch`. Both are advertised by
    // `describeCapabilitiesFor('wall')` as "wall side finish" and "finish layer",
    // so a refusal naming either for a wall contradicts the registry.
    //
    // For every OTHER kind the gap is real and unchanged — a slab, roof or room
    // finish still has no chat route — which is why this is a SPLIT and not a
    // deletion. Vocabulary was moved, never removed (RAC free-form doctrine).
    //
    // ⚠ THE LABEL IS 'surface finish', NOT 'finish', AND THAT IS NOT COSMETIC.
    // The bare word `finish` is a VERB of the GLOBAL capability
    // `finish-apartment-chain` ("finish this floor"), and the ADR-0314 collision
    // invariant in `chat-capability-registry.test.ts` forbids a topic label that a
    // live GLOBAL capability answers to — a global capability has no `targets` to
    // exclude, so such a topic can never be made safe. Measured: labelling this
    // 'finish' turned that guard RED immediately. The label is only ever the
    // sentence noun ("Slab surface finish isn't connected to chat yet"), so it can
    // be precise without narrowing the `match` regex by a single word.
    label: 'surface finish',
    match: /\b(?:finish|finishes|render|cladding)\b/,
    commands: ['slab.setMaterial', 'roof.setMaterial', 'room.setMaterial'],
    // §FEAT-FLOOR-SURFACE-FINISH (L-1884) — 'floor' JOINS 'wall' here, and for the
    // identical reason. The founder's *"finish to wooden parquet"* produced THIS
    // topic's sentence ("Floor surface finish isn't connected to chat yet"); it was
    // TRUE when he typed it and is FALSE now. A floor-finish sentence the grammar
    // misses must fall through as a MISS — better an honest "I'm not sure" than a
    // confident denial of something the chat can do (the L-1032 ruling).
    //
    // ⚠ SLAB, ROOF and ROOM are deliberately NOT excluded: their finish really has
    // no chat route, and floor-vs-slab is the disambiguation `CatalogueFamilies.ts`
    // records as a decision rather than a coin-flip. Vocabulary is moved, never
    // deleted (RAC free-form doctrine).
    excludeKinds: ['wall', 'floor'],
  },
  {
    // §L-1032 — NARROWED (not excluded), 2026-08-19.
    //
    // `move-to-level` is now LIVE for twelve element families, and it is reached
    // by "move the slab to level 2". This topic matched the bare verb `move`,
    // so any level-shaped sentence the grammar happened to miss — a phrasing
    // one word off, a level name with a typo — would have been answered
    // *"Slab position isn't connected to chat yet"*, which is now FALSE. That is
    // the §FIX-BARE-FINISH-SELF-CONTRADICTS defect (L-998) exactly: the TOPIC
    // TABLE denying what the REGISTRY offers.
    //
    // ── WHY NOT `excludeKinds` ─────────────────────────────────────────────
    // `excludeKinds` is per-KIND and would have had to name all twelve movable
    // families — which would silently delete the honest refusal for PLANAR
    // moving ("move the wall 2m to the left"), a gap that is still completely
    // real: `wall.move` / `door.move` / `window.move` / `room.move` remain in
    // CHAT_UNAVAILABLE and no capability drives them. The distinction is not the
    // KIND, it is the SENTENCE — a storey change is live, a planar move is not —
    // so the narrowing is a lookahead for level vocabulary and nothing else. No
    // word was removed from the match: "move the wall 2m left" still refuses,
    // with the same copy it always did (RAC free-form doctrine — vocabulary is
    // moved, never deleted).
    //
    // A level-shaped sentence the grammar misses is therefore a MISS and reaches
    // the LLM, which is the honest outcome: better an "I'm not sure" than a
    // confident denial of something the chat can do.
    //
    // Bare "floor"/"floors" is deliberately NOT in the lookahead — "move the
    // floor 2m north" is a planar ask about a floor SLAB, and it must keep its
    // refusal. Only the ordinal/named storey phrasings are level-shaped.
    label: 'position',
    match: new RegExp(
      String.raw`^(?![\s\S]*\b(?:levels?|storeys?|stories|story|upstairs|downstairs|` +
      String.raw`(?:ground|first|second|third|fourth|fifth|sixth|top|upper|lower|next|another)\s+floors?|` +
      String.raw`floors?\s+\d+)\b)` +
      String.raw`[\s\S]*\b(?:move|moves|moving|reposition|relocate|shift|nudge|slide|drag)\b`,
    ),
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
