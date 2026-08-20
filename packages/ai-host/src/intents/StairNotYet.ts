// @pryzm/ai-host — StairNotYet (§REFUSE-STAIR-SPAN / §REFUSE-STAIR-RUN, L-1444)
// =============================================================================
//
// ⭐ TWO SENTENCES THE FOUNDER ASKED FOR THAT THIS PRODUCT CANNOT DO, AND THE
// REFUSALS THAT SAY SO IN HIS OWN WORDS.
//
//   A  "select a wall … create a stair from ground to level 5 connected to this
//       wall — in L shape"
//   B5 "Change first run of all stairs to X meters"
//
// ── WHY A REFUSAL IS SHIPPED CODE AND NOT AN ABSENCE ────────────────────────
//
// Without this module both sentences are a MISS, and a miss falls through to an
// LLM that production does not have configured — so the founder sees *"I'm not
// sure how to help with that yet"*. That answer is indistinguishable from "I
// didn't parse your grammar", when the truth is far more specific and far more
// useful: **the pipeline cannot build this shape, and here is the exact thing
// that is missing.**
//
// C16 CA-18 is the bar: a refusal must NAME THE LIVE REPLACEMENT. ⛔ Never a
// bare "I didn't understand". Both refusals below end with a sentence the user
// can type immediately, and both are asserted to do so.
//
// This repo's own recorded lesson is the other half: *a gate whose "yes" branch
// awaits a decision is a REGRESSION with a contract citation attached* (L-942).
// So neither of these fakes a partial result. A single-storey stair in place of
// a five-storey one, or a `stepsBeforeLanding` guessed as `round(X / treadDepth)`,
// would each be a confident wrong answer — the worst available outcome on a
// gesture whose extent the user cannot see.
//
// ═══ A — "from ground to level 5", MEASURED ═════════════════════════════════
//
// THREE independent blockers. Any one of them alone is fatal; naming only the
// first would have made the gap look smaller than it is.
//
//  1. NO GEOMETRY REACHES THE LANGUAGE LAYER. `ResolverContext.selection` is
//     `{elementId, elementType}[]` and nothing else — no positions, no wall
//     endpoints. `CreateStairInput` REQUIRES `startPosition: Vec3` plus explicit
//     `flights[{direction: Vec3, riserCount}]`. "Connected to this wall" cannot
//     be turned into those numbers from here, and inventing them would be
//     placing a stair somewhere nobody chose (C83 §4.2 — no position is ever
//     guessed).
//
//  2. ⭐⭐ ONE COMMAND, ONE STAIR, ANY SPAN — AND THE VALIDATION PROVES IT.
//     `CreateStairCommand.canExecute` requires
//     `riserHeight × Σ riserCount ≈ topLevel.elevation − baseLevel.elevation`
//     within `HEIGHT_TOLERANCE` (50 mm). Ground → Level 5 at ~3 m/storey is
//     ~15 m ⇒ ~83 risers. An L shape has TWO flights ⇒ ~42 risers each, against
//     `STAIR_CONSTRAINTS.MAX_RISERS_PER_FLIGHT = 16`. What the command would
//     build is not a five-storey stair core; it is one continuous 15 m ramp.
//
//  3. THE SLAB OPENING IS PUNCHED ON `topLevelId` ONLY. `carveStairOpening`
//     carves the slab whose `levelId === topLevelId`, so levels 1–4 stay SOLID
//     and the stair passes through four slabs — while
//     `LevelTraversalPolicy.canTraverse` returns `ok: true` with a WARNING, so
//     nothing stops it.
//
// ⚠ (2) and (3) are NOT chat defects. A user can build that stair by hand
// today; the chat merely declines to be a second way to do it. They are logged
// against the stair command family, not against this module.
//
// ═══ B5 — "first run", and the honest general answer ════════════════════════
//
// ⭐ **THE VOCABULARY CANNOT ADDRESS A COMPONENT OF AN ELEMENT AT ALL TODAY —
// ONLY WHOLE ELEMENTS.** That is the true statement, and it is worth more than
// the specific gap it explains. Every scope this package can produce
// (`all` / `selection` / `level` / `room` / `orientation` / `filter`) resolves
// to a set of ELEMENT IDS. There is no "the first flight of each stair", no
// "the top rail of each railing", no "the third layer of each wall".
//
// Stair RAILINGS look like a counter-example and are not: they are separate
// ELEMENTS with their own store and their own command, which is precisely why
// `set-stair-railing-type` could ship as an ordinary family (L-1441).
//
// The specific gap, measured: `UpdateStairParametersInput.updates` carries
// `{width, fireRating, accessibilityType, riserHeight, treadDepth, typeId,
// properties}` — `stepsBeforeLanding` is NOT among them. The only flight verb,
// `UpdateStairFlightsCommand`, requires an explicit `direction: Vec3` per
// flight, which this layer does not have (blocker 1 again).
//
// ⛔ AND THE ARITHMETIC IS DELIBERATELY NOT DONE. "first run = 4 m" could be
// turned into `stepsBeforeLanding = round(4 / treadDepth)` in one line. That
// line would be a SECOND authority for a quantity `StairParameterReconciler`
// already owns, computed from a tread the user did not name, and written through
// a field the command does not accept. Refusing is not the lesser answer here;
// it is the correct one.
//
// PURE — regexes and copy. No stores, no I/O.

