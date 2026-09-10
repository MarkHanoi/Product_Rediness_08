// @pryzm/ai-host — SpatialScopeTail (§FIX-SCOPE-TAIL-ONE-PARSER, L-1201)
// =============================================================================
//
// THE ONE place that answers *"which preposition phrase in this sentence names a
// PLACE, and is that place a LEVEL or a ROOM?"*
//
// ── WHY THIS FILE EXISTS (the defect it retires) ────────────────────────────
//
// The founder typed **"change all windows in level 2 to 1.5 meters wide"** and
// it did not do what it says. Measured on the real ladder before this module:
//
//   parse → { intent:'set-window-dimensions', dims:{width:1.5},
//             scope:{ kind:'room', roomRef:'level' } }
//
// A **room called "level"**. Every dimension/delete grammar in this package had
// re-implemented the same scope tail by hand, and every one of them had
// hard-wired `on` → LEVEL and `in` → ROOM:
//
//     (?: on (?:the )?(?:levels?|floors?)?\s*([\w .-]+?)| in (?:the )?([\w .-]+?))?
//
// English makes no such distinction. "on level 2" and "in level 2" are the same
// sentence; so are "in the kitchen" and "on the second floor". **Keying the
// scope KIND on the preposition encodes a rule the language does not have** —
// so the level arm was reachable behind exactly one word, and the founder's
// habitual word was the other one.
//
// Three further defects fell out of the same tail, all MEASURED, none guessed:
//
//  1. ⭐ **A SILENTLY WRONG NUMBER, not merely a wrong scope.** The `in` capture
//     is LAZY, so it stops at the shortest string that lets the tail match and
//     the rest of the place phrase LEAKS INTO THE VALUE:
//       "set all windows in level 2 width to 1.5m"
//         → roomRaw='level', rest='2 width to 1.5m'
//         → BINDING_VALUE_FIRST reads "2 … width" FIRST → **width = 2 m**.
//     The user asked for 1.5 m, the command carried 2 m, and the summary said
//     so confidently. On a `destructive: true` mass edit that is the worst
//     available outcome, and it is strictly worse than the wrong-scope bug that
//     was being hunted.
//  2. `(?:')?s?` sat AFTER the tail, so it ate the trailing "s" of the capture:
//     "make all windows in this floor 2m high" produced `roomRef: 'thi'`. The
//     possessive now attaches to the NOUN, where the apostrophe actually is.
//  3. `HERE_RE` ("this floor" / "the current level") was therefore unreachable
//     through `in` — it could only ever be spelled "on this floor".
//
// ── THE RULING, AND WHY IT IS THIS ONE ──────────────────────────────────────
//
// **The preposition does not determine the scope kind. The NOUN does.**
// One alternation `(?:on|in|at|inside|within)`, then:
//
//   • the user SAID a level noun ("level 2", "in floor 3")       → LEVEL
//   • the phrase is `HERE_RE` ("this floor", "the current level") → LEVEL (active)
//   • the phrase ENDS in a level noun ("the ground floor")        → LEVEL
//   • anything else                                               → ROOM
//
// ⛔ **THE CLAIM SURFACE IS NOT WIDENED.** Every guard the old grammars had
// survives: a sentence with no scope word is still not claimed, an unresolved
// qualifier ("exterior") is still refused rather than dropped, and a spatial
// phrase still composes only with the ALL scope. This module changes WHICH
// PHRASE reaches which resolver — never how much is claimed.
//
// ── REACHABILITY OF A ROOM ACTUALLY NAMED "Level" ───────────────────────────
//
// "in the level to 1.5m wide" — the level noun with no level after it — is read
// as a ROOM named "level", not as a broken level query. That is the only
// reading under which such a room stays addressable, and it costs nothing: a
// real level ask always carries the level's name or number after the noun.
//
// An explicit level noun otherwise WINS over a room that happens to share the
// words ("Floor 2"). That precedence is safe to state because the resolution is
// never silent: the Confirm card names the resolved scope back
// ("all 12 windows on Level 2"), so the user sees which reading was taken
// BEFORE consenting — and a room stays reachable by its unique NUMBER column.
//
// ── THE DEFECT CLASS THIS IS THE THIRD INSTANCE OF ──────────────────────────
//
// "An enumerated list that must be REMEMBERED rather than DERIVED." This week
// it has already cost a viewport freeze (a hand-written element-family event
// list missing 11 families) and a dead pick cache (`bim-railing-*`, zero
// emitters). Three spellings of one scope tail across two files is the same
// shape: `extractDimensionBindings` was already extracted for exactly this
// reason — *"so the natural and rigid paths cannot understand '2 meters height'
// differently"* — and the identical argument for spatial scope was never made.
// It is made here.
//
// PURE — regex sources and one classifier. No I/O, no stores; the active level
// arrives through the injected `ResolverContext`, as everywhere else.

