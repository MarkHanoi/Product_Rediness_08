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

import type { IntentSpatialScope } from './ScopeDescriptor.js';
import type { ResolverContext } from './ZeroTokenResolver.js';

/** The prepositions English uses to place a thing. ONE alternation, shared —
 *  none of them carries scope-kind meaning on its own. */
export const SPATIAL_PREPOSITION_SRC = String.raw`(?:on|in|at|inside|within)`;

/** The nouns that make a phrase a LEVEL rather than a room. */
export const LEVEL_NOUN_SRC = String.raw`(?:levels?|floors?|storeys?|stor(?:y|ies))`;

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

  return { kind: 'scope', scope: { kind: 'room', roomRef: raw } };
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
    if (reading.kind !== 'none') return reading;
  }
  return { kind: 'none' };
}

/** Strip a trailing level noun from a level query — the ONE place that knows
 *  "2 floor" and "2" name the same level. Used as `findLevel`'s last resort. */
export function stripTrailingLevelNoun(query: string): string {
  return query.replace(TRAILING_LEVEL_NOUN_RE, '').trim();
}