import type { ResolverContext, SemanticApplication, SemanticIntent } from './ZeroTokenResolver.js';
import { LEVEL_NOUN_SRC, STOREY_NAME_SRC } from './SpatialScopeTail.js';

// ─── A — the multi-level stair-creation ask ──────────────────────────────────

/** The verbs that open a creation sentence — the same set `PlacementActivation`
 *  claims, so the two grammars agree on what "create" looks like. */
const CREATE_VERB_SRC = String.raw`(?:create|place|add|insert|draw|put|build|make)`;

/** A level reference in a RANGE bound: "ground", "level 5", "the 3rd floor". */
const LEVEL_REF_SRC =
  String.raw`(?:the\s+)?(?:${LEVEL_NOUN_SRC}\s+)?(?:${STOREY_NAME_SRC}|[\w][\w.-]*)(?:\s+${LEVEL_NOUN_SRC})?`;

/**
 * ⭐ THE LEVEL RANGE — "from ground to level 5" / "between level 1 and level 4".
 *
 * A RANGE is a different shape from every scope this package produces: they are
 * all single-valued (`in level 2`). `CapabilityValueSource` has carried a
 * `'level-range'` entry since ADR-0315 U2.5 — *"a level range ("levels 2–4"),
 * resolved by findLevel per bound"* — and, measured 2026-08-20, **NO capability
 * declares it.** It is a declared value source with zero consumers: the
 * authored-but-unwired shape, sitting in the type union that documents what the
 * chat can understand. This grammar is the first thing to read a range, and it
 * reads one only in order to REFUSE it accurately.
 */
const LEVEL_RANGE_RE = new RegExp(
  String.raw`\bfrom\s+(${LEVEL_REF_SRC})\s+(?:to|up to|through|until)\s+(${LEVEL_REF_SRC})`
  + String.raw`|\bbetween\s+(${LEVEL_REF_SRC})\s+and\s+(${LEVEL_REF_SRC})`,
  'i',
);

/** The noun that makes it a stair ask. */
const STAIR_NOUN_RE = /\b(?:stairs?|staircases?|stairways?|stair cases?)\b/i;

/**
 * "connected to this wall" / "against the selected wall" / "on this slab".
 *
 * ⭐ THIS IS A SELECTION REFERENCE, NOT A DESCRIPTION — the distinction the
 * whole of sentence A turns on. Every scope this package resolves comes from
 * WORDS ("level 2", "all windows"); "this wall" points at something the user
 * has already picked, which the words alone cannot identify.
 *
 * ⚠ It is read here ONLY to make the refusal accurate — so the reply can say
 * "and I cannot anchor it to the wall you selected" rather than pretending the
 * clause was not there. ⛔ It does NOT resolve a scope, and it deliberately does
 * not mint a rival to the selection vocabulary the grammars already share.
 */