import type { Compass4, IntentSpatialScope } from './ScopeDescriptor.js';
import type { ResolverContext } from './ZeroTokenResolver.js';

/** The prepositions English uses to place a thing. ONE alternation, shared —
 *  none of them carries scope-kind meaning on its own. */
export const SPATIAL_PREPOSITION_SRC = String.raw`(?:on|in|at|inside|within)`;

/** The nouns that make a phrase a LEVEL rather than a room. */
export const LEVEL_NOUN_SRC = String.raw`(?:levels?|floors?|storeys?|stor(?:y|ies))`;

/**
 * Storey NAMES that carry no level noun — "the ground floor" is usually spoken
 * as "ground", and a basement/attic/penthouse is a STOREY in this product's
 * vocabulary, never a room name.
 *
 * ⭐ ADOPTED, NOT INVENTED (L-1261). `WallSideFinishIntent` already carried this
 * list as its own `LEVEL_PHRASE` — a THIRD hand-written spatial tail beside the
 * two L-1201 unified. Rather than let two vocabularies drift, the richer one is
 * lifted HERE and the wall grammar reads it, which is the entire point of this
 * module. It is consulted only when NO level noun was said, so it can never
 * override an explicit "level 2".
 */
export const STOREY_NAME_SRC = String.raw`(?:ground|basement|attic|penthouse|mezzanine)`;

/**
 * ⭐ THE BUILDING NOUNS — §CHAT-HAS-NO-BUILDING-AXIS (L-13302, 2026-09-09).
 *
 * The nouns a user reaches for when a parcel holds more than one block: *"create
 * windows on all walls in BLOCK B"*, *"delete the windows in TOWER 2"*.
 *
 * ⛔ THIS IS NOT A SCOPE KIND, AND IT DELIBERATELY DOES NOT BECOME ONE HERE.
 * `readSpatialTail` still reads "block b" as a ROOM reference, because that is
 * what the resolver can act on and inventing a fourth `IntentSpatialScope` arm
 * would oblige every consumer to grow a case for a scope nothing resolves.
 * The list exists so a REFUSAL can name the axis it lacks instead of implying
 * the user misspelled a room — the §CHAT-AXIS-AWARE-REFUSAL rule (L-10942)
 * applied to an axis that does not exist yet rather than to one that does.
 *
 * ⭐ ONE LIST, TWO CALLERS. `APT_PLACE_BUILDING_RE` in ZeroTokenResolver.ts
 * carried these alternatives already; it is built from this constant instead of
 * repeating them, so the apartment grammar and the refusal copy cannot drift
 * apart.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ WIDENED 2026-09-10 (lane REFUTED-FIX) — L-13302 SHIPPED WITHOUT THE ONE
 * NOUN THE FOUNDER ACTUALLY USED, and a verifier measured it through the real
 * `absentAxisFor`: with `(?:buildings?|blocks?|towers?|complex)`, **"house 2",
 * "the houses" and "house" DID NOT FIRE**. The sentence that opened L-13302 is,
 * verbatim: *"it should create windows in all walls on all the envelopes of ALL
 * HOUSES on the parcel."* The teaching example the fix shipped with was "in
 * block b" — a phrase he never typed — so the axis-aware refusal was
 * unreachable by the very sentence that motivated it. The paragraph this one
 * replaces said widening "to `house`, say" would be "a separate, measured
 * decision". This is that decision, and it is measured.
 *
 * ⭐ THE RULE FOR MEMBERSHIP, so the next addition is not a matter of taste: a
 * noun goes in only if this package ALREADY treats it as a whole building it
 * can generate. `houses?` and `villas?` pass — `ZeroTokenResolver.ts` maps
 * /\bhouse\b|\bvilla\b/ to the `'house'` typology of `generate-building`, and
 * `BuildFromEnvelope.ts` stands down on both. That is adoption, not invention
 * (the same move `STOREY_NAME_SRC` above records).
 *
 * ⛔ AND THE ONES THAT STAY OUT, each for a measured reason:
 *   · `bungalow` — in `BuildFromEnvelope`'s stand-down guard but in NO typology
 *     mapping, so it fails the rule the two inclusions pass. Padding.
 *   · `unit(s)` — COLLIDES with the dwelling axis, and the collision is in the
 *     very grammar that reads this list: `APT_SCOPE_NOT_A_PLACE_RE` names
 *     `units?` as a phrase that is NOT a place ("the unit" = the shell being
 *     filled). A noun resolving to two axes is worse than one resolving to none.
 *   · `plot` — LAND, not a building; PRYZM has a real parcel/site axis, so
 *     "reads as a building, and PRYZM cannot scope to one yet" would be a
 *     confident wrong sentence about an axis that DOES exist.
 *   · `phase` — a delivery grouping that spans buildings.
 *
 * ⚠ THE SECOND CALLER MOVES WITH IT, DELIBERATELY. "create a 3 bedroom
 * apartment in house 2" now DECLINES the apartment grammar, exactly as
 * "…in block b" already did, and hands the sentence back for a building-scoped
 * reading. That is the intended consequence and it is driven through the real
 * `parseApartmentLayoutIntent` in `__tests__/chatHasNoBuildingAxis.test.ts`, not
 * pinned as a regex string.
 */