const ANCHOR_REF_RE =
  /\b(?:connected|attached|anchored|next|adjacent|against|beside|alongside)\s+(?:to\s+|with\s+)?(?:the\s+)?(this|these|those|that|selected|selection)\b/i;

/** "in L shape" / "L-shaped" / "as a U stair" — the shapes the tool offers. */
const STAIR_SHAPE_RE = /\b(?:in\s+(?:an?\s+)?)?([LUI])[\s-]?shaped?\b|\b(?:in\s+)?(?:an?\s+)?([LUI])[\s-]shape\b/i;

/**
 * Claim a stair-CREATION sentence that carries a LEVEL RANGE and/or an anchor
 * reference — the two things the pipeline cannot honour.
 *
 * ⛔ A plain "create a stair" is NOT claimed and must not be: `parsePlacementRef`
 * owns it and activates the real placement tool, which WORKS. Standing in front
 * of a path that does the right thing is §FIX-CHAT-HIDE-IS-NOT-NAVIGATE's exact
 * defect, and §FIX-PLACEMENT-OVERCLAIM records it happening to eight pills at
 * once. This grammar therefore requires evidence of the un-doable ask.
 */
export function parseStairSpanIntent(text: string): SemanticIntent | null {
  if (!new RegExp(`^${CREATE_VERB_SRC}\\b`, 'i').test(text)) return null;
  if (!STAIR_NOUN_RE.test(text)) return null;

  const range = LEVEL_RANGE_RE.exec(text);
  const anchor = ANCHOR_REF_RE.exec(text);
  // Neither the un-doable range nor the un-doable anchor ⇒ not our sentence.
  if (range === null && anchor === null) return null;

  const shape = STAIR_SHAPE_RE.exec(text);
  return {
    intent: 'create-stair-span',
    ...(range !== null
      ? { fromLevel: (range[1] ?? range[3] ?? '').trim(), toLevel: (range[2] ?? range[4] ?? '').trim() }
      : {}),
    ...(anchor !== null ? { anchorRef: anchor[1]!.trim() } : {}),
    ...(shape !== null ? { shape: (shape[1] ?? shape[2] ?? '').toUpperCase() } : {}),
  } as SemanticIntent;
}

/**
 * The refusal. It names EVERY clause it understood back to the user — because a
 * refusal that repeats the ask proves it was read, and a refusal that quietly
 * drops the hard half is how "I can't do that" becomes indistinguishable from
 * "I didn't understand you".
 */
export function applyStairSpanRefusal(
  si: Extract<SemanticIntent, { intent: 'create-stair-span' }>,
  _ctx: ResolverContext,
): SemanticApplication {
  const shape = si.shape === undefined ? 'a stair' : `an ${si.shape}-shaped stair`;
  const span = si.fromLevel === undefined
    ? ''
    : ` from ${si.fromLevel} to ${si.toLevel}`;

  const parts: string[] = [];
  if (si.fromLevel !== undefined) {
    parts.push(
      'a stair spanning more than one storey is not one stair here — the create command builds a '
      + 'SINGLE flight set sized to the gap between exactly two levels, and it cuts the floor '
      + 'opening on the TOP level only, so the storeys in between would stay solid. '
      + 'A multi-storey stair core (a flight and a landing per storey, and an opening per floor) '
      + 'is a command that does not exist yet',
    );
  }
  if (si.anchorRef !== undefined) {
    parts.push(
      `I also cannot anchor it to "${si.anchorRef} wall": placing a stair needs a start point and a `
      + 'direction, and what I can see of your selection is which element it is, not where it is',
    );
  }

  return {
    kind: 'refusal',
    intent: 'create-stair-span',
    reason:
      `I can't create ${shape}${span} — ${parts.join('. ')}. `
      + 'Nothing was created, and nothing about your model changed. '
      // C16 CA-18 — the LIVE replacement, in sentences the user can type now.
      + 'What does work today: say "create a stair" and I\'ll open the stair tool so you can draw it '
      + 'against that wall with the shape you want, one storey at a time — then '
      + '"make all the stairs monolithic concrete", "change width of all stairs to 1.2 meters" or '
      + '"change tread to 280mm" to set them all up at once.',
    suggestions: [
      'create a stair',
      'make all the stairs monolithic concrete',
      'change width of all stairs to 1.2 meters',
    ],
  };
}