export const BUILDING_PLACE_NOUN_SRC = String.raw`(?:buildings?|blocks?|towers?|complex|houses?|villas?)`;

// ⛔ `String.raw`, not a bare template — in a template literal `` is the
// BACKSPACE character, not a word boundary. Caught by measurement while
// writing this line (the first cut matched nothing at all).
const BUILDING_PLACE_RE = new RegExp(String.raw`\b${BUILDING_PLACE_NOUN_SRC}\b`, 'i');

/** Does this place phrase name a BUILDING rather than a room? Used only by
 *  refusal copy — never to claim, scope or dispatch anything. */
export function namesABuildingPlace(phrase: string): boolean {
  return BUILDING_PLACE_RE.test(phrase.trim());
}

// ─── §CHAT-ORIENTATION-IS-NOT-A-ROOM (L-10941) — THE THIRD SCOPE KIND ────────
//
// ⭐ THE FOUNDER TYPED **"Make all windows in the south facade 0.1 meters sill
// height, 3 meters height and 1.5 meters wide"** and was answered:
//
//     "I can't find a room 'south'. The rooms here are: 00-001 (Room 00-001)."
//
// A confident refusal that lists ONE axis's inventory as though it were the
// whole language — the same defect shape as the window-type refusal this lane's
// sibling fix retires. And it happened HERE, in the classifier whose own header
// declares the ruling it was breaking: **"The preposition does not determine the
// scope kind. The NOUN does."** The classifier knew two nouns — LEVEL and
// (by fallthrough) ROOM — so "south facade" fell through to ROOM and produced a
// refusal quoting a room name the founder never typed.
//
// ⛔ THE ORIENTATION AXIS WAS NOT MISSING. That is the measurement that matters,
// and it corrects the working hypothesis this lane started from. `Compass4`,
// `ORIENTATION_TO_COMPASS`, `IntentSpatialScope.orientation`,
// `BaseScopeDescriptor.orientation`, `COMPASS_WORD` and the editor bridge's
// θ-threaded `facadeOrientationService.facadesByOrientation` arm ALL SHIPPED
// with ADR-0315 U3. What was missing is that only ONE grammar could produce the
// scope — the wall COLOUR/RAKE grammars' inline `(north|south|east|west)-facing`
// adjective — so a compass phrase in the SHARED TAIL every other grammar reads
// was invisible. The axis existed; the tail could not spell it.
//
// ── THE DEFINITION, STATED BEFORE IT IS IMPLEMENTED ─────────────────────────
//
// "The south facade" MEANS: the exterior walls whose OUTWARD NORMAL (away from
// the bounded room's centroid) falls in the southern quadrant of the compass
// frame rotated by the project's `trueNorth`. That is not a new definition — it
// is `FacadeOrientationMath.orientationFromNormal`'s, already shipped, already
// θ-threaded, already the one the wall grammars resolve through. This module
// adopts it rather than minting a rival.
//
//   • THE TOLERANCE IS A QUADRANT — ±45° about the compass point, so the four
//     directions PARTITION the circle and every exterior wall has exactly one.
//     A wall at 35° from south IS south. That constant lives with the math
//     (`orientationFromNormal`), not here; naming a second tolerance in the
//     grammar is how two answers to one question get minted.
//   • A CURVED OR FACETED FACADE is answered per WALL, not per building: each
//     wall segment classifies on its own normal, so a faceted bay contributes
//     its south-ish segments and not its east-ish ones. A single curved wall
//     resolves on its baseline chord, which is what the shipped service does.
//   • A HOSTED OPENING inherits its HOST WALL's orientation. A window has no
//     independent facade; it faces where the wall it is cut into faces.
//
// ── ⛔ A ROOM REALLY CALLED "South" STAYS REACHABLE ─────────────────────────
//
// The project gets the FIRST SAY, exactly as the catalogue does in
// `makeHostedTypeParser` ("only an EXACTLY-KNOWN name short-circuits"). If
// `ctx.rooms` holds a room whose name or number matches the phrase, the phrase
// is that ROOM and the compass reading never runs. Only a phrase the project
// does NOT affirmatively claim as a room can be read as an orientation — so
// this can turn a REFUSAL into a resolution, and can never turn one resolution
// into a different one.

/** Compass words → the four-point letter. Adjectival and abbreviated forms
 *  included; a user says "southern elevation" and "S facade" as readily as
 *  "south". ⛔ Words only — the facade NOUNS are stripped separately, so this
 *  table never has to grow a row per phrase. */
const COMPASS_TOKENS: Readonly<Record<string, Compass4>> = Object.freeze({
  north: 'N', northern: 'N', northerly: 'N', northward: 'N', n: 'N',
  south: 'S', southern: 'S', southerly: 'S', southward: 'S', s: 'S',
  east: 'E', eastern: 'E', easterly: 'E', eastward: 'E', e: 'E',
  west: 'W', western: 'W', westerly: 'W', westward: 'W', w: 'W',
});

/** The nouns and participles a compass word hangs on. None of them carries a
 *  direction; all of them are stripped before the compass table is consulted,
 *  which is what makes "south", "south facade", "southern elevation",
 *  "south-facing side" and "the walls facing south" ONE input. */
const FACADE_NOUN_SRC = String.raw`(?:fa(?:c|ç)ades?|elevations?|aspects?|sides?|faces?|facing` +
  String.raw`|frontages?|fronts?|exteriors?|exterior|externals?|external|outsides?|walls?|wall)`;
const FACADE_NOUN_RE = new RegExp(`^${FACADE_NOUN_SRC}$`);

/** Determiners and connectives that never carry a direction either. */
const ORIENTATION_NOISE_RE = /^(?:the|a|an|of|on|to|all|every|each|and|is|are|that|which|it|its)$/;

/**
 * ⭐ THE ORIENTATION AXIS PROBE — every phrasing of a compass reference, or
 * null. Shared by the tail classifier below, by the wall grammars' inline
 * adjective and by `QualifierAxes`, so the three cannot disagree about what
 * counts as a direction.
 *
 * ⛔ A phrase carrying words this axis does not know is NOT an orientation with
 * noise in it — it is another axis's phrase with a collision. "South Wing
 * Kitchen" must stay a room name. Every word must be a compass token, a facade
 * noun or noise, and at least one must be a compass token; and the compass
 * tokens must all agree, so "north south corridor" resolves to nothing.
 */
export function resolveCompassRef(phrase: string): Compass4 | null {
  const words = phrase
    .toLowerCase()
    // ⭐ "façade" is how an architect spells it, and stripping the cedilla as
    // punctuation split it into "fa"+"ade" — two words the axis does not know,
    // so the whole phrase stopped being an orientation. Fold diacritics FIRST.
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/["'`]/g, '')
    .replace(/[-_/]+/g, ' ')
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 0);
  if (words.length === 0) return null;
  let found: Compass4 | null = null;
  for (const w of words) {
    const c = COMPASS_TOKENS[w];
    if (c !== undefined) {
      if (found !== null && found !== c) return null; // "north south" — argues both ways.
      found = c;
      continue;
    }
    if (FACADE_NOUN_RE.test(w) || ORIENTATION_NOISE_RE.test(w)) continue;
    return null; // a word this axis does not know ⇒ not an orientation phrase.
  }
  return found;
}