// ─── B5 — the sub-part ask ───────────────────────────────────────────────────

/** The stair sub-parts a user names. Each is a COMPONENT of a stair, not a
 *  stair — which is the whole reason none of them is addressable. */
const STAIR_PART_SRC =
  String.raw`(?:(?:first|second|third|last|top|bottom|upper|lower|1st|2nd|3rd)\s+)?`
  + String.raw`(?:runs?|flights?|landings?|goings?|nosings?|stringers?|steps?|treads?|risers?)`;

/**
 * "change first run of all stairs to 4 meters" / "make the second flight of the
 * stairs 3m".
 *
 * ⛔ IT MUST NOT STEAL THE LIVE SENTENCES. "change tread to 280mm" and "set the
 * tread depth to 300mm" are WORKING capabilities (`set-tread-depth`), and
 * "riser height" likewise. So this grammar claims a part ask ONLY when the part
 * is qualified as a positional sub-part ("first run", "second flight") or is a
 * part with no capability at all (landing, stringer, nosing) — never a bare
 * "tread" or "riser height", which have owners.
 */
const STAIR_PART_RE = new RegExp(
  String.raw`^(?:set|change|make|resize|update|adjust)\s+(?:the\s+)?(${STAIR_PART_SRC})\b`
  + String.raw`[\s\S]*\b(?:stairs?|staircases?)\b`,
  'i',
);

/** Parts whose ask ALREADY has a live capability — never claimed here. */
const OWNED_PART_RE = /^(?:treads?|risers?|goings?)$/i;

export function parseStairPartIntent(text: string): SemanticIntent | null {
  const m = STAIR_PART_RE.exec(text);
  if (m === null) return null;
  const part = m[1]!.trim().replace(/\s+/g, ' ');
  if (OWNED_PART_RE.test(part)) return null;
  return { intent: 'set-stair-part', partRef: part.toLowerCase() } as SemanticIntent;
}

export function applyStairPartRefusal(
  si: Extract<SemanticIntent, { intent: 'set-stair-part' }>,
  _ctx: ResolverContext,
): SemanticApplication {
  return {
    kind: 'refusal',
    intent: 'set-stair-part',
    reason:
      `I understood "${si.partRef}" as a part OF a stair rather than a stair, and that is the `
      + 'honest limit: I can address whole elements — every stair, the selected stairs, the stairs '
      + 'on a level — but not a part inside one. There is no way to say "the first run of each '
      + 'stair" yet, and the stair command has no field for a run length either, so I would have to '
      + 'guess how many steps you meant. Nothing was changed. '
      // C16 CA-18 — what genuinely works on the same elements, right now.
      + 'What I can change across every stair: "change width of all stairs to 1.2 meters". '
      + 'With stairs selected I can also set the step geometry that decides how long each run is — '
      + '"change tread to 280mm" or "set the riser height to 175mm" — and '
      + '"make all the stairs monolithic concrete" changes their type. '
      + 'Stair RAILINGS are separate elements, so those I can retype in bulk too: '
      + '"make all the stair railings frameless glass balustrade".',
    suggestions: [
      'change width of all stairs to 1.2 meters',
      'change tread to 280mm',
      'make all the stairs monolithic concrete',
    ],
  };
}