/** Every compass word the axis understands — for refusal copy and for the
 *  equivalence test that stops a second table being written. */
export function compassWords(): readonly string[] {
  return Object.keys(COMPASS_TOKENS);
}

/**
 * The embeddable tail. THREE capture groups, in order:
 *   1. the LEADING level noun, if the user said one ("**level** 2")
 *   2. the place phrase
 *   3. the TRAILING level noun, if the user said one ("the ground **floor**")
 *
 * Group 3 exists because the phrase capture must stay LAZY — a greedy one
 * swallows the value tail — and a lazy capture stops before "floor". Making the
 * trailing noun its own greedy optional group lets "the ground floor" and
 * "this floor" come back WHOLE without letting the phrase run away.
 *
 * The whole tail is optional; a caller distinguishes "no place said" from
 * "place said" by whether the groups are undefined.
 */
export const SPATIAL_TAIL_SRC =
  `(?: ${SPATIAL_PREPOSITION_SRC} (?:the )?(?:(${LEVEL_NOUN_SRC})\\s+)?` +
  `([\\w .-]+?)(\\s+${LEVEL_NOUN_SRC})?)?`;

/** The same tail with the leading space made part of an anchored, standalone
 *  match — for `parseTrailingSpatialScope`. */
const STANDALONE_TAIL_SRC =
  `^${SPATIAL_PREPOSITION_SRC} (?:the )?(?:(${LEVEL_NOUN_SRC})\\s+)?` +
  `([\\w .-]+?)(\\s+${LEVEL_NOUN_SRC})?\\s*$`;

/** "this floor" / "the current level" → the level the user is standing on. */
export const HERE_RE = /^(?:this|the current|current)(?:\s+(?:floor|level|storey|story))?$/;

/** Words that begin the VALUE, never a place name. A level noun followed by one
 *  of these is the noun used as a ROOM NAME ("in the level to 1.5m wide"). */
const VALUE_LEAD_IN_RE = /^(?:to|at|as|be|into|is|=|:)$/;

const LEADING_LEVEL_NOUN_RE = new RegExp(`^${LEVEL_NOUN_SRC}\\b\\s*`);
/** A bare storey NAME inside the phrase ("the ground floor", "basement"). */
const STOREY_NAME_RE = new RegExp(`(?:^|\\s)${STOREY_NAME_SRC}(?:\\s|$)`);
const TRAILING_LEVEL_NOUN_RE = new RegExp(`\\s*${LEVEL_NOUN_SRC}$`);
const ENDS_IN_LEVEL_NOUN_RE = new RegExp(`\\b${LEVEL_NOUN_SRC}$`);

/**
 * What a tail READ as. Three outcomes, deliberately distinct:
 *   • `none`     — the sentence named no place at all (not an error).
 *   • `unusable` — a place WAS named and cannot be turned into a scope
 *                  ("this floor" with no active level). The caller must DECLINE
 *                  the sentence, never fall back to a wider scope — widening a
 *                  scope the user restricted is the failure mode this whole
 *                  module exists to stop (C68 §7.d).
 *   • `scope`    — the resolved spatial scope.
 */
export type SpatialTailReading =
  | { readonly kind: 'none' }
  | { readonly kind: 'unusable' }
  | { readonly kind: 'scope'; readonly scope: IntentSpatialScope };

/** Re-join the lazy phrase capture with its trailing level noun. */
export function joinTailPhrase(
  phrase: string | undefined,
  trailingNoun: string | undefined,
): string {
  return `${phrase ?? ''}${trailingNoun ?? ''}`.trim().replace(/\s+/g, ' ');
}

/**
 * Classify a captured tail into a spatial scope — THE ruling, in one place.
 *
 * `levelNoun` is group 1 of `SPATIAL_TAIL_SRC`; `phrase` is groups 2+3 joined
 * by `joinTailPhrase`.
 */
export function readSpatialTail(
  levelNoun: string | undefined,
  phrase: string,
  ctx: ResolverContext | undefined,
): SpatialTailReading {
  const noun = (levelNoun ?? '').trim().toLowerCase();
  const raw = phrase.trim().replace(/\s+/g, ' ');
  if (noun.length === 0 && raw.length === 0) return { kind: 'none' };

  const level = (q: string): SpatialTailReading => {
    const query = q.trim().replace(/\s+/g, ' ');
    return query.length === 0
      ? { kind: 'unusable' }
      : { kind: 'scope', scope: { kind: 'level', levelQuery: query } };
  };

  // A level noun with nothing usable after it is the noun used as a NAME —
  // a room genuinely called "Level" / "Floor" stays reachable.
  if (noun.length > 0 && (raw.length === 0 || VALUE_LEAD_IN_RE.test(raw))) {
    return { kind: 'scope', scope: { kind: 'room', roomRef: noun } };
  }
  // "on level 2" / "in level 2" / "at floor 3" — the noun was SAID.
  if (noun.length > 0) return level(raw);

  // "this floor" / "the current level" — only answerable when the context knows
  // which floor that is. Without an active level it is a guess, not a scope.
  if (HERE_RE.test(raw)) {
    const active = ctx?.levels.find((l) => l.id === ctx.activeLevelId);
    return active === undefined ? { kind: 'unusable' } : level(active.name);
  }
  // The phrase carries the noun itself: "level 2" captured whole, or
  // "the ground floor" / "the second storey".
  if (LEADING_LEVEL_NOUN_RE.test(raw)) return level(raw.replace(LEADING_LEVEL_NOUN_RE, ''));
  if (ENDS_IN_LEVEL_NOUN_RE.test(raw)) return level(raw);
  // A bare storey NAME — "the ground floor" spoken as "ground", "the basement".
  if (STOREY_NAME_RE.test(raw)) return level(raw);

  // ⭐ §CHAT-ORIENTATION-IS-NOT-A-ROOM (L-10941) — THE THIRD NOUN CLASS.
  //
  // "in the south facade" / "on the north elevation" / "in the western side".
  // Placed HERE, after every level reading and BEFORE the room fallthrough,
  // because that is exactly where the founder's sentence was falling through to
  // `roomRef: 'south'` and earning "I can't find a room 'south'".
  //
  // ⛔ THE PROJECT GETS THE FIRST SAY. A room the project AFFIRMATIVELY CLAIMS
  // by this name or number is that room — the same arbitration
  // `makeHostedTypeParser` uses for a catalogue name, and the reason a building
  // with a "South Wing" or a room literally called "South" keeps working. This
  // branch can therefore only turn a REFUSAL into a resolution; it can never
  // turn one resolution into a different one.
  if (!namesARoom(raw, ctx)) {
    const compass = resolveCompassRef(raw);
    if (compass !== null) return { kind: 'scope', scope: { kind: 'orientation', orientation: compass } };
  }

  return { kind: 'scope', scope: { kind: 'room', roomRef: raw } };
}

/** Does the project affirmatively claim this phrase as a room? Name or number,
 *  case- and space-insensitive — the same forgiveness the room resolver applies
 *  downstream. Absent `rooms` ⇒ NOT a claim (the snapshot is optional, and an
 *  unreadable list must never be read as an empty one). */
function namesARoom(phrase: string, ctx: ResolverContext | undefined): boolean {
  const rooms = ctx?.rooms;
  if (rooms === undefined || rooms.length === 0) return false;
  const want = phrase.trim().toLowerCase().replace(/\s+/g, ' ');
  return rooms.some((r) => {
    const name = (r.name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    const number = (r.roomNumber ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    return (name.length > 0 && name === want) || (number.length > 0 && number === want);
  });
}

/**
 * Read the place phrase at the END of a sentence — for the token-based grammars
 * (window parametric creation) whose shape is not one anchored regex.
 *
 * ⭐ THE LAST preposition wins, and that is load-bearing, not a detail.
 * "create a 1x2m window every 3 meters in the walls **on the ground floor**"
 * is a SHIPPED example: matching the FIRST preposition reads the place as
 * "walls on the ground floor" and the level is lost. Scanning right-to-left and
 * taking the first phrase that reaches the end of the sentence reproduces the
 * hand-written `levelTail` exactly, and now does it for `in` and `at` too.
 */
export function parseTrailingSpatialScope(
  text: string,
  ctx: ResolverContext | undefined,
): SpatialTailReading {
  return matchTrailingSpatialScope(text, ctx)?.reading ?? { kind: 'none' };
}

/** A trailing place phrase WITH its position, so a grammar that must consume
 *  the phrase (strip it before its own guards run) can do so without writing a
 *  place regex of its own — C67 §4 rule 16's "one shared parser" applied to
 *  consumption as well as reading. `start` is the index of the preposition. */
export interface TrailingScopeMatch {
  readonly reading: Exclude<SpatialTailReading, { kind: 'none' }>;
  readonly start: number;
}

/**
 * §RAC-APARTMENT-IN-ROOM (L-1641, 2026-08-21) — the span-returning core of
 * `parseTrailingSpatialScope`, extracted so the apartment grammar can STRIP a
 * matched place phrase ("…on room 00-001 in ground level") and re-scan the
 * remainder for a second one. Behaviour of the reading is byte-identical: same
 * right-to-left scan, same anchored tail, same classifier.
 */
export function matchTrailingSpatialScope(
  text: string,
  ctx: ResolverContext | undefined,
): TrailingScopeMatch | null {
  const scan = new RegExp(`\\b${SPATIAL_PREPOSITION_SRC}\\s`, 'g');
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = scan.exec(text)) !== null) {
    starts.push(m.index);
    scan.lastIndex = m.index + 1;
  }
  const tail = new RegExp(STANDALONE_TAIL_SRC);
  for (let i = starts.length - 1; i >= 0; i--) {
    const hit = tail.exec(text.slice(starts[i]!));
    if (hit === null) continue;
    const reading = readSpatialTail(hit[1], joinTailPhrase(hit[2], hit[3]), ctx);
    if (reading.kind !== 'none') return { reading, start: starts[i]! };
  }
  return null;
}

/** Strip a trailing level noun from a level query — the ONE place that knows
 *  "2 floor" and "2" name the same level. Used as `findLevel`'s last resort. */
export function stripTrailingLevelNoun(query: string): string {
  return query.replace(TRAILING_LEVEL_NOUN_RE, '').trim();
}

// ─── The INLINE place phrase (§FIX-WALL-FINISH-SIDE-EATS-SCOPE, L-1261) ──────
//
// ⭐ THE THIRD SPELLING OF THE SCOPE TAIL, AND WHAT IT COST.
//
// `WallSideFinishIntent` carried its own `SPATIAL_RE`:
//
//     /\b(?:on|in|of)\s+(?:the\s+)?([\w .-]+?)(?=\s+(?:to|into|as|with|be|finish)\b|$)/
//
// The lazy capture runs until one of FIVE stop words. The founder's sentences
// put the SIDE word between the place and "finish", and the side word is not in
// that set — so the place phrase SWALLOWED IT. Measured 2026-08-19:
//
//   "make all walls in Room X exterior finish plaster"
//        → { kind:'room',  roomRef:   'room x exterior' }
//   "make all walls in Level 1 exterior finish plaster"
//        → { kind:'level', levelQuery:'1 exterior'      }
//   "make all walls on level 2 interior finish limewash"   ← the SHIPPED example
//        → { kind:'level', levelQuery:'2 interior'      }
//
// None of those resolve. The user gets *"No level called '1 exterior'"* — a
// refusal quoting words he never typed as a place. **The third sentence was
// already broken before the founder wrote his six**, which is exactly the
// failure mode L-1201 predicted: three spellings of one concept means fixing one
// leaves the next sentence broken in another.
//
// So the stop set is DERIVED from the vocabulary the wall grammars actually use
// — side words, layer words, finish words, connectives — in one place, rather
// than remembered separately in each.

/** Words that END a place phrase: connectives, the finish/layer markers, and —
 *  the ones that were missing — every SIDE word. */
export const PLACE_STOP_SRC = String.raw`(?:to|into|as|with|be|of|and` +
  String.raw`|finish(?:es|ed|ing)?|layers?|coat(?:ing)?s?|material` +
  String.raw`|inner|interior|inside|internal|indoor` +
  String.raw`|outer|exterior|outside|external|outdoor|fa(?:ç|c)ade)`;

/** Prepositions that can introduce an INLINE place phrase. `of` is included
 *  (the wall grammar's own set had it: "the walls of the kitchen"). */
const INLINE_PREP_SRC = String.raw`(?:on|in|at|of|inside|within)`;

const INLINE_PLACE_RE = new RegExp(
  `\\b${INLINE_PREP_SRC}\\s+(?:the\\s+)?([\\w .-]+?)(?=\\s+${PLACE_STOP_SRC}\\b|$)`,
);

/** Leading scope/determiner words that are never part of a place NAME.
 *  ⭐ POSSESSIVES ADDED (L-13303): the panel button says "Create BIM from
 *  THIS DESIGN", so users type "my design" / "my drawing", and without
 *  `my|our|your` here the subject-noun test below could never see the noun. */
const LEADING_DETERMINERS_RE = /^(?:(?:all|every|each|both|the|these|those|this|selected|my|our|your)\s+)+/;
/** What is left once they are stripped, when the phrase names no place at all.
 *  ⭐ THE SUBJECT BEING ACTED ON, never a place. `designs?|envelopes?|drawings?|
 *  massing` added L-13303 for `build-from-envelope`, whose own ANCHOR phrases
 *  are place-shaped: "create walls IN MY DESIGN" must not read as a room called
 *  "my design", and must not decline either — it names the default target. */
const ELEMENT_NOUN_ONLY_RE =
  /^(?:walls?|wall segments?|building|project|model|site|elements?|sides?|faces?|designs?|envelopes?|drawings?|massing)$/;

/**
 * ⛔ "of ALL WALLS" IS NOT A ROOM CALLED "all walls".
 *
 * Caught by measurement while writing this module, not after shipping it:
 * `add a 20mm limewash finish to the outer side OF ALL WALLS` is a SHIPPED
 * example, and a naive inline reader turns its trailing `of …` into a room
 * scope — silently narrowing a project-wide ask to a room that does not exist.
 * That would have been the exact defect this file was written to remove,
 * reintroduced by the fix for it.
 *
 * ⭐ EXPORTED 2026-09-09 (§WINDOWS-ALL-WALLS-IS-NOT-A-PLACE, L-13301). The
 * token-based window grammar needs the SAME question answered — "is this
 * captured place phrase actually the ELEMENT NOUN rather than a place?" — and
 * the one thing it must not do is answer it with a fourth regex. This is the
 * canonical answer; `parseInlineSpatialPhrase` above and
 * `parseWindowsParametricIntent` now share it.
 */
export function isNotAPlace(phrase: string): boolean {
  const p = phrase.trim().toLowerCase().replace(LEADING_DETERMINERS_RE, '').trim();
  if (p.length === 0 || ELEMENT_NOUN_ONLY_RE.test(p)) return true;
  // ⭐ THE POSITIONAL SHAPE — "the middle OF every wall segment" (L-13301).
  //
  // Caught by GATE 31, not by the probe that preceded it: this is a SHIPPED
  // declared example of `create-windows-parametric`, and the first cut of the
  // window fix turned it into a miss by reading "the middle of every wall
  // segment" as a room. It is not a room and it is not a place — it says WHERE
  // IN the element, and the element is the one already being acted on.
  //
  // The rule is the exact symmetric twin of the test above: a phrase that IS
  // the element noun names no place, and neither does a phrase whose
  // PREPOSITIONAL OBJECT is the element noun. Both callers want that same
  // answer — "add a limewash finish to the middle of every wall" must not
  // narrow to a room either — which is why it lives here once rather than as a
  // positional-word list inside the window grammar.
  //
  // ⛔ The LAST "of" wins, and the object is tested WHOLE: "the walls OF THE
  // KITCHEN" still reads as the kitchen, because "kitchen" is not an element
  // noun. This can only ever turn an invented room into "no scope"; it can
  // never turn one real place into a different one.
  const lastOf = p.lastIndexOf(' of ');
  if (lastOf === -1) return false;
  const object = p.slice(lastOf + 4).trim().replace(LEADING_DETERMINERS_RE, '').trim();
  return object.length > 0 && ELEMENT_NOUN_ONLY_RE.test(object);
}

/**
 * Read a place phrase that sits INSIDE a sentence rather than at its end — the
 * shape the wall finish / wall layer grammars have, where the value tail is not
 * a simple "… to X" but carries side words, layer words and markers.
 *
 * Shared by both wall grammars so the two can never disagree about which words
 * belong to the PLACE and which belong to the ASK.
 */
export function parseInlineSpatialPhrase(
  text: string,
  ctx: ResolverContext | undefined,
): SpatialTailReading {
  const m = INLINE_PLACE_RE.exec(text);
  const phrase = m?.[1]?.trim();
  if (phrase === undefined || phrase.length === 0) return { kind: 'none' };
  if (isNotAPlace(phrase)) return { kind: 'none' };
  return readSpatialTail(undefined, phrase, ctx);
}
